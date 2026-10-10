// Isolated synthetic schedule QA. Never contacts or mutates production data.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const auditContrast=require('./rally-contrast-audit.cjs');
const lineup=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/niteharts-2026.json'),'utf8'));
const event={id:'niteharts-festival-2026',name:'Niteharts',timeZone:'America/Los_Angeles',startsAt:'2026-10-09',endsAt:'2026-10-11',lineup};
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/tools/rally/theme.css"><link rel="stylesheet" href="/tools/rally/project-theme.css"><style>body{margin:0;background:var(--paper);color:var(--ink)}#preview{height:100vh}</style></head><body><section id="preview"></section>
<script>const NativeDate=Date;let qaNow='2026-10-10T18:28:00Z';window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[qaNow]));}static now(){return new NativeDate(qaNow).getTime();}};</script>
<script src="/tools/rally/project-theme.js"></script><script src="/lost-lands-2026-lineup/set-times.js"></script><script src="/lost-lands-2026-lineup/controller.js"></script><script src="/tools/rally/lineup-template.js"></script><script src="/tools/rally/lineup.js"></script>
<script>const event=${JSON.stringify(event)},state={type:'rally-lineup-state',artistIds:['fri-main-devault'],interests:{},currentMember:{id:'qa',name:'Alex'},hiddenDays:[]};const changes=[];const options={container:document.getElementById('preview'),key:'preview',event,state,params:'days=Friday',onEvent:m=>changes.push(m),onParams:()=>{},shareUrl:location.href};RallyLineup.show(options);window.qaTheme=theme=>{state.projectTheme=theme;RallyProjectThemes.apply(theme);RallyLineup.receive(state);};window.qaRoute=params=>RallyLineup.show({...options,params});window.qaTime=time=>{qaNow=time;document.dispatchEvent(new Event('visibilitychange'));};</script></body></html>`;
(async()=>{
 const output=process.env.RALLY_QA_OUTPUT||'/tmp/rally-past-days-qa';fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const findings=[],errors=[];
 try{
  for(const width of [1440,390,320]){
   const context=await browser.newContext({viewport:{width,height:960},serviceWorkers:'block',reducedMotion:'reduce'});
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();if(url.pathname==='/past-days-qa')return route.fulfill({contentType:'text/html',body:html});return route.continue();});
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
   await page.goto((process.env.RALLY_QA_URL||'http://127.0.0.1:8791')+'/past-days-qa');
   for(const theme of ['niteharts','warm','midnight','ocean']){
    await page.evaluate(theme=>{qaTime('2026-10-10T18:28:00Z');qaTheme(theme);qaRoute('days=Friday');},theme);
    const toggle=page.locator('rally-lineup #'+(width>760?'table-body .past-day-toggle':'mobile-schedule .schedule-day>summary')).first();
    // A previous palette's test may have explicitly opened the day.
    if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('rally-lineup .set-ended').count(),0);
    await toggle.scrollIntoViewIfNeeded();
    const bounds=await toggle.boundingBox();assert(bounds.height>=44);assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
    findings.push(...await auditContrast(page,`${theme}-${width}-collapsed`));
    await page.screenshot({path:`${output}/${theme}-${width}-collapsed.png`});
    await toggle.focus();await page.keyboard.press('Enter');
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    const rows=page.locator(`rally-lineup #${width>760?'table-body':'mobile-schedule'} [data-set-start]:visible`);
    assert.equal(await rows.count(),10);
    assert.equal(await rows.first().evaluate(el=>getComputedStyle(el).opacity),'1');
    findings.push(...await auditContrast(page,`${theme}-${width}-expanded`));
    await page.screenshot({path:`${output}/${theme}-${width}-expanded.png`});
    await page.evaluate(()=>qaRoute('view=timeline&days=Friday'));
    assert.equal(await page.locator('rally-lineup .timeline-day').getAttribute('open'),'');
    await page.locator('rally-lineup .timeline-day>summary').click();
    assert.equal(await page.locator('rally-lineup .timeline-day').getAttribute('open'),null);
    if(width>760){
     await page.evaluate(()=>qaRoute(''));
     assert.equal(await page.locator('rally-lineup #table-body [data-festival-date="2026-10-09"]:visible').count(),0);
     assert.equal(await page.locator('rally-lineup #table-body [data-festival-date="2026-10-10"]:visible').count(),12);
     await page.screenshot({path:`${output}/${theme}-${width}-all-days.png`});
    }
    await page.evaluate(()=>{qaRoute('days=Saturday');qaTime('2026-10-11T02:00:00Z');});
    const ended=page.locator(`rally-lineup #${width>760?'table-body':'mobile-schedule'} .set-ended`).first();
    assert.equal(await ended.evaluate(el=>getComputedStyle(el).opacity),'1');
    findings.push(...await auditContrast(page,`${theme}-${width}-active-day`));
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
   }
   await context.close();
  }
 }finally{await browser.close();}
 console.log(JSON.stringify({errors,contrastFindings:findings,output},null,2));
 assert.equal(errors.length,0);assert.equal(findings.length,0);
})().catch(error=>{console.error(error);process.exitCode=1;});
