const {test,before}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),vm=require('node:vm'),path=require('node:path');
const {getFunctionName}=require('convex/server');
let client,cryptoApi,data,env;
const tokenFixture='eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE5MDAwMDAwMDB9.synthetic-signature';
before(async()=>{
 env={SLEEP_ALLOWED_EMAIL:'owner@example.com',GARMIN_PERSONAL_ENABLED:'true',GARMIN_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
 async function bundle(name){const b=await esbuild.build({entryPoints:[path.join(__dirname,'../../../convex',name+'.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'handlers',setup(b){b.onResolve({filter:/\.\/_generated\/server$/},()=>({path:'server',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const query=x=>x;export const mutation=x=>x;export const internalQuery=x=>x;export const internalMutation=x=>x;export const action=x=>x;'}));}}]});const m={exports:{}};vm.runInNewContext(b.outputFiles[0].text,{module:m,exports:m.exports,require,Buffer,Date,Intl,URLSearchParams,AbortSignal,setTimeout,process:{env},fetch:async()=>{throw Error('Unexpected network request')}});return m.exports;}
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
 const calls=[];const response=body=>({ok:true,status:200,json:async()=>body,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
 const fetcher=async(url,options)=>{calls.push({url,options});if(url.includes('/token'))return response(tokenFixture);if(url.includes('dailySleep'))return response([sleep]);if(url.includes('/hrv/'))return response({hrvSummaries:[{calendarDate:sleep.calendarDate,lastNightAvg:55}]});return response({calendarDate:sleep.calendarDate,source:'GARMIN',restingHeartRate:52});};
 const rows=await client.fetchGarmin('test-key','2026-11-14','2026-11-14',fetcher);assert.equal(rows.nights[0].score,84);assert.equal(calls.length,4);assert.equal(calls[0].options.headers.Authorization,'ApiKey test-key');assert.equal(calls[1].options.headers.Authorization,'Bearer '+tokenFixture);
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

test('Garmin failures identify the failing operation and status without exposing credentials or provider bodies',async()=>{
 for(const [endpoint,label] of [['/token','authorization'],['dailySleep','sleep history'],['/hrv/','overnight HRV'],['/usersummary/','resting heart rate']]) {
  const response=body=>({ok:true,status:200,json:async()=>body,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
  const request=async url=>{
   if(url.includes(endpoint))return {ok:false,status:502,json:async()=>{throw Error('must not read private response body')}};
   if(url.includes('/token'))return response(tokenFixture);
   if(url.includes('dailySleep'))return response([sleep]);
   if(url.includes('/hrv/'))return response({hrvSummaries:[]});
   return response({calendarDate:sleep.calendarDate,source:'GARMIN'});
  };
  if(label==='authorization') await assert.rejects(client.fetchGarmin('private-key',sleep.calendarDate,sleep.calendarDate,request,async()=>{}),error=>error.step===label && error.status===502 && !/private-|2026-|https:/.test(error.message));
  else {
   const result=await client.fetchGarmin('private-key',sleep.calendarDate,sleep.calendarDate,request,async()=>{});
   assert.equal(result.complete,false);assert.ok(result.warnings.some(message=>message.includes(label)&&message.includes('HTTP 502')));
   assert.ok(result.warnings.every(message=>!/private-|2026-|https:/.test(message)));
  }
 }
 await assert.rejects(client.fetchGarmin('private-key',sleep.calendarDate,sleep.calendarDate,async()=>{throw Error('private-token')}),error=>error.message.includes('authorization could not be reached')&&!error.message.includes('private-token'));
});

test('Garmin frontend displays the safe provider error instead of the server stack',async()=>{
 const source=require('node:fs').readFileSync(path.join(__dirname,'../app.js'),'utf8');
 const fn=source.slice(source.indexOf('async function convexCall('),source.indexOf('async function getConvexToken('));
 const context={isDemo:false,CONVEX_URL:'https://test.invalid',getConvexToken:async()=>'test-token',fetch:async()=>({ok:true,json:async()=>({status:'error',errorMessage:'[Request ID: secret] Server Error',errorData:'Garmin sleep history failed (HTTP 502). Garmin returned a service error. Try again later.'})})};
 vm.runInNewContext(fn+'; run=convexCall;',context);
 await assert.rejects(context.run('action','garmin:syncPersonal',{}),e=>e.message.startsWith('Garmin sleep history failed (HTTP 502)')&&!e.message.includes('Request ID'));
});
const goodResponse=body=>({ok:true,status:200,json:async()=>body,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
const usualGarmin=async url=>url.includes('/token')?goodResponse(tokenFixture):url.includes('dailySleep')?goodResponse([sleep]):url.includes('/hrv/')?goodResponse({hrvSummaries:[]}):goodResponse({calendarDate:new URL(url).searchParams.get('calendarDate'),source:'GARMIN',restingHeartRate:52});
test('optional failures preserve sleep and keep failed dates out of replacement coverage',async()=>{
 let dailyCalls=0;
 const result=await client.fetchGarmin('key','2026-10-18','2026-11-14',async url=>{
  if(url.includes('/hrv/'))return {ok:false,status:404};
  if(url.includes('/usersummary/')){dailyCalls++;return {ok:false,status:500};}
  return usualGarmin(url);
 },async()=>{});
 assert.equal(result.nights[0].durationMinutes,450);assert.equal(result.complete,false);
 assert.equal(result.coverage.sleep.length,28);assert.equal(result.coverage.hrv.length,0);assert.equal(result.coverage.restingHeartRate.length,0);
 assert.ok(dailyCalls<=2);assert.equal(result.warnings.length,2);
});
test('a device without HRV can return no summaries; auth failures never become successful connections',async()=>{
 const empty=await client.fetchGarmin('key',sleep.calendarDate,sleep.calendarDate,async url=>url.includes('/hrv/')?goodResponse({}):usualGarmin(url),async()=>{});
 assert.equal(empty.complete,true);assert.equal(empty.nights[0].hrv,undefined);
 for(const status of [401,403])await assert.rejects(client.fetchGarmin('key',sleep.calendarDate,sleep.calendarDate,async url=>url.includes('/hrv/')?{ok:false,status}:usualGarmin(url),async()=>{}),e=>e.status===status);
});
test('transient responses retry once; valid missing data stays absent; malformed dates do not discard other streams',async()=>{
 let sleepCalls=0;
 const recovered=await client.fetchGarmin('key',sleep.calendarDate,sleep.calendarDate,async url=>{
  if(url.includes('dailySleep')&&++sleepCalls===1)return {ok:false,status:503};
  return usualGarmin(url);
 },async()=>{});
 assert.equal(sleepCalls,2);assert.equal(recovered.complete,true);
 const malformed=await client.fetchGarmin('key',sleep.calendarDate,sleep.calendarDate,async url=>url.includes('dailySleep')?goodResponse([{...sleep,calendarDate:'invalid'}]):usualGarmin(url),async()=>{});
 assert.equal(malformed.complete,false);assert.equal(malformed.nights[0].restingHeartRate,52);assert.equal(malformed.coverage.sleep.length,0);
 const empty=await client.fetchGarmin('key',sleep.calendarDate,sleep.calendarDate,async url=>url.includes('/token')?usualGarmin(url):{ok:true,status:204},async()=>{});
 assert.equal(empty.complete,true);assert.equal(empty.nights.length,0);
});
test('partial imports retain old failed-stream measurements and persist an honest retry state',async()=>{
 const f=fixture();const initial={ownerSubject:'owner',expectedRevision:null,revision:'v1',encryptedKey:'ciphertext',nights:[{sleepDate:sleep.calendarDate,source:'garmin',scoreKind:'native',durationMinutes:450,hrv:55,restingHeartRate:52}]};
 await data.save.handler(f.ctx,initial);
 await data.save.handler(f.ctx,{...initial,expectedRevision:'v1',revision:'v2',nights:[{sleepDate:sleep.calendarDate,source:'garmin',scoreKind:'native',durationMinutes:470}],coverage:{sleep:[sleep.calendarDate],hrv:[],restingHeartRate:[]},warnings:['HRV temporarily unavailable'],complete:false,days:28});
 const row=f.tables.garminNights[0];assert.equal(row.durationMinutes,470);assert.equal(row.hrv,55);assert.equal(row.restingHeartRate,52);
 const status=await data.status.handler(f.ctx,{});assert.equal(status.complete,false);assert.equal(status.syncDays,28);assert.equal(status.warnings.length,1);
 await data.save.handler(f.ctx,{...initial,expectedRevision:'v2',revision:'v3',nights:[],coverage:{sleep:[],hrv:[sleep.calendarDate],restingHeartRate:[]},warnings:[],complete:true,days:28});
 assert.equal(f.tables.garminNights[0].hrv,undefined);assert.equal(f.tables.garminNights[0].durationMinutes,470);
});
test('partial-sync UI identifies accepted key and incomplete readings without claiming full success',()=>{
 const ui=require('node:fs').readFileSync(path.join(__dirname,'../garmin.js'),'utf8'),ctx={};
 vm.runInNewContext(ui+'; summarize=garminSyncSummary;',ctx);
 const message=ctx.summarize({synced:2,complete:false,warnings:['Garmin overnight HRV failed (HTTP 404).']});
 assert.match(message,/key was accepted/);assert.match(message,/HTTP 404/);assert.match(message,/retry/);
});

test('authorization follows Garmin official plain-text JWT contract while data stays JSON',async()=>{
 const calls=[];
 const result=await client.fetchGarmin('test-key',sleep.calendarDate,sleep.calendarDate,async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/token')){
   assert.equal(options.method,'POST');assert.equal(options.headers.Accept,'*/*');assert.equal(options.body,undefined);
   return new Response('  '+tokenFixture+'\n',{status:200,headers:{'Content-Type':'text/plain'}});
  }
  assert.equal(options.headers.Accept,'application/json');assert.equal(options.headers.Authorization,'Bearer '+tokenFixture);
  return usualGarmin(url);
 });
 assert.equal(result.complete,true);assert.equal(result.nights[0].durationMinutes,450);assert.equal(calls.length,4);
 for(const body of ['', '<html>error</html>', '{"access_token":"wrong-contract"}', 'token\r\nInjected: value', 'a.b.', 'a.b.c d']){
  let count=0;
  await assert.rejects(client.fetchGarmin('test-key',sleep.calendarDate,sleep.calendarDate,async()=>{count++;return new Response(body,{status:200});}),e=>e.step==='authorization'&&e.message==='Garmin returned an unsupported token response.');
  assert.equal(count,1);
 }
 let attempts=0;
 await assert.rejects(client.fetchGarmin('test-key',sleep.calendarDate,sleep.calendarDate,async()=>{attempts++;return new Response('provider-private-body',{status:406});}),e=>e.status===406&&e.step==='authorization'&&!e.message.includes('provider-private-body'));
 assert.equal(attempts,1);
});
