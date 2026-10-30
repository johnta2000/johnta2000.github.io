import { mutation, query } from './_generated/server';
import { ConvexError, v } from 'convex/values';

// Invitations live outside room buckets so regular room reads/offline snapshots
// never disclose invitation identifiers. Links carry an opaque record ID only;
// a verified, authenticated account must explicitly claim the invitation.
const PREFIX = 'rally-invite:';
const WEEK = 7 * 24 * 60 * 60 * 1000;
type State = Record<string, any>;
const emailOf = (value: unknown) => String(value || '').trim().toLowerCase();
function memberFor(state: State, identity: any) {
  return state.members.find((person: any) => person.clerkSubject === identity.subject ||
    (identity.email && emailOf(person.email) === identity.email));
}
async function identityFor(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  const email = emailOf(identity?.email);
  if (!identity || !email || identity.emailVerified !== true) throw new ConvexError('Sign in with a verified email to use this invitation.');
  return { ...identity, email };
}
async function roomFor(ctx: any, eventId: string) {
  const doc = await ctx.db.query('warRoomState').withIndex('by_board', (q: any) => q.eq('boardId', 'rally:' + eventId)).unique();
  if (!doc?.buckets) throw new ConvexError('This project is no longer available.');
  return doc;
}
async function adminFor(ctx: any, eventId: string) {
  const identity = await identityFor(ctx), doc = await roomFor(ctx, eventId);
  const member = memberFor(doc.buckets, identity);
  if (!member || !['admin', 'leader'].includes(member.role)) throw new ConvexError('Only a project admin can manage invite links.');
  return { identity, doc, member };
}
function invitationKey(eventId: string, invitationId: string) {
  if (!/^[a-zA-Z0-9_-]{1,180}$/.test(eventId) || !/^[a-f0-9-]{36}$/.test(invitationId)) throw new ConvexError('This invitation is not valid.');
  return PREFIX + eventId + ':' + invitationId;
}
async function invitationFor(ctx: any, eventId: string, invitationId: string) {
  const key = invitationKey(eventId, invitationId);
  const doc = await ctx.db.query('warRoomState').withIndex('by_board', (q: any) => q.eq('boardId', key)).unique();
  if (!doc?.buckets || doc.buckets.eventId !== eventId || doc.buckets.id !== invitationId) throw new ConvexError('This invitation is not available. Ask your friend for a new link.');
  return doc;
}
function statusOf(invite: State, now: number) {
  return invite.revokedAt ? 'revoked' : invite.usedAt ? 'claimed' : invite.expiresAt <= now ? 'expired' : 'active';
}
async function entriesFor(ctx: any, eventId: string) {
  const prefix = PREFIX + eventId + ':';
  return ctx.db.query('warRoomState').withIndex('by_board', (q: any) => q.gte('boardId', prefix).lt('boardId', prefix + '\uffff')).collect();
}
function summary(invite: State, now: number) {
  return { id: invite.id, name: invite.name, memberId: invite.memberId || '', createdAt: invite.createdAt, expiresAt: invite.expiresAt, status: statusOf(invite, now) };
}
function assertActive(invite: State, room: State, now: number) {
  const status = statusOf(invite, now);
  if (status !== 'active') throw new ConvexError(status === 'claimed' ? 'This invitation has already been claimed.' : status === 'expired' ? 'This invitation has expired. Ask your friend for a new link.' : 'This invitation was revoked. Ask your friend for a new link.');
  const creator = room.members.find((person: any) => person.id === invite.createdByMemberId && person.clerkSubject === invite.createdBySubject);
  if (!creator || !['admin', 'leader'].includes(creator.role)) throw new ConvexError('This invitation is no longer active. Ask a project admin for a new link.');
  if (invite.memberId && !room.members.some((person: any) => person.id === invite.memberId)) throw new ConvexError('This crew profile was removed. Ask for a new invitation.');
}

export const list = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    await adminFor(ctx, eventId);
    return (await entriesFor(ctx, eventId)).map((doc: any) => summary(doc.buckets, Date.now())).sort((a: any, b: any) => b.createdAt - a.createdAt);
  },
});

export const create = mutation({
  args: { eventId: v.string(), memberId: v.optional(v.string()), name: v.optional(v.string()), origin: v.optional(v.string()), requestId: v.optional(v.string()) },
  handler: async (ctx, { eventId, memberId, name = '', origin = '', requestId }) => {
    const { identity, doc, member } = await adminFor(ctx, eventId);
    const invitationId = requestId || crypto.randomUUID(), boardId = invitationKey(eventId, invitationId);
    const previous = await ctx.db.query('warRoomState').withIndex('by_board', (q: any) => q.eq('boardId', boardId)).unique();
    if (previous) {
      if (previous.buckets?.createdBySubject !== identity.subject) throw new ConvexError('Please create a new invitation.');
      return summary(previous.buckets, Date.now());
    }
    const target = memberId ? doc.buckets.members.find((person: any) => person.id === memberId) : null;
    if (memberId && !target) throw new ConvexError('This crew profile was removed. Refresh and try again.');
    if (target && (target.clerkSubject || target.status === 'confirmed' || ['admin', 'leader'].includes(target.role))) throw new ConvexError('That profile has already been claimed.');
    const cleanName = String(target?.name || name).trim(), cleanOrigin = String(target?.origin || origin).trim();
    if (cleanName.length > 100 || cleanOrigin.length > 100) throw new ConvexError('Keep names and home cities under 100 characters.');
    const now = Date.now(), entries = await entriesFor(ctx, eventId);
    if (entries.filter((row: any) => statusOf(row.buckets, now) === 'active').length >= 50) throw new ConvexError('Revoke an unused invite link before making another.');
    const invite = { id: invitationId, eventId, memberId: memberId || '', name: cleanName, origin: cleanOrigin, createdByMemberId: member.id, createdBySubject: identity.subject, createdAt: now, expiresAt: now + WEEK };
    await ctx.db.insert('warRoomState', { boardId, buckets: invite, completed: {}, linearLinks: {}, docLinks: {}, updatedAt: now });
    return summary(invite, now);
  },
});

export const inspect = query({
  args: { eventId: v.string(), invitationId: v.string() },
  handler: async (ctx, { eventId, invitationId }) => {
    const identity = await identityFor(ctx), doc = await invitationFor(ctx, eventId, invitationId), room = await roomFor(ctx, eventId), invite = doc.buckets;
    const existing = memberFor(room.buckets, identity);
    if (invite.usedAt && invite.usedBySubject === identity.subject && existing) return { eventId, eventName: room.buckets.name, name: invite.name, alreadyMember: true };
    assertActive(invite, room.buckets, Date.now());
    return { eventId, eventName: room.buckets.name, name: invite.name, alreadyMember: !!existing };
  },
});

export const claim = mutation({
  args: { eventId: v.string(), invitationId: v.string(), name: v.string() },
  handler: async (ctx, { eventId, invitationId, name }) => {
    const identity = await identityFor(ctx), doc = await invitationFor(ctx, eventId, invitationId), roomDoc = await roomFor(ctx, eventId), invite = doc.buckets;
    const room = structuredClone(roomDoc.buckets), existing = memberFor(room, identity);
    if (invite.usedAt && invite.usedBySubject === identity.subject && existing) return { eventId, memberId: existing.id };
    assertActive(invite, room, Date.now());
    // An existing crew member opening a friend's link must not consume it.
    if (existing) return { eventId, memberId: existing.id };
    let target = invite.memberId ? room.members.find((person: any) => person.id === invite.memberId) : null;
    if (target && (target.clerkSubject || target.status === 'confirmed' || ['admin', 'leader'].includes(target.role))) throw new ConvexError('That crew profile has already been claimed. Ask for a new invitation.');
    if (target?.email && emailOf(target.email) !== identity.email) throw new ConvexError('This profile is linked to a different email. Sign in with that email or ask the admin for a new invitation.');
    const cleanName = String(target?.name || name || invite.name || identity.name || '').trim();
    if (!cleanName || cleanName.length > 100) throw new ConvexError('Enter a name under 100 characters.');
    if (!target) {
      const colors = ['sky', 'purple', 'yellow', 'green', 'pink', 'blue', 'orange'];
      target = { id: 'm-' + crypto.randomUUID(), name: cleanName, origin: invite.origin || 'TBD', initials: cleanName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(), color: colors[room.members.length % colors.length], role: 'member' };
      room.members.push(target);
    }
    Object.assign(target, { email: identity.email, clerkSubject: identity.subject, status: 'confirmed' });
    const now = Date.now();
    await ctx.db.patch(roomDoc._id, { buckets: room, updatedAt: now });
    await ctx.db.patch(doc._id, { buckets: { ...invite, usedAt: now, usedBySubject: identity.subject, usedMemberId: target.id }, updatedAt: now });
    return { eventId, memberId: target.id };
  },
});

export const revoke = mutation({
  args: { eventId: v.string(), invitationId: v.string() },
  handler: async (ctx, { eventId, invitationId }) => {
    await adminFor(ctx, eventId);
    const doc = await invitationFor(ctx, eventId, invitationId), now = Date.now();
    if (doc.buckets.usedAt) throw new ConvexError('This invitation was already claimed. Remove the member from Crew to change their access.');
    if (!doc.buckets.revokedAt) await ctx.db.patch(doc._id, { buckets: { ...doc.buckets, revokedAt: now }, updatedAt: now });
    return { revoked: true };
  },
});
