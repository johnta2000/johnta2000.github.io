import test from 'node:test';import assert from 'node:assert/strict';
import {createRun,makeWorld,startAbility,startDash,step,walkable,upgradeRun,validRun} from '../../games/snack-quest/engine.mjs';
const idle={x:0,y:0};
function fixture(x=430){const r=createRun('floptest');Object.assign(r,{keyFound:true,pepperFound:true,peeFound:true,pepperoniFound:true,health:4,tutorialStep:3});const w=makeWorld(r,'tutorial');for(const k of ['player','buddy','pee','pepperoni'])Object.assign(w[k],{x,y:315});for(const k of ['followTrail','peeTrail','pepperoniTrail'])w[k]=[{x,y:315}];w.items=[];w.invincible=100;return {r,w};}
function enemy(x,y=315){return{x,y,r:18,vx:0,vy:0,kind:'cat',mode:'roam',timer:0,cooldown:9};}
function land(w,r){let events=[];for(let i=0;i<17;i++)events.push(...step(w,r,idle,.02));return events;}
test('flop lands once after its hop, clears nearby enemies, leaves distant/hidden enemies alone',()=>{
 const{r,w}=fixture();const near=enemy(480),far=enemy(650),hidden={...enemy(450),r:22,kind:'gopher',mode:'hidden',timer:9};w.toys=[near,far];w.gophers=[hidden];
 assert.ok(startAbility(w,r,'power'));step(w,r,idle,.02);assert.equal(near.mode,'roam');assert.equal(r.enemyBonks,0);
 const events=land(w,r);assert.equal(near.mode,'stunned');assert.ok(near.x>530);assert.equal(far.mode,'roam');assert.equal(hidden.mode,'hidden');assert.equal(r.enemyBonks,1);assert.equal(events.filter(e=>e.type==='flop').length,1);
 land(w,r);assert.equal(r.enemyBonks,1);assert.equal(startAbility(w,r,'power'),false);assert.equal(w.cooldown,0);assert.ok(startDash(w));
 for(let i=0;i<110;i++)step(w,r,idle,.02);assert.notEqual(near.mode,'stunned');assert.ok(w.abilityCooldowns.power>8);
});
test('knockback stops at the room boundary instead of pushing enemies through it',()=>{
 const{r,w}=fixture(870),target=enemy(920);w.toys=[target];startAbility(w,r,'power');land(w,r);assert.ok(walkable(target.x,target.y,'tutorial',target.r));assert.ok(target.x<=927);assert.equal(target.mode,'stunned');
});
test('flop works while dash is recharging and retains an independent saved cooldown',()=>{
 const{r,w}=fixture();startDash(w);assert.ok(startAbility(w,r,'power'));assert.equal(w.cooldown,2.8);assert.equal(r.cooldowns.power,12);assert.equal(w.powerDash,false);
 const saved=JSON.parse(JSON.stringify(r));assert.ok(validRun(saved,r.id));const restored=makeWorld(saved,'tutorial');assert.equal(startAbility(restored,saved,'power'),false);
 delete saved.pendingAbility;saved.cooldowns.power=8;upgradeRun(saved);assert.ok(validRun(saved,r.id),'old Power Dash cooldowns remain valid');assert.equal(saved.cooldowns.power,8);
});
test('boss interruption grants a short escape without armor damage or repeated recovery extensions',()=>{
 const{r,w}=fixture();w.room='boss';w.boss=r.bossState={x:460,y:315,r:44,hp:8,mode:'charge',timer:1,aimX:1,aimY:0,cycle:0};
 startAbility(w,r,'power');const events=land(w,r);assert.equal(w.boss.mode,'recover');assert.equal(w.boss.hp,8);assert.equal(r.enemyBonks,0);assert.ok(events.some(e=>e.type==='boss-interrupt'));assert.ok(w.boss.timer>1.3);
 step(w,r,idle,.02);assert.ok(w.boss.timer<1.4);assert.equal(startAbility(w,r,'power'),false);
});
