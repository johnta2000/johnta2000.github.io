export const WIDTH = 1000;
export const HEIGHT = 620;
export const ORDER = ['meadow', 'pond', 'orchard'];
export const ROOMS = {
  meadow: {
    name: 'Sunbeam Meadow', short: 'The key', ground: '#dce8bd', snack: 'biscuit',
    note: 'Pepper went ahead. The old gate key is in that wooden crate.',
    obstacles: [{x:365,y:225,r:37,kind:'bush'}, {x:650,y:400,r:32,kind:'rock'}, {x:785,y:180,r:32,kind:'bush'}],
    slots: [[230,190],[480,145],[670,230],[840,405],[490,470],[225,430],[760,495],[475,325]],
    goal: {x:535,y:190,r:27,kind:'crate'},
  },
  pond: {
    name: 'Pebble Pond', short: 'Find Pepper', ground: '#d5e5c1', snack: 'berry',
    note: 'There he is! Take the key to Pepper’s gate on the far side of the pond.',
    obstacles: [{x:490,y:310,r:107,ry:75,kind:'pond'}, {x:765,y:180,r:32,kind:'rock'}, {x:245,y:460,r:32,kind:'bush'}],
    slots: [[230,190],[480,145],[680,240],[820,470],[510,480],[220,330],[710,470],[350,430]],
    goal: {x:820,y:370,r:35,kind:'pen'},
  },
  orchard: {
    name: 'Clover Orchard', short: 'Home together', ground: '#e0e6b9', snack: 'cheese',
    note: 'One last dash! Grab the picnic basket by the trees and find the way home.',
    obstacles: [{x:345,y:245,r:36,kind:'tree'}, {x:640,y:235,r:38,kind:'tree'}, {x:640,y:435,r:33,kind:'tree'}],
    slots: [[215,180],[490,150],[775,245],[840,435],[460,470],[230,400],[775,500],[490,325]],
    goal: {x:825,y:160,r:23,kind:'basket'},
  },
};

export function random(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6D2B79F5;
    let t = Math.imul(n ^ n >>> 15, 1 | n);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function roomOrder() { return [...ORDER]; }
export function roomItems(seed, room) {
  const slots = [...ROOMS[room].slots], rng = random(seed + ORDER.indexOf(room) * 817);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots.slice(0, 3).map(([x, y], i) => ({id:`${room}-${i}`, x, y, kind:ROOMS[room].snack}));
}
export function maxHearts(run) { return run.pepperFound ? 4 : 3; }
export function createRun(id) {
  return {
    version:2, id, seed:Number.parseInt(id, 36) >>> 0, character:'pepsi', order:roomOrder(),
    room:'meadow', collected:[], positions:{}, checkpoints:{}, health:3,
    keyFound:false, pepperFound:false, basketFound:false, completed:false,
    hits:0, retries:0, revision:0, startedAt:Date.now(),
  };
}
export function validRun(value, id) {
  return !!(value && value.version === 2 && value.id === id && /^[a-z0-9]{6,16}$/.test(id) &&
    Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 0xffffffff &&
    Array.isArray(value.collected) && value.collected.every(item => /^(meadow|pond|orchard)-[0-3]$/.test(item)) &&
    new Set(value.collected).size === value.collected.length &&
    value.positions && typeof value.positions === 'object' && !Array.isArray(value.positions) &&
    value.checkpoints && typeof value.checkpoints === 'object' && !Array.isArray(value.checkpoints) &&
    Object.hasOwn(ROOMS, value.room) && ['keyFound','pepperFound','basketFound','completed'].every(key => typeof value[key] === 'boolean') &&
    Number.isInteger(value.health) && value.health >= 0 && value.health <= maxHearts(value) &&
    Number.isInteger(value.revision) && value.revision >= 0 &&
    Number.isInteger(value.hits) && value.hits >= 0 && Number.isInteger(value.retries) && value.retries >= 0 &&
    (!value.pepperFound || value.keyFound) && (!value.basketFound || value.pepperFound));
}
export function migrateRun(old, id) {
  if (!old || old.version !== 1 || old.id !== id || !Array.isArray(old.collected) ||
      old.collected.some(item => !/^(meadow|pond|orchard)-[0-3]$/.test(item))) return null;
  const run = createRun(id);
  run.seed = Number.isInteger(old.seed) ? old.seed >>> 0 : run.seed;
  run.collected = [...new Set(old.collected)];
  run.keyFound = roomCount(run, 'meadow') >= 4 || !!old.completed;
  run.pepperFound = run.keyFound && (roomCount(run, 'pond') >= 4 || !!old.completed);
  run.basketFound = run.pepperFound && !!old.completed;
  run.completed = run.basketFound;
  run.health = maxHearts(run);
  run.room = firstUnfinished(run);
  run.migrated = true;
  return run;
}
export function roomCount(run, room) { return run.collected.filter(id => id.startsWith(room + '-')).length; }
export function goalDone(run, room) {
  return room === 'meadow' ? run.keyFound : room === 'pond' ? run.pepperFound : run.basketFound;
}
export function isUnlocked(run, room) {
  return room === 'meadow' || room === 'pond' && run.keyFound || room === 'orchard' && run.pepperFound;
}
export function firstUnfinished(run) { return ORDER.find(room => !goalDone(run, room)) || 'orchard'; }
export function objective(run, room) {
  if (goalDone(run, room)) return room === 'orchard' ? 'Bring Pepper and the basket home →' : 'Follow the open path to the right →';
  return room === 'meadow' ? 'Dash into the wooden crate to find the key' : room === 'pond' ? 'Reach Pepper’s gate with the key' : 'Bring the picnic basket home with Pepper';
}
export function walkable(x, y, room, radius = 18) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 55 + radius || x > 945 - radius || y < 105 + radius || y > 548 - radius) return false;
  return !ROOMS[room].obstacles.some(o => ((x-o.x)/(o.r+radius)) ** 2 + ((y-o.y)/((o.ry||o.r)+radius)) ** 2 < 1);
}
export function toysFor(seed, room) {
  const positions = room === 'meadow' ? [[360,350],[690,285]] : room === 'pond' ? [[290,220],[710,370],[565,470]] : [[315,375],[505,220],[800,340],[515,480]];
  const rng = random(seed + ORDER.indexOf(room)*77);
  return positions.map(([x,y], i) => ({
    x,y,r:18,vx:(rng()>.5?1:-1)*(40+ORDER.indexOf(room)*8),vy:(rng()>.5?1:-1)*30,
    kind:i%2?'yarn':'ball',mode:'roam',timer:0,cooldown:.8+i*.3,aimX:0,aimY:0,
  }));
}
export function makeWorld(run, room) {
  const saved = run.positions[room];
  const p = saved && walkable(saved.x,saved.y,room) ? {...saved} : {x:135,y:315};
  if (!run.checkpoints[room]) run.checkpoints[room] = run.collected.filter(id => id.startsWith(room+'-'));
  const buddy = walkable(p.x-43,p.y+10,room,12) ? {x:p.x-43,y:p.y+10} : {...p};
  return {
    room, runId:run.id, player:{...p,vx:1,vy:0,facing:1,moving:false}, buddy:{...buddy,facing:1},
    followTrail:[{...p}], toys:toysFor(run.seed,room), items:roomItems(run.seed,room),
    time:0,dash:0,cooldown:0,invincible:.65,bump:0,particles:[],
  };
}
export function retryRoom(run, room) {
  const checkpoint = run.checkpoints[room];
  const valid = Array.isArray(checkpoint) ? checkpoint.filter(id => typeof id === 'string' && id.startsWith(room+'-') && /-[0-3]$/.test(id)) : [];
  run.collected = [...new Set([...run.collected.filter(id => !id.startsWith(room+'-')), ...valid])];
  run.health = maxHearts(run);
  run.retries++;
  run.positions[room] = {x:135,y:315};
  return makeWorld(run,room);
}
export function startDash(world, input={x:0,y:0}) {
  if (world.cooldown > 0) return false;
  const length = Math.hypot(input.x,input.y);
  if (length) { world.player.vx=input.x/length; world.player.vy=input.y/length; }
  world.dash=.2; world.cooldown=.95; world.invincible=Math.max(world.invincible,.28);
  return true;
}
function move(body,dx,dy,room,radius=18) {
  if(walkable(body.x+dx,body.y,room,radius))body.x+=dx;
  if(walkable(body.x,body.y+dy,room,radius))body.y+=dy;
}
function particles(world,x,y,kind='spark') {
  for(let i=0;i<9;i++)world.particles.push({x,y,vx:Math.cos(i/9*Math.PI*2)*45,vy:Math.sin(i/9*Math.PI*2)*45-25,life:.75,max:.75,kind});
}
function follow(world) {
  const p=world.player,b=world.buddy,trail=world.followTrail,last=trail.at(-1);
  if(Math.hypot(p.x-last.x,p.y-last.y)>.01)trail.push({x:p.x,y:p.y});
  // Follow distance along Pepsi's path, rather than counting frames/waypoints.
  let pathLength=0,previous=b;
  for(const point of trail){pathLength+=Math.hypot(point.x-previous.x,point.y-previous.y);previous=point;}
  const excess=Math.max(0,pathLength-64);
  let budget=Math.min(excess,Math.min(400,excess*14)*world.dt),travelled=0;
  while(budget>.0001&&trail.length) {
    const target=trail[0],dx=target.x-b.x,dy=target.y-b.y,distance=Math.hypot(dx,dy);
    if(distance<.0001){if(trail.length>1){trail.shift();continue;}break;}
    const amount=Math.min(distance,budget),x=b.x,y=b.y;
    move(b,dx/distance*amount,dy/distance*amount,world.room,12);
    const moved=Math.hypot(b.x-x,b.y-y);
    if(moved<.0001)break;
    travelled+=moved;budget-=moved;
    // Use actual travel before consuming the point; exact arrival must not flip him.
    if(Math.abs(b.x-x)>moved*.25)b.facing=b.x<x?-1:1;
    if(Math.hypot(target.x-b.x,target.y-b.y)<.0001&&trail.length>1)trail.shift();
    else if(moved<amount-.0001)break;
  }
  b.moving=travelled>.01;
}
export function step(world,run,input,dt) {
  if(run.health<=0)return [];
  dt=Math.min(Math.max(dt,0),.035);world.dt=dt;world.time+=dt;
  for(const key of ['cooldown','invincible','bump'])world[key]=Math.max(0,world[key]-dt);
  const p=world.player, length=Math.hypot(input.x,input.y), events=[];
  const dashing=world.dash>0;
  p.moving=length>0||dashing;
  if(dashing){move(p,p.vx*570*dt,p.vy*570*dt,world.room);world.dash=Math.max(0,world.dash-dt);}
  else if(length){p.vx=input.x/length;p.vy=input.y/length;move(p,p.vx*185*dt,p.vy*185*dt,world.room);}
  if(Math.abs(p.vx)>.1)p.facing=p.vx<0?-1:1;
  if(run.pepperFound)follow(world);
  const goal=ROOMS[world.room].goal, nearGoal=Math.hypot(goal.x-p.x,goal.y-p.y);
  if(world.room==='meadow'&&!run.keyFound&&nearGoal<48) {
    if(dashing){run.keyFound=true;particles(world,goal.x,goal.y);events.push({type:'key'});}
    else {const dx=p.x-goal.x,dy=p.y-goal.y,d=Math.hypot(dx,dy)||1;move(p,dx/d*(48-d),dy/d*(48-d),world.room);}
  }
  if(world.room==='pond'&&!run.pepperFound&&run.keyFound&&nearGoal<69) {
    run.pepperFound=true;run.health=4;world.buddy={x:p.x-35,y:p.y+10,facing:p.facing};world.followTrail=[{x:p.x,y:p.y}];
    particles(world,goal.x,goal.y,'heart');events.push({type:'rescue'});return events;
  }
  if(world.room==='orchard'&&!run.basketFound&&run.pepperFound&&nearGoal<43) {
    run.basketFound=true;particles(world,goal.x,goal.y);events.push({type:'basket'});
  }
  for(const toy of world.toys) {
    toy.cooldown=Math.max(0,toy.cooldown-dt);
    const distance=Math.hypot(toy.x-p.x,toy.y-p.y);
    if(dashing&&distance<toy.r+29&&toy.mode!=='stunned') {
      toy.mode='stunned';toy.timer=2.3;particles(world,toy.x,toy.y);events.push({type:'stun'});
    }
    if(toy.mode==='stunned') {toy.timer-=dt;if(toy.timer<=0){toy.mode='roam';toy.cooldown=1;}continue;}
    if(toy.mode==='roam'&&toy.cooldown===0&&distance<240&&distance>45) {
      toy.mode='windup';toy.timer=.7;toy.aimX=(p.x-toy.x)/distance;toy.aimY=(p.y-toy.y)/distance;
    }
    if(toy.mode==='windup') {
      toy.timer-=dt;
      if(toy.timer<=0){toy.mode='charge';toy.timer=.57;}
    }else if(toy.mode==='charge') {
      const speed=280+ORDER.indexOf(world.room)*38;
      move(toy,toy.aimX*speed*dt,toy.aimY*speed*dt,world.room,toy.r);
      toy.timer-=dt;
      if(toy.timer<=0){toy.mode='roam';toy.cooldown=1.45;}
    }else {
      if(!walkable(toy.x+toy.vx*dt,toy.y,world.room,toy.r))toy.vx*=-1;
      if(!walkable(toy.x,toy.y+toy.vy*dt,world.room,toy.r))toy.vy*=-1;
      move(toy,toy.vx*dt,toy.vy*dt,world.room,toy.r);
    }
    if(world.invincible<=0&&Math.hypot(toy.x-p.x,toy.y-p.y)<toy.r+20) {
      run.health--;run.hits++;world.invincible=1.35;world.bump=.45;
      const dx=p.x-toy.x,dy=p.y-toy.y,d=Math.hypot(dx,dy)||1;
      move(p,dx/d*34,dy/d*34,world.room);toy.mode='roam';toy.cooldown=1.1;
      events.push({type:run.health<=0?'defeat':'hit'});
      if(run.health<=0)return events;
    }
  }
  for(const item of world.items) {
    if(!run.collected.includes(item.id)&&Math.hypot(item.x-p.x,item.y-p.y)<31) {
      run.collected.push(item.id);const healed=run.health<maxHearts(run);if(healed)run.health++;
      events.push({type:'snack',item,healed});particles(world,item.x,item.y,healed?'heart':'spark');
    }
  }
  world.particles=world.particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;return p.life>0;});
  if(p.x>890&&Math.abs(p.y-320)<58&&goalDone(run,world.room))events.push({type:'exit'});
  return events;
}
