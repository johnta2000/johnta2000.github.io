export const LEVELS = Object.freeze([
  { name:'Pepsi’s Big Day', short:'First Steps', goal:8, duration:30, fall:4.2, interval:1.25, hazardEvery:5, hazards:['sock'], pairs:0, wind:0, line:'Just Pepsi, a blanket, and suspiciously snack-shaped socks.' },
  { name:'Laundry Day', short:'Laundry Day', goal:11, duration:30, fall:3.9, interval:1.1, hazardEvery:4, hazards:['sock','mud'], pairs:0, wind:0, line:'The laundry escaped. So did the mud. Catch only the snacks.' },
  { name:'Operation Pepper', short:'Find Pepper', goal:13, duration:32, fall:3.6, interval:1, hazardEvery:4, hazards:['sock','mud','vacuum'], pairs:0, wind:0, line:'Pepper heard there were snacks. Finish this round to bring her along.' },
  { name:'Partners in Crime', short:'Double Trouble', goal:15, duration:32, fall:3.4, interval:.92, hazardEvery:4, hazards:['sock','mud','vacuum'], pairs:5, wind:0, line:'Two corgis, twice the mischief. Some snacks arrive in pairs.' },
  { name:'Golden Hour', short:'Golden Hour', goal:17, duration:34, fall:3.2, interval:.86, hazardEvery:3, hazards:['sock','mud','vacuum'], pairs:0, wind:0, line:'Something golden is hiding among the snacks. Trouble is, too.' },
  { name:'Muddy Business', short:'Muddy Business', goal:18, duration:34, fall:3, interval:.8, hazardEvery:3, hazards:['mud','sock','vacuum'], pairs:0, wind:.045, line:'A breezy meadow, muddy paws, and absolutely no regrets.' },
  { name:'Snack or Sock?', short:'Snack or Sock?', goal:20, duration:36, fall:2.85, interval:.76, hazardEvery:3, hazards:['sock','mud','vacuum'], pairs:5, wind:.04, line:'A snack on one side. A terrible life choice on the other.' },
  { name:'Vacuum Season', short:'Vacuum Season', goal:22, duration:38, fall:2.7, interval:.72, hazardEvery:3, hazards:['vacuum','sock','vacuum','mud'], pairs:5, wind:.055, line:'The loud beasts are migrating. Please remain very brave.' },
  { name:'Corgi Chaos', short:'Corgi Chaos', goal:24, duration:40, fall:2.5, interval:.68, hazardEvery:3, hazards:['mud','vacuum','sock'], pairs:4, wind:.065, line:'Wind, socks, mud, and snacks. The corgis have a lot going on.' },
  { name:'The Grand Picnic', short:'Grand Picnic', goal:26, duration:42, fall:2.35, interval:.64, hazardEvery:3, hazards:['sock','vacuum','mud'], pairs:4, wind:.075, line:'One glorious final scramble. Make it a picnic to remember.' },
]);
// In-progress rounds from the original release keep their original targets and timing.
const CLASSIC = [
  {name:'A Little Snack',goal:8,duration:30,fall:4.6,interval:1.35,pairs:false},
  {name:'Hungry Corgis',goal:11,duration:30,fall:4.1,interval:1.15,pairs:false},
  {name:'Picnic Prep',goal:14,duration:30,fall:3.6,interval:1,pairs:false},
  {name:'Biscuit Bonanza',goal:17,duration:30,fall:3.1,interval:.88,pairs:true},
  {name:'The Big Picnic',goal:20,duration:30,fall:2.7,interval:.76,pairs:true},
];
export const TYPES = ['strawberry','biscuit','orange'];
export const HAZARDS = ['sock','mud','vacuum'];
export const HAZARD_INFO = {
  sock:{name:'Stinky sock', rule:'−1 heart · spills 2 treats · 1s cough', message:'WHO PACKED THAT? −1 heart, up to 2 treats spilled. One-second cough break.'},
  mud:{name:'Mud pie', rule:'−1 heart · slow paws for 3s', message:'Muddy paws! −1 heart, slow for 3s.'},
  vacuum:{name:'The vacuum', rule:'−1 heart · smaller blanket for 3s', message:'THE LOUD BEAST! −1 heart, tiny blanket.'},
};
const DROP_TYPES = [...TYPES,'golden',...HAZARDS];
export const CATCH_Y = .77;
export const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
export const levelNumber = value => clamp(Math.trunc(Number(value))||1,1,LEVELS.length);
export const configFor = run => run?.rules==='classic' ? CLASSIC[run.level-1] : LEVELS[(run?.level||1)-1];
export const effectiveWidth = (run,width) => run?.frightUntil>run?.elapsed ? width*.72 : width;
export const gust = run => { const config=configFor(run);return config.wind && Math.floor(run.elapsed/6)%2===1 ? Math.sin(run.elapsed*1.15)*config.wind : 0; };
export const isLevelOpen = (save,level) => level===1 || save.completed.includes(level) || save.completed.includes(level-1) || (save.runs[level]?.elapsed>0);
export const nextLevel = save => LEVELS.findIndex((_,i)=>!save.completed.includes(i+1))+1||1;
export const crewFor = (save,level=null) => ({pepper:save.pepperUnlocked && (level===null||level>=4),pee:save.peeUnlocked && (level===null||level>=5)});
const companionDefaults = () => ({coughRemaining:0,pepperUsed:false,peeUsed:false,spilledTreats:0,rescueRemaining:0,tootRemaining:0,tootX:.5});
export const nearbyHazards = run => run.drops.filter(drop=>HAZARDS.includes(drop.type)&&drop.y>=.25&&drop.y<CATCH_Y&&Math.abs(drop.x-run.basket)<=.32);
function settleRound(run){
  const config=configFor(run);
  if(run.coughRemaining>0)return false;
  if(run.hearts===0||run.caught>=config.goal||run.elapsed>=config.duration){run.status=run.hearts>0&&run.caught>=config.goal?'won':'lost';return true;}
  return false;
}
export function useAbility(run,friend,crew){
  if(!run||run.status!=='playing'||run.rules==='classic'||run.hearts===0||!crew?.[friend])return null;
  if(friend==='pepper'&&run.level>=4&&!run.pepperUsed&&run.spilledTreats>0){
    const rescued=run.spilledTreats;run.caught+=rescued;run.spilledTreats=0;run.pepperUsed=true;run.rescueRemaining=.9;
    return {friend,rescued,finished:settleRound(run)};
  }
  if(friend==='pee'&&run.level>=5&&!run.peeUsed){
    const cleared=nearbyHazards(run);if(!cleared.length)return null;
    run.drops=run.drops.filter(drop=>!cleared.includes(drop));run.dodged+=cleared.length;run.peeUsed=true;run.tootRemaining=.9;run.tootX=run.basket;
    return {friend,cleared,finished:false};
  }
  return null;
}

export function createRun(level) {
  return {level:levelNumber(level),rules:'adventure',elapsed:0,spawnIn:.45,caught:0,missed:0,drops:[],basket:.5,target:.5,sequence:0,wave:0,goldenSpawned:false,goldenCaught:false,peeFound:false,status:'ready',counts:{strawberry:0,biscuit:0,orange:0},hearts:3,hits:0,dodged:0,mudUntil:0,frightUntil:0,immuneUntil:0,lastHazard:'',...companionDefaults()};
}
function spawn(run,config,random) {
  if (run.rules==='classic') {
    const x=run.sequence===0?.5:.1+random()*.8;
    const golden=run.level>=2&&run.sequence>=4&&!run.goldenSpawned;
    const type=TYPES[Math.floor(random()*TYPES.length)];
    run.drops.push({id:++run.sequence,x,baseX:x,y:-.05,type:golden?'golden':type,rotation:(random()-.5)*.7});
    if(golden)run.goldenSpawned=true;
    if(config.pairs&&run.sequence%4===0){const px=clamp(x+(x>.5?-.12:.12),.09,.91);run.drops.push({id:++run.sequence,x:px,baseX:px,y:-.15,type:'biscuit',rotation:-.15});}
    return;
  }
  run.wave++;
  const lane=run.wave===1?2:Math.min(4,Math.floor(random()*5));
  const x=.12+lane*.19;
  const golden=run.level>=5&&run.wave===6&&!run.goldenSpawned;
  const bad=run.wave>2&&run.wave%config.hazardEvery===0;
  const type=golden?'golden':bad?config.hazards[Math.floor(random()*config.hazards.length)]:TYPES[Math.floor(random()*TYPES.length)];
  run.drops.push({id:++run.sequence,x,baseX:x,y:-.05,type,rotation:(random()-.5)*.5});
  if(golden)run.goldenSpawned=true;
  if(config.pairs&&run.wave%config.pairs===0&&!golden){
    // A two-lane gap leaves room to choose the food without catching its decoy.
    const other=lane>=2?lane-2:lane+2;const px=.12+other*.19;
    const pairType=run.level>=7&&!HAZARDS.includes(type)?config.hazards[Math.floor(random()*config.hazards.length)]:'biscuit';
    run.drops.push({id:++run.sequence,x:px,baseX:px,y:-.16,type:pairType,rotation:-.15});
  }
}
export function advance(run,delta,normalWidth,random=Math.random) {
  const events={caught:[],hits:[],finished:false};
  if(run.status!=='playing')return events;
  const config=configFor(run),dt=clamp(delta,0,.05);
  run.rescueRemaining=Math.max(0,run.rescueRemaining-dt);run.tootRemaining=Math.max(0,run.tootRemaining-dt);
  // A one-second comedy beat freezes the timer, drops, and controls together.
  if(run.coughRemaining>0){
    run.coughRemaining=Math.max(0,run.coughRemaining-dt);run.target=run.basket;
    if(run.coughRemaining===0)events.finished=settleRound(run);
    return events;
  }
  run.elapsed=Math.min(config.duration,run.elapsed+dt);
  const width=effectiveWidth(run,normalWidth);
  if(run.rules==='classic')run.basket+=(run.target-run.basket)*Math.min(1,dt*22);
  else {const speed=run.mudUntil>run.elapsed?.46:1.35;run.basket+=clamp(run.target-run.basket,-speed*dt,speed*dt);}
  run.basket=clamp(run.basket,width/2,1-width/2);
  run.spawnIn-=dt;
  if(run.spawnIn<=0&&run.elapsed<config.duration-config.fall*(CATCH_Y+.05)){
    spawn(run,config,random);run.spawnIn+=config.interval;
  }
  const remaining=[];
  for(const drop of run.drops){
    const before=drop.y;drop.y+=dt/config.fall;
    if(run.rules!=='classic')drop.x=clamp(drop.baseX+gust(run),.07,.93);
    const caught=before<CATCH_Y&&drop.y>=CATCH_Y&&Math.abs(drop.x-run.basket)<=width*.5;
    if(caught&&HAZARDS.includes(drop.type)){
      // Brief immunity prevents an overlapping pair from costing multiple hearts.
      if(run.elapsed>=run.immuneUntil){
        run.hearts=Math.max(0,run.hearts-1);run.hits++;run.lastHazard=drop.type;run.immuneUntil=run.elapsed+.9;
        if(drop.type==='sock'){
          const spilled=Math.min(2,run.caught);run.caught-=spilled;
          run.spilledTreats=Math.min(2,run.spilledTreats+spilled);run.coughRemaining=1;run.target=run.basket;
        }
        if(drop.type==='mud')run.mudUntil=run.elapsed+3;
        if(drop.type==='vacuum')run.frightUntil=run.elapsed+3;
        events.hits.push({...drop});
      }
    }else if(caught){
      run.caught++;run.counts[drop.type==='golden'?'biscuit':drop.type]++;
      if(drop.type==='golden'){run.goldenCaught=true;if(run.rules==='classic')run.peeFound=true;}
      events.caught.push({...drop});
    }else if(drop.y<1.06)remaining.push(drop);
    else if(HAZARDS.includes(drop.type))run.dodged++;
    else run.missed++;
  }
  run.drops=remaining;
  events.finished=settleRound(run);
  return events;
}
export function collectGolden(save,run) {
  if(!run.goldenCaught&&!run.peeFound)return false;
  const before=save.peeUnlocked;
  if(run.rules==='classic'&&run.peeFound)save.peeUnlocked=true;
  if(run.level>=5&&!save.goldenLevels.includes(run.level))save.goldenLevels.push(run.level);
  if(save.goldenLevels.length>=3)save.peeUnlocked=true;
  return !before&&save.peeUnlocked;
}
export function finishRun(save,run) {
  const config=configFor(run),won=run.status==='won';
  const stars=won&&run.rules!=='classic'?Math.max(1,3-run.hits):0;
  save.results[run.level]={caught:run.caught,elapsed:run.elapsed,won,goal:config.goal,duration:config.duration,hearts:run.hearts,hits:run.hits,stars,rules:run.rules,lastHazard:run.lastHazard};
  const foundPepper=won&&run.level>=3&&!save.pepperUnlocked;
  if(won){if(!save.completed.includes(run.level))save.completed.push(run.level);save.stars[run.level]=Math.max(save.stars[run.level]||0,stars);if(run.level>=3)save.pepperUnlocked=true;}
  return foundPepper;
}
export function validRun(run,level) {
  if(!run||run.level!==level||!['ready','playing','paused','won','lost'].includes(run.status)||!['classic','adventure'].includes(run.rules))return false;
  if(run.rules==='classic'&&level>5)return false;
  const config=configFor(run);
  if(!Number.isFinite(run.elapsed)||run.elapsed<0||run.elapsed>config.duration||!Number.isFinite(run.spawnIn))return false;
  if(!Number.isInteger(run.caught)||run.caught<0||run.caught>150||!Number.isInteger(run.sequence)||run.sequence<0||!Number.isInteger(run.wave)||run.wave<0)return false;
  if(![run.basket,run.target].every(x=>Number.isFinite(x)&&x>=0&&x<=1))return false;
  if(!['missed','hits','dodged','hearts'].every(key=>Number.isInteger(run[key])&&run[key]>=0)||run.hearts>3)return false;
  if(!['mudUntil','frightUntil','immuneUntil'].every(key=>Number.isFinite(run[key])&&run[key]>=0&&run[key]<=config.duration+4))return false;
  if(!['goldenSpawned','goldenCaught','peeFound'].every(key=>typeof run[key]==='boolean'))return false;
  if(!['pepperUsed','peeUsed'].every(key=>typeof run[key]==='boolean'))return false;
  if(!['coughRemaining','rescueRemaining','tootRemaining'].every(key=>Number.isFinite(run[key])&&run[key]>=0&&run[key]<=1))return false;
  if(!Number.isInteger(run.spilledTreats)||run.spilledTreats<0||run.spilledTreats>2||!Number.isFinite(run.tootX)||run.tootX<0||run.tootX>1)return false;
  if(!TYPES.every(type=>Number.isInteger(run.counts?.[type])&&run.counts[type]>=0&&run.counts[type]<=150))return false;
  if(!['',...HAZARDS].includes(run.lastHazard)||!Array.isArray(run.drops)||run.drops.length>100)return false;
  if(run.level<(run.rules==='classic'?2:5)&&(run.goldenCaught||run.drops.some(drop=>drop.type==='golden')))return false;
  return run.drops.every(drop=>DROP_TYPES.includes(drop.type)&&[drop.x,drop.baseX].every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&Number.isFinite(drop.y)&&drop.y>=-.2&&drop.y<=1.1&&Number.isFinite(drop.rotation));
}
export function blankSave(){return {version:2,runs:{},results:{},completed:[],stars:{},sound:false,lastLevel:1,pepperUnlocked:false,peeUnlocked:false,goldenLevels:[]};}
export function parseSave(raw) {
  const value=JSON.parse(raw);
  if(![1,2].includes(value?.version)||!value.runs||!value.results||!Array.isArray(value.completed))throw new Error('Unrecognized save');
  const save=blankSave();save.sound=value.sound===true;save.lastLevel=levelNumber(value.lastLevel);save.peeUnlocked=value.peeUnlocked===true;
  save.completed=[...new Set(value.completed.filter(n=>Number.isInteger(n)&&n>=1&&n<=LEVELS.length))];
  save.pepperUnlocked=value.pepperUnlocked===true||save.completed.some(n=>n>=3);
  save.goldenLevels=[...new Set((value.goldenLevels||[]).filter(n=>Number.isInteger(n)&&n>=5&&n<=10))];
  if(save.goldenLevels.length>=3)save.peeUnlocked=true;
  for(let level=1;level<=LEVELS.length;level++){
    const source=value.runs[level];
    if(source){
      let run={...companionDefaults(),...source};
      if(value.version===1){
        const active=source.elapsed>0;
        run={...createRun(level),...source,rules:active?'classic':'adventure',goldenSpawned:source.goldenSpawned===true,goldenCaught:source.peeFound===true,peeFound:source.peeFound===true,drops:(source.drops||[]).map(drop=>({...drop,baseX:drop.x}))};
        // No work has begun in a ready round, so use the new adventure rules.
        if(!active){run.goldenSpawned=false;run.goldenCaught=false;run.peeFound=false;run.drops=[];}
      }
      if(!validRun(run,level))throw new Error('Incomplete round data');
      save.runs[level]=run;if(run.peeFound)save.peeUnlocked=true;
    }
    const result=value.results[level];
    if(result){
      const config=value.version===1?CLASSIC[level-1]:LEVELS[level-1];
      if(!config||!Number.isInteger(result.caught)||result.caught<0||result.caught>150||!Number.isFinite(result.elapsed)||result.elapsed<0||result.elapsed>42||typeof result.won!=='boolean')throw new Error('Incomplete result data');
      const normalized={...result,goal:result.goal??config.goal,duration:result.duration??config.duration,hearts:result.hearts??3,hits:result.hits??0,stars:result.stars??0,rules:result.rules||(value.version===1?'classic':'adventure'),lastHazard:result.lastHazard||''};
      if(!Number.isInteger(normalized.goal)||normalized.goal<1||normalized.goal>100||!Number.isInteger(normalized.hearts)||normalized.hearts<0||normalized.hearts>3||!Number.isInteger(normalized.stars)||normalized.stars<0||normalized.stars>3||!Number.isInteger(normalized.hits)||normalized.hits<0||!['',...HAZARDS].includes(normalized.lastHazard))throw new Error('Incomplete result data');
      save.results[level]=normalized;
    }
    const stars=value.stars?.[level];if(Number.isInteger(stars)&&stars>=0&&stars<=3)save.stars[level]=stars;
  }
  return save;
}
export function readRoute(search){
  const params=new URLSearchParams(search),views=['home','levels','help','play','result','picnic','guest','pepper'];
  const view=views.includes(params.get('view'))?params.get('view'):params.has('level')?'play':'home';
  return {view,level:levelNumber(params.get('level')),paused:params.get('paused')==='1',from:views.includes(params.get('from'))?params.get('from'):'home'};
}
