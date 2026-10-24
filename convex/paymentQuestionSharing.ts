import { query, mutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { questionUser } from './paymentQuestionAuth';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const unavailable = () => Error('This share link has expired or is unavailable.');
async function owned(ctx: any, id: any) {
  const user = await questionUser(ctx), item = await ctx.db.get(id);
  if (!item || item.owner !== user.owner || item.deletedAt !== undefined) throw Error('Question not found.');
  return { user, item };
}
async function shared(ctx: any, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw unavailable();
  const link = await ctx.db.query('paymentQuestionShares').withIndex('by_token', (q: any) => q.eq('token', token)).unique();
  if (!link || link.revokedAt !== undefined || link.expiresAt <= Date.now()) throw unavailable();
  const item = await ctx.db.get(link.ticketId);
  if (!item || item.owner !== link.owner || item.deletedAt !== undefined) throw unavailable();
  return { link, item };
}
export const create = mutation({ args: { id: v.id('paymentQuestions'), token: v.string() }, handler: async (ctx, args) => {
  const { user } = await owned(ctx, args.id);
  if (!/^[A-Za-z0-9_-]{43}$/.test(args.token)) throw Error('Invalid share identifier.');
  const duplicate = await ctx.db.query('paymentQuestionShares').withIndex('by_token', q => q.eq('token', args.token)).unique();
  if (duplicate) {
    if (duplicate.owner !== user.owner || duplicate.ticketId !== args.id) throw Error('Invalid share identifier.');
    if (duplicate.revokedAt !== undefined || duplicate.expiresAt <= Date.now()) throw unavailable();
    return { id: duplicate._id, expiresAt: duplicate.expiresAt };
  }
  const links = await ctx.db.query('paymentQuestionShares').withIndex('by_ticket', q => q.eq('ticketId', args.id)).collect();
  if (links.filter(l => l.revokedAt === undefined && l.expiresAt > Date.now()).length >= 20) throw Error('This question has 20 active links. Disable a link before creating another.');
  const createdAt = Date.now(), expiresAt = createdAt + WEEK;
  const id = await ctx.db.insert('paymentQuestionShares', { owner: user.owner, ticketId: args.id, token: args.token, createdAt, expiresAt });
  return { id, expiresAt };
} });
export const list = query({ args: { id: v.id('paymentQuestions') }, handler: async (ctx, { id }) => {
  await owned(ctx, id);
  const links = await ctx.db.query('paymentQuestionShares').withIndex('by_ticket', q => q.eq('ticketId', id)).collect();
  return links.filter(l => l.revokedAt === undefined && l.expiresAt > Date.now()).sort((a, b) => b.createdAt - a.createdAt).map(({ _id, token, createdAt, expiresAt }) => ({ _id, token, createdAt, expiresAt }));
} });
export const revoke = mutation({ args: { id: v.id('paymentQuestionShares') }, handler: async (ctx, { id }) => {
  const user = await questionUser(ctx), link = await ctx.db.get(id);
  if (!link || link.owner !== user.owner) throw Error('Share link not found.');
  await ctx.db.patch(id, { revokedAt: Date.now() });
} });
export const review = internalQuery({ args: { token: v.string() }, handler: async (ctx, { token }) => {
  const { link, item } = await shared(ctx, token);
  const files = await ctx.db.query('paymentQuestionFiles').withIndex('by_ticket', q => q.eq('ticketId', item._id)).collect();
  // Current note context only. Earlier private edits, owner emails and other questions are not shared.
  return { expiresAt: link.expiresAt, serverNow: Date.now(), item: {
    title: item.title, context: item.context, richText: item.richText, status: item.status, updatedAt: item.updatedAt,
    amountCents: item.amountCents, transactionDate: item.transactionDate, cardholder: item.cardholder, card: item.card,
    payer: item.payer, payee: item.payee, expectedCents: item.expectedCents, receivedCents: item.receivedCents, followUp: item.followUp,
  }, files: files.filter(f => f.owner === link.owner).map(({ _id, name, type }) => ({ _id, name, type })) };
} });
export const file = internalQuery({ args: { token: v.string(), id: v.id('paymentQuestionFiles') }, handler: async (ctx, args) => {
  const { link, item } = await shared(ctx, args.token), file = await ctx.db.get(args.id);
  if (!file || file.ticketId !== item._id || file.owner !== link.owner) throw unavailable();
  return { storageId: file.storageId, type: file.type, expiresAt: link.expiresAt };
} });
