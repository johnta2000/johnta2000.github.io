import test from 'node:test';
import assert from 'node:assert/strict';
import { movementKey, abilityKey, isTextEntry } from '../../games/snack-quest/input.mjs';

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
