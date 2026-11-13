const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../model.js');

test('standings use the selected period for totals, averages, dates, coverage, and baselines',()=>{
 const today='2026-11-13';
 const nights=Array.from({length:180},(_,i)=>({sleepDate:new Date(Date.parse(today+'T12:00:00Z')-(180-i)*86400000).toISOString().slice(0,10),source:'whoop',scoreKind:'native',score:i<152?40:80,hrv:i<152?50:60,workoutMinutes:10}));
 const full={id:'full',name:'Full',metrics:['score','hrv','workoutMinutes'],nights};
 for(const days of [7,28,90]) {
  const board=D.standings([full],'workoutMinutes',today,days);
  assert.equal(board.days,days);assert.equal(board.entries[0].result,days*10);
  assert.equal(board.end,'2026-11-12');assert.equal(board.minimum,Math.ceil(days/2));
  const sparse={...full,nights:nights.slice(-Math.ceil(days/2)+1)};
  assert.equal(D.standings([sparse],'score',today,days).entries[0].eligible,false);
  assert.equal(D.standings([{...full,nights:nights.slice(-days+1)}],'workoutMinutes',today,days).entries[0].eligible,false);
 }
 const month=D.standings([full],'score',today,28);assert.equal(month.start,'2026-10-16');assert.equal(month.entries[0].result,80);
 assert.notEqual(D.standings([full],'score',today,90).entries[0].result,80);
 assert.equal(D.standings([full],'sleepGain',today,28).entries[0].result,40);
 assert.equal(D.standings([full],'hrvGain',today,28).entries[0].result,20);
 const all=D.standings([full],'workoutMinutes',today,'all');assert.equal(all.days,180);assert.equal(all.entries[0].result,1800);
 assert.equal(D.standings([full],'sleepGain',today,'all').entries[0].reason,'No previous period for All');
 assert.equal(D.standings([full],'sleepGain',today,'all').entries[0].eligible,false);
 assert.equal(D.standings([],'score',today,'all').entries.length,0);
});
