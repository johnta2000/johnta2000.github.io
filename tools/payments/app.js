(() => {
  'use strict';
  const API = 'https://rapid-shark-565.convex.cloud';
  const $ = id => document.getElementById(id);
  const labels = { unchecked: 'Not paid', scheduled: 'Not paid', paid: 'Paid', nothing_due: 'Paid' };
  const complete = status => status === 'paid' || status === 'nothing_due';
  const desktop = window.matchMedia('(min-width: 900px)');
  const today = new Date();
  // Keep the current deadline visible throughout the 1st; otherwise prepare for the next one.
  const deadline = new Date(today.getFullYear(), today.getMonth() + (today.getDate() > 1 ? 1 : 0), 1);
  $('month').value = `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}`;
  const pending = new Map();
  let saveWarning = '';
  let menuAccount = null;
  let session = null, sessionId, epoch = 0, request = 0, mounted = false;
  let data = null, busy = false, ready = false, entry = null, imports = [], editingAccount = null;

  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function message(id, text) { $(id).textContent = text; }
  function monthLabel(value) { return new Date(`${value}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }
  function selectedMonth() { return $('month').value; }
  function validMonth(value) { return /^20\d{2}-(0[1-9]|1[0-2])$/.test(value); }
  function activeAccounts() { return (data?.accounts || []).filter(a => a.startMonth <= selectedMonth() && (!a.endMonth || a.endMonth >= selectedMonth())); }
  function logFor(id) { return pending.get(`${selectedMonth()}/${id}`)?.desired || data?.logs.find(log => log.accountId === id); }
  function formatMoney(cents) { return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
  function dueLabel(account) {
    const [year, month] = selectedMonth().split('-').map(Number);
    const day = Math.min(account.dueDay, new Date(year, month, 0).getDate());
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function friendly(error) {
    const raw = error?.message || '';
    const recognized = raw.match(/(?:This entry changed on another device\.|This account is not authorized|Account not found\.|This account is not active|Enter a valid amount|Notes must|Choose a valid month|This account already has later history|The last month cannot|That account already exists|Due day must|Person must|Bank must|Nickname must)[^\n]*/);
    if (recognized) return recognized[0];
    return 'Couldn’t confirm the save. Check your connection, refresh, and review the entry before trying again.';
  }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('#app button, #app input, #app select, dialog button, dialog input, dialog select, dialog textarea').forEach(control => { control.disabled = value; });
  }
  function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(d => d.close()); entry = null; imports = []; }
  function clearPrivate() {
    ++request; pending.clear(); saveWarning = ''; closeMenu(); data = null; ready = false; editingAccount = null; closeDialogs(); setBusy(false);
    $('app').hidden = true; $('accounts').replaceChildren(); $('manage-list').replaceChildren(); $('import-preview').replaceChildren();
    $('entry-form').reset(); $('add-form').reset(); $('import-form').reset();
    ['entry-person', 'entry-title', 'entry-month', 'entry-error', 'add-error', 'manage-error', 'import-summary', 'import-error', 'save-state'].forEach(id => message(id, ''));
    $('people').replaceChildren(); $('person').replaceChildren(new Option('Everyone', ''));
  }
  async function tokenFor(current) {
    const token = await current.getToken();
    try {
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (claims.aud === 'convex' || claims.aud?.includes?.('convex')) return token;
    } catch { /* Fall through to the existing site's token template. */ }
    try { return await current.getToken({ template: 'convex' }); } catch { return token; }
  }
  async function call(kind, path, args, current = session) {
    if (!current) throw Error('Sign in again.');
    let timer, token;
    try { token = await Promise.race([tokenFor(current), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Token timed out')), 15000); })]); }
    finally { clearTimeout(timer); }
    if (current !== session) throw Error('Session changed.');
    const response = await fetch(`${API}/api/${kind}`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path: `cardPayments:${path}`, args, format: 'json' }),
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') throw Error(result.errorMessage || 'Request failed.');
    return result.value;
  }

  const bankIcons = { chase: 'chase', amex: 'amex', 'american express': 'amex', discover: 'discover', citi: 'citi', barclays: 'barclays', santander: 'santander', bilt: 'bilt', 'bank of america': 'boa', 'us bank': 'usbank', 'u.s. bank': 'usbank' };
  function bankIcon(bank) {
    const square = node('span', undefined, 'bank-icon'); square.setAttribute('aria-hidden', 'true');
    const icon = bankIcons[bank.toLowerCase()];
    const extension = ['amex', 'discover', 'barclays', 'usbank', 'citi'].includes(icon) ? 'svg' : 'png';
    if (icon) square.classList.add(`bank-${icon}`);
    if (icon) { const img = node('img'); img.src = `icons/${icon}.${extension}`; img.alt = ''; img.width = 24; img.height = 24; img.addEventListener('error', () => square.replaceChildren(node('span', bank.slice(0, 1)))); square.append(img); }
    else square.append(node('span', bank.slice(0, 1)));
    return square;
  }
  function saveMessage() {
    message('save-state', pending.size ? `Saving ${pending.size} ${pending.size === 1 ? 'change' : 'changes'}…` : saveWarning || 'All changes saved.');
    $('save-state').classList.toggle('error', !!saveWarning && !pending.size);
  }
  function storeConfirmed(item) {
    if (!data || selectedMonth() !== item.month) return;
    const index = data.logs.findIndex(log => log.accountId === item.account._id);
    if (item.confirmed) {
      if (index === -1) data.logs.push(item.confirmed); else data.logs[index] = item.confirmed;
    } else if (index !== -1) data.logs.splice(index, 1);
  }
  function quickSave(account, fields) {
    if (!session || !data || busy) return;
    const month = selectedMonth(), key = `${month}/${account._id}`;
    let item = pending.get(key);
    if (!item) {
      const confirmed = data.logs.find(log => log.accountId === account._id);
      item = { account, month, confirmed, desired: { accountId: account._id, month, status: 'unchecked', flagged: false, ...confirmed }, revision: 0, running: false, generation: epoch };
      pending.set(key, item); saveWarning = '';
    }
    Object.assign(item.desired, fields); item.revision++; ++request;
    render(); saveMessage();
    if (!item.running) void flushSave(key, item);
  }
  async function flushSave(key, item) {
    item.running = true;
    try {
      while (item.generation === epoch) {
        const revision = item.revision, desired = { ...item.desired };
        const result = await call('mutation', 'save', { accountId: item.account._id, month: item.month, status: desired.status, flagged: !!desired.flagged, expectedVersion: item.confirmed?.version || 0 });
        if (item.generation !== epoch) return;
        item.confirmed = { ...desired, version: result.version, updatedAt: Date.now() };
        storeConfirmed(item); ++request;
        if (revision === item.revision) break;
      }
    } catch (error) {
      if (item.generation !== epoch) return;
      saveWarning = `${item.account.person} · ${item.account.bank}: ${friendly(error)}`;
      storeConfirmed(item);
    } finally {
      if (item.generation === epoch) {
        pending.delete(key); render(); saveMessage();
        if (!pending.size && (saveWarning || !data)) await refresh({ silent: true });
      }
    }
  }
  window.addEventListener('beforeunload', event => { if (pending.size) { event.preventDefault(); event.returnValue = ''; } });

  function closeMenu(restoreFocus = false) {
    const account = menuAccount; menuAccount = null; $('payment-menu').hidden = true;
    if (restoreFocus && account) $('accounts').querySelector(`[data-account="${CSS.escape(account._id)}"] .quick-paid`)?.focus({ preventScroll: true });
  }
  function openMenu(account, anchor, point) {
    if (busy || !ready) return;
    closeMenu(); menuAccount = account;
    const log = logFor(account._id), menu = $('payment-menu'), bounds = anchor.getBoundingClientRect();
    message('menu-title', `${account.person} · ${account.bank}`);
    message('menu-flag', log?.flagged ? '⚑  Remove flag' : '⚑  Flag for attention');
    $('menu-flag').setAttribute('aria-checked', String(!!log?.flagged));
    $('menu-details').disabled = pending.has(`${selectedMonth()}/${account._id}`);
    message('menu-details', $('menu-details').disabled ? 'Details · saving…' : 'Payment details…');
    menu.hidden = false;
    menu.style.left = `${Math.max(8, Math.min(point?.x ?? bounds.left, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(point?.y ?? bounds.bottom + 4, innerHeight - menu.offsetHeight - 8))}px`;
    $('menu-flag').focus({ preventScroll: true });
  }
  $('menu-flag').addEventListener('click', () => {
    const account = menuAccount; if (!account) return;
    const flagged = !logFor(account._id)?.flagged; closeMenu(true); quickSave(account, { flagged });
  });
  $('menu-details').addEventListener('click', () => { const account = menuAccount; closeMenu(true); if (account) openEntry(account); });
  $('payment-menu').addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); closeMenu(true); return; }
    const buttons = [...$('payment-menu').querySelectorAll('button:not(:disabled)')];
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const current = buttons.indexOf(document.activeElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index]?.focus();
    }
  });
  document.addEventListener('pointerdown', event => { if (!$('payment-menu').contains(event.target)) closeMenu(); });
  window.addEventListener('resize', () => closeMenu());
  document.addEventListener('scroll', () => closeMenu(), true);

  function accountControl(account, matrix = false) {
    const log = logFor(account._id), status = log?.status || 'unchecked';
    const row = node(matrix ? 'div' : 'article', undefined, `account${complete(status) ? ' done' : ''}${matrix ? ' matrix-account' : ''}`);
    row.dataset.account = account._id;
    row.classList.toggle('flagged', !!log?.flagged);
    row.classList.toggle('saving', pending.has(`${selectedMonth()}/${account._id}`));
    const heading = node('div', undefined, 'account-heading');
    if (!matrix) heading.append(node('h3', account.nickname ? `${account.bank} · ${account.nickname}` : account.bank));
    else if (account.nickname) heading.append(node('p', account.nickname, 'card-nickname'));
    if (!matrix) heading.append(node('p', `${account.person} · Due ${dueLabel(account)}${log?.amountCents != null ? ` · ${formatMoney(log.amountCents)}` : ''}`, 'meta'));
    const actions = node('div', undefined, 'account-actions');
    const paid = node('button', undefined, `quick-paid status-${status}`);
    paid.type = 'button'; paid.dataset.action = 'toggle'; paid.setAttribute('aria-pressed', String(complete(status)));
    paid.setAttribute('aria-label', `${complete(status) ? 'Mark not paid:' : 'Mark paid:'} ${account.person}, ${account.bank}${account.nickname ? `, ${account.nickname}` : ''}`);
    const check = node('span', complete(status) ? '✓' : '', 'check-box'); check.setAttribute('aria-hidden', 'true');
    paid.append(check, node('span', labels[status], `status-badge ${status}`));
    paid.addEventListener('click', () => quickSave(account, { status: complete(logFor(account._id)?.status) ? 'unchecked' : 'paid' }));
    paid.setAttribute('aria-haspopup', 'menu');
    paid.title = 'Click to toggle payment. Right-click for flag and details.';
    if (log?.flagged) { const marker = node('span', '⚑', 'flag-marker'); marker.setAttribute('aria-label', 'Flagged for attention'); paid.append(marker); }
    paid.addEventListener('keydown', event => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10') || event.key === 'ArrowDown') { event.preventDefault(); openMenu(account, paid); }
    });
    row.addEventListener('contextmenu', event => { event.preventDefault(); openMenu(account, paid, { x: event.clientX, y: event.clientY }); });
    const more = node('button', '···', 'details-button touch-actions'); more.type = 'button'; more.dataset.action = 'menu';
    more.setAttribute('aria-label', `Actions for ${account.person}, ${account.bank}`); more.setAttribute('aria-haspopup', 'menu');
    more.addEventListener('click', () => openMenu(account, more));
    actions.append(paid, more);
    if (heading.childNodes.length) row.append(heading);
    row.append(actions);
    if (matrix && (account.dueDay !== 1 || log?.amountCents != null)) row.append(node('p', `${account.dueDay !== 1 ? `Due ${dueLabel(account)}` : ''}${account.dueDay !== 1 && log?.amountCents != null ? ' · ' : ''}${log?.amountCents != null ? formatMoney(log.amountCents) : ''}`, 'cell-detail'));
    if (!matrix && log?.note) row.append(node('p', log.note, 'account-note'));
    return row;
  }

  function renderMatrix(accounts, people) {
    const holder = $('accounts'); holder.classList.add('is-matrix');
    const banks = [...new Set(accounts.map(a => a.bank))].filter(bank => !$('remaining').checked || accounts.some(a => a.bank === bank && !complete(logFor(a._id)?.status)));
    if (!banks.length) { holder.append(node('div', accounts.length ? 'Everything in this view is checked off.' : 'No accounts for this person and month yet.', 'empty')); return; }
    const scroll = node('div', undefined, 'matrix-scroll'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Payments by bank and person');
    const table = node('table', undefined, 'payment-matrix');
    table.append(node('caption', `Payments due in ${monthLabel(selectedMonth())}`, 'sr-only'));
    const head = node('thead'), headers = node('tr'), bankHead = node('th', 'Bank'); bankHead.scope = 'col'; headers.append(bankHead);
    for (const person of people) {
      const th = node('th'); th.scope = 'col'; th.append(node('span', person));
      const group = accounts.filter(a => a.person === person), done = group.filter(a => complete(logFor(a._id)?.status)).length;
      th.append(node('small', `${done} / ${group.length} complete`)); headers.append(th);
    }
    head.append(headers); table.append(head); const body = node('tbody');
    for (const bank of banks) {
      const tr = node('tr'), bankCell = node('th'); bankCell.scope = 'row';
      const bankLabel = node('span', undefined, 'bank-label'); bankLabel.append(bankIcon(bank), node('span', bank)); bankCell.append(bankLabel); tr.append(bankCell);
      for (const person of people) {
        const cell = node('td'); const group = accounts.filter(a => a.bank === bank && a.person === person);
        if (!group.length) {
          const retired = data.accounts.some(a => a.bank === bank && a.person === person && a.endMonth && a.endMonth < selectedMonth());
          const empty = node('span', retired ? 'Retired' : '—', 'no-account'); empty.setAttribute('aria-label', retired ? 'Retired account' : 'No account'); cell.append(empty);
        } else {
          const shown = group.filter(a => !$('remaining').checked || !complete(logFor(a._id)?.status));
          if (!shown.length) cell.append(node('span', '✓ Complete', 'cell-complete'));
          else for (const account of shown) cell.append(accountControl(account, true));
        }
        tr.append(cell);
      }
      body.append(tr);
    }
    table.append(body); scroll.append(table); holder.append(scroll);
  }

  function render() {
    if (!data) return;
    closeMenu();
    const chosenPerson = $('person').value;
    // Preserve account/import order, matching the original spreadsheet's columns.
    const people = [...new Set(data.accounts.map(a => a.person))];
    $('person').replaceChildren(new Option('Everyone', ''), ...people.map(p => new Option(p, p)));
    $('person').value = people.includes(chosenPerson) ? chosenPerson : '';
    $('people').replaceChildren(...people.map(p => new Option(p, p)));
    const accounts = activeAccounts().filter(a => !$('person').value || a.person === $('person').value);
    const done = accounts.filter(a => complete(logFor(a._id)?.status)).length;
    const flagged = accounts.filter(a => logFor(a._id)?.flagged).length;
    message('scope', $('person').value || 'All accounts');
    message('progress-heading', accounts.length ? done === accounts.length ? 'All paid.' : `${accounts.length - done} not paid` : 'A fresh start.');
    message('progress-detail', accounts.length ? `Due ${new Date(`${selectedMonth()}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} · ${done} paid${flagged ? ` · ${flagged} flagged for attention` : ''}` : 'Add your accounts once. They repeat each month.');
    message('progress-number', `${done} / ${accounts.length}`);
    $('progress').max = accounts.length || 1; $('progress').value = done;
    const shown = accounts.filter(a => !$('remaining').checked || !complete(logFor(a._id)?.status));
    const focus = document.activeElement, focusAccount = focus?.closest('[data-account]')?.dataset.account, focusAction = focus?.dataset.action;
    $('accounts').replaceChildren(); $('accounts').classList.remove('is-matrix');
    if (desktop.matches) {
      renderMatrix(accounts, $('person').value ? [$('person').value] : people.filter(p => data.accounts.some(a => a.person === p && a.startMonth <= selectedMonth())));
    } else {
      for (const account of shown) $('accounts').append(accountControl(account));
      if (!shown.length) $('accounts').append(node('div', accounts.length ? 'You’re all caught up for this person and month.' : 'No accounts for this person and month yet.', 'empty'));
    }
    setBusy(busy);
    if (focusAccount && focusAction) $('accounts').querySelector(`[data-account="${CSS.escape(focusAccount)}"] [data-action="${focusAction}"]`)?.focus({ preventScroll: true });
  }
  desktop.addEventListener('change', render);

  async function refresh({ silent = false } = {}) {
    if (!session || !ready || busy || !validMonth(selectedMonth()) || [...pending.values()].some(p => p.month === selectedMonth())) return;
    const version = ++request, generation = epoch, value = selectedMonth();
    if (!silent) message('load-state', 'Loading…');
    try {
      const result = await call('query', 'dashboard', { month: value });
      if (generation !== epoch || version !== request || value !== selectedMonth()) return;
      data = result; render(); message('load-state', '');
    } catch (error) {
      if (generation !== epoch || version !== request) return;
      if (/not authorized/i.test(error.message)) { clearPrivate(); $('gate').hidden = false; message('gate-message', 'This account doesn’t have access. Sign out and use your approved email.'); }
      else message('load-state', 'Couldn’t refresh. The displayed entries may be out of date. Try Refresh.');
    }
  }

  async function mutate(path, args, { errorId, success, close } = {}) {
    if (busy || !session) return false;
    if (pending.size) { message(errorId || 'save-state', 'Finishing your checkoffs. Try again in a moment.'); return false; }
    const generation = epoch; ++request; setBusy(true);
    message('save-state', 'Saving…'); if (errorId) message(errorId, '');
    try {
      const result = await call('mutation', path, args);
      if (generation !== epoch) return false;
      if (close) $(close).close();
      message('save-state', typeof success === 'function' ? success(result) : success || 'Saved to your account.');
      return true;
    } catch (error) {
      if (generation !== epoch) return false;
      const text = friendly(error);
      message('save-state', text); if (errorId) message(errorId, text);
      return false;
    } finally {
      if (generation === epoch) { setBusy(false); await refresh({ silent: true }); }
    }
  }

  async function saveLog(account, fields, modal = false) {
    const log = modal ? entry.log : logFor(account._id);
    const args = { accountId: account._id, month: modal ? entry.month : selectedMonth(), expectedVersion: log?.version || 0, ...fields };
    await mutate('save', args, { errorId: modal ? 'entry-error' : null, close: modal ? 'entry-dialog' : null, success: `${account.person} · ${account.bank}: ${labels[fields.status].toLowerCase()}. Saved.` });
  }
  function openEntry(account) {
    if (busy || pending.has(`${selectedMonth()}/${account._id}`)) return;
    const log = logFor(account._id);
    entry = { account, log, month: selectedMonth() };
    message('entry-person', account.person); message('entry-title', account.bank + (account.nickname ? ` · ${account.nickname}` : ''));
    message('entry-month', `${monthLabel(entry.month)} · Due ${dueLabel(account)}${log ? ` · Last updated ${new Date(log.updatedAt).toLocaleString()}` : ''}`);
    $('entry-status').value = complete(log?.status) ? 'paid' : 'unchecked';
    $('entry-flag').checked = !!log?.flagged;
    $('entry-amount').value = log?.amountCents != null ? (log.amountCents / 100).toFixed(2) : '';
    $('entry-note').value = log?.note || ''; message('entry-error', '');
    $('entry-dialog').showModal();
  }
  $('entry-form').addEventListener('submit', event => {
    event.preventDefault(); if (!entry || busy) return;
    const text = $('entry-amount').value.trim();
    if (text && !/^\d+(\.\d{1,2})?$/.test(text)) { message('entry-error', 'Enter an amount like 125.50, or leave it blank.'); return; }
    void saveLog(entry.account, { status: $('entry-status').value, flagged: $('entry-flag').checked, note: $('entry-note').value, amountCents: text ? Math.round(Number(text) * 100) : null }, true);
  });
  $('add').addEventListener('click', () => {
    editingAccount = null; $('add-form').reset(); message('add-title', 'Add account'); $('add-form').querySelector('[type=submit]').textContent = 'Add account';
    $('add-month').closest('label').hidden = false; $('add-person').value = $('person').value; $('add-month').value = selectedMonth(); message('add-error', ''); $('add-dialog').showModal();
  });
  $('add-form').addEventListener('submit', event => {
    event.preventDefault();
    const fields = { person: $('add-person').value.trim(), bank: $('add-bank').value.trim(), nickname: $('add-nickname').value.trim(), dueDay: Number($('add-day').value) };
    if (editingAccount) void mutate('updateAccount', { accountId: editingAccount._id, ...fields }, { errorId: 'add-error', close: 'add-dialog', success: 'Account details updated.' });
    else void mutate('addAccounts', { startMonth: $('add-month').value, accounts: [fields] }, { errorId: 'add-error', close: 'add-dialog', success: result => result.added ? 'Account added. It will appear from its first month onward.' : 'That account already exists. No duplicate was added.' });
  });
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async () => {
    const file = $('import-file').files[0], generation = epoch; $('import-file').value = '';
    if (!file) return;
    try {
      if (file.size > 100000) throw Error('Use an account-list JSON file smaller than 100 KB.');
      const parsed = JSON.parse(await file.text());
      if (generation !== epoch || !ready) return;
      if (parsed.version !== 1 || !Array.isArray(parsed.accounts) || !parsed.accounts.length || parsed.accounts.length > 100) throw Error('Choose a version 1 account-list JSON file with 1–100 accounts.');
      imports = parsed.accounts.map(a => {
        if (!a || typeof a.person !== 'string' || !a.person.trim() || a.person.length > 80 || typeof a.bank !== 'string' || !a.bank.trim() || a.bank.length > 80 || typeof a.nickname !== 'string' || a.nickname.length > 80 || !Number.isInteger(a.dueDay) || a.dueDay < 1 || a.dueDay > 31) throw Error('Each account needs a person, bank, nickname, and due day from 1–31.');
        return { person: a.person.trim(), bank: a.bank.trim(), nickname: a.nickname.trim(), dueDay: a.dueDay };
      });
      message('import-summary', `Review ${imports.length} accounts before adding them.`);
      $('import-preview').replaceChildren(...imports.map(a => node('li', `${a.person} · ${a.bank}${a.nickname ? ` · ${a.nickname}` : ''} · Due day ${a.dueDay}`)));
      $('import-month').value = selectedMonth(); message('import-error', ''); $('import-dialog').showModal();
    } catch (error) { if (generation === epoch) message('save-state', error instanceof SyntaxError ? 'That file isn’t valid JSON.' : error.message); }
  });
  $('import-form').addEventListener('submit', event => {
    event.preventDefault();
    void mutate('addAccounts', { startMonth: $('import-month').value, accounts: imports }, { errorId: 'import-error', close: 'import-dialog', success: result => `${result.added} accounts added. ${result.skipped} duplicates skipped.` });
  });

  function renderManage() {
    $('manage-list').replaceChildren();
    for (const account of data?.accounts || []) {
      const row = node('div', undefined, 'manage-row');
      row.append(node('p', `${account.person} · ${account.bank}${account.nickname ? ` · ${account.nickname}` : ''}${account.endMonth ? ` (last month: ${monthLabel(account.endMonth)})` : ''}`));
      const actions = node('div', undefined, 'manage-actions');
      const edit = node('button', 'Edit');
      edit.addEventListener('click', () => {
        editingAccount = account; $('manage-dialog').close(); $('add-form').reset();
        message('add-title', 'Edit account'); $('add-form').querySelector('[type=submit]').textContent = 'Save account';
        $('add-person').value = account.person; $('add-bank').value = account.bank; $('add-nickname').value = account.nickname; $('add-day').value = account.dueDay;
        $('add-month').value = account.startMonth; $('add-month').closest('label').hidden = true;
        message('add-error', ''); $('add-dialog').showModal();
      });
      const button = node('button', account.endMonth ? 'Reactivate' : 'Retire');
      button.addEventListener('click', async () => {
        const result = await mutate('retire', { accountId: account._id, endMonth: account.endMonth ? null : selectedMonth() }, { errorId: 'manage-error', success: account.endMonth ? 'Account reactivated.' : `Account retired after ${monthLabel(selectedMonth())}. History kept.` });
        if (result) renderManage();
      }); actions.append(edit, button); row.append(actions); $('manage-list').append(row);
    }
    if (!data?.accounts.length) $('manage-list').append(node('p', 'No accounts yet.'));
  }
  $('manage').addEventListener('click', () => { renderManage(); message('manage-error', ''); $('manage-dialog').showModal(); });
  document.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => { if (!busy) button.closest('dialog').close(); }));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); }));
  ['person', 'remaining'].forEach(id => $(id).addEventListener('change', render));
  function changeMonth() {
    closeMenu();
    if (!validMonth(selectedMonth())) { message('load-state', 'Choose a valid month between 2000 and 2099.'); $('accounts').replaceChildren(); return; }
    data = null; $('accounts').replaceChildren(); message('progress-heading', 'Loading accounts…'); message('progress-number', '—'); message('progress-detail', ''); $('progress').value = 0;
    void refresh();
  }
  $('month').addEventListener('change', changeMonth);
  for (const [id, offset] of [['previous', -1], ['next', 1]]) $(id).addEventListener('click', () => {
    if (!validMonth(selectedMonth())) return;
    const date = new Date(`${selectedMonth()}-15T12:00:00`); date.setMonth(date.getMonth() + offset);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (validMonth(value)) { $('month').value = value; changeMonth(); }
  });
  $('refresh').addEventListener('click', () => void refresh());

  async function sessionChanged(state) {
    if (state.session === undefined) return;
    const id = state.session?.id || null;
    if (id === sessionId) return;
    sessionId = id; session = state.session; const generation = ++epoch;
    clearPrivate(); $('gate').hidden = false; $('sign-out').hidden = !session; $('retry-auth').hidden = true;
    if (!session) {
      message('gate-message', 'Sign in to keep your checklist in sync across your phone and computer.');
      $('sign-in').hidden = false;
      if (!mounted) {
        const returnUrl = location.origin + location.pathname;
        window.Clerk.mountSignIn($('sign-in'), { routing: 'hash', withSignUp: false, forceRedirectUrl: returnUrl,
          appearance: { variables: { colorPrimary: '#276347', borderRadius: '10px' }, elements: { cardBox: { boxShadow: 'none', maxWidth: '100%' } } },
        }); mounted = true;
      }
      return;
    }
    if (mounted) { window.Clerk.unmountSignIn($('sign-in')); mounted = false; }
    $('sign-in').hidden = true; message('gate-message', 'Opening your checklist…');
    try {
      await call('query', 'verify', {}, session);
      if (generation !== epoch) return;
      ready = true; $('gate').hidden = true; $('app').hidden = false; await refresh();
    } catch (error) {
      if (generation !== epoch) return;
      message('gate-message', /not authorized/i.test(error.message) ? 'This account doesn’t have access. Sign out and use your approved email.' : 'Your checklist couldn’t load. Check your connection and try again.');
      $('retry-auth').hidden = false;
    }
  }
  $('sign-out').addEventListener('click', async () => {
    ++epoch; session = null; sessionId = undefined; clearPrivate(); $('gate').hidden = false; message('gate-message', 'Signing out…');
    try { await window.Clerk.signOut(); await sessionChanged({ session: null }); }
    catch { message('gate-message', 'Sign-out failed. Try again.'); }
  });
  $('retry-auth').addEventListener('click', () => location.reload());
  function connection() { $('connection').hidden = navigator.onLine; message('connection', 'You’re offline. Reconnect before logging a payment.'); }
  window.addEventListener('offline', connection);
  window.addEventListener('online', () => { connection(); if (!document.querySelector('dialog[open]')) void refresh({ silent: true }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.querySelector('dialog[open]')) void refresh({ silent: true }); });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  setInterval(() => { if (!document.hidden && !document.querySelector('dialog[open]')) void refresh({ silent: true }); }, 30000);
  function waitForClerk() {
    return new Promise((resolve, reject) => {
      const scripts = [...document.querySelectorAll('[data-clerk-script]')];
      const timer = setTimeout(failed, 20000);
      function cleanup() { clearTimeout(timer); scripts.forEach(s => { s.removeEventListener('load', check); s.removeEventListener('error', failed); }); }
      function check() { if (window.Clerk && window.__internal_ClerkUICtor) { cleanup(); resolve(); } }
      function failed() { cleanup(); reject(Error('Sign-in scripts could not load.')); }
      scripts.forEach(s => { s.addEventListener('load', check); s.addEventListener('error', failed); }); check();
    });
  }
  async function start() {
    connection();
    try {
      await waitForClerk(); await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
      window.Clerk.addListener(sessionChanged); await sessionChanged({ session: window.Clerk.session || null });
    } catch (error) {
      clearPrivate(); message('gate-message', /Production Keys are only allowed/i.test(error.message) ? 'Sign-in is available on john-ta.com. This local preview can’t use production sign-in.' : 'Sign-in couldn’t load. Check your connection and try again.'); $('retry-auth').hidden = false;
    }
  }
  void start();
})();
