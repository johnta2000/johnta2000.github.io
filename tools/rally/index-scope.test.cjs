const {test,before}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),{buildSync}=require('esbuild');
let api;
before(()=>{
 const module={exports:{}};
 const output=buildSync({entryPoints:[__dirname+'/../../convex/rally.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
 vm.runInNewContext(output.outputFiles[0].text,{module,exports:module.exports,require,TextEncoder,structuredClone,crypto:require('node:crypto').webcrypto});
 api=module.exports;
});
function fixture(){
 const me={id:'me',name:'Owner',email:'owner@example.com',clerkSubject:'owner',role:'admin'};
 const room=(id,members)=>({boardId:'rally:'+id,buckets:{id,name:id,members,startsAt:'2027-01-01',endsAt:'2027-01-03'}});
 const docs=[room('one',[me]),room('two',[me,{id:'friend',name:'Friend',email:'friend@example.com'}]),room('private',[{id:'secret',email:'secret@example.com'}]),
   ...Array.from({length:400},(_,i)=>({boardId:'monitoring:v2:run:'+i,buckets:{privatePayload:'synthetic'}}))];
 const reads=[];
 const ctx={auth:{getUserIdentity:async()=>({subject:'owner',email:'owner@example.com',emailVerified:true})},db:{query(){
  const filters=[];const q={withIndex(index,fn){assert.equal(index,'by_board');const b={eq(k,v){filters.push(r=>r[k]===v);return b},gte(k,v){filters.push(r=>r[k]>=v);return b},lt(k,v){filters.push(r=>r[k]<v);return b}};fn(b);return q},
   async collect(){const result=docs.filter(r=>filters.every(f=>f(r)));reads.push(...result.map(r=>r.boardId));return result},async unique(){return (await q.collect())[0]??null}};return q}}};
 return {ctx,reads};
}
test('event list reads only Rally records and still enforces room membership',async()=>{
 const f=fixture();const result=await api.listEvents._handler(f.ctx,{});
 assert.deepEqual(Array.from(result,r=>r.id),['one','two']);assert.ok(f.reads.every(key=>key.startsWith('rally:')));
});
test('shared crew lookup ignores monitoring history and uninvited rooms',async()=>{
 const f=fixture();const result=await api.sharedCrewCandidates._handler(f.ctx,{eventId:'one'});
 assert.deepEqual(Array.from(result,r=>r.email),['friend@example.com']);assert.ok(f.reads.every(key=>key.startsWith('rally:')));
});
