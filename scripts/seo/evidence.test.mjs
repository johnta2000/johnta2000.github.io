import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEvidence} from './evidence.mjs';

const url='https://www.nextcard.com/articles/test';
const observation=(page,clicks,impressions)=>({keys:[page],clicks,impressions,position:3});
const snapshot={inventory:{articles:[{id:'office-id',slug:'test',title:'Updated article title'}]},gsc:{
  finalizedThrough:'2026-10-25',fetchedAt:'2026-10-26T12:00:00Z',periods:{current:{startDate:'2026-09-28',endDate:'2026-10-25'},previous:{startDate:'2026-08-31',endDate:'2026-09-27'}},
  current:{pages:{rows:[observation(url,0,10),observation(url+'#section',99,100)]}},previous:{pages:{rows:[observation(url,4,20)]}}
}};
const evidence={generatedAt:'2026-10-24T12:00:00Z',gscFinalizedThrough:'2026-10-23',searchMethod:'Signed-out US sample',searchLimit:'Stopped at CAPTCHA',
  cohorts:[{name:'Test group',decision:'Original dated assessment',rows:[{url},{url:'https://www.nextcard.com/articles/missing'}]}],tools:[{url:'https://www.nextcard.com/tools/resy-map'}],
  searchReviews:Array.from({length:41},(_,i)=>({query:i===0?'Example Query':'query '+i,checkedAt:'2026-10-24T12:00:00Z',url:'https://www.google.com/search?q=example',finding:'Observed intent',resultLabels:['Example result']}))};
const tasks=[{id:'task',targetUrl:url,keyword:'example query',sources:[]}];

test('evidence refreshes measurements and article links while preserving the assessment date',()=>{
  const result=buildEvidence(snapshot,evidence,tasks),c=result.cohorts[0];
  assert.equal(result.finalizedThrough,'2026-10-25');assert.equal(result.reviewedThrough,'2026-10-23');
  assert.equal(result.reviewedAt,evidence.generatedAt);assert.equal(c.decision,'Original dated assessment');
  assert.equal(c.current.clicks,0);assert.equal(c.current.impressions,10);assert.equal(c.previous.clicks,4);
  assert.equal(c.current.missingPages,1);assert.equal(c.rows[1].current,null);
  assert.equal(c.rows[0].title,'Updated article title');assert.match(c.rows[0].officeUrl,/office-id/);
  assert.deepEqual(c.relatedWorkIds,['task']);assert.equal(result.tools[0].current,null);
});
test('all search checks survive the join and connect to the right work',()=>{
  const result=buildEvidence(snapshot,evidence,tasks);assert.equal(result.searches.length,41);
  assert.deepEqual(result.searches[0].relatedWorkIds,['task']);assert.deepEqual(result.searches[1].relatedWorkIds,[]);
  assert.equal(result.searches[0].checkedAt,evidence.searchReviews[0].checkedAt);
  assert.equal(result.searches[0].finding,'Observed intent');assert.equal(result.searchLimit,'Stopped at CAPTCHA');
});
test('a tool used as a source links to the related article work without inventing an assignment',()=>{
  const result=buildEvidence(snapshot,evidence,[{...tasks[0],sources:['https://nextcard.com/tools/resy-map']}]);
  assert.deepEqual(result.tools[0].relatedWorkIds,['task']);assert.equal(result.tools[0].current,null);
});
test('an entirely missing cohort is not a zero-click cohort',()=>{
  const missing=structuredClone(evidence);missing.cohorts[0].rows=[{url:'https://www.nextcard.com/articles/missing'}];
  const c=buildEvidence(snapshot,missing,[]).cohorts[0];assert.equal(c.current.clicks,null);assert.equal(c.current.impressions,null);assert.equal(c.current.missingPages,1);
  assert.equal(buildEvidence(snapshot,null,[]),null);assert.throws(()=>buildEvidence(snapshot,{},[]),/Invalid private/);
});
