import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const pdpValue = v.object({
  name: v.string(), issuer: v.string(), publisher: v.string(), liveUrl: v.string(),
  mockupUrl: v.string(), emailUrl: v.string(), approvalDate: v.string(),
  approvalVersion: v.string(), pdfPage: v.string(), notes: v.string(),
  exactMatch: v.boolean(), archived: v.boolean(),
});
const record = { key: v.string(), value: pdpValue, version: v.number(), updatedAt: v.number(), updatedBy: v.string() };
export const pdpApprovalTables = {
  pdpApprovals: defineTable(record).index('by_key', ['key']),
  pdpApprovalHistory: defineTable(record).index('by_key_version', ['key', 'version']),
};
