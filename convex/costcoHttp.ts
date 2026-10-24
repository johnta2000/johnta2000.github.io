import { httpAction } from './_generated/server';
import { anyApi } from 'convex/server';
const origins = ['https://www.john-ta.com', 'https://john-ta.com'];
function headers(request: Request) {
  const origin = request.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0], 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-File-Name', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'private, no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' };
}
export const preflight = httpAction(async (_ctx, request) => new Response(null, { status: 204, headers: headers(request) }));
export const receipt = httpAction(async (ctx, request) => {
  const h = headers(request);
  try {
    await ctx.runQuery(anyApi.costco.verify, {});
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const file = await ctx.runQuery(anyApi.costco.file, { id: url.searchParams.get('id') });
      const blob = await ctx.storage.get(file.storageId);
      if (!blob) return new Response('Receipt not found.', { status: 404, headers: h });
      return new Response(blob, { headers: { ...h, 'Content-Type': file.type, 'Content-Disposition': 'inline' } });
    }
    const order = url.searchParams.get('order');
    await ctx.runQuery(anyApi.costco.detail, { id: order });
    const type = request.headers.get('Content-Type') || '';
    if (!['image/png','image/jpeg','image/webp'].includes(type)) return new Response('Choose a PNG, JPEG, or WebP image.', { status: 400, headers: h });
    if (Number(request.headers.get('Content-Length')) > 12 * 1024 * 1024) return new Response('Images must be under 12 MB.', { status: 413, headers: h });
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > 12 * 1024 * 1024) return new Response('Images must be under 12 MB.', { status: 413, headers: h });
    const valid = type === 'image/png' ? [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b) : type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
    if (!valid) return new Response('Invalid image.', { status: 400, headers: h });
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2,'0')).join('');
    const storageId = await ctx.storage.store(new Blob([bytes], { type }));
    try {
      const result = await ctx.runMutation(anyApi.costco.recordFile, { order, storageId, type, size: bytes.byteLength, sha256, name: decodeURIComponent(request.headers.get('X-File-Name') || 'Receipt').slice(0,160) });
      if (result.reused) await ctx.storage.delete(storageId);
      return new Response(JSON.stringify(result), { headers: { ...h, 'Content-Type': 'application/json' } });
    } catch (error) { await ctx.storage.delete(storageId); throw error; }
  } catch (error) {
    const denied = /not authorized/i.test(String(error));
    return new Response(denied ? 'Sign in with the authorized account.' : 'Receipt unavailable. Check your file and try again.', { status: denied ? 401 : 400, headers: h });
  }
});
