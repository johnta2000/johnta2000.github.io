import { byPerson, dateLabel, dates, designById, difference, format, gapReason, memberById, members, metricKeys, metrics, nightly, spreadRows, weekdays, weekly } from './sample.mjs';

const ord = n => n === null ? '—' : '#' + n;
const picker = (c,id,label) => '<a data-nav class="name-link" href="'+c.url({who:id})+'" aria-label="Follow '+memberById[id].name+'">'+label+'</a>';
const picked = (row,s) => row.person.id === s.who ? ' is-followed' : '';
const current = is => is ? ' aria-current="true"' : '';
const nav = (c, patch, label, is=false) => '<a data-nav href="'+c.url(patch)+'"'+current(is)+'>'+label+'</a>';
const strip = (c, field='metric', label='Metric') => '<nav class="metric-strip" aria-label="'+label+'">'+metricKeys.map(k => nav(c,{[field]:k},metrics[k].short,c.s[field]===k)).join('')+'</nav>';
const reason = (row,k,day=false) => '<span class="unranked">'+gapReason(row,k,day)+'</span>';
const valueText = (r,k) => r.rank ? format(k,r.value) : gapReason(r,k);
const facts = (id) => '<dl class="facts">'+metricKeys.map(k=>{
  const r=byPerson[k][id];return '<div><dt>'+metrics[k].short+'</dt><dd><b>'+ord(r.rank)+'</b><small>'+valueText(r,k)+'</small></dd></div>';
}).join('')+'</dl>';

function detailStrip(s) {
  return '<aside class="friend-facts"><h3>'+memberById[s.who].name+' this week</h3>'+facts(s.who)+'</aside>';
}

function split(c) {
  const lanes=[c.s.metric,c.s.second];
  const settings='<div class="board-tools">'+nav(c,{edit:!c.s.edit},c.s.edit?'Done choosing metrics':'Change metrics',c.s.edit)+'</div>';
  const switches=c.s.edit?'<div class="split-settings">'+lanes.map((key,i)=>'<div><small>'+(i?'Second board':'First board')+'</small>'+strip(c,i?'second':'metric',i?'Right leaderboard metric':'Left leaderboard metric')+'</div>').join('')+'</div>':'';
  const parts=lanes.map(key=>{
    const rows=weekly[key].map(r=>'<li class="listing'+picked(r,c.s)+'"><span class="place">'+ord(r.rank)+'</span>'+picker(c,r.person.id,r.person.name)+'<b class="value">'+(r.rank?format(key,r.value):reason(r,key))+'</b></li>').join('');
    return '<section class="leader-lane"><div class="lane-title"><h3>'+metrics[key].label+'</h3><span>'+metrics[key].average+'</span></div><ol>'+rows+'</ol></section>';
  });
  return settings+switches+'<div class="twins">'+parts.join('')+'</div>'+detailStrip(c.s);
}

function sheet(c) {
  const s=c.s,key=s.metric;
  const headers=metricKeys.map(k=>'<th scope="col" aria-sort="'+(k===key?'ascending':'none')+'">'+nav(c,{metric:k},metrics[k].short+(key===k?'<span aria-hidden="true"> ↓</span>':''),key===k)+'</th>').join('');
  const rows=weekly[key].map(r=>{
    const cells=metricKeys.map(k=>{const stat=byPerson[k][r.person.id];return '<td class="'+(k===key?'ordering ':'')+(stat.rank?'':'missing')+'" aria-label="'+metrics[k].label+', '+(stat.rank?'rank '+stat.rank+', '+format(k,stat.value):gapReason(stat,k))+'"><strong>'+ord(stat.rank)+'</strong><small>'+valueText(stat,k)+'</small></td>'}).join('');
    return '<tr class="'+picked(r,s)+'"><th scope="row">'+picker(c,r.person.id,r.person.name)+'</th>'+cells+'</tr>';
  }).join('');
  return '<table class="rank-sheet"><caption class="sr-only">Weekly place and value by member, ordered by '+metrics[key].label+'</caption><thead><tr><th scope="col">Member</th>'+headers+'</tr></thead><tbody>'+rows+'</tbody></table>'+detailStrip(s);
}

function daily(c) {
  const s=c.s,key=s.metric,day=s.day;
  const prev=day?Object.fromEntries(nightly[key][day-1].map(r=>[r.person.id,r])):{};
  const days='<nav class="day-strip" aria-label="Day to rank">'+dates.map((_,i)=>nav(c,{day:i},'<small>'+weekdays[i]+'</small><b>'+(19+i)+'</b>',i===day)).join('')+'</nav>';
  const rows=nightly[key][day].map(r=>{
    const old=prev[r.person.id]?.rank, move=old && r.rank ? old-r.rank : null;
    const change=move===null?'—':move>0?'↑ '+move:move<0?'↓ '+Math.abs(move):'Even';
    const title=move===null?'No consecutive ranks':move===0?'Same place':Math.abs(move)+(Math.abs(move)===1?' place ':' places ')+(move>0?'higher':'lower');
    return '<li class="daily-line'+picked(r,s)+'"><span class="place">'+ord(r.rank)+'</span>'+picker(c,r.person.id,r.person.name)+'<span class="movement '+(move>0?'up':'')+'" aria-label="'+title+'">'+change+'</span><b class="value">'+(r.rank?format(key,r.value):reason(r,key,true))+'</b></li>';
  }).join('');
  const caption=day?'Places gained or lost since '+weekdays[day-1]+', Nov '+(18+day):'First day of the sample week';
  return strip(c)+days+'<div class="data-title"><h3>'+dateLabel(day)+'</h3><small>'+caption+'</small></div><div class="daily-line field-labels"><span>#</span><span>Member</span><span>Move</span><span>'+metrics[key].short+'</span></div><ol>'+rows+'</ol>';
}

function rankTrace(id, miniature=false) {
  const p=memberById[id], ranks=metricKeys.map(k=>byPerson[k][id].rank);
  const max=Math.max(2,...metricKeys.flatMap(k=>weekly[k].map(r=>r.rank??0)));
  const xs=[12.5,37.5,62.5,87.5], y=rank=>9+(rank-1)*82/(max-1);
  const path=ranks.map((r,i)=>!r?'':(i && ranks[i-1]?'L':'M')+xs[i]+' '+y(r)).join(' ');
  const marks=ranks.map((r,i)=>r?'<span class="trace-point" style="left:'+xs[i]+'%;top:'+y(r)+'%">'+r+'</span>':'<span class="trace-hole" style="left:'+xs[i]+'%">—</span>').join('');
  const desc=p.name+' · '+metricKeys.map((k,i)=>metrics[k].short+' '+ord(ranks[i])).join(', ');
  return '<div class="trace'+(miniature?' mini-trace':'')+'" role="img" aria-label="'+desc+'"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="'+path+'" fill="none" stroke="currentColor" stroke-width="'+(miniature?'2':'2.5')+'" vector-effect="non-scaling-stroke"/></svg>'+marks+'</div>';
}

function profile(c) {
  const id=c.s.who,p=memberById[id];
  const labels='<div class="trace-headers">'+metricKeys.map(k=>'<span>'+metrics[k].short+'<small>'+weekly[k][0].eligible+' ranked</small></span>').join('')+'</div>';
  const cards=metricKeys.map(k=>{
    const r=byPerson[k][id];return '<div><dt>'+metrics[k].short+'</dt><dd><b>'+ord(r.rank)+'</b><small>'+valueText(r,k)+'</small></dd></div>';
  }).join('');
  const people=members.map(f=>nav(c,{who:f.id},f.name,f.id===id)).join('');
  return '<section class="profile-main"><div class="person-heading"><h3>'+p.name+'</h3><span>Weekly rank · first place at the top</span></div>'+labels+rankTrace(id)+'<dl class="facts profile-facts">'+cards+'</dl></section><nav class="member-picker" aria-label="Whose rank profile to show">'+people+'</nav>';
}

const axisEnds = k => k==='sleep'?[360,540]:k==='workout'?[0,120]:k==='score'?[60,100]:[0,100];
function spanBar(r,key) {
  const [min,max]=axisEnds(key), pct=v=>100*(v-min)/(max-min);
  if(r.avg===null)return '<span class="span-track empty-track"></span>';
  return '<span class="span-track" aria-hidden="true"><i class="span-run" style="left:'+pct(r.low)+'%;width:'+(pct(r.high)-pct(r.low))+'%"></i><i class="span-mean" style="left:'+pct(r.avg)+'%"></i></span>';
}
function range(c) {
  const s=c.s,k=s.metric,r=byPerson[k][s.who],order=spreadRows(k);
  const summary=r.count?'<dl class="range-facts"><div><dt>Low</dt><dd>'+format(k,r.low)+'</dd></div><div><dt>Daily average</dt><dd>'+format(k,Math.round(r.avg*(k==='score'||k==='recovery'?10:1))/(k==='score'||k==='recovery'?10:1))+'</dd></div><div><dt>High</dt><dd>'+format(k,r.high)+'</dd></div></dl>':'<p>'+gapReason(r,k)+'</p>';
  const rows=order.map(row=>{
    const reading=row.person.id===s.who && row.count?'<small class="row-readings">Low '+format(k,row.low)+' · High '+format(k,row.high)+'</small>':'';
    return '<li class="range-row'+picked(row,s)+'"><span class="place">'+ord(row.rank)+'</span>'+picker(c,row.person.id,row.person.name)+spanBar(row,k)+'<b class="value">'+(row.rank?difference(k,row.span):reason(row,k))+'</b>'+reading+'</li>';
  }).join('');
  return strip(c)+'<section class="range-inspector"><div class="data-title"><h3>'+r.person.name+'’s week</h3><small>'+r.count+' of 7 days</small></div>'+summary+(r.count?'<div class="math-note">High minus low = <b>'+difference(k,r.span)+'</b> of spread.</div>':'')+'</section><div class="range-row field-labels"><span>#</span><span>Steadiest first</span><span>Low · average · high</span><span>Spread</span></div><ol>'+rows+'</ol>';
}

function chase(c) {
  const s=c.s,k=s.metric,rows=weekly[k],lead=rows[0],eligible=rows.filter(r=>r.rank),leaders=eligible.filter(r=>r.rank===1);
  const maxGap=eligible.length ? lead.value-eligible[eligible.length-1].value:0;
  const list=rows.map(r=>{
    const delta=r.rank?Math.max(0,lead.value-r.value):null, width=(maxGap>0&&r.rank)?100*delta/maxGap:0;
    return '<li class="chase-row'+picked(r,s)+'"><span class="place">'+ord(r.rank)+'</span>'+picker(c,r.person.id,r.person.name)+'<span class="gap-bar" aria-hidden="true"><i style="width:'+width+'%"></i></span><span class="gap-value">'+(r.rank===1?'Leader':r.rank?difference(k,delta):'—')+'</span><b class="value">'+(r.rank?format(k,r.value):reason(r,k))+'</b></li>';
  }).join('');
  return strip(c)+'<div class="lead"><div><small>'+metrics[k].label+' · '+(leaders.length===1?'leader':'joint leaders')+'</small><h3>'+leaders.map(r=>r.person.name).join(' &amp; ')+'</h3></div><strong>'+format(k,lead.value)+'</strong></div><div class="chase-row field-labels"><span>#</span><span>Member</span><span></span><span>Gap to first</span><span>Value</span></div><ol>'+list+'</ol>';
}

export function matchup(c) {
  const s=c.s,a=memberById[s.who],b=memberById[s.peer];
  const toggles=(field,person,label)=>'<div><div class="data-title"><h3>'+label+'</h3><strong>'+person.name+'</strong></div><nav class="member-picker" aria-label="'+label+'">'+members.map(p=>nav(c,{[field]:p.id},p.name,p.id===person.id)).join('')+'</nav></div>';
  const rows=metricKeys.map(k=>{
    const cell=p=>{const r=byPerson[k][p.id];return '<td><b>'+valueText(r,k)+'</b><small>'+ (r.rank?ord(r.rank)+' of '+r.eligible:'Unranked')+'</small></td>'};
    return '<tr><th scope="row">'+metrics[k].label+'</th>'+cell(a)+cell(b)+'</tr>';
  }).join('');
  return '<section class="match" id="matchup"><div class="match-head"><h2 tabindex="-1">Compare two people</h2>'+nav(c,{duel:false},'Close matchup')+'</div><div class="match-select">'+toggles('who',a,'First member')+toggles('peer',b,'Second member')+'</div><table><thead><tr><th>Metric</th><th>'+a.name+'</th><th>'+b.name+'</th></tr></thead><tbody>'+rows+'</tbody></table></section>';
}

const views={split,sheet,daily,profile,range,chase};
export function board(c,id,pair=false) {
  const d=designById[id],heading=pair?'h2':'h1';
  return '<article class="board tone-'+id+'" data-board="'+id+'"><header class="board-header"><div class="board-meta"><span>friendos</span><span>Nov 19–25 · Sample group</span></div><'+heading+'>'+d.name+'</'+heading+'><p>'+d.detail+'</p></header><div class="board-body">'+views[id](c)+'</div><div class="board-foot"><button type="button" class="pick" data-pick="'+id+'">Share this pick</button></div></article>';
}

export function thumbnail(id) {
  if(id==='split')return '<div class="mini-twins">'+['sleep','workout'].map(k=>'<div><small>'+metrics[k].short+'</small>'+weekly[k].slice(0,3).map(r=>'<p><i>'+r.rank+'</i><span>'+r.person.name+'</span><b>'+format(k,r.value)+'</b></p>').join('')+'</div>').join('')+'</div>';
  if(id==='sheet')return '<div class="mini-sheet"><div><span></span>'+metricKeys.map(k=>'<small>'+metrics[k].short+'</small>').join('')+'</div>'+['priya','you','jordan'].map(p=>'<div><b>'+memberById[p].name+'</b>'+metricKeys.map(k=>'<span>'+ord(byPerson[k][p].rank)+'</span>').join('')+'</div>').join('')+'</div>';
  if(id==='daily')return '<div class="mini-days"><div class="mini-week">'+weekdays.map((d,i)=>'<i'+(i===3?' class="lit"':'')+'>'+d[0]+'</i>').join('')+'</div>'+nightly.sleep[3].slice(0,3).map(r=>{const delta=nightly.sleep[2].find(x=>x.person===r.person).rank-r.rank;return '<p><i>'+ord(r.rank)+'</i><b>'+r.person.name+'</b><span>'+(delta>0?'↑ '+delta:delta<0?'↓ '+Math.abs(delta):'Even')+'</span><strong>'+format('sleep',r.value)+'</strong></p>'}).join('')+'</div>';
  if(id==='profile')return '<div class="mini-profile"><b>Jordan</b>'+rankTrace('jordan',true)+'<div class="mini-axis">'+metricKeys.map(k=>'<small>'+metrics[k].short+'</small>').join('')+'</div></div>';
  if(id==='range')return '<div class="mini-ranges"><small>Nightly sleep</small>'+['priya','you','jordan'].map(id=>{const r=byPerson.sleep[id];return '<p><b>'+r.person.name+'</b>'+spanBar(r,'sleep')+'<span>'+difference('sleep',r.span)+'</span></p>'}).join('')+'</div>';
  return '<div class="mini-chase"><div><small>Sleep leader</small><b>Priya</b><strong>'+format('sleep',weekly.sleep[0].value)+'</strong></div>'+weekly.sleep.slice(1,4).map(r=>'<p><span>'+r.person.name+'</span><i style="--gap:'+(100*(weekly.sleep[0].value-r.value)/32)+'%"></i><b>'+difference('sleep',weekly.sleep[0].value-r.value)+'</b></p>').join('')+'</div>';
}
