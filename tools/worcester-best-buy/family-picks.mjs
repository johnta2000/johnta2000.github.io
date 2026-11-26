// Shared by the browser and the database mutation, so optimistic totals and
// concurrent edits use the same quantity rules.
/** @typedef {{picks:string,base:number,extra:boolean}} Selection */
/** @typedef {{items:Array<{id:number,count:number,relative:boolean}>,base?:number,extra?:boolean}} Change */

/** @param {Selection} value @param {Change} change @returns {Selection} */
export function applyChange(value, change) {
  const quantities = new Map();
  for (const token of value.picks.split('.').filter(Boolean)) {
    const [id, quantity] = token.split('x');
    quantities.set(Number(id), Number(quantity || 1));
  }
  for (const { id, count, relative } of change.items) {
    const amount = Math.min(99, Math.max(0, relative ? (quantities.get(id) || 0) + count : count));
    if (amount === 0) quantities.delete(id);
    else quantities.set(id, amount);
  }
  const picks = [...quantities].sort(([a], [b]) => a-b)
    .map(([id, n]) => String(id) + (n === 1 ? '' : 'x' + n)).join('.');
  return { picks, base: change.base ?? value.base, extra: change.extra ?? value.extra };
}

/** @param {Map<string, number>} before @param {Map<string, number>} after */
export function changedItems(before, after) {
  const result = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if ((before.get(id) || 0) !== (after.get(id) || 0)) {
      result.push({ id: Number(id.slice(5)), count: after.get(id) || 0, relative: false });
    }
  }
  return result;
}
