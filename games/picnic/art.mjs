const TAU = Math.PI * 2;
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
function line(c,points,color,width=2){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();}
function shape(c,draw,color,stroke,width=1.5){c.beginPath();draw(c);c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.lineJoin='round';c.stroke();}}
function round(c,x,y,w,h,r,color){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}

export function drawCorgi(c,x,y,size,pepper=false,happy=false,time=0,reduced=false){
  c.save();c.translate(x,y);c.scale(size/140,size/140);
  const wiggle=happy&&!reduced?Math.sin(time*24)*.06:0;
  c.rotate(wiggle);
  // Plushie reference colors: golden-tan Pepsi and warm-gray Pepper, both with white markings.
  const fur=pepper?'#b1abaa':'#d9af77';const shadow=pepper?'#918987':'#bb925e';const cream='#fcfaf6';const ink='#383431';
  const innerEar=pepper?'#e7e3e3':'#eee9e5';const pawShade=pepper?'#e8e3e0':'#eee6d9';
  ellipse(c,0,4,64,10,'#68744f20');
  // A little loaf body, with stitched plush seams and stubby paws.
  ellipse(c,0,-36,55,43,fur);ellipse(c,0,-28,34,30,cream);
  ellipse(c,-40,-3,22,12,cream);ellipse(c,40,-3,22,12,cream);
  ellipse(c,-39,-2,12,6,pawShade);ellipse(c,39,-2,12,6,pawShade);
  c.save();c.setLineDash([2,4]);c.strokeStyle=shadow;c.lineWidth=1.1;c.beginPath();c.ellipse(0,-35,47,34,0,0,Math.PI);c.stroke();c.restore();
  // Broad, upright ears and a softly squared corgi head.
  shape(c,p=>{p.moveTo(-52,-83);p.quadraticCurveTo(-72,-150,-51,-143);p.quadraticCurveTo(-25,-132,-22,-106);p.closePath();},fur,shadow);
  shape(c,p=>{p.moveTo(52,-83);p.quadraticCurveTo(72,-150,51,-143);p.quadraticCurveTo(25,-132,22,-106);p.closePath();},fur,shadow);
  shape(c,p=>{p.moveTo(-49,-105);p.lineTo(-54,-133);p.quadraticCurveTo(-37,-126,-32,-109);},innerEar);
  shape(c,p=>{p.moveTo(49,-105);p.lineTo(54,-133);p.quadraticCurveTo(37,-126,32,-109);},innerEar);
  shape(c,p=>{p.moveTo(-59,-84);p.bezierCurveTo(-63,-112,-36,-123,0,-119);p.bezierCurveTo(36,-123,63,-112,59,-84);p.lineTo(55,-61);p.quadraticCurveTo(47,-40,0,-41);p.quadraticCurveTo(-47,-40,-55,-61);p.closePath();},fur,shadow,1.3);
  // White blaze, fluffy cheeks, and embroidered button eyes.
  shape(c,p=>{p.moveTo(-5,-118);p.quadraticCurveTo(-8,-96,-22,-82);p.bezierCurveTo(-52,-83,-58,-61,-36,-51);p.quadraticCurveTo(0,-32,36,-51);p.bezierCurveTo(58,-61,52,-83,22,-82);p.quadraticCurveTo(8,-96,5,-118);p.closePath();},cream);
  const blink=!reduced&&Math.sin(time*.9+(pepper?1.5:0))>.997;
  if(happy||blink){
    [-29,29].forEach(ex=>{c.strokeStyle=ink;c.lineWidth=3.4;c.lineCap='round';c.beginPath();c.arc(ex,-84,5.3,Math.PI+.2,TAU-.2);c.stroke();});
  }else{
    [-29,29].forEach(ex=>{ellipse(c,ex,-85,4.1,5,ink);ellipse(c,ex-1.2,-86.8,1.2,1.5,'#fff9ed');});
  }
  ellipse(c,-44,-71,9,4.8,'#e5a79a');ellipse(c,44,-71,9,4.8,'#e5a79a');
  shape(c,p=>{p.moveTo(-7,-75);p.quadraticCurveTo(0,-79,7,-75);p.quadraticCurveTo(6,-69,0,-67);p.quadraticCurveTo(-6,-69,-7,-75);},ink);
  c.strokeStyle=ink;c.lineWidth=2;c.lineCap='round';c.beginPath();c.moveTo(0,-68);c.lineTo(0,-63);c.quadraticCurveTo(-6,-56,-11,-62);c.moveTo(0,-63);c.quadraticCurveTo(6,-56,11,-62);c.stroke();
  if(happy){shape(c,p=>{p.moveTo(-5,-60);p.lineTo(5,-60);p.quadraticCurveTo(6,-48,0,-49);p.quadraticCurveTo(-6,-48,-5,-60);},'#de9385');}
  const scarf=pepper?'#c97c71':'#8fa789';
  shape(c,p=>{p.moveTo(-29,-43);p.quadraticCurveTo(0,-33,29,-43);p.lineTo(15,-23);p.lineTo(0,-15);p.lineTo(-15,-23);p.closePath();},scarf);
  ellipse(c,0,-30,3.2,3.2,'#f9efd5');
  // One sewn cheek seam gives the characters their plushie feel.
  c.save();c.setLineDash([2,4]);c.strokeStyle=shadow;c.lineWidth=1;c.beginPath();c.moveTo(48,-98);c.quadraticCurveTo(58,-77,46,-65);c.stroke();c.restore();
  if(happy){drawHeart(c,-68,-126,8,'#cd857c');drawHeart(c,67,-138,6,'#d7998a');}
  c.restore();
}

export function drawHeart(c,x,y,size,color){c.save();c.translate(x,y);c.scale(size/10,size/10);shape(c,p=>{p.moveTo(0,8);p.bezierCurveTo(-20,-4,-7,-16,0,-7);p.bezierCurveTo(7,-16,20,-4,0,8);},color);c.restore();}

export function drawTreat(c,type,x,y,size,rotation=0){
  c.save();c.translate(x,y);c.rotate(rotation);c.scale(size/32,size/32);
  if(type==='strawberry'){
    shape(c,p=>{p.moveTo(-14,-7);p.bezierCurveTo(-20,3,-8,21,0,22);p.bezierCurveTo(8,21,20,3,14,-7);p.quadraticCurveTo(0,-17,-14,-7);},'#d77d74','#b75b55',1.4);
    shape(c,p=>{p.moveTo(0,-9);p.lineTo(-13,-14);p.lineTo(-8,-5);p.lineTo(-2,-8);p.lineTo(3,-2);p.lineTo(6,-9);p.lineTo(14,-12);p.lineTo(4,-14);p.lineTo(1,-20);p.closePath();},'#789264');
    [[-8,-1],[5,-1],[-3,6],[8,7],[0,15],[-10,8]].forEach(([sx,sy])=>ellipse(c,sx,sy,1,1.8,'#ffe5b1'));
  }else if(type==='biscuit'){
    ellipse(c,0,1,17,16,'#b68a4f');ellipse(c,0,-1,17,16,'#e0b978');
    c.save();c.setLineDash([1,4]);c.strokeStyle='#bb914f';c.lineWidth=1.3;c.beginPath();c.arc(0,-1,12,0,TAU);c.stroke();c.restore();
    [[-5,-5],[5,-6],[0,2],[-6,6],[7,5]].forEach(([sx,sy])=>ellipse(c,sx,sy,1.5,1.5,'#a87b43'));
  }else{
    ellipse(c,0,2,17,16,'#df9f53');ellipse(c,-1,0,16,16,'#efb969');
    shape(c,p=>{p.moveTo(0,-12);p.quadraticCurveTo(2,-28,14,-21);p.quadraticCurveTo(13,-12,0,-12);},'#81956a');
    line(c,[[0,-12],[-2,-19]],'#8a7f4f',2);ellipse(c,-7,-5,3,5,'#f6cf8a');
  }
  c.restore();
}

function flower(c,x,y,size,rose=false){
  line(c,[[x,y+size*2],[x,y]],'#8d9e6a',1.2);
  for(let n=0;n<5;n++){const a=n*TAU/5;ellipse(c,x+Math.cos(a)*size*.7,y+Math.sin(a)*size*.7,size*.48,size*.48,rose?'#e8b3a0':'#fffdf0');}
  ellipse(c,x,y,size*.34,size*.34,'#d8b95d');
}

export function drawMeadow(c,w,h,time=0,reduced=false){
  c.fillStyle='#ecf1dc';c.fillRect(0,0,w,h);
  // A quiet sky, paper-cut clouds, and rolling sage green hills.
  const sunX=w*.86,sunY=h*.16,sunR=Math.min(34,w*.068);
  ellipse(c,sunX,sunY,sunR+9,sunR+9,'#e8dfad45');ellipse(c,sunX,sunY,sunR,sunR,'#e9d99c');
  for(let i=0;i<10;i++){const a=i*TAU/10;line(c,[[sunX+Math.cos(a)*(sunR+14),sunY+Math.sin(a)*(sunR+14)],[sunX+Math.cos(a)*(sunR+19),sunY+Math.sin(a)*(sunR+19)]],'#ddcf964f',2);}
  const drift=reduced?0:Math.sin(time*.13)*8;
  [[.13,.2,1],[.73,.35,.7],[.37,.12,.55]].forEach(([x,y,scale])=>{
    c.save();c.translate(x*w+drift,y*h);c.scale(scale,scale);ellipse(c,0,0,42,12,'#fafbecb3');ellipse(c,-13,-9,22,14,'#fafbecb3');ellipse(c,12,-10,22,17,'#fafbecb3');c.restore();
  });
  shape(c,p=>{p.moveTo(0,h*.63);p.bezierCurveTo(w*.17,h*.4,w*.33,h*.55,w*.53,h*.68);p.bezierCurveTo(w*.7,h*.8,w*.84,h*.42,w,h*.57);p.lineTo(w,h);p.lineTo(0,h);},'#dce5c2');
  shape(c,p=>{p.moveTo(0,h*.76);p.bezierCurveTo(w*.24,h*.51,w*.49,h*.78,w*.7,h*.71);p.quadraticCurveTo(w*.89,h*.65,w,h*.72);p.lineTo(w,h);p.lineTo(0,h);},'#ccdbae');
  shape(c,p=>{p.moveTo(0,h*.93);p.quadraticCurveTo(w*.4,h*.77,w,h*.91);p.lineTo(w,h);p.lineTo(0,h);},'#c3d39f');
  // Deterministic speckles keep the art quiet rather than shimmering each frame.
  c.fillStyle='#79915e16';
  for(let i=0;i<95;i++){const x=((i*137.21)%997)/997*w;const y=h*(.66+((i*73.4)%100)/300);c.fillRect(x,y,1.2,1.2);}
  [[.055,.85,5],[.105,.7,4],[.17,.94,4],[.9,.83,5],[.94,.68,4],[.8,.94,4],[.28,.77,3],[.7,.72,3]].forEach(([x,y,size],i)=>flower(c,x*w,y*h,size,i%3===0));
  [[.025,.72],[.22,.9],[.96,.94],[.8,.76],[.6,.97],[.37,.95]].forEach(([x,y])=>{line(c,[[w*x-4,h*y],[w*x-5,h*y-6],[w*x,h*y],[w*x+3,h*y-8],[w*x+5,h*y-2]],'#a1b782',1.3);});
  // Tiny butterfly near the far edge of the meadow.
  const by=h*.53+(reduced?0:Math.sin(time*1.2)*5);
  ellipse(c,w*.08-3,by,4,6,'#e1b691');ellipse(c,w*.08+3,by,4,6,'#e9c8a2');line(c,[[w*.08,by-3],[w*.08,by+4]],'#b2a57b',1);
}

export function drawBlanket(c,x,y,width,height){
  c.save();c.translate(x,y);
  ellipse(c,0,height*.6,width*.55,10,'#67784c17');
  c.beginPath();c.roundRect(-width/2,-height/2,width,height,8);c.save();c.clip();
  c.fillStyle='#faf0da';c.fillRect(-width/2,-height/2,width,height);
  const cell=width/12;c.fillStyle='#cf8e8047';
  for(let i=0;i<12;i+=2)c.fillRect(-width/2+i*cell,-height/2,cell,height);
  for(let i=0;i<height/cell;i+=2)c.fillRect(-width/2,-height/2+i*cell,width,cell);
  c.restore();
  c.strokeStyle='#c17f7066';c.lineWidth=1;c.stroke();
  for(let i=0;i<12;i++)line(c,[[-width/2+8+i*(width-16)/11,height/2-1],[-width/2+8+i*(width-16)/11,height/2+4]],'#d6ab91',1.3);
  c.restore();
}

export function drawPicnic(c,w,h,completed,time,reduced,party=false){
  const small=w<600;const cx=w/2;const base=h*.85;const bw=Math.min(w*.68,340);const size=small?106:130;
  drawBlanket(c,cx,base-5,bw,small?64:74);
  const apart=small?78:112;
  drawCorgi(c,cx-apart,base-17,size,false,party,time,reduced);
  drawCorgi(c,cx+apart,base-17,size,true,party,time+.1,reduced);
  // The basket between the plushies fills up throughout the five levels.
  const bx=cx,by=base-12;
  c.strokeStyle='#b39263';c.lineWidth=4;c.beginPath();c.ellipse(bx,by-10,22,24,0,Math.PI,TAU);c.stroke();
  round(c,bx-28,by-10,56,34,6,'#c8a777');
  for(let i=0;i<5;i++)line(c,[[bx-25,by-4+i*6],[bx+25,by-4+i*6]],'#b39466',1);
  for(let i=0;i<6;i++)line(c,[[bx-23+i*9,by-7],[bx-23+i*9,by+21]],'#dec192',1.5);
  shape(c,p=>{p.moveTo(bx-29,by-11);p.lineTo(bx+29,by-11);p.lineTo(bx+24,by+1);p.lineTo(bx+11,by-4);p.lineTo(bx,by+4);p.lineTo(bx-13,by-4);p.lineTo(bx-26,by+1);},'#f7ead3');
  const count=party?5:completed;
  for(let i=0;i<count;i++)drawTreat(c,['strawberry','biscuit','orange'][i%3],bx-17+(i%3)*17,by-16-Math.floor(i/3)*12,13,(i%2?1:-1)*.2);
  if(count>=2){ellipse(c,cx-bw*.32,base+14,22,7,'#fbf3dd');drawTreat(c,'strawberry',cx-bw*.32-7,base+7,13,-.2);drawTreat(c,'biscuit',cx-bw*.32+8,base+8,11,.2);}
  if(count>=4){round(c,cx+bw*.33-10,base-3,20,24,5,'#f1dbc0');ellipse(c,cx+bw*.33,base-3,10,4,'#f8ead1');line(c,[[cx+bw*.33+2,base-3],[cx+bw*.33+7,base-22]],'#8a9c77',2);}
  if(party){for(let i=0;i<6;i++){const x=w*(.15+i*.14);const y=h*(.35+Math.sin(i*2)*.11);drawHeart(c,x,y+(reduced?0:Math.sin(time+i)*3),i%2?5:7,i%2?'#dfb183':'#d8a093');}}
}

export function drawBasket(c,w,h,run,basketWidth,time,happy,reduced){
  const x=run.basket*w;const y=h*.82;const bw=basketWidth*w;const size=Math.min(77,w*.15);
  drawBlanket(c,x,y,bw,Math.max(33,bw*.24));
  drawCorgi(c,x-bw*.38,y+17,size,false,happy,time,reduced);
  drawCorgi(c,x+bw*.38,y+17,size,true,happy,time+.15,reduced);
  // A stitched rim is the actual catch line; the whole blanket catches treats.
  line(c,[[x-bw*.48,h*.77+4],[x+bw*.48,h*.77+4]],'#b9746880',2);
  c.font='italic 11px Georgia';c.textAlign='center';c.fillStyle='#657950';
  c.fillText('Pepsi',x-bw*.38,y+34);c.fillText('Pepper',x+bw*.38,y+34);
}
