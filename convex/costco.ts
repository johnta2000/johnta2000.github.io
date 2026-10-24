import { query, mutation, internalMutation } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { v, type Infer } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { costcoOrder } from './costcoTables';

export async function requireCostcoOwner(ctx: Pick<QueryCtx, 'auth'>) {
  const user = await ctx.auth.getUserIdentity();
  // The pinned Clerk email-code flow can omit this claim; explicit false fails.
  if (!user?.subject || user.issuer !== 'https://clerk.john-ta.com' || user.email?.trim().toLowerCase() !== 'johnta2018@gmail.com' || (user.emailVerified !== true && user.emailVerified !== undefined)) throw Error('This account is not authorized for Costco.');
  return 'johnta2018@gmail.com';
}
export function validateOrder(order: Infer<typeof costcoOrder>) {
  if (!order.orderId.trim() || order.orderId.length > 160) throw Error('An order or receipt ID is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(order.date) || !Number.isFinite(Date.parse(order.date)) || new Date(order.date).toISOString().slice(0,10) !== order.date) throw Error('Use a valid order date (YYYY-MM-DD).');
  for (const field of ['totalCents','subtotalCents','taxCents','shippingCents','discountCents'] as const) if (order[field] !== undefined && (!Number.isSafeInteger(order[field]) || Math.abs(order[field]!) > 100000000)) throw Error('Amounts must be integer cents.');
  if (order.kind === 'refund' ? order.totalCents > 0 : order.totalCents < 0) throw Error('Purchases must be positive; refunds must be negative.');
  if (order.items.length > 400) throw Error('Too many items on one receipt.');
  for (const item of order.items) {
    if (!item.name.trim() || item.name.length > 1000 || (item.itemNumber?.length || 0) > 100) throw Error('Invalid item description.');
    if (item.quantity !== undefined && (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 10000)) throw Error('Invalid item quantity.');
    for (const key of ['unitCents','totalCents'] as const) if (item[key] !== undefined && (!Number.isSafeInteger(item[key]) || Math.abs(item[key]!) > 100000000)) throw Error('Item amounts must be integer cents.');
  }
  for (const text of [order.location, order.recipient, order.status]) if ((text?.length || 0) > 500) throw Error('Order details are too long.');
  if ((order.sourceText?.length || 0) > 100000) throw Error('Receipt text is too long.');
}
export const verify = query({ args: {}, handler: async ctx => ({ email: await requireCostcoOwner(ctx) }) });
export const list = query({ args: { paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  const owner = await requireCostcoOwner(ctx);
  const result = await ctx.db.query('costcoOrders').withIndex('by_owner', q => q.eq('owner', owner)).paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 100) });
  return { ...result, page: result.page.map(({ order, ...row }) => { const { sourceText, ...summary } = order; return { ...row, order: summary }; }) };
} });
export const detail = query({ args: { id: v.id('costcoOrders') }, handler: async (ctx, { id }) => {
  const owner = await requireCostcoOwner(ctx), row = await ctx.db.get(id);
  if (!row || row.owner !== owner) throw Error('Order not found.');
  const files = await ctx.db.query('costcoFiles').withIndex('by_order', q => q.eq('order', id)).collect();
  return { ...row, files: files.filter(f => f.owner === owner).map(({ storageId, ...file }) => file) };
} });
export const importOrders = mutation({ args: { orders: v.array(costcoOrder) }, handler: async (ctx, { orders }) => {
  const owner = await requireCostcoOwner(ctx);
  if (!orders.length || orders.length > 50) throw Error('Import between 1 and 50 orders at a time.');
  let imported = 0, skipped = 0;
  const ids = [];
  for (const order of orders) {
    validateOrder(order);
    const key = `${order.channel}:${order.kind}:${order.orderId.trim()}`;
    const existing = await ctx.db.query('costcoOrders').withIndex('by_key', q => q.eq('owner', owner).eq('key', key)).unique();
    if (existing) { skipped++; ids.push(existing._id); continue; }
    ids.push(await ctx.db.insert('costcoOrders', { owner, key, order, importedAt: Date.now(), note: '', version: 0 })); imported++;
  }
  return { imported, skipped, ids };
} });
export const saveNote = mutation({ args: { id: v.id('costcoOrders'), note: v.string(), version: v.number() }, handler: async (ctx, args) => {
  const owner = await requireCostcoOwner(ctx), row = await ctx.db.get(args.id);
  if (!row || row.owner !== owner) throw Error('Order not found.');
  if (row.version !== args.version) throw Error('This note changed on another device. Reopen the order before saving.');
  if (args.note.length > 10000) throw Error('Keep notes under 10,000 characters.');
  await ctx.db.patch(args.id, { note: args.note, version: row.version + 1 });
  return { version: row.version + 1 };
} });
export const file = query({ args: { id: v.id('costcoFiles') }, handler: async (ctx, { id }) => {
  const owner = await requireCostcoOwner(ctx), file = await ctx.db.get(id);
  if (!file || file.owner !== owner) throw Error('Receipt not found.');
  const order = await ctx.db.get(file.order);
  if (!order || order.owner !== owner) throw Error('Receipt not found.');
  return file;
} });
// Only the authenticated file endpoint can register storage objects.
export const recordFile = internalMutation({ args: { order: v.id('costcoOrders'), storageId: v.id('_storage'), name: v.string(), type: v.string(), size: v.number(), sha256: v.string() }, handler: async (ctx, args) => {
  const owner = await requireCostcoOwner(ctx), row = await ctx.db.get(args.order);
  if (!row || row.owner !== owner) throw Error('Order not found.');
  const files = await ctx.db.query('costcoFiles').withIndex('by_order', q => q.eq('order', args.order)).collect();
  const duplicate = files.find(f => f.sha256 === args.sha256);
  if (duplicate) return { id: duplicate._id, reused: true };
  if (files.length >= 30) throw Error('This order already has 30 receipt images.');
  return { id: await ctx.db.insert('costcoFiles', { ...args, owner, createdAt: Date.now() }), reused: false };
} });
