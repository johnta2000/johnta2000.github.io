const {test,before}=require('node:test');
const assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild');
const crypto=require('node:crypto').webcrypto;
let groups,sleep,whoop;
before(async()=>{
 async function bundle(file){
  const result=await esbuild.build({entryPoints:[path.join(__dirname,'../../../convex/',file)],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'handlers',setup(build){build.onResolve({filter:/\.\/_generated\/server$/},()=>({path:'server',namespace:'test'}));build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const query=x=>x;export const mutation=x=>x;export const internalMutation=x=>x;export const internalQuery=x=>x;export const action=x=>x;'}));}}]});
  const mod={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module:mod,exports:mod.exports,require,console,crypto,TextEncoder,Date,Intl,process:{env:{SLEEP_ALLOWED_EMAIL:'owner@example.com',SLEEP_LEGACY_OWNER_SUBJECT:'owner'}}});return mod.exports;
 }
 groups=await bundle('sleepGroups.ts');sleep=await bundle('sleep.ts');whoop=await bundle('whoopData.ts');
});
function fixture(){
 const tables=Object.fromEntries(['sleepNights','alertnessRatings','sleepProfiles','sleepGroups','sleepMembers','sleepInvites','whoopConnections','whoopDays'].map(t=>[t,[]]));let n=0;
 const db={query(table){let filters=[];const q={withIndex(_,fn){const builder={eq(k,v){filters.push(r=>r[k]===v);return this},gte(k,v){filters.push(r=>r[k]>=v);return this},lte(k,v){filters.push(r=>r[k]<=v);return this}};fn(builder);return q},collect:async()=>tables[table].filter(r=>filters.every(f=>f(r))),async unique(){const rows=await q.collect();assert.ok(rows.length<=1);return rows[0]||null},async take(limit){return (await q.collect()).slice(0,limit)}};return q},get:async id=>Object.values(tables).flat().find(r=>r._id===id)||null,insert:async(t,v)=>{const id=t+ ++n;tables[t].push({...v,_id:id});return id},patch:async(id,v)=>Object.assign(await db.get(id),v),delete:async id=>{for(const rows of Object.values(tables)){const i=rows.findIndex(r=>r._id===id);if(i>=0)rows.splice(i,1)}}};
 const context=subject=>({db,auth:{getUserIdentity:async()=>subject===null?null:{subject,email:subject==='owner'?'owner@example.com':`${subject}@example.com`,emailVerified:subject!=='unverified'}}});
 const run=(api,name,subject,args={})=>api[name].handler(context(subject),args);
 return {tables,db,context,run,group:(name,subject,args)=>run(groups,name,subject,args)};
}
const settings={name:'Owner',metrics:['durationMinutes'],shareDays:28};
async function setup(){const f=fixture();f.id=await f.group('create','owner',{groupName:'Friends',...settings});return f}
async function invitation(f,char=(f.tables.sleepInvites.length+10).toString(16)){const token=char.repeat(64),tokenHash=await groups.hashInvite(token);await f.group('issueInvite','owner',{groupId:f.id,tokenHash});return token}
async function join(f,subject='friend',metrics=['score']){const token=await invitation(f);await f.group('acceptInvite',subject,{token,name:subject,metrics,shareDays:7});}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const night=(source='whoop')=>({sleepDate:today(),source,score:80,scoreKind:'native',durationMinutes:450});
test('uninvited, anonymous and unverified users cannot read personal or group data',async()=>{const f=await setup();for(const user of [null,'stranger','unverified']){await assert.rejects(f.run(sleep,'dashboard',user,{startDate:'2020-01-01',endDate:'2030-01-01'}));await assert.rejects(f.group('history',user,{groupId:f.id}));await assert.rejects(f.run(whoop,'status',user));}});
test('invite acceptance is single-use and revoked or expired links do not register accounts',async()=>{
 const f=await setup(),token=await invitation(f);await f.group('acceptInvite','friend',{token,name:'Friend',metrics:[],shareDays:7});
 await assert.rejects(f.group('acceptInvite','stranger',{token,...settings}),/used/);
 const revoked=await invitation(f,'b');await f.group('revokeInvite','owner',{inviteId:f.tables.sleepInvites[1]._id});await assert.rejects(f.group('acceptInvite','stranger',{token:revoked,...settings}),/expired/);
 const expired=await invitation(f,'c');f.tables.sleepInvites[2].expiresAt=1;await assert.rejects(f.group('acceptInvite','stranger',{token:expired,...settings}),/expired/);
 assert.equal(f.tables.sleepProfiles.length,2);
});
test('same-day imports and check-ins remain private to each subject',async()=>{
 const f=await setup();await join(f);
 for(const subject of ['owner','friend']){await f.run(sleep,'importNights',subject,{importBatchId:'test',nights:[night()]});await f.run(sleep,'saveAlertness',subject,{ratingDate:today(),score:subject==='owner'?8:4,note:subject+' secret',timezone:'UTC'});}
 assert.equal(f.tables.sleepNights.length,2);assert.equal(f.tables.alertnessRatings.length,2);
 for(const subject of ['owner','friend']){const data=await f.run(sleep,'dashboard',subject,{startDate:today(),endDate:today()});assert.equal(data.nights.length,1);assert.equal(data.nights[0].ownerSubject,subject);assert.equal(data.alertness[0].note,subject+' secret');}
});
test('group history returns only explicitly selected WHOOP metrics within the sharing window',async()=>{
 const f=await setup();await join(f);
 f.tables.sleepNights.push({...night(),ownerSubject:'friend',hrv:99,asleepAt:'secret',importBatchId:'secret'}, {...night('apple_health'),ownerSubject:'friend'}, {...night(),sleepDate:'2020-01-01',ownerSubject:'friend'});
 const result=await f.group('history','owner',{groupId:f.id});const friend=result.members.find(m=>!m.self);
 assert.equal(friend.nights.length,1);assert.equal(friend.nights[0].score,80);assert.equal(friend.nights[0].durationMinutes,undefined);
 for(const sensitive of ['secret','ownerSubject','hrv','clerkSubject','tokenHash']) assert.ok(!JSON.stringify(result).includes(sensitive));
 await f.group('updateSharing','friend',{groupId:f.id,name:'Friend',metrics:[],shareDays:7});assert.equal((await f.group('history','owner',{groupId:f.id})).members.find(m=>!m.self).nights.length,0);
});
test('leaving, removal and closing revoke group reads immediately and retain private data',async()=>{
 const f=await setup();await join(f);await f.group('leave','friend',{groupId:f.id});await assert.rejects(f.group('history','friend',{groupId:f.id}));await f.run(sleep,'verify','friend');
 await join(f,'friend2');const member=f.tables.sleepMembers.find(m=>m.subject==='friend2');await f.group('removeMember','owner',{groupId:f.id,memberId:member._id});await assert.rejects(f.group('history','friend2',{groupId:f.id}));
 await f.group('close','owner',{groupId:f.id});await assert.rejects(f.group('history','owner',{groupId:f.id}));
});
test('only owners issue/revoke invites or remove members and cross-group IDs are rejected',async()=>{
 const f=await setup();await join(f);await assert.rejects(f.group('issueInvite','friend',{groupId:f.id,tokenHash:'x'}),/owner/);
 const other=await f.group('create','friend',{groupName:'Other',name:'Friend',metrics:[],shareDays:7});const foreign=f.tables.sleepMembers.find(m=>m.groupId===other);
 await assert.rejects(f.group('removeMember','owner',{groupId:f.id,memberId:foreign._id}));await assert.rejects(f.group('history','owner',{groupId:other}));
});
test('WHOOP upsert separates two connections and migration never reassigns owned records',async()=>{
 const f=await setup();await join(f);for(const subject of ['owner','friend']){await f.db.insert('whoopConnections',{clerkSubject:subject});await f.run(whoop,'upsertSleepNights',subject,{clerkSubject:subject,importBatchId:'whoop',nights:[{sleepDate:today(),score:90}]});}
 assert.equal(f.tables.sleepNights.length,2);await f.db.insert('sleepNights',{...night()});await f.run(groups,'migrateLegacy','owner');assert.equal(f.tables.sleepNights.filter(n=>n.ownerSubject==='friend').length,1);assert.equal(f.tables.sleepNights.filter(n=>n.ownerSubject==='owner').length,2);assert.equal((await f.run(groups,'migrateLegacy','owner')).migrated,0);
});
test('expanded metrics preserve opt-in boundaries, source integrity, and daily owner isolation',async()=>{
 const f=await setup();await join(f,'friend',['recovery','workoutMinutes','deepMinutes']);
 await f.db.insert('whoopConnections',{clerkSubject:'friend',scope:'read:sleep read:recovery'});
 await f.run(whoop,'upsertDays','friend',{clerkSubject:'friend',fields:['recovery','hrv','strain','workoutMinutes'],days:[{sleepDate:today(),recovery:82,hrv:90,strain:15,workoutMinutes:0}]});
 f.tables.sleepNights.push({...night(),ownerSubject:'friend',deepMinutes:75,recovery:10,hrv:999});
 f.tables.whoopDays.push({ownerSubject:'owner',sleepDate:today(),recovery:2});
 let friend=(await f.group('history','owner',{groupId:f.id})).members.find(m=>!m.self);
 assert.equal(friend.nights[0].recovery,82);assert.equal(friend.nights[0].workoutMinutes,0);assert.equal(friend.nights[0].deepMinutes,75);
 assert.equal(friend.nights[0].hrv,undefined);assert.equal(friend.nights[0].strain,undefined);
 await f.group('updateSharing','friend',{groupId:f.id,name:'Friend',metrics:['score'],shareDays:7});
 friend=(await f.group('history','owner',{groupId:f.id})).members.find(m=>!m.self);assert.equal(friend.nights[0].recovery,undefined);
 await f.run(whoop,'upsertDays','friend',{clerkSubject:'friend',fields:['recovery','hrv'],days:[{sleepDate:today(),recovery:83}]});
 const day=f.tables.whoopDays.find(d=>d.ownerSubject==='friend');assert.equal(day.hrv,undefined);assert.equal(day.strain,15);
 assert.equal((await f.run(whoop,'status','friend')).needsUpgrade,true);
});

test('personal dashboard biometrics are owner-scoped and date-bounded independently of group sharing', async()=>{
 const f=await setup();await join(f);
 for(const ownerSubject of ['owner','friend'])for(const sleepDate of [today(),'2020-01-01'])f.tables.whoopDays.push({ownerSubject,sleepDate,hrv:ownerSubject==='owner'?55:95});
 for(const subject of ['owner','friend']){
  const data=await f.run(sleep,'dashboard',subject,{startDate:today(),endDate:today()});
  assert.equal(data.whoopDays.length,1);assert.equal(data.whoopDays[0].ownerSubject,subject);assert.equal(data.whoopDays[0].hrv,subject==='owner'?55:95);
 }
});

test('invitation history keeps lifecycle details, records acceptance, and is owner-only',async()=>{
 const f=await setup();
 const token='d'.repeat(64);const created=await f.group('issueInvite','owner',{groupId:f.id,tokenHash:await groups.hashInvite(token),label:'Dan label'});
 let data=await f.group('history','owner',{groupId:f.id});assert.equal(data.invitationHistory[0].label,'Dan label');assert.equal(data.invitationHistory[0].status,'pending');
 await f.group('acceptInvite','friend',{token,name:'Actual joiner',metrics:[],shareDays:28});
 data=await f.group('history','owner',{groupId:f.id});assert.equal(data.invitationHistory[0].status,'accepted');assert.equal(data.invitationHistory[0].acceptedName,'Actual joiner');assert.ok(data.invitationHistory[0].usedAt);
 assert.ok(!JSON.stringify(data.invitationHistory).includes('tokenHash'));assert.ok(!JSON.stringify(data.invitationHistory).includes(token));
 assert.equal((await f.group('history','friend',{groupId:f.id})).invitationHistory.length,0);
 await assert.rejects(f.group('revokeInvite','owner',{inviteId:created.id}),/accepted/);
 await f.group('leave','friend',{groupId:f.id});assert.equal((await f.group('history','owner',{groupId:f.id})).invitationHistory[0].acceptedName,'Actual joiner');
});
test('replacement invalidates only the old link and preserves its audit row at the pending limit',async()=>{
 const f=await setup(),oldToken=await invitation(f,'e');
 for(const char of ['1','2','3','4'])await invitation(f,char);
 const previous=f.tables.sleepInvites[0],token='f'.repeat(64);
 const result=await f.group('issueInvite','owner',{groupId:f.id,replaceInviteId:previous._id,tokenHash:await groups.hashInvite(token),label:'Replacement'});
 assert.equal(f.tables.sleepInvites.length,6);assert.equal(previous.replacedBy,result.id);
 await assert.rejects(f.group('previewInvite','friend',{token:oldToken}),/invalid|expired/);
 assert.equal((await f.group('previewInvite','friend',{token})).name,'Friends');
 const invites=(await f.group('history','owner',{groupId:f.id})).invitationHistory;
 assert.equal(invites.filter(i=>i.status==='pending').length,5);assert.equal(invites.filter(i=>i.status==='revoked').length,1);
 await assert.rejects(f.group('issueInvite','owner',{groupId:f.id,replaceInviteId:previous._id,tokenHash:'new'}),/replacement/);
});
test('invitation history supports old rows and rejects non-owner or cross-group replacements',async()=>{
 const f=await setup();await join(f);
 const expired=await invitation(f,'e');f.tables.sleepInvites.at(-1).expiresAt=1;
 const pending=await invitation(f,'f');const invite=f.tables.sleepInvites.at(-1);
 await assert.rejects(f.group('issueInvite','friend',{groupId:f.id,replaceInviteId:invite._id,tokenHash:'x'}),/owner/);
 const other=await f.group('create','owner',{groupName:'Other',...settings});
 await assert.rejects(f.group('issueInvite','owner',{groupId:other,replaceInviteId:invite._id,tokenHash:'x'}),/not found/);
 await f.group('revokeInvite','owner',{inviteId:invite._id});
 const history=(await f.group('history','owner',{groupId:f.id})).invitationHistory;
 assert.equal(history.find(i=>i.status==='expired').label,'Unlabeled invitation');
 assert.ok(history.some(i=>i.status==='accepted'));assert.ok(history.some(i=>i.status==='revoked'));
 await assert.rejects(f.group('issueInvite','owner',{groupId:f.id,tokenHash:'x',label:'x'.repeat(81)}),/80/);
});
