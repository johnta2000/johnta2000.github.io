// Serve the repository on localhost:8786, then run node tests/picnic/browser.cjs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,devices}=require('playwright');
const BASE=process.env.PICNIC_BASE_URL||'http://127.0.0.1:8786/games/picnic/';
const KEY='pepsi-pepper-picnic-v2',OUTPUT='outputs/picnic-qa';fs.mkdirSync(OUTPUT,{recursive:true});
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const start=page=>page.getByRole('button',{name:/Let’s do this|Back to the adventure/}).click();
async function fits(page,label){const size=await page.evaluate(()=>{const p=document.querySelector('.paper-panel')?.getBoundingClientRect(),s=document.querySelector('#stage').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,clipped:p&&(p.top<s.top-1||p.bottom>s.bottom+1)};});assert.equal(size.overflow,false,`${label}: horizontal overflow`);assert.ok(!size.clipped,`${label}: card clipped`);}
async function installBot(context){
 const {LEVELS}=await import('../../games/picnic/engine.mjs');const {chooseTarget}=await import('./bot.mjs');
 await context.addInitScript(({key,configs,chooseSource})=>{
   let seed=41;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   const choose=eval('('+chooseSource+')');let model=null,last=0;
   const original=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){original.call(this,k,v);if(k===key){const level=Number(new URLSearchParams(location.search).get('level')||1);model=JSON.parse(v).runs[level]||null;last=performance.now();}};
   function frame(now){
     if(window.botActive&&model?.status==='playing'&&new URLSearchParams(location.search).get('view')==='play'){
       const c=document.querySelector('#scene'),rect=c.getBoundingClientRect(),config=configs[model.level-1];
       const dt=Math.min((now-last)/1000,.05);last=now;model.elapsed+=dt;
       const width=Math.max(.18,Math.min(.3,128/rect.width))*(model.frightUntil>model.elapsed?.72:1),speed=model.mudUntil>model.elapsed?.46:1.35;
       model.basket+=Math.max(-speed*dt,Math.min(speed*dt,model.target-model.basket));
       for(const d of model.drops)d.y+=dt/config.fall;
       model.target=choose(model,config,width);
       c.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.left+model.target*rect.width,clientY:rect.top+rect.height*.7,pointerType:'mouse',bubbles:true}));
     }else last=now;
     requestAnimationFrame(frame);
   }requestAnimationFrame(frame);
 },{key:KEY,configs:LEVELS,chooseSource:chooseTarget.toString()});
}
async function closeReveal(page,label){
 await fits(page,label);const title=page.getByRole('heading',{name:/Pepper joins|You found Pee/});assert.ok(await title.isVisible());
 const state=await stored(page),level=Number(new URL(page.url()).searchParams.get('level')),elapsed=state.runs[level].elapsed;
 await page.clock.runFor(2000);assert.equal((await stored(page)).runs[level].elapsed,elapsed,'Reveal pauses play');
 await title.click();assert.ok(await title.isVisible(),'Inside click stays open');
 const p=await page.locator('.guest-panel').boundingBox(),s=await page.locator('#stage').boundingBox();
 await page.mouse.move(p.x+30,p.y+30);await page.mouse.down();await page.mouse.move(s.x+5,s.y+5);await page.mouse.up();assert.ok(await title.isVisible(),'Drag out stays open');
 await page.reload();assert.ok(await title.isVisible());await page.clock.runFor(50);await page.screenshot({path:`${OUTPUT}/${label}.png`,fullPage:true});
 await page.getByRole('button',{name:'Close friend reveal'}).click();
 const closedURL=page.url();await page.goBack();assert.ok(await title.isVisible());await page.keyboard.press('Escape');assert.equal(page.url(),closedURL);
 await page.goBack();await page.locator('#screen').click({position:{x:5,y:5}});assert.equal(page.url(),closedURL);
 await page.evaluate(()=>window.botActive=true);
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 try{
  for(const [device,options]of [['desktop',{viewport:{width:1440,height:1000}}],['mobile',{...devices['iPhone 13'],deviceScaleFactor:1}]]){
   const context=await browser.newContext({...options,reducedMotion:'reduce'});await installBot(context);
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
   await page.goto(BASE);await page.clock.runFor(50);await fits(page,device+' home');await page.screenshot({path:`${OUTPUT}/${device}-home.png`,fullPage:true});
   assert.match(await page.locator('#scene').getAttribute('aria-label'),/^Pepsi in/);
   await page.getByRole('link',{name:'How to play'}).click();await fits(page,device+' help');await page.goBack();assert.equal(new URL(page.url()).search,'');await page.goForward();assert.match(page.url(),/view=help/);
   await page.goto(BASE+'?view=play&level=10');assert.ok(await page.getByRole('link',{name:'Continue the adventure'}).isVisible());assert.equal(await page.locator('[data-action=start]').count(),0,'Locked links cannot start a later level');
   await page.goto(BASE+'?view=play&level=1');await start(page);
   // Exercise native touch and keyboard before enabling the automated pointer player.
   if(device==='mobile'){
    const rect=await page.locator('#scene').boundingBox(),client=await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width*.5,y:rect.y+rect.height*.7}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+rect.width*.2,y:rect.y+rect.height*.7}]});await page.clock.runFor(800);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else{await page.keyboard.down('ArrowLeft');await page.clock.runFor(800);await page.keyboard.up('ArrowLeft');}
   assert.ok((await stored(page)).runs[1].basket<.3,device+' input moves blanket');
   await page.getByRole('button',{name:'Pause game'}).click();const checkpoint=(await stored(page)).runs[1];await page.clock.runFor(2000);assert.equal((await stored(page)).runs[1].elapsed,checkpoint.elapsed);
   await page.reload();assert.ok(await page.getByRole('heading',{name:'A little pause.'}).isVisible());assert.equal((await stored(page)).runs[1].elapsed,checkpoint.elapsed);
   await page.getByRole('heading',{name:'A little pause.'}).click();assert.ok(await page.getByRole('heading',{name:'A little pause.'}).isVisible());
   await page.locator('#screen').click({position:{x:5,y:5}});assert.equal(await page.locator('.paper-panel').count(),0);await page.keyboard.press('Escape');await page.keyboard.press('Escape');
   await page.evaluate(()=>window.botActive=true);
   for(let level=1;level<=10;level++){
    if(level>1){await page.getByRole('link',{name:'Next adventure'}).click();await start(page);}
    let tries=0;
    for(let step=0;step<220;step++){
      await page.clock.runFor(400);
      const view=new URL(page.url()).searchParams.get('view');
      if(['guest','pepper'].includes(view)){await closeReveal(page,`${device}-${view}-reveal`);continue;}
      if(view==='result'){
        const result=(await stored(page)).results[level];if(result.won)break;
        assert.ok(++tries<=4,`${device} level ${level}: too many retries`);await page.getByRole('button',{name:'Try this level again'}).click();await start(page);
      }
      if(step===219)throw new Error(`${device} level ${level}: did not finish`);
    }
    const state=await stored(page);assert.equal(state.results[level].won,true,`${device} level ${level} complete`);
    if(level<3)assert.equal(state.pepperUnlocked,false);if(level===3)assert.equal(state.pepperUnlocked,true);if(level===7)assert.equal(state.peeUnlocked,true);
    if([1,5,10].includes(level)){await page.screenshot({path:`${OUTPUT}/${device}-level-${level}-result.png`,fullPage:true});}
   }
   await page.getByRole('link',{name:'Enjoy our picnic'}).click();await page.clock.runFor(50);await fits(page,device+' finale');await page.screenshot({path:`${OUTPUT}/${device}-finale.png`,fullPage:true});
   const finished=await stored(page);assert.equal(finished.completed.length,10);assert.ok(finished.pepperUnlocked&&finished.peeUnlocked);
   for(const name of ['Pepper','Pee']){await page.getByRole('link',{name:`Meet ${name}`,exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),`Meet ${name}`,'Focus returns to the opened friend');}
   console.log(`PASS ${device}: ten levels, consequences, crew unlocks, real input, pause and reveal interactions`);
   // Direct/copy/refresh/history checks for each meaningful screen, retaining the earned save.
   for(const query of ['', '?view=levels','?view=help','?view=play&level=8','?view=play&level=8&paused=1','?view=result&level=8','?view=picnic','?view=pepper&level=3&from=result','?view=guest&level=7&from=picnic']){
    const copy=await context.newPage();copy.on('pageerror',e=>errors.push(e.message));await copy.goto(BASE+query);await fits(copy,device+' copy '+query);await copy.reload();await fits(copy,device+' refresh '+query);
    const state=await stored(copy);assert.equal(state.completed.length,10);assert.ok(state.peeUnlocked);await copy.getByRole('link',{name:'How to play'}).click();await copy.goBack();assert.equal(new URL(copy.url()).search,query);await copy.goForward();assert.match(copy.url(),/view=help/);await copy.close();
   }
   if(device==='mobile')for(const size of [{width:320,height:568},{width:844,height:390}]){await page.setViewportSize(size);for(const view of ['home','help','levels','play','result','pepper','guest','picnic']){await page.goto(BASE+`?view=${view}&level=10`);await fits(page,`${size.width} ${view}`);}}
   console.log(`PASS ${device}: direct links, copied tabs, refresh, Back/Forward, saved-state restoration and layout`);
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log('ALL BROWSER CHECKS PASSED');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
