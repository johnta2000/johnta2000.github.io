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
const cityPatterns=[['New York','\\bnyc\\b|new york|manhattan|brooklyn'],['San Francisco','san francisco|\\bsf\\b|bay area'],['Los Angeles','los angeles|\\bla\\b'],['Washington DC','washington dc|washington d c|\\bdc\\b'],...['las vegas','chicago','boston','miami','san diego','seattle','houston','phoenix','portland','baltimore','denver','atlanta','philadelphia','tokyo','bangkok','london','paris','sydney','singapore','hong kong','honolulu','orlando','austin','dallas','san jose','san antonio'].map(s=>[s.replace(/\b\w/g,c=>c.toUpperCase()),'\\b'+s+'\\b'])];
export function classify(text,config){
  const q=normalize(text);if(config.excludedPatterns.some(p=>new RegExp(p,'i').test(q)))return null;
  const family=config.families.find(f=>new RegExp(f.pattern,'i').test(q));if(!family)return null;
  const city=cityPatterns.find(([,pattern])=>new RegExp(pattern,'i').test(q))?.[0]??null;
  let scope='general';
  if(family.id==='amex-hotels')scope=/fhr|fine hotels/.test(q)&&/hotel collection/.test(q)?'comparison':/hotel collection/.test(q)?'thc':'fhr';
  if(family.id==='dining-apps')scope=/rakuten/.test(q)?'rakuten':/seated/.test(q)?'seated':/inkind/.test(q)?'inkind':/bilt/.test(q)?'bilt':/aadvantage|\baa\b|american.*dining/.test(q)?'aadvantage':/delta/.test(q)?'delta':'comparison';
  if(family.id==='edit')scope=/select hotel|stack/.test(q)?'stacking':'edit';
  if(family.id==='bilt-calculator')scope=/calculator|calculate/.test(q)?'calculator':/cash/.test(q)?'cash':/transfer/.test(q)?'transfers':'other';
  if(family.id==='benefit-tracking')scope=/maxrewards/.test(q)&&/cardpointers/.test(q)?'comparison':/maxrewards/.test(q)?'maxrewards':/cardpointers/.test(q)?'cardpointers':'tracking';
  const intent=/gift card/.test(q)?'gift-cards':/not working|missing|not post|troubleshoot/.test(q)?'troubleshooting':/tax|fee/.test(q)&&family.id==='lhw'?'award-fees':/amex|transfer/.test(q)&&family.id==='lhw'?'amex-transfer':/cheap|affordable|lowest|under \d|budget/.test(q)?'cheapest':/\bvs\b|versus|compare|comparison/.test(q)?'comparison':/qualif|eligible charge|what counts|rate.*credit|charge.*qualif/.test(q)?'qualification':/best.*rede|best.*points/.test(q)&&family.id==='lhw'?'best-redemptions':/map|near me|list|locations/.test(q)?'directory':/how to|how do|book|reservation|slots/.test(q)?'how-to':/review|worth it/.test(q)?'review':city?'city-guide':'guide';
  return {family,scope,intent,city,id:[family.id,scope,intent,city?normalize(city).replaceAll(' ','-'):'national'].join(':')};
}
export const aggregate=rows=>{
  if(!rows.length)return null;const impressions=rows.reduce((s,r)=>s+r.impressions,0),clicks=rows.reduce((s,r)=>s+r.clicks,0);
  return {clicks,impressions,ctr:impressions?clicks/impressions:null,position:impressions?rows.reduce((s,r)=>s+r.position*r.impressions,0)/impressions:null};
};
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
export function buildOpportunities({gsc,inventory,planner,config,drafts=[],reviews={}}){
  const current=new Map(gsc.current.queries.rows.map(r=>[normalize(r.keys[0]),r]));
  const previous=new Map(gsc.previous.queries.rows.map(r=>[normalize(r.keys[0]),r]));
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
    const review=reviews[group.id]??null;
    const reviewFresh=review?.checkedAt&&Date.parse(gsc.fetchedAt)-Date.parse(review.checkedAt)<=config.thresholds.serpMaxAgeDays*86400000;
    const demand=group.queries.find(q=>q.monthlySearches!==null),head=group.queries[0];
    const sufficient=(demand?.monthlySearches??0)>=config.thresholds.monthlySearches||(cur?.impressions??0)>=config.thresholds.gscImpressions28d;
    const loss=cur&&prev?prev.clicks-cur.clicks:null;
    let lane=coverage.articles.length?'Existing coverage':coverage.scheduled.length?'Already planned':'Research gap';
    const toolIntent=['directory'].includes(group.intent)||group.family.id==='bilt-calculator'&&group.scope==='calculator';
    const toolOwner=pages.find(p=>p.url.includes('/tools/'));
    if(toolIntent&&toolOwner&&!coverage.scheduled.length)lane='Tool opportunity';
    // Existing article visibility calls for a content-scope check before claiming a gap.
    if(lane==='Research gap'&&pages.some(p=>p.url.includes('/articles/')&&p.clicks>=5))lane='Coverage review';
    if(lane==='Existing coverage'&&sufficient&&((loss??0)>=10||(cur?.position>=4&&cur?.position<=20)))lane='Update candidate';
    if(!sufficient)lane=coverage.scheduled.length&&!coverage.articles.length?'Already planned':'Low observed demand';
    if(group.family.id==='resy'&&group.city&&!/amex|gold|platinum|credit|cheap|affordable/.test(head.keyword))lane='Navigational demand';
    const blockers=[];
    if(!reviewFresh)blockers.push('Current search-result review needed');
    if(!coverage.articles.length)blockers.push('Check current drafts and article bodies before commissioning');
    if(!review?.datasetVerified)blockers.push('Confirm usable dataset and a concrete original finding');
    if(!sufficient)blockers.push('Demand is below the working threshold');
    if(reviewFresh&&review.difficulty==='high')blockers.push('High competition in reviewed results');
    if(lane==='Research gap'&&sufficient&&reviewFresh&&review.datasetVerified&&review.coverageVerified&&review.intentFits&&review.difficulty!=='high')lane='New article shortlist';
    if(lane==='Research gap'&&reviewFresh&&(review.difficulty==='high'||review.intentFits===false))lane='Deprioritized';
    const footholds=group.queries.filter(q=>q.current?.impressions>=20&&q.current.position>=4&&q.current.position<=20).slice(0,5).map(q=>q.keyword);
    result.push({id:group.id,family:group.family.label,intent:group.intent,scope:group.scope,city:group.city,keyword:head.keyword,lane,current:cur,previous:prev,clickChange:loss===null?null:-loss,
      strongestKeywordVolume:demand?{keyword:demand.keyword,monthlySearches:demand.monthlySearches,source:demand.plannerSource}:null,
      queryCount:group.queries.length,queries:group.queries.slice(0,12),pages:pages.slice(0,5),coverage,advantage:group.family.advantage,constraint:group.family.constraint,
      difficulty:reviewFresh?review.difficulty:'Unreviewed',review:reviewFresh?review:null,blockers,footholds,
      demandOrder:Math.max(demand?.monthlySearches??0,(cur?.impressions??0)*30.4/28),
      nextStep:lane==='Already planned'?'Confirm publication status; support the existing assignment.':lane==='Update candidate'?'Review the current page and exact queries before prescribing an edit.':lane==='Coverage review'?'An existing article already earns clicks here. Read it before claiming a new content gap.':lane==='Tool opportunity'?'Improve the existing tool for this task; a separate article may not fit the search intent.':lane==='Navigational demand'?'Most of this headline demand may seek Resy itself. Validate a specific credit-use question rather than commission a generic city list.':lane==='Existing coverage'?'Keep one owner for this intent; check bodies before proposing a second article.':reviewFresh?review.angle:'Inspect current results, drafts and data availability. This is a research lead, not a writing assignment.'});
  }
  result.sort((a,b)=>b.demandOrder-a.demandOrder);
  unclassified.sort((a,b)=>Math.max(b.planner??0,b.current?.impressions??0)-Math.max(a.planner??0,a.current?.impressions??0));
  return {opportunities:result,unclassified:unclassified.slice(0,100),fragmentRowsExcluded:fragmentRows,longQueriesExcluded};
}
