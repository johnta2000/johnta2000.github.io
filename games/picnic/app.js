import { LEVELS, HAZARDS, HAZARD_INFO, CATCH_Y, clamp, createRun, advance, blankSave, parseSave, readRoute, configFor, effectiveWidth, gust, isLevelOpen, nextLevel as nextOpen, crewFor, collectGolden, finishRun } from './engine.mjs?v=4';
import { drawMeadow, drawPicnic, drawBasket, drawTreat, drawHeart, drawCorgi } from './art.mjs?v=4';
const $=id=>document.getElementById(id),canvas=$('scene'),ctx=canvas.getContext('2d'),stage=$('stage'),screen=$('screen');
const KEY='pepsi-pepper-picnic-v2',LEGACY_KEY='pepsi-pepper-picnic-v1',PEE_KEY='pepsi-pepper-picnic-pee';
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),keys=new Set();
let save=blankSave(),route=readRoute(location.search),storageProblem=false,corruptSave=null;
let width=900,height=440,run=null,pointerId=null,lastFrame=0,sinceSave=0,happyUntil=0,messageUntil=0,particles=[],audio=null,returnFocus=null;
function announce(message){$('announcement').textContent=message;}
function showSaveProblem(message){storageProblem=true;$('save-warning').hidden=false;$('save-message').textContent=message;$('save-status').textContent='Progress has not been saved. Keep this tab open.';}
try{
  const raw=localStorage.getItem(KEY)||localStorage.getItem(LEGACY_KEY);
  if(raw){try{save=parseSave(raw);}catch{corruptSave=raw;showSaveProblem('Your previous save could not be read. It is still intact; download a backup before starting fresh.');}}
  save.peeUnlocked ||= localStorage.getItem(PEE_KEY)==='unlocked';
}catch{showSaveProblem('This browser could not load saved progress. You can still play; download a backup to keep it.');}
function persist(explicit=false){
  if(corruptSave&&!explicit)return false;
  try{
    if(corruptSave)localStorage.setItem(`${KEY}-recovery`,corruptSave);
    save.peeUnlocked ||= localStorage.getItem(PEE_KEY)==='unlocked';
    if(save.peeUnlocked)localStorage.setItem(PEE_KEY,'unlocked');
    localStorage.setItem(KEY,JSON.stringify(save));corruptSave=null;storageProblem=false;$('save-warning').hidden=true;$('save-status').textContent='Your adventure is saved on this device.';return true;
  }catch{showSaveProblem('Your browser could not save this adventure. Keep this tab open or download your progress.');return false;}
}
function backup(){
  const blob=new Blob([JSON.stringify({...save,...(corruptSave?{previousUnreadableSave:corruptSave}:{})},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='pepsi-and-pepper-picnic.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('retry-save').addEventListener('click',()=>{if(persist(true))announce('Your adventure is saved.');});$('backup').addEventListener('click',backup);
function playURL(level,paused=false){return `?view=play&level=${level}${paused?'&paused=1':''}`;}
function pauseRun(){keys.clear();pointerId=null;if(run?.status==='playing'){run.status='paused';persist();}}
function go(url,replace=false){pauseRun();history[replace?'replaceState':'pushState']({},'',url);route=readRoute(location.search);render();scrollTo({top:0,behavior:'instant'});}
function button(label,url,secondary=false){return `<a class="button${secondary?' secondary':''}" href="${url}">${label}</a>`;}
function currentCrew(){return crewFor(save,route.view==='play'?route.level:null);}
function crewNames(crew=currentCrew()){return ['Pepsi',...(crew.pee?['Pee']:[]),...(crew.pepper?['Pepper']:[])];}
function names(){
  const friends=crewNames(crewFor(save));
  return `<div class="name-labels crew-${friends.length}">${friends.map(name=>name==='Pepsi'?'<span>Pepsi</span>':`<a data-friend-link href="?view=${name==='Pee'?'guest':'pepper'}&level=${save.lastLevel}&from=${route.view}" aria-label="Meet ${name}">${name}${name==='Pee'?' ♡':''}</a>`).join('')}</div>`;
}
const starsText=number=>'★'.repeat(number)+'☆'.repeat(3-number);
function soundMarkup(){
  $('sound').innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4Z"/>${save.sound?'<path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>':'<path d="m16 9 5 6m0-6-5 6"/>'}</svg>`;
  $('sound').setAttribute('aria-label',`Turn sound ${save.sound?'off':'on'}`);$('sound').setAttribute('aria-pressed',String(save.sound));
}
function wakeAudio(){if(!save.sound)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audio ||= new Audio();audio.resume().catch(()=>{});}}catch{}}
function chime(kind='catch'){
  if(!save.sound||audio?.state!=='running')return;
  const notes=kind==='win'?[523.25,659.25,783.99,1046.5]:kind==='oops'?[220,165]:[720];
  notes.forEach((frequency,i)=>{const osc=audio.createOscillator(),gain=audio.createGain(),start=audio.currentTime+i*.1;osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.055,start+.012);gain.gain.exponentialRampToValueAtTime(.001,start+.2);osc.connect(gain);gain.connect(audio.destination);osc.start(start);osc.stop(start+.22);});
}
$('sound').addEventListener('click',()=>{save.sound=!save.sound;wakeAudio();soundMarkup();persist();chime();});
function baseWidth(){return clamp(128/width,.18,.30);}
function basketWidth(){return effectiveWidth(run,baseWidth());}
function renderNav(){
  $('level-nav').innerHTML=LEVELS.map((level,i)=>{const n=i+1,open=isLevelOpen(save,n);return `<a href="${playURL(n)}" data-number="${n}" class="${save.completed.includes(n)?'completed ':''}${open?'':'locked'}" ${['play','result','pepper','guest'].includes(route.view)&&route.level===n?'aria-current="step"':''} aria-label="Level ${n}: ${level.name}${open?'':', locked'}"><span class="level-short">${level.short}</span></a>`;}).join('');
  const nav=$('level-nav'),current=nav.querySelector('[aria-current]');
  if(current&&route.view==='play')nav.scrollLeft=current.offsetLeft-nav.offsetLeft-(nav.clientWidth-current.clientWidth)/2;
}
function paintIcons(){screen.querySelectorAll('canvas[data-drop]').forEach(element=>{const c=element.getContext('2d');c.scale(2,2);drawTreat(c,element.dataset.drop,20,20,20);});}
function hazardLegend(types){return `<div class="hazard-list">${types.map(type=>`<div><canvas width="80" height="80" data-drop="${type}" aria-hidden="true"></canvas><span><b>${HAZARD_INFO[type].name}</b><small>${HAZARD_INFO[type].rule}</small></span></div>`).join('')}</div>`;}
function render(){
  document.body.dataset.view=route.view;run=save.runs[route.level]||null;particles=[];keys.clear();
  const playing=route.view==='play',open=!playing||isLevelOpen(save,route.level);
  document.body.classList.toggle('playing',playing);canvas.style.touchAction=playing&&open?'none':'auto';
  const friends=crewNames().join(', ');
  canvas.setAttribute('aria-label',playing?`${friends} on the blanket. Catch treats and dodge hazards. Use your mouse, drag, or arrow keys. P or Escape pauses.`:`${friends} in a sunny picnic meadow.`);
  $('hud').hidden=!playing||!open;$('catch-message').classList.remove('visible','bad');screen.className='screen';
  $('scene-label').textContent=playing?`LEVEL ${route.level} OF ${LEVELS.length} · ${LEVELS[route.level-1].name.toUpperCase()}`:'☀ A LITTLE ADVENTURE, WITH A LOT OF SNACKS';
  $('scene-detail').textContent=playing?'THREE HEARTS. MANY DO-OVERS.':'EST. WITH LOVE';
  $('control-hint').textContent=playing?(matchMedia('(pointer: coarse)').matches?'Drag to catch snacks · Dodge the troublemakers':'Mouse or ← → to move · P to pause · Dodge the troublemakers'):'Small paws. Questionable decisions. Excellent company.';
  let title='Pepsi & Pepper’s Picnic';
  if(route.view==='home'){
    const ongoing=Object.values(save.runs).find(item=>['playing','paused'].includes(item.status));
    const startLevel=ongoing?.level||nextOpen(save);
    screen.innerHTML=`<div class="welcome"><span class="small-tag">TEN LEVELS. A FEW VERY BAD SNACK IDEAS.</span><h2>${save.pepperUnlocked?'The picnic got a little wild.':'One corgi. A big little adventure.'}</h2><p>${save.pepperUnlocked?'The crew is ready. The socks are plotting.':'Help Pepsi dodge trouble, find Pepper,<br>and gather the best picnic ever.'}</p>${button(ongoing?'Continue your adventure →':save.completed.length?'Keep the adventure going →':'Let’s go, Pepsi →',playURL(startLevel))}<br><a class="text-link" href="?view=levels">${save.completed.length} of ${LEVELS.length} levels complete · Adventure map</a></div>${names()}`;
  }else if(route.view==='levels'){
    title='Adventure map · Pepsi & Pepper';screen.classList.add('centered');
    screen.innerHTML=`<section class="paper-panel level-panel"><span class="small-tag">SMALL PAWS. BIG PLANS.</span><h2>Your little adventure.</h2><p>Finish each level to open the next. Replay for three stars.</p><div class="level-list">${LEVELS.map((level,i)=>{const n=i+1,open=isLevelOpen(save,n);return `<a class="level-card ${open?'':'is-locked'}" href="${playURL(n)}"><span class="level-number">${n}</span><span><strong>${level.name}</strong><small>${!open?`Finish level ${n-1} to unlock`:save.stars[n]?`${starsText(save.stars[n])} · ${level.goal} treats`:n===3?'Finish to find Pepper':n===5?'A golden mystery begins':`${level.goal} treats · ${level.duration}s`}</small></span><span class="level-check" aria-hidden="true">${!open?'⌑':save.completed.includes(n)?'✓':'→'}</span></a>`;}).join('')}</div><a class="text-link" href="./">Back to our meadow</a></section>`;
  }else if(route.view==='help'){
    title='How to play · Pepsi & Pepper';screen.classList.add('centered');
    const back=route.from==='play'?playURL(route.level,true):['levels','picnic','result','guest','pepper'].includes(route.from)?`?view=${route.from}&level=${route.level}`:'./';
    screen.innerHTML=`<section class="paper-panel help-panel"><span class="small-tag">SNACKS GOOD. LAUNDRY BAD.</span><h2>Choose your catches.</h2><p>Drag, move your mouse, or use <kbd>←</kbd> <kbd>→</kbd>. Keep enough treats before time runs out. You have <b>three hearts per round</b>.</p>${hazardLegend(HAZARDS)}<p class="help-note">Bad catches cost a heart. Missed snacks don’t. Lose all three hearts or run out of time? Retry that level with your progress intact.</p><p class="help-note"><b>Find your crew:</b> finish level 3 for Pepper. From level 5, collect golden biscuits on three different levels for a secret guest.</p><p class="help-note">Pause with P, Escape, or Ⅱ. Clean runs earn three stars; each hit costs a star.</p>${button('Got it, let’s go',back)}<div><button class="text-link" data-action="backup" style="background:none">Back up progress</button><label class="text-link" for="restore">Restore backup</label><input id="restore" type="file" accept="application/json,.json" class="sr-only"></div></section>`;
  }else if(playing){
    title=`${LEVELS[route.level-1].name} · Pepsi & Pepper`;
    if(!open){screen.classList.add('centered');screen.innerHTML=`<section class="paper-panel"><span class="symbol">⌑</span><span class="small-tag">LEVEL ${route.level} · STILL ON THE MAP</span><h2>${LEVELS[route.level-1].name}</h2><p>Finish level ${route.level-1} to open this part of the adventure. Your next stop is level ${nextOpen(save)}.</p>${button('Continue the adventure →',playURL(nextOpen(save)))}<br><a class="text-link" href="?view=levels">See the whole map</a></section>`;}
    else{if(!run){run=createRun(route.level);save.runs[route.level]=run;}if(run.status==='playing')run.status='paused';save.lastLevel=route.level;updateHUD();renderPlayPanel();}
  }else if(route.view==='result'){
    title='Picnic break · Pepsi & Pepper';screen.classList.add('centered');
    const result=save.results[route.level];
    if(!result)screen.innerHTML=`<section class="paper-panel"><span class="symbol">♡</span><h2>An adventure is waiting.</h2><p>This browser hasn’t played this round yet.</p>${button('Visit this level',playURL(route.level))}</section>`;
    else{
      const loss=result.hearts===0?({sock:'The socks won this round.',mud:'A spectacular mud situation.',vacuum:'A tactical vacuum retreat.'}[result.lastHazard]||'A tiny snack break.'):'The snacks got away!';
      screen.innerHTML=`<section class="paper-panel"><span class="symbol">${result.won?'♡':'☀'}</span><span class="small-tag">LEVEL ${route.level} · ${result.won?'MISSION DELICIOUS':'UNLIMITED DO-OVERS'}</span><h2>${result.won?(route.level===10?'A picnic worth the adventure!':'A very good little adventure.'):loss}</h2>${result.won&&result.stars?`<div class="earned-stars" aria-label="${result.stars} of 3 stars">${starsText(result.stars)}</div>`:''}<p>${result.won?(result.hits===0?'Not a sock in sight. Beautifully done.':'A little chaos. A lot of snacks. You made it.'):'The corgis are okay. Their dignity will recover.<br>Try this level again with three fresh hearts.'}</p><div class="result-stats"><span><b>${result.caught} / ${result.goal}</b>treats kept</span><span><b>${result.hearts} / 3</b>hearts left</span></div><div class="button-row">${result.won?button(route.level===LEVELS.length?'Enjoy our picnic ♡':'Next adventure →',route.level===LEVELS.length?'?view=picnic':playURL(route.level+1)):`<button class="button" data-action="retry">Try this level again ↻</button>`}${result.won?'<button class="button secondary" data-action="retry">Replay for stars</button>':''}</div><a class="text-link" href="?view=levels">Adventure map</a></section>`;
    }
  }else if(['guest','pepper'].includes(route.view)){
    const pepper=route.view==='pepper',unlocked=pepper?save.pepperUnlocked:save.peeUnlocked,name=pepper?'Pepper':'Pee';
    title=`${unlocked?`You found ${name}!`:'A picnic friend is waiting'} · Pepsi & Pepper`;screen.classList.add('centered');
    screen.innerHTML=unlocked?`<section class="paper-panel guest-panel" aria-labelledby="guest-title"><button class="guest-close" data-action="close-guest" aria-label="Close friend reveal">×</button><span class="small-tag">${pepper?'EVERY ADVENTURE NEEDS A PARTNER IN CRIME.':'THREE GOLDEN PAW PRINTS. ONE LITTLE SURPRISE.'}</span><canvas id="friend-portrait" width="280" height="320" class="guest-portrait" role="img" aria-label="${name}, a ${pepper?'gray':'butter-yellow'} and white plushie corgi"></canvas><h2 id="guest-title">${pepper?'Pepper joins the adventure!':'You found Pee!'}</h2><p>${pepper?'Pepsi’s favorite partner in snack-related crime.<br>Pepper joins the blanket from level 4.':'A little ray of sunshine followed the golden crumbs.<br>He’s joining the crew from level 5. ♡'}</p><button class="button" data-action="close-guest">Back to our adventure →</button><p class="guest-saved">${storageProblem?'Download a backup to keep your new friend safe.':`${name} will be here whenever you come back.`}</p></section>`:`<section class="paper-panel guest-panel"><button class="guest-close" data-action="close-guest" aria-label="Close friend reveal">×</button><span class="symbol">${pepper?'♡':'✧'}</span><span class="small-tag">A FRIEND IS WAITING</span><h2>${pepper?'Let’s find Pepper.':'A secret picnic guest.'}</h2><p>${pepper?'Finish level 3 to bring Pepper on the adventure.':`Collect a golden biscuit on three different levels from level 5 onward.<br><b>${save.goldenLevels.length} / 3 golden paw prints found.</b>`}</p>${button('Continue the adventure →',playURL(nextOpen(save)))}</section>`;
    if(unlocked){const c=$('friend-portrait').getContext('2d');c.scale(2,2);drawCorgi(c,70,148,120,pepper?'pepper':'pee',true,0,true);}screen.querySelector('.guest-close')?.focus({preventScroll:true});
  }else if(route.view==='picnic'){
    title='Our happy little picnic · Pepsi & Pepper';
    screen.innerHTML=`<section class="picnic-note"><span class="small-tag">${save.completed.length===LEVELS.length?'TEN ADVENTURES. SO MUCH LOVE.':'THERE’S ALWAYS A SPOT FOR YOU.'}</span><h2>My favorite place is with you.</h2><p>Through the snacks, the socks,<br>and all our little adventures.</p><div class="button-row">${button(save.completed.length===LEVELS.length?'Another little adventure ↻':'Keep adventuring →',save.completed.length===LEVELS.length?'?view=levels':playURL(nextOpen(save)))}</div><a class="text-link" href="./">Back to our meadow</a></section>${names()}`;
  }
  document.title=title;soundMarkup();renderNav();paintIcons();resize();draw(performance.now());
  $('pause').setAttribute('aria-label',run?.status==='playing'?'Pause game':'Resume game');
}
function renderPlayPanel(){
  if(run.status==='playing'){screen.innerHTML='';screen.classList.remove('centered');return;}
  screen.classList.add('centered');const resumed=run.status==='paused'&&run.elapsed>0;
  const config=['won','lost'].includes(run.status)?LEVELS[route.level-1]:configFor(run),classic=run.rules==='classic'&&!['won','lost'].includes(run.status);
  const hint=!resumed&&!classic&&route.level>=5&&!save.peeUnlocked?`<p class="secret-hint">Golden mystery: ${save.goldenLevels.length} / 3 paw prints. Look for one on each level.</p>`:'';
  screen.innerHTML=`<section class="paper-panel ready-panel" aria-label="${resumed?'Paused game':'Ready to play'}"><span class="small-tag">LEVEL ${route.level} OF ${LEVELS.length} · ${config.name.toUpperCase()}</span><h2>${resumed?'A little pause.':'Ready, brave little paws?'}</h2><p>${resumed?'Your snacks, hearts, and time are right where you left them.':`${config.line||'Finish your saved picnic, then try the new adventure.'}<br>Keep <b>${config.goal} treats</b> in <b>${config.duration} seconds</b>.`}</p>${!resumed&&!classic?`<div class="ready-rules"><span>♥ ♥ ♥ <b>Three hearts</b></span><span>${config.hazards.map(type=>HAZARD_INFO[type].name).join(' · ')}</span></div>`:''}${classic?'<p class="secret-hint">Your saved round keeps its original rules.</p>':hint}<button class="button" data-action="start">${resumed?'Back to the adventure →':'Let’s do this →'}</button><br><a class="text-link" href="?view=levels">Adventure map</a></section>`;
}
function startRound(){
  if(!isLevelOpen(save,route.level))return;
  const focus=run?.status==='paused'&&returnFocus?.isConnected?returnFocus:canvas;
  if(!run||['won','lost'].includes(run.status)){run=createRun(route.level);save.runs[route.level]=run;}
  run.status='playing';wakeAudio();lastFrame=performance.now();
  if(route.paused){history.replaceState({},'',playURL(route.level));route=readRoute(location.search);}
  renderPlayPanel();updateHUD();$('pause').setAttribute('aria-label','Pause game');focus.focus({preventScroll:true});persist();announce(`Level ${route.level}. Keep ${configFor(run).goal} treats and dodge hazards. Three hearts. Go!`);
}
function pauseGame(){if(route.view!=='play'||run?.status!=='playing')return;returnFocus=document.activeElement;pauseRun();history.replaceState({},'',playURL(route.level,true));route=readRoute(location.search);renderPlayPanel();$('pause').setAttribute('aria-label','Resume game');screen.querySelector('button')?.focus({preventScroll:true});announce('Adventure paused.');}
function closeGuest(){
  if(!['guest','pepper'].includes(route.view))return;
  const friendView=route.view;
  if(route.from==='play'&&run){if(['won','lost'].includes(run.status))go(`?view=result&level=${route.level}`);else{go(playURL(route.level,true));startRound();}}
  else if(route.from==='result'){go(`?view=result&level=${route.level}`);screen.querySelector('.button')?.focus({preventScroll:true});}
  else{go(route.from==='picnic'?'?view=picnic':route.from==='levels'?'?view=levels':'./');document.querySelector(`[data-friend-link][href*="view=${friendView}"]`)?.focus({preventScroll:true});}
}
function finishRound(foundPee=false){
  const foundPepper=finishRun(save,run),level=run.level;persist();if(run.status==='won')chime('win');
  announce(run.status==='won'?`Level ${level} complete! ${run.caught} treats kept.`:'Time for a do-over. Your completed levels are safe.');
  if(foundPee)go(`?view=guest&level=${level}&from=play`);
  else if(foundPepper)go(`?view=pepper&level=${level}&from=result`);
  else go(`?view=result&level=${level}`);
}
function setText(id,value){const el=$(id),text=String(value);if(el.textContent!==text)el.textContent=text;}
function updateHUD(){
  if(!run)return;const config=configFor(run);setText('caught',run.caught);setText('goal',config.goal);setText('time',`${Math.max(0,Math.ceil(config.duration-run.elapsed))}s`);setText('level-name',config.name);
  $('progress-fill').style.width=`${Math.min(100,run.caught/config.goal*100)}%`;
  const hearts='♥'.repeat(run.hearts)+'♡'.repeat(3-run.hearts);setText('hearts',hearts);$('hearts').setAttribute('aria-label',`${run.hearts} of 3 hearts remaining`);
  const effects=[];if(run.rules==='classic')effects.push('Finishing your saved picnic');
  if(run.mudUntil>run.elapsed)effects.push(`Muddy paws: ${Math.ceil(run.mudUntil-run.elapsed)}s`);
  if(run.frightUntil>run.elapsed)effects.push(`Tiny blanket: ${Math.ceil(run.frightUntil-run.elapsed)}s`);
  if(gust(run))effects.push('Breezy! Watch the drift');
  $('golden-progress').hidden=run.level<5||save.peeUnlocked;
  setText('golden-count',`${save.goldenLevels.length}/3`);
  $('golden-progress').setAttribute('aria-label',`${save.goldenLevels.length} of 3 golden paw prints found`);
  setText('effect-status',effects.join(' · '));
}
function toast(message,now,bad=false){$('catch-message').textContent=message;$('catch-message').classList.toggle('bad',bad);$('catch-message').classList.add('visible');messageUntil=now+(bad?2200:1600);}

document.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]');
  if(action){if(action.dataset.action==='start')startRound();if(action.dataset.action==='retry'&&isLevelOpen(save,route.level)){run=createRun(route.level);save.runs[route.level]=run;persist();go(playURL(route.level));}if(action.dataset.action==='backup')backup();if(action.dataset.action==='close-guest')closeGuest();return;}
  const link=event.target.closest('a[href]');if(!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.download)return;
  const url=new URL(link.href);if(url.origin!==location.origin||url.pathname!==location.pathname)return;event.preventDefault();
  if(url.searchParams.get('view')==='help'){url.searchParams.set('from',route.view);url.searchParams.set('level',String(route.level));}
  if(`${url.pathname}${url.search}`!==`${location.pathname}${location.search}`)go(url);
});
$('pause').addEventListener('click',()=>run?.status==='playing'?pauseGame():startRound());
let backdropDown=false;screen.addEventListener('pointerdown',event=>{backdropDown=event.target===screen;});
screen.addEventListener('click',event=>{if(backdropDown&&event.target===screen){if(route.view==='play'&&run?.status==='paused')startRound();if(['guest','pepper'].includes(route.view))closeGuest();}backdropDown=false;});
document.addEventListener('change',async event=>{
  if(event.target.id!=='restore')return;const file=event.target.files?.[0];if(!file)return;
  try{if(file.size>1000000)throw new Error('File too large');const incoming=parseSave(await file.text());
    save.completed=[...new Set([...save.completed,...incoming.completed])];save.results={...incoming.results,...save.results};save.runs={...incoming.runs,...save.runs};
    for(const [level,stars]of Object.entries(incoming.stars))save.stars[level]=Math.max(save.stars[level]||0,stars);
    save.goldenLevels=[...new Set([...save.goldenLevels,...incoming.goldenLevels])];save.pepperUnlocked ||= incoming.pepperUnlocked;save.peeUnlocked ||= incoming.peeUnlocked||save.goldenLevels.length>=3;
    if(persist()){renderNav();announce('Adventure restored. Your current rounds and friends were kept.');}
  }catch{announce('That backup could not be read. Your current adventure has not changed.');}event.target.value='';
});
function point(event){if(route.view!=='play'||run?.status!=='playing')return;const bounds=canvas.getBoundingClientRect();run.target=clamp((event.clientX-bounds.left)/bounds.width,basketWidth()/2,1-basketWidth()/2);}
canvas.addEventListener('pointerdown',event=>{if(run?.status!=='playing'||route.view!=='play')return;event.preventDefault();pointerId=event.pointerId;canvas.setPointerCapture(pointerId);point(event);canvas.focus({preventScroll:true});});
canvas.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'||pointerId===event.pointerId)point(event);});canvas.addEventListener('pointerup',event=>{if(pointerId===event.pointerId)pointerId=null;});canvas.addEventListener('pointercancel',()=>{pointerId=null;});
document.addEventListener('keydown',event=>{
  if(event.altKey||event.metaKey||event.ctrlKey||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
  if(route.view!=='play'){if(event.key==='Escape'&&['guest','pepper'].includes(route.view)){event.preventDefault();closeGuest();}else if(event.key==='Escape'&&['help','levels'].includes(route.view))go(route.from==='play'?playURL(route.level,true):'./');return;}
  if(['Escape','p','P'].includes(event.key)){event.preventDefault();if(event.repeat)return;if(run?.status==='playing')pauseGame();else if(run?.status==='paused')startRound();}
  if(['ArrowLeft','ArrowRight','a','A','d','D'].includes(event.key)&&run?.status==='playing'){event.preventDefault();keys.add(event.key.toLowerCase());}
});
document.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();pauseGame();});document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});
window.addEventListener('pagehide',()=>{pauseRun();persist();});window.addEventListener('popstate',()=>{pauseRun();route=readRoute(location.search);render();});
window.addEventListener('storage',event=>{
  if(event.key===PEE_KEY&&event.newValue==='unlocked'){save.peeUnlocked=true;pauseRun();render();return;}
  if(event.key!==KEY||!event.newValue)return;
  try{const incoming=parseSave(event.newValue);incoming.peeUnlocked ||= save.peeUnlocked;incoming.pepperUnlocked ||= save.pepperUnlocked;if(run?.status==='playing')run.status='paused';save=incoming;render();announce('Adventure updated from another tab. Tap to resume.');}
  catch{showSaveProblem('Another tab saved unreadable progress. Your current adventure is still here; download a backup.');}
});
function resize(){const bounds=stage.getBoundingClientRect();width=bounds.width;height=bounds.height;const ratio=Math.min(devicePixelRatio||1,2);stage.style.setProperty('--picnic-names-width',width<600?'234px':'336px');canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);}
new ResizeObserver(resize).observe(stage);
function draw(now){
  const time=now/1000,playing=route.view==='play'&&run&&isLevelOpen(save,route.level),crew=currentCrew();ctx.clearRect(0,0,width,height);
  drawMeadow(ctx,width,height,time,reduced.matches,playing?run.level:1,playing&&!!gust(run));
  if(playing){drawBasket(ctx,width,height,run,basketWidth(),time,now<happyUntil,reduced.matches,crew);
    for(const drop of run.drops)drawTreat(ctx,drop.type,drop.x*width,drop.y*height,clamp(width*.035,22,29),drop.rotation);
    for(const p of particles){const age=(now-p.start)/1000;if(age>.8)continue;ctx.globalAlpha=1-age/.8;drawHeart(ctx,p.x*width+p.dx*age,CATCH_Y*height-age*60,4.5,'#c77d73');ctx.globalAlpha=1;}
  }else drawPicnic(ctx,width,height,save.completed.length,time,reduced.matches,route.view==='picnic'||(route.view==='result'&&save.results[route.level]?.won),crew);
}
function frame(now){
  const dt=Math.min((now-(lastFrame||now))/1000,.05);lastFrame=now;
  if(route.view==='play'&&run?.status==='playing'){
    const direction=(keys.has('arrowright')||keys.has('d')?1:0)-(keys.has('arrowleft')||keys.has('a')?1:0);if(direction)run.target=clamp(run.target+direction*dt*1.35,basketWidth()/2,1-basketWidth()/2);
    const events=advance(run,dt,baseWidth());let foundPee=false;
    if(events.caught.length){
      happyUntil=now+650;
      if(!reduced.matches)for(const drop of events.caught)for(let i=0;i<3;i++)particles.push({x:drop.x,dx:(i-1)*24,start:now});
      if(events.caught.some(drop=>drop.type==='golden')){const previous=save.goldenLevels.length;foundPee=collectGolden(save,run);if(!foundPee&&!save.peeUnlocked)toast(save.goldenLevels.length>previous?`A golden paw print! ${save.goldenLevels.length}/3 found.`:'This paw print is already in your collection.',now);}
      else if(run.caught%5===0)toast(['Excellent snack judgment.','Definitely not a sock. ♡','The corgis approve.'][Math.floor(run.caught/5)%3],now);
      chime();persist();
    }
    if(events.hits.length){happyUntil=0;const message=HAZARD_INFO[events.hits.at(-1).type].message;toast(message,now,true);announce(`${message} ${run.hearts} hearts remaining.`);chime('oops');persist();}
    sinceSave+=dt;if(sinceSave>.5){sinceSave=0;persist();}updateHUD();
    if(events.finished)finishRound(foundPee);
    else if(foundPee){returnFocus=canvas;chime('win');persist();go(`?view=guest&level=${run.level}&from=play`);announce('You found Pee! Your round is paused.');}
  }
  if(now>messageUntil)$('catch-message').classList.remove('visible');particles=particles.filter(p=>now-p.start<800);draw(now);requestAnimationFrame(frame);
}
render();requestAnimationFrame(frame);
