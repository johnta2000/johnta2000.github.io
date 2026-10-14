// Public catalog smoke check only; never reads private Rally data.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..');
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/tools/rally/lineup-discovery.css"><link rel="stylesheet" href="/tools/rally/theme.css"><link rel="stylesheet" href="/tools/rally/project-theme.css"></head><body><button id="artist">RL Grime</button><section id="poster"></section><script src="/tools/rally/project-theme.js"></script><script src="/tools/rally/lineup-discovery.js"></script><script>RallyProjectThemes.apply('midnight');const entry={id:'qa',artist:'RL GRIME',day:'Saturday',stage:'Main'};const discovery=RallyLineupDiscovery.create({root:document,container:document.body,poster:document.getElementById('poster'),eventName:'QA',dateLabel:'',timeLabel:()=> 'Set time TBA',getFavorites:()=>new Set(),getPeople:()=>[],onFavorite:()=>{},showToast:()=>{}});document.getElementById('artist').onclick=()=>discovery.openArtist(entry,document.getElementById('artist'));</script></body></html>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.route('https://www.john-ta.com/**',route=>{const url=new URL(route.request().url());if(url.pathname==='/discovery-smoke')return route.fulfill({contentType:'text/html',body:html});const file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':'text/css',body:fs.readFileSync(file)});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://www.john-ta.com/discovery-smoke');await page.getByRole('button',{name:'RL Grime',exact:true}).click();
  await page.locator('.artist-dialog iframe').waitFor({timeout:20000});
  const frame=page.frameLocator('.artist-dialog iframe');
  await frame.getByRole('button',{name:/play/i}).first().waitFor({timeout:20000});
  await frame.getByRole('button',{name:/play/i}).first().click();
  await frame.getByRole('button',{name:/pause/i}).first().waitFor({timeout:15000});
  await page.screenshot({path:'/tmp/rally-discovery-qa/live-apple-player-390.png'});
  assert.equal(await page.locator('[data-track]').count(),3);
  await page.getByRole('button',{name:'Close artist',exact:true}).click();await page.locator('.artist-dialog').waitFor({state:'detached'});
  assert.equal(await page.locator('iframe').count(),0);
  assert.equal(errors.length,0);console.log('Live Apple catalog, embedded preview playback, and close cleanup verified at 390px.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
