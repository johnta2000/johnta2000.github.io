const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{buildSync}=require('esbuild');
const ctx={module:{exports:{}},require,Intl,Date};
vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rallyEventLifecycle.ts'],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text,ctx);
const {lifecycle,configureLifecycle,localInstant}=ctx.module.exports;
test('review mode removes live markers and undims ended sets',()=>{
 const fs=require('node:fs'),{JSDOM}=require('jsdom'),dom=new JSDOM('<article data-set-start="x" class="set-ended set-live"></article><div class="schedule-now"></div><div class="timeline-now"></div>');
 const source=fs.readFileSync(__dirname+'/../../lost-lands-2026-lineup/controller.js','utf8');
 const context={root:dom.window.document,reviewMode:()=>true};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function updateScheduleProgress()'),source.indexOf('function renderTable(')),context);context.updateScheduleProgress();
 assert.equal(dom.window.document.querySelector('.set-ended,.set-live,.schedule-now'),null);assert.equal(dom.window.document.querySelector('.timeline-now').hidden,true);dom.window.close();
});
test('menu collapses past events newest first and keeps every direct event target',()=>{
 const fs=require('node:fs'),{JSDOM}=require('jsdom');const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
 w.RallyEvents={lifecycle};w.escapeAttr=w.escapeHtml=value=>String(value||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');w.dateRange=(a,b)=>a+'–'+b;
 w.eval(fs.readFileSync(__dirname+'/event-history.js','utf8'));
 const events=[{id:'old',name:'Old',endsAt:'2025-01-01',startsAt:'2025-01-01',eventVisibility:'past'},{id:'recent',name:'Recent',endsAt:'2026-09-20',startsAt:'2026-09-18',eventVisibility:'past'},{id:'next',name:'Next',startsAt:'2027-01-01',endsAt:'2027-01-01',eventVisibility:'active'}];
 w.document.body.innerHTML=w.RallyHistory.menu(events,events[0]);const past=w.document.querySelector('details');
 assert.equal(past.open,false);assert.deepEqual([...past.querySelectorAll('button')].map(b=>b.dataset.event),['recent','old']);assert.equal(w.document.querySelector('button').dataset.event,'next');dom.window.close();
});
test('48-hour boundary uses final overnight set in event timezone and preserves data',()=>{
 const event={id:'lost-lands-2026',endsAt:'2026-09-20',lineup:[{date:'2026-09-20',end:'2026-09-21T03:00'}],lineupFavorites:{a:['set-1']}};
 const end=Date.parse('2026-09-21T07:00Z');
 assert.equal(lifecycle(event,end).endAt,end);assert.equal(lifecycle(event,end).finished,true);
 assert.equal(lifecycle(event,end+48*3600000-1).past,false);assert.equal(lifecycle(event,end+48*3600000).past,true);
 assert.deepEqual(event.lineupFavorites,{a:['set-1']});
});
test('date-only fallback accommodates overnight events; timezone handles DST',()=>{
 const result=lifecycle({endsAt:'2026-10-31',eventTimeZone:'America/Los_Angeles'});
 assert.equal(result.endAt,Date.parse('2026-11-01T14:00Z'));
 assert.equal(localInstant('2026-12-31T23:00','America/Denver'),Date.parse('2027-01-01T06:00Z'));
 assert.equal(lifecycle({endsAt:'2026-01-01'}).past,false);
});
test('only admins can move/restore; restore survives automatic cutoff and auto resumes it',()=>{
 const event={startsAt:'2026-09-18',endsAt:'2026-09-20',id:'lost-lands-2026',notes:[{body:'keep'}],lineupFavorites:{a:['x']}};
 const payload={visibility:'active',timeZone:'America/New_York',endsAt:event.endsAt};
 assert.throws(()=>configureLifecycle(event,payload,{role:'member'}));
 configureLifecycle(event,payload,{role:'admin'});assert.equal(lifecycle(event,Date.parse('2026-10-01')).past,false);
 configureLifecycle(event,{...payload,visibility:'auto'},{role:'leader'});assert.equal(lifecycle(event,Date.parse('2026-10-01')).past,true);
 configureLifecycle(event,{...payload,visibility:'past'},{role:'admin'});assert.equal(lifecycle(event,0).past,true);
 assert.deepEqual(event.lineupFavorites,{a:['x']});assert.equal(event.notes[0].body,'keep');
 assert.throws(()=>configureLifecycle(event,{...payload,timeZone:'EDT'},{role:'admin'}));
});
