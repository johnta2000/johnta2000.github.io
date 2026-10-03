import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { BOOKING_URL, runMonitor, selectLowestVisibleCard } from './hertz-las-may-2027.mjs';
import { parseBrowserSnapshot } from './hertz-snapshot.mjs';
import { getMonitorHealth } from '../../hertz-las-may-2027/health.mjs';

function snapshot() {
  const card = (key, vehicleClass, featureText, pricingText) => ({ key, vehicleClass, featureText, pricingText, text: `${vehicleClass}\nTest vehicle or similar\n${featureText}\n${pricingText}` });
  return {schemaVersion:1,capturedAt:new Date().toISOString(),checkedUrl:BOOKING_URL,itineraryText:'LAS May 20 | 7:00 PM LAS May 24 | 5:00 PM',resultCount:3,cards:[card('TRUCK','Pickup','6\nAuto','$54\n/day\n$318\nest. total'),card('SUV','7 Passenger SUV','7\n2\nAuto','$81\n/day\n$459\n \nest. total'),card('CAR','Sedan','5\n3','$50\n/day\n$300\nest. total')]};
}
test('browser evidence selects a qualifying card and retains displayed total',()=>{
  const parsed=parseBrowserSnapshot(snapshot());
  const {lowest,validCards,pricedCards}=selectLowestVisibleCard(parsed.cards);
  assert.equal(lowest.dailyRateUsd,81); assert.equal(lowest.estimatedTotalUsd,459);
  assert.equal(validCards.length,1); assert.equal(pricedCards.length,3);
});
test('wrong itinerary, discount, stale capture, missing cards and duplicate cards are rejected',()=>{
  for(const mutate of [s=>s.checkedUrl=s.checkedUrl.replace('2027-05-20','2027-05-21'),s=>s.checkedUrl=s.checkedUrl.replace('2278478','123'),s=>s.capturedAt='2020-01-01T00:00:00Z',s=>s.cards.pop(),s=>s.cards[1]=s.cards[0],s=>s.itineraryText='LAS May 21 | 7:00 PM']){
    const s=snapshot();mutate(s);assert.throws(()=>parseBrowserSnapshot(s));
  }
});
test('bare prices, sliders and conflicting evidence cannot become prices',()=>{
  const s=snapshot(); s.cards[1].pricingText='$1'; assert.throws(()=>parseBrowserSnapshot(s));
  s.cards[1].text='7 Passenger SUV\n7\n$1';s.cards[1].featureText='7';assert.throws(()=>parseBrowserSnapshot(s),/daily rate/);
});
test('persisting a browser check preserves old records, full evidence and idempotency',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'hertz-evidence-test-'));
  const opts={snapshotPath:resolve(dir,'snapshot.json'),historyPath:resolve(dir,'history.json'),publicHistoryPath:resolve(dir,'public.json'),publicCsvPath:resolve(dir,'public.csv')};
  await writeFile(opts.snapshotPath,JSON.stringify(snapshot()));
  await writeFile(opts.historyPath,JSON.stringify({runs:[{id:'old',checkedAt:'2026-06-10T19:00:00Z',status:'success',lowestVisibleDailyRateUsd:399}]}));
  await runMonitor(opts); await runMonitor(opts);
  const history=JSON.parse(await readFile(opts.historyPath,'utf8'));
  assert.equal(history.runs.length,2);assert.equal(history.runs[1].id,'old');
  assert.equal(history.runs[0].renderedSnapshot.cards.length,3);
  assert.deepEqual(history,JSON.parse(await readFile(opts.publicHistoryPath,'utf8')));
  assert.match(await readFile(opts.publicCsvPath,'utf8'),/regular_browser/);
  const bad=snapshot();bad.cards.pop();await writeFile(opts.snapshotPath,JSON.stringify(bad));
  await assert.rejects(runMonitor(opts),/Incomplete/);
  assert.equal(JSON.parse(await readFile(opts.historyPath,'utf8')).runs[0].status,'error');
});
test('health detects stopped schedules, failures and recovery independent of record order',()=>{
  const now=Date.now(); const success={criteriaVersion:2,checkedAt:new Date(now-37*3600000).toISOString(),status:'success',lowestVisibleDailyRateUsd:81};
  assert.equal(getMonitorHealth([success],now).status,'stale');
  success.checkedAt=new Date(now-3600000).toISOString();
  const failure={criteriaVersion:2,checkedAt:new Date(now).toISOString(),status:'error'};
  assert.equal(getMonitorHealth([success,failure],now).status,'unavailable');
  assert.equal(getMonitorHealth([success,failure],now).failureStreak,1);
  assert.equal(getMonitorHealth([success],now).status,'fresh');
  assert.equal(getMonitorHealth([],now).status,'stale');
});
