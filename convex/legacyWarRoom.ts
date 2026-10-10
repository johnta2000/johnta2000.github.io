// Compatibility endpoints used only by deployments with the older two-function
// war-room module. Keep their argument validators unchanged when bundling them
// as warRoom.js; all board routing passes through the same access guard.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireWarRoomAccess } from "./warRoomAccess";

export const get = query({
  args: { boardId: v.string() },
  handler: async (ctx, { boardId }) => {
    await requireWarRoomAccess(ctx, boardId);
    return await ctx.db.query("warRoomState").withIndex("by_board", q => q.eq("boardId", boardId)).unique();
  },
});

export const save = mutation({
  args: { boardId: v.string(), completed: v.any(), linearLinks: v.any(), docLinks: v.any(), maintouchLinks: v.optional(v.any()), otherLinks: v.optional(v.any()), deletedTasks: v.optional(v.any()), buckets: v.optional(v.any()) },
  handler: async (ctx, args) => {
    await requireWarRoomAccess(ctx, args.boardId);
    const existing = await ctx.db.query("warRoomState").withIndex("by_board", q => q.eq("boardId", args.boardId)).unique();
    const payload = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("warRoomState", payload);
  },
});
