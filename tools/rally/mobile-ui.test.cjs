const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../lost-lands-2026-lineup/index.html'),'utf8');
const dataset={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../lost-lands-2026-lineup/set-times.js'),'utf8'),dataset);
const lineup=dataset.window.LOST_LANDS_SET_TIMES.map((entry,index)=>({...entry,posterIndex:index}));
function context() {
  const container={innerHTML:'',contains:()=>false,querySelectorAll:()=>[]};
  const button={textContent:''};
  const ctx={lineup,stageOrder:[...new Set(lineup.map(x=>x.stage))],dayOrder:['Wednesday','Thursday','Friday','Saturday','Sunday'],favorites:new Set(),lineupInterests:{},rallyManagedFavorites:true,groupStateLoaded:true,selectedDays:new Set(['Friday']),activeView:'table',document:{activeElement:null,getElementById:id=>id==='mobile-schedule'?container:button},Intl,Date};
  vm.createContext(ctx);
  for(const [start,end] of [['function formatClock(', 'const lineup ='],['function escapeHtml(', 'function getCanonicalUrl('],['function groupPeople(', 'function compareSets('],['function defaultMobileDay(', 'function saveFavorites(']]) {
    vm.runInContext(html.slice(html.indexOf(start),html.indexOf(end)),ctx);
  }
  return {ctx,container};
}
test('all lineup scripts parse; app scripts parse',()=>{
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  new vm.Script(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'));
  new vm.Script(fs.readFileSync(path.join(__dirname,'keyboard.js'),'utf8'));
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
test('single-day schedule, stage grouping, and popularity use the same favorite IDs',()=>{
  const {ctx,container}=context();
  const friday=lineup.filter(x=>x.day==='Friday');
  ctx.favorites.add(friday[0].id);
  ctx.renderMobileSchedule(friday);
  assert.equal((container.innerHTML.match(/<article class="set-card/g)||[]).length,friday.length);
  assert(container.innerHTML.includes('aria-pressed="true"'));
  ctx.activeView='board';ctx.renderMobileSchedule(friday);
  assert.equal((container.innerHTML.match(/<article class="set-card/g)||[]).length,friday.length);
  ctx.lineupInterests[friday[0].id]=[{id:'one',name:'Jessi',initials:'J'}];
  ctx.lineupInterests[friday[1].id]=[{id:'two',name:'John',initials:'JT'},{id:'three',name:'<img onerror=x>',initials:'X'}];
  ctx.activeView='heat';ctx.renderMobileSchedule(friday);
  assert(container.innerHTML.indexOf(friday[1].id)<container.innerHTML.indexOf(friday[0].id));
  assert(container.innerHTML.includes('width:100%'));
  assert(!container.innerHTML.includes('<img onerror=x>'));
  assert(container.innerHTML.includes('&lt;img onerror=x&gt;'));
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
