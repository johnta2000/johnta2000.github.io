// Geometric regression for the shared header. Synthetic data, no live writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=process.env.RALLY_PLAYWRIGHT?require(process.env.RALLY_PLAYWRIGHT):require('playwright');
const root=path.resolve(__dirname,'..'),base=process.env.RALLY_QA_URL||'http://127.0.0.1:8798',engine=process.env.RALLY_BROWSER||'chromium';
const fixture={id:'midnight-carnival-rl-grime-2026',name:'Midnight Carnival Block Party ft. RL GRIME',startsAt:'2026-10-31',endsAt:'2026-10-31',projectTheme:'midnight',eventTimeZone:'America/Los_Angeles',isAdmin:true,currentMemberId:'alex',members:[{id:'alex',name:'Alex',role:'admin',initials:'A',color:'purple',origin:'SFO'}],rooms:[],travel:[],cars:[],passes:[],tasks:[],lineup:[],notes:[],lineupInterests:{},currentLineupFavorites:[]};
const bootstrap=`
window.Clerk={user:{id:'qa'},isSignedIn:true};data=${JSON.stringify(fixture)};events=[data];activeEvent=data.id;activeView=new URLSearchParams(location.search).get('view')||'home';offlineMode=false;window.RallyCrewLocation=undefined;wireShell();
const banner=document.createElement('div');banner.id='offlineStatus';el.page.before(banner);
window.qaView=(view,admin,theme='midnight')=>{activeView=view;data.isAdmin=admin;data.projectTheme=theme;render();banner.textContent='Available offline · Oct 29, 7:19 PM';};
qaView(activeView,true);el.accessGate.hidden=true;el.rallyApp.hidden=false;document.body.classList.remove('booting');`;
async function check(page,label){
 const metrics=await page.locator('.topbar').evaluate(header=>{
  const h=header.getBoundingClientRect(),banner=document.getElementById('offlineStatus').getBoundingClientRect();
  return {header:{x:h.x,y:h.y,right:h.right,bottom:h.bottom},bannerTop:banner.top,children:[...header.children].filter(el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0).map(el=>{const b=el.getBoundingClientRect();return {id:el.id||el.className||el.tagName,x:b.x,y:b.y,right:b.right,bottom:b.bottom};})};
 });
 for(const item of metrics.children){assert(item.y>=metrics.header.y-1&&item.bottom<=metrics.header.bottom+1,`${label}: ${item.id} wraps outside header`);assert(item.bottom<=metrics.bannerTop+1,`${label}: ${item.id} overlaps status bar`);assert(item.x>=metrics.header.x-1&&item.right<=metrics.header.right+1,`${label}: ${item.id} overflows horizontally`);}
 for(let i=0;i<metrics.children.length;i++)for(let j=i+1;j<metrics.children.length;j++){const a=metrics.children[i],b=metrics.children[j];assert(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1,`${label}: ${a.id} overlaps ${b.id}`);}
 assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),label+': viewport overflow');
}
(async()=>{
 const browser=engine==='webkit'?await webkit.launch({headless:true,executablePath:'/Users/johnta/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}):await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[];
 try{for(const width of [320,390,620,768,900,901,1024,1440,1920]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(u.pathname==='/tools/rally/app.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'tools/rally/app.js'),'utf8').replace('\ninit();','')+bootstrap});return route.continue();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/tools/rally/?event='+fixture.id+'&view=home');await page.locator('#offlineStatus').waitFor();
  for(const admin of [true,false])for(const theme of ['midnight','warm'])for(const view of ['home','crew','stay','travel','passes','tasks','notes','lineup']){await page.evaluate(({view,admin,theme})=>qaView(view,admin,theme),{view,admin,theme});await check(page,width+' '+view+' '+theme+' '+admin);}
  await page.evaluate(()=>qaView('home',true));await page.screenshot({path:'/tmp/raveington-header-'+engine+'-'+width+'.png'});
  if(width===390||width===1440){for(const view of ['home','crew','passes','lineup','notes']){await page.goto(base+'/tools/rally/?event='+fixture.id+'&view='+view);await page.locator('#offlineStatus').waitFor();await check(page,width+' direct '+view);await page.reload();await page.locator('#offlineStatus').waitFor();await check(page,width+' refreshed '+view);}await page.goBack();await check(page,width+' back');await page.goForward();await check(page,width+' forward');}
  await context.close();
 }assert.deepEqual(errors,[]);console.log(engine+': header controls stay within one row and above the status bar across nine widths, all sections, both admin states and light/dark themes. Direct links, refresh and history passed.');}finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
