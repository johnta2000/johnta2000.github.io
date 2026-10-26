export const normalize=s=>String(s??'').toLowerCase().replace(/[®™℠]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export function canonical(url){try{const u=new URL(url);u.hash='';u.hostname=u.hostname.replace(/^www\./,'');return u.href.replace(/\/$/,'');}catch{return url;}}
export function parseDelimited(text,delimiter=','){
  text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===delimiter&&!quoted){row.push(value);value='';}else if(c==='\n'&&!quoted){row.push(value.replace(/\r$/,''));if(row.some(Boolean))rows.push(row);row=[];value='';}else value+=c;}
  if(quoted)throw Error('Unterminated CSV quotation');if(value||row.length){row.push(value.replace(/\r$/,''));rows.push(row);}return rows;
}
export const nullableNumber=s=>s!=null&&String(s).trim()!==''&&/^\d[\d,]*(\.\d+)?$/.test(String(s).trim())?Number(String(s).replaceAll(',','')):null;
export function parsePlanner(text,source){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/),i=lines.findIndex(s=>/^"?Keyword(?:\t|",|,)/.test(s));
  if(i<0)throw Error('Keyword Planner header missing');
  const rows=parseDelimited(lines.slice(i).join('\n'),lines[i].includes('\t')?'\t':',');const h=rows.shift();
  const idx=name=>h.indexOf(name),volume=idx('Avg. monthly searches');if(volume<0)throw Error('Keyword Planner volume column missing');
  return rows.map((r,n)=>({keyword:normalize(r[0]),volume:nullableNumber(r[volume]),source,row:i+n+2,period:lines.slice(0,i).join(' '),advertiserCompetition:r[idx('Competition')]||null,monthly:h.flatMap((key,j)=>key.startsWith('Searches: ')?[{month:key.slice(10),searches:nullableNumber(r[j])}]:[])})).filter(r=>r.keyword);
}
export function dedupePlanner(rows){
  const map=new Map();for(const row of rows){const k=normalize(row.keyword);if(!map.has(k))map.set(k,[]);map.get(k).push(row);}
  return new Map([...map].map(([k,observations])=>{
    const sorted=observations.toSorted((a,b)=>String(b.source).localeCompare(String(a.source)));
    const selected=sorted.find(r=>r.volume!==null)??sorted[0];
    return [k,{...selected,observations,volumeConflict:new Set(observations.filter(r=>r.volume!==null).map(r=>r.volume)).size>1}];
  }));
}
const cityPatterns=[['New York','\\bnyc\\b|new york|manhattan|brooklyn'],['San Francisco','san francisco|\\bsf\\b|bay area'],['Los Angeles','los angeles|\\bla\\b'],['Washington DC','washington dc|washington d c|\\bdc\\b'],...['las vegas','chicago','boston','miami','san diego','seattle','houston','phoenix','portland','baltimore','denver','atlanta','philadelphia','tokyo','bangkok','london','paris','sydney','singapore','hong kong','honolulu','orlando','austin','dallas','san jose','san antonio','asia','europe'].map(s=>[s.replace(/\b\w/g,c=>c.toUpperCase()),'\\b'+s+'\\b'])];
const cardSubjects=[['bilt-blue',/bilt blue/],['bilt-obsidian',/bilt obsidian/],['bilt-palladium',/bilt palladium/],['venture-x',/venture x/],['ventureone',/ventureone|venture one/],['venture',/venture(?! x|one| one)/],['sapphire-reserve',/sapphire reserve|\bcsr\b/],['sapphire-preferred',/sapphire preferred|\bcsp\b/],['amex-platinum',/amex plat|american express plat/],['freedom-unlimited',/freedom unlimited/],['freedom-flex',/freedom flex/],['strata-elite',/strata elite/],['double-cash',/double cash/]];
export function classify(text,config){
  const q=normalize(text).replace(/\bamex plat\b/g,'amex platinum');if(config.excludedPatterns.some(p=>new RegExp(p,'i').test(q)))return null;
  const family=config.families.find(f=>new RegExp(f.pattern,'i').test(q));if(!family)return null;
  const city=cityPatterns.find(([,pattern])=>new RegExp(pattern,'i').test(q))?.[0]??null;
  let scope='general';
  if(family.id==='amex-hotels')scope=/fhr|fine hotels/.test(q)&&/hotel collection/.test(q)?'comparison':/hotel collection/.test(q)?'thc':'fhr';
  if(family.id==='dining-apps')scope=/rakuten/.test(q)?'rakuten':/seated/.test(q)?'seated':/inkind/.test(q)?'inkind':/bilt/.test(q)?'bilt':/aadvantage|\baa\b|american.*dining/.test(q)?'aadvantage':/delta/.test(q)?'delta':'comparison';
  if(family.id==='edit')scope=/select hotel|stack/.test(q)?'stacking':/points boost|2 5x/.test(q)?'points-boost':'edit';
  if(family.id==='resy')scope=/gift card/.test(q)?'gift-cards':/platinum/.test(q)&&!/gold/.test(q)?'platinum':/gold/.test(q)&&!/platinum/.test(q)?'gold':/credit/.test(q)?'credit':'general';
  if(family.id==='bilt-calculator')scope=/calculator|calculate/.test(q)?'calculator':/cash/.test(q)?'cash':/transfer/.test(q)?'transfers':'other';
  if(family.id==='benefit-tracking')scope=/maxrewards/.test(q)&&/cardpointers/.test(q)?'comparison':/maxrewards/.test(q)?'maxrewards':/cardpointers/.test(q)?'cardpointers':'tracking';
  if(family.id==='benefit-tracking'&&/\bapplication|\bapproval/.test(q))return null;
  if(family.id==='bilt-calculator'&&/\bvs\b|versus/.test(q)){
    const subjects=cardSubjects.filter(([,pattern])=>pattern.test(q)).map(([id])=>id).sort();
    if(subjects.length>=2)scope='cards-'+subjects.join('-vs-');
  }
  const intent=/gift card/.test(q)?'gift-cards':/not working|missing|not post|troubleshoot/.test(q)?'troubleshooting':/tax|fee/.test(q)&&family.id==='lhw'?'award-fees':/amex|transfer/.test(q)&&family.id==='lhw'?'amex-transfer':/cheap|affordable|lowest|under \d|budget/.test(q)?'cheapest':/\bvs\b|versus|compare|comparison/.test(q)?'comparison':/qualif|eligible charge|what counts|rate.*credit|charge.*qualif/.test(q)?'qualification':/best.*rede|best.*points/.test(q)&&family.id==='lhw'?'best-redemptions':/map|near me|list|locations/.test(q)?'directory':/how to|how do|book|reservation|slots/.test(q)?'how-to':/review|worth it/.test(q)?'review':city?'city-guide':'guide';
  return {family,scope,intent,city,id:[family.id,scope,intent,city?normalize(city).replaceAll(' ','-'):'national'].join(':')};
}
export const aggregate=rows=>{
  if(!rows.length)return null;const impressions=rows.reduce((s,r)=>s+r.impressions,0),clicks=rows.reduce((s,r)=>s+r.clicks,0);
  return {clicks,impressions,ctr:impressions?clicks/impressions:null,position:impressions?rows.reduce((s,r)=>s+r.position*r.impressions,0)/impressions:null};
};
function queryMap(rows){
  const groups=new Map();for(const row of rows){const key=normalize(row.keys[0]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  return new Map([...groups].map(([key,group])=>[key,{keys:[key],...aggregate(group)}]));
}
export function pageMetrics(rows){
  const groups=new Map();for(const row of rows){if(row.keys[0].includes('#'))continue;const key=canonical(row.keys[0]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  return new Map([...groups].map(([key,group])=>[key,{keys:[key],...aggregate(group)}]));
}
const wordSet=s=>new Set(normalize(s).split(' ').filter(w=>!['the','a','an','how','to','of','for','in','with','and','your','best','guide','2026','2027'].includes(w)));
function titleSimilarity(query,title){const q=wordSet(query),t=wordSet(title);return q.size?[...q].filter(w=>t.has(w)).length/q.size:0;}
export function coverageFor(group,articles,docket,config){
  const matches=articles.filter(a=>!a.expired).map(a=>{
    const c=classify(a.title+' '+a.slug,config);if(!c||c.family.id!==group.family.id||c.scope!==group.scope||c.city!==group.city)return null;
    const similarity=Math.max(...group.queries.slice(0,12).map(q=>titleSimilarity(q.keyword,a.title+' '+a.slug)));
    // A city guide may cover the directory intent, but a national guide does not prove city coverage.
    const aligned=c.intent===group.intent||(['guide','city-guide','directory'].includes(c.intent)&&['guide','city-guide','directory'].includes(group.intent));
    return aligned&&similarity>=0.55?{title:a.title,url:'https://www.nextcard.com/articles/'+a.slug,officeUrl:a.id?'https://office.affil.ai/content/articles/'+a.id+'?panel=article-inspector':null,updatedAt:a.updatedAt,match:'title and intent; body review required'}:null;
  }).filter(Boolean);
  const scheduled=docket.filter(title=>{const c=classify(title,config);return c&&c.family.id===group.family.id&&c.scope===group.scope&&c.city===group.city&&(c.intent===group.intent||Math.max(...group.queries.slice(0,12).map(q=>titleSimilarity(q.keyword,title)))>=0.8);});
  return {articles:matches,scheduled};
}
export function articleTargets(articles,queries,currentRows,previousRows){
  const querySet=new Set(queries.map(q=>q.keyword));
  const matching=(rows,url)=>rows.filter(r=>!r.keys[1].includes('#')&&canonical(r.keys[1])===canonical(url)&&querySet.has(normalize(r.keys[0])));
  return articles.map(article=>{
    // A broad group may contain different card comparisons. Do not attach an article
    // to its headline keyword merely because it ranks for another query in that group.
    const headline=queries[0]?.keyword??'';
    if(titleSimilarity(headline,article.title+' '+new URL(article.url).pathname)<(/\bvs\b|\bversus\b/.test(headline)?0.8:0.6))return null;
    const current=aggregate(matching(currentRows,article.url)),previous=aggregate(matching(previousRows,article.url));
    const lost=previous&&current?previous.clicks-current.clicks:null;
    const actionable=current&&(current.impressions>=20&&current.position>=4&&current.position<=20||lost>=10);
    if(!actionable)return null;
    const reason=lost>=10?`This article lost ${lost} clicks for this query group (${previous.clicks} → ${current.clicks}) across the compared 28-day periods. Check its query mix and current content before editing.`:
      `This article received ${current.impressions} impressions and ${current.clicks} ${current.clicks===1?'click':'clicks'} for this query group, averaging position ${current.position.toFixed(2)}. Review how directly it answers these searches.`;
    return {...article,current,previous,reason};
  }).filter(Boolean).sort((a,b)=>b.current.clicks-a.current.clicks||b.current.impressions-a.current.impressions);
}
export function buildOpportunities({gsc,inventory,planner,config,drafts=[],reviews={}}){
  const current=queryMap(gsc.current.queries.rows);
  const previous=queryMap(gsc.previous.queries.rows);
  const recent=gsc.recent?queryMap(gsc.recent.current.queries.rows):null,recentPrevious=gsc.recent?queryMap(gsc.recent.previous.queries.rows):null;
  const queryPages=new Map();let fragmentRows=0;
  for(const r of gsc.current.queryPages.rows){if(r.keys[1].includes('#')){fragmentRows++;continue;}const q=normalize(r.keys[0]);if(!queryPages.has(q))queryPages.set(q,[]);queryPages.get(q).push(r);}
  const groups=new Map(),unclassified=[];let longQueriesExcluded=0;
  for(const keyword of new Set([...current.keys(),...previous.keys(),...planner.keys()])){
    if(keyword.length>180||keyword.split(' ').length>28){longQueriesExcluded++;continue;}
    const c=classify(keyword,config);if(!c){if(!config.excludedPatterns.some(p=>new RegExp(p,'i').test(keyword)))unclassified.push({keyword,current:current.get(keyword)??null,planner:planner.get(keyword)?.volume??null});continue;}
    if(!groups.has(c.id))groups.set(c.id,{...c,queries:[]});
    const k=planner.get(keyword);groups.get(c.id).queries.push({keyword,current:current.get(keyword)??null,previous:previous.get(keyword)??null,monthlySearches:k?.volume??null,plannerSource:k?{file:k.source,row:k.row,period:k.period,conflict:k.volumeConflict}:null});
  }
  const result=[];
  for(const group of groups.values()){
    group.queries.sort((a,b)=>(b.monthlySearches??-1)-(a.monthlySearches??-1)||(b.current?.impressions??0)-(a.current?.impressions??0));
    const cur=aggregate(group.queries.flatMap(q=>q.current?[q.current]:[])),prev=aggregate(group.queries.flatMap(q=>q.previous?[q.previous]:[]));
    const coverage=coverageFor(group,inventory.articles,[...config.docket,...drafts],config);
    const owners=new Map();
    for(const q of group.queries)for(const r of queryPages.get(q.keyword)??[]){const u=canonical(r.keys[1]);if(!owners.has(u))owners.set(u,[]);owners.get(u).push(r);}
    const pages=[...owners].map(([url,rows])=>({url,...aggregate(rows)})).sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions);
    const head=group.queries[0];
    const storedReview=reviews[group.id];
    const review=storedReview&&normalize(storedReview.query)===head.keyword?storedReview:null;
    const reviewAge=Date.now()-Date.parse(review?.checkedAt);
    const reviewFresh=Number.isFinite(reviewAge)&&reviewAge>=-86400000&&reviewAge<=config.thresholds.serpMaxAgeDays*86400000;
    const demand=group.queries.find(q=>q.monthlySearches!==null);
    const sufficient=(demand?.monthlySearches??0)>=config.thresholds.monthlySearches||(cur?.impressions??0)>=config.thresholds.gscImpressions28d;
    const loss=cur&&prev?prev.clicks-cur.clicks:null;
    let lane=coverage.articles.length?'Existing coverage':coverage.scheduled.length?'Already planned':'Research gap';
    const toolIntent=['directory'].includes(group.intent)||group.family.id==='bilt-calculator'&&group.scope==='calculator';
    const toolOwner=pages.find(p=>p.url.includes('/tools/'));
    if(toolIntent&&toolOwner&&!coverage.scheduled.length)lane='Tool opportunity';
    // Existing article visibility calls for a content-scope check before claiming a gap.
    if(lane==='Research gap'&&pages.some(p=>p.url.includes('/articles/')&&(p.clicks>=5||p.impressions>=20)))lane='Coverage review';
    if(lane==='Existing coverage'&&sufficient&&((loss??0)>=10||(cur?.position>=4&&cur?.position<=20)))lane='Update candidate';
    if(!sufficient)lane=coverage.scheduled.length&&!coverage.articles.length?'Already planned':'Low observed demand';
    if(group.family.id==='resy'&&group.city&&!/amex|gold|platinum|credit|cheap|affordable/.test(head.keyword))lane='Navigational demand';
    if(group.family.id==='resy'&&group.scope==='general'&&group.intent==='guide'&&!/amex|gold|platinum|credit|map|gift|cheap|affordable/.test(head.keyword))lane='Navigational demand';
    const blockers=[];
    if(!reviewFresh)blockers.push('Current search-result review needed');
    if(!coverage.articles.length)blockers.push('Check current drafts and article bodies before commissioning');
    if(!review?.datasetVerified)blockers.push('Confirm usable dataset and a concrete original finding');
    if(!sufficient)blockers.push('Demand is below the working threshold');
    if(reviewFresh&&review.difficulty==='high')blockers.push('High competition in reviewed results');
    if(lane==='Research gap'&&sufficient&&reviewFresh&&normalize(review.query)===head.keyword&&review.datasetVerified&&review.coverageVerified&&review.intentFits&&review.difficulty!=='high')lane='New article shortlist';
    if(lane==='Research gap'&&reviewFresh&&(review.difficulty==='high'||review.intentFits===false))lane='Deprioritized';
    let targets=lane==='Update candidate'?articleTargets(coverage.articles,group.queries,gsc.current.queryPages.rows,gsc.previous.queryPages?.rows??[]):[];
    if(lane==='Update candidate'&&!targets.length)lane='Coverage review';
    if(lane==='Update candidate'){
      const approved=reviewFresh&&normalize(review.query)===head.keyword&&review.updateApproved===true&&review.articleReviewed===true&&review.intentFits===true&&review.sources?.length&&review.angle&&targets.find(t=>canonical(t.url)===canonical(review.targetUrl));
      if(approved)targets=[approved,...targets.filter(t=>t!==approved)];
      else {lane='GSC lead';blockers.push('No verified article update recommendation: check exact-query results and article content first');}
    }
    const exactPages=(queryPages.get(head.keyword)??[]).toSorted((a,b)=>b.impressions-a.impressions).slice(0,5).map(r=>({url:r.keys[1],clicks:r.clicks,impressions:r.impressions,position:r.position}));
    const footholds=group.queries.filter(q=>q.current?.impressions>=20&&q.current.position>=4&&q.current.position<=20).slice(0,5).map(q=>q.keyword);
    result.push({id:group.id,family:group.family.label,intent:group.intent,scope:group.scope,city:group.city,keyword:head.keyword,lane,current:cur,previous:prev,clickChange:loss===null?null:-loss,
      recent:recent?aggregate(group.queries.flatMap(q=>recent.has(q.keyword)?[recent.get(q.keyword)]:[])):null,recentPrevious:recentPrevious?aggregate(group.queries.flatMap(q=>recentPrevious.has(q.keyword)?[recentPrevious.get(q.keyword)]:[])):null,
      strongestKeywordVolume:demand?{keyword:demand.keyword,monthlySearches:demand.monthlySearches,source:demand.plannerSource}:null,
      queryCount:group.queries.length,queries:group.queries.slice(0,12),pages:pages.slice(0,5),exactPages,coverage,targets,advantage:group.family.advantage,constraint:group.family.constraint,
      difficulty:reviewFresh?review.difficulty:'Unreviewed',review:reviewFresh?review:null,blockers,footholds,
      demandOrder:Math.max(demand?.monthlySearches??0,(cur?.impressions??0)*30.4/28),
      nextStep:lane==='GSC lead'?(reviewFresh&&normalize(review.query)===head.keyword?review.angle:'Unverified signal, not an edit assignment. Check the exact Google query and which page satisfies it.'):lane==='Already planned'?'Confirm publication status; support the existing assignment.':lane==='Update candidate'?review.angle:lane==='Coverage review'?'An existing article already earns clicks here. Read it before claiming a new content gap.':lane==='Tool opportunity'?'Check whether the existing tool can better satisfy these searches; search-result and product review still required.':lane==='Navigational demand'?'Most of this headline demand may seek Resy itself. Validate a specific credit-use question rather than commission a generic city list.':lane==='Existing coverage'?'Keep one owner for this intent; check bodies before proposing a second article.':reviewFresh?review.angle:'Inspect current results, drafts and data availability. This is a research lead, not a writing assignment.'});
  }
  result.sort((a,b)=>b.demandOrder-a.demandOrder);
  unclassified.sort((a,b)=>Math.max(b.planner??0,b.current?.impressions??0)-Math.max(a.planner??0,a.current?.impressions??0));
  return {opportunities:result,unclassified:unclassified.slice(0,100),fragmentRowsExcluded:fragmentRows,longQueriesExcluded};
}
