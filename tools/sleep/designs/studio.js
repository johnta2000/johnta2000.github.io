import { mobileReview, phoneLayouts } from './mobile.mjs';
import { dates, designById, directions, memberById, metricKeys } from './sample.mjs';
import { board, matchup, thumbnail } from './boards.mjs';

const page = document.getElementById('content');
const notice = document.getElementById('notice');
const copyButton = document.getElementById('copy');
const themeButton = document.getElementById('theme');
const fallback = document.getElementById('share-fallback');
const manual = document.getElementById('share-text');
const appearance = window.matchMedia('(prefers-color-scheme: dark)');
const base = new URL('./', location.href);
const defaults = {mobile:'',beside:'bands',inspect:'',settings:false,design:'', with:'', choose:'', metric:'sleep', second:'workout', who:'jordan', peer:'you', day:3, theme:'auto', duel:false, side:0, edit:false, rules:false};
const validDesign = id => Object.hasOwn(designById,id);
const validPerson = id => Object.hasOwn(memberById,id);

function read(url) {
  const p = url.searchParams, s = {...defaults};
  if (Object.hasOwn(phoneLayouts,p.get('mobile'))) {
    s.mobile=p.get('mobile');
    if(Object.hasOwn(phoneLayouts,p.get('beside'))) s.beside=p.get('beside');
    if(s.beside===s.mobile)s.beside=s.mobile==='bands'?'ledger':'bands';
  } else if (validDesign(p.get('compare'))) s.choose=p.get('compare');
  else if (validDesign(p.get('design'))) {
    s.design=p.get('design');
    if (validDesign(p.get('with')) && p.get('with')!==s.design) s.with=p.get('with');
  }
  for (const k of ['metric','second']) if(metricKeys.includes(p.get(k))) s[k]=p.get(k);
  s.settings=p.get('controls')==='open';
  if(validPerson(p.get('inspect')))s.inspect=p.get('inspect');
  if (s.metric===s.second) s.second=metricKeys.find(k=>k!==s.metric);
  for (const k of ['who','peer']) if(validPerson(p.get(k))) s[k]=p.get(k);
  if(s.who===s.peer) s.peer=s.who==='you'?'jordan':'you';
  if(dates.includes(p.get('day'))) s.day=dates.indexOf(p.get('day'));
  if(['light','dark'].includes(p.get('theme'))) s.theme=p.get('theme');
  if(s.design) {s.duel=p.get('match')==='1';s.rules=p.get('rules')==='1'}
  s.edit=(s.design==='split'||s.with==='split')&&p.get('metrics')==='open';
  s.side=s.with && p.get('side')==='2'?1:0;
  return s;
}
let state=read(new URL(location.href));

function nextState(patch) {
  const s={...state,...patch};
  if(patch.mobile) {s.design='';s.choose='';s.with='';if(s.mobile===s.beside)s.beside=state.mobile||'ledger'}
  if(patch.beside && patch.beside===state.mobile)s.mobile=state.beside;
  if(patch.metric && patch.metric===state.second) s.second=state.metric;
  if(patch.second && patch.second===state.metric) s.metric=state.second;
  if(patch.who && patch.who===state.peer) s.peer=state.who;
  if(patch.peer && patch.peer===state.who) s.who=state.peer;
  if(!s.design) {s.with='';s.duel=false;s.rules=false}
  if(!s.with) s.side=0;
  if(![s.design,s.with].includes('split')) s.edit=false;
  return s;
}

function href(patch={}) {
  const s=nextState(patch), u=new URL(base.href), p=u.searchParams;
  if(s.settings)p.set('controls','open');
  if(s.inspect)p.set('inspect',s.inspect);
  if(s.mobile) {p.set('mobile',s.mobile);if(s.beside!==defaults.beside)p.set('beside',s.beside)}
  else if(s.choose) p.set('compare',s.choose);
  else if(s.design) {p.set('design',s.design);if(s.with)p.set('with',s.with)}
  for(const k of ['metric','second','who','peer','theme']) if(s[k]!==defaults[k])p.set(k,s[k]);
  if(s.day!==defaults.day)p.set('day',dates[s.day]);
  if(s.duel)p.set('match','1');
  if(s.rules)p.set('rules','1');
  if(s.edit)p.set('metrics','open');
  if(s.side)p.set('side','2');
  return u.pathname+u.search;
}
const galleryPatch = {mobile:'',beside:'bands',inspect:'',settings:false,design:'',with:'',choose:'',duel:false,edit:false,side:0,rules:false};
const designPatch = id => ({...galleryPatch,design:id, with:'', choose:'', duel:false, edit:false, side:0,rules:false});
const choosePatch = id => ({...galleryPatch, choose:id});
const link = (url, label, classes='') => '<a data-nav href="'+url+'" class="'+classes+'">'+label+'</a>';

function previewCard(d, choosing) {
  const first=state.choose;
  const card='<div class="miniature">'+thumbnail(d.id)+'</div><div class="card-copy"><h2>'+d.name+'</h2><p>'+d.short+'</p></div>';
  if(choosing&&d.id===first)return '<article class="concept tone-'+d.id+' chosen"><div class="preview-face">'+card+'</div><div class="card-actions"><span>First design selected</span></div></article>';
  const target=choosing?{...designPatch(first),with:d.id}:designPatch(d.id);
  return '<article class="concept tone-'+d.id+'"><a data-nav class="preview-face" href="'+href(target)+'" aria-label="'+(choosing?'Compare '+designById[first].name+' with ':'Open ')+d.name+'">'+card+'</a><div class="card-actions">'+
    link(href(target),choosing?'Compare these two':'Open design','open-design')+
    (choosing?'':link(href(choosePatch(d.id)),'Compare','pair-link'))+'</div></article>';
}
function gallery() {
  const choosing=!!state.choose;
  const title=choosing?'Compare with '+designById[state.choose].name:'Group standings';
  const crumb=choosing?link(href(galleryPatch),'All designs','backlink'):'';
  return '<section class="intro">'+crumb+'<h1 tabindex="-1">'+title+'</h1><p>'+(choosing?'Choose a second layout to see both with the same group.':'Try six layouts with ten fictional friends. Compare two, then send John your pick.')+'</p></section>'+
    (choosing?'':link(href({mobile:'ledger'}),'Mobile moodboards <span>Split scoreboard and Highs &amp; lows ↗</span>','phone-entry'))+'<div class="gallery">'+directions.map(d=>previewCard(d,choosing)).join('')+'</div>';
}
function pairSummary(c) {
  return '<nav class="pair-summary" aria-label="Design to inspect on your phone">'+[state.design,state.with].map((id,i)=>{
    const d=designById[id];return '<a data-nav class="tone-'+id+'" href="'+href({side:i})+'" aria-label="Inspect '+d.name+'" aria-current="'+(state.side===i)+'"><div class="pair-mini" aria-hidden="true">'+thumbnail(id)+'</div><strong>'+d.name+'</strong></a>';
  }).join('')+'</nav>';
}
function rules() {
  return '<div class="ranking-rules"><a data-nav href="'+href({rules:!state.rules})+'" aria-expanded="'+state.rules+'" aria-controls="rank-rules">How the sample is ranked</a><p id="rank-rules" '+(state.rules?'':'hidden')+'>Sleep, sleep score, and recovery use the average of at least four recorded days. Workout time sums seven tracked days, including confirmed rest days. Equal displayed values share a place. A missing or private reading has no rank.</p></div>';
}
function detail() {
  const c={s:state,url:href}, pair=!!state.with;
  const select=link(href(choosePatch(state.design)),pair?'Change comparison':'Compare with another design','action');
  const top='<div class="detail-actions">'+link(href(galleryPatch),'All designs','backlink')+select+'</div>';
  const body=pair?'<div class="pair-intro"><h1 tabindex="-1">Side by side</h1><p>Selections apply to both designs.</p></div>'+pairSummary(c)+
    '<div class="pair">'+[state.design,state.with].map((id,i)=>'<div class="pair-column" data-visible="'+(state.side===i)+'">'+board(c,id,true)+'</div>').join('')+'</div>':board(c,state.design);
  const extras=state.duel?matchup(c):link(href({duel:true})+'#matchup','Compare two people','match-link');
  return top+body+'<div class="extras">'+extras+rules()+'</div>';
}
function render() {
  const dark=state.theme==='dark'||(state.theme==='auto'&&appearance.matches);
  document.documentElement.dataset.scheme=dark?'dark':'light';
  themeButton.innerHTML='<span class="theme-dot" aria-hidden="true"></span>'+({auto:'System',light:'Light',dark:'Dark'}[state.theme]);
  themeButton.setAttribute('aria-label','Appearance is '+(state.theme==='auto'?'system':state.theme)+'. Change appearance');
  themeButton.title='Change appearance';
  document.querySelector('[data-studio-home]').href=href(galleryPatch);
  page.innerHTML=state.mobile?mobileReview({s:state,url:href}):state.design?detail():gallery();
  const title=state.mobile?phoneLayouts[state.mobile].name+' · Mobile moodboards':state.with?designById[state.design].name+' + '+designById[state.with].name:state.design?designById[state.design].name:state.choose?'Compare designs':'Group standings design review';
  document.title=title+' · Sleepington';
}

function routeID(s) {return [s.design,s.with,s.choose,Boolean(s.mobile)].join('/')}
function navigate(dest,push) {
  const before=state, old=routeID(before), oldY=window.scrollY;
  const next=new URL(dest,location.href);
  if(push && next.href===location.href)return;
  if(push)history.pushState(null,'',next.href);
  state=read(next);fallback.hidden=true;notice.textContent='';
  render();
  if(next.hash==='#matchup'&&state.duel) {
    document.getElementById('matchup')?.scrollIntoView({block:'start'});
    if(push)document.querySelector('#matchup h2')?.focus({preventScroll:true});
  } else if(old!==routeID(state)) {
    window.scrollTo(0,0);
    const title=page.querySelector('h1');
    if(push&&title){title.setAttribute('tabindex','-1');title.focus({preventScroll:true})}
  } else if(push) {
    if(before.duel && !state.duel) {page.querySelector('.match-link')?.focus();return}
    window.scrollTo(0,oldY);
  }
}
function controlFocus(a) {
  const scope=a.closest('nav[aria-label],tr,li,[data-board]');
  return {scope:scope?.getAttribute('aria-label')||'',board:a.closest('[data-board]')?.dataset.board||'',text:a.textContent.trim(),label:a.getAttribute('aria-label')};
}
function returnFocus(f) {
  let scope=f.board?page.querySelector('[data-board="'+f.board+'"]'):page;
  if(!scope)return;
  if(f.scope)scope=[...scope.querySelectorAll('nav[aria-label]')].find(n=>n.getAttribute('aria-label')===f.scope)||scope;
  const a=[...scope.querySelectorAll('a[data-nav]')].find(n=>f.label?n.getAttribute('aria-label')===f.label:n.textContent.trim()===f.text);
  a?.focus({preventScroll:true});
}
document.addEventListener('click', e=>{
  const a=e.target.closest('a[data-nav],a[data-studio-home]');
  if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  e.preventDefault();
  const f=controlFocus(a),old=state;
  navigate(a.href,true);
  if(e.detail===0 && routeID(old)===routeID(state) && old.duel===state.duel) returnFocus(f);
});
window.addEventListener('popstate',()=>navigate(location.href,false));
appearance.addEventListener('change',()=>{if(state.theme==='auto')render()});
themeButton.addEventListener('click',()=>{
  const active=document.documentElement.dataset.scheme;
  const theme=state.theme==='auto'?(active==='dark'?'light':'dark'):(state.theme==='dark'&&appearance.matches||state.theme==='light'&&!appearance.matches)?'auto':(state.theme==='dark'?'light':'dark');
  navigate(href({theme}),true);
});

let timeout;
function tell(message) {
  clearTimeout(timeout);notice.textContent=message;
  timeout=setTimeout(()=>{notice.textContent=''},3400);
}
async function copy(text,message,trigger) {
  try {await navigator.clipboard.writeText(text);tell(message)}
  catch {
    manual.value=text;fallback.hidden=false;
    fallback.querySelector('label').textContent=text.startsWith('http')?'Copy this link':'Copy this message to your group chat';
    fallback._trigger=trigger;manual.focus();manual.select();
  }
}
copyButton.addEventListener('click',()=>copy(new URL(href(),location.origin).href,'Link copied',copyButton));
document.getElementById('close-share').addEventListener('click',()=>{fallback.hidden=true;fallback._trigger?.focus()});
page.addEventListener('click',async e=>{
  const button=e.target.closest('[data-pick],[data-phone-pick]');if(!button)return;
  const phone=button.dataset.phonePick, id=button.dataset.pick, d=phone?phoneLayouts[phone]:designById[id];
  const url=new URL(href(phone?{mobile:phone}:designPatch(id)),location.origin).href;
  const message='My Sleepington pick is '+d.name+'.';
  if(navigator.share) {
    try{await navigator.share({title:'Sleepington · '+d.name,text:message,url});return}
    catch(error){if(error.name==='AbortError')return}
  }
  await copy(message+' '+url,'Pick copied. Paste it into your group chat.',button);
});
render();
