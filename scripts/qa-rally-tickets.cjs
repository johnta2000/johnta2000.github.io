// Ticket UI QA uses synthetic crew/purchases and blocks all production traffic.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const auditContrast=require('./rally-contrast-audit.cjs'),root=path.resolve(__dirname,'..');
const members=['Alex','Sam','Riley','Morgan','Kai','Jamie','Drew','Quinn','Taylor','Casey'].map((name,i)=>({id:'person-'+i,name,initials:name[0],role:i?'member':'admin',status:i>2?'not_invited':'confirmed',origin:'TBD',color:'purple'}));
const fixture={id:'midnight-carnival-rl-grime-2026',name:'Midnight Carnival Block Party ft. RL GRIME',startsAt:'2026-10-31',endsAt:'2026-11-01',timeZone:'America/Los_Angeles',currentMemberId:members[0].id,isAdmin:false,members,rooms:[],travel:[],cars:[],tasks:[],notes:[],lineup:[],lineupInterests:{},currentLineupFavorites:[],projectTheme:'midnight',passes:[
 {id:'purchase',name:'Midnight Carnival Block Party ft. RL GRIME',quantity:4,category:'Pass',ownerId:members[0].id,unitCost:'60',totalCost:'240',status:'Bought',notes:'Tickets sent separately.',ticketAssignments:[{slot:0,memberId:members[0].id},{slot:1,memberId:members[1].id}]},
 {id:'shuttle',name:'Afterparty add-on',quantity:2,category:'Add-on',ownerId:members[1].id,unitCost:'20',totalCost:'40',ticketAssignments:[]}
]};
const bootstrap=`
data=${JSON.stringify(fixture)};events=[data];activeEvent=data.id;activeView='passes';offlineMode=false;
wireShell();render();el.accessGate.hidden=true;el.rallyApp.hidden=false;document.body.classList.remove('booting');
window.qaTheme=id=>{closeDialog();data.projectTheme=id;data.passes=${JSON.stringify(fixture.passes)};applyProjectTheme();render();};
window.convexMutation=async(path,args)=>{if(path!=='rallyTickets:update')throw Error('Unexpected mutation '+path);if(args.action==='assign'){const pass=data.passes.find(p=>p.id===args.payload.passId);pass.ticketAssignments=pass.ticketAssignments.filter(a=>a.slot!==args.payload.slot);if(args.payload.memberId)pass.ticketAssignments.push({slot:args.payload.slot,memberId:args.payload.memberId});}return {passes:structuredClone(data.passes)};};
`;
(async()=>{
 const output=process.env.RALLY_QA_OUTPUT||'/tmp/rally-tickets-qa';fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[],findings=[];
 try{
  for(const width of [1440,768,390,320]){
   const context=await browser.newContext({viewport:{width,height:960},serviceWorkers:'block',reducedMotion:'reduce'});
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();if(url.pathname==='/tools/rally/app.js')return route.fulfill({contentType:'application/javascript; charset=utf-8',body:fs.readFileSync(root+'/tools/rally/app.js','utf8').replace('\ninit();','')+bootstrap});return route.continue();});
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
   await page.goto((process.env.RALLY_QA_URL||'http://127.0.0.1:8791')+'/tools/rally/?view=passes&event='+fixture.id);
   for(const theme of ['midnight','niteharts','warm','ocean']){
    await page.evaluate(theme=>window.qaTheme(theme),theme);
    const label=theme+'-'+width;
    const card=page.locator('.purchase-card').first(),menu=card.locator('.card-menu');
    assert.equal(await card.locator('[data-ticket-slot]').count(),4);
    const mb=await menu.boundingBox(),qb=await card.locator('.quantity-pill').boundingBox();
    assert(mb.width>=44&&mb.height>=44);assert(qb.x+qb.width<mb.x,'Quantity and ellipsis overlap');
    if(['midnight','niteharts'].includes(theme))assert.notEqual(await menu.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
    findings.push(...await auditContrast(page,label+' tickets'));
    await page.screenshot({path:`${output}/${label}-tickets.png`,fullPage:true,animations:'disabled'});
    assert(await page.locator('.ticket-distribution-table').isVisible());
    assert.equal(await page.locator('.ticket-distribution-table tbody tr').count(),10);
    assert.equal(await page.locator('.ticket-distribution-table thead th').count(),3);
    const distribution=page.locator('.ticket-distribution-scroll');
    const initialNameX=(await page.locator('.ticket-distribution-table tbody th').first().boundingBox()).x;
    await distribution.evaluate(el=>{el.scrollLeft=120;});
    assert.equal((await page.locator('.ticket-distribution-table tbody th').first().boundingBox()).x,initialNameX,'Crew column remains pinned while scrolling');
    await distribution.evaluate(el=>{el.scrollLeft=0;});
    findings.push(...await auditContrast(page,label+' coverage'));
    await page.locator('.ticket-coverage-list>summary').click();
    await menu.click();assert(await page.locator('[name=quantity]').isVisible());
    findings.push(...await auditContrast(page,label+' edit purchase'));
    await page.locator('#dialogRoot .dialog-close').click();
    // Keep the notes draft intact while assignments update around it.
    await page.locator('.rich-note-input').fill('Unsaved notes draft');
    await card.locator('[data-ticket-slot="2"]').click();
    const trigger=page.locator('#dialogRoot .search-select-trigger');await trigger.click();
    const search=page.locator('.search-select-input:visible');await search.fill('not-a-person');
    assert(await page.locator('.search-select-empty:visible').isVisible());
    await search.fill('Kai');assert.equal(await page.locator('.search-select-option:visible').count(),1);
    findings.push(...await auditContrast(page,label+' assignment picker'));
    const pb=await page.locator('.search-select-panel:visible').boundingBox();assert(pb.x>=0&&pb.x+pb.width<=width+1&&pb.y>=0&&pb.y+pb.height<=960+1);
    await page.screenshot({path:`${output}/${label}-assignment.png`,animations:'disabled'});
    await search.press('Escape');assert(await trigger.evaluate(el=>el===document.activeElement));
    await trigger.click();await search.fill('Kai');await search.press('Enter');
    assert.equal(await page.locator('select[name=memberId]').inputValue(),'person-4');
    await page.locator('#dialogRoot [type=submit]').click();await page.locator('#dialogRoot form').waitFor({state:'detached'});
    assert((await card.locator('[data-ticket-slot="2"]').innerText()).includes('Kai'));
    assert((await page.locator('.ticket-coverage').innerText()).includes('3 of 10'));
    assert.equal(await page.locator('.rich-note-input').innerText(),'Unsaved notes draft');
    await card.locator('[data-ticket-slot="2"]').click();await trigger.click();await search.fill('Unassigned');await search.press('Enter');
    await page.locator('#dialogRoot [type=submit]').click();await page.locator('#dialogRoot form').waitFor({state:'detached'});
    assert((await card.locator('[data-ticket-slot="2"]').innerText()).includes('Assign to someone'));
   }
   await context.close();
  }
 }finally{await browser.close();}
 console.log(JSON.stringify({errors,contrastFindings:findings,output},null,2));assert.equal(errors.length,0);assert.equal(findings.length,0);
})().catch(error=>{console.error(error);process.exitCode=1;});
