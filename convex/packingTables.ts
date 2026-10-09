import { defineTable } from "convex/server";
import { v } from "convex/values";

const item = v.object({ id: v.string(), label: v.string(), packed: v.boolean() });
const section = v.object({ id: v.string(), name: v.string(), items: v.array(item) });
export const packingState = v.object({
  version: v.literal(1),
  template: v.array(section),
  trips: v.array(v.object({ id: v.string(), name: v.string(), sections: v.array(section) })),
  activeId: v.union(v.string(), v.null()),
});

export const packingTables = {
  packingWorkspaces: defineTable({
    owner: v.string(),
    state: packingState,
    version: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["owner"]),
};
