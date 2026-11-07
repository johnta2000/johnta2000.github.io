import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,makeWorld,startAbility,step,roomPoint,roomWidth,roomScale,canFindTrinkets,roomTrinkets,PEE_RESCUE,TRINKETS,upgradeRun,validRun,goalDone} from '../../games/snack-quest/engine.mjs';
const idle={x:0,y:0};
test('Zoomies gives the entire train a steerable boost, expires, and cannot be spammed',()=>{
 function roll(boost){const run=createRun('zoomies123');run.pepperFound=run.peeFound=run.pepperoniFound=true;run.health=4;const w=makeWorld(run,'tutorial');w.invincible=0;if(boost)assert.ok(startAbility(w,run,'stink'));for(let i=0;i<60;i++)step(w,run,{x:1,y:0},.016);return {run,w};}
 const normal=roll(false),fast=roll(true);
 assert.ok(Math.abs((fast.w.player.x-135)/(normal.w.player.x-135)-1.5)<.001);
 for(const body of ['buddy','pee','pepperoni'])assert.ok(fast.w[body].x>normal.w[body].x,body+' keeps pace');
 assert.equal(fast.w.shield,0);assert.equal(fast.w.invincible,0);assert.equal(fast.w.clouds.length,0);
 assert.equal(startAbility(fast.w,fast.run,'stink'),false);
 for(let i=0;i<200;i++)step(fast.w,fast.run,idle,.02);
 assert.equal(fast.w.zoomies,0);assert.ok(fast.run.cooldowns.stink>0);
});
test('rescue first reveals and enables that chapter’s treasures; snacks never gate progress',()=>{
 const r=createRun('reveal123');r.keyFound=true;
 assert.equal(canFindTrinkets(r,'pond'),false);r.pepperFound=true;assert.ok(canFindTrinkets(r,'pond'));assert.equal(canFindTrinkets(r,'hills'),false);
 r.trinkets=TRINKETS.filter(i=>['pond','burrows','woods'].includes(i.room)).map(i=>i.id);
 const hills=makeWorld(r,'hills');hills.toys=[];hills.gophers=[];hills.items=[];Object.assign(hills.player,PEE_RESCUE);step(hills,r,idle,.02);assert.ok(r.peeFound);assert.ok(canFindTrinkets(r,'hills'));
 assert.equal(canFindTrinkets(r,'laundry'),false);const w=makeWorld(r,'laundry');w.toys=[];w.items=[];
 Object.assign(w.player,roomTrinkets('laundry')[0]);step(w,r,idle,.02);assert.equal(r.trinkets.filter(i=>i.startsWith('laundry')).length,0);
 Object.assign(w.player,roomPoint('laundry',820,160));assert.ok(step(w,r,idle,.02).some(e=>e.type==='pepperoni-rescue'));assert.ok(canFindTrinkets(r,'laundry'));
 assert.equal(goalDone(r,'laundry'),false);for(const t of roomTrinkets('laundry')){Object.assign(w.player,t);step(w,r,idle,.02);}assert.ok(goalDone(r,'laundry'));assert.equal(r.collected.length,0);
});
test('indoor maps have almost twice the space with unchanged obstacle sizes; old positions migrate once',()=>{
 for(const room of ['laundry','kitchen'])assert.equal(roomWidth(room)*620*roomScale(room),1000*620*1.4*1.4);
 const r=createRun('indoor123');delete r.indoorWorlds;r.positions.laundry={x:755,y:160};r.health=2;r.cooldowns.stink=5;
 upgradeRun(r);assert.deepEqual(r.positions.laundry,{x:1057,y:224});assert.equal(r.health,2);assert.equal(r.cooldowns.stink,5);assert.ok(validRun(r,r.id));upgradeRun(r);assert.deepEqual(r.positions.laundry,{x:1057,y:224});
});
