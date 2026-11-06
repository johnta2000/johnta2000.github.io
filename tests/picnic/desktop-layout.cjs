// Serve the repository on localhost:8786 before running this desktop regression.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const BASE=process.env.PICNIC_BASE_URL||'http://127.0.0.1:8786/games/picnic/',KEY='pepsi-pepper-picnic-v2',OUT='outputs/picnic-qa';
const geometry=page=>page.evaluate(()=>({boxes:['.topbar','.game-frame','#stage','.frame-bottom'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [r.x,r.y,r.width,r.height];}),scroll:[scrollX,scrollY],overflow:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth}));
(async()=>{
 const {blankSave,createRun,finishRun,LEVELS}=await import('../../games/picnic/engine.mjs');
 const seed=blankSave();for(let level=1;level<=2;level++){const run=createRun(level);Object.assign(run,{status:'won',caught:LEVELS[level-1].goal});finishRun(seed,run);}
 seed.runs[3]=createRun(3);Object.assign(seed.runs[3],{status:'paused',elapsed:5,caught:12,spawnIn:10,counts:{biscuit:12,strawberry:0,orange:0},drops:[{id:1,type:'biscuit',x:.5,baseX:.5,y:.769,rotation:0}]});
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];fs.mkdirSync(OUT,{recursive:true});
 try{
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1024,height:640}]){
   const context=await browser.newContext({viewport});await context.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key:KEY,seed});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(BASE);await page.clock.runFor(50);
   const fixed=await geometry(page);assert.equal(fixed.overflow,false);const check=async label=>assert.deepEqual(await geometry(page),fixed,`${viewport.width}: frame moved at ${label}`);
   await page.screenshot({path:`${OUT}/desktop-fixed-home-${viewport.width}.png`});await page.getByRole('link',{name:'Continue your adventure'}).click();await check('ready level 3');
   await page.getByRole('button',{name:'Back to the adventure'}).click();await page.clock.runFor(100);assert.match(page.url(),/view=pepper/);await check('Pepper unlock');await page.screenshot({path:`${OUT}/desktop-fixed-unlock-${viewport.width}.png`});
   await page.getByRole('heading',{name:'Pepper joins the adventure!'}).click();assert.match(page.url(),/view=pepper/,'Inside click keeps the reveal');
   const panel=await page.locator('.guest-panel').boundingBox(),screen=await page.locator('#screen').boundingBox();await page.mouse.move(panel.x+25,panel.y+25);await page.mouse.down();await page.mouse.move(screen.x+3,screen.y+3);await page.mouse.up();assert.match(page.url(),/view=pepper/,'Dragging out keeps the reveal');
   await page.locator('#screen').click({position:{x:3,y:3}});assert.match(page.url(),/view=result/);await check('level result');await page.screenshot({path:`${OUT}/desktop-fixed-result-${viewport.width}.png`});
   await page.getByRole('link',{name:'Next adventure'}).click();await check('next level ready');await page.getByRole('button',{name:'Let’s do this'}).click();await page.clock.runFor(100);assert.ok(await page.locator('#pepper-ability').isVisible());await check('playing with ability');
   await page.screenshot({path:`${OUT}/desktop-fixed-play-${viewport.width}.png`});await page.getByRole('button',{name:'Pause game'}).click();await check('paused with ability hidden');await page.keyboard.press('Escape');await check('resumed');
   await page.getByRole('button',{name:'Pause game'}).click();const checkpoint=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).runs[4],KEY);await page.reload();await check('reload');assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).runs[4],KEY),checkpoint);
   for(const query of ['', '?view=levels','?view=help','?view=play&level=4&paused=1','?view=result&level=3','?view=pepper&level=3&from=result','?view=guest&level=5&from=picnic','?view=picnic']){
    await page.goto(BASE+query);await page.clock.runFor(50);await check(query||'home');await page.reload();await check('refreshed '+query);
    const copy=await context.newPage();await copy.goto(page.url());assert.deepEqual(await geometry(copy),fixed);await copy.close();
    await page.getByRole('link',{name:query==='?view=levels'?'How to play':'Map',exact:true}).click();await page.goBack();assert.equal(new URL(page.url()).search,query);await check('back '+query);await page.goForward();await check('forward');
   }
   await page.goto(BASE+'?view=help');await page.locator('.help-panel').evaluate(el=>el.scrollTop=el.scrollHeight);await check('scrolling long help');assert.ok(await page.getByRole('link',{name:'Got it, let’s go'}).isVisible());await page.screenshot({path:`${OUT}/desktop-fixed-help-${viewport.width}.png`});
   await page.goto(BASE+'?view=pepper&level=3&from=result');await page.keyboard.press('Escape');assert.match(page.url(),/view=result/);await check('Escape closes reveal');
   console.log(`PASS ${viewport.width}×${viewport.height}: fixed frame through actual unlock/result/next-level/pause, direct links, reload, copied links, history, and panel scrolling`);await context.close();
  }
  assert.deepEqual(errors,[]);console.log('ALL DESKTOP LAYOUT CHECKS PASSED');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
