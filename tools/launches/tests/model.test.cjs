const { test } = require('node:test');
const assert = require('node:assert/strict');
global.crypto ||= require('node:crypto').webcrypto;
const M = require('../model.js');
test('distribution medium is separate from whether NextCard owns the channel', () => {
  for (const [name, url, expected] of [
    ['r/nextcard', 'https://www.reddit.com/r/nextcard/', 'reddit'],
    ['NextCard — email newsletter', '', 'email'],
    ['Instagram — NextCard', 'https://www.instagram.com/findyournextcard/', 'instagram'],
    ['Threads — John Ta', '', 'threads'],
    ['NextCard — website / existing tool', '', 'website'],
  ]) assert.equal(M.medium({ ...M.newChannel(), name, url, kind: 'owned' }), expected);
  assert.equal(M.medium({ ...M.newChannel(), kind: 'outreach' }), 'email');
});
test('duplicating keeps reusable planning but resets every execution result', () => {
  const original = M.newLaunch('owner@example.com'); original.name = 'Synthetic launch'; original.dueDate = '2026-10-18'; original.status = 'complete'; original.notes = 'Old results'; original.checks.push({ id: 'saved-check', label: 'Earlier custom item', stage: 'prepare', done: true, owner: '' });
  original.materials.push({ id: M.uid(), name: 'Reference', url: 'https://example.com/' });
  original.tasks.push({ ...M.addTask({ key: 'group', value: { name: 'Group', kind: 'reddit' } }), status: 'live', draft: 'Already published', liveUrl: 'https://example.com/post', outcome: 'Old outcome', angle: 'Useful angle', activityAt: Date.now() });
  const copy = M.duplicate(original);
  assert.equal(copy.status, 'active'); assert.equal(copy.notes, ''); assert.equal(copy.dueDate, ''); assert.ok(copy.checks.every(check => !check.done)); assert.equal(copy.tasks[0].angle, 'Useful angle');
  assert.equal(copy.tasks[0].status, 'draft'); assert.equal(copy.tasks[0].draft, ''); assert.equal(copy.tasks[0].activityAt, 0); assert.equal(copy.tasks[0].outcome, ''); assert.equal(copy.tasks[0].liveUrl, ''); assert.notEqual(copy.checks[0].id, original.checks[0].id); assert.equal(original.tasks[0].status, 'live');
});
test('a tag match remains conditional until rules are checked and recent', () => {
  const channel = { ...M.newChannel(), kind: 'reddit', tags: ['chase', 'csr'] }, launch = { ...M.newLaunch(), tags: ['csr'] };
  assert.equal(M.suggestion(channel, launch).group, 'maybe'); channel.ruleStatus = 'verified'; channel.verifiedDate = '2026-10-15';
  assert.equal(M.suggestion(channel, launch, Date.parse('2026-10-16')).group, 'recommended');
  assert.equal(M.suggestion(channel, launch, Date.parse('2027-03-16')).group, 'maybe');
  channel.tags = ['united']; assert.equal(M.suggestion(channel, launch).group, 'skip');
});
test('approval, submission, and ready states do not count as completed distribution', () => {
  for (const status of ['draft', 'ready', 'submitted', 'waiting']) assert.equal(M.done({ status }), false);
  for (const status of ['live', 'sent', 'skipped']) assert.equal(M.done({ status }), true);
});
test('history records meaningful channel activity, and unsafe links are never made clickable', () => {
  const task = { ...M.addTask({ key: 'group', value: { name: 'Group', kind: 'reddit' } }), activityAt: 50 };
  assert.equal(M.history('group', [{ key: 'launch', value: { name: 'Past launch', tasks: [task] } }]).length, 1);
  assert.equal(M.history('group', [{ key: 'launch', value: { name: 'Past launch', tasks: [task] } }], 'launch').length, 0);
  assert.equal(M.safeUrl('javascript:alert(1)'), ''); assert.equal(M.safeUrl('https://user:pass@example.com/'), '');
});

 test('new launches have no generated workflow items and exported checklists contain only chosen channels', () => {
  const value = M.newLaunch(); assert.deepEqual(value.checks, []);
  value.tasks.push(M.addTask({ key: 'group', value: { name: 'Example group', kind: 'reddit' } }));
  value.checks.push({ label: 'Earlier custom item', stage: 'prepare', done: false });
  assert.match(M.ticket(value), /- \[ \] Example group/); assert.doesNotMatch(M.ticket(value), /Preparation|Follow-up|Earlier custom item/);
});


test('posting assignments start blank, copy into checklists, and survive reusable launch duplication', () => {
  const launch = M.newLaunch(), task = M.addTask({ key: 'account-channel', value: { name: 'Synthetic destination', kind: 'reddit' } });
  assert.equal(task.postingAs, ''); task.postingAs = 'Jenny / @synthetic-poster'; launch.tasks.push(task);
  assert.match(M.ticket(launch), /Synthetic destination — Jenny \/ @synthetic-poster/);
  const duplicated = M.duplicate(launch); assert.equal(duplicated.tasks[0].postingAs, task.postingAs);
  duplicated.tasks[0].postingAs = 'Andrew'; assert.equal(task.postingAs, 'Jenny / @synthetic-poster');
});
