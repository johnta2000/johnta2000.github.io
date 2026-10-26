import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parsePlanner,dedupePlanner,parseDelimited,nullableNumber,canonical,buildOpportunities,pageMetrics} from './engine.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const load=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const config=await load(path.join(root,'config.json'));
const snapshot=await load(path.join(root,'.cache/latest.json'));
const warnings=[],plannerRows=[],plannerFiles=[];
const seed=await load(path.resolve(root,config.keywordEvidence));
for(const source of new Set([...seed.map(r=>r.file),...config.extraPlannerFiles])){
  try{const b=await fs.readFile(source);const rows=parsePlanner(b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8'),source);plannerRows.push(...rows);plannerFiles.push({source,rows:rows.length});}
  catch(e){warnings.push('Planner file unavailable: '+path.basename(source)+' ('+e.code+')');}
}
if(!plannerRows.length)throw Error('No Keyword Planner inputs available');
const planner=dedupePlanner(plannerRows);
let drafts=[];
try{const text=await fs.readFile(config.draftSnapshot,'utf8');let draftSection=false;for(const line of text.split('\n')){if(line.startsWith('## '))draftSection=/draft|ready to publish/i.test(line);if(draftSection&&line.startsWith('- '))drafts.push(line.slice(2));}}catch{warnings.push('Draft snapshot unavailable');}
// Vercel is historical context only; never mix it into the current GSC comparison.
const vercel=new Map();let vercelEnd=null;
try{const rows=parseDelimited(await fs.readFile(config.vercelSnapshot,'utf8')),headers=rows.shift();const idx=n=>headers.indexOf(n);
  for(const row of rows){const date=row[idx('week_end')];if(date>vercelEnd||vercelEnd===null)vercelEnd=date;}
  for(const row of rows.filter(r=>r[idx('week_end')]===vercelEnd))vercel.set(canonical(row[idx('url')]),{views:nullableNumber(row[idx('vercel_pageviews')]),googleViews:nullableNumber(row[idx('vercel_google_referred_pageviews')]),start:row[idx('week_start')],end:vercelEnd});
}catch{warnings.push('Historical Vercel snapshot unavailable');}
const reviews=await load(path.join(root,'reviews.json'));
const engine=buildOpportunities({...snapshot,planner,config,drafts,reviews});
let editorial={};try{editorial=await load(path.join(root,'.cache/editorial-review.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
const currentPages=pageMetrics(snapshot.gsc.current.pages.rows),previousPages=pageMetrics(snapshot.gsc.previous.pages.rows);
const workPlan=(editorial.workPlan??[]).map(t=>{
  const age=Date.now()-Date.parse(t.reviewedAt),fresh=Number.isFinite(age)&&age>=0&&age<=14*86400000;
  const article=snapshot.inventory.articles.find(a=>canonical('https://www.nextcard.com/articles/'+a.slug)===canonical(t.targetUrl));
  return {...t,status:fresh?t.status:'Review due',workItem:true,lane:t.kind,family:t.family??'Reviewed work',volume:null,
    current:t.measureTargetTraffic===false?null:currentPages.get(canonical(t.targetUrl))??null,previous:t.measureTargetTraffic===false?null:previousPages.get(canonical(t.targetUrl))??null,
    targets:t.targetUrl?[{title:article?.title??t.targetTitle??t.targetUrl,url:t.targetUrl,officeUrl:article?.id?'https://office.affil.ai/content/articles/'+article.id+'?panel=article-inspector':null}]:[],
    articles:[],queries:t.queries??[],pages:[],exactPages:[],blockers:t.doneWhen??[]};
}).toSorted((a,b)=>Number(b.status==='Ready')-Number(a.status==='Ready')||Number(a.priority?.replace('P','')??9)-Number(b.priority?.replace('P','')??9));
for(const item of engine.opportunities)for(const article of item.coverage.articles)article.historicalVercel=vercel.get(canonical(article.url))??null;
warnings.push('Draft inventory is a September 12 snapshot plus the October 10 docket; current unpublished coverage is not verified.');
warnings.push('Keyword Planner files are September exports. US was the intended audience in prior instructions; location settings are not recorded in these files. Volumes include close variants and are not summed.');
warnings.push('Vercel context ends '+(vercelEnd??'unknown')+' and is not current analytics.');
warnings.push('Search-result reviews use dated observations. Unreviewed difficulty is never treated as easy.');
if(!snapshot.gsc.recent)warnings.push('Recent seven-day movement has not been collected. A 28-day average cannot establish recovery or stability after a recent drop.');
if(Object.values(snapshot.gsc).some(x=>x?.queries?.capped||x?.queryPages?.capped))warnings.push('One or more GSC pulls reached the local row cap.');
const report={schemaVersion:1,generatedAt:new Date().toISOString(),finalizedThrough:snapshot.gsc.finalizedThrough,periods:snapshot.gsc.periods,country:snapshot.gsc.country,
  sources:{gscFetchedAt:snapshot.gsc.fetchedAt,inventory:snapshot.inventory.source,inventoryFetchedAt:snapshot.inventory.fetchedAt,articleCount:snapshot.inventory.articles.length,plannerFiles,plannerKeywords:planner.size,draftCount:drafts.length,docketAsOf:config.docketAsOf,vercelEnd},
  warnings,workPlan,qualityIssues:(editorial.qualityIssues??[]).filter(i=>i.id!=='recent-gsc'||!snapshot.gsc.recent),recentPeriods:snapshot.gsc.recent?.periods??null,...engine};
const dir=path.join(root,'reports');await fs.mkdir(dir,{recursive:true,mode:0o700});
await fs.writeFile(path.join(dir,'latest.json.tmp'),JSON.stringify(report,null,2),{mode:0o600});await fs.rename(path.join(dir,'latest.json.tmp'),path.join(dir,'latest.json'));
console.log(JSON.stringify({ok:true,finalizedThrough:report.finalizedThrough,plannerKeywords:planner.size,opportunities:report.opportunities.length,lanes:report.opportunities.reduce((m,r)=>(m[r.lane]=(m[r.lane]??0)+1,m),{}),topResearch:report.opportunities.filter(r=>r.lane==='Research gap').slice(0,12).map(r=>({id:r.id,query:r.keyword,volume:r.strongestKeywordVolume?.monthlySearches,impressions:r.current?.impressions,position:r.current?.position,owners:r.pages.map(p=>p.url)}))},null,2));
