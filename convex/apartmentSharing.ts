import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

export const create = internalMutation({ args: { tokenHash: v.string(), key: v.string(), guideStorageId: v.optional(v.id('_storage')) }, handler: async (ctx, args) => {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  await ctx.db.insert('apartmentShareLinks', { ...args, expiresAt });
  return expiresAt;
}});
export const read = internalQuery({ args: { tokenHash: v.string() }, handler: async (ctx, args) => {
  const link = await ctx.db.query('apartmentShareLinks').withIndex('by_token', q => q.eq('tokenHash', args.tokenHash)).unique();
  if (!link || link.expiresAt <= Date.now()) return null;
  return { key: link.key, expiresAt: link.expiresAt, guideStorageId: link.guideStorageId };
}});
export const findGuide = internalQuery({ args: { keyHash: v.string(), version: v.string() }, handler: async (ctx, args) => {
  return await ctx.db.query('apartmentShareGuides').withIndex('by_key_version', q => q.eq('keyHash', args.keyHash).eq('version', args.version)).unique();
}});
export const saveGuide = internalMutation({ args: { keyHash: v.string(), version: v.string(), storageId: v.id('_storage') }, handler: async (ctx, args) => {
  const existing = await ctx.db.query('apartmentShareGuides').withIndex('by_key_version', q => q.eq('keyHash', args.keyHash).eq('version', args.version)).unique();
  if (existing) { await ctx.storage.delete(args.storageId); return existing.storageId; }
  await ctx.db.insert('apartmentShareGuides', {...args, createdAt: Date.now()});
  return args.storageId;
}});
// Used only by the authenticated deployment warm-up action; never expose guide keys publicly.
export const recentKey = internalQuery({ args: {}, handler: async ctx => {
  return (await ctx.db.query('apartmentShareLinks').order('desc').first())?.key || null;
}});
