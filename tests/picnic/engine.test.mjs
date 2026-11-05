import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, advance, createRun, blankSave, parseSave, readRoute, validRun } from '../../games/picnic/engine.mjs';

test('all five levels can be won with real timed drops, including paired treats', () => {
  for (let level = 1; level <= 5; level++) {
    const run = createRun(level);run.status = 'playing';
    for (let tick = 0; tick < 2000 && run.status === 'playing'; tick++) advance(run, .02, .3, () => .5);
    assert.equal(run.status, 'won', `Level ${level} must be achievable`);
    assert.ok(run.caught >= LEVELS[level - 1].goal);
    assert.ok(run.elapsed < 30);
    assert.equal(Object.values(run.counts).reduce((a,b) => a+b,0), run.caught);
  }
});

test('speed increases at every level without changing the time limit', () => {
  for (let i = 1; i < LEVELS.length; i++) {
    assert.ok(LEVELS[i].fall < LEVELS[i-1].fall);
    assert.ok(LEVELS[i].interval < LEVELS[i-1].interval);
    assert.ok(LEVELS[i].goal > LEVELS[i-1].goal);
    assert.equal(LEVELS[i].duration, 30);
  }
});

test('misses are harmless until the timer ends; pause freezes the whole round', () => {
  const run = createRun(2);run.status = 'playing';run.basket = .15;run.target = .15;
  for (let i = 0; i < 200; i++) advance(run, .05, .23, () => .75);
  assert.equal(run.status, 'playing');assert.equal(run.caught, 0);
  assert.ok(run.missed > 0);
  run.status = 'paused';const snapshot = structuredClone(run);
  advance(run, 10, .23);assert.deepEqual(run, snapshot);
  run.status = 'playing';
  for (let i = 0; i < 1000; i++) advance(run, .05, .23, () => .75);
  assert.equal(run.status, 'lost');assert.equal(run.elapsed, 30);
});

test('restoring a mid-round save produces the same outcome as uninterrupted play', () => {
  const run = createRun(4);run.status = 'playing';
  for (let i = 0; i < 190; i++) advance(run, .02, .3, () => .5);
  const save = blankSave();save.runs[4] = run;save.completed = [1,2,3];
  const restored = parseSave(JSON.stringify(save));
  assert.ok(validRun(restored.runs[4], 4));
  for (let i = 0; i < 1500; i++) { advance(run, .02, .3, () => .5);advance(restored.runs[4], .02, .3, () => .5); }
  assert.deepEqual(restored.runs[4], run);
  assert.deepEqual(restored.completed, [1,2,3]);
});

test('catching is based on crossing the blanket line, not animation frame coincidences', () => {
  const run = createRun(1);run.status = 'playing';run.spawnIn = 10;
  run.drops = [{ id: 1, x: .5, y: .769, type: 'biscuit', rotation: 0 }, { id: 2, x: .95, y: .769, type: 'orange', rotation: 0 }];
  const events = advance(run, .05, .3);
  assert.equal(events.caught.length, 1);assert.equal(run.caught, 1);
  assert.equal(run.drops.length, 1);assert.equal(run.drops[0].type, 'orange');
  advance(run, .05, .3);assert.equal(run.caught, 1);
});

test('routes preserve level selection and validate unknown or malformed URLs', () => {
  assert.deepEqual(readRoute('?view=play&level=4&paused=1'), { view:'play', level:4, paused:true, from:'home' });
  assert.equal(readRoute('?level=3').view, 'play');
  assert.equal(readRoute('?view=levels').view, 'levels');
  assert.equal(readRoute('?view=help&from=play&level=2').from, 'play');
  assert.equal(readRoute('?view=anything&level=999').level, 5);
  assert.equal(readRoute('?view=play&level=not-a-number').level, 1);
});

test('unreadable saved work is rejected, not silently discarded', () => {
  assert.throws(() => parseSave('{bad json'));
  assert.throws(() => parseSave('{"version":2}'));
  const save = blankSave();save.runs[1] = createRun(1);save.runs[1].elapsed = -10;
  assert.throws(() => parseSave(JSON.stringify(save)));
  save.runs[1] = createRun(1);save.runs[1].drops.push({x: .5, y: .2, type: 'not-a-treat', rotation:0});
  assert.throws(() => parseSave(JSON.stringify(save)));
});
