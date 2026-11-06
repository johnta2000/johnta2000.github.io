import test from 'node:test';
import assert from 'node:assert/strict';
import { movementKey, isTextEntry } from '../../games/snack-quest/input.mjs';

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
test('only actual editable fields block game input',()=>{
  assert.equal(isTextEntry({isContentEditable:false,closest:()=>null}),false);
  assert.equal(isTextEntry({isContentEditable:true,closest:()=>null}),true);
  assert.equal(isTextEntry({isContentEditable:false,closest:()=>({tagName:'INPUT'})}),true);
  assert.equal(isTextEntry(null),false);
});
