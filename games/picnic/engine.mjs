export const LEVELS = Object.freeze([
  { name: 'A Little Snack', short: 'Little Snack', goal: 8, duration: 30, fall: 4.6, interval: 1.35, pairs: false, line: 'A slow, sunny start. Let’s find a few treats.' },
  { name: 'Hungry Corgis', short: 'Hungry Corgis', goal: 11, duration: 30, fall: 4.1, interval: 1.15, pairs: false, line: 'Two little tummies are ready for a little more.' },
  { name: 'Picnic Prep', short: 'Picnic Prep', goal: 14, duration: 30, fall: 3.6, interval: 1, pairs: false, line: 'The treats are picking up the pace!' },
  { name: 'Biscuit Bonanza', short: 'Biscuit Bonanza', goal: 17, duration: 30, fall: 3.1, interval: .88, pairs: true, line: 'A little quicker. A little more biscuit-y.' },
  { name: 'The Big Picnic', short: 'Big Picnic', goal: 20, duration: 30, fall: 2.7, interval: .76, pairs: true, line: 'One last happy flurry. Your picnic is almost ready.' },
]);
export const TYPES = ['strawberry', 'biscuit', 'orange'];
const DROP_TYPES = [...TYPES, 'golden'];
export const CATCH_Y = .77;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const levelNumber = value => clamp(Math.trunc(Number(value)) || 1, 1, LEVELS.length);

export function createRun(level) {
  return { level: levelNumber(level), elapsed: 0, spawnIn: .45, caught: 0, missed: 0, drops: [], basket: .5, target: .5, sequence: 0, goldenSpawned: false, peeFound: false, status: 'ready', counts: { strawberry: 0, biscuit: 0, orange: 0 } };
}

// Positions are fractions of the board, so the same round survives screen rotation.
export function advance(run, delta, basketWidth, random = Math.random) {
  if (run.status !== 'playing') return { caught: [], finished: false };
  const config = LEVELS[run.level - 1];
  const dt = clamp(delta, 0, .05);
  const events = { caught: [], finished: false };
  run.elapsed = Math.min(config.duration, run.elapsed + dt);
  run.basket += (run.target - run.basket) * Math.min(1, dt * 22);
  run.basket = clamp(run.basket, basketWidth / 2, 1 - basketWidth / 2);
  run.spawnIn -= dt;
  if (run.spawnIn <= 0 && run.elapsed < config.duration - config.fall * CATCH_Y) {
    const x = run.sequence === 0 ? .5 : .1 + random() * .8;
    // One discoverable surprise each round, only from level 2 onward.
    const golden = run.level >= 2 && run.sequence >= 4 && !run.goldenSpawned;
    const type = TYPES[Math.floor(random() * TYPES.length)];
    run.drops.push({ id: ++run.sequence, x, y: -.05, type: golden ? 'golden' : type, rotation: (random() - .5) * .7 });
    if (golden) run.goldenSpawned = true;
    if (config.pairs && run.sequence % 4 === 0) {
      run.drops.push({ id: ++run.sequence, x: clamp(x + (x > .5 ? -.12 : .12), .09, .91), y: -.15, type: 'biscuit', rotation: -.15 });
    }
    run.spawnIn += config.interval;
  }
  const remaining = [];
  for (const drop of run.drops) {
    const before = drop.y;
    drop.y += dt / config.fall;
    if (before < CATCH_Y && drop.y >= CATCH_Y && Math.abs(drop.x - run.basket) <= basketWidth * .5) {
      run.caught += 1;
      run.counts[drop.type === 'golden' ? 'biscuit' : drop.type] += 1;
      if (drop.type === 'golden') run.peeFound = true;
      events.caught.push({ ...drop });
    } else if (drop.y < 1.06) {
      remaining.push(drop);
    } else {
      run.missed += 1;
    }
  }
  run.drops = remaining;
  if (run.caught >= config.goal || run.elapsed >= config.duration) {
    run.status = run.caught >= config.goal ? 'won' : 'lost';
    events.finished = true;
  }
  return events;
}

export function validRun(run, level) {
  if (!run || run.level !== level || !['ready', 'playing', 'paused', 'won', 'lost'].includes(run.status)) return false;
  if (!Number.isFinite(run.elapsed) || run.elapsed < 0 || run.elapsed > 30 || !Number.isFinite(run.spawnIn)) return false;
  if (!Number.isInteger(run.caught) || run.caught < 0 || run.caught > 100 || !Number.isInteger(run.sequence) || run.sequence < 0) return false;
  if (!Number.isFinite(run.basket) || !Number.isFinite(run.target) || run.basket < 0 || run.basket > 1 || run.target < 0 || run.target > 1) return false;
  if (!Number.isInteger(run.missed) || run.missed < 0 || !Array.isArray(run.drops) || run.drops.length > 100) return false;
  if (!TYPES.every(type => Number.isInteger(run.counts?.[type]) && run.counts[type] >= 0 && run.counts[type] <= 100)) return false;
  if (['goldenSpawned', 'peeFound'].some(key => run[key] !== undefined && typeof run[key] !== 'boolean')) return false;
  if (level === 1 && (run.peeFound || run.drops.some(drop => drop.type === 'golden'))) return false;
  return run.drops.every(drop => DROP_TYPES.includes(drop.type) && Number.isFinite(drop.x) && drop.x >= 0 && drop.x <= 1 && Number.isFinite(drop.y) && drop.y >= -.2 && drop.y <= 1.1 && Number.isFinite(drop.rotation));
}

export function blankSave() { return { version: 1, runs: {}, results: {}, completed: [], sound: false, lastLevel: 1, peeUnlocked: false }; }

export function parseSave(raw) {
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !value.runs || !value.results || !Array.isArray(value.completed)) throw new Error('Unrecognized save');
  const save = blankSave();
  save.sound = value.sound === true;
  save.peeUnlocked = value.peeUnlocked === true;
  save.lastLevel = levelNumber(value.lastLevel);
  save.completed = [...new Set(value.completed.filter(n => Number.isInteger(n) && n >= 1 && n <= 5))];
  for (let level = 1; level <= 5; level++) {
    if (value.runs[level]) {
      if (!validRun(value.runs[level], level)) throw new Error('Incomplete round data');
      save.runs[level] = { ...value.runs[level], goldenSpawned: value.runs[level].goldenSpawned === true, peeFound: value.runs[level].peeFound === true };
      if (save.runs[level].peeFound) save.peeUnlocked = true;
    }
    const result = value.results[level];
    if (result) {
      if (!Number.isInteger(result.caught) || result.caught < 0 || result.caught > 100 || !Number.isFinite(result.elapsed) || result.elapsed < 0 || result.elapsed > 30 || typeof result.won !== 'boolean') throw new Error('Incomplete result data');
      save.results[level] = { caught: result.caught, elapsed: result.elapsed, won: result.won };
    }
  }
  return save;
}

export function readRoute(search) {
  const params = new URLSearchParams(search);
  const views = ['home', 'levels', 'help', 'play', 'result', 'picnic', 'guest'];
  const view = views.includes(params.get('view')) ? params.get('view') : params.has('level') ? 'play' : 'home';
  return { view, level: levelNumber(params.get('level')), paused: params.get('paused') === '1', from: views.includes(params.get('from')) ? params.get('from') : 'home' };
}
