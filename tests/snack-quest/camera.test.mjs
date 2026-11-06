import test from 'node:test';
import assert from 'node:assert/strict';
import {mapFrame} from '../../games/snack-quest/art.mjs';
import {roomScale,WIDTH,HEIGHT,ORDER} from '../../games/snack-quest/engine.mjs';
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
