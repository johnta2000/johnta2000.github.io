const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{buildSync}=require('esbuild');
const source=buildSync({entryPoints:[__dirname+'/../../convex/rallyInvites.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'}).outputFiles[0].text;
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 let now=1793314800000,identity={subject:'admin',email:'admin@example.test',emailVerified:true},serial=0;
 const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,require,structuredClone,crypto:require('node:crypto').webcrypto,Date:class extends Date{static now(){return now;}}});
 const state={id:'festival',name:'Test festival',members:[{id:'a',name:'Alex',role:'admin',clerkSubject:'admin',email:'admin@example.test'},{id:'s',name:'Sam',role:'member',status:'not_invited',email:'',clerkSubject:''}],rooms:[{id:'room',memberIds:['s']}],passes:[{id:'pass',ticketAssignments:[{slot:0,memberId:'s'}]}],lineupFavorites:{s:['artist']},notes:[{id:'private',body:'Private crew note'}],projectTheme:'midnight'};
 const docs=new Map([['room',{_id:'room',boardId:'rally:festival',buckets:state}]]);
 const ctx={auth:{getUserIdentity:async()=>identity},db:{
  query(table){assert.equal(table,'warRoomState');return {withIndex(index,callback){assert.equal(index,'by_board');const filters=[],builder={eq(k,v){filters.push(row=>row[k]===v);return builder;},gte(k,v){filters.push(row=>row[k]>=v);return builder;},lt(k,v){filters.push(row=>row[k]<v);return builder;}};callback(builder);const rows=()=>[...docs.values()].filter(row=>filters.every(filter=>filter(row)));return {unique:async()=>{assert(rows().length<=1);return rows()[0]||null;},collect:async()=>rows()};}};},
  async insert(table,row){const id='invite'+(++serial);docs.set(id,{...clone(row),_id:id});return id;},async patch(id,value){Object.assign(docs.get(id),clone(value));},
 }};
 return {docs,ctx,call:(action,args={})=>module.exports[action]._handler(ctx,{eventId:'festival',...args}),as:(subject,email=subject+'@example.test',verified=true)=>{identity=subject?{subject,email,emailVerified:verified,name:subject}:null;},advance:value=>now+=value,room:()=>docs.get('room').buckets};
}
test('only verified project admins can create, list, or revoke invitations',async()=>{
 const f=fixture();
 for(const subject of [null,'outsider','sam']){f.as(subject);for(const method of ['create','list','revoke'])await assert.rejects(f.call(method,{invitationId:'00000000-0000-4000-8000-000000000000'}),/verified|admin/);}
 f.as('admin','admin@example.test',false);await assert.rejects(f.call('create'),/verified/);
 f.as('admin','admin@example.test',null);await assert.rejects(f.call('create'),/verified/);
 assert.equal(f.docs.size,1);
});
test('creating a link leaves all crew data intact and stores its record outside room buckets',async()=>{
 const f=fixture(),before=clone(f.room()),invite=await f.call('create',{memberId:'s'});
 assert.equal(invite.name,'Sam');assert.equal(invite.status,'active');assert.equal(invite.expiresAt-invite.createdAt,7*86400000);assert.match(invite.id,/^[a-f0-9-]{36}$/);
 assert.deepEqual(f.room(),before);assert.equal(f.docs.size,2);assert(!JSON.stringify(f.room()).includes(invite.id));assert.equal((await f.call('list')).length,1);
});
test('creation retries with the same request ID return the saved invitation without duplicates',async()=>{
 const f=fixture(),requestId='00000000-0000-4000-8000-000000000000';
 const first=await f.call('create',{requestId,name:'Friend'}),retry=await f.call('create',{requestId,name:'Friend'});
 assert.equal(first.id,retry.id);assert.equal(f.docs.size,2);
});
test('claiming an existing profile preserves its ticket, hotel assignments, likes, and member ID',async()=>{
 const f=fixture(),before=clone(f.room()),invite=await f.call('create',{memberId:'s'});f.as('sam','sam@example.test');
 const preview=await f.call('inspect',{invitationId:invite.id});assert.equal(preview.name,'Sam');assert(!('members'in preview));assert(!('notes'in preview));
 const result=await f.call('claim',{invitationId:invite.id,name:'Different display name'});assert.equal(result.memberId,'s');
 assert.deepEqual(f.room().passes,before.passes);assert.deepEqual(f.room().rooms,before.rooms);assert.deepEqual(f.room().lineupFavorites,before.lineupFavorites);assert.deepEqual(f.room().notes,before.notes);
 assert.equal(f.room().members.length,2);assert.equal(f.room().members[1].name,'Sam');assert.equal(f.room().members[1].clerkSubject,'sam');assert.equal(f.room().members[1].status,'confirmed');assert.equal(f.room().members[1].role,'member');
 assert.deepEqual(clone(await f.call('claim',{invitationId:invite.id,name:'Sam'})),clone(result));
 f.as('someone-else');await assert.rejects(f.call('claim',{invitationId:invite.id,name:'Stranger'}),/claimed/);
});
test('a new friend joins as an ordinary member using their verified sign-in email',async()=>{
 const f=fixture(),invite=await f.call('create',{name:'Taylor',origin:'SFO'});f.as('taylor','Taylor@Example.Test');
 const result=await f.call('claim',{invitationId:invite.id,name:'Taylor'}),member=f.room().members.find(m=>m.id===result.memberId);
 assert.equal(member.email,'taylor@example.test');assert.equal(member.role,'member');assert.equal(member.origin,'SFO');assert.equal(f.room().members.length,3);
 f.as('admin');assert.equal((await f.call('list'))[0].status,'claimed');
});
test('preview and claim reject revoked, expired, or invalid invitations',async()=>{
 for(const mode of ['revoked','expired']){
  const f=fixture(),invite=await f.call('create');if(mode==='revoked')await f.call('revoke',{invitationId:invite.id});else f.advance(7*86400000);
  f.as('friend');for(const action of ['inspect','claim'])await assert.rejects(f.call(action,{invitationId:invite.id,name:'Friend'}),new RegExp(mode));assert.equal(f.room().members.length,2);
 }
 const f=fixture();await assert.rejects(f.call('inspect',{invitationId:'not-an-id'}),/not valid/);f.as(null);await assert.rejects(f.call('inspect',{invitationId:'bad'}),/verified/);
});
test('removing the inviter’s admin access or the target profile invalidates unclaimed links',async()=>{
 for(const mode of ['role','profile','subject']){
  const f=fixture(),invite=await f.call('create',{memberId:'s'});
  if(mode==='role')f.room().members[0].role='member';else if(mode==='subject')f.room().members[0].clerkSubject='replacement';else f.room().members.pop();
  f.as('friend');await assert.rejects(f.call('claim',{invitationId:invite.id,name:'Friend'}),/no longer|removed/);
 }
});
test('a link cannot hijack an email-bound profile, a confirmed account, or an admin profile',async()=>{
 const f=fixture();await assert.rejects(f.call('create',{memberId:'a'}),/claimed/);
 f.room().members[1].email='sam@example.test';const invite=await f.call('create',{memberId:'s'});f.as('wrong');await assert.rejects(f.call('claim',{invitationId:invite.id,name:'Sam'}),/different email/);
 f.room().members[1].clerkSubject='new-owner';await assert.rejects(f.call('claim',{invitationId:invite.id,name:'Sam'}),/claimed/);
});
test('opening a friend’s invitation as an existing member does not consume it',async()=>{
 const f=fixture(),invite=await f.call('create');assert.equal((await f.call('inspect',{invitationId:invite.id})).alreadyMember,true);
 await f.call('claim',{invitationId:invite.id,name:'Alex'});assert.equal((await f.call('list'))[0].status,'active');assert.equal(f.room().members.length,2);
});
test('invitation metadata is scoped to its project and listing never reveals account identities',async()=>{
 const f=fixture(),invite=await f.call('create');
 await assert.rejects(f.call('inspect',{eventId:'different',invitationId:invite.id}),/not available/);
 const serialized=JSON.stringify(await f.call('list'));assert(!serialized.includes('admin@example'));assert(!serialized.includes('createdBySubject'));assert(!serialized.includes('Private crew note'));
});
