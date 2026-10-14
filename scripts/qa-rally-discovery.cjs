// Isolated fixture data only. No login, private project queries, or writes.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const contrast=require('./rally-contrast-audit.cjs');
const base=path.resolve(__dirname,'..');
const carnival=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/midnight-carnival-2026.json'),'utf8'));
const niteharts={id:'niteharts-festival-2026',name:'Niteharts',startsAt:'2026-10-09',endsAt:'2026-10-11',timeZone:'America/Los_Angeles',lineup:JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/niteharts-2026.json'),'utf8'))};
function html(event){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/tools/rally/theme.css"><link rel="stylesheet" href="/tools/rally/project-theme.css"><style>body{margin:0}#preview{height:100dvh}</style></head><body><section id="preview"></section><script src="/tools/rally/project-theme.js"></script><script src="/tools/rally/lineup-discovery.js"></script><script src="/lost-lands-2026-lineup/controller.js"></script><script src="/tools/rally/lineup-template.js"></script><script src="/tools/rally/lineup.js"></script><script>const event=${JSON.stringify(event)},changes=[],state={type:'rally-lineup-state',artistIds:[event.lineup[0].id],interests:{[event.lineup[0].id]:[{id:'qa',name:'Alex'}],[event.lineup[1].id]:[{id:'sam',name:'Sam'}]},currentMember:{id:'qa',name:'Alex'},hiddenDays:[],reviewMode:true};const options={container:document.getElementById('preview'),key:'qa',event,state,params:'view=poster',onEvent:m=>changes.push(m),onParams:()=>{},shareUrl:location.href};RallyLineup.show(options);window.qaTheme=theme=>{state.projectTheme=theme;RallyProjectThemes.apply(theme);RallyLineup.receive(state)};window.qaRoute=params=>RallyLineup.show({...options,params});</script></body></html>`;}
(async()=>{
 const output='/tmp/rally-discovery-qa';fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[],findings=[];
 try{
  for(const event of [carnival,niteharts])for(const width of [1440,390,320]){
   const context=await browser.newContext({viewport:{width,height:960},serviceWorkers:'block',acceptDownloads:true,reducedMotion:'reduce'});
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='itunes.apple.com')return route.fulfill({json:{results:[1,2,3].map(trackId=>({kind:'song',artistName:url.searchParams.get('term'),trackName:'Sample song '+trackId,trackId,trackViewUrl:'https://music.apple.com/us/album/sample/100?i='+trackId}))}});
    if(url.hostname==='embed.music.apple.com')return route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#26262a;color:white;font:16px system-ui;padding:20px"><p>Apple Music preview</p><button>Play sample</button></body>'});
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(url.pathname==='/qa')return route.fulfill({contentType:'text/html',body:html(event)});
    const file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep))return route.abort();
    return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1/qa');
   for(const theme of ['warm','midnight','niteharts','ocean']){
    await page.evaluate(theme=>{qaTheme(theme);qaRoute('view=poster');},theme);
    assert(await page.locator('rally-lineup .lineup-art').isVisible());
    assert.equal(await page.locator('rally-lineup .poster-artist.is-liked').count(),1);
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
    assert(!await page.locator('rally-lineup').evaluate(el=>el.scrollWidth>el.clientWidth+1));
    const modeButtons=page.locator('rally-lineup .schedule-actions>.segmented:not(.likes-filter)>button:visible');assert.equal(await modeButtons.count(),event===carnival?4:5);
    for(const button of await modeButtons.all()){const box=await button.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);assert(box.height>=44);}
    findings.push(...await contrast(page,`${event.id}-${width}-${theme}-poster`));
    await page.screenshot({path:`${output}/${event.id}-${width}-${theme}-poster.png`});
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Save image',exact:true}).click();const download=await downloadPromise;
    await download.saveAs(`${output}/${event.id}-${width}-${theme}-export.png`);
    assert(fs.statSync(`${output}/${event.id}-${width}-${theme}-export.png`).size>15000);
    await page.locator('rally-lineup .poster-artist').first().click();
    const dialog=page.locator('rally-lineup .artist-dialog');await dialog.locator('iframe').waitFor();
    assert.equal(await dialog.locator('iframe').count(),1);
    const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=960+1);
    findings.push(...await contrast(page,`${event.id}-${width}-${theme}-artist`));
    await page.screenshot({path:`${output}/${event.id}-${width}-${theme}-artist.png`});
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await page.locator('rally-lineup iframe').count(),0);
   }
   await page.evaluate(()=>qaRoute('view=poster&likes=crew'));assert.equal(await page.locator('rally-lineup .poster-artist').count(),2);
   await page.evaluate(()=>qaRoute('view=poster&fav=1'));assert.equal(await page.locator('rally-lineup .poster-artist').count(),1);
   await page.evaluate(()=>qaRoute('view=poster&q=does-not-exist'));assert(await page.locator('rally-lineup .poster-empty').isVisible());assert(await page.getByRole('button',{name:'Save image',exact:true}).isDisabled());
   await context.close();
  }
 }finally{await browser.close();}
 console.log(JSON.stringify({errors,contrastFindings:findings,output},null,2));assert.equal(errors.length,0);assert.equal(findings.length,0);
})().catch(e=>{console.error(e);process.exitCode=1;});
