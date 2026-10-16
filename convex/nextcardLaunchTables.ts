import { defineTable } from "convex/server";
import { v } from "convex/values";

export const channelKind = v.union(v.literal("facebook"), v.literal("reddit"), v.literal("outreach"), v.literal("owned"));
export const channelValue = v.object({
  name: v.string(), url: v.string(), kind: channelKind, tags: v.array(v.string()),
  fit: v.string(), rules: v.string(), ruleStatus: v.union(v.literal("unverified"), v.literal("verified")),
  verifiedDate: v.string(), linkPolicy: v.union(v.literal("unknown"), v.literal("allowed"), v.literal("native")),
  approval: v.union(v.literal("unknown"), v.literal("required"), v.literal("none")),
  relationship: v.string(), notes: v.string(), archived: v.boolean(),
});
export const launchValue = v.object({
  name: v.string(), sourceUrl: v.string(), summary: v.string(),
  type: v.union(v.literal("news"), v.literal("targeted"), v.literal("tool"), v.literal("flagship")),
  tags: v.array(v.string()), owner: v.string(), dueDate: v.string(),
  status: v.union(v.literal("active"), v.literal("complete"), v.literal("archived")),
  materials: v.array(v.object({ id: v.string(), name: v.string(), url: v.string() })),
  checks: v.array(v.object({ id: v.string(), stage: v.union(v.literal("prepare"), v.literal("followup")), label: v.string(), done: v.boolean(), owner: v.string() })),
  tasks: v.array(v.object({
    id: v.string(), channelKey: v.string(), channelName: v.string(), channelKind,
    angle: v.string(), draft: v.string(), owner: v.string(), dueDate: v.string(),
    status: v.union(v.literal("draft"), v.literal("ready"), v.literal("submitted"), v.literal("waiting"), v.literal("live"), v.literal("sent"), v.literal("skipped")),
    liveUrl: v.string(), outcome: v.string(), activityAt: v.number(),
  })),
  notes: v.string(),
  hiddenChannelKeys: v.optional(v.array(v.string())),
});
const meta = { key: v.string(), version: v.number(), createdAt: v.number(), updatedAt: v.number(), updatedBy: v.string() };
export const nextcardLaunchTables = {
  nextcardLaunchChannels: defineTable({ ...meta, value: channelValue }).index("by_key", ["key"]),
  nextcardLaunches: defineTable({ ...meta, value: launchValue }).index("by_key", ["key"]),
};
