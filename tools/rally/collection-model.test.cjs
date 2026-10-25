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

const {artistsForSet, artistsForRave, setCreditsArtist} = moduleAt('artists.ts');
const plain = values => Array.from(values);
test('artist identity separates explicit collaborations and special sets while preserving act names', () => {
  for (const [label, expected] of [
    ['Space Laces x Excision', ['Space Laces', 'Excision']],
    ['SPACE LACES B2B EXCISION', ['SPACE LACES', 'EXCISION']],
    ['Space Laces × Excision B2B Wooli', ['Space Laces', 'Excision', 'Wooli']],
    ['Excision Detox Set', ['Excision']],
    ['Excision: Detox Set', ['Excision']],
    ['Excision (Detox)', ['Excision']],
    ['Excision [Detox Set]', ['Excision']],
    ['Excision Detox Set B2B Wooli (DJ Set)', ['Excision', 'Wooli']],
    ['Excision - Throwback Set', ['Excision']],
    ['FRESH MEAT: HEVNFALL', ['HEVNFALL']],
    ['Above & Beyond', ['Above & Beyond']],
    ['Chase & Status', ['Chase & Status']],
    ['DJ Snake', ['DJ Snake']],
    ['The xx', ['The xx']],
    ['Masterhand', ['Masterhand']],
    ['A special back-to-back performance', ['A special back-to-back performance']],
    ['Artist (Unannounced guests)', ['Artist (Unannounced guests)']],
    ['Detox', ['Detox']],
  ]) assert.deepEqual(plain(artistsForSet(label)), expected, label);
});
test('legacy set labels contribute to core artist history once per rave, including favorite sets and filters', () => {
  const first = {...free, artists: ['Excision', 'Excision Detox Set', 'Space Laces x Excision'], favoriteArtist: 'Space Laces x Excision'};
  const next = {...partial, artists: ['Excision (Detox Set)']};
  assert.deepEqual(plain(artistsForRave(first)), ['Excision', 'Space Laces']);
  const ranks = leaderboard([first, next], 'artists');
  assert.deepEqual(Array.from(ranks, r => [r.name, r.count]), [['Excision', 2], ['Space Laces', 1]]);
  assert.equal(setCreditsArtist(first.favoriteArtist, 'Excision'), true);
  assert.equal(setCreditsArtist(first.favoriteArtist, 'Space Laces'), true);
  assert.equal(setCreditsArtist(first.favoriteArtist, 'Wooli'), false);
  assert.deepEqual(names(filterRaves([first, next], {...emptyFilters(), artist: 'Excision'}, '')), ['Free', 'Partial']);
  assert.deepEqual(names(filterRaves([first, next], {...emptyFilters(), artist: 'Space Laces'}, '')), ['Free']);
  assert.deepEqual(names(filterRaves([first, next], {...emptyFilters(), artist: 'Excision Detox Set'}, '')), ['Free']);
  assert.deepEqual(plain(validateRave(first).artists), first.artists);
  assert.equal(validateRave(first).favoriteArtist, first.favoriteArtist);
});
