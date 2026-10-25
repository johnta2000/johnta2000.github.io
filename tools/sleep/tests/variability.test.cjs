const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../model.js');
const member=(values,metrics=['score'])=>({id:'a',name:'A',metrics,nights:values.map((score,i)=>({sleepDate:`2026-10-${String(i+1).padStart(2,'0')}`,source:'whoop',scoreKind:'native',score}))});
test('equal averages expose stable versus volatile histories and signed derivatives',()=>{
 const stable=D.groupHistory([member([70,70,70])],'score',3,'2026-10-03').members[0];
 const wild=D.groupHistory([member([60,90,60])],'score',3,'2026-10-03','changes').members[0];
 assert.equal(stable.average,wild.average);assert.equal(stable.variability.typicalSwing,0);
 assert.equal(wild.variability.typicalSwing,30);assert.equal(wild.variability.pairCount,2);
 assert.ok(Math.abs(wild.variability.volatility-Math.sqrt(200))<1e-10);
 assert.equal(wild.variability.biggestDrop.value,-30);assert.equal(wild.variability.biggestJump.date,'2026-10-02');
 assert.deepEqual(wild.points.map(p=>p.value),[undefined,30,-30]);
 assert.deepEqual(D.groupHistory([member([60,90,60])],'score',3,'2026-10-03','whiplash').members[0].points.map(p=>p.value),[undefined,undefined,-60]);
});
test('missing readings never become zero or bridge derivative gaps',()=>{
 const row=D.groupHistory([member([0,undefined,20,30])],'score',4,'2026-10-04','changes').members[0];
 assert.equal(row.count,3);assert.equal(row.variability.min,0);assert.equal(row.variability.typicalSwing,10);
 assert.deepEqual(row.points.map(p=>p.value),[undefined,undefined,undefined,10]);
 assert.equal(row.segments.length,1);assert.equal(row.segments[0].length,1);
 assert.equal(D.groupHistory([member([0,undefined,20,30])],'score',4,'2026-10-04','whiplash').members[0].segments.length,0);
 assert.equal(row.variability.trend,10);
});
test('respect opt-in, WHOOP source, native scores, deduplication and range boundaries',()=>{
 const m=member([10,20,30,40]);m.nights.push({...m.nights[3]},{...m.nights[2],source:'apple_health',score:999});
 const r=D.groupHistory([m],'score',2,'2026-10-04','changes').members[0];
 assert.equal(r.count,2);assert.equal(r.variability.pairCount,1);assert.equal(r.points[0].value,undefined);
 assert.equal(r.variability.min,30);assert.equal(r.variability.max,40);
 assert.equal(D.groupHistory([{...m,metrics:[]}],'score',4,'2026-10-04').members[0].count,0);
 m.nights.forEach(n=>n.scoreKind='derived');assert.equal(D.groupHistory([m],'score',4,'2026-10-04').members[0].count,0);
});
test('empty and single-day histories do not claim zero volatility or trend',()=>{
 const empty=D.groupHistory([member([])],'score',7,'2026-10-07').members[0].variability;
 for(const key of ['min','max','trend','volatility','typicalSwing','biggestDrop'])assert.equal(empty[key],null);
 const one=D.groupHistory([member([0])],'score',7,'2026-10-07').members[0].variability;
 assert.equal(one.min,0);assert.equal(one.volatility,null);assert.equal(one.trend,null);
});
