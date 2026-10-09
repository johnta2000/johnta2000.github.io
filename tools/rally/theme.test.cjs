const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
function setup(){
 const dom=new JSDOM(read('index.html'),{url:'https://example.test/tools/rally/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.RallyOffline={native:false};w.HTMLElement.prototype.scrollIntoView=function(){};
 w.eval(read('../../assets/js/searchable-select.js'));w.eval(read('app.js').replace('\ninit();',''));
 return dom;
}
test('one theme is loaded last in the shell and baked into the native lineup',()=>{
 const html=read('index.html');assert(html.indexOf('theme.css')>html.indexOf('</style>'));
 const vm=require('node:vm'),ctx={window:{}};vm.runInNewContext(read('lineup-template.js'),ctx);
 assert(ctx.window.RallyLineupTemplate.css.endsWith(read('project-theme.css')));
 assert(ctx.window.RallyLineupTemplate.css.includes(read('theme.css')));
 const sw=read('../../rally-sw.js');for(const asset of ['theme.css','searchable-select.js','searchable-select.css'])assert(sw.includes(asset));
});
test('toast announcements are neutral, readable, replaceable and dismissed without stealing focus',()=>{
 const dom=setup(),w=dom.window;
 try{
  const toast=w.document.getElementById('toast');
  let dismiss;w.setTimeout=fn=>{dismiss=fn;return 1;};
  const focus=w.document.getElementById('accountButton');focus.focus();
  w.showToast('Could not save. Reconnect and try again.');
  assert.equal(toast.textContent,'Could not save. Reconnect and try again.');
  assert.equal(toast.getAttribute('role'),'status');assert.equal(toast.getAttribute('popover'),'manual');
  assert.equal(toast.hidden,false);assert.equal(w.document.activeElement,focus);
  w.showToast('Saved');assert.equal(w.document.querySelectorAll('#toast').length,1);
  dismiss();assert.equal(toast.hidden,true);
  const css=read('theme.css');assert.match(css,/background: var\(--card\); color: var\(--ink\)/);
  assert.match(css,/bottom: var\(--rally-nav-clearance/);
 }finally{w.close();}
});
test('dialog pickers keep native form values, labels, keyboard choice, empty state and disabled options',()=>{
 const dom=setup(),w=dom.window;
 try{
  w.openDialog('Test','',w.selectField('Status','status',[['todo','To do'],['doing','In progress'],['done','Done']],'todo'),()=>{});
  const select=w.document.querySelector('select'),trigger=w.document.querySelector('.search-select-trigger');
  assert(select.id);assert.equal(select.getAttribute('aria-label'),'Status');assert.equal(new w.FormData(select.form).get('status'),'todo');
  select.options[2].disabled=true;
  trigger.click();const search=w.document.querySelector('.search-select-input');
  search.value='nonsense';search.dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelector('.search-select-empty').hidden,false);
  search.value='progress';search.dispatchEvent(new w.Event('input'));search.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  assert.equal(select.value,'doing');assert.equal(new w.FormData(select.form).get('status'),'doing');assert.equal(w.document.activeElement,trigger);
  select.value='todo';w.SearchableSelect.enhance(select).sync();assert(trigger.textContent.includes('To do'));
  trigger.click();assert.equal(w.document.querySelector('[role=option][aria-disabled=true]').textContent,'Done');
  w.closeDialog();assert.equal(w.document.querySelector('.search-select-panel'),null);
 }finally{w.close();}
});
test('navigation shares SVG icons and exposes the selected destination',()=>{
 const dom=setup(),w=dom.window;
 try{
  for(const id of ['home','stay','crew','travel','passes','tasks','lineup','meetups','notes'])assert(w.rallyIcon(id).includes('class="rally-icon"'));
  assert(read('app.js').includes('aria-current="page"'));
 }finally{w.close();}
});
test('routine event settings live in the project menu; past-event notices remain visible',()=>{
 const dom=setup(),w=dom.window;
 try{
  w.document.getElementById('page').insertAdjacentHTML('beforebegin','<div id="offlineStatus"></div>');
  w.eval(read('event-history.js'));
  w.RallyEvents={lifecycle:()=>({finished:false,past:false})};
  w.RallyHistory.mount({isAdmin:true});assert.equal(w.document.getElementById('eventHistoryBanner').parentElement.id,'eventMenu');
  w.RallyEvents.lifecycle=()=>({finished:true,past:true});
  w.RallyHistory.mount({isAdmin:true});assert.equal(w.document.getElementById('offlineStatus').nextElementSibling.id,'eventHistoryBanner');
  assert.equal(w.document.querySelectorAll('#eventHistoryBanner').length,1);
 }finally{w.close();}
});
