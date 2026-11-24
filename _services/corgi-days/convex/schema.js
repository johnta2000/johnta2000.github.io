import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  saves: defineTable({ owner: v.string(), revision: v.number(), data: v.string() })
    .index("by_owner", ["owner"])
});
