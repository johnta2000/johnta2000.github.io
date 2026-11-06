import assert from 'node:assert/strict';
import {simulate,normalize,defaults,ensemble} from '../model.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≈ ${b}`);
const flat=simulate({...defaults,growth:0,vol:0,cash:0,monthly:500});for(const a of flat.strategies)close(a.rows.at(-1).total,279500);
const constant=simulate({...defaults,path:'steady'});close(constant.strategies[0].rows.at(-1).total,100000*1.08**30);
const same=simulate({...defaults,strength:0});assert.deepEqual(same.strategies[1].rows,same.strategies[2].rows);
const one=simulate({...defaults,deploy:1});assert.deepEqual(one.strategies[0].rows,one.strategies[2].rows);
for(let seed=1;seed<30;seed++){const r=simulate({...defaults,seed,monthly:100});for(const a of r.strategies){assert.ok(a.rows.every(x=>x.cash>=-1e-8&&Number.isFinite(x.total)));close(a.rows[11].cash,0);}}
const dip=simulate({...defaults,years:1,deploy:12,cash:0},[100,80,80,80,80,80,80,80,80,80,80,80,80]);close(dip.strategies[2].rows[1].buy,2*dip.strategies[1].rows[1].buy);
assert.deepEqual(simulate(defaults),simulate(defaults));assert.equal(normalize({years:1,deploy:600}).deploy,12);close(ensemble({...defaults,deploy:1},10)[0].win,1/3);console.log('Model checks passed: compounding, cash conservation, dip weighting, caps, reproducibility, equal strategies and ties.');
// The fast simulation path must match the full monthly ledger.
for(const seed of [1,42,999])for(const monthly of [0,500]){
 const s={...defaults,seed,monthly},full=simulate(s),fast=simulate(s,undefined,false);
 full.strategies.forEach((a,k)=>close(a.rows.at(-1).total,fast.strategies[k].total));
}
const allTied=ensemble({...defaults,deploy:1},100);
for(const s of allTied){close(s.tie,1);close(s.beat,0);close(s.lose,0);close(s.difference.median,0);close(s.percent.median,0);}
const distribution=ensemble(defaults);
assert.equal(distribution[0].count,5000);
for(const s of distribution){assert.equal(s.outcomes.length,5000);close(s.beat+s.lose+s.tie,1);assert.ok(s.low<=s.median&&s.median<=s.high);}
for(const k of [1,2]){
 const pairs=distribution[k].outcomes.map((x,i)=>x-distribution[0].outcomes[i]).sort((a,b)=>a-b);
 close(distribution[k].difference.median,(pairs[2499]+pairs[2500])/2);
}
assert.deepEqual(ensemble(defaults,40),ensemble({...defaults,path:'early',seed:500,view:'real'},40));
console.log('5000-path and paired-comparison checks passed.');
