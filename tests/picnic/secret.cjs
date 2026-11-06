const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const BASE = process.env.PICNIC_BASE_URL || 'http://127.0.0.1:8786/games/picnic/';
const KEY = 'pepsi-pepper-picnic-v1';
const FLAG = 'pepsi-pepper-picnic-pee';
const OUTPUT = 'outputs/picnic-qa';

(async () => {
  const { blankSave, createRun } = await import('../../games/picnic/engine.mjs');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const seed = blankSave();seed.completed = [1];seed.runs[2] = createRun(2);
    Object.assign(seed.runs[2], {status:'paused', elapsed:8, spawnIn:10, sequence:5, caught:10, goldenSpawned:true, counts:{strawberry:0,biscuit:10,orange:0}, drops:[{id:5,type:'golden',x:.5,y:.769,rotation:0}]});
    const context = await browser.newContext({reducedMotion:'reduce'});
    await context.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key:KEY,seed});
    const page = await context.newPage();await page.clock.install();await page.goto(BASE+'?view=play&level=2');
    await page.getByRole('button',{name:'Back to the picnic'}).click();await page.clock.runFor(100);
    assert.match(page.url(),/view=guest/);
    let state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
    assert.equal(state.peeUnlocked,true);assert.equal(state.results[2].won,true);assert.equal(state.runs[2].caught,11);
    await page.getByRole('button',{name:'Back to our picnic'}).click();assert.match(page.url(),/view=result&level=2/);
    console.log('PASS golden catch on winning frame preserves both the result and the reveal');

    await page.goto(BASE+'?view=help');
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Back up progress'}).click();
    const download=await downloadPromise;await download.saveAs(`${OUTPUT}/pee-backup.json`);
    const backup=JSON.parse(fs.readFileSync(`${OUTPUT}/pee-backup.json`,'utf8'));assert.equal(backup.peeUnlocked,true);
    const restored=await browser.newContext();const restoredPage=await restored.newPage();await restoredPage.goto(BASE+'?view=help');
    await restoredPage.locator('#restore').setInputFiles({name:'picnic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await restoredPage.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.peeUnlocked===true,KEY);
    assert.equal(await restoredPage.evaluate(flag=>localStorage.getItem(flag),FLAG),'unlocked');
    // An old backup cannot remove Pee or completed levels from the newer save.
    await restoredPage.locator('#restore').setInputFiles({name:'old-picnic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(blankSave()))});
    await restoredPage.goto(BASE+'?view=picnic');
    assert.ok(await restoredPage.getByRole('link',{name:'Meet Pee, your secret picnic guest'}).isVisible());
    await restoredPage.close();
    // A legacy tab writes the old format while the new app is not running.
    const legacyWriter=await restored.newPage();await legacyWriter.goto(BASE+'icon.svg');
    const legacy=blankSave();delete legacy.peeUnlocked;legacy.completed=[1];legacy.runs[2]=createRun(2);
    delete legacy.runs[2].goldenSpawned;delete legacy.runs[2].peeFound;legacy.runs[2].elapsed=4.2;
    await legacyWriter.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:KEY,value:legacy});
    await legacyWriter.goto(BASE+'?view=guest&level=2');
    assert.ok(await legacyWriter.getByRole('heading',{name:'You found Pee!'}).isVisible());
    await legacyWriter.goto(BASE+'?view=play&level=2');
    state=await legacyWriter.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
    assert.equal(state.runs[2].elapsed,4.2);assert.deepEqual(state.completed,[1]);
    console.log('PASS backup export/import, old backup merge, legacy tab protection, and old round migration');

    const missedSeed=structuredClone(seed);Object.assign(missedSeed.runs[2],{caught:0,counts:{strawberry:0,biscuit:0,orange:0},basket:.15,target:.15});
    const missed=await browser.newContext({reducedMotion:'reduce'});
    await missed.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key:KEY,seed:missedSeed});
    const miss=await missed.newPage();await miss.clock.install();await miss.goto(BASE+'?view=play&level=2');
    await miss.getByRole('button',{name:'Back to the picnic'}).click();await miss.clock.runFor(1000);
    assert.match(miss.url(),/view=play/);assert.equal(await miss.evaluate(key=>JSON.parse(localStorage.getItem(key)).peeUnlocked,KEY),false);
    await miss.goto(BASE+'?view=guest&level=2');assert.ok(await miss.getByRole('heading',{name:'A secret picnic guest.'}).isVisible());
    assert.equal(await miss.locator('#pee-portrait').count(),0);
    await miss.reload();assert.ok(await miss.getByRole('heading',{name:'A secret picnic guest.'}).isVisible());
    console.log('PASS missing the golden biscuit and copied secret URLs do not grant the unlock');

    const blocked=await browser.newContext({reducedMotion:'reduce'});
    await blocked.addInitScript(({key,seed})=>{localStorage.setItem(key,JSON.stringify(seed));Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};},{key:KEY,seed});
    const unsaved=await blocked.newPage();await unsaved.clock.install();await unsaved.goto(BASE+'?view=play&level=2');
    await unsaved.getByRole('button',{name:'Back to the picnic'}).click();await unsaved.clock.runFor(100);
    assert.ok(await unsaved.locator('#save-warning').isVisible());
    assert.match(await unsaved.locator('.guest-saved').textContent(),/backup/);
    const recoveryPromise=unsaved.waitForEvent('download');await unsaved.getByRole('button',{name:'Download progress'}).click();
    const recovery=await recoveryPromise;await recovery.saveAs(`${OUTPUT}/pee-recovery.json`);
    assert.equal(JSON.parse(fs.readFileSync(`${OUTPUT}/pee-recovery.json`,'utf8')).peeUnlocked,true);
    console.log('PASS failed unlock save is visible and recoverable in a backup');
    console.log('ALL PEE EDGE CASES PASSED');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
