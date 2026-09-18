const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const backend=fs.readFileSync(path.join(__dirname,'../../convex/rally.ts'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../../lost-lands-2026-lineup/index.html'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../../lost-lands-2026-lineup/controller.js'),'utf8');
const dataset={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../lost-lands-2026-lineup/set-times.js'),'utf8'),dataset);
const lineup=dataset.window.LOST_LANDS_SET_TIMES.map(entry=>({...entry,startMinutes:100}));
function server(role,hiddenDays){
  const state={id:'lost-lands-2026',lineupFavorites:{kevin:['set-secret-takeover']},rooms:[{id:'hotel'}]};
  const ctx={state,current:{role},p:{hiddenDays},LOST_LANDS:'lost-lands-2026',LOST_LANDS_SET_TIMES:lineup};
  const helper=backend.slice(backend.indexOf('function validateHiddenLineupDays('),backend.indexOf('const EVENT_TEMPLATE_IDS'));
  const marker='} else if (args.action === "save-lineup-days") {';
  const branch=backend.slice(backend.indexOf(marker)+marker.length,backend.indexOf('} else if (args.action === "save-lineup-artist")'));
  vm.createContext(ctx);
  vm.runInContext(transformSync(helper+'\nfunction save(){'+branch+'}',{loader:'ts',format:'cjs'}).code,ctx);
  return ctx;
}
test('only project admins can hide days; existing favorites and bookings stay untouched',()=>{
  for(const role of ['admin','leader']){
    const ctx=server(role,['Wednesday','Thursday']);const before=JSON.stringify(ctx.state);
    ctx.save();assert.deepEqual(Array.from(ctx.state.lineupHiddenDays),['Wednesday','Thursday']);
    const {lineupHiddenDays,...rest}=ctx.state;assert.equal(JSON.stringify(rest),before);
    ctx.p.hiddenDays=[];ctx.save();assert.equal(ctx.state.lineupHiddenDays.length,0);
  }
  const member=server('member',['Wednesday']);assert.throws(()=>member.save(),/Only an admin/);
  assert.equal(member.state.lineupHiddenDays,undefined);
});
test('day settings reject invalid values and hiding every day',()=>{
  for(const invalid of [null,'Wednesday',['Nope'],[42],['Wednesday','Thursday','Friday','Saturday','Sunday']]) {
    assert.throws(()=>server('admin',invalid).save());
  }
  const ctx=server('admin',['Wednesday','Wednesday']);ctx.save();assert.equal(ctx.state.lineupHiddenDays.length,1);
});
test('project-hidden days are excluded from filters, while stars survive hiding and restoring',()=>{
  const ctx={lineup,hiddenLineupDays:new Set(['Wednesday','Thursday']),selectedDays:new Set(),selectedStages:new Set(),selectedGenres:new Set(),timeMin:0,timeMax:3000,favoritesOnly:false,favorites:new Set([lineup[0].id]),els:{search:{value:''}},normalizeText:value=>value.toLowerCase(),compareSets:()=>0};
  vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('function getFilteredLineup('),html.indexOf('function groupPeople(')),ctx);
  const visible=ctx.getFilteredLineup();assert(visible.length>0);
  assert(visible.every(entry=>!['Wednesday','Thursday'].includes(entry.day)));
  ctx.favoritesOnly=true;assert.equal(ctx.getFilteredLineup().length,0);
  ctx.hiddenLineupDays.clear();assert.equal(ctx.getFilteredLineup()[0].id,lineup[0].id);
  assert.equal(ctx.favorites.size,1);
});
test('mobile day tabs adapt to visible days and a hidden-day URL falls back safely',()=>{
  const days={innerHTML:'',contains:()=>false,style:{setProperty(k,v){this[k]=v;}}};
  const ctx={lineup,dayOrder:['Wednesday','Thursday','Friday','Saturday','Sunday'],hiddenLineupDays:new Set(['Wednesday','Thursday']),selectedDays:new Set(['Wednesday']),mobileViewQuery:{matches:true},document:{getElementById:()=>days,activeElement:null},escapeHtml:value=>value};
  ctx.root=ctx.document;
  ctx.easternNow=()=> '2026-09-18T17:00';
  vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('function visibleLineupDays('),html.indexOf('const stageOrder =')),ctx);
  vm.runInContext(html.slice(html.indexOf('function defaultMobileDay('),html.indexOf('function placeMobileFilters(')),ctx);
  vm.runInContext(html.slice(html.indexOf('function render() {'),html.indexOf('const entries = getFilteredLineup();'))+'}',ctx);
  ctx.render();
  assert(!days.innerHTML.includes('data-day="Wednesday"'));assert(!days.innerHTML.includes('data-day="Thursday"'));
  assert(days.innerHTML.includes('data-day="Friday"'));assert.equal(days.style['--day-count'],'3');
  assert.equal(vm.runInContext('selectedDays.has("Wednesday")',ctx),false);
  assert.equal(vm.runInContext('selectedDays.size',ctx),1);
});
