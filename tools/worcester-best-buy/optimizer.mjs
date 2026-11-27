// All arithmetic here is in cents. Only fixed-price DoorDash items may enter a cart.
export const target = 10000;
const maxQuantity = 99;

export function canModel(item) {
  return item.platform === 'door' && item.flag !== 'promo excluded' &&
    item.flag !== 'out of stock' && !item.high && Number.isFinite(item.price) && item.price > 0;
}

export function price(item) {
  return Math.round(item.price * 100);
}

export function changeQuantity(cart, id, delta) {
  const next = new Map(cart);
  const quantity = Math.min(maxQuantity, Math.max(0, (next.get(id) || 0) + delta));
  if (quantity) next.set(id, quantity);
  else next.delete(id);
  return next;
}

export function decodeCart(value, inventory) {
  const result = new Map();
  for (const token of (value || '').split('.')) {
    const match = /^(\d{1,12})(?:x([1-9]\d?))?$/.exec(token);
    if (!match) continue;
    const id = 'item-' + match[1];
    if (inventory.has(id)) result.set(id, Math.min(maxQuantity, (result.get(id) || 0) + Number(match[2] || 1)));
  }
  return result;
}

export function encodeCart(cart) {
  return [...cart].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([id, quantity]) => id.slice(5) + (quantity === 1 ? '' : 'x' + quantity)).join('.');
}

export function quote(subtotal, extra) {
  const gap = Math.max(0, target - subtotal);
  const mainDiscount = gap === 0 ? 4000 : 0;
  const extraDiscount = gap === 0 && extra ? 1000 : 0;
  const savings = mainDiscount + extraDiscount;
  return { subtotal, gap, mainDiscount, extraDiscount, savings, net: subtotal - savings };
}

export function subtotalOf(cart, inventory) {
  let total = 0;
  for (const [id, quantity] of cart) total += price(inventory.get(id)) * quantity;
  return total;
}

export function saleSavings(cart, inventory, base) {
  let markdown = 0;
  let complete = !base && cart.size > 0;
  for (const [id, quantity] of cart) {
    const item = inventory.get(id);
    if (item.compare > item.price) markdown += (Math.round(item.compare * 100) - price(item)) * quantity;
    else complete = false;
  }
  return { markdown, complete };
}

export function parseAmount(value) {
  const raw = (value || '').trim().replace(/^\$\s*/, '');
  if (!raw) return 0;
  if (!/^(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.replaceAll(',', '').split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= 999999999 ? amount : null;
}

// Enumerate distinct additions up to the chosen basket size. A qualifying group
// is useful only when every item is needed to cross the threshold.
export function rankedAdditions(subtotal, pool, cart, options = {}) {
  const { category = '', maxItems = 3, limit = 3, rank = 'near' } = options;
  if (subtotal >= target) return [];
  const candidates = pool.filter(item => canModel(item) && item.flag !== 'guest listing' &&
    !cart.has(item.id) && (!category || category === item.cat));
  const discount = item => Math.max(0, Math.round((item.compare || item.price) * 100) - price(item));
  // For equivalent prices and categories, lower markdowns can only rank after
  // all combinations using the higher-markdown items in the same group.
  const groups = new Map();
  for (const item of candidates) {
    const key = JSON.stringify([price(item), item.cat]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const sorted = [...groups.values()].flatMap(group =>
    group.sort((a,b) => discount(b)-discount(a)).slice(0, limit + maxItems - 1)
  ).sort((a,b) => price(a)-price(b));
  const costs = sorted.map(price);
  const markdowns = sorted.map(discount);
  const best = [];
  const compare = (a,b) => (rank === 'sale' ? b.markdown - a.markdown : 0) ||
    a.subtotal-b.subtotal || a.items.length-b.items.length ||
    a.categories-b.categories || b.markdown-a.markdown;
  function visit(start, selected, total, markdown, cheapest) {
    if (selected.length + 1 === maxItems) {
      let hi = sorted.length;
      while (start < hi) {
        const mid = (start + hi) >>> 1;
        if (total + costs[mid] < target) start = mid+1;
        else hi = mid;
      }
    }
    for (let i=start; i<sorted.length; i++) {
      const sum = total + costs[i];
      const lowest = selected.length ? cheapest : costs[i];
      if (sum - lowest >= target || (rank === 'sale' && sum > target+1000)) break;
      if (rank !== 'sale' && best.length === limit && sum > best[limit-1].subtotal) break;
      const savings = markdown + markdowns[i];
      if (sum < target) {
        if (selected.length+1 < maxItems) visit(i+1, [...selected,sorted[i]],sum,savings,lowest);
        continue;
      }
      if (rank === 'sale' && (!savings || (best.length === limit && savings < best[limit-1].markdown))) continue;
      const items = [...selected,sorted[i]];
      const match = {items, subtotal:sum, categories:new Set(items.map(x=>x.cat)).size, markdown:savings};
      if (best.length === limit && compare(match,best[limit-1]) >= 0) continue;
      best.push(match);
      best.sort(compare);
      if (best.length > limit) best.pop();
    }
  }
  visit(0,[],subtotal,0,Infinity);
  return best;
}

// Cheapest qualifying subset of a user's selections. Keep only sub-target sums
// for expansion. All item prices are positive, so a qualifying path is complete.
export function cheapestSubset(cart, inventory, total, base = 0) {
  if (total <= target || ![...cart].some(([id]) => total - price(inventory.get(id)) >= target)) return null;
  if (base >= target) return { items: new Map(), subtotal: base };
  const paths = new Map([[base, null]]);
  let lowest = total;
  let best = null;
  for (const [id, quantity] of cart) {
    const cents = price(inventory.get(id));
    for (let unit = 0; unit < Math.min(quantity, Math.ceil((target - base) / cents)); unit++) {
      for (const [sum, previous] of [...paths]) {
        const next = sum + cents;
        if (next >= lowest || paths.has(next)) continue;
        const path = { id, previous };
        if (next < target) paths.set(next, path);
        else {
          lowest = next;
          best = path;
        }
      }
    }
  }
  if (!best) return null;
  const items = new Map();
  for (let step = best; step; step = step.previous) items.set(step.id, (items.get(step.id) || 0) + 1);
  return { items, subtotal: lowest };
}
