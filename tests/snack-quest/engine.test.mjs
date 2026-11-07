import test from 'node:test';
import assert from 'node:assert/strict';
import { NEEDOH, roomPoint, roomScale, ROOMS, ORDER, TRINKETS, PEE_RESCUE, peeProgress, canRescuePee, terrainAt, windAt, roomTrinkets, upgradeRun, gophersFor, createRun, makeWorld, roomItems, toysFor, walkable, step, startDash, startAbility, maxHearts, isUnlocked, goalDone, validRun, migrateRun, retryRoom } from '../../games/snack-quest/engine.mjs';
const idle={x:0,y:0};
function toyAt(x,y){return {x,y,r:18,vx:0,vy:0,kind:'ball',mode:'roam',timer:0,cooldown:9};}

test('analog steering scales rolling speed, caps diagonals, and keeps dash strength',()=>{
  function distance(input,dash=false) {
    const run=createRun('analogroll'),world=makeWorld(run,'tutorial');
    if(dash)startDash(world,input);
    for(let i=0;i<10;i++)step(world,run,input,1/60);
    return Math.hypot(world.player.x-135,world.player.y-315);
  }
  const full=distance({x:1,y:0,analog:true});
  assert.ok(Math.abs(distance({x:.25,y:0,analog:true})-full*.25)<.01,'small tilt gives slower rolling');
  assert.ok(Math.abs(distance({x:1,y:1,analog:true})-full)<.01,'diagonals never exceed full speed');
  assert.ok(Math.abs(distance({x:1,y:0})-full)<.01,'keyboard speed is unchanged');
  assert.ok(Math.abs(distance({x:.2,y:0,analog:true},true)-distance({x:1,y:0},true))<.01,'gentle steering still gives a full dash');
});

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
    const spawn=roomPoint(room,140,320),visited=new Set([`${spawn.x},${spawn.y}`]),queue=[[spawn.x,spawn.y]];
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[10,0],[-10,0],[0,10],[0,-10]]){
      const [x,y]=queue[i],nx=x+dx,ny=y+dy,key=`${nx},${ny}`;
      if(!visited.has(key)&&walkable(nx,ny,room)){visited.add(key);queue.push([nx,ny]);}
    }
    for(const [x,y] of [...ROOMS[room].slots,...roomTrinkets(room).map(item=>[item.x,item.y]),[ROOMS[room].goal.x,ROOMS[room].goal.y],[910*roomScale(room),320*roomScale(room)]])assert.ok(queue.some(([px,py])=>Math.hypot(x-px,y-py)<18),`${room}: ${x},${y}`);
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
test('the heart-marked snack heals exactly one heart, once, up to the heart limit',()=>{
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
test('dash contact animates once per enemy, including an already stunned enemy',()=>{
  const run=createRun('bonkpose1');run.pepperFound=true;run.keyFound=true;run.health=4;
  const world=makeWorld(run,'meadow');world.items=[];const enemy={...toyAt(158,315),kind:'vacuum'};world.toys=[enemy];
  enemy.mode='stunned';enemy.timer=1.4;startDash(world,{x:1,y:0});const first=step(world,run,idle,.016);assert.deepEqual(first.filter(e=>e.type==='bonk'),[{type:'bonk',kind:'vacuum'}]);
  assert.equal(enemy.mode,'stunned');assert.ok(enemy.timer<1.4,'the existing stun duration is unchanged');
  assert.equal(world.impacts.length,1,'direct contact still has an impact while stunned');
  assert.equal(world.impacts[0].target,enemy);assert.ok(world.impacts[0].dx>0);
  for(let i=0;i<10;i++)assert.equal(step(world,run,idle,.016).filter(e=>e.type==='bonk').length,0,'no repeating contact sound');
  assert.equal(world.impacts.length,1,'overlapping frames cannot replay the burst');
  assert.equal(enemy.x,158);assert.equal(enemy.y,315,'drawing recoil never moves a hitbox');assert.equal(run.health,4);
  for(let i=0;i<45;i++)step(world,run,idle,.016);
  assert.equal(world.impacts.length,1,'the bonk now lingers beyond the old 0.65-second cutoff');
  for(let i=0;i<20;i++)step(world,run,idle,.016);
  assert.equal(world.impacts.length,0,'short-lived effects are cleaned up');
});
test('companion bonks and surfaced gophers get impacts without animating hidden gophers',()=>{
  const run=createRun('bonkpose2');run.pepperFound=true;run.health=4;
  const world=makeWorld(run,'meadow');world.items=[];world.toys=[{...toyAt(85,325),kind:'cat'}];
  world.gophers=[{x:160,y:315,r:22,kind:'gopher',mode:'up',timer:1,cycle:0,seed:1},{x:200,y:315,r:22,kind:'gopher',mode:'hidden',timer:1,cycle:0,seed:1}];
  startDash(world,{x:1,y:0});step(world,run,idle,.016);
  assert.ok(world.impacts.some(hit=>hit.target===world.toys[0]&&hit.dx<0),'Pepper contact recoils away from Pepper');
  assert.ok(world.impacts.some(hit=>hit.target===world.gophers[0]));
  assert.ok(!world.impacts.some(hit=>hit.target===world.gophers[1]));assert.equal(run.health,4);
});
test('boss recoil is transient, respects armor, and leaves the saved fight valid',()=>{
  const run=createRun('bonkpose3');run.keyFound=run.pepperFound=run.peeFound=run.pepperoniFound=true;run.health=4;
  const world=makeWorld(run,'boss');world.items=[];world.player.x=650;world.player.y=315;
  startDash(world,{x:1,y:0});step(world,run,idle,.016);assert.equal(world.impacts.length,0,'armor has no successful-hit animation');
  world.boss.mode='exposed';world.boss.timer=3;step(world,run,idle,.016);
  assert.equal(world.impacts.length,1);assert.equal(world.impacts[0].boss,true);assert.equal(world.boss.hp,7,'normal dash stays normal after Pepperoni joins');
  const restored=JSON.parse(JSON.stringify(run));assert.ok(validRun(restored,run.id));assert.equal(restored.bossState.x,710);
  assert.equal(makeWorld(restored,'boss').impacts.length,0,'reload does not replay the impact');
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
  assert.equal(run.health,2);assert.equal(maxHearts(run),4);assert.ok(isUnlocked(run,'orchard'));
});
test('the final exit needs Pepper, the picnic basket, and all ten trinkets',()=>{
  const run=createRun('finish12');run.keyFound=true;run.pepperFound=true;
  const world=makeWorld(run,'orchard');world.toys=[];world.items=[];
  Object.assign(world.player,roomPoint(world.room,910,320));assert.equal(step(world,run,idle,.02).some(e=>e.type==='exit'),false);
  Object.assign(world.player,ROOMS.orchard.goal);assert.ok(step(world,run,idle,.02).some(e=>e.type==='basket'));
  Object.assign(world.player,roomPoint(world.room,910,320));assert.equal(step(world,run,idle,.02).some(e=>e.type==='exit'),false);
  run.trinkets=TRINKETS.map(item=>item.id);assert.ok(step(world,run,idle,.02).some(e=>e.type==='exit'));
});
test('retry loses this attempt’s snacks but preserves discoveries and earlier chapters',()=>{
  const run=createRun('retry123');run.keyFound=true;run.pepperFound=true;run.collected=['meadow-0'];makeWorld(run,'orchard');
  run.collected.push('orchard-1');run.health=0;const world=retryRoom(run,'orchard');
  assert.deepEqual(run.collected,['meadow-0']);assert.equal(run.health,4);assert.equal(run.retries,1);assert.equal(world.player.x,135*roomScale(world.room));assert.ok(run.pepperFound&&run.keyFound);
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
  Object.assign(world.player,roomPoint(world.room,910,320));assert.ok(!step(world,run,idle,.016).some(event=>event.type==='exit'));
  for(const item of roomTrinkets('pond')){Object.assign(world.player,{x:item.x,y:item.y});assert.ok(step(world,run,idle,.016).some(event=>event.type==='trinket'));}
  assert.equal(goalDone(run,'pond'),true);
  run.health=0;retryRoom(run,'pond');assert.equal(run.trinkets.length,0,'trinkets from a failed attempt return to the pond');
  assert.equal(goalDone(run,'pond'),false);assert.ok(run.pepperFound,'Pepper stays rescued');
  assert.equal(validRun(JSON.parse(JSON.stringify(run)),run.id),true);
});
test('a fatal hit immediately drops only this room’s new trinkets, even after reload',()=>{
  for(const room of ['pond','burrows','woods','hills','orchard','laundry','kitchen']) {
    let run=createRun('treasureloss');Object.assign(run,{keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,room});
    const earlier=TRINKETS.filter(item=>item.room!==room).map(item=>item.id);run.trinkets=[...earlier];
    let world=makeWorld(run,room);world.toys=[];world.gophers=[];world.items=[];
    for(const item of roomTrinkets(room)){Object.assign(world.player,{x:item.x,y:item.y});step(world,run,idle,.016);}
    assert.equal(run.trinkets.length,14);
    run=upgradeRun(JSON.parse(JSON.stringify(run)));world=makeWorld(run,room);world.gophers=[];world.items=[];
    run.health=1;world.invincible=0;world.toys=[toyAt(world.player.x,world.player.y)];
    assert.ok(step(world,run,idle,.016).some(event=>event.type==='defeat'));
    assert.deepEqual(run.trinkets,earlier,`${room} treasures reset before Retry`);
    run=upgradeRun(JSON.parse(JSON.stringify(run)));assert.ok(validRun(run,run.id));
    assert.deepEqual(run.trinkets,earlier,'reloading defeat does not bring treasures back');
    world=retryRoom(run,room);world.toys=[];world.gophers=[];world.items=[];
    assert.deepEqual(run.trinkets,earlier);assert.ok(run.pepperoniFound);
    for(const item of roomTrinkets(room)){Object.assign(world.player,{x:item.x,y:item.y});assert.ok(step(world,run,idle,.016).some(event=>event.type==='trinket'));}
    assert.equal(run.trinkets.length,14,'both treasures can be collected again');
  }
});
test('exiting a cleared level banks its trinkets for later visits',()=>{
  const run=createRun('bankedloot');run.keyFound=true;run.pepperFound=true;run.room='burrows';
  let world=makeWorld(run,'burrows');world.toys=[];world.gophers=[];world.items=[];
  for(const item of roomTrinkets('burrows')){Object.assign(world.player,{x:item.x,y:item.y});step(world,run,idle,.016);}
  Object.assign(world.player,roomPoint(world.room,910,320));assert.ok(step(world,run,idle,.016).some(event=>event.type==='exit'));
  const banked=[...run.trinkets];makeWorld(run,'woods');world=makeWorld(run,'burrows');world.gophers=[];world.items=[];
  run.health=1;world.invincible=0;world.toys=[toyAt(world.player.x,world.player.y)];
  assert.ok(step(world,run,idle,.016).some(event=>event.type==='defeat'));assert.deepEqual(run.trinkets,banked);
  retryRoom(run,'burrows');assert.deepEqual(run.trinkets,banked);
});
test('leaving an unfinished room does not bank its trinkets',()=>{
  const run=createRun('loosecoins');run.keyFound=true;run.pepperFound=true;
  makeWorld(run,'burrows');run.trinkets.push(roomTrinkets('burrows')[0].id);
  makeWorld(run,'woods');makeWorld(run,'burrows');run.health=0;retryRoom(run,'burrows');
  assert.deepEqual(run.trinkets,[]);
});
test('older saves keep earlier treasures but reset the failed current level',()=>{
  const run=createRun('oldtrinkets');delete run.trinketCheckpoints;
  Object.assign(run,{keyFound:true,pepperFound:true,room:'burrows',health:0,trinkets:['pond-ribbon',...roomTrinkets('burrows').map(item=>item.id)]});
  assert.ok(validRun(run,run.id));upgradeRun(run);assert.deepEqual(run.trinkets,['pond-ribbon']);
  retryRoom(run,'burrows');assert.deepEqual(run.trinkets,['pond-ribbon']);assert.ok(validRun(run,run.id));
  for(const checkpoint of [null,[],{burrows:['pond-ribbon']},{unknown:[]},{burrows:[roomTrinkets('burrows')[0].id,roomTrinkets('burrows')[0].id]}]) {
    assert.equal(validRun({...run,trinketCheckpoints:checkpoint},run.id),false);
  }
});
test('the garden requires both trinkets and advances to the woods',()=>{
  const run=createRun('garden123');run.keyFound=true;run.pepperFound=true;run.health=4;
  const world=makeWorld(run,'burrows');world.toys=[];world.gophers=[];
  assert.equal(goalDone(run,'burrows'),false);
  for(const item of roomTrinkets('burrows')){Object.assign(world.player,item);step(world,run,idle,.016);}
  assert.equal(goalDone(run,'burrows'),true);Object.assign(world.player,roomPoint(world.room,910,320));
  assert.ok(step(world,run,idle,.016).some(event=>event.type==='exit'));assert.equal(ORDER[ORDER.indexOf('burrows')+1],'woods');
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
  const finished={...run,basketFound:true,completed:true};delete finished.trinkets;upgradeRun(finished);assert.equal(finished.trinkets.length,10);assert.ok(goalDone(finished,'orchard'));
  run.trinkets=['nonsense'];assert.equal(validRun(run,run.id),false);
});

function pairedWorld(id='paired123') {
  const run=createRun(id);run.keyFound=true;run.pepperFound=true;run.health=4;run.positions.meadow={x:400,y:315};
  const world=makeWorld(run,'meadow');Object.assign(world.buddy,{x:336,y:315});
  world.toys=[];world.gophers=[];world.items=[];world.invincible=0;
  return {run,world};
}
test('balls, cats, and surfaced gophers can hit Pepper while Pepsi is clear',()=>{
  for(const kind of ['ball','cat','gopher']) {
    const {run,world}=pairedWorld();
    const hazard={...toyAt(336,315),kind};
    if(kind==='gopher'){hazard.mode='up';hazard.timer=1;world.gophers=[hazard];}else world.toys=[hazard];
    const before={...world.player},buddy={...world.buddy};const events=step(world,run,idle,.016);
    assert.deepEqual(events,[{type:'hit',character:'pepper'}],kind);assert.equal(run.health,3);assert.equal(run.hits,1);assert.equal(world.hitCorgi,'pepper');
    assert.equal(world.player.x,before.x);assert.equal(world.buddy.x,buddy.x,'hit does not knock Pepper off his safe trail');
  }
});
test('Pepper has no damage hitbox before he is rescued',()=>{
  const {run,world}=pairedWorld();run.pepperFound=false;run.health=3;world.toys=[toyAt(336,315)];
  assert.deepEqual(step(world,run,idle,.016),[]);assert.equal(run.health,3);assert.equal(run.hits,0);
});
test('both corgis share one damage grace period across simultaneous hazards',()=>{
  const {run,world}=pairedWorld();world.toys=[toyAt(336,315),toyAt(400,315)];
  assert.deepEqual(step(world,run,idle,.016),[{type:'hit',character:'pepper'}]);assert.equal(run.health,3);
  for(let i=0;i<60;i++)step(world,run,idle,.016);assert.equal(run.health,3,'standing on both hazards does not bypass shared grace');
  for(let i=0;i<30;i++)step(world,run,idle,.016);assert.equal(run.health,2);assert.equal(run.hits,2,'remaining in danger costs another heart after grace expires');
});
test('a hazard overlapping both corgis still costs only one heart',()=>{
  const {run,world}=pairedWorld();world.toys=[toyAt(368,315)];
  const events=step(world,run,idle,.016);assert.equal(events.length,1);assert.equal(run.health,3);assert.equal(run.hits,1);
});
test('dash protects Pepper and can bonk the obstacle touching him',()=>{
  for(const kind of ['cat','gopher']) {
    const {run,world}=pairedWorld();const hazard={...toyAt(336,315),kind};
    if(kind==='gopher'){hazard.mode='up';hazard.timer=1;world.gophers=[hazard];}else world.toys=[hazard];
    startDash(world,{x:1,y:0});const events=step(world,run,{x:1,y:0},.016);
    assert.ok(events.some(event=>event.type==='stun'));assert.equal(hazard.mode,'stunned');assert.equal(run.health,4);assert.equal(run.hits,0);
  }
});
test('a final Pepper hit persists defeat and retries with both corgis and trinkets',()=>{
  const {run,world}=pairedWorld();run.health=1;run.trinkets=['pond-ribbon'];world.toys=[toyAt(336,315)];
  assert.deepEqual(step(world,run,idle,.016),[{type:'defeat',character:'pepper'}]);
  const saved=JSON.parse(JSON.stringify(run));assert.equal(saved.health,0);assert.ok(validRun(saved,saved.id));
  assert.deepEqual(step(world,run,{x:1,y:0},.02),[]);
  retryRoom(saved,'meadow');assert.equal(saved.health,4);assert.ok(saved.pepperFound);assert.deepEqual(saved.trinkets,['pond-ribbon']);
});
test('harmless hazard phases do not hurt Pepper and he keeps following after a hit',()=>{
  const {run,world}=pairedWorld();world.toys=[{...toyAt(336,315),kind:'cat',mode:'rest',timer:1}];
  world.gophers=[{x:336,y:315,r:22,mode:'warning',timer:1}];step(world,run,idle,.016);assert.equal(run.health,4);
  world.toys=[toyAt(336,315)];world.gophers=[];step(world,run,idle,.016);assert.equal(run.health,3);world.toys=[];
  for(let i=0;i<80;i++)step(world,run,{x:1,y:0},1/60);
  assert.ok(world.buddy.x>500);assert.ok(world.player.x-world.buddy.x<85);assert.equal(world.buddy.facing,1);
});

test('dash requires the full 2.8-second recharge',()=>{const run=createRun('dashwait');const world=makeWorld(run,'meadow');world.toys=[];assert.ok(startDash(world,{x:1,y:0}));for(let i=0;i<120;i++)step(world,run,idle,1/60);assert.equal(startDash(world),false);for(let i=0;i<49;i++)step(world,run,idle,1/60);assert.equal(startDash(world),true);});
test('new clearings need their own treasures before advancing',()=>{for(const room of ['woods','hills']){const {run}=pairedWorld();run.peeFound=true;const world=makeWorld(run,room);world.toys=[];world.gophers=[];assert.equal(goalDone(run,room),false);for(const item of roomTrinkets(room)){Object.assign(world.player,item);step(world,run,idle,.016);}assert.ok(goalDone(run,room));Object.assign(world.player,roomPoint(world.room,910,320));assert.ok(step(world,run,idle,.016).some(event=>event.type==='exit'));}});

test('safe practice teaches movement, crate dash, and recharge without granting a key',()=>{
 const run=createRun('practice12');const world=makeWorld(run,'tutorial');assert.deepEqual(world.toys,[]);assert.deepEqual(world.gophers,[]);assert.deepEqual(world.items,[]);
 Object.assign(world.player,{x:330,y:315});step(world,run,idle,.02);assert.equal(run.tutorialStep,1);
 Object.assign(world.player,{x:490,y:315});step(world,run,idle,.02);assert.equal(run.tutorialStep,1);
 startDash(world,{x:1,y:0});step(world,run,{x:1,y:0},.02);assert.equal(run.tutorialStep,2);assert.equal(run.keyFound,false);assert.equal(goalDone(run,'tutorial'),false);
 for(let i=0;i<150;i++)step(world,run,idle,.02);assert.equal(run.tutorialStep,3);assert.equal(run.health,3);assert.ok(goalDone(run,'tutorial'));
 run.room='tutorial';assert.ok(validRun(JSON.parse(JSON.stringify(run)),run.id));Object.assign(world.player,roomPoint(world.room,910,320));assert.ok(step(world,run,idle,.02).some(e=>e.type==='exit'));
});


test('Pee needs all six earlier treasures and a visit; rescue keeps the chapter running',()=>{
  const {run}=pairedWorld('peeres123');run.room='hills';run.health=2;run.positions.hills={...PEE_RESCUE};
  const world=makeWorld(run,'hills');world.toys=[];world.gophers=[];world.items=[];
  run.trinkets=TRINKETS.filter(i=>['pond','burrows','woods'].includes(i.room)).map(i=>i.id);
  const last=run.trinkets.pop();assert.equal(peeProgress(run),5);assert.equal(canRescuePee(run),false);
  step(world,run,idle,.016);assert.equal(run.peeFound,false);
  run.trinkets.push(last);assert.equal(canRescuePee(run),true);
  assert.deepEqual(step(world,run,idle,.016),[{type:'pee-rescue'}]);assert.equal(run.health,2);assert.equal(maxHearts(run),4);
  assert.equal(world.room,'hills');assert.equal(goalDone(run,'hills'),false);
  assert.deepEqual(step(world,run,idle,.016),[],'no repeat rescue or healing');
  const restored=JSON.parse(JSON.stringify(run));assert.ok(validRun(restored,run.id));retryRoom(restored,'hills');assert.equal(restored.peeFound,true);
});
test('Pee joins the train smoothly; mud and wind do not teleport followers',()=>{
  for(const room of ['meadow','burrows','woods','hills']){
    const {run}=pairedWorld();run.peeFound=true;run.positions[room]={x:135,y:315};
    const world=makeWorld(run,room);world.toys=[];world.gophers=[];world.items=[];
    for(let i=0;i<240;i++){
      const before={...world.pee};step(world,run,{x:1,y:0},1/60);
      assert.ok(Math.hypot(world.pee.x-before.x,world.pee.y-before.y)<=400/60+.001);
      assert.ok(walkable(world.pee.x,world.pee.y,room,12));
    }
    assert.ok(world.pee.x>110,room+' Pee follows toward the leader even when a rock stops the group');
  }
});
test('Pee-only hits cost shared hearts, can cause defeat, and are protected by dash',()=>{
  for(const kind of ['ball','cat','gopher'])for(const dash of [false,true]){
    const {run,world}=pairedWorld();run.peeFound=true;run.health=1;world.pee={x:260,y:315,facing:1};world.peeTrail=[{x:world.buddy.x,y:world.buddy.y}];
    const hazard={...toyAt(260,315),kind};
    if(kind==='gopher'){hazard.mode='up';hazard.timer=1;world.gophers=[hazard];}else world.toys=[hazard];
    if(dash)startDash(world,{x:1,y:0});
    const events=step(world,run,idle,.016);
    if(dash){assert.equal(run.health,1);assert.ok(events.some(e=>e.type==='stun'));}
    else{assert.deepEqual(events,[{type:'defeat',character:'pee'}]);assert.equal(run.health,0);assert.ok(validRun(JSON.parse(JSON.stringify(run)),run.id));const retry=retryRoom(run,'meadow');assert.equal(run.peeFound,true);assert.ok(retry.pee);}
  }
  const {run,world}=pairedWorld();world.pee={x:260,y:315,facing:1};world.toys=[toyAt(world.pee.x,world.pee.y)];assert.deepEqual(step(world,run,idle,.016),[],'locked Pee has no hitbox');
});
test('mud slows rolling but dash crosses at full speed; ice slides and grass brakes',()=>{
  const simulate=(room,x,y,input,frames,dash=false)=>{
    const run=createRun('terraintest');run.positions[room]={x,y};const world=makeWorld(run,room);world.toys=[];world.gophers=[];world.items=[];
    if(dash)startDash(world,input);for(let i=0;i<frames;i++)step(world,run,input,1/60);return {run,world};
  };
  assert.equal(terrainAt('burrows',240,400),'mud');
  const mud=simulate('burrows',240,400,{x:1,y:0},30),grass=simulate('meadow',240,315,{x:1,y:0},30);
  assert.ok(mud.world.player.x-240<(grass.world.player.x-240)*.65);
  const dashed=simulate('burrows',240,400,{x:1,y:0},10,true);assert.ok(dashed.world.player.x-240>85);
  assert.equal(terrainAt('woods',752,328),'ice');
  const ice=simulate('woods',752,328,{x:1,y:0},20),before=ice.world.player.x;
  for(let i=0;i<10;i++)step(ice.world,ice.run,idle,1/60);assert.ok(ice.world.player.x>before+10,'slides after release');
  Object.assign(ice.world.player,{x:220,y:315});step(ice.world,ice.run,idle,1/60);assert.equal(ice.world.player.x,220,'grass stops the slide');
});
test('wind warns first, alternates direction, leaves calm windows, and yields to dash',()=>{
  assert.equal(windAt('hills',1).x,0);assert.equal(windAt('hills',2).warning,true);assert.ok(windAt('hills',5).x>60);
  assert.equal(windAt('hills',8).x,0);assert.ok(windAt('hills',14).x< -60);assert.equal(windAt('tutorial',5).x,0);
  const run=createRun('windtest');run.positions.hills={x:420,y:315};const world=makeWorld(run,'hills');world.toys=[];world.gophers=[];world.items=[];world.time=5;
  step(world,run,idle,.02);assert.ok(world.player.x>421,'gust moves the leader without a key');
  const x=world.player.x;startDash(world,{x:0,y:1});step(world,run,idle,.02);assert.equal(world.player.x,x,'dash ignores wind');
});
test('older saves preserve progress without accidentally unlocking Pee',()=>{
  const {run}=pairedWorld();delete run.peeFound;run.health=2;run.room='orchard';assert.ok(validRun(run,run.id));upgradeRun(run);
  assert.equal(run.peeFound,false);assert.equal(run.health,2);assert.equal(run.room,'orchard');
  run.peeFound='yes';assert.equal(validRun(run,run.id),false);
});

test('Pee starts visibly beside Pepper when the entrance has no room behind him',()=>{
  const run=createRun('entrance123');run.keyFound=true;run.pepperFound=true;run.peeFound=true;
  for(const room of ORDER){const world=makeWorld(run,room);assert.ok(Math.hypot(world.pee.x-world.buddy.x,world.pee.y-world.buddy.y)>40);assert.ok(walkable(world.pee.x,world.pee.y,room,12));}
});

test('each clearing supplies only one heal; regular snacks stay collectible and consumed heals stay gone',()=>{
  for(const room of ORDER){
    const run=createRun('lessheals');run.keyFound=true;run.pepperFound=true;run.health=1;
    let world=makeWorld(run,room);world.toys=[];world.gophers=[];
    assert.equal(world.items.filter(i=>i.healing).length,1);
    for(const item of world.items){Object.assign(world.player,{x:item.x,y:item.y});const event=step(world,run,idle,.016).find(e=>e.type==='snack');assert.equal(event.healed,item.healing);}
    assert.equal(run.health,2,room+' gives exactly one heart from all three snacks');assert.equal(run.collected.length,3);
    const restored=JSON.parse(JSON.stringify(run));world=makeWorld(restored,room);world.toys=[];world.gophers=[];
    const heal=world.items.find(i=>i.healing);Object.assign(world.player,{x:heal.x,y:heal.y});assert.equal(step(world,restored,idle,.016).some(e=>e.type==='snack'),false);assert.equal(restored.health,2);
    makeWorld(restored,'meadow');assert.equal(restored.health,2,'chapter navigation does not heal');
  }
});
test('a heart snack at full health never overfills or heals a second time later',()=>{
  const run=createRun('fullheal'),world=makeWorld(run,'meadow');world.toys=[];world.gophers=[];
  const item=world.items.find(i=>i.healing);Object.assign(world.player,{x:item.x,y:item.y});
  assert.equal(step(world,run,idle,.016).find(e=>e.type==='snack').healed,false);assert.equal(run.health,3);
  run.health=1;step(world,run,idle,.016);assert.equal(run.health,1);
});

test('nine chapters gate the cottage, Pepperoni, kitchen, and boss in order',()=>{
 const run=createRun('expand123');assert.equal(ORDER.length,9);assert.equal(TRINKETS.length,14);run.keyFound=true;run.pepperFound=true;
 assert.equal(isUnlocked(run,'laundry'),false);run.basketFound=true;run.trinkets=TRINKETS.slice(0,10).map(i=>i.id);assert.ok(isUnlocked(run,'laundry'));assert.equal(isUnlocked(run,'kitchen'),false);
 run.room='laundry';run.positions.laundry=roomPoint('laundry',820,160);const world=makeWorld(run,'laundry');world.toys=[];world.items=[];
 run.trinkets.push(...roomTrinkets('laundry').map(i=>i.id));step(world,run,idle,.016);assert.equal(run.pepperoniFound,false,'Pee must join first');
 run.peeFound=true;const health=run.health;assert.ok(step(world,run,idle,.016).some(e=>e.type==='pepperoni-rescue'));assert.equal(run.health,health,'rescue does not heal');assert.equal(world.room,'laundry');assert.ok(isUnlocked(run,'kitchen'));assert.equal(isUnlocked(run,'boss'),false);
 run.trinkets.push(...roomTrinkets('kitchen').map(i=>i.id));assert.ok(isUnlocked(run,'boss'));assert.ok(validRun(JSON.parse(JSON.stringify(run)),run.id));retryRoom(run,'laundry');assert.ok(run.pepperoniFound);
});
test('each friend ability must be chosen independently; normal dash never auto-casts them',()=>{
 const {run,world}=pairedWorld();run.peeFound=run.pepperoniFound=true;world.toys=[toyAt(world.buddy.x,world.buddy.y-80)];
 startDash(world);step(world,run,idle,.016);assert.equal(world.toys[0].mode,'roam');assert.equal(world.shield,0);assert.equal(world.clouds.length,0);assert.ok(world.dash<.2);assert.equal(world.powerDash,false);
 assert.ok(startAbility(world,run,'bark'));assert.equal(world.toys[0].mode,'roam');assert.equal(world.shield,3);assert.equal(world.clouds.length,0);assert.equal(world.abilityCooldowns.bark,10);assert.equal(startAbility(world,run,'bark'),false);
 assert.ok(startAbility(world,run,'stink'));assert.equal(world.zoomies,2);assert.equal(world.clouds.length,0);assert.equal(world.abilityCooldowns.stink,14);assert.equal(startAbility(world,run,'stink'),false);
 assert.equal(startAbility(world,run,'power'),false,'power cannot bypass the normal dash recovery');
 assert.equal(world.shield,3,'Zoomies is independent of shield');
 world.toys=[];for(let i=0;i<170;i++)step(world,run,idle,1/60);
 assert.ok(startAbility(world,run,'power'));assert.equal(world.powerDash,true);assert.equal(world.dash,.28);assert.equal(world.abilityCooldowns.power,8);assert.equal(startDash(world),false);
 for(let i=0;i<170;i++)step(world,run,idle,1/60);assert.equal(startAbility(world,run,'power'),false,'power retains its own longer cooldown');assert.ok(startDash(world),'normal dash can recharge before power');
});
test('ability cooldowns persist through room changes and reload, while retries reset them',()=>{
 const {run,world}=pairedWorld();run.peeFound=run.pepperoniFound=true;world.toys=[];
 for(const id of ['bark','stink','power'])assert.ok(startAbility(world,run,id));
 const snapshot=JSON.parse(JSON.stringify(run));assert.ok(validRun(snapshot,run.id));
 const restored=makeWorld(snapshot,'pond');assert.deepEqual(restored.abilityCooldowns,{dash:2.8,bark:10,stink:14,power:8});assert.equal(restored.cooldown,2.8);
 for(const id of ['bark','stink','power'])assert.equal(startAbility(restored,snapshot,id),false);
 assert.equal(startDash(restored),false);restored.toys=[];restored.gophers=[];restored.items=[];step(restored,snapshot,idle,.02);assert.equal(snapshot.cooldowns.bark,9.98);
 const retry=retryRoom(snapshot,'pond');assert.deepEqual(retry.abilityCooldowns,{dash:0,bark:0,stink:0,power:0});
 snapshot.cooldowns.bark=-1;assert.equal(validRun(snapshot,run.id),false);
 delete snapshot.cooldowns;assert.ok(validRun(snapshot,run.id));upgradeRun(snapshot);assert.equal(snapshot.cooldowns.bark,0,'old saves gain ready abilities');
});
test('locked abilities cannot cast, and shield leaves hidden gophers underground',()=>{
 const run=createRun('locked123'),world=makeWorld(run,'meadow');
 for(const id of ['bark','stink','power','missing'])assert.equal(startAbility(world,run,id),false);
 assert.deepEqual(world.abilityCooldowns,{dash:0,bark:0,stink:0,power:0});
 run.keyFound=run.pepperFound=true;world.gophers=[{x:world.buddy.x,y:world.buddy.y,r:22,kind:'gopher',mode:'hidden',timer:1}];
 assert.ok(startAbility(world,run,'bark'));assert.equal(world.gophers[0].mode,'hidden');
});
test('Pepperoni has a consequential hitbox and follows without jumping',()=>{
 const {run,world}=pairedWorld();run.peeFound=true;run.pepperoniFound=true;run.health=1;world.pee={x:270,y:315,facing:1};world.pepperoni={x:200,y:315,facing:1};world.peeTrail=[{x:336,y:315}];world.pepperoniTrail=[{x:270,y:315}];world.toys=[toyAt(200,315)];
 assert.deepEqual(step(world,run,idle,.016),[{type:'defeat',character:'pepperoni'}]);const again=retryRoom(run,'meadow');again.toys=[];again.items=[];
 for(let i=0;i<150;i++){const p={...again.pepperoni};step(again,run,{x:1,y:0},1/60);assert.ok(Math.hypot(again.pepperoni.x-p.x,again.pepperoni.y-p.y)<=400/60+.001);assert.ok(walkable(again.pepperoni.x,again.pepperoni.y,'meadow',12));}
 assert.ok(again.pepperoni.x>200);
});
function bossPair(){const run=createRun('bossunit');Object.assign(run,{keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,basketFound:true,health:4,room:'boss',trinkets:TRINKETS.map(i=>i.id)});const world=makeWorld(run,'boss');world.items=[];return {run,world};}
test('boss telegraphs, charges, overheats, takes one hit per opening, and persists',()=>{
 const {run,world}=bossPair();const boss=world.boss;world.invincible=100;world.player.y=480;
 assert.equal(boss.mode,'windup');step(world,run,idle,.02);assert.equal(boss.x,710);
 for(let i=0;i<160;i++)step(world,run,idle,.02);assert.equal(boss.mode,'exposed');
 for(let hit=0;hit<4;hit++){
   // Wait through each real recovery/suction/charge cycle before positioning for a strike.
   if(hit)for(let i=0;i<500&&boss.mode!=='exposed';i++){world.player.x=450;world.player.y=480;step(world,run,idle,.02);}
   assert.equal(boss.mode,'exposed');world.cooldown=0;world.abilityCooldowns.power=0;Object.assign(world.player,{x:boss.x,y:boss.y});startAbility(world,run,'power',{x:0,y:0});step(world,run,idle,.016);
   assert.equal(boss.hp,8-(hit+1)*2);const hp=boss.hp;step(world,run,idle,.016);assert.equal(boss.hp,hp,'one dash never deals repeated hits');
   const saved=JSON.parse(JSON.stringify(run));assert.ok(validRun(saved,saved.id));assert.equal(makeWorld(saved,'boss').boss.hp,hp);
 }
 assert.ok(run.bossDefeated);assert.ok(goalDone(run,'boss'));Object.assign(world.player,roomPoint(world.room,910,320));world.dash=0;assert.ok(step(world,run,idle,.02).some(e=>e.type==='exit'));
});
test('successful boss hits give every corgi time to reposition, then restore danger',()=>{
 for(const ability of ['dash','power'])for(const body of ['player','buddy','pee','pepperoni']) {
   const {run,world}=bossPair(),boss=world.boss;
   Object.assign(boss,{mode:'exposed',timer:3,hp:6});
   Object.assign(world.player,{x:boss.x-30,y:boss.y});
   assert.ok(ability==='dash'?startDash(world):startAbility(world,run,'power'));
   assert.ok(step(world,run,idle,.016).some(e=>e.type==='boss-hit'));
   const hp=boss.hp;
   // Remain in contact beyond dash immunity and the former 1.2-second stun.
   for(let i=0;i<145;i++) {
     Object.assign(world[body],{x:boss.x,y:boss.y});world.invincible=0;
     step(world,run,idle,.02);
     assert.equal(run.health,4,body+' is safe throughout recovery');
     assert.equal(boss.hp,hp,'recovery cannot be farmed for extra hits');
   }
   assert.equal(boss.mode,'recover');
   const saved=JSON.parse(JSON.stringify(run));assert.ok(validRun(saved,saved.id));
   assert.equal(makeWorld(saved,'boss').boss.timer,boss.timer,'reload retains the remaining stun');
   boss.timer=.01;world.invincible=0;Object.assign(world[body],{x:boss.x,y:boss.y});
   step(world,run,idle,.02);assert.equal(run.health,3,'contact becomes dangerous after recovery');
 }
});
test('armored boss ignores dash damage, suction pulls, and defeat retry resets fight',()=>{
 const {run,world}=bossPair();Object.assign(world.player,{x:world.boss.x-10,y:world.boss.y});startDash(world);step(world,run,idle,.016);assert.equal(world.boss.hp,8);
 world.dash=0;world.boss.mode='suction';world.boss.timer=1;Object.assign(world.player,{x:400,y:315});step(world,run,idle,.02);assert.ok(world.player.x>400);
 world.boss.hp=2;run.health=0;const retry=retryRoom(run,'boss');assert.equal(retry.boss.hp,8);assert.ok(run.pepperoniFound);assert.equal(run.health,4);
 run.bossState.hp=99;assert.equal(validRun(run,run.id),false);
});
test('old endings remain earned without granting the new friend or new treasures',()=>{
 const run=createRun('oldending');run.completed=true;run.keyFound=true;run.pepperFound=true;run.basketFound=true;delete run.trinkets;delete run.pepperoniFound;delete run.bossDefeated;
 upgradeRun(run);assert.ok(run.completed&&run.legacyEnding);assert.equal(run.trinkets.length,10);assert.equal(run.pepperoniFound,false);assert.equal(run.bossDefeated,false);assert.ok(isUnlocked(run,'laundry'));
});
test('roaming machine hazards are vacuums, never arbitrary balls',()=>{
 for(const room of ORDER)for(const toy of toysFor(42,room))assert.ok(['cat','vacuum','goose'].includes(toy.kind));
});

test('wide worlds migrate old positions once and preserve discoveries',()=>{
 const run=createRun('widesave');delete run.wideWorlds;run.positions={woods:{x:225,y:480},meadow:{x:135,y:315}};run.trinkets=['woods-bell'];
 upgradeRun(run);assert.deepEqual(run.positions.woods,{x:360,y:768});assert.deepEqual(run.positions.meadow,{x:135,y:315});
 const once=JSON.stringify(run);upgradeRun(run);assert.equal(JSON.stringify(run),once);assert.ok(validRun(run,run.id));
 assert.deepEqual(run.trinkets,['woods-bell']);
 for(const room of ['woods','hills','orchard']){
  assert.ok(walkable(1400,700,room),'expanded area is playable');
  const world=makeWorld(createRun('wideroom'),room);assert.ok(walkable(world.player.x,world.player.y,room));
  assert.equal(retryRoom(run,room).player.x,216);
 }
});

test('geese arrive in the orchard and continue into the cottage',()=>{
 for(const room of ORDER)assert.equal(toysFor(1,room).filter(t=>t.kind==='goose').length,['orchard','laundry','kitchen'].includes(room)?1:0);
});
function gooseWorld(){
 const run=createRun('goosetest');Object.assign(run,{keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,health:4});
 const world=makeWorld(run,'meadow');world.items=[];world.gophers=[];world.invincible=0;
 world.toys=[{...toyAt(500,315),kind:'goose',mode:'roam',timer:0,cooldown:0}];Object.assign(world.player,{x:620,y:315});
 return {run,world,goose:world.toys[0]};
}
test('goose warns before a single expanding honk, then rests',()=>{
 const {run,world,goose}=gooseWorld();world.invincible=100;
 assert.ok(step(world,run,idle,.02).some(e=>e.type==='goose-warning'));assert.equal(goose.mode,'windup');
 for(let i=0;i<50;i++)assert.ok(!step(world,run,idle,.02).some(e=>e.type==='honk'));
 let honks=0;for(let i=0;i<80;i++)honks+=step(world,run,idle,.02).filter(e=>e.type==='honk').length;
 assert.equal(honks,1);assert.equal(goose.mode,'rest');
});
test('honk ring damages each corgi, while the quiet center and dashing are safe',()=>{
 for(const body of ['player','buddy','pee','pepperoni']){
  const {run,world,goose}=gooseWorld();Object.assign(goose,{mode:'honk',timer:.6});
  for(const key of ['player','buddy','pee','pepperoni'])Object.assign(world[key],{x:750,y:315});
  Object.assign(world[body],{x:600,y:315});
  const events=step(world,run,idle,.02);assert.equal(run.health,3);assert.ok(events.some(e=>e.character===({player:'pepsi',buddy:'pepper'}[body]||body)));
 }
 for(const dash of [false,true]){
  const {run,world,goose}=gooseWorld();Object.assign(goose,{mode:'honk',timer:.25});
  for(const key of ['player','buddy','pee','pepperoni'])Object.assign(world[key],{x:dash?650:550,y:315});
  if(dash)startDash(world,{x:1,y:0});step(world,run,idle,.02);assert.equal(run.health,4);
 }
});
test('bonks interrupt a goose wind-up',()=>{
 for(const ability of ['dash']){
  const {run,world,goose}=gooseWorld();Object.assign(goose,{mode:'windup',timer:.1});
  Object.assign(world.player,{x:460,y:315});Object.assign(world.buddy,{x:485,y:315});Object.assign(world.pee,{x:490,y:315});
  ability==='dash'?startDash(world,{x:1,y:0}):startAbility(world,run,ability);
  const events=step(world,run,idle,.02);assert.equal(goose.mode,'stunned');assert.ok(!events.some(e=>e.type==='honk'));
 }
});

test('secret NeeDoh needs a dash, squishes once per dash, and keeps its picnic unlock',()=>{
 const run=createRun('squishunit');run.keyFound=run.pepperFound=true;run.health=4;run.positions.orchard={x:NEEDOH.x-45,y:NEEDOH.y};
 const world=makeWorld(run,'orchard');world.toys=[];world.gophers=[];world.items=[];
 assert.ok(walkable(NEEDOH.x,NEEDOH.y,'orchard'));step(world,run,idle,.02);assert.equal(run.needohFound,false);
 startDash(world,{x:1,y:0});const events=step(world,run,idle,.02);assert.deepEqual(events.filter(e=>e.type==='squish'),[{type:'squish',discovered:true}]);assert.ok(world.needoh.squish>1);assert.equal(run.health,4);
 assert.ok(!step(world,run,idle,.02).some(e=>e.type==='squish'));
 const restored=JSON.parse(JSON.stringify(run));assert.ok(validRun(restored,run.id));upgradeRun(restored);assert.equal(restored.needohFound,true);retryRoom(restored,'orchard');assert.equal(restored.needohFound,true);
 world.dash=0;world.cooldown=0;Object.assign(world.player,{x:NEEDOH.x-45,y:NEEDOH.y});startDash(world,{x:1,y:0});assert.ok(step(world,run,idle,.02).some(e=>e.type==='squish'&&!e.discovered));
 const old=createRun('oldcube1');delete old.needohFound;upgradeRun(old);assert.equal(old.needohFound,false);
});


test('Shield protects every companion, expires without healing, and cannot be spammed',()=>{
 for(const body of ['player','buddy','pee','pepperoni']){
  const {run,world}=pairedWorld();run.peeFound=run.pepperoniFound=true;
  world.items=[];world.gophers=[];world.toys=[];world.invincible=0;
  assert.ok(startAbility(world,run,'bark'));assert.equal(world.shield,3);
  const health=run.health;
  // All four consequential hitboxes must share the protection, including the tail.
  world.toys=[toyAt(world[body].x,world[body].y)];
  assert.ok(!step(world,run,idle,.02).some(e=>e.type==='hit'));assert.equal(run.health,health);
  assert.equal(startAbility(world,run,'bark'),false);
  world.toys=[];for(let i=0;i<90;i++)step(world,run,idle,.035);
  assert.equal(world.shield,0);assert.equal(run.health,health,'shield never heals');
  world.toys=[toyAt(world[body].x,world[body].y)];
  assert.ok(step(world,run,idle,.02).some(e=>e.type==='hit'));assert.equal(run.health,health-1);
  assert.equal(startAbility(world,run,'bark'),false,'expiry still leaves seven seconds of recharge');
 }
});
test('Shield also blocks the goose ring and boss contact without stunning enemies',()=>{
 const {run,world,goose}=gooseWorld();Object.assign(goose,{mode:'honk',timer:.5});
 for(const key of ['player','buddy','pee','pepperoni'])Object.assign(world[key],{x:615,y:315});
 world.invincible=0;startAbility(world,run,'bark');const health=run.health;step(world,run,idle,.02);assert.equal(run.health,health);assert.equal(goose.mode,'honk');
 const bossRun=createRun('shieldboss');bossRun.pepperFound=true;bossRun.health=4;bossRun.positions.boss={x:710,y:315};const bossWorld=makeWorld(bossRun,'boss');bossWorld.toys=[];bossWorld.gophers=[];bossWorld.items=[];bossWorld.invincible=0;
 Object.assign(bossWorld.boss,{x:710,y:315,mode:'windup',timer:1});startAbility(bossWorld,bossRun,'bark');step(bossWorld,bossRun,idle,.02);assert.equal(bossRun.health,4);
});


test('ability introductions survive saves, accept old adventures, and reject locked or unknown guides',()=>{
 const run=createRun('guideunit');delete run.pendingAbility;assert.ok(validRun(run,run.id));upgradeRun(run);assert.equal(run.pendingAbility,null);
 run.pendingAbility='bark';assert.equal(validRun(run,run.id),false);
 run.keyFound=run.pepperFound=true;assert.ok(validRun(run,run.id));
 const copy=JSON.parse(JSON.stringify(run));upgradeRun(copy);assert.equal(copy.pendingAbility,'bark');
 for(const invalid of ['missing','__proto__',['bark'],{}]){copy.pendingAbility=invalid;assert.equal(validRun(copy,copy.id),false);}
});
