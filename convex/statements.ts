import { query, mutation, internalQuery, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { authorized } from './cardPayments';
import { allocation, statementRow } from './statementTables';

const money = (n: number) => Number.isSafeInteger(n) && Math.abs(n) <= 100000000;
async function access(ctx: QueryCtx | MutationCtx, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('This statement link is unavailable.');
  const statement = await ctx.db.query('paymentStatements').withIndex('by_token', q => q.eq('token', token)).unique();
  if (!statement?.enabled) throw Error('This statement link is unavailable.');
  return statement;
}
export const review = query({ args: { token: v.string() }, handler: async (ctx, { token }) => {
  const s = await access(ctx, token);
  const rows = await ctx.db.query('paymentStatementRows').withIndex('by_statement', q => q.eq('statementId', s._id)).collect();
  return { title: s.title, period: s.period, dueDate: s.dueDate, balanceCents: s.balanceCents, rows: rows.sort((a,b) => a.order-b.order).map(({ statementId, _creationTime, ...r }) => r) };
} });
export const save = mutation({ args: { token: v.string(), id: v.id('paymentStatementRows'), expectedVersion: v.number(), allocation: v.union(allocation, v.null()), note: v.string() }, handler: async (ctx, args) => {
  const s = await access(ctx, args.token), row = await ctx.db.get(args.id);
  if (!row || row.statementId !== s._id) throw Error('Charge not found.');
  if (!Number.isSafeInteger(args.expectedVersion) || row.version !== args.expectedVersion) throw Error('This charge changed on another device. Refresh and review it before saving again.');
  if (args.note.length > 500) throw Error('Keep notes under 500 characters.');
  if (args.allocation) {
    const values = Object.values(args.allocation);
    if (values.some(n => !money(n) || (row.amountCents >= 0 ? n < 0 : n > 0)) || values.reduce((a,b) => a+b,0) !== row.amountCents) throw Error('The split must add up to the charge, with the same sign.');
  }
  await ctx.db.patch(row._id, { allocation: args.allocation ?? undefined, note: args.note.trim(), version: row.version+1, updatedAt: Date.now() });
  return { version: row.version+1 };
} });
export const file = internalQuery({ args: { token: v.string() }, handler: async (ctx,args) => (await access(ctx,args.token)).storageId });
export const list = query({ args: {}, handler: async ctx => {
  const user = await authorized(ctx);
  const statements = await ctx.db.query('paymentStatements').withIndex('by_owner', q => q.eq('owner',user.workspaceOwner)).collect();
  return statements.sort((a,b) => b.createdAt-a.createdAt).map(({ _id, title, period, token, enabled }) => ({ _id, title, period, token, enabled }));
} });
export const revoke = mutation({ args: { id: v.id('paymentStatements') }, handler: async (ctx,{id}) => {
  const user = await authorized(ctx), s = await ctx.db.get(id);
  if (!s || s.owner !== user.workspaceOwner) throw Error('Statement not found.');
  await ctx.db.patch(id,{enabled:false});
} });
// Imports run through the deployment's authenticated administrator API. No public import endpoint.
export const importStatement = internalMutation({ args: { token:v.string(), title:v.string(), period:v.string(), dueDate:v.string(), balanceCents:v.number(), fingerprint:v.string(), storageId:v.id('_storage'), rows:v.array(v.object(statementRow)) }, handler: async (ctx,args) => {
  const owner = process.env.CARD_PAYMENTS_WORKSPACE_OWNER?.trim();
  if (!owner) throw Error('Payments workspace is not configured.');
  if (!/^[A-Za-z0-9_-]{43}$/.test(args.token) || !/^[a-f0-9]{64}$/.test(args.fingerprint)) throw Error('Invalid import identifier.');
  if (!args.title.trim() || args.title.length>100 || args.period.length>100 || !/^20\d{2}-\d{2}-\d{2}$/.test(args.dueDate)) throw Error('Invalid statement details.');
  if (!args.rows.length || args.rows.length>500 || !money(args.balanceCents) || args.rows.some(r => !money(r.amountCents) || !r.description.trim() || r.description.length>1000 || !Number.isSafeInteger(r.page) || r.page<1 || r.page>100 || !/^20\d{2}-\d{2}-\d{2}$/.test(r.date))) throw Error('Invalid transaction data.');
  if (args.rows.reduce((sum,r) => sum+r.amountCents,0) !== args.balanceCents) throw Error('Statement does not reconcile.');
  if (await ctx.db.query('paymentStatements').withIndex('by_fingerprint',q=>q.eq('fingerprint',args.fingerprint)).unique()) throw Error('This statement was already imported.');
  if (await ctx.db.query('paymentStatements').withIndex('by_token',q=>q.eq('token',args.token)).unique()) throw Error('Link already exists.');
  const file = await ctx.db.system.get(args.storageId);
  if (!file || file.contentType !== 'application/pdf' || file.size>10000000) throw Error('A PDF is required.');
  const {rows,...metadata}=args;
  const id=await ctx.db.insert('paymentStatements',{...metadata,owner,enabled:true,createdAt:Date.now()});
  for (const [order,row] of rows.entries()) await ctx.db.insert('paymentStatementRows',{...row,statementId:id,order,note:'',version:0,updatedAt:Date.now()});
  return id;
} });
export const prepareUpload = internalMutation({args:{},handler:async ctx=>ctx.storage.generateUploadUrl()});
export const discardUpload = internalMutation({args:{id:v.id('_storage')},handler:async(ctx,{id})=>ctx.storage.delete(id)});
export const existingImport = internalQuery({args:{fingerprint:v.string()},handler:async(ctx,{fingerprint})=>{
  const s=await ctx.db.query('paymentStatements').withIndex('by_fingerprint',q=>q.eq('fingerprint',fingerprint)).unique();
  return s?{id:s._id,token:s.token,enabled:s.enabled}:null;
}});
