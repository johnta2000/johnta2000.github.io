export const WIDTH = 1000;
export const HEIGHT = 620;
export const DASH_COOLDOWN = 2.8;
export const ABILITIES = {
  bark:{key:'Q',corgi:'Pepper',name:'Bark',hint:'Stun enemies near Pepper',cooldown:5,unlock:'pepperFound'},
  stink:{key:'E',corgi:'Pee',name:'Toot',hint:'Leave a cloud for pursuers',cooldown:7,unlock:'peeFound'},
  power:{key:'R',corgi:'Pepperoni',name:'Power',hint:'Longer dash · double boss damage',cooldown:8,unlock:'pepperoniFound'},
};
function freshCooldowns(){return {dash:0,bark:0,stink:0,power:0};}
export const ORDER = ['meadow', 'pond', 'burrows', 'woods', 'hills', 'orchard', 'laundry', 'kitchen', 'boss'];
export const ROOMS = {
  tutorial: {
    name:'Little Loaf Practice',short:'Practice',ground:'#e4ebc7',snack:'biscuit',
    note:'A safe little clearing. Use WASD to roll to the flower flag. Nothing here can hurt you.',
    obstacles:[],slots:[],goal:{x:535,y:315,r:27,kind:'crate'},
  },
  meadow: {
    name: 'Sunbeam Meadow', short: 'The key', ground: '#dce8bd', snack: 'biscuit',
    note: 'The gate key is in the crate. Watch the cat crouch, then dodge its pounce!',
    obstacles: [{x:365,y:225,r:37,kind:'bush'}, {x:650,y:400,r:32,kind:'rock'}, {x:785,y:180,r:32,kind:'bush'}],
    slots: [[230,190],[480,145],[670,230],[840,405],[490,470],[225,430],[760,495],[475,325]],
    goal: {x:535,y:190,r:27,kind:'crate'},
  },
  pond: {
    name: 'Pebble Pond', short: 'Find Pepper', ground: '#d5e5c1', snack: 'berry',
    note: 'Find Pepper, then explore the pond together for two lost trinkets.',
    obstacles: [{x:490,y:310,r:107,ry:75,kind:'pond'}, {x:765,y:180,r:32,kind:'rock'}, {x:245,y:460,r:32,kind:'bush'}],
    slots: [[230,190],[480,145],[680,240],[820,470],[510,480],[220,330],[710,470],[350,430]],
    goal: {x:820,y:370,r:35,kind:'pen'},
  },
  burrows: {
    name: 'Gopher Garden', short: 'The garden', ground: '#e5dfb4', snack: 'biscuit',
    note: 'Brown mud slows your roll. Dash across it! Shaking dirt warns of gophers.',
    terrain:[{kind:'mud',x:260,y:400,rx:100,ry:58},{kind:'mud',x:620,y:300,rx:112,ry:53}],
    obstacles: [{x:355,y:300,r:42,kind:'bush'}, {x:585,y:195,r:35,kind:'rock'}, {x:645,y:420,r:45,kind:'bush'}],
    slots: [[220,190],[480,145],[730,230],[840,440],[485,475],[220,420],[740,505],[475,325]],
    goal: {x:820,y:185,r:23,kind:'sign'},
  },
  woods: {
    name: 'Whispering Woods', short: 'The woods', ground: '#d3e3dd', snack: 'berry',
    note: 'Blue ice is slippery! Steer early, or take the grass around it. Find the ribbon and bell.',
    terrain:[{kind:'ice',x:510,y:205,rx:105,ry:57},{kind:'ice',x:740,y:370,rx:116,ry:54}],
    obstacles: [{x:330,y:210,r:40,kind:'tree'},{x:500,y:390,r:44,kind:'tree'},{x:700,y:250,r:38,kind:'tree'},{x:785,y:455,r:30,kind:'bush'}],
    slots:[[210,180],[490,150],[810,180],[850,370],[650,470],[225,440],[350,360],[610,300]],
    goal:{x:820,y:170,r:23,kind:'sign'},
  },
  hills: {
    name: 'Dandelion Downs', short: 'The downs', ground: '#e8e4b5', snack: 'cheese',
    note: 'Gusts push your roll. Pee joins after all six trinkets from the pond, garden, and woods.',
    wind:true,
    obstacles:[{x:325,y:320,r:43,kind:'rock'},{x:520,y:190,r:35,kind:'bush'},{x:650,y:420,r:42,kind:'rock'},{x:810,y:230,r:30,kind:'bush'}],
    slots:[[210,170],[390,170],[690,180],[850,420],[470,480],[230,440],[530,320],[730,330]],
    goal:{x:840,y:480,r:23,kind:'sign'},
  },
  orchard: {
    name: 'Clover Orchard', short: 'The basket', ground: '#e0e6b9', snack: 'cheese',
    note: 'Gather two trinkets and the basket. A suspicious vacuum trail leads into the cottage!',
    terrain:[{kind:'mud',x:470,y:365,rx:98,ry:60}],
    obstacles: [{x:345,y:245,r:36,kind:'tree'}, {x:640,y:235,r:38,kind:'tree'}, {x:640,y:435,r:33,kind:'tree'}],
    slots: [[215,180],[490,150],[775,245],[840,435],[460,470],[230,400],[775,500],[490,325]],
    goal: {x:825,y:160,r:23,kind:'basket'},
  },
  laundry: {
    name:'Sock Mountain',short:'Pepperoni',ground:'#e6dacc',snack:'biscuit',indoor:true,
    note:'Find two laundry treasures. Bring Pee to the blanket fort to rescue Pepperoni!',
    obstacles:[{x:355,y:235,r:44,kind:'hamper'},{x:620,y:405,r:44,kind:'hamper'},{x:770,y:280,r:36,kind:'hamper'}],
    terrain:[{kind:'ice',x:470,y:330,rx:110,ry:52}],
    slots:[[220,170],[480,160],[840,450],[240,450],[700,500],[610,220]],goal:{x:820,y:160,r:30,kind:'fort'},
  },
  kitchen: {
    name:'Midnight Snack Kitchen',short:'The kitchen',ground:'#e4e8da',snack:'cheese',indoor:true,
    note:'R uses Pepperoni’s power dash. Space stays a normal dash. Cross the slippery spills and find the last two treasures.',
    obstacles:[{x:360,y:260,r:45,kind:'table'},{x:620,y:400,r:48,kind:'table'},{x:770,y:210,r:32,kind:'hamper'}],
    terrain:[{kind:'ice',x:500,y:200,rx:100,ry:55},{kind:'ice',x:780,y:400,rx:100,ry:65}],
    slots:[[230,170],[500,150],[850,490],[250,450],[490,480],[680,300]],goal:{x:820,y:480,r:23,kind:'sign'},
  },
  boss: {
    name:'Sir Sucks-a-Lot',short:'The vacuum',ground:'#dcd4c9',snack:'biscuit',indoor:true,
    note:'Dodge the red charge line. When the vacuum overheats, use R for a power hit! Space hits do one damage; R does two.',
    obstacles:[],slots:[[220,170],[220,480],[820,480]],goal:{x:700,y:315,r:44,kind:'boss'},
  },
};
export const TRINKETS = [
  {id:'pond-ribbon',room:'pond',name:'Pepper’s ribbon',kind:'ribbon',x:225,y:165},
  {id:'pond-button',room:'pond',name:'A very fancy button',kind:'button',x:695,y:490},
  {id:'burrows-bell',room:'burrows',name:'The dinner bell',kind:'bell',x:820,y:185},
  {id:'burrows-sock',room:'burrows',name:'One suspicious sock',kind:'sock',x:230,y:485},
  {id:'woods-ribbon',room:'woods',name:'A woodland ribbon',kind:'ribbon',x:825,y:165},
  {id:'woods-bell',room:'woods',name:'The woodland chime',kind:'bell',x:225,y:480},
  {id:'hills-star',room:'hills',name:'A windy little star',kind:'star',x:235,y:165},
  {id:'hills-button',room:'hills',name:'A sunshine button',kind:'button',x:840,y:480},
  {id:'orchard-star',room:'orchard',name:'A pocket-sized star',kind:'star',x:470,y:160},
  {id:'orchard-flower',room:'orchard',name:'A picnic flower',kind:'flower',x:810,y:490},
  {id:'laundry-sock',room:'laundry',name:'Pepperoni’s favorite sock',kind:'sock',x:230,y:480},
  {id:'laundry-bell',room:'laundry',name:'The laundry bell',kind:'bell',x:650,y:170},
  {id:'kitchen-star',room:'kitchen',name:'The chef’s gold star',kind:'star',x:240,y:170},
  {id:'kitchen-button',room:'kitchen',name:'A runaway apron button',kind:'button',x:820,y:490},
];
export const PEPPERONI_RESCUE={x:820,y:160};
export const PEE_RESCUE = {x:790,y:155};
export function peeProgress(run) { return TRINKETS.filter(item=>['pond','burrows','woods'].includes(item.room)&&run.trinkets?.includes(item.id)).length; }
export function canRescuePee(run) { return run.pepperFound && peeProgress(run)===6; }
export function terrainAt(room,x,y) { return (ROOMS[room].terrain||[]).find(p=>((x-p.x)/p.rx)**2+((y-p.y)/p.ry)**2<1)?.kind || 'grass'; }
export function windAt(room,time) {
  if(!ROOMS[room].wind)return {x:0,warning:false};
  const phase=time%9,direction=Math.floor(time/9)%2===0?1:-1;
  return {x:phase>=3&&phase<7?direction*65*Math.sin((phase-3)/4*Math.PI):0,warning:phase>=1.5&&phase<3,direction};
}
export function roomTrinkets(room) { return TRINKETS.filter(item=>item.room===room); }
export function trinketCount(run,room) { return roomTrinkets(room).filter(item=>run.trinkets?.includes(item.id)).length; }
export function allTrinkets(run) { return TRINKETS.every(item=>run.trinkets?.includes(item.id)); }
export function upgradeRun(run) {
  // Extend old saves in place without losing snacks, health, or completed adventures.
  if(run.completed&&!run.bossDefeated){run.legacyEnding=true;run.trinkets=[...new Set([...(run.trinkets||[]),...TRINKETS.slice(0,10).map(item=>item.id)])];}
  else if(!run.trinkets)run.trinkets=[];
  if(run.pepperoniFound===undefined)run.pepperoniFound=false;
  if(run.bossDefeated===undefined)run.bossDefeated=false;
  if(run.peeFound===undefined)run.peeFound=false;
  if(run.tutorialStep===undefined)run.tutorialStep=3;
  run.cooldowns??=freshCooldowns();
  run.order=roomOrder();
  return run;
}

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
  const slots = [...ROOMS[room].slots], rng = random(seed + ['meadow','pond','orchard','burrows','woods','hills','laundry','kitchen','boss'].indexOf(room) * 817);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots.slice(0, 3).map(([x, y], i) => ({id:`${room}-${i}`, x, y, kind:ROOMS[room].snack,healing:i===0}));
}
export function maxHearts(run) { return run.pepperFound ? 4 : 3; }
export function createRun(id) {
  return {
    version:2, id, seed:Number.parseInt(id, 36) >>> 0, character:'pepsi', order:roomOrder(),
    room:'meadow', tutorialStep:0, collected:[], trinkets:[], positions:{}, checkpoints:{}, health:3,
    keyFound:false, pepperFound:false, peeFound:false, pepperoniFound:false,bossDefeated:false, basketFound:false, completed:false,
    hits:0, retries:0, revision:0, startedAt:Date.now(),cooldowns:freshCooldowns(),
  };
}
export function validRun(value, id) {
  return !!(value && value.version === 2 && value.id === id && /^[a-z0-9]{6,16}$/.test(id) &&
    (value.tutorialStep===undefined || Number.isInteger(value.tutorialStep)&&value.tutorialStep>=0&&value.tutorialStep<=3) &&
    (value.cooldowns===undefined || value.cooldowns && !Array.isArray(value.cooldowns) && Object.entries({dash:DASH_COOLDOWN,...Object.fromEntries(Object.entries(ABILITIES).map(([key,spec])=>[key,spec.cooldown]))}).every(([key,max])=>Number.isFinite(value.cooldowns[key])&&value.cooldowns[key]>=0&&value.cooldowns[key]<=max)) &&
    (value.peeFound===undefined || typeof value.peeFound==='boolean') && (!value.peeFound || value.pepperFound) &&
    ['pepperoniFound','bossDefeated','legacyEnding'].every(k=>value[k]===undefined||typeof value[k]==='boolean') &&
    (!value.pepperoniFound||value.peeFound&&value.pepperFound) && validBoss(value.bossState) &&
    Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 0xffffffff &&
    Array.isArray(value.collected) && value.collected.every(item => /^(meadow|pond|burrows|woods|hills|orchard|laundry|kitchen|boss)-[0-3]$/.test(item)) &&
    new Set(value.collected).size === value.collected.length &&
    (value.trinkets === undefined || Array.isArray(value.trinkets) && value.trinkets.every(id=>TRINKETS.some(item=>item.id===id)) && new Set(value.trinkets).size===value.trinkets.length) &&
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
  if(run.completed){run.trinkets=TRINKETS.slice(0,10).map(item=>item.id);run.legacyEnding=true;}
  run.health = maxHearts(run);
  run.room = firstUnfinished(run);
  run.migrated = true;
  return run;
}
export function roomCount(run, room) { return run.collected.filter(id => id.startsWith(room + '-')).length; }
export function goalDone(run, room) {
  if(room==='tutorial')return run.tutorialStep===3;
  if(room==='meadow')return run.keyFound;
  if(room==='pond')return run.pepperFound && trinketCount(run,room)===2;
  if(['burrows','woods','hills'].includes(room))return run.pepperFound && trinketCount(run,room)===2;
  if(room==='laundry')return run.pepperoniFound&&trinketCount(run,room)===2;
  if(room==='kitchen')return run.pepperoniFound&&trinketCount(run,room)===2;
  if(room==='boss')return !!run.bossDefeated;
  return run.basketFound && TRINKETS.slice(0,10).every(i=>run.trinkets?.includes(i.id));
}
export function isUnlocked(run, room) {
  if(room==='laundry')return goalDone(run,'orchard');
  if(room==='kitchen')return goalDone(run,'laundry');
  if(room==='boss')return goalDone(run,'kitchen')&&allTrinkets(run);
  return room === 'tutorial' || room === 'meadow' || room === 'pond' && run.keyFound || ['burrows','woods','hills','orchard'].includes(room) && run.pepperFound;
}
export function firstUnfinished(run) { return ORDER.find(room => !goalDone(run, room)) || 'boss'; }
export function objective(run, room) {
  if(room==='tutorial')return ['1 / 3 · WASD: roll to the flower flag →','2 / 3 · Hold D + tap SPACE to break the practice crate','3 / 3 · Watch the dash meter recharge (2.8 seconds)','Ready! Follow the glowing path into the meadow →'][run.tutorialStep??3];
  if (goalDone(run, room)) return room === 'boss' ? 'The vacuum is off! Bring everyone home →' : 'Follow the open path to the right →';
  if(room==='meadow')return 'Dash into the wooden crate to find the key';
  if(room==='pond'&&!run.pepperFound)return 'Reach Pepper’s gate with the key';
  if(room==='hills'&&!run.peeFound&&canRescuePee(run))return 'Pee is ready! Roll to the yellow corgi in the top-right clearing';
  if(room==='boss')return run.bossState?.mode==='exposed'?'OVERHEATED! R: power dash · Space: normal hit':'Dodge the red charge line; strike only when it overheats';
  if(room==='laundry'&&!run.peeFound)return 'Bring Pee from the downs to help find Pepperoni';
  if(room==='laundry'&&!run.pepperoniFound&&trinketCount(run,room)===2)return 'Roll to Pepperoni’s blanket fort in the top-right corner';
  const missing=roomTrinkets(room).filter(item=>!run.trinkets?.includes(item.id));
  if(missing.length)return `Find ${missing.map(item=>item.kind==='button'?'the button':`the ${item.kind}`).join(' + ')} · ${trinketCount(run,room)}/2 trinkets`;
  if(room==='orchard'&&!TRINKETS.slice(0,10).every(i=>run.trinkets?.includes(i.id)))return 'Trinkets still missing! Revisit earlier chapters below';
  return 'Collect the picnic basket, then take the path home →';
}
export function walkable(x, y, room, radius = 18) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 55 + radius || x > 945 - radius || y < 105 + radius || y > 548 - radius) return false;
  return !ROOMS[room].obstacles.some(o => ((x-o.x)/(o.r+radius)) ** 2 + ((y-o.y)/((o.ry||o.r)+radius)) ** 2 < 1);
}
export function toysFor(seed, room) {
  if(room==='tutorial'||room==='boss')return [];
  const positions = ['laundry','kitchen'].includes(room)?[[280,360],[540,260],[800,380]]:room==='woods'?[[420,260],[620,350],[820,330]]:room==='hills'?[[420,400],[710,290],[590,310]]:room === 'meadow' ? [[360,350],[690,285]] : room === 'pond' ? [[290,220],[710,370],[565,470]] : room === 'burrows' ? [[470,300],[760,350]] : [[315,375],[505,220],[800,340],[515,480]];
  const rng = random(seed + ORDER.indexOf(room)*77);
  return positions.map(([x,y], i) => ({
    x,y,r:18,vx:(rng()>.5?1:-1)*(40+ORDER.indexOf(room)*8),vy:(rng()>.5?1:-1)*30,
    kind:i%2?'cat':'vacuum',mode:'roam',timer:0,cooldown:.8+i*.3,aimX:0,aimY:0,
  }));
}
export function gophersFor(seed,room) {
  if(room==='tutorial'||room==='boss')return [];
  const spots={laundry:[],kitchen:[],woods:[[260,450],[610,170],[810,350]],hills:[[250,220],[450,440],[710,190],[820,440]],meadow:[],pond:[[340,180],[680,475]],burrows:[[270,210],[470,450],[735,200],[805,430]],orchard:[[450,180],[730,440],[830,270]]}[room];
  const rng=random(seed+ORDER.indexOf(room)*307);
  return spots.map(([x,y],i)=>({x,y,r:22,kind:'gopher',mode:'hidden',timer:1+i*.65+rng(),cycle:0,seed:seed+i*31}));
}
function companionSpawn(leader,room) {
  // Keep the third loaf visible at a narrow entrance; never place him through a wall.
  for(const [dx,dy] of [[-43,10],[0,64],[0,-64],[64,0]]) {
    const x=leader.x+dx,y=leader.y+dy;
    if([.25,.5,.75,1].every(t=>walkable(leader.x+dx*t,leader.y+dy*t,room,12)))return {x,y,facing:leader.facing||1};
  }
  return {x:leader.x,y:leader.y,facing:leader.facing||1};
}
export function makeWorld(run, room) {
  run.cooldowns??=freshCooldowns();
  const saved = run.positions[room];
  const p = saved && walkable(saved.x,saved.y,room) ? {...saved} : {x:135,y:315};
  if (!run.checkpoints[room]) run.checkpoints[room] = run.collected.filter(id => id.startsWith(room+'-'));
  const buddy = walkable(p.x-43,p.y+10,room,12) ? {x:p.x-43,y:p.y+10} : {...p};
  const pee=companionSpawn(buddy,room),pepperoni=companionSpawn(pee,room);
  if(room==='boss'&&!run.bossDefeated&&!run.bossState)run.bossState=newBoss();
  return {
    room, runId:run.id, player:{...p,vx:1,vy:0,facing:1,moving:false}, buddy:{...buddy,facing:1}, pee:{...pee,facing:1},pepperoni:{...pepperoni,facing:1},boss:room==='boss'?run.bossState:null,
    followTrail:[{...p}],peeTrail:[{...buddy}],pepperoniTrail:[{...pee}],clouds:[],bark:0,powerDash:false, toys:toysFor(run.seed,room), gophers:gophersFor(run.seed,room), items:roomItems(run.seed,room),
    time:0,dash:0,cooldown:run.cooldowns.dash,abilityCooldowns:run.cooldowns,invincible:.65,bump:0,hitCorgi:null,particles:[],impacts:[],dashHits:new Set(),
  };
}
export function retryRoom(run, room) {
  const checkpoint = run.checkpoints[room];
  const valid = Array.isArray(checkpoint) ? checkpoint.filter(id => typeof id === 'string' && id.startsWith(room+'-') && /-[0-3]$/.test(id)) : [];
  run.collected = [...new Set([...run.collected.filter(id => !id.startsWith(room+'-')), ...valid])];
  run.health = maxHearts(run);
  run.retries++;
  run.cooldowns=freshCooldowns();
  run.positions[room] = {x:135,y:315};
  if(room==='boss'&&!run.bossDefeated)run.bossState=newBoss();
  return makeWorld(run,room);
}
export function startDash(world, input={x:0,y:0}) {
  if (world.cooldown > 0 || world.dash > 0) return false;
  const length = Math.hypot(input.x,input.y);
  if (length) { world.player.vx=input.x/length; world.player.vy=input.y/length; }
  world.dash=.2;world.powerDash=false;world.dashHits.clear(); world.cooldown=DASH_COOLDOWN;world.abilityCooldowns.dash=DASH_COOLDOWN; world.invincible=Math.max(world.invincible,.28);
  return true;
}
export function startAbility(world,run,ability,input={x:0,y:0}) {
  const spec=ABILITIES[ability];
  if(!spec||!run[spec.unlock]||run.health<=0||world.abilityCooldowns[ability]>0)return false;
  if(ability==='power') {
    // Both rolls share their short recovery; alternating Space/R cannot bypass it.
    if(!startDash(world,input))return false;
    world.dash=.28;world.powerDash=true;world.invincible=Math.max(world.invincible,.36);
  } else if(ability==='bark') {
    world.bark=.5;
    for(const h of [...world.toys,...world.gophers])if((h.kind!=='gopher'||['up','stunned'].includes(h.mode))&&Math.hypot(h.x-world.buddy.x,h.y-world.buddy.y)<95){h.timer=h.mode==='stunned'?Math.max(h.timer,1.4):1.4;h.mode='stunned';}
  } else world.clouds.push({x:world.pee.x,y:world.pee.y,life:1.2});
  world.abilityCooldowns[ability]=spec.cooldown;
  return true;
}
function move(body,dx,dy,room,radius=18) {
  if(walkable(body.x+dx,body.y,room,radius))body.x+=dx;
  if(walkable(body.x,body.y+dy,room,radius))body.y+=dy;
}
function particles(world,x,y,kind='spark') {
  for(let i=0;i<9;i++)world.particles.push({x,y,vx:Math.cos(i/9*Math.PI*2)*45,vy:Math.sin(i/9*Math.PI*2)*45-25,life:.75,max:.75,kind});
}
function dashImpact(world,target,body=world.player,boss=false) {
  if(world.dashHits.has(target))return;
  world.dashHits.add(target);
  const dx=target.x-body.x,dy=target.y-body.y,d=Math.hypot(dx,dy);
  // Recoil is a temporary drawing pose: hitboxes, patrols, and saved boss positions stay put.
  world.impacts.push({target,x:target.x,y:target.y,dx:d>.1?dx/d:world.player.vx,dy:d>.1?dy/d:world.player.vy,started:world.time,duration:boss?1.3:1.05,boss});
}
function follow(world,p=world.player,b=world.buddy,trail=world.followTrail) {
  const last=trail.at(-1);
  if(Math.hypot(p.x-last.x,p.y-last.y)>.01)trail.push({x:p.x,y:p.y});
  // Follow distance along Pepsi's path, rather than counting frames/waypoints.
  let pathLength=0,previous=b;
  for(const point of trail){pathLength+=Math.hypot(point.x-previous.x,point.y-previous.y);previous=point;}
  const excess=Math.max(0,pathLength-64);
  const mud=terrainAt(world.room,b.x,b.y)==='mud'&&world.dash<=0?.55:1;
  let budget=Math.min(excess,Math.min(400,excess*14)*world.dt*mud),travelled=0;
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
function touchingCorgi(world,run,hazard,padding=20) {
  const corgis=[{body:world.player,character:'pepsi'}];
  if(run.pepperFound)corgis.push({body:world.buddy,character:'pepper'});
  if(run.peeFound)corgis.push({body:world.pee,character:'pee'});
  if(run.pepperoniFound)corgis.push({body:world.pepperoni,character:'pepperoni'});
  return corgis.map(corgi=>({...corgi,distance:Math.hypot(hazard.x-corgi.body.x,hazard.y-corgi.body.y)}))
    .filter(corgi=>corgi.distance<hazard.r+padding).sort((a,b)=>a.distance-b.distance)[0];
}
function bumpCorgis(world,run,hazard,events) {
  if(world.invincible>0)return;
  const hit=touchingCorgi(world,run,hazard);
  if(!hit)return;
  run.health--;run.hits++;world.invincible=1.35;world.bump=.45;world.hitCorgi=hit.character;
  // Pepper keeps following the safe trail; his hit reaction is visual, not a path-breaking shove.
  if(hit.character==='pepsi') {
    const dx=hit.body.x-hazard.x,dy=hit.body.y-hazard.y,d=Math.hypot(dx,dy)||1;
    move(hit.body,dx/d*34,dy/d*34,world.room);
  }
  events.push({type:run.health<=0?'defeat':'hit',character:hit.character});
}
export function step(world,run,input,dt) {
  if(run.health<=0)return [];
  dt=Math.min(Math.max(dt,0),.035);world.dt=dt;world.time+=dt;
  for(const key of ['cooldown','invincible','bump'])world[key]=Math.max(0,world[key]-dt);
  for(const key of Object.keys(ABILITIES))world.abilityCooldowns[key]=Math.max(0,world.abilityCooldowns[key]-dt);
  world.abilityCooldowns.dash=world.cooldown;
  const p=world.player, length=Math.hypot(input.x,input.y), events=[];
  world.bark=Math.max(0,world.bark-dt);
  world.clouds=world.clouds.filter(c=>(c.life-=dt)>0);
  world.impacts=world.impacts.filter(hit=>world.time-hit.started<hit.duration);
  if(world.dash<=0)world.powerDash=false;
  const dashing=world.dash>0,ground=terrainAt(world.room,p.x,p.y),wind=windAt(world.room,world.time),before={x:p.x,y:p.y};
  if(dashing){move(p,p.vx*570*dt,p.vy*570*dt,world.room);world.dash=Math.max(0,world.dash-dt);p.slideX=p.vx*185;p.slideY=p.vy*185;}
  else {
    if(length){p.vx=input.x/length;p.vy=input.y/length;}
    const speed=ground==='mud'?102:185,targetX=length?p.vx*speed:0,targetY=length?p.vy*speed:0;
    const blend=ground==='ice'?1-Math.exp(-dt*(length?3.5:2)):1;
    p.slideX=(p.slideX||0)+(targetX-(p.slideX||0))*blend;p.slideY=(p.slideY||0)+(targetY-(p.slideY||0))*blend;
    if(Math.abs(p.slideX)<.1)p.slideX=0;if(Math.abs(p.slideY)<.1)p.slideY=0;
    move(p,(p.slideX+wind.x)*dt,p.slideY*dt,world.room);
    if(p.x===before.x)p.slideX=0;if(p.y===before.y)p.slideY=0;
  }
  p.moving=Math.hypot(p.x-before.x,p.y-before.y)>.01;
  if(Math.abs(p.x-before.x)>.01)p.facing=p.x<before.x?-1:1;
  if(run.pepperFound)follow(world);
  if(run.peeFound)follow(world,world.buddy,world.pee,world.peeTrail);
  if(run.pepperoniFound)follow(world,world.pee,world.pepperoni,world.pepperoniTrail);
  const goal=ROOMS[world.room].goal, nearGoal=Math.hypot(goal.x-p.x,goal.y-p.y);
  if(world.room==='tutorial') {
    if(run.tutorialStep===0&&Math.hypot(p.x-330,p.y-315)<45){run.tutorialStep=1;events.push({type:'practice'});}
    if(nearGoal<48&&run.tutorialStep<2){
      if(dashing&&run.tutorialStep===1){run.tutorialStep=2;particles(world,goal.x,goal.y);events.push({type:'practice'});}
      else {const dx=p.x-goal.x,dy=p.y-goal.y,d=Math.hypot(dx,dy)||1;move(p,dx/d*(48-d),dy/d*(48-d),world.room);}
    }
    if(run.tutorialStep===2&&world.cooldown===0){run.tutorialStep=3;events.push({type:'practice'});}
  }
  if(world.room==='meadow'&&!run.keyFound&&nearGoal<48) {
    if(dashing){run.keyFound=true;particles(world,goal.x,goal.y);events.push({type:'key'});}
    else {const dx=p.x-goal.x,dy=p.y-goal.y,d=Math.hypot(dx,dy)||1;move(p,dx/d*(48-d),dy/d*(48-d),world.room);}
  }
  if(world.room==='pond'&&!run.pepperFound&&run.keyFound&&nearGoal<69) {
    run.pepperFound=true;run.health=Math.min(maxHearts(run),run.health+1);world.buddy={x:p.x-35,y:p.y+10,facing:p.facing};world.followTrail=[{x:p.x,y:p.y}];
    world.invincible=3;
    particles(world,goal.x,goal.y,'heart');events.push({type:'rescue'});return events;
  }
  if(world.room==='hills'&&!run.peeFound&&canRescuePee(run)&&Math.hypot(p.x-PEE_RESCUE.x,p.y-PEE_RESCUE.y)<55) {
    run.peeFound=true;
    world.pee=companionSpawn(world.buddy,world.room);world.peeTrail=[{x:world.buddy.x,y:world.buddy.y}];
    world.invincible=3;particles(world,PEE_RESCUE.x,PEE_RESCUE.y,'heart');events.push({type:'pee-rescue'});
  }
  if(world.room==='laundry'&&!run.pepperoniFound&&run.peeFound&&trinketCount(run,'laundry')===2&&nearGoal<55){
    run.pepperoniFound=true;world.pepperoni=companionSpawn(world.pee,world.room);world.pepperoniTrail=[{x:world.pee.x,y:world.pee.y}];world.invincible=3;
    particles(world,goal.x,goal.y,'heart');events.push({type:'pepperoni-rescue'});
  }
  if(world.room==='orchard'&&!run.basketFound&&run.pepperFound&&nearGoal<43) {
    run.basketFound=true;particles(world,goal.x,goal.y);events.push({type:'basket'});
  }
  if(world.boss&&!run.bossDefeated){stepBoss(world,run,dt,dashing,events);if(run.health<=0)return events;}
  for(const h of [...world.toys,...world.gophers])if(world.clouds.some(c=>Math.hypot(c.x-h.x,c.y-h.y)<68)){if(h.mode!=='stunned')events.push({type:'stun'});h.mode='stunned';h.timer=Math.max(h.timer,1);}
  for(const toy of world.toys) {
    toy.cooldown=Math.max(0,toy.cooldown-dt);
    const distance=Math.hypot(toy.x-p.x,toy.y-p.y);
    const dashContact=dashing&&touchingCorgi(world,run,toy,29);
    if(dashContact&&!world.dashHits.has(toy)) {
      dashImpact(world,toy,dashContact.body);
      if(toy.mode!=='stunned'){toy.mode='stunned';toy.timer=2.3;events.push({type:'stun'});}
    }
    if(toy.mode==='stunned') {toy.timer-=dt;if(toy.timer<=0){toy.mode='roam';toy.cooldown=1;}continue;}
    if(toy.mode==='rest') {toy.timer-=dt;if(toy.timer<=0){toy.mode='roam';toy.cooldown=.4;}continue;}
    if(toy.mode==='roam'&&toy.cooldown===0&&distance<(toy.kind==='cat'?330:270)&&distance>45) {
      toy.mode='windup';toy.timer=toy.kind==='cat'?.85:.7;toy.aimX=(p.x-toy.x)/distance;toy.aimY=(p.y-toy.y)/distance;
    }
    if(toy.mode==='windup') {
      toy.timer-=dt;
      if(toy.timer<=0){toy.mode='charge';toy.timer=.57;}
    }else if(toy.mode==='charge') {
      const speed=toy.kind==='cat'?455:280+Math.min(3,ORDER.indexOf(world.room))*38;
      move(toy,toy.aimX*speed*dt,toy.aimY*speed*dt,world.room,toy.r);
      toy.timer-=dt;
      if(toy.timer<=0){toy.mode=toy.kind==='cat'?'rest':'roam';toy.timer=1.2;toy.cooldown=1.1;}
    }else {
      if(!walkable(toy.x+toy.vx*dt,toy.y,world.room,toy.r))toy.vx*=-1;
      if(!walkable(toy.x,toy.y+toy.vy*dt,world.room,toy.r))toy.vy*=-1;
      move(toy,toy.vx*dt,toy.vy*dt,world.room,toy.r);
    }
    bumpCorgis(world,run,toy,events);
    if(run.health<=0)return events;
  }
  for(const gopher of world.gophers) {
    gopher.timer-=dt;
    if(gopher.timer<=0) {
      if(gopher.mode==='hidden'){gopher.mode='warning';gopher.timer=.95;}
      else if(gopher.mode==='warning'){gopher.mode='up';gopher.timer=1.6;}
      else {gopher.mode='hidden';gopher.timer=1.3+random(gopher.seed+gopher.cycle++)()*2;}
    }
    if(gopher.mode!=='up'&&gopher.mode!=='stunned')continue;
    const dashContact=dashing&&touchingCorgi(world,run,gopher,29);
    if(dashContact&&!world.dashHits.has(gopher)) {
      dashImpact(world,gopher,dashContact.body);
      if(gopher.mode!=='stunned'){gopher.mode='stunned';gopher.timer=2.3;events.push({type:'stun'});}
    } else if(gopher.mode==='up')bumpCorgis(world,run,gopher,events);
    if(run.health<=0)return events;
  }
  if(run.pepperFound)for(const item of roomTrinkets(world.room)) {
    if(!run.trinkets.includes(item.id)&&Math.hypot(item.x-p.x,item.y-p.y)<34) {
      run.trinkets.push(item.id);particles(world,item.x,item.y);events.push({type:'trinket',item});
    }
  }
  for(const item of world.items) {
    if(!run.collected.includes(item.id)&&Math.hypot(item.x-p.x,item.y-p.y)<31) {
      run.collected.push(item.id);const healed=item.healing&&run.health<maxHearts(run);if(healed)run.health++;
      events.push({type:'snack',item,healed});particles(world,item.x,item.y,healed?'heart':'spark');
    }
  }
  world.particles=world.particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;return p.life>0;});
  if(p.x>890&&Math.abs(p.y-320)<58&&goalDone(run,world.room))events.push({type:'exit'});
  return events;
}

function newBoss(){return {x:710,y:315,r:44,hp:8,mode:'windup',timer:1.3,aimX:-1,aimY:0,cycle:0};}
function validBoss(b){return b===undefined || !!(b&&['x','y','r','hp','timer','aimX','aimY','cycle'].every(k=>Number.isFinite(b[k]))&&b.hp>=0&&b.hp<=8&&b.r===44&&b.x>=99&&b.x<=901&&b.y>=149&&b.y<=504&&['windup','charge','exposed','recover','suction','off'].includes(b.mode)&&b.timer>=0&&b.timer<=5);}
function stepBoss(world,run,dt,dashing,events){
  const b=world.boss,p=world.player;b.timer=Math.max(0,b.timer-dt);
  if(b.mode==='exposed'){
    if(dashing&&Math.hypot(p.x-b.x,p.y-b.y)<b.r+29){
      b.hp=Math.max(0,b.hp-(world.powerDash?2:1));dashImpact(world,b,p,true);
      if(!b.hp){run.bossDefeated=true;b.mode='off';b.timer=0;events.push({type:'boss-win'});return;}
      b.mode='recover';b.timer=1.2;events.push({type:'boss-hit'});
    }else if(b.timer===0){b.mode='recover';b.timer=.6;}
  }else if(b.mode==='recover'&&b.timer===0){
    b.cycle++;b.mode=b.hp<=4?'suction':'windup';b.timer=b.mode==='suction'?1.8:1.1;
    const d=Math.hypot(p.x-b.x,p.y-b.y)||1;b.aimX=(p.x-b.x)/d;b.aimY=(p.y-b.y)/d;
  }else if(b.mode==='suction'){
    if(!dashing){const d=Math.hypot(b.x-p.x,b.y-p.y)||1;move(p,(b.x-p.x)/d*60*dt,(b.y-p.y)/d*60*dt,world.room);}
    if(b.timer===0){b.mode='windup';b.timer=1.1;const d=Math.hypot(p.x-b.x,p.y-b.y)||1;b.aimX=(p.x-b.x)/d;b.aimY=(p.y-b.y)/d;}
  }else if(b.mode==='windup'&&b.timer===0){b.mode='charge';b.timer=1.3;}
  else if(b.mode==='charge'){
    const x=b.x,y=b.y;move(b,b.aimX*400*dt,b.aimY*400*dt,world.room,b.r);
    if(b.timer===0||Math.hypot(b.x-x,b.y-y)<400*dt*.6){b.mode='exposed';b.timer=3.4;events.push({type:'boss-open'});}
  }
  if(['windup','charge','suction'].includes(b.mode))bumpCorgis(world,run,b,events);
}
