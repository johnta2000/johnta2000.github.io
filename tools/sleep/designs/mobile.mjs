import { byPerson, dateLabel, difference, format, gapReason, metricKeys, metrics, spreadRows, weekdays, weekly } from './sample.mjs';

export const phoneLayouts = {
  ledger: {group:'split', name:'Rank ledger', question:'Where does each friend rank in both?', caption:'Two places on the same row', title:'Weekly standings'},
  ladder: {group:'split', name:'Rank ladder', question:'Who leads when you switch metrics?', caption:'One ranking at a time', title:'The leaderboard'},
  bands: {group:'range', name:'Range bars', question:'Whose nights were closest together?', caption:'Line spans low to high · dot marks the average', title:'Weekly ranges'},
  traces: {group:'range', name:'Nightly traces', question:'When did each person hit a high or low?', caption:'Seven days on a shared scale · gaps are missing days', title:'Night by night'}
};
const groups = {split:'Split scoreboard', range:'Highs & lows'};
const ids=Object.keys(phoneLayouts);
const link=(c,patch,label,current=false)=>'<a data-nav href="'+c.url(patch)+'"'+(current?' aria-current="true"':'')+'>'+label+'</a>';
const rank=r=>r.rank?'#'+r.rank:'—';
const value=(key,r)=>r.rank?format(key,r.value):gapReason(r,key);
const number=(key,v)=>format(key,Number.isFinite(v)?Math.round(v*10)/10:null);
function selection(c, id, peer=false) {
  const field=peer?'beside':'mobile';
  return '<nav class="phone-options" aria-label="'+(peer?'Second':'First')+' phone layout">'+Object.entries(groups).map(([group,name])=>
    '<div><small>'+name+'</small><div>'+ids.filter(k=>phoneLayouts[k].group===group).map(k=>link(c,{[field]:k},phoneLayouts[k].name,id===k)).join('')+'</div></div>'
  ).join('')+'</nav>';
}
function memberLink(c,r,content) {
  const id=r.person.id, open=c.s.inspect===id;
  return '<a data-nav class="phone-row" href="'+c.url({inspect:open?'':id,who:id})+'" aria-expanded="'+open+'" aria-label="'+(open?'Close':'Inspect')+' '+r.person.name+'">'+content+'</a>';
}
function detail(c,r,key,group) {
  if(c.s.inspect!==r.person.id)return '';
  if(r.person.private)return '<div class="phone-details">This member keeps their readings private.</div>';
  if(group==='split')return '<div class="phone-details">'+[key,c.s.second].map(k=>{
    const x=byPerson[k][r.person.id];return '<div><span>'+metrics[k].label+' · '+x.count+'/7 days</span><b>'+value(k,x)+'</b></div>';
  }).join('')+'</div>';
  return '<div class="phone-details"><div><strong>'+r.person.provider+'</strong><span>'+r.count+'/7 days tracked</span></div><div><span>Low / average / high</span><b>'+[r.low,r.avg,r.high].map(v=>number(key,v)).join(' / ')+'</b></div><div class="phone-nights">'+r.series.map((v,i)=>'<span aria-label="'+dateLabel(i)+'"><small>'+weekdays[i]+'</small><b>'+format(key,v)+'</b></span>').join('')+'</div></div>';
}
function choice(c,field,key,label) {
  return '<nav class="phone-metrics" aria-label="'+label+'">'+metricKeys.map(k=>link(c,{[field]:k},metrics[k].short,k===key)).join('')+'</nav>';
}
function scoreboard(c,id) {
  const {metric:key,second}=c.s, ledger=id==='ledger';
  const headings=ledger?'<div class="phone-cols"><span>Member</span><span>'+metrics[key].short+' ↓</span><span>'+metrics[second].short+'</span></div>':'<div class="phone-cols"><span>Place / member</span><span>'+metrics[key].average+'</span></div>';
  const rows=weekly[key].map(r=>{
    const other=byPerson[second][r.person.id],name='<strong>'+r.person.name+'</strong>';
    const cell=(k,x)=>'<span class="phone-stat"><b>'+rank(x)+'</b><small>'+value(k,x)+'</small></span>';
    const line=ledger?name+cell(key,r)+cell(second,other):'<span class="phone-place">'+rank(r)+'</span>'+name+'<b class="ladder-value">'+value(key,r)+'</b>';
    return '<li>'+memberLink(c,r,line)+detail(c,r,key,'split')+'</li>';
  }).join('');
  const sorting='<div class="phone-tools"><span>Rank by</span>'+choice(c,'metric',key,'Rank by')+'</div>';
  const secondPick=ledger?'<div class="phone-tools"><span>Against</span>'+choice(c,'second',second,'Second metric')+'</div>':'';
  const controls=ledger?'<div class="phone-filter"><strong>'+metrics[key].short+' &amp; '+metrics[second].short+'</strong>'+link(c,{settings:!c.s.settings},c.s.settings?'Done':'Edit metrics')+'</div>'+(c.s.settings?sorting+secondPick:''):sorting;
  return controls+headings+'<ol>'+rows+'</ol>';
}
function traces(r,min,max) {
  const x=i=>3+15*i,y=v=>26-22*(v-min)/(max-min||1);
  let points='',previous=null;
  r.series.forEach((v,i)=>{
    if(v===null){previous=null;return}
    if(previous!==null)points+='<line x1="'+x(i-1)+'" y1="'+y(previous)+'" x2="'+x(i)+'" y2="'+y(v)+'"/>';
    points+='<circle cx="'+x(i)+'" cy="'+y(v)+'" r="2"/>'; previous=v;
  });
  return '<svg viewBox="0 0 96 30" aria-hidden="true">'+points+'</svg>';
}
function ranges(c,id) {
  const key=c.s.metric, rows=spreadRows(key), vals=rows.flatMap(r=>r.series.filter(Number.isFinite));
  const min=Math.min(...vals),max=Math.max(...vals),pct=v=>(v-min)/(max-min||1)*100;
  const bars=id==='bands';
  const header='<div class="phone-cols"><span>Member</span><span>'+(bars?number(key,min)+' – '+number(key,max):'Thu → Wed')+'</span><span>Spread</span></div>';
  return choice(c,'metric',key,'Range metric')+header+'<ol>'+rows.map(r=>{
    const mark=bars?'<i class="phone-track"><i style="left:'+pct(r.low)+'%;width:'+(pct(r.high)-pct(r.low))+'%"></i><b style="left:'+pct(r.avg)+'%"></b></i>':traces(r,min,max);
    const end=r.rank?difference(key,r.span):gapReason(r,key);
    return '<li>'+memberLink(c,r,'<strong>'+r.person.name+'</strong>'+(r.count?mark:'<span></span>')+'<b class="range-value">'+end+'</b>')+detail(c,r,key,'range')+'</li>';
  }).join('')+'</ol>';
}
export function phoneContents(c,id) {
  const d=phoneLayouts[id];
  return '<section class="phone-screen phone-'+id+'"><header><small>friendos <i></i> Nov 19–25</small><h2>'+d.title+'</h2><p>'+d.caption+'</p></header>'+(d.group==='split'?scoreboard(c,id):ranges(c,id))+'</section>';
}
function panel(c,id,peer) {
  const d=phoneLayouts[id];
  return '<article class="phone-panel" data-board="phone-'+id+'"><div class="phone-label"><h2>'+d.name+'</h2><p>'+d.question+'</p></div>'+selection(c,id,peer)+phoneContents(c,id)+'<button type="button" class="pick phone-pick" data-phone-pick="'+id+'">Share '+d.name+'</button></article>';
}
export function mobileReview(c) {
  return '<header class="phone-intro"><a data-nav class="backlink" href="'+c.url({mobile:"",beside:"bands",inspect:"",settings:false})+'">All designs</a><h1 tabindex="-1">Mobile moodboards</h1><p>Ten fictional friends, one week. Tap a name to inspect the same person across layouts.</p></header><div class="phone-studio">'+panel(c,c.s.mobile,false)+panel(c,c.s.beside,true)+'</div>';
}
