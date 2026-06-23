import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  warRoomState: defineTable({
    boardId: v.string(),
    completed: v.any(),
    linearLinks: v.any(),
    docLinks: v.any(),
    maintouchLinks: v.optional(v.any()),
    otherLinks: v.optional(v.any()),
    deletedTasks: v.optional(v.any()),
    buckets: v.optional(v.any()),
    updatedAt: v.number(),
  }).index("by_board", ["boardId"]),
  standupEntries: defineTable({
    teamId: v.string(),
    standupDate: v.string(),
    personKey: v.string(),
    personName: v.string(),
    yesterday: v.string(),
    today: v.string(),
    blockers: v.optional(v.string()),
    notes: v.optional(v.string()),
    submittedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_date", ["teamId", "standupDate"])
    .index("by_person_date", ["teamId", "personKey", "standupDate"]),
});
