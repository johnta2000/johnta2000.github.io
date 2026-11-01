// Deploys only Apartment sharing on top of the current deployed modules.
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
 const snapshot=await call('/api/get_config',{version:'1.41.0'});
 const hashes=await call('/api/get_config_hashes',{version:'1.41.0'});
 const backups=fs.mkdtempSync('/private/tmp/apartment-production-backup-');
 fs.chmodSync(backups,0o700);
 fs.writeFileSync(path.join(backups,'modules.json'),JSON.stringify(snapshot),{mode:0o600});
 const table=JSON.parse(defineSchema({apartmentShareLinks:defineTable({tokenHash:v.string(),key:v.string(),expiresAt:v.number()}).index('by_token',['tokenHash'])}).export()).tables[0];
 const schema={...snapshot.modules.find(m=>m.path==='schema.js')};
 const router={...snapshot.modules.find(m=>m.path==='http.js')};
 for(const m of [schema,router]){if(!m.source)throw Error('Missing current module');delete m.sourceMap;}
 const defaultName=m=>{const match=m.source.match(/export\s*\{\s*(\w+)\s+as\s+default\s*\}/);if(!match)throw Error('Unrecognized deployed export');return match[1];};
 const schemaName=defaultName(schema),routerName=defaultName(router);
 schema.source+=`\nconst apartmentPreviousSchemaExport=${schemaName}.export.bind(${schemaName});\n${schemaName}.export=()=>{const s=JSON.parse(apartmentPreviousSchemaExport());s.tables=s.tables.filter(t=>t.tableName!=="apartmentShareLinks").concat(${JSON.stringify(table)});return JSON.stringify(s);};\n`;
 router.source=`import {endpoint as apartmentShareEndpoint} from './apartmentShareHttp.js';\n`+router.source+`\nfor(const method of ['GET','POST','OPTIONS']) { ${routerName}.exactRoutes.get('/apartment-share')?.delete(method); ${routerName}.route({path:'/apartment-share',method,handler:apartmentShareEndpoint}); }\n`;
 const modules=['apartmentSharing','apartmentShareHttp'].map(name=>({path:name+'.js',environment:'isolate',source:esbuild.buildSync({entryPoints:[path.join(repo,'convex',name+'.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'esnext'}).outputFiles[0].text}));
 const replaced=new Set(['schema.js','http.js',...modules.map(m=>m.path)]);
 const request={dryRun:!apply,functions:snapshot.config.functions,appDefinition:{definition:null,dependencies:[],schema,changedModules:[router,...modules],unchangedModuleHashes:hashes.moduleHashes.filter(m=>!replaced.has(m.path)).map(m=>({path:m.path,environment:m.environment,sha256:m.hash})),udfServerVersion:snapshot.udfServerVersion},componentDefinitions:[],nodeDependencies:[]};
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
 const diff=await call('/api/deploy2/finish_push',{startPush:start,dryRun:!apply,message:'Add 24-hour apartment guide sharing'},true);
 // Never print startPush, which contains environment variables.
 fs.writeFileSync(path.join(backups,'deployment-diff.json'),JSON.stringify(diff),{mode:0o600});
 const component=diff.componentDiffs?.[''];
 console.log(JSON.stringify({applied:apply,preservedModules:request.appDefinition.unchangedModuleHashes.length,changedModules:request.appDefinition.changedModules.map(m=>m.path),backup:backups,addedModules:component?.moduleDiff?.added,removedModules:component?.moduleDiff?.removed,addedIndexes:component?.indexDiff?.added_indexes?.map(i=>i.name),removedIndexes:component?.indexDiff?.removed_indexes?.map(i=>i.name),authDiff:diff.authDiff},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
