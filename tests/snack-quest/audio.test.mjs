import test from 'node:test';
import assert from 'node:assert/strict';
import {Soundscape} from '../../games/snack-quest/audio.mjs';
function fixture(state='suspended'){
 let resumes=0,created=0;
 const score=new Soundscape(()=>{created++;return {state,currentTime:0,destination:{},createGain:()=>({gain:{value:0},connect(){}}),resume(){resumes++;this.state='running';return Promise.resolve();}};});
 return {score,get resumes(){return resumes;},get created(){return created;}};
}
test('sound remains opt-in and recovers suspended and iOS interrupted audio',async()=>{
 for(const state of ['suspended','interrupted']){
  const f=fixture(state);await f.score.unlock();assert.equal(f.created,0);
  f.score.setEnabled(true);await f.score.unlock();assert.equal(f.resumes,1);assert.equal(f.score.ready,true);
  f.score.context.state='interrupted';await f.score.unlock();assert.equal(f.resumes,2);assert.equal(f.created,1);
  f.score.setForeground(false);await f.score.unlock();assert.equal(f.score.ready,false);assert.equal(f.resumes,2);
  f.score.setForeground(true);await f.score.unlock();assert.equal(f.score.ready,true);
  f.score.setEnabled(false);assert.equal(f.score.ready,false);
 }
});
test('closed audio contexts are replaced on the next gesture',async()=>{
 const f=fixture('running');f.score.setEnabled(true);f.score.unlock();f.score.context.state='closed';f.score.unlock();assert.equal(f.created,2);assert.equal(f.score.ready,true);
});
test('supported audio sessions request playback only while enabled in the foreground',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');const audioSession={type:'auto'};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{audioSession}});
 try{
  const f=fixture('running');f.score.unlock();assert.equal(audioSession.type,'auto');
  f.score.setEnabled(true);f.score.unlock();assert.equal(audioSession.type,'playback');
  f.score.setForeground(false);assert.equal(audioSession.type,'auto');
  f.score.setForeground(true);f.score.unlock();assert.equal(audioSession.type,'playback');
  f.score.setEnabled(false);assert.equal(audioSession.type,'auto');
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
