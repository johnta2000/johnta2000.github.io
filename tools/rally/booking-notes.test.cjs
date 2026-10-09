const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(){
 const dom=new JSDOM(fs.readFileSync(__dirname+'/index.html','utf8'),{url:'https://example.test/tools/rally/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.RallyOffline={native:false};w.eval(fs.readFileSync(__dirname+'/app.js','utf8').replace('\ninit();',''));
 return dom;
}
test('booking notes use a multiline field and round-trip line breaks, quotes, and markup literally',async()=>{
 const dom=setup(),w=dom.window;
 try{
  const notes='Arrival instructions\n• Breakfast & café credit\nLiteral </textarea><script>alert("not HTML")</script>';
  const room={id:'test-room',hotel:'Example hotel',roomType:'King',notes,capacity:2,bathrooms:1,checkIn:'Oct 8',checkOut:'Oct 9'};
  let saved;w.act=async(action,payload)=>{saved={action,payload};};
  w.openRoom(room);
  const input=w.document.querySelector('[name=notes]');assert.equal(input.tagName,'TEXTAREA');assert.equal(input.value,notes);
  assert.equal(w.document.querySelector('#dialogRoot script'),null);
  assert.equal(input.required,false);assert.equal(new w.FormData(input.form).get('notes'),notes);
  input.value+='\nParking reminder';input.dispatchEvent(new w.Event('input'));
  await input.form.onsubmit({preventDefault(){}});
  assert.equal(saved.action,'save-room');assert.equal(saved.payload.notes,notes+'\nParking reminder');assert.equal(saved.payload.id,room.id);
 }finally{w.close();}
});
test('new rooms allow empty booking notes, and cancel does not mutate the room',()=>{
 const dom=setup(),w=dom.window;
 try{
  w.openRoom();assert.equal(w.document.querySelector('textarea[name=notes]').value,'');w.closeDialog();
  const room={id:'room',hotel:'Example hotel',notes:'Saved booking notes'};w.openRoom(room);
  w.document.querySelector('textarea[name=notes]').value='Unsaved change';w.closeDialog();assert.equal(room.notes,'Saved booking notes');
 }finally{w.close();}
});
