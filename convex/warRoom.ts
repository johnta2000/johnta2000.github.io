import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { PRIVATE_LAUNCH_BOARD, requireLaunchUser, requireWarRoomAccess } from "./warRoomAccess";
import { launchSeedBuckets } from "./warRoomLaunchSeed";

export const verify = query({
  args: { boardId: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireLaunchUser(ctx);
    if (args.boardId !== PRIVATE_LAUNCH_BOARD) throw new ConvexError({ code: "FORBIDDEN" });
    return { ...viewer, seedBuckets: launchSeedBuckets };
  },
});

const stateArgs = {
  boardId: v.string(),
  completed: v.any(),
  linearLinks: v.any(),
  docLinks: v.any(),
  maintouchLinks: v.optional(v.any()),
  otherLinks: v.optional(v.any()),
  deletedTasks: v.optional(v.any()),
  buckets: v.optional(v.any()),
};

export const get = query({
  args: { boardId: v.string() },
  handler: async (ctx, args) => {
    await requireWarRoomAccess(ctx, args.boardId);
    return await ctx.db
      .query("warRoomState")
      .withIndex("by_board", (q) => q.eq("boardId", args.boardId))
      .unique();
  },
});

export const save = mutation({
  args: stateArgs,
  handler: async (ctx, args) => {
    await requireWarRoomAccess(ctx, args.boardId);
    const existing = await ctx.db
      .query("warRoomState")
      .withIndex("by_board", (q) => q.eq("boardId", args.boardId))
      .unique();
    const payload = {
      boardId: args.boardId,
      completed: args.completed,
      linearLinks: args.linearLinks,
      docLinks: args.docLinks,
      maintouchLinks: args.maintouchLinks,
      otherLinks: args.otherLinks,
      deletedTasks: args.deletedTasks,
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
