import { defineTable } from "convex/server";
import { v } from "convex/values";

export const paymentStatus = v.union(v.literal("unchecked"), v.literal("scheduled"), v.literal("paid"), v.literal("nothing_due"));
export const cardPaymentTables = {
  paymentFiles: defineTable({
    owner: v.string(), accountId: v.id("paymentAccounts"), month: v.string(), storageId: v.id("_storage"),
    name: v.string(), type: v.string(), size: v.number(), requestKey: v.string(), createdAt: v.number(),
  }).index("by_account_month", ["accountId", "month"]).index("by_owner_month", ["owner", "month"]),
  paymentAccounts: defineTable({
    owner: v.string(), person: v.string(), bank: v.string(), nickname: v.string(),
    category: v.optional(v.union(v.literal("card"), v.literal("housing"))),
    dueDay: v.number(), startMonth: v.string(), endMonth: v.optional(v.string()), createdAt: v.number(),
  }).index("by_owner", ["owner"]),
  paymentLogs: defineTable({
    owner: v.string(), accountId: v.id("paymentAccounts"), month: v.string(), status: paymentStatus,
    flagged: v.optional(v.boolean()), amountCents: v.optional(v.number()), note: v.string(), version: v.number(), updatedAt: v.number(),
  }).index("by_owner_month", ["owner", "month"])
    .index("by_account_month", ["accountId", "month"]),
};
