const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const vm=require('node:vm');
const fs=require('node:fs');
test('weather import preserves every saved favorite exactly, including removed and repeated sets',async()=>{
  const sandbox={module:{exports:{}},require,structuredClone};
  vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rally.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text,sandbox);
  const favorites={a:['main-kai-wachi-53','support-saint-miller-86','set-secret-takeover-saturday-the-crater-0100'],b:['main-seven-lions-74','set-secret-takeover']};
  let saved;
  const doc={_id:'room',buckets:{id:'lost-lands-2026',members:[],lineupFavorites:favorites}};
  const ctx={db:{query:()=>({withIndex(){return this;},unique:async()=>doc}),patch:async(id,value)=>saved=value.buckets}};
  await sandbox.module.exports.importLostLandsSetTimes2026._handler(ctx,{preserveFavorites:true});
  assert.equal(JSON.stringify(saved.lineupFavorites),JSON.stringify(favorites));
  assert.equal(saved.lineup.find(x=>x.id==='main-kai-wachi-53').start,'2026-09-19T21:10');
  assert.equal(saved.lineup.filter(x=>x.day==='Saturday').length,64);
  assert.ok(!saved.lineup.some(x=>x.id==='support-saint-miller-86'));
  const browser={window:{}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/../../lost-lands-2026-lineup/set-times.js','utf8'),browser);
  for(const row of saved.lineup){const web=browser.window.LOST_LANDS_SET_TIMES.find(x=>x.id===row.id);assert.equal(web.start,row.start);assert.equal(web.end,row.end);}
});
