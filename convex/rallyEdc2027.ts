import {internalMutation} from './_generated/server';

// Owner-approved correction: the existing crew chose Dawn, not both weekends.
export const selectDawn = internalMutation({args: {}, handler: async ctx => {
  const doc = await ctx.db.query('warRoomState').withIndex('by_board', q => q.eq('boardId', 'rally:edc-las-vegas-2027')).unique();
  if (!doc?.buckets) throw new Error('EDC crew plan missing.');
  const state = doc.buckets as Record<string, any>;
  if (state.catalogEventId === 'edc-las-vegas-2027-w2' && state.startsAt === '2027-05-21' && state.endsAt === '2027-05-23') return {updated: false};
  if (state.id !== 'edc-las-vegas-2027' || state.name !== 'EDC Las Vegas 2027' || state.startsAt !== '2027-05-14' || state.endsAt !== '2027-05-23') throw new Error('EDC metadata changed; inspect before retrying.');
  await ctx.db.patch(doc._id, {buckets: {...state, name: 'EDC Las Vegas 2027 — Dawn (Weekend 2)', startsAt: '2027-05-21', endsAt: '2027-05-23', catalogEventId: 'edc-las-vegas-2027-w2'}, updatedAt: Date.now()});
  return {updated: true, startsAt: '2027-05-21', endsAt: '2027-05-23'};
}});
