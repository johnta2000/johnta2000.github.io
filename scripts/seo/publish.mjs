import fs from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {submitExternalReport} from '../monitoring/report-external.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const data=JSON.parse(await fs.readFile(path.join(root,'reports/latest.json'),'utf8'));
const counts=data.opportunities.reduce((a,r)=>(a[r.lane]=(a[r.lane]??0)+1,a),{});
const readyTaskCount=(data.workPlan??[]).filter(t=>t.status==='Ready').length,sourceCheckCount=(data.qualityIssues??[]).length;
const compact=r=>({id:r.id,keyword:r.keyword,lane:r.lane,family:r.family,city:r.city,volume:r.strongestKeywordVolume?.monthlySearches??null,
  plannerEvidence:r.strongestKeywordVolume?path.basename(r.strongestKeywordVolume.source.file)+' · row '+r.strongestKeywordVolume.source.row:null,
  current:r.current,previous:r.previous,recent:r.recent,recentPrevious:r.recentPrevious,targets:(r.targets??[]).slice(0,3),advantage:r.advantage,constraint:r.constraint,nextStep:r.nextStep,difficulty:r.difficulty,review:r.review,
  queries:r.queries.slice(0,3).map(q=>({keyword:q.keyword,monthlySearches:q.monthlySearches,impressions:q.current?.impressions??null,position:q.current?.position??null})),
  exactPages:(r.exactPages??[]).slice(0,3),pages:r.pages.slice(0,2),articles:r.coverage.articles.slice(0,2).map(({title,url,officeUrl})=>({title,url,officeUrl})),scheduled:r.coverage.scheduled.slice(0,2),blockers:r.blockers});
const report={monitorId:'seo-content-opportunities',timestamp:data.generatedAt,status:(data.qualityIssues??[]).some(i=>['pending','needs-verification'].includes(i.level))?'watch':'healthy',summary:`US GSC through ${data.finalizedThrough}: ${readyTaskCount} reviewed tasks ready, ${sourceCheckCount} source checks and ${counts['GSC lead']??0} unverified GSC leads. Open Reviewed work for priorities and completion criteria.`,meaningful:false,eventType:'research-refresh',
  metrics:{readyTaskCount,sourceCheckCount,updateCount:counts['Update candidate']??0,researchCount:counts['Research gap']??0,plannerKeywords:data.sources.plannerKeywords},
  details:{finalizedThrough:data.finalizedThrough,periodLabel:`${data.periods.current.startDate}–${data.periods.current.endDate} versus ${data.periods.previous.startDate}–${data.periods.previous.endDate}`,articleCount:data.sources.articleCount,plannerKeywords:data.sources.plannerKeywords,
    warnings:data.warnings,workPlan:data.workPlan,qualityIssues:data.qualityIssues,recentPeriods:data.recentPeriods,totalGroups:data.opportunities.length,fragmentRowsExcluded:data.fragmentRowsExcluded,longQueriesExcluded:data.longQueriesExcluded,opportunities:[],
    discovery:data.unclassified.slice(0,20).map(r=>({keyword:r.keyword,volume:r.planner,impressions:r.current?.impressions??null}))},sourceUrls:['https://www.nextcard.com','https://developers.google.com/webmaster-tools/v1/how-tos/search_analytics','https://support.google.com/google-ads/answer/3022575']};
// Only this monitor has a 200KB report cap; other monitors retain their existing limits.
const lanes=['Update candidate','GSC lead','Tool opportunity','Coverage review','Research gap','New article shortlist','Already planned','Navigational demand','Deprioritized','Low observed demand','Existing coverage'];
const queues=lanes.map(l=>data.opportunities.filter(r=>r.lane===l));const added=new Set();
for(let round=0;round<2;round++)for(const queue of queues){const r=queue[round];if(!r)continue;const row=compact(r);report.details.opportunities.push(row);if(Buffer.byteLength(JSON.stringify(report))>195000)report.details.opportunities.pop();else added.add(r.id);}
for(const r of data.opportunities){if(added.has(r.id)||r.lane==='Low observed demand')continue;const row=compact(r);report.details.opportunities.push(row);if(Buffer.byteLength(JSON.stringify(report))>195000)report.details.opportunities.pop();else added.add(r.id);}
report.details.opportunities.sort((a,b)=>lanes.indexOf(a.lane)-lanes.indexOf(b.lane)||data.opportunities.findIndex(r=>r.id===a.id)-data.opportunities.findIndex(r=>r.id===b.id));
await fs.writeFile(path.join(root,'reports/dashboard.json'),JSON.stringify(report),{mode:0o600});
if(process.argv.includes('--report')){
  const secret=await fs.readFile(path.join(homedir(),'.codex/secrets/john-ta-monitoring-report-secret'),'utf8');
  await submitExternalReport(report,{secret});
  console.log(JSON.stringify({published:true,groupsShown:report.details.opportunities.length,totalGroups:report.details.totalGroups,bytes:Buffer.byteLength(JSON.stringify(report))}));
}else console.log(JSON.stringify({published:false,groupsShown:report.details.opportunities.length,bytes:Buffer.byteLength(JSON.stringify(report))}));
