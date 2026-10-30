import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const inlineField = v.union(...(['name','issuer','publisher','liveUrl','notes','exactMatch','archived','mockupUrl','emailUrl','approvalDate','approvalVersion','pdfPage','referenceNotes','fileKey'] as const).map(field=>v.literal(field)));
export const inlineValue = v.union(v.string(),v.boolean());
export const deviceReference = v.object({
  mockupUrl: v.string(), emailUrl: v.string(), approvalDate: v.string(), approvalVersion: v.string(), pdfPage: v.string(),
  fileKey: v.optional(v.string()), notes: v.optional(v.string()),
});
export const pdpValue = v.object({
  name: v.string(), issuer: v.string(), publisher: v.string(), liveUrl: v.string(),
  mockupUrl: v.string(), emailUrl: v.string(), approvalDate: v.string(),
  approvalVersion: v.string(), pdfPage: v.string(), notes: v.string(),
  exactMatch: v.boolean(), archived: v.boolean(),
  references: v.optional(v.object({ desktop: v.optional(deviceReference), mobile: v.optional(deviceReference) })),
});
const record = { key: v.string(), value: pdpValue, version: v.number(), updatedAt: v.number(), updatedBy: v.string() };
export const pdpApprovalTables = {
  pdpApprovalFieldDrafts: defineTable({owner:v.string(),key:v.string(),device:v.union(v.literal('desktop'),v.literal('mobile')),field:inlineField,value:inlineValue,baseVersion:v.number(),version:v.number(),updatedAt:v.number()}).index('by_owner_key_device_field',['owner','key','device','field']),
  pdpApprovalCaptures: defineTable({ key:v.string(), recordKey:v.string(), device:v.union(v.literal('desktop'),v.literal('mobile')), storageId:v.id('_storage'), liveUrl:v.string(), capturedAt:v.number(), viewportWidth:v.number(), viewportHeight:v.number(), imageHeight:v.number(), name:v.string(), size:v.number(), createdBy:v.string() }).index('by_key',['key']).index('by_record_device_time',['recordKey','device','capturedAt']),
  pdpApprovalDrafts: defineTable({ key:v.string(), device:v.union(v.literal('desktop'),v.literal('mobile')), owner:v.string(), value:pdpValue, baseVersion:v.number(), version:v.number(), updatedAt:v.number() }).index('by_owner_key_device',['owner','key','device']),
  pdpApprovalFiles: defineTable({ key: v.string(), recordKey: v.string(), device: v.union(v.literal('desktop'), v.literal('mobile')), storageId: v.id('_storage'), name: v.string(), size: v.number(), createdAt: v.number(), createdBy: v.string() }).index('by_key',['key']),
  pdpApprovals: defineTable(record).index('by_key', ['key']),
  pdpApprovalHistory: defineTable(record).index('by_key_version', ['key', 'version']),
};
