const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {openStandups,assertNoOverflow}=require('./fixtures.cjs');
const M=require('../revenue-model.js');
const values={compliance:10000,chase:2000,bofa:3000,bofaMonthly:5000,bilt:null,nextcard:4000,chaseCount:2,bofaCount:3,biltCount:1,nextcardSubscriptions:4};
const seeded=date=>({snapshots:new Map([[date,{date,values:{...values},totalCents:24000,version:1,updatedAt:Date.now()}]]),targets:new Map([[date.slice(0,7),{targetCents:100000,version:1}]]),drafts:new Map()});
const launch=()=> (process.env.STANDUPS_BROWSER==='webkit'?webkit:chromium).launch();
const ready=page=>page.waitForFunction(()=>!document.querySelector('#standupRevenue').getAttribute('aria-busy')||document.querySelector('#standupRevenue').getAttribute('aria-busy')==='false');

test('money abbreviates thousands without losing cents, BOFA is counted once, and subscriptions appear in Slack',()=>{
 assert.equal(M.parse('27,000.50'),2700050);assert.equal(M.parse('0'),0);assert.equal(M.parse(''),null);assert.throws(()=>M.parse('not a number'));assert.throws(()=>M.parse('-5'));assert.throws(()=>M.parse('1.5',true));
 for(const [cents,formatted] of [[500000,'$5k'],[2220000,'$22.2k'],[125050,'$1.2505k'],[100001,'$1.00001k'],[99999,'$999.99'],[100000,'$1k'],[10410000,'$104.1k'],[0,'$0']]){assert.equal(M.money(cents),formatted);assert.equal(M.parse(formatted),cents);}
 assert.equal(M.parse('5K'),500000);assert.equal(M.parse('0.00001k'),1);assert.equal(M.parse('10000000k'),1000000000000);assert.throws(()=>M.parse('10000001k'));assert.throws(()=>M.parse('1.000001k'));assert.throws(()=>M.parse('5k',true));assert.equal(M.parse('1,000',true),1000);
 assert.equal(M.bofa(values),8000);assert.equal(M.acquisitions(values),10000);assert.equal(M.total(values),24000);
 const copy=M.slack('2026-11-11',values,100000);assert.match(copy,/BOFA: \$80/);assert.match(copy,/Monthly payment: \$50/);assert.match(copy,/4 subscriptions/);
});

test('direct editor links, compact input, exact totals, draft reload and shared publishing work on phone and desktop',async()=>{
 const browser=await launch();try{for(const width of [320,390,1440]){
  const store=seeded('2026-11-11');const f=await openStandups(browser,width,1000,{url:'http://localhost/?view=general&date=2026-11-11&revenue=edit',revenueStore:store});const {page,errors}=f;await ready(page);
  assert.equal(await page.locator('#rf-form').isVisible(),true);assert.equal(await page.locator('#rf-target').inputValue(),'1k');
  const layout=await page.locator('#rf-form').evaluate(form=>({width:form.getBoundingClientRect().width,fields:[...form.querySelectorAll('input')].map(input=>{const r=input.getBoundingClientRect(),label=input.labels[0].getBoundingClientRect();return {id:input.id,x:r.x,y:r.y,width:r.width,height:r.height,labelX:label.x,labelY:label.y};})}));
  assert.ok(layout.width<=641,'The form must stay compact on wide screens.');
  for(const field of layout.fields){assert.ok(field.height>=44);assert.ok(field.width>=96);assert.ok(Math.abs(field.x-field.labelX)<1,`${field.id} must align with its label`);assert.ok(field.y>field.labelY,`${field.id} needs its label immediately above`);}
  const field=id=>layout.fields.find(f=>f.id===id);
  for(const partner of ['bofa','bilt','nextcard']){assert.ok(Math.abs(field('rf-chase-count').x-field('rf-'+partner+'-count').x)<1);assert.ok(Math.abs(field('rf-chase').x-field('rf-'+partner).x)<1);assert.ok(Math.abs(field('rf-'+partner+'-count').y-field('rf-'+partner).y)<1);}
  await page.locator('#rf-chase-count').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('#rf-chase').evaluate(el=>el===document.activeElement),true);

  await page.locator('#rf-monthly').fill('1.2505k');await page.locator('#rf-bofa').focus();assert.equal(await page.locator('#rf-monthly').inputValue(),'1.2505k');
  assert.equal(await page.locator('#rf-bofa-draft-total').textContent(),'$1.2805k');assert.equal(await page.locator('#rf-draft-total').textContent(),'$1.4405k');
  await page.waitForFunction(()=>document.querySelector('#rf-status').textContent.startsWith('Draft saved'));
  assert.equal(store.drafts.get('2026-11-11').values.bofaMonthly,125050);
  await page.reload();await page.waitForFunction(()=>navigationReady);assert.equal(await page.locator('#rf-monthly').inputValue(),'1.2505k');
  await page.locator('#rf-save').click();await page.waitForFunction(()=>document.querySelector('#rf-status').textContent==='Update saved for the team.');
  assert.equal(store.snapshots.get('2026-11-11').totalCents,144050);assert.equal(store.drafts.size,0);assert.equal(await page.locator('#rf-bofa-total-out').textContent(),'$1.2805k');
  assert.match(await page.locator('#rf-nextcard-count-out').textContent(),/4 subscriptions/);
  const copied=page.url();const second=await openStandups(browser,width,1000,{url:copied,revenueStore:store});assert.equal(await second.page.locator('#rf-total').textContent(),'$1.4405k');
  await assertNoOverflow(page);await page.screenshot({path:`/tmp/standup-revenue-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(second.errors,[]);await second.page.close();await page.close();
 }}finally{await browser.close();}
});

test('Back, Forward, direct history dates and fresh copied editor links restore revenue views',async()=>{
 const browser=await launch();try{
  const store=seeded('2026-11-11');store.snapshots.set('2026-11-10',{date:'2026-11-10',values:{...values,compliance:5000},totalCents:19000,version:1,updatedAt:Date.now()});
  const f=await openStandups(browser,390,1000,{url:'http://localhost/?view=general&date=2026-11-11',revenueStore:store});const {page}=f;
  await page.locator('#rf-update').click();assert.equal(new URL(page.url()).searchParams.get('revenue'),'edit');const link=page.url();
  await page.goBack();await page.waitForFunction(()=>document.querySelector('#rf-form').hidden);await page.goForward();await page.waitForFunction(()=>!document.querySelector('#rf-form').hidden);
  const fresh=await openStandups(browser,390,1000,{url:link,revenueStore:store});assert.equal(await fresh.page.locator('#rf-form').isVisible(),true);await fresh.page.close();
  await page.locator('#rf-done').click();await page.locator('.rf-history summary').click();assert.equal(new URL(page.url()).searchParams.get('revenue'),'history');
  await page.locator('#rf-history-rows a').first().click();await page.waitForFunction(()=>document.querySelector('#standupDate').value==='2026-11-10'&&document.querySelector('#rf-total').textContent==='$190');
  await page.goBack();await page.waitForFunction(()=>document.querySelector('#standupDate').value==='2026-11-11'&&document.querySelector('#rf-total').textContent==='$240');
  assert.deepEqual(f.errors,[]);
 }finally{await browser.close();}
});

test('failed saves retain recovery data, block navigation and allow retry; conflicting snapshots keep a draft',async()=>{
 const browser=await launch();try{
  const store=seeded('2026-11-11');const f=await openStandups(browser,390,1000,{url:'http://localhost/?view=general&date=2026-11-11&revenue=edit',revenueStore:store});const {page,controls}=f;
  controls.failRevenueDraft=true;await page.locator('#rf-compliance').fill('999');await page.locator('.mobile-bottom-nav [data-mobile-nav=updates]').click();
  await page.waitForFunction(()=>document.querySelector('#personName').value==='General' && document.querySelector('#rf-status').textContent.includes('could not save'));
  assert.equal(await page.locator('#personName').inputValue(),'General');assert.equal(await page.locator('#rf-compliance').inputValue(),'999');assert.match(await page.locator('#rf-status').textContent(),/could not save/);
  controls.failRevenueDraft=false;await page.locator('#revenueRetry').click();await page.waitForFunction(()=>document.querySelector('#rf-status').textContent.startsWith('Draft saved'));
  controls.failRevenuePublish=true;await page.locator('#rf-save').click();await page.locator('#revenueReload').waitFor();assert.equal(await page.locator('#rf-compliance').inputValue(),'999');assert.equal(store.snapshots.get('2026-11-11').totalCents,24000);
  controls.failRevenuePublish=false;await page.locator('#revenueReload').click();await page.locator('#rf-save').click();await page.waitForFunction(()=>document.querySelector('#rf-status').textContent==='Update saved for the team.');
  assert.equal(store.snapshots.get('2026-11-11').values.compliance,99900);
  await page.getByRole('button',{name:'Next day',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#rf-asof').textContent.includes('no update'));
  assert.equal(await page.locator('#rf-total').textContent(),'$1.139k');assert.deepEqual(f.errors,[]);
 }finally{await browser.close();}
});
