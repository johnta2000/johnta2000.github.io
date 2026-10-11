import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { assignTicket, saveTicketPurchase } from './rallyTicketsRules';

// Independent module so ticket changes can be deployed without replacing any
// unrelated live Rally functions or the other tools sharing this backend.
export const update = mutation({
  args: {eventId:v.string(),action:v.union(v.literal('assign'),v.literal('save'),v.literal('delete')),payload:v.any()},
  handler: async (ctx,{eventId,action,payload}) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.emailVerified === false) throw new Error('Sign in to manage tickets.');
    const doc = await ctx.db.query('warRoomState').withIndex('by_board',q=>q.eq('boardId',`rally:${eventId}`)).unique();
    if (!doc?.buckets) throw new Error('Project unavailable.');
    const state = structuredClone(doc.buckets) as any;
    const email = String(identity.email || '').trim().toLowerCase();
    const current = state.members.find((member:any)=>member.clerkSubject===identity.subject||(email&&String(member.email || '').trim().toLowerCase()===email));
    if (!current) throw new Error('You must belong to this project to manage tickets.');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid ticket change.');
    if (action === 'assign') {
      if (typeof payload.passId !== 'string' || typeof payload.memberId !== 'string' || typeof payload.expectedMemberId !== 'string') throw new Error('Invalid ticket assignment.');
      assignTicket(state,current,payload,Date.now());
    } else if (action === 'save') saveTicketPurchase(state,payload,crypto.randomUUID());
    else {
      if (!state.passes.some((pass:any)=>pass.id===payload.id)) throw new Error('That purchase no longer exists.');
      state.passes = state.passes.filter((pass:any)=>pass.id!==payload.id);
    }
    await ctx.db.patch(doc._id,{buckets:state,updatedAt:Date.now()});
    return {passes:state.passes};
  },
});
