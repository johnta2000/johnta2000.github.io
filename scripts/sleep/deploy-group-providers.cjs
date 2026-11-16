// Deploys only group provider selection on top of the current deployed modules.
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
 const backups=fs.mkdtempSync('/private/tmp/daylight-group-providers-');
 fs.chmodSync(backups,0o700);
 fs.writeFileSync(path.join(backups,'modules.json'),JSON.stringify(snapshot),{mode:0o600});
 const schema={...snapshot.modules.find(m=>m.path==='schema.js')};delete schema.sourceMap;
 const schemaModule={exports:{}};vm.runInNewContext(esbuild.transformSync(schema.source,{format:'cjs'}).code,{module:schemaModule,exports:schemaModule.exports});
 const previous=JSON.parse(schemaModule.exports.default.export()),next=structuredClone(previous);
 const bundled=esbuild.buildSync({entryPoints:[path.join(repo,'convex/sleepTables.ts')],bundle:true,write:false,platform:'node',format:'cjs',external:['convex/server','convex/values']}).outputFiles[0].text;
 const tableModule={exports:{}};vm.runInNewContext(bundled,{module:tableModule,exports:tableModule.exports,require});
 const updated=JSON.parse(defineSchema(tableModule.exports.sleepTables).export()).tables;
 const replacement=updated.find(t=>t.tableName==='sleepMembers');
 assert.ok(replacement, 'Missing member schema');
 const oldMember=previous.tables.find(t=>t.tableName==='sleepMembers');
 const withoutProvider=structuredClone(replacement);delete withoutProvider.documentType.value.provider;
 const oldWithoutProvider=structuredClone(oldMember);delete oldWithoutProvider.documentType.value.provider;
 assert.deepEqual(withoutProvider.documentType,oldWithoutProvider.documentType,'Unexpected changes beyond provider field');
 assert.deepEqual(replacement.indexes,oldMember.indexes,'Unexpected index changes');
 next.tables=next.tables.map(t=>t.tableName==='sleepMembers'?{...t,documentType:{...t.documentType,value:{...t.documentType.value,provider:replacement.documentType.value.provider}}}:t);
 schema.source='const schema='+JSON.stringify(JSON.stringify(next))+'; export default {export(){return schema;}};';
 const modules=['sleepGroups'].map(name=>({path:name+'.js',environment:'isolate',source:esbuild.buildSync({entryPoints:[path.join(repo,'convex',name+'.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'esnext'}).outputFiles[0].text}));
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
 const diff=await call('/api/deploy2/finish_push',{startPush:start,dryRun:!apply,message:'Daylight: explicit provider selection for private group sharing'},true);
 // Never print startPush, which contains environment variables.
 fs.writeFileSync(path.join(backups,'deployment-diff.json'),JSON.stringify(diff),{mode:0o600});
 if(apply){
  const after=await call('/api/get_config',{version:'1.41.0'});assert.equal(after.modules.length,snapshot.modules.length);
  for(const m of snapshot.modules)if(!replaced.has(m.path))assert.deepEqual(after.modules.find(n=>n.path===m.path&&n.environment===m.environment),m,'Unrelated module changed '+m.path);
  for(const module of modules)assert.equal(after.modules.find(m=>m.path===module.path).source,module.source);
 }
 console.log(JSON.stringify({applied:apply,preservedModules:request.appDefinition.unchangedModuleHashes.length,changedModules:modules.map(m=>m.path),backup:backups}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
