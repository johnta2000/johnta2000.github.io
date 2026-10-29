import { query, mutation, action, internalQuery, internalMutation } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { v, type Infer } from 'convex/values';
import { anyApi } from 'convex/server';
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
  const owner=await requireOwner(ctx);
  const records = await ctx.db.query('pdpApprovals').take(2001);
  if (records.length > 2000) throw Error('The tracker exceeds its supported size. Contact the site owner.');
  const drafts=await ctx.db.query('pdpApprovalDrafts').withIndex('by_owner_key_device',q=>q.eq('owner',owner)).take(201);
  if(drafts.length>200)throw Error('More than 200 unfinished drafts. Open a draft shortcut to finish your work.');
  return { records: records.map(exposed), drafts:drafts.map(d=>({key:d.key,device:d.device,name:d.value.name,baseVersion:d.baseVersion,updatedAt:d.updatedAt})) };
} });
export const history = query({ args: { key: v.string(), beforeVersion: v.optional(v.number()) }, handler: async (ctx, args) => {
  await requireOwner(ctx); key(args.key);
  const before = args.beforeVersion ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(before) || before < 1) throw Error('Invalid history cursor.');
  const rows = await ctx.db.query('pdpApprovalHistory').withIndex('by_key_version', q => q.eq('key', args.key).lt('version', before)).order('desc').take(51);
  return { records: rows.slice(0, 50).map(exposed), nextBeforeVersion: rows.length > 50 ? rows[49].version : null };
} });
export const save = mutation({ args: { key: v.string(), value: pdpValue, expectedVersion: v.number(), draftDevice:v.optional(v.union(v.literal('desktop'),v.literal('mobile'))), draftVersion:v.optional(v.number()) }, handler: async (ctx, args) => {
  const email = await requireOwner(ctx); key(args.key); validate(args.value);
  if (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion < 0) throw Error('Invalid saved version.');
  const current = await ctx.db.query('pdpApprovals').withIndex('by_key', q => q.eq('key', args.key)).unique();
  if ((current?.version ?? 0) !== args.expectedVersion) throw Error('This PDP changed since you opened it. Download your draft, cancel, then refresh before editing again.');
  if (!current && (await ctx.db.query('pdpApprovals').take(2000)).length >= 2000) throw Error('The tracker is full.');
  const value = current?.value.references && args.value.references === undefined ? {...args.value, references: current.value.references} : args.value;
  for (const device of ['desktop','mobile'] as const) {
    const reference = value.references?.[device];
    if (!reference) continue;
    validate({ ...args.value, ...reference, notes: reference.notes || '' });
    if (reference.fileKey) {
      key(reference.fileKey);
      const file = await ctx.db.query('pdpApprovalFiles').withIndex('by_key', q => q.eq('key', reference.fileKey!)).unique();
      if (!file || file.recordKey !== args.key || file.device !== device) throw Error('This PDF belongs to a different PDP or device.');
    }
  }
  const record = { key: args.key, value, version: args.expectedVersion + 1, updatedAt: Date.now(), updatedBy: email };
  if (current) await ctx.db.patch(current._id, record); else await ctx.db.insert('pdpApprovals', record);
  await ctx.db.insert('pdpApprovalHistory', record);
  if(args.draftDevice && args.draftVersion!==undefined){const draft=await ctx.db.query('pdpApprovalDrafts').withIndex('by_owner_key_device',q=>q.eq('owner',email).eq('key',args.key).eq('device',args.draftDevice!)).unique();if(draft?.version===args.draftVersion)await ctx.db.delete(draft._id);}
  return exposed(record);
} });

// PDF uploads are private: signed upload URLs accept bytes, but no public read URL is returned.
export const uploadUrl = mutation({ args: {}, handler: async ctx => { await requireOwner(ctx); return ctx.storage.generateUploadUrl(); } });
export const registerFile = action({ args: { key: v.string(), recordKey: v.string(), device: v.union(v.literal('desktop'),v.literal('mobile')), storageId: v.id('_storage'), name: v.string() }, handler: async (ctx,args) => {
  await requireOwner(ctx); key(args.key); key(args.recordKey);
  if (!args.name.trim() || args.name.length > 200) throw Error('Use a PDF filename under 200 characters.');
  const blob=await ctx.storage.get(args.storageId);
  if (!blob || blob.size < 5 || blob.size > 20*1024*1024) throw Error('Choose a PDF under 20 MB.');
  if (new TextDecoder().decode(await blob.slice(0,5).arrayBuffer()) !== '%PDF-') throw Error('This file is not a PDF.');
  return ctx.runMutation(anyApi.pdpApprovals.registerFileRecord,{...args,size:blob.size});
} });
export const registerFileRecord = internalMutation({ args: { key:v.string(),recordKey:v.string(),device:v.union(v.literal('desktop'),v.literal('mobile')),storageId:v.id('_storage'),name:v.string(),size:v.number() }, handler:async(ctx,args)=>{
  const email=await requireOwner(ctx);
  const existing=await ctx.db.query('pdpApprovalFiles').withIndex('by_key',q=>q.eq('key',args.key)).unique();
  if(existing){if(existing.recordKey!==args.recordKey||existing.device!==args.device||existing.storageId!==args.storageId)throw Error('This file key already exists.');return {key:existing.key,name:existing.name};}
  await ctx.db.insert('pdpApprovalFiles',{...args,createdAt:Date.now(),createdBy:email});
  return {key:args.key,name:args.name};
} });
export const fileMetadata = internalQuery({args:{key:v.string()},handler:async(ctx,args)=>{
  await requireOwner(ctx);key(args.key);
  const file=await ctx.db.query('pdpApprovalFiles').withIndex('by_key',q=>q.eq('key',args.key)).unique();
  if(!file)throw Error('PDF not found.');return file;
}});

export const draft = query({args:{key:v.string(),device:v.union(v.literal('desktop'),v.literal('mobile'))},handler:async(ctx,args)=>{const owner=await requireOwner(ctx);key(args.key);const row=await ctx.db.query('pdpApprovalDrafts').withIndex('by_owner_key_device',q=>q.eq('owner',owner).eq('key',args.key).eq('device',args.device)).unique();return row?{value:row.value,version:row.version,baseVersion:row.baseVersion,updatedAt:row.updatedAt}:null;}});
export const saveDraft = mutation({args:{key:v.string(),device:v.union(v.literal('desktop'),v.literal('mobile')),value:pdpValue,baseVersion:v.number(),expectedVersion:v.number()},handler:async(ctx,args)=>{
  const owner=await requireOwner(ctx);key(args.key);
  if(JSON.stringify(args.value).length>100000 || !Number.isSafeInteger(args.expectedVersion)||args.expectedVersion<0||!Number.isSafeInteger(args.baseVersion)||args.baseVersion<0)throw Error('Invalid draft.');
  const current=await ctx.db.query('pdpApprovalDrafts').withIndex('by_owner_key_device',q=>q.eq('owner',owner).eq('key',args.key).eq('device',args.device)).unique();
  if((current?.version||0)!==args.expectedVersion)throw Error('This draft changed in another tab. Download your draft before reloading.');
  const record={key:args.key,device:args.device,owner,value:args.value,baseVersion:args.baseVersion,version:args.expectedVersion+1,updatedAt:Date.now()};
  if(current)await ctx.db.patch(current._id,record);else await ctx.db.insert('pdpApprovalDrafts',record);
  return {version:record.version};
}});
