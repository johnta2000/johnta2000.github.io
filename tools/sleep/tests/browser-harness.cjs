// Synthetic, loopback-only UI verification. Never points to the live Convex deployment.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../../..'),crypto=require('node:crypto').webcrypto;
const {getFunctionName}=require('convex/server');
(async()=>{
 const modules={};
 for(const file of ['sleep','sleepGroups','sleepAccess','whoopData']){
  const result=await esbuild.build({entryPoints:[path.join(root,'convex',file+'.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'handlers',setup(b){b.onResolve({filter:/\.\/_generated\/server$/},()=>({path:'server',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const query=x=>x;export const mutation=x=>x;export const internalQuery=x=>x;export const internalMutation=x=>x;export const action=x=>x;'}));}}]});
  const m={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module:m,exports:m.exports,require,console,crypto,TextEncoder,Date,Intl,process:{env:{SLEEP_ALLOWED_EMAIL:'owner@example.com'}}});modules[file]=m.exports;
 }
 const tables=Object.fromEntries(['sleepNights','alertnessRatings','sleepProfiles','sleepGroups','sleepMembers','sleepInvites','whoopConnections','whoopDays'].map(t=>[t,[]]));let n=0;
 const db={query(t){let filters=[];const q={withIndex(_,fn){fn({eq(k,v){filters.push(r=>r[k]===v);return this},gte(k,v){filters.push(r=>r[k]>=v);return this},lte(k,v){filters.push(r=>r[k]<=v);return this}});return q},collect:async()=>tables[t].filter(r=>filters.every(f=>f(r))),async unique(){const rows=await q.collect();if(rows.length>1)throw Error('Duplicate');return rows[0]||null},async take(count){return(await q.collect()).slice(0,count)}};return q},get:async id=>Object.values(tables).flat().find(r=>r._id===id)||null,insert:async(t,v)=>{const id=t+'_'+ ++n;tables[t].push({...v,_id:id});return id},patch:async(id,v)=>Object.assign(await db.get(id),v),delete:async id=>{for(const rows of Object.values(tables)){const i=rows.findIndex(r=>r._id===id);if(i>=0)rows.splice(i,1)}}};
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 for(const subject of ['owner','friend']) await db.insert('sleepNights',{ownerSubject:subject,sleepDate:date,source:'whoop',score:subject==='owner'?90:80,scoreKind:'native',durationMinutes:subject==='owner'?480:420,efficiency:95});
 for(const subject of ['owner','friend']) await db.insert('whoopDays',{ownerSubject:subject,sleepDate:date,hrv:subject==='owner'?61:85,restingHeartRate:subject==='owner'?52:58});
 async function dispatch(actor,ref,args){const [mod,fn]=typeof ref==='string'?ref.split(':'):getFunctionName(ref).split(':');const ctx={db,auth:{getUserIdentity:async()=>({subject:actor,email:actor+'@example.com',emailVerified:true})},runQuery:(ref,args)=>dispatch(actor,ref,args),runMutation:(ref,args)=>dispatch(actor,ref,args)};return modules[mod][fn].handler(ctx,args);}
 if(process.env.INVITE_FIXTURE==='1') {
  const groupId=await dispatch('owner','sleepGroups:create',{groupName:'Test circle',name:'Owner',metrics:['score'],shareDays:28});
  const invite=await dispatch('owner','sleepGroups:createInvite',{groupId,label:'Alex'});
  await dispatch('friend','sleepGroups:acceptInvite',{token:invite.token,name:'Alex',metrics:[],shareDays:28});
  for(const [label,state] of [['Sam','pending'],['Taylor','expired'],['Jordan','revoked']]) {
   const invitation=await dispatch('owner','sleepGroups:createInvite',{groupId,label});
   if(state==='expired')await db.patch(invitation.id,{expiresAt:Date.now()-1});
   if(state==='revoked')await dispatch('owner','sleepGroups:revokeInvite',{inviteId:invitation.id});
  }
 }
 http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1:8767');
   if(req.method==='POST' && url.pathname.startsWith('/api/')){
    let body='';for await(const chunk of req)body+=chunk;
    const {path:ref,args}=JSON.parse(body);const actor=(req.headers.authorization||'').replace('Bearer ','');
    const value=await dispatch(actor,ref,args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'success',value:value===undefined?null:value}));return;
   }
   let file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+'/')||!['.html','.js','.css'].includes(path.extname(file)))throw Error('Not found');
   let body=fs.readFileSync(file,'utf8');
   if(file.endsWith('/tools/sleep/index.html')){
    body=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,tag=>/clerk|analytics/i.test(tag)?'':tag);
    const actor=url.searchParams.get('actor')==='friend'?'friend':'owner';
    body=body.replace('</head>',`<script>window.Clerk={isSignedIn:true,user:{firstName:'${actor}'},session:{getToken:async()=> '${actor}'},load:async()=>{},signOut:async()=>{}};</script></head>`);
   }
   if(file.endsWith('/tools/sleep/app.js'))body=body.replace('https://rapid-shark-565.convex.cloud','http://127.0.0.1:8767');
   res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(body);
  }catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'error',errorMessage:e.message}));}
 }).listen(8767,'127.0.0.1',()=>console.log('Synthetic Daylight UI on loopback port 8767'));
})();
