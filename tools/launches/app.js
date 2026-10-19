(() => {
  'use strict';
  const M = window.LaunchModel, R = window.LaunchRoutes, $ = id => document.getElementById(id);
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let data = null, saveRecord, view = 'channels', activeKey = null, step = 'choose', launchFilter = 'active', channelFilter = 'all', chooserMedium = 'all', query = '', channelQuery = '', showArchived = false, pickerHandles = [], dialogDirty = false;
  const selectedChannels = new Set();
  let editorRoute = null, routeError = null, applyingRoute = false, ignoringPop = false;
  let routePosition = Number.isInteger(history.state?.launchRoutePosition) ? history.state.launchRoutePosition : 0;
  let lastRouteUrl = location.pathname + location.search + location.hash;
  const mediumPickers = new Map();
  function clearMediumPickers() { mediumPickers.forEach(picker => picker.destroy()); mediumPickers.clear(); }
  const dateText = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const activityText = value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const memberName = email => data?.members.find(member => member.email === email)?.name || (email ? 'Previous member' : 'Unassigned');
  const badge = (label, status = '') => `<span class="badge ${h(status)}">${h(label)}</span>`;
  const tagList = tags => `<div class="tag-list">${tags.map(tag => `<span class="tag">${h(tag)}</span>`).join('')}</div>`;
  const link = (url, label, css = '') => M.safeUrl(url) ? `<a href="${h(M.safeUrl(url))}" target="_blank" rel="noopener noreferrer" class="${h(css)}">${h(label)} ↗</a>` : '';
  const field = (id, label, value = '', type = 'text', max = 150, required = false) => `<label for="${id}">${label}<input id="${id}" name="${id}" type="${type}" value="${h(value)}" maxlength="${max}"${required ? ' required' : ''}></label>`;
  const area = (id, label, value = '', max = 5000, rows = 3) => `<label for="${id}">${label}<textarea id="${id}" name="${id}" maxlength="${max}" rows="${rows}">${h(value)}</textarea></label>`;
  const select = (id, label, entries, value) => `<label for="${id}">${label}<select id="${id}" name="${id}" aria-label="${label}">${Object.entries(entries).map(([key, name]) => `<option value="${h(key)}"${key === value ? ' selected' : ''}>${h(name)}</option>`).join('')}</select></label>`;
  const people = () => Object.fromEntries([['', 'Unassigned'], ...data.members.map(member => [member.email, member.name])]);
  const current = () => data?.launches.find(record => record.key === activeKey);
  const channel = key => data.channels.find(record => record.key === key);
  const announce = message => { $('announcement').textContent = message; };
  function save(kind, record) {
    record.updatedAt = Date.now(); record.updatedBy = data.email;
    saveRecord(kind, record.key, structuredClone(record.value));
  }
  function updateLaunch() { const record = current(); if (record) save('launch', record); }
  function enhance(container) { for (const element of container.querySelectorAll('select')) pickerHandles.push(window.SearchableSelect.enhance(element)); }
  function clearDialog() { pickerHandles.forEach(handle => handle.destroy()); pickerHandles = []; $('editor-content').replaceChildren(); dialogDirty = false; }
  function closeDialog(updateUrl = false) { $('editor').close(); clearDialog(); if (updateUrl) { editorRoute = null; writeRoute(); } }
  function showDialog(title, subtitle, body, onSubmit, footer = '') {
    closeDialog();
    $('editor-content').innerHTML = `<form id="edit-form"><div class="dialog-header"><div><h2 id="editor-title">${h(title)}</h2>${subtitle ? `<p>${h(subtitle)}</p>` : ''}</div><div class="dialog-tools"><button type="button" class="quiet" data-action="copy-page-link" aria-label="Copy link to this screen">Copy link</button><button type="button" class="dialog-close" data-action="close-dialog" aria-label="Close dialog">×</button></div></div><div class="form-grid">${body}</div><div class="dialog-footer"><span id="form-error" class="form-error" role="alert"></span><div class="actions">${footer}<button type="button" data-action="close-dialog">Cancel</button><button type="submit" class="primary">Save changes</button></div></div></form>`;
    const form = $('edit-form');
    form.addEventListener('input', () => { dialogDirty = true; });
    form.addEventListener('change', () => { dialogDirty = true; });
    form.addEventListener('submit', event => {
      event.preventDefault();
      try { onSubmit(new FormData(form)); closeDialog(true); announce('Changes updated. Saving to your workspace.'); }
      catch (error) { $('form-error').textContent = error.message; }
    });
    enhance(form); $('editor').showModal(); writeRoute();
  }
  function currentRoute() {
    return { view, launchKey: view === 'launches' ? activeKey : null, step, medium: view === 'channels' ? channelFilter : chooserMedium, status: launchFilter, archived: showArchived, editor: editorRoute };
  }
  function writeRoute(replace = false) {
    if (!data || applyingRoute || routeError) return;
    const url = location.pathname + R.serialize(currentRoute()) + location.hash;
    if (url === location.pathname + location.search + location.hash) {
      if (!Number.isInteger(history.state?.launchRoutePosition)) history.replaceState({ ...(history.state || {}), launchRoutePosition: routePosition }, '', url);
    } else if (replace) history.replaceState({ ...(history.state || {}), launchRoutePosition: routePosition }, '', url);
    else history.pushState({ launchRoutePosition: ++routePosition }, '', url);
    lastRouteUrl = url;
  }
  function unavailable(label) {
    clearMediumPickers(); routeError = label;
    $('content').innerHTML = `<div class="empty"><h1>${h(label)} unavailable</h1><p>This link may be out of date, or the item may no longer be in this workspace.</p><button type="button" data-action="${view === 'launches' ? 'back-launches' : 'library'}">${view === 'launches' ? 'Back to launches' : 'Back to channels'}</button></div>`;
  }
  function applyRoute() {
    if (!data) return;
    const route = R.parse(location.search);
    applyingRoute = true;
    try {
      closeDialog(); editorRoute = null; routeError = route.error;
      view = route.view; activeKey = route.launchKey; step = 'choose'; launchFilter = route.status;
      channelFilter = route.medium; chooserMedium = route.medium; showArchived = route.archived; query = ''; channelQuery = '';
      if (activeKey && !current()) routeError = 'Launch';
      render();
      if (routeError || !route.editor) return;
      const target = route.editor, launch = current();
      if (target.type === 'launch' && launch) editBrief(launch);
      else if (target.type === 'channel') { const record = channel(target.key); if (record) editChannel(record); else unavailable('Channel'); }
      else if (target.type === 'new-channel') editChannel();
      else if (target.type === 'task' && launch) { const task = launch.value.tasks.find(item => item.id === target.key); if (task) editTask(task); else unavailable('Task'); }
      else if (target.type === 'check' && launch) { const check = launch.value.checks.find(item => item.id === target.key); if (check) editCheck(check); else unavailable('Checklist item'); }
      else if (target.type === 'guidance' && launch) { const record = channel(target.key); if (record) showChannelGuidance(record); else unavailable('Channel'); }
      else if (target.type === 'material' && launch) addMaterial();
      else if (target.type === 'actions' && launch) launchOptions();
    } finally { applyingRoute = false; lastRouteUrl = location.pathname + location.search + location.hash; }
  }
  window.addEventListener('popstate', event => {
    if (ignoringPop) { ignoringPop = false; return; }
    if (!data) return;
    const target = event.state?.launchRoutePosition;
    if (dialogDirty && !window.confirm('Leave this edit and discard your unsaved changes?')) {
      if (Number.isInteger(target) && target !== routePosition) { ignoringPop = true; history.go(routePosition - target); }
      else history.pushState({ launchRoutePosition: routePosition }, '', lastRouteUrl);
      return;
    }
    if (Number.isInteger(target)) routePosition = target;
    applyRoute();
  });
  function setView(next) { closeDialog(); editorRoute = null; routeError = null; view = next; activeKey = null; query = ''; render(); writeRoute(); }
  function render() {
    if (!data) return;
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false'));
    if (routeError) { unavailable(routeError); return; }
    if (view === 'channels') renderLibrary(); else if (activeKey && current()) renderLaunch(); else renderLaunches();
  }
  function renderLaunches() {
    clearMediumPickers();
    activeKey = null;
    $('content').innerHTML = `<div class="page-heading"><div><p class="eyebrow">One launch at a time</p><h1>Your next launch starts here.</h1><p>A checklist of channels for each launch.</p></div><button class="primary" type="button" data-action="add-launch">＋ Add launch</button></div><div class="toolbar"><div class="filter-buttons" aria-label="Launch status">${['active', 'complete', 'archived'].map(status => `<button type="button" data-action="launch-filter" data-filter="${status}" aria-pressed="${launchFilter === status}">${status === 'active' ? 'In progress' : status === 'complete' ? 'Completed' : 'Archived'}</button>`).join('')}</div><input id="launch-search" class="search-input" type="search" aria-label="Search launches" placeholder="Search launches…" value="${h(query)}"></div><div id="launch-list"></div>`;
    $('launch-search').addEventListener('input', event => { query = event.target.value; renderLaunchCards(); }); renderLaunchCards();
  }
  function renderLaunchCards() {
    const records = data.launches.filter(record => record.value.status === launchFilter && `${record.value.name} ${record.value.summary} ${record.value.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!records.length) {
      $('launch-list').innerHTML = query || launchFilter !== 'active' ? '<div class="empty"><h2>No launches here yet.</h2><p>Try another search or status.</p></div>' : `<div class="empty"><span class="empty-mark" aria-hidden="true">↗</span><h2>Good news deserves a good launch.</h2><p>Add a launch, choose the channels that fit, and work through your checklist.</p><button type="button" class="primary" data-action="add-launch">＋ Add your first launch</button><p style="margin-bottom:0;margin-top:18px"><button class="text-button" type="button" data-action="library">Explore your channel library →</button></p></div>`; return;
    }
    $('launch-list').innerHTML = `<div class="launch-grid">${records.map(record => { const value = record.value; return `<button type="button" class="launch-card" data-action="open-launch" data-key="${h(record.key)}"><h2>${h(value.name)}</h2>${value.summary ? `<p>${h(value.summary.slice(0, 125))}</p>` : ''}<div class="card-bottom"><span>${value.tasks.length} channel${value.tasks.length === 1 ? '' : 's'} selected</span>${value.dueDate ? `<small>${h(dateText(value.dueDate))}</small>` : ''}</div></button>`; }).join('')}</div>`;
  }
  function addLaunch(from = null, channelKeys = []) {
    const record = { key: M.uid(), value: from ? M.duplicate(from.value) : M.newLaunch(data.email), version: 0, createdAt: Date.now(), updatedAt: Date.now(), updatedBy: data.email };
    if (!from) record.value.tasks = channelKeys.map(key => channel(key)).filter(item => item && !item.value.archived).map(item => M.addTask(item, record.value.owner));
    selectedChannels.clear(); data.launches.push(record); save('launch', record); activeKey = record.key; view = 'launches'; step = 'choose'; chooserMedium = 'all'; channelQuery = ''; render(); editBrief(record, !from);
  }
  function editBrief(record, fresh = false) {
    editorRoute = { type: 'launch' };
    const value = record.value;
    showDialog(fresh ? 'Start your launch' : 'Launch details', fresh ? 'Give it a name. Everything else can wait.' : 'The shared source of truth for this launch.', `${field('launch-name', 'Launch name', value.name === 'Untitled launch' ? '' : value.name, 'text', 150, true)}${field('source-url', 'Source URL', value.sourceUrl, 'url', 2000)}<details class="optional-launch-details"><summary>Notes & optional details</summary><div class="form-grid">${area('summary', 'What happened, and why does it matter?', value.summary, 10000)}<div class="form-two">${select('launch-type', 'Launch type', M.types, value.type)}${select('launch-owner', 'Launch owner', people(), value.owner)}</div>${field('launch-date', 'Target date (optional)', value.dueDate, 'date')}${area('launch-notes', 'Notes (optional)', value.notes, 10000)}</div></details>`, form => {
      Object.assign(value, { name: form.get('launch-name').trim(), sourceUrl: form.get('source-url').trim(), summary: form.get('summary').trim(), type: form.get('launch-type'), owner: form.get('launch-owner'), dueDate: form.get('launch-date'), notes: form.get('launch-notes') });
      save('launch', record); render();
    });
  }
  function renderLaunch() {
    clearMediumPickers(); step = 'choose';
    const value = current().value;
    const saved = value.summary || value.notes || value.materials.length || value.checks.length;
    $('content').innerHTML = `<div class="checklist-page"><button type="button" class="text-button back" data-action="back-launches">← All launches</button><div class="launch-heading"><div class="launch-title"><h1>${h(value.name)}</h1><p class="launch-meta">${value.tasks.length} channel${value.tasks.length === 1 ? '' : 's'} selected${value.dueDate ? ` · ${h(dateText(value.dueDate))}` : ''}${value.status !== 'active' ? ` · ${h(value.status)}` : ''}</p>${value.sourceUrl ? link(value.sourceUrl, 'Open source') : ''}</div><div class="actions"><button type="button" data-action="edit-brief">Edit details</button><button class="quiet" type="button" data-action="copy-checklist">Copy checklist</button><button class="quiet" type="button" data-action="launch-options" aria-label="More launch actions">More actions</button></div></div><section class="panel channel-checklist" aria-label="Channel checklist"><div id="step-content"></div></section>${saved ? `<details class="saved-launch-context"><summary>Saved notes & links</summary><div class="panel">${value.summary ? `<p class="source-summary">${h(value.summary)}</p>` : ''}${value.notes ? `<p class="source-summary">${h(value.notes)}</p>` : ''}${value.materials.map(item => `<div class="material">${link(item.url, item.name)}<button type="button" data-action="remove-material" data-id="${h(item.id)}" aria-label="Remove ${h(item.name)}">×</button></div>`).join('')}${value.checks.length ? `<details><summary>Earlier checklist notes</summary>${value.checks.map(check => `<div class="check-row"><span>${check.done ? '✓ ' : ''}${h(check.label)}</span><button type="button" class="quiet" data-action="edit-check" data-id="${h(check.id)}" aria-label="Edit ${h(check.label)}">Edit</button></div>`).join('')}</details>` : ''}<button type="button" class="text-button" data-action="edit-brief">Edit notes</button><button type="button" class="text-button" data-action="add-material">＋ Add link</button></div></details>` : ''}</div>`;
    renderChooser();
  }
  function mediumControls(records, selected, active, scope) {
    const available = new Set(records.map(record => M.medium(record.value)));
    const options = [['all', 'All media'], ...Object.entries(M.media).filter(([key]) => available.has(key)), ['selected', 'Selected']];
    const counts = Object.fromEntries(options.map(([key]) => [key, key === 'all' ? records.length : key === 'selected' ? records.filter(record => selected.has(record.key)).length : records.filter(record => M.medium(record.value) === key).length]));
    return `<div class="medium-desktop"><div class="medium-tabs" role="group" aria-label="${scope === 'library' ? 'Channel' : 'Launch channel'} distribution medium">${options.map(([key, label]) => {
      const count = key === 'all' ? records.length : key === 'selected' ? records.filter(record => selected.has(record.key)).length : records.filter(record => M.medium(record.value) === key).length;
      return `<button type="button" data-action="${scope}-medium" data-medium="${key}" aria-pressed="${active === key}">${h(label)}<span>${count}</span></button>`;
    }).join('')}</div></div><div class="medium-mobile">${select(`${scope}-medium-select`, 'Distribution medium', Object.fromEntries(options.map(([key, label]) => [key, `${label} (${counts[key]})`])), active)}</div>`;
  }
  function mountMediumControls(id, records, selected, active, scope) {
    mediumPickers.get(scope)?.destroy(); mediumPickers.delete(scope);
    $(id).innerHTML = mediumControls(records, selected, active, scope);
    const input = $(`${scope}-medium-select`);
    mediumPickers.set(scope, window.SearchableSelect.enhance(input));
    input.addEventListener('change', () => {
      if (scope === 'library') { channelFilter = input.value; query = ''; $('library-search').value = ''; renderLibraryRows(); writeRoute(); }
      else { chooserMedium = input.value; channelQuery = ''; $('chooser-search').value = ''; renderChoices(); writeRoute(); }
    });
  }
  function availableMedium(records, preferred) {
    return ['all', 'selected'].includes(preferred) || records.some(record => M.medium(record.value) === preferred) ? preferred : 'all';
  }
  function removeLaunchChannel(key) {
    const value = current().value, task = value.tasks.find(item => item.channelKey === key);
    if (!task) return false;
    const hasWork = task.postingAs || task.draft || task.angle || task.outcome || task.activityAt || task.liveUrl || task.dueDate || task.status !== 'draft';
    if (hasWork && !window.confirm(`Remove ${task.channelName} from this launch? Its saved draft, planning details, and activity will also be removed. The channel stays in your library.`)) return false;
    value.tasks = value.tasks.filter(item => item.channelKey !== key);
    updateLaunch();
    return true;
  }
  function removeChannelButton(key, name) {
    return `<button type="button" class="channel-remove" data-action="remove-launch-channel" data-key="${h(key)}" aria-label="Remove ${h(name)} from this launch">Remove</button>`;
  }
  function hideChannelButton(record) {
    return `<button type="button" class="channel-hide" data-action="hide-launch-channel" data-key="${h(record.key)}" aria-label="Hide ${h(record.value.name)} for this launch">Hide for this launch</button>`;
  }
  function channelLaunchContext(record) {
    const launch = current();
    if (!record || !launch) return '';
    const selected = launch.value.tasks.some(task => task.channelKey === record.key);
    const hidden = (launch.value.hiddenChannelKeys || []).includes(record.key);
    return `<div class="launch-channel-context"><p>${selected ? 'Included in this launch.' : hidden ? 'Hidden from this launch’s choices.' : 'Available option · not included in this launch.'}</p>${selected ? removeChannelButton(record.key, record.value.name) : hidden ? `<button type="button" data-action="restore-launch-channel" data-key="${h(record.key)}">Restore for this launch</button>` : hideChannelButton(record)}<small>Channel details below are shared across all launches.</small></div>`;
  }
  function compactChannels(records, selected, scope, grouped = false) {
    const renderRows = values => `<div class="compact-channel-grid">${values.map(record => {
      const value = record.value, task = scope === 'chooser' ? current().value.tasks.find(item => item.channelKey === record.key) : null;
      const metadata = value.fit || value.notes || 'Add channel notes';
      return `<article class="compact-channel${value.archived ? ' is-archived' : ''}"><div class="compact-channel-main"><label class="compact-channel-choice"><input type="checkbox" data-${scope === 'library' ? 'library-channel' : 'channel'}="${h(record.key)}" aria-label="Select ${h(value.name)}"${selected.has(record.key) ? ' checked' : ''}${value.archived && !selected.has(record.key) ? ' disabled' : ''}><span><strong>${h(value.name)}</strong></span></label><button type="button" class="channel-notes-preview" data-action="edit-channel-notes" data-key="${h(record.key)}" aria-label="Edit notes for ${h(value.name)}">${h(metadata)} <span aria-hidden="true">✎</span></button>${task ? `<label class="posting-assignment">Posting as / who’s posting<input type="text" data-posting-as="${h(task.id)}" aria-label="Posting as for ${h(value.name)}" value="${h(task.postingAs || '')}" placeholder="@account or teammate" maxlength="150" autocomplete="off"></label>` : ''}</div><div class="channel-row-actions">${scope === 'chooser' ? selected.has(record.key) ? removeChannelButton(record.key, value.name) : hideChannelButton(record) : ''}<button type="button" class="channel-detail" data-action="edit-channel" data-key="${h(record.key)}" aria-label="Edit channel ${h(value.name)}">Edit channel</button>${task ? `<button type="button" class="channel-detail" data-action="edit-task" data-id="${h(task.id)}" aria-label="Draft and notes for ${h(value.name)}">Draft & notes</button>` : ''}</div></article>`;
    }).join('')}</div>`;
    const sorted = [...records].sort((a, b) => a.value.name.localeCompare(b.value.name));
    if (!grouped) return renderRows(sorted);
    return Object.entries(M.media).map(([key, label]) => {
      const group = sorted.filter(record => M.medium(record.value) === key);
      return group.length ? `<section class="medium-section" aria-label="${h(label)}"><h3>${h(label)} <span>${group.length}</span></h3>${renderRows(group)}</section>` : '';
    }).join('');
  }
  function showChannelGuidance(record) {
    editorRoute = { type: 'guidance', key: record.key };
    const value = record.value, history = M.history(record.key, data.launches, activeKey).slice(0, 3);
    showDialog(value.name, `${M.media[M.medium(value)]} · ${M.kinds[value.kind]}`, `${channelLaunchContext(record)}${value.fit ? `<div><h3>Channel notes</h3><p class="guidance-text">${h(value.fit)}</p></div>` : ''}<div class="rule-note">${value.ruleStatus === 'verified' ? `Guidance checked ${h(value.verifiedDate)}.` : 'Posting rules need checking.'} ${value.linkPolicy === 'native' ? 'No external links; use a complete native post.' : value.linkPolicy === 'allowed' ? 'Links recorded as allowed.' : 'Link permissions are not recorded.'}${value.approval === 'required' ? ' Admin approval required.' : ''}</div>${value.rules ? `<p class="guidance-text">${h(value.rules)}</p>` : ''}${value.relationship ? `<p class="guidance-text">${h(value.relationship)}</p>` : ''}${value.notes ? `<p class="form-help">${h(value.notes)}</p>` : ''}${link(value.url, 'Open destination / contact reference')}${history.length ? `<div><h3>Previous activity</h3>${history.map(item => `<div class="history-item"><strong>${h(item.launch)}</strong><p>${h(activityText(item.task.activityAt))}</p>${item.task.outcome ? `<p>${h(item.task.outcome)}</p>` : ''}</div>`).join('')}</div>` : ''}<button type="button" data-action="edit-destination" data-key="${h(record.key)}">Edit channel guidance</button>`, () => {});
  }
  function renderChooser() {
    const value = current().value;
    $('step-content').innerHTML = `<h2>Choose your channels.</h2><p class="step-intro">Select the channels for this launch. Hide anything irrelevant. Changes save automatically.</p><div id="chooser-media"></div><div class="channel-search-row"><input class="search-input" id="chooser-search" type="search" aria-label="Search channel choices" placeholder="Search across all media…" value="${h(channelQuery)}"></div><div id="choice-list" class="choice-list"></div><details id="hidden-channels" class="hidden-channels" hidden><summary id="hidden-channels-summary"></summary><p class="form-help">Hidden only for this launch. Restore an option to choose it again.</p><div id="hidden-channel-list"></div></details>`;
    $('chooser-search').addEventListener('input', event => { channelQuery = event.target.value; renderChoices(); }); renderChoices();
  }
  function renderChoices() {
    const value = current().value, selected = new Set(value.tasks.map(task => task.channelKey));
    const hidden = new Set(value.hiddenChannelKeys || []);
    const all = data.channels.filter(record => (!record.value.archived || selected.has(record.key)) && !hidden.has(record.key));
    const active = channelQuery ? 'all' : availableMedium(all, chooserMedium);
    const records = all.filter(record => (!channelQuery ? active === 'all' || (active === 'selected' ? selected.has(record.key) : M.medium(record.value) === active) : true) && `${record.value.name} ${record.value.fit} ${record.value.notes} ${record.value.relationship} ${M.media[M.medium(record.value)]}`.toLowerCase().includes(channelQuery.toLowerCase()));
    mountMediumControls('chooser-media', all, selected, active, 'chooser');
    $('choice-list').innerHTML = records.length ? compactChannels(records, selected, 'chooser', active === 'all' || active === 'selected') : '<p class="muted channel-empty">No channels here. Try another medium or search.</p>';
    const hiddenRecords = data.channels.filter(record => hidden.has(record.key));
    $('hidden-channels').hidden = !hiddenRecords.length;
    $('hidden-channels-summary').textContent = `Hidden for this launch (${hiddenRecords.length})`;
    $('hidden-channel-list').innerHTML = hiddenRecords.map(record => `<div class="hidden-channel-row"><span>${h(record.value.name)}</span><button type="button" data-action="restore-launch-channel" data-key="${h(record.key)}" aria-label="Restore ${h(record.value.name)} for this launch">Restore</button></div>`).join('');
  }
  function editTask(task) {
    editorRoute = { type: 'task', key: task.id };
    const destination = channel(task.channelKey), details = destination?.value, previous = M.history(task.channelKey, data.launches, activeKey).slice(0, 3);
    const statuses = Object.fromEntries((task.channelKind === 'outreach' ? ['draft', 'ready', 'sent', 'skipped'] : ['draft', 'ready', 'submitted', 'waiting', 'live', 'skipped']).map(status => [status, M.statusLabels[status]]));
    const currentRules = details?.ruleStatus === 'verified' && details.verifiedDate && Date.now() - Date.parse(details.verifiedDate) < 90 * 86400000;
    showDialog(task.channelName, M.kinds[task.channelKind], `<div>${details ? link(details.url, task.channelKind === 'outreach' ? 'Open contact reference' : 'Open destination') : ''}${!details?.url ? '<p class="muted">Add the destination URL in the channel library.</p>' : ''}<div class="rule-note ${currentRules ? 'checked' : ''}">${currentRules ? `Rules checked ${h(activityText(Date.parse(details.verifiedDate)))}.` : 'Posting rules need checking or refreshing.'} ${details?.linkPolicy === 'native' ? '<strong>No external links — make the post useful on its own.</strong>' : details?.linkPolicy === 'allowed' ? 'Links recorded as allowed; confirm they help this audience.' : 'Link permissions not recorded.'}${details?.approval === 'required' ? ' Admin approval is required.' : ''}</div>${details?.rules ? `<p class="source-summary">${h(details.rules)}</p>` : ''}${details?.relationship ? `<p class="form-help">Contact / access: ${h(details.relationship)}</p>` : ''}${details?.notes ? `<details><summary class="form-help">Channel notes</summary><p class="form-help source-summary">${h(details.notes)}</p></details>` : ''}<button type="button" class="text-button" data-action="edit-destination" data-key="${h(task.channelKey)}">Edit channel guidance</button></div>${field('task-posting-as', 'Posting as / who’s posting', task.postingAs || '', 'text', 150)}${area('task-angle', task.channelKind === 'outreach' ? 'News angle for this contact' : 'Member takeaway / post angle', task.angle, 2000, 2)}${area('task-draft', task.channelKind === 'outreach' ? 'Pitch draft' : 'Post draft', task.draft, 20000, 10)}<div class="row-between"><button type="button" data-action="copy-draft">Copy draft</button><small>Publishing and sending happen outside this tool.</small></div><div class="form-two">${select('task-status', 'Status', statuses, task.status)}${select('task-owner', 'Task owner', people(), task.owner)}</div><div class="form-two">${field('task-date', 'Target date (optional)', task.dueDate, 'date')}${field('task-url', task.channelKind === 'outreach' ? 'Coverage URL (optional)' : 'Live post URL (optional)', task.liveUrl, 'url', 2000)}</div>${area('task-outcome', 'Results & lessons', task.outcome, 5000)}${previous.length ? `<div><h3>Previous launches in this channel</h3>${previous.map(item => `<div class="history-item"><strong>${h(item.launch)}</strong><p class="muted">${h(activityText(item.task.activityAt))} · ${h(M.statusLabels[item.task.status])}</p>${link(item.task.liveUrl, 'Open previous post / coverage')}${item.task.outcome ? `<p>${h(item.task.outcome)}</p>` : ''}${item.task.draft ? `<details><summary class="form-help">Previous copy</summary><p class="past-draft">${h(item.task.draft)}</p></details>` : ''}</div>`).join('')}</div>` : ''}`, form => {
      const status = form.get('task-status');
      Object.assign(task, { postingAs: form.get('task-posting-as').trim(), angle: form.get('task-angle').trim(), draft: form.get('task-draft'), owner: form.get('task-owner'), dueDate: form.get('task-date'), status, liveUrl: form.get('task-url').trim(), outcome: form.get('task-outcome'), activityAt: status !== task.status && ['submitted', 'waiting', 'live', 'sent'].includes(status) ? Date.now() : task.activityAt });
      updateLaunch(); renderLaunch();
    });
  }
  function editChannel(record = null, focusNotes = false) {
    editorRoute = record ? { type: 'channel', key: record.key } : { type: 'new-channel' };
    const value = record ? structuredClone(record.value) : M.newChannel(), history = record ? M.history(record.key, data.launches).slice(0, 3) : [];
    const notesAsPrimary = !value.fit && !!value.notes;
    showDialog(record ? value.name : 'Add a channel', 'Keep shared notes, links, and posting guidance for your team.', `<p class="form-help">These channel details are shared across launches.</p>${field('channel-name', 'Channel or contact name', value.name, 'text', 150, true)}${area('channel-fit', 'Channel notes', value.fit || value.notes)}<div class="form-two">${select('channel-kind', 'Channel type', M.kinds, value.kind)}${field('channel-url', 'Destination / contact reference URL', value.url, 'url', 2000)}</div>${area('channel-relationship', 'Who can post / contact details', value.relationship)}${area('channel-rules', 'Posting rules and source of guidance', value.rules)}<div class="form-two">${select('channel-links', 'External links', { unknown: 'Not checked', allowed: 'Allowed', native: 'Native post only / no external links' }, value.linkPolicy)}${select('channel-approval', 'Admin approval', { unknown: 'Not checked', required: 'Required', none: 'Not required' }, value.approval)}</div><div class="form-two">${select('channel-checked', 'Rules status', { unverified: 'Needs checking', verified: 'Checked' }, value.ruleStatus)}${field('channel-date', 'Rules checked on', value.verifiedDate, 'date')}</div>${value.fit && value.notes ? `<details><summary>Earlier saved notes</summary>${area('channel-notes', 'Earlier notes', value.notes)}</details>` : ''}${channelLaunchContext(record)}${record ? `<label class="check-row"><input id="channel-archived" type="checkbox"${value.archived ? ' checked' : ''}>Archive this channel (keep its history)</label>` : ''}${history.length ? `<div><h3>Recent activity</h3>${history.map(item => `<div class="history-item"><strong>${h(item.launch)}</strong><p class="muted">${h(activityText(item.task.activityAt))} · ${h(M.statusLabels[item.task.status])}</p>${link(item.task.liveUrl, 'Open post / coverage')}${item.task.outcome ? `<p>${h(item.task.outcome)}</p>` : ''}</div>`).join('')}</div>` : ''}`, form => {
      const checked = form.get('channel-checked'), verifiedDate = form.get('channel-date'), rules = form.get('channel-rules').trim();
      if (checked === 'verified' && (!verifiedDate || !rules)) throw Error('Add the checked date and posting rules before marking them checked.');
      if (verifiedDate && verifiedDate > new Date().toISOString().slice(0, 10)) throw Error('The rules checked date cannot be in the future.');
      Object.assign(value, { name: form.get('channel-name').trim(), url: form.get('channel-url').trim(), kind: form.get('channel-kind'), fit: form.get('channel-fit').trim(), rules, ruleStatus: checked, verifiedDate, linkPolicy: form.get('channel-links'), approval: form.get('channel-approval'), relationship: form.get('channel-relationship').trim(), notes: form.has('channel-notes') ? form.get('channel-notes').trim() : notesAsPrimary ? '' : value.notes, archived: !!$('channel-archived')?.checked });
      const target = record || { key: M.uid(), value, version: 0, createdAt: Date.now(), updatedAt: Date.now() };
      target.value = value; if (value.archived) selectedChannels.delete(target.key); if (!record) data.channels.push(target); save('channel', target); render();
    });
    $('edit-form').classList.add('channel-editor');
    $('channel-fit').placeholder = 'Anything to remember about this channel—ideas, posting tips, or reminders.';
    if (focusNotes) { $('channel-fit').focus(); $('channel-fit').scrollIntoView({ block: 'center' }); }
  }
  function renderLibrary() {
    clearMediumPickers();
    $('content').innerHTML = `<div class="channels-page"><div class="page-heading"><div><p class="eyebrow">Start with distribution</p><h1>Choose your channels.</h1><p>Pick the destinations for your next launch, then make a plan.</p></div><button type="button" data-action="add-channel">＋ Add channel</button></div><div class="channel-selection-bar"><div><strong id="home-selection-count">0 channels selected</strong><small id="home-selection-media">Choose from any medium below.</small></div><div class="actions"><button type="button" class="quiet" id="clear-selection" data-action="clear-channel-selection" disabled>Clear</button><button type="button" class="primary" id="create-selected-launch" data-action="launch-from-channels" disabled>Create launch →</button></div></div><div id="library-media"></div><div class="channel-search-row"><input id="library-search" type="search" class="search-input" aria-label="Search channel library" placeholder="Search across all media…" value="${h(query)}"><label class="archive-toggle"><input type="checkbox" id="show-archived"${showArchived ? ' checked' : ''}>Include archived</label></div><div class="channel-list-meta"><small id="library-count"></small><small>Click channel notes to edit, or use Edit channel.</small></div><div id="library-list"></div></div>`;
    $('library-search').addEventListener('input', event => { query = event.target.value; renderLibraryRows(); });
    $('show-archived').addEventListener('change', event => { showArchived = event.target.checked; renderLibraryRows(); writeRoute(); }); renderLibraryRows();
  }
  function updateChannelSelection() {
    const selected = data.channels.filter(record => selectedChannels.has(record.key) && !record.value.archived);
    const mediumCount = new Set(selected.map(record => M.medium(record.value))).size;
    $('home-selection-count').textContent = `${selected.length} channel${selected.length === 1 ? '' : 's'} selected`;
    $('home-selection-media').textContent = mediumCount ? `Across ${mediumCount} distribution ${mediumCount === 1 ? 'medium' : 'media'}` : 'Choose from any medium below.';
    $('create-selected-launch').disabled = selected.length === 0; $('clear-selection').disabled = selected.length === 0;
  }
  function renderLibraryRows() {
    const all = data.channels.filter(record => showArchived || !record.value.archived);
    const active = query ? 'all' : availableMedium(all, channelFilter);
    const records = all.filter(record => (active === 'all' || (active === 'selected' ? selectedChannels.has(record.key) : M.medium(record.value) === active)) && `${record.value.name} ${record.value.notes} ${record.value.relationship} ${record.value.fit} ${M.media[M.medium(record.value)]}`.toLowerCase().includes(query.toLowerCase()));
    mountMediumControls('library-media', all, selectedChannels, active, 'library');
    $('library-count').textContent = `${records.length} ${records.length === 1 ? 'destination' : 'destinations'}${query ? ' found across all media' : active === 'selected' ? ' selected' : active === 'all' ? ' across all media' : ` on ${M.media[active]}`}`;
    $('library-list').innerHTML = records.length ? compactChannels(records, selectedChannels, 'library', active === 'all' || active === 'selected') : '<p class="muted channel-empty">No matching channels. Try another medium or search.</p>';
    updateChannelSelection();
  }
  function editCheck(check) {
    editorRoute = { type: 'check', key: check.id };
    showDialog('Checklist item', '', `${field('check-name', 'What needs to happen?', check.label, 'text', 300, true)}${select('check-owner', 'Owner', people(), check.owner)}`, form => { check.label = form.get('check-name').trim(); check.owner = form.get('check-owner'); updateLaunch(); renderLaunch(); });
  }
  function addMaterial() {
    editorRoute = { type: 'material' };
    const value = current().value;
    showDialog('Add a material', 'Keep source files and visuals in their existing shared location.', `${field('material-name', 'Name', '', 'text', 150, true)}${field('material-url', 'Link', '', 'url', 2000, true)}`, form => { value.materials.push({ id: M.uid(), name: form.get('material-name').trim(), url: form.get('material-url').trim() }); updateLaunch(); renderLaunch(); });
  }
  async function copyPageLink() {
    if (!data) return;
    const url = location.origin + location.pathname + R.serialize(currentRoute());
    try { await navigator.clipboard.writeText(url); announce('Link copied. Approved teammates can open this screen after signing in.'); }
    catch { window.prompt('Copy this link:', url); }
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); announce('Copied to clipboard.'); }
    catch { showDialog('Copy this text', 'Select and copy the text below.', area('copy-text', 'Checklist or draft', text, 100000, 14), () => {}); $('copy-text').focus(); $('copy-text').select(); }
  }
  function launchOptions() {
    editorRoute = { type: 'actions' };
    const record = current(), value = record.value;
    showDialog('Launch actions', value.name, `<button type="button" data-action="complete-launch">${value.status === 'complete' ? 'Reopen launch' : 'Mark launch complete'}</button><button type="button" data-action="add-material">Add a reference link</button><button type="button" data-action="duplicate-launch">Duplicate with fresh progress</button><p class="form-help">Keeps the channel choices, angles, materials, and checklist. Clears drafts, live links, outcomes, dates, and checkmarks.</p><button type="button" data-action="archive-launch">${value.status === 'archived' ? 'Restore launch' : 'Archive launch'}</button>`, () => {});
  }
  async function action(event) {
    const button = event.target.closest('[data-action]'); if (!button || !data) return;
    const name = button.dataset.action, record = current();
    if (name === 'close-dialog') { closeDialog(true); return; }
    if (name === 'copy-page-link') { await copyPageLink(); return; }
    if (name === 'add-launch') { addLaunch(); return; }
    if (name === 'library') { setView('channels'); return; }
    if (name === 'back-launches') { routeError = null; editorRoute = null; view = 'launches'; activeKey = null; render(); return; }
    if (name === 'launch-filter') { launchFilter = button.dataset.filter; renderLaunches(); return; }
    if (name === 'library-medium') { channelFilter = button.dataset.medium; query = ''; $('library-search').value = ''; renderLibraryRows(); return; }
    if (name === 'chooser-medium') { chooserMedium = button.dataset.medium; channelQuery = ''; $('chooser-search').value = ''; renderChoices(); return; }
    if (name === 'clear-channel-selection') { selectedChannels.clear(); renderLibraryRows(); return; }
    if (name === 'launch-from-channels') { if (selectedChannels.size) addLaunch(null, [...selectedChannels]); return; }
    if (name === 'channel-guidance') { showChannelGuidance(channel(button.dataset.key)); return; }
    if (name === 'open-launch') { routeError = null; editorRoute = null; view = 'launches'; activeKey = button.dataset.key; step = 'choose'; chooserMedium = 'all'; channelQuery = ''; render(); return; }
    if (name === 'add-channel') { editChannel(); return; }
    if (name === 'edit-channel' || name === 'edit-channel-notes' || name === 'edit-destination') {
      if (name === 'edit-destination' && dialogDirty && !window.confirm('Leave this task without saving your changes?')) return;
      editChannel(channel(button.dataset.key), name === 'edit-channel-notes'); return;
    }
    if (!record) return;
    const value = record.value;
    if (name === 'hide-launch-channel' || name === 'restore-launch-channel') {
      if ($('editor').open && dialogDirty && !window.confirm('Leave these channel details without saving your changes?')) return;
      const key = button.dataset.key;
      if (value.tasks.some(task => task.channelKey === key)) return;
      const hidden = new Set(value.hiddenChannelKeys || []);
      if (name === 'hide-launch-channel') hidden.add(key); else hidden.delete(key);
      value.hiddenChannelKeys = [...hidden]; updateLaunch(); closeDialog(); editorRoute = null;
      if (step === 'choose' && $('choice-list')) renderChoices(); else renderLaunch();
      return;
    }
    if (name === 'remove-launch-channel') {
      if ($('editor').open && dialogDirty && !window.confirm('Leave these channel details without saving your changes?')) return;
      if (removeLaunchChannel(button.dataset.key)) {
        closeDialog(); editorRoute = null; renderLaunch();
      }
      return;
    }
    if (name === 'edit-brief') editBrief(record);
    if (name === 'launch-options') launchOptions();
    if (name === 'add-material') addMaterial();
    if (name === 'remove-material') { value.materials = value.materials.filter(item => item.id !== button.dataset.id); updateLaunch(); renderLaunch(); }
    if (name === 'remove-check') { value.checks = value.checks.filter(item => item.id !== button.dataset.id); updateLaunch(); renderLaunch(); }
    if (name === 'edit-check') editCheck(value.checks.find(item => item.id === button.dataset.id));
    if (name === 'edit-task') editTask(value.tasks.find(item => item.id === button.dataset.id));
    if (name === 'copy-draft') { await copy($('task-draft').value); }
    if (name === 'copy-checklist') await copy(M.ticket(value));
    if (name === 'duplicate-launch') { closeDialog(); addLaunch(record); }
    if (name === 'archive-launch') { value.status = value.status === 'archived' ? 'active' : 'archived'; updateLaunch(); closeDialog(); activeKey = null; render(); }
    if (name === 'complete-launch') {
      value.status = value.status === 'complete' ? 'active' : 'complete'; updateLaunch(); closeDialog(); renderLaunch();
    }
  }
  function dispatch(event) {
    void action(event).then(() => { if (!$('editor').open) editorRoute = null; writeRoute(); });
  }
  $('content').addEventListener('click', dispatch);
  $('content').addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('[data-posting-as]')) { event.preventDefault(); event.target.blur(); }
  });
  $('editor-content').addEventListener('click', dispatch);
  $('editor').addEventListener('close', () => { if (!$('editor').open) { clearDialog(); editorRoute = null; writeRoute(); } });
  $('content').addEventListener('change', event => {
    if (!data) return;
    const libraryKey = event.target.dataset.libraryChannel;
    if (libraryKey) {
      if (event.target.checked) selectedChannels.add(libraryKey); else selectedChannels.delete(libraryKey);
      updateChannelSelection();
      const records = data.channels.filter(record => showArchived || !record.value.archived);
      mountMediumControls('library-media', records, selectedChannels, query ? 'all' : availableMedium(records, channelFilter), 'library');
      if (channelFilter === 'selected' && !query) renderLibraryRows();
      return;
    }
    if (!current()) return;
    const value = current().value, postingId = event.target.dataset.postingAs;
    if (postingId) {
      const task = value.tasks.find(item => item.id === postingId);
      if (task) { task.postingAs = event.target.value.trim(); event.target.value = task.postingAs; updateLaunch(); }
      return;
    }
    const checkId = event.target.dataset.check, channelKey = event.target.dataset.channel;
    if (checkId) { value.checks.find(item => item.id === checkId).done = event.target.checked; updateLaunch(); renderLaunch(); }
    if (channelKey) {
      const existing = value.tasks.find(task => task.channelKey === channelKey);
      if (event.target.checked && !existing) value.tasks.push(M.addTask(channel(channelKey), value.owner));
      if (!event.target.checked && existing) {
        if (!removeLaunchChannel(channelKey)) { event.target.checked = true; return; }
        renderLaunch(); return;
      }
      updateLaunch(); renderLaunch();
    }
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { if (data) setView(button.dataset.view); }));
  $('copy-view-link').addEventListener('click', () => { void copyPageLink(); });
  window.LaunchApp = {
    open({ workspace, onSave }) {
      closeDialog();
      data = structuredClone(workspace); saveRecord = onSave;
      for (const key of selectedChannels) if (!data.channels.some(record => record.key === key && !record.value.archived)) selectedChannels.delete(key);
      $('team-label').textContent = `Shared with ${data.members.map(member => member.name).join(', ')}`;
      applyRoute(); writeRoute(true);
    },
    lock() { closeDialog(); editorRoute = null; routeError = null; clearMediumPickers(); data = null; saveRecord = null; view = 'channels'; activeKey = null; step = 'choose'; channelFilter = 'all'; chooserMedium = 'all'; selectedChannels.clear(); query = ''; channelQuery = ''; $('content').replaceChildren(); $('team-label').textContent = ''; },
    exportData() { return structuredClone(data); },
    hasDraft() { return dialogDirty; },
  };
})();
