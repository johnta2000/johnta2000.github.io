import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, createRun, makeWorld, roomItems, toysFor, walkable, step, startDash, roomCount, isUnlocked, validRun } from '../../games/snack-quest/engine.mjs';

test('every generated snack and toy starts in walkable ground',()=>{
  for(let seed=0;seed<1000;seed++)for(const room of Object.keys(ROOMS)){
    const items=roomItems(seed,room);assert.equal(new Set(items.map(item=>item.id)).size,4);
    for(const item of items)assert.ok(walkable(item.x,item.y,room),`${seed}/${room}: snack inside an obstacle`);
    for(const toy of toysFor(seed,room))assert.ok(walkable(toy.x,toy.y,room,toy.r),`${seed}/${room}: toy inside an obstacle`);
  }
});
test('a copied run produces exactly the same rooms and snacks',()=>{
  const run=createRun('snacktest','pepper');const copy=JSON.parse(JSON.stringify(run));assert.ok(validRun(copy,run.id));assert.deepEqual(createRun(run.id).order,copy.order);for(const room of run.order)assert.deepEqual(roomItems(run.seed,room),roomItems(copy.seed,room));
});
test('all snack positions and exits can be reached on foot',()=>{
  const grid=10;
  for(const room of Object.keys(ROOMS)){
    const visited=new Set(),queue=[[140,320]];for(let i=0;i<queue.length;i++){const [x,y]=queue[i];for(const [dx,dy]of[[grid,0],[-grid,0],[0,grid],[0,-grid]]){const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;if(!visited.has(key)&&walkable(nx,ny,room)){visited.add(key);queue.push([nx,ny]);}}}
    for(const [x,y]of[...ROOMS[room].slots,[910,320]])assert.ok(queue.some(([px,py])=>Math.hypot(x-px,y-py)<15),`${room}: unreachable ${x},${y}`);
  }
});
test('snacks collect once and unlock only the following clearing',()=>{
  const run=createRun('quest123');const world=makeWorld(run,'meadow');world.toys=[];
  assert.equal(isUnlocked(run,run.order[1]),false);
  for(const item of world.items){Object.assign(world.player,{x:item.x,y:item.y});const events=step(world,run,{x:0,y:0},.016);assert.equal(events.filter(e=>e.type==='snack').length,1);assert.equal(step(world,run,{x:0,y:0},.016).filter(e=>e.type==='snack').length,0);}
  assert.equal(run.collected.length,4);assert.equal(roomCount(run,'meadow'),4);assert.ok(isUnlocked(run,run.order[1]));assert.equal(isUnlocked(run,run.order[2]),false);
});
test('normal and diagonal movement have the same speed; dash respects boundaries',()=>{
  const run=createRun('quest456'),a=makeWorld(run,'meadow'),b=makeWorld(run,'meadow');a.toys=[];b.toys=[];
  step(a,run,{x:1,y:0},.02);step(b,run,{x:1,y:1},.02);assert.ok(Math.abs(Math.hypot(a.player.x-135,a.player.y-315)-Math.hypot(b.player.x-135,b.player.y-315))<.001);
  assert.ok(startDash(a,{x:-1,y:0}));assert.equal(startDash(a),false);for(let i=0;i<100;i++)step(a,run,{x:-1,y:0},.02);assert.ok(walkable(a.player.x,a.player.y,'meadow'));
});
test('toy bumps keep collected snacks and dash briefly protects the corgi',()=>{
  const run=createRun('quest789');run.collected=['meadow-0'];const world=makeWorld(run,'meadow');world.toys=[{x:135,y:315,vx:0,vy:0,r:17}];assert.ok(step(world,run,{x:0,y:0},.016).some(e=>e.type==='bump'));assert.deepEqual(run.collected,['meadow-0']);world.invincible=0;Object.assign(world.player,{x:135,y:315});startDash(world);assert.equal(step(world,run,{x:0,y:0},.016).some(e=>e.type==='bump'),false);
});
test('all twelve snacks are needed before the picnic exit can be reached',()=>{
  const run=createRun('quest999');for(const room of run.order){assert.ok(isUnlocked(run,room));const world=makeWorld(run,room);world.toys=[];Object.assign(world.player,{x:910,y:320});assert.equal(step(world,run,{x:0,y:0},.016).some(e=>e.type==='exit'),false);for(const item of world.items){Object.assign(world.player,{x:item.x,y:item.y});step(world,run,{x:0,y:0},.016);}Object.assign(world.player,{x:910,y:320});assert.ok(step(world,run,{x:0,y:0},.016).some(e=>e.type==='exit'));}assert.equal(run.collected.length,12);
});
test('invalid saved positions recover at a safe entrance without dropping snacks',()=>{
  const run=createRun('recover1');run.collected=['meadow-0'];run.positions.meadow={x:Infinity,y:NaN};assert.deepEqual({x:makeWorld(run,'meadow').player.x,y:makeWorld(run,'meadow').player.y},{x:135,y:315});assert.equal(run.collected.length,1);run.collected.push('meadow-0');assert.equal(validRun(run,run.id),false);
});
