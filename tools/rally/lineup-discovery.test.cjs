const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
const event={id:'discovery-qa',name:'Example Festival',startsAt:'2026-10-31',endsAt:'2026-10-31',timeZone:'America/Los_Angeles',lineup:[
 {id:'main-rl',name:'RL GRIME',day:'Saturday',date:'2026-10-31',stage:'Outdoors',genre:'Trap',blockId:'block-party'},
 {id:'after-rl',name:'RL GRIME',day:'Saturday',date:'2026-10-31',stage:'Afterparty',genre:'Trap',blockId:'afterparty'},
 {id:'b2b',name:'IMANU B2B NITEPUNK',day:'Saturday',date:'2026-10-31',stage:'Outdoors',genre:'Bass'},
 {id:'sun',name:'Other Artist',day:'Sunday',date:'2026-11-01',stage:'Main'},
]};
const song=(artistName='RL Grime',id=1)=>({kind:'song',artistName,trackName:'Example track '+id,trackId:id,trackViewUrl:'https://music.apple.com/us/album/example/100?i='+id});
function setup(mobile=false,params='view=poster'){
 const dom=new JSDOM('<!doctype html><body><section id="preview"></section>',{url:'https://www.john-ta.com/tools/rally/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,changes=[];
 w.matchMedia=()=>({matches:mobile,addEventListener(){}});w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 w.HTMLDialogElement.prototype.close=function(){if(!this.open)return;this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
 w.fetch=async()=>({ok:true,json:async()=>({results:[song(),song('RL Grime',2),song('RL Grime',3),song('Wrong Person',4)]})});
 for(const file of ['lineup-posters.js','lineup-discovery.js','../../lost-lands-2026-lineup/controller.js','lineup-template.js','lineup.js'])w.eval(read(file));
 const originalGet=w.RallyLineupPosters.get;
 w.RallyLineupPosters.get=id=>id==='discovery-qa'?{src:'/tools/rally/assets/midnight-carnival-2026-poster.png',width:510,height:638,alt:'Original fixture poster',spots:[{artist:'RL GRIME',box:[.255,.392,.5,.074],blockId:'block-party'},{artist:'RL GRIME',box:[.266,.808,.467,.067],blockId:'afterparty'},{artist:'IMANU B2B NITEPUNK',box:[.154,.532,.688,.053]},{artist:'Other Artist',box:[.065,.881,.465,.041]}]}:originalGet(id);
 const state={type:'rally-lineup-state',artistIds:['main-rl','unavailable-set'],interests:{'main-rl':[{id:'alex',name:'Alex'}],'b2b':[{id:'sam',name:'Sam'}]},currentMember:{id:'alex',name:'Alex'},hiddenDays:[]};
 const options={container:w.document.getElementById('preview'),key:'qa',event,state,params,onEvent:m=>changes.push(m),onParams:()=>{},shareUrl:'https://www.john-ta.com/tools/rally/?event=discovery-qa&view=lineup'};
 w.RallyLineup.show(options);return {w,root:options.container.firstElementChild.shadowRoot,state,options,changes};
}
test('catalog matching strips set labels and separates B2Bs without choosing unrelated artists',()=>{
 const ctx=setup();try{
  const api=ctx.w.RallyLineupDiscovery;
  assert.deepEqual(Array.from(api.artistNames('EXCISION (2 HOUR SET) B2B SPACE LACES')),['EXCISION','SPACE LACES']);
  assert.deepEqual(Array.from(api.artistNames('ISOxo H.C.D.')),['ISOxo']);
  assert.deepEqual(Array.from(api.artistNames('Knock2 & Friends')),['Knock2']);
  assert.equal(api.matchTracks('RL GRIME',[song('Grimes'),song('Wrong RL Grime artist'),song(),song('RL Grime & What So Not',2)]).length,2);
  assert.equal(api.matchTracks('RL Grime',[{...song(),trackViewUrl:'javascript:alert(1)'}]).length,0);
  assert.equal(api.embedUrl({...song(),trackViewUrl:'https://evil.example/us/album/a/100'}),null);
  assert.equal(new URL(api.embedUrl(song(),true)).hostname,'embed.music.apple.com');
  assert.equal(new URL(api.embedUrl(song(),true)).searchParams.get('theme'),'dark');
 }finally{ctx.w.close();}
});
test('poster works on phones and desktop with filters, hidden days and exact-set highlights',()=>{
 for(const mobile of [true,false]){const ctx=setup(mobile);try{
  assert.equal(ctx.root.getElementById('lineup-poster').hidden,false);
  assert.equal(ctx.root.getElementById('mobile-schedule').hidden,true);
  const entries=ctx.root.querySelectorAll('.poster-hotspot');assert.equal(entries.length,4);
  if(mobile){ctx.root.querySelector('[data-day="Saturday"]').click();assert.equal(ctx.root.querySelectorAll('.poster-hotspot').length,3);ctx.root.querySelector('[data-day="__all__"]').click();assert.equal(ctx.root.querySelectorAll('.poster-hotspot').length,4);}
  assert.equal(ctx.root.querySelectorAll('.poster-hotspot.is-liked').length,1);
  assert(!ctx.root.querySelector('[data-poster-spot="1"]').classList.contains('is-liked'));
  ctx.root.querySelector('[data-likes-filter="mine"]').click();assert.equal(ctx.root.querySelectorAll('.poster-hotspot').length,1);
  ctx.root.querySelector('[data-likes-filter="crew"]').click();assert.equal(ctx.root.querySelectorAll('.poster-hotspot').length,2);
  assert(ctx.root.querySelector('.poster-actions').textContent.includes('Crew likes'));
  ctx.w.RallyLineup.receive({...ctx.state,hiddenDays:['Saturday']});assert(!ctx.root.querySelector('.poster-artist[data-artist-id="main-rl"]'));
 }finally{ctx.w.close();}}
});
test('clicking artist opens preview without liking; modal likes preserve repeated and unavailable IDs',async()=>{
 const ctx=setup();try{
  ctx.root.querySelector('[data-poster-spot="0"]').click();
  await new Promise(resolve=>setTimeout(resolve,5));
  const dialog=ctx.root.querySelector('.artist-dialog');assert(dialog.open);
  assert.equal(ctx.changes.filter(m=>m.type==='rally-lineup-favorites-changed').length,0);
  assert.equal(dialog.querySelectorAll('iframe').length,1);
  assert.equal(dialog.querySelectorAll('[data-track]').length,3);
  dialog.querySelector('[data-artist-favorite]').click();
  let ids=ctx.changes.filter(m=>m.type==='rally-lineup-favorites-changed').at(-1).artistIds;
  assert(ids.includes('unavailable-set'));assert(!ids.includes('main-rl'));assert(!ids.includes('after-rl'));
  dialog.querySelector('[data-artist-favorite]').click();
  assert.equal(ctx.root.querySelectorAll('.poster-hotspot.is-liked').length,1);
  ctx.w.RallyLineup.hide();assert(!ctx.root.querySelector('.artist-dialog'));assert.equal(ctx.root.querySelectorAll('iframe').length,0);
 }finally{ctx.w.close();}
});
test('late previews cannot re-open a closed artist, and B2Bs have separate artist choices',async()=>{
 const ctx=setup();try{
  let resolve;ctx.w.fetch=()=>new Promise(r=>resolve=r);
  ctx.root.querySelector('[data-artist-id="b2b"]').click();
  assert.equal(ctx.root.querySelectorAll('[data-preview-artist]').length,2);
  ctx.root.querySelector('.artist-close').click();
  resolve({ok:true,json:async()=>({results:[song('IMANU')]})});
  await new Promise(r=>setTimeout(r,5));assert.equal(ctx.root.querySelectorAll('iframe').length,0);
 }finally{ctx.w.close();}
});
test('offline and catalog errors leave likes usable, with no music cached by Rally',async()=>{
 const ctx=setup();try{
  Object.defineProperty(ctx.w.navigator,'onLine',{value:false});
  ctx.root.querySelector('[data-artist-id="main-rl"]').click();await new Promise(r=>setTimeout(r,5));
  assert(ctx.root.querySelector('.artist-preview-status').textContent.includes('internet connection'));
  assert.equal(ctx.root.querySelectorAll('iframe').length,0);
  ctx.root.querySelector('[data-artist-favorite]').click();assert(ctx.changes.some(m=>m.type==='rally-lineup-favorites-changed'));
  const sw=read('../../rally-sw.js');assert(sw.includes('url.origin !== self.location.origin'));
  assert(!sw.includes('itunes.apple.com'));assert(!sw.includes('embed.music.apple.com'));
 }finally{ctx.w.close();}
});
test('artist buttons are available in every schedule surface without nesting interactive buttons',()=>{
 const timed={...event,lineup:event.lineup.map((e,i)=>({...e,start:e.date+'T'+String(16+i).padStart(2,'0')+':00',end:e.date+'T'+String(17+i).padStart(2,'0')+':00'}))};
 const ctx=setup();try{
  for(const view of ['table','board','heat','timeline','poster']){
   ctx.w.RallyLineup.show({...ctx.options,event:timed,params:'view='+view});
   const root=ctx.options.container.firstElementChild.shadowRoot;
   const ids={table:'table-body',board:'poster-content',heat:'heat-content',timeline:'timeline-view',poster:'lineup-poster'};
   assert.equal(root.querySelectorAll('#'+ids[view]+' [data-artist-id]').length,4);
   assert.equal(root.querySelectorAll('button button').length,0);
  }
 }finally{ctx.w.close();}
});
test('poster export draws original image pixels and like outlines, never reconstructed text or private data',async()=>{
 const ctx=setup();try{
  const drawn=[];
  ctx.w.Image=class{set src(value){this.source=value;this.naturalWidth=510;this.naturalHeight=638;setTimeout(()=>this.onload(),0);}};
  ctx.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage:image=>drawn.push(image.source),strokeRect:(...box)=>drawn.push(box),fillText(){throw Error('Do not redraw poster typography');}});
  ctx.w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new ctx.w.Blob(['png'],{type:'image/png'}));};
  ctx.w.HTMLAnchorElement.prototype.click=function(){};
  ctx.w.URL.createObjectURL=()=> 'blob:qa';ctx.w.URL.revokeObjectURL=()=>{};
  ctx.root.querySelector('[data-poster-save]').disabled=false;ctx.root.querySelector('[data-poster-save]').click();await new Promise(r=>setTimeout(r,5));
  assert.equal(drawn[0],'/tools/rally/assets/midnight-carnival-2026-poster.png');
  assert.equal(drawn.filter(Array.isArray).length,1);
  ctx.root.querySelector('[data-likes-filter="mine"]').click();drawn.length=0;
  ctx.root.querySelector('[data-poster-save]').disabled=false;ctx.root.querySelector('[data-poster-save]').click();await new Promise(r=>setTimeout(r,5));
  assert.equal(drawn[0],'/tools/rally/assets/midnight-carnival-2026-poster.png');assert.equal(drawn.filter(Array.isArray).length,1);
 }finally{ctx.w.close();}
});
test('events without original artwork never get a generated poster substitute',()=>{
 const ctx=setup();try{ctx.w.RallyLineup.show({...ctx.options,key:'missing',event:{...event,id:'no-poster'},params:'view=poster'});const root=ctx.options.container.firstElementChild.shadowRoot;assert(root.querySelector('.poster-empty').textContent.includes('original marketing poster'));assert.equal(root.querySelectorAll('.lineup-art,.official-poster-image').length,0);}finally{ctx.w.close();}
});
test('original artwork registrations bind repeated artists to exact performances',()=>{
 const ctx=setup();try{
  const api=ctx.w.RallyLineupPosters,carnival=JSON.parse(read('../../scripts/fixtures/midnight-carnival-2026.json'));
  const spots=api.resolve(api.get(carnival.id),carnival.lineup);
  assert.equal(spots.length,19);
  const rl=spots.filter(s=>s.artist==='RL GRIME');assert.equal(rl.length,2);
  assert.equal(rl[0].entries[0].blockId,'block-party');assert.equal(rl[1].entries[0].blockId,'afterparty');
  const niteharts=JSON.parse(read('../../scripts/fixtures/niteharts-2026.json'));assert(api.resolve(api.get('niteharts-festival-2026'),niteharts).length>=20);
 }finally{ctx.w.close();}
});
