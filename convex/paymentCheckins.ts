import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorized } from "./cardPayments";
function validMonth(month: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw Error("Choose a valid month between 2000 and 2099.");
}
// Keep the earlier whole-month records intact for old clients/history. They do
// not imply that any individual account has been reviewed.
export const accounts = query({ args: { month: v.string() }, handler: async (ctx, args) => {
  const user = await authorized(ctx);
  validMonth(args.month);
  return await ctx.db.query("paymentAccountCheckins").withIndex("by_owner_month", q => q.eq("owner", user.workspaceOwner).eq("month", args.month)).collect();
} });
export const saveAccount = mutation({ args: {
  accountId: v.id("paymentAccounts"), month: v.string(), checked: v.boolean(),
  expectedVersion: v.number(), requestKey: v.string(),
}, handler: async (ctx, args) => {
  const user = await authorized(ctx);
  validMonth(args.month);
  const account = await ctx.db.get(args.accountId);
  if (!account || account.owner !== user.workspaceOwner) throw Error("Account not found.");
  if (args.month < account.startMonth || (account.endMonth && args.month > account.endMonth)) throw Error("This account is not active in that month.");
  if (!args.requestKey.trim() || args.requestKey.length > 100 || !Number.isSafeInteger(args.expectedVersion) || args.expectedVersion < 0) throw Error("Invalid check-in save.");
  const old = await ctx.db.query("paymentAccountCheckins").withIndex("by_owner_account_month", q => q.eq("owner", user.workspaceOwner).eq("accountId", args.accountId).eq("month", args.month)).unique();
  if (old?.requestKey === args.requestKey) {
    if (old.checked !== args.checked) throw Error("Invalid check-in save.");
    return old;
  }
  if (args.expectedVersion !== (old?.version || 0)) throw Error("This entry changed on another device. Refresh and review it before saving again.");
  const record = { owner: user.workspaceOwner, accountId: args.accountId, month: args.month,
    checked: args.checked, version: (old?.version || 0) + 1, updatedAt: Date.now(), requestKey: args.requestKey };
  if (old) await ctx.db.patch(old._id, record);
  else await ctx.db.insert("paymentAccountCheckins", record);
  return record;
} });
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
