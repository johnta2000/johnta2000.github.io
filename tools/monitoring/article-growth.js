/* The authenticated monitor supplies the data; the site only ships the renderer. */
window.ArticleGrowth = (() => {
  const monitorId = 'programmatic-article-growth';
  const labels = ['Published articles', 'Daily Google clicks', 'Daily Google impressions'];
  const format = value => new Intl.NumberFormat('en-US').format(value);
  const shortDate = iso => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
  const escape = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function seriesLink(id) {
    const url = new URL(location.href);
    url.searchParams.set('monitor',monitorId);
    if(id==='all') url.searchParams.delete('series'); else url.searchParams.set('series',id);
    return escape(url.pathname+url.search);
  }
  function figure(values,dates,column) {
    const pair=values.map((row,i)=>[i,row[column]]).filter(p=>Number.isFinite(p[1]));
    if(!pair.length) return '';
    const max=Math.max(1,...pair.map(p=>p[1]));
    const last=pair.at(-1);
    const x=i=>3+994*i/Math.max(1,dates.length-1);
    const y=n=>76-70*n/max;
    const path=pair.map(([i,n],k)=>!k?'M'+x(i)+' '+y(n):column===0?'H'+x(i)+'V'+y(n):'L'+x(i)+' '+y(n)).join(' ');
    const label=labels[column];
    const marks=pair.map(([i,n])=>'<rect x="'+(x(i)-495/Math.max(1,dates.length-1))+'" y="0" width="'+(990/Math.max(1,dates.length-1))+'" height="80" fill="transparent"><title>'+shortDate(dates[i])+' · '+format(n)+'</title></rect>').join('');
    return '<figure class="growth-trend"><figcaption><strong>'+label+'</strong><span>'+format(last[1])+' · '+shortDate(dates[last[0]])+'</span></figcaption>'+
      '<div class="growth-plot"><div class="growth-scale"><span>'+format(max)+'</span><span>0</span></div>'+
      '<svg viewBox="0 0 1000 80" preserveAspectRatio="none" role="img" aria-label="'+label+', '+format(last[1])+' on '+shortDate(dates[last[0]])+'">'+
      '<path class="growth-grid" d="M0 6H1000M0 76H1000"/><path class="growth-line growth-line-'+column+'" d="'+path+'"/>'+marks+'</svg></div>'+
      '<div class="growth-dates"><span>'+shortDate(dates[0])+'</span><span>'+shortDate(dates.at(-1))+'</span></div></figure>';
  }
  function ratio(n,d) {return d?(100*n/d).toFixed(1)+'%':'—';}
  function stat(label,value,context) {
    return '<div><span>'+label+'</span><strong>'+value+'</strong><small>'+context+'</small></div>';
  }
  function render(monitor) {
    const {groups,dates,final,today}=monitor.details||{};
    if(!groups?.length||!dates?.length) return '<p class="empty-state">The first report is pending.</p>';
    const selected=new URLSearchParams(location.search).get('series')||'all';
    const group=groups.find(g=>g.id===selected)||groups[0];
    const [week,previous]=group.weeks;
    const [cohort,prior]=group.cohorts;
    const filters=groups.filter(g=>g.id==='all'||g.daily.at(-1)[0]>0);
    const nav=filters.map(g=>'<a href="'+seriesLink(g.id)+'" data-growth-series="'+escape(g.id)+'" '+(g.id===group.id?'aria-current="page"':'')+'>'+escape(g.name)+'</a>').join('');
    const statRows=stat('Clicks · 7 days',format(week.clicks),'Previous 7 days: '+format(previous.clicks))+
      stat('Impressions · 7 days',format(week.impressions),'Previous 7 days: '+format(previous.impressions))+
      stat('Click-through rate',ratio(week.clicks,week.impressions),'Previous 7 days: '+ratio(previous.clicks,previous.impressions));
    const cohorts=[cohort,prior].map(c=>'<tr><th scope="row">'+shortDate(c.from)+'–'+shortDate(c.to)+'</th><td>'+c.articles+'</td><td>'+c.withClicks+' / '+c.articles+'</td><td>'+(c.articles?(c.clicks/c.articles).toFixed(1):'—')+'</td></tr>').join('');
    const dataRows=dates.map((d,i)=>'<tr><th scope="row">'+shortDate(d)+'</th>'+group.daily[i].map(n=>'<td>'+(n===null?'Pending':format(n))+'</td>').join('')+'</tr>').reverse().join('');
    const stale=Date.now()-Date.parse(monitor.latestRunAt)>48*3600000?'<p class="alert error-alert">The last successful refresh is more than two days old.</p>':'';
    return '<section class="article-growth">'+stale+'<nav class="growth-series" aria-label="Article series">'+nav+'</nav>'+
      '<p class="growth-source">Office publications through '+shortDate(today)+'. Worldwide Google web search finalized through '+shortDate(final)+'. Pacific time.</p>'+
      '<div class="metric-grid growth-stats">'+statRows+'</div>'+labels.map((_,i)=>figure(group.daily,dates,i)).join('')+
      '<section><h3>First-week performance by launch date</h3><p>Each guide gets seven full days after its publication day. Newer launches enter once that window is finalized.</p>'+
      '<div class="growth-table"><table><thead><tr><th>Published</th><th>Guides</th><th>Earned a click</th><th>Clicks per guide</th></tr></thead><tbody>'+cohorts+'</tbody></table></div></section>'+
      '<details><summary>Daily figures</summary><div class="growth-table"><table><thead><tr><th>Date</th><th>Published to date</th><th>Clicks</th><th>Impressions</th></tr></thead><tbody>'+dataRows+
      '</tbody></table></div></details><p class="growth-source">Current published city templates only. The chart shows up to 90 finalized days plus newer publication dates. Drafts and handwritten guides are excluded.</p></section>';
  }
  return {render};
})();
