const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {buildSync}=require('esbuild');
const {JSDOM}=require('jsdom');
const read=path=>fs.readFileSync(__dirname+'/'+path,'utf8');
const ctx={module:{exports:{}},require,TextEncoder,URL};
vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rallyNotes.ts'],write:false,bundle:true,platform:'node',format:'cjs',external:['convex/values']}).outputFiles[0].text,ctx);
const {updateNotes}=ctx.module.exports;
const member={id:'john',name:'John',role:'member'};
test('icon toolbar keeps accessible names and supports formatting shortcuts',()=>{
 const ui=setup();try{
  const commands=[];ui.w.document.execCommand=command=>commands.push(command);
  for(const [key,code,shiftKey,expected] of [['b','KeyB',false,'bold'],['i','KeyI',false,'italic'],['u','KeyU',false,'underline'],['&','Digit7',true,'insertOrderedList'],['*','Digit8',true,'insertUnorderedList']]){
   const event=new ui.w.KeyboardEvent('keydown',{key,code,shiftKey,ctrlKey:true,bubbles:true,cancelable:true});
   ui.editor.element.dispatchEvent(event);assert(event.defaultPrevented);assert.equal(commands.at(-1),expected);
  }
  ui.editor.element.dispatchEvent(new ui.w.KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true,cancelable:true}));
  assert.equal(ui.w.document.querySelector('.rich-note-link').hidden,false);
  for(const command of ['insertUnorderedList','insertOrderedList','link','unlink']){
   const button=ui.w.document.querySelector(`[data-command="${command}"]`);assert(button.querySelector('svg'));assert(button.getAttribute('aria-label'));assert.equal(button.textContent,'');
  }
 }finally{ui.w.close();}
});
const richText=[{type:'p',children:[{type:'strong',children:[{type:'text',text:'Room 1'}]}]},{type:'ul',children:[{type:'li',children:[{type:'em',children:[{type:'text',text:'Breakfast included'}]}]},{type:'li',children:[{type:'a',href:'https://example.com/hotel',children:[{type:'text',text:'Hotel details'}]}]}]}];
function setup(note={body:'First line\n\nSecond line'}){
 const dom=new JSDOM('<!doctype html><form><label for="body">Note</label><textarea id="body" name="body" required></textarea></form>',{url:'https://www.john-ta.com',runScripts:'outside-only'});
 dom.window.eval(read('note-rich-text.js'));dom.window.eval(read('note-editor.js'));
 const input=dom.window.document.querySelector('textarea');input.value=note.body;
 const editor=dom.window.RallyNoteEditor.mount(input,note);
 return {dom,w:dom.window,input,editor};
}
test('rich notes round-trip through server storage and editor without losing formatting',()=>{
 const notes=updateNotes([],'add-note',{body:'spoofed text',richText},member,10,()=> 'one');
 assert.equal(notes[0].body,'Room 1\nBreakfast included\nHotel details');
 const ui=setup(notes[0]);try{
  assert.equal(ui.editor.element.querySelector('strong').textContent,'Room 1');
  assert.equal(ui.editor.element.querySelectorAll('li').length,2);
  const value=ui.editor.getValue();assert.equal(value.body,notes[0].body);
  const edited=updateNotes(notes,'edit-note',{id:'one',expectedUpdatedAt:10,...value},member,11,()=> 'unused');
  assert.deepEqual(JSON.parse(JSON.stringify(edited[0].richText)),richText);
  assert.equal(ui.input.hidden,true);assert.equal(ui.input.required,false);
 }finally{ui.w.close();}
});
test('old notes remain literal text and old-client edits cannot leave stale formatting',()=>{
 const ui=setup({body:'<script>alert(1)</script>\n\n**literal**'});try{
  assert.equal(ui.editor.element.querySelector('script'),null);
  assert.equal(ui.editor.getValue().body,'<script>alert(1)</script>\n\n**literal**');
 }finally{ui.w.close();}
 const notes=updateNotes([],'add-note',{richText},member,10,()=> 'one');
 const unchanged=updateNotes(notes,'edit-note',{id:'one',body:notes[0].body,expectedUpdatedAt:10},member,11,()=> '');
 assert(unchanged[0].richText);
 const changed=updateNotes(notes,'edit-note',{id:'one',body:'Plain replacement',expectedUpdatedAt:10},member,11,()=> '');
 assert(!('richText' in changed[0]));
});
test('server rejects executable links, unsupported nodes and oversized rich documents',()=>{
 for(const href of ['javascript:alert(1)','data:text/html,hi','//evil.test','https://example.com/\npath']){
  assert.throws(()=>updateNotes([],'add-note',{richText:[{type:'a',href,children:[{type:'text',text:'x'}]}]},member,1,()=>''));
 }
 for(const nodes of [[{type:'script',children:[]}],[{type:'text',text:'x'.repeat(4001)}],Array(2001).fill({type:'br'})])assert.throws(()=>updateNotes([],'add-note',{richText:nodes},member,1,()=>''));
 assert.throws(()=>updateNotes([],'add-note',{richText:[{type:'p',children:[]}]},member,1,()=>''),/4,000/);
});
test('pasted HTML is converted to allowed formatting and attributes never execute on rendering',()=>{
 const ui=setup();try{
  const template=ui.w.document.createElement('template');template.innerHTML='<p onclick="bad()"><b>Keep</b><img src=x onerror=bad()><script>bad()</script><a href="javascript:bad()">words</a></p>';
  const nodes=ui.w.RallyNoteEditor.fromDOM(template.content),html=ui.w.RallyNoteRichText.richTextHtml(nodes);
  assert.equal(html,'<p><strong>Keep</strong>words</p>');
  assert(!html.includes('onclick'));assert(!html.includes('script'));
  ui.editor.setDisabled(true);assert.equal(ui.editor.element.contentEditable,'false');
  assert([...ui.w.document.querySelectorAll('.rich-note-toolbar button')].every(button=>button.disabled));
  ui.editor.setDisabled(false);ui.editor.clear();assert.equal(ui.input.value,'');assert.throws(()=>ui.editor.getValue());
 }finally{ui.w.close();}
});
