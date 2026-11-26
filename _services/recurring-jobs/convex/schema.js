import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const job = v.object({
  id: v.string(), name: v.string(), schedule: v.string(),
  status: v.union(v.literal("ACTIVE"), v.literal("PAUSED")),
  thread: v.optional(v.string()),
});

export default defineSchema({
  inventory: defineTable({ jobs: v.array(job), checkedAt: v.number() }),
});
