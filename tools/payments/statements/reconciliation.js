/* Statement arithmetic is independent of who owns a charge or funded a payment. */
(() => {
  'use strict';
  const people = ['parents', 'john', 'jevin', 'other'];
  const chargeKinds = new Set(['purchase', 'credit', 'fee', 'interest']);
  function calculate(statement) {
    const result = { charges: 0, opening: 0, payments: 0, imported: 0,
      assigned: 0, unassigned: 0, ignored: 0, unassignedCount: 0,
      chargeUnassigned: 0, chargeUnassignedCount: 0, chargeIgnored: 0,
      personCharges: Object.fromEntries(people.map(p => [p, 0])),
      personBalances: Object.fromEntries(people.map(p => [p, 0])), invalidSplits: 0 };
    for (const row of statement.rows) {
      const charge = chargeKinds.has(row.kind);
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
    return result;
  }
  const api = { calculate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.StatementReconciliation = api;
})();
