import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {homedir} from 'node:os';
import {mkdirSync} from 'node:fs';
import {createRun,TRINKETS,roomPoint,roomScale} from '../../games/snack-quest/engine.mjs';
const base='http://127.0.0.1:8766/games/snack-quest/',prefix='pepsi-pepper.snack-quest.v2.',out='/tmp/snack-quest-overview-qa';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:homedir()+'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id==='world'){const t=this.getTransform();window.mapTransform={a:t.a,d:t.d,e:t.e,f:t.f,width:args[0].width,height:args[0].height,canvasWidth:this.canvas.width,canvasHeight:this.canvas.height};}return original.apply(this,args);};});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 for(const room of ['tutorial','meadow','pond','burrows','woods','hills','orchard','laundry','kitchen','boss']){
  const run={...createRun('map'+room),room,tutorialStep:3,keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,basketFound:true,health:4,trinkets:TRINKETS.map(t=>t.id),positions:{[room]:roomPoint(room,850,430)}};
  await page.evaluate(({run,prefix})=>localStorage.setItem(prefix+run.id,JSON.stringify(run)),{run,prefix});await page.goto(base+`?view=play&run=${run.id}&room=${room}`);
  await page.waitForFunction(()=>!!window.mapTransform);const before=await page.evaluate(()=>mapTransform),initial=await page.evaluate(({id,prefix})=>JSON.parse(localStorage.getItem(prefix+id)),{id:run.id,prefix});
  assert.ok(Math.abs(before.width-1000*roomScale(room)*initial.mapStretch)<1);assert.ok(initial.mapStretch>1.5,'phone maps are physically wider');
  assert.ok(before.width*before.a/before.canvasWidth>.98,'the playable map fills the screen width');assert.equal(before.height,620*roomScale(room));
  assert.equal(before.a,before.d);assert.ok(before.e>=0&&before.f>=0);assert.ok(before.e+before.width*before.a<=before.canvasWidth+1);assert.ok(before.f+before.height*before.d<=before.canvasHeight+1,'the bottom edge is visible');
  await page.keyboard.down('a');await page.waitForTimeout(250);await page.keyboard.up('a');await page.keyboard.down('w');await page.waitForTimeout(250);await page.keyboard.up('w');
  assert.deepEqual(await page.evaluate(()=>mapTransform),before,'moving in '+room+' never pans or zooms');
  if(['meadow','woods','boss'].includes(room))await page.screenshot({path:out+'/'+room+'.png'});
  await page.locator('#pause').tap();const saved=await page.evaluate(({id,prefix})=>JSON.parse(localStorage.getItem(prefix+id)),{id:run.id,prefix});assert.notDeepEqual(saved.positions[room],initial.positions[room],'corgi actually moved');assert.deepEqual(await page.evaluate(()=>mapTransform),before,'pausing keeps the map fixed');
  await page.reload();await page.locator('#resume').waitFor();await page.waitForFunction(()=>!!window.mapTransform);assert.deepEqual(await page.evaluate(()=>mapTransform),before);await page.locator('#resume').tap();
 }
 for(const size of [{width:667,height:220},{width:932,height:430},{width:1024,height:768}]){
  await page.setViewportSize(size);await page.waitForTimeout(120);const f=await page.evaluate(()=>mapTransform);assert.ok(f.e>=0&&f.f>=0&&f.e+f.width*f.a<=f.canvasWidth+1&&f.f+f.height*f.d<=f.canvasHeight+1);
  await page.screenshot({path:out+'/'+size.width+'.png'});
 }
 await page.setViewportSize({width:852,height:393});await page.evaluate(()=>{for(const [key,value]of Object.entries({top:'20px',left:'44px',right:'44px',bottom:'21px'}))document.body.style.setProperty('--safe-'+key,value);});await page.waitForTimeout(120);
 const safe=await page.evaluate(()=>mapTransform),ratio=safe.canvasWidth/852;assert.ok(safe.f/ratio>=68,'map clears safe-area header');assert.ok((safe.f+safe.height*safe.d)/ratio<=393-49+.1,'map clears home indicator and objective');
 assert.deepEqual(errors,[]);console.log('PASS: every map fully visible, no pan/zoom while moving or pausing, restored framing after refresh, normal/large maps, phone/tablet sizes.');
}finally{await browser.close();}
