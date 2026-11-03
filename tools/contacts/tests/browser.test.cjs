const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../../..'),pageRoot=path.join(root,'tools/contacts');
const group=fs.readdirSync(pageRoot).find(n=>/^[a-f0-9]{32}$/.test(n));
const bundle=esbuild.buildSync({entryPoints:[path.join(root,'convex/contactShareLogic.ts')],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
const mod={exports:{}};new Function('module','exports',bundle)(mod,mod.exports);const {serveContactShare}=mod.exports;
const contacts=Array.from({length:10},(_,i)=>({id:`p${String(i+1).padStart(2,'0')}`,first:`Friend ${i+1}`,last:'Example',phone:`+120255501${String(i).padStart(2,'0')}`}));
test('desktop and mobile: deep links, selection history, downloads, failures and expiration',{timeout:120000},async()=>{
 const server=http.createServer((req,res)=>{let filename=path.join(root,decodeURIComponent(new URL(req.url,'http://local').pathname));if(filename.endsWith('/'))filename+='index.html';if(!filename.startsWith(root)){res.writeHead(404).end();return;}try{const content=fs.readFileSync(filename);res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.svg')?'image/svg+xml':'text/html');res.end(content);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,url=`${base}/tools/contacts/${group}/`;
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{for(const [device,viewport]of [['desktop',{width:1360,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport,acceptDownloads:true});const page=await context.newPage();let expiresAt=Date.now()+604800000,failDownload=false;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://rapid-shark-565.convex.site/contact-share',async route=>{
   const req=route.request(),body=req.postData()||'';if(failDownload&&body.includes('download')){await route.abort('failed');return;}
   const response=await serveContactShare(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.method()==='POST'?body:undefined}),JSON.stringify({[group]:{title:'Test group',expiresAt,contacts}}));
   const headers=Object.fromEntries(response.headers);headers['access-control-allow-origin']=base;
   await route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto(url);await page.locator('.contact').nth(9).waitFor();assert.equal(await page.locator('.contact').count(),10);
  assert(await page.locator('#selected').isDisabled());
  await page.getByRole('checkbox',{name:'Select Friend 1 Example',exact:true}).check();
  await page.getByRole('checkbox',{name:'Select Friend 2 Example',exact:true}).check();
  const copied=page.url();assert(copied.includes('pick=p01%2Cp02'));assert(!copied.includes('Friend'));
  await page.reload();await page.locator('.contact').nth(9).waitFor();assert.equal(await page.locator('input:checked').count(),2);
  await page.goBack();assert.equal(await page.locator('input:checked').count(),1);await page.goForward();assert.equal(await page.locator('input:checked').count(),2);
  const fresh=await context.newPage();await fresh.goto(copied);await fresh.locator('.contact').nth(9).waitFor();assert.equal(await fresh.locator('input:checked').count(),2);await fresh.close();
  async function download(button,count){const waiting=page.waitForEvent('download');await button.click();const d=await waiting;const text=fs.readFileSync(await d.path(),'utf8');assert.equal(text.split('BEGIN:VCARD').length-1,count);assert(text.includes('VERSION:3.0'));return text;}
  assert(!(await download(page.locator('#selected'),2)).includes('Friend 3'));
  await download(page.locator('#everyone'),10);
  await download(page.getByRole('button',{name:'Save Friend 3 Example',exact:true}),1);
  failDownload=true;await page.locator('#selected').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('try again'));assert.equal(await page.locator('input:checked').count(),2);failDownload=false;await download(page.locator('#selected'),2);
  await page.locator('#select-all').click();assert.equal(await page.locator('input:checked').count(),10);await page.locator('#clear').click();assert.equal(await page.locator('input:checked').count(),0);
  await page.getByRole('checkbox',{name:'Select Friend 1 Example',exact:true}).check();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  await page.screenshot({path:path.join(root,'..',`contacts-${device}.png`),fullPage:true});
  expiresAt=Date.now()-1;await page.locator('#selected').click();await page.getByRole('heading',{name:'This link has expired'}).waitFor();assert.equal(await page.locator('.contact').count(),0);assert(await page.locator('#content').isHidden());
  await page.reload();await page.getByRole('heading',{name:'This link has expired'}).waitFor();assert.equal(await page.locator('.contact').count(),0);
  expiresAt=Date.now()+1500;await page.reload();await page.locator('.contact').nth(9).waitFor();await page.getByRole('heading',{name:'This link has expired'}).waitFor();assert.equal(await page.locator('.contact').count(),0);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
