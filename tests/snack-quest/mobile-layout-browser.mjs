import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {homedir} from 'node:os';
import {mkdirSync} from 'node:fs';
import {createRun} from '../../games/snack-quest/engine.mjs';
const browser=await chromium.launch({headless:true,executablePath:homedir()+'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
const base='http://127.0.0.1:8766/games/snack-quest/',prefix='pepsi-pepper.snack-quest.v2.',out='/tmp/snack-quest-mobile-layout-qa';mkdirSync(out,{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:852,height:393},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 const run={...createRun('mobilefit'),room:'tutorial',tutorialStep:3};
 let url;
 let earlyWidth;
 for(let count=1;count<=4;count++){
  run.id='mobilefit'+count;url=base+'?view=play&run='+run.id+'&room=tutorial';
  run.keyFound=count>=2;run.pepperFound=count>=2;run.peeFound=count>=3;run.pepperoniFound=count>=4;
  await page.evaluate(({run,prefix})=>localStorage.setItem(prefix+run.id,JSON.stringify(run)),{run,prefix});await page.goto(url);
  assert.equal(await page.locator('.ability:visible').count(),count);
  assert.equal(await page.locator('.ability:not([hidden])').count(),count);
  await page.evaluate(()=>{for(const [key,value] of Object.entries({'top':'20px','left':'44px','right':'44px','bottom':'21px'}))document.body.style.setProperty('--safe-'+key,value);});
  const shell=await page.locator('.page-shell').boundingBox(),header=await page.locator('.game-toolbar').boundingBox(),stage=await page.locator('#stage').boundingBox();
  assert.equal(shell.y,0);assert.equal(header.y,0,'safe inset belongs inside the header, not an empty bar');assert.equal(header.height,64);assert.equal(stage.y,0);assert.equal(stage.x,0);assert.equal(stage.width,852);
  assert.equal(shell.height,393);assert.equal(stage.height,393);
  const canvas=await page.locator('#world').evaluate(c=>({width:c.width,height:c.height}));assert.ok(Math.abs(canvas.width/canvas.height-852/393)<.01,'canvas matches the phone, without letterboxing or stretching');
  for(const selector of ['#joystick',...await page.locator('.ability:visible').evaluateAll(nodes=>nodes.map(n=>'[data-ability='+n.dataset.ability+']'))]){
   const box=await page.locator(selector).boundingBox();assert.ok(box.x>=44&&box.x+box.width<=808.5,selector+' respects notch');assert.ok(box.y>=64&&box.y+box.height<=372.5,selector+' fits safe height');assert.ok(box.width>=44&&box.height>=44);
  }
  if(count===1)earlyWidth=stage.width;
  if(count===4)assert.equal(earlyWidth,stage.width,'unlocking abilities never shrinks or shifts the field');
  await page.screenshot({path:out+'/standalone-'+count+'-abilities.png'});
  await page.reload();assert.equal(await page.locator('.ability:visible').count(),count,'reload restores unlock visibility');
 }
 await page.keyboard.press('d');await page.locator('[data-ability=bark]').tap();assert.match(await page.locator('[data-ability=bark]').innerText(),/Shield[\s\S]*Protected/);assert.ok(await page.locator('[data-ability=bark]').isDisabled());
 await page.screenshot({path:out+'/shield.png'});
 await page.locator('#pause').tap();const pauseURL=page.url();await page.reload();assert.match(page.url(),/view=pause/);await page.locator('#resume').tap();await page.waitForURL(/view=play/);await page.goBack();await page.waitForURL(pauseURL);await page.goForward();await page.waitForURL(/view=play/);
 const copy=await context.newPage();await copy.goto(url);assert.equal(await copy.locator('.ability:visible').count(),4);await copy.close();
 assert.deepEqual(errors,[]);console.log('PASS: Home Screen safe-area layout, hidden unlocks, edge-to-edge field, shield touch control, reload/copied links/history.');
}finally{await browser.close();}
