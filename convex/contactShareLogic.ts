type Contact = { id: string; first: string; last: string; phone: string };
type Group = { title: string; expiresAt: number; contacts: Contact[] };
const origins = ['https://www.john-ta.com', 'https://john-ta.com'];
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
export function vcard(c: Contact) {
  return ['BEGIN:VCARD', 'VERSION:3.0', `N:${escape(c.last)};${escape(c.first)};;;`,
    `FN:${escape([c.first, c.last].filter(Boolean).join(' '))}`, `TEL;TYPE=CELL:${c.phone}`, 'END:VCARD', ''].join('\r\n');
}
export async function serveContactShare(request: Request, config: string | undefined, now = () => Date.now()) {
  const origin = request.headers.get('Origin') || '';
  const headers: Record<string,string> = {
    'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0],
    'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin',
  };
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers:{...headers,'Content-Type':'application/json'}});
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (request.method !== 'POST') return json({error:'Unavailable'},405);
  try {
    if (Number(request.headers.get('Content-Length')) > 8192) return json({error:'Invalid request'},400);
    const text = await request.text();
    if (text.length > 8192) return json({error:'Invalid request'},400);
    const args = JSON.parse(text);
    if (typeof args.group !== 'string' || !/^[a-f0-9]{32}$/.test(args.group)) return json({error:'Unavailable'},404);
    const groups = JSON.parse(config || '{}');
    const group: Group | undefined = Object.hasOwn(groups,args.group) ? groups[args.group] : undefined;
    if (!group || !Number.isFinite(group.expiresAt) || !Array.isArray(group.contacts)) return json({error:'Unavailable'},404);
    if (now() >= group.expiresAt) return json({error:'This contact link has expired.'},410);
    if (args.action === 'view') return json({title:group.title,expiresAt:group.expiresAt,serverNow:now(),contacts:group.contacts});
    if (args.action !== 'download' || (!Array.isArray(args.ids) && args.ids !== 'all')) return json({error:'Invalid selection'},400);
    const ids = args.ids === 'all' ? group.contacts.map(c=>c.id) : args.ids;
    if (!ids.length || ids.length > group.contacts.length || new Set(ids).size !== ids.length || ids.some((id:unknown)=>typeof id!=='string'||!group.contacts.some(c=>c.id===id))) return json({error:'Invalid selection'},400);
    const cards = group.contacts.filter(c=>ids.includes(c.id));
    if (now() >= group.expiresAt) return json({error:'This contact link has expired.'},410);
    return new Response(cards.map(vcard).join(''), {headers:{...headers,'Content-Type':'text/vcard; charset=utf-8','Content-Disposition':'attachment; filename="decadence-contacts.vcf"'}});
  } catch { return json({error:'Unavailable'},404); }
}
