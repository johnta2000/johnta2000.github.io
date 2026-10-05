import { mutation } from './_generated/server';
import { v } from 'convex/values';

const optional = ['stay', 'travel', 'passes', 'tasks', 'meetups'];
export const save = mutation({
  args: { eventId: v.string(), hiddenSections: v.array(v.string()) },
  handler: async (ctx, { eventId, hiddenSections }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.emailVerified === false) throw new Error('Sign in to manage sections.');
    const doc = await ctx.db.query('warRoomState').withIndex('by_board', q => q.eq('boardId', `rally:${eventId}`)).unique();
    if (!doc?.buckets) throw new Error('Project unavailable.');
    const state = doc.buckets as any;
    const email = String(identity.email || '').trim().toLowerCase();
    const member = state.members.find((person: any) => person.clerkSubject === identity.subject || (email && String(person.email || '').trim().toLowerCase() === email));
    if (!member || !['admin','leader'].includes(member.role)) throw new Error('Only an admin can manage sections.');
    if (hiddenSections.some(section => !optional.includes(section))) throw new Error('Choose an optional section.');
    const hidden = [...new Set(hiddenSections)];
    await ctx.db.patch(doc._id, { buckets: { ...state, hiddenSections: hidden }, updatedAt: Date.now() });
    return { hiddenSections: hidden };
  },
});
