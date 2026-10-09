const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const {chromium,webkit}=require('playwright');
const token='a'.repeat(43),root=path.join(__dirname,'..');
function fixture(){return {title:'Bilt · September 2026',period:'Aug 18 – Sep 17, 2026',dueDate:'2026-10-12',balanceCents:14321,view:{filter:'all',search:''},viewVersion:0,rows:[{_id:'1',date:'2026-09-01',description:'EXAMPLE GROCER 123 MARKET STREET',amountCents:14321,kind:'purchase',page:2,version:0,note:''},{_id:'2',date:'2026-09-02',description:'EXAMPLE RENT',amountCents:100000,kind:'purchase',page:3,version:0,note:''},{_id:'3',date:'2026-09-02',description:'EXAMPLE RENT ADJUSTMENT',amountCents:-100000,kind:'credit',page:2,version:0,note:''}]};}
async function setup(browser,width=1280,height=900,sharedData){const page=await browser.newPage({viewport:{width,height},isMobile:width<600,hasTouch:width<600});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const db=sharedData||fixture();db.fail=false;db.conflict=false;db.pdfRequests=0;db.delay=null;db.requests=[];
await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.hostname==='localhost'){const file=url.pathname.endsWith('/')?'index.html':path.basename(url.pathname);if(file.endsWith('.svg'))return route.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg"/>',contentType:'image/svg+xml'});return route.fulfill({body:await fs.readFile((url.pathname.includes('/vendor/')?path.join(root,url.pathname.slice(url.pathname.indexOf('/vendor/')+1)):path.join(root,file))),contentType:(file.endsWith('.js')||file.endsWith('.mjs'))?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}
if(url.hostname.endsWith('.convex.site')){db.pdfRequests++;assert.equal(req.headers()['x-statement-token'],token);assert.equal(url.search,'');return route.fulfill({body:await fs.readFile(path.join(root,'tests/fixtures/statement.pdf')),contentType:'application/pdf'});}
if(url.hostname.endsWith('.convex.cloud')){const {path:endpoint,args}=req.postDataJSON();assert.equal(args.token,token);if(db.revoked)return route.fulfill({json:{status:'error',errorMessage:'This statement link is unavailable.'}});if(endpoint.endsWith(':saveView')){db.viewRequests=(db.viewRequests||[]).concat([args]);if(db.failView)return route.abort('failed');if(db.viewVersion!==args.expectedVersion)return route.fulfill({json:{status:'error',errorMessage:'The shared view changed on another device. Reload before saving your view.'}});db.view={...args.view,search:args.view.search.trim()};db.viewVersion++;return route.fulfill({json:{status:'success',value:{view:db.view,viewVersion:db.viewVersion}}});}if(endpoint.endsWith(':review'))return route.fulfill({json:{status:'success',value:db}});db.requests.push(args);if(db.beforeSave)await db.beforeSave(args);if(db.delay)await db.delay;if(db.fail)return route.abort('failed');const row=db.rows.find(r=>r._id===args.id);if(db.conflict||row.version!==args.expectedVersion)return route.fulfill({json:{status:'error',errorMessage:'This charge changed on another device. Refresh and review it before saving again.'}});Object.assign(row,{allocation:args.allocation,note:args.note,version:row.version+1});return route.fulfill({json:{status:'success',value:{version:row.version}}});}return route.abort();});
await page.goto('http://localhost/tools/payments/statements/#'+token);await page.locator('.row').first().waitFor();return {page,db,errors};}
for(const browserType of [chromium,webkit])test(`${browserType.name()}: labels, exact splits, PDF, CSV, filter and phone layout`,async()=>{const browser=await browserType.launch();try{for(const width of [1280,390]){const {page,db,errors}=await setup(browser,width);assert.equal(await page.locator('#unassigned-total').textContent(),'$143.21');await page.locator('[data-id="1"] [data-label="parents"]').click();await page.waitForFunction(()=>document.getElementById('parents-total').textContent==='$143.21');await page.getByRole('button',{name:'Unassigned',exact:true}).click();assert.equal(await page.locator('.row').count(),2);await page.getByRole('button',{name:'All items',exact:true}).click();await page.locator('[data-id="1"] summary').click();await page.locator('[data-id="1"]').getByRole('button',{name:'Split / note'}).click();await page.locator('#split-parents').fill('100.00');await page.locator('#split-john').fill('43.20');await page.locator('#edit-save').click();assert.match(await page.locator('#edit-error').textContent(),/add up/);await page.locator('#split-john').fill('43.21');await page.locator('#edit-note').fill('Shared groceries');await page.locator('#edit-save').click();await page.locator('#edit-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#parents-total').textContent(),'$100.00');assert.equal(await page.locator('#john-total').textContent(),'$43.21');await page.locator('[data-id="3"] [data-label="john"]').click();await page.waitForFunction(()=>document.getElementById('john-total').textContent==='-$956.79');await page.locator('#show-pdf').click();await page.locator('#pdf-open').waitFor();assert.equal(db.pdfRequests,1);await page.waitForFunction(()=>document.getElementById('pdf-canvas').width>0);assert.ok((await page.locator('#pdf-open').getAttribute('href')).startsWith('blob:'));await page.getByRole('button',{name:'Next PDF page'}).click();await page.waitForFunction(()=>document.getElementById('pdf-counter').textContent.startsWith('2 / 3'));await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForFunction(()=>document.getElementById('pdf-counter').textContent.includes('150%'));await page.getByRole('button',{name:'Zoom out',exact:true}).click();await page.waitForFunction(()=>{const c=document.getElementById('pdf-canvas');if(!c.width)return false;const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<100&&pixels[i+3]>0)return true;return false;},{},{timeout:10000});await page.screenshot({path:`/private/tmp/statement-${browserType.name()}-${width}-pdf.png`,fullPage:true});await page.locator('#close-pdf').click();await page.screenshot({path:`/private/tmp/statement-${browserType.name()}-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.reconciliation summary').click();const download=page.waitForEvent('download');await page.locator('#export').click();assert.equal((await download).suggestedFilename(),'statement-split.csv');assert.deepEqual(errors,[]);await page.close();}}finally{await browser.close();}});
test('failed and conflicting saves preserve confirmed totals, block duplicate writes, and show actionable error',async()=>{const browser=await chromium.launch();try{const {page,db}=await setup(browser);db.fail=true;await page.locator('[data-id="1"] [data-label="parents"]').click();await page.waitForFunction(()=>document.getElementById('save-status').classList.contains('error'));assert.equal(await page.locator('#parents-total').textContent(),'$0.00');db.fail=false;db.conflict=true;await page.locator('[data-id="1"] [data-label="john"]').click();await page.waitForFunction(()=>document.getElementById('save-status').textContent.includes('changed on another'));assert.equal(await page.locator('#john-total').textContent(),'$0.00');db.conflict=false;let finish;db.delay=new Promise(r=>finish=r);await page.locator('[data-id="1"] [data-label="john"]').click();assert.equal(await page.locator('[data-id="1"] [data-label="parents"]').isDisabled(),false);assert.equal(await page.locator('#john-total').textContent(),'$143.21');finish();await page.waitForFunction(()=>document.getElementById('save-status').textContent==='All changes saved');db.revoked=true;await page.reload();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('unavailable'));assert.equal(await page.locator('#review').isVisible(),false);}finally{await browser.close();}});
test('owner library signs in separately and can disable a shared link',async()=>{const browser=await chromium.launch();try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let revoked=false;await page.addInitScript(()=>{const session={id:'owner',getToken:async()=> 'mock-owner-token'};window.Clerk={session,load:async()=>{},addListener(fn){fn({session:this.session});},unmountSignIn(){},mountSignIn(node){node.textContent='Sign in';}};});await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname==='localhost'){const file=url.pathname.endsWith('/')?'index.html':path.basename(url.pathname);if(file.endsWith('.svg'))return route.abort();return route.fulfill({body:await fs.readFile((url.pathname.includes('/vendor/')?path.join(root,url.pathname.slice(url.pathname.indexOf('/vendor/')+1)):path.join(root,file))),contentType:(file.endsWith('.js')||file.endsWith('.mjs'))?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}if(url.hostname.startsWith('clerk.'))return route.fulfill({body:'',contentType:'text/javascript'});if(url.hostname.endsWith('.convex.cloud')){assert.equal(route.request().headers().authorization,'Bearer mock-owner-token');const body=route.request().postDataJSON();if(body.path.endsWith(':revoke'))revoked=true;return route.fulfill({json:{status:'success',value:body.path.endsWith(':list')?[{_id:'s1',title:'Sample statement',period:'Example period',token,enabled:!revoked}]:null}});}return route.abort();});await page.goto('http://localhost/');await page.getByRole('link',{name:'Open review'}).waitFor();page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Disable link'}).click();await page.getByText('Link disabled').waitFor();assert.equal(revoked,true);assert.deepEqual(errors,[]);}finally{await browser.close();}});

for(const browserType of [chromium,webkit])test(`${browserType.name()}: mobile details, touch targets, sticky progress and full-screen PDF`,async()=>{
 const browser=await browserType.launch();try{for(const width of [320,390,430]){const height=width===320?667:844;const {page,errors}=await setup(browser,width,height);
 assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex,nofollow,noarchive');
 assert.equal(await page.locator('[data-id="1"] .merchant').textContent(),'EXAMPLE GROCER');
 assert.equal(await page.locator('[data-id="1"] .full-description').isVisible(),false);
 const buttons=await page.locator('[data-id="1"] .label-button').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
 assert.ok(buttons.every(b=>b.height>=48));assert.ok(Math.max(...buttons.map(b=>b.width))-Math.min(...buttons.map(b=>b.width))<1);
 await page.locator('[data-id="1"] summary').click();assert.equal(await page.locator('[data-id="1"] .full-description').textContent(),'EXAMPLE GROCER 123 MARKET STREET');
 await page.locator('[data-id="1"] [data-label="parents"]').click();await page.waitForFunction(()=>document.getElementById('parents-total').textContent==='$143.21');
 assert.equal(await page.locator('[data-id="1"] details').getAttribute('open'),'');
 await page.locator('[data-id="1"] .source').click();await page.locator('#pdf-controls').waitFor();
 assert.equal(await page.locator('#pdf-dialog').evaluate(n=>n.open),true);
 const box=await page.locator('#pdf-dialog').boundingBox();assert.ok(box.x===0&&box.y===0&&Math.abs(box.width-width)<1&&Math.abs(box.height-height)<1);
 await page.getByRole('button',{name:'Next PDF page'}).click();await page.waitForFunction(()=>document.getElementById('pdf-counter').textContent.startsWith('3 / 3'));
 await page.screenshot({path:`/private/tmp/statement-mobile-${browserType.name()}-${width}-viewer.png`});await page.getByRole('button',{name:'Back to charges',exact:true}).click();assert.equal(await page.locator('#pdf-dialog').evaluate(n=>n.open),false);
 assert.equal(await page.locator('#parents-total').textContent(),'$143.21');
 await page.locator('#show-pdf').click();await page.locator('#pdf-controls').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('#pdf-dialog').evaluate(n=>n.open),false);
 await page.locator('footer').scrollIntoViewIfNeeded();const bar=await page.locator('.review-progress').boundingBox();assert.ok(bar.y>=-1&&bar.y<3);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();}
 }finally{await browser.close();}
});

for(const browserType of [chromium,webkit])test(`${browserType.name()}: slow saves are instant, keep DOM stable and serialize latest intent per charge`,async()=>{
 const browser=await browserType.launch();try{const {page,db,errors}=await setup(browser,390);let release;const gate=new Promise(r=>release=r);db.beforeSave=args=>args.id==='1'&&args.expectedVersion===0?gate:Promise.resolve();
 await page.locator('[data-id="1"] summary').click();
 await page.evaluate(()=>{window.originalCard=document.querySelector('[data-id="1"]');window.originalButton=window.originalCard.querySelector('[data-label="parents"]');});
 await page.locator('[data-id="1"] [data-label="parents"]').click();
 assert.equal(await page.locator('#parents-total').textContent(),'$143.21');assert.match(await page.locator('#save-status').textContent(),/Saving/);
 assert.equal(db.rows[0].allocation,undefined);
 assert.ok(await page.evaluate(()=>window.originalCard===document.querySelector('[data-id="1"]')&&window.originalButton===document.querySelector('[data-id="1"] [data-label="parents"]')));
 await page.locator('[data-id="1"] [data-label="john"]').click();
 await page.locator('[data-id="1"] [data-label="other"]').click();
 await page.locator('[data-id="1"] .clear-row').click();
 assert.equal(await page.locator('#unassigned-total').textContent(),'$143.21');
 await page.locator('[data-id="2"] [data-label="parents"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-id="2"] .edit-row').disabled===false);
 assert.equal(db.rows[1].allocation.parents,100000);assert.equal(db.requests.filter(r=>r.id==='1').length,1);
 release();await page.waitForFunction(()=>document.getElementById('save-status').textContent==='All changes saved');
 assert.equal(db.rows[0].allocation,null);assert.deepEqual(db.requests.filter(r=>r.id==='1').map(r=>r.expectedVersion),[0,1]);
 assert.ok(await page.evaluate(()=>window.originalCard===document.querySelector('[data-id="1"]')));assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('a later failed queued save restores the last acknowledged label and keeps a warning',async()=>{
 const browser=await chromium.launch();try{const {page,db}=await setup(browser);let release;const gate=new Promise(r=>release=r);db.beforeSave=async args=>{if(args.expectedVersion===0)await gate;else db.fail=true;};
 await page.locator('[data-id="1"] [data-label="parents"]').click();await page.locator('[data-id="1"] [data-label="john"]').click();
 assert.equal(await page.locator('#john-total').textContent(),'$143.21');release();
 await page.waitForFunction(()=>document.getElementById('save-status').classList.contains('error')&&!document.getElementById('save-status').textContent.includes('Saving'));
 assert.equal(await page.locator('#parents-total').textContent(),'$143.21');assert.equal(await page.locator('#john-total').textContent(),'$0.00');assert.equal(db.rows[0].version,1);
 assert.match(await page.locator('#save-status').textContent(),/Could not confirm/);
 }finally{await browser.close();}
});

for(const browserType of [chromium,webkit])test(`${browserType.name()}: Jevin, legacy splits, mobile editor, filters and CSV stay consistent`,async()=>{
 const browser=await browserType.launch();try{for(const width of [320,390,430,768,1280]){
  const {page,db,errors}=await setup(browser,width,844);
  db.rows[0].allocation={parents:14321,john:0,other:0};
  await page.reload();await page.locator('.row').first().waitFor();
  assert.equal(await page.locator('#parents-total').textContent(),'$143.21');
  assert.equal(await page.locator('#jevin-total').textContent(),'$0.00');
  assert.equal(await page.locator('[data-id="1"] [data-label="parents"]').getAttribute('aria-pressed'),'true');
  const buttons=await page.locator('[data-id="1"] .label-button').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,y:n.getBoundingClientRect().y})));
  assert.deepEqual(buttons.map(b=>b.text),['Parents','John','Jevin','Other']);
  assert.ok(buttons.every(b=>b.height>=46&&b.width>=44));
  if(width<=430){assert.equal(buttons[0].y,buttons[1].y);assert.equal(buttons[2].y,buttons[3].y);assert.ok(buttons[2].y>buttons[0].y);}
  const filters=await page.locator('.filters button').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,right:n.getBoundingClientRect().right,height:n.getBoundingClientRect().height})));
  assert.equal(filters.length,6);assert.ok(filters.every(b=>b.x>=0&&b.right<=width&&b.height>=44));
  await page.locator('[data-id="1"] summary').click();await page.locator('[data-id="1"] .edit-row').click();
  assert.equal(await page.locator('#split-jevin').inputValue(),'0.00');
  assert.ok(await page.locator('#edit-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth));
  await page.locator('#split-parents').fill('100.00');await page.locator('#split-jevin').fill('43.21');await page.locator('#edit-note').fill('=confirm shared groceries');
  await page.screenshot({path:`/private/tmp/statement-jevin-${browserType.name()}-${width}-editor.png`});
  await page.locator('#edit-save').click();await page.locator('#edit-dialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('#jevin-total').textContent(),'$43.21');
  assert.equal(await page.locator('#john-total').textContent(),'$0.00');
  await page.locator('[data-filter="jevin"]').click();assert.equal(await page.locator('.row').count(),1);
  assert.match(await page.locator('[data-id="1"] .split-text').textContent(),/Jevin \$43.21/);
  await page.locator('[data-id="1"] [data-label="jevin"]').click();await page.waitForFunction(()=>document.getElementById('save-status').textContent==='All changes saved');
  assert.equal(db.rows[0].allocation.jevin,14321);assert.equal(db.rows[0].allocation.parents,0);
  await page.locator('[data-filter="all"]').click();
  await page.locator('[data-id="3"] [data-label="jevin"]').click();await page.waitForFunction(()=>document.getElementById('save-status').textContent==='All changes saved');
  assert.equal(await page.locator('#jevin-total').textContent(),'-$856.79');
  await page.locator('.reconciliation summary').click();const downloading=page.waitForEvent('download');await page.locator('#export').click();
  const csv=await fs.readFile(await (await downloading).path(),'utf8');
  assert.ok(csv.includes('"Parents","John","Jevin","Other","Unassigned","Note"'));
  assert.ok(csv.includes('"0.00","0.00","143.21","0.00","","\'=confirm shared groceries"'));
  for(const line of csv.trim().split('\r\n'))assert.equal(line.split(',').length,11);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.locator('.reconciliation summary').click();await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:`/private/tmp/statement-jevin-${browserType.name()}-${width}.png`});await page.close();
 }}finally{await browser.close();}
});

for(const browserType of [chromium,webkit])test(`${browserType.name()}: unassigned opens automatically, clears only confirmed rows, and shows all when finished`,async()=>{
 const browser=await browserType.launch();try{for(const width of [320,390,1280]){
  const {page,db,errors}=await setup(browser,width,844);delete db.view;
  db.rows[0].allocation={parents:14321,john:0,other:0};await page.reload();await page.locator('.row').first().waitFor();
  assert.equal(await page.locator('[data-filter="unassigned"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.row').count(),2);
  let release;db.delay=new Promise(r=>release=r);
  await page.locator('[data-id="2"] [data-label="parents"]').click();
  assert.equal(await page.locator('[data-id="2"]').count(),1);assert.match(await page.locator('#save-status').textContent(),/Saving/);
  release();db.delay=null;await page.waitForFunction(()=>document.querySelectorAll('.row').length===1);
  assert.equal(await page.locator('[data-id="2"]').count(),0);
  await page.locator('[data-id="3"] [data-label="parents"]').click();await page.waitForFunction(()=>document.querySelectorAll('.row').length===3);
  assert.equal(await page.locator('[data-filter="all"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#progress').textContent(),'All items assigned');
  await page.locator('[data-id="1"] summary').click();await page.locator('[data-id="1"] .clear-row').click();
  await page.waitForFunction(()=>document.querySelectorAll('.row').length===1);assert.equal(await page.locator('[data-filter="unassigned"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-id="1"]').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`/private/tmp/statement-shared-${browserType.name()}-${width}.png`});await page.close();
 }}finally{await browser.close();}
});

for(const browserType of [chromium,webkit])test(`${browserType.name()}: saving filter and search shares the same opening view across visitors`,async()=>{
 const browser=await browserType.launch();try{
  const {page,db,errors}=await setup(browser,390,844);db.rows[0].allocation={parents:14321,john:0,other:0};
  await page.reload();await page.locator('.row').first().waitFor();
  await page.locator('[data-filter="parents"]').click();await page.locator('#search').fill('GROCER');
  const first=await setup(browser,390,844,db);
  assert.equal(await first.page.locator('[data-filter="all"]').getAttribute('aria-pressed'),'true');assert.equal(await first.page.locator('#search').inputValue(),'');
  await page.locator('#save-view').click();await page.getByText('Saved. Everyone using this link will see this view.',{exact:true}).waitFor();
  assert.equal(db.view.filter,'parents');assert.equal(db.view.search,'GROCER');assert.equal(db.viewVersion,1);
  assert.equal(db.requests.length,0);
  await first.page.evaluate(()=>dispatchEvent(new Event('online')));
  await first.page.waitForFunction(()=>document.querySelector('[data-filter="parents"]').getAttribute('aria-pressed')==='true');
  assert.equal(await first.page.locator('#search').inputValue(),'GROCER');assert.equal(await first.page.locator('.row').count(),1);
  const next=await setup(browser,320,844,db);assert.equal(await next.page.locator('[data-filter="parents"]').getAttribute('aria-pressed'),'true');assert.equal(await next.page.locator('#search').inputValue(),'GROCER');
  await page.locator('[data-filter="unassigned"]').click();await page.locator('#search').fill('');await page.locator('#save-view').click();await page.getByText('Saved. Everyone using this link will see this view.',{exact:true}).waitFor();
  assert.equal(db.view.filter,'auto');assert.equal(db.view.search,'');
  await next.page.reload();await next.page.locator('.row').first().waitFor();assert.equal(await next.page.locator('.row').count(),2);
  // A newer shared All view must restore rows that a filtered visitor did not render.
  db.view={filter:'all',search:''};db.viewVersion++;
  await next.page.evaluate(()=>dispatchEvent(new Event('online')));await next.page.waitForFunction(()=>document.querySelectorAll('.row').length===3);
  assert.equal(await next.page.locator('[data-filter="all"]').getAttribute('aria-pressed'),'true');
  assert.ok(await next.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(first.errors,[]);assert.deepEqual(next.errors,[]);
  await page.close();await first.page.close();await next.page.close();
 }finally{await browser.close();}
});

test('failed default-view saves keep the previous shared view; failed allocations remain unassigned',async()=>{
 const browser=await chromium.launch();try{
  const {page,db}=await setup(browser,390);delete db.view;await page.reload();await page.locator('.row').first().waitFor();
  db.fail=true;await page.locator('[data-id="1"] [data-label="parents"]').click();await page.waitForFunction(()=>document.getElementById('save-status').classList.contains('error'));
  assert.equal(await page.locator('.row').count(),3);assert.equal(db.rows[0].allocation,undefined);
  db.fail=false;db.failView=true;await page.locator('[data-filter="john"]').click();await page.locator('#save-view').click();await page.getByText('Could not confirm the shared view. Check your connection and try again.',{exact:true}).waitFor();
  assert.equal(db.view,undefined);assert.equal(db.viewVersion,0);assert.equal(await page.locator('#save-view').isEnabled(),true);
  // This visitor's stale version cannot overwrite a newer preference.
  db.failView=false;db.viewVersion=1;db.view={filter:'parents',search:''};await page.locator('#save-view').click();await page.getByText('The shared view changed on another device. Reload before saving your view.',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-filter="parents"]').getAttribute('aria-pressed')==='true');assert.equal(db.view.filter,'parents');assert.equal(db.viewVersion,1);
 }finally{await browser.close();}
});
