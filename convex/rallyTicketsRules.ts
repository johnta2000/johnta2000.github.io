type RecordValue = Record<string, any>;
export function ticketQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) throw new Error('Quantity must be a whole number from 1 to 500.');
  return quantity;
}
export function assignTicket(state: RecordValue, current: RecordValue, payload: RecordValue, now: number) {
  const pass = state.passes.find((item: RecordValue) => item.id === payload.passId);
  if (!pass) throw new Error('That purchase no longer exists. Refresh the ticket list.');
  const quantity = ticketQuantity(pass.quantity || 1), slot = payload.slot;
  if (!Number.isInteger(slot) || slot < 0 || slot >= quantity) throw new Error('That ticket slot no longer exists. Refresh the ticket list.');
  const assignments = Array.isArray(pass.ticketAssignments) ? pass.ticketAssignments : [];
  const existing = assignments.find((item: RecordValue) => item.slot === slot);
  const existingId = existing?.memberId || '';
  if (existingId !== payload.expectedMemberId) throw new Error('Someone changed this ticket assignment. Refresh and try again.');
  if (payload.memberId && !state.members.some((member: RecordValue) => member.id === payload.memberId)) throw new Error('Choose someone in this project’s crew.');
  // Updating one slot never replaces another friend's simultaneous assignment.
  if (existingId === payload.memberId) return;
  pass.ticketAssignments = assignments.filter((item: RecordValue) => item.slot !== slot);
  if (payload.memberId) pass.ticketAssignments.push({slot, memberId:payload.memberId, assignedBy:current.id, assignedAt:now});
  pass.ticketAssignments.sort((a: RecordValue,b: RecordValue) => a.slot-b.slot);
}
export function saveTicketPurchase(state: RecordValue, payload: RecordValue, newId: string) {
  const existing = payload.id ? state.passes.find((item: RecordValue) => item.id === payload.id) : null;
  if (payload.id && !existing) throw new Error('That purchase no longer exists. Refresh the ticket list.');
  const quantity = ticketQuantity(payload.quantity);
  if (existing?.ticketAssignments?.some((item: RecordValue) => item.slot >= quantity)) throw new Error('Unassign the extra tickets before reducing the quantity.');
  const name = String(payload.name || '').trim();
  if (!name || name.length > 240) throw new Error('Enter a purchase name up to 240 characters.');
  const ownerId = String(payload.ownerId || '');
  if (ownerId && !state.members.some((member: RecordValue) => member.id === ownerId)) throw new Error('Choose an original buyer from this project’s crew.');
  const category = String(payload.category || 'Pass');
  if (!['Pass','Shuttle','Parking','Add-on'].includes(category)) throw new Error('Choose a valid purchase type.');
  const record = {name,quantity,ownerId,category,unitCost:String(payload.unitCost || '').trim(),totalCost:String(payload.totalCost || '').trim(),status:String(payload.status || '').trim(),notes:String(payload.notes || '').trim()};
  if (existing) Object.assign(existing,record);
  else state.passes.push({id:newId,...record,ticketAssignments:[]});
}
