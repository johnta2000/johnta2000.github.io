import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRun, TRINKETS } from '../../games/snack-quest/engine.mjs';

const base=process.env.SNACK_QUEST_URL||'http://127.0.0.1:8766/games/snack-quest/';
const installed=homedir()+'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser=await chromium.launch({headless:true,...(existsSync(installed)?{executablePath:installed}:{})});
const output='/tmp/snack-quest-mobile-qa';mkdirSync(output,{recursive:true});
const prefix='pepsi-pepper.snack-quest.v2.',errors=[];
try {
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.goto(base);await page.locator('#begin').waitFor();
  await page.screenshot({path:output+'/landscape-home.png'});
  await page.locator('#begin').tap();await page.locator('#joystick').waitFor();
  assert.match(await page.locator('#objective-text').innerText(),/joystick/);
  assert.notEqual(await page.evaluate(()=>document.activeElement.id),'keyboard-capture','touch never summons the native keyboard');
  const session=await context.newCDPSession(page);
  const center=async(selector,id)=>{const r=await page.locator(selector).boundingBox();return {id,x:r.x+r.width/2,y:r.y+r.height/2};};
  const touch=async(type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
  const saved=async()=>page.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))),prefix);
  let thumb=await center('#joystick',1);
  await touch('touchStart',[thumb]);assert.equal(await page.locator('[data-ability=dash]').isDisabled(),true,'resting thumb does not start hazards');
  const neutral={...thumb};
  await touch('touchMove',[{...thumb,x:thumb.x+20}]);await page.waitForTimeout(500);await touch('touchEnd',[]);await page.waitForTimeout(1100);
  const gentle=(await saved()).positions.tutorial.x-135;assert.ok(gentle>15&&gentle<65,'a gentle real thumb tilt rolls slowly');
  thumb={...neutral,x:neutral.x+48};await touch('touchStart',[thumb]);await page.waitForTimeout(1100);
  await touch('touchEnd',[]);await page.waitForTimeout(1100);const stopped=(await saved()).positions.tutorial;
  assert.ok(stopped.x>290,`real touch drag rolls Pepsi: x=${stopped.x}, gentle=${gentle}, joystick=${JSON.stringify(await page.locator('#joystick').boundingBox())}`);
  await page.waitForTimeout(1100);assert.deepEqual((await saved()).positions.tutorial,stopped,'lifting the thumb stops rolling');
  assert.equal(await page.evaluate(()=>scrollY),0,'joystick never scrolls the page');
  thumb=await center('#joystick',1);thumb.x+=48;await touch('touchStart',[thumb]);await page.waitForTimeout(650);
  const practiceDash=await center('[data-ability=dash]',2);await touch('touchStart',[thumb,practiceDash]);await page.waitForTimeout(250);await touch('touchEnd',[]);
  assert.equal((await saved()).tutorialStep,2,'touch dash breaks the practice crate');
  await page.waitForFunction(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))).tutorialStep===3,prefix);


  const run=createRun('touchskills');Object.assign(run,{room:'tutorial',tutorialStep:3,keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,basketFound:true,health:4,trinkets:TRINKETS.map(item=>item.id)});
  await page.evaluate(({prefix,run})=>localStorage.setItem(prefix+run.id,JSON.stringify(run)),{prefix,run});
  await page.goto(base+'?view=play&run='+run.id+'&room=tutorial');
  thumb=await center('#joystick',1);thumb.x+=48;await touch('touchStart',[thumb]);
  const dash=await center('[data-ability=dash]',2);await touch('touchStart',[thumb,dash]);await page.waitForTimeout(60);
  assert.ok((await saved()).cooldowns.dash>2);assert.equal((await saved()).cooldowns.bark,0);assert.equal((await saved()).cooldowns.stink,0);
  await touch('touchEnd',[dash]);const bark=await center('[data-ability=bark]',2);await touch('touchStart',[thumb,bark]);await page.waitForTimeout(60);
  assert.ok((await saved()).cooldowns.bark>9,'a second finger can shield while the first steers');assert.equal((await saved()).cooldowns.stink,0);
  await touch('touchEnd',[bark]);await touch('touchStart',[thumb,dash]);await page.waitForTimeout(80);
  assert.ok((await saved()).cooldowns.dash<2.8,'repeated taps do not reset or bypass recharge');
  await touch('touchEnd',[dash]);await touch('touchStart',[thumb,await center('[data-ability=stink]',2)]);await page.waitForTimeout(80);
  assert.ok((await saved()).cooldowns.stink>6);await touch('touchEnd',[]);
  await page.screenshot({path:output+'/landscape-playing.png'});
  await page.locator('#pause').tap();await page.locator('#resume').waitFor();
  const beforePause=await saved();await page.reload();await page.locator('#resume').waitFor();assert.deepEqual((await saved()).cooldowns,beforePause.cooldowns);
  await page.locator('#resume').tap();await page.waitForTimeout(2900);assert.deepEqual((await saved()).cooldowns,beforePause.cooldowns,'hazards and recharge wait for movement after resume');
  thumb=await center('#joystick',1);thumb.y-=48;await touch('touchStart',[thumb]);await page.waitForTimeout(2900);await touch('touchEnd',[]);
  await page.locator('[data-ability=power]').tap();assert.ok((await saved()).cooldowns.power>7,'Power has its own touch button');
  await page.waitForTimeout(400);
  thumb=await center('#joystick',1);thumb.y+=48;await touch('touchStart',[thumb]);await page.waitForTimeout(150);await touch('touchCancel',[]);
  await page.waitForTimeout(1100);const cancelled=(await saved()).positions.tutorial;await page.waitForTimeout(1100);
  assert.deepEqual((await saved()).positions.tutorial,cancelled,'touch cancellation cannot leave movement held');

  thumb=await center('#joystick',1);thumb.y+=48;await touch('touchStart',[thumb]);await page.waitForTimeout(150);
  await page.setViewportSize({width:390,height:844});await page.locator('#rotate-prompt').waitFor();await touch('touchCancel',[]);
  const upright=await saved();await page.waitForTimeout(1500);assert.deepEqual((await saved()).positions,upright.positions);assert.equal((await saved()).health,upright.health);
  await page.screenshot({path:output+'/rotate-prompt.png',fullPage:true});
  await page.setViewportSize({width:844,height:390});await page.waitForFunction(()=>document.body.classList.contains('touch-landscape'),null,{timeout:10000});
  assert.equal(await page.locator('#joystick').getAttribute('class'),'joystick');assert.equal(await page.locator('[data-ability=bark]').isDisabled(),true);
  assert.deepEqual((await saved()).positions,upright.positions,'rotation preserves position');
  await page.locator('#pause').tap();await page.locator('#pause-chapters a[href*=pond]').tap();
  assert.match(page.url(),/room=pond/);const link=page.url();await page.reload();assert.equal(page.url(),link);
  const copy=await context.newPage();await copy.goto(link);assert.equal(await copy.locator('#room-name').innerText(),'Pebble Pond');await copy.close();await page.bringToFront();
  await page.goBack();await page.locator('#resume').waitFor();await page.goForward();assert.match(page.url(),/room=pond/);
  await page.locator('#pause').tap();await page.locator('#resume').tap();
  await page.locator('#pause').tap();const inside=await page.locator('.pause-card').boundingBox();await page.touchscreen.tap(inside.x+inside.width/2,inside.y+15);await page.locator('#resume').waitFor();
  await page.touchscreen.tap(5,60);await page.locator('#resume').waitFor({state:'hidden'});
  for(const size of [{width:667,height:375},{width:740,height:320},{width:932,height:430},{width:1024,height:768}]) {
    await page.setViewportSize(size);await page.waitForFunction(()=>document.body.classList.contains('touch-landscape'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),'game fits '+JSON.stringify(size));
    for(const selector of ['#joystick','#pause','[data-ability=dash]','[data-ability=bark]','[data-ability=stink]','[data-ability=power]']) {
      const bounds=await page.locator(selector).boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=size.width+1&&bounds.y+bounds.height<=size.height+1,selector+' stays onscreen '+JSON.stringify({size,bounds}));assert.ok(bounds.width>=44&&bounds.height>=44,selector+' has a thumb-sized target');
    }
    const actionBoxes=await Promise.all(['dash','bark','stink','power'].map(id=>page.locator(`[data-ability=${id}]`).boundingBox()));
    assert.ok(actionBoxes[0].width>actionBoxes[1].width,'Dash is the larger primary action');
    for(let i=0;i<actionBoxes.length;i++)for(let j=i+1;j<actionBoxes.length;j++) {
      const a=actionBoxes[i],b=actionBoxes[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'ability targets never overlap');
    }
    const stage=await page.locator('#stage').boundingBox(),joystick=await page.locator('#joystick').boundingBox(),abilities=await page.locator('#abilities').boundingBox();
    assert.equal(stage.x,0);assert.equal(stage.y,0);assert.equal(stage.width,size.width);assert.equal(stage.height,size.height);
    assert.ok(joystick.x>=stage.x&&abilities.x+abilities.width<=stage.width,'controls float inside the field');
    assert.ok(joystick.x+joystick.width<abilities.x,'the center stays clear for gameplay');
    await page.screenshot({path:output+`/landscape-${size.width}.png`});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: real multi-touch steering + independent abilities, release/cancel, cooldowns, rotation, saved state, links/history, modal dismissal, and four landscape sizes.');
  console.log('Screenshots: '+output);
} finally {await browser.close();}
