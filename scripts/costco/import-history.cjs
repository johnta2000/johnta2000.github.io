// Import reviewed source data stored OUTSIDE the public checkout. Credentials stay in memory.
// Usage: node scripts/costco/import-history.cjs /absolute/private/parsed.json [--records-only] [--one-image]
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {ConvexHttpClient}=require('convex/browser');const {anyApi}=require('convex/server');
(async()=>{
 const input=process.argv[2];assert(input&&path.isAbsolute(input),'Pass an absolute private import file.');
 const records=JSON.parse(fs.readFileSync(input,'utf8'));assert(Array.isArray(records)&&records.length>0);
 const root=path.resolve(__dirname,'../..');assert(!path.resolve(input).startsWith(root+path.sep),'Keep purchase data outside the public checkout.');
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const response=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':'npm-cli-1.41.0'},body:JSON.stringify({selectedDeploymentName:'rapid-shark-565',projectSelection:{kind:'deploymentName',deploymentName:'rapid-shark-565'}}),signal:AbortSignal.timeout(30000)});
 assert(response.ok,'Backend authorization failed');const auth=await response.json();assert.equal(auth.url,'https://rapid-shark-565.convex.cloud');
 const identity={subject:'costco-history-import',issuer:'https://clerk.john-ta.com',email:'johnta2018@gmail.com',emailVerified:true};
 const client=new ConvexHttpClient(auth.url);client.setAdminAuth(auth.adminKey,identity);client.setDebug(false);
 const authorization=`Convex ${auth.adminKey}:${Buffer.from(JSON.stringify(identity)).toString('base64')}`;
 let imported=0,skipped=0,ids=[];
 for(let i=0;i<records.length;i+=25){const result=await client.mutation(anyApi.costco.importOrders,{orders:records.slice(i,i+25).map(r=>r.order)});imported+=result.imported;skipped+=result.skipped;ids.push(...result.ids);}
 console.log('Records:',imported,'imported;',skipped,'existing records preserved.');
 if(process.argv.includes('--records-only'))return;
 let uploaded=0,reused=0;
 for(let i=0;i<records.length;i++){
  const r=records[i],bytes=fs.readFileSync(r.screenshot),hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const detail=await client.query(anyApi.costco.detail,{id:ids[i]});
  assert.equal(detail.order.totalCents,r.order.totalCents,'Existing total differs');assert.equal(detail.order.date,r.order.date,'Existing date differs');
  if(detail.files.some(f=>f.sha256===hash)){reused++;continue;}
  let upload;
  for(let attempt=0;attempt<3;attempt++){
   upload=await fetch('https://rapid-shark-565.convex.site/costco-receipt?'+new URLSearchParams({order:ids[i]}),{method:'POST',headers:{Authorization:authorization,'Content-Type':'image/jpeg','X-File-Name':encodeURIComponent('Costco '+r.order.date+' — '+r.order.orderId+'.jpg')},body:Buffer.from(bytes),signal:AbortSignal.timeout(45000)});
   if(upload.ok)break;
   const message=await upload.text();
   if(upload.status<500||attempt===2)throw Error('Receipt upload failed ('+upload.status+'): '+message);
   console.log('Retrying a receipt after a temporary server error.');
   await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }
  const result=await upload.json();assert(result.id);uploaded++;
  const verify=await client.query(anyApi.costco.detail,{id:ids[i]});assert(verify.files.some(f=>f.sha256===hash),'Uploaded receipt hash not found');
  if(process.argv.includes('--one-image'))break;
  if((uploaded+reused)%20===0)console.log('Receipt images verified:',uploaded+reused,'of',records.length);
 }
 console.log('Receipt images:',uploaded,'uploaded;',reused,'already saved.');
 fs.writeFileSync(path.join(path.dirname(input),'import-result.json'),JSON.stringify({completedAt:new Date().toISOString(),records:records.length,imported,skipped,uploaded,reused,ids},null,2),{mode:0o600});
})().catch(e=>{console.error(e.message);process.exitCode=1;});
