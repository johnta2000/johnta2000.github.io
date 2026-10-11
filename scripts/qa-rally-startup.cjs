// Slow-auth startup checks with synthetic data only; never contact production.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const room={id:'midnight-carnival-rl-grime-2026',name:'Midnight Carnival',startsAt:'2026-10-31',endsAt:'2026-11-01',location:'San Francisco',projectTheme:'midnight',currentMemberId:'qa',members:[{id:'qa',name:'Alex',role:'admin',status:'confirmed'}],rooms:[],passes:[],travel:[],cars:[],tasks:[],notes:[],lineup:[],currentLineupFavorites:[],lineupInterests:{}};
const bootstrap=`
window.Clerk={isSignedIn:true,user:{id:'qa'},load:()=>new Promise(resolve=>window.qaAuthReady=resolve)};
window.convexQuery=async(path,args)=>path==='rally:listEvents'?[{id:'lost-lands-2026',name:'Lost Lands',eventVisibility:'past',startsAt:'2026-09-18',endsAt:'2026-09-20'},${JSON.stringify(room)}]:${JSON.stringify(room)};
window.convexMutation=async(path,args)=>new Promise(resolve=>window.qaRoomReady=()=>resolve(${JSON.stringify(room)}));
window.qaBoot=init();
`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const errors=[],output=process.env.RALLY_QA_OUTPUT||'/tmp/rally-startup-qa';fs.mkdirSync(output,{recursive:true});
 try{
  for(const width of [1440,390,320])for(const scenario of ['cached','fresh','generic']){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
   if(scenario==='cached')await context.addInitScript(({id})=>{
    localStorage.setItem('rally-project-palettes-v1',JSON.stringify([[id,'midnight']]));
    localStorage.setItem('rally-offline-v1',JSON.stringify({version:1,userId:'qa',events:[],rooms:{},pending:{}}));
   },room);
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname.startsWith('clerk.'))return route.fulfill({contentType:'application/javascript',body:''});
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(url.pathname==='/tools/rally/app.js')return route.fulfill({contentType:'application/javascript; charset=utf-8',body:fs.readFileSync(root+'/tools/rally/app.js','utf8').replace('\ninit();','')+bootstrap});
    return route.continue();
   });
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('net::ERR_FAILED'))console.error(message.text());});
   await page.goto((process.env.RALLY_QA_URL||'http://127.0.0.1:8791')+'/tools/rally/?view=passes'+(scenario==='generic'?'':'&event='+room.id));
   await page.waitForFunction(()=>typeof window.qaAuthReady==='function');
   assert(await page.locator('.rally-loader').isVisible());assert(!await page.locator('#rallyApp').isVisible());
   assert(!await page.getByText("Lost Lands '26",{exact:true}).isVisible());
   const loadingColor=await page.locator('.rally-loader').evaluate(el=>getComputedStyle(el).backgroundColor);
   assert.equal(loadingColor,scenario==='cached'?'rgb(20, 19, 30)':'rgb(24, 24, 27)');
   await page.screenshot({path:`${output}/${width}-${scenario}-auth.png`});
   await page.evaluate(()=>window.qaAuthReady());await page.waitForFunction(()=>typeof window.qaRoomReady==='function');
   assert(await page.locator('.rally-loader').isVisible());assert(!await page.locator('#rallyApp').isVisible());
   await page.evaluate(()=>window.qaRoomReady());await page.waitForFunction(()=>!document.body.classList.contains('booting'));
   await page.locator('#rallyApp').waitFor({state:'visible',timeout:3000});
   assert.equal(await page.locator('html').getAttribute('data-project-theme'),'midnight');
   assert.equal(await page.locator('#eventName').textContent(),'Midnight Carnival');
   assert(await page.locator('#rallyApp').isVisible());assert(!await page.locator('.rally-loader').isVisible());
   assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(20, 19, 30)');
   assert.equal(await page.evaluate(()=>new URLSearchParams(location.search).get('event')),room.id);
   assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
   await page.screenshot({path:`${output}/${width}-${scenario}-ready.png`});await context.close();
  }
 }finally{await browser.close();}
 console.log(JSON.stringify({errors,output},null,2));assert.equal(errors.length,0);
})().catch(error=>{console.error(error);process.exitCode=1;});
