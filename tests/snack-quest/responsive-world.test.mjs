import test from 'node:test';
import assert from 'node:assert/strict';
import {setMapStretch,mapStretch,mapX,roomWidth,roomScale,ROOMS,TRINKETS,PEE_RESCUE,roomPoint,createRun,makeWorld,adaptWorldLayout,validRun,step,startDash,walkable} from '../../games/snack-quest/engine.mjs';
const idle={x:0,y:0},close=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} ~= ${b}`);
test('responsive maps spread physical landmarks and boundaries while preserving collision radii',()=>{
 const original={x:ROOMS.pond.obstacles[0].x,r:ROOMS.pond.obstacles[0].r,rx:ROOMS.woods.terrain[0].rx};
 try{for(const factor of [1.65,2.8,1]){
  setMapStretch(factor);close(ROOMS.pond.obstacles[0].x,original.x*factor);assert.equal(ROOMS.pond.obstacles[0].r,original.r);assert.equal(ROOMS.woods.terrain[0].rx,original.rx);
  close(roomWidth('woods'),1600*factor);assert.equal(walkable(mapX(940),315,'meadow',18),factor>=3.6);assert.ok(walkable(mapX(900),315,'meadow'));
  assert.equal(walkable(ROOMS.pond.obstacles[0].x,ROOMS.pond.obstacles[0].y,'pond'),false);
  for(const item of TRINKETS)assert.ok(walkable(item.x,item.y,item.room),'treasure remains reachable: '+item.id);
 }}finally{setMapStretch(1);}
});
test('phone/desktop resizing preserves progress, cooldowns, boss state, and normalized saved positions',()=>{
 const run=createRun('layoutsave');run.keyFound=run.pepperFound=run.peeFound=run.pepperoniFound=true;run.basketFound=true;run.health=2;run.trinkets=TRINKETS.map(t=>t.id);run.positions.boss={x:400,y:315};run.cooldowns.bark=7;
 const world=makeWorld(run,'boss');world.boss.hp=3;world.boss.mode='recover';world.boss.timer=2;
 try{for(const factor of [1.65,2.3,1]){
  setMapStretch(factor);adaptWorldLayout(world,run);close(world.player.x,400*factor);close(world.boss.x,710*factor);close(run.positions.boss.x,400*factor);
  assert.equal(run.health,2);assert.equal(run.bossState.hp,3);assert.equal(run.bossState.mode,'recover');assert.equal(run.cooldowns.bark,7);assert.equal(run.trinkets.length,14);
  assert.ok(validRun(JSON.parse(JSON.stringify(run)),run.id));
  const restored=makeWorld(JSON.parse(JSON.stringify(run)),'boss');close(restored.player.x,world.player.x);close(restored.boss.x,world.boss.x);
 }}finally{setMapStretch(1);}
});
test('wider levels still support key bonks, rescues, treasure collection, and their right-hand exit',()=>{
 try{setMapStretch(1.8);
  const key=createRun('layoutkey');key.mapStretch=mapStretch();key.positions.meadow={x:ROOMS.meadow.goal.x-60,y:ROOMS.meadow.goal.y};let world=makeWorld(key,'meadow');world.toys=[];world.gophers=[];startDash(world,{x:1,y:0});step(world,key,idle,.035);assert.equal(key.keyFound,true);
  for(const [room,character,position]of [['pond','pepperFound',ROOMS.pond.goal],['hills','peeFound',PEE_RESCUE],['laundry','pepperoniFound',ROOMS.laundry.goal]]){
   const run=createRun('layout'+room);Object.assign(run,{mapStretch:mapStretch(),keyFound:true,pepperFound:room!=='pond',peeFound:room==='laundry',basketFound:room==='laundry',trinkets:TRINKETS.map(t=>t.id),positions:{[room]:{x:position.x-25,y:position.y}}});
   world=makeWorld(run,room);world.toys=[];world.gophers=[];step(world,run,idle,.016);assert.equal(run[character],true);assert.ok(run.pendingAbility);
  }
  const run=createRun('layoutexit');run.mapStretch=mapStretch();run.keyFound=run.pepperFound=true;world=makeWorld(run,'pond');world.toys=[];world.gophers=[];
  for(const item of TRINKETS.filter(t=>t.room==='pond')){Object.assign(world.player,{x:item.x,y:item.y});step(world,run,idle,.016);assert.ok(run.trinkets.includes(item.id));}
  Object.assign(world.player,roomPoint('pond',910,320));assert.ok(step(world,run,idle,.016).some(e=>e.type==='exit'));
 }finally{setMapStretch(1);}
});
