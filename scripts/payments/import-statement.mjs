// Admin-only import of a reviewed JSON + original PDF. Outputs the secret link to a private file.
// node scripts/payments/import-statement.mjs /private/tmp/review.json /path/statement.pdf /private/tmp/result.json
import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ConvexHttpClient} from 'convex/browser';
const [jsonPath,pdfPath,resultPath]=process.argv.slice(2);
if(!jsonPath||!pdfPath||!resultPath)throw Error('Provide reviewed JSON, original PDF, and a private result file path.');
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(!path.relative(repo,path.resolve(resultPath)).startsWith('..'))throw Error('Keep private results outside the public repository.');
const data=JSON.parse(readFileSync(jsonPath,'utf8')),bytes=readFileSync(pdfPath);
if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))||bytes.length>10000000)throw Error('Expected PDF under 10 MB.');
if(createHash('sha256').update(bytes).digest('hex')!==data.fingerprint)throw Error('The PDF does not match the reviewed import.');
const config=JSON.parse(readFileSync(path.join(homedir(),'.convex/config.json'),'utf8'));
const response=await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json','Convex-Client':'npm-cli-1.41.0'},body:JSON.stringify({selectedDeploymentName:'rapid-shark-565',projectSelection:{kind:'teamAndProjectSlugs',teamSlug:'john-ta-af559',projectSlug:'john-ta-projects'}})});
if(!response.ok)throw Error('Could not authorize the Payments deployment.');
const credentials=await response.json();if(credentials.url!=='https://rapid-shark-565.convex.cloud'||!credentials.adminKey)throw Error('Wrong deployment');
const client=new ConvexHttpClient(credentials.url);client.setAdminAuth(credentials.adminKey);
let result=await client.query('statements:existingImport',{fingerprint:data.fingerprint});
if(!result){const uploadUrl=await client.mutation('statements:prepareUpload',{});const upload=await fetch(uploadUrl,{method:'POST',headers:{'Content-Type':'application/pdf'},body:bytes});if(!upload.ok)throw Error('PDF upload failed.');const {storageId}=await upload.json();const token=randomBytes(32).toString('base64url');try{const id=await client.mutation('statements:importStatement',{...data,token,storageId});result={id,token,enabled:true};}catch(error){await client.mutation('statements:discardUpload',{id:storageId});throw error;}}
if(!result.enabled)throw Error('This statement exists but its link was disabled. Do not recreate without reviewing access.');
const url='https://www.john-ta.com/tools/payments/statements/#'+result.token;
writeFileSync(resultPath,JSON.stringify({...result,url},null,2),{mode:0o600});
console.log('Statement imported or already present. Secret review link saved in the private result file.');
