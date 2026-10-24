const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright');const token='s'.repeat(43);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=','base64');
async function open(browser,width=1280,ttl=7*86400000,fragment=token){
 const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<600,isMobile:width<600});page.setDefaultTimeout(6000);const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 const db={revoked:false,queries:0,expiresAt:Date.now()+ttl};
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.protocol==='blob:')return route.continue();requests.push(url.href);const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
 if(url.hostname==='localhost'){
  const file=url.pathname.endsWith('/')?'index.html':path.basename(url.pathname);if(file.endsWith('.svg'))return route.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg"/>',contentType:'image/svg+xml'});
  return route.fulfill({body:await fs.readFile(path.join(__dirname,'../shared',file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
 }
 if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
 if(url.pathname==='/payment-question-share'){db.queries++;assert.equal(route.request().headers()['x-payment-share-token'],fragment);
  if(db.revoked||db.expiresAt<=Date.now())return route.fulfill({headers,json:{status:'error',errorMessage:'This share link has expired or is unavailable.'}});
  return route.fulfill({headers,json:{status:'success',value:{expiresAt:db.expiresAt,serverNow:Date.now(),item:{title:'A trip payment question',context:'Fallback context',richText:[{type:'p',children:[{type:'strong',children:[{type:'text',text:'Please review this receipt.'}]},{type:'text',text:' <img src=x onerror="window.bad=true">'},{type:'a',href:'javascript:window.bad=true',children:[{type:'text',text:'Unsafe link'}]}]}],status:'waiting',updatedAt:Date.now(),amountCents:12345,card:'Example card'},files:[{_id:'file1',name:'receipt.png',type:'image/png'}]}}});
 }
 if(url.hostname.endsWith('.convex.site')){assert.equal(route.request().headers()['x-payment-share-token'],token);assert.equal(url.search,'?id=file1');return route.fulfill({body:png,contentType:'image/png',headers});}
 throw Error('Unexpected external request: '+url.hostname);
 });
 await page.goto('http://localhost/tools/payment/questions/shared/#'+fragment);return {page,db,errors,requests};
}
for(const engine of [chromium,webkit])test(`${engine.name()}: recipients see only read-only note context and images without sign-in`,async()=>{
 const browser=await engine.launch();try{for(const width of [1280,390]){
  const {page,errors,requests}=await open(browser,width);await page.locator('#question').waitFor();await page.locator('figure img').waitFor();
  assert.equal(await page.locator('#title').textContent(),'A trip payment question');assert.equal(await page.locator('#stage').textContent(),'Waiting');assert.equal(await page.locator('#body strong').textContent(),'Please review this receipt.');assert.equal(await page.locator('#body a[href]').count(),0);assert.equal(await page.evaluate(()=>window.bad),undefined);
  assert.equal(await page.locator('input,[contenteditable=true]').count(),0);assert.ok((await page.locator('figure img').getAttribute('src')).startsWith('blob:'));
  assert.ok(!requests.some(url=>/clerk|analytics/.test(url)));assert.equal(await page.locator('meta[name=referrer]').getAttribute('content'),'no-referrer');
  const size=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert.ok(size[0]<=size[1]);
  await page.getByRole('button',{name:'Enlarge receipt.png'}).click();await page.locator('#image-dialog').waitFor();await page.locator('#close-image').click();
  await page.screenshot({path:`/private/tmp/shared-question-${engine.name()}-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
test('expired, revoked and malformed links clear all private context including already-open screenshots',async()=>{
 const browser=await chromium.launch();try{
  const {page,db,errors}=await open(browser,390,1800);await page.locator('#question').waitFor();await page.locator('figure img').waitFor();await page.getByRole('button',{name:'Enlarge receipt.png'}).click();
  await page.locator('#status').filter({hasText:'expired or been disabled'}).waitFor();assert.equal(await page.locator('#question').isVisible(),false);assert.equal(await page.locator('#body').textContent(),'');assert.equal(await page.locator('figure img').count(),0);assert.equal(await page.locator('#image-dialog').isVisible(),false);assert.deepEqual(errors,[]);await page.close();
  const revoked=await open(browser);await revoked.page.locator('#question').waitFor();revoked.db.revoked=true;await revoked.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await revoked.page.locator('#status').filter({hasText:'expired or been disabled'}).waitFor();assert.equal(await revoked.page.locator('#title').textContent(),'');await revoked.page.close();
  const invalid=await open(browser,390,10000,'bad');await invalid.page.locator('#status').filter({hasText:'expired or been disabled'}).waitFor();assert.equal(invalid.db.queries,0);
 }finally{await browser.close();}
});
