const {test}=require('node:test'),assert=require('node:assert/strict');
const esbuild=require('esbuild'),Module=require('node:module'),path=require('node:path');
const filename=path.resolve('convex/revenue-test-bundle.cjs'),compiled=new Module(filename);compiled.filename=filename;compiled.paths=Module._nodeModulePaths(process.cwd());
compiled._compile(esbuild.buildSync({entryPoints:['convex/standupRevenue.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['convex/server','convex/values']}).outputFiles[0].text,filename);
const api=compiled.exports,teamId='johns-website-default';process.env.STANDUPS_ALLOWED_EMAIL='revenue-test@example.com';
const values={compliance:10000,chase:2000,bofa:3000,bofaMonthly:5000,bilt:null,nextcard:4000,chaseCount:2,bofaCount:3,biltCount:1,nextcardSubscriptions:4};
function fixture(){const tables=new Map();let n=0;let identity={email:'revenue-test@example.com',emailVerified:true,tokenIdentifier:'test-user'};const lookup=id=>[...tables.values()].flatMap(rows=>[...rows]).find(row=>row._id===id);
 const ctx={auth:{getUserIdentity:async()=>identity},db:{
  query(name){const tests=[];const list=()=>[...(tables.get(name)||[])].filter(row=>tests.every(([key,value])=>row[key]===value));const query={withIndex(name,fn){const q={eq(key,value){tests.push([key,value]);return q;}};fn(q);return query;},unique:async()=>list()[0]||null,collect:async()=>list()};return query;},
  async insert(name,data){const row={...structuredClone(data),_id:String(++n)};if(!tables.has(name))tables.set(name,[]);tables.get(name).push(row);return row._id;},
  async patch(id,data){Object.assign(lookup(id),structuredClone(data));},async delete(id){for(const [name,rows]of tables)tables.set(name,rows.filter(row=>row._id!==id));},
 }};return {ctx,setIdentity:v=>identity=v,tables};}
const invoke=(name,f,args)=>api[name]._handler(f.ctx,{teamId,date:'2026-11-11',...args});
test('revenue backend enforces the standup allowlist, verified identity, team and numeric validation',async()=>{
 const f=fixture();f.setIdentity(null);await assert.rejects(invoke('load',f,{}),/approved/);f.setIdentity({email:'other@example.com',emailVerified:true});await assert.rejects(invoke('load',f,{}),/approved/);
 f.setIdentity({email:'revenue-test@example.com',emailVerified:false});await assert.rejects(invoke('load',f,{}),/approved/);f.setIdentity({email:'revenue-test@example.com',tokenIdentifier:'test-user'});
 await assert.rejects(invoke('load',f,{teamId:'different-team'}),/Unknown/);
 const args={values:{...values,chaseCount:1.5},targetCents:100000,baseVersion:null,baseTargetVersion:null,expectedDraftVersion:null};await assert.rejects(invoke('saveDraft',f,args),/whole/);
 await assert.rejects(invoke('saveDraft',f,{...args,values:{...values,bofa:-1}}),/non-negative/);
});
test('server calculates the total once, saves durable owner drafts, isolates owners and rejects stale versions',async()=>{
 const f=fixture(),args={values,targetCents:100000,baseVersion:null,baseTargetVersion:null,expectedDraftVersion:null};
 assert.deepEqual(await invoke('saveDraft',f,args),{version:1});const loaded=await invoke('load',f,{});assert.equal(loaded.draft.values.bofaMonthly,5000);
 f.setIdentity({email:'revenue-test@example.com',tokenIdentifier:'another-user'});assert.equal((await invoke('load',f,{})).draft,null);f.setIdentity({email:'revenue-test@example.com',tokenIdentifier:'test-user'});
 await assert.rejects(invoke('saveDraft',f,args),/another tab/);
 const result=await invoke('publish',f,{...args,expectedDraftVersion:1});assert.equal(result.totalCents,24000);assert.equal((await invoke('load',f,{})).draft,null);
 await assert.rejects(invoke('publish',f,{...args,expectedDraftVersion:null}),/teammate updated/);
 const next={...args,baseVersion:1,baseTargetVersion:1,values:{...values,bofaMonthly:6000}};await invoke('saveDraft',f,next);await invoke('publish',f,{...next,expectedDraftVersion:1});assert.equal((await invoke('load',f,{})).selected.totalCents,25000);
 const prior=await invoke('load',f,{date:'2026-11-12'});assert.equal(prior.selected,null);assert.equal(prior.previous.date,'2026-11-11');const newMonth=await invoke('load',f,{date:'2026-12-01'});assert.equal(newMonth.previous,null);assert.equal(newMonth.target,null);
});
