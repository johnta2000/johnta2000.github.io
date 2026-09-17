const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const read=path=>fs.readFileSync(__dirname+'/'+path,'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const server={module:{exports:{}},require,TextEncoder};
vm.runInNewContext(transformSync(read('../../convex/rallyMeetups.ts'),{loader:'ts',format:'cjs'}).code,server);
const {updateMeetups}=server.module.exports;
const author={id:'jessi',name:'Jessi',role:'member'},other={id:'kevin',name:'Kevin',role:'member'},admin={id:'john',name:'John',role:'admin'};
const eventId='lost-lands-2026';
const details={title:'Meet before Excision',spot:'Entrance merch booth',instructions:'Look for the yellow totem.',when:'2026-09-18T18:00',x:.5,y:.8};
const run=(rows,action,payload,member=author,now=100,id='meetup1')=>updateMeetups(rows,eventId,action,payload,member,now,()=>id);
const create=()=>run(undefined,'add-meetup',details);
const ui={window:{},Intl,Date};
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
