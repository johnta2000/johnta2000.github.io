const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {transformSync,buildSync}=require('esbuild');
const read=path=>fs.readFileSync(__dirname+'/'+path,'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const server={module:{exports:{}},require,TextEncoder};
vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rallyMeetups.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text,server);
const {updateMeetups}=server.module.exports;
const author={id:'jessi',name:'Jessi',role:'member'},other={id:'kevin',name:'Kevin',role:'member'},admin={id:'john',name:'John',role:'admin'};
const eventId='lost-lands-2026';
const details={title:'Meet before Excision',spot:'Entrance merch booth',instructions:'Look for the yellow totem.',when:'2026-09-18T18:00',x:.5,y:.8};
const run=(rows,action,payload,member=author,now=100,id='meetup1')=>updateMeetups(rows,eventId,action,payload,member,now,()=>id);
const create=()=>run(undefined,'add-meetup',details);
const ui={window:{},Intl,Date};
vm.runInNewContext(read('meetup-timing.js'),ui);
vm.runInNewContext(read('meetups.js'),ui);
const {coordinates,timeLabel,cards,MAP,LANDMARKS}=ui.window.RallyMeetups;

test('meetups use authenticated identity, server ID and festival timezone; spoofed add ID cannot overwrite',()=>{
 const first=create();
 const next=run(first,'add-meetup',{...details,id:'meetup1',authorId:'john',goingIds:['john'],timeZone:'Europe/London',createdAt:0},other,200,'meetup2');
 assert.equal(next.length,2);assert.deepEqual(plain(next[0]),plain(first[0]));
 assert.equal(next[1].id,'meetup2');assert.equal(next[1].authorId,'kevin');
 assert.deepEqual(plain(next[1].goingIds),['kevin']);assert.equal(next[1].timeZone,'America/New_York');
 assert.equal(next[1].mapId,eventId);assert.equal(next[1].createdAt,200);
});
test('meeting point, date, status, text and project boundaries are validated',()=>{
 for(const changes of [{x:-.1},{x:1.01},{y:NaN},{x:'0.5'},{when:'2026-09-22T18:00'},{when:'2026-09-20T24:00'},{when:'2026-09-18T18:00Z'},{title:' '},{title:'x'.repeat(101)},{spot:''},{instructions:'x'.repeat(1201)},{status:'unknown'}]){
  assert.throws(()=>run([],'add-meetup',{...details,...changes}));
 }
 assert.equal(run([],'add-meetup',{...details,when:'2026-09-21T01:00',x:0,y:1}).length,1);
 assert.throws(()=>updateMeetups([],'edc','add-meetup',details,author,1,()=>''),/only available/);
 const full=Array.from({length:100},(_,i)=>({...create()[0],id:String(i)}));
 assert.throws(()=>run(full,'add-meetup',details),/too many/);
});
test('organizers/admins can edit or delete; stale edits and strangers are rejected',()=>{
 const first=create(),payload={...details,id:'meetup1',expectedUpdatedAt:100,title:'Moved'};
 for(const action of ['edit-meetup','delete-meetup']){
  assert.throws(()=>run(first,action,payload,other),/Only the organizer/);
  assert.throws(()=>run(first,action,{...payload,expectedUpdatedAt:99}),/changed/);
  assert.throws(()=>run(first,action,{...payload,id:'another-room-id'},admin),/no longer exists/);
 }
 for(const member of [author,admin,{...admin,role:'leader'}]){
  const edited=run(first,'edit-meetup',payload,member);
  assert.equal(edited[0].title,'Moved');assert.equal(edited[0].updatedAt,101);
  assert.equal(edited[0].authorId,'jessi');assert.equal(edited[0].createdAt,100);
  assert.equal(run(first,'delete-meetup',payload,member).length,0);
 }
});
test('RSVP only changes yourself; retries are idempotent; joining does not invalidate organizer edits',()=>{
 let rows=run(create(),'join-meetup',{id:'meetup1',going:true,memberId:'john'},other);
 rows=run(rows,'join-meetup',{id:'meetup1',going:true},other);
 assert.deepEqual(plain(rows[0].goingIds),['jessi','kevin']);
 assert.equal(rows[0].updatedAt,100);
 rows=run(rows,'edit-meetup',{...details,id:'meetup1',expectedUpdatedAt:100,status:'cancelled'},author,200);
 assert.deepEqual(plain(rows[0].goingIds),['jessi','kevin']);
 assert.throws(()=>run(rows,'join-meetup',{id:'meetup1',going:true},other),/cancelled/);
 assert.throws(()=>run(create(),'join-meetup',{id:'meetup1',going:'yes'},other),/whether/);
 assert.equal(run(create(),'join-meetup',{id:'meetup1',going:false})[0].goingIds.length,0);
});
test('writes are membership protected and preserve preferences, hotels and notes',()=>{
 const backend=read('../../convex/rally.ts');
 const handler=backend.slice(backend.indexOf('export const act = mutation('));
 assert(handler.indexOf('await requireIdentity(ctx)')<handler.indexOf('state.meetups = updateMeetups'));
 assert(handler.indexOf('if (!current) throw')<handler.indexOf('state.meetups = updateMeetups'));
 const statement=handler.split('\n').find(line=>line.includes('state.meetups = updateMeetups'));
 const state={id:eventId,lineupFavorites:{jessi:['set1']},notes:[{body:'Hotel parking'}],rooms:[{hotel:'Hyatt'}]};
 const before=plain(state);
 vm.runInNewContext(statement,{state,updateMeetups,args:{action:'add-meetup'},p:details,current:author,Date,id:()=> 'meetup1'});
 assert.equal(state.meetups.length,1);
 delete state.meetups;assert.deepEqual(state,before);
 assert(backend.includes('meetup.goingIds.filter((memberId: string) => memberId !== p.id)'));
});
test('map pins remain proportional at any zoom and are clamped to the image',()=>{
 assert.deepEqual(plain(coordinates(160,280,{left:10,top:20,width:300,height:520})),{x:.5,y:.5});
 assert.deepEqual(plain(coordinates(310,540,{left:10,top:20,width:600,height:1040})),{x:.5,y:.5});
 assert.deepEqual(plain(coordinates(-1,999,{left:0,top:0,width:100,height:100})),{x:0,y:1});
 for(const pin of LANDMARKS)assert(pin.x>=0&&pin.x<=1&&pin.y>=0&&pin.y<=1);
});
test('EDT time labels and next-day dates are explicit regardless of device timezone',()=>{
 assert.equal(timeLabel('2026-09-18T18:00'),'Fri, Sep 18 · 6:00 PM EDT');
 assert.equal(timeLabel('2026-09-21T00:30'),'Mon, Sep 21 · 12:30 AM EDT');
 assert.equal(timeLabel('2026-09-19T12:00'),'Sat, Sep 19 · 12:00 PM EDT');
});
test('cards escape text, show joining crew, enforce UI permissions and use scoped links',()=>{
 const room={id:eventId,members:[author,other],currentMemberId:'kevin',isAdmin:false,meetups:create()};
 room.meetups[0].title='<img onerror=bad()>';
 let html=cards(room,null,false);
 assert(html.includes('&lt;img onerror=bad()&gt;'));assert(!html.includes('<img'));
 assert(html.includes('1 joining'));assert(html.includes('Jessi'));
 assert(html.includes('event=lost-lands-2026&focus=meetup1'));
 assert(!html.includes('data-meetup-edit'));
 room.isAdmin=true;assert(cards(room,null,false).includes('data-meetup-edit'));
 assert(cards(room,null,true).includes('disabled'));
 room.currentMemberId='jessi';assert(cards(room,null,false).includes('aria-pressed="true"'));
 room.meetups[0].status='cancelled';assert(!cards(room,null,false).includes('data-meetup-join'));
});
test('saved meetups survive a cold offline load but never switch into another account',()=>{
 const storage=new Map(),context={window:{dispatchEvent(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Event:class{},location:{protocol:'https:'}};
 vm.runInNewContext(read('offline.js'),context);
 let cache=context.window.RallyOffline;cache.identify('user1');
 cache.save({id:eventId,members:[author],meetups:create(),currentLineupFavorites:['set1']});
 vm.runInNewContext(read('offline.js'),context);cache=context.window.RallyOffline;
 assert.equal(cache.room(eventId).meetups[0].title,details.title);
 assert.deepEqual(plain(cache.room(eventId).currentLineupFavorites),['set1']);
 cache.identify('user2');assert(!cache.room(eventId));
});
test('map and meetup code are precached, parse cleanly, and load before app initialization',()=>{
 const sw=read('../../rally-sw.js'),context={self:{addEventListener(){} }};
 vm.runInNewContext(sw+';globalThis.assets=ASSETS;',context);
 for(const asset of ['/tools/rally/meetups.js','/tools/rally/meetups.css',MAP]){
  assert(context.assets.includes(asset));assert(fs.existsSync(__dirname+'/../..'+asset));
 }
 const html=read('index.html');
 assert(html.indexOf('./meetups.js')<html.indexOf('./app.js'));
 assert(html.includes('./meetups.css'));
 new vm.Script(read('app.js'));new vm.Script(read('meetups.js'));
 transformSync(read('meetups.css'),{loader:'css'});
});
test('late meetup responses do not replace another room or another account',async()=>{
 const app=read('app.js');let captured,resolve;
 const context={activeEvent:eventId,activeView:'meetups',data:{id:eventId},offlineMode:false,navigator:{onLine:true},el:{page:{}},showToast(){},updateOfflineStatus(){},window:{Clerk:{user:{id:'u1'}},RallyMeetups:{mount:ctx=>captured=ctx}},convexMutation:()=>new Promise(r=>resolve=r)};
 vm.runInNewContext(app.slice(app.indexOf('function renderMeetups('),app.indexOf('function noteSection(')),context);
 context.renderMeetups();
 const pending=captured.mutate('add-meetup',details);context.activeEvent='edc';context.data={id:'edc'};
 resolve({id:eventId,meetups:create()});await pending;assert.equal(context.data.id,'edc');
 context.window.Clerk.user.id='u2';
 await assert.rejects(captured.mutate('add-meetup',details),/account changed/);
});

const scheduleContext={window:{}};
vm.runInNewContext(read('../../lost-lands-2026-lineup/set-times.js'),scheduleContext);
const officialSets=scheduleContext.window.LOST_LANDS_SET_TIMES;
const timingContext={module:{exports:{}},require};
vm.runInNewContext(transformSync(read('../../convex/meetupTiming.ts'),{loader:'ts',format:'cjs'}).code,timingContext);
const resolveTiming=timingContext.module.exports.resolveMeetupTiming;
const sampleSets=[
 {id:'one',artist:'Artist A',stage:'Stage A',day:'Friday',festivalDate:'2026-09-18',start:'2026-09-18T23:00',end:'2026-09-19T00:00'},
 {id:'two',artist:'Artist B',stage:'Stage B',day:'Friday',festivalDate:'2026-09-18',start:'2026-09-19T00:30',end:'2026-09-19T01:30'},
 {id:'overlap',artist:'Artist C',stage:'Stage C',day:'Friday',festivalDate:'2026-09-18',start:'2026-09-18T23:30',end:'2026-09-19T00:30'},
 {id:'other-day',artist:'Artist D',stage:'Stage A',day:'Saturday',festivalDate:'2026-09-19',start:'2026-09-19T23:00',end:'2026-09-20T00:00'},
];
test('before, after and between use festival wall-clock time and handle midnight',()=>{
 assert.equal(resolveTiming({mode:'before',setId:'one',minutes:15},sampleSets).when,'2026-09-18T22:45');
 assert.equal(resolveTiming({mode:'after',setId:'one',minutes:10},sampleSets).when,'2026-09-19T00:10');
 const result=resolveTiming({mode:'between',setId:'one',nextSetId:'two',minutes:5},sampleSets);
 assert.equal(result.when,'2026-09-19T00:05');
 assert.equal(result.timing.label,'Between Artist A and Artist B');
 assert.equal(result.timing.sets.length,2);
 assert.equal(result.timing.sets[1].stage,'Stage B');
});
test('between rejects overlaps, reversed order, different festival days and offsets past the next set',()=>{
 for(const choice of [
  {mode:'between',setId:'one',nextSetId:'overlap',minutes:0},
  {mode:'between',setId:'two',nextSetId:'one',minutes:0},
  {mode:'between',setId:'one',nextSetId:'other-day',minutes:0},
  {mode:'between',setId:'one',nextSetId:'one',minutes:0},
  {mode:'between',setId:'one',nextSetId:'two',minutes:31},
  {mode:'before',setId:'one',minutes:-1},
  {mode:'after',setId:'one',minutes:121},
  {mode:'before',setId:'unknown',minutes:15},
 ])assert.throws(()=>resolveTiming(choice,sampleSets));
 assert.deepEqual(plain(ui.RallyMeetupTiming.availableNextSets('one',sampleSets)).map(s=>s.id),['two']);
});
test('generated browser timing stays identical to server timing for every performance',()=>{
 for(const set of officialSets)for(const mode of ['before','after']){
  const choice={mode,setId:set.id,minutes:15};
  assert.deepEqual(plain(ui.RallyMeetupTiming.resolveMeetupTiming(choice,officialSets)),plain(resolveTiming(choice,officialSets)));
 }
});
test('backend derives linked time and context from official set IDs, not user-submitted labels or timestamps',()=>{
 const set=officialSets.find(s=>s.artist==='EXCISION');
 assert(set);
 const rows=run([],'add-meetup',{...details,when:'WRONG',timing:{mode:'before',setId:set.id,minutes:15,label:'Forged',sets:[{artist:'Fake'}]}});
 const expected=resolveTiming({mode:'before',setId:set.id,minutes:15},officialSets);
 assert.equal(rows[0].when,expected.when);assert.equal(rows[0].timing.label,expected.timing.label);
 assert.equal(rows[0].timing.sets[0].artist,set.artist);
 assert.throws(()=>run([],'add-meetup',{...details,timing:{mode:'before',setId:'fake',minutes:15}}),/Choose a set/);
 const edited=run(rows,'edit-meetup',{...details,when:rows[0].when,id:'meetup1',expectedUpdatedAt:100},author,200);
 assert.equal(edited[0].timing.setId,set.id); // Older clients preserve the relationship.
 assert.throws(()=>run(rows,'edit-meetup',{...details,when:'2026-09-19T18:00',id:'meetup1',expectedUpdatedAt:100}),/linked to a set/);
 const custom=run(rows,'edit-meetup',{...details,timing:null,id:'meetup1',expectedUpdatedAt:100},author,200);
 assert.equal(custom[0].timing,null);assert.equal(custom[0].when,details.when);
});
test('repeated secret takeover names are linked to the exact performance, not every matching artist',()=>{
 const repeats=officialSets.filter(s=>s.artist==='SECRET TAKEOVER');
 assert(repeats.length>1);
 const rows=run([],'add-meetup',{...details,timing:{mode:'before',setId:repeats[1].id,minutes:10}});
 assert.equal(rows[0].timing.setId,repeats[1].id);
 assert.equal(rows[0].timing.sets[0].start,repeats[1].start);
 assert.equal(rows[0].timing.sets.length,1);
});
test('linked cards expose the precise Lineup links and keep context in the offline snapshot',()=>{
 const set=officialSets[0],rows=run([],'add-meetup',{...details,timing:{mode:'before',setId:set.id,minutes:15}});
 const html=cards({id:eventId,members:[author],currentMemberId:author.id,meetups:rows},null,true);
 assert(html.includes('view=lineup'));assert(html.includes('focus='+encodeURIComponent(set.id)));
 assert(html.includes('day='+encodeURIComponent(set.day)));assert(html.includes('15 min before'));
 assert.equal(plain(rows)[0].timing.sets[0].stage,set.stage);
});
test('Lineup is a primary bottom tab and Crew remains in More, without duplicate Lineup tabs',()=>{
 const app=read('app.js'),nav={};
 const ctx={data:{id:eventId},DEFAULT_EVENT:eventId,activeView:'crew',document:{getElementById:()=>nav},href:view=>'?view='+view,openProjectSearch(){},requestAnimationFrame(){},sendLineupLayout(){}};
 vm.runInNewContext(app.slice(app.indexOf('function renderMobileNav('),app.indexOf('function sendLineupLayout(')),ctx);
 ctx.renderMobileNav();
 assert.equal((nav.innerHTML.match(/href="\?view=lineup"/g)||[]).length,1);
 assert(nav.innerHTML.includes('href="?view=meetups"'));assert(!nav.innerHTML.includes('href="?view=crew"'));
 assert(nav.innerHTML.includes('id="quickMore" aria-current="page"'));
});
test('a refresh started before a write cannot overwrite newer meetups or their offline snapshot',async()=>{
 let captured,resolveRead,saves=0;
 const app=read('app.js'),ctx={activeEvent:eventId,activeView:'meetups',data:{id:eventId},offlineMode:false,navigator:{onLine:true},el:{page:{}},showToast(){},updateOfflineStatus(){},window:{Clerk:{user:{id:'u1'}},RallyMeetups:{mount:c=>captured=c}},RallyOffline:{userId:'u1',save:r=>{saves++;return r;}},networkConvexCall:()=>new Promise(r=>resolveRead=r),convexMutation:async()=>({id:eventId,meetups:create()})};
 vm.runInNewContext(app.slice(app.indexOf('function renderMeetups('),app.indexOf('function noteSection(')),ctx);
 ctx.renderMeetups();
 const query=captured.query();await captured.mutate('add-meetup',details);
 resolveRead({id:eventId,meetups:[]});
 await assert.rejects(query,/newer meetup/);assert.equal(ctx.data.meetups.length,1);assert.equal(saves,0);
});
test('mobile editor avoids automatic keyboard focus and accidental pin placement while scrolling',()=>{
 const source=read('meetups.js');
 assert(source.includes('data-close autofocus'));assert(!source.includes('input name="title" autofocus'));
 assert(source.includes('down=placing&&event.isPrimary'));assert(source.includes("placement(false)"));
 const select=source.slice(source.indexOf('function select('),source.indexOf('function draw('));
 assert(!select.includes('draw()'));assert(select.includes("classList.toggle('selected'"));
 assert(source.includes('meetup-editor-scroll'));assert(source.includes('meetup-editor-actions'));
 assert(source.includes('data-confirm-delete'));assert(!source.includes("confirm('Delete"));
 assert(source.includes("document.body.style.overflow=previousOverflow"));
 const html=read('index.html');
 assert(html.indexOf('./meetup-timing.js')<html.indexOf('./meetups.js'));
 assert(read('../../rally-sw.js').includes('/tools/rally/meetup-timing.js'));
});

test('next meetup advances in festival time, skips cancellations and preserves past plans',()=>{
 const {upcomingMeetups,eventNow}=ui.window.RallyMeetups;
 const rows=[
  {...create()[0],id:'late',when:'2026-09-19T00:15'},
  {...create()[0],id:'cancelled',when:'2026-09-18T23:55',status:'cancelled'},
  {...create()[0],id:'early',when:'2026-09-18T23:50'},
 ];
 const original=plain(rows);
 assert.deepEqual(plain(upcomingMeetups(rows,'2026-09-18T23:49')).map(m=>m.id),['early']);
 assert.deepEqual(plain(upcomingMeetups(rows,'2026-09-18T23:50')).map(m=>m.id),['early']);
 assert.deepEqual(plain(upcomingMeetups(rows,'2026-09-18T23:51')).map(m=>m.id),['late']);
 assert.equal(upcomingMeetups(rows,'2026-09-19T00:16').length,0);
 assert.deepEqual(plain(rows),original);
 assert.equal(eventNow(new Date('2026-09-19T03:51:00Z')),'2026-09-18T23:51');
 assert.equal(eventNow(new Date('2026-09-19T04:15:00Z')),'2026-09-19T00:15');
});
test('simultaneous next meetups are both highlighted; empty and all-cancelled plans have no bright pin',()=>{
 const {upcomingMeetups,upcomingMarkup}=ui.window.RallyMeetups;
 const rows=[...create(),{...create()[0],id:'other'}];
 assert.equal(upcomingMeetups(rows,'2026-09-18T17:59').length,2);
 assert.equal(upcomingMeetups([],'2026-09-18T17:59').length,0);
 assert.equal(upcomingMeetups(rows.map(m=>({...m,status:'cancelled'})),'2026-09-18T17:59').length,0);
 assert.equal(upcomingMarkup({meetups:rows},'2026-09-18T18:01'),'');
 assert.equal(upcomingMarkup({meetups:[]},'2026-09-18T17:59'),'');
 assert.equal(upcomingMarkup({meetups:rows.map(m=>({...m,status:'cancelled'}))},'2026-09-18T17:59'),'');
 rows[0].title='<script>bad()</script>';
 const html=upcomingMarkup({meetups:rows},'2026-09-18T17:59');
 assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));
 assert.equal((html.match(/data-meetup-detail=/g)||[]).length,2);
});
test('time ticks only update highlighting and badges, without rerendering cards or moving focus',()=>{
 let now='2026-09-18T17:59',wires=0;
 const rows=[...create(),{...create()[0],id:'later',when:'2026-09-18T18:30'}];
 const makeNode=id=>{
  const classes=new Set(),badge={},attrs={};
  return {dataset:{meetupId:id,mapPin:id},classes,badge,attrs,classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)},querySelector:()=>badge,setAttribute:(key,value)=>attrs[key]=value};
 };
 const cards=rows.map(m=>makeNode(m.id)),pins=rows.map(m=>makeNode(m.id)),banner={};
 const host={querySelector:()=>banner,querySelectorAll:selector=>selector==='[data-map-pin]'?pins:cards};
 const ctx={room:{meetups:rows},current:()=>true,host,details:null,lastMinute:'',nextSignature:'',eventNow:()=>now,wireActions:()=>wires++,...ui.window.RallyMeetups};
 ctx.eventNow=()=>now;
 const source=read('meetups.js');
 vm.runInNewContext(source.slice(source.indexOf('function updateClock('),source.indexOf('function resumeClock(')),ctx);
 ctx.updateClock();assert(pins[0].classes.has('next-up'));assert(!pins[1].classes.has('next-up'));assert.equal(cards[0].badge.textContent,'Next up');
 now='2026-09-18T18:01';ctx.updateClock();
 assert(!pins[0].classes.has('next-up'));assert(pins[0].classes.has('past'));assert(pins[1].classes.has('next-up'));assert.equal(cards[0].badge.textContent,'Past');
 assert(pins[1].attrs['aria-label'].includes('Next up'));assert.equal(wires,2);
 ctx.updateClock();assert.equal(wires,2);
 assert.equal(banner.hidden,false);
 now='2026-09-18T18:31';ctx.updateClock();assert.equal(banner.hidden,true);assert.equal(banner.innerHTML,'');
});
test('meetups header keeps the primary action without redundant introductory copy',()=>{
 const source=read('meetups.js'),css=read('meetups.css');
 assert(source.includes('class="page-heading meetups-heading"><h1>Meetups</h1>'));
 assert(!source.includes('A place, a time, and a plan.'));
 assert(!source.includes('Add a meetup to light up'));
 assert(css.includes('.meetup-next[hidden]{display:none}'));
 assert(css.includes('.meetups-heading .primary{width:auto;min-height:44px;'));
});
test('detail rendering scopes to the clicked pin while retaining original map number and authorized actions',()=>{
 const room={id:eventId,members:[author,other],currentMemberId:other.id,isAdmin:false,meetups:[...create(),{...create()[0],id:'second',title:'Second meetup',instructions:'Find the blue totem',when:'2026-09-18T19:00'}]};
 const html=cards(room,'second',true,'2026-09-18T18:30','second');
 assert(html.includes('Second meetup'));assert(html.includes('Find the blue totem'));
 assert(html.includes('meetup-number">2</span>'));assert(html.includes('Jessi'));
 assert(!html.includes('data-meetup-id="meetup1"'));assert(!html.includes('data-meetup-edit'));
 assert(html.includes('disabled'));assert(html.includes('data-meetup-copy'));assert(!html.includes('data-meetup-detail'));
 room.currentMemberId=author.id;assert(cards(room,'second',false,'2026-09-18T18:30','second').includes('data-meetup-edit'));
});
test('the main map stays open, pin taps open an accessible modal, and the clock is cleaned up on navigation',()=>{
 const source=read('meetups.js'),css=read('meetups.css');
 assert(source.includes('<section class="meetup-map-panel" aria-label="Festival map">'));
 assert(!source.includes("querySelector('.meetup-map-panel').open=false"));
 assert(source.includes("button.onclick=()=>openDetails(button.dataset.mapPin)"));
 assert(source.includes("dialog.setAttribute('aria-labelledby','meetupDetailTitle')"));
 assert(source.includes('data-detail-close autofocus'));
 assert(source.includes("closeDetails(false);openEditor(meetup)"));
 assert(source.includes('clearInterval(clockTimer)'));assert(source.includes("document.removeEventListener('visibilitychange',resumeClock)"));
 assert(source.includes('clockTimer=setInterval(resumeClock,10000)'));
 assert(source.includes("document.addEventListener('visibilitychange',resumeClock)"));
 assert(css.includes('.meetup-pin.selected:not(.next-up)'));
 assert(css.includes('.meetup-pin.next-up::after'));assert(css.includes('content:"NEXT"'));
});
