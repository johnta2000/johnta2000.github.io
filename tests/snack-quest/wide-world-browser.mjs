import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { createRun, TRINKETS, roomPoint } from '../../games/snack-quest/engine.mjs';
const browser=await chromium.launch({headless:true,executablePath:homedir()+'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
const base='http://127.0.0.1:8766/games/snack-quest/',prefix='pepsi-pepper.snack-quest.v2.',out='/tmp/snack-quest-wide-qa';mkdirSync(out,{recursive:true});
try {
 for(const mobile of [false,true]) {
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1440,height:1100},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  for(const room of ['woods','hills','orchard']) {
   const run={...createRun('wide'+room),room,keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,health:4,basketFound:true,trinkets:TRINKETS.map(t=>t.id),positions:{[room]:roomPoint(room,850,430)}};
   await page.evaluate(({run,prefix})=>localStorage.setItem(prefix+run.id,JSON.stringify(run)),{run,prefix});
   await page.goto(base+`?view=play&run=${run.id}&room=${room}`);await page.locator('#pause').waitFor();
   await page.keyboard.down('d');await page.waitForTimeout(180);await page.keyboard.up('d');
   await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-${room}.png`,fullPage:true});
   await page.keyboard.press('Escape');await page.locator('#resume').waitFor();
   const before=await page.evaluate(({prefix,id})=>JSON.parse(localStorage.getItem(prefix+id)),{prefix,id:run.id});
   assert.ok(before.positions[room].x>run.positions[room].x,'can move in the expanded area');assert.ok(before.positions[room].y>620);
   await page.reload();await page.locator('#resume').waitFor();
   const after=await page.evaluate(({prefix,id})=>JSON.parse(localStorage.getItem(prefix+id)),{prefix,id:run.id});assert.deepEqual(after.positions,before.positions);
   const copy=await context.newPage();await copy.goto(page.url());await copy.locator('#resume').waitFor();await copy.close();
   const camera=await page.evaluate(async room=>{const {camera}=await import('./art.mjs?v=27');return [camera({room,player:{x:150}},1000),camera({room,player:{x:1450}},1000)];},room);assert.deepEqual(camera,[0,0]);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: three large worlds, stationary overview, movement beyond old bounds, saved positions, reload and copied links on desktop and mobile. Screenshots: '+out);
} finally {await browser.close();}
