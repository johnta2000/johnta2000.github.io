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
    ['Dog Blood (Boys Noize x Skrillex)', ['Boys Noize', 'Skrillex']],
    ['Skull Machine (Black Tiger Sex Machine x Kai Wachi)', ['Black Tiger Sex Machine', 'Kai Wachi']],
    ['Guest (BONNIE X CLYDE)', ['BONNIE X CLYDE']],
    ['Black Tiger Sex Machine Presents The Anime Show', ['Black Tiger Sex Machine']],
    ['Gareth Emery Presents: Decade', ['Gareth Emery']],
    ['A special back-to-back performance', ['A special back-to-back performance']],
    ['Artist (Unannounced guests)', ['Artist (Unannounced guests)']],
    ['Detox', ['Detox']],
  ]) assert.deepEqual(plain(artistsForSet(label)), expected, label);
});

const {festivalEditions, festivalForRave, applyFestival} = moduleAt('festivals.ts');
test('festival editions have unique identities, real dates, sources, and clean distinct suggestions', () => {
  assert.equal(festivalEditions.length, 286);
  assert.equal(new Set(festivalEditions.map(e => e.id)).size, festivalEditions.length);
  for (const e of festivalEditions) {
    assert.equal(new Date(e.startDate).toISOString().slice(0,10), e.startDate, e.id);
    assert.equal(new Date(e.endDate).toISOString().slice(0,10), e.endDate, e.id);
    assert(e.startDate <= e.endDate && e.endDate <= '2027-12-31', e.id);
    if (e.startDate > '2026-10-25') assert(e.note.includes('Upcoming edition'), e.id);
    assert(e.startDate.startsWith(String(e.year)) && e.year >= 2019, e.id);
    assert((e.artists.length > 0 || (e.coverage === 'partial' && /No verified artist lineup/.test(e.note))) && e.sources.length > 0, e.id);
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
  assert.equal(festivalForRave({...applied,catalogEventId:undefined,name:'My unrelated show'}),undefined);
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
 assert.equal(festivalEditions.filter(e=>e.festival==='Electric Zoo').length,3);
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
 assert.equal(festivalForRave({...applyFestival(emptyRave(),zoo),catalogEventId:undefined,name:'EZoo 2022'}),undefined);
});

test('show catalog separates dates, consolidates support acts, and does not infer attendance', () => {
 const get=id=>festivalEditions.find(e=>e.id===id);
 const first=get('excision-bill-graham-2024-02-09'),second=get('excision-bill-graham-2024-02-10');
 assert(first.artists.includes('Ray Volpe') && first.artists.includes('ATLiens'));
 assert(!second.artists.includes('Ray Volpe'));
 assert.equal(festivalForRave(applyFestival(emptyRave(),first)).id,first.id);
 assert.equal(festivalForRave({...applyFestival(emptyRave(),first),startDate:second.startDate,endDate:second.endDate}).id,second.id);
 assert.equal(festivalEditions.filter(e=>e.festival==='ILLENIUM' && e.year===2024).length,4);
 assert.equal(festivalEditions.filter(e=>e.festival==='Zedd' && e.year===2024).length,4);
 assert(get('chainsmokers-shoreline-2023-10-28').artists.includes('Two Friends'));
 assert(get('tsu-nami-1015-folsom-2025-06-19').artists.includes('Buns'));
 assert.equal(get('baby-j-regency-2026-04-10').startDate,'2026-04-10');
 assert.equal(get('bass-canyon-2022').startDate,'2022-08-19');
 assert.equal(get('second-sky-2021').city,'Oakland, CA');
 assert.equal(get('firefly-2019').startDate,'2019-06-21');
 assert.equal(get('bts-metlife-2019-05-18').city,'East Rutherford, NJ');
 assert.equal(get('dnbnl-1015-folsom-2024-06-13').artists.length,0);
 for(const e of festivalEditions){
  assert(!('crew' in e || 'costs' in e || 'userId' in e || 'attendance' in e),e.id);
  const r=applyFestival(emptyRave(),e);assert.equal(r.artists.length,0,e.id);
 }
 assert(get('coachella-2025-w1').artists.includes('ZULAN'));
 assert(!get('coachella-2025-w2').artists.includes('ZULAN'));
 assert(!get('hijinx-festival-2025').artists.includes('SLANDER'));
 assert(get('hijinx-festival-2025').artists.includes('ILLENIUM B2B SLANDER'));
});

test('deep historical catalog excludes cancelled days and keeps venue-night lineups distinct',()=>{
 const get=id=>festivalEditions.find(e=>e.id===id);
 const beyond=get('beyond-wonderland-at-the-gorge-2023');
 assert.equal(beyond.startDate,'2023-06-17');assert.equal(beyond.endDate,beyond.startDate);
 assert(!beyond.artists.includes('Subtronics'));assert(!beyond.artists.includes('Riot Ten'));
 const roo=get('bonnaroo-2025');assert.equal(roo.endDate,'2025-06-12');
 assert(roo.artists.includes('Dom Dolla'));assert(!roo.artists.includes('Olivia Rodrigo'));
 assert.equal(get('bonnaroo-2023').startDate,'2023-06-15');
 assert.equal(get('elements-2024').startDate,'2024-08-10');
 assert(!get('elements-2024').artists.includes('Illenium'));
 assert.equal(get('lightning-in-a-bottle-2024').endDate,'2024-05-26');
 const day=get('ophelia-block-party-midway-2024-10-12'),after=get('ophelia-block-party-afterparty-midway-2024-10-12');
 assert.notEqual(day.id,after.id);assert(day.artists.includes('Crystal Skies'));assert(!after.artists.includes('Crystal Skies'));
 assert(get('subtronics-bill-graham-2025-10-24').artists.includes('INZO'));
 assert(!get('subtronics-bill-graham-2025-10-25').artists.includes('INZO'));
 assert(get('martin-garrix-bill-graham-2024-06-12').artists.includes('Austin Millz'));
 assert(!get('martin-garrix-bill-graham-2024-06-15').artists.includes('Austin Millz'));
 const {catalogSearchText}=moduleAt('festivals.ts');
 assert(catalogSearchText(day).includes('SF'));assert(catalogSearchText(day).includes('Seven Lions'));assert(catalogSearchText(day).includes('2024-10-12'));
});

test('network identities connect renamed events and artists without merging unlinked people or guessing attendance',()=>{
 const {raveNetwork}=moduleAt('network.ts');const edition=festivalEditions.find(e=>e.id==='lost-lands-2026');
 const nancy={id:'account:nancy',name:'Nancy',kind:'account',projectId:'crew-a',memberId:'nancy-a'};
 const one={...applyFestival(emptyRave(),edition),id:'one',name:'Our renamed rave',sourceEventId:'crew-a',attendance:'attended',artists:['Excision (Detox Set)','Space Laces x Excision'],crew:['Nancy'],crewConnections:[nancy]};
 const two={...one,id:'two',sourceEventId:'crew-b',artists:['EXCISION'],crewConnections:[{...nancy,name:'Nancy New Name',projectId:'crew-b',memberId:'nancy-b'}],crew:['Nancy New Name']};
 const planned={...one,id:'three',attendance:'planned',crewConnections:[],plannedCrewConnections:[nancy],plannedCrew:['Nancy']};
 const graph=raveNetwork([one,two,planned]);assert.equal(graph.nodes.filter(n=>n.kind==='event').length,1);assert.equal(graph.nodes.filter(n=>n.kind==='person').length,1);assert.equal(graph.nodes.filter(n=>n.kind==='artist').length,2);
 assert.equal(graph.edges.filter(e=>e.kind==='logged-with').length,2);assert.equal(graph.edges.filter(e=>e.kind==='planned-with').length,1);
 const history=leaderboard([one,two,planned],'crew');assert.equal(history.length,1);assert.equal(history[0].count,2);
 const sameName={...one,id:'other-nancy',crewConnections:[{...nancy,id:'account:another-nancy'}]};assert.equal(leaderboard([one,sameName],'crew').length,2);
 assert.equal(festivalForRave(one).id,edition.id);
 assert.equal(validateRave(one).crewConnections[0].id,'account:nancy');
});

test('an explicit custom event choice clears public identity and backups preserve it',()=>{
 const e=festivalEditions.find(e=>e.id==='lost-lands-2026');const r={...applyFestival(emptyRave(),e),catalogEventId:null,id:'custom'};
 assert.equal(festivalForRave(r),undefined);assert.equal(validateRave(r).catalogEventId,null);
 assert.equal(festivalForRave(applyFestival(r,e)).id,e.id);
});

test('renaming a connected catalog event keeps it searchable by its shared festival identity',()=>{
 const r={...applyFestival(emptyRave(),festivalEditions.find(e=>e.id==='lost-lands-2026')),id:'renamed',name:'Our best weekend'};
 assert.equal(filterRaves([r],emptyFilters(),'Lost Lands 2026').length,1);
});

 test('EDC 2027 is two independent three-night editions, never a ten-day default', () => {
  const editions = festivalEditions.filter(e => e.festival === 'EDC Las Vegas' && e.year === 2027);
  assert.equal(editions.length, 2);
  const [dusk, dawn] = editions;
  assert.deepEqual(Array.from(editions, e => [e.weekend, e.startDate, e.endDate]), [[1, '2027-05-14', '2027-05-16'], [2, '2027-05-21', '2027-05-23']]);
  for (const edition of editions) {
    const applied = applyFestival(emptyRave(), edition);
    assert.equal(festivalForRave(applied)?.id, edition.id);
    assert.equal(festivalForRave({...applied, catalogEventId: undefined, name: 'EDC 2027'})?.id, edition.id);
    assert.equal(edition.artists.length, 0);
  }
  assert.notEqual(dusk.id, dawn.id);
  assert.equal(festivalForRave({...applyFestival(emptyRave(), dusk), endDate: dawn.endDate}), undefined);
});

test('Calvin Harris US tour nights are separate sourced shows with only the confirmed headliner',()=>{
 const dates=festivalEditions.filter(e=>e.id.startsWith('calvin-harris-')&&e.year===2027);
 assert.equal(dates.length,30);assert.equal(new Set(dates.map(e=>e.id)).size,30);
 assert.deepEqual(Array.from(dates.filter(e=>e.city==='Oakland, CA'),e=>e.startDate),['2027-05-09','2027-05-08','2027-05-07'].sort((a,b)=>a.localeCompare(b)));
 for(const e of dates){assert.equal(e.kind,'Show');assert.equal(e.startDate,e.endDate);assert.deepEqual(Array.from(e.artists),['Calvin Harris']);assert.equal(e.coverage,'partial');assert(e.sources.some(s=>s.url==='https://drop.cobrand.com/d/CalvinHarris/2027'));}
});

test('event search handles misspellings and joined words while keeping exact years and dates distinct',()=>{
 const {scoreCatalogEvent}=moduleAt('catalogSearch.ts');
 const find=q=>Array.from(festivalEditions,e=>({e,score:scoreCatalogEvent(q,e.id)})).filter(r=>r.score>=0).sort((a,b)=>b.score-a.score).map(r=>r.e.id);
 assert.deepEqual(find('lostlands 2026'),['lost-lands-2026']);
 assert.deepEqual(find('nitehearts 2026'),['niteharts-2026']);
 assert.equal(find('portloa 2025')[0],'portola-2025');
 assert.deepEqual(find('calvn haris oak 2027'),['calvin-harris-oakland-2027-05-07','calvin-harris-oakland-2027-05-08','calvin-harris-oakland-2027-05-09']);
 assert.deepEqual(find('2027 calvin SF'),find('calvin oakland 2027'));
 assert.equal(find('Daly City 2025').length,2);
 assert.equal(find('lostlands 2028').length,0);
 assert.deepEqual(find('calvin oakland 2027-05-08'),['calvin-harris-oakland-2027-05-08']);
 assert.equal(find('tomorowland 2022').length,3);
});

test('diary search accepts typos, reordered words, and accent-free artist names',()=>{
 const r={...applyFestival(emptyRave(),festivalEditions.find(e=>e.id==='lost-lands-2026')),id:'search-night',artists:['RÜFÜS DU SOL']};
 assert.equal(filterRaves([r],emptyFilters(),'2026 lostlnads').length,1);
 assert.equal(filterRaves([r],emptyFilters(),'rufus').length,1);
 assert.equal(filterRaves([r],emptyFilters(),'lostlands 2028').length,0);
});
