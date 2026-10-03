import { BOOKING_URL } from './hertz-las-may-2027.mjs';

export function parseBrowserSnapshot(snapshot, now = Date.now()) {
  if (snapshot?.schemaVersion !== 1) throw new Error('Unsupported browser snapshot.');
  const captured = Date.parse(snapshot.capturedAt);
  if (!Number.isFinite(captured) || captured > now + 60_000 || now - captured > 7_200_000) throw new Error('Browser snapshot must be captured within the last two hours.');
  const actual = new URL(snapshot.checkedUrl);
  const expected = new URL(BOOKING_URL);
  if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) throw new Error('Snapshot is not the Hertz vehicle search.');
  for (const [key, value] of expected.searchParams) {
    if (actual.searchParams.get(key) !== value) throw new Error(`Snapshot itinerary/rate parameter mismatch: ${key}`);
  }
  if (!Array.isArray(snapshot.cards) || snapshot.cards.length > 200) throw new Error('Invalid snapshot cards.');
  if (snapshot.cards.length && !/LAS/.test(snapshot.itineraryText)) throw new Error('Rendered itinerary is missing.');
  if (snapshot.cards.length && !/May 20\s*\|\s*7:00 PM/.test(snapshot.itineraryText)) throw new Error('Rendered pickup does not match.');
  if (snapshot.cards.length && !/May 24\s*\|\s*5:00 PM/.test(snapshot.itineraryText)) throw new Error('Rendered return does not match.');
  if (snapshot.resultCount != null && snapshot.cards.length !== snapshot.resultCount) throw new Error(`Incomplete rendered snapshot: ${snapshot.cards.length} of ${snapshot.resultCount} vehicle cards.`);
  const keys = new Set();
  const cards = snapshot.cards.map((card) => {
    if (!card.key || keys.has(card.key)) throw new Error('Missing or duplicate vehicle card identifier.');
    keys.add(card.key);
    const { text, pricingText, featureText, vehicleClass } = card;
    if (![text, pricingText, featureText, vehicleClass].every(v => typeof v === 'string' && v.trim())) throw new Error('Missing rendered card evidence.');
    if (!text.includes(pricingText) || !text.includes(vehicleClass) || !text.includes(featureText)) throw new Error('Card evidence does not match its rendered fields.');
    const rate = pricingText.match(/(?:^|\n)\s*\$\s*([\d,]+(?:\.\d{2})?)\s*\/\s*day\b/i);
    // Only prices explicitly adjacent to /day inside this card's price block.
    if (!rate) throw new Error(`No explicit visible daily rate for ${card.key}.`);
    const total = pricingText.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:est(?:imated)?\.?\s+)?total\b/i);
    const capacity = featureText.trim().match(/^(\d{1,2})\b/);
    const model = text.split('\n').map(v => v.trim()).find(v => /or similar$/i.test(v));
    return {
      visible: true,
      vehicleClass,
      vehicle: model ? `${vehicleClass} — ${model}` : vehicleClass,
      passengerCapacity: capacity ? Number(capacity[1]) : null,
      dailyRateUsd: Number(rate[1].replaceAll(',', '')),
      estimatedTotalUsd: total ? Number(total[1].replaceAll(',', '')) : null,
      taxesFeesVisibility: /tax(?:es)?|fees?/i.test(pricingText) ? 'visible_in_card' : 'not_visible',
      evidence: text,
    };
  });
  return { cards, checkedAt: snapshot.capturedAt, checkedUrl: snapshot.checkedUrl, pageTitle: snapshot.pageTitle, httpStatus: null, pageEvidence: snapshot.pageEvidence || '', diagnostics: { transport: 'regular_browser', resultCount: snapshot.resultCount }, source: 'regular_browser', snapshot };
}
