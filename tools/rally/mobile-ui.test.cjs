const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../lost-lands-2026-lineup/index.html'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../../lost-lands-2026-lineup/controller.js'),'utf8');
const dataset={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../lost-lands-2026-lineup/set-times.js'),'utf8'),dataset);
const lineup=dataset.window.LOST_LANDS_SET_TIMES.map((entry,index)=>({...entry,posterIndex:index}));
test('all lineup view tabs share vertical and horizontal label centering',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../../lost-lands-2026-lineup/mobile.css'),'utf8');
  const shared=css.match(/\.segmented button:not\(\.group-control\), \.rally-mode \.segmented \.group-control\s*\{([^}]+)\}/)?.[1];
  assert(shared);
  for(const declaration of ['display:inline-flex','align-items:center','justify-content:center','line-height:1.2']) assert(shared.includes(declaration));
});
test('canonical set favorites never expand into other Secret Takeover slots',()=>{
  const ctx={lineup};vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('const currentIdsByLegacyId ='),html.indexOf('const els ='))+'\nthis.mapFavorite=currentFavoriteIds;',ctx);
  for(const set of lineup) assert.deepEqual(Array.from(ctx.mapFavorite(set.id)),[set.id]);
  const takeovers=lineup.filter(set=>set.artist==='SECRET TAKEOVER');
  assert(takeovers.length>1);
  const original=takeovers.find(set=>set.id==='set-secret-takeover');assert(original);
  const other=takeovers.find(set=>set.day!==original.day);assert(other);
  let favorites=new Set([original.id,other.id,lineup[0].id]);
  favorites.delete(other.id);
  favorites=new Set(JSON.parse(JSON.stringify([...favorites])).flatMap(ctx.mapFavorite));
  assert(favorites.has(original.id));assert(!favorites.has(other.id));assert(favorites.has(lineup[0].id));
  favorites.delete(original.id);
  assert(![...favorites].flatMap(ctx.mapFavorite).some(id=>takeovers.some(set=>set.id===id)));
});
test('obsolete artist aliases still migrate without dropping existing exact preferences',()=>{
  const ctx={lineup:[{id:'set-a',legacyIds:['old-artist']},{id:'set-b',legacyIds:['old-artist']}]};vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('const currentIdsByLegacyId ='),html.indexOf('const els ='))+'\nthis.mapFavorite=currentFavoriteIds;',ctx);
  assert.deepEqual(Array.from(ctx.mapFavorite('old-artist')),['set-a','set-b']);
  assert.deepEqual(Array.from(ctx.mapFavorite('set-b')),['set-b']);
});
function boardContext() {
  const {ctx}=context();
  vm.runInContext(html.match(/const dinoEmpty = .*;/)[0],ctx);
  ctx.els={heatContent:{innerHTML:''},posterContent:{innerHTML:''},heatScale:{textContent:''}};
  ctx.formatFestivalDate=date=>date;
  vm.runInContext(html.slice(html.indexOf('function renderHeatMap('),html.indexOf('function renderTable(')),ctx);
  return ctx;
}
test('desktop day board includes every set exactly once with independent favorites and crew details',()=>{
  const ctx=boardContext();ctx.favorites.add(lineup[0].id);
  ctx.lineupInterests[lineup[0].id]=[{id:'j',name:'Jessi',initials:'J'}];
  ctx.renderDayBoard(lineup);
  const output=ctx.els.posterContent.innerHTML;
  assert.equal((output.match(/class="day-column"/g)||[]).length,5);
  assert.equal((output.match(/data-favorite-id=/g)||[]).length,lineup.length);
  for(const set of lineup) assert.equal(output.split(`data-favorite-id="${ctx.escapeHtml(set.id)}"`).length,2);
  assert(output.includes('aria-pressed="true"'));assert(output.includes('Jessi'));
  assert(output.includes('After midnight'));assert(output.includes('stage-group-header'));
  assert.equal(ctx.favorites.size,1);
});
test('heatmap places every set in its day × stage cell with consistent interest shading',()=>{
  const ctx=boardContext(),friday=lineup.filter(x=>x.day==='Friday'),saturday=lineup.filter(x=>x.day==='Saturday');
  ctx.lineupInterests[friday.at(-1).id]=[{id:'a',name:'<script>alert(1)</script>',initials:'A'},{id:'b',name:'Kevin',initials:'KT'}];
  ctx.lineupInterests[saturday[0].id]=[{id:'b',name:'Kevin',initials:'KT'}];
  ctx.renderHeatMap([...friday,...saturday]);const output=ctx.els.heatContent.innerHTML;
  assert.equal((output.match(/class="matrix-day"/g)||[]).length,2);
  assert.equal((output.match(/role="rowheader"/g)||[]).length,new Set([...friday,...saturday].map(x=>x.stage)).size);
  assert.equal((output.match(/data-favorite-id=/g)||[]).length,friday.length+saturday.length);
  for(const cell of output.split('<div class="matrix-cell"').slice(1)){
    const label=cell.match(/aria-label="([^"]+)"/)[1];
    const ids=[...cell.matchAll(/data-favorite-id="([^"]+)"/g)].map(match=>match[1]);
    const sets=ids.map(id=>lineup.find(entry=>ctx.escapeHtml(entry.id)===id));
    assert(sets.every(entry=>label===`${ctx.escapeHtml(entry.day)} · ${ctx.escapeHtml(entry.stage)}`));
    assert.deepEqual(sets.map(x=>x.posterIndex),sets.map(x=>x.posterIndex).sort((a,b)=>a-b));
  }
  assert(output.includes('--heat-strength:100%'));assert(output.includes('--heat-strength:50%'));
  assert(output.includes('interest-matrix'));assert(!output.includes('<script>'));
  assert(output.includes('&lt;script&gt;'));assert(output.includes('matrix-stage'));
  assert(ctx.els.heatScale.textContent.includes('0–2'));
  assert(!ctx.els.heatScale.textContent.includes('ranked'));
});
test('matrix keeps empty intersections, respects filtered days, and keeps single-day columns usable',()=>{
  const ctx=boardContext();
  const friday=lineup.find(x=>x.day==='Friday');
  const saturday=lineup.find(x=>x.day==='Saturday'&&x.stage!==friday.stage);
  ctx.renderHeatMap([friday,saturday]);
  let output=ctx.els.heatContent.innerHTML;
  assert.equal((output.match(/class="matrix-cell"/g)||[]).length,4);
  assert.equal((output.match(/No matching sets/g)||[]).length,2);
  assert(!output.includes('Wednesday'));assert(!output.includes('Thursday'));
  ctx.renderHeatMap([friday]);output=ctx.els.heatContent.innerHTML;
  assert(output.includes('--matrix-days:1'));assert.equal((output.match(/class="matrix-cell"/g)||[]).length,1);
  const css=fs.readFileSync(path.join(__dirname,'../../lost-lands-2026-lineup/mobile.css'),'utf8');
  assert(css.includes('min-width:calc(152px + var(--matrix-days)*290px)'));
  assert(css.includes('.matrix-corner,.matrix-stage {position:sticky;left:0;'));
});
test('desktop boards handle loading, empty filters, and no favorites without inventing interest',()=>{
  const ctx=boardContext();ctx.groupStateLoaded=false;
  ctx.renderHeatMap(lineup);assert(ctx.els.heatContent.innerHTML.includes('Loading'));
  ctx.groupStateLoaded=true;ctx.renderHeatMap([]);assert(ctx.els.heatContent.innerHTML.includes('No dinosaurs spotted'));
  ctx.renderDayBoard([]);assert(ctx.els.posterContent.innerHTML.includes('No dinosaurs spotted'));
  ctx.renderHeatMap(lineup.slice(0,2));assert(ctx.els.heatContent.innerHTML.includes('--heat-strength:0%'));
  assert(!ctx.els.heatContent.innerHTML.includes('NaN'));assert(ctx.els.heatScale.textContent.includes('No group favorites'));
  ctx.rallyManagedFavorites=false;assert(!ctx.boardSetCard(lineup[0]).includes('board-set-crew'));
});
function context() {
  const container={innerHTML:'',contains:()=>false,querySelectorAll:()=>[]};
  const button={textContent:''};
  const ctx={lineup,stageOrder:[...new Set(lineup.map(x=>x.stage))],dayOrder:['Wednesday','Thursday','Friday','Saturday','Sunday'],favorites:new Set(),lineupInterests:{},rallyManagedFavorites:true,groupStateLoaded:true,selectedDays:new Set(['Friday']),activeView:'table',document:{activeElement:null,getElementById:id=>id==='mobile-schedule'?container:button},Intl,Date};
  vm.createContext(ctx);
  ctx.root=ctx.document;
  ctx.hiddenLineupDays=new Set();
  ctx.visibleLineupDays=()=>ctx.dayOrder.filter(day=>!ctx.hiddenLineupDays.has(day));
  for(const [start,end] of [['function formatClock(', 'const lineup ='],['function escapeHtml(', 'function getCanonicalUrl('],['function groupPeople(', 'function compareSets('],['function defaultMobileDay(', 'function saveFavorites(']]) {
    vm.runInContext(html.slice(html.indexOf(start),html.indexOf(end)),ctx);
  }
  ctx.sortMode='time';ctx.mostLiked=false;
  vm.runInContext(html.slice(html.indexOf('function compareSets('),html.indexOf('function renderHeatMap(')),ctx);
  return {ctx,container};
}
test('all lineup scripts parse; app scripts parse',()=>{
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  new vm.Script(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'));
  new vm.Script(fs.readFileSync(path.join(__dirname,'keyboard.js'),'utf8'));
  new vm.Script(fs.readFileSync(path.join(__dirname,'../../lost-lands-2026-lineup/controller.js'),'utf8'));
});
test('mobile cards preserve every set and display artist, range, stage, overnight context',()=>{
  const {ctx}=context();
  for(const entry of lineup) {
    const card=ctx.mobileSetCard(entry);
    assert(card.includes(`data-favorite-id="${ctx.escapeHtml(entry.id)}"`));
    assert(card.includes(ctx.escapeHtml(entry.artist)));
    assert(card.includes(ctx.escapeHtml(entry.stage)));
    assert(card.includes(ctx.formatClock(entry.start)));
    assert(card.includes(ctx.formatClock(entry.end)));
    if(entry.start.slice(0,10)>entry.festivalDate) assert(card.includes('After midnight'));
  }
});
test('mobile heatmap stays stage-grouped and includes unliked sets instead of becoming a ranked list',()=>{
  const {ctx,container}=context();
  const friday=lineup.filter(x=>x.day==='Friday');
  ctx.favorites.add(friday[0].id);
  ctx.renderMobileSchedule(friday);
  assert.equal((container.innerHTML.match(/<article[^>]*class="set-card/g)||[]).length,friday.length);
  assert(container.innerHTML.includes('aria-pressed="true"'));
  ctx.activeView='board';ctx.renderMobileSchedule(friday);
  assert.equal((container.innerHTML.match(/<article[^>]*class="set-card/g)||[]).length,friday.length);
  ctx.lineupInterests[friday[0].id]=[{id:'one',name:'Jessi',initials:'J'}];
  ctx.lineupInterests[friday[1].id]=[{id:'two',name:'John',initials:'JT'},{id:'three',name:'<img onerror=x>',initials:'X'}];
  ctx.activeView='heat';ctx.renderMobileSchedule(friday);
  assert.equal((container.innerHTML.match(/<article[^>]*class="set-card/g)||[]).length,friday.length);
  assert(container.innerHTML.includes('mobile-stage-heat'));
  assert(!container.innerHTML.includes('set-rank'));
  assert(container.innerHTML.includes('set-card-heat'));
  assert(container.innerHTML.includes('width:100%'));
  assert(!container.innerHTML.includes('<img onerror=x>'));
  assert(container.innerHTML.includes('&lt;img onerror=x&gt;'));
  ctx.hiddenLineupDays.add('Wednesday');
  ctx.lineupInterests[lineup.find(x=>x.day==='Wednesday').id]=Array.from({length:9},(_,i)=>({id:`hidden${i}`,name:'Hidden'}));
  ctx.renderMobileSchedule(friday);
  assert(container.innerHTML.includes('0–2 interested'));
  assert.equal(ctx.favorites.size,1);
});
test('sort supports time, crew popularity, and alphabetical names without changing favorites',()=>{
  const {ctx}=context(),sets=lineup.filter(x=>x.day==='Friday');
  const liked=sets.at(-1);
  ctx.lineupInterests[liked.id]=[{id:'one',name:'Jessi',initials:'J'}];
  ctx.favorites.add(sets[0].id);
  ctx.sortMode='popular';ctx.mostLiked=true;
  assert.equal([...sets].sort(ctx.compareSets)[0].id,liked.id);
  ctx.sortMode='artist';ctx.mostLiked=false;
  const alphabetical=[...sets].sort(ctx.compareSets);
  assert.deepEqual(Array.from(alphabetical,x=>x.artist),Array.from(sets,x=>x.artist).sort((a,b)=>a.localeCompare(b)));
  ctx.sortMode='time';
  assert.equal([...sets].reverse().sort(ctx.compareSets)[0].id,sets[0].id);
  assert.equal(ctx.favorites.size,1);
});
test('closing filter categories hides panels and clears only temporary search text',()=>{
  const make=()=>{
    const trigger={expanded:'true',setAttribute(name,value){this.expanded=value;}};
    const panel={hidden:false};
    const search={value:'dub',events:0,dispatchEvent(){this.events++;}};
    const node={querySelector:selector=>({'.filter-trigger':trigger,'.filter-panel':panel,'.filter-search':search})[selector]};
    return {node,trigger,panel,search};
  };
  const stages=make(),genres=make(),ctx={els:{filterPopovers:[stages.node,genres.node]},Event:class{},selectedGenres:new Set(['Dubstep'])};
  vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('function closeFilterPopovers('),html.indexOf('function updateFilterControls(')),ctx);
  ctx.closeFilterPopovers(genres.node);
  assert.equal(stages.panel.hidden,true);assert.equal(stages.trigger.expanded,'false');assert.equal(stages.search.value,'');
  assert.equal(genres.panel.hidden,false);assert.equal(genres.search.value,'dub');
  ctx.closeFilterPopovers();
  assert.equal(genres.panel.hidden,true);assert.equal(genres.search.value,'');assert.equal(genres.search.events,1);
  assert(ctx.selectedGenres.has('Dubstep'));
});
test('project search indexes current room only, including offline set times and booking metadata',()=>{
  const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const data={id:'event-two',members:[{id:'j',name:'Jessi',email:'jessi@example.test'}],rooms:[{id:'r',hotel:'Hyatt',roomType:'Suite',memberIds:['j'],confirmation:'123'}],travel:[],cars:[],passes:[],tasks:[{id:'t',title:'Pack earplugs',assigneeId:'j'}],lineup:[{id:'a',name:'ILLENIUM',day:'Saturday'}]};
  const ctx={data,DEFAULT_EVENT:'lost-lands-2026',window:{LOST_LANDS_SET_TIMES:lineup},views:[['home','Home']],memberMap:()=>Object.fromEntries(data.members.map(x=>[x.id,x])),groupedFlights:()=>[],events:[{id:'private-event',name:'Not this room'}]};
  vm.createContext(ctx);
  vm.runInContext(app.slice(app.indexOf('function projectSearchItems('),app.indexOf('function openProjectSearch(')),ctx);
  let items=ctx.projectSearchItems();
  assert(items.some(x=>x.title==='Hyatt'&&x.detail.includes('Jessi')&&x.detail.includes('123')));
  assert(items.some(x=>x.title==='Pack earplugs'));
  assert.equal(items.filter(x=>x.view==='lineup').length,1);
  assert(!JSON.stringify(items).includes('Not this room'));
  data.id='lost-lands-2026';items=ctx.projectSearchItems();
  assert.equal(items.filter(x=>x.view==='lineup').length,220);
});
test('focus scrolls immediately before input, and responds to keyboard viewport changes',()=>{
  const handlers={},viewportHandlers={},variables={};let calls=0;
  const input={matches:()=>true,getBoundingClientRect:()=>({top:600,bottom:645}),scrollIntoView:()=>calls++};
  const viewport={height:350,offsetTop:0,addEventListener:(name,fn)=>viewportHandlers[name]=fn};
  const ctx={window:{visualViewport:viewport,addEventListener(){}},document:{activeElement:input,documentElement:{style:{setProperty:(key,value)=>variables[key]=value}},addEventListener:(name,fn)=>handlers[name]=fn},innerHeight:844,requestAnimationFrame:fn=>fn(),setTimeout:()=>0,clearTimeout(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'keyboard.js'),'utf8'),ctx);
  handlers.focusin({target:input});assert(calls>0);
  const before=calls;viewportHandlers.resize();assert(calls>before);
  assert.equal(variables['--rally-viewport-height'],'350px');
  input.getBoundingClientRect=()=>({top:70,bottom:115});
  const visibleCalls=calls;ctx.window.RallyKeyboard.reveal();assert.equal(calls,visibleCalls);
});
test('project creation only lives in the dropdown and offline bundles include mobile assets',()=>{
  const shell=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  assert(!shell.includes('id="newEvent"'));
  const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  assert(app.includes('el.eventMenu.insertAdjacentHTML'));
  const sw=fs.readFileSync(path.join(__dirname,'../../rally-sw.js'),'utf8');
  assert(sw.includes('/lost-lands-2026-lineup/mobile.css'));
  assert(sw.includes('/tools/rally/keyboard.js'));
});
