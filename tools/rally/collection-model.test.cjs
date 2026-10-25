const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {buildSync} = require('esbuild');
function moduleAt(file) {
  const sandbox = {module: {exports: {}}, URL, crypto: require('node:crypto').webcrypto};
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
    ['BONNIE X CLYDE', ['BONNIE X CLYDE']],
    ['BONNIE X CLYDE B2B Excision', ['BONNIE X CLYDE', 'Excision']],
    ['Girl Math (VNSSA B2B Nala)', ['VNSSA', 'Nala']],
    ['Black Tiger Sex Machine Presents The Anime Show', ['Black Tiger Sex Machine']],
    ['Gareth Emery Presents: Decade', ['Gareth Emery']],
    ['A special back-to-back performance', ['A special back-to-back performance']],
    ['Artist (Unannounced guests)', ['Artist (Unannounced guests)']],
    ['Detox', ['Detox']],
  ]) assert.deepEqual(plain(artistsForSet(label)), expected, label);
});

const {festivalEditions, festivalForRave, applyFestival} = moduleAt('festivals.ts');
test('festival editions have unique identities, real dates, sources, and clean distinct suggestions', () => {
  assert.equal(festivalEditions.length, 99);
  assert.equal(new Set(festivalEditions.map(e => e.id)).size, festivalEditions.length);
  for (const e of festivalEditions) {
    assert.equal(new Date(e.startDate).toISOString().slice(0,10), e.startDate, e.id);
    assert.equal(new Date(e.endDate).toISOString().slice(0,10), e.endDate, e.id);
    assert(e.startDate <= e.endDate && e.endDate <= '2026-12-31', e.id);
    if (e.startDate > '2026-10-25') assert(e.note.includes('Upcoming edition'), e.id);
    assert(e.startDate.startsWith(String(e.year)) && e.year >= 2022, e.id);
    assert(e.artists.length > 0 && e.sources.length > 0, e.id);
    assert.equal(new Set(e.artists.map(n=>n.toLowerCase())).size,e.artists.length,e.id);
    for (const name of e.artists) assert(name.trim() === name && name.length <= 120 && !/[<>\n]/.test(name), `${e.id}: ${name}`);
    for (const source of e.sources) assert(source.url.startsWith('https://') && source.label, e.id);
    assert(['archive', 'partial'].includes(e.coverage));
  }
  assert.equal(festivalEditions.filter(e=>e.festival==='Niteharts' && e.year<2025).length,0);
  assert.equal(festivalEditions.filter(e=>e.festival==='Tomorrowland Belgium' && e.year===2022).length,3);
  assert.equal(festivalEditions.find(e=>e.id==='countdown-nye-2025').venue,'Los Angeles Convention Center');
  assert.equal(festivalEditions.find(e=>e.id==='countdown-nye-2024').startDate,'2024-12-31');
});
test('catalog application never claims attendance, changes personal fields, or confuses weekends', () => {
  const e = festivalEditions.find(e=>e.id==='tomorrowland-2022-w2');
  const personal = {...partial, artists:['My actual set'], crew:['My friend'], notes:'Keep this', albumUrl:'https://example.test/album'};
  const applied = applyFestival(personal,e);
  assert.equal(applied.name, e.name);
  for(const field of ['id','artists','crew','costs','notes','albumUrl','favoriteArtist','rating']) assert.deepEqual(applied[field],personal[field]);
  assert.equal(festivalForRave(applied).id,e.id);
  assert.equal(festivalForRave({...applied,startDate:'2022-07-23',endDate:'2022-07-23'}).id,e.id);
  assert.equal(festivalForRave({...applied,startDate:'2022-07-15',endDate:'2022-07-17'}),undefined);
  assert.equal(festivalForRave({...applied,name:'My unrelated show'}),undefined);
  assert.equal(festivalForRave({...applied,kind:'Club night'}),undefined);
  assert.equal(festivalForRave({...applied,name:'Tomorrowland Belgium'}).id,e.id);
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


test('catalog matching recognizes Rally identities and short years without crossing festival editions',()=>{
  const rave={...emptyRave(),name:"Lost Lands ’26",startDate:'2026-09-18',endDate:'2026-09-20'};
  assert.equal(festivalForRave(rave)?.id,'lost-lands-2026');
  assert.equal(festivalForRave({...rave,name:'Our bass weekend',sourceEventId:'lost-lands-2026'})?.id,'lost-lands-2026');
  assert.equal(festivalForRave({...rave,name:'Lost Lands 2025'}),undefined);
  assert.equal(festivalForRave({...rave,sourceEventId:'lost-lands-2026',startDate:'2025-09-19',endDate:'2025-09-21'}),undefined);
  assert.equal(festivalForRave({...rave,name:'Lost Lands afterparty'}),undefined);
  assert(!festivalEditions.find(e=>e.id==='lost-lands-2026').artists.some(a=>a.toLowerCase().includes('2hollis')));
});


test('equivalent set labels match without merging distinct performances or changing saved labels',()=>{
  const {performanceKey,artistsForSet}=moduleAt('artists.ts');
  assert.equal(performanceKey('EXCISION (DETOX SET)'),performanceKey('Excision (Detox)'));
  assert.equal(performanceKey('Excision Detox Set'),performanceKey('Excision (Detox)'));
  assert.notEqual(performanceKey('Excision'),performanceKey('Excision (Detox)'));
  assert.notEqual(performanceKey('Excision (2 Hour Set)'),performanceKey('Excision (Detox)'));
  assert.notEqual(performanceKey('Excision B2B Space Laces'),performanceKey('Excision'));
  assert.equal(performanceKey('Set Mo'),'set mo');
  assert.deepEqual(Array.from(artistsForSet('Excision (2 Hour Set)')),['Excision']);
});

test('upcoming and expired plans never count as attendance until explicitly confirmed',()=>{
 const {attendanceOf,isAttended,raveStatus}=moduleAt('raves.ts');
 const planned={...emptyRave(),name:'Future',startDate:'2099-01-01',endDate:'2099-01-02',attendance:'planned',plannedArtists:['Wishlist DJ'],plannedCrew:['Nancy'],artists:['Never count this'],crew:['Never count this']};
 assert.equal(isAttended(planned,'2100-01-01'),false);assert.equal(raveStatus(planned,'2100-01-01'),'To log');
 assert.equal(leaderboard([planned],'artists').length,0);assert.equal(leaderboard([planned],'crew').length,0);
 assert.equal(validateRave({...planned,attendance:undefined}).attendance,'planned');
 assert.throws(()=>validateRave({...planned,attendance:'attended'}),/future rave/);
 const past={...planned,startDate:'2022-01-01',endDate:'2022-01-01',attendance:'attended',artists:['Actual DJ']};
 assert.equal(leaderboard([past],'artists')[0].name,'Actual DJ');
 assert.equal(leaderboard([{...past,attendance:'skipped'}],'artists').length,0);
 assert.equal(attendanceOf(past),'attended');
});

test('individual shows preserve their type and match only the selected night',()=>{
 const e=festivalEditions.find(e=>e.id==='isoxo-cow-palace-2026-04-04');
 const r=applyFestival(emptyRave(),e);
 assert.equal(r.kind,'Show');assert.equal(r.city,'Daly City, CA');assert.equal(r.startDate,'2026-04-04');assert.equal(r.endDate,r.startDate);
 assert.deepEqual(JSON.parse(JSON.stringify(e.artists)),['ISOxo']);assert.equal(e.coverage,'partial');assert.equal(r.artists.length,0);assert.equal(r.costs.ticket,null);
 assert.equal(festivalForRave(r).id,e.id);assert.equal(festivalForRave({...r,kind:'Festival'}),undefined);
 assert.equal(festivalForRave({...r,startDate:'2026-04-03',endDate:'2026-04-03'}),undefined);
 const first=festivalEditions.find(e=>e.id==='isoxo-cow-palace-2026-04-03');assert.equal(festivalForRave(applyFestival(emptyRave(),first)).id,first.id);
});

test('expanded catalog scopes cancelled days, changing venues, and Coachella weekends',()=>{
 const byId=id=>festivalEditions.find(e=>e.id===id);
 for(const series of ['Wobbleland','Portola','Outside Lands','Coachella','HiJinx','Decadence Arizona','Electric Zoo','Escape Halloween','Nocturnal Wonderland','Dreamstate SoCal','HARD Summer','Day Trip']) assert(festivalEditions.some(e=>e.festival===series),series);
 assert(!byId('nocturnal-wonderland-2024'));
 assert.equal(festivalEditions.filter(e=>e.festival==='Electric Zoo').length,2);
 const zoo=byId('electric-zoo-2023');assert.equal(zoo.startDate,'2023-09-02');assert(!zoo.artists.includes('The Chainsmokers'));assert(zoo.artists.includes('Zedd'));
 assert.equal(byId('nocturnal-wonderland-2022').startDate,'2022-09-17');assert(!byId('nocturnal-wonderland-2022').artists.includes('Buzz Junior'));
 assert.equal(byId('wobbleland-2025').city,'Daly City, CA');assert.equal(byId('wobbleland-san-jose-2026').city,'San Jose, CA');
 assert.equal(byId('dreamstate-socal-2022').city,'San Bernardino, CA');assert.equal(byId('dreamstate-socal-2023').city,'Long Beach, CA');
 assert.equal(byId('hijinx-festival-2026').startDate,'2026-12-30');
 assert.equal(byId('decadence-arizona-2026').venue,'Phoenix Raceway');
 assert(!byId('escape-halloween-2026').artists.includes('Ice Cube'));assert(byId('escape-halloween-2026').artists.includes('Ja Rule'));
 for(const year of [2022,2023,2024,2025,2026]){
  const w1=byId(`coachella-${year}-w1`),w2=byId(`coachella-${year}-w2`);
  assert(w1.endDate<w2.startDate);
  assert.equal(festivalForRave({...applyFestival(emptyRave(),w2),name:'Coachella'}).id,w2.id);
 }
 assert(byId('coachella-2023-w1').artists.includes('Frank Ocean'));
 assert(!byId('coachella-2023-w2').artists.includes('Frank Ocean'));
 assert(byId('coachella-2023-w2').artists.includes('Skrillex x Fred again.. x Four Tet'));
 assert.deepEqual(plain(artistsForSet('Excision B2B Wooli')),['Excision','Wooli']);
 assert(byId('hijinx-festival-2026').artists.includes('Excision B2B Wooli'));assert(!byId('hijinx-festival-2026').artists.includes('Excision'));
 assert.equal(festivalForRave({...applyFestival(emptyRave(),zoo),name:'EZoo 2023'}).id,zoo.id);
 assert.equal(festivalForRave({...applyFestival(emptyRave(),zoo),name:'EZoo 2022'}),undefined);
});
