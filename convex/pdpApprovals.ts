import { query, mutation } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { v, type Infer } from 'convex/values';
import { pdpValue } from './pdpApprovalTables';

export async function requireOwner(ctx: Pick<QueryCtx, 'auth'>) {
  const user = await ctx.auth.getUserIdentity();
  const email = user?.email?.trim().toLowerCase();
  if (!user?.subject || user.issuer !== 'https://clerk.john-ta.com' ||
    (user.emailVerified !== true && user.emailVerified !== undefined) ||
    !['johnta2018@gmail.com', 'john@affil.ai'].includes(email || '')) {
    throw Error('This account is not authorized for PDP approvals.');
  }
  return email!;
}
function key(value: string) { if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw Error('Invalid record key.'); }
function validate(value: Infer<typeof pdpValue>) {
  for (const field of ['name', 'issuer', 'publisher'] as const) if (!value[field].trim() || value[field].length > 200) throw Error('Add a product name, issuer, and publisher (up to 200 characters).');
  if (!value.liveUrl) throw Error('Add the production page link.');
  for (const field of ['liveUrl', 'mockupUrl', 'emailUrl'] as const) {
    if (!value[field]) continue;
    let url: URL;
    try { url = new URL(value[field]); } catch { throw Error('Use a full HTTPS link.'); }
    if (url.protocol !== 'https:' || url.username || url.password || value[field].length > 4000) throw Error('Use a full HTTPS link without embedded credentials.');
  }
  if (value.approvalVersion.length > 200 || value.notes.length > 10000) throw Error('The version or notes are too long.');
  if (value.pdfPage && (!/^[1-9]\d{0,3}$/.test(value.pdfPage))) throw Error('Use a PDF page number from 1 to 9999.');
  if (value.approvalDate && (!/^\d{4}-\d{2}-\d{2}$/.test(value.approvalDate) || !Number.isFinite(Date.parse(value.approvalDate)) || new Date(value.approvalDate).toISOString().slice(0, 10) !== value.approvalDate || Date.parse(value.approvalDate) > Date.now())) throw Error('Use a valid approval date, no later than today.');
  if (/bank\s*of\s*america|\bbofa\b/i.test(value.issuer) && !value.exactMatch) throw Error('Bank of America requires the 1:1 match flag.');
}
function exposed(r: any) { return { key: r.key, value: r.value, version: r.version, updatedAt: r.updatedAt, updatedBy: r.updatedBy }; }
export const verify = query({ args: {}, handler: async ctx => ({ email: await requireOwner(ctx) }) });
export const workspace = query({ args: {}, handler: async ctx => {
  await requireOwner(ctx);
  const records = await ctx.db.query('pdpApprovals').take(2001);
  if (records.length > 2000) throw Error('The tracker exceeds its supported size. Contact the site owner.');
  return { records: records.map(exposed) };
} });
export const history = query({ args: { key: v.string(), beforeVersion: v.optional(v.number()) }, handler: async (ctx, args) => {
  await requireOwner(ctx); key(args.key);
  const before = args.beforeVersion ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(before) || before < 1) throw Error('Invalid history cursor.');
  const rows = await ctx.db.query('pdpApprovalHistory').withIndex('by_key_version', q => q.eq('key', args.key).lt('version', before)).order('desc').take(51);
  return { records: rows.slice(0, 50).map(exposed), nextBeforeVersion: rows.length > 50 ? rows[49].version : null };
} });
export const save = mutation({ args: { key: v.string(), value: pdpValue, expectedVersion: v.number() }, handler: async (ctx, args) => {
  const email = await requireOwner(ctx); key(args.key); validate(args.value);
  if (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion < 0) throw Error('Invalid saved version.');
  const current = await ctx.db.query('pdpApprovals').withIndex('by_key', q => q.eq('key', args.key)).unique();
  if ((current?.version ?? 0) !== args.expectedVersion) throw Error('This PDP changed since you opened it. Download your draft, cancel, then refresh before editing again.');
  if (!current && (await ctx.db.query('pdpApprovals').take(2000)).length >= 2000) throw Error('The tracker is full.');
  const record = { key: args.key, value: args.value, version: args.expectedVersion + 1, updatedAt: Date.now(), updatedBy: email };
  if (current) await ctx.db.patch(current._id, record); else await ctx.db.insert('pdpApprovals', record);
  await ctx.db.insert('pdpApprovalHistory', record);
  return exposed(record);
} });
