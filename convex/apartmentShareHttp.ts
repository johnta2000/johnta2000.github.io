import { httpAction } from './_generated/server';
import { anyApi } from 'convex/server';
const decode = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), b => b.toString(16).padStart(2, '0')).join('');
function headers(request: Request) {
  const origin = request.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': ['https://www.john-ta.com', 'https://john-ta.com'].includes(origin) ? origin : 'https://www.john-ta.com', 'Access-Control-Allow-Headers': 'Content-Type, X-Apartment-Share-Token', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Type': 'application/json', Vary: 'Origin' };
}
async function openGuide(key: string) {
  const response = await fetch('https://www.john-ta.com/apartmentnavigation/guide.json', {cache: 'no-store'});
  if (!response.ok) throw Error();
  const payload = await response.json();
  const aes = await crypto.subtle.importKey('raw', decode(key), 'AES-GCM', false, ['decrypt']);
  const ciphertext = decode(payload.ciphertext), tag = decode(payload.tag);
  const encrypted = new Uint8Array(ciphertext.length + tag.length);
  encrypted.set(ciphertext); encrypted.set(tag, ciphertext.length);
  const clear = await crypto.subtle.decrypt({name: 'AES-GCM', iv: decode(payload.iv)}, aes, encrypted);
  return JSON.parse(new TextDecoder().decode(clear));
}
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
      // Prove possession of the guide key before granting permission to issue links.
      await openGuide(key);
      const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const expiresAt = await ctx.runMutation(anyApi.apartmentSharing.create, { tokenHash: await hash(token), key });
      return new Response(JSON.stringify({token, expiresAt}), {headers: h});
    }
    const token = request.headers.get('X-Apartment-Share-Token') || '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error();
    const link = await ctx.runQuery(anyApi.apartmentSharing.read, {tokenHash: await hash(token)});
    if (!link || link.expiresAt <= Date.now()) throw Error();
    const guide = await openGuide(link.key);
    if (link.expiresAt <= Date.now()) throw Error();
    return new Response(JSON.stringify({guide, expiresAt: link.expiresAt, serverNow: Date.now()}), {headers: h});
  } catch {
    return new Response(JSON.stringify({error: 'This link has expired or is unavailable.'}), {status: 404, headers: h});
  }
});
