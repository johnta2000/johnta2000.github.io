// Preserve the live shared backend and add only Burgery. Credentials remain in memory.
// Dry-run by default; --publish deploys after a second live snapshot comparison.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const deployment='rapid-shark-565';
(async()=>{
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const response=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':'npm-cli-1.41.0'},body:JSON.stringify({selectedDeploymentName:deployment,projectSelection:{kind:'deploymentName',deploymentName:deployment}}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Convex authorization failed: '+response.status);
 const auth=await response.json();assert.equal(auth.url,`https://${deployment}.convex.cloud`);
 async function pull(){const res=await fetch(auth.url+'/api/get_config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:'1.41.0',adminKey:auth.adminKey}),signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error('Could not snapshot deployment');return res.json();}
 const before=await pull();
 const hashResponse=await fetch(auth.url+'/api/get_config_hashes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:'1.41.0',adminKey:auth.adminKey})});if(!hashResponse.ok)throw Error('Could not read runtime configuration');const hashes=await hashResponse.json();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'burgery-deploy-'));fs.mkdirSync(path.join(dir,'convex/_generated'),{recursive:true});
 fs.symlinkSync(path.join(root,'node_modules'),path.join(dir,'node_modules'));
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({type:'module',dependencies:{convex:'1.41.0'}}));
 fs.writeFileSync(path.join(dir,'convex.json'),JSON.stringify({functions:'convex/',...(hashes.nodeVersion?{node:{nodeVersion:hashes.nodeVersion}}:{})}));
 const ownFiles=fs.readdirSync(path.join(root,'convex')).filter(name=>/^burgery.*\.ts$/.test(name));
 const ownModules=new Set(ownFiles.map(name=>name.replace(/\.ts$/,'.js')));
 const allowed=new Set(['schema.js','http.js',...ownModules]);
 const stamp=Date.now();const schemaBase=`burgeryBaseSchema${stamp}.js`,httpBase=`burgeryBaseHttp${stamp}.js`;
 // Namespace every snapshot dependency by its original path and runtime. Earlier
 // snapshots can contain both _deps and preserved dependencies with the same hash.
 const snapshotPaths=new Map(before.modules.map(m=>[`${m.environment}:${m.path}`,m.path==='schema.js'?schemaBase:m.path==='http.js'?httpBase:m.path.startsWith('_')?`_burgerySnapshot${stamp}/${m.environment}/${m.path}`:m.path]));
 function preservedPath(module){return snapshotPaths.get(`${module.environment}:${module.path}`);}
 function rewrite(module){
  const file=preservedPath(module);
  return module.source.replace(/(["'])(\.\.?\/[^"']+)\1/g,(literal,quote,specifier)=>{
   const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(module.path),specifier));
   let target=snapshotPaths.get(`${module.environment}:${resolved}`);
   if(ownModules.has(resolved))target=resolved;
   if(!target)return literal;
   let relative=path.posix.relative(path.posix.dirname(file),target);if(!relative.startsWith('.'))relative='./'+relative;
   return quote+relative+quote;
  });
 }
 for(const module of before.modules){if(ownModules.has(module.path))continue;assert(!module.path.includes('..')&&!path.isAbsolute(module.path));const dest=path.join(dir,'convex',preservedPath(module));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,(module.environment==='node'?'"use node";\n':'')+rewrite(module));}
 for(const file of ['server.js','server.d.ts','dataModel.d.ts'])fs.copyFileSync(path.join(root,'convex/_generated',file),path.join(dir,'convex/_generated',file));
 for(const file of fs.readdirSync(path.join(root,'convex')).filter(name=>/^burgery.*\.ts$/.test(name)))fs.copyFileSync(path.join(root,'convex',file),path.join(dir,'convex',file));
 fs.mkdirSync(path.join(dir,'burgery'),{recursive:true});fs.copyFileSync(path.join(root,'burgery/customizations.js'),path.join(dir,'burgery/customizations.js'));
 fs.writeFileSync(path.join(dir,'convex/schema.ts'),`import { defineSchema } from 'convex/server';\nimport base from './${schemaBase}';\nimport { burgeryTables } from './burgeryTables';\nconst schema=defineSchema(burgeryTables);\nconst additions=JSON.parse((schema as any).export());\nconst preserved=JSON.parse(base.export());\nconst names=new Set(additions.tables.map((t:any)=>t.tableName));\n(schema as any).export=()=>JSON.stringify({...preserved,tables:[...preserved.tables.filter((t:any)=>!names.has(t.tableName)),...additions.tables]});\nexport default schema;\n`);
 fs.writeFileSync(path.join(dir,'convex/http.ts'),`import http from './${httpBase}';\nimport { receipt,preflight } from './burgeryHttp';\n// Replace only Burgery's three routes when they already exist in the live snapshot.\nfor(const method of ['GET','POST','OPTIONS'])http.exactRoutes.get('/burgery-receipt')?.delete(method);\nhttp.route({path:'/burgery-receipt',method:'GET',handler:receipt});\nhttp.route({path:'/burgery-receipt',method:'POST',handler:receipt});\nhttp.route({path:'/burgery-receipt',method:'OPTIONS',handler:preflight});\nexport default http;\n`);
 fs.writeFileSync(path.join(dir,'convex/tsconfig.json'),JSON.stringify({compilerOptions:{allowJs:true,checkJs:false,strict:true,moduleResolution:'Bundler',skipLibCheck:true,target:'ESNext',lib:['ES2023','dom'],module:'ESNext',isolatedModules:true,noEmit:true},include:['./burgery*.ts','./schema.ts'],exclude:['./_generated']}));
 const check=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(dir,'convex/tsconfig.json')],{encoding:'utf8'});if(check.status){console.error(check.stdout);throw Error('Burgery typecheck failed');}
 // Guard against accidentally editing anything outside the two deliberate wrappers.
 for(const module of before.modules.filter(m=>!allowed.has(m.path))){const file=preservedPath(module);assert(fs.readFileSync(path.join(dir,'convex',file),'utf8')===(module.environment==='node'?'"use node";\n':'')+rewrite(module),'Preserved module differs: '+module.path+' ('+module.environment+')');}
 assert(require('node:util').isDeepStrictEqual(await pull(),before),'The backend changed during preparation. Run again against the new snapshot.');
 console.log('Preserving',before.modules.length,'live modules. Burgery typecheck passed. Staging:',dir);
 const publish=process.argv.includes('--publish');
 const result=spawnSync(process.execPath,[path.join(root,'node_modules/convex/bin/main.js'),'deploy','--yes','--typecheck','disable','--codegen','disable',...(publish?[]:['--dry-run'])],{cwd:dir,env:{...process.env,CONVEX_SELF_HOSTED_URL:auth.url,CONVEX_SELF_HOSTED_ADMIN_KEY:auth.adminKey},encoding:'utf8',maxBuffer:20*1024*1024});
 fs.writeFileSync(path.join(dir,'deploy.log'),result.stdout+'\n'+result.stderr);
 console.log((result.stdout+'\n'+result.stderr).slice(-3000));
 if(result.status)throw Error('Convex deployment failed; see '+path.join(dir,'deploy.log'));
 fs.writeFileSync(path.join(os.tmpdir(),'burgery-latest-staging.txt'),dir);
 if(publish){const {ConvexHttpClient}=require(path.join(root,'node_modules/convex/browser'));const {anyApi}=require(path.join(root,'node_modules/convex/server'));const client=new ConvexHttpClient(auth.url);client.setAdminAuth(auth.adminKey);console.log('Imported starter ledger:',await client.mutation(anyApi.burgery.seed,{}));if(process.argv.includes('--update-niteharts'))console.log('Updated Niteharts details:',await client.mutation(anyApi.burgery.updateNitehartsDetails,{}));console.log('Burgery backend published.');}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
