const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {buildSync}=require('esbuild'),{JSDOM}=require('jsdom');
const bundle=file=>{const ctx={module:{exports:{}},require,structuredClone,crypto:require('node:crypto').webcrypto};vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/'+file],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text,ctx);return ctx.module.exports;};
const {assignTicket,saveTicketPurchase,ticketQuantity}=bundle('rallyTicketsRules.ts');
const makeState=()=>({id:'test-event',projectTheme:'midnight',members:[{id:'a',name:'Alex',role:'admin',clerkSubject:'admin'},{id:'b',name:'Sam',role:'member',clerkSubject:'member'},{id:'c',name:'Riley',role:'member',status:'not_invited'}],passes:[{id:'p',name:'Festival ticket',category:'Pass',quantity:4,ownerId:'a',unitCost:'60',totalCost:'240',notes:'Keep',status:'Bought'}],lineupFavorites:{a:['keep']},rooms:[{id:'stay'}]});
test('any crew member can assign all four slots including an unclaimed profile, without changing buyer or other data',()=>{
 const state=makeState(),before=structuredClone(state);
 assignTicket(state,state.members[1],{passId:'p',slot:0,memberId:'c',expectedMemberId:''},123);
 assert.equal(state.passes[0].ticketAssignments[0].assignedBy,'b');
 assert.equal(state.passes[0].ticketAssignments[0].memberId,'c');
 const {ticketAssignments,...unchanged}=state.passes[0];assert.deepEqual(unchanged,before.passes[0]);
 assert.deepEqual(state.lineupFavorites,before.lineupFavorites);assert.deepEqual(state.rooms,before.rooms);
 assignTicket(state,state.members[1],{passId:'p',slot:0,memberId:'',expectedMemberId:'c'},456);
 assert.equal(state.passes[0].ticketAssignments.length,0);
});
test('slot bounds and project membership are enforced; concurrent different slots merge, same-slot stale edits fail',()=>{
 const state=makeState();
 for(const slot of [-1,4,1.5,'1',NaN])assert.throws(()=>assignTicket(state,state.members[0],{passId:'p',slot,memberId:'b',expectedMemberId:''},1));
 assert.throws(()=>assignTicket(state,state.members[0],{passId:'other',slot:0,memberId:'b',expectedMemberId:''},1));
 assert.throws(()=>assignTicket(state,state.members[0],{passId:'p',slot:0,memberId:'outside',expectedMemberId:''},1));
 assignTicket(state,state.members[0],{passId:'p',slot:0,memberId:'a',expectedMemberId:''},1);
 assignTicket(state,state.members[1],{passId:'p',slot:1,memberId:'b',expectedMemberId:''},2);
 assert.equal(state.passes[0].ticketAssignments.length,2);
 assert.throws(()=>assignTicket(state,state.members[1],{passId:'p',slot:0,memberId:'c',expectedMemberId:''},3),/Someone changed/);
 assert.equal(state.passes[0].ticketAssignments[0].memberId,'a');
});
test('purchase changes retain assignments; shrinking occupied slots and invalid quantities are rejected',()=>{
 const state=makeState();assignTicket(state,state.members[0],{passId:'p',slot:3,memberId:'b',expectedMemberId:''},1);
 const saved=structuredClone(state.passes[0].ticketAssignments);
 saveTicketPurchase(state,{...state.passes[0],quantity:5,totalCost:'300'},'unused');
 assert.equal(JSON.stringify(state.passes[0].ticketAssignments),JSON.stringify(saved));
 assert.throws(()=>saveTicketPurchase(state,{...state.passes[0],quantity:3},'unused'),/Unassign/);
 for(const quantity of [0,-1,1.5,501,'bad',Infinity])assert.throws(()=>ticketQuantity(quantity));
 saveTicketPurchase(state,{name:'New',category:'Shuttle',quantity:2},'new');assert.equal(state.passes[1].ticketAssignments.length,0);
 assert.throws(()=>saveTicketPurchase(state,{id:'deleted',name:'Gone',quantity:1},'new'),/no longer exists/);
});
test('backend mutation requires membership, permits ordinary members, and patches only this event',async()=>{
 const {update}=bundle('rallyTickets.ts');const handler=update._handler;
 const state=makeState();let identity={subject:'member'},patch;
 const ctx={auth:{getUserIdentity:async()=>identity},db:{query:()=>({withIndex:(name,callback)=>{callback({eq:(field,value)=>{assert.equal(value,'rally:test-event');}});return {unique:async()=>({_id:'doc',buckets:state})};}}),patch:async(id,value)=>{assert.equal(id,'doc');patch=value;}}};
 await handler(ctx,{eventId:'test-event',action:'assign',payload:{passId:'p',slot:0,memberId:'c',expectedMemberId:''}});
 assert.equal(patch.buckets.passes[0].ticketAssignments[0].memberId,'c');assert.equal(state.passes[0].ticketAssignments,undefined);
 identity={subject:'outside'};await assert.rejects(handler(ctx,{eventId:'test-event',action:'assign',payload:{}}),/belong/);
 identity=null;await assert.rejects(handler(ctx,{eventId:'test-event',action:'assign',payload:{}}),/Sign in/);
});
test('legacy purchase edits cannot shrink away assigned tickets or reset assignment data',()=>{
 const source=fs.readFileSync(__dirname+'/../../convex/rally.ts','utf8');
 const marker='} else if (["add-pass", "save-pass"].includes(args.action)) {';
 const branch=source.slice(source.indexOf(marker)+marker.length,source.indexOf('} else if (args.action === "delete-pass")'));
 const state=makeState();state.passes[0].ticketAssignments=[{slot:3,memberId:'b'}];
 const ctx={state,p:{...state.passes[0],quantity:2},id:()=> 'new'};
 vm.createContext(ctx);vm.runInContext(require('esbuild').transformSync('function save(){'+branch+'}',{loader:'ts'}).code,ctx);
 assert.throws(()=>ctx.save(),/Unassign/);assert.equal(state.passes[0].quantity,4);
 ctx.p.quantity=5;ctx.save();assert.equal(state.passes[0].ticketAssignments[0].memberId,'b');
});
function ui(){
 const dom=new JSDOM(fs.readFileSync(__dirname+'/index.html','utf8'),{url:'https://example.test/tools/rally/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.RallyOffline={save(){}};w.eval(fs.readFileSync(__dirname+'/app.js','utf8').replace('\ninit();','')+'\ndata='+JSON.stringify({...makeState(),currentMemberId:'b',isAdmin:false,travel:[]})+';activeEvent=data.id;activeView="passes";offlineMode=false;window.qaMove=()=>activeEvent="other";window.qaOffline=()=>offlineMode=true;');
 return {w,close:()=>w.close()};
}
test('UI renders one available slot per ticket, includes unclaimed crew, and keeps buyer separate from assignments',async()=>{
 const {w,close}=ui();try{
  w.renderPasses();assert.equal(w.document.querySelectorAll('[data-ticket-slot]').length,4);
  assert.match(w.document.querySelector('.ticket-coverage').textContent,/0 of 3/);
  assert.match(w.document.querySelector('.purchase-meta').textContent,/Alex/);
  w.document.querySelector('[data-ticket-slot="0"]').click();const select=w.document.querySelector('[name=memberId]');
  assert([...select.options].some(option=>option.value==='c'),'Unclaimed crew must be assignable');
  let args;w.convexMutation=async(path,request)=>{args={path,request};return {passes:[{...makeState().passes[0],ticketAssignments:[{slot:0,memberId:'c'}]}]};};
  select.value='c';await select.form.onsubmit({preventDefault(){}});
  assert.equal(args.path,'rallyTickets:update');assert.equal(args.request.payload.expectedMemberId,'');
  assert.match(w.document.querySelector('.ticket-coverage').textContent,/1 of 3/);
  assert.match(w.document.querySelector('[data-ticket-slot="0"]').textContent,/Riley/);
  assert.match(w.document.querySelector('.purchase-meta').textContent,/Alex/);
  assert.equal(w.memberHasTicket('a'),false);assert.equal(w.memberHasTicket('c'),true);
 }finally{close();}
});
test('ticket refresh preserves note drafts, expansion, and stale project responses; offline edits are blocked',async()=>{
 const {w,close}=ui();try{
  w.renderPasses();const draft=w.document.createElement('textarea');draft.value='Unsaved note';w.document.getElementById('page').append(draft);
  w.document.querySelector('.ticket-coverage-list').open=true;
  w.convexQuery=async()=>({...makeState(),passes:[{...makeState().passes[0],ticketAssignments:[{slot:1,memberId:'b'}]}]});
  await w.refreshTickets();assert.equal(draft.isConnected,true);assert.equal(draft.value,'Unsaved note');assert(w.document.querySelector('.ticket-coverage-list').open);
  let resolve;w.convexQuery=()=>new Promise(r=>resolve=r);const pending=w.refreshTickets();w.qaMove();resolve(makeState());await pending;
  assert.match(w.document.querySelector('.ticket-coverage').textContent,/1 of 3/);
  w.qaOffline();w.openTicketAssignment(makeState().passes[0],0);assert.equal(w.document.querySelector('#dialogRoot form'),null);
 }finally{close();}
});
