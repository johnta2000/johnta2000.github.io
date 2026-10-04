import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const allocation = v.object({ parents: v.number(), john: v.number(), other: v.number() });
export const statementRow = { date: v.string(), description: v.string(), amountCents: v.number(), kind: v.union(v.literal('purchase'), v.literal('credit'), v.literal('payment'), v.literal('opening'), v.literal('fee'), v.literal('interest')), page: v.number() };
export const statementTables = {
  paymentStatements: defineTable({ owner: v.string(), token: v.string(), enabled: v.boolean(), title: v.string(), period: v.string(), dueDate: v.string(), balanceCents: v.number(), fingerprint: v.string(), storageId: v.id('_storage'), createdAt: v.number() }).index('by_token', ['token']).index('by_owner', ['owner']).index('by_fingerprint', ['fingerprint']),
  paymentStatementRows: defineTable({ statementId: v.id('paymentStatements'), ...statementRow, order: v.number(), allocation: v.optional(allocation), note: v.string(), version: v.number(), updatedAt: v.number() }).index('by_statement', ['statementId']),
};
