const {test,before}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),vm=require('node:vm'),path=require('node:path');
const {getFunctionName}=require('convex/server');
let client,cryptoApi,data,env;
before(async()=>{
 env={SLEEP_ALLOWED_EMAIL:'owner@example.com',GARMIN_PERSONAL_ENABLED:'true',GARMIN_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
 async function bundle(name){const b=await esbuild.build({entryPoints:[path.join(__dirname,'../../../convex',name+'.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'handlers',setup(b){b.onResolve({filter:/\.\/_generated\/server$/},()=>({path:'server',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const query=x=>x;export const mutation=x=>x;export const internalQuery=x=>x;export const internalMutation=x=>x;export const action=x=>x;'}));}}]});const m={exports:{}};vm.runInNewContext(b.outputFiles[0].text,{module:m,exports:m.exports,require,Buffer,Date,Intl,URLSearchParams,AbortSignal,process:{env},fetch:async()=>{throw Error('Unexpected network request')}});return m.exports;}
 client=await bundle('garminClient');cryptoApi=await bundle('garmin');data=await bundle('garminData');
});
const sleep={calendarDate:'2026-11-14',sleepTimeSeconds:27000,napTimeSeconds:1800,deepSleepSeconds:5400,remSleepSeconds:6600,sleepScores:{overall:{value:84}},sleepStartTimestampGMT:'2026-11-14T04:00:00',sleepEndTimestampGMT:'2026-11-14T12:00:00'};
test('Garmin keeps native scores, uses seconds, excludes naps, and joins biometrics only on their own calendar date',()=>{
 const rows=client.normalizeGarmin([sleep],[{calendarDate:sleep.calendarDate,lastNightAvg:55,weeklyAvg:90}],[{calendarDate:sleep.calendarDate,source:'GARMIN',restingHeartRate:52}],'2026-11-13','2026-11-14');
 const r=rows[0];assert.equal(r.source,'garmin');assert.equal(r.durationMinutes,450);assert.equal(r.deepMinutes,90);assert.equal(r.remMinutes,110);assert.equal(r.score,84);assert.equal(r.hrv,55);assert.equal(r.restingHeartRate,52);assert.equal(r.asleepAt,'2026-11-14T04:00:00.000Z');assert.equal(r.sleepDate,'2026-11-14');assert.equal(r.recovery,undefined);assert.equal(r.strain,undefined);
 const missing=client.normalizeGarmin([{...sleep,sleepScores:undefined,remSleepSeconds:null}],[{calendarDate:sleep.calendarDate,weeklyAvg:90}],[{calendarDate:sleep.calendarDate,source:'FITBIT',restingHeartRate:10}],'2026-11-14','2026-11-14')[0];assert.equal(missing.score,undefined);assert.equal(missing.hrv,undefined);assert.equal(missing.remMinutes,undefined);assert.equal(missing.restingHeartRate,undefined);
});
test('off-wrist, absent and invalid data stay missing; stages cannot exceed sleep',()=>{
 assert.equal(client.normalizeGarmin([{...sleep,sleepTimeSeconds:0}],[],[],'2026-11-14','2026-11-14').length,0);
 assert.equal(client.normalizeGarmin([{...sleep,sleepWindowConfirmationType:'off_wrist'}],[],[],'2026-11-14','2026-11-14').length,0);
 const r=client.normalizeGarmin([{...sleep,deepSleepSeconds:26000,remSleepSeconds:26000,sleepScores:{overall:{value:0,qualifierKey:'INVALID'}}}],[],[],'2026-11-14','2026-11-14')[0];assert.equal(r.score,undefined);assert.equal(r.deepMinutes,undefined);
 assert.throws(()=>client.windows('2026-02-30','2026-03-02'));assert.throws(()=>client.windows('2026-01-01','2026-12-01'));
 const w=client.windows('2026-08-17','2026-11-14');assert.equal(w.length,3);assert.equal(w[0].end,'2026-09-16');assert.equal(w[1].start,'2026-09-17');assert.equal(w[2].end,'2026-11-14');
});
test('Personal API client uses fixed hosts, headers only, no redirect following, and safe errors',async()=>{
 const calls=[];const response=body=>({ok:true,status:200,json:async()=>body});
 const fetcher=async(url,options)=>{calls.push({url,options});if(url.includes('/token'))return response({access_token:'test-token'});if(url.includes('dailySleep'))return response([sleep]);if(url.includes('/hrv/'))return response({hrvSummaries:[{calendarDate:sleep.calendarDate,lastNightAvg:55}]});return response({calendarDate:sleep.calendarDate,source:'GARMIN',restingHeartRate:52});};
 const rows=await client.fetchGarmin('test-key','2026-11-14','2026-11-14',fetcher);assert.equal(rows[0].score,84);assert.equal(calls.length,4);assert.equal(calls[0].options.headers.Authorization,'ApiKey test-key');assert.equal(calls[1].options.headers.Authorization,'Bearer test-token');
 for(const c of calls){assert.ok(c.url.startsWith('https://personal.connectapi.garmin.com/'));assert.ok(!c.url.includes('test-key'));assert.equal(c.options.redirect,'error');}
 await assert.rejects(client.fetchGarmin('test-key','2026-11-14','2026-11-14',async()=>({ok:false,status:429,json:async()=>({secret:'test-key'})})),e=>e.message.includes('limiting')&&!e.message.includes('test-key'));
 await assert.rejects(client.fetchGarmin('test-key','2026-11-14','2026-11-14',async()=>response({wrong:'shape'})),/unsupported token/);
});
test('stored Garmin keys are encrypted, bound to their owner, and fail authentication on tampering',()=>{
 const encrypted=cryptoApi.encryptKey('sensitive-key','owner');assert.ok(!encrypted.includes('sensitive-key'));assert.equal(cryptoApi.decryptKey(encrypted,'owner'),'sensitive-key');assert.throws(()=>cryptoApi.decryptKey(encrypted,'friend'));
 const parts=encrypted.split('.');const bytes=Buffer.from(parts[2],'base64');bytes[0]^=1;parts[2]=bytes.toString('base64');assert.throws(()=>cryptoApi.decryptKey(parts.join('.'),'owner'));
});
function fixture(subject='owner'){
 const tables={garminNights:[],garminConnections:[],sleepProfiles:[{subject:'friend'}]};let i=0;
 const db={query(t){const filters=[];const q={withIndex(_,f){f({eq(k,v){filters.push(r=>r[k]===v);return this}});return q},collect:async()=>tables[t].filter(r=>filters.every(f=>f(r))),async unique(){return (await q.collect())[0]||null}};return q},insert:async(t,r)=>{tables[t].push({...r,_id:String(++i)})},replace:async(id,r)=>{for(const rows of Object.values(tables)){const index=rows.findIndex(x=>x._id===id);if(index>=0)rows[index]={...r,_id:id}}},delete:async id=>{for(const rows of Object.values(tables)){const index=rows.findIndex(x=>x._id===id);if(index>=0)rows.splice(index,1)}}};
 return {tables,ctx:{db,auth:{getUserIdentity:async()=>subject?{subject,email:subject+'@example.com',emailVerified:true}:null}}};
}
test('Garmin setup permits invited members; status never exposes keys; updates and disconnect stay owner-scoped',async()=>{
 const f=fixture();const args={ownerSubject:'owner',expectedRevision:null,revision:'v1',encryptedKey:'ciphertext',nights:[{sleepDate:sleep.calendarDate,source:'garmin',scoreKind:'native',durationMinutes:450}]};
 await data.save.handler(f.ctx,args);await data.save.handler(f.ctx,{...args,ownerSubject:'friend',revision:'friend'});assert.equal(f.tables.garminNights.length,2);
 const status=await data.status.handler(f.ctx,{});assert.equal(status.connected,true);assert.ok(!JSON.stringify(status).includes('ciphertext'));
 await data.save.handler(f.ctx,{...args,expectedRevision:'v1',revision:'v2'});assert.equal(f.tables.garminNights.length,2);
 await assert.rejects(data.save.handler(f.ctx,{...args,expectedRevision:'v1'}),/changed/);
 assert.equal((await data.authorize.handler(fixture('friend').ctx,{})).subject,'friend');await assert.rejects(data.authorize.handler(fixture('stranger').ctx,{}),/invitation/);await assert.rejects(data.status.handler(fixture(null).ctx,{}),/Sign in/);
 await data.disconnect.handler(f.ctx,{});assert.equal(f.tables.garminConnections.length,1);assert.equal(f.tables.garminConnections[0].ownerSubject,'friend');assert.equal(f.tables.garminNights.length,2);
 await assert.rejects(data.save.handler(f.ctx,{...args,expectedRevision:'v2'}),/changed/);
});
test('sync checks authorization before network access or accepting a caller-provided identity',async()=>{
 await assert.rejects(cryptoApi.syncPersonal.handler({runQuery:async ref=>{assert.equal(getFunctionName(ref),'garminData:authorize');throw Error('not authorized')}},{apiKey:'secret'}),/not authorized/);
});


test('Garmin stage charts retain unclassified time instead of inventing light sleep',()=>{
 const D=require('../model.js');
 const stages=D.stages({source:'garmin',durationMinutes:450,lightMinutes:220,deepMinutes:90,remMinutes:110});
 assert.equal(stages[0].minutes,220);assert.equal(stages[3].label,'Unclassified');assert.equal(stages[3].minutes,30);
 assert.equal(D.stages({source:'garmin',durationMinutes:450,deepMinutes:90,remMinutes:110}),null);
});
