import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, ORDER, TRINKETS, roomTrinkets, upgradeRun, gophersFor, createRun, makeWorld, roomItems, toysFor, walkable, step, startDash, maxHearts, isUnlocked, goalDone, validRun, migrateRun, retryRoom } from '../../games/snack-quest/engine.mjs';
const idle={x:0,y:0};
function toyAt(x,y){return {x,y,r:18,vx:0,vy:0,kind:'ball',mode:'roam',timer:0,cooldown:9};}

test('Pepper follows continuously without flipping at each trail point',()=>{
  const run=createRun('follow123');run.keyFound=true;run.pepperFound=true;run.health=4;
  const world=makeWorld(run,'meadow');world.toys=[];
  for(let i=0;i<140;i++){
    const x=world.buddy.x;step(world,run,{x:1,y:0},1/60);
    if(i>50){assert.ok(world.buddy.x-x>2,'no stationary frame between trail points');assert.equal(world.buddy.facing,1);}
  }
  const gap=Math.hypot(world.player.x-world.buddy.x,world.player.y-world.buddy.y);
  assert.ok(gap>64&&gap<85,'a consistent, comfortable gap');
  const stoppedAt={...world.player};
  for(let i=0;i<120;i++)step(world,run,idle,1/60);
  assert.deepEqual({x:world.player.x,y:world.player.y},{x:stoppedAt.x,y:stoppedAt.y});
  assert.ok(Math.abs(world.player.x-world.buddy.x-64)<.1,'Pepper settles behind Pepsi');
  assert.equal(world.buddy.moving,false);
});
test('Pepper keeps his facing on vertical trails and catches up without teleporting',()=>{
  const run=createRun('follow234');run.keyFound=true;run.pepperFound=true;run.health=4;run.positions.meadow={x:135,y:180};
  const world=makeWorld(run,'meadow');world.toys=[];
  for(let i=0;i<90;i++){
    const before={...world.buddy};
    if(i===35)startDash(world,{x:0,y:1});
    step(world,run,{x:0,y:1},1/60);
    assert.equal(world.buddy.facing,1,'vertical motion does not mirror the sprite');
    assert.ok(Math.hypot(world.buddy.x-before.x,world.buddy.y-before.y)<=400/60+.001);
    assert.ok(walkable(world.buddy.x,world.buddy.y,'meadow',12));
  }
});

test('snacks, hazards, and quest goals are reachable on solid ground',()=>{
  for(const room of ORDER){
    const visited=new Set(['140,320']),queue=[[140,320]];
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[10,0],[-10,0],[0,10],[0,-10]]){
      const [x,y]=queue[i],nx=x+dx,ny=y+dy,key=`${nx},${ny}`;
      if(!visited.has(key)&&walkable(nx,ny,room)){visited.add(key);queue.push([nx,ny]);}
    }
    for(const [x,y] of [...ROOMS[room].slots,...roomTrinkets(room).map(item=>[item.x,item.y]),[ROOMS[room].goal.x,ROOMS[room].goal.y],[910,320]])assert.ok(queue.some(([px,py])=>Math.hypot(x-px,y-py)<18),`${room}: ${x},${y}`);
    for(let seed=0;seed<500;seed++){
      assert.equal(roomItems(seed,room).length,3);
      for(const item of roomItems(seed,room))assert.ok(walkable(item.x,item.y,room));
      for(const toy of [...toysFor(seed,room),...gophersFor(seed,room)])assert.ok(walkable(toy.x,toy.y,room,toy.r));
    }
  }
});
test('Pepsi starts alone; rooms unlock through discoveries, not snack totals',()=>{
  const run=createRun('start123');assert.equal(run.pepperFound,false);assert.equal(run.health,3);
  assert.equal(isUnlocked(run,'pond'),false);assert.equal(isUnlocked(run,'orchard'),false);
  run.collected=roomItems(run.seed,'meadow').map(x=>x.id);assert.equal(isUnlocked(run,'pond'),false);
  run.keyFound=true;assert.ok(isUnlocked(run,'pond'));assert.equal(isUnlocked(run,'orchard'),false);
});
test('walking into the key crate does not open it; dashing does',()=>{
  const run=createRun('crate123'),world=makeWorld(run,'meadow');world.toys=[];
  world.player.x=490;world.player.y=190;step(world,run,{x:1,y:0},.02);assert.equal(run.keyFound,false);
  assert.ok(startDash(world,{x:1,y:0}));let events=[];
  for(let i=0;i<10;i++)events.push(...step(world,run,{x:1,y:0},.02));
  assert.ok(events.some(e=>e.type==='key'));assert.ok(run.keyFound);assert.equal(run.collected.length,0);
});
test('hits cost hearts, have a grace period, and three hits stop the run',()=>{
  const run=createRun('hits1234'),world=makeWorld(run,'meadow');world.items=[];
  for(let n=1;n<=3;n++){
    world.invincible=0;world.toys=[toyAt(world.player.x,world.player.y)];
    const events=step(world,run,idle,.016);assert.equal(run.health,3-n);
    assert.ok(events.some(e=>e.type===(n===3?'defeat':'hit')));
    const before=run.health;step(world,run,idle,.016);assert.equal(run.health,before,'no repeated damage in grace period');
  }
  const before={...world.player};assert.deepEqual(step(world,run,{x:1,y:0},.03),[]);assert.equal(world.player.x,before.x);
});
test('snacks heal exactly one heart, once each, up to the heart limit',()=>{
  const run=createRun('heal1234'),world=makeWorld(run,'meadow');world.toys=[];run.health=1;
  const item=world.items[0];Object.assign(world.player,{x:item.x,y:item.y});
  assert.ok(step(world,run,idle,.016).some(e=>e.type==='snack'&&e.healed));assert.equal(run.health,2);
  step(world,run,idle,.016);assert.equal(run.health,2);assert.equal(run.collected.length,1);
});
test('a dash stuns a toy, blocks damage, and cannot be spammed',()=>{
  const run=createRun('stun1234'),world=makeWorld(run,'meadow');world.invincible=0;world.items=[];
  world.toys=[toyAt(150,315)];assert.ok(startDash(world,{x:1,y:0}));assert.equal(startDash(world),false);
  const events=step(world,run,{x:1,y:0},.016);assert.ok(events.some(e=>e.type==='stun'));assert.equal(run.health,3);assert.equal(world.toys[0].mode,'stunned');
});
test('hazards telegraph a fixed direction before charging',()=>{
  const run=createRun('windup12'),world=makeWorld(run,'meadow');world.items=[];
  world.toys=[{...toyAt(300,315),cooldown:0}];step(world,run,idle,.02);
  assert.equal(world.toys[0].mode,'windup');assert.equal(world.toys[0].x,300);
  const direction=world.toys[0].aimX;world.player.y=450;
  for(let i=0;i<34;i++)step(world,run,idle,.02);
  assert.equal(world.toys[0].aimX,direction);step(world,run,idle,.02);assert.equal(world.toys[0].mode,'charge');
});
test('rescuing Pepper needs the key and grants a permanent fourth heart',()=>{
  const run=createRun('rescue12'),world=makeWorld(run,'pond');world.toys=[];world.player.x=775;world.player.y=370;
  step(world,run,idle,.016);assert.equal(run.pepperFound,false);
  run.keyFound=true;run.health=1;assert.ok(step(world,run,idle,.016).some(e=>e.type==='rescue'));
  assert.equal(run.health,4);assert.equal(maxHearts(run),4);assert.ok(isUnlocked(run,'orchard'));
});
test('the final exit needs Pepper, the picnic basket, and all six trinkets',()=>{
  const run=createRun('finish12');run.keyFound=true;run.pepperFound=true;
  const world=makeWorld(run,'orchard');world.toys=[];world.items=[];
  Object.assign(world.player,{x:910,y:320});assert.equal(step(world,run,idle,.02).some(e=>e.type==='exit'),false);
  Object.assign(world.player,{x:825,y:160});assert.ok(step(world,run,idle,.02).some(e=>e.type==='basket'));
  Object.assign(world.player,{x:910,y:320});assert.equal(step(world,run,idle,.02).some(e=>e.type==='exit'),false);
  run.trinkets=TRINKETS.map(item=>item.id);assert.ok(step(world,run,idle,.02).some(e=>e.type==='exit'));
});
test('retry loses this attempt’s snacks but preserves discoveries and earlier chapters',()=>{
  const run=createRun('retry123');run.keyFound=true;run.pepperFound=true;run.collected=['meadow-0'];makeWorld(run,'orchard');
  run.collected.push('orchard-1');run.health=0;const world=retryRoom(run,'orchard');
  assert.deepEqual(run.collected,['meadow-0']);assert.equal(run.health,4);assert.equal(run.retries,1);assert.equal(world.player.x,135);assert.ok(run.pepperFound&&run.keyFound);
});
test('old adventures migrate without changing the original save or losing snacks',()=>{
  const old={version:1,id:'legacy12',seed:42,collected:['meadow-0','meadow-1','meadow-2','meadow-3'],completed:false};
  const original=JSON.stringify(old),run=migrateRun(old,old.id);assert.ok(validRun(run,old.id));assert.equal(JSON.stringify(old),original);assert.deepEqual(run.collected,old.collected);assert.ok(run.keyFound);assert.equal(run.pepperFound,false);assert.equal(run.room,'pond');
});
test('health, loss state, and milestones survive serialization; bad saves fail validation',()=>{
  const run=createRun('save1234');run.health=0;run.keyFound=true;assert.ok(validRun(JSON.parse(JSON.stringify(run)),run.id));
  run.health=-1;assert.equal(validRun(run,run.id),false);run.health=3;run.pepperFound=true;run.keyFound=false;assert.equal(validRun(run,run.id),false);
});

test('rescue stays at the pond; both trinkets are needed before its exit',()=>{
  const run=createRun('pondquest');run.keyFound=true;
  const world=makeWorld(run,'pond');world.toys=[];world.gophers=[];
  Object.assign(world.player,{x:775,y:370});const events=step(world,run,idle,.016);
  assert.deepEqual(events.map(event=>event.type),['rescue']);assert.equal(world.room,'pond');assert.equal(goalDone(run,'pond'),false);
  Object.assign(world.player,{x:910,y:320});assert.ok(!step(world,run,idle,.016).some(event=>event.type==='exit'));
  for(const item of roomTrinkets('pond')){Object.assign(world.player,{x:item.x,y:item.y});assert.ok(step(world,run,idle,.016).some(event=>event.type==='trinket'));}
  assert.equal(goalDone(run,'pond'),true);
  run.health=0;retryRoom(run,'pond');assert.equal(run.trinkets.length,2,'trinkets survive retries');
  assert.equal(validRun(JSON.parse(JSON.stringify(run)),run.id),true);
});
test('the garden requires both trinkets and advances to the orchard',()=>{
  const run=createRun('garden123');run.keyFound=true;run.pepperFound=true;run.health=4;
  const world=makeWorld(run,'burrows');world.toys=[];world.gophers=[];
  assert.equal(goalDone(run,'burrows'),false);
  for(const item of roomTrinkets('burrows')){Object.assign(world.player,item);step(world,run,idle,.016);}
  assert.equal(goalDone(run,'burrows'),true);Object.assign(world.player,{x:910,y:320});
  assert.ok(step(world,run,idle,.016).some(event=>event.type==='exit'));assert.equal(ORDER[ORDER.indexOf('burrows')+1],'orchard');
});
test('cats warn, pounce along a fixed line, and rest with a safe dodge window',()=>{
  const run=createRun('catquest');const world=makeWorld(run,'meadow');world.items=[];world.gophers=[];
  world.toys=[{...toyAt(350,315),kind:'cat',cooldown:0}];const cat=world.toys[0];
  step(world,run,idle,.02);assert.equal(cat.mode,'windup');const x=cat.x,aim=cat.aimX;
  world.player.y=480;for(let i=0;i<30;i++)step(world,run,idle,.02);
  assert.equal(cat.mode,'windup');assert.equal(cat.x,x);assert.equal(cat.aimX,aim);
  for(let i=0;i<15;i++)step(world,run,idle,.02);assert.equal(cat.mode,'charge');assert.ok(cat.x<x);
  for(let i=0;i<30;i++)step(world,run,idle,.02);assert.equal(cat.mode,'rest');assert.equal(run.health,3);
});
test('gophers warn harmlessly before surfacing, cost a heart, and can be dashed',()=>{
  const run=createRun('gophertest');run.keyFound=true;run.pepperFound=true;run.health=4;
  const world=makeWorld(run,'burrows');world.toys=[];world.items=[];
  const g={x:200,y:315,r:22,kind:'gopher',mode:'hidden',timer:0,cycle:0,seed:42};world.gophers=[g];Object.assign(world.player,{x:200,y:315});world.invincible=0;
  step(world,run,idle,.02);assert.equal(g.mode,'warning');assert.equal(run.health,4);
  for(let i=0;i<40;i++)step(world,run,idle,.02);assert.equal(run.health,4);
  for(let i=0;i<10;i++)step(world,run,idle,.02);assert.equal(g.mode,'up');assert.equal(run.health,3);
  Object.assign(world.player,{x:170,y:315});world.invincible=0;startDash(world,{x:1,y:0});
  assert.ok(step(world,run,idle,.02).some(event=>event.type==='stun'));assert.equal(g.mode,'stunned');assert.equal(run.health,3);
});
test('existing saves gain the longer quest without losing health or a completed ending',()=>{
  const run=createRun('oldquest');delete run.trinkets;run.keyFound=true;run.pepperFound=true;run.health=2;run.room='orchard';run.collected=['pond-1'];
  assert.ok(validRun(run,run.id));upgradeRun(run);assert.equal(run.room,'orchard');assert.equal(run.health,2);assert.deepEqual(run.collected,['pond-1']);assert.deepEqual(run.trinkets,[]);
  const finished={...run,basketFound:true,completed:true};delete finished.trinkets;upgradeRun(finished);assert.equal(finished.trinkets.length,6);assert.ok(goalDone(finished,'orchard'));
  run.trinkets=['nonsense'];assert.equal(validRun(run,run.id),false);
});
