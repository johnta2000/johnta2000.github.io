import {defineTable} from 'convex/server';
import {v} from 'convex/values';
export const rallyCollectionTables = {
  rallyCollections: defineTable({
    ownerToken:v.string(), entryId:v.string(), sourceEventId:v.optional(v.string()),
    rave:v.any(), createdAt:v.number(), updatedAt:v.number(),
  }).index('by_owner',['ownerToken']).index('by_owner_entry',['ownerToken','entryId']).index('by_owner_event',['ownerToken','sourceEventId']),
};
