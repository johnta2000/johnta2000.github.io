import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireSleepUser, signedIn } from "./sleepAccess";
import { sharedMetric } from "./sleepTables";

const sharing = { name: v.string(), metrics: v.array(sharedMetric), shareDays: v.number() };
function cleanSharing(args: {name: string; metrics: string[]; shareDays: number}) {
  const name = args.name.trim();
  if (!name || name.length > 40) throw new Error("Use a display name between 1 and 40 characters.");
  if (![7, 28, 90, 180].includes(args.shareDays)) throw new Error("Choose a supported history window.");
  return {name, metrics: [...new Set(args.metrics)], shareDays: args.shareDays};
}
async function membership(ctx: any, groupId: any, subject: string) {
  const group = await ctx.db.get(groupId);
  const member = await ctx.db.query("sleepMembers").withIndex("by_group_subject", (q: any) => q.eq("groupId", groupId).eq("subject", subject)).unique();
  if (!group || group.closedAt || !member) throw new Error("This group is not available to your account.");
  return {group, member};
}
async function owner(ctx: any, groupId: any) {
  const user = await requireSleepUser(ctx);
  const result = await membership(ctx, groupId, user.subject);
  if (result.group.ownerSubject !== user.subject) throw new Error("Only the group owner can manage invitations and members.");
  return {...result, user};
}
async function profile(ctx: any, subject: string, name: string) {
  const existing = await ctx.db.query("sleepProfiles").withIndex("by_subject", (q: any) => q.eq("subject", subject)).unique();
  if (!existing) await ctx.db.insert("sleepProfiles", {subject, name, createdAt: Date.now()});
}
export async function hashInvite(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("This invitation is invalid or expired.");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, "0")).join("");
}
async function validInvite(ctx: any, token: string) {
  const tokenHash = await hashInvite(token);
  const invite = await ctx.db.query("sleepInvites").withIndex("by_hash", (q: any) => q.eq("tokenHash", tokenHash)).unique();
  if (!invite || invite.usedAt || invite.revokedAt || invite.expiresAt <= Date.now()) throw new Error("This invitation is invalid, used, or expired. Ask for a new link.");
  const group = await ctx.db.get(invite.groupId);
  if (!group || group.closedAt) throw new Error("This group is no longer available.");
  return {invite, group};
}
export const list = query({args: {}, handler: async ctx => {
  const user = await requireSleepUser(ctx);
  const members = await ctx.db.query("sleepMembers").withIndex("by_subject", q => q.eq("subject", user.subject)).collect();
  const result = [];
  for (const member of members) {
    const group = await ctx.db.get(member.groupId);
    if (group && !group.closedAt) result.push({id: group._id, name: group.name, owner: group.ownerSubject === user.subject});
  }
  return result;
}});
export const create = mutation({args: {groupName: v.string(), ...sharing}, handler: async (ctx, args) => {
  const user = await requireSleepUser(ctx);
  const settings = cleanSharing(args);
  const groupName = args.groupName.trim();
  if (!groupName || groupName.length > 60) throw new Error("Use a group name between 1 and 60 characters.");
  const groups = await ctx.db.query("sleepGroups").withIndex("by_owner", q => q.eq("ownerSubject", user.subject)).collect();
  if (groups.filter(g => !g.closedAt).length >= 5) throw new Error("You can own up to five active groups.");
  await profile(ctx, user.subject, settings.name);
  const groupId = await ctx.db.insert("sleepGroups", {name: groupName, ownerSubject: user.subject, createdAt: Date.now()});
  await ctx.db.insert("sleepMembers", {...settings, metrics: settings.metrics as any, subject: user.subject, groupId, joinedAt: Date.now()});
  return groupId;
}});
export const createInvite = action({args: {groupId: v.id("sleepGroups")}, handler: async (ctx, args): Promise<{token: string; expiresAt: number}> => {
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const expiresAt = await ctx.runMutation(internal.sleepGroups.issueInvite, {groupId: args.groupId, tokenHash: await hashInvite(token)});
  return {token, expiresAt};
}});
export const issueInvite = internalMutation({args: {groupId: v.id("sleepGroups"), tokenHash: v.string()}, handler: async (ctx, args) => {
  await owner(ctx, args.groupId);
  const members = await ctx.db.query("sleepMembers").withIndex("by_group", q => q.eq("groupId", args.groupId)).collect();
  if (members.length >= 10) throw new Error("This group has reached its 10-person limit.");
  const invites = await ctx.db.query("sleepInvites").withIndex("by_group", q => q.eq("groupId", args.groupId)).collect();
  const now = Date.now();
  if (invites.filter(i => !i.usedAt && !i.revokedAt && i.expiresAt > now).length >= 5) throw new Error("Revoke an unused invitation before creating another.");
  const expiresAt = now + 7 * 86400000;
  await ctx.db.insert("sleepInvites", {...args, createdAt: now, expiresAt});
  return expiresAt;
}});
export const previewInvite = query({args: {token: v.string()}, handler: async (ctx, args) => {
  const user = await signedIn(ctx);
  const {group, invite} = await validInvite(ctx, args.token);
  const members = await ctx.db.query("sleepMembers").withIndex("by_group", q => q.eq("groupId", group._id)).collect();
  return {name: group.name, count: members.length, expiresAt: invite.expiresAt, alreadyMember: members.some(m => m.subject === user.subject)};
}});
export const acceptInvite = mutation({args: {token: v.string(), ...sharing}, handler: async (ctx, args) => {
  const user = await signedIn(ctx);
  const settings = cleanSharing(args);
  const {group, invite} = await validInvite(ctx, args.token);
  const existing = await ctx.db.query("sleepMembers").withIndex("by_group_subject", q => q.eq("groupId", group._id).eq("subject", user.subject)).unique();
  if (existing) return group._id;
  const members = await ctx.db.query("sleepMembers").withIndex("by_group", q => q.eq("groupId", group._id)).collect();
  if (members.length >= 10) throw new Error("This group is full.");
  const own = await ctx.db.query("sleepMembers").withIndex("by_subject", q => q.eq("subject", user.subject)).collect();
  if (own.length >= 20) throw new Error("You have reached the group membership limit.");
  await profile(ctx, user.subject, settings.name);
  await ctx.db.insert("sleepMembers", {...settings, metrics: settings.metrics as any, groupId: group._id, subject: user.subject, joinedAt: Date.now()});
  await ctx.db.patch(invite._id, {usedAt: Date.now()});
  return group._id;
}});
export const updateSharing = mutation({args: {groupId: v.id("sleepGroups"), ...sharing}, handler: async (ctx, args) => {
  const user = await requireSleepUser(ctx);
  const {member} = await membership(ctx, args.groupId, user.subject);
  const settings = cleanSharing(args);
  await ctx.db.patch(member._id, {...settings, metrics: settings.metrics as any});
}});
export const revokeInvite = mutation({args: {inviteId: v.id("sleepInvites")}, handler: async (ctx, args) => {
  const invite = await ctx.db.get(args.inviteId);
  if (!invite) throw new Error("Invitation not found.");
  await owner(ctx, invite.groupId);
  await ctx.db.patch(invite._id, {revokedAt: Date.now()});
}});
export const removeMember = mutation({args: {groupId: v.id("sleepGroups"), memberId: v.id("sleepMembers")}, handler: async (ctx, args) => {
  const {group} = await owner(ctx, args.groupId);
  const member = await ctx.db.get(args.memberId);
  if (!member || member.groupId !== group._id || member.subject === group.ownerSubject) throw new Error("This member cannot be removed.");
  await ctx.db.delete(member._id);
}});
export const leave = mutation({args: {groupId: v.id("sleepGroups")}, handler: async (ctx, args) => {
  const user = await requireSleepUser(ctx);
  const {group, member} = await membership(ctx, args.groupId, user.subject);
  if (group.ownerSubject === user.subject) throw new Error("Group owners must close the group instead.");
  await ctx.db.delete(member._id);
}});
export const close = mutation({args: {groupId: v.id("sleepGroups")}, handler: async (ctx, args) => {
  await owner(ctx, args.groupId);
  await ctx.db.patch(args.groupId, {closedAt: Date.now()});
}});
function dateShift(date: string, days: number) { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0,10); }
export const history = query({args: {groupId: v.id("sleepGroups")}, handler: async (ctx, args) => {
  const user = await requireSleepUser(ctx);
  const {group, member: own} = await membership(ctx, args.groupId, user.subject);
  const today = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
  const members = await ctx.db.query("sleepMembers").withIndex("by_group", q => q.eq("groupId", args.groupId)).collect();
  const visible = [];
  for (const member of members) {
    const nights = member.metrics.length ? await ctx.db.query("sleepNights").withIndex("by_owner_date", q => q.eq("ownerSubject", member.subject).gte("sleepDate", dateShift(today, 1 - member.shareDays)).lte("sleepDate", today)).collect() : [];
    visible.push({id: member._id, name: member.name, self: member.subject === user.subject, metrics: member.metrics, shareDays: member.shareDays, nights: nights.filter(n => n.source === "whoop").map(n => {
      const result: any = {sleepDate: n.sleepDate, source: "whoop"};
      for (const metric of member.metrics) {
        if (metric === "score" && n.scoreKind !== "native") continue;
        if (typeof n[metric] === "number") result[metric] = n[metric];
        if (metric === "score") result.scoreKind = "native";
      }
      return result;
    })});
  }
  const invites = group.ownerSubject === user.subject ? await ctx.db.query("sleepInvites").withIndex("by_group", q => q.eq("groupId", group._id)).collect() : [];
  return {id: group._id, name: group.name, owner: group.ownerSubject === user.subject, own: {name: own.name, metrics: own.metrics, shareDays: own.shareDays}, members: visible, invites: invites.filter(i => !i.usedAt && !i.revokedAt && i.expiresAt > Date.now()).map(i => ({id: i._id, createdAt: i.createdAt, expiresAt: i.expiresAt}))};
}});
export const migrateLegacy = internalMutation({args: {}, handler: async ctx => {
  const subject = process.env.SLEEP_LEGACY_OWNER_SUBJECT;
  if (!subject) throw new Error("An explicitly verified legacy owner must be configured first.");
  let migrated = 0;
  for (const table of ["sleepNights", "alertnessRatings"] as const) {
    const rows = await ctx.db.query(table).withIndex("by_owner_date", q => q.eq("ownerSubject", undefined)).take(500);
    for (const row of rows) { await ctx.db.patch(row._id, {ownerSubject: subject}); migrated++; }
  }
  return {migrated};
}});
