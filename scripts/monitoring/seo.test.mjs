import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {validateExternalReport} from './report-external.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');let browser;
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
const js=fs.readFileSync(new URL('../../tools/monitoring/seo.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../tools/monitoring/seo.css',import.meta.url),'utf8');
const fixture={details:{finalizedThrough:'2026-10-23',periodLabel:'Two 28-day periods',articleCount:322,plannerKeywords:2942,totalGroups:3,fragmentRowsExcluded:2,longQueriesExcluded:1,warnings:['Draft snapshot is old'],opportunities:[
 {id:'one',keyword:'cheapest hotels <script>alert(1)</script>',family:'Hotels',lane:'GSC lead',volume:0,current:null,previous:null,advantage:'Dated prices',constraint:'Verify taxes',nextStep:'Inspect results',difficulty:'Unreviewed',pages:[],articles:[],queries:[],blockers:['Check drafts']},
 {id:'two',keyword:'Bilt calculator',family:'Bilt',lane:'Tool opportunity',volume:null,current:{clicks:0,impressions:50,position:4},previous:{clicks:4},advantage:'Scenarios',constraint:'Verify rules',nextStep:'Review tool',difficulty:'Unreviewed',pages:[],articles:[],queries:[],blockers:[]},
 {id:'three',keyword:'Hotel research',family:'Hotels',lane:'Research gap',volume:100,current:{clicks:20,impressions:300,position:2},previous:{clicks:15},pages:[],articles:[],queries:[],blockers:[]}
]}};
async function setup(data=fixture){const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.setContent('<main id="root" style="height:950px"></main>');await page.addStyleTag({content:css});await page.addScriptTag({content:js});await page.evaluate(f=>{const root=document.querySelector('#root');root.innerHTML=window.SeoOpportunities.markup(f);window.SeoOpportunities.mount(root);},data);return page;}
test('table escapes content, distinguishes missing values from zero, and retains methodology',async()=>{
 const p=await setup();assert.equal(await p.locator('#root script').count(),0);assert.match(await p.locator('.seo-grid').textContent(),/4 → 0/);assert.equal(await p.locator('.seo-row').first().locator('td').nth(1).textContent(),'0');assert.equal(await p.locator('.seo-row').nth(1).locator('td').nth(1).textContent(),'—');await p.locator('[data-notes]').click();assert.match(await p.locator('.seo-detail').textContent(),/Draft snapshot is old/);await p.close();
});
test('combined search and lane filters clear stale details and support empty-state recovery',async()=>{
 const p=await setup();await p.getByRole('searchbox').fill('Bilt');assert.equal(await p.locator('.seo-row').count(),1);await p.locator('[data-seo-lane="GSC lead"]').click();assert.equal(await p.locator('.seo-row').count(),0);assert.equal(await p.locator('#seo-result-count').textContent(),'0 topics');assert.equal(await p.getByText('Nothing selected',{exact:true}).isVisible(),true);await p.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal(await p.locator('.seo-row').count(),3);await p.close();
});
test('article links remain visible and unverified matches remain clearly labeled',async()=>{
 const data=structuredClone(fixture),r=data.details.opportunities[0];r.targets=[{title:'A specific hotel guide',url:'https://www.nextcard.com/articles/test',officeUrl:'https://office.affil.ai/content/articles/test',reason:'This article lost 15 clicks (25 → 10).'}];
 const p=await setup(data);assert.match(await p.locator('.seo-detail').textContent(),/not a confirmed update target/);assert.equal(await p.getByRole('link',{name:'Open in Office'}).isVisible(),true);assert.equal(await p.getByRole('link',{name:'Read article'}).getAttribute('href'),r.targets[0].url);await p.getByRole('searchbox').fill('specific hotel');assert.equal(await p.locator('.seo-row').count(),1);await p.close();
});
test('row selection, evidence tabs and keyboard navigation show the correct query and URL',async()=>{
 const data=structuredClone(fixture);data.details.opportunities[1].exactPages=[{url:'https://nextcard.com/tools/bilt-calculator',impressions:50,position:3}];
 const p=await setup(data);await p.locator('.seo-row').nth(1).locator('td').nth(2).click();assert.equal(await p.locator('.seo-detail h3').textContent(),'Bilt calculator');await p.getByRole('tab',{name:'Pages',exact:true}).click();assert.equal(await p.getByRole('link',{name:'/tools/bilt-calculator'}).isVisible(),true);await p.getByRole('tab',{name:'Pages',exact:true}).press('ArrowRight');assert.equal(await p.getByRole('tab',{name:'Sources'}).getAttribute('aria-selected'),'true');await p.locator('[data-select="1"]').focus();await p.locator('[data-select="1"]').press('ArrowDown');assert.equal(await p.locator('.seo-detail h3').textContent(),'Hotel research');await p.close();
});
test('sorting is numeric, puts unknowns last in both directions, and can restore original order',async()=>{
 const p=await setup();await p.locator('[data-sort="volume"]').click();assert.equal(await p.locator('.seo-row').first().getAttribute('data-index'),'2');assert.equal(await p.locator('.seo-row').last().getAttribute('data-index'),'1');await p.locator('[data-sort="volume"]').click();assert.equal(await p.locator('.seo-row').first().getAttribute('data-index'),'0');assert.equal(await p.locator('.seo-row').last().getAttribute('data-index'),'1');await p.locator('[data-reset-sort]').click();assert.equal(await p.locator('.seo-row').first().getAttribute('data-index'),'0');await p.close();
});
test('older update reports do not invent an identified article',async()=>{const d=structuredClone(fixture);d.details.opportunities[0].lane='Update candidate';const p=await setup(d);assert.equal(await p.getByText('Article not yet confirmed',{exact:true}).isVisible(),true);await p.close();});
test('reviewed work opens first, separates page metrics from research groups and retains completion criteria',async()=>{
 const d=structuredClone(fixture);d.details.workPlan=[{id:'task',title:'Correct an outdated redemption',keyword:'bilt cash',kind:'Maintenance',lane:'Maintenance',workItem:true,status:'Ready',priority:'P1',family:'Bilt',nextStep:'Refresh verified details',whyNow:'A launch happened after this article was updated.',doneWhen:['Verify the current limits'],reviewedAt:'2026-10-26T01:00:00Z',targets:[],queries:[]}];
 d.details.qualityIssues=[{title:'Recent data pending',detail:'An API cooldown blocked the refresh.'}];const p=await setup(d);assert.equal(await p.locator('#seo-result-count').textContent(),'1 tasks');assert.equal(await p.locator('#seo-metric-basis').textContent(),'28-day GSC · target page');assert.match(await p.locator('.seo-detail').textContent(),/Verify the current limits/);assert.match(await p.locator('.seo-detail').textContent(),/Oct 25, 2026/);await p.locator('[data-seo-lane="All"]').click();assert.equal(await p.locator('.seo-row').count(),3);assert.equal(await p.locator('#seo-metric-basis').textContent(),'28-day GSC · group metrics');await p.locator('[data-notes]').first().click();assert.match(await p.locator('.seo-detail').textContent(),/API cooldown/);await p.close();
});
test('a saved ready task expires in the browser without needing a new report',async()=>{
 const d=structuredClone(fixture);d.details.workPlan=[{id:'old',title:'Old review',keyword:'test',kind:'Maintenance',lane:'Maintenance',workItem:true,status:'Ready',priority:'P1',reviewedAt:new Date(Date.now()-30*86400000).toISOString(),targets:[]}];
 const p=await setup(d);assert.match(await p.locator('.seo-row').textContent(),/Review due/);assert.equal(await p.locator('.seo-row .seo-status-ready').count(),0);await p.close();
});
test('monitor report contract and authenticated access remain unchanged',()=>{
 assert.equal(validateExternalReport({monitorId:'seo-content-opportunities',timestamp:'2026-10-25T18:00:00Z',status:'healthy',summary:'Fresh research',details:fixture.details}).monitorId,'seo-content-opportunities');assert.throws(()=>validateExternalReport({monitorId:'arbitrary',timestamp:'2026-10-25',status:'healthy',summary:'Bad'}));
 const app=fs.readFileSync(new URL('../../tools/monitoring/app.js',import.meta.url),'utf8'),backend=fs.readFileSync(new URL('../../convex/monitoring.ts',import.meta.url),'utf8');assert.match(app,/monitoring:detail/);assert.match(backend,/handler: async \(ctx, args\) => \{\s*await requireAuthorizedUser\(ctx\);\s*return monitoringDetail/);
});

function evidenceFixture(){
 const d=structuredClone(fixture),now=new Date().toISOString();
 d.details.workPlan=[{id:'task',workItem:true,title:'Refresh the guide',keyword:'test search',kind:'Maintenance',status:'Ready',priority:'P1',reviewedAt:now,targets:[],doneWhen:['Verify prices']}];
 const article={url:'https://www.nextcard.com/articles/test',title:'Specific dining article',officeUrl:'https://office.affil.ai/content/articles/test',current:{clicks:0,impressions:10},previous:{clicks:4}};
 d.details.evidence={reviewedAt:now,reviewedThrough:'2026-10-23',finalizedThrough:'2026-10-23',periods:{previous:{startDate:'2026-08-29',endDate:'2026-09-25'},current:{startDate:'2026-09-26',endDate:'2026-10-23'}},method:'Signed-out US sample',searchLimit:'Stopped at CAPTCHA',roiDefinition:'Search return, not revenue.',
 cohorts:[{id:'cohort-0',name:'Dining articles',count:1,current:{clicks:0,impressions:10,pagesWithClicks:0,missingPages:0},previous:{clicks:4},rows:[article],relatedWorkIds:['task'],decision:'Keep verified prices current.'}],
 tools:[{id:'tool-0',title:'Example map',url:'https://www.nextcard.com/tools/test',current:null,previous:null,relatedWorkIds:[]}],
 searches:[{id:'search-0',query:'test search <script>bad()</script>',checkedAt:now,url:'https://www.google.com/search?q=test',finding:'A competitor owns navigation intent.',resultLabels:['NerdWallet <img src=x onerror=alert(1)>','nextcard guide'],relatedWorkIds:['task']}]};
 return d;
}
test('performance shows observed zero versus missing, article links, and navigation to related work',async()=>{
 const p=await setup(evidenceFixture());await p.locator('[data-seo-view="performance"]').click();assert.equal(await p.locator('.seo-row').count(),2);
 assert.match(await p.locator('.seo-row').first().textContent(),/4 → 0/);assert.match(await p.locator('.seo-row').last().textContent(),/— → —/);
 assert.equal(await p.getByRole('link',{name:'Specific dining article'}).isVisible(),true);assert.equal(await p.getByRole('link',{name:'Open in Office'}).getAttribute('href'),'https://office.affil.ai/content/articles/test');
 await p.locator('[data-open-work="task"]').click();assert.equal(await p.locator('.seo-detail h3').textContent(),'Refresh the guide');assert.equal(await p.locator('[data-seo-lane="Reviewed work"]').getAttribute('aria-pressed'),'true');
 await p.locator('[data-seo-view="performance"]').click();await p.getByRole('searchbox').fill('missing query');await p.locator('[data-clear]').click();assert.equal(await p.locator('.seo-row').count(),2);assert.equal(await p.locator('[data-seo-view="performance"]').getAttribute('aria-pressed'),'true');await p.close();
});
test('complete search evidence is searchable by competitor, safely rendered, and linked both ways',async()=>{
 const p=await setup(evidenceFixture());await p.locator('[data-open-search="search-0"]').click();assert.equal(await p.locator('[data-seo-view="searches"]').getAttribute('aria-pressed'),'true');
 assert.match(await p.locator('.seo-detail').textContent(),/not a numbered organic rank/);assert.match(await p.locator('.seo-detail').textContent(),/Stopped at CAPTCHA/);assert.equal(await p.locator('#root script,#root img').count(),0);
 await p.getByRole('searchbox').fill('NerdWallet');assert.equal(await p.locator('.seo-row').count(),1);await p.locator('[data-sort="checked"]').click();
 await p.locator('[data-open-work="task"]').click();assert.match(await p.locator('.seo-detail').textContent(),/Verify prices/);assert.equal(await p.getByRole('searchbox').inputValue(),'');await p.close();
});
test('reports without saved evidence do not claim performance or search audit views',async()=>{
 const p=await setup();assert.equal(await p.locator('[data-seo-view]').count(),0);await p.close();
});
