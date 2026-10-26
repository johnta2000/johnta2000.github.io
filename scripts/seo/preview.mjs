import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const report=JSON.parse(await fs.readFile(new URL('./reports/dashboard.json',import.meta.url),'utf8'));
const js=await fs.readFile(new URL('../../tools/monitoring/seo.js',import.meta.url),'utf8');
const css=await fs.readFile(new URL('../../tools/monitoring/seo.css',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true});
try{for(const width of [1200,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.setContent('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:system-ui;margin:0;background:#fafbf9"><main style="max-width:1040px;margin:auto;padding:16px" id="root"></main></body></html>');
  await page.addStyleTag({content:css});await page.addScriptTag({content:js});
  await page.evaluate(r=>{const root=document.querySelector('#root');root.innerHTML=window.SeoOpportunities.markup(r);window.SeoOpportunities.mount(root);},report);
  await page.screenshot({path:fileURLToPath(new URL('./.cache/preview-'+width+'.png',import.meta.url))});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Viewport overflow at '+width);
  await page.locator('[data-seo-lane="Update candidate"]').click();const count=await page.locator('.seo-card:visible').count();if(!count)throw Error('No update candidates');
  await page.locator('.seo-card:visible summary').first().click();await page.screenshot({path:fileURLToPath(new URL('./.cache/expanded-'+width+'.png',import.meta.url))});
  console.log(JSON.stringify({width,overflow,visibleUpdates:count}));await page.close();
}}finally{await browser.close();}
