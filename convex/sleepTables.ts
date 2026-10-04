import { defineTable } from "convex/server";
import { v } from "convex/values";
export const sharedMetric = v.union(v.literal("durationMinutes"), v.literal("score"), v.literal("efficiency"));
export const sleepTables = {
  sleepNights: defineTable({
    ownerSubject: v.optional(v.string()), sleepDate: v.string(),
    source: v.union(v.literal("whoop"), v.literal("apple_health"), v.literal("eightsleep"), v.literal("manual")),
    score: v.number(), scoreKind: v.union(v.literal("native"), v.literal("derived")),
    durationMinutes: v.optional(v.number()), efficiency: v.optional(v.number()), hrv: v.optional(v.number()), restingHeartRate: v.optional(v.number()),
    deepMinutes: v.optional(v.number()), remMinutes: v.optional(v.number()), asleepAt: v.optional(v.string()), wokeAt: v.optional(v.string()),
    importBatchId: v.string(), importedAt: v.number(), updatedAt: v.number(),
  }).index("by_date", ["sleepDate"]).index("by_source_date", ["source", "sleepDate"])
    .index("by_owner_date", ["ownerSubject", "sleepDate"]).index("by_owner_source_date", ["ownerSubject", "source", "sleepDate"]),
  alertnessRatings: defineTable({ ownerSubject: v.optional(v.string()), ratingDate: v.string(), score: v.number(), note: v.optional(v.string()), timezone: v.string(), recordedAt: v.number(), updatedAt: v.number() })
    .index("by_date", ["ratingDate"]).index("by_owner_date", ["ownerSubject", "ratingDate"]),
  sleepProfiles: defineTable({ subject: v.string(), name: v.string(), createdAt: v.number() }).index("by_subject", ["subject"]),
  sleepGroups: defineTable({ name: v.string(), ownerSubject: v.string(), createdAt: v.number(), closedAt: v.optional(v.number()) }).index("by_owner", ["ownerSubject"]),
  sleepMembers: defineTable({ groupId: v.id("sleepGroups"), subject: v.string(), name: v.string(), metrics: v.array(sharedMetric), shareDays: v.number(), joinedAt: v.number() })
    .index("by_group", ["groupId"]).index("by_group_subject", ["groupId", "subject"]).index("by_subject", ["subject"]),
  sleepInvites: defineTable({ groupId: v.id("sleepGroups"), tokenHash: v.string(), createdAt: v.number(), expiresAt: v.number(), usedAt: v.optional(v.number()), revokedAt: v.optional(v.number()) })
    .index("by_hash", ["tokenHash"]).index("by_group", ["groupId"]),
};
