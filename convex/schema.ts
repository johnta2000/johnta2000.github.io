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
  standupDayNotes: defineTable({
    teamId: v.string(),
    standupDate: v.string(),
    notes: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_date", ["teamId", "standupDate"]),
  sleepNights: defineTable({
    sleepDate: v.string(),
    source: v.union(v.literal("whoop"), v.literal("apple_health"), v.literal("eightsleep"), v.literal("manual")),
    score: v.number(),
    scoreKind: v.union(v.literal("native"), v.literal("derived")),
    durationMinutes: v.optional(v.number()),
    efficiency: v.optional(v.number()),
    hrv: v.optional(v.number()),
    restingHeartRate: v.optional(v.number()),
    deepMinutes: v.optional(v.number()),
    remMinutes: v.optional(v.number()),
    asleepAt: v.optional(v.string()),
    wokeAt: v.optional(v.string()),
    importBatchId: v.string(),
    importedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_date", ["sleepDate"])
    .index("by_source_date", ["source", "sleepDate"]),
  alertnessRatings: defineTable({
    ratingDate: v.string(),
    score: v.number(),
    note: v.optional(v.string()),
    timezone: v.string(),
    recordedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_date", ["ratingDate"]),
});
