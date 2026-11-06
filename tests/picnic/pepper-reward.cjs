// Serve the repository on localhost:8786 before running this browser regression.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,devices}=require('playwright');
const BASE=process.env.PICNIC_BASE_URL||'http://127.0.0.1:8786/games/picnic/',KEY='pepsi-pepper-picnic-v2',OUT='outputs/picnic-qa';
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
(async()=>{
 const {blankSave,createRun,finishRun,LEVELS}=await import('../../games/picnic/engine.mjs');
 const seed=blankSave();for(let level=1;level<=3;level++){const run=createRun(level);Object.assign(run,{status:'won',caught:LEVELS[level-1].goal,hits:level===3?2:1,hearts:level===3?1:2});seed.runs[level]=run;finishRun(seed,run);}
 assert.equal(seed.pepperUnlocked,false);const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];fs.mkdirSync(OUT,{recursive:true});
 try{
  for(const [name,options]of[['desktop',{viewport:{width:1440,height:1000}}],['mobile',{...devices['iPhone 13'],deviceScaleFactor:1}],['small-phone',{viewport:{width:320,height:568},isMobile:true,hasTouch:true}]]){
   const context=await browser.newContext(options);await context.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key:KEY,seed});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(BASE);
   assert.match(await page.locator('#scene').getAttribute('aria-label'),/^Pepsi in/);assert.match(await page.locator('.pepper-quest-link').textContent(),/5 \/ 6/);
   await page.screenshot({path:`${OUT}/pepper-invitation-home-${name}.png`,fullPage:true});
   await page.locator('.pepper-quest-link').click();assert.match(page.url(),/view=pepper/);assert.match(await page.locator('.invitation-progress').textContent(),/5 \/ 6 stars/);assert.equal(await page.locator('#friend-portrait').count(),0);
   const invitationURL=page.url();await page.reload();assert.equal((await stored(page)).pepperUnlocked,false);const copy=await context.newPage();await copy.goto(invitationURL);assert.match(await copy.locator('.invitation-progress').textContent(),/5 \/ 6 stars/);await copy.close();
   await page.locator('h2').click();assert.equal(page.url(),invitationURL,'Inside stays open');
   const card=await page.locator('.guest-panel').boundingBox(),screen=await page.locator('#screen').boundingBox();await page.mouse.move(card.x+30,card.y+30);await page.mouse.down();await page.mouse.move(screen.x+3,screen.y+3);await page.mouse.up();assert.equal(page.url(),invitationURL,'Dragging out stays open');
   await page.locator('#screen').click({position:{x:3,y:3}});assert.equal(new URL(page.url()).search,'');assert.equal(await page.evaluate(()=>document.activeElement.className),'pepper-quest-link');
   await page.locator('.pepper-quest-link').click();await page.keyboard.press('Escape');assert.equal(new URL(page.url()).search,'');
   await page.goto(invitationURL);await page.screenshot({path:`${OUT}/pepper-invitation-${name}.png`,fullPage:true});
   await page.getByRole('link',{name:'Earn more stars'}).click();assert.match(page.url(),/view=play&level=3/);await page.goBack();assert.equal(page.url(),invitationURL);await page.goForward();assert.match(page.url(),/level=3/);
   // All new invitation surfaces survive refresh, and their links retain the destination.
   for(const query of ['?view=levels','?view=result&level=3','?view=play&level=4','?view=help']){
    await page.goto(BASE+query);await page.reload();assert.equal((await stored(page)).pepperUnlocked,false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${OUT}/pepper-${new URL(page.url()).searchParams.get('view')}-${name}.png`,fullPage:true});
   }
   await page.goto(BASE+'?view=play&level=4');await page.locator('.pepper-quest-link').click();await page.getByRole('button',{name:'Close friend reveal'}).click();assert.ok(await page.getByRole('button',{name:'Let’s do this'}).isVisible(),'Viewing the reward never auto-starts a ready round');
   // Finish a better replay through the actual catch/finish flow: 5 best stars becomes 6.
   const replay=structuredClone(seed);replay.runs[3]=createRun(3);Object.assign(replay.runs[3],{status:'paused',elapsed:5,spawnIn:10,caught:12,hits:1,hearts:2,counts:{biscuit:12,orange:0,strawberry:0},drops:[{id:1,type:'biscuit',x:.5,baseX:.5,y:.769,rotation:0}]});
   await page.addInitScript(({key,value})=>{if(!sessionStorage.getItem('pepper-replay-seeded')){localStorage.setItem(key,JSON.stringify(value));sessionStorage.setItem('pepper-replay-seeded','1');}},{key:KEY,value:replay});await page.goto(BASE+'?view=play&level=3&paused=1');await page.getByRole('button',{name:'Back to the adventure'}).click();await page.clock.runFor(100);
   assert.match(page.url(),/view=pepper/);assert.ok(await page.getByRole('heading',{name:'Pepper joins the adventure!'}).isVisible());assert.match(await page.locator('.guest-panel').textContent(),/New ability: snack rescue/);assert.ok((await stored(page)).pepperUnlocked);
   await page.reload();assert.ok((await stored(page)).pepperUnlocked);await page.screenshot({path:`${OUT}/pepper-earned-${name}.png`,fullPage:true});await page.keyboard.press('Escape');assert.match(page.url(),/view=result&level=3/);
   await page.getByRole('link',{name:'Next adventure'}).click();await page.getByRole('button',{name:'Let’s do this'}).click();assert.ok(await page.locator('#pepper-ability').isVisible());assert.equal(await page.locator('#pee-ability').isVisible(),false);
   console.log(`PASS ${name}: invitation progress, no premature unlock, replay reward, power, saved state, navigation, and modal controls`);await context.close();
  }
  assert.deepEqual(errors,[]);console.log('ALL PEPPER REWARD CHECKS PASSED');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
