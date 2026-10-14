// Isolated fixture data only. No login, private project queries, or writes.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const contrast=require('./rally-contrast-audit.cjs');
const base=path.resolve(__dirname,'..');
// Synthetic PCM tone for actual one-click playback checks; no song is recorded.
const tone=Buffer.alloc(44+8000*2*8);tone.write('RIFF',0);tone.writeUInt32LE(tone.length-8,4);tone.write('WAVEfmt ',8);tone.writeUInt32LE(16,16);tone.writeUInt16LE(1,20);tone.writeUInt16LE(1,22);tone.writeUInt32LE(8000,24);tone.writeUInt32LE(16000,28);tone.writeUInt16LE(2,32);tone.writeUInt16LE(16,34);tone.write('data',36);tone.writeUInt32LE(tone.length-44,40);for(let i=0;i<8000*8;i++)tone.writeInt16LE(Math.round(Math.sin(i*Math.PI*2*220/8000)*1000),44+i*2);
const carnival=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/midnight-carnival-2026.json'),'utf8'));
const niteharts={id:'niteharts-festival-2026',name:'Niteharts',startsAt:'2026-10-09',endsAt:'2026-10-11',timeZone:'America/Los_Angeles',lineup:JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/niteharts-2026.json'),'utf8'))};
function html(event){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/tools/rally/theme.css"><link rel="stylesheet" href="/tools/rally/project-theme.css"><style>body{margin:0}#preview{height:100dvh}</style></head><body><section id="preview"></section><script src="/assets/js/searchable-select.js"></script><script src="/tools/rally/project-theme.js"></script><script src="/tools/rally/lost-lands-poster-spots.js"></script><script src="/tools/rally/lineup-posters.js"></script><script src="/tools/rally/lineup-discovery.js"></script><script src="/lost-lands-2026-lineup/controller.js"></script><script src="/tools/rally/lineup-template.js"></script><script src="/tools/rally/lineup.js"></script><script>const event=${JSON.stringify(event)},changes=[],state={type:'rally-lineup-state',artistIds:[event.lineup[0].id],interests:{[event.lineup[0].id]:[{id:'qa',name:'Alex'}],[event.lineup[1].id]:[{id:'sam',name:'Sam'}]},currentMember:{id:'qa',name:'Alex'},hiddenDays:[],reviewMode:true};const options={container:document.getElementById('preview'),key:'qa',event,state,params:'view=poster',onEvent:m=>changes.push(m),onParams:()=>{},shareUrl:location.href};RallyLineup.show(options);window.qaTheme=theme=>{state.projectTheme=theme;RallyProjectThemes.apply(theme);RallyLineup.receive(state)};window.qaRoute=params=>RallyLineup.show({...options,params});</script></body></html>`;}
(async()=>{
 const output='/tmp/rally-discovery-qa';fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=user-gesture-required']}),errors=[],findings=[];
 try{
  for(const event of [carnival,niteharts])for(const width of [1440,390,320]){
   const context=await browser.newContext({viewport:{width,height:960},serviceWorkers:'block',acceptDownloads:true,reducedMotion:'reduce'});
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='itunes.apple.com')return route.fulfill({json:{results:[1,2,3].map(trackId=>({kind:'song',artistName:url.searchParams.get('term'),trackName:'Sample song '+trackId,trackId,trackViewUrl:'https://music.apple.com/us/album/sample/100?i='+trackId,previewUrl:'https://audio-ssl.itunes.apple.com/qa-'+trackId+'.wav'}))}});
    if(url.hostname==='audio-ssl.itunes.apple.com')return route.fulfill({contentType:'audio/wav',body:tone});
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(url.pathname==='/qa')return route.fulfill({contentType:'text/html',body:html(event)});
    const file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep))return route.abort();
    return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.svg')?'image/svg+xml':'text/html',body:fs.readFileSync(file)});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1/qa');
   for(const theme of ['warm','midnight','niteharts','ocean']){
    await page.evaluate(theme=>{qaTheme(theme);qaRoute('view=poster');},theme);
    assert(await page.locator('rally-lineup .official-poster-image').isVisible());
    assert.equal(await page.locator('rally-lineup .poster-hotspot.is-liked').count(),1);
    const original=page.locator('rally-lineup .official-poster-image img');
    assert((await original.getAttribute('src')).endsWith('-2026-poster.png'));
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
    assert(!await page.locator('rally-lineup').evaluate(el=>el.scrollWidth>el.clientWidth+1));
    const modeButtons=page.locator('rally-lineup .schedule-actions>.segmented:not(.likes-filter)>button:visible');assert.equal(await modeButtons.count(),event===carnival?4:5);
    for(const button of await modeButtons.all()){const box=await button.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);assert(box.height>=44);}
    findings.push(...await contrast(page,`${event.id}-${width}-${theme}-poster`));
    await page.screenshot({path:`${output}/${event.id}-${width}-${theme}-poster.png`});
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Save image',exact:true}).click();const download=await downloadPromise;
    await download.saveAs(`${output}/${event.id}-${width}-${theme}-export.png`);
    assert(fs.statSync(`${output}/${event.id}-${width}-${theme}-export.png`).size>15000);
    const exported=fs.readFileSync(`${output}/${event.id}-${width}-${theme}-export.png`).toString('base64');
    assert(await original.evaluate(async(img,data)=>{const out=new Image();out.src='data:image/png;base64,'+data;await out.decode();if(out.naturalWidth!==img.naturalWidth||out.naturalHeight!==img.naturalHeight)return false;const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=img.naturalWidth;a.height=b.height=img.naturalHeight;const ca=a.getContext('2d'),cb=b.getContext('2d');ca.drawImage(img,0,0);cb.drawImage(out,0,0);for(const [x,y] of [[0,0],[40,40],[img.naturalWidth-5,img.naturalHeight-5]])if(String(ca.getImageData(x,y,1,1).data)!==String(cb.getImageData(x,y,1,1).data))return false;return true;},exported),'Exports must preserve the original poster pixels outside like outlines');
    await page.locator('rally-lineup [data-poster-zoom]').click();assert.equal(await page.locator('rally-lineup .official-poster-image').evaluate(el=>el.style.width),'200%');
    await page.locator('rally-lineup [data-poster-zoom]').click();await page.locator('rally-lineup [data-poster-zoom]').click();
    await page.locator('rally-lineup .poster-hotspot').first().click();
    const dialog=page.locator('rally-lineup .artist-dialog');await dialog.locator('[data-preview-toggle][aria-label="Pause preview"]').waitFor();
    await page.waitForFunction(()=>{const a=document.querySelector('rally-lineup').shadowRoot.querySelector('audio');return a&&!a.paused&&a.currentTime>0.1;});
    assert.equal(await dialog.locator('audio').count(),1);assert.equal(await dialog.locator('iframe').count(),0);
    await dialog.locator('.artist-store-link img').evaluate(img=>img.decode());
    const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=960+1);
    findings.push(...await contrast(page,`${event.id}-${width}-${theme}-artist`));
    await page.screenshot({path:`${output}/${event.id}-${width}-${theme}-artist.png`});
    await dialog.locator('audio').evaluate(a=>window.qaAudio=a);
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
    assert(await page.evaluate(()=>qaAudio.paused&&!qaAudio.hasAttribute('src')));
   }
   await page.evaluate(()=>qaRoute('view=poster&likes=crew'));assert.equal(await page.locator('rally-lineup .poster-artist-options button').count(),2);
   await page.evaluate(()=>qaRoute('view=poster&fav=1'));assert.equal(await page.locator('rally-lineup .poster-hotspot').count(),1);
   await page.evaluate(()=>qaRoute('view=poster&q=does-not-exist'));assert(await page.locator('rally-lineup .poster-empty').isVisible());assert(await page.getByRole('button',{name:'Save image',exact:true}).isDisabled());
   await context.close();
  }
 }finally{await browser.close();}
 console.log(JSON.stringify({errors,contrastFindings:findings,output},null,2));assert.equal(errors.length,0);assert.equal(findings.length,0);
})().catch(e=>{console.error(e);process.exitCode=1;});
