import { defineTable } from "convex/server";
import { v } from "convex/values";

export const customization = v.object({ id: v.string(), amount: v.union(v.literal("regular"),v.literal("light"),v.literal("extra"),v.literal("double_extra"),v.literal("no")) });
export const burgerItem = v.object({ label:v.string(), quantity:v.number(), pattiesEach:v.number(), cheeseEach:v.union(v.number(),v.null()), customizations:v.array(customization) });

export const receiptItem = v.object({
  label: v.string(), category: v.union(v.literal("burger"), v.literal("fries"), v.literal("drink"), v.literal("other")),
  quantity: v.number(), pattiesEach: v.union(v.number(), v.null()), cheeseEach: v.union(v.number(), v.null()),
  lineTotalCents: v.union(v.number(), v.null()), modifiers: v.array(v.string()), person: v.string(),
  customizations: v.optional(v.array(customization)),
});
export const receiptDraft = v.object({
  merchant: v.string(), location: v.string(), purchasedAt: v.string(), currency: v.string(),
  subtotalCents: v.union(v.number(), v.null()), taxCents: v.union(v.number(), v.null()), totalCents: v.union(v.number(), v.null()),
  items: v.array(receiptItem), warnings: v.array(v.string()), confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
});
export const burgeryTables = {
  burgeryTrips: defineTable({ key: v.string(), name: v.string(), month: v.string(), location: v.string(), createdAt: v.number() }).index("by_key", ["key"]),
  burgeryEntries: defineTable({
    tripId: v.id("burgeryTrips"), person: v.string(), personKey: v.string(), patties: v.number(), burgers: v.optional(v.number()), cheese: v.optional(v.number()),
    log: v.string(), source: v.union(v.literal("legacy"), v.literal("manual"), v.literal("receipt")),
    items: v.optional(v.array(burgerItem)),
    owner: v.string(), requestKey: v.string(), receiptId: v.optional(v.id("burgeryReceipts")), createdAt: v.number(),
  }).index("by_trip", ["tripId"]).index("by_owner_created", ["owner", "createdAt"]).index("by_request", ["owner", "requestKey"]),
  burgeryReceipts: defineTable({
    owner: v.string(), tripId: v.id("burgeryTrips"), targetEntryId: v.optional(v.id("burgeryEntries")),
    storageId: v.id("_storage"), name: v.string(), type: v.string(), size: v.number(), sha256: v.string(), requestKey: v.string(),
    status: v.union(v.literal("queued"), v.literal("scanning"), v.literal("review"), v.literal("failed"), v.literal("confirmed"), v.literal("discarded")),
    scan: v.optional(receiptDraft), reviewed: v.optional(receiptDraft), error: v.optional(v.string()),
    model: v.optional(v.string()), responseId: v.optional(v.string()), attempts: v.number(), createdAt: v.number(), updatedAt: v.number(), confirmedAt: v.optional(v.number()),
  }).index("by_owner_created", ["owner", "createdAt"]).index("by_hash", ["sha256"]).index("by_request", ["owner", "requestKey"]),
};
