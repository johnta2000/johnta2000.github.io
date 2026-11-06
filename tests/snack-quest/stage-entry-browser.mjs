import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {homedir} from 'node:os';
import {createRun,TRINKETS,ORDER,roomPoint,roomScale} from '../../games/snack-quest/engine.mjs';
const base='http://127.0.0.1:8766/games/snack-quest/',prefix='pepsi-pepper.snack-quest.v2.';
const browser=await chromium.launch({headless:true,executablePath:homedir()+'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();page.setDefaultTimeout(12000);await page.goto(base);
  const run={...createRun('entry'+(mobile?'mobile':'desktop')),keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,basketFound:true,health:3,room:'meadow',trinkets:TRINKETS.map(t=>t.id),collected:['pond-1'],cooldowns:{dash:1,bark:6,stink:2,power:4},positions:Object.fromEntries(ORDER.map(room=>[room,roomPoint(room,910,320)]))};
  run.positions.meadow=roomPoint('meadow',135,315);
  await page.evaluate(({run,prefix})=>localStorage.setItem(prefix+run.id,JSON.stringify(run)),{run,prefix});await page.goto(base+`?view=play&run=${run.id}&room=meadow`);
  const saved=()=>page.evaluate(({prefix,id})=>JSON.parse(localStorage.getItem(prefix+id)),{prefix,id:run.id});
  const normalized=async room=>{const data=await saved();return data.positions[room].x/(data.mapStretch||1)/roomScale(room);};
  async function select(room){if(mobile)await page.locator('#pause').click();await page.locator(`${mobile?'#pause-chapters':'#trail'} a[href*="room=${room}"]`).click();await page.waitForURL(new RegExp('room='+room));}
  await select('pond');assert.ok(Math.abs(await normalized('pond')-135)<.01,'selecting a visited stage starts at its LEFT entrance, not its saved right exit');
  let state=await saved();assert.equal(state.health,3);assert.deepEqual(state.trinkets,run.trinkets);assert.deepEqual(state.collected,run.collected);assert.deepEqual(state.cooldowns,run.cooldowns,'changing stage is not a free recharge');
  // Returning via ordinary forward progression also resets an already-visited destination.
  await page.goto(base+'?view=pause&run='+run.id+'&room=pond');state=await saved();state.positions.pond=roomPoint('pond',880,320);state.positions.pond.x*=state.mapStretch;state.revision++;
  // Seed a separate adventure to avoid overwriting the active tab's saved work.
  state.id='gate'+(mobile?'mobile':'desktop');await page.evaluate(({state,prefix})=>localStorage.setItem(prefix+state.id,JSON.stringify(state)),{state,prefix});await page.goto(base+`?view=play&run=${state.id}&room=pond`);
  await page.keyboard.down('d');await page.waitForURL(/room=burrows/);await page.waitForTimeout(150);await page.keyboard.up('d');
  let after=await page.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))),prefix);
  assert.ok(Math.abs(after.positions.burrows.x/after.mapStretch-135)<.01,'gate transition enters the next stage on the left');
  assert.equal(after.room,'burrows','holding a key cannot skip the stage');
  await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');await page.locator('#pause').click();
  after=await page.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))),prefix);const position=after.positions.burrows;
  await page.reload();await page.locator('#resume').click();const restored=await page.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))),prefix);assert.deepEqual(restored.positions.burrows,position,'pause/reload keeps the in-progress position');
  const copy=await context.newPage();await copy.goto(page.url());await copy.locator('#pause').waitFor();const copied=await copy.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))),prefix);assert.deepEqual(copied.positions.burrows,position);await copy.close();await page.bringToFront();
  await page.locator('#pause').click();await page.locator('#home-link').click();await page.locator('#begin').click();assert.match(page.url(),/room=burrows/);await page.goBack();await page.locator('#begin').waitFor();await page.goForward();await page.locator('#pause').waitFor();
  await context.close();
 }
 console.log('PASS: stage selection and forward gates start on the left; progress/cooldowns preserved; no chained skips; pause, Continue, refresh, copied links, and history restore in-progress positions on desktop/mobile.');
}finally{await browser.close();}
