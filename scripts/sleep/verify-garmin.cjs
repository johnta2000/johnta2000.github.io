// Deploys only Garmin connections on top of the current deployed modules.
// Credentials remain in memory; unrelated local backend files are never bundled.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {brotliCompressSync}=require('node:zlib');
const {defineSchema,defineTable}=require('convex/server');
const {v}=require('convex/values');
const esbuild=require('esbuild'),vm=require('node:vm'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const repo=path.resolve(__dirname,'../..');
const apply=process.argv.includes('--apply');
(async()=>{
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const auth=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':'npm-cli-1.41.0'},body:JSON.stringify({selectedDeploymentName:'rapid-shark-565',projectSelection:{kind:'teamAndProjectSlugs',teamSlug:'john-ta-af559',projectSlug:'john-ta-projects'}})});
 if(!auth.ok)throw Error('Could not authorize deployment');
 const credentials=await auth.json();
 if(credentials.url!=='https://rapid-shark-565.convex.cloud'||!credentials.adminKey)throw Error('Wrong deployment');
 const call=async(endpoint,data,compress=false)=>{
  const body=JSON.stringify({...data,adminKey:credentials.adminKey});
  const response=await fetch(credentials.url+endpoint,{method:'POST',headers:{Authorization:`Convex ${credentials.adminKey}`,'Content-Type':'application/json',...(compress?{'Content-Encoding':'br'}:{})},body:compress?brotliCompressSync(body):body});
  if(!response.ok) { const error=await response.json().catch(()=>({}));throw Error(endpoint+' failed '+response.status+': '+String(error.message||error.errorMessage||error.code||'').slice(0,900)); }
  const text=await response.text(); return text ? JSON.parse(text) : null;
 };
 const live=await call('/api/get_config',{version:'1.41.0'});
 const enabled=await call('/api/query',{path:'_system/cli/queryEnvironmentVariables:get',args:{name:'GARMIN_PERSONAL_ENABLED'},format:'json'});
 const key=await call('/api/query',{path:'_system/cli/queryEnvironmentVariables:get',args:{name:'GARMIN_TOKEN_ENCRYPTION_KEY'},format:'json'});
 console.log(JSON.stringify({modules:['garmin.js','garminData.js'].map(name=>({name,present:live.modules.some(m=>m.path===name)})),enabled:enabled.value?.value==='true',encryptionConfigured:!!key.value?.value}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
