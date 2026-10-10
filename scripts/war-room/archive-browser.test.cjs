const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
async function open(browser, routeName, {signedIn = true, denied = false, width = 1440} = {}) {
 const page = await browser.newPage({viewport:{width,height:900}}), requests=[], errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({signedIn})=>{
  const token='test.'+btoa(JSON.stringify({aud:'convex'}))+'.test';
  window.__internal_ClerkUICtor={};
  window.Clerk={session:signedIn?{id:'synthetic-owner',getToken:async()=>token}:null,load:async()=>{},addListener(fn){window.changeArchiveSession=fn;},mountSignIn(node){node.innerHTML='<label>Sign in<input type="email"></label>';},unmountSignIn(node){node.replaceChildren();},signOut:async()=>{}};
 },{signedIn});
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname==='rapid-shark-565.convex.cloud'){
   const body=request.postDataJSON();requests.push({body,authorization:request.headers().authorization});
   return route.fulfill({contentType:'application/json',body:JSON.stringify(denied?{status:'error',errorData:{code:'FORBIDDEN'}}:{status:'success',value:null})});
  }
  if(url.hostname!=='www.john-ta.com')return route.abort();
  const file=path.join(root,decodeURIComponent(url.pathname),url.pathname.endsWith('/')?'index.html':'');
  try{return route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':undefined});}catch{return route.abort();}
 });
 await page.goto('https://www.john-ta.com/'+routeName+'/');
 return {page,requests,errors};
}
test('both archives keep signed-out and denied visitors locked without reading or rendering progress',async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const name of ['war-room-06122026','war-room-06152026']){
  const out=await open(browser,name,{signedIn:false});await out.page.locator('#clerkSignIn input').waitFor();
  assert.equal(out.requests.length,0);assert.equal(await out.page.locator('#board').textContent(),'');assert.equal(await out.page.locator('#warRoomApp').isVisible(),false);assert.deepEqual(out.errors,[]);await out.page.close();
  const denied=await open(browser,name,{denied:true});await denied.page.locator('#authStatus').filter({hasText:/only to the site owner/}).waitFor();
  assert.equal(denied.requests.length,1);assert.equal(await denied.page.locator('#board').textContent(),'');assert.equal(await denied.page.locator('#warRoomApp').isVisible(),false);assert.deepEqual(denied.errors,[]);await denied.page.close();
 }}finally{await browser.close();}
});
test('owners can load and save either archive with authenticated requests, and session loss locks it again',async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const name of ['war-room-06122026','war-room-06152026']){
  const {page,requests,errors}=await open(browser,name);await page.locator('#warRoomApp').waitFor({state:'visible'});
  assert.equal(requests[0].body.path,'warRoom:get');assert.equal(requests[0].body.args.boardId,name);assert.match(requests[0].authorization,/^Bearer test/);
  const saved=page.waitForResponse(response=>response.url().endsWith('/api/mutation'));
  await page.locator('input[type="checkbox"]').first().check();await saved;
  assert.equal(requests[1].body.path,'warRoom:save');assert.equal(requests[1].body.args.boardId,name);assert.match(requests[1].authorization,/^Bearer test/);
  await page.evaluate(()=>{window.Clerk.session=null;window.changeArchiveSession({session:null});});
  assert.equal(await page.locator('#warRoomApp').isVisible(),false);assert.equal(await page.locator('#board').textContent(),'');assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
test('archive sign-in gates fit desktop and narrow phones',async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const width of [1440,390,320]){
  const {page,errors}=await open(browser,'war-room-06122026',{signedIn:false,width});await page.locator('#clerkSignIn input').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
