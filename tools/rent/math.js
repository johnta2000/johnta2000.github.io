/* Shared browser/server calculations. Private apartment inputs live in Convex. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RentMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function money(value, label = 'Amount') {
    if (!Number.isSafeInteger(value) || value < 0 || value > 100000000) throw Error(`${label} must be a nonnegative amount in cents.`);
    return value;
  }
  function allocate(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(sum) || sum <= 0) throw Error('Room areas must be greater than zero.');
    const raw = weights.map(w => total * w / sum);
    const result = raw.map(Math.floor);
    const order = raw.map((v, i) => ({ i, remainder: v - result[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
    const remaining = total - result.reduce((a, b) => a + b, 0);
    for (let n = 0; n < remaining; n++) result[order[n].i]++;
    return result;
  }
  function calculate(config, parkingCents = 0) {
    for (const field of ['rentCents', 'loftCents', 'bathroomCents']) money(config[field], field);
    money(parkingCents, 'Parking credit');
    if (!config.rentCents || parkingCents > config.rentCents) throw Error('Parking credit cannot exceed rent.');
    if (!Array.isArray(config.people) || config.people.length !== 3) throw Error('Three residents are required.');
    const people = config.people;
    const areas = people.map(p => {
      if (!p.name?.trim() || p.name.length > 80) throw Error('Enter a resident name.');
      if (![p.room, p.closet].every(n => Number.isFinite(n) && n >= 0 && n <= 100000) || p.room + p.closet <= 0) throw Error('Enter valid room and closet areas.');
      money(p.creditCents, 'Affil contribution');
      return p.room + p.closet;
    });
    const sum = areas.reduce((a, b) => a + b, 0);
    const rawBase = areas.map(a => config.rentCents * a / sum);
    const loft = [config.loftCents * areas[0] / (areas[0] + areas[2]), -config.loftCents, config.loftCents * areas[2] / (areas[0] + areas[2])];
    const bath = [config.bathroomCents / 2, config.bathroomCents / 2, -config.bathroomCents];
    const adjusted = rawBase.map((a, i) => a + loft[i] + bath[i]);
    if (adjusted.some(a => a < 0)) throw Error('Room adjustments cannot produce negative rent.');
    const base = allocate(config.rentCents, adjusted);
    // Allocate the final net rent to avoid losing a cent through separate rounding.
    const net = allocate(config.rentCents - parkingCents, adjusted);
    const rows = people.map((p, i) => ({ ...p, area: areas[i], share: areas[i] / sum, baseCents: base[i], parkingCents: base[i] - net[i], dueCents: net[i] - p.creditCents }));
    if (rows.some(r => r.dueCents < 0)) throw Error('Affil contribution cannot exceed a resident’s rent after parking.');
    return { rows, landlordCents: config.rentCents - parkingCents, residentCents: rows.reduce((s, r) => s + r.dueCents, 0), affilCents: people.reduce((s, p) => s + p.creditCents, 0) };
  }
  function summary(calculation, payments) {
    const due = [...calculation.rows.map(r => r.dueCents), calculation.affilCents];
    const rows = due.map((amount, payer) => {
      const received = payments.filter(p => p.payer === payer && !p.voidedAt).reduce((s, p) => s + p.amountCents, 0);
      return { due: amount, received, remaining: Math.max(0, amount - received), overpaid: Math.max(0, received - amount), status: received >= amount ? 'Paid' : received > 0 ? 'Partial' : 'Unpaid' };
    });
    return { rows, received: rows.reduce((s, r) => s + r.received, 0), remaining: rows.reduce((s, r) => s + r.remaining, 0), overpaid: rows.reduce((s, r) => s + r.overpaid, 0) };
  }
  return { calculate, summary, money, allocate };
});
