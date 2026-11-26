import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGrowth} from './article-growth.mjs';

test('age-matched launches, pending search days, distinct windows and series totals',()=>{
  const articles=[{slug:'a',series:'edit',published:'2026-11-10'},{slug:'b',series:'fhr',published:'2026-11-17'},{slug:'c',series:'csr',published:'2026-11-18'},{slug:'d',series:'csr',published:'2026-11-25'}];
  const row=(d,slug,clicks,impressions)=>({keys:['2026-11-'+d,'https://www.nextcard.com/articles/'+slug],clicks,impressions});
  const report=buildGrowth(articles,{start:'2026-11-10',final:'2026-11-24',rows:[row(10,'a',4,80),row(11,'a',1,5),row(18,'a',3,7),row(16,'b',10,10),row(17,'b',4,40),row(24,'b',2,16)]},new Date('2026-11-26T01:00:00Z'));
  const {groups}=report.details;
  assert.deepEqual(groups[0].cohorts.map(c=>[c.articles,c.withClicks,c.clicks]),[[1,1,2],[1,1,1]]);
  assert.deepEqual(groups[0].weeks.map(w=>[w.clicks,w.impressions]),[[5,23],[5,45]]);
  assert.deepEqual(groups[0].daily.at(-1),[4,null,null]);
  assert.deepEqual(groups.find(g=>g.id==='csr').daily.at(-2),[1,0,0]);
  assert.deepEqual(groups.find(g=>g.id==='inkind').cohorts.map(c=>c.articles),[0,0]);
});
