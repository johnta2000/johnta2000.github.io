import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const rentConfig = v.object({
  rentCents: v.number(), loftCents: v.number(), bathroomCents: v.number(),
  people: v.array(v.object({ name: v.string(), room: v.number(), closet: v.number(), creditCents: v.number() })),
});
export const sourcePayment = v.object({ payer: v.number(), amountCents: v.union(v.number(), v.null()), note: v.string() });
export const rentTables = {
  rentMonths: defineTable({ month: v.string(), config: rentConfig, parkingCents: v.number(), note: v.string(), requestsSent: v.boolean(),
    sourceNote: v.optional(v.string()), sourcePayments: v.optional(v.array(sourcePayment)),
    version: v.number(), updatedAt: v.number(), updatedBy: v.string(), requestKey: v.string(),
  }).index('by_month', ['month']),
  rentPayments: defineTable({ month: v.string(), payer: v.number(), amountCents: v.number(), date: v.string(), note: v.string(),
    requestKey: v.string(), createdAt: v.number(), createdBy: v.string(), sourcePayer: v.optional(v.number()),
    voidedAt: v.optional(v.number()), voidedBy: v.optional(v.string()),
  }).index('by_month', ['month']).index('by_request', ['requestKey']),
};
