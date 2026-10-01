(() => {
  const controls = new Map(), expanded = new Set(), pending = new Set();
  let active = false, generation = 0, timer, closures = {};
  function paint(id) {
    const c = controls.get(id); if (!c) return;
    const entry = closures[id], closed = Boolean(entry?.closed);
    c.node.dataset.closed = String(closed);
    c.node.dataset.expanded = String(expanded.has(id));
    c.button.textContent = closed ? 'Reopen project' : 'Close project';
    c.button.setAttribute('aria-label', `${closed ? 'Reopen' : 'Close'} ${c.title} project`);
    c.button.disabled = !active || pending.has(id);
    c.details.hidden = !closed;
    c.details.textContent = expanded.has(id) ? 'Hide details' : 'View tickets & notes';
    c.details.setAttribute('aria-expanded', String(expanded.has(id)));
    c.status.textContent = closed ? `Completed · closed ${new Date(entry.updatedAt).toLocaleDateString()}` : 'Active project';
    c.status.title = closed ? `Closed by ${entry.updatedBy}` : '';
  }
  function paintAll() { for (const id of controls.keys()) paint(id); window.WarRoomSchedule?.setClosedProjects(closures); }
  async function refresh() {
    if (!active || document.hidden) return;
    const epoch = generation;
    try {
      const latest = await window.WarRoomAuth.call('query', 'warRoom:getProjectClosures', {});
      if (!active || epoch !== generation) return;
      for (const id of controls.keys()) {
        if (pending.has(id) || (closures[id]?.updatedAt || 0) > (latest?.[id]?.updatedAt || 0)) continue;
        closures[id] = latest?.[id];
      }
      paintAll();
    } catch { if (active && epoch === generation) for (const c of controls.values()) c.status.textContent = 'Project status sync unavailable'; }
  }
  async function toggle(id) {
    if (!active || pending.has(id)) return;
    const epoch = generation, c = controls.get(id);
    pending.add(id); paint(id); c.status.textContent = 'Saving…';
    try {
      const entry = await window.WarRoomAuth.call('mutation', 'warRoom:setProjectClosed', {project:id, closed:!closures[id]?.closed});
      if (!active || epoch !== generation) return;
      closures[id] = entry; expanded.delete(id); paintAll();
    } catch { if (active && epoch === generation) c.status.textContent = 'Not saved · try again'; }
    finally { if (active && epoch === generation) { pending.delete(id); c.button.disabled = false; } }
  }
  function stop() { active = false; generation++; clearInterval(timer); closures = {}; pending.clear(); expanded.clear(); paintAll(); }
  window.WarRoomProjects = {
    bind(node, id, title) {
      const bar = document.createElement('div'); bar.className = 'project-close-bar';
      const status = document.createElement('span'); status.setAttribute('role','status');
      const button = document.createElement('button'); button.type = 'button'; button.addEventListener('click',()=>void toggle(id));
      const details = document.createElement('button'); details.type = 'button'; details.addEventListener('click',()=>{expanded.has(id)?expanded.delete(id):expanded.add(id);paint(id);});
      bar.append(status, details, button); node.querySelector('.bucket-header').after(bar);
      controls.set(id,{node,title,status,button,details}); paint(id);
    },
    start() { stop(); active = true; paintAll(); void refresh(); timer = setInterval(refresh,15000); },
    stop,
    getClosure: id => closures[id],
  };
  window.addEventListener('online',()=>void refresh());
  document.addEventListener('visibilitychange',()=>void refresh());
})();
