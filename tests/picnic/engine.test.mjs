import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,HAZARDS,advance,createRun,blankSave,parseSave,readRoute,validRun,configFor,effectiveWidth,isLevelOpen,crewFor,collectGolden,finishRun} from '../../games/picnic/engine.mjs';
import {chooseTarget,seeded} from './bot.mjs';
const drop=(type,x=.5,id=1)=>({id,type,x,baseX:x,y:.769,rotation:0});
function playing(level=1){const run=createRun(level);run.status='playing';run.spawnIn=10;return run;}
function play(level,width,seed){const run=playing(level);run.spawnIn=.45;const random=seeded(seed);for(let tick=0;tick<2500&&run.status==='playing';tick++){run.target=chooseTarget(run,LEVELS[level-1],effectiveWidth(run,width));advance(run,.02,width,random);}return run;}

test('all ten levels are winnable at desktop and phone widths; late levels require dodging',()=>{
  for(let level=1;level<=10;level++)for(const width of [.18,.30]){
    const runs=Array.from({length:20},(_,i)=>play(level,width,i+1));
    assert.ok(runs.filter(run=>run.status==='won').length>=12,`Level ${level}, width ${width}: enough viable rounds`);
    assert.ok(runs.some(run=>run.dodged>0));
    for(const run of runs){assert.ok(validRun(run,level));if(run.status==='won')assert.ok(run.caught>=LEVELS[level-1].goal);}
  }
});
test('speed, frequency, and targets increase at every level; a passive blanket cannot clear the adventure',()=>{
  assert.equal(LEVELS.length,10);
  for(let i=1;i<LEVELS.length;i++){assert.ok(LEVELS[i].fall<LEVELS[i-1].fall);assert.ok(LEVELS[i].interval<LEVELS[i-1].interval);assert.ok(LEVELS[i].goal>LEVELS[i-1].goal);}
  for(let level=2;level<=10;level++){const run=playing(level);run.spawnIn=.45;for(let t=0;t<2500&&run.status==='playing';t++)advance(run,.02,.3,()=>.5);assert.equal(run.status,'lost',`Catching everything at level ${level} has consequences`);assert.equal(run.hearts,0);}
});
test('every hazard costs a heart and applies its distinct setback',()=>{
  for(const type of HAZARDS){const run=playing(5);run.caught=6;run.counts.biscuit=6;run.drops=[drop(type)];const events=advance(run,.05,.3);assert.equal(run.hearts,2);assert.equal(run.hits,1);assert.equal(events.hits[0].type,type);assert.equal(events.caught.length,0);
    if(type==='sock')assert.equal(run.caught,4);if(type==='mud')assert.equal(run.mudUntil,run.elapsed+3);if(type==='vacuum')assert.equal(effectiveWidth(run,.3),.3*.72);
    run.status='paused';const frozen=structuredClone(run);advance(run,30,.3);assert.deepEqual(run,frozen,'Pausing freezes setbacks');
  }
  const muddy=playing(5),normal=playing(5);muddy.mudUntil=3;muddy.target=normal.target=.9;advance(muddy,.05,.3);advance(normal,.05,.3);assert.ok(muddy.basket<normal.basket);
});
test('overlapping hazards cannot drain several hearts in one moment; three distinct hits end a round',()=>{
  const run=playing();run.drops=[drop('sock',.5,1),drop('sock',.5,2)];advance(run,.05,.3);assert.equal(run.hearts,2);assert.equal(run.caught,0);
  for(let hit=0;hit<2;hit++){run.elapsed+=1;run.drops=[drop('sock')];advance(run,.05,.3);}
  assert.equal(run.status,'lost');assert.equal(run.hearts,0);assert.equal(run.hits,3);
});
test('avoided hazards and missed food do not cost hearts, but an unmet goal times out',()=>{
  const run=playing();run.drops=[{...drop('sock',.9),y:1.05},{...drop('biscuit',.9),y:1.05}];advance(run,.05,.3);assert.equal(run.dodged,1);assert.equal(run.missed,1);assert.equal(run.hearts,3);
  run.elapsed=29.99;advance(run,.05,.3);assert.equal(run.status,'lost');assert.equal(run.elapsed,30);
});
test('catching uses crossing of the blanket line and missed objects cannot be collected afterward',()=>{
  const run=playing();run.drops=[drop('biscuit'),drop('orange',.9,2)];assert.equal(advance(run,.05,.3).caught.length,1);assert.equal(run.caught,1);run.basket=.9;run.target=.9;advance(run,.05,.3);assert.equal(run.caught,1);
});
test('levels unlock sequentially, Pepper joins after level 3, and best stars survive failed replays',()=>{
  const save=blankSave();assert.ok(isLevelOpen(save,1));assert.equal(isLevelOpen(save,10),false);assert.deepEqual(crewFor(save),{pepper:false,pee:false});
  for(let level=1;level<=3;level++){const run=play(level,.3,1);assert.equal(finishRun(save,run),level===3);assert.ok(isLevelOpen(save,level+1));assert.equal(save.stars[level],3);}
  assert.equal(crewFor(save,3).pepper,false);assert.equal(crewFor(save,4).pepper,true);
  const failed=playing(3);failed.hearts=0;failed.hits=3;failed.status='lost';finishRun(save,failed);assert.equal(save.stars[3],3);assert.equal(save.pepperUnlocked,true);assert.ok(save.completed.includes(3));
});
test('golden biscuits appear only from level 5, once per attempt; Pee needs three distinct levels',()=>{
  for(let level=1;level<=10;level++){const run=playing(level);run.spawnIn=.45;const ids=new Set();const random=seeded(1);
    for(let t=0;t<650&&run.status==='playing';t++){run.target=chooseTarget(run,LEVELS[level-1],.3);advance(run,.05,.3,random);run.drops.filter(d=>d.type==='golden').forEach(d=>ids.add(d.id));}
    assert.equal(ids.size,level>=5?1:0);
  }
  const save=blankSave();for(const level of [5,5,6]){const run=playing(level);run.goldenCaught=true;assert.equal(collectGolden(save,run),false);}assert.deepEqual(save.goldenLevels,[5,6]);
  const final=playing(7);final.caught=LEVELS[6].goal-1;final.counts.biscuit=final.caught;final.drops=[drop('golden')];advance(final,.05,.3);assert.equal(final.status,'won');assert.equal(collectGolden(save,final),true);finishRun(save,final);assert.equal(save.peeUnlocked,true);assert.equal(save.results[7].won,true);assert.equal(crewFor(save,4).pee,false);assert.equal(crewFor(save,5).pee,true);
});
test('reload preserves the exact running state and active setbacks',()=>{
  const run=play(6,.3,1);run.status='paused';run.elapsed=15;run.mudUntil=17;run.frightUntil=16;
  const save=blankSave();save.completed=[1,2,3,4,5];save.runs[6]=run;const restored=parseSave(JSON.stringify(save));assert.deepEqual(restored.runs[6],run);
  run.status=restored.runs[6].status='playing';const a=seeded(10),b=seeded(10);for(let t=0;t<500;t++){advance(run,.02,.3,a);advance(restored.runs[6],.02,.3,b);}assert.deepEqual(run,restored.runs[6]);
});
test('original saves retain earned friends and finish ongoing rounds with original rules',()=>{
  const legacy={version:1,runs:{},results:{4:{won:true,caught:17,elapsed:24}},completed:[1,2,3,4],sound:true,lastLevel:5,peeUnlocked:true};
  legacy.runs[5]={level:5,elapsed:9,spawnIn:.5,caught:8,missed:1,drops:[{id:9,type:'orange',x:.4,y:.4,rotation:.2}],basket:.5,target:.5,sequence:9,goldenSpawned:true,peeFound:true,status:'paused',counts:{strawberry:3,biscuit:3,orange:2}};
  const migrated=parseSave(JSON.stringify(legacy));assert.equal(migrated.version,2);assert.equal(migrated.runs[5].elapsed,9);assert.equal(migrated.runs[5].rules,'classic');assert.equal(configFor(migrated.runs[5]).goal,20);assert.equal(migrated.results[4].goal,17);assert.equal(migrated.peeUnlocked,true);assert.equal(migrated.pepperUnlocked,true);assert.ok(validRun(migrated.runs[5],5));
  const run=migrated.runs[5];run.status='playing';for(let t=0;t<1500&&run.status==='playing';t++)advance(run,.02,.3,()=>.5);assert.equal(run.status,'won');assert.equal(run.caught,20);
  const ready={version:1,runs:{1:{...legacy.runs[5],level:1,elapsed:0,sequence:0,caught:0,peeFound:false,status:'ready',drops:[]}},results:{},completed:[]};assert.equal(parseSave(JSON.stringify(ready)).runs[1].rules,'adventure');
});
test('all meaningful routes are addressable; malformed saves are rejected without inventing progress',()=>{
  for(const view of ['home','levels','help','play','result','picnic','guest','pepper'])assert.equal(readRoute(`?view=${view}&level=10`).view,view);
  assert.deepEqual(readRoute('?view=play&level=4&paused=1'),{view:'play',level:4,paused:true,from:'home'});assert.equal(readRoute('?level=999').level,10);assert.equal(readRoute('?level=oops').level,1);
  for(const raw of ['{bad json','{"version":2}'])assert.throws(()=>parseSave(raw));
  const save=blankSave();save.runs[1]=playing();save.runs[1].hearts=-1;assert.throws(()=>parseSave(JSON.stringify(save)));save.runs[1]=playing();save.runs[1].drops=[drop('golden')];assert.throws(()=>parseSave(JSON.stringify(save)));
});
