const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {buildSync}=require('esbuild');
const backend=fs.readFileSync(__dirname+'/../../convex/rally.ts','utf8');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const moduleContext={module:{exports:{}},require,TextEncoder,URL};
vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rallyNotes.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['convex/values']}).outputFiles[0].text,moduleContext);
const {updateNotes}=moduleContext.module.exports;
const author={id:'jessi',name:'Jessi',role:'member'}, other={id:'kevin',name:'Kevin',role:'member'}, admin={id:'john',name:'John',role:'admin'};
const plain=value=>JSON.parse(JSON.stringify(value));
const create=()=>updateNotes(undefined,'add-note',{body:'Bring earplugs'},author,100,()=> 'note-1');
test('every reaction serializes as a valid Convex database value',()=>{
 const {convexToJson}=require('convex/values');
 let notes=create();
 for(const emoji of ['👍','❤️','😂','🔥','👀','✅'])notes=updateNotes(notes,'react-note',{id:'note-1',emoji,active:true},other,200,()=> '');
 assert.doesNotThrow(()=>convexToJson(plain(notes)));
 assert.deepEqual(Object.keys(notes[0].reactions),['check']);
 assert.deepEqual(plain(notes[0].reactions.check),['kevin']);
});
test('hotel maps include verified address, honor custom addresses and encode destinations',()=>{
 const escapeHtml=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const ctx={data:{location:'Columbus, OH'},escapeHtml,escapeAttr:escapeHtml};
 vm.runInNewContext(app.slice(app.indexOf('function hotelAddress('),app.indexOf('function noteSection(')),ctx);
 assert.equal(ctx.hotelAddress({hotel:'Hyatt Regency Columbus'}),'350 North High Street, Columbus, OH 43215');
 assert.equal(ctx.hotelAddress({hotel:'Hyatt Regency Columbus',address:'Custom address'}),'Custom address');
 const html=ctx.hotelLocation({hotel:'Hotel & Suites',address:'123 Main St'});
 assert(html.includes('Hotel%20%26%20Suites%2C%20123%20Main%20St'));assert(html.includes('target="_blank"'));assert(html.includes('123 Main St'));
});
test('members react as themselves, retries are idempotent and removing preserves others',()=>{
 const react=(notes,who,active,emoji='👍')=>updateNotes(notes,'react-note',{id:'note-1',emoji,active,memberId:'spoof'},who,999,()=> '');
 let notes=react(create(),other,true);notes=react(notes,other,true);notes=react(notes,author,true);
assert.deepEqual(plain(notes[0].reactions),{like:['kevin','jessi']});assert.equal(notes[0].updatedAt,100);
 notes=react(notes,other,false);assert.deepEqual(plain(notes[0].reactions),{like:['jessi']});
 notes=updateNotes(notes,'edit-note',{id:'note-1',body:'Updated',expectedUpdatedAt:100},author,101,()=> '');
 assert.deepEqual(plain(notes[0].reactions),{like:['jessi']});
 assert.throws(()=>react(notes,other,true,'bad'),/supported/);
 assert.throws(()=>react([],other,true),/no longer/);
});

test('new posts use server identity, timestamp and ID; existing project notes survive',()=>{
  const notes=create();
  const result=updateNotes(notes,'add-note',{id:'spoof',body:'  Meetup at 6\nHotel lobby  ',authorId:'john',authorName:'Fake',createdAt:0,updatedAt:0},other,200,()=> 'note-2');
  assert.deepEqual(plain(result[0]),{id:'note-2',body:'Meetup at 6\nHotel lobby',section:'general',authorId:'kevin',authorName:'Kevin',createdAt:200,updatedAt:200});
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
  const context={data:{currentMemberId:'jessi',isAdmin:false},memberMap:()=>({jessi:{name:'Jessica'}}),escapeHtml,escapeAttr:escapeHtml,initials:name=>name.slice(0,2),offlineMode:false,activeView:'notes',noteSections:{general:'General',stay:'Stay',crew:'Crew',travel:'Travel',passes:'Passes'},href:view=>`?view=${view}`};
  vm.runInNewContext(app.slice(app.indexOf('function noteSection('),app.indexOf('function noteCards(')),context);
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
test('notes keep valid sections; legacy notes default to General and old clients cannot drop a section',()=>{
  const stay=updateNotes([],'add-note',{body:'Hotel check-in at 3',section:'stay'},author,100,()=> 'hotel');
  assert.equal(stay[0].section,'stay');
  const edited=updateNotes(stay,'edit-note',{id:'hotel',body:'Check-in at 4',expectedUpdatedAt:100},author,101,()=> 'unused');
  assert.equal(edited[0].section,'stay');
  const moved=updateNotes(edited,'edit-note',{id:'hotel',body:'Check-in at 4',section:'general',expectedUpdatedAt:101},author,102,()=> 'unused');
  assert.equal(moved[0].section,'general');assert.equal(moved[0].id,'hotel');assert.equal(moved[0].createdAt,100);
  for(const section of ['lineup','tasks','other-project',null,{},['stay']])assert.throws(()=>updateNotes([],'add-note',{body:'Hi',section},author,1,()=>''),/Choose General/);
  assert.throws(()=>updateNotes(stay,'edit-note',{id:'hotel',body:'Moved',section:'passes',expectedUpdatedAt:100},other,102,()=>''),/own notes/);
});
test('section boards isolate notes and General only includes general or legacy notes',()=>{
  const noteSections={general:'General',stay:'Stay',crew:'Crew',travel:'Travel',passes:'Passes'};
  const ctx={noteSections};vm.createContext(ctx);
  vm.runInContext(app.slice(app.indexOf('function noteSection('),app.indexOf('function noteCards(')),ctx);
  const notes=[{id:'old',body:'Legacy'},{id:'stay',section:'stay'},{id:'travel',section:'travel'}];
  assert.deepEqual(Array.from(ctx.notesForSection(notes,'stay'),n=>n.id),['stay']);
  assert.deepEqual(Array.from(ctx.notesForSection(notes,'general'),n=>n.id),['old']);
  assert.deepEqual(Array.from(ctx.notesForSection(notes,'all'),n=>n.id),['old']);
  assert.equal(ctx.notesForSection(notes,'crew').length,0);
  vm.runInContext(app.slice(app.indexOf('function notesBoardMarkup('),app.indexOf('function wireNotes(')),ctx);
  const stay=ctx.notesBoardMarkup('stay');
  assert(stay.includes('data-section="stay"'));assert(stay.includes('Check-in details'));assert(!stay.includes('name="section"'));
  assert(!ctx.notesBoardMarkup('general').includes('name="section"'));
  assert(!app.includes('noteSectionPicker('));
  assert(app.includes('section:noteSection(note),expectedUpdatedAt:note.updatedAt'));
});
test('posting from a section captures that project and section, not later navigation',async()=>{
  const input={value:'Hotel parking is included'},error={hidden:true},fieldset={disabled:false},form={elements:{body:input},querySelector:selector=>selector==='#noteError'?error:fieldset};
  const refresh={};let sent;
  const ctx={window:{RallyNoteEditor:{mount(){}}},activeEvent:'lostlands',offlineMode:true,document:{getElementById:id=>id==='noteComposer'?form:refresh},renderNoteList(){},updateNotesConnectivity(){},refreshNotes(){},showToast(){},saveNote:async(...args)=>{sent=args;}};
  vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('function wireNotes('),app.indexOf('async function refreshNotes(')),ctx);
  ctx.wireNotes('stay');ctx.activeEvent='edc';ctx.offlineMode=false;
  await form.onsubmit({preventDefault(){}});
  assert.deepEqual(plain(sent),['lostlands','add-note',{body:'Hotel parking is included',section:'stay'}]);
  assert.equal(input.value,'');assert.equal(fieldset.disabled,false);
  input.value='Keep this draft';ctx.saveNote=async()=>{throw new Error('No connection');};
  await form.onsubmit({preventDefault(){}});assert.equal(input.value,'Keep this draft');assert.equal(error.hidden,false);
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
  const context={notesRevision:0,activeEvent:'a',activeView:'stay',offlineMode:false,data:{notes:[]},document:{getElementById:()=>status},convexQuery:()=>new Promise(r=>resolve=r),renderNoteList:()=>renders++,focusSearchResult:()=>{}};
  vm.createContext(context);vm.runInContext(app.slice(app.indexOf('async function refreshNotes('),app.indexOf('async function saveNote(')),context);
  const stale=context.refreshNotes();context.notesRevision++;resolve({notes:create()});await stale;assert.equal(renders,0);
  const fresh=context.refreshNotes();resolve({notes:create()});await fresh;assert.equal(renders,1);assert.equal(context.data.notes.length,1);
  const navigated=context.refreshNotes();context.activeView='travel';resolve({notes:[]});await navigated;assert.equal(renders,1);assert.equal(context.data.notes.length,1);
});
