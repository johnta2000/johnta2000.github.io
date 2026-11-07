import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {homedir} from 'node:os';
import {mkdirSync} from 'node:fs';
const safari=process.env.SNACK_QUEST_BROWSER==='webkit';
const b=await(safari?webkit:chromium).launch({headless:true,executablePath:homedir()+(safari?'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh':'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')});
const base='http://127.0.0.1:8766/games/snack-quest/';mkdirSync('/tmp/snack-sound-check',{recursive:true});
try{
 for(const mobile of [false,true]){
 const c=await b.newContext({viewport:mobile?{width:844,height:390}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile}),p=await c.newPage(),errors=[];p.setDefaultTimeout(10000);p.setDefaultNavigationTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
 await c.addInitScript(()=>{
  window.audioGestures=[];
  for(const type of ['pointerdown','touchend','click'])window.addEventListener(type,()=>window.audioGesture=type,{capture:true});
  const Native=window.AudioContext;
  window.AudioContext=class extends Native{resume(){window.audioGestures.push(window.audioGesture);return super.resume();}};
 });
 await p.goto(base);await p.locator('#sound-help').click();assert.match(p.url(),/view=sound/);
 await p.locator('#test-game-sound').click();await p.waitForTimeout(1000);assert.match(await p.locator('#sound-details').textContent(),/Build 39/);
 await p.locator('#test-speaker').click();await p.waitForFunction(()=>document.getElementById('sound-result').textContent.includes('Browser chime'));
 assert.match(await p.locator('#sound-result').innerText(),safari?/started|blocked/:/started/);
 await p.screenshot({path:`/tmp/snack-sound-check/${safari?'webkit':'chromium'}-${mobile?'mobile':'desktop'}.png`,fullPage:true});
 await p.reload();await p.locator('#sound-title').waitFor();if(!safari){const copy=await c.newPage();await copy.goto(p.url());await copy.locator('#sound-title').waitFor();await copy.close();await p.bringToFront();}
 await p.locator('#sound-done').click();await p.locator('#begin').waitFor();await p.goBack();await p.locator('#sound-title').waitFor();await p.goForward();await p.locator('#begin').waitFor();
 await p.locator('#sound-help').click();const box=await p.locator('.story-card').boundingBox();await p.mouse.click(box.x+box.width/2,box.y+15);assert.match(p.url(),/view=sound/);
 await p.mouse.move(box.x+box.width/2,box.y+15);await p.mouse.down();await p.mouse.move(10,100);await p.mouse.up();assert.match(p.url(),/view=sound/);
 await p.keyboard.press('Escape');await p.locator('#begin').waitFor();assert.equal(await p.evaluate(()=>document.activeElement.id),'sound-help');
 await p.locator('#sound-help').click();const backdrop=await p.locator('#screen').boundingBox();await p.mouse.click(backdrop.x+5,backdrop.y+5);await p.locator('#begin').waitFor();
 // Remembered Sound on must retry when a touch completes, not only on pointerdown.
 await p.reload();await p.evaluate(async()=>{const {Soundscape}=await import('./audio.mjs?v=39'),unlock=Soundscape.prototype.unlock;window.unlockGestures=[];Soundscape.prototype.unlock=function(){window.unlockGestures.push(window.audioGesture);return unlock.call(this);};});if(mobile)await p.locator('#begin').tap();else await p.locator('#begin').click();
 const gestures=await p.evaluate(()=>window.unlockGestures);
 if(mobile)assert.ok(gestures.includes('touchend')||gestures.includes('click'),'completed touch retries audio startup');
 assert.deepEqual(errors,[]);await c.close();
 }
 console.log('PASS: sound-check direct/refresh/copied/history routes; two chimes, completed-touch startup, modal dismissal and desktop/mobile layout. Physical speaker output is not measured.');
}finally{await b.close();}
