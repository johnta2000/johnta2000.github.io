const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {openStandups,assertNoOverflow}=require('./fixtures.cjs');
const browserType=process.env.STANDUPS_BROWSER==='webkit'?webkit:chromium;
async function caret(page,text,end=true){
 await page.locator('#today').evaluate((e,{text,end})=>{e.focus();const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(n.textContent===text){const r=document.createRange();r.setStart(n,end?text.length:0);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);return}}throw Error('Missing '+text)},{text,end});
}
async function seed(page,html){await page.locator('#today').evaluate((e,html)=>{e.innerHTML=html;e.dispatchEvent(new Event('input',{bubbles:true}))},html)}
async function saved(page){await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.startsWith('Last saved'))}
async function toolbar(page,width){return page.locator('#documentToolbar')}

test('one click converts bullets, numbered lists and plain text into checklists without losing content',async()=>{
 const browser=await browserType.launch();try{
  for(const width of [320,390,1440]){
   const {page,errors}=await openStandups(browser,width);const bar=await toolbar(page,width);
   for(const html of ['<ul><li>Parent</li><li>Child</li></ul>','<ol><li>Parent</li><li>Child</li></ol>','<p>Parent</p>']){
    await seed(page,html);await caret(page,'Parent');await bar.getByRole('button',{name:'Checklist',exact:true}).click();
    assert.equal(await page.locator('#today ul.check-list').count(),1);assert.equal(await page.locator('#today li').first().textContent(),'Parent');
    await bar.getByRole('button',{name:'Checklist',exact:true}).click();
    assert.equal(await page.locator('#today ul.check-list').count(),0);assert.equal(await page.locator('#today ul').count(),1);
    await bar.getByRole('button',{name:'Checklist',exact:true}).click();
    await bar.getByRole('button',{name:'Bulleted list',exact:true}).click();
    assert.equal(await page.locator('#today ul.check-list').count(),0);assert.equal(await page.locator('#today ul').count(),1);
   }
   await assertNoOverflow(page);assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close()}
});

test('Tab nests tasks; Shift Tab restores them; checked state, siblings and formatting survive save/reload',async()=>{
 const browser=await browserType.launch();try{
  for(const width of [320,390,1440]){
   const {page,errors,mutations,entries}=await openStandups(browser,width);const bar=await toolbar(page,width);
   await seed(page,'<ul class="check-list" data-list="checklist"><li data-checked="true"><b>Parent</b></li><li data-checked="false">Child</li><li data-checked="false">Sibling</li></ul>');
   await caret(page,'Child');
   if(width<760)await bar.getByRole('button',{name:'Indent task',exact:true}).click();else await page.keyboard.press('Tab');
   assert.equal(await page.locator('#today ul ul.check-list > li').textContent(),'Child');
   await page.keyboard.type(' edited');await saved(page);
   const html=mutations.filter(m=>m.endpoint==='standups:save').at(-1).args.today;
   assert.match(html,/<b>Parent<\/b><ul class="check-list"/);
   await page.reload();await page.locator('#today li > ul.check-list').waitFor();
   assert.equal(await page.locator('#today > ul > li').count(),2);
   assert.equal(await page.locator('#today > ul > li').first().getAttribute('data-checked'),'true');
   assert.equal(await page.locator('#today li > ul > li').getAttribute('data-checked'),'false');
   const child=page.locator('#today li > ul > li');const box=await child.boundingBox();
   const parentBox=await page.locator('#today > ul > li').first().boundingBox();
   assert.ok(box.x-parentBox.x>=28,'Subtask must be visibly indented');
   await page.mouse.click(box.x+10,box.y+10);
   assert.equal(await child.getAttribute('data-checked'),'true');
   await caret(page,'Child edited');await page.keyboard.press('Enter');await page.keyboard.type('Second child');
   assert.equal(await page.locator('#today li > ul > li').last().getAttribute('data-checked'),'false');
   await page.keyboard.press('Shift+Tab');
   assert.equal(await page.locator('#today > ul > li').count(),3);
   assert.equal(await page.locator('#today > ul > li').nth(1).textContent(),'Second child');
   await saved(page);await page.reload();await page.locator('#today li > ul.check-list').waitFor();
   assert.equal(await page.locator('#today li > ul > li').textContent(),'Child edited');
   const copiedUrl=page.url();
   await page.evaluate(()=>selectMeetingPerson('John'));
   await page.goBack();await page.locator('#today li > ul.check-list').waitFor();
   await page.goForward();await page.waitForFunction(()=>document.querySelector('#todayTitle').textContent==="John's updates");
   const fresh=await openStandups(browser,width,844,{url:copiedUrl,entriesStore:entries});
   await fresh.page.locator('#today li > ul.check-list').waitFor();
   assert.equal(await fresh.page.locator('#today li > ul > li').textContent(),'Child edited');
   assert.deepEqual(fresh.errors,[]);await fresh.page.close();
   await assertNoOverflow(page);assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close()}
});

test('ordinary bullets support indent/outdent and undo without becoming checkboxes',async()=>{
 const browser=await browserType.launch();try{
  const {page}=await openStandups(browser,1440);await caret(page,'Review campaign strategy');await page.keyboard.press('Tab');
  assert.equal(await page.locator('#today ul ul > li').count(),1);
  assert.equal(await page.locator('#today .check-list').count(),0);
  await page.keyboard.press('ControlOrMeta+z');assert.equal(await page.locator('#today > ul > li').count(),2);
  await caret(page,'Review campaign strategy');await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#today > ul > li').count(),2);
  await caret(page,'Schedule posts for the week');await page.keyboard.press('Tab');
  assert.equal(await page.locator('#today ul ul').count(),0);
 }finally{await browser.close()}
});


test('checked subtasks retain their state through deeper nesting and moving back out',async()=>{
 const browser=await browserType.launch();try{
  const {page}=await openStandups(browser,1440);
  await seed(page,'<ul class="check-list"><li data-checked="false">Parent<ul class="check-list"><li data-checked="false">Child</li><li data-checked="true">Grandchild</li></ul></li><li data-checked="false">Sibling</li></ul>');
  await caret(page,'Grandchild');await page.keyboard.press('Tab');await saved(page);await page.reload();
  const grandchild=page.locator('#today li > ul li > ul li');
  await grandchild.waitFor();assert.equal(await grandchild.getAttribute('data-checked'),'true');
  await caret(page,'Grandchild');await page.keyboard.press('Shift+Tab');await saved(page);await page.reload();
  await page.locator('#today li > ul > li').nth(1).waitFor();
  assert.equal(await page.locator('#today li > ul > li').nth(1).getAttribute('data-checked'),'true');
  assert.equal(await page.locator('#today li > ul > li').first().getAttribute('data-checked'),'false');
 }finally{await browser.close()}
});
