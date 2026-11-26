const endpoint = 'https://rapid-shark-565.convex.cloud/api/';
const recoveryKey = 'worcester-best-buy.picks.v1';

export function selectionKey({ picks, base, extra }) {
  return JSON.stringify([picks, base, extra]);
}

export function validSnapshot(value) {
  return !!value && typeof value.picks === 'string' && value.picks.length <= 1220 &&
    Number.isSafeInteger(value.base) && value.base >= 0 && value.base <= 999999999 &&
    typeof value.extra === 'boolean';
}

export async function callPicks(method, args) {
  const read = method === 'get' || method === 'getFamily';
  const response = await fetch(endpoint + (read ? 'query' : 'mutation'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'worcesterPicks:' + method, args, format: 'json' }),
    signal: AbortSignal.timeout(9000),
    keepalive: !read,
  });
  if (!response.ok) throw new Error('Shopping list service unavailable');
  const result = await response.json();
  if (result.status !== 'success') throw new Error('Shopping list could not be saved or opened');
  return result.value;
}

// Immutable snapshots make opening an old shared link safe even after edits elsewhere.
export function pickStore({ request = callPicks, storage } = {}) {
  const ids = new Map();
  const lists = new Map();
  const pending = new Map();
  let recovery = null;

  try {
    const last = JSON.parse(storage?.getItem(recoveryKey) || 'null');
    if (validSnapshot(last?.value)) {
      recovery = last.value;
      if (typeof last.id === 'string') remember(last.id, recovery);
    }
  } catch { /* The URL also preserves selections if browser storage is unavailable. */ }

  function remember(id, value) {
    if (typeof id !== 'string' || !id.length || !validSnapshot(value)) throw new Error('Invalid saved list');
    ids.set(selectionKey(value), id);
    lists.set(id, value);
  }

  function recover(value) {
    recovery = value;
    try { storage?.setItem(recoveryKey, JSON.stringify({ value, id: ids.get(selectionKey(value)) || null })); }
    catch { /* The page URL remains a recovery copy. */ }
  }

  function once(key, start) {
    if (!pending.has(key)) {
      const task = Promise.resolve().then(start).finally(() => pending.delete(key));
      pending.set(key, task);
    }
    return pending.get(key);
  }

  function save(value) {
    const key = selectionKey(value);
    if (ids.has(key)) return Promise.resolve(ids.get(key));
    if (!value.picks && !value.base) return Promise.resolve(null);
    return once('save:' + key, async () => {
      const id = await request('save', value);
      remember(id, value);
      if (recovery && selectionKey(recovery) === key) recover(value);
      return id;
    });
  }

  async function load(id) {
    if (lists.has(id)) return lists.get(id);
    return once('get:' + id, async () => {
      const value = await request('get', { id });
      if (!validSnapshot(value)) throw new Error('List unavailable');
      remember(id, value);
      return value;
    });
  }

  return { recover, save, load, last: () => recovery, savedId: value => ids.get(selectionKey(value)), cached: id => lists.get(id) };
}
