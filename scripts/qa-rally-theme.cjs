// Synthetic, isolated browser QA; no production requests or real trip data.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const auditContrast=require('./rally-contrast-audit.cjs');
const contrastIssues=[];
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
window.qaToast=showToast;
window.qaHideToast=()=>{el.toast.hidePopover?.();el.toast.hidden=true;};
`;
fixture.lineup=JSON.parse(fs.readFileSync(process.env.RALLY_QA_LINEUP||path.join(__dirname,'fixtures/niteharts-2026.json'),'utf8'));
fixture.lineupSource='https://www.niteharts.com/schedule';
const qaBootstrap=bootstrap.replace(/data=\{.*?\};events=/,`data=${JSON.stringify(fixture)};events=`);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const errors=[];const output=process.env.RALLY_QA_OUTPUT||'/tmp/rally-ui-qa';fs.mkdirSync(output,{recursive:true});
 for(const [label,width,height] of [['desktop',1440,1060],['tablet',768,1024],['mobile',390,844],['small',320,740]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'reduce',colorScheme:'dark'});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='127.0.0.1')return route.abort();
   if(url.pathname==='/tools/rally/app.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(root+'/tools/rally/app.js','utf8').replace('\ninit();','')+qaBootstrap});
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
  contrastIssues.push(...await auditContrast(page,label+' project menu'));
  await page.locator('#eventMenu .event-history-banner button').click();
  await page.locator('.search-select-trigger').first().click();
  await page.locator('.search-select-input:visible').fill('restored');
  assert.equal(await page.locator('.search-select-option:visible').count(),1);
  await page.keyboard.press('Escape');
  await page.locator('#dialogRoot .dialog-close').click();
  await page.evaluate(()=>window.qaHideToast());
  if(width<=900){await page.locator('#closeMenu').click();await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=0);}
  for(const view of ['home','travel','stay','crew','passes','tasks','notes','lineup']){
   await page.evaluate(view=>window.qaShow(view),view);
   await page.screenshot({path:`${output}/${label}-${view}.png`,fullPage:view!=='lineup'});
   contrastIssues.push(...await auditContrast(page,label+' '+view));
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   assert(!overflow,label+' '+view+' overflows viewport');
   if(view==='lineup'){
    const source=page.locator('rally-lineup .lineup-source');
    assert(await source.isVisible(),'Real event source attribution must be in the audit fixture');
    assert.equal(await source.getAttribute('href'),fixture.lineupSource);
    assert.equal(await source.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    await source.hover();contrastIssues.push(...await auditContrast(page,label+' official source hover'));
    await source.focus();contrastIssues.push(...await auditContrast(page,label+' official source focus'));
    await page.screenshot({path:`${output}/${label}-official-source.png`});
    await source.evaluate(el=>el.blur());
   }
  }
  // Notes' Tapback picker, rich-text link controls, and global search use their
  // real event handlers with fake data. No mutations are submitted.
  await page.evaluate(()=>window.qaShow('stay'));
  await page.locator('.reaction-picker > summary').first().scrollIntoViewIfNeeded();
  await page.locator('.reaction-picker > summary').first().click();
  await page.screenshot({path:`${output}/${label}-reactions.png`});
  contrastIssues.push(...await auditContrast(page,label+' reactions'));
  const reactionBounds=await page.locator('.reaction-picker .note-reactions').first().boundingBox();
  assert(reactionBounds.x>=0&&reactionBounds.x+reactionBounds.width<=width+1,label+' reaction picker clipped');
  await page.evaluate(()=>{window.scrollTo(0,0);window.qaShow('lineup');openProjectSearch();});
  await page.locator('#projectSearchInput').fill('valorant');
  assert.equal(await page.locator('#searchResults a').count(),11);
  await page.evaluate(()=>window.qaToast('Could not save. Reconnect and try again.'));
  assert(await page.locator('#toast').evaluate(el=>el.matches(':popover-open')));
  await page.screenshot({path:`${output}/${label}-search-toast.png`});
  contrastIssues.push(...await auditContrast(page,label+' search'));
  await page.locator('#projectSearch header button').click();
  await page.evaluate(()=>window.qaHideToast());
  await page.evaluate(()=>window.qaToast('Could not save. Reconnect and try again.'));
  await page.screenshot({path:`${output}/${label}-shell-toast.png`});
  contrastIssues.push(...await auditContrast(page,label+' shell toast'));
  await page.evaluate(()=>window.qaDialog());
  await page.locator('.search-select-trigger').first().click();
  const search=page.locator('.search-select-input:visible');await search.fill('progress');
  assert.equal(await page.locator('.search-select-option:visible').count(),1);
  await page.screenshot({path:`${output}/${label}-picker.png`});
  contrastIssues.push(...await auditContrast(page,label+' picker'));
  await search.press('Enter');assert.equal(await page.locator('select[name=status]').inputValue(),'doing');
  await page.evaluate(()=>window.qaToast('Could not save. Reconnect and try again.'));
  assert(await page.locator('#toast').isVisible());
  await page.screenshot({path:`${output}/${label}-dialog-toast.png`});
  await page.locator('#dialogRoot .dialog-close').click();
  await page.evaluate(()=>window.qaHideToast());
  // Lost Lands exercises the timed schedule and the full mobile filter sheet.
  await page.evaluate(()=>window.qaShow('lineup',true));
  if(width<=760){
   await page.locator('#filter-toggle').click();
   await page.locator('[data-filter="stages"] .filter-trigger').click();
   await page.locator('[data-filter="stages"] .filter-search').fill('crater');
   assert.equal(await page.locator('[data-filter="stages"] .filter-option:visible').count(),1);
   await page.screenshot({path:`${output}/${label}-filters.png`});
   contrastIssues.push(...await auditContrast(page,label+' filters'));
   await page.keyboard.press('Escape');
  }
  await page.locator('#timeline-view-button').click();
  await page.locator('.timeline-set').first().click();
  await page.evaluate(()=>RallyLineup.receive({type:'rally-lineup-favorites-saved'}));
  assert(await page.locator('#toast').isVisible());
  assert.equal(await page.locator('rally-lineup .toast').count(),0);
  const toastBounds=await page.locator('#toast').boundingBox();
  assert(toastBounds.x>=0&&toastBounds.x+toastBounds.width<=width+1);
  if(width<=900){const navBounds=await page.locator('#mobileNav').boundingBox();assert(toastBounds.y+toastBounds.height<=navBounds.y,label+' toast overlaps bottom navigation');}
  await page.screenshot({path:`${output}/${label}-timeline.png`});
  contrastIssues.push(...await auditContrast(page,label+' timeline toast'));
  await page.locator('#popularity-sort').click();
  await page.screenshot({path:`${output}/${label}-sort.png`});
  contrastIssues.push(...await auditContrast(page,label+' sort'));
  await page.keyboard.press('Escape');
  for(const view of ['board','heat']){
   await page.locator(view==='board'?'#poster-view-button':'#heat-view-button').click();
   await page.screenshot({path:`${output}/${label}-${view}.png`});
   contrastIssues.push(...await auditContrast(page,label+' '+view));
  }
  await page.evaluate(()=>{document.getElementById('accessGate').hidden=false;document.getElementById('rallyApp').hidden=true;});
  await page.screenshot({path:`${output}/${label}-signin.png`});
  await context.close();
 }
 await browser.close();assert.deepEqual(errors,[]);
 fs.writeFileSync(output+'/contrast-issues.json',JSON.stringify(contrastIssues,null,2));
 console.log('All widths passed: sections, overflow, searchable dialog, mobile filters, and timeline. Screenshots: '+output);
  console.log('Computed contrast findings: '+contrastIssues.length+' (see contrast-issues.json)');
 assert.equal(contrastIssues.length,0,'Contrast regressions; see contrast-issues.json');
})().catch(error=>{console.error(error);process.exit(1);});
