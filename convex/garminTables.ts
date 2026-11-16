import {defineTable} from "convex/server";
import {v} from "convex/values";
export const garminNightFields = {
  sleepDate:v.string(), source:v.literal("garmin"), scoreKind:v.literal("native"), score:v.optional(v.number()),
  durationMinutes:v.optional(v.number()), lightMinutes:v.optional(v.number()), deepMinutes:v.optional(v.number()), remMinutes:v.optional(v.number()),
  workoutMinutes:v.optional(v.number()), workoutCount:v.optional(v.number()),
  hrv:v.optional(v.number()), restingHeartRate:v.optional(v.number()), asleepAt:v.optional(v.string()), wokeAt:v.optional(v.string()),
};
export const garminTables = {
  garminNights:defineTable({...garminNightFields,ownerSubject:v.string(),updatedAt:v.number()}).index("by_owner_date",["ownerSubject","sleepDate"]),
  garminConnections:defineTable({ownerSubject:v.string(),encryptedKey:v.string(),revision:v.string(),lastSyncedAt:v.number(),lastSyncCount:v.number(),lastSyncDays:v.optional(v.number()),activitySyncVersion:v.optional(v.number()),lastSyncComplete:v.optional(v.boolean()),lastWarnings:v.optional(v.array(v.string()))}).index("by_owner",["ownerSubject"]),
};
