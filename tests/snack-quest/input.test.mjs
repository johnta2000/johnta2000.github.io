import test from 'node:test';
import assert from 'node:assert/strict';
import { movementKey, abilityKey, isTextEntry, joystickVector } from '../../games/snack-quest/input.mjs';

test('all physical WASD keys work even when the reported character differs',()=>{
  for(const [code,expected] of [['KeyW','w'],['KeyA','a'],['KeyS','s'],['KeyD','d']]) {
    assert.equal(movementKey({code,key:'Unidentified'}),expected);
    assert.equal(movementKey({code,key:'ư'}),expected);
  }
});
test('character fallback supports uppercase and does not enable arrow movement',()=>{
  assert.equal(movementKey({key:'W'}),'w');
  assert.equal(movementKey({key:'d'}),'d');
  assert.equal(movementKey({code:'ArrowRight',key:'ArrowRight'}),null);
});
test('older embedded key events can use their numeric key code',()=>{
  for(const [keyCode,expected] of [[87,'w'],[65,'a'],[83,'s'],[68,'d']])
    assert.equal(movementKey({key:'Unidentified',code:'',keyCode}),expected);
  assert.equal(movementKey({which:68}),'d');
  assert.equal(movementKey({keyCode:39}),null);
});
test('only actual editable fields block game input',()=>{
  assert.equal(isTextEntry({isContentEditable:false,closest:()=>null}),false);
  assert.equal(isTextEntry({isContentEditable:true,closest:()=>null}),true);
  assert.equal(isTextEntry({isContentEditable:false,closest:()=>({tagName:'INPUT'})}),true);
  assert.equal(isTextEntry(null),false);
});
test('ability keys support physical, text-only, uppercase, and embedded input without changing movement',()=>{
  for(const [letter,ability,keyCode] of [['Q','bark',81],['E','stink',69],['R','power',82]]) {
    assert.equal(abilityKey({code:'Key'+letter,key:'Unidentified'}),ability);
    assert.equal(abilityKey({key:letter}),ability);assert.equal(abilityKey({key:letter.toLowerCase()}),ability);
    assert.equal(abilityKey({keyCode}),ability);assert.equal(movementKey({key:letter}),null);
  }
  assert.equal(abilityKey({key:'w'}),null);assert.equal(abilityKey({key:' '}),null);
});
test('the joystick has a quiet center and bounded movement in every direction',()=>{
  assert.deepEqual(joystickVector(3,4),{x:0,y:0});assert.deepEqual(joystickVector(0,0),{x:0,y:0});
  assert.deepEqual(joystickVector(8,0),{x:0,y:0});
  assert.deepEqual(joystickVector(24,0),{x:.5,y:0},'half tilt ramps smoothly beyond the dead zone');
  for(const [dx,dy] of [[100,0],[-100,0],[0,-100],[0,100],[100,100],[-100,-100]]) {
    const vector=joystickVector(dx,dy);assert.ok(Math.abs(Math.hypot(vector.x,vector.y)-1)<1e-10);
    assert.equal(Math.sign(vector.x),Math.sign(dx));assert.equal(Math.sign(vector.y),Math.sign(dy));
  }
  assert.deepEqual(joystickVector(NaN,5),{x:0,y:0});assert.deepEqual(joystickVector(20,0,0),{x:0,y:0});
});
