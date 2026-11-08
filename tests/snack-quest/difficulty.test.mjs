import test from 'node:test';import assert from 'node:assert/strict';
import {ROOMS,walkable,DIFFICULTIES,createRun,upgradeRun,validRun,makeWorld,toysFor,gophersFor,startAbility,step,retryRoom,enemyKinds} from '../../games/snack-quest/engine.mjs';
test('difficulty and acknowledged enemies persist; legacy saves keep Normal balance',()=>{
 for(const difficulty of Object.keys(DIFFICULTIES)){
  const r=createRun('diffsave',difficulty);r.seenEnemies=['vacuum','cat'];const saved=JSON.parse(JSON.stringify(r));assert.ok(validRun(saved,r.id));upgradeRun(saved);assert.equal(saved.difficulty,difficulty);retryRoom(saved,'meadow');assert.equal(saved.difficulty,difficulty);assert.deepEqual(saved.seenEnemies,['vacuum','cat']);
 }
 const old=createRun('oldlevel');delete old.difficulty;delete old.seenEnemies;old.health=2;assert.ok(validRun(old,old.id));upgradeRun(old);assert.equal(old.difficulty,'normal');assert.deepEqual(old.seenEnemies,[]);assert.equal(old.health,2);
 for(const difficulty of ['bad',null,{},'__proto__']){const r=createRun('badlevel');r.difficulty=difficulty;assert.equal(validRun(r,r.id),false);}
 for(const seenEnemies of [['bad'],['cat','cat'],'cat',null]){const r=createRun('badseen1');r.seenEnemies=seenEnemies;assert.equal(validRun(r,r.id),false);}
});
test('presets change enemy mixes and introduce cats/geese at different stages',()=>{
 const kinds=(d,room)=>toysFor(1,room,d).map(t=>t.kind);
 assert.deepEqual(kinds('cozy','meadow'),['vacuum']);assert.ok(kinds('normal','meadow').includes('cat'));assert.ok(kinds('cozy','woods').includes('cat'));
 assert.equal(kinds('normal','woods').includes('goose'),false);assert.ok(kinds('spicy','woods').includes('goose'));assert.equal(kinds('cozy','orchard').includes('goose'),false);assert.ok(kinds('cozy','kitchen').includes('goose'));
 assert.ok(toysFor(1,'meadow','cozy').length<toysFor(1,'meadow','normal').length);assert.ok(toysFor(1,'meadow','spicy').length>toysFor(1,'meadow','normal').length);
 assert.ok(gophersFor(1,'burrows','cozy').length<gophersFor(1,'burrows','normal').length);
});
test('warnings, enemy speed, attack reach, and ability windows follow the selected rules',()=>{
 const states=[];
 for(const difficulty of ['cozy','normal','spicy']){
  const r=createRun('timing123',difficulty);Object.assign(r,{keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,health:4});const w=makeWorld(r,'meadow');w.items=[];w.gophers=[];
  const t=w.toys[0];Object.assign(w.player,{x:t.x-100,y:t.y});t.cooldown=0;step(w,r,{x:0,y:0},.016);assert.equal(t.mode,'windup');
  for(const ability of ['bark','stink','power'])assert.ok(startAbility(w,r,ability));
  states.push({warning:t.timer,speed:Math.abs(t.vx),shield:w.shield,zoomies:w.zoomies,range:w.rules.flopRadius,stun:w.rules.flopStun,honk:w.rules.honkReach});
 }
 for(const key of ['warning','shield','zoomies','range','stun'])assert.ok(states[0][key]>states[1][key]&&states[1][key]>states[2][key],key);
 for(const key of ['speed','honk'])assert.ok(states[0][key]<states[1][key]&&states[1][key]<states[2][key],key);
});
test('the enemy guide contains only types actually present, including the boss',()=>{
 for(const d of Object.keys(DIFFICULTIES)){const r=createRun('guide123',d);assert.deepEqual(enemyKinds(makeWorld(r,'tutorial')),[]);assert.ok(enemyKinds(makeWorld(r,'meadow')).includes('vacuum'));const b=makeWorld(r,'boss');assert.deepEqual(enemyKinds(b),['boss']);b.boss.mode='off';assert.deepEqual(enemyKinds(b),[]);}
});

test('every difficulty spawns enemies on safe ground in every room',()=>{
 for(const d of Object.keys(DIFFICULTIES))for(const room of Object.keys(ROOMS))for(const target of [...toysFor(1,room,d),...gophersFor(1,room,d)])assert.ok(walkable(target.x,target.y,room,target.r),d+' '+room+' '+target.kind);
});
