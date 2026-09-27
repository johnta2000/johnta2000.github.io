import { defineTable } from "convex/server";
import { v } from "convex/values";

export const paymentStatus = v.union(v.literal("unchecked"), v.literal("scheduled"), v.literal("paid"), v.literal("nothing_due"));
export const cardPaymentTables = {
  paymentAccounts: defineTable({
    owner: v.string(), person: v.string(), bank: v.string(), nickname: v.string(),
    dueDay: v.number(), startMonth: v.string(), endMonth: v.optional(v.string()), createdAt: v.number(),
  }).index("by_owner", ["owner"]),
  paymentLogs: defineTable({
    owner: v.string(), accountId: v.id("paymentAccounts"), month: v.string(), status: paymentStatus,
    amountCents: v.optional(v.number()), note: v.string(), version: v.number(), updatedAt: v.number(),
  }).index("by_owner_month", ["owner", "month"])
    .index("by_account_month", ["accountId", "month"]),
};
