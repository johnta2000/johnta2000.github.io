import { defineTable } from "convex/server";
import { v } from "convex/values";
export const revenueNumber = v.union(v.number(), v.null());
export const revenueValues = v.object({
  compliance: revenueNumber, chase: revenueNumber, bofa: revenueNumber,
  bofaMonthly: revenueNumber, bilt: revenueNumber, nextcard: revenueNumber,
  chaseCount: revenueNumber, bofaCount: revenueNumber, biltCount: revenueNumber, nextcardSubscriptions: revenueNumber,
});
export const standupRevenueTables = {
  standupRevenueSnapshots: defineTable({teamId:v.string(),date:v.string(),month:v.string(),values:revenueValues,totalCents:v.number(),version:v.number(),updatedAt:v.number(),updatedBy:v.string()})
    .index("by_date",["teamId","date"]).index("by_month",["teamId","month","date"]),
  standupRevenueTargets: defineTable({teamId:v.string(),month:v.string(),targetCents:revenueNumber,version:v.number(),updatedAt:v.number()}).index("by_month",["teamId","month"]),
  standupRevenueDrafts: defineTable({teamId:v.string(),date:v.string(),owner:v.string(),values:revenueValues,targetCents:revenueNumber,baseVersion:revenueNumber,baseTargetVersion:revenueNumber,version:v.number(),updatedAt:v.number()}).index("by_owner_date",["teamId","owner","date"]),
};
