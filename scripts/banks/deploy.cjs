// Deploys only bank history on top of the current deployed modules.
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
 const backups=fs.mkdtempSync('/private/tmp/bank-history-backup-');
 fs.chmodSync(backups,0o700);
 fs.writeFileSync(path.join(backups,'modules.json'),JSON.stringify(snapshot),{mode:0o600});
 const bundled=esbuild.buildSync({entryPoints:[path.join(repo,'convex/bankArchiveTables.ts')],bundle:true,write:false,format:'cjs',platform:'node',external:['convex/server','convex/values']}).outputFiles[0].text;
 const mod={exports:{}};new Function('require','module','exports',bundled)(require,mod,mod.exports);
 const tables=JSON.parse(defineSchema(mod.exports.bankArchiveTables).export()).tables;
 const schema={...snapshot.modules.find(m=>m.path==='schema.js')};
 if(!schema.source)throw Error('Missing schema');delete schema.sourceMap;
 const match=schema.source.match(/export\s*\{\s*(\w+)\s+as\s+default\s*\}/);
 if(!match)throw Error('Unrecognized schema export');const schemaName=match[1];
 schema.source+=`\n(()=>{const previous=${schemaName}.export.bind(${schemaName});${schemaName}.export=()=>{const s=JSON.parse(previous());const tables=${JSON.stringify(tables)};const names=new Set(tables.map(t=>t.tableName));s.tables=s.tables.filter(t=>!names.has(t.tableName)).concat(tables);return JSON.stringify(s);};})();\n`;
 const modules=['bankArchive','bankArchiveHttp'].map(name=>({path:name+'.js',environment:'isolate',source:esbuild.buildSync({entryPoints:[path.join(repo,'convex',name+'.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'esnext'}).outputFiles[0].text}));
 const http={...snapshot.modules.find(m=>m.path==='http.js')};delete http.sourceMap;
 const httpMatch=http.source.match(/export\s*\{\s*(\w+)\s+as\s+default\s*\}/);if(!httpMatch)throw Error('Unknown router export');
 const router=httpMatch[1];
 http.source="import {pdf as bankPdf,preflight as bankPreflight} from './bankArchiveHttp.js';\n"+http.source;
 http.source+=`\nfor(const method of ['GET','OPTIONS'])${router}.exactRoutes.get('/bank-archive-pdf')?.delete(method);${router}.route({path:'/bank-archive-pdf',method:'GET',handler:bankPdf});${router}.route({path:'/bank-archive-pdf',method:'OPTIONS',handler:bankPreflight});\n`;
 modules.push(http);
 const replaced=new Set(['schema.js',...modules.map(m=>m.path)]);
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
 const fingerprint=x=>JSON.stringify(x.moduleHashes.map(m=>[m.path,m.hash]).sort());
 if(fingerprint(latest)!==fingerprint(hashes))throw Error('Production changed during preparation; retry against latest');
 const diff=await call('/api/deploy2/finish_push',{startPush:start,dryRun:!apply,message:'Add private bank transaction and statement archive'},true);
 // Never print startPush, which contains environment variables.
 fs.writeFileSync(path.join(backups,'deployment-diff.json'),JSON.stringify(diff),{mode:0o600});
 const component=diff.componentDiffs?.[''];
 console.log(JSON.stringify({applied:apply,preservedModules:request.appDefinition.unchangedModuleHashes.length,changedModules:request.appDefinition.changedModules.map(m=>m.path),backup:backups,addedModules:component?.moduleDiff?.added,removedModules:component?.moduleDiff?.removed,addedIndexes:component?.indexDiff?.added_indexes?.map(i=>i.name),removedIndexes:component?.indexDiff?.removed_indexes?.map(i=>i.name),authDiff:diff.authDiff},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
