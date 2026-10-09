import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const save = mutation({
  args: { eventId: v.string(), theme: v.union(v.literal('warm'),v.literal('niteharts'),v.literal('midnight'),v.literal('ocean')) },
  handler: async (ctx,{eventId,theme}) => {
    const identity=await ctx.auth.getUserIdentity();
    if(!identity||identity.emailVerified===false)throw new Error('Sign in to manage the project theme.');
    const doc=await ctx.db.query('warRoomState').withIndex('by_board',q=>q.eq('boardId',`rally:${eventId}`)).unique();
    if(!doc?.buckets)throw new Error('Project unavailable.');
    const state=doc.buckets as any, email=String(identity.email||'').trim().toLowerCase();
    const member=state.members.find((person:any)=>person.clerkSubject===identity.subject||(email&&String(person.email||'').trim().toLowerCase()===email));
    if(!member||!['admin','leader'].includes(member.role))throw new Error('Only an admin can change the project theme.');
    await ctx.db.patch(doc._id,{buckets:{...state,projectTheme:theme},updatedAt:Date.now()});
    return {projectTheme:theme};
  },
});
