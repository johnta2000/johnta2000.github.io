const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const math = require('../math.js');
let api;
const config = { rentCents: 600000, loftCents: 30000, bathroomCents: 10000, people: [
  {name:'Alex',room:100,closet:20,creditCents:10000}, {name:'Blair',room:130,closet:30,creditCents:100000}, {name:'Casey',room:100,closet:20,creditCents:100000},
] };
before(async () => {
  const result = await esbuild.build({entryPoints:[path.join(__dirname,'../../../convex/rent.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'handlers',setup(build){build.onResolve({filter:/\.\/_generated\/server$/},()=>({path:'server',namespace:'test'}));build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const query=x=>x;export const mutation=x=>x;export const internalMutation=x=>x;'}));}}]});
  const module={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require,console,TextEncoder,TextDecoder});api=module.exports;
});
function fixture(identity={email:'vivek@affil.ai',emailVerified:true}){
  const tables={rentMonths:[],rentPayments:[]};let next=1;
  const ctx={auth:{getUserIdentity:async()=>identity},db:{query(table){const filters=[],builder={eq(k,v){filters.push(row=>row[k]===v);return builder;}};const q={withIndex(_name,fn){fn(builder);return q;},async collect(){return tables[table].filter(row=>filters.every(f=>f(row)));},async unique(){const rows=await q.collect();assert.ok(rows.length<2);return rows[0]||null;}};return q;},async get(id){return Object.values(tables).flat().find(r=>r._id===id)||null;},async insert(table,value){const _id=table+next++;tables[table].push({...value,_id});return _id;},async patch(id,value){Object.assign(await ctx.db.get(id),value);}}};
  return {ctx,tables,run:(name,args={})=>api[name].handler(ctx,args)};
}
const monthArgs=(month='2026-10')=>({month,config:structuredClone(config),parkingCents:0,note:'',requestsSent:false,expectedVersion:0,requestKey:'create-'+month});
const payment=(extra={})=>({month:'2026-10',payer:0,amountCents:10000,date:'2026-10-01',note:'Transfer',requestKey:'receipt-one',...extra});
test('allocation follows area and adjustments and reconciles every cent',()=>{
  const c=math.calculate(config,10001);
  assert.equal(c.rows.reduce((s,r)=>s+r.dueCents,0)+c.affilCents,589999);
  assert.deepEqual(c.rows.map(r=>r.baseCents),[200000,215000,185000]);
  assert.equal(math.allocate(2,[1,1,1]).reduce((a,b)=>a+b),2);
  for(let p=0;p<1000;p++)assert.equal(math.calculate(config,p).rows.reduce((s,r)=>s+r.dueCents,0)+210000,600000-p);
});
test('zero, partial, overpaid and voided entries stay distinct without offsetting others',()=>{
  const c=math.calculate(config),s=math.summary(c,[{payer:0,amountCents:200000},{payer:1,amountCents:10000},{payer:2,amountCents:85000,voidedAt:1}]);
  assert.equal(s.rows[0].overpaid,10000);assert.equal(s.rows[1].status,'Partial');assert.equal(s.rows[2].status,'Unpaid');assert.equal(s.remaining,400000);assert.equal(s.received,210000);
});
test('all public endpoints deny signed-out, wrong email and unverified identities',async()=>{
  const invalid=[null,{email:'other@affil.ai',emailVerified:true},{email:'vivek@affil.ai.evil.test',emailVerified:true},{email:'vivek@affil.ai',emailVerified:false},{email:'cyin7890@gmail.com',issuer:'https://evil.test'},{email:'cyin7890@gmail.com',emailVerified:'true'}];
  for(const id of invalid)for(const name of ['verify','dashboard','ledger','saveGrid','saveMonth','recordPayment','voidPayment'])await assert.rejects(fixture(id).run(name,{}),/not authorized/);
});
test('approved emails share the workspace; pinned issuer omission is supported',async()=>{
  const f=fixture();await f.run('saveMonth',monthArgs());f.ctx.auth.getUserIdentity=async()=>({email:' CYIN7890@GMAIL.COM ',issuer:'https://clerk.john-ta.com'});
  assert.equal((await f.run('verify')).email,'cyin7890@gmail.com');assert.equal((await f.run('dashboard',{month:'2026-10'})).item.config.rentCents,600000);
});
test('both John accounts have shared access with verified and site-issued email-code identities',async()=>{
  const f=fixture();await f.run('saveMonth',monthArgs());
  for(const email of ['john@affil.ai','johnta2018@gmail.com'])for(const claims of [{emailVerified:true},{issuer:'https://clerk.john-ta.com'}]){
    f.ctx.auth.getUserIdentity=async()=>({email,...claims});assert.equal((await f.run('verify')).email,email);assert.equal((await f.run('dashboard',{month:'2026-10'})).item.config.rentCents,600000);
  }
  for(const email of ['john@affil.ai','johnta2018@gmail.com']){
    f.ctx.auth.getUserIdentity=async()=>({email,emailVerified:false,issuer:'https://clerk.john-ta.com'});await assert.rejects(f.run('verify'),/not authorized/);
    f.ctx.auth.getUserIdentity=async()=>({email:email+'.evil.test',emailVerified:true});await assert.rejects(f.run('verify'),/not authorized/);
  }
});
test('month snapshots isolate edits, reject stale versions and deduplicate retries',async()=>{
  const f=fixture();const args=monthArgs();const id=await f.run('saveMonth',args);assert.equal(await f.run('saveMonth',args),id);
  await assert.rejects(f.run('saveMonth',{...args,requestKey:'stale'}),/another device/);
  await f.run('saveMonth',monthArgs('2026-11'));await f.run('saveMonth',{...args,note:'Changed',expectedVersion:1,requestKey:'update'});
  assert.equal((await f.run('dashboard',{month:'2026-11'})).item.note,'');assert.equal(f.tables.rentMonths.length,2);
});
test('payment retries, voids, valid dates, cents and month existence are enforced',async()=>{
  const f=fixture();await assert.rejects(f.run('recordPayment',payment()),/Save the month/);await f.run('saveMonth',monthArgs());
  for(const extra of [{amountCents:-1},{amountCents:.5},{amountCents:0},{date:'2026-02-30'},{payer:4}])await assert.rejects(f.run('recordPayment',payment(extra)));
  const id=await f.run('recordPayment',payment());assert.equal(await f.run('recordPayment',payment()),id);assert.equal(f.tables.rentPayments.length,1);
  await f.run('voidPayment',{id});await f.run('voidPayment',{id});assert.ok(f.tables.rentPayments[0].voidedAt);assert.equal((await f.run('dashboard',{month:'2026-11'})).payments.length,0);
});
test('imports preserve blank and zero entries and never infer receipts; confirmation deduplicates',async()=>{
  const f=fixture(),m={...monthArgs(),sourceNote:'Review history',sourcePayments:[{payer:0,amountCents:10000,note:'Request'},{payer:1,amountCents:0,note:''},{payer:2,amountCents:null,note:''}]};delete m.expectedVersion;delete m.requestKey;
  await f.run('importWorkbook',{months:[m]});await f.run('importWorkbook',{months:[m]});assert.equal(f.tables.rentMonths.length,1);assert.equal(f.tables.rentPayments.length,0);
  const d=await f.run('dashboard',{month:'2026-10'});assert.equal(d.item.sourcePayments[2].amountCents,null);
  await f.run('recordPayment',payment({sourcePayer:0}));await assert.rejects(f.run('recordPayment',payment({sourcePayer:0,requestKey:'duplicate'})),/already confirmed/);
  await assert.rejects(f.run('recordPayment',payment({payer:1,sourcePayer:1,requestKey:'zero'})),/Imported payment not found/);
});
test('invalid inputs cannot create a plausible split',()=>{
  assert.throws(()=>math.calculate({...config,rentCents:0}));assert.throws(()=>math.calculate(config,700000));
  assert.throws(()=>math.calculate({...config,people:config.people.map(p=>({...p,room:0,closet:0}))}));
  assert.throws(()=>math.calculate({...config,bathroomCents:900000}));
});
const gridRow=(extra={})=>({month:'2026-10',config:structuredClone(config),parkingCents:0,expectedVersion:0,expectedPayments:'',receipts:[],...extra});
test('grid saves multiple months atomically, accepts zero, and retries without duplicating receipts',async()=>{
  const f=fixture(),args={requestKey:'grid-batch',rows:[gridRow({receipts:[{payer:0,amountCents:190000},{payer:1,amountCents:0}]}),gridRow({month:'2026-11',parkingCents:10000,receipts:[{payer:2,amountCents:40000}]})]};
  await f.run('saveGrid',args);assert.equal(f.tables.rentMonths.length,2);assert.equal(f.tables.rentPayments.length,2);await f.run('saveGrid',args);assert.equal(f.tables.rentPayments.length,2);
  const ledger=await f.run('ledger');assert.equal(ledger.months.length,2);assert.equal(ledger.payments[0].date,'2026-10');
});
test('editing a received total replaces it and preserves original receipts as voided audit history',async()=>{
  const f=fixture();await f.run('saveMonth',monthArgs());const id=await f.run('recordPayment',payment());await f.run('saveGrid',{requestKey:'replace',rows:[gridRow({expectedVersion:1,expectedPayments:id,receipts:[{payer:0,amountCents:25000}]})]});
  assert.ok(f.tables.rentPayments[0].voidedAt);assert.equal(f.tables.rentPayments.filter(p=>!p.voidedAt).reduce((s,p)=>s+p.amountCents,0),25000);
  const active=f.tables.rentPayments.find(p=>!p.voidedAt);await f.run('saveGrid',{requestKey:'clear',rows:[gridRow({expectedVersion:2,expectedPayments:active._id,receipts:[{payer:0,amountCents:0}]})]});assert.equal(f.tables.rentPayments.filter(p=>!p.voidedAt).length,0);
});
test('grid conflicts on another payment or calculation change before making any writes',async()=>{
  const f=fixture();await f.run('saveMonth',monthArgs());await f.run('recordPayment',payment());
  await assert.rejects(f.run('saveGrid',{requestKey:'conflict',rows:[gridRow({month:'2026-11'}),gridRow({expectedVersion:1,receipts:[{payer:0,amountCents:20000}]})]}),/another device/);assert.equal(f.tables.rentMonths.length,1);assert.equal(f.tables.rentPayments.length,1);
  await assert.rejects(f.run('saveGrid',{requestKey:'bad',rows:[gridRow({receipts:[{payer:0,amountCents:-1}]})]}));
});
