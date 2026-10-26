const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{buildSync}=require('esbuild');
const sandbox={module:{exports:{}},require,console,URL,TextEncoder,crypto:require('node:crypto').webcrypto};
vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rallyCollection.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text,sandbox);
const api=sandbox.module.exports;
function setup(){let current=null,sequence=0;const docs=[];const ctx={auth:{getUserIdentity:async()=>current},db:{
 query(table){const filters=[];const chain={eq(k,v){filters.push([k,v,'eq']);return chain;},gte(k,v){filters.push([k,v,'gte']);return chain;},lt(k,v){filters.push([k,v,'lt']);return chain;},withIndex(_,fn){fn(chain);return chain;},async collect(){return docs.filter(d=>d._table===table&&filters.every(([k,v,op])=>op==='gte'?d[k]>=v:op==='lt'?d[k]<v:d[k]===v));},async unique(){const rows=await chain.collect();assert(rows.length<2);return rows[0]||null;}};return chain;},
 async insert(table,value){const id='doc-'+(++sequence);docs.push({...value,_id:id,_table:table});return id;},async patch(id,value){Object.assign(docs.find(d=>d._id===id),value);},async delete(id){const i=docs.findIndex(d=>d._id===id);if(i>=0)docs.splice(i,1);}
 }};const user=(subject,email=subject+'@example.com')=>({subject,email,issuer:'https://clerk.john-ta.com',tokenIdentifier:'https://clerk.john-ta.com|'+subject,name:subject,emailVerified:true});return {ctx,docs,signIn:(subject,email)=>current=subject?user(subject,email):null,call:(name,args={})=>api[name]._handler(ctx,args)};}
const rave=(fields={})=>({id:'entry-1',name:'Test night',startDate:'2025-06-14',endDate:'2025-06-14',city:'Test City',venue:'Test Venue',kind:'Festival',artists:[],crew:[],costs:{ticket:null,travel:null,stay:null,other:null},albumUrl:'',notes:'Private note',rating:0,favoriteArtist:'',color:0,...fields});
const json=x=>JSON.parse(JSON.stringify(x));
test('every endpoint requires a verified account',async()=>{const s=setup();for(const name of ['list','draftFromEvent','save','remove','importEntries','connection','syncPlan','shareMemory'])await assert.rejects(s.call(name,{eventId:'event-1',rave:rave(),id:'entry-1',raves:[rave()]}),/Sign in/);});
test('collections belong to account IDs, even when two accounts have the same email',async()=>{const s=setup();s.signIn('alice','shared@example.com');await s.call('save',{rave:rave({notes:'Alice private'})});s.signIn('bob','shared@example.com');assert.equal((await s.call('list')).raves.length,0);await s.call('remove',{id:'entry-1'});await s.call('save',{rave:rave({notes:'Bob private',ownerToken:'https://clerk.john-ta.com|alice'})});assert.equal((await s.call('list')).raves[0].notes,'Bob private');s.signIn('alice','shared@example.com');assert.equal((await s.call('list')).raves[0].notes,'Alice private');assert.equal(s.docs.length,2);assert(!('ownerToken' in s.docs[0].rave));});
test('a user without planning rooms can create, update, import, and delete their collection',async()=>{const s=setup();s.signIn('solo');assert.equal((await s.call('list')).raves.length,0);await s.call('save',{rave:rave()});await s.call('save',{rave:rave({city:'Changed City'})});assert.equal((await s.call('list')).raves[0].city,'Changed City');await s.call('importEntries',{raves:[rave({id:'other',name:'Older night'})]});assert.equal((await s.call('list')).raves.length,2);await s.call('remove',{id:'entry-1'});assert.equal((await s.call('list')).raves.length,1);});
test('room draft requires membership and never converts plans, favorites, or budgets into attended facts',async()=>{const s=setup();s.docs.push({_id:'room',_table:'warRoomState',boardId:'rally:festival',buckets:{name:'Test festival',startsAt:'2025-06-14',endsAt:'2025-06-16',location:'Test City',members:[{id:'a',name:'Alice',email:'alice@example.com',clerkSubject:'alice'},{id:'b',name:'Bob',email:'bob@example.com'}],lineup:[{id:'dj',name:'Test DJ'}],lineupFavorites:{a:['dj']},passes:[{unitCost:100,ownerId:'a'}]}});s.signIn('outsider');await assert.rejects(s.call('draftFromEvent',{eventId:'festival'}),/access/);s.signIn('alice');const d=json(await s.call('draftFromEvent',{eventId:'festival'}));assert.equal(d.rave.sourceEventId,'festival');assert.deepEqual(d.rave.artists,[]);assert.deepEqual(d.rave.crew,[]);assert.equal(d.rave.costs.ticket,null);assert.deepEqual(d.artistSuggestions,['Test DJ']);assert.deepEqual(d.crewSuggestions,['Bob']);assert.equal(d.existing,true);});
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
 s.signIn('alice');await s.call('save',{rave:rave({startDate:'2099-01-01',endDate:'2099-01-02',attendance:'planned',plannedArtists:['Secret wishlist'],plannedCrew:['Private crew'],albumUrl:'https://example.com/private',notes:'Private note',costs:{ticket:500,travel:null,stay:null,other:null}})});
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
 const bob=await s.call('draftFromEvent',{eventId:linked.sourceEventId});assert.equal(bob.existing,true);assert.equal(bob.rave.notes,'');assert.equal(bob.rave.costs.ticket,null);
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


test('Rally membership automatically supplies one stable private diary entry without creating records',async()=>{
 const s=linkedSetup(),before=JSON.stringify(s.docs);let rows=(await s.call('list')).raves;
 assert.equal(rows.length,1);const automatic=rows[0];assert.equal(automatic.id,'rally_festival');assert.equal(automatic.attendance,'planned');assert.equal(automatic.notes,'');assert.equal(automatic.costs.ticket,null);assert.equal(automatic.artists.length,0);assert.equal(automatic.crew.length,0);
 assert.equal(JSON.stringify(s.docs),before);assert.equal((await s.call('draftFromEvent',{eventId:'festival'})).rave.id,automatic.id);
 await s.call('save',{rave:{...automatic,attendance:'attended',notes:'Alice private',artists:['Excision']}});rows=(await s.call('list')).raves;assert.equal(rows.length,1);assert.equal(rows[0].notes,'Alice private');
 s.signIn('nancy');rows=(await s.call('list')).raves;assert.equal(rows.length,1);assert.equal(rows[0].attendance,'planned');assert.equal(rows[0].notes,'');
 s.signIn('outsider');assert.equal((await s.call('list')).raves.length,0);await assert.rejects(s.call('save',{rave:{...automatic,notes:'Forged'}}),/access/);
 s.signIn('mallory','alice@example.com');assert.equal((await s.call('list')).raves.length,0);
});
test('shared details update on every read while experience data and other crew accounts stay private',async()=>{
 const s=linkedSetup();const initial=(await s.call('list')).raves[0];await s.call('save',{rave:{...initial,attendance:'attended',artists:['Excision'],crew:['Nancy'],notes:'Keep this',costs:{ticket:123,travel:null,stay:null,other:null}}});
 Object.assign(s.room,{name:'Lost Lands crew updated',location:'Updated city',venue:'Updated venue'});s.room.lineup.push({id:'new-set',name:'Wooli'});
 const next=(await s.call('list')).raves[0];assert.equal(next.name,s.room.name);assert.equal(next.city,s.room.location);assert.equal(next.venue,s.room.venue);assert.equal(next.notes,'Keep this');assert.equal(next.costs.ticket,123);assert.deepEqual(json(next.artists),['Excision']);assert.equal(next.attendance,'attended');
 assert((await s.call('draftFromEvent',{eventId:'festival'})).artistSuggestions.includes('Wooli'));
 const saved=await s.call('save',{rave:{...initial,name:'Stale title',city:'Stale city',notes:'New private note'}});assert.equal(saved.name,s.room.name);assert.equal(saved.city,s.room.location);
 assert(!JSON.stringify(s.room).includes('New private note'));await assert.rejects(s.call('syncPlan',{id:initial.id,direction:'toPlan',fields:['details'],revision:''}),/automatically/);
});
test('a matching catalog memory is reused automatically without duplicating or changing its personal record',async()=>{
 const s=setup();s.signIn('alice');await s.call('save',{rave:rave({name:'Lost Lands 2026',catalogEventId:'lost-lands-2026',startDate:'2026-09-18',endDate:'2026-09-20',notes:'My old memory',attendance:'attended'})});
 s.docs.push({...linkedSetup().docs[0]});const before=JSON.stringify(s.docs);const rows=(await s.call('list')).raves;
 assert.equal(rows.length,1);assert.equal(rows[0].id,'entry-1');assert.equal(rows[0].sourceEventId,'festival');assert.equal(rows[0].notes,'My old memory');assert.equal(JSON.stringify(s.docs),before);
 assert.equal((await s.call('draftFromEvent',{eventId:'festival'})).rave.id,'entry-1');
 await s.call('save',{rave:{...rows[0],notes:'Updated'}});assert.equal(s.docs.filter(d=>d._table==='rallyCollections').length,1);
 await assert.rejects(s.call('save',{rave:rave({id:'duplicate',name:'Lost Lands 2026',catalogEventId:'lost-lands-2026',startDate:'2026-09-18',endDate:'2026-09-20'})}),/already/);
});
test('past personal raves stay project-free and cannot accidentally create empty crew projects',async()=>{
 const s=setup();s.signIn('alice');await s.call('save',{rave:rave()});await assert.rejects(s.call('createPlan',{id:'entry-1',timeZone:'America/Los_Angeles'}),/Past raves/);assert.equal(s.docs.filter(d=>d._table==='warRoomState').length,0);
});
test('removing an automatic entry stays removed after refresh and does not leave or modify the crew',async()=>{
 const s=linkedSetup(),before=JSON.stringify(s.room),initial=(await s.call('list')).raves[0];await s.call('save',{rave:{...initial,notes:'Delete this personal memory'}});
 await s.call('remove',{id:initial.id});await s.call('remove',{id:initial.id});assert.equal((await s.call('list')).raves.length,0);assert.equal(JSON.stringify(s.room),before);assert(!JSON.stringify(s.docs).includes('Delete this personal memory'));
 const reopened=await s.call('draftFromEvent',{eventId:'festival'});await s.call('save',{rave:reopened.rave});assert.equal((await s.call('list')).raves.length,1);
});
test('membership loss removes automatic rows but keeps an owner’s already saved memories',async()=>{
 const s=linkedSetup(),initial=(await s.call('list')).raves[0];s.room.members=s.room.members.filter(m=>m.clerkSubject!=='alice');assert.equal((await s.call('list')).raves.length,0);
 s.room.members.push({id:'a',name:'Alice',clerkSubject:'alice'});await s.call('save',{rave:{...initial,notes:'My saved memory'}});s.room.members=s.room.members.filter(m=>m.clerkSubject!=='alice');assert.equal((await s.call('list')).raves[0].notes,'My saved memory');await assert.rejects(s.call('connection',{id:initial.id}),/access/);
});
test('automatic diary entries can share explicit crew memories without saving private details',async()=>{
 const s=linkedSetup(),id=(await s.call('list')).raves[0].id;const state=await s.call('connection',{id});await s.call('shareMemory',{id,note:'A crew memory',albumUrl:'',revision:state.revision});assert.equal(s.docs.filter(d=>d._table==='rallyCollections').length,0);assert.equal((await s.call('connection',{id})).sharedMemories[0].note,'A crew memory');
});

test('catalog uniqueness protects stale forms, changed editions and imports per account without blocking edits or separate weekends',async()=>{
 const s=setup();s.signIn('alice');
 const dusk=rave({id:'dusk',catalogEventId:'edc-las-vegas-2027-w1',name:'EDC 2027',startDate:'2027-05-14',endDate:'2027-05-16'});
 const dawn={...dusk,id:'dawn',catalogEventId:'edc-las-vegas-2027-w2',startDate:'2027-05-21',endDate:'2027-05-23'};
 await s.call('save',{rave:dusk});await s.call('save',{rave:{...dusk,notes:'Edited'}});
 await assert.rejects(s.call('save',{rave:{...dusk,id:'duplicate',catalogEventId:undefined,startDate:'2027-05-15'}}),/already in your diary/);
 await s.call('save',{rave:dawn});await assert.rejects(s.call('save',{rave:{...dusk,id:'dawn'}}),/already in your diary/);
 await assert.rejects(s.call('importEntries',{raves:[{...dusk,id:'imported'}]}),/already in your diary/);
 assert.equal((await s.call('list')).raves.length,2);
 s.signIn('bob');await s.call('save',{rave:dusk});assert.equal((await s.call('list')).raves.length,1);
});
