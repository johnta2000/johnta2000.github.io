/* Private, device-local snapshots. Never persist Clerk credentials or API tokens. */
(() => {
  const key = 'rally-offline-v1';
  const empty = () => ({ version: 1, userId: null, events: [], rooms: {}, pending: {} });
  let state;
  try { state = window.__RALLY_NATIVE_CACHE__ || JSON.parse(localStorage.getItem(key)) || empty(); } catch { state = empty(); }
  if (state.version !== 1) state = empty();
  let syncing = false;
  let storageError = false;
  const clone = value => JSON.parse(JSON.stringify(value));
  const merge = (remote, base, desired) => {
    const result = new Set(remote), before = new Set(base), after = new Set(desired);
    for (const id of before) if (!after.has(id)) result.delete(id);
    for (const id of after) if (!before.has(id)) result.add(id);
    return [...result];
  };
  function persist() {
    try {
      const bridge = window.webkit?.messageHandlers?.rallyOffline;
      if (bridge) bridge.postMessage(state);
      else localStorage.setItem(key, JSON.stringify(state));
      storageError = false;
    } catch { storageError = true; }
    window.dispatchEvent(new Event('rally-cache-change'));
  }
  function overlay(room) {
    const copy = clone(room), pending = state.pending[room.id];
    if (!pending) return copy;
    copy.currentLineupFavorites = merge(copy.currentLineupFavorites || [], pending.base, pending.desired);
    const member = copy.members.find(person => person.id === copy.currentMemberId);
    copy.lineupInterests ||= {};
    for (const [id, people] of Object.entries(copy.lineupInterests)) copy.lineupInterests[id] = people.filter(person => person.id !== copy.currentMemberId);
    if (member) for (const id of copy.currentLineupFavorites) (copy.lineupInterests[id] ||= []).push(member);
    return copy;
  }
  window.RallyOffline = {
    get userId() { return state.userId; },
    get events() { return clone(state.events); },
    get pendingCount() { return Object.keys(state.pending).length; },
    get storageError() { return storageError || this.nativeSaveFailed; },
    get native() { return location.protocol === 'rally-cache:'; },
    select(id) { state.lastEvent = id; persist(); },
    merge,
    identify(userId) { if (state.userId !== userId) state = empty(); state.userId = userId; persist(); },
    clear() { state = empty(); persist(); },
    list(events) {
      state.events = clone(events);
      const allowed = new Set(events.map(event => event.id));
      for (const id of Object.keys(state.rooms)) if (!allowed.has(id)) { delete state.rooms[id]; delete state.pending[id]; }
      persist();
    },
    save(room) {
      if (!state.userId || !room?.id || !Array.isArray(room.members)) return room;
      state.rooms[room.id] = { savedAt: Date.now(), room: clone(room) }; persist();
      return overlay(room);
    },
    room(id) { return state.rooms[id] ? overlay(state.rooms[id].room) : null; },
    savedAt(id) { return state.rooms[id]?.savedAt; },
    queue(id, artistIds) {
      const room = state.rooms[id]?.room;
      if (!room) throw new Error('Open this room online before saving favorites offline.');
      const prior = state.pending[id];
      state.pending[id] = { base: prior?.base || room.currentLineupFavorites || [], desired: [...new Set(artistIds)], revision: (prior?.revision || 0) + 1 };
      persist();
      if (storageError) throw new Error('Device storage is unavailable. Keep this page open and reconnect to save your favorites.');
      return overlay(room);
    },
    async flush(call, userId) {
      if (syncing || !userId || state.userId !== userId || !navigator.onLine || this.native) return;
      syncing = true;
      try {
        for (const id of Object.keys(state.pending)) {
          const pending = clone(state.pending[id]);
          const room = await call('query', 'rally:get', { eventId: id });
          if (state.userId !== userId || !state.pending[id]) return;
          const artistIds = merge(room.currentLineupFavorites || [], pending.base, pending.desired);
          const updated = await call('mutation', 'rally:act', { eventId: id, action: 'save-lineup-favorites', payload: { artistIds } });
          if (state.userId !== userId || !state.pending[id]) return;
          if (state.pending[id].revision === pending.revision) delete state.pending[id];
          else {
            state.pending[id].desired = merge(artistIds, pending.desired, state.pending[id].desired);
            state.pending[id].base = artistIds;
          }
          this.save(updated);
        }
      } finally { syncing = false; }
    },
  };
})();
