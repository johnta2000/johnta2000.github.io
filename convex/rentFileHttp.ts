import { httpAction } from './_generated/server';
import { anyApi } from 'convex/server';
import { authorize } from './rent';
const origins=['https://www.john-ta.com','https://john-ta.com'];
function headers(r:Request){const o=r.headers.get('Origin')||'';return {'Access-Control-Allow-Origin':origins.includes(o)?o:origins[0],'Access-Control-Allow-Headers':'Authorization, Content-Type, X-File-Name, X-Request-Key','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};}
export const preflight=httpAction(async(_ctx,r)=>new Response(null,{status:204,headers:headers(r)}));
export const attachment=httpAction(async(ctx,r)=>{const h=headers(r);try{
  const author=await authorize(ctx),url=new URL(r.url);
  if(r.method==='GET'){
    const f=await ctx.runQuery(anyApi.rentRecords.file,{id:url.searchParams.get('id')});const blob=await ctx.storage.get(f.storageId);
    if(!blob)return new Response('File not found.',{status:404,headers:h});
    return new Response(blob,{headers:{...h,'Content-Type':f.type,'Content-Disposition':'inline'}});
  }
  const target={...(url.searchParams.get('paymentId')?{paymentId:url.searchParams.get('paymentId')} : {}),...(url.searchParams.get('billId')?{billId:url.searchParams.get('billId')}: {})};
  await ctx.runQuery(anyApi.rentRecords.destination,target);
  const type=r.headers.get('Content-Type')||'',requestKey=r.headers.get('X-Request-Key')||'';
  if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(type))throw Error('Choose a PNG, JPEG, WebP, or PDF file.');
  if(!requestKey||requestKey.length>100)throw Error('Missing upload identifier.');
  if(Number(r.headers.get('Content-Length'))>15*1024*1024)throw Error('Files must be under 15 MB.');
  const blob=await r.blob();if(!blob.size||blob.size>15*1024*1024)throw Error('Files must be under 15 MB.');
  const bytes=new Uint8Array(await blob.slice(0,12).arrayBuffer());
  const valid=type==='image/png'?[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b):type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='application/pdf'?String.fromCharCode(...bytes.slice(0,5))==='%PDF-':String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!valid)throw Error('File contents do not match the selected format.');
  const storageId=await ctx.storage.store(blob);let id;
  try{id=await ctx.runMutation(anyApi.rentRecords.attach,{...target,storageId,author,type,size:blob.size,requestKey,name:decodeURIComponent(r.headers.get('X-File-Name')||'Attachment').slice(0,160)});}catch(e){await ctx.storage.delete(storageId);throw e;}
  return new Response(JSON.stringify({id}),{headers:{...h,'Content-Type':'application/json'}});
}catch(e){const message=e instanceof Error?e.message:'';return new Response(/not authorized/.test(message)?'This account is not authorized for Rent.':message.match(/(?:Choose a [^\n]*|Files must[^\n]*|File contents[^\n]*|Payment not available\.|Bill not found\.|File not found\.)/)?.[0]||'Could not complete the attachment request. Try again.',{status:/not authorized/.test(message)?403:400,headers:h});}});
