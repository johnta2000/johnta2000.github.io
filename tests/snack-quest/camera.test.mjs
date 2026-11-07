import test from 'node:test';
import assert from 'node:assert/strict';
import {mapFrame} from '../../games/snack-quest/art.mjs';
import {setMapStretch,roomWidth,roomScale,WIDTH,HEIGHT,ORDER} from '../../games/snack-quest/engine.mjs?v=39';
test('whole-map framing fits every room inside phone and tablet safe areas without distortion',()=>{
 for(const room of ['tutorial',...ORDER])for(const [width,height] of [[844,390],[667,220],[932,430],[1024,768]]){
  const insets={left:44,right:44,top:64,bottom:49},frame=mapFrame(room,width,height,insets),scale=roomScale(room);
  assert.ok(frame.x>=insets.left&&frame.y>=insets.top);
  assert.ok(frame.x+frame.width<=width-insets.right+.001);assert.ok(frame.y+frame.height<=height-insets.bottom+.001);
  assert.equal(frame.width,WIDTH*scale*frame.zoom);assert.equal(frame.height,HEIGHT*scale*frame.zoom);
  assert.ok(Math.abs(frame.width/frame.height-WIDTH/HEIGHT)<.0001,'corgis and circles keep their proportions');
  assert.ok(Math.abs(frame.width-(width-88))<.001||Math.abs(frame.height-(height-113))<.001,'use the largest uniform zoom that fits');
 }
});


test('reshaping phone maps fills the usable width and height with a uniform camera scale',()=>{
 try{for(const [width,height] of [[844,390],[667,220],[932,430],[1024,768]]){
  const insets={left:6,right:6,top:48,bottom:28},w=width-12,h=height-76;
  setMapStretch((w/h)/(WIDTH/HEIGHT));
  for(const room of ['meadow','woods','boss']){
   const frame=mapFrame(room,width,height,insets);assert.ok(Math.abs(frame.width-w)<.1,'no dead side gutters');
   if(w/h>=WIDTH/HEIGHT)assert.ok(Math.abs(frame.height-h)<.1,'phone field also fills the height');
   assert.equal(frame.width,roomWidth(room)*frame.zoom);
  }
 }}finally{setMapStretch(1);}
});
