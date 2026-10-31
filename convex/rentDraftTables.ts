import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const rentDraftTables = {
  rentWorkspaceDrafts: defineTable({owner:v.string(),value:v.string(),version:v.number(),requestKey:v.string(),updatedAt:v.number()}).index('by_owner',['owner']),
};
