// Refresh private production-page captures without changing the source site.
// Run: node scripts/pdp-approvals/capture.mjs --output /absolute/private/folder [--key record-key] [--publish]
// First capture and visually review the PNGs. --publish uploads that folder's manifest.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{ConvexHttpClient}=require('convex/browser'),{chromium}=require('playwright');
const args=process.argv.slice(2),get=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--output')||!get('--output'))throw Error('Provide a private output folder outside the public website checkout.');
const output=resolve(get('--output'));if(output.startsWith(resolve(fileURLToPath(new URL('../../',import.meta.url)))))throw Error('Do not put captures in the public website checkout.');mkdirSync(output,{recursive:true});
const account=JSON.parse(readFileSync(join(homedir(),'.convex/config.json'),'utf8'));
const auth=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:'Bearer '+account.accessToken,'Content-Type':'application/json','Convex-Client':'npm-cli-1.41.0'},body:JSON.stringify({selectedDeploymentName:'rapid-shark-565',projectSelection:{kind:'deploymentName',deploymentName:'rapid-shark-565'}})});
if(!auth.ok)throw Error('Tracker authorization failed.');const credentials=await auth.json();if(credentials.url!=='https://rapid-shark-565.convex.cloud')throw Error('Unexpected tracker deployment.');
const client=new ConvexHttpClient(credentials.url,{logger:false});const identity={subject:'pdp-capture-import',issuer:'https://clerk.john-ta.com',email:'john@affil.ai',emailVerified:true,tokenIdentifier:'https://clerk.john-ta.com|pdp-capture-import'};client.setAdminAuth(credentials.adminKey,identity);
const manifestPath=join(output,'captures.json');const manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):[];
const records=(await client.query('pdpApprovals:workspace',{})).records.filter(r=>!r.value.archived&&(!args.includes('--key')||r.key===get('--key')));
if(args.includes('--publish')){
 for(const item of manifest.filter(i=>records.some(r=>r.key===i.recordKey))){
  const bytes=readFileSync(join(output,item.filename));if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Capture bytes changed since capture.');
  if(item.verified)continue;
  for(let attempt=0;attempt<3;attempt++){try{
  if(!item.storageId){const url=await client.mutation('pdpApprovals:uploadUrl',{});const res=await fetch(url,{method:'POST',headers:{'Content-Type':'image/png'},body:bytes});if(!res.ok)throw Error('Upload failed.');item.storageId=(await res.json()).storageId;writeFileSync(manifestPath,JSON.stringify(manifest,null,2));}
  const {key,recordKey,device,storageId,liveUrl,capturedAt,viewportWidth,viewportHeight}=item;
  await client.action('pdpApprovals:registerCapture',{key,recordKey,device,storageId,liveUrl,capturedAt,viewportWidth,viewportHeight});
  const res=await fetch('https://rapid-shark-565.convex.site/pdp-approval-file?kind=capture&key='+key,{headers:{Authorization:'Convex '+credentials.adminKey+':'+Buffer.from(JSON.stringify(identity)).toString('base64')}});
  if(!res.ok||createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex')!==item.sha256)throw Error('Private capture verification failed.');
  item.verified=true;writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({published:recordKey,device,capturedAt}));break;
  }catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}}
 }
 for(const record of records)for(const device of ['desktop','mobile']){const capture=await client.query('pdpApprovals:capture',{recordKey:record.key,device});if(!capture)throw Error('Missing published capture: '+record.key+' '+device);}
 console.log(JSON.stringify({verifiedRecords:records.length,captures:records.length*2}));
}else{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const queue=records.flatMap(r=>['desktop','mobile'].map(device=>({r,device}))),failures=[];
 try{await Promise.all([0,1].map(async()=>{for(;;){const task=queue.shift();if(!task)return;const {r,device}=task;
  if(manifest.some(i=>i.recordKey===r.key&&i.device===device&&i.liveUrl===r.value.liveUrl)&&!args.includes('--replace'))continue;
  const url=new URL(r.value.liveUrl);if(!['nextcard.com','www.nextcard.com'].includes(url.hostname)||!url.pathname.startsWith('/cards/')||url.protocol!=='https:'||url.username||url.password){failures.push(r.key+': unsupported source');continue;}
  const viewport={width:device==='desktop'?1440:402,height:device==='desktop'?900:874};
  const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:device==='mobile',hasTouch:device==='mobile'});
  try{
   const page=await context.newPage();const cdp=await context.newCDPSession(page);await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   const response=await page.goto(url.href,{waitUntil:'networkidle',timeout:60000});if(!response||response.status()!==200)throw Error('Page did not return HTTP 200');
   const destination=new URL(page.url());if(!['nextcard.com','www.nextcard.com'].includes(destination.hostname)||destination.pathname!==url.pathname)throw Error('Unexpected destination');
   await page.locator('h1').first().waitFor();await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,60));}window.scrollTo(0,0);});
   await page.waitForFunction(()=>{const images=[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width>32&&r.height>32;});return images.length>0&&images.every(i=>i.complete&&i.naturalWidth>0);},null,{timeout:20000});
   const filename=r.key+'-'+device+'.png',capturedAt=Date.now(),bytes=await page.screenshot({path:join(output,filename),fullPage:true,animations:'disabled'});
   const item={key:randomUUID(),recordKey:r.key,device,liveUrl:r.value.liveUrl,finalUrl:page.url(),capturedAt,viewportWidth:viewport.width,viewportHeight:viewport.height,filename,sha256:createHash('sha256').update(bytes).digest('hex')};
   const old=manifest.findIndex(i=>i.recordKey===r.key&&i.device===device);if(old<0)manifest.push(item);else manifest[old]=item;writeFileSync(manifestPath,JSON.stringify(manifest,null,2));console.log(JSON.stringify({captured:r.key,device}));
  }catch(error){failures.push(r.key+' '+device+': '+error.message);console.error(failures.at(-1));}finally{await context.close();}
 }}));}finally{await browser.close();}
 if(failures.length)throw Error(failures.length+' captures failed; successful files retained for retry.');
}
