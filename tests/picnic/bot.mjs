// Test-only player. React to the next landing, with a little room around hazards.
export function chooseTarget(run,config,width){
  const hazards=['sock','mud','vacuum'];
  const drops=run.drops.filter(drop=>drop.y<.77).map(drop=>{
    const t=(.77-drop.y)*config.fall;
    const wind=config.wind&&Math.floor((run.elapsed+t)/6)%2===1?Math.sin((run.elapsed+t)*1.15)*config.wind:0;
    return {...drop,t,impactX:Math.max(.07,Math.min(.93,(drop.baseX??drop.x)+wind))};
  }).sort((a,b)=>a.t-b.t);
  if(!drops.length)return run.basket;
  const next=drops[0];if(!hazards.includes(next.type))return next.impactX;
  const food=drops.find(drop=>!hazards.includes(drop.type));
  const candidates=[next.impactX-width/2-.035,next.impactX+width/2+.035];
  if(food)candidates.push(food.impactX);
  const safe=candidates.filter(x=>x>=width/2&&x<=1-width/2&&Math.abs(x-next.impactX)>width/2+.015);
  const cost=x=>Math.abs(x-(food?.impactX??run.basket))+.2*Math.abs(x-run.basket);
  safe.sort((a,b)=>cost(a)-cost(b));return safe[0]??run.basket;
}
export function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
