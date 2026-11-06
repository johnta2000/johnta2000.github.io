import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {homedir} from 'node:os';
import {mkdirSync} from 'node:fs';
import {createRun} from '../../games/snack-quest/engine.mjs';
const safari=process.env.SNACK_QUEST_BROWSER==='webkit';
const browser=await (safari?webkit:chromium).launch({headless:true,executablePath:homedir()+(safari?'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh':'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')});
const base='http://127.0.0.1:8766/games/snack-quest/',prefix='pepsi-pepper.snack-quest.v2.',out='/tmp/snack-quest-hearts-qa';mkdirSync(out,{recursive:true});
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);await page.goto(base);
  const run={...createRun('hearts'+(mobile?'mobile':'desktop')),keyFound:true,pepperFound:true,health:4,seed:1,room:'burrows',positions:{burrows:{x:270,y:210}}};
  await page.evaluate(({run,prefix})=>localStorage.setItem(prefix+run.id,JSON.stringify(run)),{run,prefix});await page.goto(base+`?view=play&room=burrows&run=${run.id}`);
  const saved=()=>page.evaluate(({prefix,id})=>JSON.parse(localStorage.getItem(prefix+id)),{prefix,id:run.id});
  async function check(health){
   assert.equal((await saved()).health,health);
   assert.equal(await page.locator('#health').getAttribute('aria-label'),`${health} of 4 shared hearts`);
   assert.equal(await page.locator('#hearts .empty-heart').count(),4-health);
   // Emoji fonts must never override the filled / hollow health states.
   await page.locator('#hearts').evaluate(e=>e.style.fontFamily='Apple Color Emoji');
   assert.equal((await page.locator('#hearts').innerText()).trim(),'');
   const fills=await page.locator('#hearts svg').evaluateAll(icons=>icons.map(icon=>getComputedStyle(icon).fill));
   assert.equal(fills.filter(fill=>fill==='none').length,4-health);
  }
  await check(4);
  if(!safari){
   // Actual input starts the world. A real gopher emerges underneath Pepsi.
   await page.keyboard.press('w');await page.waitForFunction(()=>document.querySelector('#hearts .empty-heart'));
   await page.locator('#pause').click();await check(3);assert.equal((await saved()).hits,1);
   await page.locator('#health').screenshot({path:`${out}/${mobile?'mobile':'desktop'}-hit.png`});
   await page.reload();await check(3);await page.locator('#resume').click();await check(3);
   const copied=await context.newPage();await copied.goto(page.url());assert.equal(await copied.locator('#health').getAttribute('aria-label'),'3 of 4 shared hearts');await copied.close();await page.bringToFront();
   await page.locator('#pause').click();await page.locator('#home-link').click();await page.goBack();await page.locator('#resume').waitFor();await check(3);await page.goForward();await page.locator('#begin').click();await check(3);
  }
  // All possible saved health values render faithfully, including defeat and reload.
  for(const health of [2,1,0]){
   const sample={...run,id:'health'+health+(mobile?'mobile':'desk'),health,revision:0};
   await page.evaluate(({prefix,sample})=>localStorage.setItem(prefix+sample.id,JSON.stringify(sample)),{prefix,sample});
   await page.goto(base+`?view=play&room=burrows&run=${sample.id}`);
   assert.equal(await page.locator('#health').getAttribute('aria-label'),`${health} of 4 shared hearts`);
   await page.locator('#hearts').evaluate(e=>e.style.fontFamily='Apple Color Emoji');
   assert.equal(await page.locator('#hearts .empty-heart').count(),4-health);
   assert.equal((await page.locator('#hearts').innerText()).trim(),'');
   if(health===1)await page.locator('#health').screenshot({path:`${out}/${safari?'webkit':'chromium'}-${mobile?'mobile':'desktop'}-one-heart.png`});
   if(health===0){await page.locator('#retry').click();assert.equal(await page.locator('#hearts .empty-heart').count(),0);}
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(`PASS ${safari?'WebKit':'Chromium'}: filled/hollow hearts survive emoji fonts; saved health, zero hearts, retry and desktop/mobile displays${safari?'':'; actual gopher damage, refresh, copied links and history'}.`);
}finally{await browser.close();}
