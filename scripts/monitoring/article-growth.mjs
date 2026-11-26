import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {accessToken} from './bilt-ranking.mjs';
import {submitExternalReport} from './report-external.mjs';

const inventoryHost = 'https://nextcard-static.s3.us-east-1.amazonaws.com';
const gscUrl = 'https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Anextcard.com/searchAnalytics/query';
const secrets = path.join(homedir(), '.codex', 'secrets');
const pacific = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
const families = [
  ['edit','Chase Edit hotels','chase-edit-hotels-in-', /<hotel:[^>]+:intro>/],
  ['fhr','Amex FHR hotels','amex-fhr-hotels-', /<hotel:[^>]+:fhr-intro>/],
  ['csr','Sapphire Reserve dining','sapphire-reserve-dining-restaurants-in-', /"type":"diningGuideBlock"/],
  ['resy','Resy gift cards','resy-restaurant-gift-cards-in-', /embed:\s*resy-restaurant-gift-cards-/],
  ['inkind','inKind restaurants','inkind-restaurants-', /embed:\s*inkind-directory-/],
];
const day = (date,offset) => new Date(Date.parse(date+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
async function getInventory(url) {
  if (new URL(url).origin !== inventoryHost) throw Error('Unexpected Office inventory host.');
  const response = await fetch(url,{signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error('Published inventory returned HTTP '+response.status);
  return response.json();
}
export async function readArticles(now) {
  const pointer = await getInventory(inventoryHost+'/cms/articles/v1/current.json');
  const manifest = await getInventory(pointer.manifestUrl);
  const index = await getInventory(manifest.indexUrl);
  const articles = [];
  const candidates = index.articles.filter(a => !a.expired && Date.parse(a.publishedAt)<=now.getTime() && families.some(f=>a.slug.startsWith(f[2])));
  for (let i=0;i<candidates.length;i+=6) {
    const batch = await Promise.all(candidates.slice(i,i+6).map(async a=>{
      const family = families.find(f=>a.slug.startsWith(f[2]));
      const artifact = await getInventory(manifest.articlesBySlug[a.slug].artifactUrl);
      if (artifact.id!==a.id || artifact.slug!==a.slug || !artifact.document) throw Error('Office release mismatch for '+a.slug);
      if (!family[3].test(JSON.stringify(artifact.document))) return null;
      return {slug:a.slug, series:family[0], published:pacific.format(new Date(a.publishedAt))};
    }));
    articles.push(...batch.filter(Boolean));
  }
  if (!articles.length) throw Error('No published city templates found. Preserving previous report.');
  return articles;
}
async function pullSearch(articles,today) {
  const token = await accessToken(JSON.parse(await readFile(process.env.GSC_KEY_FILE || path.join(secrets,'nextcard-gsc-readonly.json'),'utf8')));
  async function query(params) {
    const response = await fetch(gscUrl,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({type:'web',dataState:'final',...params}),signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw Error('Search Console returned HTTP '+response.status+'. Previous report retained.');
    return (await response.json()).rows ?? [];
  }
  const finalDates = await query({startDate:day(today,-14),endDate:today,dimensions:['date']});
  const final = finalDates.map(r=>r.keys[0]).sort().at(-1);
  if (!final) throw Error('No finalized Search Console dates.');
  const firstPublication = articles.map(a=>a.published).sort()[0];
  const start = [firstPublication,day(final,-89)].sort().at(-1);
  const rows = [];
  const slugs = articles.filter(a=>a.published<=final).map(a=>a.slug);
  for (let i=0;i<slugs.length;i+=25) {
    const batch = slugs.slice(i,i+25);
    if (batch.some(s=>!/^[-a-z0-9]+$/.test(s))) throw Error('Unsupported article slug.');
    const expression='^https://www[.]nextcard[.]com/articles/('+batch.join('|')+')$';
    rows.push(...await query({startDate:start,endDate:final,dimensions:['date','page'],rowLimit:25000,aggregationType:'byPage',
      dimensionFilterGroups:[{filters:[{dimension:'page',operator:'includingRegex',expression}]}]}));
  }
  return {start,final,rows};
}
export function buildGrowth(articles,{start,final,rows},now) {
  const today=pacific.format(now);
  const dates=[];
  for(let d=start;d<=today;d=day(d,1)) dates.push(d);
  const pages=new Map(articles.map(a=>[a.slug,{...a,traffic:new Map()}]));
  for(const row of rows) {
    const [d,url]=row.keys;
    const page=pages.get(url.split('/').at(-1));
    if(page && d>=page.published && d<=final) page.traffic.set(d,[row.clicks,row.impressions]);
  }
  function summarize(subset) {
    const daily=dates.map(d=>{
      const live=subset.filter(a=>a.published<=d);
      if(d>final) return [live.length,null,null];
      let clicks=0, impressions=0;
      for(const a of live) {const pair=a.traffic.get(d); if(pair){clicks+=pair[0];impressions+=pair[1];}}
      return [live.length,clicks,impressions];
    });
    // Compare equally old launches using the first seven full Pacific days, excluding partial launch day.
    const cohorts=[0,7].map(offset=>{
      const from=day(final,-13-offset),to=day(final,-7-offset);
      const eligible=subset.filter(a=>a.published>=from && a.published<=to);
      let withClicks=0, clicks=0;
      for(const a of eligible) {
        let n=0;
        for(let i=1;i<=7;i++) n+=a.traffic.get(day(a.published,i))?.[0]??0;
        clicks+=n;
        if(n) withClicks++;
      }
      return {from,to,articles:eligible.length,withClicks,clicks};
    });
    const weeks=[0,7].map(offset=>{
      const from=day(final,-6-offset),to=day(final,-offset);
      const selected=daily.filter((r,i)=>dates[i]>=from && dates[i]<=to);
      return {from,to,clicks:selected.reduce((n,r)=>n+r[1],0),impressions:selected.reduce((n,r)=>n+r[2],0)};
    });
    return {daily,cohorts,weeks};
  }
  const all=[...pages.values()];
  const groups=[{id:'all',name:'All series',...summarize(all)},...families.map(([id,name])=>({id,name,...summarize(all.filter(p=>p.series===id))}))];
  const {clicks,impressions}=groups[0].weeks[0];
  return {monitorId:'programmatic-article-growth',timestamp:now.toISOString(),status:final<day(today,-4)?'watch':'healthy',
    summary:all.length+' published city guides. '+clicks.toLocaleString('en-US')+' Google clicks and '+impressions.toLocaleString('en-US')+' impressions in the seven days through '+final+'.',
    meaningful:false,eventType:'daily-refresh',metrics:{published:all.length,clicks,impressions},
    details:{today,final,start,dates,groups},sourceUrls:['https://www.nextcard.com/articles','https://search.google.com/search-console']};
}
async function main() {
  const now=new Date();
  const articles=await readArticles(now);
  const search=await pullSearch(articles,pacific.format(now));
  const report=buildGrowth(articles,search,now);
  if(Buffer.byteLength(JSON.stringify(report))>49000) throw Error('Report exceeds private monitoring size limit.');
  if(process.argv.includes('--report')) {
    const secret=await readFile(process.env.MONITORING_REPORT_SECRET_FILE || path.join(secrets,'john-ta-monitoring-report-secret'),'utf8');
    const result=await submitExternalReport(report,{secret});
    if(!result?.updatedAt) throw Error('Monitor publication was not acknowledged.');
  }
  console.log(JSON.stringify({submitted:process.argv.includes('--report'),asOf:report.details.today,final:search.final,...report.metrics,cohorts:report.details.groups[0].cohorts}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(e=>{console.error(e.message);process.exitCode=1;});
