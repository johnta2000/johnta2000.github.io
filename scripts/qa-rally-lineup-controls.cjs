// Full-shell, synthetic-data regression checks for the phone's first screen.
// Network access outside the local fixture server is blocked. No live writes.
const {chromium,webkit}=process.env.RALLY_PLAYWRIGHT?require(process.env.RALLY_PLAYWRIGHT):require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const auditContrast=require('./rally-contrast-audit.cjs');
const engine=process.env.RALLY_BROWSER||'chromium',base=path.resolve(__dirname,'..'),output='/tmp/rally-lineup-controls-qa'+(engine==='webkit'?'-webkit':'');
const carnival=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/midnight-carnival-2026.json'),'utf8'));
const niteharts={id:'niteharts-festival-2026',name:'Niteharts Festival 2026',startsAt:'2026-10-09',endsAt:'2026-10-11',timeZone:'America/Los_Angeles',lineup:JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/niteharts-2026.json'),'utf8'))};
const members=[{id:'alex',name:'Alex',initials:'A',role:'admin',status:'confirmed',origin:'SFO',color:'green'},{id:'sam',name:'Sam',initials:'S',role:'member',status:'confirmed',origin:'LAX',color:'purple'}];
const fixture={...carnival,currentMemberId:'alex',isAdmin:true,members,rooms:[],cars:[],travel:[],passes:[],tasks:[],notes:[],hiddenSections:['stay','travel'],currentLineupFavorites:[carnival.lineup[0].id],lineupInterests:{[carnival.lineup[0].id]:members,[carnival.lineup[1].id]:[members[1]]},projectTheme:'midnight'};
const bootstrap=`
data=${JSON.stringify(fixture)};events=[data];activeEvent=data.id;activeView='lineup';offlineMode=false;shellSaved=true;
window.RallyCrewLocation=undefined;wireShell();const banner=document.createElement('div');banner.id='offlineStatus';el.page.before(banner);
window.qaOpen=(kind='carnival',theme='midnight',admin=true)=>{RallyLineup.destroy();data={...${JSON.stringify(fixture)},...(kind==='niteharts'?${JSON.stringify(niteharts)}:kind==='lost-lands'?{id:DEFAULT_EVENT,name:"Lost Lands '26",startsAt:'2026-09-16',endsAt:'2026-09-20',timeZone:'America/New_York',lineup:LOST_LANDS_SET_TIMES,lineupBlocks:[],lineupHiddenDays:['Wednesday','Thursday']}:{}),projectTheme:theme,isAdmin:admin};events=[data];activeEvent=data.id;activeView='lineup';history.replaceState(null,'','?view=lineup&event='+data.id+'#view=poster');render();banner.textContent='Available offline · Oct 14, 3:20 PM';};
qaOpen();el.accessGate.hidden=true;el.rallyApp.hidden=false;document.body.classList.remove('booting');`;
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=engine==='webkit'?await webkit.launch({headless:true,executablePath:'/Users/johnta/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}):await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[],findings=[],metrics=[];
 try{
  for(const [width,height] of [[390,800],[320,740],[430,932],[768,1024],[1440,1000]]){
   const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce',acceptDownloads:true,isMobile:width<=760,hasTouch:width<=760});
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(u.pathname==='/tools/rally/app.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(base,'tools/rally/app.js'),'utf8').replace('\ninit();','')+bootstrap});return route.continue();});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.clock.setFixedTime(new Date('2026-10-14T22:20:00Z'));
   await page.goto('http://127.0.0.1:8794/tools/rally/');await page.locator('rally-lineup .official-poster-image img').waitFor();
   for(const theme of ['midnight','warm','niteharts','ocean']){
    await page.evaluate(theme=>qaOpen('carnival',theme,true),theme);
    const lineup=page.locator('rally-lineup'),art=lineup.locator('.official-poster-image img');await art.evaluate(img=>img.decode());
    assert(await lineup.locator('#mobile-days').isHidden());
    assert(await lineup.locator('.lineup-admin-actions').isHidden());
    assert(await lineup.locator('.lineup-blocks').isHidden());
    assert(await lineup.locator('#popularity-sort').isHidden());
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
    assert(!await lineup.evaluate(el=>el.scrollWidth>el.clientWidth+1));
    const box=await art.boundingBox(),nav=await page.locator('#mobileNav').boundingBox();
    if(width<=760){
     assert(box.y<400,`Poster begins too low at ${width}px: ${box.y}`);
     assert(nav.y-box.y>200,'The first screen should show real poster artwork, not only controls');
     assert(await lineup.locator('.likes-filter').isHidden());
     assert(await lineup.locator('.lineup-mobile-likes').isVisible());
     for(const button of await lineup.locator('.schedule-actions button:visible,.poster-actions button:visible,.filter-toggle').all()){const b=await button.boundingBox();assert(b.height>=44&&b.width>=44,`Undersized control ${await button.getAttribute('id')}`);assert(b.x>=0&&b.x+b.width<=width+1);}
     // Opened picker must stay open through shadow-root focus/touch retargeting.
     const trigger=lineup.locator('.lineup-mobile-likes .search-select-trigger');await trigger.tap();
     assert(await lineup.evaluate(el=>!el.shadowRoot.activeElement?.matches('input,textarea')),'Touch-opening likes must not focus a text field');
     const pickerBounds=await lineup.locator('.lineup-mobile-likes .search-select-panel').boundingBox();assert(pickerBounds.x>=0&&pickerBounds.x+pickerBounds.width<=width+1&&pickerBounds.y>=0&&pickerBounds.y+pickerBounds.height<=height+1);
     await page.screenshot({path:`${output}/${width}-${theme}-likes-open.png`});
     const input=lineup.getByRole('combobox',{name:'Search filter by likes'});await input.fill('crew');
     assert.equal(await lineup.getByRole('option').count(),1);await lineup.getByRole('option').tap();
     assert.equal(await lineup.locator('#lineup-likes-select').inputValue(),'crew');
     assert.equal(await lineup.locator('.poster-hotspot').count(),2);
     await trigger.click();await input.fill('no such filter');assert(await lineup.locator('.search-select-empty').isVisible());await input.press('Escape');
     await trigger.click();await input.fill('all');await input.press('Enter');
    }
    metrics.push({width,height,theme,posterTop:Math.round(box.y)});
    findings.push(...await auditContrast(page,`${width}-${theme}-lineup`));
    await page.screenshot({path:`${output}/${width}-${theme}-poster.png`});
    assert.equal(await lineup.locator('#lineup-tools-button').count(),0);
    await lineup.locator('#filter-toggle').click();
    const controls=lineup.locator('#filters-dialog');await lineup.locator('[data-filter="stages"] .filter-trigger').click();
    const labels=lineup.locator('[data-filter="stages"] .filter-option:visible');assert.equal(await labels.count(),4);
    const region=await lineup.locator('[data-filter="stages"] .filter-panel').boundingBox();
    for(const option of await labels.all()){const b=await option.boundingBox();assert(b.x>=region.x&&b.x+b.width<=region.x+region.width+1);assert(await option.evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
    assert(await controls.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    assert(await lineup.locator('.lineup-controls-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    findings.push(...await auditContrast(page,`${width}-${theme}-stage-options`));
    await page.screenshot({path:`${output}/${width}-${theme}-stages-open.png`});
    await labels.first().locator('input').check();assert(await lineup.locator('#reset-lineup-controls').isEnabled());
    await lineup.locator('#reset-lineup-controls').click();
    assert(await controls.evaluate(el=>el.open),'Reset must keep the controls sheet open');
    await lineup.locator('[data-controls-tab="tools"]').click();
    const tools=lineup.locator('#lineup-tools');await tools.getByRole('searchbox',{name:'Find lineup option'}).fill('zz-no-match');assert(await tools.locator('.lineup-tools-empty').isVisible());
    await tools.getByRole('searchbox').fill('');await tools.locator('.lineup-event-info summary').click();
    assert(await tools.getByText('Separate ticket required').isVisible());
    const tb=await controls.boundingBox();assert(tb.x>=0&&tb.x+tb.width<=width+1&&tb.y>=0&&tb.y+tb.height<=height+1);
    findings.push(...await auditContrast(page,`${width}-${theme}-options`));
    await page.screenshot({path:`${output}/${width}-${theme}-options.png`});
    await page.keyboard.press('Escape');
   }
   if(width<=430){
    // A reduced visual viewport models the space left above a phone keyboard.
    await page.evaluate(()=>qaOpen('carnival','midnight',true));
    await page.locator('rally-lineup #filter-toggle').click();await page.locator('rally-lineup [data-filter="stages"] .filter-trigger').click();
    const stageSearch=page.locator('rally-lineup [data-filter="stages"] .filter-search');await stageSearch.focus();await page.setViewportSize({width,height:400});await stageSearch.scrollIntoViewIfNeeded();
    const sheet=await page.locator('rally-lineup #filters-dialog').boundingBox(),field=await stageSearch.boundingBox();assert(sheet.y>=0&&sheet.y+sheet.height<=401);assert(field.y>=0&&field.y+field.height<=401);await stageSearch.fill('afterparty');assert.equal(await page.locator('rally-lineup [data-filter="stages"] .filter-option:visible').count(),1);
    await page.screenshot({path:`${output}/${width}-short-stage-search.png`});await page.keyboard.press('Escape');
    await page.locator('rally-lineup .lineup-mobile-likes .search-select-trigger').tap();const likes=page.locator('rally-lineup .lineup-mobile-likes .search-select-panel');const pb=await likes.boundingBox();assert(pb.x>=0&&pb.y>=0&&pb.x+pb.width<=width+1&&pb.y+pb.height<=401);await likes.locator('input').fill('crew');await likes.getByRole('option').tap();
    await page.setViewportSize({width,height});
   }
   // Non-admin and all multi-day projects use the same chrome without leaking tools.
   await page.evaluate(()=>qaOpen('carnival','midnight',false));await page.locator('rally-lineup #filter-toggle').click();await page.locator('rally-lineup [data-controls-tab="tools"]').click();
   assert(await page.locator('rally-lineup #manage-days').isHidden());assert(await page.locator('rally-lineup .lineup-admin-actions').isHidden());await page.keyboard.press('Escape');
   for(const kind of ['niteharts','lost-lands']){
    await page.evaluate(kind=>qaOpen(kind,kind==='niteharts'?'niteharts':'warm'),kind);
    await page.locator('rally-lineup #table-view-button').click();
    if(width<=760)assert(await page.locator('rally-lineup #mobile-days').isVisible());
    await page.locator('rally-lineup #filter-toggle').click();await page.locator('rally-lineup [data-controls-tab="tools"]').click();await page.locator('rally-lineup #popularity-sort').click();
    const sort=page.locator('rally-lineup .sort-dialog');await sort.getByRole('searchbox',{name:'Find sort order'}).fill('liked');assert.equal(await sort.locator('[data-sort]:visible').count(),1);await sort.getByRole('searchbox').press('Enter');
    assert(await page.locator('rally-lineup #lineup-tools').isHidden());
    if(width<=760){await page.locator('rally-lineup #filter-toggle').click();await page.locator('rally-lineup [data-filter="stages"] .filter-trigger').click();await page.locator('rally-lineup [data-filter="stages"] .filter-search').fill(kind==='niteharts'?'valorant':'crater');assert.equal(await page.locator('rally-lineup [data-filter="stages"] .filter-option:visible').count(),1);await page.keyboard.press('Escape');}
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
    await page.screenshot({path:`${output}/${width}-${kind}-schedule.png`});
   }
   await context.close();
  }
 }finally{await browser.close();}
 console.log(JSON.stringify({engine,errors,contrastFindings:findings,metrics,output},null,2));assert.equal(errors.length,0);assert.equal(findings.length,0);
})().catch(e=>{console.error(e);process.exitCode=1;});
