const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{transformSync}=require('esbuild');
const read=file=>fs.readFileSync(__dirname+'/'+file,'utf8');
const room=id=>({id,name:id,startsAt:'2027-01-21',endsAt:'2027-01-21',eventTimeZone:'America/Los_Angeles',members:[{id:'me',name:'Alex',initials:'A',role:'admin'},{id:'friend',name:'Sam',initials:'S'}],currentMemberId:'me',rooms:[],travel:[],passes:[],cars:[],notes:[],tasks:[],lineup:[]});
function ui(){
 const dom=new JSDOM(read('index.html'),{url:'https://example.test/tools/rally/?event=a',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.Clerk={user:{id:'owner'},isSignedIn:true};w.RallyOffline={native:false,userId:'owner',flush:async()=>{},room:()=>room('a')};
 w.eval(read('app.js').replace('\ninit();','')+`;data=${JSON.stringify(room('a'))};activeEvent='a';activeView='crew';window.qaState=()=>data;window.qaSet=room=>{data=room;activeEvent=room.id;};`);
 w.render=()=>{};w.showToast=()=>{};w.updateOfflineStatus=()=>{};
 return w;
}
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};};
test('a slow save cannot replace the next project or account screen',async()=>{
 for(const change of ['project','account']){
  const w=ui();try{
   const request=deferred();w.convexMutation=()=>request.promise;
   const save=w.act('save-task',{title:'Remember earplugs'},'Saved');
   if(change==='project')w.qaSet(room('b'));else w.Clerk.user={id:'different'};
   request.resolve({...room('a'),name:'Old response'});
   await assert.rejects(save,/changed|reopen/i);
   assert.notEqual(w.qaState().name,'Old response');
  }finally{w.close();}
 }
});
test('idle favorite sync does not restore an older room snapshot over current state',async()=>{
 const w=ui();try{w.qaState().notes=[{id:'fresh'}];await w.syncFavorites();assert.equal(w.qaState().notes[0]?.id,'fresh');}finally{w.close();}
});
test('favorite sync updates likes only, preserving current notes and project settings',async()=>{
 const w=ui();try{
  w.qaState().notes=[{id:'fresh'}];w.qaState().hiddenSections=['travel'];
  w.RallyOffline.flush=async()=>true;w.RallyOffline.room=()=>({...room('a'),currentLineupFavorites:['liked'],lineupInterests:{liked:[{id:'me'}]}});
  await w.syncFavorites();assert.equal(w.qaState().notes[0]?.id,'fresh');assert.deepEqual(Array.from(w.qaState().hiddenSections),['travel']);assert.deepEqual(Array.from(w.qaState().currentLineupFavorites),['liked']);
 }finally{w.close();}
});
test('crew readiness reflects real room assignments and hides disabled sections',()=>{
 const w=ui();try{
  w.qaState().rooms=[{memberIds:['me']}];w.renderCrew();
  assert.match(w.document.querySelectorAll('.checks')[0].textContent,/✓ Stay/);
  assert.match(w.document.querySelectorAll('.checks')[1].textContent,/○ Stay/);
  w.qaState().hiddenSections=['stay','travel','passes'];w.renderCrew();
  assert.equal(w.document.querySelector('.checks').textContent,'');
 }finally{w.close();}
});
test('new lodging has no prefilled hotel from another festival',()=>{
 const w=ui();try{w.openRoom();assert.equal(w.document.querySelector('[name=hotel]').value,'');}finally{w.close();}
});
test('failed delete offers retry instead of throwing while reading a cleared event target',async()=>{
 const w=ui();try{
  const request=deferred();w.openDangerDialog('Remove?','','Remove',()=>request.promise.then(()=>{throw Error('Connection lost');}));
  const button=w.document.getElementById('confirmDanger'),event={currentTarget:button};
  const pending=button.onclick(event);event.currentTarget=null;request.resolve();
  await pending;assert.equal(button.disabled,false);
 }finally{w.close();}
});
test('slow save from a dismissed dialog cannot close or replace a newly opened editor',async()=>{
 const w=ui();try{
  const request=deferred();w.convexMutation=()=>request.promise;w.openTask();
  const form=w.document.querySelector('#dialogRoot form');const pending=form.onsubmit({preventDefault(){}});
  w.closeDialog();w.openRoom();const newForm=w.document.querySelector('#dialogRoot form');
  request.resolve(room('a'));await pending;
  assert.equal(w.document.querySelector('#dialogRoot form'),newForm);
 }finally{w.close();}
});
test('calendar countdown uses the event day in its timezone, not a noon-UTC approximation',()=>{
 const w=ui();try{
  assert.equal(w.eventDaysAway(room('a'),Date.parse('2027-01-22T01:00:00Z')),0);
  assert.equal(w.eventDaysAway(room('a'),Date.parse('2027-01-21T07:30:00Z')),1);
  assert.equal(w.eventDaysAway({...room('a'),startsAt:'2027-03-15'},Date.parse('2027-03-14T08:00:00Z')),1);
 }finally{w.close();}
});
function backendBranch(action,next){
 const source=read('../../convex/rally.ts'),marker=`} else if (args.action === "${action}") {`;
 const branch=source.slice(source.indexOf(marker)+marker.length,source.indexOf(next));
 return transformSync('function run(){'+branch+'}',{loader:'ts'}).code;
}
test('moving into a full or missing hotel room never erases the existing assignment',()=>{
 const code=backendBranch('assign-room','} else if (["add-flight", "save-flight"].includes(args.action))');
 for(const target of ['full','missing']){
  const state={members:[{id:'me'},{id:'friend'}],rooms:[{id:'old',capacity:1,memberIds:['me']},{id:'full',capacity:1,memberIds:['friend']}]},before=structuredClone(state);
  const ctx={state,p:{roomId:target,memberId:'me'},ConvexError:Error};vm.runInNewContext(code,ctx);
  assert.throws(()=>ctx.run(),/full|no longer|room/i);assert.deepEqual(state,before);
 }
 const state={members:[{id:'me'}],rooms:[{id:'same',capacity:1,memberIds:['me']}]},ctx={state,p:{roomId:'same',memberId:'me'},ConvexError:Error};
 vm.runInNewContext(code,ctx);ctx.run();assert.deepEqual(state.rooms[0].memberIds,['me']);
 ctx.p.memberId='outsider';assert.throws(()=>ctx.run(),/crew|member/i);
});
test('editing an imported set changes its canonical name and overnight times while preserving likes and ID',()=>{
 const state={lineup:[{id:'set',name:'Old',artist:'Old',date:'2027-01-21',festivalDate:'2027-01-21',start:'2027-01-21T22:00',end:'2027-01-21T23:00',genre:'Dubstep'}],lineupFavorites:{me:['set']}},ctx={state,p:{id:'set',name:'Updated artist',day:'Thursday',date:'2027-01-21',start:'2027-01-21T23:30',end:'2027-01-22T00:45',stage:'Main'},current:{role:'admin'},ConvexError:Error,id:()=> 'new'};
 vm.runInNewContext(backendBranch('save-lineup-artist','} else if (args.action === "delete-lineup-artist")'),ctx);ctx.run();
 assert.equal(state.lineup[0].artist,'Updated artist');assert.equal(state.lineup[0].start,ctx.p.start);assert.equal(state.lineup[0].durationMinutes,75);assert.equal(state.lineup[0].genre,'Dubstep');assert.deepEqual(state.lineupFavorites.me,['set']);
 ctx.p.end='2027-01-21T00:45';assert.throws(()=>ctx.run(),/after its start/);
 ctx.p.end='2027-02-30T01:00';assert.throws(()=>ctx.run(),/valid local/);
 ctx.p.start='';ctx.p.end='';ctx.run();assert.equal(state.lineup[0].start,'');assert.equal(state.lineup[0].end,'');assert.equal(state.lineup[0].time,'');
 ctx.p.id='deleted';assert.throws(()=>ctx.run(),/no longer exists/);assert.equal(state.lineup.length,1);
});
test('artist editor loads imported start and end values and allows an end on the next day',async()=>{
 const w=ui();try{
  const artist={id:'set',artist:'Test artist',name:'Old alias',festivalDate:'2027-01-21',day:'Thursday',start:'2027-01-21T23:30',end:'2027-01-22T01:00'};
  w.openLineupArtist(artist);const form=w.document.querySelector('#dialogRoot form');
  assert.equal(form.elements.name.value,'Test artist');assert.equal(form.elements.start.value,artist.start);assert.equal(form.elements.end.value,artist.end);
  let saved;w.act=async(action,values)=>{saved=values;};await form.onsubmit({preventDefault(){}});assert.equal(saved.id,artist.id);assert.equal(saved.end,artist.end);
 }finally{w.close();}
});
test('room edits cannot recreate a deleted booking, accept negative capacity, or shrink below assigned guests',()=>{
 const state={rooms:[{id:'room',capacity:2,memberIds:['me','friend']}],lineupFavorites:{me:['set']}},ctx={state,p:{id:'room',hotel:'Example',roomType:'Queen',capacity:1,bathrooms:1},ConvexError:Error,id:()=> 'new'};
 vm.runInNewContext(backendBranch('save-room','} else if (args.action === "delete-room")'),ctx);
 assert.throws(()=>ctx.run(),/extra people/);
 for(const capacity of [-1,0,1.5,'bad',Infinity]){ctx.p.capacity=capacity;assert.throws(()=>ctx.run(),/whole numbers/);}
 ctx.p.capacity=2;ctx.p.id='deleted';assert.throws(()=>ctx.run(),/no longer exists/);assert.equal(state.rooms.length,1);
 ctx.p.id='room';ctx.run();assert.deepEqual(state.rooms[0].memberIds,['me','friend']);assert.deepEqual(state.lineupFavorites.me,['set']);
});
test('dialogs are labeled, dismiss with Escape, return focus, and release their searchable pickers',()=>{
 const w=ui();try{
  w.HTMLElement.prototype.scrollIntoView=function(){};w.eval(read('../../assets/js/searchable-select.js'));
  const trigger=w.document.getElementById('accountButton');trigger.focus();w.openTask();
  const dialog=w.document.querySelector('[role=dialog]');assert.equal(dialog.getAttribute('aria-modal'),'true');assert(w.document.getElementById('rallyApp').inert);
  const select=w.document.querySelector('#dialogRoot select'),picker=w.SearchableSelect.enhance(select);let destroyed=false;const original=picker.destroy;picker.destroy=()=>{destroyed=true;original();};
  dialog.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert(destroyed);assert.equal(w.document.querySelector('#dialogRoot .dialog'),null);assert.equal(w.document.activeElement,trigger);assert.equal(w.document.getElementById('rallyApp').inert,false);
 }finally{w.close();}
});
test('late invite options cannot open in a different project or replace a newer editor',async()=>{
 for(const change of ['project','editor']){
  const w=ui();try{
   const request=deferred();w.convexQuery=()=>request.promise;
   const pending=w.openInvite();
   if(change==='project')w.qaSet(room('b'));else w.openRoom();
   const previous=w.document.querySelector('#dialogRoot .dialog');
   request.resolve([]);await pending;
   assert.equal(w.document.querySelector('#dialogRoot .dialog'),previous);
  }finally{w.close();}
 }
});
test('dialog returns keyboard focus to a trigger inside the lineup shadow root',()=>{
 const w=ui();try{
  const host=w.document.createElement('div');w.document.body.append(host);
  const shadow=host.attachShadow({mode:'open'}),trigger=w.document.createElement('button');shadow.append(trigger);trigger.focus();
  w.openLineupArtist();w.closeDialog();assert.equal(shadow.activeElement,trigger);
 }finally{w.close();}
});
