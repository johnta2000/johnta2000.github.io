import { defineTable } from "convex/server";
import { v } from "convex/values";
export const questionStatus = v.union(v.literal("open"), v.literal("waiting"), v.literal("resolved"));
export const questionFields = {
  title: v.string(), amountCents: v.union(v.number(), v.null()), transactionDate: v.string(),
  cardholder: v.string(), card: v.string(), payer: v.string(), payee: v.string(),
  expectedCents: v.union(v.number(), v.null()), followUp: v.string(), context: v.string(),
};
export const paymentQuestionTables = {
  paymentQuestions: defineTable({
    ...questionFields, owner: v.string(), status: questionStatus, receivedCents: v.number(),
    version: v.number(), createdAt: v.number(), updatedAt: v.number(), createdBy: v.string(), requestKey: v.string(),
  }).index("by_owner", ["owner"]),
  paymentQuestionEvents: defineTable({
    ticketId: v.id("paymentQuestions"), owner: v.string(), kind: v.string(), text: v.string(),
    amountCents: v.optional(v.number()), author: v.string(), createdAt: v.number(), requestKey: v.string(),
  }).index("by_ticket", ["ticketId"]),
  paymentQuestionFiles: defineTable({
    ticketId: v.id("paymentQuestions"), owner: v.string(), storageId: v.id("_storage"),
    name: v.string(), type: v.string(), size: v.number(), createdAt: v.number(), author: v.string(), requestKey: v.string(),
  }).index("by_ticket", ["ticketId"]),
};
