// Read-only verification. Never logs credentials or receipt content.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {ConvexHttpClient}=require('convex/browser');const {anyApi}=require('convex/server');
(async()=>{
 const url='https://rapid-shark-565.convex.cloud';
 const anon=new ConvexHttpClient(url);await assert.rejects(anon.query(anyApi.costco.verify,{}),/not authorized/);await assert.rejects(anon.query(anyApi.costco.list,{paginationOpts:{numItems:1,cursor:null}}),/not authorized/);
 for(const method of ['GET','POST']){const r=await fetch('https://rapid-shark-565.convex.site/costco-receipt?id=unavailable',{method});assert.equal(r.status,401);assert.match(r.headers.get('Cache-Control'),/no-store/);}
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const response=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':'npm-cli-1.41.0'},body:JSON.stringify({selectedDeploymentName:'rapid-shark-565',projectSelection:{kind:'deploymentName',deploymentName:'rapid-shark-565'}})});
 assert(response.ok);const auth=await response.json();assert.equal(auth.url,url);
 for(const email of ['johnta2018@gmail.com','john@affil.ai','costco-denied@example.com']){const client=new ConvexHttpClient(url);client.setAdminAuth(auth.adminKey,{subject:'costco-readonly-verification',issuer:'https://clerk.john-ta.com',email,emailVerified:true});if(email==='johnta2018@gmail.com'){assert.equal((await client.query(anyApi.costco.verify,{})).email,email);const records=await client.query(anyApi.costco.list,{paginationOpts:{numItems:1,cursor:null}});console.log('Owner query passed; archive '+(records.page.length?'contains imported records.':'is empty pending import.'));}else await assert.rejects(client.query(anyApi.costco.verify,{}),/not authorized/);}
 console.log('PASS: anonymous requests denied; both receipt methods protected; owner allowed; other accounts denied.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
