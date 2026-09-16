const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const backend=fs.readFileSync(__dirname+'/../../convex/rally.ts','utf8');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const moduleContext={module:{exports:{}},require,TextEncoder};
vm.runInNewContext(transformSync(fs.readFileSync(__dirname+'/../../convex/rallyNotes.ts','utf8'),{loader:'ts',format:'cjs'}).code,moduleContext);
const {updateNotes}=moduleContext.module.exports;
const author={id:'jessi',name:'Jessi',role:'member'}, other={id:'kevin',name:'Kevin',role:'member'}, admin={id:'john',name:'John',role:'admin'};
const plain=value=>JSON.parse(JSON.stringify(value));
const create=()=>updateNotes(undefined,'add-note',{body:'Bring earplugs'},author,100,()=> 'note-1');

test('new posts use server identity, timestamp and ID; existing project notes survive',()=>{
  const notes=create();
  const result=updateNotes(notes,'add-note',{id:'spoof',body:'  Meetup at 6\nHotel lobby  ',authorId:'john',authorName:'Fake',createdAt:0,updatedAt:0},other,200,()=> 'note-2');
  assert.deepEqual(plain(result[0]),{id:'note-2',body:'Meetup at 6\nHotel lobby',authorId:'kevin',authorName:'Kevin',createdAt:200,updatedAt:200});
  assert.deepEqual(plain(result[1]),plain(notes[0]));assert.equal(notes.length,1);
});
test('authors edit their own posts; only owners or admins can delete',()=>{
  const notes=create(), payload={id:'note-1',body:'Updated',expectedUpdatedAt:100};
  const result=updateNotes(notes,'edit-note',payload,author,101,()=> 'unused');
  assert.equal(result[0].body,'Updated');assert.equal(result[0].createdAt,100);assert.equal(result[0].updatedAt,101);
  for(const member of [other,admin])assert.throws(()=>updateNotes(notes,'edit-note',payload,member,102,()=>''),/own notes/);
  assert.throws(()=>updateNotes(notes,'delete-note',payload,other,102,()=>''),/own notes/);
  for(const member of [author,admin,{...admin,role:'leader'}])assert.equal(updateNotes(notes,'delete-note',payload,member,102,()=> '').length,0);
});
test('rejects empty/oversized notes, stale edits/deletes, unknown IDs and oversized boards',()=>{
  for(const body of ['', '  \n ',42,'a'.repeat(4001)])assert.throws(()=>updateNotes([],'add-note',{body},author,1,()=>''),/4,000/);
  assert.equal(updateNotes([],'add-note',{body:'a'.repeat(4000)},author,1,()=> 'one').length,1);
  for(const action of ['edit-note','delete-note']){
    assert.throws(()=>updateNotes(create(),action,{id:'note-1',body:'new',expectedUpdatedAt:99},author,200,()=>''),/changed/);
    assert.throws(()=>updateNotes(create(),action,{id:'elsewhere',body:'new'},admin,200,()=>''),/no longer/);
  }
  const full=Array.from({length:50},(_,i)=>({...create()[0],id:String(i),body:'x'.repeat(4000)}));
  assert.throws(()=>updateNotes(full,'add-note',{body:'Too much'},author,200,()=>''),/board is full/);
});
test('note writes stay behind authenticated project membership and touch only notes',()=>{
  const handler=backend.slice(backend.indexOf('export const act = mutation('));
  assert(handler.indexOf('await requireIdentity(ctx)') < handler.indexOf('state.notes = updateNotes'));
  assert(handler.indexOf('if (!current) throw') < handler.indexOf('state.notes = updateNotes'));
  const branch=handler.slice(handler.indexOf('state.notes = updateNotes'),handler.indexOf('} else if (args.action === "invite-member")'));
  const state={notes:create(),lineupFavorites:{john:['set1']},rooms:[{id:'room1'}],members:[author]};
  const context={state,args:{action:'add-note'},p:{body:'New note'},current:other,id:()=> 'note2',updateNotes,Date};
  vm.runInNewContext(branch,context);
  assert.equal(state.notes.length,2);assert.deepEqual(state.lineupFavorites,{john:['set1']});assert.deepEqual(state.rooms,[{id:'room1'}]);
});
test('board escapes text, uses latest author name, orders newest first and hides forbidden actions',()=>{
  const escapeHtml=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const context={data:{currentMemberId:'jessi',isAdmin:false},memberMap:()=>({jessi:{name:'Jessica'}}),escapeHtml,escapeAttr:escapeHtml,initials:name=>name.slice(0,2),offlineMode:false};
  vm.createContext(context);vm.runInContext(app.slice(app.indexOf('function noteCards('),app.indexOf('function renderNoteList(')),context);
  const notes=[...create(),{...create()[0],id:'newer',authorId:'kevin',authorName:'Kevin',body:'<script>bad()</script>\nline2',createdAt:200,updatedAt:201}];
  let html=context.noteCards(notes);
  assert(html.indexOf('data-note-id="newer"')<html.indexOf('data-note-id="note-1"'));
  assert(html.includes('Jessica'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(html.includes('Edited'));
  assert(html.includes('data-note-edit="note-1"'));assert(!html.includes('data-note-edit="newer"'));assert(!html.includes('data-note-delete="newer"'));
  context.data.isAdmin=true;html=context.noteCards(notes);assert(html.includes('data-note-delete="newer"'));assert(!html.includes('data-note-edit="newer"'));
  context.offlineMode=true;assert(context.noteCards(notes).includes('data-note-edit="note-1" disabled'));
  assert(context.noteCards([]).includes('No notes yet'));
});
test('offline writes and late responses after changing projects cannot alter the current board',async()=>{
  let calls=0;
  const context={offlineMode:true,notesRevision:0,activeEvent:'lostlands',activeView:'notes',data:{id:'lostlands'},window:{Clerk:{user:{id:'user'}}},convexMutation:async()=>{calls++;return {id:'old'};}};
  vm.createContext(context);vm.runInContext(app.slice(app.indexOf('async function saveNote('),app.indexOf('function openEditNote(')),context);
  await assert.rejects(context.saveNote('lostlands','add-note',{body:'hi'}),/Reconnect/);assert.equal(calls,0);
  context.offlineMode=false;context.activeEvent='edc';
  await context.saveNote('lostlands','add-note',{body:'hi'});assert.equal(context.data.id,'lostlands');assert.equal(calls,1);
});
test('refresh only replaces the list, never the composer; stale refreshes are ignored',async()=>{
  let resolve, renders=0;
  const status={textContent:''};
  const context={notesRevision:0,activeEvent:'a',activeView:'notes',offlineMode:false,data:{notes:[]},document:{getElementById:()=>status},convexQuery:()=>new Promise(r=>resolve=r),renderNoteList:()=>renders++,focusSearchResult:()=>{}};
  vm.createContext(context);vm.runInContext(app.slice(app.indexOf('async function refreshNotes('),app.indexOf('async function saveNote(')),context);
  const stale=context.refreshNotes();context.notesRevision++;resolve({notes:create()});await stale;assert.equal(renders,0);
  const fresh=context.refreshNotes();resolve({notes:create()});await fresh;assert.equal(renders,1);assert.equal(context.data.notes.length,1);
});
