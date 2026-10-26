import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const report=JSON.parse(await fs.readFile(new URL('./reports/dashboard.json',import.meta.url),'utf8'));
const js=await fs.readFile(new URL('../../tools/monitoring/seo.js',import.meta.url),'utf8');
const css=await fs.readFile(new URL('../../tools/monitoring/seo.css',import.meta.url),'utf8');
const shellCss=await fs.readFile(new URL('../../tools/monitoring/styles.css',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true});
try{for(const [width,height] of [[1440,900],[1280,800],[1920,1080]]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.setContent('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><dialog class="monitor-dialog"><div class="dialog-shell"><div class="dialog-heading"><div><p class="eyebrow">Active monitor</p><h2>nextcard SEO opportunities</h2></div><button class="dialog-close" aria-label="Close monitor details">×</button></div><div class="dialog-content" id="root"></div></div></dialog></body></html>');
  await page.addStyleTag({content:shellCss});await page.addStyleTag({content:css});await page.addScriptTag({content:js});
  await page.evaluate(r=>{const root=document.querySelector('#root');root.innerHTML=window.SeoOpportunities.markup(r);window.SeoOpportunities.mount(root);},report);
  await page.evaluate(()=>document.querySelector('dialog').showModal());
  await page.screenshot({path:fileURLToPath(new URL('./.cache/preview-'+width+'.png',import.meta.url))});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Viewport overflow at '+width);
  const lane=report.details.opportunities.some(r=>r.lane==='Update candidate')?'Update candidate':'GSC lead';
  await page.locator('[data-seo-lane="'+lane+'"]').click();const count=await page.locator('.seo-row').count();if(!count)throw Error('No review candidates');
  await page.getByRole('tab',{name:'Pages',exact:true}).click();await page.screenshot({path:fileURLToPath(new URL('./.cache/expanded-'+width+'.png',import.meta.url))});
  const clipped=await page.evaluate(()=>{const workspace=document.querySelector('.seo-workspace');return workspace.scrollWidth>workspace.clientWidth;});if(clipped)throw Error('Clipped desktop workspace at '+width);
  console.log(JSON.stringify({width,height,overflow,lane,visibleCandidates:count}));await page.close();
}}finally{await browser.close();}
