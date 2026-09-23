const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
function setup(search = '', allowed = [{id:'lost-lands-2026',name:'Lost Lands'}]) {
  const nodes = new Map(), calls = [];
  const node = () => ({hidden:false,textContent:'',children:[],classList:{add(){},remove(){}},setAttribute(k,v){this[k]=v;},replaceChildren(){this.children=[];},append(child){this.children.push(child);}});
  const document = {body:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node};
  const location = {href:`https://www.john-ta.com/tools/rally/${search}`,search};
  const room = {id:allowed[0]?.id,members:[{id:'k',name:'Kevin Tang',initials:'JT'}],currentMemberId:'k'};
  const ctx = {document,location,URL,URLSearchParams,navigator:{onLine:true},console:{error(){}},RallyOffline:{native:false,identify(){},select(){}},window:{Clerk:{isSignedIn:true,user:{id:'user_kevin',fullName:'Kevin Tang',primaryEmailAddress:{emailAddress:'kevin@example.test'}}}},history:{replaceState(_s,_t,url){location.href=new URL(url,location.href).href;location.search=new URL(location.href).search;}}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'event-lifecycle.js'),'utf8'),ctx);
  vm.runInContext(app.replace('\ninit();',''),ctx);
  ctx.convexQuery = async (name,args) => {calls.push({name,args});return name==='rally:listEvents'?allowed:room;};
  ctx.convexMutation = async (name,args) => {calls.push({name,args});return {...room,id:args.eventId};};
  ctx.render=()=>calls.push({name:'render'});
  ctx.updateOfflineStatus=()=>{};ctx.syncFavorites=async()=>{};ctx.openSavedRoom=()=>false;
  vm.runInContext(`activeEvent = new URLSearchParams(location.search).get('event') || DEFAULT_EVENT`,ctx);
  return {ctx,nodes,calls,location};
}
test('generic landing opens an authorized room, not an inaccessible default', async()=>{
  const {ctx,calls,location}=setup('?view=lineup',[{id:'edc-2027',name:'EDC'}]);
  await ctx.unlock();
  assert.equal(calls[0].name,'rally:listEvents');
  assert.equal(calls.find(c=>c.name==='rally:bootstrap').args.eventId,'edc-2027');
  assert.equal(new URL(location.href).searchParams.get('view'),'lineup');
  assert.equal(new URL(location.href).searchParams.get('event'),'edc-2027');
});
test('explicit authorized room remains selected and simultaneous unlocks share a request',async()=>{
  const {ctx,calls,nodes}=setup('?event=lost-lands-2026');
  const first=ctx.unlock(),second=ctx.unlock();assert.equal(first,second);
  await first;
  assert.equal(calls.filter(c=>c.name==='rally:bootstrap').length,1);
  assert.equal(nodes.get('rallyApp').hidden,false);
  assert.equal(nodes.get('accessGate').hidden,true);
});
test('generic landing skips past raves but explicit past-room links still work',async()=>{
 const allowed=[{id:'old',name:'Old',eventVisibility:'past',startsAt:'2025-01-01',endsAt:'2025-01-01'},{id:'next',name:'Next',eventVisibility:'active',startsAt:'2027-01-01',endsAt:'2027-01-01'}];
 const generic=setup('',allowed);await generic.ctx.unlock();assert.equal(generic.calls.find(c=>c.name==='rally:bootstrap').args.eventId,'next');
 const direct=setup('?event=old',allowed);await direct.ctx.unlock();assert.equal(direct.calls.find(c=>c.name==='rally:bootstrap').args.eventId,'old');
});
test('an inaccessible explicit link offers only authorized rooms without bootstrapping it',async()=>{
  const {ctx,calls,nodes,location}=setup('?event=private-room',[{id:'edc-2027',name:'EDC'}]);
  await ctx.unlock();
  assert(!calls.some(c=>c.name==='rally:bootstrap'));
  assert(nodes.get('authStatus').textContent.includes('kevin@example.test'));
  assert(nodes.get('authStatus').textContent.includes('does not have access'));
  assert.equal(nodes.get('rallyApp').hidden,true);
  assert.equal(nodes.get('authOptions').children[0].textContent,'Open EDC');
  nodes.get('authOptions').children[0].onclick();await ctx.unlock();
  assert.equal(new URL(location.href).searchParams.get('event'),'edc-2027');
  assert.equal(calls.find(c=>c.name==='rally:bootstrap').args.eventId,'edc-2027');
  assert.equal(nodes.get('rallyApp').hidden,false);
});
test('a signed-in account without rooms receives invitation guidance and can retry',async()=>{
  const allowed=[],{ctx,calls,nodes}=setup('',allowed);await ctx.unlock();
  assert(!calls.some(c=>c.name==='rally:bootstrap'));
  assert(nodes.get('authStatus').textContent.includes('No rave rooms'));
  assert.equal(nodes.get('authSignOut').hidden,false);
  allowed.push({id:'new-room',name:'New room'});
  await nodes.get('authOptions').children[0].onclick();
  assert.equal(calls.find(c=>c.name==='rally:bootstrap').args.eventId,'new-room');
});
test('redacted project error is not mislabeled as sign-in failure, retry recovers',async()=>{
  const {ctx,nodes}=setup();
  const mutation=ctx.convexMutation;
  ctx.convexMutation=async()=>{throw new Error('[Request ID: test] Server Error');};
  await ctx.unlock();
  assert.equal(nodes.get('authTitle').textContent,'Your room could not load');
  assert(nodes.get('authStatus').textContent.includes('You are signed in'));
  ctx.convexMutation=mutation;await ctx.unlock();
  assert.equal(nodes.get('rallyApp').hidden,false);
});
test('an account change during loading cannot render the previous account room',async()=>{
  const {ctx,calls}=setup();
  ctx.convexMutation=async()=>{ctx.window.Clerk.user=null;return {};};
  await ctx.unlock();assert(!calls.some(c=>c.name==='render'));
});
test('profile avatar derives initials from the current member, including offline and renamed profiles',()=>{
  const {ctx,nodes}=setup();
  vm.runInContext(`data={currentMemberId:'k',members:[{id:'j',name:'John Ta'},{id:'k',name:'Kevin Tang',initials:'JT'}]}`,ctx);
  ctx.renderAccountButton();assert.equal(nodes.get('accountButton').textContent,'KT');
  assert.equal(nodes.get('accountButton')['aria-label'],'Edit Kevin Tang profile');
  ctx.window.Clerk=undefined;
  vm.runInContext(`data.members[1].name='Kevin'`,ctx);
  ctx.renderAccountButton();assert.equal(nodes.get('accountButton').textContent,'K');
  assert(!fs.readFileSync(path.join(__dirname,'index.html'),'utf8').includes('class="avatar">JT'));
});
