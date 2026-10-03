import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const billFields = {
  statementDate: v.string(), periodStart: v.string(), periodEnd: v.string(), dueDate: v.string(),
  chargesCents: v.number(), previousCents: v.number(), paymentsCents: v.number(), totalCents: v.number(), note: v.string(),
};
export const evidenceEntry = v.object({ date: v.string(), payer: v.number(), amountCents: v.number(), memo: v.string(), status: v.string(), month: v.optional(v.string()), paymentId: v.optional(v.id('rentPayments')), review: v.string() });
export const rentRecordTables = {
  rentProofMarks: defineTable({ fileId:v.id('rentFiles'), paymentId:v.id('rentPayments'), y:v.number(), height:v.number(), removed:v.boolean(), version:v.number(), requestKey:v.string(), createdAt:v.number(), createdBy:v.string() }).index('by_file_payment',['fileId','paymentId']),
  rentFiles: defineTable({ storageId: v.id('_storage'), name: v.string(), type: v.string(), size: v.number(), paymentIds: v.array(v.id('rentPayments')), billId: v.optional(v.id('rentBills')), requestKey: v.string(), createdAt: v.number(), createdBy: v.string(), entries: v.optional(v.array(evidenceEntry)) }).index('by_request', ['requestKey']),
  rentBills: defineTable({ ...billFields, version: v.optional(v.number()), lastEditKey: v.optional(v.string()), updatedAt: v.optional(v.number()), updatedBy: v.optional(v.string()), month: v.string(), requestKey: v.string(), createdAt: v.number(), createdBy: v.string() }).index('by_statement', ['statementDate']).index('by_request', ['requestKey']),
};
