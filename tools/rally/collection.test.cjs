const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{buildSync}=require('esbuild');
const sandbox={module:{exports:{}},require,console,URL,TextEncoder,crypto:require('node:crypto').webcrypto};
vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rallyCollection.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text,sandbox);
const api=sandbox.module.exports;
function setup(){let current=null,sequence=0;const docs=[];const ctx={auth:{getUserIdentity:async()=>current},db:{
 query(table){const filters=[];const chain={eq(k,v){filters.push([k,v]);return chain;},withIndex(_,fn){fn(chain);return chain;},async collect(){return docs.filter(d=>d._table===table&&filters.every(([k,v])=>d[k]===v));},async unique(){const rows=await chain.collect();assert(rows.length<2);return rows[0]||null;}};return chain;},
 async insert(table,value){const id='doc-'+(++sequence);docs.push({...value,_id:id,_table:table});return id;},async patch(id,value){Object.assign(docs.find(d=>d._id===id),value);},async delete(id){const i=docs.findIndex(d=>d._id===id);if(i>=0)docs.splice(i,1);}
 }};const user=(subject,email=subject+'@example.com')=>({subject,email,issuer:'https://clerk.john-ta.com',tokenIdentifier:'https://clerk.john-ta.com|'+subject,name:subject,emailVerified:true});return {ctx,docs,signIn:(subject,email)=>current=subject?user(subject,email):null,call:(name,args={})=>api[name]._handler(ctx,args)};}
const rave=(fields={})=>({id:'entry-1',name:'Test night',startDate:'2025-06-14',endDate:'2025-06-14',city:'Test City',venue:'Test Venue',kind:'Festival',artists:[],crew:[],costs:{ticket:null,travel:null,stay:null,other:null},albumUrl:'',notes:'Private note',rating:0,favoriteArtist:'',color:0,...fields});
const json=x=>JSON.parse(JSON.stringify(x));
test('every endpoint requires a verified account',async()=>{const s=setup();for(const name of ['list','draftFromEvent','save','remove','importEntries','connection','syncPlan','shareMemory'])await assert.rejects(s.call(name,{eventId:'event-1',rave:rave(),id:'entry-1',raves:[rave()]}),/Sign in/);});
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

function linkedSetup(){
 const s=setup();s.signIn('alice');
 const room={id:'festival',name:'Crew Lost Lands',startsAt:'2026-09-18',endsAt:'2026-09-20',location:'Thornville, OH',venue:'Legend Valley',catalogEventId:'lost-lands-2026',templateId:'festival-weekend',members:[{id:'a',name:'Alice',email:'alice@example.com',clerkSubject:'alice',role:'admin'},{id:'b',name:'Nancy',email:'nancy@example.com',clerkSubject:'nancy',role:'member'},{id:'c',name:'Nancy',role:'member'}],lineup:[{id:'timed',artist:'Excision',name:'Excision',stage:'Main',start:'21:00',end:'22:00'}],lineupFavorites:{a:['timed'],b:['timed']},notes:[{id:'crew-note',text:'Keep shared notes'}],diaryMemories:[]};
 s.docs.push({_id:'room',_table:'warRoomState',boardId:'rally:festival',buckets:room});return {...s,room};
}
test('Rally drafts share the event identity while attendance and connected crew require explicit selection',async()=>{
 const s=linkedSetup(),d=json(await s.call('draftFromEvent',{eventId:'festival'}));
 assert.equal(d.rave.catalogEventId,'lost-lands-2026');assert.equal(d.rave.attendance,'planned');assert.deepEqual(d.rave.crew,[]);
 assert.equal(d.crewPeople.length,2);assert.notEqual(d.crewPeople[0].id,d.crewPeople[1].id);assert.equal(d.crewPeople[0].kind,'account');assert.equal(d.crewPeople[1].kind,'guest');
 await s.call('save',{rave:rave({...d.rave,id:'entry-1',plannedCrew:['Nancy'],plannedCrewConnections:d.crewPeople})});
 const saved=json((await s.call('list')).raves[0]);assert.equal(saved.plannedCrewConnections.length,2);assert.equal(saved.crewConnections?.length||0,0);
 const forged={...saved,plannedCrewConnections:[{...d.crewPeople[0],id:'account:outsider',memberId:'missing'}]};await assert.rejects(s.call('save',{rave:forged}),/Choose a friend/);
});
test('account identities survive projects and renamed members, and guest connections can be upgraded on save',async()=>{
 const s=linkedSetup(),d=await s.call('draftFromEvent',{eventId:'festival'});const guest=d.crewPeople.find(p=>p.kind==='guest');
 await s.call('save',{rave:rave({sourceEventId:'festival',crew:['Nancy'],crewConnections:[guest]})});
 s.room.members.find(m=>m.id==='c').clerkSubject='claimed-guest';
 const updated=await s.call('save',{rave:(await s.call('list')).raves[0]});assert(updated.crewConnections[0].id.startsWith('account:'));assert.equal(updated.crewConnections[0].kind,'account');assert(!updated.crewConnections[0].id.includes('claimed-guest'));
 const other={...s.room,id:'other',members:s.room.members.map(m=>({...m,id:m.id+'-other'}))};s.docs.push({_id:'other-room',_table:'warRoomState',boardId:'rally:other',buckets:other});
 const second=await s.call('draftFromEvent',{eventId:'other'});assert.equal(second.crewPeople.find(p=>p.memberId==='b-other').id,d.crewPeople.find(p=>p.memberId==='b').id);assert(!JSON.stringify(second.crewPeople).includes('clerkSubject'));
 s.signIn('intruder','nancy@example.com');await assert.rejects(s.call('draftFromEvent',{eventId:'festival'}),/access/);
});
test('pull updates are opt-in, preserve actual history and private fields, and reject stale previews',async()=>{
 const s=linkedSetup();await s.call('save',{rave:rave({sourceEventId:'festival',attendance:'planned',artists:['Actual DJ'],crew:['Actual friend'],notes:'Private diary',rating:5,albumUrl:'https://example.com/private',plannedArtists:['My wishlist'],plannedCrew:['My friend']})});
 let preview=await s.call('connection',{id:'entry-1'});assert.equal(preview.people.length,2);assert(!JSON.stringify(preview).includes('Private diary'));
 assert.equal((await s.call('list')).raves[0].name,'Test night');
 const saved=await s.call('syncPlan',{id:'entry-1',direction:'toDiary',fields:['details','wishlist','crew'],revision:preview.revision});
 assert.equal(saved.name,'Crew Lost Lands');assert.equal(saved.catalogEventId,'lost-lands-2026');assert.equal(saved.attendance,'planned');assert.deepEqual(json(saved.artists),['Actual DJ']);assert.deepEqual(json(saved.crew),['Actual friend']);assert.equal(saved.notes,'Private diary');assert.equal(saved.rating,5);assert.equal(saved.albumUrl,'https://example.com/private');
 assert(saved.plannedArtists.includes('Excision'));assert(saved.plannedCrew.includes('Nancy'));assert.equal(saved.plannedCrewConnections.length,2);
 await assert.rejects(s.call('syncPlan',{id:'entry-1',direction:'toDiary',fields:['details'],revision:preview.revision}),/changed/);
 preview=await s.call('connection',{id:'entry-1'});s.room.name='Changed concurrently';await assert.rejects(s.call('syncPlan',{id:'entry-1',direction:'toDiary',fields:['details'],revision:preview.revision}),/changed/);
});
test('attended entries never copy plan interests or crew into actual attendance',async()=>{
 const s=linkedSetup();await s.call('save',{rave:rave({sourceEventId:'festival',attendance:'attended',artists:['Only DJ'],crew:['Only friend']})});let p=await s.call('connection',{id:'entry-1'});
 await assert.rejects(s.call('syncPlan',{id:'entry-1',direction:'toDiary',fields:['crew'],revision:p.revision}),/Select actual/);
 s.room.startsAt='2099-01-01';s.room.endsAt='2099-01-02';p=await s.call('connection',{id:'entry-1'});
 await assert.rejects(s.call('syncPlan',{id:'entry-1',direction:'toDiary',fields:['details'],revision:p.revision}),/future/);
 assert.deepEqual(json((await s.call('list')).raves[0].artists),['Only DJ']);
});
test('push respects admin permissions, shares only chosen fields and preserves existing schedules and interests',async()=>{
 const s=linkedSetup();await s.call('save',{rave:rave({sourceEventId:'festival',attendance:'planned',name:'New plan name',plannedArtists:['Wishlist DJ'],notes:'PRIVATE',albumUrl:'https://example.com/private',costs:{ticket:999,travel:null,stay:null,other:null}})});
 let p=await s.call('connection',{id:'entry-1'});await s.call('syncPlan',{id:'entry-1',direction:'toPlan',fields:['wishlist'],revision:p.revision});
 let room=s.docs.find(d=>d._id==='room').buckets;assert.equal(room.name,'Crew Lost Lands');assert.equal(room.lineup[0].start,'21:00');assert(room.lineupFavorites.a.includes('timed'));assert.equal(room.lineupFavorites.b.length,1);assert(room.lineup.some(a=>a.name==='Wishlist DJ'));assert(!JSON.stringify(room).includes('PRIVATE'));assert(!JSON.stringify(room).includes('example.com/private'));assert(!JSON.stringify(room).includes('999'));
 p=await s.call('connection',{id:'entry-1'});await s.call('syncPlan',{id:'entry-1',direction:'toPlan',fields:['details'],revision:p.revision});assert.equal(s.docs.find(d=>d._id==='room').buckets.name,'New plan name');
 s.signIn('nancy');await s.call('save',{rave:rave({sourceEventId:'festival',attendance:'planned',plannedArtists:['Nancy DJ']})});p=await s.call('connection',{id:'entry-1'});assert.equal(p.canUpdatePlan,false);
 await assert.rejects(s.call('syncPlan',{id:'entry-1',direction:'toPlan',fields:['details'],revision:p.revision}),/admin/);
 await s.call('syncPlan',{id:'entry-1',direction:'toPlan',fields:['wishlist'],revision:p.revision});room=s.docs.find(d=>d._id==='room').buckets;assert(room.lineupFavorites.b.length>1);assert(room.lineupFavorites.a.length>1);
});
test('shared memories contain only explicit text and albums, are crew-scoped, and remain independent of private diary edits',async()=>{
 const s=linkedSetup();await s.call('save',{rave:rave({sourceEventId:'festival',notes:'Secret private diary',albumUrl:'https://example.com/private'})});let p=await s.call('connection',{id:'entry-1'});assert.equal(p.sharedMemories.length,0);
 await s.call('shareMemory',{id:'entry-1',note:'Our sunset set',albumUrl:'https://example.com/shared',revision:p.revision});
 const room=s.docs.find(d=>d._id==='room').buckets;assert.equal(room.diaryMemories.length,1);assert(!JSON.stringify(room.diaryMemories).includes('Secret private diary'));assert(!JSON.stringify(room.diaryMemories).includes('example.com/private'));
 s.signIn('nancy');const d=await s.call('draftFromEvent',{eventId:'festival'});assert.equal(d.sharedMemories[0].note,'Our sunset set');assert.equal(d.rave.notes,'');
 await s.call('save',{rave:rave({sourceEventId:'festival',notes:'Nancy private'})});p=await s.call('connection',{id:'entry-1'});await s.call('shareMemory',{id:'entry-1',note:'Nancy memory',albumUrl:'',revision:p.revision});
 s.signIn('alice');p=await s.call('connection',{id:'entry-1'});assert.equal(p.sharedMemories.length,2);await assert.rejects(s.call('shareMemory',{id:'entry-1',note:'Unsafe',albumUrl:'javascript:alert(1)',revision:p.revision}),/album/);
 await s.call('shareMemory',{id:'entry-1',note:'',albumUrl:'',revision:p.revision});assert.equal((await s.call('connection',{id:'entry-1'})).sharedMemories.length,1);assert.equal((await s.call('list')).raves[0].notes,'Secret private diary');
 s.docs.find(d=>d._id==='room').buckets.members=s.docs.find(d=>d._id==='room').buckets.members.filter(m=>m.clerkSubject!=='alice');await assert.rejects(s.call('connection',{id:'entry-1'}),/access/);
});

test('revision checks detect edits within one millisecond and catalog pushes cannot cross event editions',async()=>{
 const s=linkedSetup();await s.call('save',{rave:rave({sourceEventId:'festival',attendance:'planned'})});
 let p=await s.call('connection',{id:'entry-1'});s.docs.find(d=>d._table==='rallyCollections').rave.notes='Changed without moving timestamp';
 await assert.rejects(s.call('syncPlan',{id:'entry-1',direction:'toDiary',fields:['details'],revision:p.revision}),/changed/);
 const record=s.docs.find(d=>d._table==='rallyCollections');Object.assign(record.rave,{name:'EDC Las Vegas 2026',catalogEventId:'edc-las-vegas-2026',startDate:'2026-05-15',endDate:'2026-05-17'});
 p=await s.call('connection',{id:'entry-1'});await assert.rejects(s.call('syncPlan',{id:'entry-1',direction:'toPlan',fields:['catalog'],revision:p.revision}),/different event editions/);
 assert.equal(s.docs.find(d=>d._id==='room').buckets.lineup.length,1);
});

test('disconnecting a plan changes only the owner’s link and preserves private history and shared data',async()=>{
 const s=linkedSetup(),draft=await s.call('draftFromEvent',{eventId:'festival'});
 const initial=await s.call('save',{rave:rave({sourceEventId:'festival',crew:['Nancy'],crewConnections:[draft.crewPeople[0]],notes:'Private memory'})});
 const before=JSON.stringify(s.docs.find(d=>d._id==='room').buckets);
 const unlinked=await s.call('save',{rave:{...initial,sourceEventId:undefined}});
 assert.equal(unlinked.sourceEventId,undefined);assert.equal(unlinked.notes,'Private memory');assert.equal(unlinked.crewConnections[0].id,initial.crewConnections[0].id);assert.equal(JSON.stringify(s.docs.find(d=>d._id==='room').buckets),before);
});
