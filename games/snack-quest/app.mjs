import { ROOMS, ORDER, WIDTH, HEIGHT, createRun, validRun, migrateRun, makeWorld, maxHearts, goalDone, isUnlocked, firstUnfinished, objective, retryRoom, step, startDash } from './engine.mjs?v=2';
import { portrait, drawWorld, drawPicnic } from './art.mjs?v=2';

const $ = id => document.getElementById(id);
const canvas=$('world'), ctx=canvas.getContext('2d');
const PREFIX='pepsi-pepper.snack-quest.v2.', LEGACY='pepsi-pepper.snack-quest.v1.';
const memory=new Map(), savedSnapshots=new Map(), keys=new Set();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let run=null, world=null, view='home', viewportWidth=WIDTH, lastFrame=0, saveElapsed=0;
let toastUntil=0, animationTime=0, audioContext, soundOn=false, latestId=null;
let readFailed=false, saveFailed=false, conflict=false, backdropDown=false;
try {
  latestId=localStorage.getItem(PREFIX+'latest')||localStorage.getItem(LEGACY+'latest');
  soundOn=(localStorage.getItem(PREFIX+'sound')||localStorage.getItem(LEGACY+'sound'))==='true';
} catch { readFailed=true; }

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
    memory.set(id,saved); return saved;
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
  run=createRun(id);world=makeWorld(run,'meadow');conflict=false;save();
  navigate(routeURL('play','meadow'));sound('start');
}
function announce(message){$('announcement').textContent=message;}
function toast(message,duration=3200){$('room-toast').textContent=message;$('room-toast').hidden=false;toastUntil=performance.now()+duration;announce(message);}
function clearInput(){keys.clear();}
function readRoute() {
  clearInput();
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
  render();
  if(view==='play') {
    canvas.focus({preventScroll:true});
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
  $('pause').hidden=view!=='play';$('pause').href=routeURL('pause');
  $('screen').className='screen';$('objective').hidden=view!=='play';$('dash-meter').hidden=view!=='play';$('room-toast').hidden=true;
  $('room-kicker').textContent=view==='home'?'PEPSI’S LITTLE ADVENTURE':view==='picnic'?'BOTH HOME. BOTH HAPPY.':`CHAPTER ${ORDER.indexOf(world.room)+1} OF 3`;
  $('room-name').textContent=view==='home'?'One friend is missing.':view==='picnic'?'Home is wherever you are':ROOMS[world.room].name;
  $('location-icon').textContent=view==='picnic'?'♡':world?.room==='pond'?'♧':'✿';
  const active=run&&!run.completed;
  if(view==='home') {
    $('screen').innerHTML=`<div class="welcome-card"><p class="card-eyebrow">SOMEONE’S MISSING FROM THE PICNIC</p><h3>Where’s Pepper?</h3>${plushPair(true)}<p>Find the key, rescue your best friend,<br>and brave the trip home together.</p><div class="mission-strip"><span>3 hearts</span><span>3 little chapters</span><span>1 best friend</span></div><button id="begin" class="primary-button">${active?'Continue the adventure':'Go find Pepper'} <span>→</span></button>${active?'<button id="fresh" class="secondary-button">Start a new adventure</button>':''}<p class="tiny-note">WASD to move. Space to dash. A keyboard is required.</p></div>`;
    $('begin').addEventListener('click',()=>active?navigate(routeURL(run.health<=0?'retry':'play',run.room)):newRun());
    $('fresh')?.addEventListener('click',newRun);
  } else if(view==='pause') {
    $('screen').innerHTML='<div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><span class="pause-flower" aria-hidden="true">✿</span><h3 id="pause-title">Catch your breath.</h3><p>WASD to move. Space to dash.<br>Dash through toys to stun them.<br>Snacks restore one heart.</p><button id="resume" class="primary-button">Keep going <span>→</span></button><a id="home-link" class="secondary-button" href="./">Back to the cottage</a></div>';
    $('resume').addEventListener('click',dismissScreen);$('home-link').href=routeURL('home');$('resume').focus({preventScroll:true});
  } else if(view==='reunion') {
    $('screen').innerHTML='<div class="story-card" role="dialog" aria-modal="true" aria-labelledby="reunion-title"><p class="card-eyebrow">FOUND: ONE VERY GOOD FRIEND</p><canvas width="240" height="200" data-portrait="pepper" aria-label="Pepper, the gray plush corgi"></canvas><h3 id="reunion-title">Found you, Pepper.</h3><p>Your best friend is coming with you.<br>One last clearing, then a picnic together.</p><div class="new-heart">♥ A little braver together. Four hearts, fully restored.</div><button id="reunion-continue" class="primary-button">Let’s head home <span>→</span></button><button id="reunion-close" class="secondary-button">Stay by the pond a little longer</button></div>';
    $('reunion-continue').addEventListener('click',()=>navigate(routeURL('play','orchard')));$('reunion-close').addEventListener('click',dismissScreen);$('reunion-continue').focus({preventScroll:true});
  } else if(view==='retry') {
    $('screen').innerHTML='<div class="retry-card" role="dialog" aria-modal="true" aria-labelledby="retry-title"><span class="pause-flower" aria-hidden="true">♡</span><p class="card-eyebrow">A SMALL SETBACK</p><h3 id="retry-title">Even brave loaves<br>need another try.</h3><p>Restart this clearing with full hearts.<br>Its new snacks return to the grass.<br>Your key and Pepper stay safe.</p><button id="retry" class="primary-button">Try this clearing again <span>↻</span></button><button id="retry-home" class="secondary-button">Rest at the cottage</button></div>';
    $('retry').addEventListener('click',()=>{world=retryRoom(run,world.room);save();navigate(routeURL('play'));});$('retry-home').addEventListener('click',dismissScreen);$('retry').focus({preventScroll:true});
  } else if(view==='picnic') {
    $('screen').classList.add('picnic-screen');
    $('screen').innerHTML=`<div class="picnic-card"><p class="card-eyebrow">THE BEST THING YOU BROUGHT HOME</p><h3>Was each other.</h3><p>A full basket, tired little paws,<br>and your favorite adventure buddy.</p><div class="result-stats"><span><b>${run.collected.length}</b> snacks</span><span><b>${run.hits}</b> bumps</span><span><b>${run.retries}</b> retries</span></div><button id="again" class="primary-button">One more adventure <span>↗</span></button><p class="tiny-note">Pepsi & Pepper. Always better together.</p></div>`;
    $('again').addEventListener('click',newRun);
  } else {$('screen').classList.add('empty');$('screen').replaceChildren();}
  document.querySelectorAll('[data-portrait]').forEach(element=>portrait(element,element.dataset.portrait));
  updateProgress();resize();
}
function updateProgress() {
  const hearts=run?maxHearts(run):3,health=run?.health??3;
  $('health').setAttribute('aria-label',`${health} of ${hearts} hearts`);
  $('hearts').innerHTML=Array.from({length:hearts},(_,i)=>`<span class="${i<health?'':'empty-heart'}" aria-hidden="true">♥</span>`).join('');
  $('snack-count').textContent=run?.collected.length||0;
  $('buddy-status').textContent=run?.pepperFound?'♡ Pepper is with you.':'Find your adventure buddy.';
  $('trail').innerHTML=ORDER.map((room,index)=>{
    const done=run&&goalDone(run,room),unlocked=run&&isUnlocked(run,room);
    const content=`<span class="dot">${done?'✓':index+1}</span>${ROOMS[room].short}`;
    const current=!['home','picnic'].includes(view)&&world?.room===room?' aria-current="location"':'';
    return `${index?'<span class="trail-line" aria-hidden="true"></span>':''}${unlocked?`<a class="trail-item ${done?'done':''}" href="${routeURL('play',room)}"${current}>${content}</a>`:`<span class="trail-item">${content}</span>`}`;
  }).join('');
  if(run&&world)$('objective-text').textContent=objective(run,world.room);
}
function resize() {
  const bounds=$('stage').getBoundingClientRect();
  viewportWidth=Math.min(WIDTH,Math.round(bounds.width/bounds.height*HEIGHT));
  const ratio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(viewportWidth*ratio);canvas.height=Math.round(HEIGHT*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
}
new ResizeObserver(resize).observe($('stage'));
function inputDirection(){return {x:Number(keys.has('d'))-Number(keys.has('a')),y:Number(keys.has('s'))-Number(keys.has('w'))};}
function dash(){if(view==='play'&&run.health>0&&startDash(world,inputDirection()))sound('dash');}
function pause(){if(view==='play')navigate(routeURL('pause'));}
function dismissScreen() {
  if(view==='retry')navigate(routeURL('home'));
  else if(view==='pause'||view==='reunion')navigate(routeURL('play'));
}

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();if(view==='play')pause();else dismissScreen();return;}
  if(['pause','reunion','retry'].includes(view)&&event.key==='Tab') {
    const controls=[...$('screen').querySelectorAll('button,a')];
    if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}
    else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus();}
    return;
  }
  if(view!=='play'||event.metaKey||event.ctrlKey||event.altKey||event.target.closest('input,textarea,[contenteditable]'))return;
  const key=event.key.toLowerCase();
  if(['w','a','s','d'].includes(key)){event.preventDefault();keys.add(key);canvas.focus({preventScroll:true});}
  else if(key===' '&&!event.target.closest('button,a')){event.preventDefault();if(!event.repeat)dash();}
  else if(event.key.startsWith('Arrow')&&event.target===canvas)event.preventDefault();
});
document.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
window.addEventListener('blur',clearInput);
canvas.addEventListener('pointerdown',()=>canvas.focus({preventScroll:true}));
document.addEventListener('visibilitychange',()=>{if(document.hidden){save();if(view==='play')pause();clearInput();}lastFrame=performance.now();});
window.addEventListener('pagehide',save);
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

function sound(kind) {
  if(!soundOn)return;
  try {
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended')audioContext.resume();
    const notes=kind==='snack'?[660,880]:['win','rescue','key'].includes(kind)?[523,659,784,1046]:kind==='hit'||kind==='defeat'?[220,165]:kind==='start'?[440,554,660]:[392,587];
    notes.forEach((frequency,index)=>{
      const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),when=audioContext.currentTime+index*.085;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,when);gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(.045,when+.014);gain.gain.exponentialRampToValueAtTime(.001,when+.19);
      oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(when);oscillator.stop(when+.2);
    });
  }catch{/* Optional sound must never stop the game. */}
}
function renderSound() {
  $('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'Turn sound off':'Turn sound on');
  $('sound').innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z${soundOn?'M16 8q5 4 0 8m3-11q8 7 0 14':'M16 9l5 6m0-6-5 6'}"/></svg>`;
}
$('sound').addEventListener('click',()=>{soundOn=!soundOn;renderSound();try{localStorage.setItem(PREFIX+'sound',String(soundOn));}catch{}sound('start');});
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
    run=data;memory.set(run.id,run);world=makeWorld(run,run.room);conflict=false;save();
    navigate(routeURL(run.completed?'picnic':run.health<=0?'retry':'play',run.room));toast('Your adventure is restored.');
  }catch{toast('That file isn’t a valid adventure backup. Your current adventure is unchanged.',5000);}
  finally{restore.value='';}
});

const previewRun=createRun('snacktime'),previewWorld=makeWorld(previewRun,'meadow');
previewWorld.player.x=270;previewWorld.player.y=420;
function handleEvents(events) {
  for(const event of events) {
    if(event.type==='snack'){sound('snack');toast(event.healed?'A snack and a second wind. +1 heart.':'A little something for the picnic.');}
    else if(event.type==='key'){sound('key');toast('The key! Pepper must be over by the pond.',4000);}
    else if(event.type==='basket'){sound('key');toast('Basket packed. Get both little loaves home!',3500);}
    else if(event.type==='hit'){sound('hit');toast('Oof! −1 heart. Dash through toys; snacks can heal.',2300);}
    else if(event.type==='stun'){sound('dash');announce('Toy stunned. Keep moving.');}
    else if(event.type==='rescue'){save();sound('rescue');navigate(routeURL('reunion'));return;}
    else if(event.type==='defeat'){save();sound('defeat');navigate(routeURL('retry'));return;}
    else if(event.type==='exit') {
      const next=ORDER[ORDER.indexOf(world.room)+1];
      if(next)navigate(routeURL('play',next));
      else{run.completed=true;save();sound('win');navigate(routeURL('picnic'));}
      return;
    }
    if(event.type!=='stun'){save();updateProgress();}
  }
}
function frame(now) {
  const dt=Math.min((now-lastFrame)/1000||0,.035);lastFrame=now;
  if(!document.hidden) {
    animationTime+=dt;
    if(view==='play'&&world) {
      handleEvents(step(world,run,inputDirection(),dt));
      saveElapsed+=dt;if(saveElapsed>1){save();saveElapsed=0;}
      $('dash-fill').style.width=`${Math.max(0,1-world.cooldown/.95)*100}%`;
      $('dash-label').textContent=world.cooldown>0?'catching breath':'dash ready';
    }
    if(view==='picnic'&&run)drawPicnic(ctx,run,viewportWidth,animationTime,reduced);
    else if(view!=='home'&&world)drawWorld(ctx,world,run,viewportWidth,reduced);
    else{previewWorld.time=animationTime;drawWorld(ctx,previewWorld,previewRun,viewportWidth,reduced,true);}
    if(toastUntil&&now>toastUntil){$('room-toast').hidden=true;toastUntil=0;}
  }
  requestAnimationFrame(frame);
}
renderSound();readRoute();requestAnimationFrame(frame);
