import {canonical,pageMetrics} from './engine.mjs';

const normalize=s=>String(s??'').toLowerCase().trim().replace(/\s+/g,' ');
const metrics=m=>m?{clicks:m.clicks,impressions:m.impressions,position:m.position,ctr:m.ctr}:null;
const titles={
  'csr-dining-credit-map':'CSR dining map','bilt-dining-map':'Bilt dining map',
  'united-renowned-hotels':'United Renowned hotels','hilton-aspire-resorts':'Hilton Aspire resorts',
  'bilt-calculator':'Bilt calculator','resy-map':'Amex Resy map','amex-hotel-map':'Amex hotel map',
  'dining-rewards-map':'MealMaxxer','bilt-hafh-hotel-map':'Bilt Home Away From Home',
  'rakuten-dining-map':'Rakuten Dining map','leading-hotels-of-the-world-map':'LHW award hotel map',
};

// Private research is an input to every build, not a separate public report.
// Refresh the measurements from GSC while preserving the date of the human assessment.
export function buildEvidence(snapshot,evidence,workPlan){
  if(!evidence)return null;
  if(!Array.isArray(evidence.cohorts)||!Array.isArray(evidence.searchReviews))throw Error('Invalid private SEO research evidence');
  const current=pageMetrics(snapshot.gsc.current.pages.rows),previous=pageMetrics(snapshot.gsc.previous.pages.rows);
  const inventory=new Map(snapshot.inventory.articles.map(a=>[canonical('https://www.nextcard.com/articles/'+a.slug),a]));
  const workFor=urls=>workPlan.filter(t=>[t.targetUrl,...(t.sources??[])].some(source=>source&&urls.some(u=>canonical(u)===canonical(source)))).map(t=>t.id);
  const page=url=>{const a=inventory.get(canonical(url));return{url,title:a?.title??titles[url.split('/').at(-1)]??url,
    officeUrl:a?.id?'https://office.affil.ai/content/articles/'+a.id+'?panel=article-inspector':null,
    current:metrics(current.get(canonical(url))),previous:metrics(previous.get(canonical(url)))};};
  const aggregate=(rows,key)=>({clicks:rows.some(r=>r[key])?rows.reduce((n,r)=>n+(r[key]?.clicks??0),0):null,impressions:rows.some(r=>r[key])?rows.reduce((n,r)=>n+(r[key]?.impressions??0),0):null,
    pagesWithClicks:rows.filter(r=>(r[key]?.clicks??0)>0).length,missingPages:rows.filter(r=>!r[key]).length});
  const cohorts=evidence.cohorts.map((c,i)=>{const rows=c.rows.map(r=>page(r.url));return{id:'cohort-'+i,name:c.name,count:rows.length,
    current:aggregate(rows,'current'),previous:aggregate(rows,'previous'),decision:c.decision,rows,relatedWorkIds:workFor(rows.map(r=>r.url))};});
  const tools=(evidence.tools??[]).map((t,i)=>({id:'tool-'+i,...page(t.url),relatedWorkIds:workFor([t.url])}));
  const queriesFor=t=>[t.keyword,...(t.sources??[]).map(u=>{try{const url=new URL(u);return url.hostname==='www.google.com'?url.searchParams.get('q'):null;}catch{return null;}})].filter(Boolean).map(normalize);
  const searches=evidence.searchReviews.map((s,i)=>({id:'search-'+i,query:s.query,checkedAt:s.checkedAt,url:s.url,finding:s.finding,
    resultLabels:s.resultLabels??[],relatedWorkIds:workPlan.filter(t=>queriesFor(t).includes(normalize(s.query))).map(t=>t.id)}));
  return{reviewedAt:evidence.generatedAt,reviewedThrough:evidence.gscFinalizedThrough,finalizedThrough:snapshot.gsc.finalizedThrough,
    periods:snapshot.gsc.periods,gscFetchedAt:snapshot.gsc.fetchedAt,method:evidence.searchMethod,searchLimit:evidence.searchLimit,
    limits:evidence.limits??[],roiDefinition:evidence.roiDefinition,cohorts,tools,searches,
    edit:evidence.edit?{fetchedAt:evidence.edit.fetchedAt,finalizedThrough:evidence.edit.finalizedThrough,recentRange:evidence.edit.recentRange,
      currentRange:evidence.edit.currentRange,previousRange:evidence.edit.previousRange,
      queries:evidence.edit.queries.map(q=>({query:q.query,group:q.group,clicks:q.clicks,impressions:q.impressions,position:q.position,
        previousImpressions:q.previousImpressions,previousPosition:q.previousPosition,baseline:q.baseline,recent:q.recent}))}:null};
}
