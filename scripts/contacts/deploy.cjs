// Patch the current live router, preserving all other deployed code and settings.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {brotliCompressSync}=require('node:zlib'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),apply=process.argv.includes('--apply');
(async()=>{
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const response=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':'npm-cli-1.41.0'},body:JSON.stringify({selectedDeploymentName:'rapid-shark-565',projectSelection:{kind:'teamAndProjectSlugs',teamSlug:'john-ta-af559',projectSlug:'john-ta-projects'}})});
 assert(response.ok,'Backend authorization failed');const auth=await response.json();assert.equal(auth.url,'https://rapid-shark-565.convex.cloud');assert(auth.adminKey);
 const call=async(endpoint,data,compressed=false)=>{
  const body=JSON.stringify({...data,adminKey:auth.adminKey});
  const r=await fetch(auth.url+endpoint,{method:'POST',headers:{Authorization:`Convex ${auth.adminKey}`,'Content-Type':'application/json',...(compressed?{'Content-Encoding':'br'}:{})},body:compressed?brotliCompressSync(body):body});
  assert(r.ok,`${endpoint} failed (${r.status})`);const text=await r.text();return text?JSON.parse(text):{};
 };
 const snapshot=await call('/api/get_config',{version:'1.41.0'}),hashes=await call('/api/get_config_hashes',{version:'1.41.0'});
 if(process.argv.includes('--inspect')){console.log(JSON.stringify({snapshotKeys:Object.keys(snapshot),hashKeys:Object.keys(hashes),configKeys:Object.keys(snapshot.config||{}),nodeModuleCount:snapshot.modules.filter(m=>m.environment==='node').length}));return;}
 const externalImports=[...new Set(snapshot.modules.filter(m=>m.environment==='node').flatMap(m=>[...m.source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/g)].map(x=>x[1])).filter(x=>!x.startsWith('.')&&!x.startsWith('node:')&&!require('node:module').builtinModules.includes(x)))];
 assert(!externalImports.length||Array.isArray(hashes.nodeDependencies),'Unresolved live external dependencies');
 const nodeDependencies=hashes.nodeDependencies||[];
 const backup=fs.mkdtempSync('/private/tmp/contact-share-deploy-');fs.chmodSync(backup,0o700);fs.writeFileSync(path.join(backup,'modules.json'),JSON.stringify(snapshot),{mode:0o600});
 const schema={...snapshot.modules.find(m=>m.path==='schema.js')},router={...snapshot.modules.find(m=>m.path==='http.js')};
 assert(schema.source&&router.source,'Missing live schema/router');delete router.sourceMap;
 const match=router.source.match(/export\s*\{\s*(\w+)\s+as\s+default\s*\}/);assert(match,'Unrecognized live router export');
 if(!router.source.includes('endpoint as contactShareEndpoint')) {
  router.source=`import {endpoint as contactShareEndpoint} from './contactShareHttp.js';\n`+router.source+`\nfor(const method of ['POST','OPTIONS']) ${match[1]}.route({path:'/contact-share',method,handler:contactShareEndpoint});\n`;
 }
 const modules=[{path:'contactShareHttp.js',environment:'isolate',source:esbuild.buildSync({entryPoints:[path.join(root,'convex/contactShareHttp.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'esnext'}).outputFiles[0].text}];
 const replaced=new Set(['schema.js','http.js','contactShareHttp.js']);
 const unchanged=hashes.moduleHashes.filter(m=>!replaced.has(m.path)).map(m=>({path:m.path,environment:m.environment,sha256:m.hash}));
 const request={dryRun:!apply,functions:snapshot.config.functions,appDefinition:{definition:null,dependencies:[],schema,changedModules:[router,...modules],unchangedModuleHashes:unchanged,udfServerVersion:snapshot.udfServerVersion},componentDefinitions:[],nodeDependencies,...((hashes.nodeVersion||snapshot.nodeVersion)?{nodeVersion:hashes.nodeVersion||snapshot.nodeVersion}:{})};
 const start=await call('/api/deploy2/start_push',request,true);assert.equal(Object.keys(start.app?.childComponents||{}).length,0,'Unexpected components');
 let ready=false;for(let i=0;i<20;i++){const state=await call('/api/deploy2/wait_for_schema',{schemaChange:start.schemaChange,timeoutMs:1000,dryRun:!apply});if(state.type==='complete'){ready=true;break;}assert.equal(state.type,'inProgress','Schema validation failed');}assert(ready,'Schema validation timed out');
 const fingerprint=x=>JSON.stringify(x.moduleHashes.map(m=>[m.environment,m.path,m.hash]).sort());
 assert.equal(fingerprint(await call('/api/get_config_hashes',{version:'1.41.0'})),fingerprint(hashes),'Live backend changed; retry from a fresh snapshot');
 const diff=await call('/api/deploy2/finish_push',{startPush:start,dryRun:!apply,message:'Add expiring contact picker and server-checked vCard downloads'},true);
 fs.writeFileSync(path.join(backup,'diff.json'),JSON.stringify(diff),{mode:0o600});
 const component=diff.componentDiffs?.[''];
 if(apply){
  const after=await call('/api/get_config_hashes',{version:'1.41.0'});
  for(const m of unchanged)assert(after.moduleHashes.some(a=>a.path===m.path&&a.environment===m.environment&&a.hash===m.sha256),`Unrelated module changed: ${m.path}`);
  const beforeSchema=hashes.moduleHashes.find(m=>m.path==='schema.js'),afterSchema=after.moduleHashes.find(m=>m.path==='schema.js');assert.equal(afterSchema.hash,beforeSchema.hash,'Live schema changed');
 }
 const seedIndex=process.argv.indexOf('--config');
 if(apply&&seedIndex!==-1){
  const seed=JSON.parse(fs.readFileSync(process.argv[seedIndex+1],'utf8'));
  const get=await call('/api/query',{path:'_system/cli/queryEnvironmentVariables:get',args:{name:'CONTACT_SHARE_GROUPS'},format:'json'});
  assert.equal(get.status,'success','Cannot inspect existing contact configuration');
  const previous=get.value?JSON.parse(get.value.value):{};
  for(const [id,value]of Object.entries(seed)){
   assert(/^[a-f0-9]{32}$/.test(id));assert(!previous[id],'Group already exists; refusing to reset its expiration');
   assert(value.expiresAt>Date.now()&&value.expiresAt<=Date.now()+8*86400000);assert(value.contacts.length<=100);
  }
  await call('/api/update_environment_variables',{changes:[{name:'CONTACT_SHARE_GROUPS',value:JSON.stringify({...previous,...seed})}]});
  console.log('Private contact records stored with fixed expiration.');
 }
 console.log(JSON.stringify({applied:apply,preservedModules:unchanged.length,nodeDependencies:nodeDependencies.length,changedModules:['http.js','contactShareHttp.js'],added:component?.moduleDiff?.added,removed:component?.moduleDiff?.removed,backup}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
