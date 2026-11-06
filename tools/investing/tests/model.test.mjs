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
