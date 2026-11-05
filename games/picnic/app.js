import { LEVELS, TYPES, CATCH_Y, clamp, createRun, advance, blankSave, parseSave, readRoute } from './engine.mjs';
import { drawMeadow, drawPicnic, drawBasket, drawTreat, drawHeart } from './art.mjs';

const $ = id => document.getElementById(id);
const canvas = $('scene');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const screen = $('screen');
const KEY = 'pepsi-pepper-picnic-v1';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let save = blankSave();
let route = readRoute(location.search);
let storageProblem = false;
let corruptSave = null;
let width = 900, height = 440, ratio = 1;
let run = null, pointerId = null, lastFrame = 0, sinceSave = 0;
let happyUntil = 0, messageUntil = 0, particles = [], audio = null;
const keys = new Set();
let returnFocus = null;

function showSaveProblem(message) {
  storageProblem = true;
  $('save-warning').hidden = false;
  $('save-message').textContent = message;
  $('save-status').textContent = 'Progress has not been saved. Keep this tab open.';
}
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try { save = parseSave(raw); }
    catch { corruptSave = raw; showSaveProblem('Your previous save could not be read. It is still intact; download a backup before starting fresh.'); }
  }
} catch { showSaveProblem('This browser could not load saved progress. You can still play; download a backup to keep it.'); }

function persist(explicit = false) {
  if (corruptSave && !explicit) return false;
  try {
    // Never overwrite an unreadable previous save without keeping a recovery copy.
    if (corruptSave) localStorage.setItem(`${KEY}-recovery`, corruptSave);
    localStorage.setItem(KEY, JSON.stringify(save));
    corruptSave = null;
    storageProblem = false;
    $('save-warning').hidden = true;
    $('save-status').textContent = 'Your picnic is saved on this device.';
    return true;
  } catch {
    showSaveProblem('Your browser could not save this picnic. Keep this tab open or download your progress.');
    return false;
  }
}
function announce(message) { $('announcement').textContent = message; }
function backup() {
  const blob = new Blob([JSON.stringify({ ...save, ...(corruptSave ? { previousUnreadableSave: corruptSave } : {}) }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');a.href = url;a.download = 'pepsi-and-pepper-picnic.json';a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('retry-save').addEventListener('click', () => { if (persist(true)) announce('Your picnic is saved.'); });
$('backup').addEventListener('click', backup);

function playURL(level, paused = false) { return `?view=play&level=${level}${paused ? '&paused=1' : ''}`; }
function currentURL() { return `${location.pathname}${location.search}`; }
function pauseRun() {
  keys.clear();pointerId = null;
  if (run?.status === 'playing') { run.status = 'paused'; persist(); }
}
function go(url, replace = false) {
  pauseRun();
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  route = readRoute(location.search);
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function soundMarkup() {
  $('sound').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4Z"/>${save.sound ? '<path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>' : '<path d="m16 9 5 6m0-6-5 6"/>'}</svg>`;
  $('sound').setAttribute('aria-label', `Turn sound ${save.sound ? 'off' : 'on'}`);
  $('sound').setAttribute('aria-pressed', String(save.sound));
}
function wakeAudio() {
  if (!save.sound) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) { audio ||= new Audio();audio.resume().catch(() => {}); }
  } catch { /* Audio is optional; the game remains playable. */ }
}
function chime(won = false) {
  if (!save.sound || !audio || audio.state !== 'running') return;
  const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [660 + Math.random() * 140];
  notes.forEach((frequency, i) => {
    const osc = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + i * .1;
    osc.type = 'sine';osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);gain.gain.linearRampToValueAtTime(.055, start + .012);gain.gain.exponentialRampToValueAtTime(.001, start + .2);
    osc.connect(gain);gain.connect(audio.destination);osc.start(start);osc.stop(start + .22);
  });
}
$('sound').addEventListener('click', () => { save.sound = !save.sound; wakeAudio();soundMarkup();persist();chime(); });

function basketWidth() { return clamp(180 / width, .23, .46); }
function nextLevel() { return LEVELS.findIndex((_, i) => !save.completed.includes(i + 1)) + 1 || 1; }
function names() { return '<div class="name-labels" aria-hidden="true"><span>Pepsi</span><span>Pepper</span></div>'; }
function button(label, url, secondary = false) { return `<a class="button${secondary ? ' secondary' : ''}" href="${url}">${label}</a>`; }
function renderNav() {
  $('level-nav').innerHTML = LEVELS.map((level, i) => `${i ? '<span class="join" aria-hidden="true"></span>' : ''}<a href="${playURL(i + 1)}" data-number="${i + 1}" ${['play', 'result'].includes(route.view) && route.level === i + 1 ? 'aria-current="step"' : ''} class="${save.completed.includes(i + 1) ? 'completed' : ''}" aria-label="Level ${i + 1}: ${level.name}${save.completed.includes(i + 1) ? ', completed' : ''}"><span class="level-short">${level.short}</span></a>`).join('');
}
function render() {
  document.body.dataset.view = route.view;
  run = save.runs[route.level] || null;
  particles = [];keys.clear();
  const playing = route.view === 'play';
  document.body.classList.toggle('playing', playing);
  canvas.style.touchAction = playing ? 'none' : 'auto';
  canvas.setAttribute('aria-label', playing ? 'Catch treats: drag the blanket, move your mouse, or use left and right arrow keys. Press P or Escape to pause.' : 'Pepsi and Pepper, two plushie corgis, sitting beside their picnic basket in a sunny meadow.');
  $('hud').hidden = !playing;
  $('catch-message').classList.remove('visible');
  screen.className = 'screen';
  $('scene-label').textContent = playing ? `LEVEL ${route.level} OF 5 · ${LEVELS[route.level - 1].name.toUpperCase()}` : '☀ A PERFECT DAY FOR A PICNIC';
  $('scene-detail').textContent = playing ? 'YOU’VE GOT THIS ♡' : 'EST. WITH LOVE';
  $('control-hint').textContent = playing ? (matchMedia('(pointer: coarse)').matches ? 'Drag the blanket to catch treats · No lives to lose ♡' : 'Move your mouse or use ← → · P to pause') : 'A tiny game for your favorite kind of day.';
  let title = 'Pepsi & Pepper’s Picnic';
  if (route.view === 'home') {
    const ongoing = Object.values(save.runs).find(item => ['playing', 'paused'].includes(item.status));
    const startLevel = ongoing?.level || nextLevel();
    screen.innerHTML = `<div class="welcome"><span class="small-tag">A POCKET-SIZED HAPPY PLACE</span><h2>A basketful of happy.</h2><p>Pepsi and Pepper have brought the blanket.<br>You bring the treats.</p>${button(ongoing ? 'Continue your picnic <span aria-hidden="true">→</span>' : 'Let’s picnic <span aria-hidden="true">→</span>', playURL(startLevel))}<br><a class="text-link" href="?view=levels">${save.completed.length ? `${save.completed.length} of 5 picnics complete · Pick a level` : '5 little levels · Take it at your own pace'}</a></div>${names()}`;
  } else if (route.view === 'levels') {
    title = 'Choose a picnic · Pepsi & Pepper';
    screen.classList.add('centered');
    screen.innerHTML = `<section class="paper-panel level-panel" aria-label="Choose a level"><span class="small-tag">FIVE LITTLE ADVENTURES</span><h2>Pick your picnic.</h2><p>Start slow, or hop ahead. Every level gets a little quicker.</p><div class="level-list">${LEVELS.map((level, i) => `<a class="level-card" href="${playURL(i + 1)}"><span class="level-number">${i + 1}</span><span><strong>${level.name}</strong><small>${level.goal} treats · ${i === 0 ? 'Nice and gentle' : i === 4 ? 'A happy little challenge' : 'A little more speedy'}</small></span><span class="level-check" aria-label="${save.completed.includes(i + 1) ? 'Completed' : 'Play'}">${save.completed.includes(i + 1) ? '✓' : '→'}</span></a>`).join('')}</div><a class="text-link" href="./">Back to our meadow</a></section>`;
  } else if (route.view === 'help') {
    title = 'How to play · Pepsi & Pepper';
    screen.classList.add('centered');
    const back = route.from === 'play' ? playURL(route.level, true) : route.from === 'levels' ? '?view=levels' : './';
    screen.innerHTML = `<section class="paper-panel" aria-label="How to play"><span class="small-tag">SMALL PAWS. SIMPLE RULES.</span><h2>Let’s make a picnic.</h2><ul class="help-list"><li><span class="help-icon">↔</span><span><b>Move the blanket.</b> Drag anywhere in the meadow on your phone. On a computer, move your mouse or use <kbd>←</kbd> <kbd>→</kbd>.</span></li><li><span class="help-icon">🍓</span><span><b>Catch the goodies.</b> Collect the target number before 30 seconds are up. Every treat counts the same.</span></li><li><span class="help-icon">♡</span><span><b>No stress, no lost lives.</b> Missed the target? Try that level again. There are five increasingly speedy picnics.</span></li><li><span class="help-icon">☀</span><span><b>Take a little break.</b> Press pause, P, or Escape. Your round and completed levels stay saved in this browser.</span></li></ul>${button('Got it, let’s go', back)}<div><button class="text-link" data-action="backup" style="background:none">Back up progress</button><label class="text-link" style="cursor:pointer" for="restore">Restore backup</label><input id="restore" type="file" accept="application/json,.json" class="sr-only"></div></section>`;
  } else if (playing) {
    title = `${LEVELS[route.level - 1].name} · Pepsi & Pepper`;
    if (!run) { run = createRun(route.level);save.runs[route.level] = run; }
    // A copied link and refresh restore the saved round, safely waiting for a tap.
    if (run.status === 'playing') run.status = 'paused';
    save.lastLevel = route.level;
    updateHUD();
    renderPlayPanel();
  } else if (route.view === 'result') {
    title = 'Picnic break · Pepsi & Pepper';
    screen.classList.add('centered');
    const result = save.results[route.level];
    if (!result) {
      screen.innerHTML = `<section class="paper-panel"><span class="symbol">♡</span><h2>A picnic is waiting.</h2><p>This browser hasn’t played this round yet. Pepsi and Pepper saved you a spot.</p>${button('Play this level', playURL(route.level))}</section>`;
    } else {
      const config = LEVELS[route.level - 1];
      screen.innerHTML = `<section class="paper-panel"><span class="symbol">${result.won ? '♡' : '☀'}</span><span class="small-tag">${result.won ? `LEVEL ${route.level} · PICNIC PERFECT` : 'A LITTLE BREATHER'}</span><h2>${result.won ? ['A lovely little start!', 'Two very happy corgis.', 'Looking picnic perfect!', 'So many happy wiggles!', 'You did it, picnic pal!'][route.level - 1] : 'Another little go?'}</h2><p>${result.won ? 'Pepsi and Pepper approve. With their whole little hearts.' : 'Even the best picnics take a little practice. Your other levels are safe.'}</p><div class="result-stats"><span><b>${result.caught} / ${config.goal}</b>treats caught</span><span><b>${Math.ceil(result.elapsed)}s</b>of picnic fun</span></div><div class="button-row">${result.won ? button(route.level === 5 ? 'Enjoy our picnic ♡' : 'Next picnic →', route.level === 5 ? '?view=picnic' : playURL(route.level + 1)) : `<button class="button" data-action="retry">Try this level again ↻</button>`}${result.won ? `<button class="button secondary" data-action="retry">Play again</button>` : ''}</div><a class="text-link" href="?view=levels">Pick a different level</a></section>`;
    }
  } else if (route.view === 'picnic') {
    title = 'Our happy little picnic · Pepsi & Pepper';
    const done = save.completed.length;
    screen.innerHTML = `<section class="picnic-note"><span class="small-tag">${done === 5 ? 'FIVE LITTLE LEVELS. SO MUCH LOVE.' : 'THERE’S ALWAYS A SPOT FOR YOU.'}</span><h2>My favorite place is with you.</h2><p>Here’s to all our little adventures.<br>And all the snacks along the way.</p><div class="button-row">${button('Another little picnic ↻', '?view=levels')}${done < 5 ? button('Keep collecting →', playURL(nextLevel()), true) : ''}</div><a class="text-link" href="./">Back to our meadow</a></section>${names()}`;
  }
  document.title = title;
  soundMarkup();renderNav();resize();
  $('pause').setAttribute('aria-label', run?.status === 'playing' ? 'Pause game' : 'Resume game');
}

function renderPlayPanel() {
  if (run.status === 'playing') { screen.innerHTML = '';screen.classList.remove('centered');return; }
  screen.classList.add('centered');
  const resumed = ['paused', 'playing'].includes(run.status) && run.elapsed > 0;
  const config = LEVELS[route.level - 1];
  screen.innerHTML = `<section class="paper-panel" aria-label="${resumed ? 'Paused game' : 'Ready to play'}"><span class="symbol">${resumed ? '☀' : '♡'}</span><span class="small-tag">LEVEL ${route.level} OF 5 · ${config.name.toUpperCase()}</span><h2>${resumed ? 'A little pause.' : 'Ready, picnic pal?'}</h2><p>${resumed ? 'Your blanket is right where you left it.<br>Pepsi and Pepper will wait for you.' : `${config.line}<br>Catch <b>${config.goal} treats</b> in <b>30 seconds</b>.`}</p><button class="button" data-action="start">${resumed ? 'Back to the picnic →' : 'Let’s catch some treats →'}</button><br><a class="text-link" href="?view=levels">Pick a different level</a></section>`;
}
function startRound() {
  const focusAfterResume = run?.status === 'paused' && returnFocus?.isConnected ? returnFocus : canvas;
  if (!run || ['won', 'lost'].includes(run.status)) { run = createRun(route.level);save.runs[route.level] = run; }
  run.status = 'playing';wakeAudio();lastFrame = performance.now();
  if (route.paused) { history.replaceState({}, '', playURL(route.level));route = readRoute(location.search); }
  renderPlayPanel();$('pause').setAttribute('aria-label', 'Pause game');
  focusAfterResume.focus({ preventScroll: true });persist();
  announce(`Level ${route.level}. Catch ${LEVELS[route.level - 1].goal} treats. Go!`);
}
function pauseGame() {
  if (route.view !== 'play' || run?.status !== 'playing') return;
  returnFocus = document.activeElement;
  pauseRun();
  history.replaceState({}, '', playURL(route.level, true));route = readRoute(location.search);
  renderPlayPanel();$('pause').setAttribute('aria-label', 'Resume game');
  screen.querySelector('button')?.focus({ preventScroll: true });announce('Picnic paused. Your progress is saved.');
}
function finishRound() {
  save.results[route.level] = { caught: run.caught, elapsed: run.elapsed, won: run.status === 'won' };
  if (run.status === 'won') { if (!save.completed.includes(route.level)) save.completed.push(route.level);chime(true); }
  persist();
  announce(run.status === 'won' ? `Picnic complete! ${run.caught} treats caught.` : `${run.caught} treats caught. You can retry this level.`);
  go(`?view=result&level=${route.level}`);
}
function updateHUD() {
  if (!run) return;
  const config = LEVELS[run.level - 1];
  $('caught').textContent = run.caught;$('goal').textContent = config.goal;
  $('time').textContent = `${Math.max(0, Math.ceil(config.duration - run.elapsed))}s`;
  $('progress-fill').style.width = `${Math.min(100, run.caught / config.goal * 100)}%`;
  $('level-name').textContent = config.name;
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  if (action) {
    if (action.dataset.action === 'start') startRound();
    if (action.dataset.action === 'retry') { run = createRun(route.level);save.runs[route.level] = run;persist();go(playURL(route.level)); }
    if (action.dataset.action === 'backup') backup();
    return;
  }
  const link = event.target.closest('a[href]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.download) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname) return;
  event.preventDefault();
  if (url.searchParams.get('view') === 'help') {
    url.searchParams.set('from', route.view);url.searchParams.set('level', String(route.level));
  }
  if (`${url.pathname}${url.search}` !== currentURL()) go(url);
});
$('pause').addEventListener('click', () => run?.status === 'playing' ? pauseGame() : startRound());
let backdropDown = false;
screen.addEventListener('pointerdown', event => { backdropDown = event.target === screen; });
screen.addEventListener('click', event => {
  if (backdropDown && event.target === screen && route.view === 'play' && run?.status === 'paused') startRound();
  backdropDown = false;
});
document.addEventListener('change', async event => {
  if (event.target.id !== 'restore') return;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('File too large');
    const incoming = parseSave(await file.text());
    // Backups add completed picnics and only fill missing rounds; current work wins.
    save.completed = [...new Set([...save.completed, ...incoming.completed])];
    save.results = { ...incoming.results, ...save.results };
    save.runs = { ...incoming.runs, ...save.runs };
    if (persist()) { renderNav();announce('Picnic backup restored. Your current rounds were kept.'); }
  } catch { announce('That backup could not be read. Your current picnic has not changed.'); }
  event.target.value = '';
});

function point(event) {
  if (route.view !== 'play' || run?.status !== 'playing') return;
  const bounds = canvas.getBoundingClientRect();
  run.target = clamp((event.clientX - bounds.left) / bounds.width, basketWidth() / 2, 1 - basketWidth() / 2);
}
canvas.addEventListener('pointerdown', event => {
  if (run?.status !== 'playing' || route.view !== 'play') return;
  event.preventDefault();pointerId = event.pointerId;canvas.setPointerCapture(event.pointerId);point(event);canvas.focus({ preventScroll: true });
});
canvas.addEventListener('pointermove', event => { if (event.pointerType === 'mouse' || pointerId === event.pointerId) point(event); });
canvas.addEventListener('pointerup', event => { if (pointerId === event.pointerId) pointerId = null; });
canvas.addEventListener('pointercancel', () => { pointerId = null; });
document.addEventListener('keydown', event => {
  if (event.altKey || event.metaKey || event.ctrlKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (route.view !== 'play') {
    if (event.key === 'Escape' && ['help', 'levels'].includes(route.view)) go(route.from === 'play' ? playURL(route.level, true) : './');
    return;
  }
  if (['Escape', 'p', 'P'].includes(event.key)) {
    event.preventDefault();if (event.repeat) return;
    if (run?.status === 'playing') pauseGame();else if (run?.status === 'paused') { startRound();returnFocus?.focus({ preventScroll: true }); }
  }
  if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(event.key) && run?.status === 'playing') { event.preventDefault();keys.add(event.key.toLowerCase()); }
});
document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear();pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('pagehide', () => { pauseRun();persist(); });
window.addEventListener('popstate', () => { pauseRun();route = readRoute(location.search);render(); });
window.addEventListener('storage', event => {
  if (event.key !== KEY || !event.newValue) return;
  try {
    const incoming = parseSave(event.newValue);
    if (run?.status === 'playing') run.status = 'paused';
    save = incoming;render();announce('Picnic progress updated from another tab. Tap to resume.');
  } catch { showSaveProblem('Another tab saved unreadable progress. Your current picnic is still here; download a backup.'); }
});

function resize() {
  const bounds = stage.getBoundingClientRect();
  width = bounds.width;height = bounds.height;ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
new ResizeObserver(resize).observe(stage);
function draw(now) {
  const time = now / 1000;
  ctx.clearRect(0, 0, width, height);
  drawMeadow(ctx, width, height, time, reduced.matches);
  if (route.view === 'play' && run) {
    const bw = basketWidth();
    drawBasket(ctx, width, height, run, bw, time, now < happyUntil, reduced.matches);
    for (const drop of run.drops) drawTreat(ctx, drop.type, drop.x * width, drop.y * height, clamp(width * .035, 22, 29), drop.rotation);
    for (const particle of particles) {
      const age = (now - particle.start) / 1000;
      if (age > .8) continue;
      ctx.globalAlpha = 1 - age / .8;
      drawHeart(ctx, particle.x * width + particle.dx * age, CATCH_Y * height - age * 60, 4.5, '#c77d73');
      ctx.globalAlpha = 1;
    }
  } else {
    drawPicnic(ctx, width, height, save.completed.length, time, reduced.matches, route.view === 'picnic' || (route.view === 'result' && save.results[route.level]?.won));
  }
}
function frame(now) {
  const dt = Math.min((now - (lastFrame || now)) / 1000, .05);lastFrame = now;
  if (route.view === 'play' && run?.status === 'playing') {
    const direction = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
    if (direction) run.target = clamp(run.target + direction * dt * 1.1, basketWidth() / 2, 1 - basketWidth() / 2);
    const events = advance(run, dt, basketWidth());
    if (events.caught.length) {
      happyUntil = now + 650;
      if (!reduced.matches) for (const drop of events.caught) for (let i = 0; i < 3; i++) particles.push({ x: drop.x, dx: (i - 1) * 24, start: now });
      if (run.caught % 4 === 0) {
        $('catch-message').textContent = ['happy little tummies ♡', 'a very good catch!', 'Pepsi approves ♡', 'Pepper says thank you!'][Math.floor(run.caught / 4) % 4];
        $('catch-message').classList.add('visible');messageUntil = now + 1400;
      }
      chime();persist();
    }
    sinceSave += dt;
    if (sinceSave > .75) { sinceSave = 0;persist(); }
    updateHUD();
    if (events.finished) finishRound();
  }
  if (now > messageUntil) $('catch-message').classList.remove('visible');
  particles = particles.filter(p => now - p.start < 800);
  draw(now);requestAnimationFrame(frame);
}
render();requestAnimationFrame(frame);
