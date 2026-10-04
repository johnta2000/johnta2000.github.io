import { httpAction } from './_generated/server';
import { anyApi } from 'convex/server';
const origins = ['https://www.john-ta.com','https://john-ta.com'];
function headers(request: Request) { const origin=request.headers.get('Origin')||''; return {'Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0], 'Access-Control-Allow-Headers':'Content-Type, X-Statement-Token', 'Access-Control-Allow-Methods':'GET, OPTIONS', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex, nofollow, noarchive', 'X-Content-Type-Options':'nosniff', 'Vary':'Origin'}; }
export const preflight = httpAction(async (_ctx,request)=>new Response(null,{status:204,headers:headers(request)}));
export const pdf = httpAction(async (ctx,request)=>{
  const h=headers(request);
  try {
    const token=request.headers.get('X-Statement-Token')||'';
    const id=await ctx.runQuery(anyApi.statements.file,{token});
    const blob=await ctx.storage.get(id);
    if(!blob) throw Error('Unavailable');
    return new Response(blob,{headers:{...h,'Content-Type':'application/pdf','Content-Disposition':'inline; filename="Bilt-statement.pdf"'}});
  }catch {return new Response('This statement link is unavailable.',{status:404,headers:h});}
});
