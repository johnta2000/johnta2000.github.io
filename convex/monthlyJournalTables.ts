import { defineTable } from "convex/server";
import { v } from "convex/values";

export const monthlyJournalTables = {
  monthlyJournalOverviews: defineTable({ person: v.string(), month: v.string(), overview: v.string(), highlights: v.array(v.object({ title: v.string(), text: v.string() })), openLoops: v.array(v.string()), sourceIds: v.array(v.id("standupEntries")), updatedAt: v.number() }).index("by_person_month", ["person", "month"]),
  monthlyJournalSecurity: defineTable({ owner: v.string(), salt: v.string(), hash: v.string(), attempts: v.number(), windowStart: v.number() }).index("by_owner", ["owner"]),
  monthlyJournalSessions: defineTable({ owner: v.string(), tokenHash: v.string(), expiresAt: v.number() }).index("by_token", ["tokenHash"]),
  monthlyJournalEntries: defineTable({ month: v.string(), contentFormat: v.optional(v.union(v.literal("plain"), v.literal("html"))), person: v.optional(v.union(v.literal("vish"), v.literal("jenny"), v.literal("vivek"))), answers: v.array(v.string()), notes: v.string(), followups: v.string(), revision: v.number(), updatedAt: v.number() }).index("by_month", ["month"]).index("by_person_month", ["person", "month"]),
};
