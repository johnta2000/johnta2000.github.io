import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorized } from "./cardPayments";
function scheduled(month: string) {
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(month) && month >= "2026-11" && month <= "2027-10";
}
export const get = query({ args: { month: v.string() }, handler: async (ctx, args) => {
  const user = await authorized(ctx);
  if (!scheduled(args.month)) return null;
  return await ctx.db.query("paymentCheckins").withIndex("by_owner_month", q => q.eq("owner", user.workspaceOwner).eq("month", args.month)).unique();
} });
export const save = mutation({ args: { month: v.string(), checked: v.boolean(), expectedVersion: v.number() }, handler: async (ctx, args) => {
  const user = await authorized(ctx);
  if (!scheduled(args.month)) throw Error("Choose a valid month from November 2026 through October 2027.");
  const old = await ctx.db.query("paymentCheckins").withIndex("by_owner_month", q => q.eq("owner", user.workspaceOwner).eq("month", args.month)).unique();
  if (args.expectedVersion !== (old?.version || 0)) throw Error("This entry changed on another device. Refresh and review it before saving again.");
  const record = { owner: user.workspaceOwner, month: args.month, checked: args.checked, version: (old?.version || 0) + 1, updatedAt: Date.now() };
  if (old) await ctx.db.patch(old._id, record);
  else await ctx.db.insert("paymentCheckins", record);
  return record;
} });
