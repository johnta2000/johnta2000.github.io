export const defaults={budget:100000,monthly:0,years:30,deploy:12,growth:8,vol:18,cash:3,inflation:2.5,strength:5,seed:42,path:'random',view:'nominal',month:-1};
export function normalize(input){const s={...defaults};const bounds={budget:[0,1e8],monthly:[0,1e6],years:[1,50],deploy:[1,600],growth:[-15,25],vol:[0,60],cash:[0,15],inflation:[0,15],strength:[0,20],seed:[1,999999],month:[-1,600]};for(const [k,[min,max]] of Object.entries(bounds)){const v=Number(input[k]??s[k]);s[k]=Number.isFinite(v)?Math.min(max,Math.max(min,v)):s[k];}for(const k of ['years','deploy','seed','month'])s[k]=Math.round(s[k]);s.deploy=Math.min(s.deploy,s.years*12);s.month=Math.min(s.month,s.years*12);if(['random','steady','early','late'].includes(input.path))s.path=input.path;if(['nominal','real'].includes(input.view))s.view=input.view;return s;}
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function market(s){const n=s.years*12,r=rng(s.seed),p=[100];const crash=s.path==='early'?3:Math.max(1,n-24);for(let m=1;m<=n;m++){let log=Math.log1p(s.growth/100)/12;if(s.path==='random')log+=s.vol/100/Math.sqrt(12)*Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r());if(s.path==='early'||s.path==='late'){if(m===crash)log+=Math.log(.7);if(m>crash&&m<=crash+24)log-=Math.log(.7)/24;}p.push(p[m-1]*Math.exp(log));}return p;}
export function simulate(raw,prices,capture=true){const s=normalize(raw),p=prices??market(s),n=s.years*12,base=s.budget/s.deploy,cr=Math.pow(1+s.cash/100,1/12);const strategies=['Lump sum','DCA','Weighted DCA'].map(name=>({name,cash:s.budget,shares:0,spent:0,rows:[]}));let high=p[0];for(let m=0;m<=n;m++){high=Math.max(high,p[m]);for(let k=0;k<3;k++){const a=strategies[k];let buy=0;if(m<n){if(m>0)a.cash+=s.monthly;let scheduled=k===0?(m===0?s.budget:0):m<s.deploy?base*(k===2?1+s.strength*(1-p[m]/high):1):0;if(k>0&&m===s.deploy-1)scheduled=a.cash;buy=Math.min(a.cash,scheduled+(m>0?s.monthly:0));a.cash-=buy;a.shares+=buy/p[m];a.spent+=buy;}const total=a.shares*p[m]+a.cash;a.total=total;if(capture)a.rows.push({month:m,total,cash:a.cash,invested:a.shares*p[m],buy,spent:a.spent});if(m<n)a.cash*=cr;}}
return {s,p,strategies,contributed:s.budget+s.monthly*(n-1)};}
export const SIMULATIONS = 5000;
export function ensemble(s, count = SIMULATIONS) {
  const finals = [[], [], []], differences = [[], [], []], percentages = [[], [], []];
  const wins = [0, 0, 0], beats = [0, 0, 0], ties = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    const r = simulate({...s, path: 'random', seed: i + 10001}, undefined, false);
    const v = r.strategies.map(a => a.total);
    const tolerance = 1e-9 * Math.max(1, ...v);
    v.forEach((x, k) => {
      finals[k].push(x);
      differences[k].push(x - v[0]);
      percentages[k].push(v[0] > 0 ? (x / v[0] - 1) * 100 : 0);
      if (Math.abs(x - v[0]) <= tolerance) ties[k]++;
      else if (x > v[0]) beats[k]++;
    });
    const top = Math.max(...v);
    const tied = v.map((x, k) => Math.abs(x - top) <= tolerance ? k : -1).filter(k => k >= 0);
    tied.forEach(k => wins[k] += 1 / tied.length);
  }
  const quantiles = values => {
    const v = [...values].sort((a, b) => a - b);
    const at = p => { const i = (v.length - 1) * p, lo = Math.floor(i); return v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo); };
    return {low: at(.1), median: at(.5), high: at(.9)};
  };
  return finals.map((v, k) => ({
    ...quantiles(v), win: wins[k] / count, beat: beats[k] / count,
    tie: ties[k] / count, lose: (count - beats[k] - ties[k]) / count,
    difference: quantiles(differences[k]), percent: quantiles(percentages[k]),
    percentages: percentages[k], outcomes: v, count,
  }));
}
