import { httpAction } from './_generated/server';
import { anyApi } from 'convex/server';
import { requireOwner } from './pdpApprovals';
const origins=['https://www.john-ta.com','https://john-ta.com'];
function headers(request:Request){const origin=request.headers.get('Origin')||'';return {'Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};}
export const preflight=httpAction(async(_ctx,req)=>new Response(null,{status:204,headers:headers(req)}));
export const file=httpAction(async(ctx,req)=>{
  const h=headers(req);
  try{
    await requireOwner(ctx);
    const key=new URL(req.url).searchParams.get('key')||'';
    const record=await ctx.runQuery(anyApi.pdpApprovals.fileMetadata,{key});
    const blob=await ctx.storage.get(record.storageId);
    if(!blob)return new Response('PDF not found.',{status:404,headers:h});
    return new Response(blob,{headers:{...h,'Content-Type':'application/pdf','Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(record.name)}});
  }catch(error){const denied=/not authorized/.test(error instanceof Error?error.message:'');return new Response(denied?'Not authorized.':'Could not load this PDF.',{status:denied?403:400,headers:h});}
});
