const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const {chromium,webkit}=require('playwright');
const token='a'.repeat(43),root=path.join(__dirname,'..');
function fixture(){return {title:'Bilt · September 2026',period:'Aug 18 – Sep 17, 2026',dueDate:'2026-10-12',balanceCents:14321,view:{filter:'all',search:''},viewVersion:0,rows:[{_id:'1',date:'2026-09-01',description:'EXAMPLE GROCER 123 MARKET STREET',amountCents:14321,kind:'purchase',page:2,version:0,note:''},{_id:'2',date:'2026-09-02',description:'EXAMPLE RENT',amountCents:100000,kind:'purchase',page:3,version:0,note:''},{_id:'3',date:'2026-09-02',description:'EXAMPLE RENT ADJUSTMENT',amountCents:-100000,kind:'credit',page:2,version:0,note:''}]};}
async function setup(browser,width=1280,height=900,sharedData){const page=await browser.newPage({viewport:{width,height},isMobile:width<600,hasTouch:width<600});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const db=sharedData||fixture();db.fail=false;db.conflict=false;db.pdfRequests=0;db.delay=null;db.requests=[];
await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.hostname==='localhost'){const file=url.pathname.endsWith('/')?'index.html':path.basename(url.pathname);if(file.endsWith('.svg'))return route.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg"/>',contentType:'image/svg+xml'});return route.fulfill({body:await fs.readFile((url.pathname.includes('/assets/')?path.join(root,'../../../',url.pathname.slice(url.pathname.indexOf('/assets/')+1)):url.pathname.includes('/vendor/')?path.join(root,url.pathname.slice(url.pathname.indexOf('/vendor/')+1)):path.join(root,file))),contentType:(file.endsWith('.js')||file.endsWith('.mjs'))?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}
if(url.hostname.endsWith('.convex.site')){db.pdfRequests++;assert.equal(req.headers()['x-statement-token'],token);assert.equal(url.search,'');if(db.sourceType==='csv')return route.fulfill({body:'Date,Description,Amount\n2026-09-01,Example,143.21',contentType:'text/csv'});return route.fulfill({body:await fs.readFile(path.join(root,'tests/fixtures/statement.pdf')),contentType:'application/pdf'});}
if(url.hostname.endsWith('.convex.cloud')){const {path:endpoint,args}=req.postDataJSON();assert.equal(args.token,token);if(db.revoked)return route.fulfill({json:{status:'error',errorMessage:'This statement link is unavailable.'}});if(endpoint.endsWith(':saveView')){db.viewRequests=(db.viewRequests||[]).concat([args]);if(db.beforeViewSave)await db.beforeViewSave(args);if(db.failView)return route.abort('failed');db.view={...args.view};db.viewVersion=(db.viewVersion||0)+1;return route.fulfill({json:{status:'success',value:{view:db.view,viewVersion:db.viewVersion}}});}if(endpoint.endsWith(':view'))return route.fulfill({json:{status:'success',value:{view:db.view||{filter:'unassigned',search:''},viewVersion:db.viewVersion||0}}});if(endpoint.endsWith(':review'))return route.fulfill({json:{status:'success',value:db}});db.requests.push(args);if(db.beforeSave)await db.beforeSave(args);if(db.delay)await db.delay;if(db.fail)return route.abort('failed');const row=db.rows.find(r=>r._id===args.id);if(db.conflict||row.version!==args.expectedVersion)return route.fulfill({json:{status:'error',errorMessage:'This charge changed on another device. Refresh and review it before saving again.'}});Object.assign(row,{allocation:args.allocation,note:args.note,version:row.version+1});return route.fulfill({json:{status:'success',value:{version:row.version}}});}return route.abort();});
await page.goto('http://localhost/tools/payments/statements/#'+token);await page.locator('.row').first().waitFor();return {page,db,errors};}
async function choose(page,id,label){await page.locator('#'+id+'-trigger').click();await page.locator('#'+id+'-panel input').fill(label);await page.locator('#'+id+'-panel').getByRole('option',{name:label,exact:true}).click();}
async function assignFilter(page,person){await page.locator('#open-filters').click();await choose(page,'filter-assignment',person[0].toUpperCase()+person.slice(1));await page.locator('#apply-filters').click();}

for(const browserType of [chromium,webkit])test(`${browserType.name()}: compact filters, searched menus, date validation and URL restoration`,async()=>{
 const browser=await browserType.launch();try{for(const width of [1280,390,320]){
 const {page,db,errors}=await setup(browser,width);
 const ids=()=>page.locator('.row').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
 assert.deepEqual(await ids(),['3','2','1']);
 assert.equal(await page.locator('#filters-dialog').isVisible(),false);
 const controls=await page.locator('.transaction-controls').boundingBox();assert.ok(controls.height<240);
 await choose(page,'sort-order','Oldest first');assert.deepEqual(await ids(),['1','3','2']);
 await page.locator('#open-filters').click();assert.match(page.url(),/panel=filters/);
 await page.reload();await page.locator('#filters-dialog').waitFor();
 await choose(page,'filter-kind','Credits & refunds');assert.deepEqual(await ids(),['1','3','2']);assert.equal(db.viewRequests?.length||0,0);
 await page.locator('#filter-kind-trigger').click();await page.locator('#filter-kind-panel input').fill('zznothing');await page.locator('#filter-kind-panel').getByText('No matches. Try another search.',{exact:true}).waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.locator('#filters-dialog').isVisible(),true);
 await page.locator('#apply-filters').click();assert.deepEqual(await ids(),['3']);assert.equal(await page.locator('#filter-count').textContent(),'1');
 const copied=page.url();assert.ok(!copied.includes('panel='));
 const fresh=await setup(browser,width,900,db);await fresh.page.goto(copied);await fresh.page.locator('.row').first().waitFor();assert.deepEqual(await fresh.page.locator('.row').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),['3']);await fresh.page.close();
 await page.reload();await page.locator('.row').first().waitFor();assert.deepEqual(await ids(),['3']);
 await page.goBack();assert.deepEqual(await ids(),['1','3','2']);await page.goForward();assert.deepEqual(await ids(),['3']);
 await page.getByRole('button',{name:'Remove Credits & refunds filter',exact:true}).click();assert.deepEqual(await ids(),['1','3','2']);
 await page.locator('#open-filters').click();await choose(page,'filter-period','2026');assert.equal(await page.locator('#custom-dates').isVisible(),false);await page.locator('#apply-filters').click();assert.match(page.url(),/from=2026-01-01/);assert.equal(await page.getByRole('button',{name:'Remove 2026 filter',exact:true}).count(),1);
 await page.locator('#open-filters').click();await choose(page,'filter-period','Custom dates');await page.locator('#date-from').fill('2026-09-02');await page.locator('#date-to').fill('2026-09-01');await page.locator('#date-to').dispatchEvent('change');assert.equal(await page.locator('#apply-filters').isDisabled(),true);await page.locator('#filter-error').waitFor();
 await page.locator('#date-to').fill('2026-09-30');await page.locator('#date-to').dispatchEvent('change');await page.locator('#apply-filters').click();assert.deepEqual(await ids(),['3','2']);
 await page.locator('#clear-filters').click();await page.waitForFunction(()=>document.querySelectorAll('.row').length===3);
 await page.locator('#open-filters').click();await page.locator('#filters-title').click();assert.equal(await page.locator('#filters-dialog').isVisible(),true);
 await page.mouse.click(4,4);assert.equal(await page.locator('#filters-dialog').isVisible(),false);assert.equal(await page.locator('#open-filters').evaluate(n=>n===document.activeElement),true);
 await page.locator('#open-filters').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#filters-dialog').isVisible(),false);
 assert.equal(db.requests.length,0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 await page.locator('.transaction-controls').scrollIntoViewIfNeeded();await page.screenshot({path:`/private/tmp/rebuilt-statement-${browserType.name()}-${width}.png`});
 await page.locator('#open-filters').click();await page.screenshot({path:`/private/tmp/rebuilt-statement-${browserType.name()}-${width}-filters.png`});
 await page.locator('#filter-period-trigger').click();const box=await page.locator('#filter-period-panel').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);await page.screenshot({path:`/private/tmp/rebuilt-statement-${browserType.name()}-${width}-picker.png`});
 await page.close();
 }}finally{await browser.close();}
});
