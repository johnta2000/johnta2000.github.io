import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  signups: defineTable({
    email: v.string(),
    launchLinkConsent: v.optional(v.object({
      version: v.string(),
      wording: v.string(),
      context: v.string(),
      acceptedAt: v.number(),
    })),
    consentVersion: v.optional(v.string()),
    consentText: v.optional(v.string()),
    consentedAt: v.optional(v.number()),
  }).index("by_email", ["email"]),
});
