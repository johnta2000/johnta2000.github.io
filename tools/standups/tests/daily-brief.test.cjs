const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { openStandups, assertNoOverflow } = require('./fixtures.cjs');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;
const suffix = process.env.STANDUPS_BROWSER || 'chromium';
const nav = (page, tab) => page.locator(`.mobile-bottom-nav [data-mobile-nav="${tab}"]`);
async function seed(f) {
  const date = await f.page.locator('#standupDate').inputValue();
  for (const name of ['John','Vivek','Vishal','Jenny']) {
    f.entries.set(`${name}:${date}`, {personName:name,standupDate:date,updatedAt:Date.now(),yesterday:'<ul><li>Reviewed the launch plan</li></ul>',today:`<ul><li>${name}: finish the reward program docs</li><li>Review linked content</li></ul>`,blockers:'',notes:'Testing the review workflow this week.'});
    f.comments.push({_id:name,personName:name,personKey:name.toLowerCase(),standupDate:date,fieldName:'today',itemKey:'test',itemText:'reward program docs',comment:`${name} discussion`,createdAt:Date.now()});
  }
  f.dayNotes.set(date,{notes:'<p>Align on docs and workflow testing before the next release.</p>',updatedAt:Date.now()});
  await f.page.evaluate(async()=>{await refreshDailyList();await loadDailyNotes();await loadCommentsForDate();});
  return date;
}

test('Daily Brief opens on General and keeps full updates, copy controls and searchable people usable at phone widths',async()=>{
  const b=await browserType.launch();
  try { for(const width of [320,390,430]) {
    const f=await openStandups(b,width,844,{initialPerson:'General'});const {page,errors}=f;await seed(f);
    assert.equal(await page.locator('#generalTitle').innerText(),'The daily brief');
    assert.equal(await page.locator('#generalUpdatesList button').count(),4);
    assert.equal(await page.locator('#dailyNotes').isVisible(),true);
    assert.equal(await page.locator('.comments-card').isVisible(),false);
    await assertNoOverflow(page);
    await page.screenshot({path:`/tmp/daily-brief-general-${width}-${suffix}.png`,fullPage:true});
    await page.getByRole('button',{name:"Open Vivek's update",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#today').textContent.includes('Vivek:'));
    assert.equal(await page.locator('#documentToolbar').isVisible(),false);
    for(const id of ['yesterday','today','blockers','notes']) {
      assert.equal(await page.locator(`#${id}`).isVisible(),true);
      assert.equal(await page.locator(`[data-copy-editor][aria-controls="${id}"]`).isEnabled(),true);
      assert.equal(await page.locator(`#${id}`).evaluate(el=>getComputedStyle(el).fontSize),'16px');
    }
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable:true, value: {
      write: async items => { window.copiedSection = await (await items[0].getType('text/plain')).text(); },
      writeText: async text => { window.copiedSection = text; }
    }}));
    await page.locator('[data-copy-editor][aria-controls="today"]').click();
    await page.waitForFunction(() => typeof window.copiedSection === 'string');
    assert.match(await page.evaluate(() => window.copiedSection), /Vivek: finish/);
    assert.doesNotMatch(await page.evaluate(() => window.copiedSection), /Reviewed the launch/);
    await page.locator('#personName-trigger').click();
    const search=page.getByRole('combobox',{name:'Search team member'});
    await search.fill('nobody');await page.getByText('No matches. Try another search.',{exact:true}).waitFor();
    await search.fill('Jenny');await page.getByRole('option',{name:'Jenny',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#today').textContent.includes('Jenny:'));
    await page.locator('#notes').fill('Full note: '+ 'Long context and https://example.com/'.repeat(30));
    await assertNoOverflow(page);
    assert.deepEqual(errors,[]);await page.close();
  }} finally {await b.close();}
});

test('person comments stay isolated; General shows everyone and supports general commentary',async()=>{
  const b=await browserType.launch();try {
    const f=await openStandups(b,390,844,{initialPerson:'General'});const {page,comments,errors}=f;await seed(f);
    await page.getByRole('button',{name:"Open Vivek's update",exact:true}).click();
    await page.locator('[data-mobile-person-tab=comments]').click();
    assert.equal(await page.locator('#commentsCount').innerText(),'1');
    assert.match(await page.locator('#commentsOverview').innerText(),/Vivek discussion/);
    assert.doesNotMatch(await page.locator('#commentsOverview').innerText(),/John discussion/);
    await page.locator('#commentsOverview button').first().click();
    await page.locator('.comment-thread-panel:visible textarea').fill('Keep this draft');
    await page.locator('#mobileCommentBackdrop').click({position:{x:5,y:5}});
    assert.equal(await page.locator('.comment-thread-panel:visible').count(),0);
    await page.locator('#commentsOverview button').first().click();
    assert.equal(await page.locator('.comment-thread-panel:visible textarea').inputValue(),'Keep this draft');
    await page.locator('.comment-thread-panel:visible textarea').click();
    assert.equal(await page.locator('.comment-thread-panel:visible').count(),1);
    await page.keyboard.press('Escape');
    await nav(page,'discussions').click();
    await page.waitForFunction(()=>document.querySelector('#generalPanel').getAttribute('aria-busy')==='false' && document.querySelector('#commentsOverview').textContent.includes('John discussion'));
    assert.match(await page.locator('#commentsOverview').innerText(),/John discussion/);
    await page.locator('#addGeneralComment').click();
    await page.locator('.comment-thread-panel:visible textarea').fill('A shared team question');
    await page.locator('.comment-thread-panel:visible').getByRole('button',{name:'Comment',exact:true}).click();
    await page.locator('.comment-thread-panel:visible').getByText('Comment added',{exact:true}).waitFor();
    assert.equal(comments.at(-1).personName,'General');
    await page.keyboard.press('Escape');
    await nav(page,'updates').click();
    await page.locator('[data-mobile-person-tab=comments]').click();
    assert.doesNotMatch(await page.locator('#commentsOverview').innerText(),/A shared team question|John discussion/);
    assert.deepEqual(errors,[]);
  } finally {await b.close();}
});

test('mobile notes and updates autosave to their original context and failed saves prevent navigation',async()=>{
 const b=await browserType.launch();try {
  const f=await openStandups(b,390,844,{initialPerson:'General'});const {page,controls,entries,dayNotes,errors}=f;const date=await seed(f);
  await page.locator('#dailyNotes').fill('Shared mobile context');
  await page.getByRole('button',{name:"Open John's update",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#today').textContent.includes('John:') && document.querySelector('#today').isContentEditable);
  assert.match(dayNotes.get(date).notes,/Shared mobile context/);
  controls.failSave=true;
  await page.locator('#today').fill('Preserve this mobile draft');
  await nav(page,'general').click();
  await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();
  assert.equal(await page.locator('#personName').inputValue(),'John');
  assert.match(await page.locator('#today').innerText(),/Preserve this mobile draft/);
  controls.failSave=false;
  await nav(page,'general').click();
  await page.waitForFunction(()=>document.querySelector('#personName').value==='General' && document.querySelector('#generalPanel').getAttribute('aria-busy')==='false');
  assert.match(entries.get(`John:${date}`).today,/Preserve this mobile draft/);
  assert.match(await page.locator('#generalUpdatesList').innerText(),/Preserve this mobile draft/);
  await page.getByRole('button',{name:'Previous day',exact:true}).click();
  await page.waitForFunction(date=>document.querySelector('#standupDate').value!==date && document.querySelector('#generalPanel').getAttribute('aria-busy')==='false',date);
  assert.equal(await page.locator('#dailyNotes').innerText(),'');
  await assertNoOverflow(page);assert.deepEqual(errors,[]);
 } finally {await b.close();}
});

test('General and comments move cleanly between phone and desktop without duplicating editors',async()=>{
 const b=await browserType.launch();try {
  const f=await openStandups(b,390,844,{initialPerson:'General'});const {page,errors}=f;await seed(f);
  for(const width of [1440,320,768,390]){
    await page.setViewportSize({width,height:900});
    await assertNoOverflow(page);
    assert.equal(await page.locator('#dailyNotes').count(),1);
    assert.equal(await page.locator('#commentsOverview').count(),1);
    assert.equal(await page.locator('#dailyNotes').isVisible(),true);
    if(width>760) assert.equal(await page.locator('.mobile-bottom-nav').isVisible(),false);
  }
  assert.deepEqual(errors,[]);
 } finally {await b.close();}
});
