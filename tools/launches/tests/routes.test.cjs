const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../routes.js');

test('main views, media, archived channels, and launch-list filters round-trip through URLs', () => {
  for (const query of ['?view=channels', '?view=channels&medium=facebook', '?launch=launch-one&step=choose&medium=facebook', '?launch=launch-one&step=choose&medium=all', '?view=channels&medium=reddit&archived=1', '?view=launches&status=complete', '?view=launches&status=archived']) {
    const route = R.parse(query); assert.deepEqual(R.parse(R.serialize(route)), route);
  }
});
test('every launch stage and routed editor can be loaded directly', () => {
  for (const step of ['choose', 'prepare', 'distribute', 'followup']) {
    for (const editor of ['', '&edit=launch', '&edit=material', '&edit=actions', '&task=task-one', '&check=check-one', '&channel=seed-1', '&guidance=seed-1']) {
      const route = R.parse(`?launch=launch-one&step=${step}${editor}`);
      assert.equal(route.launchKey, 'launch-one'); assert.deepEqual(R.parse(R.serialize(route)), route);
    }
  }
  assert.equal(R.parse('?channel=seed-1').editor.key, 'seed-1');
  assert.equal(R.parse('?edit=new-channel').editor.type, 'new-channel');
});
test('invalid record identifiers fail closed; unsupported view values use safe defaults', () => {
  for (const value of ['%3Cimg%20src=x%3E', '../private', '', 'x'.repeat(101)]) assert.equal(R.parse('?launch=' + value).error, 'Launch');
  assert.equal(R.parse('?channel=javascript%3Aalert(1)').error, 'Channel');
  const route = R.parse('?view=unknown&medium=unknown&status=unknown&step=unknown');
  assert.equal(route.view, 'channels'); assert.equal(route.medium, 'all'); assert.equal(route.status, 'active'); assert.equal(route.step, 'choose');
});
test('serialization only includes navigation identifiers, never draft text, tokens, or unknown query parameters', () => {
  const query = R.serialize({ ...R.parse('?launch=launch-one&edit=launch&token=SECRET&draft=PRIVATE'), name: 'Private title', draft: 'Private copy', email: 'private@example.com' });
  assert.equal(query, '?launch=launch-one&step=choose&edit=launch');
  assert.doesNotMatch(query, /SECRET|PRIVATE|Private|email|token|draft/);
});
