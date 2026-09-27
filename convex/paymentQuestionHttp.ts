import { httpAction } from './_generated/server';
import { anyApi } from 'convex/server';
import { questionUser } from './paymentQuestionAuth';
const origins = ['https://www.john-ta.com', 'https://john-ta.com'];
function headers(request: Request) {
  const origin = request.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0], 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-File-Name, X-Request-Key', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
}
export const preflight = httpAction(async (_ctx, request) => new Response(null, { status: 204, headers: headers(request) }));
export const attachment = httpAction(async (ctx, request) => {
  const h = headers(request);
  try {
    const user = await questionUser(ctx);
    const url = new URL(request.url()); const id = url.searchParams.get('id');
    if (!id) return new Response('Missing question or screenshot.', { status: 400, headers: h });
    if (request.method === 'GET') {
      const file = await ctx.runQuery(anyApi.paymentQuestions.file, { id });
      const blob = await ctx.storage.get(file.storageId);
      if (!blob) return new Response('Screenshot not found.', { status: 404, headers: h });
      return new Response(blob, { headers: { ...h, 'Content-Type': file.type, 'Content-Disposition': 'inline' } });
    }
    // Authenticate and verify the destination before accepting the image bytes.
    await ctx.runQuery(anyApi.paymentQuestions.detail, { id });
    const type = request.headers.get('Content-Type') || '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) return new Response('Choose a PNG, JPEG, or WebP screenshot.', { status: 400, headers: h });
    const blob = await request.blob();
    if (!blob.size || blob.size > 8 * 1024 * 1024) return new Response('Screenshots must be under 8 MB.', { status: 400, headers: h });
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const valid = type === 'image/png' ? [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b) : type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
    if (!valid) return new Response('This file is not a supported image.', { status: 400, headers: h });
    const requestKey = request.headers.get('X-Request-Key') || '';
    if (!requestKey || requestKey.length > 100) return new Response('Missing upload identifier.', { status: 400, headers: h });
    const storageId = await ctx.storage.store(blob);
    try {
      await ctx.runMutation(anyApi.paymentQuestions.attach, { id, owner: user.owner, author: user.email, storageId, name: decodeURIComponent(request.headers.get('X-File-Name') || 'Screenshot').slice(0,160), type, size: blob.size, requestKey });
    } catch (error) { await ctx.storage.delete(storageId); throw error; }
    return new Response('{}', { headers: { ...h, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const allowed = message.match(/(?:This account is not authorized[^\n]*|Question not found\.|Screenshot not found\.|A question can have up to 20 screenshots\.)/);
    return new Response(allowed?.[0] || 'Could not complete the screenshot request. Try again.', { status: /not authorized/.test(message) ? 403 : 400, headers: h });
  }
});
