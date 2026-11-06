// Serve the repository on localhost:8786 before running this browser regression.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,devices}=require('playwright');
const BASE=process.env.PICNIC_BASE_URL||'http://127.0.0.1:8786/games/picnic/',KEY='pepsi-pepper-picnic-v2',OUT='outputs/picnic-qa';fs.mkdirSync(OUT,{recursive:true});
const stored=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
(async()=>{
 const {blankSave,createRun,finishRun}=await import('../../games/picnic/engine.mjs');
 const seed=blankSave();seed.completed=[1,2,3,4,5,6];seed.pepperUnlocked=true;seed.peeUnlocked=true;seed.goldenLevels=[5,6,7];seed.runs[7]=createRun(7);
 Object.assign(seed.runs[7],{status:'paused',elapsed:8,spawnIn:10,caught:6,counts:{strawberry:0,biscuit:6,orange:0},mudUntil:11,drops:[{id:1,type:'sock',x:.5,baseX:.5,y:.769,rotation:0},{id:2,type:'mud',x:.5,baseX:.5,y:.4,rotation:0},{id:3,type:'vacuum',x:.8,baseX:.8,y:.4,rotation:0},{id:4,type:'biscuit',x:.55,baseX:.55,y:.4,rotation:0},{id:5,type:'golden',x:.55,baseX:.55,y:.3,rotation:0}]});
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try{
  for(const [name,options]of[['desktop',{viewport:{width:1440,height:1000}}],['mobile',{...devices['iPhone 13'],deviceScaleFactor:1}],['small-phone',{viewport:{width:320,height:568},isMobile:true,hasTouch:true}],['landscape',{viewport:{width:844,height:390},isMobile:true,hasTouch:true}]]){
   const context=await browser.newContext(options);await context.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key:KEY,seed});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(BASE+'?view=play&level=7');await page.getByRole('button',{name:'Back to the adventure'}).click();await page.clock.runFor(100);
   assert.ok(await page.locator('#cough-cue').isVisible());assert.equal(await page.locator('#catch-message').evaluate(el=>el.classList.contains('visible')),false,'Cough cue has no overlapping toast');const caught=(await stored(page)).runs[7];assert.equal(caught.caught,4);assert.equal(caught.hearts,2);assert.equal(caught.coughRemaining,1);
   await page.screenshot({path:`${OUT}/stinky-sock-${name}.png`,fullPage:true});await page.clock.runFor(500);const frozen=(await stored(page)).runs[7];assert.equal(frozen.elapsed,caught.elapsed);assert.deepEqual(frozen.drops,caught.drops);assert.equal(frozen.basket,caught.basket);
   const pepper=page.getByRole('button',{name:'Pepper: rescue spilled snacks'}),pee=page.getByRole('button',{name:'Pee: emergency toot'});
   assert.ok(await pepper.isEnabled());assert.ok(await pee.isEnabled());
   if(name==='desktop')await page.keyboard.press('1');else await pepper.tap();
   let state=(await stored(page)).runs[7];assert.equal(state.caught,6);assert.ok(state.pepperUsed);assert.equal(state.hearts,2);assert.equal(await pepper.isEnabled(),false);assert.match(await page.locator('#pepper-state').textContent(),/Used this round/);
   if(name==='desktop')await page.keyboard.press('2');else await pee.tap();
   state=(await stored(page)).runs[7];assert.ok(state.peeUsed);assert.deepEqual(state.drops.map(d=>d.type),['biscuit','golden']);assert.equal(await pee.isEnabled(),false);await page.clock.runFor(100);await page.screenshot({path:`${OUT}/friend-abilities-${name}.png`,fullPage:true});
   const sizes=await page.evaluate(()=>{const buttons=[...document.querySelectorAll('.ability-button:not([hidden])')].map(el=>el.getBoundingClientRect());return {buttons:buttons.every(b=>b.height>=44&&b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight),overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};});assert.ok(sizes.buttons,name+' ability buttons fit and meet touch size');assert.equal(sizes.overflow,false,name+' active game has no scroll');
   await page.getByRole('button',{name:'Pause game'}).click();assert.equal(await page.locator('#cough-cue').isVisible(),false);const checkpoint=(await stored(page)).runs[7];await page.clock.runFor(2000);assert.deepEqual((await stored(page)).runs[7],checkpoint);await page.reload();assert.deepEqual((await stored(page)).runs[7],checkpoint);await page.getByRole('button',{name:'Back to the adventure'}).click();assert.equal(await pepper.isEnabled(),false);assert.equal(await pee.isEnabled(),false);await page.clock.runFor(900);assert.equal(await page.locator('#cough-cue').isVisible(),false);
   // Releasing movement keys under mud must not queue extra travel.
   await page.keyboard.down('ArrowRight');await page.clock.runFor(200);await page.keyboard.up('ArrowRight');await page.getByRole('button',{name:'Pause game'}).click();const position=(await stored(page)).runs[7].basket;await page.getByRole('button',{name:'Back to the adventure'}).click();await page.clock.runFor(300);await page.getByRole('button',{name:'Pause game'}).click();assert.equal((await stored(page)).runs[7].basket,position);
   const copy=await context.newPage();await copy.goto(page.url());assert.ok((await stored(copy)).runs[7].peeUsed);assert.ok((await stored(copy)).runs[7].pepperUsed);await copy.close();
   for(const query of ['','?view=levels','?view=help','?view=play&level=7&paused=1','?view=result&level=7','?view=picnic','?view=pepper&level=3&from=result','?view=guest&level=7&from=picnic']){
    await page.goto(BASE+query);await page.reload();assert.ok((await stored(page)).runs[7].peeUsed);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.getByRole('link',{name:'How to play'}).click();await page.goBack();assert.equal(new URL(page.url()).search,query);await page.goForward();
   }
   await page.goto(BASE+'?view=play&level=1');await page.getByRole('button',{name:'Let’s do this'}).click();assert.equal(await page.locator('#abilities').isVisible(),false,'Friends do not grant powers before joining');
   console.log(`PASS ${name}: stinky pause, keyboard/touch abilities, charge limits, layout, reload/history, and mud key release`);await context.close();
  }
  // No charges are spent while no useful target exists, and a retry restores charges.
  const ended=structuredClone(seed);Object.assign(ended.runs[7],{status:'lost',hearts:0,pepperUsed:true,peeUsed:true});finishRun(ended,ended.runs[7]);const context=await browser.newContext();await context.addInitScript(({key,seed})=>localStorage.setItem(key,JSON.stringify(seed)),{key:KEY,seed:ended});const page=await context.newPage();await page.clock.install();await page.goto(BASE+'?view=result&level=7');await page.getByRole('button',{name:'Try this level again'}).click();await page.getByRole('button',{name:'Let’s do this'}).click();await page.keyboard.press('1');await page.keyboard.press('2');const fresh=(await stored(page)).runs[7];assert.equal(fresh.pepperUsed,false);assert.equal(fresh.peeUsed,false);assert.equal(fresh.hearts,3);console.log('PASS retries restore charges; empty actions do not spend them');
  assert.deepEqual(errors,[]);console.log('ALL SOCK AND ABILITY CHECKS PASSED');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
