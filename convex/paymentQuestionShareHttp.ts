import { httpAction } from './_generated/server';
import { anyApi } from 'convex/server';
const origins = ['https://www.john-ta.com', 'https://john-ta.com'];
function headers(request: Request) {
  const origin = request.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0], 'Access-Control-Allow-Headers': 'X-Payment-Share-Token', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
}
export const preflight = httpAction(async (_ctx, request) => new Response(null, { status: 204, headers: headers(request) }));
export const view = httpAction(async (ctx, request) => {
  const h = { ...headers(request), 'Content-Type': 'application/json' };
  try {
    const token = request.headers.get('X-Payment-Share-Token') || '';
    const data = await ctx.runQuery(anyApi.paymentQuestionSharing.review, { token });
    // HTTP actions check the current clock on every request, independently of query caching.
    if (!Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) throw Error('Unavailable');
    return new Response(JSON.stringify({ status: 'success', value: { ...data, serverNow: Date.now() } }), { headers: h });
  } catch { return new Response(JSON.stringify({ status: 'error' }), { status: 404, headers: h }); }
});
export const screenshot = httpAction(async (ctx, request) => {
  const h = headers(request);
  try {
    const token = request.headers.get('X-Payment-Share-Token') || '', id = new URL(request.url).searchParams.get('id');
    if (!id) throw Error('Unavailable');
    const file = await ctx.runQuery(anyApi.paymentQuestionSharing.file, { token, id });
    if (!Number.isFinite(file.expiresAt) || file.expiresAt <= Date.now()) throw Error('Unavailable');
    const blob = await ctx.storage.get(file.storageId);
    if (file.expiresAt <= Date.now() || !blob || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Unavailable');
    return new Response(blob, { headers: { ...h, 'Content-Type': file.type, 'Content-Disposition': 'inline' } });
  } catch { return new Response('This share link has expired or is unavailable.', { status: 404, headers: h }); }
});
