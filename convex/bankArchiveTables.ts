import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const bankArchiveTables = {
  bankArchiveAccounts: defineTable({ owner:v.string(), key:v.string(), data:v.any(), importedAt:v.number() }).index('by_owner',['owner']).index('by_key',['owner','key']),
  bankArchiveTransactions: defineTable({ owner:v.string(), accountId:v.id('bankArchiveAccounts'), key:v.string(), data:v.any() }).index('by_account',['accountId']).index('by_key',['accountId','key']),
  bankArchiveStatements: defineTable({ owner:v.string(), accountId:v.id('bankArchiveAccounts'), key:v.string(), data:v.any(), storageId:v.optional(v.id('_storage')) }).index('by_account',['accountId']).index('by_key',['accountId','key']),
};
