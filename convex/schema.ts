import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  warRoomState: defineTable({
    boardId: v.string(),
    completed: v.any(),
    linearLinks: v.any(),
    docLinks: v.any(),
    buckets: v.optional(v.any()),
    updatedAt: v.number(),
  }).index("by_board", ["boardId"]),
});
