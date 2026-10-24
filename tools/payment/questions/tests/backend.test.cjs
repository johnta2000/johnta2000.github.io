const {test,before}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const vm=require('node:vm');const esbuild=require('esbuild');let api,http,sharing,shareHttp;
before(async()=>{async function load(name){const result=await esbuild.build({entryPoints:[path.join(__dirname,'../../../../convex',name+'.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'mock-server',setup(b){b.onResolve({filter:/\.\/_generated\/server$/},()=>({path:'server',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const query=x=>x;export const mutation=x=>x;export const internalMutation=x=>x;export const internalQuery=x=>x;export const httpAction=x=>x;'}));}}]});const module={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require,process:{env:{PAYMENT_QUESTIONS_ALLOWED_EMAIL:"owner@example.com,work@example.com"}},console,TextEncoder,TextDecoder,URL,Response,Request,Blob,Uint8Array});return module.exports;}api=await load('paymentQuestions');http=await load('paymentQuestionHttp');sharing=await load('paymentQuestionSharing');shareHttp=await load('paymentQuestionShareHttp');});
const approved={email:'owner@example.com',emailVerified:true,issuer:'https://clerk.john-ta.com'};
function fixture(identity=approved){let seq=0;const tables={paymentQuestions:[],paymentQuestionEvents:[],paymentQuestionFiles:[],paymentQuestionShares:[]};const ctx={auth:{getUserIdentity:async()=>identity},db:{query(table){const conditions=[];const builder={eq(k,v){conditions.push(r=>r[k]===v);return builder;}};const q={withIndex(_,fn){fn(builder);return q;},order(){return q;},async collect(){return tables[table].filter(r=>conditions.every(c=>c(r)));},async unique(){const rows=await q.collect();assert.ok(rows.length<=1);return rows[0]||null;}};return q;},async get(id){return Object.values(tables).flat().find(r=>r._id===id)||null;},async insert(table,args){const id=`${table}-${++seq}`;tables[table].push({...args,_id:id});return id;},async patch(id,args){Object.assign(await ctx.db.get(id),args);}},storage:{delete:async()=>{}}};return {ctx,tables,run:(name,args={})=>api[name].handler(ctx,args),share:(name,args={})=>sharing[name].handler(ctx,args)};}
const fields={title:'Travel charge',amountCents:233706,transactionDate:'2026-07-22',cardholder:'',card:'Chase · 9809',payer:'',payee:'',expectedCents:null,followUp:'',context:'Needs context',requestKey:'create-1'};
test('all public endpoints fail closed for missing or disallowed identity',async()=>{for(const identity of [null,{...approved,email:'guest@example.com'},{...approved,email:'stranger@example.com'},{...approved,emailVerified:false},{...approved,emailVerified:undefined,issuer:'https://evil.example'}]){const f=fixture(identity);for(const name of ['verify','list','detail','create','edit','update','file','saveNote','move','moveToTrash','restore'])await assert.rejects(f.run(name,{}),/not authorized/);assert.equal(f.tables.paymentQuestions.length,0);}assert.equal((await fixture({...approved,emailVerified:undefined}).run('verify')).email,approved.email);});
test('create is idempotent and exact allowed emails share the inbox',async()=>{const f=fixture();const id=await f.run('create',fields);assert.equal(await f.run('create',fields),id);assert.equal(f.tables.paymentQuestions.length,1);f.ctx.auth.getUserIdentity=async()=>({...approved,email:'work@example.com'});assert.equal((await f.run('list')).length,1);assert.equal((await f.run('detail',{id})).item.amountCents,233706);});
test('repayments are distinct from resolution; partial repayments and retry do not double-count',async()=>{const f=fixture();const id=await f.run('create',{...fields,expectedCents:10000});const update={id,expectedVersion:1,requestKey:'payment1',text:'Alex sent $40 via Zelle',amountCents:4000};await f.run('update',update);await f.run('update',update);let t=(await f.run('detail',{id})).item;assert.equal(t.receivedCents,4000);assert.equal(t.status,'open');await f.run('update',{id,expectedVersion:2,requestKey:'resolve1',text:'Remaining amount waived',status:'resolved'});t=(await f.run('detail',{id})).item;assert.equal(t.status,'resolved');assert.equal(t.receivedCents,4000);await f.run('update',{id,expectedVersion:3,requestKey:'reopen1',text:'Need to verify receipt',status:'open'});assert.equal((await f.run('detail',{id})).events.length,3);});
test('stale edits, invalid amounts/dates and foreign documents are rejected',async()=>{const f=fixture();const id=await f.run('create',fields);for(const amountCents of [-1,1.2,1e12])await assert.rejects(f.run('create',{...fields,requestKey:'bad',amountCents}),/valid amount/);await assert.rejects(f.run('create',{...fields,requestKey:'bad',transactionDate:'2026-02-31'}),/valid date/);await assert.rejects(f.run('edit',{...fields,id,expectedVersion:0}),/another device/);await assert.rejects(f.run('update',{id,expectedVersion:1,requestKey:'bad',text:'',status:'resolved'}),/characters/);f.tables.paymentQuestions[0].owner='someone-else';assert.equal((await f.run('list')).length,0);for(const name of ['detail','edit','update'])await assert.rejects(f.run(name,{...fields,id,expectedVersion:1}),/not found/);});
test('editing preserves a before/after history and screenshot metadata never exposes a public URL',async()=>{const f=fixture();const id=await f.run('create',fields);await f.run('edit',{...fields,id,expectedVersion:1,payer:'Alex'});const args={id,owner:'payment-questions:personal',author:approved.email,storageId:'storage-secret',name:'image.png',type:'image/png',size:100,requestKey:'file1'};await f.run('attach',args);await f.run('attach',args);const result=await f.run('detail',{id});assert.equal(result.files.length,1);assert.equal(result.files[0].storageId,undefined);assert.match(result.events[0].text,/payer:.*Alex/);f.tables.paymentQuestionFiles[0].owner='someone-else';await assert.rejects(f.run('file',{id:f.tables.paymentQuestionFiles[0]._id}),/not found/);});
test('image HTTP endpoint rejects signed-out access and invalid image bytes',async()=>{let stored=0;const ctx={auth:{getUserIdentity:async()=>null},runQuery:async()=>({}),storage:{store:async()=>{stored++;}}};const request=()=>new Request('https://example.com/payment-question-file?id=ticket',{method:'POST',headers:{'Content-Type':'image/png','X-Request-Key':'test'},body:'not an image'});assert.equal((await http.attachment(ctx,request())).status,403);ctx.auth.getUserIdentity=async()=>approved;assert.equal((await http.attachment(ctx,request())).status,400);assert.equal(stored,0);});

const rich = [{type:'p',children:[{type:'strong',children:[{type:'text',text:'Ask Mom about this trip'}]}]}];
test('rich notes save without structured fields and move without a required explanation',async()=>{const f=fixture();const result=await f.run('saveNote',{title:'',richText:rich,requestKey:'note-create'});let note=(await f.run('detail',{id:result.id})).item;assert.equal(note.title,'Ask Mom about this trip');assert.equal(note.amountCents,null);assert.equal(note.context,'Ask Mom about this trip');assert.deepEqual(JSON.parse(JSON.stringify(note.richText)),rich);await f.run('move',{id:result.id,status:'waiting',expectedVersion:1,requestKey:'move1'});await f.run('move',{id:result.id,status:'resolved',expectedVersion:2,requestKey:'move2'});note=(await f.run('detail',{id:result.id})).item;assert.equal(note.status,'resolved');assert.equal(note.receivedCents,0);});
test('note edits preserve legacy data; retries do not erase newer versions or duplicate edits',async()=>{const f=fixture();const id=await f.run('create',fields);const edit={id,title:'Notes',richText:rich,expectedVersion:1,requestKey:'edit-note1'};await f.run('saveNote',edit);await f.run('move',{id,status:'waiting',expectedVersion:2,requestKey:'move1'});const retry=await f.run('saveNote',edit);assert.equal(retry.version,2);const data=await f.run('detail',{id});assert.equal(data.item.amountCents,233706);assert.equal(data.item.card,'Chase · 9809');assert.equal(data.events.filter(e=>e.kind==='note-edit').length,1);assert.equal(data.events[0].text,'Needs context');await assert.rejects(f.run('saveNote',{...edit,expectedVersion:2,requestKey:'later'}),/another device/);});
test('rich note writes reject unsafe links, unsupported elements and oversized documents',async()=>{const f=fixture();for(const richText of [[{type:'script',children:[]}],[{type:'a',href:'javascript:alert(1)',children:[{type:'text',text:'Bad'}]}],[{type:'text',text:'x'.repeat(4001)}]])await assert.rejects(f.run('saveNote',{title:'Test',richText,requestKey:'bad'}));assert.equal(f.tables.paymentQuestions.length,0);});
test('HTTP upload reaches storage and attachment mutation, then serves the image privately',async()=>{
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);let stored=null,attached=null,queries=0;
  const ctx={auth:{getUserIdentity:async()=>approved},runQuery:async()=>{queries++;return {storageId:'image-1',type:'image/png'};},runMutation:async(_ref,args)=>{attached=args;},storage:{store:async blob=>{stored=blob;return 'image-1';},get:async()=>stored,delete:async()=>{throw Error('Unexpected cleanup');}}};
  const response=await http.attachment(ctx,new Request('https://example.com/payment-question-file?id=note-1',{method:'POST',headers:{'Content-Type':'image/png','X-File-Name':'receipt.png','X-Request-Key':'upload1','Origin':'https://www.john-ta.com'},body:bytes}));
  assert.equal(response.status,200,await response.text());assert.equal(queries,1);assert.equal(stored.size,bytes.length);assert.equal(attached.id,'note-1');assert.equal(attached.name,'receipt.png');
  const download=await http.attachment(ctx,new Request('https://example.com/payment-question-file?id=file-1'));assert.equal(download.status,200);assert.equal(download.headers.get('Content-Type'),'image/png');assert.deepEqual(new Uint8Array(await download.arrayBuffer()),bytes);
  ctx.auth.getUserIdentity=async()=>null;assert.equal((await http.attachment(ctx,new Request('https://example.com/payment-question-file?id=file-1'))).status,403);
});

test('trash is recoverable, preserves history and files, and prevents stale clients from editing deleted notes',async()=>{
 const f=fixture();const id=await f.run('create',fields);
 await f.run('attach',{id,owner:'payment-questions:personal',author:approved.email,storageId:'private-image',name:'receipt.png',type:'image/png',size:100,requestKey:'file'});
 await f.run('move',{id,status:'waiting',expectedVersion:1,requestKey:'move'});
 const history=JSON.stringify(f.tables.paymentQuestionEvents),files=JSON.stringify(f.tables.paymentQuestionFiles);
 await assert.rejects(f.run('moveToTrash',{id,expectedVersion:1}),/another device/);
 await f.run('moveToTrash',{id,expectedVersion:2});await f.run('moveToTrash',{id,expectedVersion:2});
 assert.equal((await f.run('list')).length,0);assert.equal((await f.run('list',{includeDeleted:true})).length,1);
 await assert.rejects(f.run('detail',{id}),/in Trash/);
 const detail=await f.run('detail',{id,includeDeleted:true});assert.equal(detail.item.status,'waiting');assert.equal(detail.files.length,1);
 await assert.rejects(f.run('saveNote',{id,expectedVersion:2,title:'Stale overwrite',richText:[{type:'p',children:[{type:'text',text:'old'}]}],requestKey:'stale'}),/in Trash/);
 await assert.rejects(f.run('move',{id,status:'resolved',expectedVersion:3,requestKey:'stale-move'}),/in Trash/);
 assert.equal(JSON.stringify(f.tables.paymentQuestionEvents),history);assert.equal(JSON.stringify(f.tables.paymentQuestionFiles),files);
 await assert.rejects(f.run('restore',{id,expectedVersion:2}),/another device/);
 await f.run('restore',{id,expectedVersion:3});assert.equal((await f.run('list')).length,1);assert.equal((await f.run('detail',{id})).item.status,'waiting');
 f.tables.paymentQuestions[0].owner='foreign';
 for(const name of ['moveToTrash','restore'])await assert.rejects(f.run(name,{id,expectedVersion:4}),/not found/);
});

test('unique view-only shares expire after seven days; retries never extend access',async()=>{
 const f=fixture(),id=await f.run('create',fields),token='s'.repeat(43);
 const link=await f.share('create',{id,token});const stored=f.tables.paymentQuestionShares[0];
 assert.equal(stored.expiresAt-stored.createdAt,7*24*60*60*1000);
 const again=await f.share('create',{id,token});assert.equal(again.expiresAt,link.expiresAt);assert.equal(f.tables.paymentQuestionShares.length,1);
 const result=await f.share('review',{token});assert.equal(result.item.title,fields.title);assert.equal(result.item.context,fields.context);
 for(const key of ['owner','createdBy','requestKey','version','_id'])assert.equal(result.item[key],undefined);
 assert.equal(result.events,undefined);assert.equal(result.token,undefined);
 stored.expiresAt=Date.now()-1;
 await assert.rejects(f.share('review',{token}),/expired or is unavailable/);await assert.rejects(f.share('create',{id,token}),/expired or is unavailable/);
 assert.equal((await f.share('list',{id})).length,0);
});
test('share links reveal only their question and its files, reject guessing and cannot replace owner authentication',async()=>{
 const f=fixture(),id=await f.run('create',fields),other=await f.run('create',{...fields,title:'Other private note',requestKey:'other'}),token='t'.repeat(43);
 await f.run('attach',{id,owner:'payment-questions:personal',author:approved.email,storageId:'secret-storage',name:'receipt.png',type:'image/png',size:10,requestKey:'one'});
 await f.run('attach',{id:other,owner:'payment-questions:personal',author:approved.email,storageId:'other-storage',name:'other.png',type:'image/png',size:10,requestKey:'two'});
 await f.share('create',{id,token});const file=f.tables.paymentQuestionFiles[0],foreign=f.tables.paymentQuestionFiles[1];
 const data=await f.share('review',{token});assert.equal(data.files.length,1);assert.equal(data.files[0].storageId,undefined);assert.ok(!JSON.stringify(data).includes('secret-storage'));
 assert.equal((await f.share('file',{token,id:file._id})).storageId,'secret-storage');await assert.rejects(f.share('file',{token,id:foreign._id}),/unavailable/);
 for(const bad of ['', 'a'.repeat(42),'x'.repeat(43)])await assert.rejects(f.share('review',{token:bad}),/unavailable/);
 f.ctx.auth.getUserIdentity=async()=>null;
 assert.equal((await f.share('review',{token})).item.title,fields.title);
 for(const [name,args]of [['create',{id,token:'z'.repeat(43)}],['list',{id}],['revoke',{id:f.tables.paymentQuestionShares[0]._id}]])await assert.rejects(f.share(name,args),/not authorized/);
 await assert.rejects(f.run('edit',{...fields,id,expectedVersion:1,token}),/not authorized/);
});
test('revocation and Trash immediately block shared content and files, including after restoration',async()=>{
 const f=fixture(),id=await f.run('create',fields),token='u'.repeat(43);
 await f.share('create',{id,token});const link=f.tables.paymentQuestionShares[0];
 await f.share('revoke',{id:link._id});await assert.rejects(f.share('review',{token}),/unavailable/);
 const otherToken='v'.repeat(43);await f.share('create',{id,token:otherToken});
 await f.run('moveToTrash',{id,expectedVersion:1});await assert.rejects(f.share('review',{token:otherToken}),/unavailable/);
 await f.run('restore',{id,expectedVersion:2});await assert.rejects(f.share('review',{token:otherToken}),/unavailable/);
 const foreign=fixture();foreign.tables.paymentQuestionShares.push({...link,_id:'foreign-share',owner:'someone-else'});await assert.rejects(foreign.share('revoke',{id:'foreign-share'}),/not found/);
});
test('shared screenshot HTTP uses header tokens, no-store and no public storage URLs',async()=>{
 let requested;const ctx={runQuery:async(_fn,args)=>{requested=args;if(args.token!=='a'.repeat(43))throw Error('expired');return {storageId:'private',type:'image/png',expiresAt:Date.now()+10000};},storage:{get:async()=>new Blob([new Uint8Array([1,2,3])])}};
 const r=await shareHttp.screenshot(ctx,new Request('https://example.com/payment-question-share-file?id=image',{headers:{'X-Payment-Share-Token':'a'.repeat(43)}}));assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(requested.id,'image');
 assert.equal((await shareHttp.screenshot(ctx,new Request('https://example.com/payment-question-share-file?id=image'))).status,404);
});

test('share HTTP refuses expired query snapshots and checks file expiry again after storage retrieval',async()=>{
 const ctx={runQuery:async()=>({expiresAt:Date.now()-1,item:{title:'Expired context'}})};
 assert.equal((await shareHttp.view(ctx,new Request('https://example.com/share',{headers:{'X-Payment-Share-Token':'a'.repeat(43)}}))).status,404);
 let expiresAt=Date.now()+1000;ctx.runQuery=async()=>({expiresAt,storageId:'file',type:'image/png'});ctx.storage={get:async()=>{expiresAt=Date.now()-1;return new Blob(['image']);}};
 ctx.runQuery=async()=>({get expiresAt(){return expiresAt;},storageId:'file',type:'image/png'});
 assert.equal((await shareHttp.screenshot(ctx,new Request('https://example.com/share-file?id=file',{headers:{'X-Payment-Share-Token':'a'.repeat(43)}}))).status,404);
});
