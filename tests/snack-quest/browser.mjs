import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRun, ROOMS, ORDER } from '../../games/snack-quest/engine.mjs';

const base=process.env.SNACK_QUEST_URL||'http://127.0.0.1:8766/games/snack-quest/';
const installed=homedir()+'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:existsSync(installed)?{executablePath:installed}:{})});
const errors=[],prefix='pepsi-pepper.snack-quest.v2.';
const output=process.env.SNACK_QUEST_SCREENSHOTS||'/tmp/snack-quest-v2-qa';mkdirSync(output,{recursive:true});
async function pageFor(context){const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#begin').waitFor();await page.evaluate(()=>document.fonts.ready);return page;}
async function seed(page,run,room=run.room,view='play'){
  await page.evaluate(({prefix,run})=>{localStorage.setItem(prefix+run.id,JSON.stringify(run));localStorage.setItem(prefix+'latest',run.id);},{prefix,run});
  await page.goto(`${base}?view=${view}&run=${run.id}&room=${room}`);
  await page.waitForFunction(()=>document.querySelector('#room-name')?.textContent!=='One friend is missing.');
}
async function saved(page){return page.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))),prefix);}
async function hold(page,key,milliseconds){await page.keyboard.down(key);await page.waitForTimeout(milliseconds);await page.keyboard.up(key);}
async function waitView(page,view){await page.waitForFunction(view=>new URLSearchParams(location.search).get('view')===view,view);}
async function waitRoom(page,room){await page.waitForFunction(({room,name})=>new URLSearchParams(location.search).get('room')===room&&document.getElementById('room-name').textContent===name,{room,name:ROOMS[room].name});}
async function dismissOutside(page){const box=await page.locator('#screen').boundingBox();await page.mouse.click(box.x+7,box.y+7);}
try {
  const desktop=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const page=await pageFor(desktop);await page.screenshot({path:output+'/desktop-home.png',fullPage:true});
  assert.equal(await page.locator('[data-character]').count(),0);
  await page.locator('#begin').click();await waitView(page,'play');
  // No extra canvas click: every movement key must work immediately after Start.
  let previous={x:135,y:315};
  for(const [key,axis,sign] of [['w','y',-1],['a','x',-1],['s','y',1],['d','x',1]]) {
    await page.keyboard.down(key);
    await page.locator(`kbd[data-move="${key}"].pressed`).waitFor();
    await page.waitForTimeout(160);await page.keyboard.up(key);
    await page.keyboard.press('Escape');await waitView(page,'pause');
    const next=(await saved(page)).positions.meadow;
    assert.ok((next[axis]-previous[axis])*sign>20,`${key.toUpperCase()} moves from Start or Pause`);
    previous=next;
  }
  await page.locator('#resume').click();await waitView(page,'play');
  const beforeBlur=await saved(page);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await waitView(page,'pause');
  await page.waitForTimeout(300);
  assert.equal((await saved(page)).health,beforeBlur.health,'losing keyboard focus pauses hazards');
  await page.keyboard.press('Escape');await waitView(page,'play');
  // Use a fresh run for the existing fixed-spawn assertions.
  await page.locator('.brand').click();await page.locator('#fresh').click();await waitView(page,'play');
  await hold(page,'ArrowRight',160);const box=await page.locator('#world').boundingBox();await page.mouse.click(box.x+box.width*.8,box.y+box.height*.6);
  await page.keyboard.press('Escape');await waitView(page,'pause');assert.equal(Math.round((await saved(page)).positions.meadow.x),135,'arrows and mouse do not move Pepsi');
  await page.locator('.pause-card h3').click();assert.match(page.url(),/view=pause/);await dismissOutside(page);await waitView(page,'play');
  await hold(page,'d',350);await page.keyboard.press('Escape');await waitView(page,'pause');assert.ok((await saved(page)).positions.meadow.x>185,'WASD movement works');
  const pausedURL=page.url();await page.reload();await page.locator('.pause-card').waitFor();assert.equal(page.url(),pausedURL);await page.keyboard.press('Escape');await waitView(page,'play');
  const key=createRun('keytest12');key.positions.meadow={x:477,y:190};await seed(page,key);await page.keyboard.down('d');await page.keyboard.press('Space');await page.waitForTimeout(220);await page.keyboard.up('d');
  await page.waitForFunction(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))).keyFound,prefix);assert.equal((await saved(page)).collected.length,0);
  await page.keyboard.press('Escape');await waitView(page,'pause');await page.keyboard.press('Escape');await waitView(page,'play');
  await page.screenshot({path:output+'/desktop-key.png',fullPage:true});
  const rescue=createRun('rescuetest');rescue.keyFound=true;rescue.health=1;rescue.room='pond';rescue.positions.pond={x:735,y:370};await seed(page,rescue);await hold(page,'d',250);await waitView(page,'reunion');
  assert.equal((await saved(page)).pepperFound,true);assert.equal((await saved(page)).health,4);await page.screenshot({path:output+'/desktop-reunion.png',fullPage:true});
  const reunionURL=page.url();await page.reload();await page.locator('.story-card').waitFor();assert.equal(page.url(),reunionURL);await page.locator('.story-card h3').click();assert.match(page.url(),/view=reunion/);
  const reunionCopy=await desktop.newPage();await reunionCopy.goto(reunionURL);await reunionCopy.locator('.story-card').waitFor();await reunionCopy.close();
  await page.locator('#reunion-continue').click();await waitRoom(page,'orchard');assert.equal((await saved(page)).health,4);assert.equal(await page.locator('#save-error').isVisible(),false,'read-only copied link does not create a save conflict');
  await page.screenshot({path:output+'/desktop-final-area.png',fullPage:true});
  // A real hazard hit and defeat, with no game-state test hooks.
  const damage=createRun('damage123');damage.health=1;damage.positions.meadow={x:300,y:350};await seed(page,damage);await page.waitForURL(/view=retry/,{timeout:10000});assert.equal((await saved(page)).health,0);assert.equal((await saved(page)).hits,1);
  const lostURL=page.url();await page.reload();await page.locator('#retry').waitFor();assert.equal(page.url(),lostURL);await page.screenshot({path:output+'/desktop-retry.png',fullPage:true});
  await page.locator('#retry').click();await waitView(page,'play');assert.equal((await saved(page)).health,3);assert.equal((await saved(page)).retries,1);
  const final=createRun('finaltest');final.keyFound=true;final.pepperFound=true;final.health=4;final.room='orchard';final.positions.orchard={x:780,y:160};await seed(page,final);
  await hold(page,'d',250);assert.ok((await saved(page)).basketFound);await hold(page,'s',850);await hold(page,'d',620);await page.waitForURL(/view=picnic/,{timeout:5000});assert.ok((await saved(page)).completed);
  await page.screenshot({path:output+'/desktop-picnic.png',fullPage:true});await page.reload();await page.locator('.picnic-card').waitFor();
  await page.locator('#again').click();await waitView(page,'play');assert.equal((await saved(page)).pepperFound,false);assert.equal((await saved(page)).health,3);
  // Every room supports refresh, copied URLs, and Back/Forward.
  const routes=createRun('routes123');routes.keyFound=true;routes.pepperFound=true;routes.health=4;
  await seed(page,routes,'meadow','pause');
  for(const room of ORDER){
    await page.goto(`${base}?view=pause&run=${routes.id}&room=${room}`);await page.locator('.pause-card').waitFor();const url=page.url();await page.reload();await page.locator('.pause-card').waitFor();assert.equal(page.url(),url);
    const copied=await desktop.newPage();await copied.goto(url);await copied.locator('.pause-card').waitFor();assert.equal(await copied.locator('#room-name').textContent(),ROOMS[room].name);await copied.close();
    await page.locator('#home-link').click();await page.locator('#begin').waitFor();await page.goBack();await page.locator('.pause-card').waitFor();assert.equal(page.url(),url);await page.goForward();await page.locator('#begin').waitFor();
  }
  // Original v1 save is kept intact while the new game imports its milestones.
  const legacy={version:1,id:'legacytest',seed:42,collected:['meadow-0','meadow-1','meadow-2','meadow-3'],completed:false};
  await page.evaluate(data=>localStorage.setItem('pepsi-pepper.snack-quest.v1.'+data.id,JSON.stringify(data)),legacy);
  await page.goto(`${base}?view=play&run=${legacy.id}&room=pond&corgi=pepper`);await waitRoom(page,'pond');assert.ok((await saved(page)).keyFound);assert.equal((await saved(page)).pepperFound,false);
  assert.deepEqual(await page.evaluate(id=>JSON.parse(localStorage.getItem('pepsi-pepper.snack-quest.v1.'+id)),legacy.id),legacy);assert.doesNotMatch(page.url(),/corgi=/);
  const stale=createRun('staletest');await seed(page,stale,'meadow','pause');
  await page.evaluate(({prefix,id})=>{const latest=JSON.parse(localStorage.getItem(prefix+id));latest.health=2;latest.revision+=1;localStorage.setItem(prefix+id,JSON.stringify(latest));},{prefix,id:stale.id});
  await page.locator('#resume').click();await waitView(page,'play');await hold(page,'d',180);await page.keyboard.press('Escape');await waitView(page,'pause');await page.locator('#save-error').waitFor({state:'visible'});assert.equal((await saved(page)).health,2,'stale tab cannot overwrite newer damage');
  await page.locator('#load-save').click();await page.locator('#save-error').waitFor({state:'hidden'});assert.equal(await page.locator('#health').getAttribute('aria-label'),'2 of 3 hearts');
  await desktop.close();

  // Measure real Web Audio output: opt-in, mute, pause, focus loss, and preference restoration.
  const listening=await browser.newContext({viewport:{width:1440,height:1000}});
  await listening.addInitScript(()=>{
    const NativeAudioContext=window.AudioContext;
    window.audioProbe={contexts:[],level:()=>0};
    window.AudioContext=class extends NativeAudioContext {
      constructor(...args){
        super(...args);window.audioProbe.contexts.push(this);
        const meter=this.createAnalyser(),samples=new Float32Array(meter.fftSize);
        window.audioProbe.level=()=>{meter.getFloatTimeDomainData(samples);return Math.max(...samples.map(Math.abs));};
        const createGain=this.createGain.bind(this);
        this.createGain=()=>{const gain=createGain(),connect=gain.connect.bind(gain);gain.connect=(destination,...rest)=>{
          if(destination===this.destination){connect(meter);meter.connect(destination);return destination;}
          return connect(destination,...rest);
        };return gain;};
      }
    };
  });
  const musicPage=await pageFor(listening);
  assert.equal(await musicPage.evaluate(()=>audioProbe.contexts.length),0,'silent until opted in');
  await musicPage.locator('#sound').click();
  await musicPage.waitForFunction(()=>audioProbe.level()>.005);
  await musicPage.locator('#begin').click();await waitView(musicPage,'play');
  await musicPage.keyboard.press('Escape');await waitView(musicPage,'pause');
  await musicPage.waitForTimeout(900);assert.ok(await musicPage.evaluate(()=>audioProbe.level()<.00001),'music is silent while paused');
  await musicPage.keyboard.press('d');await waitView(musicPage,'play');
  await musicPage.waitForFunction(()=>audioProbe.level()>.005);
  await musicPage.evaluate(()=>window.dispatchEvent(new Event('blur')));await waitView(musicPage,'pause');
  await musicPage.waitForTimeout(150);assert.ok(await musicPage.evaluate(()=>audioProbe.level()<.00001),'focus loss stops all audio');
  await musicPage.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await musicPage.keyboard.press('d');await waitView(musicPage,'play');
  await musicPage.waitForFunction(()=>audioProbe.level()>.005);
  await musicPage.locator('#sound').click();await musicPage.waitForTimeout(150);
  assert.ok(await musicPage.evaluate(()=>audioProbe.level()<.00001),'mute stops active and scheduled voices');
  await musicPage.locator('#sound').click();await musicPage.waitForFunction(()=>audioProbe.level()>.005);
  assert.equal(await musicPage.evaluate(()=>audioProbe.contexts.length),1,'resumes one soundtrack without duplicate contexts');
  await musicPage.keyboard.press('Escape');await musicPage.reload();await musicPage.locator('.pause-card').waitFor();
  assert.equal(await musicPage.locator('#sound').getAttribute('aria-pressed'),'true');
  assert.equal(await musicPage.evaluate(()=>audioProbe.contexts.length),0,'saved sound preference still waits for a gesture');
  await musicPage.keyboard.press('d');await musicPage.waitForFunction(()=>audioProbe.level()>.005);
  await musicPage.keyboard.press('Escape');
  await musicPage.screenshot({path:output+'/desktop-sound.png',fullPage:true});

  // Render the actual score for a listenable preview and check its level/headroom.
  const preview=await musicPage.evaluate(async()=>{
    const {Soundscape}=await import('/games/snack-quest/audio.mjs?v=5');
    const rate=22050,context=new OfflineAudioContext(1,rate*22,rate);
    const score=new Soundscape(()=>context);score.setEnabled(true);score.unlock();score.setScene('play','meadow');
    for(let i=0;i<64;i++)score.musicBeat(i,.1+i*30/96,30/96);
    const rendered=await context.startRendering();return [...rendered.getChannelData(0)];
  });
  let peak=0;for(const sample of preview){assert.ok(Number.isFinite(sample));peak=Math.max(peak,Math.abs(sample));}
  assert.ok(peak>.03&&peak<.8,'original music renders audibly with headroom');
  const wav=Buffer.alloc(44+preview.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(preview.length*2,40);
  preview.forEach((sample,i)=>wav.writeInt16LE(Math.round(sample*32767),44+i*2));writeFileSync(output+'/snack-quest-theme.wav',wav);
  await listening.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const phone=await pageFor(mobile);
  assert.equal(await phone.locator('.touch-controls,[data-direction]').count(),0);assert.equal(await phone.locator('.phone-note').isVisible(),true);
  await phone.screenshot({path:output+'/mobile-home.png',fullPage:true});
  const mobileRun=createRun('mobile123');mobileRun.keyFound=true;mobileRun.pepperFound=true;mobileRun.health=4;
  for(const room of ORDER){await seed(phone,mobileRun,room,'pause');const url=phone.url();await phone.reload();await phone.locator('.pause-card').waitFor();assert.equal(phone.url(),url);const copy=await mobile.newPage();await copy.goto(url);await copy.locator('.pause-card').waitFor();await copy.close();await dismissOutside(phone);await waitView(phone,'play');await phone.keyboard.press('Escape');await waitView(phone,'pause');}
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const reunionMobile=createRun('mobilestory');reunionMobile.keyFound=true;reunionMobile.pepperFound=true;reunionMobile.health=4;await seed(phone,reunionMobile,'pond','reunion');await phone.screenshot({path:output+'/mobile-reunion.png',fullPage:true});
  const winMobile=createRun('mobilewin');winMobile.keyFound=true;winMobile.pepperFound=true;winMobile.basketFound=true;winMobile.completed=true;winMobile.health=4;await seed(phone,winMobile,'orchard','picnic');await phone.screenshot({path:output+'/mobile-picnic.png',fullPage:true});await mobile.close();

  const blocked=await browser.newContext();await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});const failure=await pageFor(blocked);await failure.locator('#begin').click();await failure.locator('#save-error').waitFor({state:'visible'});const downloadPromise=failure.waitForEvent('download');await failure.locator('#download-save').click();assert.equal((await downloadPromise).suggestedFilename(),'pepsi-pepper-adventure.json');await blocked.close();
  assert.deepEqual(errors,[]);console.log('PASS: WASD-only movement, dash/key, real hit/defeat/retry, Pepper rescue and extra heart, basket and home ending, all room/view URLs, copied links, refresh, Back/Forward, mobile keyboard notice, old-save migration, save failure backup, and real audio playback/mute/pause/resume.');
  console.log('Screenshots: '+output);
}finally{await browser.close();}
