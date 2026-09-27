import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { questionFields, questionStatus } from './paymentQuestionTables';
import { questionUser } from './paymentQuestionAuth';

function text(value: string, max = 100, required = false) {
  const clean = value.trim();
  if (clean.length > max || (required && !clean)) throw Error(`Enter ${required ? '1' : '0'}–${max} characters.`);
  return clean;
}
function money(value: number | null) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 100000000)) throw Error('Enter a valid amount with at most two decimal places.');
  return value;
}
function date(value: string) {
  if (value && (!/^20\d{2}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) throw Error('Enter a valid date.');
  return value;
}
function fields(a: any) {
  return { title: text(a.title, 160, true), amountCents: money(a.amountCents), transactionDate: date(a.transactionDate),
    cardholder: text(a.cardholder), card: text(a.card), payer: text(a.payer), payee: text(a.payee),
    expectedCents: money(a.expectedCents), followUp: date(a.followUp), context: text(a.context, 8000) };
}
async function ticket(ctx: any, id: any, owner: string) {
  const item = await ctx.db.get(id);
  if (!item || item.owner !== owner) throw Error('Question not found.');
  return item;
}
function version(item: any, expected: number) {
  if (item.version !== expected) throw Error('This question changed on another device. Refresh before saving.');
}
export const verify = query({ args: {}, handler: async ctx => questionUser(ctx) });
export const list = query({ args: {}, handler: async ctx => {
  const user = await questionUser(ctx);
  return ctx.db.query('paymentQuestions').withIndex('by_owner', q => q.eq('owner', user.owner)).order('desc').collect();
} });
export const detail = query({ args: { id: v.id('paymentQuestions') }, handler: async (ctx, { id }) => {
  const user = await questionUser(ctx); const item = await ticket(ctx, id, user.owner);
  const events = await ctx.db.query('paymentQuestionEvents').withIndex('by_ticket', q => q.eq('ticketId', id)).collect();
  const files = await ctx.db.query('paymentQuestionFiles').withIndex('by_ticket', q => q.eq('ticketId', id)).collect();
  return { item, events, files: files.map(({ storageId, ...file }) => file) };
} });
export const create = mutation({ args: { ...questionFields, requestKey: v.string() }, handler: async (ctx, args) => {
  const user = await questionUser(ctx); const key = text(args.requestKey, 100, true);
  const existing = await ctx.db.query('paymentQuestions').withIndex('by_owner', q => q.eq('owner', user.owner)).collect();
  const duplicate = existing.find(t => t.requestKey === key); if (duplicate) return duplicate._id;
  if (existing.length >= 2000) throw Error('This inbox supports up to 2,000 questions.');
  return ctx.db.insert('paymentQuestions', { ...fields(args), owner: user.owner, status: 'open', receivedCents: 0, version: 1, createdAt: Date.now(), updatedAt: Date.now(), createdBy: user.email, requestKey: key });
} });
export const edit = mutation({ args: { id: v.id('paymentQuestions'), expectedVersion: v.number(), ...questionFields }, handler: async (ctx, args) => {
  const user = await questionUser(ctx); const item = await ticket(ctx, args.id, user.owner); version(item, args.expectedVersion);
  const next = fields(args);
  const changes = Object.keys(next).filter(k => (next as any)[k] !== item[k]).map(k => `${k}: ${item[k] ?? '—'} → ${(next as any)[k] ?? '—'}`);
  if (!changes.length) return;
  await ctx.db.patch(args.id, { ...next, version: item.version + 1, updatedAt: Date.now() });
  await ctx.db.insert('paymentQuestionEvents', { owner: user.owner, ticketId: args.id, kind: 'edit', text: changes.join('\n'), author: user.email, createdAt: Date.now(), requestKey: `edit-${item.version}` });
} });
export const update = mutation({ args: { id: v.id('paymentQuestions'), expectedVersion: v.number(), requestKey: v.string(), text: v.string(), status: v.optional(questionStatus), amountCents: v.optional(v.number()) }, handler: async (ctx, args) => {
  const user = await questionUser(ctx); const item = await ticket(ctx, args.id, user.owner); const key = text(args.requestKey, 100, true);
  const events = await ctx.db.query('paymentQuestionEvents').withIndex('by_ticket', q => q.eq('ticketId', args.id)).collect();
  if (events.some(e => e.requestKey === key)) return;
  version(item, args.expectedVersion); const note = text(args.text, 8000, true);
  if (args.amountCents !== undefined && (money(args.amountCents) === 0 || args.amountCents < 0)) throw Error('Repayment must be greater than zero.');
  if (events.length >= 500) throw Error('This question has reached its 500-update limit.');
  const received = item.receivedCents + (args.amountCents || 0); money(received);
  await ctx.db.insert('paymentQuestionEvents', { ticketId: args.id, owner: user.owner, kind: args.amountCents !== undefined ? 'payment' : args.status || 'note', text: note, amountCents: args.amountCents, author: user.email, createdAt: Date.now(), requestKey: key });
  await ctx.db.patch(args.id, { status: args.status || item.status, receivedCents: received, updatedAt: Date.now(), version: item.version + 1 });
} });
// These helpers are callable only by server-side actions, never directly by a browser.
export const attach = internalMutation({ args: { id: v.id('paymentQuestions'), owner: v.string(), author: v.string(), storageId: v.id('_storage'), name: v.string(), type: v.string(), size: v.number(), requestKey: v.string() }, handler: async (ctx, args) => {
  await ticket(ctx, args.id, args.owner);
  const files = await ctx.db.query('paymentQuestionFiles').withIndex('by_ticket', q => q.eq('ticketId', args.id)).collect();
  if (files.some(f => f.requestKey === args.requestKey)) { await ctx.storage.delete(args.storageId); return; }
  if (files.length >= 20) throw Error('A question can have up to 20 screenshots.');
  const { id, ...rest } = args;
  await ctx.db.insert('paymentQuestionFiles', { ...rest, name: text(args.name, 160, true), ticketId: id, createdAt: Date.now() });
} });
export const file = query({ args: { id: v.id('paymentQuestionFiles') }, handler: async (ctx, { id }) => {
  const user = await questionUser(ctx); const record = await ctx.db.get(id);
  if (!record || record.owner !== user.owner) throw Error('Screenshot not found.');
  await ticket(ctx, record.ticketId, user.owner); return record;
} });
