import {defaults,normalize,simulate,SIMULATIONS} from './model.mjs?v=2';
const $=id=>document.getElementById(id),colors=['#18836b','#5179db','#cb762c'],tints=['#eff7f3','#f0f4fc','#fcf5ed'];let state,run,month,stats,statsKey,worker;
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const short=n=>n>=1e9?'$'+(n/1e9).toFixed(1)+'b':n>=1e6?'$'+(n/1e6).toFixed(2)+'m':n>=1000?'$'+(n/1000).toFixed(n>=1e5?0:1)+'k':money(n);
function url(s){const u=new URL(location.href);u.search='';for(const [k,v]of Object.entries(s))u.searchParams.set(k,v);return u.pathname+u.search;}
function restore(){state=normalize(Object.fromEntries(new URLSearchParams(location.search)));month=state.month<0?state.years*12:state.month;render();}
function commit(next){const previous=url(state);state=normalize({...state,...next});if(url(state)!==previous)history.pushState(null,'',url(state));month=Math.min(month,state.years*12);render();}
function factor(m){return state.view==='real'?Math.pow(1+state.inflation/100,m/12):1;}
function line(values,w=900,h=380,pad=52,max){max=max||Math.max(...values)*1.1||1;return values.map((v,i)=>`${i?'L':'M'}${(pad+i/(values.length-1)*(w-pad-18)).toFixed(2)},${(h-32-v/max*(h-55)).toFixed(2)}`).join(' ');}
function render(){run=simulate(state);for(const k of Object.keys(defaults)){if($(k))$(k).value=state[k];}$('deploy').max=state.years*12;$('years-out').textContent=state.years+' years';$('deploy-out').textContent=state.deploy+' months';$('strength-out').textContent=state.strength+'×';$('rule-copy').textContent=`At a 20% dip, buy ${(1+state.strength*.2).toFixed(1)}× the regular amount, while cash remains.`;
$('views').innerHTML=[['nominal','Future dollars'],['real','Today’s dollars']].map(([v,label])=>`<a href="${url({...state,view:v})}" data-view="${v}" aria-current="${state.view===v}">${label}</a>`).join('');$('paths').innerHTML=[['random','Winding road'],['steady','Steady growth'],['early','Early crash'],['late','Late crash']].map(([v,label])=>`<a href="${url({...state,path:v})}" data-path="${v}" aria-current="${state.path===v}">${label}</a>`).join('');
const final=run.strategies.map(a=>a.rows.at(-1).total/factor(state.years*12));$('cards').innerHTML=run.strategies.map((a,k)=>`<div class="card" style="--color:${colors[k]};--tint:${tints[k]}"><span class="name">${a.name}</span><strong title="${money(final[k])}">${short(final[k])}</strong><small>at year ${state.years} · ${state.view==='real'?'today’s':'future'} dollars</small></div>`).join('');
const W=matchMedia('(max-width:760px)').matches?500:900,H=W===500?340:380;$('chart').setAttribute('viewBox',`0 0 ${W} ${H}`);const values=run.strategies.map(a=>a.rows.map(r=>r.total/factor(r.month))),max=Math.max(1,...values.flat())*1.12;let svg='<defs><linearGradient id="wash" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#18836b" stop-opacity=".10"/><stop offset="1" stop-color="#18836b" stop-opacity="0"/></linearGradient></defs>';
for(let i=0;i<=4;i++){const v=max*i/4,y=H-32-v/max*(H-55);svg+=`<line x1="52" x2="${W-18}" y1="${y}" y2="${y}" stroke="#e8edeb" stroke-dasharray="3 5"/><text x="44" y="${y+4}" text-anchor="end">${short(v)}</text>`;}
for(let i=0;i<=5;i++)svg+=`<text x="${52+i/5*(W-70)}" y="${H-6}" text-anchor="middle">${i===0?'Start':'Year '+(state.years*i/5).toFixed(state.years%5?1:0)}</text>`;
svg+=`<path d="${line(values[0],W,H,52,max)} L${W-18},${H-32} L52,${H-32} Z" fill="url(#wash)"/>`;values.forEach((v,k)=>svg+=`<path d="${line(v,W,H,52,max)}" fill="none" stroke="${colors[k]}" stroke-width="3" stroke-linejoin="round" ${k===1?'stroke-dasharray="7 3"':''}/>`);svg+='<g id="crosshair"></g>';$('chart').innerHTML=svg;
const maxP=Math.max(...run.p)*1.05;$('market').innerHTML=`<path d="${line(run.p,900,130,52,maxP)}" fill="none" stroke="#8b9d93" stroke-width="2"/><text x="52" y="126">Start · index 100</text><text x="880" y="126" text-anchor="end">Year ${state.years} · ${run.p.at(-1).toFixed(0)}</text>`;
$('path-note').textContent=state.path==='random'?`Hypothetical total-return index · seed ${state.seed}. All strategies experience this exact path. Volatility changes random paths only.`:state.path==='steady'?'Constant monthly compounding at the growth assumption. No volatility or dips.':'Illustrative 30% crash '+(state.path==='early'?'in month 3':'24 months before the end')+', followed by a 24-month recovery of the crash component on top of baseline growth. Short horizons may end before recovery.';
$('shuffle').disabled=state.path!=='random';$('scrub').max=state.years*12;inspect(month,max);requestSimulations();}
function simulationKey(){return JSON.stringify({...state,path:'random',seed:0,view:'nominal',month:-1,inflation:0});}
function requestSimulations(){
  const key=simulationKey();
  if(key===statsKey){if(stats)renderSimulations();return;}
  statsKey=key;stats=null;worker?.terminate();
  $('simulation-results').hidden=true;
  $('simulation-status').textContent='Running 5,000 simulated markets…';
  $('simulation-status').hidden=false;
  const fail=()=>{if(key!==statsKey)return;$('simulation-status').textContent='The simulations could not finish. Your assumptions are saved in the link. Reload to try again.';statsKey=null;worker?.terminate();};
  try{
    worker=new Worker(new URL('./worker.mjs?v=2',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(data.key!==statsKey)return;if(data.error){fail();return;}stats=data.stats;worker.terminate();renderSimulations();};
    worker.onerror=fail;worker.postMessage({key,state});
  }catch{fail();}
}
const signedMoney=n=>(n<0?'−':n>0?'+':'')+short(Math.abs(n));
const signedPercent=n=>(n<-.00005?'−':n>.00005?'+':'')+Math.abs(n).toFixed(1)+'%';
function renderSimulations(){
  const endFactor=factor(state.years*12),scale=Math.max(1,...stats.map(s=>s.high));
  $('simulation-status').hidden=true;$('simulation-results').hidden=false;
  $('summary-cards').innerHTML=stats.map((s,k)=>`<div class="card" style="--color:${colors[k]};--tint:${tints[k]}"><span class="name">${run.strategies[k].name}</span><strong title="${money(s.median/endFactor)}">${short(s.median/endFactor)}</strong><small>Median at year ${state.years}<br>${state.view==='real'?'Today’s':'Future'} dollars</small></div>`).join('');
  $('ensemble').innerHTML=stats.map((s,k)=>`<div class="ensemble-row" style="--color:${colors[k]}"><strong style="color:${colors[k]}">${run.strategies[k].name}</strong><div><div class="range-track"><span class="range-bar" style="left:${s.low/scale*100}%;width:${(s.high-s.low)/scale*100}%"></span><span class="median" style="left:calc(${s.median/scale*100}% - 9px)"></span></div><div class="range-label">${short(s.low/endFactor)} – ${short(s.high/endFactor)}</div></div><div class="win"><strong>${(s.win*100).toFixed(1)}%</strong>finishes first*</div></div>`).join('')+'<p class="hint">*Finishes first splits ties equally across the three strategies.</p>';
  const bound=Math.max(1,...stats.slice(1).flatMap(s=>s.percentages.map(Math.abs)))*1.02;
  const binCount=41, allBins=stats.slice(1).map(s=>{const bins=Array(binCount).fill(0);for(const v of s.percentages)bins[Math.min(binCount-1,Math.max(0,Math.floor((v+bound)/(bound*2)*binCount)))]++;return bins;});
  const maxCount=Math.max(1,...allBins.flat());
  $('comparisons').innerHTML=stats.slice(1).map((s,i)=>{
    const k=i+1,bins=allBins[i],plotWidth=600,barWidth=plotWidth/binCount;
    let svg=`<rect x="30" y="12" width="300" height="170" fill="#faf3f0"/><rect x="330" y="12" width="300" height="170" fill="#f0f7f3"/>`;
    bins.forEach((n,b)=>svg+=`<rect x="${30+b*barWidth+1}" y="${182-n/maxCount*160}" width="${barWidth-2}" height="${n/maxCount*160}" rx="2" fill="${colors[k]}" opacity=".8"><title>${n} simulations: ${signedPercent(-bound+b/binCount*2*bound)} to ${signedPercent(-bound+(b+1)/binCount*2*bound)}</title></rect>`);
    svg+=`<line x1="330" x2="330" y1="8" y2="185" stroke="#74857c" stroke-dasharray="3 3"/><text x="30" y="208">${signedPercent(-bound)}</text><text x="330" y="208" text-anchor="middle">0% · same result</text><text x="630" y="208" text-anchor="end">${signedPercent(bound)}</text>`;
    return `<article class="comparison" style="--color:${colors[k]}"><h3>${run.strategies[k].name} vs. lump sum</h3><div class="comparison-metrics"><div><strong>${(s.beat*100).toFixed(1)}%</strong><span>beats lump sum</span></div><div><strong>${signedPercent(s.percent.median)}</strong><span>median relative difference</span></div><div><strong>${signedMoney(s.difference.median/endFactor)}</strong><span>median dollar difference</span></div></div><svg viewBox="0 0 660 220" role="img" aria-label="Distribution of ${run.strategies[k].name} percentage differences versus lump sum">${svg}</svg><div class="histogram-key"><span>← Lump sum finishes ahead</span><span>${run.strategies[k].name} finishes ahead →</span></div><p class="hint">${(s.lose*100).toFixed(1)}% finish behind · ${(s.tie*100).toFixed(1)}% tie. Middle 80% of relative differences: ${signedPercent(s.percent.low)} to ${signedPercent(s.percent.high)}.</p></article>`;
  }).join('');
}

function inspect(m,max){month=m;$('scrub').value=m;$('month-out').textContent=`Year ${Math.floor(m/12)}, month ${m%12}`;$('readout').innerHTML=run.strategies.map((a,k)=>{const r=a.rows[m];return `<div><span style="color:${colors[k]}">${a.name}</span><strong>${money(r.total/factor(m))}</strong><small>${money(r.cash/factor(m))} cash · ${money(r.buy/factor(m))} bought</small></div>`;}).join('');max=max||Math.max(1,...run.strategies.flatMap(a=>a.rows.map(r=>r.total/factor(r.month))))*1.12;const W=$('chart').viewBox.baseVal.width,H=$('chart').viewBox.baseVal.height,x=52+m/(state.years*12)*(W-70);$('crosshair').innerHTML=`<line x1="${x}" x2="${x}" y1="20" y2="${H-32}" stroke="#a7b6af" stroke-dasharray="4 4"/>`+run.strategies.map((a,k)=>`<circle cx="${x}" cy="${H-32-a.rows[m].total/factor(m)/max*(H-55)}" r="5" fill="${colors[k]}" stroke="white" stroke-width="2"/>`).join('');}
$('controls').addEventListener('submit',e=>e.preventDefault());$('controls').addEventListener('change',e=>{if(!e.target.name)return;if(!e.target.checkValidity()||e.target.value===''){e.target.reportValidity();return;}commit({[e.target.name]:Number(e.target.value)});});$('controls').addEventListener('input',e=>{if(e.target.type==='number'&&e.target.value!==''&&e.target.checkValidity()){commit({[e.target.name]:Number(e.target.value)});return;}if(e.target.type==='range'){const out=$(e.target.name+'-out');if(out)out.textContent=e.target.value+({years:' years',deploy:' months',strength:'×'}[e.target.name]||'');}});
for(const id of ['views','paths'])$(id).addEventListener('click',e=>{const a=e.target.closest('a');if(!a||e.metaKey||e.ctrlKey)return;e.preventDefault();commit(a.dataset.view?{view:a.dataset.view}:{path:a.dataset.path});});
$('scrub').addEventListener('input',e=>inspect(Number(e.target.value)));$('scrub').addEventListener('change',e=>commit({month:Number(e.target.value)}));$('chart').addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const b=$('chart').getBoundingClientRect(),W=$('chart').viewBox.baseVal.width;inspect(Math.max(0,Math.min(state.years*12,Math.round(((e.clientX-b.left)/b.width*W-52)/(W-70)*state.years*12))));});$('shuffle').onclick=()=>commit({seed:state.seed%999999+1});$('reset').onclick=()=>{month=defaults.years*12;commit(defaults);};
$('share').onclick=async()=>{const u=new URL(url(state),location.origin).href;try{await navigator.clipboard.writeText(u);$('status').textContent='Scenario link copied. Your friends will see the same assumptions and market.';}catch{$('status').textContent='Copy this scenario from the address bar.';history.replaceState(null,'',url(state));}setTimeout(()=>$('status').textContent='',6000);};
$('download').onclick=e=>{e.preventDefault();const rows=['month,market_index,contributed_nominal,strategy,portfolio_nominal,cash_nominal,purchase_nominal,portfolio_today_dollars'];for(let m=0;m<=state.years*12;m++)for(const a of run.strategies){const r=a.rows[m];rows.push([m,run.p[m],state.budget+state.monthly*Math.min(m,state.years*12-1),a.name,r.total,r.cash,r.buy,r.total/Math.pow(1+state.inflation/100,m/12)].join(','));}const blob=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'})),a=document.createElement('a');a.href=blob;a.download='investing-scenario.csv';a.click();setTimeout(()=>URL.revokeObjectURL(blob),1000);};window.addEventListener('popstate',restore);window.addEventListener('resize',()=>render());$('chart').addEventListener('pointerleave',()=>inspect(state.month<0?state.years*12:state.month));restore();

$('download-simulations').onclick=()=>{
 if(!stats)return;
 const rows=['simulation,seed,lump_sum_nominal,dca_nominal,weighted_dca_nominal,dca_minus_lump_nominal,weighted_minus_lump_nominal'];
 for(let i=0;i<SIMULATIONS;i++){const v=stats.map(s=>s.outcomes[i]);rows.push([i+1,i+10001,...v,v[1]-v[0],v[2]-v[0]].join(','));}
 const blob=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'})),a=document.createElement('a');a.href=blob;a.download='5000-investing-outcomes.csv';a.click();setTimeout(()=>URL.revokeObjectURL(blob),1000);
};
