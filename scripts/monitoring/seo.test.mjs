import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {validateExternalReport} from './report-external.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
const js=fs.readFileSync(new URL('../../tools/monitoring/seo.js',import.meta.url),'utf8');
const fixture={details:{finalizedThrough:'2026-10-23',periodLabel:'Two 28-day periods',articleCount:322,plannerKeywords:2942,totalGroups:2,fragmentRowsExcluded:2,longQueriesExcluded:1,warnings:['Draft snapshot is old'],opportunities:[
  {id:'one',keyword:'cheapest hotels <script>alert(1)</script>',family:'Hotels',lane:'Research gap',volume:0,current:null,previous:null,advantage:'Dated prices',constraint:'Verify taxes',nextStep:'Inspect results',difficulty:'Unreviewed',pages:[],articles:[],queries:[],blockers:['Check drafts']},
  {id:'two',keyword:'Bilt calculator',family:'Bilt',lane:'Tool opportunity',volume:null,current:{clicks:0,impressions:50,position:4},previous:{clicks:4},advantage:'Scenarios',constraint:'Verify rules',nextStep:'Improve tool',difficulty:'Unreviewed',pages:[],articles:[],queries:[],blockers:[]}
]}};
async function setup(){const page=await browser.newPage();await page.setContent('<main id="root"></main>');await page.addScriptTag({content:js});await page.evaluate(f=>{const root=document.querySelector('#root');root.innerHTML=window.SeoOpportunities.markup(f);window.SeoOpportunities.mount(root);},fixture);return page;}
test('private dashboard renderer escapes source text and distinguishes missing metrics from zero',async()=>{const page=await setup();assert.equal(await page.locator('#root script').count(),0);const text=await page.locator('#root').textContent();assert.match(text,/Not observed/);assert.match(text,/4 → 0/);assert.match(text,/Draft snapshot is old/);await page.close();});
test('search and work-type filtering combine and expose an accurate empty state',async()=>{const page=await setup();await page.locator('input').fill('Bilt');assert.equal(await page.locator('.seo-card:visible').count(),1);await page.locator('[data-seo-lane="Research gap"]').click();assert.equal(await page.locator('.seo-card:visible').count(),0);assert.equal(await page.locator('#seo-result-count').textContent(),'0 topic groups shown');await page.locator('[data-seo-lane="All"]').click();assert.equal(await page.locator('.seo-card:visible').count(),1);await page.close();});
test('new monitor reports pass the existing reporter contract; unsupported IDs still fail',()=>{assert.equal(validateExternalReport({monitorId:'seo-content-opportunities',timestamp:'2026-10-25T18:00:00Z',status:'healthy',summary:'Fresh research',details:fixture.details}).monitorId,'seo-content-opportunities');assert.throws(()=>validateExternalReport({monitorId:'arbitrary',timestamp:'2026-10-25',status:'healthy',summary:'Bad'}));});
test('SEO interface is loaded inside the existing authenticated dashboard only',()=>{const app=fs.readFileSync(new URL('../../tools/monitoring/app.js',import.meta.url),'utf8');const backend=fs.readFileSync(new URL('../../convex/monitoring.ts',import.meta.url),'utf8');assert.match(app,/monitoring:detail/);assert.match(backend,/handler: async \(ctx, args\) => \{\s*await requireAuthorizedUser\(ctx\);\s*return monitoringDetail/);assert.match(backend,/value\.monitorId === "seo-content-opportunities" \? 200_000 : 50_000/);});
