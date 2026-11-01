const {test} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {readFileSync, mkdtempSync, rmSync} = require('node:fs');
const {pbkdf2Sync, randomBytes, createCipheriv} = require('node:crypto');
const {gunzipSync} = require('fflate');
const {getFunctionName} = require('convex/server');
const root = require('node:path').resolve(__dirname, '../..');
const key = pbkdf2Sync('test-only', 'test-salt', 250000, 32, 'sha256'), iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const guide = {main:'<main><h1>Example address</h1></main>',style:'body { margin:20px; }'};
const ciphertext = Buffer.concat([cipher.update(JSON.stringify(guide)),cipher.final()]);
const payload = Object.fromEntries(Object.entries({salt:Buffer.from('test-salt'),iv,ciphertext,tag:cipher.getAuthTag()}).map(([k,v])=>[k,v.toString('base64')]));
const token = 'a'.repeat(43);

test('prepared private content avoids upstream fetches and still enforces expiry for new and existing links',async()=>{
 const dir=mkdtempSync('/tmp/apartment-sharing-test-');
 require('esbuild').buildSync({entryPoints:[root+'/convex/apartmentShareHttp.ts',root+'/convex/apartmentSharing.ts'],bundle:true,platform:'node',format:'cjs',outdir:dir});
 const {endpoint}=require(dir+'/apartmentShareHttp.js'),functions=require(dir+'/apartmentSharing.js');
 const originalFetch=global.fetch,records={apartmentShareLinks:[],apartmentShareGuides:[]},blobs=new Map();
 let downloads=0,readBlobs=0,expireDuringRead=false;const realNow=Date.now;
 const db={
  insert:async(table,record)=>{records[table].push({...record,_id:'row'+records[table].length});},
  query:table=>({withIndex:(_name,filter)=>{
   const conditions=[],q={eq:(field,value)=>{conditions.push([field,value]);return q;}};filter(q);
   return {unique:async()=>records[table].find(row=>conditions.every(([field,value])=>row[field]===value))||null};
  }})
 };
 const storage={store:async blob=>{const id='file'+blobs.size;blobs.set(id,blob);return id;},delete:async id=>blobs.delete(id),get:async id=>{readBlobs++;if(expireDuringRead)Date.now=()=>records.apartmentShareLinks[0].expiresAt+1;return blobs.get(id);}};
 const ctx={storage,runQuery:(fn,args)=>functions[getFunctionName(fn).split(':')[1]]._handler({db,storage},args),runMutation:(fn,args)=>functions[getFunctionName(fn).split(':')[1]]._handler({db,storage},args)};
 const request=(method,body,shareToken,v2=false)=>new Request('https://example.test/apartment-share'+(v2?'?v=2':''),{method,headers:{'Content-Type':'application/json',...(shareToken?{'X-Apartment-Share-Token':shareToken}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try {
  global.fetch=async()=>{downloads++;return new Response(JSON.stringify(payload));};
  assert.equal((await endpoint._handler(ctx,request('POST',{key:randomBytes(32).toString('base64')}))).status,404);
  assert.equal(records.apartmentShareLinks.length,0);
  const before=Date.now(),created=await endpoint._handler(ctx,request('POST',{key:key.toString('base64')}));
  assert.equal(created.status,200);const link=await created.json();
  assert.match(link.token,/^[A-Za-z0-9_-]{43}$/);assert.ok(link.expiresAt>=before+86400000);
  assert.equal(blobs.size,1);assert.notEqual(records.apartmentShareLinks[0].tokenHash,link.token);
  const fetches=downloads;
  assert.equal((await endpoint._handler(ctx,request('POST',{key:key.toString('base64')}))).status,200);
  assert.equal(downloads,fetches,'a ready guide makes creation independent of GitHub');
  assert.equal(blobs.size,1,'all links reuse the private prepared guide');
  const opened=await endpoint._handler(ctx,request('GET',null,link.token,true));
  assert.equal(opened.status,200);assert.equal(opened.headers.get('content-encoding'),'gzip');assert.equal(Number(opened.headers.get('X-Apartment-Share-Expires')),link.expiresAt);
  const content=JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(await opened.arrayBuffer()))));
  assert.deepEqual(content,{guide});assert.equal(content.key,undefined);
  delete records.apartmentShareLinks[0].guideStorageId;
  const legacy=await endpoint._handler(ctx,request('GET',null,link.token));assert.equal(legacy.status,200);assert.deepEqual((await legacy.json()).guide,guide);
  assert.equal(downloads,fetches,'existing links also reuse the prepared content');
  expireDuringRead=true;
  assert.equal((await endpoint._handler(ctx,request('GET',null,link.token,true))).status,404,'recheck expiry after storage read');
  expireDuringRead=false;Date.now=realNow;records.apartmentShareLinks[0].expiresAt=Date.now()-1;const reads=readBlobs;
  assert.equal((await endpoint._handler(ctx,request('GET',null,link.token,true))).status,404);
  assert.equal(readBlobs,reads,'expired links never retrieve private content');
  assert.equal((await endpoint._handler(ctx,request('GET',null,'bad'))).status,404);
 }finally{Date.now=realNow;global.fetch=originalFetch;rmSync(dir,{recursive:true,force:true});}
});

test('the initial recipient page stays small and does not embed the encrypted guide',()=>{
 const html=readFileSync(root+'/apartmentnavigation/index.html','utf8');
 assert.ok(Buffer.byteLength(html)<15000);
 assert.doesNotMatch(html,/const encryptedPage = \{/);
 assert.match(html,/fetch\("\/apartmentnavigation\/guide.json/);
});

for(const mobile of [false,true])test(`one-click sharing and recipient navigation (${mobile?'phone':'desktop'})`,async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 try{
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900}});
  let expired=false,requests=0,guideDownloads=0,fail=false,hold;
  await context.addInitScript(({mobile})=>{
   window.shared=[];window.copied=[];
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied.push(text);}}});
   Object.defineProperty(navigator,'share',{configurable:true,value:mobile?async data=>{window.shared.push(data);}:undefined});
  },{mobile});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='rapid-shark-565.convex.site'){
    if(route.request().method()==='POST'){requests++;if(hold)await hold;assert.equal(route.request().postDataJSON().key,key.toString('base64'));return route.fulfill({status:fail?503:200,json:{token,expiresAt:Date.now()+86400000}});}
    return route.fulfill({status:expired?404:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'X-Apartment-Share-Expires, X-Apartment-Share-Now','X-Apartment-Share-Expires':String(Date.now()+86400000),'X-Apartment-Share-Now':String(Date.now())},json:{guide}});
   }
   if(url.pathname==='/apartmentnavigation/guide.json'){guideDownloads++;return route.fulfill({json:payload});}
   const file=url.pathname==='/apartmentnavigation/'?'index.html':url.pathname.split('/').pop();
   if(['index.html','sharing.js','sharing.css'].includes(file))return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:readFileSync(root+'/apartmentnavigation/'+file)});
   return route.abort();
  });
  const page=await context.newPage();await page.goto('https://www.john-ta.com/apartmentnavigation/');
  assert.equal(guideDownloads,0);await page.locator('#password').fill('test-only');await page.getByRole('button',{name:'Unlock',exact:true}).click();
  await page.locator('#share-result:not([hidden])').waitFor({state:'attached'});assert.equal(requests,1);
  await page.getByRole('button',{name:'Share',exact:true}).click();
  await page.waitForFunction(mobile=>mobile?window.shared.length===1:window.copied.length===1,mobile);
  assert.equal(requests,1,'click uses the already prepared link');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
  const url=await page.evaluate(mobile=>mobile?window.shared[0].url:window.copied[0],mobile);assert.match(url,/#share=/);
  // Clipboard/native share fallback remains directly navigable and survives refresh.
  await page.evaluate(()=>{
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error();}}});
   Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
  });
  await page.getByRole('button',{name:'Share',exact:true}).click();await page.locator('dialog[open]').waitFor();assert.match(page.url(),/view=share/);
  await page.reload();await page.locator('#password').fill('test-only');await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.locator('dialog[open]').waitFor();
  await page.locator('#apartment-share-title').click();assert.equal(await page.locator('dialog').evaluate(d=>d.open),true);
  await page.mouse.click(2,2);assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
  await page.goBack();await page.locator('dialog[open]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
  const before=guideDownloads,recipient=await context.newPage();await recipient.goto(url);await recipient.getByRole('heading',{name:'Example address'}).waitFor();assert.equal(guideDownloads,before,'recipient never downloads the encrypted payload');
  assert.equal(await recipient.locator('#password').count(),0);assert.equal(await recipient.locator('#apartment-share').count(),0);
  await recipient.reload();await recipient.getByRole('heading',{name:'Example address'}).waitFor();assert.equal(await recipient.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  expired=true;await recipient.reload();await recipient.getByText('This share link has expired. Ask for a new link.').waitFor();
  const owner=await context.newPage();fail=true;await owner.goto('https://www.john-ta.com/apartmentnavigation/');await owner.locator('#password').fill('test-only');await owner.getByRole('button',{name:'Unlock',exact:true}).click();
  await owner.locator('#retry-share:not([hidden])').waitFor({state:'attached'});fail=false;
  await owner.getByRole('button',{name:'Share',exact:true}).click();await owner.getByText(/Link copied/).first().waitFor();assert.equal(await owner.locator('#create-share').count(),0);
  let release;hold=new Promise(resolve=>{release=resolve;});
  const early=await context.newPage();await early.goto('https://www.john-ta.com/apartmentnavigation/');await early.locator('#password').fill('test-only');await early.getByRole('button',{name:'Unlock',exact:true}).click();await early.locator('#apartment-share').waitFor();
  const pendingCount=requests;await early.getByRole('button',{name:'Share',exact:true}).click();await early.locator('dialog[open]').waitFor();assert.equal(requests,pendingCount,'click during preparation does not create a duplicate request');release();hold=null;await early.getByText(/Link copied/).first().waitFor();

 }finally{await browser.close();}
});
