// Narrow maintenance of existing Rally action branches. Defaults to a dry run.
// Preserve every other live function, auth configuration, schema, and runtime.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{transformSync}=require('esbuild');
const root=path.resolve(__dirname,'..'),deployment='dashing-heron-837';
const modules=path.resolve(process.env.RALLY_DEPLOY_NODE_MODULES||path.join(root,'node_modules'));
const actions=['save-room','assign-room','save-lineup-artist'];
function actionRange(source,action,argument='args'){
 const marker=`} else if (${argument}.action === "${action}") {`,start=source.indexOf(marker);
 assert(start>=0,'Missing live branch: '+action);assert.equal(source.indexOf(marker,start+1),-1,'Ambiguous branch: '+action);
 const from=start+marker.length,to=source.indexOf('} else if (',from);assert(to>from,'Missing branch end');return {from,to};
}
(async()=>{
 const version=require(path.join(modules,'convex/package.json')).version;
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const response=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':`npm-cli-${version}`},body:JSON.stringify({selectedDeploymentName:deployment,projectSelection:{kind:'deploymentName',deploymentName:deployment}}),signal:AbortSignal.timeout(30000)});
 assert(response.ok,'Backend authorization failed');const auth=await response.json();assert.equal(auth.url,`https://${deployment}.convex.cloud`);
 async function request(endpoint,body={}){const res=await fetch(auth.url+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,adminKey:auth.adminKey,...body}),signal:AbortSignal.timeout(30000)});assert(res.ok,endpoint+': '+res.status);return res.json();}
 if(process.argv.includes('--health')){
  const source=`import {query} from "convex:/_system/repl/wrappers.js";
   export default query({handler:async(ctx)=>{
    const docs=await ctx.db.query('warRoomState').withIndex('by_board',q=>q.gte('boardId','rally:').lt('boardId','rally;')).collect();
    return docs.map(doc=>{const s=doc.buckets||{},members=new Set((s.members||[]).map(m=>m.id)),issues=[];
     const validDate=value=>/^\\d{4}-\\d{2}-\\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00Z'))&&new Date(value+'T00:00Z').toISOString().slice(0,10)===value;
     if(!validDate(s.startsAt)||!validDate(s.endsAt)||s.endsAt<s.startsAt)issues.push('Invalid event dates');
     if(!(s.members||[]).some(m=>['admin','leader'].includes(m.role)))issues.push('No project admin');
     if(s.eventTimeZone)try{new Intl.DateTimeFormat('en-US',{timeZone:s.eventTimeZone}).format();}catch{issues.push('Invalid timezone');}
     for(const r of s.rooms||[]){if(!Number.isInteger(r.capacity)||r.capacity<1)issues.push('Invalid room capacity');if((r.memberIds||[]).length>r.capacity)issues.push('Room over capacity');if((r.memberIds||[]).some(id=>!members.has(id)))issues.push('Departed member assigned to room');}
     for(const p of s.passes||[]){const quantity=Number(p.quantity||1);if(!Number.isInteger(quantity)||quantity<1)issues.push('Invalid ticket quantity');const slots=new Set();for(const a of p.ticketAssignments||[]){if(!Number.isInteger(a.slot)||a.slot<0||a.slot>=quantity||slots.has(a.slot))issues.push('Invalid ticket slot');slots.add(a.slot);}}
     for(const a of s.lineup||[])if(a.start&&a.end&&a.end<=a.start)issues.push('Set end before start');
     return {id:s.id,members:members.size,rooms:(s.rooms||[]).length,purchases:(s.passes||[]).length,sets:(s.lineup||[]).length,theme:s.projectTheme||'warm',issues:[...new Set(issues)]};
    });
   }});`;
  const result=await request('/api/run_test_function',{args:{},bundle:{path:'testQuery.js',source},format:'convex_encoded_json'});assert.equal(result.status,'success');console.log(JSON.stringify({readOnly:true,rooms:result.value},null,2));return;
 }
 const before=await request('/api/get_config'),hashes=await request('/api/get_config_hashes');
 const rally=before.modules.find(m=>m.path==='rally.js');assert(rally,'Live Rally module missing');
 if(process.argv.includes('--inspect')){
  console.log(JSON.stringify({runtime:before.udfServerVersion,modules:before.modules.length,branches:actions.map(action=>{const start=rally.source.indexOf('"'+action+'"');return {action,source:rally.source.slice(Math.max(0,start-90),start+1600)};})},null,2));return;
 }
 assert.equal(version,before.udfServerVersion,'Use RALLY_DEPLOY_NODE_MODULES matching the live Convex runtime');
 const local=fs.readFileSync(path.join(root,'convex/rally.ts'),'utf8');let patched=rally.source;
 const argument=rally.source.match(/} else if \((\w+)\.action === "assign-room"\)/)?.[1];assert(argument,'Cannot resolve deployed action argument');
 const lineupRange=actionRange(rally.source,'save-lineup-artist',argument),liveLineup=rally.source.slice(lineupRange.from,lineupRange.to);
 const bindings={state:liveLineup.match(/(\w+)\.lineup \|\|= \[\]/)?.[1],p:liveLineup.match(/name: String\((\w+)\.name/)?.[1],current:liveLineup.match(/\.includes\((\w+)\.role\)/)?.[1],id:liveLineup.match(/\.lineup\.push\(\{ id: (\w+)\(\)/)?.[1]};
 for(const [name,value]of Object.entries(bindings))assert(value&&/^\w+$/.test(value),'Cannot resolve deployed binding: '+name);
 for(const action of actions){
  const {from,to}=actionRange(local,action),replacement=transformSync(local.slice(from,to),{loader:'ts'}).code.replaceAll('new ConvexError(', 'new RallyAuditError(');
  const range=actionRange(patched,action,argument);
  const aliases=Object.entries(bindings).map(([name,value])=>`${name}=${value}`).join(',');
  patched=patched.slice(0,range.from)+'\n{const '+aliases+';\n'+replacement+'}\n'+patched.slice(range.to);
 }
 // Prove all code outside these explicit action bodies is byte-for-byte intact.
 const redact=source=>{for(const action of actions){const {from,to}=actionRange(source,action,argument);source=source.slice(0,from)+'<approved-action-body>'+source.slice(to);}return source;};
 assert.equal(redact(patched),redact(rally.source));
 assert(!patched.includes('import { ConvexError as RallyAuditError }'));
 patched='import { ConvexError as RallyAuditError } from "convex/values";\n'+patched;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rally-audit-deploy-')),stamp=Date.now();
 const paths=new Map(before.modules.map(m=>[`${m.environment}:${m.path}`,m.path.startsWith('_')?`_auditSnapshot${stamp}/${m.environment}/${m.path}`:m.path]));
 const destination=module=>paths.get(`${module.environment}:${module.path}`);
 const rewrite=module=>module.source.replace(/(["'])(\.\.?\/[^"']+)\1/g,(literal,quote,specifier)=>{const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(module.path),specifier)),target=paths.get(`${module.environment}:${resolved}`);if(!target)return literal;let relative=path.posix.relative(path.posix.dirname(destination(module)),target);if(!relative.startsWith('.'))relative='./'+relative;return quote+relative+quote;});
 fs.mkdirSync(path.join(dir,'convex'),{recursive:true});fs.symlinkSync(modules,path.join(dir,'node_modules'));
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({type:'module',dependencies:{convex:version}}));
 fs.writeFileSync(path.join(dir,'convex.json'),JSON.stringify({functions:'convex/',...(hashes.nodeVersion?{node:{nodeVersion:hashes.nodeVersion}}:{})}));
 assert(before.modules.some(m=>/^auth\.config\.[jt]s$/.test(m.path)),'Live authentication config required');
 for(const module of before.modules){
  assert(!module.path.includes('..')&&!path.isAbsolute(module.path));const file=path.join(dir,'convex',destination(module));fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,(module.environment==='node'?'"use node";\n':'')+rewrite(module===rally?{...module,source:patched}:module));
 }
 for(const module of before.modules.filter(m=>m!==rally))assert.equal(fs.readFileSync(path.join(dir,'convex',destination(module)),'utf8'),(module.environment==='node'?'"use node";\n':'')+rewrite(module));
 assert.deepEqual(await request('/api/get_config'),before,'Backend changed during preparation. Retry with the latest snapshot.');
 console.log(JSON.stringify({actions,unchangedModules:before.modules.length-1,runtime:version,staging:dir}));
 const publish=process.argv.includes('--publish');
 const result=spawnSync(process.execPath,[path.join(modules,'convex/bin/main.js'),'deploy','--yes','--typecheck','disable','--codegen','disable',...(publish?[]:['--dry-run'])],{cwd:dir,env:{...process.env,CONVEX_SELF_HOSTED_URL:auth.url,CONVEX_SELF_HOSTED_ADMIN_KEY:auth.adminKey},encoding:'utf8',maxBuffer:20*1024*1024});
 console.log((result.stdout+'\n'+result.stderr).slice(-4500));assert.equal(result.status,0,'Rally action deployment failed');
if(publish){const after=await request('/api/get_config');assert.deepEqual(after.config,before.config);assert.equal(after.udfServerVersion,before.udfServerVersion);assert.equal((await request('/api/get_config_hashes')).nodeVersion??null,hashes.nodeVersion??null,'Node runtime must stay unchanged');const source=after.modules.find(m=>m.path==='rally.js')?.source;assert(source?.includes('That room is full.'));assert(source?.includes('Set end must be after its start.'));console.log('Verified targeted Rally fixes. No room records were changed.');}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
