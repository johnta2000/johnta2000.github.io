const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(__dirname+'/'+file,'utf8');
const themes=read('project-theme.js'),app=read('app.js').replace('\ninit();','');
test('head loads the palette before CSS, and the boot shell never brands itself as Lost Lands',()=>{
 const html=read('index.html');
 assert(html.indexOf('project-theme.js')<html.indexOf('styles.css'));
 assert(!html.includes('<strong id="eventName">Lost Lands'));
 assert(html.includes('.booting #rallyApp{visibility:hidden}'));
 assert(html.includes('role="status" aria-live="polite"><strong>Rally</strong><p>Loading project…'));
});
test('only trusted project palette IDs are remembered before first paint; a direct link never borrows another event palette',()=>{
 const dom=new JSDOM('<meta name="theme-color">',{url:'https://example.test/tools/rally/?event=midnight',runScripts:'outside-only'}),w=dom.window;
 try{
  w.localStorage.setItem('rally-project-palettes-v1',JSON.stringify([['midnight','midnight'],['other','niteharts']]));w.eval(themes);
  assert.equal(w.document.documentElement.dataset.projectTheme,'midnight');
  assert.equal(w.document.documentElement.style.getPropertyValue('--rally-loading-paper'),'#14131e');
  w.RallyProjectThemes.prepare('new-event');assert.equal(w.document.documentElement.style.getPropertyValue('--rally-loading-paper'),'#18181b');
  w.RallyProjectThemes.remember('midnight','ocean');w.RallyProjectThemes.prepare('midnight');assert.equal(w.document.documentElement.dataset.projectTheme,'ocean');
  w.RallyProjectThemes.remember('midnight','url(unsafe)');assert.equal(JSON.parse(w.localStorage.getItem('rally-project-palettes-v1')).find(entry=>entry[0]==='midnight')[1],'ocean');
  assert.equal(w.localStorage.getItem('rally-offline-v1'),null,'Palette code never reads or stores private room snapshots');
  w.RallyProjectThemes.clear();assert.equal(w.localStorage.getItem('rally-project-palettes-v1'),null);
 }finally{w.close();}
});
test('missing, corrupted, or denied palette storage safely uses a neutral loader',()=>{
 for(const stored of [null,'broken',JSON.stringify([['room','invalid']])]){
  const dom=new JSDOM('',{url:'https://example.test/?event=room',runScripts:'outside-only'}),w=dom.window;
  try{if(stored)w.localStorage.setItem('rally-project-palettes-v1',stored);w.eval(themes);assert.equal(w.document.documentElement.style.getPropertyValue('--rally-loading-paper'),'#18181b');}finally{w.close();}
 }
 const dom=new JSDOM('',{runScripts:'outside-only'});try{dom.window.eval(themes);dom.window.RallyProjectThemes.remember('room','midnight');assert.equal(dom.window.document.documentElement.style.getPropertyValue('--rally-loading-paper'),'#18181b');}finally{dom.window.close();}
});
function harness(search='?event=midnight'){
 const dom=new JSDOM(read('index.html'),{url:'https://example.test/tools/rally/'+search,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.RallyOffline={identify(){},native:false,select(){},events:[],room(){return null;}};
 w.Clerk={user:{id:'qa'},isSignedIn:true};w.scrollTo=()=>{};
 w.eval(themes);w.eval(read('event-lifecycle.js'));w.eval(app+'\nactiveEvent=new URLSearchParams(location.search).get("event");window.qaCurrent=()=>data;');
 w.render=()=>{const room=w.qaCurrent();w.RallyProjectThemes.apply(room.projectTheme);w.document.getElementById('eventName').textContent=room.name;};
 w.updateOfflineStatus=()=>{};w.syncFavorites=async()=>{};
 return {w,close:()=>w.close()};
}
test('a delayed direct project response stays behind the loader until the final palette is applied',async()=>{
 const {w,close}=harness();try{
  let resolve,started;const requested=new Promise(r=>started=r);w.convexQuery=async()=>[{id:'midnight',name:'Midnight'}];w.convexMutation=()=>new Promise(r=>{resolve=r;started();});
  const pending=w.unlock();await requested;
  assert(w.document.body.classList.contains('booting'));assert.equal(w.qaCurrent(),null);
  resolve({id:'midnight',name:'Midnight Carnival',projectTheme:'midnight'});await pending;
  assert(!w.document.body.classList.contains('booting'));assert.equal(w.document.documentElement.dataset.projectTheme,'midnight');assert.equal(w.document.getElementById('eventName').textContent,'Midnight Carnival');
 }finally{close();}
});
test('overlapping project switches cannot render a stale response or apply its palette',async()=>{
 const {w,close}=harness();try{
  const pending=new Map();w.convexMutation=(_path,args)=>new Promise(r=>pending.set(args.eventId,r));w.convexQuery=async()=>[];
  const first=w.navigateTo(new w.URL('https://example.test/tools/rally/?event=a'));
  const second=w.navigateTo(new w.URL('https://example.test/tools/rally/?event=b'));
  pending.get('b')({id:'b',name:'New project',projectTheme:'midnight'});await second;
  pending.get('a')({id:'a',name:'Wrong project',projectTheme:'warm'});await first;
  assert.equal(w.qaCurrent().id,'b');assert.equal(w.document.documentElement.dataset.projectTheme,'midnight');assert.equal(w.document.getElementById('eventName').textContent,'New project');
 }finally{close();}
});
test('generic offline startup chooses the saved selected room instead of defaulting to Lost Lands',()=>{
 const {w,close}=harness('');try{
  w.RallyOffline.lastEvent='midnight';w.RallyOffline.events=[{id:'lost-lands-2026'},{id:'midnight'}];
  w.RallyOffline.room=id=>id==='midnight'?{id,name:'Midnight',projectTheme:'midnight'}:null;
  assert(w.openSavedRoom());assert.equal(w.qaCurrent().id,'midnight');assert(!w.document.body.classList.contains('booting'));
 }finally{close();}
});
test('project links include the event ID even for Lost Lands, so reloading does not select a different room',()=>{
 const {w,close}=harness();try{
  assert.equal(new w.URL(w.href('home','lost-lands-2026'),w.location.href).searchParams.get('event'),'lost-lands-2026');
  assert.equal(new w.URL(w.href('passes','midnight'),w.location.href).searchParams.get('event'),'midnight');
 }finally{close();}
});
