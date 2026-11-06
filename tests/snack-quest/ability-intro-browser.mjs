import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {homedir} from 'node:os';
import {mkdirSync} from 'node:fs';
import {createRun,TRINKETS,PEE_RESCUE} from '../../games/snack-quest/engine.mjs';
const base='http://127.0.0.1:8766/games/snack-quest/',prefix='pepsi-pepper.snack-quest.v2.',out='/tmp/snack-quest-ability-qa';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:homedir()+'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);await page.goto(base);
  for(const [id,slug,room,pos] of [['bark','shield','pond',{x:735,y:370}],['stink','toot','hills',{x:PEE_RESCUE.x-65,y:PEE_RESCUE.y}],['power','power','laundry',{x:755,y:160}]]){
   const run={...createRun('intro'+id+(mobile?'m':'d')),keyFound:true,pepperFound:id!=='bark',peeFound:id==='power',basketFound:id==='power',health:2,room,positions:{[room]:pos},trinkets:id==='stink'?TRINKETS.filter(t=>['pond','burrows','woods'].includes(t.room)).map(t=>t.id):id==='power'?TRINKETS.slice(0,12).map(t=>t.id):[]};
   await page.evaluate(({run,prefix})=>localStorage.setItem(prefix+run.id,JSON.stringify(run)),{run,prefix});await page.goto(base+`?view=play&run=${run.id}&room=${room}`);await page.keyboard.down('d');await page.waitForURL(/view=ability/);await page.keyboard.up('d');
   assert.equal(new URL(page.url()).searchParams.get('ability'),slug);const introURL=page.url(),saved=()=>page.evaluate(({prefix,id})=>JSON.parse(localStorage.getItem(prefix+id)),{prefix,id:run.id});
   assert.equal((await saved()).pendingAbility,id);const before=await saved();await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');assert.deepEqual(await saved(),before,'reading freezes movement, damage, and cooldowns');
   const text=await page.locator('.ability-card').innerText();assert.match(text,/unlocked!/);assert.match(text,mobile?/Tap/:/Press/);assert.match(text,/(10|7|8)s recharge/);assert.match(text,/pause menu/);
   await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-${slug}.png`});
   await page.locator('#ability-title').click();assert.equal(page.url(),introURL,'inside click stays open');
   const card=await page.locator('.ability-card').boundingBox(),backdrop=await page.locator('#screen').boundingBox();await page.mouse.move(card.x+20,card.y+20);await page.mouse.down();await page.mouse.move(backdrop.x+3,backdrop.y+3);await page.mouse.up();assert.equal(page.url(),introURL,'dragging out does not dismiss');
   await page.reload();await page.locator('.ability-card').waitFor();assert.equal((await saved()).pendingAbility,id);
   const copy=await context.newPage();await copy.goto(introURL);await copy.locator('.ability-card').waitFor();await copy.goto(base+`?view=play&run=${run.id}&room=${room}`);await copy.waitForURL(/view=ability/);await copy.close();await page.bringToFront();
   if(mobile)await page.locator('#ability-continue').tap();else await page.keyboard.press('Escape');await page.waitForURL(/view=play/);assert.equal((await saved()).pendingAbility,null);assert.equal(new URL(page.url()).searchParams.get('room'),room);
   await page.goBack();await page.waitForURL(/view=ability/);await page.goForward();await page.waitForURL(/view=play/);
   await page.locator('#pause').click();await page.locator(`[data-guide=${id}]`).click();await page.waitForURL(/view=ability/);assert.match(await page.locator('.ability-card').innerText(),/ABILITY GUIDE/);assert.doesNotMatch(await page.locator('#ability-title').innerText(),/unlocked/);
   await page.reload();await page.locator('.ability-card').waitFor();const screen=await page.locator('#screen').boundingBox();await page.mouse.click(screen.x+3,screen.y+3);await page.waitForURL(/view=pause/);assert.equal(await page.locator(`[data-guide=${id}]`).evaluate(el=>el===document.activeElement),true,'focus returns to guide link');
  }
  if(mobile){await page.setViewportSize({width:667,height:220});await page.locator('[data-guide=power]').click();await page.locator('#ability-continue').scrollIntoViewIfNeeded();const b=await page.locator('#ability-continue').boundingBox();assert.ok(b.y>=44&&b.y+b.height<=220);await page.screenshot({path:out+'/short-phone.png'});}
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: all three rescues, paused explanations, desktop/mobile controls, durable pending introductions, direct/copied links, refresh/history, dismissal/focus, and short-screen scrolling.');
}finally{await browser.close();}
