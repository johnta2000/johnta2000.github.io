import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  signups: defineTable({
    email: v.string(),
    consentVersion: v.optional(v.string()),
    consentText: v.optional(v.string()),
    consentedAt: v.optional(v.number()),
  }).index("by_email", ["email"]),
});
