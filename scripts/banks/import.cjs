// Imports reviewed private records and PDFs. Never place financial data in this repository.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {ConvexHttpClient}=require('convex/browser');const {anyApi}=require('convex/server');
(async()=>{const base=process.argv[2];assert(base&&path.isAbsolute(base),'Pass the private archive directory.');assert(!base.startsWith(path.resolve(__dirname,'../..')+path.sep),'Archive must be outside the public checkout.');
const read=name=>JSON.parse(fs.readFileSync(path.join(base,'normalized',name+'.json'),'utf8'));
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const response=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':'npm-cli-1.41.0'},body:JSON.stringify({selectedDeploymentName:'rapid-shark-565',projectSelection:{kind:'deploymentName',deploymentName:'rapid-shark-565'}}),signal:AbortSignal.timeout(30000)});
 assert(response.ok,'Backend authorization failed');const auth=await response.json();assert.equal(auth.url,'https://rapid-shark-565.convex.cloud');
 const identity={subject:'bank-history-import',issuer:'https://clerk.john-ta.com',email:'johnta2018@gmail.com',emailVerified:true};
 const client=new ConvexHttpClient(auth.url);client.setAdminAuth(auth.adminKey,identity);client.setDebug(false);
 const authorization=`Convex ${auth.adminKey}:${Buffer.from(JSON.stringify(identity)).toString('base64')}`;

 const accountId=await client.mutation(anyApi.bankArchive.importAccount,{data:read('account')});
 for(const kind of ['transactions','statements']){const rows=read(kind);let added=0;for(let i=0;i<rows.length;i+=60){const r=await client.mutation(anyApi.bankArchive.importRows,{accountId,kind,rows:rows.slice(i,i+60)});added+=r.added;}console.log(kind+': '+added+' added; '+(rows.length-added)+' existing preserved.');}
 let saved=await client.query(anyApi.bankArchive.account,{id:accountId}),uploaded=0;
 for(const s of saved.statements){if(s.hasPdf)continue;const bytes=fs.readFileSync(path.join(base,s.data.pdf));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),s.data.sha256);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 const url=await client.mutation(anyApi.bankArchive.uploadUrl,{});const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/pdf'},body:bytes,signal:AbortSignal.timeout(30000)});assert(r.ok,'PDF upload failed');const {storageId}=await r.json();await client.mutation(anyApi.bankArchive.attachPdf,{id:s._id,storageId});uploaded++;}
 saved=await client.query(anyApi.bankArchive.account,{id:accountId});assert.equal(saved.transactions.length,read('transactions').length);assert.equal(saved.statements.length,read('statements').length);assert(saved.statements.every(s=>s.hasPdf));
 for(const s of saved.statements){const r=await fetch('https://rapid-shark-565.convex.site/bank-archive-pdf?id='+s._id,{headers:{Authorization:authorization}});assert(r.ok,'Private PDF read failed');assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),s.data.sha256);}
 // Read-only authorization checks; never alter real records for testing.
 for(const identity of [null,{subject:'test',issuer:'https://clerk.john-ta.com',email:'other@example.com',emailVerified:true},{subject:'test',issuer:'https://clerk.john-ta.com',email:'johnta2018@gmail.com',emailVerified:false}]){const c=new ConvexHttpClient(auth.url);c.setDebug(false);if(identity)c.setAdminAuth(auth.adminKey,identity);await assert.rejects(c.query(anyApi.bankArchive.accounts,{}));}
 const denied=await fetch('https://rapid-shark-565.convex.site/bank-archive-pdf?id='+saved.statements[0]._id);assert.equal(denied.status,403);
 fs.writeFileSync(path.join(base,'live-import.json'),JSON.stringify({accountId,transactions:saved.transactions.length,statements:saved.statements.length,pdfHashesVerified:true,authorizationVerified:true,url:'https://www.john-ta.com/tools/payments/banks/?account='+accountId+'&view=transactions'},null,2),{mode:0o600});
 console.log(JSON.stringify({accountId,transactions:saved.transactions.length,statements:saved.statements.length,uploaded,pdfHashesVerified:true,authorizationVerified:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
