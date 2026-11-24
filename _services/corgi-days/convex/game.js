import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";

async function account(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in to access your corgi.");
  return identity.tokenIdentifier;
}
function lookup(ctx, owner) {
  return ctx.db.query("saves").withIndex("by_owner", q => q.eq("owner", owner)).unique();
}
export const load = query({
  args: {},
  handler: async ctx => {
    const row = await lookup(ctx, await account(ctx));
    return row ? { revision: row.revision, data: row.data } : { revision: 0, data: null };
  }
});
export const save = mutation({
  args: { revision: v.number(), data: v.string() },
  handler: async (ctx, { revision, data }) => {
    const owner = await account(ctx);
    if (data.length > 150000) throw new Error("Save too large.");
    const parsed = JSON.parse(data);
    if (parsed?.pet?.schema !== 1 || typeof parsed.drafts !== "object" || !parsed.drafts) throw new Error("Invalid save.");
    const row = await lookup(ctx, owner);
    if (row?.data === data) return { revision: row.revision };
    if ((row?.revision ?? 0) !== revision) return { conflict: true };
    const change = { revision: revision + 1, data };
    if (row) await ctx.db.patch(row._id, change);
    else await ctx.db.insert("saves", { owner, ...change });
    return { revision: change.revision };
  }
});
