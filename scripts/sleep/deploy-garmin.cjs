// Deploys only Garmin connections on top of the current deployed modules.
// Credentials remain in memory; unrelated local backend files are never bundled.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {brotliCompressSync}=require('node:zlib');
const {defineSchema,defineTable}=require('convex/server');
const {v}=require('convex/values');
const esbuild=require('esbuild'),vm=require('node:vm'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const repo=path.resolve(__dirname,'../..');
const apply=process.argv.includes('--apply');
(async()=>{
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const auth=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':'npm-cli-1.41.0'},body:JSON.stringify({selectedDeploymentName:'rapid-shark-565',projectSelection:{kind:'teamAndProjectSlugs',teamSlug:'john-ta-af559',projectSlug:'john-ta-projects'}})});
 if(!auth.ok)throw Error('Could not authorize deployment');
 const credentials=await auth.json();
 if(credentials.url!=='https://rapid-shark-565.convex.cloud'||!credentials.adminKey)throw Error('Wrong deployment');
 const call=async(endpoint,data,compress=false)=>{
  const body=JSON.stringify({...data,adminKey:credentials.adminKey});
  const response=await fetch(credentials.url+endpoint,{method:'POST',headers:{Authorization:`Convex ${credentials.adminKey}`,'Content-Type':'application/json',...(compress?{'Content-Encoding':'br'}:{})},body:compress?brotliCompressSync(body):body});
  if(!response.ok) { const error=await response.json().catch(()=>({}));throw Error(endpoint+' failed '+response.status+': '+String(error.message||error.errorMessage||error.code||'').slice(0,900)); }
  const text=await response.text(); return text ? JSON.parse(text) : null;
 };
 const snapshot=await call('/api/get_config',{version:'1.41.0'});
 const hashes=await call('/api/get_config_hashes',{version:'1.41.0'});
 const backups=fs.mkdtempSync('/private/tmp/daylight-garmin-release-');
 fs.chmodSync(backups,0o700);
 fs.writeFileSync(path.join(backups,'modules.json'),JSON.stringify(snapshot),{mode:0o600});
 const bundled=esbuild.buildSync({entryPoints:[path.join(repo,'convex/garminTables.ts')],bundle:true,write:false,platform:'node',format:'cjs',external:['convex/server','convex/values']}).outputFiles[0].text;
 const mod={exports:{}};vm.runInNewContext(bundled,{module:mod,exports:mod.exports,require});
 const tables=JSON.parse(defineSchema(mod.exports.garminTables).export()).tables;
 const schema={...snapshot.modules.find(m=>m.path==='schema.js')};delete schema.sourceMap;
 const context={};vm.runInNewContext(schema.source.replace('export default','globalThis.schema ='),context);
 const previous=JSON.parse(context.schema.export()),next=structuredClone(previous);
 assert(!next.tables.some(t=>t.tableName.startsWith('garmin')),'Garmin already deployed; inspect before updating');
 next.tables.push(...tables);schema.source='const schema='+JSON.stringify(JSON.stringify(next))+'; export default {export(){return schema;}};';
 const sleep={...snapshot.modules.find(m=>m.path==='sleep.js')};delete sleep.sourceMap;
 const needle='return { nights: a, alertness: C, whoopDays: k };';assert.equal(sleep.source.split(needle).length,2,'Dashboard changed; inspect before patching');
 sleep.source=sleep.source.replace(needle,'const garminNights = await t.db.query("garminNights").withIndex("by_owner_date", q => q.eq("ownerSubject", i.subject).gte("sleepDate", e.startDate).lte("sleepDate", e.endDate)).collect(); return { nights: [...a, ...garminNights], alertness: C, whoopDays: k };');
 const modules=[sleep,...['garminData','garmin'].map(name=>({path:name+'.js',environment:name==='garmin'?'node':'isolate',source:esbuild.buildSync({entryPoints:[path.join(repo,'convex',name+'.ts')],bundle:true,write:false,format:'esm',platform:name==='garmin'?'node':'browser',target:'esnext'}).outputFiles[0].text}))];
 const replaced=new Set(['schema.js',...modules.map(m=>m.path)]);
 const request={dryRun:!apply,functions:snapshot.config.functions,appDefinition:{definition:null,dependencies:[],schema,changedModules:modules,unchangedModuleHashes:hashes.moduleHashes.filter(m=>!replaced.has(m.path)).map(m=>({path:m.path,environment:m.environment,sha256:m.hash})),udfServerVersion:snapshot.udfServerVersion},componentDefinitions:[],nodeDependencies:[],nodeVersion:hashes.nodeVersion};
 const start=await call('/api/deploy2/start_push',request,true);
 if(Object.keys(start.app?.childComponents||{}).length)throw Error('Unexpected components; refusing standalone change');
 let complete=false;
 for(let attempt=0;attempt<12;attempt++){
  const state=await call('/api/deploy2/wait_for_schema',{schemaChange:start.schemaChange,timeoutMs:1000,dryRun:!apply});
  if(state.type==='complete'){complete=true;break;}
  if(state.type!=='inProgress')throw Error('Schema validation failed: '+state.type);
 }
 if(!complete)throw Error('Schema validation did not complete');
 const latest=await call('/api/get_config_hashes',{version:'1.41.0'});
 const fingerprint=x=>JSON.stringify(x.moduleHashes.map(m=>[m.path,m.hash]).sort());
 if(fingerprint(latest)!==fingerprint(hashes))throw Error('Production changed during preparation; retry against latest');
 const diff=await call('/api/deploy2/finish_push',{startPush:start,dryRun:!apply,message:'Daylight: add private Garmin Personal API connections'},true);
 // Never print startPush, which contains environment variables.
 fs.writeFileSync(path.join(backups,'deployment-diff.json'),JSON.stringify(diff),{mode:0o600});
 if(apply){
  const after=await call('/api/get_config',{version:'1.41.0'});assert.equal(after.modules.length,snapshot.modules.length+2);
  for(const m of snapshot.modules)if(!replaced.has(m.path))assert.deepEqual(after.modules.find(n=>n.path===m.path&&n.environment===m.environment),m,'Unrelated module changed '+m.path);
  const env=await call('/api/query',{path:'_system/cli/queryEnvironmentVariables:get',args:{name:'GARMIN_TOKEN_ENCRYPTION_KEY'},format:'json'});assert.equal(env.status,'success','Could not inspect secret presence');
  const changes=[{name:'GARMIN_PERSONAL_ENABLED',value:'true'}];if(!env.value)changes.push({name:'GARMIN_TOKEN_ENCRYPTION_KEY',value:randomBytes(32).toString('base64')});
  await call('/api/update_environment_variables',{changes});
 }
 console.log(JSON.stringify({applied:apply,preservedModules:request.appDefinition.unchangedModuleHashes.length,changedModules:modules.map(m=>m.path),newTables:tables.map(t=>t.tableName),backup:backups}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
