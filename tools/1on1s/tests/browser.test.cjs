const {test} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
test('private journal autosaves, carries context, preserves failed edits and locks on desktop/mobile', async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const width of [1280,390]) {
      const page = await browser.newPage({viewport:{width,height:900}});
      const records = {}; let reads = 0, failSave = false;
      await page.route('https://journal.test/**', route => {
        const file = new URL(route.request().url()).pathname.split('/').pop() || 'index.html';
        route.fulfill({body:fs.readFileSync(path.join('tools/1on1s',file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
      });
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body:''}));
      await page.route('https://clerk.john-ta.com/**', route => route.fulfill({body:'',contentType:'text/javascript'}));
      await page.addInitScript(() => {
        window.__internal_ClerkUICtor = {};
        window.Clerk = { session:{id:'test',getToken:async(options)=>{ if(options?.template) throw new Error('No JWT template exists with name: convex'); return 'jwt'; }},load:async()=>{},addListener:()=>{},mountSignIn:()=>{},signOut:async()=>{} };
      });
      await page.route('https://rapid-shark-565.convex.cloud/api/**', async route => {
        assert.equal(route.request().headers().authorization, 'Bearer jwt');
        const {path:fn,args} = route.request().postDataJSON(); let value;
        if(fn.endsWith(':status')) value={configured:false};
        if(fn.endsWith(':unlock')) value={token:'test-session',expiresAt:Date.now()+3600000};
        if(fn.endsWith(':read')) { reads++; value={current:records[args.month]||null,previous:Object.values(records).filter(r=>r.month<args.month).sort((a,b)=>b.month.localeCompare(a.month))[0]||null}; }
        if(fn.endsWith(':save')) {
          if(failSave) return route.fulfill({json:{status:'error',errorMessage:'Offline test'}});
          await new Promise(resolve=>setTimeout(resolve,80));
          records[args.month]={...args,revision:args.revision+1}; value=args.revision+1;
        }
        await route.fulfill({json:{status:'success',value:value??null}});
      });
      await page.goto('https://journal.test/');
      await page.locator('#unlock').waitFor({state:'visible'});
      assert.equal(reads,0);
      await page.fill('#password','x'); await page.fill('#confirmPassword','x'); await page.click('#unlockButton');
      await page.locator('#journal').waitFor({state:'visible'});
      await page.fill('#notes','Remember this win'); await page.fill('#answer0','Growth feels steady'); await page.fill('#followups','Ask about hiring');
      await page.click('#next');
      await page.waitForFunction(()=>document.querySelector('#previous').textContent.includes('Remember this win'));
      assert.equal(await page.inputValue('#notes'),'');
      assert.ok((await page.locator('#previous').textContent()).includes('Ask about hiring'));
      failSave=true; await page.fill('#notes','Keep my unsaved thought'); await page.click('#next');
      await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('Offline test'));
      assert.equal(await page.inputValue('#notes'),'Keep my unsaved thought');
      failSave=false; await page.click('#save'); await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='All changes saved');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:`/tmp/monthly-journal-${width}.png`,fullPage:true});
      await page.click('#lock'); await page.locator('#gate').waitFor({state:'visible'});
      assert.equal(await page.inputValue('#notes'),''); assert.equal(await page.locator('#previous').textContent(),'');
      assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
      await page.close();
    }
  } finally { await browser.close(); }
});
