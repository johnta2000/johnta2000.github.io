import fs from 'node:fs/promises';
import {createSign, createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(await fs.readFile(path.join(root,'config.json'),'utf8'));
const dir=path.join(root,'.cache');
await fs.mkdir(dir,{recursive:true,mode:0o700});
const now=new Date(), today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const day=(s,n)=>new Date(Date.parse(s+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const atomic=async(p,j)=>{await fs.writeFile(p+'.tmp',JSON.stringify(j),{mode:0o600});await fs.rename(p+'.tmp',p);};
const read=async p=>{try{return JSON.parse(await fs.readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
// A quota cooldown on the existing monitor applies here as well; do not evade it.
for(const p of [path.join(dir,'cooldown.json'),path.resolve(root,'../../.cache/monitoring/edit-hotels.json')]){
  const state=await read(p);if(state?.cooldownUntil>Date.now())throw Error('Google API quota cooldown is active. Last successful snapshot preserved.');
}
let token;
async function auth(){
  const k=JSON.parse(await fs.readFile(config.keyPath,'utf8')), t=Math.floor(Date.now()/1000);
  const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const unsigned=b({alg:'RS256',typ:'JWT'})+'.'+b({iss:k.client_email,scope:'https://www.googleapis.com/auth/webmasters.readonly',aud:'https://oauth2.googleapis.com/token',iat:t,exp:t+3600});
  const sign=createSign('RSA-SHA256');sign.update(unsigned);sign.end();
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+sign.sign(k.private_key,'base64url')}),signal:AbortSignal.timeout(45000)});
  if(!r.ok)throw Error('Google authentication failed: HTTP '+r.status);
  const j=await r.json();if(!j.access_token)throw Error('Missing Google access token');return j.access_token;
}
async function query(body){
  const payload={type:'web',dataState:'final',...body};
  const key=createHash('sha256').update(config.site+JSON.stringify(payload)).digest('hex');
  const p=path.join(dir,'gsc-'+key+'.json'), cached=await read(p);
  if(cached && Date.now()-Date.parse(cached.fetchedAt)<24*3600000)return cached.response;
  token??=await auth();
  const r=await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(config.site)+'/searchAnalytics/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)});
  if(!r.ok){if(r.status===429)await atomic(path.join(dir,'cooldown.json'),{cooldownUntil:Date.now()+6*3600000});throw Error('GSC request failed: HTTP '+r.status+'. Last successful snapshot preserved.');}
  const j=await r.json();await atomic(p,{fetchedAt:new Date().toISOString(),response:j});return j;
}
async function rows(range,dimensions,byProperty=false){
  const result=[];let capped=false;
  for(let startRow=0;startRow<100000;startRow+=25000){
    const j=await query({...range,dimensions,dimensionFilterGroups:[{filters:[{dimension:'country',operator:'equals',expression:config.country}]}],...(byProperty?{aggregationType:'byProperty'}:{}),rowLimit:25000,startRow});
    result.push(...(j.rows||[]));if((j.rows||[]).length<25000)break;if(startRow===75000)capped=true;
  }
  return {rows:result,capped};
}
const dates=await query({startDate:day(today,-14),endDate:day(today,-1),dimensions:['date'],rowLimit:30});
const end=(dates.rows||[]).map(r=>r.keys[0]).sort().at(-1);if(!end)throw Error('No finalized GSC dates available');
const periods={current:{startDate:day(end,-27),endDate:end},previous:{startDate:day(end,-55),endDate:day(end,-28)}};
const recentPeriods={current:{startDate:day(end,-6),endDate:end},previous:{startDate:day(end,-13),endDate:day(end,-7)}};
const gsc={fetchedAt:now.toISOString(),country:config.country,periods,finalizedThrough:end,notes:['GSC returns disclosed top rows, not all searches. Missing query observations are not zero demand.','Country is US; page/query data and property data have different aggregation.']};
for(const [label,range] of Object.entries(periods)){
  gsc[label]={};
  for(const [name,dims,property] of [['queries',['query'],true],['pages',['page'],false],['queryPages',['query','page'],false]]){
    gsc[label][name]=await rows(range,dims,property);console.log(label,name,gsc[label][name].rows.length);
  }
}
gsc.recent={periods:recentPeriods};
for(const [label,range] of Object.entries(recentPeriods)){
  gsc.recent[label]={};
  for(const [name,dims,property] of [['queries',['query'],true],['pages',['page'],false],['queryPages',['query','page'],false]]){
    gsc.recent[label][name]=await rows(range,dims,property);console.log('recent',label,name,gsc.recent[label][name].rows.length);
  }
}
async function get(url){const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='nextcard-static.s3.us-east-1.amazonaws.com')throw Error('Unexpected inventory host');const r=await fetch(u,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Article inventory HTTP '+r.status);return r.json();}
const pointer=await get(config.inventoryPointer),manifest=await get(pointer.manifestUrl),index=await get(manifest.indexUrl);
if(!Array.isArray(index.articles))throw Error('Invalid article inventory');
const snapshot={gsc,inventory:{fetchedAt:new Date().toISOString(),source:manifest.indexUrl,articles:index.articles}};
await atomic(path.join(dir,'latest.json'),snapshot);
console.log(JSON.stringify({ok:true,finalizedThrough:end,periods,articles:index.articles.length}));
