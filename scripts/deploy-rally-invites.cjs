// Add only rallyInvites, preserving the latest live schema, functions, auth and
// runtime. No project records or invitations are created by this deployment.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),deployment='dashing-heron-837';
const modules=path.resolve(process.env.RALLY_DEPLOY_NODE_MODULES||path.join(root,'node_modules'));
(async()=>{
 const version=require(path.join(modules,'convex/package.json')).version,credentials=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const response=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:'Bearer '+credentials.accessToken,'Content-Type':'application/json','Convex-Client':'npm-cli-'+version},body:JSON.stringify({selectedDeploymentName:deployment,projectSelection:{kind:'deploymentName',deploymentName:deployment}}),signal:AbortSignal.timeout(30000)});
 assert(response.ok,'Backend authorization failed');const auth=await response.json();assert.equal(auth.url,'https://'+deployment+'.convex.cloud');
 async function request(endpoint,body={}){const res=await fetch(auth.url+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,adminKey:auth.adminKey,...body}),signal:AbortSignal.timeout(30000)});assert(res.ok,endpoint+': '+res.status);return res.json();}
 const before=await request('/api/get_config'),hashes=await request('/api/get_config_hashes');
 if(process.argv.includes('--inspect')){console.log(JSON.stringify({runtime:before.udfServerVersion,nodeVersion:hashes.nodeVersion,moduleCount:before.modules.length,invitesPresent:before.modules.some(m=>m.path==='rallyInvites.js')}));return;}
 assert.equal(version,before.udfServerVersion,'Use dependencies matching the current live runtime.');
 assert(before.modules.some(m=>/^auth\.config\.[jt]s$/.test(m.path)),'Live authentication configuration required');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rally-invites-deploy-')),stamp=Date.now();
 const originals=before.modules.filter(m=>m.path!=='rallyInvites.js');
 const paths=new Map(originals.map(m=>[`${m.environment}:${m.path}`,m.path.startsWith('_')?`_inviteSnapshot${stamp}/${m.environment}/${m.path}`:m.path]));
 const destination=module=>paths.get(`${module.environment}:${module.path}`);
 const rewrite=module=>module.source.replace(/(["'])(\.\.?\/[^"']+)\1/g,(literal,quote,specifier)=>{const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(module.path),specifier)),target=paths.get(`${module.environment}:${resolved}`);if(!target)return literal;let relative=path.posix.relative(path.posix.dirname(destination(module)),target);if(!relative.startsWith('.'))relative='./'+relative;return quote+relative+quote;});
 fs.mkdirSync(path.join(dir,'convex/_generated'),{recursive:true});fs.symlinkSync(modules,path.join(dir,'node_modules'));
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({type:'module',dependencies:{convex:version}}));
 fs.writeFileSync(path.join(dir,'convex.json'),JSON.stringify({functions:'convex/',...(hashes.nodeVersion?{node:{nodeVersion:hashes.nodeVersion}}:{})}));
 for(const module of originals){assert(!module.path.includes('..')&&!path.isAbsolute(module.path));const file=path.join(dir,'convex',destination(module));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,(module.environment==='node'?'"use node";\n':'')+rewrite(module));}
 for(const file of ['server.js','server.d.ts','dataModel.d.ts'])fs.copyFileSync(path.join(root,'convex/_generated',file),path.join(dir,'convex/_generated',file));
 fs.copyFileSync(path.join(root,'convex/rallyInvites.ts'),path.join(dir,'convex/rallyInvites.ts'));
 for(const module of originals)assert.equal(fs.readFileSync(path.join(dir,'convex',destination(module)),'utf8'),(module.environment==='node'?'"use node";\n':'')+rewrite(module));
 assert.deepEqual(await request('/api/get_config'),before,'The backend changed during preparation. Retry against its latest snapshot.');
 console.log(JSON.stringify({preservedModules:originals.length,newModule:'rallyInvites',runtime:version,staging:dir}));
 const publish=process.argv.includes('--publish');
 const result=spawnSync(process.execPath,[path.join(modules,'convex/bin/main.js'),'deploy','--yes','--typecheck','disable','--codegen','disable',...(publish?[]:['--dry-run'])],{cwd:dir,env:{...process.env,CONVEX_SELF_HOSTED_URL:auth.url,CONVEX_SELF_HOSTED_ADMIN_KEY:auth.adminKey},encoding:'utf8',maxBuffer:20*1024*1024});
 console.log((result.stdout+'\n'+result.stderr).slice(-4000));assert.equal(result.status,0,'Invitation deployment failed');
 if(publish){const after=await request('/api/get_config');assert.deepEqual(after.config,before.config);assert.equal(after.udfServerVersion,before.udfServerVersion);assert.equal((await request('/api/get_config_hashes')).nodeVersion??null,hashes.nodeVersion??null);assert(after.modules.some(m=>m.path==='rallyInvites.js'));console.log('Verified invitation module, unchanged shared configuration and runtime. No project records were changed.');}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
