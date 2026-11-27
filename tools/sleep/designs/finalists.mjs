import {weekly, metrics, metricKeys, format, difference, gapReason, weekdays, dateLabel} from './sample.mjs';

export const finalists = {
  ladder: {name:'Rank ladder', short:'Ladder', caption:'Who leads this week?'},
  range: {name:'Range bars', short:'Ranges', caption:'Who had the widest swings?'},
  combined: {name:'Ladder + range', short:'Combined', caption:'Who leads, and how steady were they?'}
};

function reading(key, n) {
  return format(key, Number.isFinite(n) ? Math.round(n*10)/10 : null);
}
function axisFor(rows, key) {
  const values=rows.flatMap(r=>r.series.filter(Number.isFinite));
  const step=key==='sleep'?30:key==='workout'?15:5;
  const min=Math.floor(Math.min(...values)/step)*step;
  const max=Math.max(min+step,Math.ceil(Math.max(...values)/step)*step);
  return {min,max,percent:v=>100*(v-min)/(max-min)};
}
function mark(r,axis) {
  if(!r.count)return '<span></span>';
  return '<span aria-hidden="true" class="fin-rail"><i style="left:'+axis.percent(r.low)+'%;width:'+(axis.percent(r.high)-axis.percent(r.low))+'%"></i><b style="left:'+axis.percent(r.avg)+'%"></b></span>';
}
function details(r,key) {
  if(!r.count)return '<div class="fin-details">'+(r.person.private?'This week is private.':'No shared readings for this metric this week.')+'</div>';
  const days=r.series.map((v,i)=>'<div title="'+dateLabel(i)+'"><small>'+weekdays[i]+'</small><strong>'+reading(key,v)+'</strong></div>').join('');
  return '<div class="fin-details"><div class="fin-source">'+r.person.provider+' · '+r.count+'/7 days tracked</div><dl>'+[['Low',r.low],['Daily average',r.avg],['High',r.high]].map(([label,v])=>'<div><dt>'+label+'</dt><dd>'+reading(key,v)+'</dd></div>').join('')+'</dl><div class="fin-days">'+days+'</div></div>';
}
function board(c,id,rows,axis) {
  const {metric:key,inspect}=c.s;
  const meta=finalists[id],isRange=id==='range',isLadder=id==='ladder';
  const placeLabel=isRange?'Member':'Rank / member';
  const valueLabel=isRange?'Spread':key==='workout'?'Week total':'Average';
  const axisLabels='<span class="fin-axis"><span>'+reading(key,axis.min)+'</span><span>'+reading(key,axis.max)+'</span></span>';
  const list=rows.map(r=>{
    const name=r.person.name, open=r.person.id===inspect;
    const weeklyValue=r.rank?reading(key,r.value):gapReason(r,key);
    const val=isRange&&r.count?difference(key,r.span):weeklyValue;
    const rank=r.rank===null?'–':r.rank;
    const rangeLabel=r.count?', low '+reading(key,r.low)+', high '+reading(key,r.high):'';
    const aria=name+', '+(r.rank?'rank '+rank+', ':'')+valueLabel+' '+val+(isLadder?'':rangeLabel);
    const person='<span class="fin-person">'+(isRange?'':'<i>'+rank+'</i>')+'<strong>'+name+'</strong></span>';
    return '<li><a data-nav data-person="'+r.person.id+'" class="fin-row" aria-expanded="'+open+'" aria-label="'+aria+'" href="'+c.url({study:id,inspect:open?'':r.person.id})+'">'+person+(isLadder?'':mark(r,axis))+'<b class="fin-value'+(r.rank===null?' muted':'')+'">'+val+'</b></a>'+(open?details(r,key):'')+'</li>';
  }).join('');
  return '<article class="fin-board fin-'+id+'" data-board="study-'+id+'" data-chosen="'+(c.s.study===id)+'"><header><h2>'+meta.name+'</h2><p>'+meta.caption+'</p></header><div class="fin-head"><span>'+placeLabel+'</span>'+(isLadder?'':axisLabels)+'<span>'+valueLabel+'</span></div><ol>'+list+'</ol></article>';
}
export function finalistsReview(c) {
  const key=c.s.metric, rows=weekly[key],axis=axisFor(rows,key);
  const nav=(patch,label,selected)=>'<a data-nav href="'+c.url(patch)+'"'+(selected?' aria-current="true"':'')+'>'+label+'</a>';
  return '<section class="fin-study"><a class="backlink" data-nav href="'+c.url({study:'',inspect:''})+'">All designs</a><div class="fin-title"><div><h1 tabindex="-1">The weekly standings</h1><p>Nov 19–25 · Ten fictional members</p></div><nav aria-label="Standings metric">'+metricKeys.map(k=>nav({metric:k},metrics[k].short,k===key)).join('')+'</nav></div><nav class="fin-switch" aria-label="Mockup">'+Object.entries(finalists).map(([id,d])=>nav({study:id},d.short,id===c.s.study)).join('')+'</nav><p class="fin-key"><i aria-hidden="true"></i>Same rank order in every view. Bars show low to high. Dots show the daily average.</p><div class="fin-boards">'+Object.keys(finalists).map(id=>board(c,id,rows,axis)).join('')+'</div></section>';
}
