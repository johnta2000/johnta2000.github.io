// Public catalog smoke check only; never reads private Rally data.
const {chromium,webkit}=process.env.RALLY_PLAYWRIGHT?require(process.env.RALLY_PLAYWRIGHT):require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..');
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/tools/rally/lineup-discovery.css"><link rel="stylesheet" href="/tools/rally/theme.css"><link rel="stylesheet" href="/tools/rally/project-theme.css"></head><body><button id="artist">RL Grime</button><section id="poster"></section><script src="/tools/rally/project-theme.js"></script><script src="/tools/rally/lineup-discovery.js"></script><script>RallyProjectThemes.apply('midnight');const entry={id:'qa',artist:'RL GRIME',day:'Saturday',stage:'Main'};const discovery=RallyLineupDiscovery.create({root:document,container:document.body,poster:document.getElementById('poster'),eventName:'QA',dateLabel:'',timeLabel:()=> 'Set time TBA',getFavorites:()=>new Set(),getPeople:()=>[],onFavorite:()=>{},showToast:()=>{}});document.getElementById('artist').onclick=()=>discovery.openArtist(entry,document.getElementById('artist'));</script></body></html>`;
(async()=>{
 const engine=process.env.RALLY_BROWSER||'chromium';
 const browser=engine==='webkit'?await webkit.launch({headless:true,executablePath:'/Users/johnta/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}):await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=user-gesture-required',...(process.env.RALLY_QA_NULL_AUDIO==='1'?['--disable-audio-output']:[])]});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',...(engine==='webkit'?{isMobile:true,hasTouch:true}:{})});
  await context.route('https://www.john-ta.com/**',route=>{const url=new URL(route.request().url());if(url.pathname==='/discovery-smoke')return route.fulfill({contentType:'text/html; charset=utf-8',body:html});const file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.svg')?'image/svg+xml':'text/css',body:fs.readFileSync(file)});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://www.john-ta.com/discovery-smoke');await page.getByRole('button',{name:'RL Grime',exact:true}).click();
  await page.waitForFunction(()=>{const a=document.querySelector('.artist-dialog audio');return a&&a.currentTime>0.2&&!a.paused&&!a.muted;},{},{timeout:25000});
  await page.screenshot({path:`/tmp/rally-discovery-qa/live-apple-player-${engine}-390.png`});
  assert.equal(await page.locator('[data-track]').count(),3);
  const audio=await page.locator('audio').elementHandle();
  await page.locator('[data-track]').nth(1).click();await page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&!a.paused&&a.currentTime>0.2;});
  assert(await audio.evaluate(a=>a===document.querySelector('audio')));
  await page.getByRole('button',{name:'Close artist',exact:true}).click();await page.locator('.artist-dialog').waitFor({state:'detached'});
  assert.equal(await page.locator('iframe').count(),0);
  assert(await audio.evaluate(a=>a.paused&&!a.hasAttribute('src')));
  await page.getByRole('button',{name:'RL Grime',exact:true}).click();await page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&!a.paused&&a.currentTime>0.2;});
  await page.getByRole('button',{name:'Close artist',exact:true}).click();
  assert.equal(errors.length,0);console.log(`${engine}: live Apple catalog, one-tap cold/warm preview playback, track switching and close cleanup verified at 390px.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
