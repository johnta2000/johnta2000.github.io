import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const report=JSON.parse(await fs.readFile(new URL('./reports/dashboard.json',import.meta.url),'utf8'));
const js=await fs.readFile(new URL('../../tools/monitoring/seo.js',import.meta.url),'utf8');
const css=await fs.readFile(new URL('../../tools/monitoring/seo.css',import.meta.url),'utf8');
const shellCss=await fs.readFile(new URL('../../tools/seo/styles.css',import.meta.url),'utf8');
const html=(await fs.readFile(new URL('../../tools/seo/index.html',import.meta.url),'utf8')).replace(/<script\b[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const browser=await chromium.launch({headless:true});
try{for(const [width,height] of [[1440,900],[1280,800],[1920,1080]]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.setContent(html);
  await page.addStyleTag({content:css});await page.addStyleTag({content:shellCss});await page.addScriptTag({content:js});
  await page.evaluate(r=>{const root=document.querySelector('#seo-root');root.innerHTML=window.SeoOpportunities.markup(r,{standalone:true});window.SeoOpportunities.mount(root);document.querySelector('#access-gate').hidden=true;document.querySelector('#app').hidden=false;},report);
  await page.screenshot({path:fileURLToPath(new URL('./.cache/page-preview-'+width+'.png',import.meta.url))});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Viewport overflow at '+width);
  const lane=report.details.opportunities.some(r=>r.lane==='Update candidate')?'Update candidate':'GSC lead';
  await page.locator('[data-seo-lane="'+lane+'"]').click();const count=await page.locator('.seo-row').count();if(!count)throw Error('No review candidates');
  await page.getByRole('tab',{name:'Pages',exact:true}).click();await page.screenshot({path:fileURLToPath(new URL('./.cache/page-expanded-'+width+'.png',import.meta.url))});
  const clipped=await page.evaluate(()=>{const workspace=document.querySelector('.seo-workspace');return workspace.scrollWidth>workspace.clientWidth;});if(clipped)throw Error('Clipped desktop workspace at '+width);
  if(report.details.evidence){
    for(const view of ['performance','searches']){
      await page.locator('[data-seo-view="'+view+'"]').click();
      const expected=view==='performance'?report.details.evidence.cohorts.length+report.details.evidence.tools.length:report.details.evidence.searches.length;
      if(await page.locator('.seo-row').count()!==expected)throw Error('Missing evidence in '+view);
      await page.screenshot({path:fileURLToPath(new URL('./.cache/page-'+view+'-'+width+'.png',import.meta.url))});
      const clipped=await page.evaluate(()=>['.seo-workspace','.seo-detail','.seo-grid-scroll'].some(s=>{const el=document.querySelector(s);return el.scrollWidth>el.clientWidth+1;}));
      if(clipped)throw Error('Clipped '+view+' view at '+width);
    }
  }
  console.log(JSON.stringify({width,height,overflow,lane,visibleCandidates:count,searchChecks:report.details.evidence?.searches.length??0}));await page.close();
}}finally{await browser.close();}
