// Deploy only the palette validator, preserving the current live backend.
// Dry-run by default. --publish deploys; --apply-festival-palettes only updates
// the two explicitly named rooms using the existing admin-only theme mutation.
// RALLY_DEPLOY_NODE_MODULES must point to the live Convex version when the
// checkout's installed CLI differs; a runtime upgrade is intentionally refused.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),deployment='dashing-heron-837';
const modules=path.resolve(process.env.RALLY_DEPLOY_NODE_MODULES||path.join(root,'node_modules'));
const targets=[['decadence-digital-city-2026','decadence'],['edc-las-vegas-2027','edc']];
(async()=>{
 const version=require(path.join(modules,'convex/package.json')).version;
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const response=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':`npm-cli-${version}`},body:JSON.stringify({selectedDeploymentName:deployment,projectSelection:{kind:'deploymentName',deploymentName:deployment}}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Backend authorization failed: '+response.status);
 const auth=await response.json();assert.equal(auth.url,`https://${deployment}.convex.cloud`);
 async function request(endpoint,body){const res=await fetch(auth.url+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,adminKey:auth.adminKey,...body}),signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error(endpoint+': '+res.status);return res.json();}
 async function rooms(){
  const source=`import {query} from "convex:/_system/repl/wrappers.js";export default query({handler:async(ctx)=>Promise.all(${JSON.stringify(targets.map(([id])=>id))}.map(async id=>{const doc=await ctx.db.query('warRoomState').withIndex('by_board',q=>q.eq('boardId','rally:'+id)).unique();if(!doc?.buckets)throw Error('Requested room unavailable: '+id);return {id,state:doc.buckets};}))});`;
  const result=await request('/api/run_test_function',{args:{},bundle:{path:'testQuery.js',source},format:'convex_encoded_json'});assert.equal(result.status,'success','Room inspection failed');return result.value;
 }
 if(process.argv.includes('--apply-festival-palettes')){
  const frontend=await fetch('https://www.john-ta.com/tools/rally/project-theme.js?verify='+Date.now()).then(r=>{assert(r.ok);return r.text();});
  for(const [,theme]of targets)assert(frontend.includes(`id:'${theme}'`),'Publish the palette registry before changing room settings');
  const {ConvexHttpClient}=require(path.join(modules,'convex/browser')),{anyApi}=require(path.join(modules,'convex/server'));
  for(const [eventId,theme]of targets){
   const before=(await rooms()).find(room=>room.id===eventId).state;
   const admin=before.members.find(person=>['admin','leader'].includes(person.role)&&person.clerkSubject);assert(admin,'Existing provisioned room admin required');
   const issuer='https://clerk.john-ta.com',subject=admin.clerkSubject;
   const client=new ConvexHttpClient(auth.url);client.setAdminAuth(auth.adminKey,{subject,issuer,tokenIdentifier:`${issuer}|${subject}`,email:admin.email||'',emailVerified:true});
   const saved=await client.mutation(anyApi.rallyThemes.save,{eventId,theme});assert.equal(saved.projectTheme,theme);
   const after=(await rooms()).find(room=>room.id===eventId).state;
   const withoutTheme=state=>{const {projectTheme,...rest}=state;return rest;};
   assert.equal(after.projectTheme,theme);assert.deepEqual(withoutTheme(after),withoutTheme(before),'Non-theme room data changed; inspect before proceeding');
   console.log(JSON.stringify({eventId,previous:before.projectTheme||'warm',projectTheme:theme,otherFieldsUnchanged:true}));
  }
  return;
 }
 const before=await request('/api/get_config',{}),hashes=await request('/api/get_config_hashes',{});
 assert(before.modules.some(m=>m.path==='rallyThemes.js'),'Live theme module missing');
 if(process.argv.includes('--inspect')){console.log(JSON.stringify({keys:Object.keys(before),configKeys:Object.keys(before.config||{}),udfServerVersion:before.udfServerVersion,nodeVersion:hashes.nodeVersion,configNodeVersion:before.config?.nodeVersion,authModules:before.modules.filter(m=>/auth.config/.test(m.path)).map(m=>m.path),moduleCount:before.modules.length,rooms:(await rooms()).map(({id,state})=>({id,name:state.name,theme:state.projectTheme||'warm'}))}));return;}
 assert.equal(version,before.udfServerVersion,'Use RALLY_DEPLOY_NODE_MODULES with the live Convex version; this update must not upgrade the shared runtime');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rally-festival-themes-')),stamp=Date.now();
 const paths=new Map(before.modules.map(m=>[`${m.environment}:${m.path}`,m.path.startsWith('_')?`_themeSnapshot${stamp}/${m.environment}/${m.path}`:m.path]));
 const destination=module=>paths.get(`${module.environment}:${module.path}`);
 const rewrite=module=>module.source.replace(/(["'])(\.\.?\/[^"']+)\1/g,(literal,quote,specifier)=>{const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(module.path),specifier)),target=paths.get(`${module.environment}:${resolved}`);if(!target)return literal;let relative=path.posix.relative(path.posix.dirname(destination(module)),target);if(!relative.startsWith('.'))relative='./'+relative;return quote+relative+quote;});
 fs.mkdirSync(path.join(dir,'convex/_generated'),{recursive:true});fs.symlinkSync(modules,path.join(dir,'node_modules'));
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({type:'module',dependencies:{convex:version}}));
 fs.writeFileSync(path.join(dir,'convex.json'),JSON.stringify({functions:'convex/',...(hashes.nodeVersion?{node:{nodeVersion:hashes.nodeVersion}}:{})}));
 for(const module of before.modules){if(module.path==='rallyThemes.js')continue;assert(!module.path.includes('..')&&!path.isAbsolute(module.path));const file=path.join(dir,'convex',destination(module));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,(module.environment==='node'?'"use node";\n':'')+rewrite(module));}
 // Refuse to infer authentication settings from a stale source checkout.
 assert(before.modules.some(m=>/^auth\.config\.[jt]s$/.test(m.path)),'Live auth module must be present in the snapshot');
 for(const file of ['server.js','server.d.ts','dataModel.d.ts'])fs.copyFileSync(path.join(root,'convex/_generated',file),path.join(dir,'convex/_generated',file));
 fs.copyFileSync(path.join(root,'convex/rallyThemes.ts'),path.join(dir,'convex/rallyThemes.ts'));
 for(const module of before.modules.filter(m=>m.path!=='rallyThemes.js'))assert.equal(fs.readFileSync(path.join(dir,'convex',destination(module)),'utf8'),(module.environment==='node'?'"use node";\n':'')+rewrite(module),'Unrelated module changed: '+module.path);
 assert.deepEqual(await request('/api/get_config',{}),before,'Backend changed during preparation; retry against its latest snapshot');
 console.log('Preserving',before.modules.length-1,'live modules. Only rallyThemes is replaced. Staging:',dir);
 const publish=process.argv.includes('--publish');
 const result=spawnSync(process.execPath,[path.join(modules,'convex/bin/main.js'),'deploy','--yes','--typecheck','disable','--codegen','disable',...(publish?[]:['--dry-run'])],{cwd:dir,env:{...process.env,CONVEX_SELF_HOSTED_URL:auth.url,CONVEX_SELF_HOSTED_ADMIN_KEY:auth.adminKey},encoding:'utf8',maxBuffer:20*1024*1024});
 console.log((result.stdout+'\n'+result.stderr).slice(-5000));if(result.status)throw Error('Theme deployment failed');
 if(publish){const after=await request('/api/get_config',{});assert.deepEqual(after.config,before.config,'Shared configuration changed');assert.equal(after.udfServerVersion,before.udfServerVersion,'Shared runtime changed');console.log('Theme validator published; room data has not been modified.');}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
