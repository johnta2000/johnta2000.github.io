import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parsePlanner,parseDelimited,dedupePlanner,canonical,aggregate,classify,buildOpportunities} from './engine.mjs';
const config=JSON.parse(fs.readFileSync(new URL('./config.example.json',import.meta.url)));
config.families.push(
  {id:'csr-dining',label:'Sapphire dining',pattern:'sapphire(?!.*preferred).*(dining|restaurant|table)',advantage:'Inventory',constraint:'Verify eligibility'},
  {id:'dining-apps',label:'Dining programs',pattern:'bilt.*(dining|restaurant)',advantage:'Coverage',constraint:'Verify dataset'},
  {id:'amex-hotels',label:'Amex hotels',pattern:'fhr|fine hotels|hotel collection',advantage:'Prices',constraint:'Verify dates'}
);
config.families[0].pattern+='|select hotel.*credit';
test('CSV quoting and UTF-16-decoded Planner: blanks stay unknown, zero stays zero',()=>{
  assert.deepEqual(parseDelimited('a,b\n"hello, world","two\nlines"'),[['a','b'],['hello, world','two\nlines']]);
  const rows=parsePlanner('\uFEFFExport\nPeriod\nKeyword\tAvg. monthly searches\tCompetition\nfoo\t\tLow\nbar\t0\tHigh','x');
  assert.equal(rows[0].volume,null);assert.equal(rows[1].volume,0);
});
test('duplicate exports never add volume and record conflicts',()=>{
  const p=dedupePlanner([{keyword:'Foo',volume:100,source:'2026-09-12'},{keyword:'foo',volume:110,source:'2026-09-29'}]).get('foo');
  assert.equal(p.volume,110);assert.equal(p.volumeConflict,true);assert.equal(p.observations.length,2);
});
test('fragment normalization preserves query URLs; no observations are not zero',()=>{
  assert.equal(canonical('https://www.nextcard.com/tools/a?x=1#b'),'https://nextcard.com/tools/a?x=1');assert.equal(aggregate([]),null);
  assert.equal(aggregate([{clicks:1,impressions:1,position:2},{clicks:0,impressions:9,position:10}]).position,9.2);
});
test('intent separates Select stacking, national cheapest and city cheapest',()=>{
  assert.notEqual(classify('cheapest edit hotels',config).id,classify('cheapest select hotels credit edit hotels',config).id);
  assert.notEqual(classify('cheapest edit hotels',config).id,classify('cheapest edit hotels tokyo',config).id);
  assert.equal(classify('paze dining',config),null);
  assert.equal(classify('chase sapphire reserve dining credit',config).family.id,'csr-dining');
  assert.equal(classify('chase doordash credit',config),null);
  assert.equal(classify('chase sapphire preferred dining',config),null);
  assert.equal(classify('bilt partner restaurants',config).family.id,'dining-apps');
});
const metric=(keys,impressions=500)=>({keys,clicks:10,impressions,position:8,ctr:10/impressions});
function input(){return {config,planner:new Map(),inventory:{articles:[]},gsc:{fetchedAt:'2026-10-25T00:00:00Z',current:{queries:{rows:[metric(['amex fhr tokyo'])]},queryPages:{rows:[metric(['amex fhr tokyo','https://www.nextcard.com/tools/map']),metric(['amex fhr tokyo','https://www.nextcard.com/tools/map#section'])]}},previous:{queries:{rows:[]}}}};}
test('tool visibility is a research lead, not proof an article is missing; fragments not counted twice',()=>{
  const r=buildOpportunities(input());assert.equal(r.fragmentRowsExcluded,1);assert.equal(r.opportunities[0].pages[0].impressions,500);assert.equal(r.opportunities[0].lane,'Research gap');assert.equal(r.opportunities[0].difficulty,'Unreviewed');assert.equal(r.opportunities[0].previous,null);
});
test('planned content is excluded from new research',()=>{
  const i=input();i.drafts=['Amex FHR Tokyo Hotels'];assert.equal(buildOpportunities(i).opportunities[0].lane,'Already planned');
});
test('stale or incomplete reviews cannot promote new article assignments',()=>{
  const i=input(),id=classify('amex fhr tokyo',config).id;
  i.reviews={[id]:{checkedAt:'2026-09-01',difficulty:'low',datasetVerified:true,coverageVerified:true,intentFits:true,angle:'Angle'}};
  assert.equal(buildOpportunities(i).opportunities[0].lane,'Research gap');
  i.reviews[id].checkedAt='2026-10-24';assert.equal(buildOpportunities(i).opportunities[0].lane,'New article shortlist');
  i.reviews[id].difficulty='high';assert.equal(buildOpportunities(i).opportunities[0].lane,'Deprioritized');
});
