import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRun, TRINKETS } from '../../games/snack-quest/engine.mjs';

const base=process.env.SNACK_QUEST_URL||'http://127.0.0.1:8766/games/snack-quest/';
const installed=homedir()+'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{})});
const output='/tmp/snack-quest-boss-audio';mkdirSync(output,{recursive:true});
const prefix='pepsi-pepper.snack-quest.v2.',errors=[],mobile=process.env.SNACK_QUEST_MOBILE==='1';
async function activate(page,selector){if(mobile)await page.locator(selector).tap();else await page.locator(selector).click();}
async function pause(page){if(mobile)await activate(page,'#pause');else await page.keyboard.press('Escape');}
async function observe(page){
  await page.evaluate(async()=>{
    const {Soundscape}=await import('/games/snack-quest/audio.mjs?v=34'),tick=Soundscape.prototype.tick;
    Soundscape.prototype.tick=function(){window.musicProbe=this;return tick.call(this);};
  });
  await page.waitForFunction(()=>!!window.musicProbe);
}
async function state(page){return page.evaluate(()=>({battle:musicProbe.battleMusic,tempo:musicProbe.tempo,room:musicProbe.room,view:musicProbe.view,enabled:musicProbe.enabled,voices:musicProbe.musicVoices.size,effects:musicProbe.effectVoices.size}));}
async function saved(page){return page.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))),prefix);}
try {
  const context=await browser.newContext(mobile?{viewport:{width:844,height:390},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  const run=createRun('bossmusic');Object.assign(run,{room:'boss',keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,basketFound:true,health:4,trinkets:TRINKETS.map(i=>i.id),positions:{boss:{x:645,y:315}},bossState:{x:710,y:315,r:44,hp:2,mode:'exposed',timer:3.4,aimX:-1,aimY:0,cycle:3}});
  await page.evaluate(({prefix,run})=>localStorage.setItem(prefix+run.id,JSON.stringify(run)),{prefix,run});
  const bossURL=base+'?view=play&run='+run.id+'&room=boss';await page.goto(bossURL);await observe(page);
  assert.equal((await state(page)).battle,true);assert.equal((await state(page)).tempo,136);assert.equal((await state(page)).enabled,false);
  await activate(page,'#sound');assert.equal((await state(page)).enabled,true);
  await pause(page);assert.equal((await state(page)).battle,false);assert.equal((await state(page)).voices,0,'pause clears battle notes');
  await activate(page,'#resume');assert.equal((await state(page)).battle,true);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await state(page)).voices,0);assert.equal((await state(page)).effects,0);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await activate(page,'#sound');assert.equal((await state(page)).voices,0);assert.equal((await state(page)).enabled,false);
  await activate(page,'#sound');assert.equal((await state(page)).enabled,true);
  await page.reload();await observe(page);assert.equal((await state(page)).battle,true);assert.equal((await state(page)).enabled,true);
  assert.equal(await page.evaluate(()=>musicProbe.context===null),true,'saved sound still waits for a gesture');
  const copy=await context.newPage();await copy.goto(bossURL);await observe(copy);assert.equal((await state(copy)).battle,true);await copy.close();await page.bringToFront();
  if(mobile){
    const session=await context.newCDPSession(page),pad=await page.locator('#joystick').boundingBox(),power=await page.locator('[data-ability=power]').boundingBox();
    const thumb={id:1,x:pad.x+pad.width/2+48,y:pad.y+pad.height/2};
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[thumb]});
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[thumb,{id:2,x:power.x+power.width/2,y:power.y+power.height/2}]});
    await page.waitForTimeout(160);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{await page.keyboard.down('d');await page.keyboard.press('l');await page.waitForTimeout(160);await page.keyboard.up('d');}
  assert.equal((await saved(page)).bossDefeated,true);assert.equal((await state(page)).battle,false,'final hit immediately ends the battle score');assert.equal((await state(page)).tempo,84);
  await pause(page);await page.reload();await observe(page);await activate(page,'#resume');
  assert.equal((await state(page)).battle,false,'refreshing a defeated boss never restarts battle music');
  if(mobile){await pause(page);await activate(page,'#pause-chapters a[href*=kitchen]');}else await page.locator('#trail a[href*=kitchen]').click();assert.equal((await state(page)).room,'kitchen');assert.equal((await state(page)).battle,false);
  await page.goBack();assert.equal((await state(page)).room,'boss');assert.equal((await state(page)).battle,false);

  const rendered=await page.evaluate(async()=>{
    const {Soundscape}=await import('/games/snack-quest/audio.mjs?v=34');
    const result={};
    for(const room of ['boss','meadow']){
      const rate=22050,context=new OfflineAudioContext(1,rate*16,rate),score=new Soundscape(()=>context);
      score.setEnabled(true);score.unlock();score.setScene('play',room);
      const eighth=30/score.tempo;
      for(let i=0;i<64;i++)score.musicBeat(i,.1+i*eighth,eighth);
      const buffer=await context.startRendering();result[room]=[...buffer.getChannelData(0)];
    }
    return result;
  });
  let peak=0,energy=0,difference=0;
  for(let i=0;i<rendered.boss.length;i++){
    const sample=rendered.boss[i];assert.ok(Number.isFinite(sample));peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;difference+=Math.abs(sample-rendered.meadow[i]);
  }
  assert.ok(peak>.03&&peak<.8,'battle theme is audible without clipping');assert.ok(Math.sqrt(energy/rendered.boss.length)>.008,'battle has sustained musical energy');assert.ok(difference/rendered.boss.length>.01,'battle is audibly distinct from the meadow');
  const samples=rendered.boss,wav=Buffer.alloc(44+samples.length*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);
  samples.forEach((sample,i)=>wav.writeInt16LE(Math.round(sample*32767),44+i*2));writeFileSync(output+'/vacuum-boss-theme.wav',wav);
  assert.deepEqual(errors,[]);console.log('PASS ('+(mobile?'mobile':'desktop')+'): boss music selection, sound preference, pause/mute/focus, victory, reload/copied links/history; actual offline battle mix renders audibly without clipping. Live speaker playback is not measured on this host.');console.log('Peak:',peak,'Preview:',output+'/vacuum-boss-theme.wav');
} finally {await browser.close();}
