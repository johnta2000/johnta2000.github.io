const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{buildSync}=require('esbuild');
const sandbox={module:{exports:{}},require,console,URL,crypto:require('node:crypto').webcrypto};
vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rallyCollection.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text,sandbox);
const api=sandbox.module.exports;
function setup(){let current=null,sequence=0;const docs=[];const ctx={auth:{getUserIdentity:async()=>current},db:{
 query(table){const filters=[];const chain={eq(k,v){filters.push([k,v]);return chain;},withIndex(_,fn){fn(chain);return chain;},async collect(){return docs.filter(d=>d._table===table&&filters.every(([k,v])=>d[k]===v));},async unique(){const rows=await chain.collect();assert(rows.length<2);return rows[0]||null;}};return chain;},
 async insert(table,value){const id='doc-'+(++sequence);docs.push({...value,_id:id,_table:table});return id;},async patch(id,value){Object.assign(docs.find(d=>d._id===id),value);},async delete(id){const i=docs.findIndex(d=>d._id===id);if(i>=0)docs.splice(i,1);}
 }};const user=(subject,email=subject+'@example.com')=>({subject,email,issuer:'https://clerk.john-ta.com',tokenIdentifier:'https://clerk.john-ta.com|'+subject,name:subject,emailVerified:true});return {ctx,docs,signIn:(subject,email)=>current=subject?user(subject,email):null,call:(name,args={})=>api[name]._handler(ctx,args)};}
const rave=(fields={})=>({id:'entry-1',name:'Test night',startDate:'2025-06-14',endDate:'2025-06-14',city:'Test City',venue:'Test Venue',kind:'Festival',artists:[],crew:[],costs:{ticket:null,travel:null,stay:null,other:null},albumUrl:'',notes:'Private note',rating:0,favoriteArtist:'',color:0,...fields});
const json=x=>JSON.parse(JSON.stringify(x));
test('every endpoint requires a verified account',async()=>{const s=setup();for(const name of ['list','draftFromEvent','save','remove','importEntries'])await assert.rejects(s.call(name,{eventId:'event-1',rave:rave(),id:'entry-1',raves:[rave()]}),/Sign in/);});
test('collections belong to account IDs, even when two accounts have the same email',async()=>{const s=setup();s.signIn('alice','shared@example.com');await s.call('save',{rave:rave({notes:'Alice private'})});s.signIn('bob','shared@example.com');assert.equal((await s.call('list')).raves.length,0);await s.call('remove',{id:'entry-1'});await s.call('save',{rave:rave({notes:'Bob private',ownerToken:'https://clerk.john-ta.com|alice'})});assert.equal((await s.call('list')).raves[0].notes,'Bob private');s.signIn('alice','shared@example.com');assert.equal((await s.call('list')).raves[0].notes,'Alice private');assert.equal(s.docs.length,2);assert(!('ownerToken' in s.docs[0].rave));});
test('a user without planning rooms can create, update, import, and delete their collection',async()=>{const s=setup();s.signIn('solo');assert.equal((await s.call('list')).raves.length,0);await s.call('save',{rave:rave()});await s.call('save',{rave:rave({city:'Changed City'})});assert.equal((await s.call('list')).raves[0].city,'Changed City');await s.call('importEntries',{raves:[rave({id:'other',name:'Older night'})]});assert.equal((await s.call('list')).raves.length,2);await s.call('remove',{id:'entry-1'});assert.equal((await s.call('list')).raves.length,1);});
test('room draft requires membership and never converts plans, favorites, or budgets into attended facts',async()=>{const s=setup();s.docs.push({_id:'room',_table:'warRoomState',boardId:'rally:festival',buckets:{name:'Test festival',startsAt:'2025-06-14',endsAt:'2025-06-16',location:'Test City',members:[{id:'a',name:'Alice',email:'alice@example.com',clerkSubject:'alice'},{id:'b',name:'Bob',email:'bob@example.com'}],lineup:[{id:'dj',name:'Test DJ'}],lineupFavorites:{a:['dj']},passes:[{unitCost:100,ownerId:'a'}]}});s.signIn('outsider');await assert.rejects(s.call('draftFromEvent',{eventId:'festival'}),/access/);s.signIn('alice');const d=json(await s.call('draftFromEvent',{eventId:'festival'}));assert.equal(d.rave.sourceEventId,'festival');assert.deepEqual(d.rave.artists,[]);assert.deepEqual(d.rave.crew,[]);assert.equal(d.rave.costs.ticket,null);assert.deepEqual(d.artistSuggestions,['Test DJ']);assert.deepEqual(d.crewSuggestions,['Bob']);assert.equal(d.existing,false);});
test('one linked event per account; different crew members can keep independent experiences',async()=>{const s=setup();s.docs.push({_id:'room',_table:'warRoomState',boardId:'rally:festival',buckets:{members:[{email:'alice@example.com'},{email:'bob@example.com'}]}});s.signIn('alice');await s.call('save',{rave:rave({sourceEventId:'festival',notes:'Alice set'})});await assert.rejects(s.call('save',{rave:rave({id:'duplicate',sourceEventId:'festival'})}),/already/);s.signIn('bob');await s.call('save',{rave:rave({sourceEventId:'festival',notes:'Bob set'})});assert.equal((await s.call('list')).raves[0].notes,'Bob set');s.signIn('alice');assert.equal((await s.call('list')).raves[0].notes,'Alice set');s.docs.find(d=>d._id==='room').buckets.members=[];await s.call('save',{rave:rave({sourceEventId:'festival',notes:'Still my history'})});assert.equal((await s.call('list')).raves[0].notes,'Still my history');await assert.rejects(s.call('draftFromEvent',{eventId:'festival'}),/access/);});
test('invalid imports fail before saving, and unsafe album links and negative costs fail',async()=>{const s=setup();s.signIn('alice');await assert.rejects(s.call('importEntries',{raves:[rave(),rave({id:'bad',name:''})]}),/name/);assert.equal(s.docs.length,0);await assert.rejects(s.call('save',{rave:rave({albumUrl:'javascript:alert(1)'})}),/album link/);await assert.rejects(s.call('save',{rave:rave({costs:{ticket:-1,travel:null,stay:null,other:null}})}),/Costs/);});
test('shared room changes do not mutate existing personal snapshots or another account’s collection',async()=>{const s=setup();s.signIn('alice');await s.call('save',{rave:rave()});const first=json((await s.call('list')).raves[0]);s.signIn('bob');await s.call('save',{rave:rave({city:'Bob location'})});s.signIn('alice');assert.deepEqual(json((await s.call('list')).raves[0]),first);});

test('future plans persist intent, wishlist, and spending without becoming attendance on date changes',async()=>{
 const s=setup();s.signIn('alice');
 const saved=await s.call('save',{rave:rave({startDate:'2099-01-01',endDate:'2099-01-02',plannedArtists:['Wishlist DJ'],plannedCrew:['Nancy']})});
 assert.equal(saved.attendance,'planned');assert.deepEqual(json(saved.artists),[]);
 await s.call('save',{rave:{...saved,startDate:'2022-01-01',endDate:'2022-01-02'}});
 assert.equal((await s.call('list')).raves[0].attendance,'planned');
 // A stale client omitting new fields must not erase the plan's intent.
 const old={...saved,startDate:'2022-01-01',endDate:'2022-01-02'};delete old.attendance;delete old.plannedArtists;delete old.plannedCrew;
 await s.call('save',{rave:old});const reloaded=(await s.call('list')).raves[0];
 assert.equal(reloaded.attendance,'planned');assert.deepEqual(json(reloaded.plannedArtists),['Wishlist DJ']);
 await s.call('save',{rave:{...reloaded,attendance:'attended',artists:['Actual DJ']}});
 assert.equal((await s.call('list')).raves[0].attendance,'attended');
});

test('legacy future entries remain plans based on their creation date after the event passes',async()=>{
 const s=setup();s.signIn('alice');s.docs.push({_id:'legacy',_table:'rallyCollections',ownerToken:'https://clerk.john-ta.com|alice',entryId:'legacy',createdAt:Date.parse('2022-01-01T12:00:00Z'),rave:rave({id:'legacy',startDate:'2022-06-01',endDate:'2022-06-01',artists:['Intended DJ'],crew:['Nancy']})});
 const loaded=json((await s.call('list')).raves[0]);assert.equal(loaded.attendance,'planned');assert.deepEqual(loaded.plannedArtists,['Intended DJ']);assert.deepEqual(loaded.artists,[]);
 assert.equal(s.docs[0].rave.attendance,undefined,'read must not mutate stored record');
});

test('creating a Rally plan is owner-scoped, idempotent, and shares only event metadata and the public catalog',async()=>{
 const s=setup();await assert.rejects(s.call('createPlan',{id:'entry-1',timeZone:'America/Los_Angeles'}),/Sign in/);
 s.signIn('alice');await s.call('save',{rave:rave({attendance:'planned',plannedArtists:['Secret wishlist'],plannedCrew:['Private crew'],albumUrl:'https://example.com/private',notes:'Private note',costs:{ticket:500,travel:null,stay:null,other:null}})});
 s.signIn('bob');await assert.rejects(s.call('createPlan',{id:'entry-1',timeZone:'America/Los_Angeles'}),/Save this diary/);
 s.signIn('alice');await assert.rejects(s.call('createPlan',{id:'entry-1',timeZone:'invalid-zone'}),/timezone/);
 const linked=await s.call('createPlan',{id:'entry-1',timeZone:'America/Los_Angeles'});assert(linked.sourceEventId);
 const again=await s.call('createPlan',{id:'entry-1',timeZone:'America/Los_Angeles'});assert.equal(again.sourceEventId,linked.sourceEventId);
 const rooms=s.docs.filter(d=>d._table==='warRoomState');assert.equal(rooms.length,1);const room=rooms[0].buckets;
 assert.equal(room.name,'Test night');assert.equal(room.members.length,1);assert.equal(room.members[0].clerkSubject,'alice');assert.equal(room.members[0].role,'admin');
 assert.equal(room.eventTimeZone,'America/Los_Angeles');assert.deepEqual(json(room.notes),[]);assert.deepEqual(json(room.passes),[]);assert.deepEqual(json(room.lineup),[]);
 assert(!JSON.stringify(room).includes('Private'));assert(!JSON.stringify(room).includes('Secret wishlist'));assert(!JSON.stringify(room).includes('example.com/private'));
 const draft=await s.call('draftFromEvent',{eventId:linked.sourceEventId});assert.equal(draft.existing,true);assert.equal(draft.rave.id,'entry-1');
 s.signIn('bob');await assert.rejects(s.call('draftFromEvent',{eventId:linked.sourceEventId}),/access/);
 room.members.push({id:'bob',email:'bob@example.com',clerkSubject:'bob',name:'Bob'});
 const bob=await s.call('draftFromEvent',{eventId:linked.sourceEventId});assert.equal(bob.existing,false);assert.equal(bob.rave.notes,'');assert.equal(bob.rave.costs.ticket,null);
});
