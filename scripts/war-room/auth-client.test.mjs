import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../war-room-10012026/auth.js',import.meta.url),'utf8');
const token='test.'+Buffer.from(JSON.stringify({aud:'convex'})).toString('base64url')+'.test';
function harness({signedIn=true,hostname='www.john-ta.com',denied=false}={}){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',addEventListener(){}});return nodes.get(id)};
 const events=[],requests=[];
 let listener;
 const Clerk={session:signedIn?{id:'session-john',getToken:async()=>token}:null,load:async()=>{},
  addListener(fn){listener=fn},mountSignIn(){events.push('widget')},unmountSignIn(){},signOut:async()=>{Clerk.session=null}};
 const window={Clerk,__internal_ClerkUICtor:{}};
 const fetch=async(url,options)=>{
  const body=JSON.parse(options.body);requests.push({...body,authorized:options.headers.Authorization===`Bearer ${token}`});
  return {ok:true,status:200,json:async()=>denied?{status:'error',errorData:{code:'FORBIDDEN'}}:{status:'success',value:body.path==='warRoom:verify'?{email:'john@affil.ai',subject:'john',seedBuckets:[]}:null}};
 };
 vm.runInNewContext(source,{window,document:{querySelector:node},location:{hostname,href:`https://${hostname}/war-room-10012026/`,assign(){}},fetch,AbortSignal,setTimeout,clearTimeout,atob:s=>Buffer.from(s,'base64').toString('binary'),console});
 return {auth:window.WarRoomAuth,Clerk,events,requests,node,
  start:()=>window.WarRoomAuth.start({onAuthorized:async()=>events.push('authorized'),onLocked:()=>events.push('locked')}),
  updateSession(session){Clerk.session=session;listener({session})}};
}
test('signed-out visitor sees sign-in without requesting protected data',async()=>{
 const h=harness({signedIn:false});await h.start();
 assert.deepEqual(h.events,['locked','widget']);assert.equal(h.requests.length,0);assert.equal(h.auth.isAuthorized(),false);
});
test('access is granted only after an authenticated server verification',async()=>{
 const h=harness();await h.start();
 assert.deepEqual(h.events,['locked','locked','authorized']);
 assert.equal(h.requests[0].path,'warRoom:verify');assert.equal(h.requests[0].authorized,true);
 assert.equal(h.auth.isAuthorized(),true);
 await h.auth.call('query','warRoom:get',{boardId:'war-room-10012026'});
 assert.equal(h.requests[1].authorized,true);
});
test('unapproved user never receives the authorized callback',async()=>{
 const h=harness({denied:true});await h.start();
 assert.equal(h.events.includes('authorized'),false);assert.equal(h.auth.isAuthorized(),false);
 assert.match(h.node('#authStatus').textContent,/isn’t approved/);
 await assert.rejects(h.auth.call('mutation','warRoom:save',{}));
 assert.equal(h.requests.length,1);
});
test('session loss immediately locks the app and blocks future writes',async()=>{
 const h=harness();await h.start();h.updateSession(null);
 assert.equal(h.auth.isAuthorized(),false);assert.equal(h.events.at(-2),'locked');
 await assert.rejects(h.auth.call('mutation','warRoom:save',{}));
 assert.equal(h.requests.length,1);
});
test('token refresh failure locks a previously authorized session',async()=>{
 const h=harness();await h.start();h.Clerk.session.getToken=async()=>{throw new Error('Expired')};
 await assert.rejects(h.auth.call('query','warRoom:get',{}));
 assert.equal(h.auth.isAuthorized(),false);assert.equal(h.events.at(-1),'locked');
});
test('localhost has no password bypass and does not try to use a production Clerk session',async()=>{
 const h=harness({hostname:'127.0.0.1'});await h.start();
 assert.equal(h.auth.isAuthorized(),false);assert.equal(h.requests.length,0);
 assert.equal(h.node('#hostedSignIn').hidden,false);
});
