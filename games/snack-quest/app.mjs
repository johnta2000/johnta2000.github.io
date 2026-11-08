import { DIFFICULTIES, ENEMY_KINDS, rulesFor, enemyKinds, setMapStretch, adaptWorldLayout, ROOMS, ORDER, DASH_COOLDOWN, ABILITIES, WIDTH, HEIGHT, createRun, peeProgress, upgradeRun, TRINKETS, validRun, migrateRun, enterRoom, makeWorld, maxHearts, goalDone, isUnlocked, firstUnfinished, objective, retryRoom, step, startDash, startAbility } from './engine.mjs?v=44';
import { enemyPortrait, portrait, drawWorld, drawPicnic } from './art.mjs?v=44';
import { movementKey, abilityKey, isTextEntry, joystickVector } from './input.mjs?v=44';
import { Soundscape } from './audio.mjs?v=44';

const $ = id => document.getElementById(id);
const canvas=$('world'), ctx=canvas.getContext('2d');
const keyboardCapture=$('keyboard-capture');
const touchQuery=matchMedia('(pointer: coarse)'),landscapeQuery=matchMedia('(orientation: landscape)');
const touchCapable=navigator.maxTouchPoints>0;
let touchMode=touchCapable||touchQuery.matches;
const stick={pointerId:null,x:0,y:0};
const moves={dash:{key:'Space',corgi:'Pepsi',name:'Dash',hint:'Dodge, bonk & break crates',cooldown:DASH_COOLDOWN},...ABILITIES};
const PREFIX='pepsi-pepper.snack-quest.v2.', LEGACY='pepsi-pepper.snack-quest.v1.';
const memory=new Map(), savedSnapshots=new Map(), keys=new Set();
const soundtrack=new Soundscape();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let run=null, world=null, view='home', viewportWidth=WIDTH, viewportHeight=HEIGHT, mobileMapInsets=null, lastFrame=0, saveElapsed=0;
let shownAbility='bark',shownEnemies=[],setupFocus='begin',preferredDifficulty='normal';
const abilitySlugs={bark:'shield',stink:'zoomies',power:'belly-flop'};
let toastUntil=0, animationTime=0, soundOn=false, latestId=null;
let readFailed=false, saveFailed=false, conflict=false, backdropDown=false;
let controlsReady=false,pendingMove=null,textRelease=0;
try {
  const preference=localStorage.getItem(PREFIX+'difficulty');if(Object.hasOwn(DIFFICULTIES,preference))preferredDifficulty=preference;
  latestId=localStorage.getItem(PREFIX+'latest')||localStorage.getItem(LEGACY+'latest');
  soundOn=(localStorage.getItem(PREFIX+'sound')||localStorage.getItem(LEGACY+'sound'))==='true';
} catch { readFailed=true; }
soundtrack.setEnabled(soundOn);
soundtrack.setForeground(!document.hidden&&document.hasFocus());

function showSaveError(message) {
  $('save-error').hidden=false; $('save-message').textContent=message;
  $('load-save').hidden=!conflict;
  $('save-status').textContent='Unsaved progress is kept in this tab.';
}
function readRun(id) {
  if(!/^[a-z0-9]{6,16}$/.test(id||''))return null;
  if(memory.has(id))return memory.get(id);
  try {
    const raw=localStorage.getItem(PREFIX+id);
    let saved;
    if(raw) {saved=JSON.parse(raw);if(!validRun(saved,id))throw Error('Invalid save');savedSnapshots.set(id,JSON.stringify({...saved,revision:0}));}
    else {
      const legacy=localStorage.getItem(LEGACY+id);
      if(!legacy)return null;
      saved=migrateRun(JSON.parse(legacy),id);
      if(!saved)throw Error('Invalid legacy save');
    }
    upgradeRun(saved);memory.set(id,saved); return saved;
  } catch {readFailed=true;return null;}
}
function save() {
  if(!run)return true;
  if(world){run.positions[world.room]={x:world.player.x,y:world.player.y};run.room=world.room;}
  memory.set(run.id,run);latestId=run.id;
  const snapshot=JSON.stringify({...run,revision:0});
  if(savedSnapshots.get(run.id)===snapshot&&!saveFailed)return true;
  try {
    const raw=localStorage.getItem(PREFIX+run.id);
    if(raw) {
      const other=JSON.parse(raw);
      if(!validRun(other,run.id))throw Error('Existing save needs recovery');
      if(other.revision>run.revision){conflict=true;throw Error('This adventure changed in another tab. Download this progress or load the other tab’s save.');}
    }
    const next={...run,revision:run.revision+1};
    localStorage.setItem(PREFIX+run.id,JSON.stringify(next));
    run.revision=next.revision;savedSnapshots.set(run.id,snapshot);
    localStorage.setItem(PREFIX+'latest',run.id);
    saveFailed=false;conflict=false;$('save-error').hidden=true;
    $('save-status').textContent='Adventure saved on this device.';
    return true;
  } catch(error) {
    saveFailed=true;
    showSaveError(conflict?error.message:'Your adventure couldn’t be saved. Keep this tab open or download a backup.');
    return false;
  }
}
function routeURL(nextView='play',room=world?.room||run?.room||'meadow',id=run?.id) {
  const url=new URL(location.href);url.search='';url.hash='';
  if(nextView!=='home')url.searchParams.set('view',nextView);
  if(nextView==='setup'){url.searchParams.set('difficulty',new URLSearchParams(location.search).get('difficulty')||preferredDifficulty);url.searchParams.set('from',view==='setup'?(new URLSearchParams(location.search).get('from')||'home'):view);}
  if(nextView==='enemies'){url.searchParams.set('enemy',shownEnemies.join(','));url.searchParams.set('from',view==='enemies'?(new URLSearchParams(location.search).get('from')||'play'):view==='pause'?'pause':'play');}
  if(nextView==='ability'){url.searchParams.set('ability',abilitySlugs[shownAbility]);const from=view==='ability'?new URLSearchParams(location.search).get('from'):view;url.searchParams.set('from',from==='pause'?'pause':'play');}
  if(['fullscreen','sound'].includes(nextView)){const from=['fullscreen','sound'].includes(view)?new URLSearchParams(location.search).get('from'):view;url.searchParams.set('from',['home','play','pause','picnic','retry'].includes(from)?from:'home');}
  if(id)url.searchParams.set('run',id);
  if(nextView!=='home')url.searchParams.set('room',room);
  return url;
}
function navigate(url,{replace=false,enter=false}={}) {
  save();
  if(new URL(url,location.href).searchParams.get('view')==='setup'&&view!=='setup')setupFocus=document.activeElement?.id||'begin';
  const destination=new URL(url,location.href),room=destination.searchParams.get('room');
  if(enter&&run&&run.health>0&&Object.hasOwn(ROOMS,room)&&isUnlocked(run,room)){
    world=enterRoom(run,room);clearInput();controlsReady=false;save();
  }
  history[replace?'replaceState':'pushState']({},'',destination);readRoute();
}
function newRun() {
  save();
  const id=Date.now().toString(36)+crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0,3);
  rememberDifficulty(new URLSearchParams(location.search).get('difficulty')||preferredDifficulty);
  run=createRun(id,preferredDifficulty);world=makeWorld(run,'tutorial');conflict=false;save();
  navigate(routeURL('play','tutorial'));sound('start');
}
function announce(message){$('announcement').textContent=message;}
function controlText(message) {
  if(!touchMode)return message;
  return message.replace('Hold D + tap SPACE','Roll right + tap Dash').replace(/WASD/g,'the joystick')
    .replace(/Press J/g,'Tap Shield').replace(/Press K/g,'Tap Zoomies').replace(/Press L/g,'Tap Belly Flop')
    .replace(/\bL\b/g,'Belly Flop').replace(/\bSpace\b|\bSPACE\b/g,'Dash');
}
function touchPortrait(){return touchMode&&!landscapeQuery.matches;}
function toast(message,duration=3200){message=controlText(message);$('room-toast').textContent=message;$('room-toast').hidden=false;toastUntil=performance.now()+duration;announce(message);}
function paintInput() {
  document.querySelectorAll('[data-move]').forEach(key => key.classList.toggle('pressed',keys.has(key.dataset.move)));
}
function clearInput(){keys.clear();pendingMove=null;clearTimeout(textRelease);keyboardCapture.value='';releaseJoystick();paintInput();}
function readyToMove(key) {
  controlsReady=true;$('control-prompt').hidden=true;
  keys.add(key);pendingMove=inputDirection();paintInput();
}
function focusGame() {
  if(view!=='play'||touchMode)return;
  // A real text control gives embedded WebKit a native keyboard responder;
  // focusing a canvas alone can leave physical typing with the host app.
  keyboardCapture.focus({preventScroll:true});
  requestAnimationFrame(()=>{
    if(view==='play'&&document.hasFocus()&&!isTextEntry(document.activeElement))keyboardCapture.focus({preventScroll:true});
  });
}
function readRoute() {
  clearInput();controlsReady=false;
  browserChime.pause();
  const query=new URLSearchParams(location.search),requested=query.get('view')||'home';let autoEnemies=false;
  view=['home','play','pause','reunion','retry','picnic','fullscreen','ability','sound','setup','enemies'].includes(requested)?requested:'home';
  const id=query.get('run'),requestedRoom=query.get('room');
  let saved=readRun(id||latestId);
  if(!saved&&!readFailed&&id&&/^[a-z0-9]{6,16}$/.test(id)){saved=createRun(id);memory.set(id,saved);}
  if(saved) {
    run=saved;
    let room=Object.hasOwn(ROOMS,requestedRoom||'')?requestedRoom:run.room;
    if(!isUnlocked(run,room))room=firstUnfinished(run);
    if(!world||world.room!==room||world.runId!==run.id)world=makeWorld(run,room);
  } else {run=null;world=null;}
  if(!['home','fullscreen','sound','setup'].includes(view)&&!run)view='home';
  if(run&&view!=='home') {
    if(run.health<=0&&!['fullscreen','sound','setup'].includes(view))view='retry';
    else if(view==='retry')view='play';
    if(view==='ability'){shownAbility=Object.keys(abilitySlugs).find(id=>abilitySlugs[id]===query.get('ability')||(id==='stink'&&query.get('ability')==='toot')||(id==='power'&&query.get('ability')==='power'))||run.pendingAbility||'bark';if(!run[ABILITIES[shownAbility].unlock])view='play';}
    if(view==='play'&&run.pendingAbility){shownAbility=run.pendingAbility;view='ability';}
    if(view==='play'){shownEnemies=enemyKinds(world).filter(k=>!run.seenEnemies.includes(k));if(shownEnemies.length){view='enemies';autoEnemies=true;}}
    if(view==='enemies'&&!autoEnemies){const available=enemyKinds(world),requested=(query.get('enemy')||'').split(',').filter(k=>available.includes(k));shownEnemies=[...new Set(requested.length?requested:available)];if(!shownEnemies.length)view='play';}
    if(view==='reunion'&&!run.pepperFound)view='play';
    if(view==='picnic'&&(!run.completed||!run.basketFound))view='play';
  }
  const canonical=routeURL(view,world?.room);if(view==='setup'&&!Object.hasOwn(DIFFICULTIES,canonical.searchParams.get('difficulty')))canonical.searchParams.set('difficulty','normal');history.replaceState({},'',canonical);
  soundtrack.setScene(view,world?.room||'meadow',{bossDefeated:!!run?.bossDefeated});
  render();
  if(view==='play') {
    focusGame();
    toast(goalDone(run,world.room)||run.difficulty!=='normal'?objective(run,world.room):ROOMS[world.room].note,4200);
    save();
  }
  if(readFailed) {
    showSaveError('A previous save could not be read. It has been left untouched. You can restore a backup or begin a new adventure.');
    readFailed=false;
  }
}
function abilityURL(id,from='pause'){
  const url=routeURL('ability');url.searchParams.set('ability',abilitySlugs[id]);url.searchParams.set('from',from);return url;
}
function abilityGuideLinks(){
  const unlocked=Object.entries(ABILITIES).filter(([,spec])=>run?.[spec.unlock]);
  return unlocked.length?`<nav class="ability-guide" aria-label="Ability instructions"><p>Your corgis’ abilities</p>${unlocked.map(([id,spec])=>`<a data-guide="${id}" href="${abilityURL(id)}">${spec.corgi}: ${spec.name}</a>`).join('')}</nav>`:'';
}
function renderAbilityIntro(){
  const spec=ABILITIES[shownAbility],fresh=run.pendingAbility===shownAbility;
  const rules=rulesFor(run);
  const details={
    bark:{effect:`Blue bubbles protect every corgi from damage for ${rules.shield} seconds. They flicker just before the shield ends.`,tip:'Use it when the back of your train is about to get hit. It prevents damage; it doesn’t heal hearts or stun enemies.'},
    stink:{effect:`Every corgi rolls 30% faster for ${rules.zoomies} seconds. Steer normally while the whole train gets the zoomies!`,tip:'Use it to escape a charge or cross an open gap. It doesn’t protect you from hits or strengthen your dash. Recharges in 14 seconds.'},
    power:{effect:`Pepperoni hops, then lands with a whump! Enemies within the golden circle are pushed away and stunned for ${rules.flopStun} seconds.`,tip:'The landing happens around Pepperoni at the back of your train. Use it to make space when enemies crowd your friends. It interrupts a nearby charging boss, or deals 2 damage while it’s overheated. Recharges in 12 seconds, independently of Dash.'}
  }[shownAbility];
  $('screen').innerHTML=`<div class="ability-card" role="dialog" aria-modal="true" aria-labelledby="ability-title"><div class="ability-portrait"><canvas width="240" height="200" data-portrait="${spec.corgi.toLowerCase()}" aria-label="${spec.corgi}"></canvas><strong>${spec.corgi}</strong></div><div class="ability-explanation"><p class="card-eyebrow">${fresh?'NEW FRIEND · NEW ABILITY':'ABILITY GUIDE'}</p><h3 id="ability-title" tabindex="-1">${spec.name}${fresh?' unlocked!':''}</h3><p>${details.effect}</p><p class="ability-tip">${details.tip}</p><div class="ability-facts"><span>${touchMode?`Tap <b>${spec.name}</b>`:`Press <kbd>${spec.key}</kbd>`}</span><span><b>${spec.cooldown}s</b> recharge</span></div>${fresh?'<p class="ability-team-note">'+(shownAbility==='bark'?'You now share four hearts. A hit to either corgi costs one. Pepper’s trinkets have appeared—find both to open the exit.':'Your new friend shares the team’s hearts—watch the whole train! Their two trinkets have now appeared. Find both to open the exit.')+'</p>':''}<button id="ability-continue" class="primary-button">${fresh?'Got it — let’s roll!':'Back to '+(new URLSearchParams(location.search).get('from')==='pause'?'pause':'the game')}</button><p class="tiny-note">The adventure is paused. Find this guide again in the pause menu.</p></div></div>`;
  $('ability-continue').addEventListener('click',dismissScreen);$('ability-title').focus({preventScroll:true});
}
function rememberDifficulty(value){preferredDifficulty=Object.hasOwn(DIFFICULTIES,value)?value:'normal';try{localStorage.setItem(PREFIX+'difficulty',preferredDifficulty);}catch{showSaveError('Your difficulty preference could not be saved. The selection is kept in this link.');}}
function renderSetup(){
  const query=new URLSearchParams(location.search),selected=Object.hasOwn(DIFFICULTIES,query.get('difficulty'))?query.get('difficulty'):'normal';
  $('screen').innerHTML=`<div class="setup-card" role="dialog" aria-modal="true" aria-labelledby="setup-title"><p class="card-eyebrow">A NEW LITTLE ADVENTURE</p><h3 id="setup-title" tabindex="-1">How much mischief?</h3><p>Choose the pace for this adventure.</p><fieldset class="difficulty-options"><legend>Difficulty</legend>${Object.entries(DIFFICULTIES).map(([id,d])=>`<label><input type="radio" name="difficulty" value="${id}" ${selected===id?'checked':''}><span><b>${d.label}</b><small>${d.description}</small></span></label>`).join('')}</fieldset><p class="tiny-note">Changes enemy types, attack ranges and timing. Your choice stays with this adventure.</p><div class="setup-actions"><button id="start-adventure" class="primary-button">Start with practice →</button><button id="setup-cancel" class="secondary-button">Back</button></div></div>`;
  $('screen').querySelectorAll('[name=difficulty]').forEach(input=>input.addEventListener('change',()=>{rememberDifficulty(input.value);const url=routeURL('setup');url.searchParams.set('difficulty',input.value);navigate(url);document.querySelector(`[name=difficulty][value=${input.value}]`).focus({preventScroll:true});}));
  $('start-adventure').addEventListener('click',newRun);$('setup-cancel').addEventListener('click',dismissScreen);$('setup-title').focus({preventScroll:true});
}
function enemyGuideURL(){const kinds=world?enemyKinds(world):[];const url=routeURL('enemies');url.searchParams.set('enemy',kinds.join(','));url.searchParams.set('from','pause');return url;}
function renderEnemyIntro(){
  const info={vacuum:['Roaming vacuum','It lines up a straight charge. Wait for the red warning, move sideways, or dash into it to bonk it.'],cat:['Sneaky cat','Watch for the crouch! It pounces quickly, then stops to rest. Dodge sideways or bonk it with Dash.'],gopher:['Pop-up gopher','Shaking dirt means a gopher is about to pop up. Go around its hole, or dash through once it appears.'],goose:['Grumpy goose','A deep breath comes before its expanding HONK ring. Bonk it during the warning to stop the honk, or use Shield to protect the train.'],boss:['Sir Sucks-a-Lot','Dodge the red charge line. Dash into it when it overheats. Pepperoni’s Belly Flop interrupts nearby charges and hits overheated armor for two damage.']};
  $('screen').innerHTML=`<div class="enemy-card" role="dialog" aria-modal="true" aria-labelledby="enemy-title"><p class="card-eyebrow">${new URLSearchParams(location.search).get('from')==='pause'?'ENEMY GUIDE':'NEW MISCHIEF AHEAD'}</p><h3 id="enemy-title" tabindex="-1">Meet the mischief.</h3><div class="enemy-list">${shownEnemies.map(kind=>`<article><canvas width="160" height="120" data-enemy="${kind}" aria-label="${info[kind][0]}"></canvas><div><h4>${info[kind][0]}</h4><p>${info[kind][1]}</p></div></article>`).join('')}</div><p class="tiny-note">${rulesFor(run).label} difficulty · The adventure is paused.</p><button id="enemy-continue" class="primary-button">Got it — let’s roll!</button><p class="tiny-note">Press Enter or Space, or tap to continue.</p></div>`;
  $('enemy-continue').addEventListener('click',dismissScreen);$('enemy-title').focus({preventScroll:true});
}
function plushPair(missing=true) {
  return `<div class="plush-pair"><div><canvas width="240" height="200" data-portrait="pepsi" aria-label="Round tan-and-white Pepsi"></canvas><strong>Pepsi</strong><small>one brave little loaf</small></div><div class="${missing?'missing':''}"><canvas width="240" height="200" data-portrait="pepper" aria-label="Round gray-and-white Pepper"></canvas>${missing?'<span class="missing-mark" aria-hidden="true">?</span>':''}<strong>Pepper</strong><small>${missing?'somewhere out there':'right where he belongs'}</small></div></div>`;
}
function render() {
  document.body.classList.toggle('playing',['play','pause','reunion','retry','fullscreen','ability','sound','enemies'].includes(view));
  document.body.dataset.view=view;
  $('mobile-home').href=routeURL('home');
  $('rotate-prompt').hidden=!touchPortrait()||view!=='play';
  $('control-prompt').querySelector('strong').textContent=touchMode?'Drag the joystick to start rolling':'Press W A S D to start rolling';
  $('focus-controls').hidden=touchMode;
  $('pause').hidden=view!=='play';$('pause').href=routeURL('pause');
  $('screen').className='screen';$('objective').hidden=view!=='play';$('dash-meter').hidden=view!=='play';$('room-toast').hidden=true;
  $('control-prompt').hidden=view!=='play'||controlsReady||touchPortrait();
  $('room-kicker').textContent=view==='setup'?'NEW ADVENTURE':view==='fullscreen'?'DISPLAY OPTIONS':view==='home'?'PEPSI’S LITTLE ADVENTURE':view==='picnic'?'HOME TOGETHER. HAPPY TOGETHER.':world?.room==='tutorial'?'SAFE PRACTICE':`CHAPTER ${ORDER.indexOf(world?.room)+1} OF ${ORDER.length}`;
  $('room-name').textContent=view==='setup'?'Adventure settings':view==='fullscreen'?'More room to roll':view==='home'?'One friend is missing.':view==='picnic'?'Home is wherever you are':ROOMS[world?.room||'meadow'].name;
  $('location-icon').textContent=view==='picnic'?'♡':world?.room==='pond'?'♧':'✿';
  const active=run&&(!run.completed||run.legacyEnding&&!run.bossDefeated);
  if(view==='setup'){renderSetup();
  } else if(view==='enemies'){renderEnemyIntro();
  } else if(view==='ability'){
    renderAbilityIntro();
  } else if(view==='fullscreen') {
    renderDisplayHelp();
  } else if(view==='home') {
    $('screen').innerHTML=`<div class="welcome-card"><p class="card-eyebrow">SOMEONE’S MISSING FROM THE PICNIC</p><h3>Where’s Pepper?</h3>${plushPair(true)}<p>Rescue friends, then find their trinkets to open exits.<br>Snacks are optional; heart snacks heal 1 heart.</p><div class="mission-strip"><span>3 hearts</span><span>Trinkets open exits</span><span>3 friends to find</span></div><button id="begin" class="primary-button">${active?'Continue the adventure':'Start with practice'} <span>→</span></button>${active?'<button id="fresh" class="secondary-button">Start a new adventure</button>':''}<a id="sound-help" class="tiny-note" href="${routeURL('sound')}">Sound check</a><p class="tiny-note">A safe, skippable practice first. WASD to move. Space to dash.</p></div>`;
    $('begin').addEventListener('click',()=>active?navigate(routeURL(run.health<=0?'retry':'play',run.room)):navigate(routeURL('setup')));
    $('fresh')?.addEventListener('click',()=>navigate(routeURL('setup')));
  } else if(view==='sound') {
    renderSoundCheck();
  } else if(view==='pause') {
    $('screen').innerHTML=`<div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><span class="pause-flower" aria-hidden="true">✿</span><h3 id="pause-title">Catch your breath.</h3><p>The adventure is paused.<br>${touchMode?'Tap Keep going to resume.':'Press WASD or click Keep going to resume.'}<br>Trinkets open exits. Snacks are optional picnic treats—you can leave them behind. Only heart-marked snacks restore 1 heart.</p><p class="tiny-note">${rulesFor(run).label} difficulty</p>${enemyKinds(world).length?`<a id="enemy-help" class="secondary-button" href="${enemyGuideURL()}">Meet the enemies</a>`:''}<p class="bonk-stat"><b>${run.enemyBonks}</b> enemies bonked</p>${abilityGuideLinks()}<a id="sound-help" class="secondary-button" href="${routeURL('sound')}">Sound check</a><button id="resume" class="primary-button">Keep going <span>→</span></button><a id="home-link" class="secondary-button" href="./">Back to the cottage</a>${touchMode?'<nav id="pause-chapters" aria-label="Visit a chapter"></nav><a id="pause-practice" class="secondary-button">Practice controls</a>':''}</div>`;
    $('resume').addEventListener('click',dismissScreen);$('home-link').href=routeURL('home');$('resume').focus({preventScroll:true});
  } else if(view==='reunion') {
    $('screen').innerHTML='<div class="story-card" role="dialog" aria-modal="true" aria-labelledby="reunion-title"><p class="card-eyebrow">FOUND: ONE VERY GOOD FRIEND</p><canvas width="240" height="200" data-portrait="pepper" aria-label="Pepper, the gray plush corgi"></canvas><h3 id="reunion-title">Found you, Pepper.</h3><p>Your best friend is coming with you.<br>There are still trinkets to find by the pond!</p><div class="new-heart">♥ Four shared hearts. A hit to either corgi costs one.</div><button id="reunion-continue" class="primary-button">Explore together <span>→</span></button><button id="reunion-close" class="secondary-button">Stay by the pond a little longer</button></div>';
    $('reunion-continue').addEventListener('click',dismissScreen);$('reunion-close').addEventListener('click',dismissScreen);$('reunion-continue').focus({preventScroll:true});
  } else if(view==='retry') {
    $('screen').innerHTML='<div class="retry-card" role="dialog" aria-modal="true" aria-labelledby="retry-title"><span class="pause-flower" aria-hidden="true">♡</span><p class="card-eyebrow">A SMALL SETBACK</p><h3 id="retry-title">Even brave loaves<br>need another try.</h3><p>Restart this clearing with full hearts.<br>This attempt’s snacks and trinkets return to the clearing.<br>Earlier treasures, your key, and rescued friends stay safe.</p><button id="retry" class="primary-button">Try this clearing again <span>↻</span></button><button id="retry-home" class="secondary-button">Rest at the cottage</button></div>';
    $('retry').addEventListener('click',()=>{world=retryRoom(run,world.room);save();navigate(routeURL('play'));});$('retry-home').addEventListener('click',dismissScreen);$('retry').focus({preventScroll:true});
  } else if(view==='picnic') {
    $('screen').classList.add('picnic-screen');
    $('screen').innerHTML=`<div class="picnic-card"><p class="card-eyebrow">THE BEST THING YOU BROUGHT HOME</p><h3>Was each other.</h3><p>A full basket, tired little paws,<br>and your favorite adventure ${run.peeFound?'buddies':'buddy'}.</p>${run.needohFound?'<p class="tiny-note">A little NeeDoh came home with you. ♡</p>':''}<p class="tiny-note">${rulesFor(run).label} difficulty</p><div class="result-stats"><span><b>${run.trinkets.length}/${TRINKETS.length}</b> trinkets</span><span><b>${run.collected.length}</b> snacks</span><span><b>${run.enemyBonks}</b> enemies bonked</span><span><b>${run.hits}</b> bumps</span><span><b>${run.retries}</b> retries</span></div><button id="again" class="primary-button">One more adventure <span>↗</span></button><p class="tiny-note">${run.pepperoniFound?'Pepsi, Pepper, Pee & Pepperoni':run.peeFound?'Pepsi, Pepper & Pee':'Pepsi & Pepper'}. Always better together.</p></div>`;
    if(run.legacyEnding&&!run.bossDefeated){const link=document.createElement('a');link.className='secondary-button';link.href=routeURL('play','laundry');link.textContent='Continue into the three new chapters →';$('again').before(link);}
    $('again').addEventListener('click',()=>navigate(routeURL('setup')));
  } else {$('screen').classList.add('empty');$('screen').replaceChildren();}
  document.querySelectorAll('[data-enemy]').forEach(e=>enemyPortrait(e,e.dataset.enemy));
  document.querySelectorAll('[data-portrait]').forEach(element=>portrait(element,element.dataset.portrait));
  if(touchMode&&view==='home')$('screen').querySelector('p.tiny-note').textContent='Play sideways. Joystick to roll. Tap Dash to bonk!';
  updateProgress();resize();
}
function updateProgress() {
  const hearts=run?maxHearts(run):3,health=run?.health??3;
  $('health').setAttribute('aria-label',`${health} of ${hearts}${run?.pepperFound?' shared':''} hearts`);
  $('health-label').textContent=run?.pepperFound?'TEAM HEARTS':'HEARTS';
  $('hearts').innerHTML=Array.from({length:hearts},(_,i)=>`<span class="${i<health?'':'empty-heart'}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 21S2 15 2 7.5C2 2.5 8 1 12 6c4-5 10-3.5 10 1.5C22 15 12 21 12 21Z"/></svg></span>`).join('');
  $('snack-count').textContent=run?.collected.length||0;
  $('trinket-count').textContent=`${run?.trinkets.length||0}/${TRINKETS.length}`;
  $('buddy-status').textContent=run?.pepperoniFound?'♡ Four corgis. Shared hearts.':run?.peeFound?'♡ Three corgis. Shared hearts.':run?.pepperFound?'♡ Two corgis. Shared hearts.':'Find your adventure buddy.';
  $('pee-link').hidden=!run?.pepperFound;
  $('pee-link').href=routeURL('play','hills');
  $('pee-link').textContent=run?.peeFound?'Pee joined the adventure ♡':`Find Pee · ${peeProgress(run||{})}/6 earlier trinkets · chapter 5`;
  document.querySelectorAll('[data-unlock]').forEach(label=>{label.hidden=!run?.[label.dataset.unlock];});
  document.querySelector('.ability-bar>p').textContent='Left hand: WASD · Space to dash'+Object.values(ABILITIES).filter(spec=>run?.[spec.unlock]).map(spec=>` · ${spec.key}: ${spec.name}`).join('');
  $('abilities').innerHTML=Object.entries(moves).map(([id,spec])=>`<button type="button" class="ability" data-ability="${id}" aria-keyshortcuts="${spec.key}"><kbd>${spec.key}</kbd><strong><span class="ability-owner">${spec.corgi} · </span>${spec.name}</strong><span class="ability-hint">${spec.hint}</span><span class="ability-status"></span><span class="ability-meter" aria-hidden="true"><i></i></span></button>`).join('');
  paintAbilities();
  $('pepperoni-link').hidden=!run?.basketFound;
  $('pepperoni-link').href=routeURL('play','laundry');$('pepperoni-link').textContent=run?.pepperoniFound?'Pepperoni joined ♡':'Find Pepperoni · Sock Mountain';
  $('practice-link').hidden=!run;
  $('practice-link').textContent=world?.room==='tutorial'?'Skip practice →':'Practice controls';
  $('practice-link').href=routeURL('play',world?.room==='tutorial'?'meadow':'tutorial');
  $('trail').innerHTML=ORDER.map((room,index)=>{
    const done=run&&goalDone(run,room),unlocked=run&&isUnlocked(run,room);
    const content=`<span class="dot">${done?'✓':index+1}</span>${ROOMS[room].short}`;
    const current=!['home','picnic'].includes(view)&&world?.room===room?' aria-current="location"':'';
    return `${index?'<span class="trail-line" aria-hidden="true"></span>':''}${unlocked?`<a class="trail-item ${done?'done':''}" href="${routeURL('play',room)}"${current}>${content}</a>`:`<span class="trail-item">${content}</span>`}`;
  }).join('');
  if($('pause-chapters')){$('pause-chapters').innerHTML=$('trail').innerHTML;$('pause-practice').href=$('practice-link').href;$('pause-practice').textContent=$('practice-link').textContent;}
  if(run&&world)$('objective-text').textContent=controlText(objective(run,world.room));
}
function standalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
function syncViewport(){
  const height=window.visualViewport?.height||innerHeight;
  document.documentElement.style.setProperty('--game-height',`${height}px`);
  document.body.classList.toggle('compact-controls',height<370);
  document.body.classList.toggle('standalone-app',standalone());
}
window.visualViewport?.addEventListener('resize',syncViewport);
window.addEventListener('resize',syncViewport);
syncViewport();
function renderDisplayHelp(){
  $('screen').innerHTML=`<div class="display-card" role="dialog" aria-modal="true" aria-labelledby="display-title"><h3 id="display-title" tabindex="-1">More room to roll</h3>${standalone()?'<p>You’re already playing without browser bars.</p>':'<p>On iPhone or iPad, open this game from your Home Screen to hide Safari’s bars.</p><ol><li>Tap Safari’s <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Turn on <b>Open as Web App</b> if shown, then tap <b>Add</b>.</li><li>Open Snack Quest from that icon and turn sideways.</li></ol>'}<p class="tiny-note">Taking your adventure with you? Save a backup here, then restore it if your Home Screen app starts fresh.</p><div class="backup-actions">${run?'<button id="display-backup">Save progress backup</button>':''}<button id="display-restore">Restore progress backup</button></div><button id="display-close" class="primary-button">Back to the game</button></div>`;
  $('display-backup')?.addEventListener('click',()=>$('download-save').click());
  $('display-restore').addEventListener('click',()=>$('restore-backup').click());
  $('display-close').addEventListener('click',dismissScreen);$('display-title').focus({preventScroll:true});
}
$('fullscreen').addEventListener('click',async()=>{
  save();clearInput();controlsReady=false;
  try{
    if(document.fullscreenElement||document.webkitFullscreenElement){await (document.exitFullscreen?.()||document.webkitExitFullscreen?.());return;}
    const target=document.documentElement;
    if(!standalone()&&target.requestFullscreen){await target.requestFullscreen({navigationUI:'hide'});return;}
    if(!standalone()&&target.webkitRequestFullscreen){await target.webkitRequestFullscreen();return;}
  }catch{/* Offer Home Screen instructions if fullscreen is unavailable. */}
  navigate(routeURL('fullscreen'));
});
function fullscreenChanged(){
  clearInput();controlsReady=false;syncViewport();resize();
  const active=!!(document.fullscreenElement||document.webkitFullscreenElement);$('fullscreen').setAttribute('aria-label',active?'Exit fullscreen':'Fullscreen or display options');
}
for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,fullscreenChanged);
function resize() {
  const bounds=$('stage').getBoundingClientRect();
  viewportWidth=Math.min(WIDTH,Math.round(bounds.width/bounds.height*HEIGHT));
  viewportHeight=touchMode&&landscapeQuery.matches?Math.min(HEIGHT,viewportWidth*bounds.height/Math.max(1,bounds.width)):HEIGHT;
  mobileMapInsets=null;
  if(touchMode&&landscapeQuery.matches){
    const pixelsToWorld=viewportWidth/Math.max(1,bounds.width),toolbar=$('pause').closest('.game-toolbar'),bar=getComputedStyle(toolbar);
    const safeBottom=Math.max(0,(parseFloat(getComputedStyle(document.querySelector('.ability-bar')).bottom)||12)-12);
    mobileMapInsets={left:parseFloat(bar.paddingLeft)*pixelsToWorld,right:parseFloat(bar.paddingRight)*pixelsToWorld,top:(toolbar.getBoundingClientRect().bottom-bounds.top+4)*pixelsToWorld,bottom:(safeBottom+28)*pixelsToWorld};
  }
  const targetStretch=mobileMapInsets?((viewportWidth-mobileMapInsets.left-mobileMapInsets.right)/(viewportHeight-mobileMapInsets.top-mobileMapInsets.bottom))/(WIDTH/HEIGHT):1;
  if(setMapStretch(targetStretch)){
    if(run)adaptWorldLayout(world,run);
    adaptWorldLayout(previewWorld,previewRun);
    clearInput();controlsReady=false;
    if(run)save();
  }
  const ratio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(viewportWidth*ratio);canvas.height=Math.round(viewportHeight*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
}
const layoutObserver=new ResizeObserver(resize);
layoutObserver.observe($('stage'));layoutObserver.observe(document.querySelector('.game-toolbar'));
function inputDirection(){return stick.x||stick.y?{x:stick.x,y:stick.y,analog:true}:{x:Number(keys.has('d'))-Number(keys.has('a')),y:Number(keys.has('s'))-Number(keys.has('w'))};}
function releaseJoystick() {
  const pointerId=stick.pointerId;stick.pointerId=null;stick.x=0;stick.y=0;
  $('joystick').classList.remove('engaged');$('joystick-knob').style.transform='translate(0px,0px)';
  if(pointerId!==null&&$('joystick').hasPointerCapture(pointerId))$('joystick').releasePointerCapture(pointerId);
}
function moveJoystick(event) {
  if(event.pointerId!==stick.pointerId)return;
  const bounds=$('joystick').getBoundingClientRect(),radius=bounds.width*.34;
  const vector=joystickVector(event.clientX-bounds.x-bounds.width/2,event.clientY-bounds.y-bounds.height/2,radius);
  Object.assign(stick,vector);$('joystick-knob').style.transform=`translate(${vector.x*radius}px,${vector.y*radius}px)`;
  if(vector.x||vector.y){controlsReady=true;pendingMove={...vector,analog:true};$('control-prompt').hidden=true;paintAbilities();}
  else pendingMove=null;
}
$('joystick').addEventListener('pointerdown',event=>{
  if(!touchMode||touchPortrait()||view!=='play'||stick.pointerId!==null)return;
  event.preventDefault();stick.pointerId=event.pointerId;$('joystick').setPointerCapture(event.pointerId);$('joystick').classList.add('engaged');moveJoystick(event);
});
$('joystick').addEventListener('pointermove',moveJoystick);
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(type,event=>{if(event.pointerId===stick.pointerId){releaseJoystick();pendingMove=null;}});
$('joystick').addEventListener('contextmenu',event=>event.preventDefault());
function configureTouch() {
  touchMode=touchCapable||touchQuery.matches;
  document.body.classList.toggle('touch-device',touchMode);
  document.body.classList.toggle('touch-landscape',touchMode&&landscapeQuery.matches);
  (touchMode&&landscapeQuery.matches?$('mobile-sound'):document.querySelector('.header-actions')).append($('sound'));
}
for(const query of [touchQuery,landscapeQuery])query.addEventListener('change',()=>{clearInput();controlsReady=false;configureTouch();render();save();});
function paintAbilities() {
  const count=Object.values(moves).filter(spec=>!spec.unlock||run?.[spec.unlock]).length;
  $('abilities').style.setProperty('--ability-count',count);
  document.body.dataset.abilityCount=count;
  for(const button of $('abilities').querySelectorAll('[data-ability]')) {
    const id=button.dataset.ability,spec={...moves[id]},unlocked=!spec.unlock||!!run?.[spec.unlock];
    if(id==='bark')spec.hint=`Protect every corgi for ${rulesFor(run).shield} seconds`;if(id==='stink')spec.hint=`Whole train rolls 30% faster for ${rulesFor(run).zoomies} seconds`;
    const hint=button.querySelector('.ability-hint');if(hint.textContent!==spec.hint)hint.textContent=spec.hint;
    const cooldown=id==='dash'?world?.cooldown||0:world?.abilityCooldowns[id]||0;
    const active=id==='dash'?world?.dash>0&&!world?.powerDash:id==='power'?world?.flop>0:id==='bark'?world?.shield>0:world?.zoomies>0;
    const status=id==='power'&&active?'Incoming whump!':id==='stink'&&active?`Zoomies ${world.zoomies.toFixed(1)}s`:id==='bark'&&active?`Protected ${world.shield.toFixed(1)}s`:!unlocked?`Rescue ${spec.corgi}${touchMode?'':' first'}`:cooldown>0?`${cooldown.toFixed(1)}s${touchMode?'':' recharge'}`:view!=='play'?'Ready when you play':!controlsReady?touchMode?'Roll to start':'WASD to start':'Ready';
    button.hidden=!unlocked;
    button.disabled=!unlocked||view!=='play'||!controlsReady||touchPortrait()||cooldown>0||run?.health<=0;
    button.classList.toggle('unlocked',unlocked);button.classList.toggle('active',!!active);button.classList.toggle('cooling',cooldown>0);
    const label=button.querySelector('.ability-status');if(label.textContent!==status)label.textContent=status;
    button.querySelector('.ability-meter i').style.width=`${unlocked?Math.max(0,1-cooldown/spec.cooldown)*100:0}%`;
    button.setAttribute('aria-label',`${touchMode?'':spec.key+': '}${spec.corgi} ${spec.name}. ${spec.hint}. ${status}`);
  }
}
function useMove(id) {
  if(view!=='play'||!controlsReady||touchPortrait()||!run||run.health<=0)return false;
  const used=id==='dash'?startDash(world,inputDirection()):startAbility(world,run,id,inputDirection());
  if(used){sound(id==='power'?'hop':id==='dash'?'dash':id==='bark'?'shield':'zoomies');announce(`${moves[id].corgi}: ${moves[id].name}!`);save();paintAbilities();}
  return used;
}
$('abilities').addEventListener('pointerdown',event=>{const button=event.target.closest('[data-ability]');if(event.pointerType!=='mouse'&&button&&!button.disabled){event.preventDefault();useMove(button.dataset.ability);}});
$('abilities').addEventListener('click',event=>{if(event.pointerType==='touch'||event.pointerType==='pen')return;const button=event.target.closest('[data-ability]');if(button){useMove(button.dataset.ability);focusGame();}});
function pause(){if(view==='play')navigate(routeURL('pause'));}
function dismissScreen() {
  if(view==='setup'){const from=new URLSearchParams(location.search).get('from');navigate(routeURL(from==='picnic'?'picnic':'home'));($(setupFocus)||$('begin')||$('sound')).focus({preventScroll:true});return;}
  if(view==='enemies'){run.seenEnemies=[...new Set([...run.seenEnemies,...shownEnemies])];save();const from=new URLSearchParams(location.search).get('from');navigate(routeURL(from==='pause'?'pause':'play'));if(from==='pause')$('enemy-help')?.focus({preventScroll:true});return;}
  if(view==='ability'){const id=shownAbility,from=new URLSearchParams(location.search).get('from')==='pause'?'pause':'play';if(run.pendingAbility===id)run.pendingAbility=null;save();navigate(routeURL(from));if(from==='pause')document.querySelector(`[data-guide="${id}"]`)?.focus({preventScroll:true});return;}
  if(view==='sound'){const from=new URLSearchParams(location.search).get('from');navigate(routeURL(['home','play','pause','picnic','retry'].includes(from)?from:run?'play':'home'));($('sound-help')||$('sound')).focus({preventScroll:true});return;}
  if(view==='fullscreen'){const from=new URLSearchParams(location.search).get('from');navigate(routeURL(['home','play','pause','picnic','retry'].includes(from)?from:run?'play':'home'));$('fullscreen').focus({preventScroll:true});return;}
  if(view==='retry')navigate(routeURL('home'));
  else if(view==='pause'||view==='reunion')navigate(routeURL('play'));
}

window.addEventListener('keydown',event=>{
  if(view==='setup'&&event.key==='Escape'){event.preventDefault();dismissScreen();return;}
  if(event.metaKey||event.ctrlKey||event.altKey||(event.target!==keyboardCapture&&isTextEntry(event.target)&&!(view==='setup'&&event.target.matches('input[type=radio]'))))return;
  soundtrack.unlock();
  if(['enemies','ability','reunion'].includes(view)&&(event.key==='Enter'||event.code==='Space'||event.key===' ')){event.preventDefault();event.stopPropagation();if(!event.repeat)dismissScreen();return;}
  const move=movementKey(event);
  // Resume first, then record the held key: readRoute clears stale input.
  if(view==='pause'&&move&&!event.repeat)dismissScreen();
  if(event.key==='Escape'){event.preventDefault();if(view==='play')pause();else dismissScreen();return;}
  if(['pause','reunion','retry','fullscreen','ability','sound','enemies','setup'].includes(view)&&event.key==='Tab') {
    const controls=[...$('screen').querySelectorAll('button,a,input:checked')];
    if(!controls.includes(document.activeElement)){event.preventDefault();(event.shiftKey?controls.at(-1):controls[0])?.focus();}
    else if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}
    else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus();}
    return;
  }
  if(view!=='play')return;
  if(move){event.preventDefault();event.stopPropagation();readyToMove(move);focusGame();}
  else if(abilityKey(event)){event.preventDefault();event.stopPropagation();if(!event.repeat)useMove(abilityKey(event));}
  else if((event.code==='Space'||event.key===' ')&&!event.target.closest?.('button,a')){event.preventDefault();event.stopPropagation();if(!event.repeat)useMove('dash');}
  else if(event.target===keyboardCapture&&event.key!=='Tab')event.preventDefault();
  else if(event.key.startsWith('Arrow')&&event.target===canvas)event.preventDefault();
},{capture:true});
window.addEventListener('keyup',event=>{const move=movementKey(event);if(move){keys.delete(move);paintInput();}},{capture:true});
// Some embedded browsers deliver text insertion without a keydown/up pair.
// Translate movement and ability keys without storing typed text.
keyboardCapture.addEventListener('beforeinput',event=>{
  event.preventDefault();
  if(view!=='play')return;
  const move=movementKey({key:event.data});
  if(move){readyToMove(move);clearTimeout(textRelease);textRelease=setTimeout(()=>{keys.clear();paintInput();},110);}
  else if(abilityKey({key:event.data}))useMove(abilityKey({key:event.data}));
  else if(event.data===' ')useMove('dash');
});
keyboardCapture.addEventListener('input',()=>{keyboardCapture.value='';});
$('focus-controls').addEventListener('click',focusGame);
function restInBackground() {
  soundtrack.setForeground(false);browserChime.pause();clearInput();
  // Keep the current view and history. The next WASD press resumes without a dialog.
  if(view==='play')controlsReady=false;
  save();
}
window.addEventListener('blur',restInBackground);
window.addEventListener('focus',()=>soundtrack.setForeground(!document.hidden));
function unlockFromGesture(){soundtrack.setForeground(!document.hidden);soundtrack.unlock();}
window.addEventListener('pointerdown',unlockFromGesture,{capture:true});
// Touch pointerdown is not an activation-triggering event on Safari. Retry at release
// and click, including when the joystick prevents the synthetic click.
window.addEventListener('touchend',unlockFromGesture,{capture:true,passive:true});
window.addEventListener('click',unlockFromGesture,{capture:true});
window.addEventListener('pageshow',()=>soundtrack.setForeground(!document.hidden&&document.hasFocus()));
$('stage').addEventListener('pointerdown',()=>{if(view==='play')focusGame();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)restInBackground();else soundtrack.setForeground(document.hasFocus());lastFrame=performance.now();});
window.addEventListener('pagehide',()=>{soundtrack.setForeground(false);save();});
window.addEventListener('popstate',()=>{save();readRoute();});
document.addEventListener('click',event=>{
  const link=event.target.closest('a');
  if(!link||event.defaultPrevented||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
  const url=new URL(link.href);
  if(url.origin!==location.origin||url.pathname!==location.pathname)return;
  const room=url.searchParams.get('room');
  const enter=url.searchParams.get('view')==='play'&&!!room&&(room!==world?.room||link.matches('.trail-item,#practice-link,#pause-practice,#pee-link,#pepperoni-link'));
  event.preventDefault();navigate(url,{enter});
});
$('screen').addEventListener('pointerdown',event=>{backdropDown=event.target===$('screen');});
$('screen').addEventListener('click',event=>{if(backdropDown&&event.target===$('screen'))dismissScreen();backdropDown=false;});

function sound(kind){soundtrack.play(kind);}
function renderSound() {
  $('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'Turn music and sound effects off':'Turn music and sound effects on');
  $('sound').title='Original music + little adventure sounds';
  $('sound').innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z${soundOn?'M16 8q5 4 0 8m3-11q8 7 0 14':'M16 9l5 6m0-6-5 6'}"/></svg><span>Sound ${soundOn?'on':'off'}</span>`;
}
function renderSoundCheck(){
  $('screen').innerHTML='<div class="story-card" role="dialog" aria-modal="true" aria-labelledby="sound-title"><p class="card-eyebrow">A LITTLE SPEAKER CHECK</p><h3 id="sound-title" tabindex="-1">Can you hear the chime?</h3><p>The adventure is paused. Try each button once.</p><button id="test-game-sound" class="primary-button">Play game chime</button><button id="test-speaker" class="secondary-button">Play browser chime</button><p id="sound-result" class="tiny-note" role="status">Ready to test. This turns sound on.</p><details><summary>Sound details</summary><p id="sound-details" class="tiny-note"></p></details><button id="sound-done" class="secondary-button">Back to the game</button></div>';
  $('sound-title').focus({preventScroll:true});
  $('test-game-sound').addEventListener('click',()=>{
    soundOn=true;soundtrack.setEnabled(true);renderSound();try{localStorage.setItem(PREFIX+'sound','true');}catch{}
    const started=soundtrack.unlock(),context=soundtrack.context,time=context?.currentTime;
    // Schedule within the click too: older Safari may not retain activation in a promise.
    sound('start');Promise.resolve(started).then(()=>{if(context?.currentTime===time)sound('start');});
    $('sound-result').textContent='Testing the game chime…';
    setTimeout(()=>{
      if(!$('sound-result'))return;
      const advancing=context&&context.currentTime>time+.05;
      $('sound-result').textContent=advancing?'The game audio clock is running. Did you hear the chime?':'The game audio did not start. Try the browser chime below.';
      $('sound-details').textContent=`Build 44 · game: ${context?.state||'unavailable'} · clock: ${advancing?'advancing':'stopped'} · ${soundtrack.foreground?'foreground':'background'}${soundtrack.lastError?' · '+soundtrack.lastError:''}`;
    },900);
  });
  $('test-speaker').addEventListener('click',()=>{
    browserChime.currentTime=0;
    $('sound-result').textContent='Testing browser chime…';
    setTimeout(()=>{if($('sound-result')?.textContent==='Testing browser chime…')$('sound-result').textContent='Browser chime has not started. Please tell me this result.';},1500);
    browserChime.play().then(()=>{if($('sound-result'))$('sound-result').textContent='Browser chime started. If only this chime works, tell me “browser chime only”.';}).catch(error=>{if($('sound-result'))$('sound-result').textContent='Browser chime was blocked: '+error.name;});
  });
  $('sound-done').addEventListener('click',dismissScreen);
}
// An independent media-element test distinguishes the Web Audio graph from device output.
const browserChime=new Audio('./sound-check.wav?v=44');browserChime.preload='none';browserChime.volume=.65;
$('sound').addEventListener('click',()=>{soundOn=!soundOn;soundtrack.setEnabled(soundOn);const unlocked=soundtrack.unlock();renderSound();try{localStorage.setItem(PREFIX+'sound',String(soundOn));}catch{}Promise.resolve(unlocked).then(()=>sound('start'));});
$('retry-save').addEventListener('click',()=>{if(save())toast('Your adventure is safely saved.');});
$('download-save').addEventListener('click',()=>{
  if(!run)return;save();const url=URL.createObjectURL(new Blob([JSON.stringify(run,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='pepsi-pepper-adventure.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('load-save').addEventListener('click',()=>{
  if(!run)return;
  // The player explicitly chooses which tab's progress to keep; retain a session backup too.
  try{sessionStorage.setItem(PREFIX+'recovery.'+run.id,JSON.stringify(run));}catch{}
  memory.delete(run.id);savedSnapshots.delete(run.id);world=null;conflict=false;saveFailed=false;$('save-error').hidden=true;$('save-status').textContent='Adventure saved on this device.';readRoute();
});
const restore=document.createElement('input');restore.type='file';restore.accept='.json,application/json';restore.hidden=true;restore.setAttribute('aria-label','Restore adventure backup');document.body.append(restore);
$('restore-backup').addEventListener('click',()=>restore.click());
restore.addEventListener('change',async()=>{
  try {
    const file=restore.files[0];if(!file)return;if(file.size>50000)throw Error('Too large');
    let data=JSON.parse(await file.text());if(data.version===1)data=migrateRun(data,data.id);
    if(!data||!validRun(data,data.id))throw Error('Invalid backup');
    save();
    // Restore as a separate adventure so an existing save is never overwritten.
    data.id=Date.now().toString(36)+crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0,3);data.revision=0;
    run=upgradeRun(data);memory.set(run.id,run);world=makeWorld(run,run.room);conflict=false;save();
    navigate(routeURL(run.completed?'picnic':run.health<=0?'retry':'play',run.room));toast('Your adventure is restored.');
  }catch{toast('That file isn’t a valid adventure backup. Your current adventure is unchanged.',5000);}
  finally{restore.value='';}
});

const previewRun=createRun('snacktime'),previewWorld=makeWorld(previewRun,'meadow');
previewWorld.player.x=270;previewWorld.player.y=420;
function handleEvents(events) {
  // The whole train can hit several things in one frame: play one clear impact.
  const bonks=events.filter(event=>event.type==='bonk');
  if(bonks.length)sound(bonks.some(e=>e.kind==='boss')?'bonk-boss':bonks.some(e=>e.kind==='crate')?'bonk-crate':'bonk');
  for(const event of events) {
    if(event.type==='practice'){sound('key');toast(objective(run,'tutorial'),5000);}
    else if(event.type==='snack'){sound('snack');toast(event.healed?'A snack and a second wind. +1 heart.':event.item.healing?'Heart snack collected. Hearts were already full.':'Optional picnic treat! Snacks aren’t needed to open exits.');}
    else if(event.type==='key'){sound('key');toast('The key! Pepper must be over by the pond.',4000);}
    else if(event.type==='trinket'){sound('key');toast(`${event.item.name}! ${run.trinkets.length}/${TRINKETS.length} trinkets tucked away.`,3000);}
    else if(event.type==='basket'){sound('basket');toast('Basket found! Follow the trail into the cottage. Someone else needs rescuing!',3500);}
    else if(event.type==='hit'){sound('hit');toast(run.pepperFound?`${event.character==='pepperoni'?'Pepperoni':event.character==='pee'?'Pee':event.character==='pepper'?'Pepper':'Pepsi'} got bonked! −1 shared heart. Watch your whole team.`:'Pepsi got bonked! −1 heart. Look for a heart-marked snack.',2800);}
    else if(event.type==='squish'){sound('squish');toast(event.discovered?'A secret NeeDoh! A little squishy keepsake is coming to your picnic.':'Squiiish. The corgis understand the obsession.',4000);}
    else if(event.type==='goose-warning'){announce('Goose puffing up! Dodge the ring or bonk to interrupt.');}
    else if(event.type==='honk'){sound('honk');}
    else if(event.type==='stun'){if(!bonks.length)sound('stun');announce('Mischief bonked. Keep moving.');}
    else if(['rescue','pee-rescue','pepperoni-rescue'].includes(event.type)){sound('rescue');shownAbility=run.pendingAbility;save();navigate(routeURL('ability'));return;}
    else if(event.type==='boss-open'){sound('key');toast('The vacuum overheated! Dash into it now!',2500);}
    else if(event.type==='flop'){sound('flop');}
    else if(event.type==='boss-interrupt'){toast('Whump! Vacuum interrupted—roll the train clear!');}
    else if(event.type==='boss-hit'){toast(event.flop?'Belly flop! Two damage. Vacuum stunned — roll the whole team clear!':'Bonk! One damage. Vacuum stunned — roll the whole team clear!');}
    else if(event.type==='boss-win'){soundtrack.setScene(view,world.room,{bossDefeated:true});sound('win');toast('Sir Sucks-a-Lot is unplugged! Take the path home →',6000);}
    else if(event.type==='defeat'){save();sound('defeat');navigate(routeURL('retry'));return;}
    else if(event.type==='exit') {
      const next=ORDER[ORDER.indexOf(world?.room)+1];
      if(next)navigate(routeURL('play',next),{enter:true});
      else{run.completed=true;save();sound('win');navigate(routeURL('picnic'));}
      return;
    }
    if(!['stun','goose-warning','honk'].includes(event.type)){save();updateProgress();}
  }
}
function frame(now) {
  const dt=Math.min((now-lastFrame)/1000||0,.035);lastFrame=now;
  if(!document.hidden) {
    animationTime+=dt;
    soundtrack.tick();
    if(view==='play'&&world&&controlsReady&&!touchPortrait()&&document.hasFocus()) {
      const held=inputDirection(),direction=held.x||held.y?held:pendingMove||held;pendingMove=null;
      handleEvents(step(world,run,direction,dt));
      saveElapsed+=dt;if(saveElapsed>1){save();saveElapsed=0;}
      if(world.room==='boss')$('objective-text').textContent=controlText(objective(run,'boss'));
      $('dash-fill').style.width=`${Math.max(0,1-world.cooldown/DASH_COOLDOWN)*100}%`;
      $('dash-label').textContent=world.cooldown>0?`${world.cooldown.toFixed(1)}s recharge`:'dash ready';
      paintAbilities();
    }
    if(view==='picnic'&&run)drawPicnic(ctx,run,viewportWidth,animationTime,reduced,viewportHeight,mobileMapInsets);
    else if(view!=='home'&&world)drawWorld(ctx,world,run,viewportWidth,reduced,false,viewportHeight,mobileMapInsets);
    else{previewWorld.time=animationTime;drawWorld(ctx,previewWorld,previewRun,viewportWidth,reduced,true,viewportHeight,mobileMapInsets);}
    if(toastUntil&&now>toastUntil){$('room-toast').hidden=true;toastUntil=0;}
  }
  requestAnimationFrame(frame);
}
configureTouch();resize();renderSound();readRoute();requestAnimationFrame(frame);
