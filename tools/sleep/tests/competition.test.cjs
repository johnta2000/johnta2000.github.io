const {test,before}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),esbuild=require('esbuild');
const D=require('../model.js');
let buildWhoopDays;
before(async()=>{const b=await esbuild.build({entryPoints:[path.join(__dirname,'../../../convex/whoopMetrics.ts')],bundle:true,write:false,platform:'node',format:'cjs'});const m={exports:{}};vm.runInNewContext(b.outputFiles[0].text,{module:m,exports:m.exports});buildWhoopDays=m.exports.buildWhoopDays;});
function member(id, values, extra={}) {return {id,name:id,metrics:['score','hrv','workoutMinutes'],nights:values.map((n,i)=>({sleepDate:`2026-09-${String(17+i).padStart(2,'0')}`,source:'whoop',scoreKind:'native',...n})),...extra};}
test('standings exclude today, require coverage, deduplicate days, and assign ties at displayed precision',()=>{
 const rows=Array.from({length:14},()=>({score:80}));
 const a=member('a',rows),b=member('b',rows),c=member('c',rows.map(()=>({score:79}))),sparse=member('sparse',[{score:100}]);
 a.nights.push({...a.nights.at(-1)},{sleepDate:'2026-10-01',source:'whoop',scoreKind:'native',score:100});
 const board=D.standings([a,b,c,sparse],'score','2026-10-01');
 assert.deepEqual(board.entries.map(x=>x.rank),[1,1,3,undefined]);assert.equal(board.entries[0].result,80);assert.equal(board.entries[0].count,7);
});
test('HRV standings rank relative improvement, never raw HRV, and require a valid baseline',()=>{
 const a=member('a',Array.from({length:14},(_,i)=>({hrv:i<7?40:48}))),b=member('b',Array.from({length:14},(_,i)=>({hrv:i<7?100:110}))),zero=member('zero',Array.from({length:14},(_,i)=>({hrv:i<7?0:80})));
 const board=D.standings([b,zero,a],'hrvGain','2026-10-01');assert.equal(board.entries[0].id,'a');assert.equal(board.entries[0].result,20);assert.equal(board.entries[2].eligible,false);
 const hidden={...a,metrics:[]};assert.equal(D.standings([hidden],'hrvGain','2026-10-01').entries[0].reason,'Not shared');
});
test('workout totals distinguish complete rest days from unknown days',()=>{
 const full=member('full',Array.from({length:14},(_,i)=>({workoutMinutes:i%2?40:0}))),missing=member('missing',Array.from({length:13},()=>({workoutMinutes:100})));
 const board=D.standings([full,missing],'workoutMinutes','2026-10-01');assert.equal(board.entries[0].result,160);assert.equal(board.entries[1].eligible,false);
});
test('WHOOP recovery joins sleep IDs across offsets; ongoing cycles and calibration remain gaps',()=>{
 const sleeps=[{id:'s',end:'2026-10-02T02:00:00Z',timezone_offset:'-07:00'},{id:'cal',end:'2026-10-03T14:00:00Z'}];
 const rec=[{sleep_id:'s',score_state:'SCORED',score:{recovery_score:80,hrv_rmssd_milli:50,resting_heart_rate:55}},{sleep_id:'cal',score_state:'SCORED',score:{user_calibrating:true,recovery_score:90}}];
 const cycles=[{start:'2026-10-01T15:00:00Z',end:'2026-10-02T15:00:00Z',score_state:'SCORED',score:{strain:12}},{start:'2026-10-02T15:00:00Z',end:null,score_state:'SCORED',score:{strain:8}}];
 const result=buildWhoopDays(sleeps,rec,cycles,[],'read:sleep read:recovery read:cycles read:workout',Date.parse('2026-10-04T00:00:00Z'));
 const day=result.days.find(d=>d.sleepDate==='2026-10-01');assert.equal(day.recovery,80);assert.equal(day.strain,12);assert.equal(day.workoutMinutes,0);assert.equal(result.days.find(d=>d.sleepDate==='2026-10-03').recovery,undefined);
 assert.ok(!result.days.some(d=>d.strain===8));
});
test('workout aggregation deduplicates records and ignores pending workouts',()=>{
 const w={id:'w',start:'2026-10-02T01:00:00Z',end:'2026-10-02T02:00:00Z',timezone_offset:'-07:00',score_state:'SCORED'};
 const result=buildWhoopDays([],[],[],[w,w,{...w,id:'p',start:'2026-10-03T20:00:00Z',score_state:'PENDING_SCORE'}],'read:workout',Date.parse('2026-10-04T00:00:00Z'));
 assert.equal(result.days[0].sleepDate,'2026-10-01');assert.equal(result.days[0].workoutMinutes,60);assert.equal(result.days[0].workoutCount,1);assert.equal(result.days.find(d=>d.sleepDate==='2026-10-03').workoutMinutes,undefined);
});
