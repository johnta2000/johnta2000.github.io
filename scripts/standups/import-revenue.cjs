// Import an explicitly supplied private JSON snapshot without committing its data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ConvexHttpClient}=require('convex/browser');
(async()=>{
 const filename=process.argv.find((arg,i)=>i>1&&!arg.startsWith('--'));
 if(!filename)throw Error('Provide a private JSON snapshot file. Use --apply to import it.');
 const snapshot=JSON.parse(fs.readFileSync(filename,'utf8'));
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,date:snapshot.date}));return;}
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.convex/config.json'),'utf8'));
 const response=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':'npm-cli-1.41.0'},body:JSON.stringify({selectedDeploymentName:'rapid-shark-565',projectSelection:{kind:'teamAndProjectSlugs',teamSlug:'john-ta-af559',projectSlug:'john-ta-projects'}})});
 if(!response.ok)throw Error('Could not authorize revenue import.');
 const credentials=await response.json();if(credentials.url!=='https://rapid-shark-565.convex.cloud'||!credentials.adminKey)throw Error('Wrong deployment.');
 const client=new ConvexHttpClient(credentials.url,{logger:false});client.setAdminAuth(credentials.adminKey);
 const result=await client.function('standupRevenue:importSnapshot',undefined,snapshot);
 console.log(JSON.stringify({imported:true,...result}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
