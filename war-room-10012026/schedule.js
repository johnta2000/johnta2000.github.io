(() => {
  const milestones = [
    { id: 'ihg', name: 'IHG cards', at: '2026-10-01T05:00:00-07:00' },
    { id: 'united', name: 'United cards', at: '2026-10-01T06:00:00-07:00' },
    { id: 'air-france', name: 'Air France KLM', at: '2026-10-01T07:00:00-07:00' },
    { id: 'bofa-apr', name: 'BOFA APR changes', at: '2026-10-01T08:00:00-07:00' },
    { id: 'bofa-deadline', name: 'BOFA deadline', at: '2026-10-01T12:00:00-07:00', deadline: true },
  ];
  const labels = { 'on-track': 'On Track', 'no-mans-land': "No Man's Land", 'behind-schedule': 'Behind Schedule' };

  function countdown(milestone, now = Date.now()) {
    const remaining = Date.parse(milestone.at) - now;
    const seconds = remaining > 0 ? Math.ceil(remaining / 1000) : Math.floor(-remaining / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds % 86400 / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const pad = n => String(n).padStart(2, '0');
    return {
      label: remaining > 0 ? (milestone.deadline ? 'Deadline in' : 'Launch in') : (milestone.deadline ? 'Since deadline' : 'Since launch'),
      time: `${days ? days + 'd ' : ''}${pad(hours)}:${pad(minutes)}:${pad(seconds % 60)}`,
      elapsed: remaining <= 0,
    };
  }

  // Pure time calculations are also used by the regression tests.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { milestones, labels, countdown };
    return;
  }

  const controls = new Map();
  let closedProjects = {};
  let active = false, generation = 0, clockTimer, pollTimer;
  let statuses = {}, pending = new Set(), refreshSequence = 0;

  function paint(id, entry) {
    const control = controls.get(id);
    const status = labels[entry?.status] ? entry.status : '';
    control.card.dataset.status = status || 'unset';
    control.select.value = status;
    control.picker.sync();
    control.select.title = entry?.updatedBy ? `Updated by ${entry.updatedBy} · ${new Date(entry.updatedAt).toLocaleString()}` : '';
  }

  function tick() {
    for (const milestone of milestones) {
      const control = controls.get(milestone.id);
      const closed = closedProjects[milestone.id === 'bofa-deadline' ? 'bofa-apr' : milestone.id]?.closed;
      control.card.dataset.closed = String(Boolean(closed));
      control.card.querySelector('.launch-health').hidden = Boolean(closed);
      if (closed) {
        control.clock.textContent = 'Completed';
        control.clockLabel.textContent = 'Project closed';
        control.clock.setAttribute('aria-label', `${milestone.name}: project closed`);
        control.clock.dataset.elapsed = 'false';
        continue;
      }
      const value = countdown(milestone);
      control.clock.textContent = value.time;
      control.clockLabel.textContent = value.label;
      control.clock.setAttribute('aria-label', `${milestone.name}: ${value.label.toLowerCase()} ${value.time}`);
      control.clock.dataset.elapsed = String(value.elapsed);
    }
  }

  async function refresh() {
    if (!active || document.hidden) return;
    const epoch = generation, sequence = ++refreshSequence;
    try {
      const latest = await window.WarRoomAuth.call('query', 'warRoom:getLaunchStatuses', {});
      if (!active || epoch !== generation || sequence !== refreshSequence) return;
      for (const milestone of milestones) {
        if (pending.has(milestone.id)) continue;
        const entry = latest?.[milestone.id];
        if ((statuses[milestone.id]?.updatedAt ?? 0) > (entry?.updatedAt ?? 0)) continue;
        statuses[milestone.id] = entry;
        paint(milestone.id, entry);
        const message = controls.get(milestone.id).message;
        if (message.dataset.kind === 'load-error') message.textContent = '';
      }
    } catch {
      if (!active || epoch !== generation) return;
      for (const [id, control] of controls) {
        if (pending.has(id) || control.message.dataset.kind === 'save-error') continue;
        control.message.dataset.kind = 'load-error';
        control.message.textContent = 'Status sync unavailable';
      }
    }
  }

  async function save(id) {
    const control = controls.get(id), status = control.select.value;
    if (!active || pending.has(id) || !labels[status]) return;
    const epoch = generation;
    pending.add(id);
    control.select.disabled = true;
    control.picker.sync();
    control.card.dataset.status = status;
    control.message.dataset.kind = 'saving';
    control.message.textContent = 'Saving…';
    try {
      const entry = await window.WarRoomAuth.call('mutation', 'warRoom:setLaunchStatus', { milestone: id, status });
      if (!active || epoch !== generation) return;
      statuses[id] = entry;
      paint(id, entry);
      control.message.dataset.kind = 'saved';
      control.message.textContent = 'Saved for everyone';
    } catch {
      if (!active || epoch !== generation) return;
      paint(id, statuses[id]);
      control.message.dataset.kind = 'save-error';
      control.message.textContent = 'Not saved · select to retry';
    } finally {
      if (active && epoch === generation) {
        pending.delete(id);
        control.select.disabled = false;
        control.picker.sync();
      }
    }
  }

  for (const milestone of milestones) {
    const card = document.querySelector(`[data-milestone="${milestone.id}"]`);
    const clock = card.querySelector('.launch-countdown');
    const clockLabel = card.querySelector('.countdown-label');
    const select = card.querySelector('select');
    const message = card.querySelector('.launch-save-status');
    const picker = window.SearchableSelect.enhance(select);
    controls.set(milestone.id, { card, clock, clockLabel, select, message, picker });
    select.addEventListener('change', () => void save(milestone.id));
  }

  function stop() {
    active = false;
    generation += 1;
    clearInterval(clockTimer);
    clearInterval(pollTimer);
    pending = new Set();
    statuses = {};
    closedProjects = {};
    for (const [id, control] of controls) {
      control.picker.close();
      control.select.disabled = true;
      control.message.textContent = '';
      control.message.dataset.kind = '';
      paint(id, undefined);
    }
  }

  window.WarRoomSchedule = {
    start() {
      stop();
      active = true;
      for (const control of controls.values()) {
        control.select.disabled = false;
        control.picker.sync();
      }
      tick();
      void refresh();
      clockTimer = setInterval(tick, 1000);
      pollTimer = setInterval(refresh, 15000);
    },
    stop,
    setClosedProjects(value) { closedProjects = value; tick(); },
    getStatuses: () => JSON.parse(JSON.stringify(statuses)),
  };
  document.addEventListener('visibilitychange', () => { if (active && !document.hidden) { tick(); void refresh(); } });
  window.addEventListener('online', () => { if (active) void refresh(); });
  stop();
})();
