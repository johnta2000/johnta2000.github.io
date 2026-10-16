const { test } = require('node:test');
const assert = require('node:assert/strict');
global.crypto ||= require('node:crypto').webcrypto;
const M = require('../model.js');
test('duplicating keeps reusable planning but resets every execution result', () => {
  const original = M.newLaunch('owner@example.com'); original.name = 'Synthetic launch'; original.dueDate = '2026-10-18'; original.status = 'complete'; original.notes = 'Old results'; original.checks.forEach(check => { check.done = true; });
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
