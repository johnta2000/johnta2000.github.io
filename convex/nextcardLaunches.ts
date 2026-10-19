import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { channelValue, launchValue } from "./nextcardLaunchTables";
import { launchChannelSeeds } from "./nextcardLaunchSeed";

const ISSUER = "https://clerk.john-ta.com";
function team() {
  try {
    const entries = JSON.parse(process.env.NEXTCARD_LAUNCH_TEAM || "[]");
    if (!Array.isArray(entries) || entries.length > 20) return [];
    return entries.filter(entry => entry && typeof entry.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email) && typeof entry.name === "string" && entry.name.trim())
      .map(entry => ({ email: entry.email.trim().toLowerCase(), name: entry.name.trim().slice(0, 80) }));
  } catch { return []; }
}
export async function requireLaunchMember(ctx: { auth: QueryCtx["auth"] }) {
  const identity = await ctx.auth.getUserIdentity();
  const members = team();
  const email = identity?.email?.trim().toLowerCase();
  if (!identity?.subject || identity.issuer !== ISSUER || (identity.emailVerified !== true && identity.emailVerified !== undefined) || !email || !members.some(member => member.email === email)) {
    throw Error("This account is not authorized for NextCard launches.");
  }
  return { email, members };
}
function text(value: string, max: number, required = false) {
  if (value.length > max || (required && !value.trim())) throw Error("A field is empty or too long.");
}
function key(value: string) { if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw Error("Invalid record key."); }
function url(value: string) {
  text(value, 2000); if (!value) return;
  try { const parsed = new URL(value); if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw Error(); }
  catch { throw Error("Use a full http or https link."); }
}
function date(value: string) { if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw Error("Use a valid date."); }
function tags(values: string[]) { if (values.length > 20) throw Error("Use up to 20 audience tags."); for (const value of values) text(value, 60, true); }
function version(value: number) { if (!Number.isSafeInteger(value) || value < 0) throw Error("Invalid saved version."); }
function validateChannel(value: Infer<typeof channelValue>) {
  text(value.name, 150, true); url(value.url); tags(value.tags); date(value.verifiedDate);
  for (const valueText of [value.fit, value.rules, value.relationship, value.notes]) text(valueText, 5000);
  if (value.verifiedDate && Date.parse(value.verifiedDate) > Date.now()) throw Error("The rules checked date cannot be in the future.");
  if (value.ruleStatus === "verified" && (!value.verifiedDate || !value.rules.trim())) throw Error("Add the checked date and posting rules before marking them checked.");
}
function validateLaunch(value: Infer<typeof launchValue>, members: { email: string }[]) {
  text(value.name, 150, true); url(value.sourceUrl); text(value.summary, 10000); tags(value.tags); date(value.dueDate); text(value.notes, 10000);
  if (JSON.stringify(value).length > 350000) throw Error("This launch is too large. Shorten drafts or link to supporting documents.");
  const owner = (email: string) => { if (email && !members.some(member => member.email === email)) throw Error("Choose a workspace member as the owner."); };
  owner(value.owner);
  if (value.materials.length > 50 || value.checks.length > 100 || value.tasks.length > 100) throw Error("This launch has too many items.");
  const ids = new Set<string>();
  const id = (valueId: string) => { key(valueId); if (ids.has(valueId)) throw Error("Launch item IDs must be unique."); ids.add(valueId); };
  for (const material of value.materials) { id(material.id); text(material.name, 150, true); url(material.url); if (!material.url) throw Error("Add a material link."); }
  for (const check of value.checks) { id(check.id); text(check.label, 300, true); owner(check.owner); }
  const hidden = value.hiddenChannelKeys || [];
  if (hidden.length > 500 || new Set(hidden).size !== hidden.length) throw Error("Use up to 500 unique hidden channels.");
  for (const hiddenKey of hidden) key(hiddenKey);
  const channels = new Set<string>();
  for (const task of value.tasks) {
    if (hidden.includes(task.channelKey)) throw Error("A selected channel cannot also be hidden.");
    id(task.id); key(task.channelKey); text(task.channelName, 150, true); text(task.angle, 2000); text(task.draft, 20000); text(task.outcome, 5000); owner(task.owner); date(task.dueDate); url(task.liveUrl);
    if (task.postingAs !== undefined) text(task.postingAs, 150);
    if (!Number.isSafeInteger(task.activityAt) || task.activityAt < 0 || task.activityAt > Date.now() + 60000) throw Error("Invalid activity date.");
    if (channels.has(task.channelKey)) throw Error("Each channel can appear only once per launch."); channels.add(task.channelKey);
    if (task.channelKind === "outreach" ? ["submitted", "waiting", "live"].includes(task.status) : task.status === "sent") throw Error("Choose a status that fits this channel.");
  }
}
function publicRecord(record: { key: string; value: unknown; version: number; createdAt: number; updatedAt: number; updatedBy: string }) {
  return { key: record.key, value: record.value, version: record.version, createdAt: record.createdAt, updatedAt: record.updatedAt, updatedBy: record.updatedBy };
}
export const verify = query({ args: {}, handler: async ctx => { const { email } = await requireLaunchMember(ctx); return { email }; } });
export const workspace = query({ args: {}, handler: async ctx => {
  const { email, members } = await requireLaunchMember(ctx);
  const channels = await ctx.db.query("nextcardLaunchChannels").take(501);
  const launches = await ctx.db.query("nextcardLaunches").take(201);
  if (channels.length > 500 || launches.length > 200) throw Error("The workspace is too large to load. Contact the workspace owner.");
  return { email, members, channels: channels.map(publicRecord), launches: launches.map(publicRecord) };
} });
export const initialize = mutation({ args: {}, handler: async ctx => {
  const { email } = await requireLaunchMember(ctx);
  if (await ctx.db.query("nextcardLaunchChannels").first()) return null;
  const now = Date.now();
  for (const seed of launchChannelSeeds) await ctx.db.insert("nextcardLaunchChannels", { ...seed, version: 1, createdAt: now, updatedAt: now, updatedBy: email });
  return null;
} });
export const saveChannel = mutation({ args: { key: v.string(), value: channelValue, expectedVersion: v.number() }, handler: async (ctx, args) => {
  const { email } = await requireLaunchMember(ctx); key(args.key); version(args.expectedVersion); validateChannel(args.value);
  const record = await ctx.db.query("nextcardLaunchChannels").withIndex("by_key", q => q.eq("key", args.key)).unique();
  if ((record?.version ?? 0) !== args.expectedVersion) throw Error("This channel changed since you opened it. Review the latest version before saving.");
  if (!record && (await ctx.db.query("nextcardLaunchChannels").take(500)).length >= 500) throw Error("The channel library is full.");
  const updated = { value: args.value, version: args.expectedVersion + 1, updatedAt: Date.now(), updatedBy: email };
  if (record) await ctx.db.patch(record._id, updated);
  else await ctx.db.insert("nextcardLaunchChannels", { key: args.key, createdAt: Date.now(), ...updated });
  return { version: updated.version };
} });
export const saveLaunch = mutation({ args: { key: v.string(), value: launchValue, expectedVersion: v.number() }, handler: async (ctx, args) => {
  const { email, members } = await requireLaunchMember(ctx); key(args.key); version(args.expectedVersion); validateLaunch(args.value, members);
  const record = await ctx.db.query("nextcardLaunches").withIndex("by_key", q => q.eq("key", args.key)).unique();
  if ((record?.version ?? 0) !== args.expectedVersion) throw Error("This launch changed since you opened it. Review the latest version before saving.");
  for (const task of args.value.tasks) {
    if (!await ctx.db.query("nextcardLaunchChannels").withIndex("by_key", q => q.eq("key", task.channelKey)).unique()) throw Error("A selected channel no longer exists. Refresh the library.");
  }
  if (!record && (await ctx.db.query("nextcardLaunches").take(200)).length >= 200) throw Error("The launch list is full.");
  const updated = { value: args.value, version: args.expectedVersion + 1, updatedAt: Date.now(), updatedBy: email };
  if (record) await ctx.db.patch(record._id, updated);
  else await ctx.db.insert("nextcardLaunches", { key: args.key, createdAt: Date.now(), ...updated });
  return { version: updated.version };
} });
