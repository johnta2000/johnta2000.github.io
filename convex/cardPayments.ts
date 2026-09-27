import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { paymentStatus } from "./cardPaymentTables";

async function authorized(ctx: QueryCtx | MutationCtx) {
  const user = await ctx.auth.getUserIdentity();
  // A single approved email, not a shared allowlist for the site's other tools.
  const allowedEmail = (process.env.CARD_PAYMENTS_ALLOWED_EMAIL || "").trim().toLowerCase();
  if (!allowedEmail || !user || user.emailVerified !== true || user.email?.trim().toLowerCase() !== allowedEmail) {
    throw new Error("This account is not authorized for card payments. Use your approved, verified email.");
  }
  return user;
}

function month(value: string) {
  if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value)) throw new Error("Choose a valid month between 2000 and 2099.");
  return value;
}
function label(value: string, name: string, required = true) {
  const clean = value.trim();
  if ((required && !clean) || clean.length > 80) throw new Error(`${name} must be ${required ? "1–80" : "0–80"} characters.`);
  return clean;
}
const accountFields = { person: v.string(), bank: v.string(), nickname: v.string(), dueDay: v.number() };

export const verify = query({ args: {}, handler: async ctx => {
  const user = await authorized(ctx);
  return { email: user.email };
} });

export const dashboard = query({ args: { month: v.string() }, handler: async (ctx, args) => {
  const user = await authorized(ctx);
  month(args.month);
  const [accounts, logs] = await Promise.all([
    ctx.db.query("paymentAccounts").withIndex("by_owner", q => q.eq("owner", user.tokenIdentifier)).collect(),
    ctx.db.query("paymentLogs").withIndex("by_owner_month", q => q.eq("owner", user.tokenIdentifier).eq("month", args.month)).collect(),
  ]);
  return { accounts, logs };
} });

export const addAccounts = mutation({ args: { startMonth: v.string(), accounts: v.array(v.object(accountFields)) }, handler: async (ctx, args) => {
  const user = await authorized(ctx);
  month(args.startMonth);
  if (!args.accounts.length || args.accounts.length > 100) throw new Error("Add between 1 and 100 accounts at a time.");
  const clean = args.accounts.map(a => {
    if (!Number.isInteger(a.dueDay) || a.dueDay < 1 || a.dueDay > 31) throw new Error("Due day must be between 1 and 31.");
    return { person: label(a.person, "Person"), bank: label(a.bank, "Bank"), nickname: label(a.nickname, "Nickname", false), dueDay: a.dueDay };
  });
  const existing = await ctx.db.query("paymentAccounts").withIndex("by_owner", q => q.eq("owner", user.tokenIdentifier)).collect();
  const key = (a: {person: string; bank: string; nickname: string}) => JSON.stringify([a.person, a.bank, a.nickname].map(s => s.toLowerCase()));
  const keys = new Set(existing.map(key));
  let added = 0;
  for (const account of clean) {
    if (keys.has(key(account))) continue;
    if (existing.length + added >= 200) throw new Error("This tracker supports up to 200 accounts.");
    await ctx.db.insert("paymentAccounts", { ...account, owner: user.tokenIdentifier, startMonth: args.startMonth, createdAt: Date.now() });
    keys.add(key(account));
    added++;
  }
  return { added, skipped: clean.length - added };
} });

export const save = mutation({ args: {
  accountId: v.id("paymentAccounts"), month: v.string(), status: paymentStatus, expectedVersion: v.number(),
  amountCents: v.optional(v.union(v.number(), v.null())), note: v.optional(v.string()),
}, handler: async (ctx, args) => {
  const user = await authorized(ctx);
  month(args.month);
  const account = await ctx.db.get(args.accountId);
  if (!account || account.owner !== user.tokenIdentifier) throw new Error("Account not found.");
  if (args.month < account.startMonth || (account.endMonth && args.month > account.endMonth)) throw new Error("This account is not active in this month.");
  if (args.amountCents != null && (!Number.isSafeInteger(args.amountCents) || args.amountCents < 0 || args.amountCents > 10000000000)) throw new Error("Enter a valid amount with at most two decimal places.");
  if (args.note !== undefined && args.note.length > 1000) throw new Error("Notes must be under 1,000 characters.");
  const existing = await ctx.db.query("paymentLogs").withIndex("by_account_month", q => q.eq("accountId", args.accountId).eq("month", args.month)).unique();
  if (existing && existing.owner !== user.tokenIdentifier) throw new Error("Account not found.");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion !== (existing?.version || 0)) throw new Error("This entry changed on another device. Refresh and review it before saving again.");
  const payload = {
    owner: user.tokenIdentifier, accountId: args.accountId, month: args.month, status: args.status,
    amountCents: args.amountCents === null ? undefined : args.amountCents ?? existing?.amountCents,
    note: args.note === undefined ? existing?.note || "" : args.note.trim(),
    version: (existing?.version || 0) + 1, updatedAt: Date.now(),
  };
  if (existing) await ctx.db.patch(existing._id, payload);
  else await ctx.db.insert("paymentLogs", payload);
  return { version: payload.version };
} });

export const updateAccount = mutation({ args: { accountId: v.id("paymentAccounts"), ...accountFields }, handler: async (ctx, args) => {
  const user = await authorized(ctx);
  const account = await ctx.db.get(args.accountId);
  if (!account || account.owner !== user.tokenIdentifier) throw new Error("Account not found.");
  if (!Number.isInteger(args.dueDay) || args.dueDay < 1 || args.dueDay > 31) throw new Error("Due day must be between 1 and 31.");
  const fields = { person: label(args.person, "Person"), bank: label(args.bank, "Bank"), nickname: label(args.nickname, "Nickname", false), dueDay: args.dueDay };
  const accounts = await ctx.db.query("paymentAccounts").withIndex("by_owner", q => q.eq("owner", user.tokenIdentifier)).collect();
  if (accounts.some(a => a._id !== account._id && a.person.toLowerCase() === fields.person.toLowerCase() && a.bank.toLowerCase() === fields.bank.toLowerCase() && a.nickname.toLowerCase() === fields.nickname.toLowerCase())) throw new Error("That account already exists. Choose a different nickname.");
  await ctx.db.patch(account._id, fields);
} });

// Retirement is inclusive: this month's record and all earlier history stay intact.
export const retire = mutation({ args: { accountId: v.id("paymentAccounts"), endMonth: v.union(v.string(), v.null()) }, handler: async (ctx, args) => {
  const user = await authorized(ctx);
  const account = await ctx.db.get(args.accountId);
  if (!account || account.owner !== user.tokenIdentifier) throw new Error("Account not found.");
  if (args.endMonth !== null) {
    month(args.endMonth);
    if (args.endMonth < account.startMonth) throw new Error("The last month cannot precede the first month.");
    const logs = await ctx.db.query("paymentLogs").withIndex("by_account_month", q => q.eq("accountId", args.accountId).gt("month", args.endMonth!)).take(1);
    if (logs.length) throw new Error("This account already has later history. Choose a later last month.");
  }
  await ctx.db.patch(args.accountId, { endMonth: args.endMonth ?? undefined });
} });
