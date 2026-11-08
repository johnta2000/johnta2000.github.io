import test from 'node:test';import assert from 'node:assert/strict';
import {CHAD_ATTACKS,createRun,makeWorld,step,startDash,startAbility,upgradeRun,validRun,retryRoom} from '../../games/snack-quest/engine.mjs';
const idle={x:0,y:0};
function fixture(difficulty='spicy'){const r=createRun('chadtest',difficulty);r.tutorialStep=3;const w=makeWorld(r,'tutorial');w.items=[];w.invincible=0;Object.assign(w.player,{x:600,y:315});return{r,w};}
function enemy(kind,mode,timer){return{x:500,y:315,r:18,vx:0,vy:0,aimX:1,aimY:0,cooldown:9,kind,mode,timer,chad:true,attackChain:0};}
function ticks(w,r,n){const events=[];for(let i=0;i<n;i++)events.push(...step(w,r,idle,.02));return events;}
test('Chad goose warns after honking, bursts once, then disappears safely before returning',()=>{
 const{r,w}=fixture(),g=enemy('goose','honk',.01);w.toys=[g];let events=step(w,r,idle,.02);assert.equal(g.mode,'blast-windup');assert.ok(events.some(e=>e.type==='feather-warning'));assert.equal(r.health,3);assert.equal(g.timer,CHAD_ATTACKS.gooseWarning);
 events=ticks(w,r,56);assert.equal(events.filter(e=>e.type==='feather-burst').length,1);assert.equal(r.health,2);assert.equal(r.enemyBonks,0);assert.equal(g.mode,'blast');
 ticks(w,r,16);assert.equal(g.mode,'gone');Object.assign(w.player,{x:g.x,y:g.y});w.invincible=0;startDash(w);events=ticks(w,r,5);assert.equal(r.enemyBonks,0,'vanished geese cannot be bonked');assert.equal(r.health,2);
 ticks(w,r,160);assert.equal(g.mode,'rest');assert.equal(r.health,2,'respawn gives a safe rest before contact becomes dangerous');
});
test('Shield and dash protect against the blast; bonks and Belly Flop cancel its warning',()=>{
 for(const ability of ['bark','dash']){const{r,w}=fixture();r.pepperFound=r.keyFound=true;w.toys=[enemy('goose','blast-windup',.01)];ability==='dash'?startDash(w,{x:1,y:0}):startAbility(w,r,'bark');step(w,r,idle,.02);assert.equal(r.health,3,ability);}
 const{r,w}=fixture();w.toys=[enemy('goose','blast-windup',1)];Object.assign(w.player,{x:500,y:315});startDash(w);assert.ok(step(w,r,idle,.02).some(e=>e.type==='bonk'));assert.equal(w.toys[0].mode,'stunned');assert.equal(ticks(w,r,56).some(e=>e.type==='feather-burst'),false);
 const f=fixture();Object.assign(f.r,{keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,health:4});for(const k of ['player','buddy','pee','pepperoni'])Object.assign(f.w[k],{x:600,y:315});for(const k of ['followTrail','peeTrail','pepperoniTrail'])f.w[k]=[{x:600,y:315}];f.w.toys=[enemy('goose','blast-windup',1)];startAbility(f.w,f.r,'power');ticks(f.w,f.r,17);assert.equal(f.w.toys[0].mode,'stunned');assert.equal(f.r.enemyBonks,1);
});
test('Chad vacuums warn before a spinning chase, then rest; dashing interrupts the spin',()=>{
 const{r,w}=fixture(),v=enemy('vacuum','charge',.01);w.toys=[v];let events=step(w,r,idle,.02);assert.equal(v.mode,'spin-windup');assert.ok(events.some(e=>e.type==='vacuum-warning'));assert.equal(r.health,3);
 ticks(w,r,43);assert.equal(v.mode,'spin');Object.assign(w.player,{x:v.x+80,y:v.y});w.invincible=0;events=step(w,r,idle,.02);assert.equal(r.health,2,'spin reaches farther than body contact');assert.ok(events.some(e=>e.type==='hit'));ticks(w,r,55);assert.equal(v.mode,'rest');
 const f=fixture();f.w.toys=[enemy('vacuum','spin',1)];Object.assign(f.w.player,{x:500,y:315});startDash(f.w);step(f.w,f.r,idle,.02);assert.equal(f.w.toys[0].mode,'stunned');assert.equal(f.r.health,3);
});
test('Chad cats re-aim once with a warning, lock their second pounce, and then rest',()=>{
 const{r,w}=fixture(),cat=enemy('cat','charge',.01);w.toys=[cat];const events=step(w,r,idle,.02);assert.equal(cat.mode,'windup');assert.equal(cat.attackChain,1);assert.equal(cat.timer,CHAD_ATTACKS.catWarning);assert.ok(events.some(e=>e.type==='cat-warning'));
 const aim={x:cat.aimX,y:cat.aimY};w.player.y=450;ticks(w,r,28);assert.equal(cat.mode,'charge');assert.equal(cat.aimX,aim.x);assert.equal(cat.aimY,aim.y);const second=ticks(w,r,22);assert.equal(cat.mode,'rest');assert.equal(second.some(e=>e.type==='cat-warning'),false,'no endless pounce chain');
 const f=fixture();f.w.toys=[enemy('cat','windup',.55)];f.w.toys[0].attackChain=1;Object.assign(f.w.player,{x:500,y:315});startDash(f.w);step(f.w,f.r,idle,.02);assert.equal(f.w.toys[0].mode,'stunned');
});
test('Jessi mode and Normal retain their original goose, vacuum and cat sequences',()=>{
 for(const d of ['cozy','normal'])for(const kind of ['goose','vacuum','cat']){const{r,w}=fixture(d),e=enemy(kind,kind==='goose'?'honk':'charge',.01);w.toys=[e];const events=step(w,r,idle,.02);assert.equal(events.some(e=>['feather-warning','vacuum-warning','cat-warning'].includes(e.type)),false);assert.equal(e.mode,kind==='vacuum'?'roam':'rest');}
});
test('hard-move introductions upgrade old saves and persist without altering progress',()=>{
 const r=createRun('hardguide','spicy');delete r.seenHardMoves;r.seenEnemies=['vacuum','cat','goose'];r.health=2;assert.ok(validRun(r,r.id));upgradeRun(r);assert.deepEqual(r.seenHardMoves,[]);r.seenHardMoves=['vacuum','cat'];retryRoom(r,'meadow');assert.deepEqual(r.seenHardMoves,['vacuum','cat']);assert.ok(validRun(JSON.parse(JSON.stringify(r)),r.id));
 for(const bad of [['boss'],['goose','goose'],null,'cat']){r.seenHardMoves=bad;assert.equal(validRun(r,r.id),false);}
});
