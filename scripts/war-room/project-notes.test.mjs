import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../war-room-10012026/project-notes.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(call){
 const storage=new Map();
 const window={WarRoomAuth:{call},addEventListener(){}};
 vm.runInNewContext(source,{window,document:{hidden:false,addEventListener(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},console});
 function control(){return {value:'',disabled:false,dataset:{},events:{},setAttribute(){},removeAttribute(name){if(name==='disabled')this.disabled=false},addEventListener(name,fn){this.events[name]=fn}}}
 function bind(){const input=control(),status=control(),button=control();window.WarRoomNotes.bind({querySelector:q=>q.includes('textarea')?input:q.includes('status')?status:button},'ihg','IHG cards');return {input,status,button}}
 const nodes=bind();
 return {api:window.WarRoomNotes,nodes,storage,bind,edit(text){nodes.input.value=text;nodes.input.events.input()}};
}
test('notes survive a board rerender and save text typed during an in-flight request',async()=>{
 let release;const writes=[];
 const f=fixture(async(kind,path,args)=>{
  if(kind==='query')return {};
  writes.push(args.text);
  if(writes.length===1)await new Promise(resolve=>release=resolve);
  return {text:args.text,updatedAt:writes.length};
 });
 f.api.start('test-user');await settle();f.edit('first draft');
 const flush=f.api.flushAll();await settle();f.edit('latest draft');
 assert.equal(f.bind().input.value,'latest draft');
 release();assert.equal(await flush,true);
 assert.deepEqual(writes,['first draft','latest draft']);
 assert.equal(f.api.hasPending(),false);
 assert.equal(f.api.getText('ihg'),'latest draft');
});
test('failed saves preserve the draft for retry and block sign-out flush',async()=>{
 let fail=true;
 const f=fixture(async(kind,path,args)=>{if(kind==='query')return {};if(fail)throw new Error('offline');return {text:args.text,updatedAt:1}});
 f.api.start('test-user');await settle();f.edit('keep this note');
 assert.equal(await f.api.flushAll(),false);
 assert.equal(f.nodes.input.value,'keep this note');
 assert.equal(f.api.hasPending(),true);
 assert.match([...f.storage.values()][0],/keep this note/);
 fail=false;assert.equal(await f.api.flushAll(),true);assert.equal(f.api.hasPending(),false);
});
test('losing authentication clears notes and ignores an outstanding save response',async()=>{
 let release;
 const f=fixture(async(kind,path,args)=>{if(kind==='query')return {};await new Promise(resolve=>release=resolve);return {text:args.text,updatedAt:1}});
 f.api.start('test-user');await settle();f.edit('private note');
 const flush=f.api.flushAll();await settle();f.api.stop();release();await flush;
 assert.equal(f.nodes.input.value,'');assert.equal(f.nodes.input.disabled,true);
 assert.equal(f.api.getText('ihg'),'');
});
