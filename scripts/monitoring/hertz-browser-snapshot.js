// Read-only DOM capture. Run this whole expression in the regular browser's
// supported page evaluator; it contains no network calls or page mutations.
() => {
  const visible = (node) => {
    if (!node) return false;
    for (let p = node; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (p.hidden || p.getAttribute('aria-hidden') === 'true' || s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const cards = [];
  for (const heading of document.querySelectorAll('[id$="-vehicle_type"]')) {
    if (!visible(heading)) continue;
    const key = heading.id.slice(0, -'-vehicle_type'.length);
    const feature = document.getElementById(key + '-vehicle_features');
    const price = ['-best-available-pricing', '-dual-discount-rates']
      .map((suffix) => document.getElementById(key + suffix)).find(visible);
    let card = heading.parentElement;
    while (card && !(card.contains(feature) && card.contains(price))) card = card.parentElement;
    if (!card || !visible(feature) || !visible(price) || card.querySelectorAll('[id$="-vehicle_type"]').length !== 1) continue;
    cards.push({ key, vehicleClass: heading.innerText.trim(), featureText: feature.innerText, pricingText: price.innerText, text: card.innerText });
  }
  const bodyText = document.body.innerText;
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    checkedUrl: location.href,
    pageTitle: document.title,
    itineraryText: document.getElementById('midflow-reservation-pill')?.innerText || '',
    resultCount: Number(bodyText.match(/(\d+)\s+Results\b/)?.[1]) || null,
    pageEvidence: bodyText.slice(0, 800),
    cards,
  };
}
