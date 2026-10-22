// Isolated regression checks: synthetic crew only, with all external traffic blocked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=process.env.RALLY_PLAYWRIGHT?require(process.env.RALLY_PLAYWRIGHT):require('playwright');
const auditContrast=require('./rally-contrast-audit.cjs');
const root=path.resolve(__dirname,'..'),engine=process.env.RALLY_BROWSER||'chromium',output='/tmp/rally-product-audit-'+engine;
const fixture={id:'audit-fixture',name:'Test weekend',startsAt:'2027-01-21',endsAt:'2027-01-21',eventTimeZone:'America/Los_Angeles',projectTheme:'midnight',isAdmin:true,currentMemberId:'alex',members:[{id:'alex',name:'Alex',role:'admin',status:'confirmed',origin:'SFO'},{id:'sam',name:'Sam',role:'member',status:'confirmed',origin:'LAX'}],rooms:[{id:'room',hotel:'Example hotel',roomType:'Queen',capacity:1,bathrooms:1,memberIds:['alex']}],cars:[],travel:[],passes:[],tasks:[],notes:[],lineup:[]};
const bootstrap=`
data=${JSON.stringify(fixture)};events=[data];activeEvent=data.id;activeView='crew';offlineMode=false;
window.RallyCrewLocation=undefined;wireShell();render();el.accessGate.hidden=true;el.rallyApp.hidden=false;document.body.classList.remove('booting');
window.qaEdit=()=>openLineupArtist({id:'test-set',artist:'Example artist',festivalDate:'2027-01-21',day:'Thursday',start:'2027-01-21T23:30',end:'2027-01-22T01:00'});
window.qaFail=()=>{convexMutation=async()=>{throw Error('That room is full. Choose another room or update its capacity.');};openAssign('room');};
`;
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=engine==='webkit'?await webkit.launch({headless:true,executablePath:'/Users/johnta/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}):await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const errors=[],contrast=[];
 try{
  for(const width of [320,390,1440]){
   const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();
    if(url.pathname==='/tools/rally/app.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(root+'/tools/rally/app.js','utf8').replace('\ninit();','')+bootstrap});
    return route.continue();
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto((process.env.RALLY_QA_URL||'http://127.0.0.1:8797')+'/tools/rally/');await page.locator('.checks').first().waitFor();
   assert.match(await page.locator('.checks').first().textContent(),/✓ Stay/);
   assert.match(await page.locator('.checks').nth(1).textContent(),/○ Stay/);
   await page.locator('#accountButton').focus();await page.evaluate(()=>qaEdit());
   const dialog=page.getByRole('dialog');assert.equal(await dialog.getAttribute('aria-modal'),'true');
   assert.equal(await dialog.locator('[name=start]').inputValue(),'2027-01-21T23:30');
   assert.equal(await dialog.locator('[name=end]').inputValue(),'2027-01-22T01:00');
   assert(await page.evaluate(()=>document.getElementById('rallyApp').inert));
   await page.keyboard.press('Shift+Tab');assert(await page.locator('#deleteLineupArtist').evaluate(el=>el===document.activeElement));
   await page.keyboard.press('Tab');assert(await page.locator('.dialog-close').evaluate(el=>el===document.activeElement));
   for(const field of await dialog.locator('input').all())assert(await field.evaluate(el=>{const b=el.getBoundingClientRect();return b.x>=0&&b.right<=innerWidth+1;}),'Field overflow at '+width);
   assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   contrast.push(...await auditContrast(page,width+' artist editor'));
   await page.screenshot({path:`${output}/${width}-artist-editor.png`});
   await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert(await page.locator('#accountButton').evaluate(el=>el===document.activeElement));
   await page.evaluate(()=>qaFail());await page.locator('#dialogRoot [type=submit]').click();
   await page.getByText('That room is full. Choose another room or update its capacity.',{exact:true}).waitFor();
   assert(await page.locator('#dialogRoot [type=submit]').isEnabled());
   await page.locator('#dialogRoot .search-select-trigger').first().click();
   await page.locator('#dialogRoot .search-select-input:visible').fill('Sam');await page.locator('#dialogRoot .search-select-option:visible').click();
   assert.equal(await page.locator('#dialogRoot [name=memberId]').inputValue(),'sam');
   await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(contrast,[]);
  console.log(engine+': 320/390/1440px artist times, retryable errors, crew readiness, keyboard dialog navigation and searchable room assignment passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
