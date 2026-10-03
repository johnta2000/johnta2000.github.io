import { query, mutation, internalMutation } from './_generated/server';
import type { QueryCtx, MutationCtx, ActionCtx } from './_generated/server';
import { v } from 'convex/values';
import { rentConfig, sourcePayment } from './rentTables';
import { calculate, money } from '../tools/rent/math.js';

export async function authorize(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const user = await ctx.auth.getUserIdentity();
  const email = user?.email?.trim().toLowerCase();
  const verified = user?.emailVerified === true || (user?.emailVerified === undefined && user?.issuer === 'https://clerk.john-ta.com');
  if (!user || !verified || !['vivek@affil.ai', 'cyin7890@gmail.com', 'john@affil.ai', 'johnta2018@gmail.com'].includes(email || '')) throw Error('This account is not authorized for Rent.');
  return email!;
}
function monthKey(month: string) { if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Enter a valid month.'); }
function text(value: string, limit = 4000) { if (value.length > limit) throw Error('Note is too long.'); }
function payerKey(payer: number) { if (!Number.isInteger(payer) || payer < 0 || payer > 3) throw Error('Invalid payer.'); }
const find = (ctx: QueryCtx | MutationCtx, month: string) => ctx.db.query('rentMonths').withIndex('by_month', q => q.eq('month', month)).unique();
export const verify = query({ args: {}, handler: async ctx => ({ email: await authorize(ctx) }) });
export const ledger = query({ args: {}, handler: async ctx => {
  await authorize(ctx);
  return { months: await ctx.db.query('rentMonths').collect(), payments: await ctx.db.query('rentPayments').collect() };
} });
const gridRow = v.object({ month: v.string(), config: rentConfig, parkingCents: v.number(), expectedVersion: v.number(), expectedPayments: v.string(), receipts: v.array(v.object({ payer: v.number(), amountCents: v.number() })) });
export const saveGrid = mutation({ args: { rows: v.array(gridRow), requestKey: v.string() }, handler: async (ctx, { rows, requestKey }) => {
  const email = await authorize(ctx); text(requestKey, 100);
  if (!requestKey || !rows.length || rows.length > 24 || new Set(rows.map(r => r.month)).size !== rows.length) throw Error('Choose between 1 and 24 distinct months.');
  // Validate the whole batch before touching any records. Convex commits it atomically.
  const prepared = [];
  for (const row of rows) {
    monthKey(row.month); calculate(row.config, row.parkingCents);
    if (row.receipts.length > 4 || new Set(row.receipts.map(r => r.payer)).size !== row.receipts.length) throw Error('Invalid received totals.');
    for (const receipt of row.receipts) { payerKey(receipt.payer); money(receipt.amountCents); }
    const item = await find(ctx, row.month);
    if (item?.requestKey === requestKey) continue;
    const payments = await ctx.db.query('rentPayments').withIndex('by_month', q => q.eq('month', row.month)).collect();
    const active = payments.filter(p => !p.voidedAt);
    if ((item?.version || 0) !== row.expectedVersion || active.map(p => p._id).sort().join('|') !== row.expectedPayments) throw Error(`This month changed on another device (${row.month}). Your grid was not saved. Reload the sheet before trying again.`);
    prepared.push({ row, item, active });
  }
  const now = Date.now();
  for (const { row, item, active } of prepared) {
    const values = { config: row.config, parkingCents: row.parkingCents, version: (item?.version || 0) + 1, updatedAt: now, updatedBy: email, requestKey };
    if (item) await ctx.db.patch(item._id, values);
    else await ctx.db.insert('rentMonths', { ...values, month: row.month, note: '', requestsSent: false });
    for (const receipt of row.receipts) {
      const previous = active.filter(p => p.payer === receipt.payer);
      if (previous.reduce((sum, p) => sum + p.amountCents, 0) === receipt.amountCents) continue;
      // A cell is the total received for this payer/month, not another payment.
      // Keep superseded receipts in the audit trail rather than deleting them.
      for (const payment of previous) await ctx.db.patch(payment._id, { voidedAt: now, voidedBy: email });
      if (receipt.amountCents > 0) await ctx.db.insert('rentPayments', { month: row.month, payer: receipt.payer, amountCents: receipt.amountCents, date: row.month, note: 'Monthly received total entered in the sheet. Individual receipt date unspecified.', requestKey: `${requestKey}:${row.month}:${receipt.payer}`, createdAt: now, createdBy: email });
    }
  }
  return { saved: prepared.length };
} });
export const dashboard = query({ args: { month: v.string() }, handler: async (ctx, { month }) => {
  await authorize(ctx); monthKey(month);
  const months = await ctx.db.query('rentMonths').collect();
  const item = months.find(m => m.month === month) || null;
  const previous = months.filter(m => m.month < month).sort((a, b) => b.month.localeCompare(a.month))[0];
  return { item, template: previous?.config || null, months: months.map(m => ({ month: m.month, imported: !!m.sourceNote })), payments: item ? await ctx.db.query('rentPayments').withIndex('by_month', q => q.eq('month', month)).collect() : [] };
} });
export const saveMonth = mutation({ args: { month: v.string(), config: rentConfig, parkingCents: v.number(), note: v.string(), requestsSent: v.boolean(), expectedVersion: v.number(), requestKey: v.string() }, handler: async (ctx, args) => {
  const email = await authorize(ctx); monthKey(args.month); text(args.note); text(args.requestKey, 100); calculate(args.config, args.parkingCents);
  const existing = await find(ctx, args.month);
  if (existing?.requestKey === args.requestKey) return existing._id;
  if ((existing?.version || 0) !== args.expectedVersion) throw Error('This month changed on another device. Refresh before saving.');
  const { expectedVersion, ...fields } = args;
  const value = { ...fields, version: expectedVersion + 1, updatedAt: Date.now(), updatedBy: email };
  if (existing) { await ctx.db.patch(existing._id, value); return existing._id; }
  return await ctx.db.insert('rentMonths', value);
} });
export const recordPayment = mutation({ args: { month: v.string(), payer: v.number(), amountCents: v.number(), date: v.string(), note: v.string(), requestKey: v.string(), sourcePayer: v.optional(v.number()) }, handler: async (ctx, args) => {
  const email = await authorize(ctx); monthKey(args.month); payerKey(args.payer); money(args.amountCents); text(args.note); text(args.requestKey, 100);
  if (!args.amountCents) throw Error('Enter an amount greater than zero.');
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(args.date) || !Number.isFinite(Date.parse(args.date)) || new Date(args.date).toISOString().slice(0, 10) !== args.date) throw Error('Enter a valid payment date.');
  const existing = await ctx.db.query('rentPayments').withIndex('by_request', q => q.eq('requestKey', args.requestKey)).unique();
  if (existing) return existing._id;
  const month = await find(ctx, args.month); if (!month) throw Error('Save the month before recording payments.');
  if (args.sourcePayer !== undefined) {
    if (args.sourcePayer !== args.payer || !month.sourcePayments?.some(p => p.payer === args.payer && p.amountCents !== null && p.amountCents > 0)) throw Error('Imported payment not found.');
    const logs = await ctx.db.query('rentPayments').withIndex('by_month', q => q.eq('month', args.month)).collect();
    if (logs.some(p => p.payer === args.payer && p.date === args.month && !p.voidedAt)) throw Error('A monthly total is already recorded for this payer. Adjust the received cell instead of confirming an imported entry again.');
    if (logs.some(p => p.sourcePayer === args.sourcePayer && !p.voidedAt)) throw Error('This imported payment was already confirmed.');
  }
  return await ctx.db.insert('rentPayments', { ...args, createdAt: Date.now(), createdBy: email });
} });
export const voidPayment = mutation({ args: { id: v.id('rentPayments') }, handler: async (ctx, { id }) => {
  const email = await authorize(ctx); const payment = await ctx.db.get(id); if (!payment) throw Error('Payment not found.');
  if (!payment.voidedAt) await ctx.db.patch(id, { voidedAt: Date.now(), voidedBy: email });
} });
// Administrative one-time migration; never exposed to the browser or public API.
export const importWorkbook = internalMutation({ args: { months: v.array(v.object({ month: v.string(), config: rentConfig, parkingCents: v.number(), note: v.string(), requestsSent: v.boolean(), sourceNote: v.string(), sourcePayments: v.array(sourcePayment) })) }, handler: async (ctx, { months }) => {
  for (const m of months) { monthKey(m.month); calculate(m.config, m.parkingCents); text(m.sourceNote); for (const p of m.sourcePayments) { payerKey(p.payer); if (p.amountCents !== null) money(p.amountCents); text(p.note); } }
  let added = 0;
  for (const m of months) { if (await find(ctx, m.month)) continue; await ctx.db.insert('rentMonths', { ...m, version: 1, requestKey: 'workbook:' + m.month, updatedAt: Date.now(), updatedBy: 'Workbook import' }); added++; }
  return { added };
} });
