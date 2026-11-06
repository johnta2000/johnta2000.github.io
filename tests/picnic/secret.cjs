// Focused persistence, unlock, and hazard checks using reproducible saved rounds.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,devices}=require('playwright');
const BASE=process.env.PICNIC_BASE_URL||'http://127.0.0.1:8786/games/picnic/',KEY='pepsi-pepper-picnic-v2',LEGACY='pepsi-pepper-picnic-v1',FLAG='pepsi-pepper-picnic-pee',OUTPUT='outputs/picnic-qa';
fs.mkdirSync(OUTPUT,{recursive:true});
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
(async()=>{
 const {blankSave,createRun,LEVELS}=await import('../../games/picnic/engine.mjs');
 const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 async function seededPage(seed,query,options={}){
  const context=await browser.newContext({reducedMotion:'reduce',...options});
  await context.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key:KEY,seed});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(BASE+query);return {context,page};
 }
 function fixture(level,type){const save=blankSave();save.completed=Array.from({length:level-1},(_,i)=>i+1);save.pepperUnlocked=level>=4;save.runs[level]=createRun(level);Object.assign(save.runs[level],{elapsed:5,status:'paused',spawnIn:10,caught:6,counts:{strawberry:0,biscuit:6,orange:0},drops:[{id:1,type,x:.5,baseX:.5,y:.769,rotation:0}]});return save;}
 const start=page=>page.getByRole('button',{name:'Back to the adventure'}).click();
 try{
  for(const type of ['sock','mud','vacuum']){
   const {context,page}=await seededPage(fixture(5,type),'?view=play&level=5');await start(page);await page.clock.runFor(100);
   let state=await stored(page);assert.equal(state.runs[5].hearts,2);assert.equal(state.runs[5].lastHazard,type);assert.ok(await page.locator(type==='sock'?'#cough-cue':'#catch-message.bad').isVisible());assert.equal(await page.locator('#hearts').getAttribute('aria-label'),'2 of 3 hearts remaining');
   if(type==='sock')assert.equal(state.runs[5].caught,4);else assert.match(await page.locator('#effect-status').textContent(),type==='mud'?/Muddy paws: 3s/:/Tiny blanket: 3s/);
   await page.screenshot({path:`${OUTPUT}/hazard-${type}.png`,fullPage:true});await page.getByRole('button',{name:'Pause game'}).click();state=await stored(page);await page.reload();assert.deepEqual((await stored(page)).runs[5],state.runs[5]);await page.clock.runFor(5000);assert.deepEqual((await stored(page)).runs[5],state.runs[5]);
   await context.close();
  }
  console.log('PASS all hazard feedback and exact pause/reload of active setbacks');
  const losing=fixture(5,'vacuum');losing.runs[5].hearts=1;losing.runs[5].hits=2;losing.peeUnlocked=true;losing.stars[5]=3;
  const failure=await seededPage(losing,'?view=play&level=5');await start(failure.page);await failure.page.clock.runFor(100);assert.match(failure.page.url(),/view=result/);assert.ok(await failure.page.getByRole('heading',{name:'A tactical vacuum retreat.'}).isVisible());assert.equal((await stored(failure.page)).results[5].won,false);
  await failure.page.getByRole('button',{name:'Try this level again'}).click();let state=await stored(failure.page);assert.equal(state.runs[5].hearts,3);assert.equal(state.runs[5].elapsed,0);assert.equal(state.stars[5],3);assert.ok(state.peeUnlocked&&state.pepperUnlocked);assert.equal(state.completed.length,4);await failure.context.close();
  console.log('PASS zero hearts fails the round; retry restores hearts and preserves achievements');

  const seed=fixture(7,'golden');seed.goldenLevels=[5,6];seed.runs[7].caught=LEVELS[6].goal-1;seed.runs[7].counts.biscuit=seed.runs[7].caught;seed.runs[7].goldenSpawned=true;
  const unlock=await seededPage(seed,'?view=play&level=7',{...devices['iPhone 13'],deviceScaleFactor:1});const page=unlock.page;
  await start(page);await page.clock.runFor(100);assert.match(page.url(),/view=guest/);state=await stored(page);assert.equal(state.peeUnlocked,true);assert.equal(state.results[7].won,true);assert.deepEqual(state.goldenLevels,[5,6,7]);
  await page.getByRole('button',{name:'Back to our adventure'}).click();assert.match(page.url(),/view=result&level=7/);
  await page.goto(BASE+'?view=help');const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Back up progress'}).click();await (await downloaded).saveAs(`${OUTPUT}/adventure-backup.json`);const backup=JSON.parse(fs.readFileSync(`${OUTPUT}/adventure-backup.json`,'utf8'));assert.ok(backup.peeUnlocked);
  const restored=await browser.newContext(),restore=await restored.newPage();await restore.goto(BASE+'?view=help');await restore.locator('#restore').setInputFiles({name:'picnic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await restore.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.peeUnlocked,KEY);
  await restore.locator('#restore').setInputFiles({name:'older.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(blankSave()))});await restore.waitForFunction(()=>!document.querySelector('#restore').value);state=await stored(restore);assert.ok(state.peeUnlocked&&state.pepperUnlocked);assert.equal(state.completed.length,7);assert.equal(state.stars[7],3);assert.equal(await restore.evaluate(flag=>localStorage.getItem(flag),FLAG),'unlocked');
  console.log('PASS golden biscuit on a winning frame, backup export/import, and old-backup achievement preservation');

  const missing=fixture(5,'golden');missing.runs[5].basket=.15;missing.runs[5].target=.15;const missed=await seededPage(missing,'?view=play&level=5');await start(missed.page);await missed.page.clock.runFor(700);assert.equal((await stored(missed.page)).goldenLevels.length,0);
  await missed.page.goto(BASE+'?view=guest&level=5');assert.ok(await missed.page.getByRole('heading',{name:'A secret picnic guest.'}).isVisible());assert.equal(await missed.page.locator('#friend-portrait').count(),0);await missed.context.close();
  const duplicate=fixture(5,'golden');duplicate.goldenLevels=[5];const duplicatePage=await seededPage(duplicate,'?view=play&level=5');await start(duplicatePage.page);await duplicatePage.page.clock.runFor(100);assert.deepEqual((await stored(duplicatePage.page)).goldenLevels,[5]);assert.equal((await stored(duplicatePage.page)).peeUnlocked,false);await duplicatePage.context.close();
  console.log('PASS missed golden biscuits, locked secret links, and repeated level farming do not unlock Pee');

  const legacy={version:1,runs:{2:{level:2,elapsed:4.2,spawnIn:.5,caught:2,missed:0,drops:[],basket:.5,target:.5,sequence:2,counts:{strawberry:1,biscuit:1,orange:0},status:'paused'}},results:{},completed:[1],sound:false,lastLevel:2,peeUnlocked:true};
  const old=await browser.newContext();await old.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key:LEGACY,seed:legacy});const oldPage=await old.newPage();await oldPage.clock.install();await oldPage.goto(BASE+'?view=play&level=2');assert.match(await oldPage.locator('.secret-hint').textContent(),/original rules/);await start(oldPage);await oldPage.clock.runFor(200);await oldPage.getByRole('button',{name:'Pause game'}).click();state=await stored(oldPage);assert.equal(state.runs[2].rules,'classic');assert.ok(state.runs[2].elapsed>4.2);assert.equal(state.peeUnlocked,true);assert.deepEqual(await oldPage.evaluate(key=>JSON.parse(localStorage.getItem(key)),LEGACY),legacy,'Original save remains untouched');await oldPage.reload();assert.equal((await stored(oldPage)).runs[2].elapsed,state.runs[2].elapsed);await old.close();
  console.log('PASS original save migration, earned Pee, and ongoing classic rounds remain intact');

  const blocked=await browser.newContext();await blocked.addInitScript(({key,seed})=>{localStorage.setItem(key,JSON.stringify(seed));Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};},{key:KEY,seed});const unsaved=await blocked.newPage();await unsaved.clock.install();await unsaved.goto(BASE+'?view=play&level=7');await start(unsaved);await unsaved.clock.runFor(100);assert.ok(await unsaved.locator('#save-warning').isVisible());assert.match(await unsaved.locator('.guest-saved').textContent(),/backup/);
  const recovery=unsaved.waitForEvent('download');await unsaved.getByRole('button',{name:'Download progress'}).click();await (await recovery).saveAs(`${OUTPUT}/adventure-recovery.json`);assert.ok(JSON.parse(fs.readFileSync(`${OUTPUT}/adventure-recovery.json`,'utf8')).peeUnlocked);await blocked.close();
  const corrupt=await browser.newContext();await corrupt.addInitScript(key=>localStorage.setItem(key,'{broken'),KEY);const corruptPage=await corrupt.newPage();await corruptPage.goto(BASE);assert.ok(await corruptPage.locator('#save-warning').isVisible());await corruptPage.getByRole('link',{name:'Let’s go, Pepsi'}).click();await corruptPage.getByRole('button',{name:'Let’s do this'}).click();assert.equal(await corruptPage.evaluate(key=>localStorage.getItem(key),KEY),'{broken');
  console.log('PASS failed saves are visible and recoverable; corrupt original data is not silently overwritten');
  assert.deepEqual(errors,[]);console.log('ALL PROGRESSION EDGE CASES PASSED');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
