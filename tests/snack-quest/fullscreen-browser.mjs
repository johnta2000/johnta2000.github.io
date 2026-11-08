import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {homedir} from 'node:os';
import {mkdirSync} from 'node:fs';
import {createRun as engineCreateRun} from '../../games/snack-quest/engine.mjs';
// These fixtures exercise mechanics after the enemy introductions.
const createRun=(...args)=>({...engineCreateRun(...args),seenEnemies:['vacuum','cat','gopher','goose','boss']});
const safari=process.env.SNACK_QUEST_BROWSER==='webkit',browser=await (safari?webkit:chromium).launch({headless:true,...(!safari?{executablePath:homedir()+'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'}:{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'})});
const base='http://127.0.0.1:8766/games/snack-quest/',prefix='pepsi-pepper.snack-quest.v2.',out='/tmp/snack-quest-fullscreen-qa';mkdirSync(out,{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:844,height:290},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));context.setDefaultTimeout(12000);context.setDefaultNavigationTimeout(15000);
 await context.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;Element.prototype.webkitRequestFullscreen=undefined;});
 await page.goto(base);const run={...createRun('screenhelp'),room:'tutorial',tutorialStep:3,keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,needohFound:true,health:4};
 await page.evaluate(({prefix,run})=>localStorage.setItem(prefix+run.id,JSON.stringify(run)),{prefix,run});await page.goto(base+'?view=play&run='+run.id+'&room=tutorial');
 for(const size of [{width:844,height:290},{width:852,height:280},{width:667,height:220},{width:932,height:430}]){
  await page.setViewportSize(size);await page.waitForTimeout(120);const toolbar=await page.locator('.game-toolbar').boundingBox();
  for(const selector of ['#joystick','[data-ability=dash]','[data-ability=bark]','[data-ability=stink]','[data-ability=power]']){
   const box=await page.locator(selector).boundingBox();assert.ok(box.y>=toolbar.y+toolbar.height-.5,selector+' stays below header');assert.ok(box.y+box.height<=size.height+.5,selector+' stays on screen');assert.ok(box.width>=44&&box.height>=44);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${out}/${safari?'webkit':'chromium'}-${size.width}x${size.height}.png`});
 }
 // Reproduce browser bars reducing only the visual viewport.
 await page.setViewportSize({width:844,height:390});await page.evaluate(()=>{window.originalViewportHeight=Object.getOwnPropertyDescriptor(visualViewport,'height');Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>280});visualViewport.dispatchEvent(new Event('resize'));});
 assert.equal(Math.round((await page.locator('.page-shell').boundingBox()).height),280);assert.ok(await page.locator('body').evaluate(b=>b.classList.contains('compact-controls')));
 await page.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'));});
 if(safari){
  // The installed WebKit build cannot activate test windows with this driver.
  // Exercise its layout and direct help route; Chromium covers actual gestures.
  await page.goto(base+'?view=fullscreen&from=play&run='+run.id+'&room=tutorial');await page.locator('.display-card').waitFor();
  assert.match(await page.locator('.display-card').innerText(),/Add to Home Screen/);assert.deepEqual(errors,[]);
  console.log('PASS: WebKit short-screen layouts, visual viewport sizing, and direct display-help route. Gesture, fullscreen, and file-transfer checks run in Chromium.');
  await browser.close();process.exit(0);
 }
 await page.locator('#fullscreen').tap();await page.locator('.display-card').waitFor();assert.match(page.url(),/view=fullscreen/);const helpURL=page.url();
 await page.locator('#display-title').tap();assert.equal(page.url(),helpURL,'inside click stays open');await page.reload();await page.locator('.display-card').waitFor();
 const copy=await context.newPage();await copy.goto(helpURL);await copy.locator('.display-card').waitFor();await copy.close();if(!safari)await page.bringToFront();
 if(!safari){const download=page.waitForEvent('download');await page.locator('#display-backup').tap();const file=await download;await file.saveAs(out+'/progress.json');}
 console.log('Layout and display help verified');
 await page.locator('#display-close').tap();assert.match(page.url(),/view=play/);await page.goBack();await page.locator('.display-card').waitFor();await page.goForward();await page.waitForURL(/view=play/);
 await page.locator('#fullscreen').tap();await page.keyboard.press('Escape');assert.match(page.url(),/view=play/);
 await page.locator('#fullscreen').tap();assert.equal(await page.locator('#joystick').evaluate(stick=>{const r=stick.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).id;}),'screen','display dialog covers floating game controls');const backdrop=await page.locator('#screen').boundingBox();await page.touchscreen.tap(backdrop.x+3,backdrop.y+3);await page.waitForURL(/view=play/);
 assert.deepEqual(errors,[]);
 if(!safari){const fresh=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});await fresh.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true}));
 const app=await fresh.newPage();await app.goto(base);await app.locator('#fullscreen').tap();await app.locator('.display-card').waitFor();assert.match(await app.locator('.display-card').innerText(),/already playing/);
 await app.locator('input[type=file]').setInputFiles(out+'/progress.json');await app.waitForURL(/view=play/);const restored=await app.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))),prefix);assert.equal(restored.needohFound,true);assert.equal(restored.pepperoniFound,true);assert.notEqual(restored.id,run.id);await fresh.close();}
 if(!safari){const native=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});const full=await native.newPage();await full.goto(base);await full.locator('#fullscreen').click();await full.waitForFunction(()=>!!document.fullscreenElement);await full.locator('#fullscreen').click();await full.waitForFunction(()=>!document.fullscreenElement);await native.close();}
 await context.close();console.log('PASS: short screens, visual viewport sizing, help deep links/history/dismissal'+(!safari?', standalone backup restore, native fullscreen entry/exit':' (WebKit; file transfers tested in Chromium)'));
}finally{await browser.close();}
