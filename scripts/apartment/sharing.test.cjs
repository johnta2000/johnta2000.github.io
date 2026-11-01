const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const { pbkdf2Sync, randomBytes, createCipheriv } = require('node:crypto');
const root = require('node:path').resolve(__dirname, '../..');
const salt = randomBytes(16), iv = randomBytes(12), key = pbkdf2Sync('test-only', salt, 250000, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const guide = {main: '<div class="address">Example address</div><div class="unit-badge"><strong>Test unit</strong></div><div class="steps"></div><div class="parking-content"><h2>Parking</h2><p>Test parking</p></div>', wifi: {network: 'Test network', password: 'Test wifi'}};
const ciphertext = Buffer.concat([cipher.update(JSON.stringify(guide)), cipher.final()]);
const payload = Object.fromEntries(Object.entries({salt, iv, ciphertext, tag: cipher.getAuthTag()}).map(([k,v])=>[k,v.toString('base64')]));
const token = 'a'.repeat(43);
test('server verifies the guide key and rejects invalid or expired links', async () => {
 const dir = require('node:fs').mkdtempSync('/tmp/apartment-sharing-test-');
 require('esbuild').buildSync({entryPoints:[root+'/convex/apartmentShareHttp.ts',root+'/convex/apartmentSharing.ts'],bundle:true,platform:'node',format:'cjs',outdir:dir});
 const {endpoint} = require(dir+'/apartmentShareHttp.js');
 const {create, read} = require(dir+'/apartmentSharing.js');
 const originalFetch = global.fetch;
 let saved, count = 0;
 const ctx = {
  runMutation: async (_fn, args) => { count++; return create._handler({db:{insert:async (_table, record) => {saved=record;}}}, args); },
  runQuery: async (_fn, args) => read._handler({db:{query:()=>({withIndex:(_index, filter)=>{filter({eq:(_field,value)=>{assert.equal(value,saved.tokenHash);}});return {unique:async()=>saved};}})}}, args)
 };
 const request = (method, data, tokenValue) => new Request('https://example.test/apartment-share', {method, headers: {'Content-Type':'application/json', ...(tokenValue ? {'X-Apartment-Share-Token':tokenValue} : {})}, ...(data ? {body:JSON.stringify(data)} : {})});
 try {
  global.fetch = async () => new Response(JSON.stringify(payload));
  const invalid = await endpoint._handler(ctx, request('POST',{key:randomBytes(32).toString('base64')}));
  assert.equal(invalid.status,404); assert.equal(count,0);
  const before = Date.now();
  const created = await endpoint._handler(ctx,request('POST',{key:key.toString('base64')}));
  assert.equal(created.status,200);
  const link = await created.json();
  assert.match(link.token,/^[A-Za-z0-9_-]{43}$/);
  assert.ok(link.expiresAt>=before+86400000 && link.expiresAt<=Date.now()+86400000);
  assert.notEqual(saved.tokenHash,link.token);
  const opened = await endpoint._handler(ctx,request('GET',null,link.token));
  assert.equal(opened.status,200);
  const view = await opened.json(); assert.deepEqual(view.guide, guide); assert.equal(view.key, undefined);
  saved.expiresAt = Date.now()-1;
  assert.equal((await endpoint._handler(ctx,request('GET',null,link.token))).status,404);
  assert.equal((await endpoint._handler(ctx,request('GET',null,'bad'))).status,404);
 } finally { global.fetch=originalFetch; require('node:fs').rmSync(dir,{recursive:true,force:true}); }
});

for (const mobile of [false, true]) test(`production page sharing (${mobile ? 'phone' : 'desktop'})`, async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900}});
  let expired = false;
  const release = root+'/apartmentnavigation';
  const html = readFileSync(release+'/index.html','utf8').replace(/const encryptedPage = \{[^\n]*\};/, `const encryptedPage = ${JSON.stringify(payload)};`);
  await context.route('**/*', async route => {
   const url = new URL(route.request().url());
   if (url.hostname==='rapid-shark-565.convex.site') {
    if (route.request().method()==='POST') {assert.equal(route.request().postDataJSON().key,key.toString('base64'));return route.fulfill({json:{token,expiresAt:Date.now()+86400000}});}
    return route.fulfill({status:expired?404:200,json:{guide:{...guide,main:'<main><h1>Example address</h1></main>'},expiresAt:Date.now()+86400000,serverNow:Date.now()}});
   }
   if (url.pathname==='/apartmentnavigation/') return route.fulfill({contentType:'text/html',body:html});
   if (url.pathname==='/apartmentnavigation/sharing.js') return route.fulfill({contentType:'text/javascript',body:readFileSync(release+'/sharing.js')});
   if (url.pathname==='/apartmentnavigation/sharing.css') return route.fulfill({contentType:'text/css',body:readFileSync(release+'/sharing.css')});
   return route.abort();
  });
  const page = await context.newPage(); await page.goto('https://www.john-ta.com/apartmentnavigation/');
  await page.locator('#password').fill('test-only'); await page.getByRole('button',{name:'Unlock',exact:true}).click();
  await page.locator('#apartment-share').click(); await page.locator('#create-share').click();
  await page.locator('#share-result:not([hidden])').waitFor();
  assert.match(page.url(),/view=share/); const link=await page.locator('#share-url').inputValue();
  await page.locator('#apartment-share-title').click(); assert.equal(await page.locator('dialog').evaluate(d=>d.open),true);
  await page.mouse.click(2,2);assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
  await page.goBack();assert.equal(await page.locator('dialog').evaluate(d=>d.open),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
  await page.locator('#apartment-share').click(); await page.reload();
  await page.locator('#password').fill('test-only'); await page.getByRole('button',{name:'Unlock',exact:true}).click();
  await page.locator('dialog[open]').waitFor();
  const recipient = await context.newPage(); await recipient.goto(link); await recipient.getByRole('heading',{name:'Example address'}).waitFor();
  assert.equal(await recipient.locator('#password').count(),0); assert.equal(await recipient.locator('#apartment-share').count(),0);
  await recipient.reload(); await recipient.getByRole('heading',{name:'Example address'}).waitFor();
  assert.equal(await recipient.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  expired=true; await recipient.reload();await recipient.getByText('This share link has expired. Ask for a new link.').waitFor();
  await context.close();
 }finally{await browser.close();}
});
