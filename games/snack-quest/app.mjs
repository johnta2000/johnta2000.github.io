import { ROOMS, ORDER, DASH_COOLDOWN, ABILITIES, WIDTH, HEIGHT, createRun, peeProgress, upgradeRun, TRINKETS, validRun, migrateRun, makeWorld, maxHearts, goalDone, isUnlocked, firstUnfinished, objective, retryRoom, step, startDash, startAbility } from './engine.mjs?v=26';
import { portrait, drawWorld, drawPicnic } from './art.mjs?v=26';
import { movementKey, abilityKey, isTextEntry, joystickVector } from './input.mjs?v=26';
import { Soundscape } from './audio.mjs?v=26';

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
let run=null, world=null, view='home', viewportWidth=WIDTH, lastFrame=0, saveElapsed=0;
let toastUntil=0, animationTime=0, soundOn=false, latestId=null;
let readFailed=false, saveFailed=false, conflict=false, backdropDown=false;
let controlsReady=false,pendingMove=null,textRelease=0;
try {
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
  if(id)url.searchParams.set('run',id);
  if(nextView!=='home')url.searchParams.set('room',room);
  return url;
}
function navigate(url,{replace=false}={}) {
  save();history[replace?'replaceState':'pushState']({},'',url);readRoute();
}
function newRun() {
  save();
  const id=Date.now().toString(36)+crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0,3);
  run=createRun(id);world=makeWorld(run,'tutorial');conflict=false;save();
  navigate(routeURL('play','tutorial'));sound('start');
}
function announce(message){$('announcement').textContent=message;}
function controlText(message) {
  if(!touchMode)return message;
  return message.replace('Hold D + tap SPACE','Roll right + tap Dash').replace(/WASD/g,'the joystick')
    .replace(/Press J/g,'Tap Bark').replace(/Press K/g,'Tap Toot').replace(/Press L/g,'Tap Power')
    .replace(/\bL\b/g,'Power').replace(/\bSpace\b|\bSPACE\b/g,'Dash');
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
  const query=new URLSearchParams(location.search),requested=query.get('view')||'home';
  view=['home','play','pause','reunion','retry','picnic'].includes(requested)?requested:'home';
  const id=query.get('run'),requestedRoom=query.get('room');
  let saved=readRun(id||latestId);
  if(!saved&&!readFailed&&id&&/^[a-z0-9]{6,16}$/.test(id)){saved=createRun(id);memory.set(id,saved);}
  if(saved) {
    run=saved;
    let room=Object.hasOwn(ROOMS,requestedRoom||'')?requestedRoom:run.room;
    if(!isUnlocked(run,room))room=firstUnfinished(run);
    if(!world||world.room!==room||world.runId!==run.id)world=makeWorld(run,room);
  } else {run=null;world=null;}
  if(view!=='home'&&!run)view='home';
  if(run&&view!=='home') {
    if(run.health<=0)view='retry';
    else if(view==='retry')view='play';
    if(view==='reunion'&&!run.pepperFound)view='play';
    if(view==='picnic'&&(!run.completed||!run.basketFound))view='play';
  }
  history.replaceState({},'',routeURL(view,world?.room));
  soundtrack.setScene(view,world?.room||'meadow',{bossDefeated:!!run?.bossDefeated});
  render();
  if(view==='play') {
    focusGame();
    toast(goalDone(run,world.room)?objective(run,world.room):ROOMS[world.room].note,4200);
    save();
  }
  if(readFailed) {
    showSaveError('A previous save could not be read. It has been left untouched. You can restore a backup or begin a new adventure.');
    readFailed=false;
  }
}
function plushPair(missing=true) {
  return `<div class="plush-pair"><div><canvas width="240" height="200" data-portrait="pepsi" aria-label="Round tan-and-white Pepsi"></canvas><strong>Pepsi</strong><small>one brave little loaf</small></div><div class="${missing?'missing':''}"><canvas width="240" height="200" data-portrait="pepper" aria-label="Round gray-and-white Pepper"></canvas>${missing?'<span class="missing-mark" aria-hidden="true">?</span>':''}<strong>Pepper</strong><small>${missing?'somewhere out there':'right where he belongs'}</small></div></div>`;
}
function render() {
  document.body.classList.toggle('playing',['play','pause','reunion','retry'].includes(view));
  document.body.dataset.view=view;
  $('mobile-home').href=routeURL('home');
  $('rotate-prompt').hidden=!touchPortrait()||view!=='play';
  $('control-prompt').querySelector('strong').textContent=touchMode?'Drag the joystick to start rolling':'Press W A S D to start rolling';
  $('focus-controls').hidden=touchMode;
  $('pause').hidden=view!=='play';$('pause').href=routeURL('pause');
  $('screen').className='screen';$('objective').hidden=view!=='play';$('dash-meter').hidden=view!=='play';$('room-toast').hidden=true;
  $('control-prompt').hidden=view!=='play'||controlsReady||touchPortrait();
  $('room-kicker').textContent=view==='home'?'PEPSI’S LITTLE ADVENTURE':view==='picnic'?'HOME TOGETHER. HAPPY TOGETHER.':world?.room==='tutorial'?'SAFE PRACTICE':`CHAPTER ${ORDER.indexOf(world.room)+1} OF ${ORDER.length}`;
  $('room-name').textContent=view==='home'?'One friend is missing.':view==='picnic'?'Home is wherever you are':ROOMS[world.room].name;
  $('location-icon').textContent=view==='picnic'?'♡':world?.room==='pond'?'♧':'✿';
  const active=run&&(!run.completed||run.legacyEnding&&!run.bossDefeated);
  if(view==='home') {
    $('screen').innerHTML=`<div class="welcome-card"><p class="card-eyebrow">SOMEONE’S MISSING FROM THE PICNIC</p><h3>Where’s Pepper?</h3>${plushPair(true)}<p>Find the key, rescue your friends,<br>and outsmart a giant vacuum.</p><div class="mission-strip"><span>3 hearts</span><span>9 little chapters</span><span>3 friends to find</span></div><button id="begin" class="primary-button">${active?'Continue the adventure':'Start with practice'} <span>→</span></button>${active?'<button id="fresh" class="secondary-button">Start a new adventure</button>':''}<p class="tiny-note">A safe, skippable practice first. WASD to move. Space to dash.</p></div>`;
    $('begin').addEventListener('click',()=>active?navigate(routeURL(run.health<=0?'retry':'play',run.room)):newRun());
    $('fresh')?.addEventListener('click',newRun);
  } else if(view==='pause') {
    $('screen').innerHTML=`<div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><span class="pause-flower" aria-hidden="true">✿</span><h3 id="pause-title">Catch your breath.</h3><p>The adventure is paused.<br>${touchMode?'Tap Keep going to resume.':'Press WASD or click Keep going to resume.'}<br>Dash protects your whole team. Only heart-marked snacks restore a heart.</p><button id="resume" class="primary-button">Keep going <span>→</span></button><a id="home-link" class="secondary-button" href="./">Back to the cottage</a>${touchMode?'<nav id="pause-chapters" aria-label="Visit a chapter"></nav><a id="pause-practice" class="secondary-button">Practice controls</a>':''}</div>`;
    $('resume').addEventListener('click',dismissScreen);$('home-link').href=routeURL('home');$('resume').focus({preventScroll:true});
  } else if(view==='reunion') {
    $('screen').innerHTML='<div class="story-card" role="dialog" aria-modal="true" aria-labelledby="reunion-title"><p class="card-eyebrow">FOUND: ONE VERY GOOD FRIEND</p><canvas width="240" height="200" data-portrait="pepper" aria-label="Pepper, the gray plush corgi"></canvas><h3 id="reunion-title">Found you, Pepper.</h3><p>Your best friend is coming with you.<br>There are still trinkets to find by the pond!</p><div class="new-heart">♥ Four shared hearts. A hit to either corgi costs one.</div><button id="reunion-continue" class="primary-button">Explore together <span>→</span></button><button id="reunion-close" class="secondary-button">Stay by the pond a little longer</button></div>';
    $('reunion-continue').addEventListener('click',dismissScreen);$('reunion-close').addEventListener('click',dismissScreen);$('reunion-continue').focus({preventScroll:true});
  } else if(view==='retry') {
    $('screen').innerHTML='<div class="retry-card" role="dialog" aria-modal="true" aria-labelledby="retry-title"><span class="pause-flower" aria-hidden="true">♡</span><p class="card-eyebrow">A SMALL SETBACK</p><h3 id="retry-title">Even brave loaves<br>need another try.</h3><p>Restart this clearing with full hearts.<br>This attempt’s snacks and trinkets return to the clearing.<br>Earlier treasures, your key, and rescued friends stay safe.</p><button id="retry" class="primary-button">Try this clearing again <span>↻</span></button><button id="retry-home" class="secondary-button">Rest at the cottage</button></div>';
    $('retry').addEventListener('click',()=>{world=retryRoom(run,world.room);save();navigate(routeURL('play'));});$('retry-home').addEventListener('click',dismissScreen);$('retry').focus({preventScroll:true});
  } else if(view==='picnic') {
    $('screen').classList.add('picnic-screen');
    $('screen').innerHTML=`<div class="picnic-card"><p class="card-eyebrow">THE BEST THING YOU BROUGHT HOME</p><h3>Was each other.</h3><p>A full basket, tired little paws,<br>and your favorite adventure ${run.peeFound?'buddies':'buddy'}.</p>${run.needohFound?'<p class="tiny-note">A little NeeDoh came home with you. ♡</p>':''}<div class="result-stats"><span><b>${run.trinkets.length}/${TRINKETS.length}</b> trinkets</span><span><b>${run.collected.length}</b> snacks</span><span><b>${run.hits}</b> bumps</span><span><b>${run.retries}</b> retries</span></div><button id="again" class="primary-button">One more adventure <span>↗</span></button><p class="tiny-note">${run.pepperoniFound?'Pepsi, Pepper, Pee & Pepperoni':run.peeFound?'Pepsi, Pepper & Pee':'Pepsi & Pepper'}. Always better together.</p></div>`;
    if(run.legacyEnding&&!run.bossDefeated){const link=document.createElement('a');link.className='secondary-button';link.href=routeURL('play','laundry');link.textContent='Continue into the three new chapters →';$('again').before(link);}
    $('again').addEventListener('click',newRun);
  } else {$('screen').classList.add('empty');$('screen').replaceChildren();}
  document.querySelectorAll('[data-portrait]').forEach(element=>portrait(element,element.dataset.portrait));
  if(touchMode&&view==='home')$('screen').querySelector('.tiny-note').textContent='Play sideways. Joystick to roll. Tap Dash to bonk!';
  updateProgress();resize();
}
function updateProgress() {
  const hearts=run?maxHearts(run):3,health=run?.health??3;
  $('health').setAttribute('aria-label',`${health} of ${hearts}${run?.pepperFound?' shared':''} hearts`);
  $('health-label').textContent=run?.pepperFound?'TEAM HEARTS':'HEARTS';
  $('hearts').innerHTML=Array.from({length:hearts},(_,i)=>`<span class="${i<health?'':'empty-heart'}" aria-hidden="true">♥</span>`).join('');
  $('snack-count').textContent=run?.collected.length||0;
  $('trinket-count').textContent=`${run?.trinkets.length||0}/${TRINKETS.length}`;
  $('buddy-status').textContent=run?.pepperoniFound?'♡ Four corgis. Shared hearts.':run?.peeFound?'♡ Three corgis. Shared hearts.':run?.pepperFound?'♡ Two corgis. Shared hearts.':'Find your adventure buddy.';
  $('pee-link').hidden=!run?.pepperFound;
  $('pee-link').href=routeURL('play','hills');
  $('pee-link').textContent=run?.peeFound?'Pee joined the adventure ♡':`Find Pee · ${peeProgress(run||{})}/6 earlier trinkets · chapter 5`;
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
function resize() {
  const bounds=$('stage').getBoundingClientRect();
  viewportWidth=touchMode&&landscapeQuery.matches?WIDTH:Math.min(WIDTH,Math.round(bounds.width/bounds.height*HEIGHT));
  const ratio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(viewportWidth*ratio);canvas.height=Math.round(HEIGHT*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
}
new ResizeObserver(resize).observe($('stage'));
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
  for(const button of $('abilities').querySelectorAll('[data-ability]')) {
    const id=button.dataset.ability,spec=moves[id],unlocked=!spec.unlock||!!run?.[spec.unlock];
    const cooldown=id==='dash'?world?.cooldown||0:Math.max(world?.abilityCooldowns[id]||0,id==='power'?world?.cooldown||0:0);
    const active=id==='dash'?world?.dash>0&&!world?.powerDash:id==='power'?world?.dash>0&&world?.powerDash:id==='bark'?world?.bark>0:world?.clouds.length>0;
    const status=!unlocked?`Rescue ${spec.corgi}${touchMode?'':' first'}`:cooldown>0?`${cooldown.toFixed(1)}s${touchMode?'':` ${id==='power'&&world.cooldown>(world.abilityCooldowns.power||0)?'roll recovery':'recharge'}`}`:view!=='play'?'Ready when you play':!controlsReady?touchMode?'Roll to start':'WASD to start':'Ready';
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
  if(used){sound(id==='power'||id==='dash'?'dash':id==='bark'?'bark':'toot');announce(`${moves[id].corgi}: ${moves[id].name}!`);save();paintAbilities();}
  return used;
}
$('abilities').addEventListener('pointerdown',event=>{const button=event.target.closest('[data-ability]');if(event.pointerType!=='mouse'&&button&&!button.disabled){event.preventDefault();useMove(button.dataset.ability);}});
$('abilities').addEventListener('click',event=>{if(event.pointerType==='touch'||event.pointerType==='pen')return;const button=event.target.closest('[data-ability]');if(button){useMove(button.dataset.ability);focusGame();}});
function pause(){if(view==='play')navigate(routeURL('pause'));}
function dismissScreen() {
  if(view==='retry')navigate(routeURL('home'));
  else if(view==='pause'||view==='reunion')navigate(routeURL('play'));
}

window.addEventListener('keydown',event=>{
  if(event.metaKey||event.ctrlKey||event.altKey||(event.target!==keyboardCapture&&isTextEntry(event.target)))return;
  soundtrack.unlock();
  const move=movementKey(event);
  // Resume first, then record the held key: readRoute clears stale input.
  if(view==='pause'&&move&&!event.repeat)dismissScreen();
  if(event.key==='Escape'){event.preventDefault();if(view==='play')pause();else dismissScreen();return;}
  if(['pause','reunion','retry'].includes(view)&&event.key==='Tab') {
    const controls=[...$('screen').querySelectorAll('button,a')];
    if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}
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
  soundtrack.setForeground(false);clearInput();
  // Keep the current view and history. The next WASD press resumes without a dialog.
  if(view==='play')controlsReady=false;
  save();
}
window.addEventListener('blur',restInBackground);
window.addEventListener('focus',()=>soundtrack.setForeground(!document.hidden));
window.addEventListener('pointerdown',()=>soundtrack.unlock(),{capture:true});
$('stage').addEventListener('pointerdown',()=>{if(view==='play')focusGame();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)restInBackground();else soundtrack.setForeground(document.hasFocus());lastFrame=performance.now();});
window.addEventListener('pagehide',()=>{soundtrack.setForeground(false);save();});
window.addEventListener('popstate',()=>{save();readRoute();});
document.addEventListener('click',event=>{
  const link=event.target.closest('a');
  if(!link||event.defaultPrevented||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
  const url=new URL(link.href);
  if(url.origin!==location.origin||url.pathname!==location.pathname)return;
  event.preventDefault();navigate(url);
});
$('screen').addEventListener('pointerdown',event=>{backdropDown=event.target===$('screen');});
$('screen').addEventListener('click',event=>{if(backdropDown&&event.target===$('screen'))dismissScreen();backdropDown=false;});

function sound(kind){soundtrack.play(kind);}
function renderSound() {
  $('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'Turn music and sound effects off':'Turn music and sound effects on');
  $('sound').title='Original music + little adventure sounds';
  $('sound').innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z${soundOn?'M16 8q5 4 0 8m3-11q8 7 0 14':'M16 9l5 6m0-6-5 6'}"/></svg><span>Sound ${soundOn?'on':'off'}</span>`;
}
$('sound').addEventListener('click',()=>{soundOn=!soundOn;soundtrack.setEnabled(soundOn);soundtrack.unlock();renderSound();try{localStorage.setItem(PREFIX+'sound',String(soundOn));}catch{}sound('start');});
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
    else if(event.type==='snack'){sound('snack');toast(event.healed?'A snack and a second wind. +1 heart.':event.item.healing?'Heart snack collected. Hearts were already full.':'A picnic treat! Regular snacks don’t heal.');}
    else if(event.type==='key'){sound('key');toast('The key! Pepper must be over by the pond.',4000);}
    else if(event.type==='trinket'){sound('key');toast(`${event.item.name}! ${run.trinkets.length}/${TRINKETS.length} trinkets tucked away.`,3000);}
    else if(event.type==='basket'){sound('basket');toast('Basket found! Follow the trail into the cottage. Someone else needs rescuing!',3500);}
    else if(event.type==='hit'){sound('hit');toast(run.pepperFound?`${event.character==='pepperoni'?'Pepperoni':event.character==='pee'?'Pee':event.character==='pepper'?'Pepper':'Pepsi'} got bonked! −1 shared heart. Watch your whole team.`:'Pepsi got bonked! −1 heart. Look for a heart-marked snack.',2800);}
    else if(event.type==='squish'){sound('squish');toast(event.discovered?'A secret NeeDoh! A little squishy keepsake is coming to your picnic.':'Squiiish. The corgis understand the obsession.',4000);}
    else if(event.type==='goose-warning'){announce('Goose puffing up! Dodge the ring or bonk to interrupt.');}
    else if(event.type==='honk'){sound('honk');}
    else if(event.type==='stun'){if(!bonks.length)sound('stun');announce('Mischief bonked. Keep moving.');}
    else if(event.type==='rescue'){sound('rescue');toast('Pepper found! +1 heart. Press J to bark and stun enemies near Pepper · 5s recharge. Space is still your normal dash.',6500);}
    else if(event.type==='pee-rescue'){sound('rescue');toast('Pee found! Press K to leave a stink cloud for pursuers · 7s recharge. Use it whenever you need it!',6500);}
    else if(event.type==='pepperoni-rescue'){sound('rescue');toast('Pepperoni found! Press L for a longer power dash and double boss damage · 8s recharge. Space stays a normal dash.',7000);}
    else if(event.type==='boss-open'){sound('key');toast('The vacuum overheated! Dash into it now!',2500);}
    else if(event.type==='boss-hit'){toast(world.powerDash?'Power bonk! Two damage. Vacuum stunned — roll the whole team clear!':'Bonk! One damage. Vacuum stunned — roll the whole team clear!');}
    else if(event.type==='boss-win'){soundtrack.setScene(view,world.room,{bossDefeated:true});sound('win');toast('Sir Sucks-a-Lot is unplugged! Take the path home →',6000);}
    else if(event.type==='defeat'){save();sound('defeat');navigate(routeURL('retry'));return;}
    else if(event.type==='exit') {
      const next=ORDER[ORDER.indexOf(world.room)+1];
      if(next)navigate(routeURL('play',next));
      else{run.completed=true;save();sound('win');navigate(routeURL('picnic'));}
      return;
    }
    if(!['stun','bonk','goose-warning','honk'].includes(event.type)){save();updateProgress();}
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
    if(view==='picnic'&&run)drawPicnic(ctx,run,viewportWidth,animationTime,reduced);
    else if(view!=='home'&&world)drawWorld(ctx,world,run,viewportWidth,reduced);
    else{previewWorld.time=animationTime;drawWorld(ctx,previewWorld,previewRun,viewportWidth,reduced,true);}
    if(toastUntil&&now>toastUntil){$('room-toast').hidden=true;toastUntil=0;}
  }
  requestAnimationFrame(frame);
}
configureTouch();renderSound();readRoute();requestAnimationFrame(frame);
