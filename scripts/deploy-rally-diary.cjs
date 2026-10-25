// Replace only Rally diary functions. Defaults to a dry run.
// Preserve every other live function, auth configuration, schema, and runtime.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),deployment='dashing-heron-837';
const modules=path.resolve(process.env.RALLY_DEPLOY_NODE_MODULES||path.join(root,'node_modules'));
(async()=>{
 const version=require(path.join(modules,'convex/package.json')).version;
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const response=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':`npm-cli-${version}`},body:JSON.stringify({selectedDeploymentName:deployment,projectSelection:{kind:'deploymentName',deploymentName:deployment}}),signal:AbortSignal.timeout(30000)});
 assert(response.ok,'Backend authorization failed');const auth=await response.json();assert.equal(auth.url,`https://${deployment}.convex.cloud`);
 async function request(endpoint,body={}){const res=await fetch(auth.url+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,adminKey:auth.adminKey,...body}),signal:AbortSignal.timeout(30000)});assert(res.ok,endpoint+': '+res.status);return res.json();}
 const before=await request('/api/get_config'),hashes=await request('/api/get_config_hashes');
 const collection=before.modules.find(m=>m.path==='rallyCollection.js');assert(collection,'Live diary module missing');
 if(process.argv.includes('--inspect')){console.log(JSON.stringify({runtime:before.udfServerVersion,modules:before.modules.length,exports:collection.source.slice(collection.source.lastIndexOf('export {'))},null,2));return;}
 assert.equal(version,before.udfServerVersion,'Use RALLY_DEPLOY_NODE_MODULES matching the live Convex runtime');
 const {buildSync}=require('esbuild');
 const patched=buildSync({entryPoints:[path.join(root,'convex/rallyCollection.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['convex/*']}).outputFiles[0].text;
 const expected=['draftFromEvent','importEntries','list','remove','save'];
 const liveExports=collection.source.slice(collection.source.lastIndexOf('export {')+8).split('}')[0].split(',').map(s=>s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
 assert.deepEqual(liveExports.filter(n=>n!=='createPlan').sort(),expected.sort(),'Unexpected live diary exports; preserve any newer functions before deploying');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rally-diary-upcoming-deploy-')),stamp=Date.now();
 const paths=new Map(before.modules.map(m=>[`${m.environment}:${m.path}`,m.path.startsWith('_')?`_auditSnapshot${stamp}/${m.environment}/${m.path}`:m.path]));
 const destination=module=>paths.get(`${module.environment}:${module.path}`);
 const rewrite=module=>module.source.replace(/(["'])(\.\.?\/[^"']+)\1/g,(literal,quote,specifier)=>{const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(module.path),specifier)),target=paths.get(`${module.environment}:${resolved}`);if(!target)return literal;let relative=path.posix.relative(path.posix.dirname(destination(module)),target);if(!relative.startsWith('.'))relative='./'+relative;return quote+relative+quote;});
 fs.mkdirSync(path.join(dir,'convex'),{recursive:true});fs.symlinkSync(modules,path.join(dir,'node_modules'));
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({type:'module',dependencies:{convex:version}}));
 fs.writeFileSync(path.join(dir,'convex.json'),JSON.stringify({functions:'convex/',...(hashes.nodeVersion?{node:{nodeVersion:hashes.nodeVersion}}:{})}));
 assert(before.modules.some(m=>/^auth\.config\.[jt]s$/.test(m.path)),'Live authentication config required');
 for(const module of before.modules){
  assert(!module.path.includes('..')&&!path.isAbsolute(module.path));const file=path.join(dir,'convex',destination(module));fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,(module.environment==='node'?'"use node";\n':'')+rewrite(module===collection?{...module,source:patched}:module));
 }
 for(const module of before.modules.filter(m=>m!==collection))assert.equal(fs.readFileSync(path.join(dir,'convex',destination(module)),'utf8'),(module.environment==='node'?'"use node";\n':'')+rewrite(module));
 assert.deepEqual(await request('/api/get_config'),before,'Backend changed during preparation. Retry with the latest snapshot.');
 console.log(JSON.stringify({module:"rallyCollection",unchangedModules:before.modules.length-1,runtime:version,staging:dir}));
 const publish=process.argv.includes('--publish');
 const result=spawnSync(process.execPath,[path.join(modules,'convex/bin/main.js'),'deploy','--yes','--typecheck','disable','--codegen','disable',...(publish?[]:['--dry-run'])],{cwd:dir,env:{...process.env,CONVEX_SELF_HOSTED_URL:auth.url,CONVEX_SELF_HOSTED_ADMIN_KEY:auth.adminKey},encoding:'utf8',maxBuffer:20*1024*1024});
 console.log((result.stdout+'\n'+result.stderr).slice(-4500));assert.equal(result.status,0,'Rally action deployment failed');
if(publish){const after=await request('/api/get_config');assert.deepEqual(after.config,before.config);assert.equal(after.udfServerVersion,before.udfServerVersion);assert.equal((await request('/api/get_config_hashes')).nodeVersion??null,hashes.nodeVersion??null);const source=after.modules.find(m=>m.path==='rallyCollection.js')?.source;assert(source?.includes('createPlan'));console.log('Verified diary update. No account records were modified by deployment.');}

})().catch(error=>{console.error(error.message);process.exitCode=1;});
