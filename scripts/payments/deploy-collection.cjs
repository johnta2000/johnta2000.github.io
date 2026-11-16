// Deploys only collection calculations for statement reviews on top of the current deployed modules.
// Credentials remain in memory; unrelated local backend files are never bundled.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {brotliCompressSync}=require('node:zlib');
const {defineSchema,defineTable}=require('convex/server');
const {v}=require('convex/values');
const esbuild=require('esbuild');
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
  return response.json();
 };
 const before=await call('/api/get_config_hashes',{version:'1.41.0'});
 const snapshot=await call('/api/get_config',{version:'1.41.0'});
 const hashes=await call('/api/get_config_hashes',{version:'1.41.0'});
 const fingerprint=x=>JSON.stringify(x.moduleHashes.map(m=>[m.environment,m.path,m.hash]).sort());
 if(fingerprint(before)!==fingerprint(hashes))throw Error('Production changed while taking the snapshot; retry against latest');
 const backups=fs.mkdtempSync('/private/tmp/statement-collection-backup-');
 fs.chmodSync(backups,0o700);
 fs.writeFileSync(path.join(backups,'modules.json'),JSON.stringify(snapshot),{mode:0o600});
 const vm=require('node:vm'),bundled=esbuild.buildSync({entryPoints:[path.join(repo,'convex/statementTables.ts')],bundle:true,write:false,format:'cjs',platform:'node'}),schemaModule={exports:{}};
 vm.runInNewContext(bundled.outputFiles[0].text,{module:schemaModule,exports:schemaModule.exports,require});
 const local=JSON.parse(defineSchema(schemaModule.exports.statementTables).export()).tables.find(t=>t.tableName==='paymentStatementRows');
 const fields=Object.fromEntries(['collectionAllocation','collectionNote'].map(name=>[name,local.documentType.value[name]]));
 const schema={...snapshot.modules.find(m=>m.path==='schema.js')};
 if(!schema.source)throw Error('Missing schema');delete schema.sourceMap;
 const liveSchema=schema.source;
 schema.source=(await esbuild.build({stdin:{contents:`import schema from 'live-schema';const previous=schema.export.bind(schema);schema.export=()=>{const s=JSON.parse(previous());const fields=${JSON.stringify(fields)};const table=s.tables.find(t=>t.tableName==='paymentStatementRows');if(!table||table.documentType.type!=='object')throw Error('Missing statement row schema');for(const [name,field]of Object.entries(fields)){const old=table.documentType.value[name];if(old&&JSON.stringify(old)!==JSON.stringify(field))throw Error('Collection field changed; review latest schema');table.documentType.value[name]=field;}return JSON.stringify(s);};export default schema;`,resolveDir:repo},bundle:true,write:false,format:'esm',platform:'browser',target:'esnext',plugins:[{name:'preserve-live-schema',setup(build){build.onResolve({filter:/^live-schema$/},()=>({path:'schema',namespace:'live-schema'}));build.onLoad({filter:/.*/,namespace:'live-schema'},()=>({contents:liveSchema,loader:'js'}));}}]})).outputFiles[0].text;
 const modules=['statements'].map(name=>({path:name+'.js',environment:'isolate',source:esbuild.buildSync({entryPoints:[path.join(repo,'convex',name+'.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'esnext',external:['./cardPayments','./cardPayments.js']}).outputFiles[0].text.replaceAll('from \"./cardPayments\"','from \"./cardPayments.js\"')}));
 const replaced=new Set(['schema.js',...modules.map(m=>m.path)]);
 const exported=source=>{const blocks=[...source.matchAll(/export\s*\{([^}]+)\}/g)];if(!blocks.length)throw Error('Review the statement export format before deployment');return new Set(blocks.at(-1)[1].split(',').map(s=>s.trim().split(/\s+as\s+/).at(-1)).filter(Boolean));};
 const previousExports=exported(snapshot.modules.find(m=>m.path==='statements.js').source),nextExports=exported(modules[0].source);
 for(const name of previousExports)if(!nextExports.has(name))throw Error('Refusing to remove live statement function '+name);
 const request={dryRun:!apply,functions:snapshot.config.functions,appDefinition:{definition:null,dependencies:[],schema,changedModules:modules,unchangedModuleHashes:hashes.moduleHashes.filter(m=>!replaced.has(m.path)).map(m=>({path:m.path,environment:m.environment,sha256:m.hash})),udfServerVersion:snapshot.udfServerVersion},componentDefinitions:[],nodeDependencies:[]};
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
 if(fingerprint(latest)!==fingerprint(hashes))throw Error('Production changed during preparation; retry against latest');
 const diff=await call('/api/deploy2/finish_push',{startPush:start,dryRun:!apply,message:'Calculate what remains to collect after confirmed card payments'},true);
 // Never print startPush, which contains environment variables.
 fs.writeFileSync(path.join(backups,'deployment-diff.json'),JSON.stringify(diff),{mode:0o600});
 const component=diff.componentDiffs?.[''];
 if(apply){
  const after=await call('/api/get_config_hashes',{version:'1.41.0'});
  const map=new Map(after.moduleHashes.map(m=>[`${m.environment}:${m.path}`,m.hash]));
  for(const m of request.appDefinition.unchangedModuleHashes)if(map.get(`${m.environment}:${m.path}`)!==m.sha256)throw Error('Post-deploy preservation check failed for '+m.path);
 }
 console.log(JSON.stringify({applied:apply,preservedModules:request.appDefinition.unchangedModuleHashes.length,changedModules:request.appDefinition.changedModules.map(m=>m.path),backup:backups,addedModules:component?.moduleDiff?.added,removedModules:component?.moduleDiff?.removed,addedIndexes:component?.indexDiff?.added_indexes?.map(i=>i.name),removedIndexes:component?.indexDiff?.removed_indexes?.map(i=>i.name),authDiff:diff.authDiff},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
