const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {buildSync} = require('esbuild');
function moduleAt(file) {
  const sandbox = {module: {exports: {}}, crypto: require('node:crypto').webcrypto};
  vm.runInNewContext(buildSync({entryPoints: [__dirname + '/collection-src/lib/' + file], bundle: true, write: false, platform: 'node', format: 'cjs'}).outputFiles[0].text, sandbox);
  return sandbox.module.exports;
}
const {emptyRave, totalCost, validateRave, leaderboard} = moduleAt('raves.ts');
const {emptyFilters, filterRaves, sortRaves} = moduleAt('explorer.ts');
const rave = (id, costs) => validateRave({...emptyRave(), id, name: id, startDate: '2025-06-01', costs});
const unknown = rave('Unknown', {ticket: null, travel: null, stay: null, other: null});
const free = rave('Free', {ticket: 0, travel: 0, stay: 0, other: 0});
const partial = rave('Partial', {ticket: 35, travel: null, stay: 0, other: null});
const complete = rave('Complete', {ticket: 60, travel: 10, stay: 0, other: 5});
const records = [unknown, free, partial, complete];
const names = rows => Array.from(rows, r => r.id);
test('cost completeness distinguishes unknown, partially logged, and free nights', () => {
  assert.equal(totalCost(unknown), null); assert.equal(totalCost(free), 0); assert.equal(totalCost(partial), 35);
  assert.deepEqual(names(filterRaves(records, {...emptyFilters(), costStatus: 'unlogged'}, '')), ['Unknown']);
  assert.deepEqual(names(filterRaves(records, {...emptyFilters(), costStatus: 'partial'}, '')), ['Partial']);
  assert.deepEqual(names(filterRaves(records, {...emptyFilters(), costStatus: 'complete'}, '')), ['Free', 'Complete']);
});
test('zero-dollar filters exclude unknown costs; sorting always leaves unknown costs last', () => {
  assert.deepEqual(names(filterRaves(records, {...emptyFilters(), maxCost: '0'}, '')), ['Free']);
  assert.deepEqual(names(sortRaves(records, {key: 'cost', direction: 'asc'})), ['Free', 'Partial', 'Complete', 'Unknown']);
  assert.deepEqual(names(sortRaves(records, {key: 'cost', direction: 'desc'})), ['Complete', 'Partial', 'Free', 'Unknown']);
});
test('aggregation counts a person or artist once per rave, regardless of spelling case', () => {
  const rows = [{...free, artists: ['Artist', 'artist'], crew: ['Friend', 'FRIEND']}, {...partial, artists: ['ARTIST'], crew: ['friend']}];
  assert.equal(leaderboard(rows, 'artists')[0].count, 2); assert.equal(leaderboard(rows, 'crew')[0].count, 2);
});
test('validation keeps explicit zero, rounds money, rejects invalid dates and unsafe album links', () => {
  assert.equal(validateRave({...partial, costs: {...partial.costs, ticket: 12.345}}).costs.ticket, 12.35);
  assert.throws(() => validateRave({...partial, startDate: '2025-02-30'}), /valid date/);
  assert.throws(() => validateRave({...partial, albumUrl: 'javascript:alert(1)'}), /album link/);
  assert.throws(() => validateRave({...partial, costs: {...partial.costs, travel: -1}}), /Costs/);
});
