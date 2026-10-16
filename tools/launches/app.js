(() => {
  'use strict';
  const M = window.LaunchModel, R = window.LaunchRoutes, $ = id => document.getElementById(id);
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let data = null, saveRecord, view = 'channels', activeKey = null, step = 'choose', launchFilter = 'active', channelFilter = 'facebook', chooserMedium = 'facebook', query = '', channelQuery = '', showArchived = false, pickerHandles = [], dialogDirty = false;
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
      view = route.view; activeKey = route.launchKey; step = route.step; launchFilter = route.status;
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
    $('content').innerHTML = `<div class="page-heading"><div><p class="eyebrow">One launch at a time</p><h1>Your next launch starts here.</h1><p>A fresh plan, the right channels, and a clear next step.</p></div><button class="primary" type="button" data-action="add-launch">＋ Add launch</button></div><div class="toolbar"><div class="filter-buttons" aria-label="Launch status">${['active', 'complete', 'archived'].map(status => `<button type="button" data-action="launch-filter" data-filter="${status}" aria-pressed="${launchFilter === status}">${status === 'active' ? 'In progress' : status === 'complete' ? 'Completed' : 'Archived'}</button>`).join('')}</div><input id="launch-search" class="search-input" type="search" aria-label="Search launches" placeholder="Search launches…" value="${h(query)}"></div><div id="launch-list"></div>`;
    $('launch-search').addEventListener('input', event => { query = event.target.value; renderLaunchCards(); }); renderLaunchCards();
  }
  function renderLaunchCards() {
    const records = data.launches.filter(record => record.value.status === launchFilter && `${record.value.name} ${record.value.summary} ${record.value.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!records.length) {
      $('launch-list').innerHTML = query || launchFilter !== 'active' ? '<div class="empty"><h2>No launches here yet.</h2><p>Try another search or status.</p></div>' : `<div class="empty"><span class="empty-mark" aria-hidden="true">↗</span><h2>Good news deserves a good launch.</h2><p>Add a launch, choose the channels that fit, and work through your checklist.</p><button type="button" class="primary" data-action="add-launch">＋ Add your first launch</button><p style="margin-bottom:0;margin-top:18px"><button class="text-button" type="button" data-action="library">Explore your channel library →</button></p></div>`; return;
    }
    $('launch-list').innerHTML = `<div class="launch-grid">${records.map(record => { const value = record.value, progress = M.progress(value); return `<button type="button" class="launch-card" data-action="open-launch" data-key="${h(record.key)}"><div class="card-top">${badge(M.types[value.type])}${value.dueDate ? `<small>${h(dateText(value.dueDate))}</small>` : ''}</div><div><h2>${h(value.name)}</h2><p>${h(value.summary.slice(0, 125) || `${value.tasks.length} channels selected`)}</p></div>${tagList(value.tags.slice(0, 4))}<div class="card-bottom"><span>${h(memberName(value.owner))}</span><span>${progress.complete} / ${progress.total} done</span></div><div class="progress-track" aria-label="${progress.complete} of ${progress.total} complete"><div class="progress-fill" style="width:${progress.total ? 100 * progress.complete / progress.total : 0}%"></div></div></button>`; }).join('')}</div>`;
  }
  function addLaunch(from = null, channelKeys = []) {
    const record = { key: M.uid(), value: from ? M.duplicate(from.value) : M.newLaunch(data.email), version: 0, createdAt: Date.now(), updatedAt: Date.now(), updatedBy: data.email };
    if (!from) record.value.tasks = channelKeys.map(key => channel(key)).filter(item => item && !item.value.archived).map(item => M.addTask(item, record.value.owner));
    selectedChannels.clear(); data.launches.push(record); save('launch', record); activeKey = record.key; view = 'launches'; step = channelKeys.length ? 'prepare' : 'choose'; render(); editBrief(record, !from);
  }
  function editBrief(record, fresh = false) {
    editorRoute = { type: 'launch' };
    const value = record.value;
    showDialog(fresh ? 'Start your launch' : 'Launch details', fresh ? 'Give it a name. Everything else can wait.' : 'The shared source of truth for this launch.', `${field('launch-name', 'Launch name', value.name === 'Untitled launch' ? '' : value.name, 'text', 150, true)}${field('source-url', 'Source URL', value.sourceUrl, 'url', 2000)}${area('summary', 'What happened, and why does it matter?', value.summary, 10000)}<div class="form-two">${select('launch-type', 'Launch type', M.types, value.type)}${select('launch-owner', 'Launch owner', people(), value.owner)}</div>${field('audience-tags', 'Audience tags, separated by commas', value.tags.join(', '), 'text', 1000)}<p class="form-help">Use specific tags such as chase, csr, hyatt, amex, or venture x. Tags help shortlist communities.</p>${field('launch-date', 'Target date (optional)', value.dueDate, 'date')}`, form => {
      Object.assign(value, { name: form.get('launch-name').trim(), sourceUrl: form.get('source-url').trim(), summary: form.get('summary').trim(), type: form.get('launch-type'), owner: form.get('launch-owner'), tags: M.tags(form.get('audience-tags')), dueDate: form.get('launch-date') });
      if (value.type === 'tool' && !value.checks.some(check => check.label === 'Update the affected NextCard tool or content and complete QA before distribution')) value.checks.push({ id: M.uid(), stage: 'prepare', label: 'Update the affected NextCard tool or content and complete QA before distribution', done: false, owner: '' });
      save('launch', record); render();
    });
  }
  function renderLaunch() {
    clearMediumPickers();
    const record = current(), value = record.value, progress = M.progress(value);
    $('content').innerHTML = `<button type="button" class="text-button back" data-action="back-launches">← All launches</button><div class="launch-heading"><div class="launch-title"><p class="eyebrow">${h(M.types[value.type])}</p><h1>${h(value.name)}</h1><p class="launch-meta">${h(memberName(value.owner))}${value.dueDate ? ` · Target ${h(dateText(value.dueDate))}` : ''} · ${progress.complete} of ${progress.total} actions complete ${value.status !== 'active' ? ` · ${h(value.status)}` : ''}</p>${tagList(value.tags)}</div><div class="actions"><button type="button" data-action="edit-brief">Edit details</button><button class="quiet" type="button" data-action="launch-options" aria-label="More launch actions">More actions</button></div></div><div class="launch-layout"><section class="panel"><nav class="step-nav" role="tablist" aria-label="Launch stages">${[['choose', 'Channels'], ['prepare', 'Prepare'], ['distribute', 'Distribute'], ['followup', 'Follow up']].map(([key, label], index) => `<button id="tab-${key}" role="tab" aria-controls="step-content" aria-selected="${step === key}" type="button" data-action="step" data-step="${key}"><span class="step-number">${index + 1}</span>${label}</button>`).join('')}</nav><div id="step-content" role="tabpanel" aria-labelledby="tab-${h(step)}"></div></section><aside class="aside-stack"><section class="panel"><h2>The story</h2><p class="source-summary">${h(value.summary || 'Add the key takeaway and supporting facts in launch details.')}</p>${link(value.sourceUrl, 'Open source')}${!value.sourceUrl ? '<button type="button" class="text-button" data-action="edit-brief">＋ Add source</button>' : ''}</section><section class="panel"><div class="row-between"><h2>Materials</h2><button type="button" class="text-button" data-action="add-material">＋ Add</button></div><p class="muted">Links to visuals, docs, tools, and research.</p>${value.materials.map(item => `<div class="material">${link(item.url, item.name)}<button type="button" data-action="remove-material" data-id="${h(item.id)}" aria-label="Remove ${h(item.name)}">×</button></div>`).join('') || '<small>No materials added yet.</small>'}</section><section class="panel"><h2>Launch progress</h2><p><strong>${progress.complete}</strong> / ${progress.total} actions complete</p><div class="progress-track" role="progressbar" aria-label="Launch progress" aria-valuemin="0" aria-valuemax="${progress.total || 1}" aria-valuenow="${progress.complete}"><div class="progress-fill" style="width:${progress.total ? 100 * progress.complete / progress.total : 0}%"></div></div><button type="button" class="text-button" style="margin-top:14px" data-action="copy-checklist">Copy checklist</button></section></aside></div>`;
    if (step === 'choose') renderChooser(); else if (step === 'distribute') renderDistribution(); else renderChecks();
  }
  function renderChecks() {
    const value = current().value, checks = value.checks.filter(check => check.stage === step);
    $('step-content').innerHTML = `<h2>${step === 'prepare' ? 'Get the story ready.' : 'Close the loop.'}</h2><p class="step-intro">${step === 'prepare' ? 'Verify the facts and gather what you need before distribution.' : 'Review submissions, collect responses, and leave a useful lesson for next time.'}</p><div>${checks.map(check => `<div class="check-row"><label><input type="checkbox" data-check="${h(check.id)}"${check.done ? ' checked' : ''}><span class="${check.done ? 'completed' : ''}">${h(check.label)}</span></label><button type="button" class="quiet" data-action="edit-check" data-id="${h(check.id)}" aria-label="Edit checklist item and owner">${check.owner ? h(memberName(check.owner)) : 'Edit'}</button><button type="button" class="remove" data-action="remove-check" data-id="${h(check.id)}" aria-label="Remove ${h(check.label)}">×</button></div>`).join('')}</div><form id="add-check-form" class="add-row"><input id="check-label" aria-label="New checklist item" placeholder="Add a checklist item…" maxlength="300" required><button type="submit">Add</button></form>${step === 'followup' ? `${area('launch-notes', 'Results & lessons', value.notes, 10000, 4)}<p class="form-help">Saved when you leave this field. Add channel-specific results inside each distribution task.</p>` : ''}<div class="next-row"><small>${checks.filter(check => check.done).length} of ${checks.length} checked</small><button type="button" class="primary" data-action="${step === 'prepare' ? 'next-distribute' : 'complete-launch'}">${step === 'prepare' ? 'Work on distribution →' : value.status === 'complete' ? 'Reopen launch' : 'Mark launch complete'}</button></div>`;
    $('add-check-form').addEventListener('submit', event => { event.preventDefault(); const label = $('check-label').value.trim(); if (!label) return; value.checks.push({ id: M.uid(), label, stage: step, done: false, owner: '' }); updateLaunch(); renderLaunch(); $('check-label').focus(); });
    if ($('launch-notes')) $('launch-notes').addEventListener('change', event => { value.notes = event.target.value; updateLaunch(); });
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
    return ['all', 'selected'].includes(preferred) || records.some(record => M.medium(record.value) === preferred) ? preferred : records.length ? M.medium(records[0].value) : 'all';
  }
  function compactChannels(records, selected, scope, grouped = false) {
    const renderRows = values => `<div class="compact-channel-grid">${values.map(record => {
      const value = record.value, suggestion = scope === 'chooser' ? M.suggestion(value, current().value) : null;
      const metadata = [value.archived ? 'Archived' : '', value.kind === 'owned' ? 'NextCard' : '', ...value.tags.filter(tag => tag !== 'general').slice(0, 2)].filter(Boolean).join(' · ') || 'General audience';
      return `<article class="compact-channel${value.archived ? ' is-archived' : ''}"><label class="compact-channel-choice"><input type="checkbox" data-${scope === 'library' ? 'library-channel' : 'channel'}="${h(record.key)}" aria-label="Select ${h(value.name)}"${selected.has(record.key) ? ' checked' : ''}${value.archived && !selected.has(record.key) ? ' disabled' : ''}><span><strong>${h(value.name)}</strong><small>${h(metadata)}${suggestion ? ` · ${h(suggestion.label)}` : ''}</small></span></label><button type="button" class="channel-detail" data-action="${scope === 'library' ? 'edit-channel' : 'channel-guidance'}" data-key="${h(record.key)}" aria-label="Details for ${h(value.name)}">Details</button></article>`;
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
    const value = record.value, suggestion = M.suggestion(value, current().value), history = M.history(record.key, data.launches, activeKey).slice(0, 3);
    showDialog(value.name, `${M.media[M.medium(value)]} · ${M.kinds[value.kind]}`, `<p class="guidance-text">${h(suggestion.reason)}</p>${value.fit ? `<div><h3>Audience fit</h3><p class="guidance-text">${h(value.fit)}</p></div>` : ''}<div class="rule-note">${value.ruleStatus === 'verified' ? `Guidance checked ${h(value.verifiedDate)}.` : 'Posting rules need checking.'} ${value.linkPolicy === 'native' ? 'No external links; use a complete native post.' : value.linkPolicy === 'allowed' ? 'Links recorded as allowed.' : 'Link permissions are not recorded.'}${value.approval === 'required' ? ' Admin approval required.' : ''}</div>${value.rules ? `<p class="guidance-text">${h(value.rules)}</p>` : ''}${value.relationship ? `<p class="guidance-text">${h(value.relationship)}</p>` : ''}${value.notes ? `<p class="form-help">${h(value.notes)}</p>` : ''}${link(value.url, 'Open destination / contact reference')}${history.length ? `<div><h3>Previous activity</h3>${history.map(item => `<div class="history-item"><strong>${h(item.launch)}</strong><p>${h(activityText(item.task.activityAt))}</p>${item.task.outcome ? `<p>${h(item.task.outcome)}</p>` : ''}</div>`).join('')}</div>` : ''}<button type="button" data-action="edit-destination" data-key="${h(record.key)}">Edit channel guidance</button>`, () => {});
  }
  function renderChooser() {
    const value = current().value;
    $('step-content').innerHTML = `<h2>Choose your channels.</h2><p class="step-intro">Browse by medium. Your selections stay with you as you switch.</p><div class="chooser-selection"><span id="selected-count"></span><button type="button" class="primary" data-action="next-prepare">Prepare launch →</button></div><div id="chooser-media"></div><div class="channel-search-row"><input class="search-input" id="chooser-search" type="search" aria-label="Search channel choices" placeholder="Search across all media…" value="${h(channelQuery)}"><details class="audience-options"><summary>Audience tags</summary><label for="chooser-tags" class="audience-field"><span class="sr-only">Audience tags</span><input id="chooser-tags" value="${h(value.tags.join(', '))}" maxlength="1000" placeholder="chase, csr, dining"></label></details></div><div id="choice-list" class="choice-list"></div>`;
    $('chooser-tags').addEventListener('change', event => { value.tags = M.tags(event.target.value); updateLaunch(); renderChoices(); });
    $('chooser-search').addEventListener('input', event => { channelQuery = event.target.value; renderChoices(); }); renderChoices();
  }
  function renderChoices() {
    const value = current().value, selected = new Set(value.tasks.map(task => task.channelKey));
    const all = data.channels.filter(record => !record.value.archived || selected.has(record.key));
    const active = channelQuery ? 'all' : availableMedium(all, chooserMedium);
    const records = all.filter(record => (!channelQuery ? active === 'all' || (active === 'selected' ? selected.has(record.key) : M.medium(record.value) === active) : true) && `${record.value.name} ${record.value.tags.join(' ')} ${M.media[M.medium(record.value)]}`.toLowerCase().includes(channelQuery.toLowerCase()));
    mountMediumControls('chooser-media', all, selected, active, 'chooser');
    $('choice-list').innerHTML = records.length ? compactChannels(records, selected, 'chooser', active === 'all' || active === 'selected') : '<p class="muted channel-empty">No channels here. Try another medium or search.</p>';
    $('selected-count').textContent = `${value.tasks.length} channels selected`;
  }
  function renderDistribution() {
    const value = current().value, pending = value.tasks.filter(task => !M.done(task));
    $('step-content').innerHTML = `<h2>One useful post at a time.</h2><p class="step-intro">Open a task for its draft, destination, rules, and history. Publish in the channel, then update its status here.</p>${!value.tasks.length ? '<div class="task-empty"><p class="muted">Choose a few relevant channels to create your distribution tasks.</p><button type="button" data-action="next-choose">Choose channels</button></div>' : `<div class="task-list">${value.tasks.map(task => `<article class="task-row"><button type="button" class="task-open" data-action="edit-task" data-id="${h(task.id)}"><span><strong>${h(task.channelName)}</strong><small>${h(memberName(task.owner))}${task.dueDate ? ` · ${h(dateText(task.dueDate))}` : ''}${task.angle ? ` · ${h(task.angle.slice(0, 90))}` : ''}</small></span>${badge(M.statusLabels[task.status], task.status)}</button></article>`).join('')}</div>`}<div class="next-row"><small>${pending.length} remaining · ${value.tasks.filter(task => task.status === 'waiting').length} awaiting approval</small><button type="button" class="primary" data-action="next-followup">Follow up →</button></div>`;
  }
  function editTask(task) {
    editorRoute = { type: 'task', key: task.id };
    const destination = channel(task.channelKey), details = destination?.value, previous = M.history(task.channelKey, data.launches, activeKey).slice(0, 3);
    const statuses = Object.fromEntries((task.channelKind === 'outreach' ? ['draft', 'ready', 'sent', 'skipped'] : ['draft', 'ready', 'submitted', 'waiting', 'live', 'skipped']).map(status => [status, M.statusLabels[status]]));
    const currentRules = details?.ruleStatus === 'verified' && details.verifiedDate && Date.now() - Date.parse(details.verifiedDate) < 90 * 86400000;
    showDialog(task.channelName, M.kinds[task.channelKind], `<div>${details ? link(details.url, task.channelKind === 'outreach' ? 'Open contact reference' : 'Open destination') : ''}${!details?.url ? '<p class="muted">Add the destination URL in the channel library.</p>' : ''}<div class="rule-note ${currentRules ? 'checked' : ''}">${currentRules ? `Rules checked ${h(activityText(Date.parse(details.verifiedDate)))}.` : 'Posting rules need checking or refreshing.'} ${details?.linkPolicy === 'native' ? '<strong>No external links — make the post useful on its own.</strong>' : details?.linkPolicy === 'allowed' ? 'Links recorded as allowed; confirm they help this audience.' : 'Link permissions not recorded.'}${details?.approval === 'required' ? ' Admin approval is required.' : ''}</div>${details?.rules ? `<p class="source-summary">${h(details.rules)}</p>` : ''}${details?.relationship ? `<p class="form-help">Contact / access: ${h(details.relationship)}</p>` : ''}${details?.notes ? `<details><summary class="form-help">Channel notes</summary><p class="form-help source-summary">${h(details.notes)}</p></details>` : ''}<button type="button" class="text-button" data-action="edit-destination" data-key="${h(task.channelKey)}">Edit channel guidance</button></div>${area('task-angle', task.channelKind === 'outreach' ? 'News angle for this contact' : 'Member takeaway / post angle', task.angle, 2000, 2)}${area('task-draft', task.channelKind === 'outreach' ? 'Pitch draft' : 'Post draft', task.draft, 20000, 10)}<div class="row-between"><button type="button" data-action="copy-draft">Copy draft</button><small>Publishing and sending happen outside this tool.</small></div><div class="form-two">${select('task-status', 'Status', statuses, task.status)}${select('task-owner', 'Task owner', people(), task.owner)}</div><div class="form-two">${field('task-date', 'Target date (optional)', task.dueDate, 'date')}${field('task-url', task.channelKind === 'outreach' ? 'Coverage URL (optional)' : 'Live post URL (optional)', task.liveUrl, 'url', 2000)}</div>${area('task-outcome', 'Results & lessons', task.outcome, 5000)}${previous.length ? `<div><h3>Previous launches in this channel</h3>${previous.map(item => `<div class="history-item"><strong>${h(item.launch)}</strong><p class="muted">${h(activityText(item.task.activityAt))} · ${h(M.statusLabels[item.task.status])}</p>${link(item.task.liveUrl, 'Open previous post / coverage')}${item.task.outcome ? `<p>${h(item.task.outcome)}</p>` : ''}${item.task.draft ? `<details><summary class="form-help">Previous copy</summary><p class="past-draft">${h(item.task.draft)}</p></details>` : ''}</div>`).join('')}</div>` : ''}`, form => {
      const status = form.get('task-status');
      Object.assign(task, { angle: form.get('task-angle').trim(), draft: form.get('task-draft'), owner: form.get('task-owner'), dueDate: form.get('task-date'), status, liveUrl: form.get('task-url').trim(), outcome: form.get('task-outcome'), activityAt: status !== task.status && ['submitted', 'waiting', 'live', 'sent'].includes(status) ? Date.now() : task.activityAt });
      updateLaunch(); renderLaunch();
    });
  }
  function editChannel(record = null) {
    editorRoute = record ? { type: 'channel', key: record.key } : { type: 'new-channel' };
    const value = record ? structuredClone(record.value) : M.newChannel(), history = record ? M.history(record.key, data.launches).slice(0, 3) : [];
    showDialog(record ? value.name : 'Add a channel', 'Remember the audience, access, and guidance for next time.', `${field('channel-name', 'Channel or contact name', value.name, 'text', 150, true)}<div class="form-two">${select('channel-kind', 'Channel type', M.kinds, value.kind)}${field('channel-url', 'Destination / contact reference URL', value.url, 'url', 2000)}</div>${field('channel-tags', 'Audience tags, separated by commas', value.tags.join(', '), 'text', 1000)}${area('channel-fit', 'Best content fit', value.fit)}${area('channel-relationship', 'Who can post / contact details', value.relationship)}${area('channel-rules', 'Posting rules and source of guidance', value.rules)}<div class="form-two">${select('channel-links', 'External links', { unknown: 'Not checked', allowed: 'Allowed', native: 'Native post only / no external links' }, value.linkPolicy)}${select('channel-approval', 'Admin approval', { unknown: 'Not checked', required: 'Required', none: 'Not required' }, value.approval)}</div><div class="form-two">${select('channel-checked', 'Rules status', { unverified: 'Needs checking', verified: 'Checked' }, value.ruleStatus)}${field('channel-date', 'Rules checked on', value.verifiedDate, 'date')}</div>${area('channel-notes', 'Notes for next time', value.notes)}${record ? `<label class="check-row"><input id="channel-archived" type="checkbox"${value.archived ? ' checked' : ''}>Archive this channel (keep its history)</label>` : ''}${history.length ? `<div><h3>Recent activity</h3>${history.map(item => `<div class="history-item"><strong>${h(item.launch)}</strong><p class="muted">${h(activityText(item.task.activityAt))} · ${h(M.statusLabels[item.task.status])}</p>${link(item.task.liveUrl, 'Open post / coverage')}${item.task.outcome ? `<p>${h(item.task.outcome)}</p>` : ''}</div>`).join('')}</div>` : ''}`, form => {
      const checked = form.get('channel-checked'), verifiedDate = form.get('channel-date'), rules = form.get('channel-rules').trim();
      if (checked === 'verified' && (!verifiedDate || !rules)) throw Error('Add the checked date and posting rules before marking them checked.');
      if (verifiedDate && verifiedDate > new Date().toISOString().slice(0, 10)) throw Error('The rules checked date cannot be in the future.');
      Object.assign(value, { name: form.get('channel-name').trim(), url: form.get('channel-url').trim(), kind: form.get('channel-kind'), tags: M.tags(form.get('channel-tags')), fit: form.get('channel-fit').trim(), rules, ruleStatus: checked, verifiedDate, linkPolicy: form.get('channel-links'), approval: form.get('channel-approval'), relationship: form.get('channel-relationship').trim(), notes: form.get('channel-notes').trim(), archived: !!$('channel-archived')?.checked });
      const target = record || { key: M.uid(), value, version: 0, createdAt: Date.now(), updatedAt: Date.now() };
      target.value = value; if (value.archived) selectedChannels.delete(target.key); if (!record) data.channels.push(target); save('channel', target); render();
    });
  }
  function renderLibrary() {
    clearMediumPickers();
    $('content').innerHTML = `<div class="channels-page"><div class="page-heading"><div><p class="eyebrow">Start with distribution</p><h1>Choose your channels.</h1><p>Pick the destinations for your next launch, then make a plan.</p></div><button type="button" data-action="add-channel">＋ Add channel</button></div><div class="channel-selection-bar"><div><strong id="home-selection-count">0 channels selected</strong><small id="home-selection-media">Choose from any medium below.</small></div><div class="actions"><button type="button" class="quiet" id="clear-selection" data-action="clear-channel-selection" disabled>Clear</button><button type="button" class="primary" id="create-selected-launch" data-action="launch-from-channels" disabled>Create launch →</button></div></div><div id="library-media"></div><div class="channel-search-row"><input id="library-search" type="search" class="search-input" aria-label="Search channel library" placeholder="Search across all media…" value="${h(query)}"><label class="archive-toggle"><input type="checkbox" id="show-archived"${showArchived ? ' checked' : ''}>Include archived</label></div><div class="channel-list-meta"><small id="library-count"></small><small>Details holds posting rules, contacts & history.</small></div><div id="library-list"></div></div>`;
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
    const records = all.filter(record => (active === 'all' || (active === 'selected' ? selectedChannels.has(record.key) : M.medium(record.value) === active)) && `${record.value.name} ${record.value.tags.join(' ')} ${record.value.relationship} ${record.value.fit} ${M.media[M.medium(record.value)]}`.toLowerCase().includes(query.toLowerCase()));
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
    showDialog('Launch actions', value.name, `<button type="button" data-action="duplicate-launch">Duplicate with fresh progress</button><p class="form-help">Keeps the channel choices, angles, materials, and checklist. Clears drafts, live links, outcomes, dates, and checkmarks.</p><button type="button" data-action="archive-launch">${value.status === 'archived' ? 'Restore launch' : 'Archive launch'}</button>`, () => {});
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
    if (name === 'open-launch') { routeError = null; editorRoute = null; view = 'launches'; activeKey = button.dataset.key; step = 'choose'; render(); return; }
    if (name === 'add-channel') { editChannel(); return; }
    if (name === 'edit-channel' || name === 'edit-destination') {
      if (name === 'edit-destination' && dialogDirty && !window.confirm('Leave this task without saving your changes?')) return;
      editChannel(channel(button.dataset.key)); return;
    }
    if (!record) return;
    const value = record.value;
    if (name === 'edit-brief') editBrief(record);
    if (name === 'launch-options') launchOptions();
    if (name === 'step' || name.startsWith('next-')) { step = name === 'step' ? button.dataset.step : name.slice(5); renderLaunch(); }
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
      const progress = M.progress(value);
      if (value.status !== 'complete' && progress.complete < progress.total && !window.confirm(`${progress.total - progress.complete} actions are still open. Mark this launch complete anyway?`)) return;
      value.status = value.status === 'complete' ? 'active' : 'complete'; updateLaunch(); renderLaunch();
    }
  }
  function dispatch(event) {
    void action(event).then(() => { if (!$('editor').open) editorRoute = null; writeRoute(); });
  }
  $('content').addEventListener('click', dispatch);
  $('content').addEventListener('keydown', event => {
    if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const steps = ['choose', 'prepare', 'distribute', 'followup'];
    step = event.key === 'Home' ? steps[0] : event.key === 'End' ? steps[3] : steps[(steps.indexOf(step) + (event.key === 'ArrowRight' ? 1 : 3)) % 4];
    renderLaunch(); $(`tab-${step}`).focus(); writeRoute();
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
    const checkId = event.target.dataset.check, channelKey = event.target.dataset.channel, value = current().value;
    if (checkId) { value.checks.find(item => item.id === checkId).done = event.target.checked; updateLaunch(); renderLaunch(); }
    if (channelKey) {
      const existing = value.tasks.find(task => task.channelKey === channelKey);
      if (event.target.checked && !existing) value.tasks.push(M.addTask(channel(channelKey), value.owner));
      if (!event.target.checked && existing) {
        if ((existing.draft || existing.outcome || existing.activityAt) && !window.confirm('Remove this channel and its saved draft from this launch?')) { event.target.checked = true; return; }
        value.tasks = value.tasks.filter(task => task.channelKey !== channelKey);
      }
      updateLaunch(); renderChoices();
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
    lock() { closeDialog(); editorRoute = null; routeError = null; clearMediumPickers(); data = null; saveRecord = null; view = 'channels'; activeKey = null; step = 'choose'; channelFilter = 'facebook'; chooserMedium = 'facebook'; selectedChannels.clear(); query = ''; channelQuery = ''; $('content').replaceChildren(); $('team-label').textContent = ''; },
    exportData() { return structuredClone(data); },
    hasDraft() { return dialogDirty; },
  };
})();
