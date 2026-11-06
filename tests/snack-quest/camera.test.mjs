import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraY} from '../../games/snack-quest/art.mjs';
import {roomScale,HEIGHT,ORDER} from '../../games/snack-quest/engine.mjs';
test('mobile camera keeps north/south travel visible and never scrolls beyond the map',()=>{
 for(const room of ['tutorial',...ORDER])for(const height of [260,460,HEIGHT]){
  let previous=-1;
  for(let y=55;y<=565;y+=5){
   const world={room,player:{x:500,y:y*roomScale(room)}},offset=cameraY(world,height),screenY=y-offset;
   assert.ok(offset>=0&&offset<=HEIGHT-height);assert.ok(offset>=previous);assert.ok(screenY>=0&&screenY<=height);previous=offset;
   assert.equal(cameraY(world),0,'desktop full-height overview stays fixed');
  }
 }
});
