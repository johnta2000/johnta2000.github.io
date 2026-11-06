import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { NEEDOH, roomPoint, PEE_RESCUE, createRun, ROOMS, ORDER, TRINKETS, roomItems } from '../../games/snack-quest/engine.mjs';

const base=process.env.SNACK_QUEST_URL||'http://127.0.0.1:8766/games/snack-quest/';
const installed=homedir()+'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const useWebKit=process.env.SNACK_QUEST_BROWSER==='webkit';
const browser=await (useWebKit?webkit:chromium).launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:!useWebKit&&existsSync(installed)?{executablePath:installed}:{})});
const errors=[],prefix='pepsi-pepper.snack-quest.v2.';
const output=process.env.SNACK_QUEST_SCREENSHOTS||'/tmp/snack-quest-v2-qa';mkdirSync(output,{recursive:true});
async function pageFor(context){const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#begin').waitFor();await page.evaluate(()=>document.fonts.ready);return page;}
async function seed(page,run,room=run.room,view='play'){
  await page.evaluate(({prefix,run})=>{localStorage.setItem(prefix+run.id,JSON.stringify(run));localStorage.setItem(prefix+'latest',run.id);},{prefix,run});
  await page.goto(`${base}?view=${view}&run=${run.id}&room=${room}`);
  await page.waitForFunction(()=>document.querySelector('#room-name')?.textContent!=='One friend is missing.');
  await page.evaluate(async()=>{
    const {Soundscape}=await import('./audio.mjs?v=32'),play=Soundscape.prototype.play;
    window.effectRequests=[];Soundscape.prototype.play=function(kind){window.effectRequests.push(kind);return play.call(this,kind);};
  });
}
async function saved(page){return page.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))),prefix);}
async function hold(page,key,milliseconds){await page.keyboard.down(key);await page.waitForTimeout(milliseconds);await page.keyboard.up(key);}
async function waitView(page,view){await page.waitForFunction(view=>new URLSearchParams(location.search).get('view')===view,view);}
async function waitRoom(page,room){try{await page.waitForFunction(({room,name})=>new URLSearchParams(location.search).get('room')===room&&document.getElementById('room-name').textContent===name,{room,name:ROOMS[room].name});}catch(error){console.error({url:page.url(),room:await page.locator('#room-name').textContent(),screen:await page.locator('#screen').innerText()});throw error;}}
async function dismissOutside(page){await page.locator('#screen').scrollIntoViewIfNeeded();const box=await page.locator('#screen').boundingBox();await page.mouse.click(box.x+7,Math.max(20,box.y+7));}
try {
  if(process.env.SNACK_QUEST_SKIP_DESKTOP!=='1') {
  const desktop=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const page=await pageFor(desktop);await page.screenshot({path:output+'/desktop-home.png',fullPage:true});
  assert.equal(await page.locator('[data-character]').count(),0);
  await page.locator('#begin').click();await waitView(page,'play');
  await waitRoom(page,'tutorial');await page.screenshot({path:output+'/desktop-practice.png',fullPage:true});
  assert.ok(await page.locator('[data-ability="bark"]').isDisabled());await page.keyboard.press('j');assert.equal((await saved(page)).cooldowns.bark,0,'locked abilities cannot fire');
  await hold(page,'d',950);assert.equal((await saved(page)).tutorialStep,1);
  await page.keyboard.press('Escape');await page.reload();await page.locator('#resume').click();await waitRoom(page,'tutorial');assert.equal((await saved(page)).tutorialStep,1);
  await hold(page,'d',750);await page.keyboard.down('d');await page.keyboard.press('Space');await page.waitForTimeout(250);await page.keyboard.up('d');
  assert.equal((await saved(page)).tutorialStep,2);assert.equal((await saved(page)).keyFound,false,'practice never grants the quest key');
  await page.waitForFunction(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))).tutorialStep===3,prefix);
  await hold(page,'d',2200);await waitRoom(page,'meadow');

  assert.equal(await page.evaluate(()=>document.activeElement.id),'keyboard-capture','Start focuses a native keyboard control');
  await page.locator('#control-prompt').waitFor({state:'visible'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const waitingFrame=await page.locator('#world').evaluate(canvas=>canvas.toDataURL());
  await page.waitForTimeout(3000);
  assert.ok(await page.locator('#world').evaluate(canvas=>canvas.toDataURL())===waitingFrame,'toys stay completely still before the first movement input');
  assert.equal((await saved(page)).health,3);
  await page.screenshot({path:output+'/desktop-controls-ready.png',fullPage:true});
  // No extra canvas click: every movement key must work immediately after Start.
  let previous={x:135,y:315};
  for(const [key,axis,sign] of [['w','y',-1],['a','x',-1],['s','y',1],['d','x',1]]) {
    await page.keyboard.down(key);
    await page.locator(`kbd[data-move="${key}"].pressed`).waitFor();
    await page.waitForTimeout(160);await page.keyboard.up(key);
    await page.keyboard.press('Escape');await waitView(page,'pause');
    const next=(await saved(page)).positions.meadow;
    assert.ok((next[axis]-previous[axis])*sign>20,`${key.toUpperCase()} moves from Start or Pause`);
    previous=next;
  }
  await page.locator('#resume').click();await waitView(page,'play');
  await hold(page,'d',80);
  const beforeBlur=await saved(page);
  const focusURL=page.url(),focusHistory=await page.evaluate(()=>history.length);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(300);
  assert.equal((await saved(page)).health,beforeBlur.health,'losing keyboard focus pauses hazards');
  assert.equal(page.url(),focusURL,'ordinary focus changes do not navigate to a pause screen');
  assert.equal(await page.evaluate(()=>history.length),focusHistory);
  assert.equal(await page.locator('.pause-card').count(),0);
  assert.equal(await page.locator('#control-prompt').isVisible(),false,'no extra prompt when returning');
  const restingFrame=await page.locator('#world').evaluate(canvas=>canvas.toDataURL());
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(250);
  assert.ok(await page.locator('#world').evaluate(canvas=>canvas.toDataURL())===restingFrame,'hazards wait safely for WASD on return');
  const beforeText=(await saved(page)).positions.meadow;
  await page.locator('#keyboard-capture').evaluate(input=>input.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'d',bubbles:true,cancelable:true})));
  await page.waitForTimeout(160);await page.keyboard.press('Escape');await waitView(page,'pause');
  assert.ok((await saved(page)).positions.meadow.x>beforeText.x+12,'embedded text-only input can move Pepsi');
  await page.keyboard.press('Escape');await waitView(page,'play');
  const beforeTap=(await saved(page)).positions.meadow;
  await page.keyboard.press('w');await page.waitForTimeout(60);await page.keyboard.press('Escape');await waitView(page,'pause');
  assert.ok((await saved(page)).positions.meadow.y<beforeTap.y,'short taps survive a keyup before the next frame');
  if(process.env.SNACK_QUEST_CONTROLS_ONLY==='1') {
    assert.deepEqual(errors,[]);
    console.log('PASS: native keyboard focus, protected start, all four WASD keys, text-only input, brief taps, pause/resume, and focus loss.');
    await browser.close();process.exit(0);
  }
  // Use a fresh run for the existing fixed-spawn assertions.
  await page.locator('.brand').click();await page.locator('#fresh').click();await waitRoom(page,'tutorial');await page.locator('#practice-link').click();await waitRoom(page,'meadow');
  await hold(page,'ArrowRight',160);const box=await page.locator('#world').boundingBox();await page.mouse.click(box.x+box.width*.8,box.y+box.height*.6);
  await page.keyboard.press('Escape');await waitView(page,'pause');assert.equal(Math.round((await saved(page)).positions.meadow.x),135,'arrows and mouse do not move Pepsi');
  await page.locator('.pause-card h3').click();assert.match(page.url(),/view=pause/);await dismissOutside(page);await waitView(page,'play');
  await hold(page,'d',350);await page.keyboard.press('Escape');await waitView(page,'pause');assert.ok((await saved(page)).positions.meadow.x>185,'WASD movement works');
  const pausedURL=page.url();await page.reload();await page.locator('.pause-card').waitFor();assert.equal(page.url(),pausedURL);await page.keyboard.press('Escape');await waitView(page,'play');
  const key=createRun('keytest12');key.positions.meadow={x:477,y:190};await seed(page,key);await page.keyboard.down('d');await page.keyboard.press('Space');await page.waitForTimeout(220);await page.keyboard.up('d');
  await page.waitForFunction(prefix=>JSON.parse(localStorage.getItem(prefix+new URLSearchParams(location.search).get('run'))).keyFound,prefix);assert.equal((await saved(page)).collected.length,0);assert.equal(await page.evaluate(()=>effectRequests.filter(k=>k==='bonk-crate').length),1);
  await page.keyboard.press('Escape');await waitView(page,'pause');await page.keyboard.press('Escape');await waitView(page,'play');
  await page.screenshot({path:output+'/desktop-key.png',fullPage:true});
  // Regular picnic snacks no longer refill hearts; only the marked snack does.
  for(const index of [1,0]){
    const snackRun=createRun(index?'plainfood':'heartfood');snackRun.seed=1;snackRun.health=1;
    const item=roomItems(1,'meadow')[index];snackRun.positions.meadow={x:item.x-38,y:item.y};
    await seed(page,snackRun);await hold(page,'d',100);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    assert.equal((await saved(page)).health,index?1:2);assert.ok((await saved(page)).collected.includes(item.id));
    if(index)await page.screenshot({path:output+'/desktop-limited-healing.png',fullPage:true});
    await page.keyboard.press('Escape');await page.reload();await page.locator('#resume').waitFor();assert.equal((await saved(page)).health,index?1:2);
  }
  const rescue=createRun('rescuetest');rescue.keyFound=true;rescue.health=1;rescue.room='pond';rescue.positions.pond={x:735,y:370};await seed(page,rescue);await hold(page,'d',250);
  assert.match(page.url(),/view=ability/);assert.match(page.url(),/ability=shield/);await page.locator('#ability-continue').click();assert.match(page.url(),/room=pond/,'rescue stays in the pond');
  assert.equal((await saved(page)).pepperFound,true);assert.equal((await saved(page)).health,2);
  assert.match(await page.locator('#objective-text').innerText(),/ribbon.*button/);
  await page.keyboard.press('Escape');await waitView(page,'pause');await page.reload();await page.locator('#resume').click();await waitRoom(page,'pond');
  assert.equal((await saved(page)).pepperFound,true);assert.equal((await saved(page)).trinkets.length,0);
  await page.keyboard.down('a');await page.waitForTimeout(300);await page.screenshot({path:output+'/desktop-reunion.png',fullPage:true});await page.keyboard.up('a');await page.keyboard.press('Escape');
  // Collect each actual trinket through WASD, preserving the previous discoveries.
  let treasure=createRun('treasure12');treasure.keyFound=true;treasure.pepperFound=true;treasure.health=4;
  for(const item of TRINKETS){
    if(['laundry','kitchen'].includes(item.room)){treasure.basketFound=true;treasure.peeFound=true;}if(item.room==='kitchen')treasure.pepperoniFound=true;
    treasure.room=item.room;treasure.positions[item.room]={x:item.x-38,y:item.y};
    await seed(page,treasure,item.room);await hold(page,'d',100);await page.keyboard.press('Escape');await waitView(page,'pause');
    treasure=await saved(page);assert.ok(treasure.trinkets.includes(item.id));
    await page.reload();await page.locator('.pause-card').waitFor();assert.ok((await saved(page)).trinkets.includes(item.id));
  }
  assert.equal(treasure.trinkets.length,14);assert.equal(await page.locator('#trinket-count').innerText(),'14/14');
  const locked=createRun('lockedpond');locked.keyFound=true;locked.pepperFound=true;locked.health=4;locked.positions.pond={x:895,y:320};
  await seed(page,locked,'pond');await hold(page,'d',100);assert.match(page.url(),/room=pond/,'rescue alone does not open the pond exit');
  locked.trinkets=TRINKETS.filter(item=>item.room==='pond').map(item=>item.id);locked.revision=(await saved(page)).revision+1;
  await seed(page,locked,'pond');await hold(page,'d',100);await waitRoom(page,'burrows');
  await page.keyboard.press('w');await page.waitForTimeout(3100);await page.screenshot({path:output+'/desktop-gopher-garden.png',fullPage:true});await page.keyboard.press('Escape');
  const gardenExit=createRun('gardenexit');gardenExit.keyFound=true;gardenExit.pepperFound=true;gardenExit.health=4;gardenExit.trinkets=TRINKETS.filter(item=>item.room!=='orchard').map(item=>item.id);gardenExit.positions.burrows={x:895,y:320};
  await seed(page,gardenExit,'burrows');await hold(page,'d',100);await waitRoom(page,'woods');
  await page.screenshot({path:output+'/desktop-woods.png',fullPage:true});
  for(const room of ['woods','hills']){const route={...gardenExit,id:room+'exit12',positions:{[room]:roomPoint(room,895,320)}};await seed(page,route,room);await hold(page,'d',100);await waitRoom(page,ORDER[ORDER.indexOf(room)+1]);}
  await page.keyboard.down('d');await page.waitForTimeout(500);await page.screenshot({path:output+'/desktop-final-area.png',fullPage:true});await page.keyboard.up('d');await page.keyboard.press('Escape');
  // Pee is a late, optional rescue; links never grant him without the six discoveries.
  const pee=createRun('peebrowser');pee.keyFound=true;pee.pepperFound=true;pee.health=2;pee.room='hills';pee.positions.hills={x:PEE_RESCUE.x-65,y:PEE_RESCUE.y};
  pee.trinkets=TRINKETS.filter(i=>['pond','burrows','woods'].includes(i.room)).map(i=>i.id);
  const sixth=pee.trinkets.pop();await seed(page,pee);await hold(page,'d',160);await page.keyboard.press('Escape');
  let peeSaved=await saved(page);assert.equal(peeSaved.peeFound,false);assert.match(await page.locator('#pee-link').innerText(),/5\/6/);
  peeSaved.trinkets.push(sixth);peeSaved.positions.hills={x:PEE_RESCUE.x-65,y:PEE_RESCUE.y};peeSaved.revision++;
  await seed(page,peeSaved);await hold(page,'d',160);assert.equal((await saved(page)).peeFound,true);assert.equal((await saved(page)).health,2);
  assert.match(page.url(),/room=hills/);assert.match(page.url(),/ability=toot/);await page.locator('#ability-continue').click();
  assert.match(await page.locator('#buddy-status').innerText(),/Three corgis/);
  await hold(page,'a',650);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.screenshot({path:output+'/desktop-pee-rescue.png',fullPage:true});
  await page.keyboard.press('Escape');const peeURL=page.url();await page.reload();await page.locator('#resume').waitFor();assert.ok((await saved(page)).peeFound);
  const peeCopy=await desktop.newPage();await peeCopy.goto(peeURL);await peeCopy.locator('#resume').waitFor();assert.match(await peeCopy.locator('#buddy-status').innerText(),/Three/);await peeCopy.close();
  await page.locator('#home-link').click();await page.locator('#begin').waitFor();await page.goBack();await page.locator('#resume').waitFor();assert.ok((await saved(page)).peeFound);
  await page.locator('#resume').click();await page.locator('#pee-link').click();await waitRoom(page,'hills');assert.ok((await saved(page)).peeFound);
  const peeDamage=createRun('peedamage');peeDamage.keyFound=true;peeDamage.pepperFound=true;peeDamage.peeFound=true;peeDamage.health=4;peeDamage.room='burrows';peeDamage.positions.burrows={x:891,y:375};peeDamage.seed=1;
  await seed(page,peeDamage);await page.keyboard.press('w');await page.waitForFunction(()=>document.getElementById('room-toast').textContent.startsWith('Pee got bonked!'));
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await saved(page)).health,3);
  await page.screenshot({path:output+'/desktop-pee-hit.png',fullPage:true});
  const peeLoss={...peeDamage,id:'peeloss123',health:1,revision:0};await seed(page,peeLoss);await page.keyboard.press('w');await waitView(page,'retry');assert.equal((await saved(page)).health,0);
  await page.reload();await page.locator('#retry').click();await waitView(page,'play');assert.ok((await saved(page)).peeFound);assert.equal((await saved(page)).health,4);
  const trio={...peeDamage,id:'peepicnic',basketFound:true,completed:true,trinkets:TRINKETS.map(i=>i.id)};
  await seed(page,trio,'orchard','picnic');await page.locator('.picnic-card').waitFor();assert.match(await page.locator('.picnic-card').innerText(),/Pepsi, Pepper & Pee/);await page.screenshot({path:output+'/desktop-three-friends.png',fullPage:true});
  for(const room of ['burrows','woods','hills']){
    const terrain={...peeDamage,id:'terrain'+room,room,positions:{[room]:roomPoint(room,135,315)}};
    await seed(page,terrain);await page.keyboard.press('w');await page.waitForTimeout(room==='hills'?3500:150);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await page.screenshot({path:output+'/desktop-terrain-'+room+'.png',fullPage:true});
  }
  // Rescue the fourth corgi using the existing movement controls, then persist all abilities.
  const fourth=createRun('fourthtest');Object.assign(fourth,{keyFound:true,pepperFound:true,peeFound:true,basketFound:true,health:2,room:'laundry',trinkets:TRINKETS.slice(0,12).map(i=>i.id),positions:{laundry:{x:755,y:160}}});
  await seed(page,fourth);await hold(page,'d',150);await page.locator('#ability-continue').click();await page.keyboard.press('Escape');assert.ok((await saved(page)).pepperoniFound);assert.equal((await saved(page)).health,2);await page.reload();await page.locator('#resume').click();assert.match(await page.locator('#abilities').innerText(),/Pepperoni · Power/);
  const rescuedFourth=await saved(page);
  // Each chosen key casts only its own move, with durable and visible cooldowns.
  const skillRun={...createRun('skillsbrowser'),keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,health:4,tutorialStep:3,room:'tutorial'};
  await seed(page,skillRun);
  assert.deepEqual(await page.locator('#abilities kbd').allTextContents(),['Space','J','K','L']);
  assert.equal(await page.locator('[data-ability=bark]').getAttribute('aria-keyshortcuts'),'J');
  assert.equal(await page.locator('[data-ability=stink]').getAttribute('aria-keyshortcuts'),'K');
  assert.equal(await page.locator('[data-ability=power]').getAttribute('aria-keyshortcuts'),'L');
  await page.keyboard.down('w');
  for(const oldKey of ['q','e','r'])await page.keyboard.press(oldKey);
  assert.deepEqual((await saved(page)).cooldowns,{dash:0,bark:0,stink:0,power:0},'Q/E/R cannot accidentally fire abilities');
  await page.keyboard.press('Space');
  let cds=(await saved(page)).cooldowns;assert.ok(cds.dash>2.5);assert.deepEqual([cds.bark,cds.stink,cds.power],[0,0,0]);
  await page.keyboard.press('j');assert.match(await page.locator('[data-ability="bark"]').innerText(),/Protected/);cds=(await saved(page)).cooldowns;assert.ok(cds.bark>9.5);assert.equal(cds.stink,0);assert.equal(cds.power,0);
  assert.ok(await page.locator('kbd[data-move=w]').evaluate(key=>key.classList.contains('pressed')),'left-hand movement stays held during the right-hand ability');
  await page.locator('#keyboard-capture').evaluate(input=>input.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'k',bubbles:true,cancelable:true})));
  cds=(await saved(page)).cooldowns;assert.ok(cds.stink>6.5);assert.equal(cds.power,0);
  await page.keyboard.press('l');assert.equal((await saved(page)).cooldowns.power,0,'power waits for the shared roll recovery');
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');const coolingBefore=(await saved(page)).cooldowns;await page.reload();assert.deepEqual((await saved(page)).cooldowns,coolingBefore,'reload preserves recharge');await page.locator('#resume').click();await page.keyboard.press('d');
  await page.locator('[data-ability="power"]').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-ability="power"]').disabled);
  await page.keyboard.press('l');cds=(await saved(page)).cooldowns;assert.ok(cds.power>7.5);assert.ok(cds.dash>2.5);assert.ok(await page.locator('[data-ability="dash"]').isDisabled());
  await page.keyboard.press('Escape');await page.locator('#resume').click();await page.keyboard.press('d');
  await page.waitForFunction(()=>!document.querySelector('[data-ability="bark"]').disabled);await page.locator('[data-ability="bark"]').click();assert.ok((await saved(page)).cooldowns.bark>9.5);assert.equal(await page.evaluate(()=>document.activeElement.id),'keyboard-capture','clicking an ability returns focus to movement');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.screenshot({path:output+'/desktop-independent-abilities.png',fullPage:true});
  await seed(page,rescuedFourth);
  await page.keyboard.press('s');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.screenshot({path:output+'/desktop-pepperoni.png',fullPage:true});
  const kitchen={...await saved(page),positions:{kitchen:{x:135,y:315}}};await seed(page,kitchen,'kitchen');await page.keyboard.press('d');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.screenshot({path:output+'/desktop-kitchen.png',fullPage:true});
  let battle={...kitchen,id:'bossbrowser',room:'boss',health:4,trinkets:TRINKETS.map(i=>i.id),positions:{boss:{x:645,y:315}},revision:0};
  for(let hit=0;hit<4;hit++){
    battle.positions.boss={x:645,y:315};battle.cooldowns={dash:0,bark:0,stink:0,power:0};battle.bossState={x:710,y:315,r:44,hp:8-hit*2,mode:'exposed',timer:3.4,aimX:-1,aimY:0,cycle:hit};
    await seed(page,battle,'boss');await page.keyboard.down('d');await page.keyboard.press('l');await page.waitForTimeout(130);await page.keyboard.up('d');await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>effectRequests.filter(k=>k==='bonk-boss').length),1,'each boss hit, including the final hit, makes one heavy bonk');
    battle=await saved(page);assert.equal(battle.bossState.hp,6-hit*2);assert.equal(battle.bossDefeated,hit===3);await page.reload();await page.locator('#resume').waitFor();assert.equal((await saved(page)).bossState.hp,6-hit*2);
    if(hit===0){await page.locator('#resume').click();await page.keyboard.press('a');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.screenshot({path:output+'/desktop-vacuum-boss.png',fullPage:true});}
  }
  battle.positions.boss={x:885,y:320};battle.revision++;await seed(page,battle,'boss');await hold(page,'d',120);await waitView(page,'picnic');assert.ok((await saved(page)).completed);await page.screenshot({path:output+'/desktop-four-friends.png',fullPage:true});
  // Old reunion deep links remain usable and resume at the pond.
  const reunionURL=`${base}?view=reunion&run=${rescue.id}&room=pond`;await page.goto(reunionURL);await page.locator('.story-card').waitFor();await page.reload();await page.locator('.story-card').waitFor();
  const reunionCopy=await desktop.newPage();await reunionCopy.goto(reunionURL);await reunionCopy.locator('.story-card').waitFor();await reunionCopy.close();
  await page.locator('#reunion-continue').click();await waitRoom(page,'pond');assert.equal(await page.locator('#save-error').isVisible(),false);
  // A real hazard hit and defeat, with no game-state test hooks.
  const damage=createRun('damage123');damage.health=1;damage.positions.meadow={x:300,y:350};await seed(page,damage);await page.keyboard.press('w');await page.waitForURL(/view=retry/,{timeout:10000});assert.equal((await saved(page)).health,0);assert.equal((await saved(page)).hits,1);
  const lostURL=page.url();await page.reload();await page.locator('#retry').waitFor();assert.equal(page.url(),lostURL);await page.screenshot({path:output+'/desktop-retry.png',fullPage:true});
  await page.locator('#retry').click();await waitView(page,'play');assert.equal((await saved(page)).health,3);assert.equal((await saved(page)).retries,1);
  // Pepsi is clear of the gopher; stationary Pepper occupies its hole.
  const pepperDamage=createRun('pepperbump');pepperDamage.keyFound=true;pepperDamage.pepperFound=true;pepperDamage.health=4;pepperDamage.room='burrows';pepperDamage.positions.burrows={x:313,y:200};pepperDamage.trinkets=['pond-ribbon'];
  await seed(page,pepperDamage);await page.keyboard.press('w');
  await page.waitForFunction(()=>document.getElementById('room-toast').textContent.startsWith('Pepper got bonked!'));
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  assert.equal((await saved(page)).health,3);assert.equal((await saved(page)).hits,1);
  assert.equal(await page.locator('#health-label').innerText(),'TEAM HEARTS');
  assert.equal(await page.locator('#health').getAttribute('aria-label'),'3 of 4 shared hearts');
  await page.screenshot({path:output+'/desktop-pepper-hit.png',fullPage:true});
  await page.reload();await waitRoom(page,'burrows');assert.equal((await saved(page)).health,3);assert.equal((await saved(page)).hits,1);
  const pepperLoss={...pepperDamage,id:'pepperloss',health:1,revision:0,trinkets:['pond-ribbon',...TRINKETS.filter(item=>item.room==='burrows').map(item=>item.id)],trinketCheckpoints:{burrows:[]}};
  await seed(page,pepperLoss);assert.equal(await page.locator('#trinket-count').innerText(),'3/14');
  await page.reload();assert.equal(await page.locator('#trinket-count').innerText(),'3/14','refresh keeps the attempt in progress');
  await page.keyboard.press('w');await waitView(page,'retry');
  assert.equal((await saved(page)).health,0);assert.equal((await saved(page)).hits,1);
  assert.deepEqual((await saved(page)).trinkets,['pond-ribbon'],'fatal Pepper hit immediately resets current-level trinkets');
  assert.equal(await page.locator('#trinket-count').innerText(),'1/14');
  const trinketLossURL=page.url();await page.reload();await page.locator('#retry').waitFor();
  assert.equal(await page.locator('#trinket-count').innerText(),'1/14');assert.match(await page.locator('.retry-card').innerText(),/snacks and trinkets return/);
  const lossCopy=await desktop.newPage();await lossCopy.goto(trinketLossURL);await lossCopy.locator('#retry').waitFor();
  assert.equal(await lossCopy.locator('#trinket-count').innerText(),'1/14');await lossCopy.close();await page.bringToFront();
  await page.locator('#retry').click();await waitView(page,'play');
  assert.equal((await saved(page)).health,4);assert.equal((await saved(page)).pepperFound,true);assert.deepEqual((await saved(page)).trinkets,['pond-ribbon']);
  await page.goBack();await waitView(page,'play');assert.equal(await page.locator('#trinket-count').innerText(),'1/14');
  await page.goForward();await waitView(page,'play');assert.equal(await page.locator('#trinket-count').innerText(),'1/14');
  const squishy={...createRun('squishweb'),keyFound:true,pepperFound:true,health:4,room:'orchard',positions:{orchard:{x:NEEDOH.x-65,y:NEEDOH.y}}};
  await seed(page,squishy);await page.keyboard.down('d');await page.keyboard.press('Space');await page.waitForTimeout(130);await page.keyboard.up('d');
  assert.equal((await saved(page)).needohFound,true);assert.equal(await page.evaluate(()=>effectRequests.filter(k=>k==='squish').length),1);
  await page.screenshot({path:output+'/desktop-needoh.png',fullPage:true});await page.keyboard.press('Escape');await page.reload();await page.locator('#resume').waitFor();assert.equal((await saved(page)).needohFound,true);
  const squishCopy=await desktop.newPage();await squishCopy.goto(page.url());await squishCopy.locator('#resume').waitFor();assert.equal((await saved(squishCopy)).needohFound,true);await squishCopy.close();
  await page.locator('#home-link').click();await page.locator('#begin').waitFor();await page.goBack();await page.locator('#resume').waitFor();assert.equal((await saved(page)).needohFound,true);
  const squishWin={...await saved(page),basketFound:true,bossDefeated:true,completed:true};await seed(page,squishWin,'orchard','picnic');assert.match(await page.locator('.picnic-card').innerText(),/NeeDoh came home/);await page.screenshot({path:output+'/desktop-needoh-picnic.png',fullPage:true});
  const final=createRun('finaltest');final.keyFound=true;final.pepperFound=true;final.health=4;final.trinkets=TRINKETS.map(item=>item.id);final.room='orchard';final.positions.orchard={x:ROOMS.orchard.goal.x-45,y:ROOMS.orchard.goal.y};await seed(page,final);
  await hold(page,'d',250);assert.ok((await saved(page)).basketFound);await page.keyboard.press('Escape');const basketExit=await saved(page);basketExit.positions.orchard=roomPoint('orchard',895,320);await seed(page,basketExit);await hold(page,'d',150);await waitRoom(page,'laundry');assert.equal((await saved(page)).completed,false,'the orchard now continues into the cottage');
  const finish={...final,id:'bossfinish',peeFound:true,pepperoniFound:true,basketFound:true,bossDefeated:true,completed:true};await seed(page,finish,'boss','picnic');await page.locator('.picnic-card').waitFor();
  const finalBox=await page.locator('#stage').boundingBox();assert.ok(finalBox.width>1100,'wider desktop playfield');
  await page.screenshot({path:output+'/desktop-picnic.png',fullPage:true});await page.reload();await page.locator('.picnic-card').waitFor();
  await page.locator('#again').click();await waitView(page,'play');assert.equal((await saved(page)).pepperFound,false);assert.equal((await saved(page)).health,3);const replayBox=await page.locator('#stage').boundingBox();assert.equal(replayBox.width,finalBox.width);assert.equal(replayBox.y,finalBox.y,'completion and replay keep the stage anchored');
  // Every room supports refresh, copied URLs, and Back/Forward.
  const routes=createRun('routes123');routes.keyFound=true;routes.pepperFound=true;routes.health=4;routes.peeFound=true;routes.pepperoniFound=true;routes.basketFound=true;routes.trinkets=TRINKETS.map(i=>i.id);
  await seed(page,routes,'meadow','pause');
  for(const room of ['tutorial',...ORDER]){
    await page.goto(`${base}?view=pause&run=${routes.id}&room=${room}`);await page.locator('.pause-card').waitFor();const url=page.url();await page.reload();await page.locator('.pause-card').waitFor();assert.equal(page.url(),url);
    const copied=await desktop.newPage();await copied.goto(url);await copied.locator('.pause-card').waitFor();assert.equal(await copied.locator('#room-name').textContent(),ROOMS[room].name);await copied.close();
    await page.locator('#home-link').click();await page.locator('#begin').waitFor();await page.goBack();await page.locator('.pause-card').waitFor();assert.equal(page.url(),url);await page.goForward();await page.locator('#begin').waitFor();
  }
  // Original v1 save is kept intact while the new game imports its milestones.
  const legacy={version:1,id:'legacytest',seed:42,collected:['meadow-0','meadow-1','meadow-2','meadow-3'],completed:false};
  await page.evaluate(data=>localStorage.setItem('pepsi-pepper.snack-quest.v1.'+data.id,JSON.stringify(data)),legacy);
  await page.goto(`${base}?view=play&run=${legacy.id}&room=pond&corgi=pepper`);await waitRoom(page,'pond');assert.ok((await saved(page)).keyFound);assert.equal((await saved(page)).pepperFound,false);
  assert.deepEqual(await page.evaluate(id=>JSON.parse(localStorage.getItem('pepsi-pepper.snack-quest.v1.'+id)),legacy.id),legacy);assert.doesNotMatch(page.url(),/corgi=/);
  // Existing v2 saves keep their exact location, hearts, snacks, and completed endings.
  const oldQuest=createRun('oldv2quest');delete oldQuest.trinkets;oldQuest.keyFound=true;oldQuest.pepperFound=true;oldQuest.health=2;oldQuest.room='orchard';oldQuest.positions.orchard={x:245,y:380};oldQuest.collected=['pond-1'];
  await seed(page,oldQuest,'orchard');const upgraded=await saved(page);assert.equal(upgraded.health,2);assert.deepEqual(upgraded.positions.orchard,oldQuest.positions.orchard);assert.deepEqual(upgraded.collected,['pond-1']);assert.deepEqual(upgraded.trinkets,[]);
  const oldFinished={...oldQuest,id:'oldv2win',basketFound:true,completed:true};await seed(page,oldFinished,'orchard','picnic');await page.locator('.picnic-card').waitFor();assert.equal(await page.locator('#trinket-count').innerText(),'10/14');await page.getByText('Continue into the three new chapters →').click();await waitRoom(page,'laundry');await page.locator('.brand').click();assert.match(await page.locator('#begin').innerText(),/Continue/);await page.locator('#begin').click();await waitRoom(page,'laundry');
  const stale=createRun('staletest');await seed(page,stale,'meadow','pause');
  await page.evaluate(({prefix,id})=>{const latest=JSON.parse(localStorage.getItem(prefix+id));latest.health=2;latest.revision+=1;localStorage.setItem(prefix+id,JSON.stringify(latest));},{prefix,id:stale.id});
  await page.locator('#resume').click();await waitView(page,'play');await hold(page,'d',180);await page.keyboard.press('Escape');await waitView(page,'pause');await page.locator('#save-error').waitFor({state:'visible'});assert.equal((await saved(page)).health,2,'stale tab cannot overwrite newer damage');
  await page.locator('#load-save').click();await page.locator('#save-error').waitFor({state:'hidden'});assert.equal(await page.locator('#health').getAttribute('aria-label'),'2 of 3 hearts');
  await desktop.close();
  }

  // Measure real Web Audio output: opt-in, mute, pause, focus loss, and preference restoration.
  const listening=await browser.newContext({viewport:{width:1440,height:1000}});
  await listening.addInitScript(()=>{
    const NativeAudioContext=window.AudioContext;
    window.audioProbe={contexts:[],level:()=>0};
    window.AudioContext=class extends NativeAudioContext {
      constructor(...args){
        super(...args);window.audioProbe.contexts.push(this);
        const meter=this.createAnalyser(),samples=new Float32Array(meter.fftSize);
        window.audioProbe.level=()=>{meter.getFloatTimeDomainData(samples);return Math.max(...samples.map(Math.abs));};
        const createGain=this.createGain.bind(this);
        this.createGain=()=>{const gain=createGain(),connect=gain.connect.bind(gain);gain.connect=(destination,...rest)=>{
          if(destination===this.destination){connect(meter);meter.connect(destination);return destination;}
          return connect(destination,...rest);
        };return gain;};
      }
    };
  });
  const musicPage=await pageFor(listening);
  if(process.env.SNACK_QUEST_OFFLINE_AUDIO!=='1') {
  assert.equal(await musicPage.evaluate(()=>audioProbe.contexts.length),0,'silent until opted in');
  await musicPage.locator('#sound').click();
  try{await musicPage.waitForFunction(()=>audioProbe.level()>.005);}catch(error){console.error('Audio diagnostics',await musicPage.evaluate(()=>({focus:document.hasFocus(),visibility:document.visibilityState,sound:document.getElementById('sound').getAttribute('aria-pressed'),contexts:audioProbe.contexts.map(c=>({state:c.state,time:c.currentTime})),level:audioProbe.level()})),errors);throw error;}
  await musicPage.locator('#begin').click();await waitView(musicPage,'play');
  await musicPage.keyboard.press('Escape');await waitView(musicPage,'pause');
  await musicPage.waitForTimeout(900);assert.ok(await musicPage.evaluate(()=>audioProbe.level()<.00001),'music is silent while paused');
  await musicPage.keyboard.press('d');await waitView(musicPage,'play');
  await musicPage.waitForFunction(()=>audioProbe.level()>.005);
  await musicPage.evaluate(()=>window.dispatchEvent(new Event('blur')));await waitView(musicPage,'play');
  await musicPage.waitForTimeout(150);assert.ok(await musicPage.evaluate(()=>audioProbe.level()<.00001),'focus loss stops all audio');
  await musicPage.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await musicPage.keyboard.press('d');await waitView(musicPage,'play');
  await musicPage.waitForFunction(()=>audioProbe.level()>.005);
  await musicPage.locator('#sound').click();await musicPage.waitForTimeout(150);
  assert.ok(await musicPage.evaluate(()=>audioProbe.level()<.00001),'mute stops active and scheduled voices');
  await musicPage.locator('#sound').click();await musicPage.waitForFunction(()=>audioProbe.level()>.005);
  assert.equal(await musicPage.evaluate(()=>audioProbe.contexts.length),1,'resumes one soundtrack without duplicate contexts');
  await musicPage.keyboard.press('Escape');await musicPage.reload();await musicPage.locator('.pause-card').waitFor();
  assert.equal(await musicPage.locator('#sound').getAttribute('aria-pressed'),'true');
  assert.equal(await musicPage.evaluate(()=>audioProbe.contexts.length),0,'saved sound preference still waits for a gesture');
  await musicPage.keyboard.press('d');await musicPage.waitForFunction(()=>audioProbe.level()>.005);
  await musicPage.keyboard.press('Escape');
  await musicPage.screenshot({path:output+'/desktop-sound.png',fullPage:true});
  } else console.log('Live audio checks skipped: this host has no advancing audio output clock. Checking synthesized audio offline instead.');

  // Render the actual score for a listenable preview and check its level/headroom.
  const preview=await musicPage.evaluate(async()=>{
    const {Soundscape}=await import('/games/snack-quest/audio.mjs?v=32');
    const rate=22050,context=new OfflineAudioContext(1,rate*22,rate);
    const score=new Soundscape(()=>context);score.setEnabled(true);score.unlock();score.setScene('play','meadow');
    for(let i=0;i<64;i++)score.musicBeat(i,.1+i*30/96,30/96);
    const rendered=await context.startRendering();return [...rendered.getChannelData(0)];
  });
  let peak=0;for(const sample of preview){assert.ok(Number.isFinite(sample));peak=Math.max(peak,Math.abs(sample));}
  assert.ok(peak>.03&&peak<.8,'original music renders audibly with headroom');
  const effects=await musicPage.evaluate(async()=>{
    const {Soundscape}=await import('/games/snack-quest/audio.mjs?v=32');
    const levels={};
    for(const kind of ['shield','toot','bonk','bonk-crate','bonk-boss','honk','squish']){
      const context=new OfflineAudioContext(1,22050,22050),score=new Soundscape(()=>context);score.setEnabled(true);score.unlock();
      // Offline rendering has no gesture/output-device readiness; exercise the real effect graph.
      Object.defineProperty(score,'ready',{value:true});score.play(kind);
      const rendered=await context.startRendering();levels[kind]=Math.max(...rendered.getChannelData(0).map(Math.abs));
    }
    return levels;
  });
  for(const [kind,level]of Object.entries(effects))assert.ok(level>.01&&level<.8,kind+' renders with audible, unclipped output');
  const wav=Buffer.alloc(44+preview.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(preview.length*2,40);
  preview.forEach((sample,i)=>wav.writeInt16LE(Math.round(sample*32767),44+i*2));writeFileSync(output+'/snack-quest-theme.wav',wav);
  await listening.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const phone=await pageFor(mobile);
  assert.equal(await phone.locator('.phone-note').isVisible(),true);
  await phone.screenshot({path:output+'/mobile-home.png',fullPage:true});
  await phone.setViewportSize({width:844,height:390});await phone.waitForFunction(()=>document.body.classList.contains('touch-landscape'));
  assert.equal(await phone.locator('#joystick').isVisible(),true);assert.equal(await phone.locator('.phone-note').isVisible(),false);
  const mobileRun=createRun('mobile123');mobileRun.keyFound=true;mobileRun.pepperFound=true;mobileRun.health=4;mobileRun.peeFound=true;mobileRun.pepperoniFound=true;mobileRun.basketFound=true;mobileRun.trinkets=TRINKETS.map(i=>i.id);
  for(const room of ['tutorial',...ORDER]){await seed(phone,mobileRun,room,'pause');const url=phone.url();await phone.reload();await phone.locator('.pause-card').waitFor();assert.equal(phone.url(),url);const copy=await mobile.newPage();await copy.goto(url);await copy.locator('.pause-card').waitFor();assert.equal(await copy.locator('#room-name').textContent(),ROOMS[room].name);await copy.close();await phone.locator('#home-link').click();await phone.locator('#begin').waitFor();await phone.goBack();await phone.locator('.pause-card').waitFor();assert.equal(phone.url(),url);await phone.goForward();await phone.locator('#begin').waitFor();await phone.goBack();await phone.locator('.pause-card').waitFor();await dismissOutside(phone);await waitView(phone,'play');await phone.keyboard.press('Escape');await waitView(phone,'pause');}
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const reunionMobile=createRun('mobilestory');reunionMobile.keyFound=true;reunionMobile.pepperFound=true;reunionMobile.health=4;await seed(phone,reunionMobile,'pond','reunion');await phone.screenshot({path:output+'/mobile-reunion.png',fullPage:true});
  const mobileLoss=createRun('mobileloss');Object.assign(mobileLoss,{keyFound:true,pepperFound:true,health:1,room:'burrows',positions:{burrows:{x:313,y:200}},trinkets:['pond-ribbon',...TRINKETS.filter(item=>item.room==='burrows').map(item=>item.id)],trinketCheckpoints:{burrows:[]}});
  await seed(phone,mobileLoss);await phone.keyboard.press('w');await waitView(phone,'retry');
  assert.deepEqual((await saved(phone)).trinkets,['pond-ribbon']);await phone.reload();await phone.locator('#retry').waitFor();
  assert.equal(await phone.locator('#trinket-count').innerText(),'1/14');await phone.screenshot({path:output+'/mobile-trinket-retry.png',fullPage:true});
  const mobileLossCopy=await mobile.newPage();await mobileLossCopy.goto(phone.url());await mobileLossCopy.locator('#retry').waitFor();assert.equal(await mobileLossCopy.locator('#trinket-count').innerText(),'1/14');await mobileLossCopy.close();await phone.bringToFront();
  await phone.locator('#retry').click();await waitView(phone,'play');assert.deepEqual((await saved(phone)).trinkets,['pond-ribbon']);
  await phone.goBack();await waitView(phone,'play');await phone.goForward();await waitView(phone,'play');assert.equal(await phone.locator('#trinket-count').innerText(),'1/14');
  const winMobile=createRun('mobilewin');winMobile.needohFound=true;winMobile.keyFound=true;winMobile.pepperFound=true;winMobile.basketFound=true;winMobile.completed=true;winMobile.health=4;winMobile.peeFound=true;winMobile.pepperoniFound=true;winMobile.trinkets=TRINKETS.map(item=>item.id);await seed(phone,winMobile,'orchard','picnic');await phone.screenshot({path:output+'/mobile-picnic.png',fullPage:true});await mobile.close();

  const blocked=await browser.newContext();await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});const failure=await pageFor(blocked);await failure.locator('#begin').click();await failure.locator('#save-error').waitFor({state:'visible'});const downloadPromise=failure.waitForEvent('download');await failure.locator('#download-save').click();assert.equal((await downloadPromise).suggestedFilename(),'pepsi-pepper-adventure.json');await blocked.close();
  assert.deepEqual(errors,[]);console.log('PASS: '+(process.env.SNACK_QUEST_SKIP_DESKTOP==='1'?'remaining audio/mobile checks':'WASD, independent Space/J/K/L controls and cooldowns, four corgis, fourteen trinkets, nine chapters and boss, navigation, save recovery, and mobile checks')+'; '+(process.env.SNACK_QUEST_OFFLINE_AUDIO==='1'?'offline music and ability-effect rendering (live output unverified)':'live audio playback/mute/pause/resume and offline ability effects')+'.');
  console.log('Screenshots: '+output);
}finally{await browser.close();}
