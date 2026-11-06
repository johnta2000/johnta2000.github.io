import { WIDTH, HEIGHT, ROOMS, random, goalDone } from './engine.mjs?v=4';

const INK='#75674c';
function ellipse(c,x,y,rx,ry,fill,stroke=null,line=2){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=line;c.stroke();}}
function line(c,points,color,width=2){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function shape(c,points,fill,stroke=null,width=2){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function rounded(c,x,y,w,h,r,fill,stroke=null){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}}
export function flower(c,x,y,size=1,color='#fff9db'){c.save();c.translate(x,y);c.scale(size,size);for(let i=0;i<5;i++){const a=i/5*Math.PI*2;ellipse(c,Math.cos(a)*4,Math.sin(a)*4,3,3,color);}ellipse(c,0,0,2.5,2.5,'#d3b76c');c.restore();}
function tuft(c,x,y,s=1){line(c,[[x-4*s,y-2*s],[x,y+2*s],[x+1*s,y-5*s]],'#a3bb7e',1.4);line(c,[[x,y+2*s],[x+6*s,y-2*s]],'#a3bb7e',1.4);}
function bush(c,x,y,r=35){ellipse(c,x+3,y+13,r*1.18,r*.44,'#6e8a5320');ellipse(c,x-r*.45,y,r*.7,r*.67,'#94b276','#7d9e62',1.5);ellipse(c,x+r*.45,y+2,r*.69,r*.64,'#a1be80','#7d9e62',1.5);ellipse(c,x,y-r*.25,r*.75,r*.8,'#a8c487','#7d9e62',1.5);ellipse(c,x-r*.2,y-r*.54,r*.3,r*.11,'#bad397');line(c,[[x+r*.43,y-1],[x+r*.51,y+4],[x+r*.6,y-1]],'#7d9e62',1.5);}
function tree(c,x,y,r){ellipse(c,x+3,y+15,r*1.3,r*.45,'#6e8a5320');rounded(c,x-6,y-30,13,46,5,'#b89a6b','#a28b62');bush(c,x,y-39,r*1.3);ellipse(c,x-21,y-48,5,6,'#d39a72');ellipse(c,x+23,y-29,5,6,'#d3aa70');ellipse(c,x+3,y-71,5,6,'#d39a72');}
function rock(c,x,y,r){ellipse(c,x+3,y+10,r*1.12,r*.49,'#7881741c');shape(c,[[x-r,y+6],[x-r*.8,y-r*.45],[x-r*.3,y-r*.7],[x+r*.4,y-r*.65],[x+r*.9,y-r*.15],[x+r,y+r*.35],[x+r*.1,y+r*.5]],'#b4bc9d','#9ca88a',1.5);shape(c,[[x-r*.8,y-r*.45],[x-r*.3,y-r*.7],[x+r*.4,y-r*.65],[x+r*.3,y-r*.2],[x-r*.4,y-r*.1]],'#cbd0b5');line(c,[[x+5,y+7],[x+13,y+2],[x+19,y+6]],'#9ba88a',1.4);}
function mushroom(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);rounded(c,-3,-4,7,14,3,'#fff3d6','#bfaa83');c.beginPath();c.ellipse(0,-3,13,11,0,Math.PI,0);c.closePath();c.fillStyle='#cd957c';c.fill();c.strokeStyle='#bd876d';c.lineWidth=1.5;c.stroke();ellipse(c,-5,-8,2,2,'#fae8c9');ellipse(c,4,-10,2.2,2.2,'#fae8c9');c.restore();}
function fence(c,x,y,count=4){rounded(c,x-3,y+5,count*24,5,2,'#c4b183');rounded(c,x-3,y+20,count*24,5,2,'#c4b183');for(let i=0;i<count;i++)shape(c,[[x+i*24,y+32],[x+i*24,y+1],[x+i*24+4,y-4],[x+i*24+8,y+1],[x+i*24+8,y+32]],'#dcc597','#bdab7d',1);}
function cottage(c){ellipse(c,157,101,87,24,'#6e8a5320');rounded(c,92,17,122,82,13,'#efe1b8','#b5a87f');shape(c,[[77,28],[147,-28],[230,28]],'#c68e73','#ad7f65');line(c,[[96,24],[147,-11],[211,24]],'#dca789',3);rounded(c,136,53,30,48,15,'#b0b58a','#89966d');ellipse(c,158,78,2,2,'#eee5b8');rounded(c,101,49,23,23,6,'#bad1c0','#a5ae8c');line(c,[[112,51],[112,70]],'#eee4bd',2);line(c,[[103,60],[123,60]],'#eee4bd',2);rounded(c,176,49,23,23,6,'#bad1c0','#a5ae8c');line(c,[[187,51],[187,70]],'#eee4bd',2);line(c,[[178,60],[197,60]],'#eee4bd',2);flower(c,94,98,1.3);flower(c,213,96,1.4,'#e6c3a1');}
function pond(c,o){ellipse(c,o.x+2,o.y+5,o.r+10,o.ry+9,'#bccb98');ellipse(c,o.x,o.y,o.r+4,o.ry+3,'#e8e8bd');ellipse(c,o.x,o.y,o.r-4,o.ry-4,'#a5ceca','#8dbcb5',2);ellipse(c,o.x-24,o.y-20,48,17,'#b8dad0');ellipse(c,o.x+50,o.y+23,17,7,'#94bba0');ellipse(c,o.x-65,o.y+25,15,7,'#94bba0');flower(c,o.x+52,o.y+20,.9,'#fae8d3');for(let i=0;i<4;i++){const x=o.x-o.r-8+i*8;line(c,[[x,o.y+24],[x-4,o.y-3-i*4]],'#859e67',2);ellipse(c,x-4,o.y-4-i*4,2,5,'#b4a379');}}
const groundCache=new Map();
function ground(room,seed){const key=room+seed;if(groundCache.has(key))return groundCache.get(key);if(groundCache.size>9)groundCache.clear();const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;const c=canvas.getContext('2d');c.lineCap='round';c.lineJoin='round';const info=ROOMS[room],rng=random(seed+513);c.fillStyle=info.ground;c.fillRect(0,0,WIDTH,HEIGHT);
  // A softly worn path makes the little clearing read as an explorable place.
  c.beginPath();c.moveTo(40,318);c.bezierCurveTo(290,305,280,465,510,435);c.bezierCurveTo(700,415,742,290,970,320);c.strokeStyle='#e9e7bd';c.lineWidth=81;c.stroke();c.strokeStyle='#eeebc8';c.lineWidth=62;c.stroke();
  for(let i=0;i<160;i++){let x=45+rng()*910,y=105+rng()*450;if(i%4===0)flower(c,x,y,.6+rng()*.3,i%8===0?'#f5eccd':'#eed1ad');else if(i%3===0)ellipse(c,x,y,1.5,1,'#b9c99c');else tuft(c,x,y,.6+rng()*.4);}
  for(let i=0;i<21;i++){const x=i*53-15;bush(c,x,47+rng()*20,30+rng()*12);bush(c,x,602+rng()*20,33+rng()*11);}for(let i=0;i<8;i++){let y=100+i*64;if(Math.abs(y-320)>63){bush(c,-8,y,35);bush(c,1008,y,38);}}
  if(room==='meadow'){cottage(c);fence(c,730,73,6);mushroom(c,96,492,1.2);mushroom(c,118,505,.8);}
  if(room==='pond'){fence(c,135,79,5);mushroom(c,865,492,1.4);mushroom(c,890,504,.8);}
  if(room==='orchard'){fence(c,423,75,6);tree(c,164,90,35);tree(c,846,84,38);mushroom(c,105,490,1.2);}
  for(const o of info.obstacles){if(o.kind==='pond')pond(c,o);else if(o.kind==='bush')bush(c,o.x,o.y,o.r);else if(o.kind==='rock')rock(c,o.x,o.y,o.r);else tree(c,o.x,o.y,o.r);}
  // Tiny signposts, so the exit feels part of the landscape.
  rounded(c,907,232,7,49,3,'#b29a6c');rounded(c,878,222,66,28,5,'#f0deb0','#bba477');c.font='11px sans-serif';c.fillStyle='#8b805f';c.textAlign='center';c.fillText('this way',908,239);line(c,[[935,265],[945,265],[941,261],[945,265],[941,269]],'#a7af77',2);
  for(let i=0;i<7;i++){const x=99+i*135;flower(c,x,555+rng()*14,1.2,'#f9f1d5');}groundCache.set(key,canvas);return canvas;
}

// Visual-only poses follow actual travel, so walls, pauses, and saves keep their behavior.
const rollPoses=new WeakMap();
function rollingPose(body,time,scale) {
  let pose=rollPoses.get(body);
  if(!pose){pose={x:body.x,y:body.y,time,angle:0};rollPoses.set(body,pose);}
  const dx=body.x-pose.x,dy=body.y-pose.y,distance=Math.hypot(dx,dy);
  const dt=Math.max(0,Math.min(time-pose.time,.1));
  if(distance>100)pose.angle=0;
  else if(distance>.01) {
    const direction=Math.abs(dx)>.01?Math.sign(dx):Math.sign(dy)*body.facing;
    pose.angle+=direction*distance/(44*scale);
    pose.angle=Math.atan2(Math.sin(pose.angle),Math.cos(pose.angle));
  } else {
    // A plush gently rights itself instead of freezing upside down after a key release.
    pose.angle*=Math.exp(-dt*13);
    if(Math.abs(pose.angle)<.002)pose.angle=0;
  }
  pose.x=body.x;pose.y=body.y;pose.time=time;
  return pose.angle;
}

export function corgi(c,x,y,character='pepsi',scale=1,facing=1,roll=0,hurt=0) {
  c.save(); c.translate(x,y); c.scale(scale,scale);
  c.lineCap='round'; c.lineJoin='round';
  const gray=character==='pepper', coat=gray?'#a8adb4':'#dfb479';
  const edge=gray?'#91979f':'#c59e6b', cream='#fff8e9';
  const sine=Math.sin(roll),cosine=Math.cos(roll),squish=Math.abs(sine)*.035;
  // The shadow stays on the grass while the round body turns around its middle.
  ellipse(c,-4,5,43-Math.abs(sine)*4,10,'#51633e20');
  const support=Math.hypot(56*sine,35*cosine)+Math.max(0,-cosine)*16;
  c.translate(-3*facing,6-support);c.rotate(roll);c.scale(facing*(1+squish),1-squish);c.translate(3,29);
  // One round, low loaf: little paws and bead eyes, like the reference plush.
  ellipse(c,-34,-4,8,7,cream,edge,1);
  ellipse(c,-12,-27,48,35,coat,edge,1.2);
  c.beginPath();c.moveTo(-57,-19);c.bezierCurveTo(-47,-11,-35,-15,-23,-9);c.bezierCurveTo(-9,-2,7,-9,24,-22);c.lineTo(39,-9);c.bezierCurveTo(27,13,-41,18,-57,-5);c.closePath();c.fillStyle=cream;c.fill();
  ellipse(c,-51,-12,8,9,cream);
  shape(c,[[-2,-48],[-4,-78],[3,-82],[16,-57]],coat,edge,1.2);
  shape(c,[[31,-55],[42,-82],[49,-80],[48,-45]],coat,edge,1.2);
  shape(c,[[1,-57],[2,-74],[5,-75],[12,-56]],'#ebe1d7');
  shape(c,[[36,-56],[43,-74],[46,-73],[44,-51]],'#ebe1d7');
  ellipse(c,20,-32,34,32,coat);
  // The broad white face joins the white tummy rather than a separate human-like head.
  c.beginPath();c.moveTo(23,-61);c.bezierCurveTo(11,-55,16,-41,6,-31);
  c.bezierCurveTo(-14,-23,-12,-7,7,0);c.bezierCurveTo(30,11,56,-5,53,-28);
  c.bezierCurveTo(38,-24,33,-34,29,-47);c.bezierCurveTo(27,-55,29,-60,23,-61);
  c.fillStyle=cream;c.fill();
  ellipse(c,-24,0,10,7,cream,edge,.8);ellipse(c,41,0,10,6,cream,edge,.8);
  if(hurt>0) {
    line(c,[[8,-34],[13,-30],[8,-27]],'#302f2d',2);
    line(c,[[44,-38],[40,-34],[45,-31]],'#302f2d',2);
  } else {
    ellipse(c,10,-32,3.4,4.1,'#282929');ellipse(c,43,-36,3,3.7,'#282929');
    ellipse(c,11,-33.5,.75,.9,'#fffdfa');ellipse(c,43.8,-37.4,.7,.8,'#fffdfa');
  }
  ellipse(c,30,-18,12,10,'#fffdf4',gray?'#d9dbd9':'#eee6d7',.8);
  ellipse(c,31,-22,4.4,3.5,'#303033');
  c.beginPath();c.moveTo(31,-19);c.lineTo(31,-15);c.quadraticCurveTo(27,-10,24,-14);
  c.moveTo(31,-15);c.quadraticCurveTo(35,-10,38,-15);c.strokeStyle='#3a3533';c.lineWidth=1.3;c.stroke();
  ellipse(c,32,-11,2.3,2.4,'#dca0a2');
  // Soft toy shading, without a heavy cartoon outline or accessories.
  ellipse(c,-28,-43,13,5,gray?'#c1c4c955':'#f4d3a655');
  c.restore();
}
export function portrait(canvas,character){const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);c.save();c.scale(canvas.width/120,canvas.height/100);corgi(c,63,88,character,.9);c.restore();}
export function snack(c,x,y,kind,scale=1,time=0){c.save();c.translate(x,y+Math.sin(time*2+x)*2);c.scale(scale,scale);ellipse(c,0,13,15,5,'#6271471a');ellipse(c,0,0,22,22,'#fff4c440');if(kind==='biscuit'){c.save();c.rotate(-.35);rounded(c,-13,-6,26,12,5,'#deb77a','#bd965d');for(const [px,py]of[[-13,-6],[-13,6],[13,-6],[13,6]])ellipse(c,px,py,6,6,'#deb77a','#bd965d',1.5);rounded(c,-12,-5,24,10,3,'#deb77a');ellipse(c,-3,-1,1.2,1.2,'#bc945c');ellipse(c,4,2,1.2,1.2,'#bc945c');c.restore();}else if(kind==='berry'){c.beginPath();c.moveTo(-12,-9);c.bezierCurveTo(-22,-2,-4,18,1,17);c.bezierCurveTo(6,17,22,-2,12,-9);c.bezierCurveTo(7,-13,-5,-13,-12,-9);c.fillStyle='#d38e79';c.fill();c.strokeStyle='#b87869';c.lineWidth=1.5;c.stroke();shape(c,[[-1,-9],[-12,-15],[-6,-6],[0,-10],[7,-6],[12,-14]],'#8fa578');for(const [px,py]of[[-7,-1],[6,-1],[0,5],[-4,9],[8,6]])line(c,[[px,py],[px-1,py+2]],'#f6d2a7',1.5);}else{shape(c,[[-16,8],[-13,-9],[5,-17],[18,4],[17,13]],'#edce85','#c6a866',1.5);shape(c,[[-13,-9],[5,-17],[18,4]],'#f7dda0','#c6a866',1.5);ellipse(c,-6,1,3,4,'#d6b56e');ellipse(c,9,6,3,3,'#d6b56e');ellipse(c,3,-8,2,2,'#dfc084');}c.restore();}
function toy(c,toy,time) {
  c.save(); c.translate(toy.x,toy.y); c.lineCap='round';
  if(toy.mode==='windup') {
    c.beginPath();c.moveTo(0,0);c.lineTo(toy.aimX*145,toy.aimY*145);
    c.strokeStyle='#c16e5d65';c.lineWidth=25;c.stroke();
    c.setLineDash([5,7]);c.strokeStyle='#ad5849';c.lineWidth=2;c.stroke();c.setLineDash([]);
    ellipse(c,0,0,26,26,'#f5d0ad55','#bd6d5a',1.5);
  }
  if(toy.mode==='stunned')c.globalAlpha=.6;
  ellipse(c,0,14,19,6,'#65714e20');
  c.save();c.rotate(toy.mode==='windup'?Math.sin(time*35)*.14:time*(toy.vx>0?1:-1));
  ellipse(c,0,0,toy.r,toy.r,toy.kind==='ball'?'#d79b8f':'#afa9c4',toy.kind==='ball'?'#b87c73':'#9089a7',1.7);
  if(toy.kind==='ball'){c.beginPath();c.arc(0,0,10,-.8,2.2);c.strokeStyle='#f6dac0';c.lineWidth=7;c.stroke();}
  else for(let i=-8;i<12;i+=6){c.beginPath();c.ellipse(i*.3,0,7,15,.6,0,Math.PI*2);c.strokeStyle='#d6cde0';c.lineWidth=1.5;c.stroke();}
  c.restore();
  if(toy.mode==='stunned')for(let i=0;i<3;i++)flower(c,Math.cos(time*3+i*2.1)*24,-29+Math.sin(time*3+i*2.1)*5,.7,'#fff3ae');
  if(toy.mode==='windup'){c.font='bold 18px sans-serif';c.textAlign='center';c.fillStyle='#a65e4c';c.fillText('!',0,-32);}
  c.restore();
}
function keyIcon(c,x,y,scale=1) {
  c.save();c.translate(x,y);c.scale(scale,scale);
  c.strokeStyle='#b28b42';c.lineWidth=5;c.beginPath();c.arc(-7,-5,7,0,Math.PI*2);c.moveTo(-2,0);c.lineTo(13,15);c.lineTo(18,10);c.moveTo(8,10);c.lineTo(13,5);c.stroke();c.restore();
}
function goalArt(c,world,run,t) {
  const goal=ROOMS[world.room].goal;
  const label=(text,y=goal.y-62)=>{c.font='600 12px sans-serif';c.textAlign='center';rounded(c,goal.x-61,y-17,122,26,12,'#fffbeced');c.fillStyle='#6d765a';c.fillText(text,goal.x,y);};
  if(world.room==='meadow') {
    if(run.keyFound){line(c,[[goal.x-25,goal.y+8],[goal.x+26,goal.y+17]],'#bda475',7);line(c,[[goal.x+19,goal.y+8],[goal.x-15,goal.y+20]],'#d6b784',7);return;}
    ellipse(c,goal.x,goal.y+22,35,10,'#63763d20');rounded(c,goal.x-27,goal.y-25,54,49,5,'#d4b180','#a4875e');
    for(const dy of [-12,2,16])line(c,[[goal.x-25,goal.y+dy],[goal.x+25,goal.y+dy]],'#b3966b',1.5);
    line(c,[[goal.x-18,goal.y-21],[goal.x+18,goal.y+20]],'#edce98',7);keyIcon(c,goal.x,goal.y-39,.65);label('SPACE · break',goal.y-67);
  } else if(world.room==='pond') {
    ellipse(c,goal.x,goal.y+14,53,24,'#eee5bc');
    if(!run.pepperFound){corgi(c,goal.x-6,goal.y,'pepper',.9,-1,0);label('Pepper!',goal.y-89);}
    for(let i=-2;i<=2;i++)rounded(c,goal.x+i*22-3,goal.y-8,7,42,3,'#e7d8b4','#bbaa82');
    line(c,[[goal.x-53,goal.y+5],[goal.x+53,goal.y+5]],'#c9b790',5);
    if(!run.pepperFound){rounded(c,goal.x-8,goal.y+4,17,19,4,'#c5ac70','#a18b57');ellipse(c,goal.x,goal.y+12,2.3,3,'#877343');}
    else{heart(c,goal.x,goal.y-38,.9,'#c19a89');}
  } else if(!run.basketFound) {
    ellipse(c,goal.x,goal.y+19,30,9,'#61723d20');
    c.beginPath();c.ellipse(goal.x,goal.y-9,17,22,0,Math.PI,0);c.strokeStyle='#ad8756';c.lineWidth=6;c.stroke();
    rounded(c,goal.x-25,goal.y-8,50,34,7,'#d9b47b','#ac8b5e');
    for(let i=-1;i<=1;i++)line(c,[[goal.x-23,goal.y+3+i*8],[goal.x+23,goal.y+3+i*8]],'#bd9868',1);
    shape(c,[[goal.x-21,goal.y-8],[goal.x+21,goal.y-8],[goal.x+14,goal.y+7],[goal.x-5,goal.y+1]],'#e1a18e');label('Bring me home',goal.y-49);
  }
}
function heart(c,x,y,size,color){c.save();c.translate(x,y);c.scale(size,size);c.beginPath();c.moveTo(0,3);c.bezierCurveTo(-12,-4,-8,-12,0,-6);c.bezierCurveTo(8,-12,12,-4,0,3);c.fillStyle=color;c.fill();c.restore();}
export function camera(world,viewportWidth){return Math.max(0,Math.min(WIDTH-viewportWidth,world.player.x-viewportWidth/2));}
export function drawWorld(c,world,run,viewportWidth,reduced=false,preview=false) {
  const t=reduced?0:world.time,offset=preview?(WIDTH-viewportWidth)/2:camera(world,viewportWidth);
  c.clearRect(0,0,c.canvas.width,c.canvas.height);c.save();c.translate(-offset,0);c.drawImage(ground(world.room,run.seed),0,0);
  if(world.room==='pond') {
    const o=ROOMS.pond.obstacles[0];
    for(let i=0;i<3;i++){c.beginPath();c.ellipse(o.x-30+i*38,o.y-20+i*20,18+Math.sin(t+i)*3,4,0,0,Math.PI);c.strokeStyle='#dbebd4';c.lineWidth=2;c.stroke();}
    const dx=o.x+22+Math.sin(t*.4)*10,dy=o.y-10+Math.cos(t*.5)*6;
    ellipse(c,dx,dy+5,18,7,'#91bcb180');ellipse(c,dx,dy,13,9,'#fff1c8');ellipse(c,dx+10,dy-7,7,7,'#fff1c8');shape(c,[[dx+15,dy-8],[dx+22,dy-5],[dx+15,dy-4]],'#cda269');ellipse(c,dx+12,dy-9,1.2,1.2,'#655f48');
  }
  const ready=goalDone(run,world.room);
  if(ready){ellipse(c,915,320,31+Math.sin(t*3)*3,53,'#fff7cc90');for(let i=0;i<5;i++)flower(c,894+Math.sin(i*8)*24,278+i*21,.6,'#fff9db');}
  else {line(c,[[950,283],[950,354]],'#b9a077',7);line(c,[[930,287],[930,350]],'#c6b58a',6);line(c,[[927,305],[959,305]],'#c6b58a',5);}
  for(const item of world.items)if(!run.collected.includes(item.id))snack(c,item.x,item.y,item.kind,1,t);
  goalArt(c,world,run,t);
  const actors=[{y:world.player.y,draw:()=>{
    c.save();if(world.invincible>.3&&world.bump>0)c.globalAlpha=.6+Math.sin(t*40)*.2;
    corgi(c,world.player.x,world.player.y,'pepsi',.78,world.player.facing,reduced||preview?0:rollingPose(world.player,t,.78),world.bump);c.restore();
    if(world.dash>0)for(let i=0;i<4;i++)ellipse(c,world.player.x-world.player.vx*(36+i*12),world.player.y-world.player.vy*(36+i*12),6-i,4-i*.6,'#fff9dcb0');
  }},...world.toys.map(item=>({y:item.y,draw:()=>toy(c,item,t)}))];
  if(run.pepperFound)actors.push({y:world.buddy.y,draw:()=>corgi(c,world.buddy.x,world.buddy.y,'pepper',.72,world.buddy.facing,reduced||preview?0:rollingPose(world.buddy,t,.72))});
  actors.sort((a,b)=>a.y-b.y).forEach(item=>item.draw());
  for(const p of world.particles){c.globalAlpha=p.life/p.max;if(p.kind==='heart')heart(c,p.x,p.y,.55,'#c98779');else flower(c,p.x,p.y,.7,'#fff6cb');}c.globalAlpha=1;
  if(world.bump>0){c.fillStyle='#c8756220';c.fillRect(offset,0,viewportWidth,HEIGHT);}
  c.restore();return offset;
}
export function drawPicnic(c,run,viewportWidth,time,reduced=false){const t=reduced?0:time;const offset=(WIDTH-viewportWidth)/2;c.clearRect(0,0,c.canvas.width,c.canvas.height);c.save();c.translate(-offset,0);c.drawImage(ground('meadow',run.seed),0,0);const y=viewportWidth<700?135:185;
  ellipse(c,500,y+20,155,55,'#6c7c4a20');rounded(c,365,y-32,270,105,14,'#f1c6a7','#d7ad8e');c.save();c.beginPath();c.roundRect(366,y-31,268,103,13);c.clip();c.globalAlpha=.45;for(let i=0;i<9;i++){c.fillStyle='#fff4d5';c.fillRect(368+i*34,y-32,15,105);}for(let i=0;i<4;i++)c.fillRect(365,y-23+i*29,270,12);c.restore();
  corgi(c,440,y+6,'pepsi',1.1,1,0);corgi(c,565,y+6,'pepper',1.1,-1,0);snack(c,470,y+43,'biscuit',.8,t);snack(c,534,y+47,'berry',.8,t);snack(c,504,y+27,'cheese',.7,t);for(let i=0;i<3;i++)heart(c,470+i*33,y-98-Math.sin(t*2+i)*6,.7+i%2*.3,i%2?'#c69582':'#cdb17c');c.restore();}
