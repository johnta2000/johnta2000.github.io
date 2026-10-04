// Synthetic, isolated browser QA; no production requests or real trip data.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const members=[['alex','Alex','SFO'],['sam','Sam','SFO'],['riley','Riley','LAX']].map(([id,name,origin],i)=>({id,name,origin,initials:name[0],color:['green','orange','purple'][i],role:i?'member':'admin',status:'confirmed',lineupFavorites:[]}));
const fixture={id:'niteharts-festival-2026',name:'Niteharts',presenter:'Your festival weekend',location:'San Diego, CA',startsAt:'2026-10-09',endsAt:'2026-10-11',timeZone:'America/Los_Angeles',currentMemberId:'alex',isAdmin:true,members,
 rooms:[{id:'room1',hotel:'Harbor House',address:'100 Example Street, San Diego, CA',roomType:'Two queen beds',capacity:4,bathrooms:1,memberIds:['alex','sam'],notes:'Check-in Friday · 3 PM',confirmation:''}],
 travel:['alex','sam'].flatMap(memberId=>[{id:memberId+'out',memberId,airline:'Alaska',number:'501',origin:'SFO',destination:'SAN',departure:'2026-10-09T07:03',arrival:'2026-10-09T08:45',confirmation:''},{id:memberId+'back',memberId,airline:'Alaska',number:'453',origin:'SAN',destination:'SFO',departure:'2026-10-12T18:51',arrival:'2026-10-12T20:33',confirmation:''}]),
 cars:[],passes:[],tasks:[{id:'task1',title:'Book the airport ride',status:'todo',category:'Travel',assigneeId:'alex',dueDate:'2026-10-08'}],notes:[{id:'note1',section:'stay',body:'Check-in starts at 3 PM. We can leave our bags at the front desk before then.',authorId:'sam',createdAt:1791057600000,updatedAt:1791057600000,reactions:{like:['alex']}}],
 lineup:[{id:'fri-isoxo',name:'ISOxo',day:'Friday',date:'2026-10-09',estimatedOrder:3},{id:'sat-2hollis',name:'2hollis',day:'Saturday',date:'2026-10-10',estimatedOrder:2},{id:'sat-isoknock',name:'ISOKNOCK',day:'Saturday',date:'2026-10-10',estimatedOrder:3},{id:'sat-underscores',name:'underscores',day:'Saturday',date:'2026-10-10',estimatedOrder:1}],lineupInterests:{'sat-2hollis':[members[0],members[1]],'sat-isoknock':[members[2]]},currentLineupFavorites:['sat-2hollis']};
const bootstrap=`
data=${JSON.stringify(fixture)};events=[data,{...data,id:'past-room',name:'Previous festival',startsAt:'2026-09-18',endsAt:'2026-09-20'}];
activeEvent=data.id;activeView=new URLSearchParams(location.search).get('view')||'home';offlineMode=false;shellSaved=true;
window.RallyCrewLocation=undefined;
wireShell();const banner=document.createElement('div');banner.id='offlineStatus';el.page.before(banner);
render();el.accessGate.hidden=true;el.rallyApp.hidden=false;document.body.classList.remove('booting');
window.qaShow=(view,lost=false)=>{if(lost){data={...data,id:DEFAULT_EVENT,name:"Lost Lands '26",startsAt:'2026-09-18',endsAt:'2026-09-20',timeZone:'America/New_York',lineup:window.LOST_LANDS_SET_TIMES,lineupHiddenDays:['Wednesday','Thursday']};activeEvent=data.id;}activeView=view;render();};
window.qaDialog=()=>openTask();
`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const errors=[];const output=process.env.RALLY_QA_OUTPUT||'/tmp/rally-ui-qa';fs.mkdirSync(output,{recursive:true});
 for(const [label,width,height] of [['desktop',1440,1060],['mobile',390,844],['small',320,740]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='127.0.0.1')return route.abort();
   if(url.pathname==='/tools/rally/app.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(root+'/tools/rally/app.js','utf8').replace('\ninit();','')+bootstrap});
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(label+': '+e.message));
  await page.goto('http://127.0.0.1:8790/tools/rally/?view=home');
  await page.locator('.overview-tile').first().waitFor();
  if(width<=900)await page.locator('#openMenu').click();
  await page.locator('#eventSwitcher').click();
  const roomSearch=page.getByRole('searchbox',{name:'Find a rave room'});
  await roomSearch.fill('previous');
  assert.equal(await page.locator('#eventMenu button[data-event]:visible').count(),1);
  await roomSearch.fill('not-an-event');
  assert(await page.locator('.event-menu-empty').isVisible());
  await roomSearch.fill('');
  await page.screenshot({path:`${output}/${label}-rooms.png`});
  await page.locator('#eventMenu .event-history-banner button').click();
  await page.locator('.search-select-trigger').first().click();
  await page.locator('.search-select-input:visible').fill('restored');
  assert.equal(await page.locator('.search-select-option:visible').count(),1);
  await page.keyboard.press('Escape');
  await page.locator('#dialogRoot .dialog-close').click();
  if(width<=900){await page.locator('#closeMenu').click();await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=0);}
  for(const view of ['home','travel','stay','crew','passes','tasks','notes','lineup']){
   await page.evaluate(view=>window.qaShow(view),view);
   await page.screenshot({path:`${output}/${label}-${view}.png`,fullPage:view!=='lineup'});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   assert(!overflow,label+' '+view+' overflows viewport');
  }
  await page.evaluate(()=>window.qaDialog());
  await page.locator('.search-select-trigger').first().click();
  const search=page.locator('.search-select-input:visible');await search.fill('progress');
  assert.equal(await page.locator('.search-select-option:visible').count(),1);
  await page.screenshot({path:`${output}/${label}-picker.png`});
  await search.press('Enter');assert.equal(await page.locator('select[name=status]').inputValue(),'doing');
  await page.locator('#dialogRoot .dialog-close').click();
  // Lost Lands exercises the timed schedule and the full mobile filter sheet.
  await page.evaluate(()=>window.qaShow('lineup',true));
  if(width<=760){
   await page.locator('#filter-toggle').click();
   await page.locator('[data-filter="stages"] .filter-trigger').click();
   await page.locator('[data-filter="stages"] .filter-search').fill('crater');
   assert.equal(await page.locator('[data-filter="stages"] .filter-option:visible').count(),1);
   await page.screenshot({path:`${output}/${label}-filters.png`});
   await page.keyboard.press('Escape');
  }
  await page.locator('#timeline-view-button').click();
  await page.screenshot({path:`${output}/${label}-timeline.png`});
  for(const view of ['board','heat']){
   await page.locator(view==='board'?'#poster-view-button':'#heat-view-button').click();
   await page.screenshot({path:`${output}/${label}-${view}.png`});
  }
  await page.evaluate(()=>{document.getElementById('accessGate').hidden=false;document.getElementById('rallyApp').hidden=true;});
  await page.screenshot({path:`${output}/${label}-signin.png`});
  await context.close();
 }
 await browser.close();assert.deepEqual(errors,[]);console.log('All widths passed: sections, overflow, searchable dialog, mobile filters, and timeline. Screenshots: '+output);
})().catch(error=>{console.error(error);process.exit(1);});
