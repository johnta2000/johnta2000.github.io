import { httpAction, internalAction } from './_generated/server';
import { anyApi } from 'convex/server';
import { gzipSync, gunzipSync } from 'fflate';
import { guideVersion } from './apartmentGuideVersion';
const decode = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), b => b.toString(16).padStart(2, '0')).join('');
function headers(request: Request) {
  const origin = request.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': ['https://www.john-ta.com', 'https://john-ta.com'].includes(origin) ? origin : 'https://www.john-ta.com', 'Access-Control-Allow-Headers': 'Content-Type, X-Apartment-Share-Token', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Expose-Headers': 'X-Apartment-Share-Expires, X-Apartment-Share-Now', 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Type': 'application/json', Vary: 'Origin' };
}
async function prepareGuide(ctx: any, key: string) {
  const keyHash = await hash(key);
  const cached = await ctx.runQuery(anyApi.apartmentSharing.findGuide, {keyHash, version: guideVersion});
  if (cached) return cached.storageId;
  // A new encryption key must decrypt the trusted source successfully before it can issue links.
  const response = await fetch('https://www.john-ta.com/apartmentnavigation/guide.json?v=' + guideVersion, {cache: 'no-store'});
  if (!response.ok) throw Error();
  const payload = await response.json();
  const aes = await crypto.subtle.importKey('raw', decode(key), 'AES-GCM', false, ['decrypt']);
  const ciphertext = decode(payload.ciphertext), tag = decode(payload.tag);
  const encrypted = new Uint8Array(ciphertext.length + tag.length);
  encrypted.set(ciphertext); encrypted.set(tag, ciphertext.length);
  const clear = await crypto.subtle.decrypt({name: 'AES-GCM', iv: decode(payload.iv)}, aes, encrypted);
  const guide = JSON.parse(new TextDecoder().decode(clear));
  const compressedBytes = gzipSync(new TextEncoder().encode(JSON.stringify({guide})));
  const compressed = new Blob([new Uint8Array(compressedBytes).buffer], {type: 'application/gzip'});
  const storageId = await ctx.storage.store(compressed);
  try {
    return await ctx.runMutation(anyApi.apartmentSharing.saveGuide, {keyHash, version: guideVersion, storageId});
  } catch (error) { await ctx.storage.delete(storageId); throw error; }
}
// Warm the private snapshot once on deploy, using an existing valid owner key.
export const warm = internalAction({args: {}, handler: async ctx => {
  const key = await ctx.runQuery(anyApi.apartmentSharing.recentKey, {});
  if (!key) return {ready: false};
  await prepareGuide(ctx, key);
  return {ready: true};
}});
export const endpoint = httpAction(async (ctx, request) => {
  const h = headers(request);
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: h});
  try {
    if (request.method === 'POST') {
      if (Number(request.headers.get('content-length')) > 200) throw Error();
      const body = await request.text();
      if (body.length > 200) throw Error();
      const { key } = JSON.parse(body);
      if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key)) throw Error();
      const guideStorageId = await prepareGuide(ctx, key);
      const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const expiresAt = await ctx.runMutation(anyApi.apartmentSharing.create, { tokenHash: await hash(token), key, guideStorageId });
      return new Response(JSON.stringify({token, expiresAt}), {headers: h});
    }
    const token = request.headers.get('X-Apartment-Share-Token') || '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error();
    const link = await ctx.runQuery(anyApi.apartmentSharing.read, {tokenHash: await hash(token)});
    if (!link || link.expiresAt <= Date.now()) throw Error();
    // Resolve the current guide version for every valid link, including links issued
    // before an update. The original token and expiry remain unchanged.
    const storageId = await prepareGuide(ctx, link.key);
    const blob = await ctx.storage.get(storageId);
    if (!blob || link.expiresAt <= Date.now()) throw Error();
    if (new URL(request.url).searchParams.get('v') === '2') {
      return new Response(blob, {headers: {...h, 'Content-Encoding': 'gzip', 'X-Apartment-Share-Expires': String(link.expiresAt), 'X-Apartment-Share-Now': String(Date.now())}});
    }
    // Compatibility for an older page still open in a browser tab.
    const {guide} = JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(await blob.arrayBuffer()))));
    if (link.expiresAt <= Date.now()) throw Error();
    return new Response(JSON.stringify({guide, expiresAt: link.expiresAt, serverNow: Date.now()}), {headers: h});
  } catch {
    return new Response(JSON.stringify({error: 'This link has expired or is unavailable.'}), {status: 404, headers: h});
  }
});
