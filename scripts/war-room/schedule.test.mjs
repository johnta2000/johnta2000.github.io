import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {countdown,milestones,labels}=require('../../war-room-10012026/schedule.js');
test('all launch windows use October 1 Pacific daylight time regardless of viewer timezone',()=>{
 assert.deepEqual(milestones.map(m=>new Date(m.at).toISOString()),[
  '2026-10-01T12:00:00.000Z','2026-10-01T13:00:00.000Z','2026-10-01T14:00:00.000Z','2026-10-01T15:00:00.000Z','2026-10-01T19:00:00.000Z',
 ]);
});
test('countdowns handle before, exact, and after launch without negative numbers',()=>{
 const launch=milestones[0],at=Date.parse(launch.at);
 assert.deepEqual(countdown(launch,at-3661000),{label:'Launch in',time:'01:01:01',elapsed:false});
 assert.equal(countdown(launch,at-1).time,'00:00:01');
 assert.equal(countdown(launch,at).time,'00:00:00');
 assert.equal(countdown(launch,at).elapsed,true);
 assert.equal(countdown(launch,at+1000).time,'00:00:01');
 assert.equal(countdown(launch,at-90061000).time,'1d 01:01:01');
});
test('deadline remains distinct and elapsed time never sets a manual status',()=>{
 const deadline=milestones.at(-1);
 assert.equal(countdown(deadline,Date.parse(deadline.at)-1000).label,'Deadline in');
 assert.equal(countdown(deadline,Date.parse(deadline.at)+1000).label,'Since deadline');
 assert.deepEqual(labels,{'on-track':'On Track','no-mans-land':"No Man's Land",'behind-schedule':'Behind Schedule'});
 assert.equal('status' in countdown(deadline,Date.parse(deadline.at)+1000),false);
});
