import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const costcoOrder = v.object({
  orderId: v.string(), date: v.string(),
  channel: v.union(v.literal('warehouse'), v.literal('online'), v.literal('same-day'), v.literal('gas')),
  kind: v.union(v.literal('purchase'), v.literal('refund')),
  totalCents: v.number(), currency: v.literal('USD'),
  location: v.optional(v.string()), recipient: v.optional(v.string()), status: v.optional(v.string()),
  subtotalCents: v.optional(v.number()), taxCents: v.optional(v.number()),
  shippingCents: v.optional(v.number()), discountCents: v.optional(v.number()),
  items: v.array(v.object({ name: v.string(), itemNumber: v.optional(v.string()), quantity: v.optional(v.number()), unitCents: v.optional(v.number()), totalCents: v.optional(v.number()) })),
  sourceText: v.optional(v.string()),
});
export const costcoTables = {
  costcoOrders: defineTable({ owner: v.string(), key: v.string(), order: costcoOrder, importedAt: v.number(), note: v.string(), version: v.number() }).index('by_owner', ['owner']).index('by_key', ['owner', 'key']),
  costcoFiles: defineTable({ owner: v.string(), order: v.id('costcoOrders'), storageId: v.id('_storage'), name: v.string(), type: v.string(), size: v.number(), sha256: v.string(), createdAt: v.number() }).index('by_order', ['order']),
};
