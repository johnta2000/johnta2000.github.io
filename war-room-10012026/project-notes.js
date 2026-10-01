(() => {
  const controls = new Map(), timers = new Map();
  let active = false, generation = 0, storageKey = '', pollTimer;
  let notes = {}, drafts = {}, pending = new Map();
  const hasDraft = id => Object.hasOwn(drafts, id);
  function persist() {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(drafts)); } catch { /* Leave the draft visible and warn on navigation. */ }
  }
  function message(id, text, error = false) {
    const control = controls.get(id);
    if (!control) return;
    control.status.textContent = text;
    control.status.dataset.error = String(error);
    control.button.disabled = !active || !hasDraft(id) || pending.has(id);
  }
  function paint(id) {
    const control = controls.get(id);
    if (!control) return;
    const text = hasDraft(id) ? drafts[id] : notes[id]?.text || '';
    if (control.input.value !== text) control.input.value = text;
    control.input.disabled = !active;
    message(id, pending.has(id) ? 'Saving…' : hasDraft(id) ? 'Unsaved changes' : notes[id] ? 'Saved · shared with team' : 'Shared with the team');
  }
  async function refresh() {
    if (!active || document.hidden) return;
    const epoch = generation;
    try {
      const latest = await window.WarRoomAuth.call('query', 'warRoom:getProjectNotes', {});
      if (!active || epoch !== generation) return;
      for (const id of controls.keys()) {
        if (hasDraft(id) || pending.has(id)) continue;
        if ((notes[id]?.updatedAt ?? 0) > (latest?.[id]?.updatedAt ?? 0)) continue;
        notes[id] = latest?.[id];
        paint(id);
      }
    } catch {
      if (!active || epoch !== generation) return;
      for (const id of controls.keys()) if (!hasDraft(id)) message(id, 'Notes sync unavailable', true);
    }
  }
  async function save(id) {
    clearTimeout(timers.get(id));
    if (!active) return false;
    if (pending.has(id)) {
      const saved = await pending.get(id);
      return saved && hasDraft(id) ? save(id) : saved;
    }
    if (!hasDraft(id)) return true;
    const epoch = generation, text = drafts[id];
    const job = (async () => {
      try {
        const entry = await window.WarRoomAuth.call('mutation', 'warRoom:setProjectNote', { project: id, text });
        if (!active || epoch !== generation) return false;
        notes[id] = entry;
        if (drafts[id] === text) delete drafts[id];
        persist();
        return true;
      } catch {
        if (active && epoch === generation) message(id, 'Not synced · retry save', true);
        return false;
      } finally {
        if (epoch === generation) pending.delete(id);
      }
    })();
    pending.set(id, job);
    message(id, 'Saving…');
    const ok = await job;
    if (!active || epoch !== generation) return false;
    if (ok) {
      paint(id);
      if (hasDraft(id)) timers.set(id, setTimeout(() => void save(id), 700));
    } else {
      // The request was pending when its failure message was written.
      controls.get(id)?.button.removeAttribute('disabled');
    }
    return ok;
  }
  async function flushAll() {
    if (!active) return true;
    const results = await Promise.all(Object.keys(drafts).map(save));
    if (results.some(ok => !ok)) return false;
    // Text typed during an in-flight save stays a draft until it is saved too.
    if (Object.keys(drafts).length) return flushAll();
    return true;
  }
  window.WarRoomNotes = {
    bind(card, id, title) {
      const input = card.querySelector('.project-notes textarea');
      const status = card.querySelector('.project-notes-status');
      const button = card.querySelector('.save-project-notes');
      input.id = `project-notes-${id}`;
      input.setAttribute('aria-label', `${title} project notes`);
      button.setAttribute('aria-label', `Save ${title} project notes`);
      controls.set(id, { input, status, button });
      input.addEventListener('input', () => {
        if (!active) return;
        drafts[id] = input.value;
        persist();
        message(id, 'Unsaved changes');
        clearTimeout(timers.get(id));
        timers.set(id, setTimeout(() => void save(id), 700));
      });
      input.addEventListener('blur', () => { if (hasDraft(id)) void save(id); });
      button.addEventListener('click', () => void save(id));
      paint(id);
    },
    start(subject) {
      generation += 1;
      active = true;
      storageKey = `war-room-10012026-notes-${subject}`;
      try {
        const cached = JSON.parse(localStorage.getItem(storageKey) || '{}');
        drafts = Object.fromEntries(Object.entries(cached).filter(([id, text]) => controls.has(id) && typeof text === 'string'));
      } catch { drafts = {}; }
      for (const id of controls.keys()) paint(id);
      void refresh();
      void flushAll();
      clearInterval(pollTimer);
      pollTimer = setInterval(refresh, 15000);
    },
    stop() {
      active = false;
      generation += 1;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      clearInterval(pollTimer);
      notes = {}; drafts = {}; pending = new Map(); storageKey = '';
      for (const id of controls.keys()) paint(id);
      controls.clear();
    },
    getText: id => hasDraft(id) ? drafts[id] : notes[id]?.text || "",
    hasPending: () => Object.keys(drafts).length > 0,
    flushAll,
  };
  window.addEventListener('online', () => { if (active) { void refresh(); void flushAll(); } });
  document.addEventListener('visibilitychange', () => { if (active && !document.hidden) void refresh(); });
})();
