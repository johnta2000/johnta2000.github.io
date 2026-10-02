const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {chromium,webkit}=require('playwright');const engine=process.env.RENT_BROWSER==='webkit'?webkit:chromium;
const config={rentCents:600000,loftCents:30000,bathroomCents:10000,people:[{name:'Alex',room:100,closet:20,creditCents:10000},{name:'Blair',room:130,closet:30,creditCents:100000},{name:'Casey',room:100,closet:20,creditCents:100000}]};
async function open(browser,width=1280,mode='signed-in'){
 const page=await browser.newPage({viewport:{width,height:960},hasTouch:width<800,isMobile:width<800});page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const month=await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;});
 const db={months:[{_id:'month1',month,config:structuredClone(config),parkingCents:0,note:'',requestsSent:false,version:1,sourceNote:'Original spreadsheet history retained for review.',sourcePayments:[{payer:0,amountCents:190000,note:'Payment request, date unconfirmed.'}]}],payments:[],fail:false};
 await page.addInitScript(mode=>{const session={id:'one',getToken:async()=>`test.${btoa(JSON.stringify({aud:'convex'}))}.test`};window.__internal_ClerkUICtor={};window.Clerk={session:mode==='signed-out'?null:session,load:async()=>{},mountSignIn:n=>n.textContent='Sign in form',unmountSignIn:n=>n.textContent='',addListener(fn){window.changeSession=s=>{this.session=s;fn({session:s});};},signOut:async()=>window.changeSession(null)};},mode);
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.protocol==='blob:')return route.continue();
  if(url.hostname==='localhost'){let filename=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;let body=await fs.readFile(path.join(__dirname,'../../..',filename));if(filename.endsWith('.html'))body=Buffer.from(body.toString().replace(/<script\b[^>]*src="https:[\s\S]*?<\/script>/g,''));return route.fulfill({body,contentType:filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html'});}
  if(!url.hostname.endsWith('.convex.cloud'))return route.abort();const {path:routePath,args}=route.request().postDataJSON();const name=routePath.split(':')[1];let value=null;
  if(mode==='denied')return route.fulfill({json:{status:'error',errorMessage:'This account is not authorized for Rent.'}});
  if(name==='verify')value={email:'test@example.com'};
  if(name==='dashboard'){if(db.delayRead)await db.delayRead();const item=db.months.find(m=>m.month===args.month)||null;value={item,template:db.months[0].config,months:db.months.map(m=>({month:m.month})),payments:db.payments.filter(p=>p.month===args.month)};}
  if(name==='recordPayment'){if(db.delaySave)await db.delaySave();if(db.fail)return route.abort();let payment=db.payments.find(p=>p.requestKey===args.requestKey);if(!payment){payment={...args,_id:'payment'+db.payments.length,createdAt:Date.now(),createdBy:'test@example.com'};db.payments.push(payment);}value=payment._id;}
  if(name==='saveMonth'){if(db.fail)return route.abort();let item=db.months.find(m=>m.month===args.month);if(item&&item.version!==args.expectedVersion)return route.fulfill({json:{status:'error',errorMessage:'This month changed on another device. Refresh before saving.'}});if(!item){item={_id:'month'+db.months.length};db.months.push(item);}Object.assign(item,args,{version:args.expectedVersion+1});value=item._id;}
  if(name==='voidPayment'){db.payments.find(p=>p._id===args.id).voidedAt=Date.now();}
  return route.fulfill({json:{status:'success',value}});
 });
 await page.goto('http://localhost/tools/rent/');if(mode==='signed-in')await page.locator('#dashboard').waitFor();return {page,db,errors};
}
test('desktop and phone layouts, searchable payer picker, payment and void workflow',async()=>{
 const browser=await engine.launch();try{for(const width of [390,1280]){const {page,db,errors}=await open(browser,width);
  assert.equal(await page.locator('#remaining').textContent(),'$6,000.00');assert.equal(db.payments.length,0);
  await page.screenshot({path:path.join(os.tmpdir(),`rent-${engine.name()}-${width}.png`),fullPage:true});
  await page.locator('#record').click();await page.locator('#payment-dialog .search-select-trigger').click();const search=page.locator('#payment-dialog [role=combobox]');await search.fill('Blair');await page.getByRole('option',{name:'Blair',exact:true}).click();
  assert.equal(await page.locator('#amount').inputValue(),'1150.00');await page.locator('#amount').fill('500.00');await page.locator('#payment-submit').click();await page.locator('#payment-dialog').waitFor({state:'hidden'});await page.getByText('Partial',{exact:true}).waitFor();assert.equal(db.payments.length,1);
  await page.locator('#payments').getByRole('button',{name:'Void',exact:true}).click();await page.locator('#void-submit').click();await page.locator('#void-dialog').waitFor({state:'hidden'});assert.ok(db.payments[0].voidedAt);
  assert.equal(await page.locator('#remaining').textContent(),'$6,000.00');const size=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert.ok(size[0]<=size[1],JSON.stringify(size));assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
test('new months inherit calculation only; editing, monthly notes and history persist',async()=>{
 const browser=await engine.launch();try{const {page,db,errors}=await open(browser);
  await page.locator('#note').fill('Waiting for transfer');await page.locator('#next').click();await page.locator('#notice').filter({hasText:/Save your monthly note/}).waitFor();await page.locator('#save-note').click();await page.locator('#sync').filter({hasText:/Up to date/}).waitFor();assert.equal(db.months[0].note,'Waiting for transfer');
  await page.locator('#next').click();await page.locator('#create').click();assert.equal(await page.locator('#parking-input').inputValue(),'0.00');await page.locator('#parking-input').fill('100');await page.locator('#config-submit').click();await page.locator('#config-dialog').waitFor({state:'hidden'});assert.equal(db.months.length,2);assert.equal(db.months[1].parkingCents,10000);assert.equal(db.months[1].note,'');assert.equal(db.months[0].parkingCents,0);assert.equal(await page.locator('#remaining').textContent(),'$5,900.00');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('failed saves retain draft and retry once; sign-out clears data during a delayed request',async()=>{
 const browser=await engine.launch();try{const {page,db,errors}=await open(browser);await page.locator('#record').click();await page.locator('#amount').fill('99.99');db.fail=true;await page.locator('#payment-submit').click();await page.locator('#payment-error').filter({hasText:/Couldn’t save/}).waitFor();assert.equal(await page.locator('#amount').inputValue(),'99.99');db.fail=false;await page.locator('#payment-submit').click();await page.locator('#payment-dialog').waitFor({state:'hidden'});assert.equal(db.payments.length,1);
  let release;db.delayRead=()=>new Promise(r=>release=r);await page.locator('#refresh').click();await page.waitForTimeout(80);await page.locator('#sign-out').click();release();await page.getByText('Sign in form',{exact:true}).waitFor();await page.waitForTimeout(80);assert.equal(await page.locator('#app').isVisible(),false);assert.equal(await page.locator('#people').textContent(),'');assert.equal(await page.locator('#remaining').textContent(),'');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('imported payments require an explicit date and do not count before confirmation',async()=>{
 const browser=await engine.launch();try{const {page,db}=await open(browser);await page.getByRole('button',{name:'Review payment',exact:true}).click();assert.equal(await page.locator('#date').inputValue(),'');await page.locator('#payment-submit').click();assert.equal(db.payments.length,0);await page.locator('#date').fill('2026-01-01');await page.locator('#payment-submit').click();await page.locator('#payment-dialog').waitFor({state:'hidden'});assert.equal(db.payments[0].sourcePayer,0);await page.getByText('Confirmed',{exact:true}).waitFor();}finally{await browser.close();}
});
test('signed-out and denied accounts see no private rent information',async()=>{
 const browser=await engine.launch();try{for(const mode of ['signed-out','denied']){const {page}=await open(browser,390,mode);await page.getByText(mode==='signed-out'?'Sign in form':'This account doesn’t have access to Rent. Sign out and use an approved email.',{exact:true}).waitFor();assert.equal(await page.locator('#app').isVisible(),false);assert.equal(await page.locator('#people').textContent(),'');await page.close();}}finally{await browser.close();}
});
