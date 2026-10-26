import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=path.resolve(import.meta.dirname,'../..');let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
const monitor={id:'seo-content-opportunities',name:'nextcard SEO',configured:true,status:'healthy',metrics:{readyTaskCount:1},details:{
 finalizedThrough:'2026-10-23',articleCount:322,plannerKeywords:2942,totalGroups:0,opportunities:[],
 workPlan:[{id:'test-task',workItem:true,title:'Private test priority',kind:'Maintenance',status:'Ready',priority:'P1',reviewedAt:new Date().toISOString(),targets:[],doneWhen:['Check evidence']}]
}};
async function setup({signedIn=true,response}={}){
 const page=await browser.newPage({viewport:{width:1440,height:900}}),requests=[];
 page.on('pageerror',error=>console.error('Page error:',error.message));
 page.on('console',message=>{if(message.type()==='error')console.error('Browser error:',message.text());});
 await page.addInitScript(signed=>{
   const listeners=[];
   const session=id=>({id,getToken:async()=> 'mock.'+btoa(JSON.stringify({aud:'convex'}))+'.test'});
   window.Clerk={session:signed?session('session-a'):null,user:signed?{id:'user-a'}:null,isSignedIn:signed,
     load:async()=>{},addListener:fn=>listeners.push(fn),mountSignIn:el=>{el.textContent='Mock sign-in form';},unmountSignIn:el=>el.replaceChildren(),
     signOut:async()=>window.changeTestSession(null)};
   window.changeTestSession=id=>{window.Clerk.session=id?session(id):null;window.Clerk.user=id?{id}:null;window.Clerk.isSignedIn=!!id;for(const fn of listeners)fn({session:window.Clerk.session,user:window.Clerk.user});};
 },signedIn);
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='rapid-shark-565.convex.cloud'){
     const body=route.request().postDataJSON();requests.push(body);
     if(response)return response(route,body,requests.length);
     return route.fulfill({json:{status:'success',value:{monitor}}});
   }
   if(url.hostname!=='workspace.test')return route.fulfill({body:'',contentType:'application/javascript'});
   const relative=decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':'');
   const file=path.join(root,relative);
   try {const body=await fs.readFile(file);return route.fulfill({body,contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/javascript'});}
   catch{return route.fulfill({status:404,body:'Not found'});}
 });
 return{page,requests};
}
test('standalone page stays locked without a session and makes no private request',async()=>{
 const {page,requests}=await setup({signedIn:false});await page.goto('https://workspace.test/tools/seo/');
 await page.getByText('Mock sign-in form').waitFor();assert.equal(await page.locator('#app').isVisible(),false);
 assert.equal(requests.length,0);assert.equal(await page.locator('dialog').count(),0);await page.close();
});
test('approved page loads only the existing private SEO detail and occupies the full desktop',async()=>{
 const {page,requests}=await setup();await page.goto('https://workspace.test/tools/seo/');await page.locator('#app').waitFor({state:'visible'});
 assert.equal(await page.getByRole('heading',{level:1,name:'Content opportunities'}).isVisible(),true);
 assert.equal(requests.length,1);assert.deepEqual(requests[0],{path:'monitoring:detail',args:{monitorId:'seo-content-opportunities'}});
 assert.equal(await page.locator('dialog').count(),0);assert.equal(await page.locator('.seo-row').textContent().then(t=>t.includes('Private test priority')),true);
 const bounds=await page.locator('#app').boundingBox();assert.equal(bounds.width,1440);assert.equal(bounds.height,900);
 await page.close();
});
test('the former SEO deep link redirects to the standalone page before opening a modal',async()=>{
 const {page,requests}=await setup();await page.goto('https://workspace.test/tools/monitoring/?monitor=seo-content-opportunities');
 await page.waitForURL('https://workspace.test/tools/seo/');await page.locator('#app').waitFor({state:'visible'});
 assert.equal(await page.locator('dialog').count(),0);assert.ok(requests.every(r=>r.path==='monitoring:detail'));await page.close();
});
test('a refresh failure preserves the report, while revoked access clears it',async()=>{
 let count=0;const {page}=await setup({response:async route=>{
   count++;return route.fulfill(count===1?{json:{status:'success',value:{monitor}}}:count===2?{status:503,json:{status:'error',errorMessage:'Unavailable'}}:{status:403,json:{status:'error',errorMessage:'Not authorized'}});
 }});await page.goto('https://workspace.test/tools/seo/');await page.locator('#app').waitFor({state:'visible'});
 await page.locator('#refresh-report').click();await page.getByText('Refresh failed.',{exact:false}).waitFor();assert.equal(await page.locator('.seo-row').count(),1);
 await page.locator('#refresh-report').click();await page.getByText('This account is not approved',{exact:false}).waitFor();assert.equal(await page.locator('.seo-engine').count(),0);assert.equal(await page.locator('#app').isVisible(),false);await page.close();
});
test('late private responses cannot redisplay data after signing out',async()=>{
 let release,started;const pending=new Promise(resolve=>{started=resolve;});
 const {page}=await setup({response:async route=>{started();await new Promise(resolve=>{release=resolve;});await route.fulfill({json:{status:'success',value:{monitor}}});}});
 await page.goto('https://workspace.test/tools/seo/');await pending;await page.evaluate(()=>window.changeTestSession(null));await page.getByText('Mock sign-in form').waitFor();
 release();await page.waitForLoadState('networkidle');assert.equal(await page.locator('.seo-engine').count(),0);assert.equal(await page.locator('#app').isVisible(),false);await page.close();
});
test('monitoring card opens SEO as a link and other monitors retain their dialogs',async()=>{
 const other={id:'example-monitor',name:'Example monitor',configured:false,status:'not_configured',description:'Another monitor',config:{}};
 const {page}=await setup({response:async(route,body)=>route.fulfill({json:{status:'success',value:body.path==='monitoring:overview'?{snapshot:{state:{monitors:[monitor,other],overallStatus:'healthy',generatedAt:new Date().toISOString()},feed:{events:[]}}}:{monitor}}})});
 await page.goto('https://workspace.test/tools/monitoring/');await page.locator('#app').waitFor({state:'visible'});
 assert.equal(await page.getByRole('link',{name:'Open SEO workspace'}).getAttribute('href'),'/tools/seo/');
 await page.locator('[data-monitor-id="example-monitor"]').click();assert.equal(await page.locator('#monitor-dialog').isVisible(),true);assert.equal(await page.locator('#monitor-dialog-title').textContent(),'Example monitor');
 await page.locator('#monitor-dialog-close').click();await page.getByRole('link',{name:'Open SEO workspace'}).click();await page.waitForURL('https://workspace.test/tools/seo/');await page.locator('#app').waitFor({state:'visible'});await page.close();
});
