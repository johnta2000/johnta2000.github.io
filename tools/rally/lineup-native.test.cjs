const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
function setup(mobile=true){
  const dom=new JSDOM('<!doctype html><body><button id="outside">Home</button><section id="lineupView"></section>',{url:'https://www.john-ta.com/tools/rally/?view=lineup&event=lost-lands-2026',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,events=[],routes=[];
  w.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
  for(const file of ['../../lost-lands-2026-lineup/set-times.js','../../lost-lands-2026-lineup/controller.js','lineup-template.js','lineup.js'])w.eval(read(file));
  const container=w.document.getElementById('lineupView');
  const state={type:'rally-lineup-state',artistIds:[],interests:{},currentMember:{id:'john',name:'John'},hiddenDays:['Wednesday','Thursday'],canManageDays:true};
  const options={container,key:'lost-lands-2026:john',state,params:'days=Friday',shareUrl:'https://www.john-ta.com/tools/rally/?view=lineup&event=lost-lands-2026',onEvent:message=>events.push(message),onParams:params=>routes.push(params.toString())};
  w.RallyLineup.show(options);
  return {dom,w,events,routes,container,state,options,element:container.firstElementChild,root:container.firstElementChild.shadowRoot};
}
test('native mobile lineup runs directly in Rally with day filters and isolated styles',()=>{
  const ctx=setup();try{
    assert.equal(ctx.w.document.querySelectorAll('iframe').length,0);
    assert(ctx.root.getElementById('mobile-schedule').textContent.includes('EXCISION'));
    assert(!ctx.root.getElementById('mobile-days').textContent.includes('Wed'));
    assert(ctx.element.classList.contains('rally-mode'));
    assert(ctx.root.querySelector('style').textContent.includes(':host(.rally-mode)'));
    assert.equal(ctx.w.document.querySelector('style'),null);
    assert(!ctx.w.document.documentElement.classList.contains('rally-mode'));
  } finally{ctx.dom.window.close();}
});
test('switching away and back preserves the same component, day, search, and scroll',()=>{
  const ctx=setup();try{
    ctx.root.querySelector('[data-day="Saturday"]').click();
    const input=ctx.root.getElementById('search');input.value='KAI';input.dispatchEvent(new ctx.w.Event('input'));
    ctx.element.scrollTop=460;
    ctx.w.RallyLineup.hide();ctx.container.hidden=true;ctx.container.hidden=false;
    ctx.w.RallyLineup.show({...ctx.options,params:null});
    assert.equal(ctx.container.firstElementChild,ctx.element);
    assert.equal(ctx.root.getElementById('search'),input);assert.equal(input.value,'KAI');
    assert.equal(ctx.element.scrollTop,460);
    assert(ctx.root.getElementById('mobile-schedule').textContent.includes('KAI WACHI'));
    assert(ctx.routes.at(-1).includes('days=Saturday'));
    ctx.w.RallyLineup.show({...ctx.options,params:'q=EXCISION&days=Sunday'});
    assert.equal(input.value,'EXCISION');assert.equal(ctx.element.scrollTop,0);
  } finally{ctx.dom.window.close();}
});
test('favorites, group interest, heatmap, and admin actions use the existing set identities',()=>{
  const ctx=setup(false);try{
    const star=ctx.root.querySelector('#table-body [data-favorite-id]'),id=star.dataset.favoriteId;star.click();
    assert(ctx.events.some(event=>event.type==='rally-lineup-favorites-changed'&&event.artistIds.includes(id)));
    ctx.w.RallyLineup.receive({...ctx.state,artistIds:[id],interests:{[id]:[{id:'john',name:'John',initials:'J'}]}});
    assert.equal(ctx.root.querySelector(`#table-body [data-favorite-id="${id}"]`).getAttribute('aria-pressed'),'true');
    ctx.root.getElementById('heat-view-button').click();
    assert(ctx.root.getElementById('heat-content').querySelector('.interest-matrix'));
    ctx.root.getElementById('manage-days').click();
    assert(ctx.events.some(event=>event.type==='rally-lineup-manage-days'));
    ctx.w.RallyLineup.receive({...ctx.state,canManageDays:false});
    assert.equal(ctx.root.getElementById('manage-days').hidden,true);
  } finally{ctx.dom.window.close();}
});
test('switching accounts destroys the previous member component and preferences',()=>{
  const ctx=setup();try{
    ctx.w.RallyLineup.show({...ctx.options,key:'lost-lands-2026:kevin',state:{...ctx.state,currentMember:{id:'kevin',name:'Kevin'}},params:'days=Sunday'});
    assert.notEqual(ctx.container.firstElementChild,ctx.element);assert.equal(ctx.element.isConnected,false);
    assert.equal(ctx.container.children.length,1);
    ctx.w.RallyLineup.destroy();assert.equal(ctx.container.children.length,0);
  } finally{ctx.dom.window.close();}
});
test('filter/sort dialogs remain scoped to Lineup and close when the view is hidden',()=>{
  const ctx=setup();try{
    ctx.root.getElementById('filter-toggle').click();
    const filters=ctx.root.getElementById('filters-dialog');assert(filters.open);
    ctx.w.RallyLineup.hide();assert(!filters.open);
    ctx.root.getElementById('popularity-sort').click();
    const sort=ctx.root.querySelector('.sort-dialog');assert(sort.open);
    sort.querySelector('[data-sort="popular"]').click();
    assert.equal(ctx.root.querySelector('.sort-dialog'),null);
    assert(ctx.routes.at(-1).includes('sort=popular'));
  } finally{ctx.dom.window.close();}
});
test('standalone schedule still runs through the same controller',()=>{
  const html=read('../../lost-lands-2026-lineup/index.html');
  const dom=new JSDOM(html,{url:'https://www.john-ta.com/lost-lands-2026-lineup/#days=Friday',runScripts:'outside-only'});
  try{
    dom.window.matchMedia=()=>({matches:true,addEventListener(){}});
    dom.window.eval(read('../../lost-lands-2026-lineup/set-times.js'));
    dom.window.eval(read('../../lost-lands-2026-lineup/controller.js'));
    dom.window.createLostLandsLineup();
    assert(dom.window.document.getElementById('mobile-schedule').textContent.includes('EXCISION'));
    assert.equal(dom.window.document.getElementById('account-button').hidden,false);
  } finally{dom.window.close();}
});
test('native assets load before Rally and are included in offline cache',()=>{
  const html=read('index.html'),worker=read('../../rally-sw.js');
  for(const file of ['controller.js','lineup-template.js','lineup.js']){
    assert(html.indexOf(file)<html.indexOf('./app.js'));assert(worker.includes(file));
  }
  assert(!read('app.js').includes('<iframe'));
  assert(!read('app.js').includes('contentWindow'));
});
test('Rally tab navigation preserves the native lineup and routes meetup set links without network loads',async()=>{
  const dom=new JSDOM(read('index.html'),{url:'https://www.john-ta.com/tools/rally/?view=lineup&event=lost-lands-2026',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  try{
    w.matchMedia=()=>({matches:true,addEventListener(){}});w.scrollTo=()=>{};
    w.HTMLElement.prototype.scrollIntoView=function(){};
    w.RallyOffline={native:true,select(){},pendingCount:0};
    w.fetch=()=>{throw Error('Unexpected network load while changing tabs');};
    for(const file of ['../../lost-lands-2026-lineup/set-times.js','../../lost-lands-2026-lineup/controller.js','lineup-template.js','lineup.js','meetups.js'])w.eval(read(file));
    w.fixture={id:'lost-lands-2026',name:'Lost Lands',location:'Ohio',startsAt:'2026-09-18',endsAt:'2026-09-20',currentMemberId:'john',members:[{id:'john',name:'John'}],isAdmin:true,lineupHiddenDays:['Wednesday','Thursday'],currentLineupFavorites:[],lineupInterests:{},rooms:[],travel:[],cars:[],tasks:[],passes:[],meetups:[],notes:[]};
    w.eval(read('app.js').replace('\ninit();','')+'\ndata=window.fixture;events=[data];activeView="lineup";wireShell();render();window.testNavigate=navigateTo;');
    const element=w.document.querySelector('rally-lineup'),root=element.shadowRoot;
    const nav=w.document.querySelector('.nav-glass-group');
    root.querySelector('[data-day="Saturday"]').click();element.scrollTop=380;
    for(const tab of ['home','meetups','lineup'])await w.testNavigate(new w.URL(`https://www.john-ta.com/tools/rally/?view=${tab}&event=lost-lands-2026`));
    assert.equal(w.document.querySelector('rally-lineup'),element);assert.equal(element.scrollTop,380);
    assert.equal(w.document.querySelector('.nav-glass-group'),nav);
    assert.equal(nav.querySelector('[data-nav-view="lineup"]').getAttribute('aria-current'),'page');
    assert.equal(root.querySelector('[data-day="Saturday"]').getAttribute('aria-pressed'),'true');
    assert.equal(w.document.getElementById('page').hidden,true);
    assert.equal(w.document.getElementById('lineupView').hidden,false);
    await w.testNavigate(new w.URL('https://www.john-ta.com/tools/rally/?view=lineup&event=lost-lands-2026&find=EXCISION&day=Sunday'));
    assert.equal(root.getElementById('search').value,'EXCISION');
    assert.equal(root.querySelector('[data-day="Sunday"]').getAttribute('aria-pressed'),'true');
    assert.equal(w.location.search,'?view=lineup&event=lost-lands-2026');
    assert(w.location.hash.includes('days=Sunday'));assert.equal(w.document.querySelector('iframe'),null);
  }finally{w.RallyMeetups?.unmount();w.close();}
});
