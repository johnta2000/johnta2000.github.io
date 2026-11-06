export const WIDTH = 1000;
export const HEIGHT = 620;
export const ROOMS = {
  meadow: { name: 'Sunbeam Meadow', short: 'Meadow', snack: 'biscuit', note: 'A biscuit hunt in the warm afternoon sun.', ground: '#dce8bd', obstacles: [{x:365,y:225,r:37,kind:'bush'}, {x:650,y:400,r:32,kind:'rock'}, {x:785,y:180,r:32,kind:'bush'}], slots: [[230,190],[480,145],[670,230],[840,405],[490,470],[225,430],[760,495],[475,325]] },
  pond: { name: 'Pebble Pond', short: 'Pond', snack: 'berry', note: 'A few berries, a little splash, a very happy duck.', ground: '#d5e5c1', obstacles: [{x:490,y:310,r:107,ry:75,kind:'pond'},{x:765,y:180,r:32,kind:'rock'},{x:245,y:460,r:32,kind:'bush'}], slots: [[230,190],[480,145],[680,240],[820,410],[510,480],[220,330],[710,470],[350,430]] },
  orchard: { name: 'Clover Orchard', short: 'Orchard', snack: 'cheese', note: 'The last little treats are hiding among the trees.', ground: '#e0e6b9', obstacles: [{x:345,y:245,r:36,kind:'tree'},{x:640,y:235,r:38,kind:'tree'},{x:640,y:435,r:33,kind:'tree'}], slots: [[215,180],[490,150],[775,245],[840,435],[460,470],[230,400],[775,500],[490,325]] },
};
export function random(seed) { let n=seed>>>0; return ()=>{n+=0x6D2B79F5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;}; }
function shuffle(items, rng) { const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result; }
export function roomOrder(seed) { return ['meadow',...shuffle(['pond','orchard'],random(seed))]; }
export function roomItems(seed, room) { const info=ROOMS[room];const rng=random(seed+Object.keys(ROOMS).indexOf(room)*817);return shuffle(info.slots,rng).slice(0,4).map(([x,y],i)=>({id:room+'-'+i,x,y,kind:info.snack})); }
export function toysFor(seed, room) { const offset=Object.keys(ROOMS).indexOf(room)*17;const rng=random(seed+offset);return [{x:280+rng()*60,y:350,vx:54+rng()*10,vy:44,r:16,kind:'ball'},{x:720,y:325+rng()*35,vx:-58,vy:40+rng()*10,r:17,kind:'yarn'}]; }
export function createRun(id, character='pepsi') { const seed=Number.parseInt(id,36)>>>0;return {version:1,id,seed,character,order:roomOrder(seed),room:'meadow',collected:[],positions:{},completed:false,startedAt:Date.now()}; }
export function validRun(value, id) { return value && value.version===1 && value.id===id && Number.isFinite(value.seed) && ['pepsi','pepper'].includes(value.character) && Array.isArray(value.collected) && value.collected.every(item=>/^(meadow|pond|orchard)-[0-3]$/.test(item)) && new Set(value.collected).size===value.collected.length && Array.isArray(value.order) && value.order.join(',')===roomOrder(value.seed).join(',') && value.positions && typeof value.positions==='object' && Object.hasOwn(ROOMS,value.room); }
export function roomCount(run, room) { return run.collected.filter(id=>id.startsWith(room+'-')).length; }
export function isUnlocked(run, room) { const index=run.order.indexOf(room);return index>=0 && run.order.slice(0,index).every(id=>roomCount(run,id)===4); }
export function firstUnfinished(run) { return run.order.find(room=>roomCount(run,room)<4) || run.order.at(-1); }
export function walkable(x,y,room,radius=18) { if(x<55+radius || x>945-radius || y<105+radius || y>548-radius)return false;return !ROOMS[room].obstacles.some(o=>((x-o.x)/(o.r+radius))**2+((y-o.y)/((o.ry||o.r)+radius))**2<1); }
export function makeWorld(run,room) { const saved=run.positions[room];const p=saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && walkable(saved.x,saved.y,room) ? saved : {x:135,y:315};const buddy=walkable(p.x-43,p.y+10,room,12)?{x:p.x-43,y:p.y+10}:{...p};return {room,player:{...p,vx:1,vy:0,facing:1,moving:false},buddy:{...buddy,facing:1},followTrail:[{...p}],toys:toysFor(run.seed,room),items:roomItems(run.seed,room),time:0,dash:0,cooldown:0,invincible:0,bump:0,particles:[]}; }
export function startDash(world, input={x:0,y:0}) { if(world.cooldown>0)return false;const length=Math.hypot(input.x,input.y);if(length){world.player.vx=input.x/length;world.player.vy=input.y/length;}world.dash=.19;world.cooldown=1.05;world.invincible=.32;return true; }
function move(body,dx,dy,room,radius=18){if(walkable(body.x+dx,body.y,room,radius))body.x+=dx;if(walkable(body.x,body.y+dy,room,radius))body.y+=dy;}
export function step(world,run,input,dt){
  dt=Math.min(Math.max(dt,0),.035);world.time+=dt;world.cooldown=Math.max(0,world.cooldown-dt);world.invincible=Math.max(0,world.invincible-dt);world.bump=Math.max(0,world.bump-dt);const p=world.player;const length=Math.hypot(input.x,input.y);p.moving=length>0||world.dash>0;
  if(world.dash>0){move(p,p.vx*550*dt,p.vy*550*dt,world.room);world.dash=Math.max(0,world.dash-dt);}else if(length){p.vx=input.x/length;p.vy=input.y/length;move(p,p.vx*175*dt,p.vy*175*dt,world.room);}
  if(Math.abs(p.vx)>.1)p.facing=p.vx<0?-1:1;
  // Follow the leader's actual footsteps, so the companion can go around ponds and trees.
  const last=world.followTrail.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)>7)world.followTrail.push({x:p.x,y:p.y});
  const b=world.buddy;b.moving=world.followTrail.length>6;if(b.moving){const target=world.followTrail[0],distance=Math.hypot(target.x-b.x,target.y-b.y);if(distance<5)world.followTrail.shift();else{const amount=Math.min(distance,world.followTrail.length>20?300*dt:195*dt);move(b,(target.x-b.x)/distance*amount,(target.y-b.y)/distance*amount,world.room,12);b.facing=target.x>b.x?1:-1;}}
  const events=[];
  for(const toy of world.toys){let nextX=toy.x+toy.vx*dt,nextY=toy.y+toy.vy*dt;if(!walkable(nextX,toy.y,world.room,toy.r)){toy.vx*=-1;nextX=toy.x+toy.vx*dt;}if(!walkable(toy.x,nextY,world.room,toy.r)){toy.vy*=-1;nextY=toy.y+toy.vy*dt;}toy.x=nextX;toy.y=nextY;if(world.invincible<=0&&Math.hypot(toy.x-p.x,toy.y-p.y)<toy.r+17){world.invincible=1.5;world.bump=.3;const dx=p.x-toy.x,dy=p.y-toy.y,len=Math.hypot(dx,dy)||1;move(p,dx/len*27,dy/len*27,world.room);events.push({type:'bump'});}}
  for(const item of world.items){if(!run.collected.includes(item.id)&&Math.hypot(item.x-p.x,item.y-p.y)<31){run.collected.push(item.id);events.push({type:'snack',item});for(let i=0;i<9;i++)world.particles.push({x:item.x,y:item.y,vx:Math.cos(i/9*Math.PI*2)*40,vy:Math.sin(i/9*Math.PI*2)*40-25,life:.75,max:.75,kind:'spark'});}}
  world.particles=world.particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;return p.life>0;});
  if(p.x>890&&Math.abs(p.y-320)<60&&roomCount(run,world.room)===4)events.push({type:'exit'});
  return events;
}
