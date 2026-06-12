import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const stateArgs = {
  boardId: v.string(),
  completed: v.any(),
  linearLinks: v.any(),
  docLinks: v.any(),
  buckets: v.optional(v.any()),
};

export const get = query({
  args: { boardId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("warRoomState")
      .withIndex("by_board", (q) => q.eq("boardId", args.boardId))
      .unique();
  },
});

export const save = mutation({
  args: stateArgs,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("warRoomState")
      .withIndex("by_board", (q) => q.eq("boardId", args.boardId))
      .unique();
    const payload = {
      boardId: args.boardId,
      completed: args.completed,
      linearLinks: args.linearLinks,
      docLinks: args.docLinks,
      buckets: args.buckets,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("warRoomState", payload);
  },
});
