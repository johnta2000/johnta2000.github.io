import { defineTable } from "convex/server";
import { v } from "convex/values";
export const sharedMetric = v.union(v.literal("durationMinutes"), v.literal("score"), v.literal("efficiency"), v.literal("deepMinutes"), v.literal("remMinutes"), v.literal("consistency"), v.literal("recovery"), v.literal("hrv"), v.literal("restingHeartRate"), v.literal("strain"), v.literal("workoutMinutes"), v.literal("workoutCount"));
export const dailyWhoopFields = { recovery: v.optional(v.number()), hrv: v.optional(v.number()), restingHeartRate: v.optional(v.number()), strain: v.optional(v.number()), workoutMinutes: v.optional(v.number()), workoutCount: v.optional(v.number()) };
export const sleepTables = {
  whoopDays: defineTable({ ownerSubject: v.string(), sleepDate: v.string(), ...dailyWhoopFields, updatedAt: v.number() }).index("by_owner_date", ["ownerSubject", "sleepDate"]),
  sleepNights: defineTable({
    ownerSubject: v.optional(v.string()), sleepDate: v.string(),
    source: v.union(v.literal("whoop"), v.literal("apple_health"), v.literal("eightsleep"), v.literal("manual")),
    score: v.number(), scoreKind: v.union(v.literal("native"), v.literal("derived")),
    durationMinutes: v.optional(v.number()), efficiency: v.optional(v.number()), hrv: v.optional(v.number()), restingHeartRate: v.optional(v.number()),
    consistency: v.optional(v.number()), deepMinutes: v.optional(v.number()), remMinutes: v.optional(v.number()), asleepAt: v.optional(v.string()), wokeAt: v.optional(v.string()),
    importBatchId: v.string(), importedAt: v.number(), updatedAt: v.number(),
  }).index("by_date", ["sleepDate"]).index("by_source_date", ["source", "sleepDate"])
    .index("by_owner_date", ["ownerSubject", "sleepDate"]).index("by_owner_source_date", ["ownerSubject", "source", "sleepDate"]),
  alertnessRatings: defineTable({ ownerSubject: v.optional(v.string()), ratingDate: v.string(), score: v.number(), note: v.optional(v.string()), timezone: v.string(), recordedAt: v.number(), updatedAt: v.number() })
    .index("by_date", ["ratingDate"]).index("by_owner_date", ["ownerSubject", "ratingDate"]),
  sleepProfiles: defineTable({ subject: v.string(), name: v.string(), createdAt: v.number() }).index("by_subject", ["subject"]),
  sleepGroups: defineTable({ name: v.string(), ownerSubject: v.string(), createdAt: v.number(), closedAt: v.optional(v.number()) }).index("by_owner", ["ownerSubject"]),
  sleepMembers: defineTable({ groupId: v.id("sleepGroups"), subject: v.string(), name: v.string(), metrics: v.array(sharedMetric), shareDays: v.number(), joinedAt: v.number() })
    .index("by_group", ["groupId"]).index("by_group_subject", ["groupId", "subject"]).index("by_subject", ["subject"]),
  sleepInvites: defineTable({ groupId: v.id("sleepGroups"), tokenHash: v.string(), label: v.optional(v.string()), acceptedName: v.optional(v.string()), replacedBy: v.optional(v.id("sleepInvites")), createdAt: v.number(), expiresAt: v.number(), usedAt: v.optional(v.number()), revokedAt: v.optional(v.number()) })
    .index("by_hash", ["tokenHash"]).index("by_group", ["groupId"]),
};
