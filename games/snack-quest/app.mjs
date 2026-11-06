import { ROOMS, WIDTH, HEIGHT, createRun, validRun, makeWorld, roomCount, isUnlocked, firstUnfinished, step, startDash } from './engine.mjs';
import { portrait, drawWorld, drawPicnic, camera } from './art.mjs';

const $=id=>document.getElementById(id);
const canvas=$('world'),ctx=canvas.getContext('2d');
const SAVE_PREFIX='pepsi-pepper.snack-quest.v1.';
const memory=new Map();
const keys=new Set(),touchKeys=new Map();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let run,world,view='home',character='pepsi',viewportWidth=WIDTH,lastFrame=0,saveElapsed=0,toastUntil=0,previousFocus=null,audioContext,soundOn=false,animationTime=0,latestId=null,saveFailed=false;
let storageReadFailed=false;
try{latestId=localStorage.getItem(SAVE_PREFIX+'latest');soundOn=localStorage.getItem(SAVE_PREFIX+'sound')==='true';}catch{storageReadFailed=true;}

function readRun(id){
  if(!/^[a-z0-9]{6,16}$/.test(id||''))return null;
  if(memory.has(id))return memory.get(id);
  try{const raw=localStorage.getItem(SAVE_PREFIX+id);if(!raw)return null;const saved=JSON.parse(raw);if(!validRun(saved,id))throw Error('Invalid save');memory.set(id,saved);return saved;}catch{storageReadFailed=true;return null;}
}
function save(){
  if(!run)return;
  if(world){run.positions[world.room]={x:world.player.x,y:world.player.y};run.room=world.room;}
  memory.set(run.id,run);latestId=run.id;
  try{const raw=localStorage.getItem(SAVE_PREFIX+run.id);if(raw){const other=JSON.parse(raw);if(!validRun(other,run.id))throw Error('Existing save needs recovery');const count=run.collected.length;run.collected=[...new Set([...run.collected,...other.collected])];run.completed=run.completed||other.completed;if(run.collected.length!==count)updateProgress();}localStorage.setItem(SAVE_PREFIX+run.id,JSON.stringify(run));localStorage.setItem(SAVE_PREFIX+'latest',run.id);saveFailed=false;$('save-error').hidden=true;$('save-status').textContent='Adventure saved on this device.';}
  catch{saveFailed=true;$('save-error').hidden=false;$('save-status').textContent='Progress is in this tab. Saving needs a retry.';}
}
function routeURL(nextView='play',room=world?.room||run?.room||'meadow',selectedCharacter=character,id=run?.id){const url=new URL(location.href);url.search='';url.hash='';if(nextView!=='home')url.searchParams.set('view',nextView);if(id)url.searchParams.set('run',id);if(nextView!=='home')url.searchParams.set('room',room);url.searchParams.set('corgi',selectedCharacter);return url;}
function navigate(url,{replace=false}={}){save();history[replace?'replaceState':'pushState']({},'',url);readRoute();}
function newRun(){save();const randomValue=crypto.getRandomValues(new Uint32Array(1))[0];const id=Date.now().toString(36)+randomValue.toString(36).slice(0,3);run=createRun(id,character);world=makeWorld(run,'meadow');save();navigate(routeURL('play','meadow'));sound('start');}
function announce(message){$('announcement').textContent=message;}
function toast(message,duration=2600){$('room-toast').textContent=message;$('room-toast').hidden=false;toastUntil=performance.now()+duration;announce(message);}
function clearInput(){keys.clear();touchKeys.clear();document.querySelectorAll('.dpad button').forEach(button=>button.classList.remove('active'));if(world)world.target=null;}
function readRoute(){
  clearInput();
  const query=new URLSearchParams(location.search);const nextView=query.get('view')||'home';view=['home','play','pause','picnic'].includes(nextView)?nextView:'home';character=query.get('corgi')==='pepper'?'pepper':'pepsi';
  const id=query.get('run');const requestedRoom=query.get('room');let saved=id?readRun(id):readRun(latestId);
  if(!saved&&!storageReadFailed&&id&&/^[a-z0-9]{6,16}$/.test(id)){saved=createRun(id,character);memory.set(id,saved);}
  if(saved){run=saved;if(!query.has('corgi'))character=run.character;run.character=character;let room=Object.hasOwn(ROOMS,requestedRoom||'')?requestedRoom:run.room;if(!isUnlocked(run,room))room=firstUnfinished(run);if(!world||world.room!==room||world.runId!==run.id){world=makeWorld(run,room);world.runId=run.id;}}
  else{run=null;world=null;}
  if(view!=='home'&&!run){view='home';}
  if(view==='picnic'&&run?.collected.length!==12)view='play';
  if(run&&view!=='home')history.replaceState({},'',routeURL(view,world.room));
  else if(nextView!=='home'&&view==='home')history.replaceState({},'',routeURL('home'));
  render();
  if(view==='play'){canvas.focus({preventScroll:true});toast(ROOMS[world.room].note,3400);}
  if(storageReadFailed){$('save-error').hidden=false;$('save-error').firstChild.textContent='Your saved adventure could not be read. Any existing save has been left in place. Keep this tab open or download your progress. ';storageReadFailed=false;}
}
function characterButton(name,description){const id=name.toLowerCase();return `<button class="character" data-character="${id}" aria-pressed="${character===id}"><canvas width="240" height="200" data-portrait="${id}" aria-hidden="true"></canvas><strong>${name}</strong><small>${description}</small></button>`;}
function render(){
  document.body.classList.toggle('playing',view==='play'||view==='pause');document.body.classList.toggle('paused',view==='pause');
  $('play-controls').hidden=view!=='play';$('under-game').hidden=view==='play'||view==='pause';$('pause').hidden=view!=='play';$('pause').href=routeURL('pause');$('screen').className='screen';$('in-world-hint').hidden=view!=='play';$('room-toast').hidden=true;
  $('room-kicker').textContent=view==='home'?'PEPSI & PEPPER PRESENT':view==='picnic'?'THE BEST PART OF THE ADVENTURE':`CLEARING ${run.order.indexOf(world.room)+1} OF 3 · ${character.toUpperCase()} LEADS`;
  $('room-name').textContent=view==='home'?'A pocket-sized adventure':view==='picnic'?'Home is wherever you are':ROOMS[world.room].name;
  const activeRun=run&&!run.completed;
  if(view==='home'){
    $('screen').innerHTML=`<div class="welcome-card"><p class="card-eyebrow">A LITTLE QUEST FOR TWO</p><h3>The picnic basket<br>won’t fill itself.</h3><p>Wander three little clearings, dodge silly toys, and bring home something delicious.</p><div class="character-options" aria-label="Choose who leads the adventure">${characterButton('Pepsi','the brave little biscuit')}${characterButton('Pepper','the curious little bean')}</div><button class="primary-button" id="begin">${activeRun?'Continue our adventure':'Let’s find some snacks'} <span>→</span></button>${activeRun?'<button class="secondary-button" id="fresh">Start a new little adventure</button>':''}<p class="tiny-note">You lead. Your best friend follows. ♡</p></div>`;
    document.querySelectorAll('[data-portrait]').forEach(element=>portrait(element,element.dataset.portrait));
    document.querySelectorAll('[data-character]').forEach(button=>button.addEventListener('click',()=>{character=button.dataset.character;if(run)run.character=character;navigate(routeURL('home'));}));
    $('begin').addEventListener('click',()=>{if(activeRun){run.character=character;navigate(routeURL('play',run.room));sound('start');}else newRun();});$('fresh')?.addEventListener('click',newRun);
  }else if(view==='pause'){
    $('screen').innerHTML='<div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><span class="pause-flower" aria-hidden="true">✿</span><h3 id="pause-title">A little breather.</h3><p>The snacks can wait.<br>Your adventure will be right here.</p><button id="resume" class="primary-button">Back to our adventure <span>→</span></button><a id="home-link" class="secondary-button" href="./">Back to the cottage</a></div>';
    $('resume').addEventListener('click',resume);$('home-link').href=routeURL('home');$('resume').focus({preventScroll:true});
  }else if(view==='picnic'){
    $('screen').classList.add('picnic-screen');$('screen').innerHTML='<div class="picnic-card"><p class="card-eyebrow">12 SNACKS. 2 VERY HAPPY CORGIS.</p><h3>Everything tastes<br>better with you.</h3><p>A full basket, tired little paws, and your favorite person. That’s a pretty perfect day.</p><button class="primary-button" id="again">One more little adventure <span>↗</span></button><p class="tiny-note">Best adventure buddies, forever. ♡</p></div>';
    $('again').addEventListener('click',newRun);
  }else{$('screen').classList.add('empty');$('screen').replaceChildren();}
  updateProgress();resize();
}
function updateProgress(){
  $('snack-count').innerHTML=`${run?.collected.length||0} <span>/ 12</span>`;
  $('inventory-label')?.setAttribute('aria-label',`${run?.collected.length||0} of 12 snacks`);
  const order=run?.order||['meadow','pond','orchard'];
  $('trail').innerHTML=order.map((room,index)=>{const done=run&&roomCount(run,room)===4,unlocked=run&&isUnlocked(run,room);const content=`<span class="dot">${done?'✓':index+1}</span>${ROOMS[room].short}`;const current=view!=='home'&&view!=='picnic'&&world?.room===room?' aria-current="location"':'';return `${index?'<span class="trail-line" aria-hidden="true"></span>':''}${unlocked?`<a class="trail-item ${done?'done':''}" href="${routeURL('play',room)}"${current}>${content}</a>`:`<span class="trail-item"${current}>${content}</span>`}`;}).join('');
  const ready=run&&world&&roomCount(run,world.room)===4;const final=run&&world&&world.room===run.order.at(-1);$('exit-link').hidden=view!=='play'||!ready;
  if(ready){const next=run.order[run.order.indexOf(world.room)+1];$('exit-link').href=routeURL(final?'picnic':'play',next||world.room);$('exit-link').innerHTML=final?'Picnic time! <span>♡</span>':'Next clearing <span>→</span>';}
  if(view==='play'){$('in-world-hint').innerHTML=ready?'<span>✦</span> Basket packed! Follow the path to the right.':`<span>✦</span> ${roomCount(run,world.room)} / 4 ${ROOMS[world.room].snack==='biscuit'?'biscuits':ROOMS[world.room].snack==='berry'?'berries':'cheese bites'} found in this clearing`;}
}
function resize(){const bounds=$('stage').getBoundingClientRect();viewportWidth=Math.min(WIDTH,Math.round(bounds.width/bounds.height*HEIGHT));const ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(viewportWidth*ratio);canvas.height=Math.round(HEIGHT*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);}
new ResizeObserver(resize).observe($('stage'));

function inputDirection(){let x=(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0),y=(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0);for(const direction of touchKeys.values()){x+=direction==='right'?1:direction==='left'?-1:0;y+=direction==='down'?1:direction==='up'?-1:0;}if(x||y){world.target=null;return {x,y};}if(world.target){const dx=world.target.x-world.player.x,dy=world.target.y-world.player.y;if(Math.hypot(dx,dy)>7)return{x:dx,y:dy};world.target=null;}return{x:0,y:0};}
function dash(){if(view!=='play')return;if(startDash(world,inputDirection()))sound('dash');}
function pause(){if(view!=='play')return;previousFocus=document.activeElement;navigate(routeURL('pause'));}
function resume(){if(view!=='pause')return;navigate(routeURL('play'));if(previousFocus?.isConnected&&previousFocus!==$('pause'))previousFocus.focus({preventScroll:true});else canvas.focus({preventScroll:true});}

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(view==='pause')resume();else if(view==='play')pause();return;}
  if(view==='pause'&&event.key==='Tab'){const buttons=[...$('screen').querySelectorAll('button,a')];if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus();}return;}
  if(view!=='play'||event.metaKey||event.ctrlKey||event.altKey||event.target.closest('button,a,input'))return;
  const key=event.key.length===1?event.key.toLowerCase():event.key;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d',' '].includes(key)){event.preventDefault();if(key===' '){if(!event.repeat)dash();}else keys.add(key);}
});
document.addEventListener('keyup',event=>keys.delete(event.key.length===1?event.key.toLowerCase():event.key));
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden){save();if(view==='play')pause();clearInput();}lastFrame=performance.now();});
window.addEventListener('pagehide',save);
window.addEventListener('popstate',()=>{save();readRoute();});
document.addEventListener('click',event=>{
  const link=event.target.closest('a');if(!link||event.defaultPrevented||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;const url=new URL(link.href);if(url.origin!==location.origin||url.pathname!==location.pathname)return;event.preventDefault();if(link.id==='pause')previousFocus=document.activeElement;if(url.searchParams.get('view')==='picnic'&&run?.collected.length===12){run.completed=true;save();sound('win');}navigate(url);
});
let backdropDown=false;
$('screen').addEventListener('pointerdown',event=>{backdropDown=event.target===$('screen');});
$('screen').addEventListener('click',event=>{if(view==='pause'&&backdropDown&&event.target===$('screen'))resume();backdropDown=false;});
canvas.addEventListener('pointerdown',event=>{if(view!=='play')return;event.preventDefault();canvas.focus({preventScroll:true});const bounds=canvas.getBoundingClientRect();world.target={x:(event.clientX-bounds.left)/bounds.width*viewportWidth+camera(world,viewportWidth),y:(event.clientY-bounds.top)/bounds.height*HEIGHT};});
document.querySelectorAll('[data-direction]').forEach(button=>{button.addEventListener('pointerdown',event=>{if(view!=='play')return;event.preventDefault();button.setPointerCapture(event.pointerId);touchKeys.set(event.pointerId,button.dataset.direction);button.classList.add('active');});for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,event=>{touchKeys.delete(event.pointerId);button.classList.remove('active');});});
$('dash').addEventListener('click',()=>{dash();if(!matchMedia('(pointer:coarse)').matches)canvas.focus({preventScroll:true});});

function sound(kind){if(!soundOn)return;try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const notes=kind==='snack'?[660,880]:kind==='win'?[523,659,784,1046]:kind==='start'?[440,554,660]:kind==='bump'?[220,196]:[392,587];notes.forEach((frequency,index)=>{const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),when=audioContext.currentTime+index*.085;oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,when);gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(.045,when+.014);gain.gain.exponentialRampToValueAtTime(.001,when+.19);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(when);oscillator.stop(when+.2);});}catch{/* Sound is optional; gameplay remains available. */}}
function renderSound(){$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'Turn sound off':'Turn sound on');$('sound').title=soundOn?'Turn sound off':'Turn sound on';$('sound').innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z${soundOn?'M16 8q5 4 0 8m3-11q8 7 0 14':'M16 9l5 6m0-6-5 6'}"/></svg>`;}
$('sound').addEventListener('click',()=>{soundOn=!soundOn;renderSound();try{localStorage.setItem(SAVE_PREFIX+'sound',String(soundOn));}catch{}sound('start');});
$('retry-save').addEventListener('click',()=>{save();if(!saveFailed)toast('Your adventure is safely saved.');});
$('download-save').addEventListener('click',()=>{if(!run)return;save();const blob=new Blob([JSON.stringify(run,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='pepsi-pepper-adventure.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
const restore=document.createElement('input');restore.type='file';restore.accept='.json,application/json';restore.hidden=true;restore.setAttribute('aria-label','Restore adventure backup');document.body.append(restore);
const restoreButton=document.createElement('button');restoreButton.className='restore-button';restoreButton.textContent='Restore backup';restoreButton.addEventListener('click',()=>restore.click());document.querySelector('footer').append(restoreButton);
restore.addEventListener('change',async()=>{try{const file=restore.files[0];if(!file)return;if(file.size>50000)throw Error('Too large');const data=JSON.parse(await file.text());if(!/^[a-z0-9]{6,16}$/.test(data.id)||!validRun(data,data.id))throw Error('Invalid backup');save();run=data;character=run.character;memory.set(run.id,run);world=makeWorld(run,run.room);world.runId=run.id;save();navigate(routeURL(run.completed&&run.collected.length===12?'picnic':'play',run.room));toast('Welcome back. Your adventure is restored.');}catch{toast('That file isn’t a Snack Quest backup. Your adventure is unchanged.',5000);}finally{restore.value='';}});

// The title view has a living meadow without starting or overwriting a run.
const previewRun=createRun('snacktime'),previewWorld=makeWorld(previewRun,'meadow');previewWorld.player.x=340;previewWorld.player.y=410;previewWorld.buddy.x=710;previewWorld.buddy.y=400;previewWorld.buddy.facing=-1;
function frame(now){const dt=Math.min((now-lastFrame)/1000||0,.035);lastFrame=now;if(!document.hidden){animationTime+=dt;
  if(view==='play'&&world){const events=step(world,run,inputDirection(),dt);for(const event of events){if(event.type==='snack'){sound('snack');save();updateProgress();const count=roomCount(run,world.room);if(count===4){toast(world.room===run.order.at(-1)?'The basket is full. Let’s have our picnic!':'All four found! On to the next little clearing.',3500);}else announce(`${run.collected.length} of 12 snacks collected.`);}else if(event.type==='bump'){sound('bump');toast('Boop! Just a little bump. All snacks safe.',1800);}else if(event.type==='exit'){const next=run.order[run.order.indexOf(world.room)+1];if(next){navigate(routeURL('play',next));}else{run.completed=true;save();sound('win');navigate(routeURL('picnic'));}break;}}
    saveElapsed+=dt;if(saveElapsed>1){save();saveElapsed=0;}$('dash').disabled=world.cooldown>0;drawWorld(ctx,world,run,viewportWidth,reduced);
  }else if(view==='picnic'&&run){drawPicnic(ctx,run,viewportWidth,animationTime,reduced);}
  else if(view==='pause'&&world){drawWorld(ctx,world,run,viewportWidth,reduced);}
  else{previewWorld.time=animationTime;drawWorld(ctx,previewWorld,previewRun,viewportWidth,reduced,true);}
  if(toastUntil&&now>toastUntil){$('room-toast').hidden=true;toastUntil=0;}
  }requestAnimationFrame(frame);
}
renderSound();readRoute();requestAnimationFrame(frame);
