const {test,before}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild');
let api,http;
before(async()=>{async function bundle(file){const r=await esbuild.build({entryPoints:[path.join(__dirname,'../../../convex/'+file)],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'handlers',setup(b){b.onResolve({filter:/\.\/_generated\/server$/},()=>({path:'server',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const query=x=>x;export const mutation=x=>x;export const internalMutation=x=>x;export const httpAction=x=>x;'}));}}]});const m={exports:{}};vm.runInNewContext(r.outputFiles[0].text,{module:m,exports:m.exports,require,console,TextEncoder,TextDecoder,Response,Request,URL,Uint8Array});return m.exports;}api=await bundle('rentRecords.ts');http=await bundle('rentFileHttp.ts');});
function fixture(identity={email:'john@affil.ai',issuer:'https://clerk.john-ta.com'}){const tables={rentBills:[],rentPayments:[],rentFiles:[],rentProofMarks:[]},deleted=[];let n=0;const ctx={auth:{getUserIdentity:async()=>identity},storage:{delete:async id=>deleted.push(id)},db:{query(t){let filters=[];const q={withIndex(_,fn){fn({eq(k,v){filters.push(r=>r[k]===v);return this;}});return q;},collect:async()=>tables[t].filter(r=>filters.every(f=>f(r))),async unique(){return (await q.collect())[0]||null;}};return q;},get:async id=>Object.values(tables).flat().find(r=>r._id===id),insert:async(t,v)=>{const _id='id'+n++;tables[t].push({...v,_id});return _id;},patch:async(id,v)=>Object.assign(await ctx.db.get(id),v)}};return {ctx,tables,deleted,run:(name,args={})=>api[name].handler(ctx,args)};}
const bill={statementDate:'2026-02-09',periodStart:'2026-01-02',periodEnd:'2026-02-02',dueDate:'2026-03-02',chargesCents:30000,previousCents:-5000,paymentsCents:0,totalCents:25000,note:'Synthetic statement',requestKey:'bill1'};
test('documents, checks and bills require the rent allowlist',async()=>{for(const id of [null,{email:'other@example.com',emailVerified:true},{email:'john@affil.ai',emailVerified:false}])for(const name of ['overview','file','destination','setConfirmation','saveBill','saveBillGrid','linkFile','setProofMark'])await assert.rejects(fixture(id).run(name,{}),/not authorized/);});
test('bills use statement month, retain cross-month dates and credits, reconcile and deduplicate',async()=>{const f=fixture(),id=await f.run('saveBill',bill);assert.equal(await f.run('saveBill',bill),id);assert.equal(f.tables.rentBills[0].month,'2026-02');assert.equal(f.tables.rentBills[0].previousCents,-5000);await assert.rejects(f.run('saveBill',{...bill,requestKey:'different'}),/already logged/);await assert.rejects(f.run('saveBill',{...bill,totalCents:10}),/must equal/);await assert.rejects(f.run('saveBill',{...bill,periodEnd:'2026-02-30'}),/valid dates/);await assert.rejects(f.run('saveBill',{...bill,periodStart:'2026-03-01'}),/Check the bill/);});
test('checking a receipt never changes amount; voided receipts cannot be checked',async()=>{const f=fixture();f.tables.rentPayments.push({_id:'p',amountCents:12345});await f.run('setConfirmation',{id:'p',checked:true});assert.equal(f.tables.rentPayments[0].checked,true);assert.equal(f.tables.rentPayments[0].amountCents,12345);await f.run('setConfirmation',{id:'p',checked:false});assert.equal(f.tables.rentPayments[0].checked,false);f.tables.rentPayments[0].voidedAt=1;await assert.rejects(f.run('setConfirmation',{id:'p',checked:true}),/not available/);});
test('uploads retain proof links and retries discard duplicate storage without creating another file',async()=>{const f=fixture();f.tables.rentPayments.push({_id:'p'});const a={paymentId:'p',storageId:'s1',name:'proof.png',type:'image/png',size:100,requestKey:'upload1',author:'test'};const id=await f.run('attach',a);assert.equal(await f.run('attach',{...a,storageId:'s2'}),id);assert.equal(f.tables.rentFiles.length,1);assert.deepEqual(f.deleted,['s2']);assert.equal(f.tables.rentPayments[0].checked,undefined);const overview=await f.run('overview');assert.equal(overview.files[0].storageId,undefined);});
test('evidence checks only unique exact matches and never adds receipts',async()=>{const f=fixture();f.tables.rentFiles.push({_id:'f',paymentIds:[]});f.tables.rentPayments.push({_id:'p',month:'2026-01',payer:0,amountCents:10000});const entries=[{date:'2026-01-01',month:'2026-01',payer:0,amountCents:10000,memo:'January rent',status:'Completed',review:''},{date:'2026-01-30',payer:0,amountCents:50000,memo:'Unknown transfer',status:'Completed',review:'Month unclear'},{date:'2026-02-01',month:'2026-02',payer:0,amountCents:10000,memo:'February',status:'Completed',review:''}];const result=await f.run('importEvidence',{id:'f',entries});assert.equal(result.linked,1);assert.equal(result.review,2);assert.equal(f.tables.rentPayments.length,1);assert.equal(f.tables.rentPayments[0].checked,true);await f.run('importEvidence',{id:'f',entries});assert.equal(f.tables.rentFiles[0].paymentIds.length,1);});
test('private file HTTP rejects anonymous access and invalid files before storage, serves authorized blobs',async()=>{const denied=await http.attachment(fixture(null).ctx,new Request('https://site/rent-file?id=f'));assert.equal(denied.status,403);const f=fixture();let stored=false;f.ctx.runQuery=async()=>({storageId:'s',type:'image/png'});f.ctx.storage.get=async()=>new Blob(['private']);f.ctx.storage.store=async()=>{stored=true;return 's';};const get=await http.attachment(f.ctx,new Request('https://site/rent-file?id=f'));assert.equal(await get.text(),'private');assert.equal(get.headers.get('Cache-Control'),'no-store');const bad=await http.attachment(f.ctx,new Request('https://site/rent-file',{method:'POST',headers:{'Content-Type':'image/png','X-Request-Key':'k'},body:'not an image'}));assert.equal(bad.status,400);assert.equal(stored,false);});

test('manual linking is idempotent and does not check or change receipts',async()=>{const f=fixture();f.tables.rentFiles.push({_id:'f',paymentIds:[]});f.tables.rentPayments.push({_id:'p',amountCents:10000});await f.run('linkFile',{id:'f',paymentId:'p'});await f.run('linkFile',{id:'f',paymentId:'p'});assert.equal(f.tables.rentFiles[0].paymentIds.length,1);assert.equal(f.tables.rentPayments[0].checked,undefined);});

test('utility grid updates documents in place, inserts new statements and retries idempotently',async()=>{
 const f=fixture();const id=await f.run('saveBill',bill);f.tables.rentFiles.push({_id:'file1',billId:id});
 const fields={...bill};delete fields.requestKey;const edit={...fields,id,month:'2026-02',expectedVersion:0,chargesCents:32000,totalCents:27000};
 const next={...fields,month:'2026-03',expectedVersion:0,statementDate:'2026-03-10',periodStart:'2026-02-03',periodEnd:'2026-03-02',dueDate:'2026-03-31'};
 const args={rows:[edit,next],requestKey:'batch'};assert.equal((await f.run('saveBillGrid',args)).saved,2);assert.equal(f.tables.rentBills[0]._id,id);assert.equal(f.tables.rentFiles[0].billId,id);assert.equal(f.tables.rentBills[0].version,1);assert.equal((await f.run('saveBillGrid',args)).saved,0);assert.equal(f.tables.rentBills.length,2);
 await assert.rejects(f.run('saveBillGrid',{rows:[edit],requestKey:'stale'}),/another device/);
});
test('utility grid validates the entire batch before writes and rejects duplicate or misdated statements',async()=>{
 const f=fixture(),fields={...bill};delete fields.requestKey;const row={...fields,month:'2026-02',expectedVersion:0};
 await assert.rejects(f.run('saveBillGrid',{rows:[row,{...row,month:'2026-03',statementDate:'2026-03-10',periodEnd:'2026-02-30'}],requestKey:'bad'}),/valid dates/);assert.equal(f.tables.rentBills.length,0);
 await assert.rejects(f.run('saveBillGrid',{rows:[row,row],requestKey:'duplicate'}),/only once/);
 await assert.rejects(f.run('saveBillGrid',{rows:[{...row,month:'2026-01'}],requestKey:'mismatch'}),/ledger month/);
});

function reconciliation(){
 const f=fixture();f.tables.rentPayments.push({_id:'aggregate',month:'2026-05',payer:0,amountCents:30000,date:'2026-05'});
 f.tables.rentFiles.push({_id:'history',paymentIds:[],entries:[{date:'2026-04-30',payer:0,amountCents:10000,memo:'',status:'Completed',review:'Unassigned'}]},{_id:'remainder',paymentIds:[]});
 return {...f,args:{originalId:'aggregate',expectedActiveIds:['aggregate'],requestKey:'split',author:'owner',parts:[{amountCents:10000,date:'2026-04-30',note:'First installment',fileId:'history',evidenceDate:'2026-04-30'},{amountCents:20000,date:'2026-05',note:'Remainder; receipt date unspecified',fileId:'remainder'}]}};
}
test('reconciliation retains audit history, preserves totals, links evidence and retries without duplicating',async()=>{
 const f=reconciliation(),ids=await f.run('reconcileReceipt',f.args);
 assert.equal(f.tables.rentPayments.filter(p=>!p.voidedAt).reduce((s,p)=>s+p.amountCents,0),30000);
 assert.ok(f.tables.rentPayments[0].voidedAt);assert.equal(f.tables.rentPayments[0].amountCents,30000);
 assert.ok(f.tables.rentPayments.slice(1).every(p=>p.checked));assert.equal(f.tables.rentFiles[0].entries[0].paymentId,ids[0]);assert.equal(f.tables.rentFiles[0].entries[0].month,'2026-05');assert.equal(f.tables.rentFiles[1].paymentIds[0],ids[1]);
 assert.deepEqual(await f.run('reconcileReceipt',f.args),ids);assert.equal(f.tables.rentPayments.length,3);
 await assert.rejects(f.run('reconcileReceipt',{...f.args,parts:f.args.parts.map((p,i)=>({...p,date:i===0?'2026-04-29':p.date}))}),/request changed/);
});
test('reconciliation validates amounts, concurrent receipts and all proof before any writes',async()=>{
 for(const scenario of ['amount','stale','proof','linked']){
  const f=reconciliation();
  if(scenario==='amount')f.args.parts[1].amountCents++;
  if(scenario==='stale')f.tables.rentPayments.push({_id:'concurrent',month:'2026-05',payer:0,amountCents:100});
  if(scenario==='proof')f.args.parts[1].fileId='missing';
  if(scenario==='linked')f.tables.rentFiles[0].entries[0].paymentId='another';
  const before=JSON.stringify(f.tables);await assert.rejects(f.run('reconcileReceipt',f.args));assert.equal(JSON.stringify(f.tables),before);
 }
});

test('matching owner-assigned evidence confirms an existing total, preserves money and retries safely',async()=>{
 const f=reconciliation();f.tables.rentFiles[0].entries[0].amountCents=30000;
 const args={fileId:'history',paymentId:'aggregate',evidenceDate:'2026-04-30',expectedMonth:'2026-05',author:'owner',review:'Owner assigned this early payment to the following rent month.'};
 const before={...f.tables.rentPayments[0]};await f.run('matchEvidence',args);
 for(const [k,v] of Object.entries(before))assert.equal(f.tables.rentPayments[0][k],v);
 assert.equal(f.tables.rentPayments.length,1);assert.ok(f.tables.rentPayments[0].checked);assert.equal(f.tables.rentFiles[0].entries[0].paymentId,'aggregate');
 const snapshot=JSON.stringify(f.tables);await f.run('matchEvidence',args);assert.equal(JSON.stringify(f.tables),snapshot);
});
test('evidence matching rejects mismatches, ambiguous transfers and prior assignments before writes',async()=>{
 for(const kind of ['amount','payer','month','voided','duplicate','assigned']){
  const f=reconciliation();f.tables.rentFiles[0].entries[0].amountCents=30000;
  if(kind==='amount')f.tables.rentFiles[0].entries[0].amountCents++;
  if(kind==='payer')f.tables.rentFiles[0].entries[0].payer=1;
  if(kind==='month')f.tables.rentPayments[0].month='2026-06';
  if(kind==='voided')f.tables.rentPayments[0].voidedAt=1;
  if(kind==='duplicate')f.tables.rentFiles[0].entries.push({...f.tables.rentFiles[0].entries[0]});
  if(kind==='assigned')f.tables.rentFiles[0].entries[0].paymentId='other';
  const snapshot=JSON.stringify(f.tables);await assert.rejects(f.run('matchEvidence',{fileId:'history',paymentId:'aggregate',evidenceDate:'2026-04-30',expectedMonth:'2026-05',author:'owner',review:'Owner clarification'}));assert.equal(JSON.stringify(f.tables),snapshot);
 }
});

test('proof flags preserve originals and money, append history, retry safely and reject stale edits',async()=>{
 const f=fixture();f.tables.rentPayments.push({_id:'p',amountCents:10000});f.tables.rentFiles.push({_id:'f',type:'image/png',storageId:'original',paymentIds:['p']});
 const a={fileId:'f',paymentId:'p',y:0.25,height:0.05,removed:false,expectedVersion:0,requestKey:'flag1'};
 const before=JSON.stringify({files:f.tables.rentFiles,payments:f.tables.rentPayments});const id=await f.run('setProofMark',a);assert.equal(await f.run('setProofMark',a),id);
 await assert.rejects(f.run('setProofMark',{...a,y:0.4,requestKey:'stale'}),/another device/);
 await f.run('setProofMark',{...a,removed:true,expectedVersion:1,requestKey:'remove'});assert.equal(f.tables.rentProofMarks.length,2);assert.equal(f.tables.rentProofMarks[0].removed,false);assert.equal(f.tables.rentProofMarks[1].removed,true);assert.equal(f.tables.rentProofMarks[1].version,2);
 assert.equal(JSON.stringify({files:f.tables.rentFiles,payments:f.tables.rentPayments}),before);
});
test('proof flags require a linked image, active receipt and bounded coordinates',async()=>{
 for(const kind of ['unlinked','pdf','void','outside','nan']){
 const f=fixture();f.tables.rentPayments.push({_id:'p',...(kind==='void'?{voidedAt:1}:{})});f.tables.rentFiles.push({_id:'f',type:kind==='pdf'?'application/pdf':'image/png',paymentIds:kind==='unlinked'?[]:['p']});
 await assert.rejects(f.run('setProofMark',{fileId:'f',paymentId:'p',y:kind==='outside'?1:kind==='nan'?NaN:0.1,height:0.05,removed:false,expectedVersion:0,requestKey:'flag'}));assert.equal(f.tables.rentProofMarks.length,0);
 }
});
