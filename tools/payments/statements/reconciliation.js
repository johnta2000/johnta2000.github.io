/* Statement arithmetic is independent of who owns a charge or funded a payment. */
(() => {
  'use strict';
  const people = ['parents', 'john', 'jevin', 'other'];
  const chargeKinds = new Set(['purchase', 'credit', 'fee', 'interest']);
  function collectionForRow(row) {
    const allocation = row.kind === 'opening' && row.collectionAllocation
      ? row.collectionAllocation : !row.ignored ? row.allocation : null;
    return { allocation, unassigned: row.amountCents - people.reduce((sum,p) => sum+(allocation?.[p]||0),0) };
  }
  function calculate(statement) {
    const result = { charges: 0, opening: 0, payments: 0, imported: 0,
      assigned: 0, unassigned: 0, ignored: 0, unassignedCount: 0,
      chargeUnassigned: 0, chargeUnassignedCount: 0, chargeIgnored: 0,
      personCharges: Object.fromEntries(people.map(p => [p, 0])),
      personBalances: Object.fromEntries(people.map(p => [p, 0])), invalidSplits: 0 };
    result.personCollection = Object.fromEntries(people.map(p => [p, 0]));
    result.collectionUnassigned = 0; result.collectionUnassignedCount = 0; result.collectionAdjustments = [];
    for (const row of statement.rows) {
      const charge = chargeKinds.has(row.kind);
      const collection = collectionForRow(row).allocation;
      let applied = 0;
      for (const person of people) {
        const amount = collection?.[person] || 0;
        result.personCollection[person] += amount; applied += amount;
      }
      const residual = row.amountCents - applied;
      result.collectionUnassigned += residual;
      if (residual !== 0 || (!collection && row.amountCents !== 0)) {
        result.collectionUnassignedCount++;
        result.collectionAdjustments.push({id:row._id, description:row.description, kind:row.kind, amountCents:residual});
      }
      result.imported += row.amountCents;
      if (charge) result.charges += row.amountCents;
      if (row.kind === 'opening') result.opening += row.amountCents;
      if (row.kind === 'payment') result.payments += row.amountCents;
      if (row.ignored) {
        result.ignored += row.amountCents;
        if (charge) result.chargeIgnored += row.amountCents;
      } else if (row.allocation) {
        const split = people.reduce((sum, p) => sum + (row.allocation[p] || 0), 0);
        if (split !== row.amountCents) result.invalidSplits++;
        result.assigned += split;
        for (const person of people) {
          result.personBalances[person] += row.allocation[person] || 0;
          if (charge) result.personCharges[person] += row.allocation[person] || 0;
        }
      } else {
        result.unassigned += row.amountCents; result.unassignedCount++;
        if (charge) { result.chargeUnassigned += row.amountCents; result.chargeUnassignedCount++; }
      }
    }
    result.importMatches = result.imported === statement.balanceCents;
    result.balanceGap = result.assigned - statement.balanceCents;
    result.balanceAllocated = result.importMatches && result.balanceGap === 0 && !result.unassignedCount && !statement.rows.some(r => r.ignored) && !result.invalidSplits;
    result.collectionTotal = Object.values(result.personCollection).reduce((sum, n) => sum+n, 0);
    result.collectionReady = result.importMatches && !result.collectionUnassignedCount && !result.invalidSplits;
    return result;
  }
  const api = { calculate, collectionForRow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.StatementReconciliation = api;
})();
