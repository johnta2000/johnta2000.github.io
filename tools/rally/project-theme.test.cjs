const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),vm=require('node:vm');
const {buildSync}=require('esbuild');
const read=file=>fs.readFileSync(__dirname+'/'+file,'utf8');
function uiHarness(){
 const dom=new JSDOM('<meta name="theme-color"><div id="dialogRoot"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.eval(read('project-theme.js'));
 const ctx={window:w,document:w.document,FormData:w.FormData,data:{id:'one',isAdmin:true,projectTheme:'warm',members:[]},activeEvent:'one',themePreview:null,offlineMode:false,el:{dialogRoot:w.document.getElementById('dialogRoot')},saved:[],messages:[],escapeHtml:String,escapeAttr:String};
 w.Clerk={user:{id:'admin'},isSignedIn:true};
 ctx.RallyOffline={save:room=>ctx.saved.push({...room})};
 ctx.showToast=message=>ctx.messages.push(message);
 ctx.convexMutation=async(path,args)=>{ctx.request={path,args};return {projectTheme:args.theme};};
 const app=read('app.js');vm.createContext(ctx);
 vm.runInContext(app.slice(app.indexOf('function applyProjectTheme'),app.indexOf('function openSectionSettings'))+'\n'+app.slice(app.indexOf('function openDialog('),app.indexOf('async function openInvite(')),ctx);
 return {ctx,w,close:()=>w.close()};
}
test('theme preview cancels without saving; admin save persists the project palette and offline snapshot',async()=>{
 const h=uiHarness(),{ctx,w}=h;
 try{
  ctx.openProjectTheme();
  const select=w.document.querySelector('select');select.value='niteharts';select.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.documentElement.dataset.projectTheme,'niteharts');assert.equal(ctx.data.projectTheme,'warm');
  ctx.closeDialog();assert.equal(w.document.documentElement.dataset.projectTheme,'warm');assert.equal(ctx.request,undefined);
  ctx.openProjectTheme();const next=w.document.querySelector('select');next.value='midnight';next.dispatchEvent(new w.Event('change'));
  await w.document.querySelector('form').onsubmit({preventDefault(){}});
  assert.equal(ctx.request.path,'rallyThemes:save');assert.equal(ctx.request.args.eventId,'one');
  assert.equal(ctx.data.projectTheme,'midnight');assert.equal(ctx.saved[0].projectTheme,'midnight');
  assert.equal(w.document.documentElement.dataset.projectTheme,'midnight');assert.equal(w.document.querySelector('form'),null);
 }finally{h.close();}
});
test('theme settings reject offline/non-admin edits; failed saves keep preview and form available',async()=>{
 const h=uiHarness(),{ctx,w}=h;
 try{
  ctx.data.isAdmin=false;ctx.openProjectTheme();assert.equal(w.document.querySelector('form'),null);
  ctx.data.isAdmin=true;ctx.offlineMode=true;ctx.openProjectTheme();assert.equal(w.document.querySelector('form'),null);assert.match(ctx.messages[0],/Reconnect/);
  ctx.offlineMode=false;ctx.openProjectTheme();ctx.convexMutation=async()=>{throw Error('Could not save');};
  await w.document.querySelector('form').onsubmit({preventDefault(){}});
  assert.equal(w.document.querySelector('[type=submit]').disabled,false);assert.equal(ctx.data.projectTheme,'warm');
  w.Clerk.user.id='different';ctx.applyProjectTheme();assert.equal(ctx.themePreview,null);
 }finally{h.close();}
});
test('remote theme changes do not rerender drafts, and stale project/account responses are ignored',async()=>{
 const h=uiHarness(),{ctx,w}=h;
 try{
  let resolve;ctx.convexQuery=()=>new Promise(r=>resolve=r);
  const pending=ctx.refreshProjectTheme();ctx.activeEvent='two';ctx.data.projectTheme='ocean';resolve({projectTheme:'niteharts'});await pending;
  assert.equal(ctx.data.projectTheme,'ocean');
  const accountPending=ctx.refreshProjectTheme();w.Clerk.user.id='new';resolve({projectTheme:'niteharts'});await accountPending;assert.equal(ctx.data.projectTheme,'ocean');
  ctx.openProjectTheme();const form=w.document.querySelector('form');
  const update=ctx.refreshProjectTheme();resolve({projectTheme:'midnight'});await update;
  assert.equal(w.document.querySelector('form'),form);assert.equal(ctx.data.projectTheme,'midnight');
  ctx.closeDialog();assert.equal(w.document.documentElement.dataset.projectTheme,'midnight');
 }finally{h.close();}
});
test('saved project palettes apply to shell and lineup, reject arbitrary styles and reset between projects',()=>{
 const dom=new JSDOM('<meta name="theme-color"><rally-lineup></rally-lineup>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.eval(read('project-theme.js'));
  const themes=w.RallyProjectThemes,host=w.document.querySelector('rally-lineup');
  themes.apply('niteharts');themes.apply('niteharts',host);
  assert.equal(w.document.documentElement.style.colorScheme,'dark');
  assert.equal(host.style.getPropertyValue('--paper'),w.document.documentElement.style.getPropertyValue('--paper'));
  assert.equal(w.document.querySelector('meta').content,'#121214');
  themes.apply('untrusted-css');assert.equal(w.document.documentElement.dataset.projectTheme,'warm');
  assert.equal(w.document.documentElement.style.colorScheme,'light');
 }finally{w.close();}
});
test('every palette keeps text, actions, favorites, and maximum heat shading readable',()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.eval(read('project-theme.js'));
  const rgb=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16));
  const lum=rgb=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
  const contrast=(fg,bg)=>{const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
  for(const theme of w.RallyProjectThemes.presets){
   const c=theme.colors;
   for(const surface of ['paper','card','soft','sidebar'])for(const text of ['ink','muted','accent'])assert(contrast(rgb(c[text]),rgb(c[surface]))>=4.5,`${theme.id}: ${text} on ${surface}`);
   assert(contrast(rgb(c.onAccent),rgb(c.accent))>=4.5,theme.id+' primary action');
   assert(contrast(rgb(c.favorite),rgb(c.favoriteBg))>=4.5,theme.id+' favorites');
   const heat=rgb(c.card).map((v,i)=>v*.88+rgb(c.accent)[i]*.12);
   assert(contrast(rgb(c.muted),heat)>=4.5,theme.id+' heat shading');
  }
 }finally{w.close();}
});
test('only the current project admin can set a theme, and theme writes preserve every other field',async()=>{
 const box={module:{exports:{}},require};
 vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rallyThemes.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text,box);
 const save=box.module.exports.save._handler;
 const state={members:[{clerkSubject:'admin',role:'admin'},{clerkSubject:'friend',role:'member'}],lineupFavorites:{friend:['rl-main']},rooms:[{id:'hotel'}],hiddenSections:['travel'],notes:[{id:'note'}]};
 let identity={subject:'admin'},patch;
 const ctx={auth:{getUserIdentity:async()=>identity},db:{query:()=>({withIndex:()=>({unique:async()=>({_id:'room',buckets:state})})}),patch:async(id,value)=>{patch=value;}}};
 await save(ctx,{eventId:'project',theme:'niteharts'});
 assert.deepEqual(JSON.parse(JSON.stringify(patch.buckets)),{...state,projectTheme:'niteharts'});
 for(const subject of ['friend','outside']){identity={subject};await assert.rejects(save(ctx,{eventId:'project',theme:'warm'}),/admin/);}
 identity=null;await assert.rejects(save(ctx,{eventId:'project',theme:'warm'}),/Sign in/);
});
