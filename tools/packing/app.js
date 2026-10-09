(() => {
  'use strict';
  const DEFAULT_VIEW = 'default';
  const starter = [
    ['Essentials', ['ID / passport', 'Wallet & cards', 'Medications', 'Keys']],
    ['Clothes', ['Underwear', 'Socks', 'T-shirts / tops', 'Pants / shorts', 'Sleepwear', 'Jacket / layer', 'Shoes']],
    ['Toiletries', ['Toothbrush & toothpaste', 'Deodorant', 'Shampoo & body wash', 'Skincare & sunscreen', 'Hairbrush / comb']],
    ['Electronics', ['Phone', 'Phone charger', 'Headphones', 'Power bank']],
    ['Extras', ['Water bottle', 'Sunglasses', 'Snacks', 'Laundry bag']],
  ];
  const $ = id => document.getElementById(id);
  const uid = () => crypto.randomUUID();
  const makeStarter = () => starter.map(([name, labels]) => ({ id: uid(), name, items: labels.map(label => ({ id: uid(), label, packed: false })) }));
  const freshState = () => ({ version: 1, template: makeStarter(), trips: [], activeId: null });
  let state;
  let initialState;
  let persistState;
  let migrated = false;
  let remainingOnly = false;
  let pendingDelete = null;
  let storageUnreadable = false;

  function validSections(sections) {
    return Array.isArray(sections) && sections.every(section => section && typeof section.id === 'string' && typeof section.name === 'string' && Array.isArray(section.items) && section.items.every(item => item && typeof item.id === 'string' && typeof item.label === 'string' && typeof item.packed === 'boolean'));
  }

  function load() {
    try {
      if (!initialState) return freshState();
      const saved = JSON.parse(JSON.stringify(initialState));
      if (saved.version !== 1 || !validSections(saved.template) || !Array.isArray(saved.trips) || !saved.trips.every(trip => trip && typeof trip.id === 'string' && typeof trip.name === 'string' && validSections(trip.sections))) throw new Error('Invalid saved checklist');
      // Remove the retired section from existing lists as well as new trips.
      if ([saved.template, ...saved.trips.map(trip => trip.sections)].some(sections => sections.some(section => section.name === 'Before leaving'))) {
        saved.template = saved.template.filter(section => section.name !== 'Before leaving');
        saved.trips.forEach(trip => { trip.sections = trip.sections.filter(section => section.name !== 'Before leaving'); });
        migrated = true;
      }
      if (saved.activeId !== DEFAULT_VIEW && !saved.trips.some(trip => trip.id === saved.activeId)) saved.activeId = saved.trips[0]?.id || null;
      return saved;
    } catch {
      storageUnreadable = true;
      $('save-status').textContent = 'Saved checklists are unavailable. Changes will not be saved.';
      showError('Your saved checklists could not be opened. Try reopening this page before making changes.');
      return freshState();
    }
  }

  function showError(message) {
    $('storage-error').textContent = message;
    $('storage-error').hidden = false;
  }

  function save() {
    if (storageUnreadable || !state || !persistState) return;
    try {
      persistState(JSON.parse(JSON.stringify(state)));
    } catch {
      showError('Changes could not be queued for saving. Keep this page open and try again.');
      $('save-status').textContent = 'Changes have not been saved.';
    }
  }

  function node(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  }

  function counts(sections) {
    const items = sections.flatMap(section => section.items);
    return { total: items.length, packed: items.filter(item => item.packed).length };
  }

  function announce(message) { $('announcement').textContent = message; }
  function currentTrip() { return state.trips.find(trip => trip.id === state.activeId); }
  function currentSections() { return state.activeId === DEFAULT_VIEW ? state.template : currentTrip()?.sections; }

  function openView(id) {
    if (!state) return;
    if (state.activeId === id) return;
    state.activeId = id;
    remainingOnly = false;
    save();
    render();
    $('workspace').focus({ preventScroll: true });
    $('workspace').scrollIntoView({ block: 'start' });
  }

  function addTrip() {
    if (!state) return;
    const sections = state.template.map(section => ({ ...section, id: uid(), items: section.items.map(item => ({ ...item, id: uid(), packed: false })) }));
    const trip = { id: uid(), name: 'Untitled trip', sections };
    state.trips.unshift(trip);
    state.activeId = trip.id;
    remainingOnly = false;
    save();
    render();
    $('trip-name').focus();
    $('trip-name').select();
    announce('Trip added. Your fresh checklist is ready.');
  }

  function renderNavigation() {
    const scrollLeft = $('trips').scrollLeft;
    const focusedTrip = document.activeElement?.dataset.tripId;
    $('trip-count').textContent = state.trips.length;
    $('no-trips').hidden = state.trips.length > 0;
    $('edit-default').setAttribute('aria-current', String(state.activeId === DEFAULT_VIEW));
    $('trips').replaceChildren();
    state.trips.forEach(trip => {
      const { total, packed } = counts(trip.sections);
      const button = node('button', 'trip-button');
      button.type = 'button';
      button.dataset.tripId = trip.id;
      button.setAttribute('aria-current', String(trip.id === state.activeId));
      button.append(node('strong', '', trip.name), node('small', '', total > 0 && packed === total ? 'All ready ✓' : `${packed} of ${total} done`));
      const bar = node('span', 'mini-progress');
      bar.setAttribute('aria-hidden', 'true');
      const fill = node('i');
      fill.style.width = `${total ? packed / total * 100 : 0}%`;
      bar.append(fill);
      button.append(bar);
      button.addEventListener('click', () => openView(trip.id));
      $('trips').append(button);
    });
    $('trips').scrollLeft = scrollLeft;
    if (focusedTrip) [...$('trips').children].find(button => button.dataset.tripId === focusedTrip)?.focus({ preventScroll: true });
  }

  function renderProgress() {
    const trip = currentTrip();
    if (!trip) return;
    const { total, packed } = counts(trip.sections);
    $('progress-text').textContent = `${packed} of ${total} done`;
    $('packing-progress').max = total || 1;
    $('packing-progress').value = packed;
    $('completion').hidden = !total || packed !== total;
    $('remaining-toggle').setAttribute('aria-pressed', String(remainingOnly));
    $('remaining-toggle').textContent = 'Remaining only';
    $('remaining-toggle').title = remainingOnly ? 'Show all items' : 'Hide completed items';
  }

  function itemRow(section, item, isDefault) {
    const row = node('div', `item-row${item.packed && !isDefault ? ' is-packed' : ''}`);
    const checkboxId = `check-${item.id}`;
    if (isDefault) {
      const dot = node('span', 'template-dot');
      dot.setAttribute('aria-hidden', 'true');
      row.append(dot);
    } else {
      const label = node('label', 'check-label');
      const checkbox = node('input');
      checkbox.id = checkboxId;
      checkbox.type = 'checkbox';
      checkbox.checked = item.packed;
      checkbox.setAttribute('aria-label', `Pack ${item.label}`);
      checkbox.addEventListener('change', () => {
        item.packed = checkbox.checked;
        row.classList.toggle('is-packed', item.packed);
        save();
        renderNavigation();
        renderProgress();
        updateSectionCount(section, false);
        if (remainingOnly && item.packed) {
          const next = row.nextElementSibling?.querySelector('input[type=checkbox]') || $('remaining-toggle');
          row.remove();
          updateSectionCount(section, false);
          next?.focus({ preventScroll: true });
        }
      });
      label.append(checkbox);
      row.append(label);
    }
    const input = node('input', 'item-name');
    input.type = 'text';
    input.value = item.label;
    input.maxLength = 150;
    input.hidden = true;
    input.setAttribute('aria-label', `Edit ${item.label}`);
    const itemText = node(isDefault ? 'button' : 'label', 'item-label', item.label);
    if (isDefault) itemText.type = 'button';
    else itemText.htmlFor = checkboxId;
    const edit = node('button', 'edit-item', '✎');
    edit.type = 'button';
    const updateLabels = () => {
      itemText.textContent = item.label;
      input.setAttribute('aria-label', `Edit ${item.label}`);
      row.querySelector('[type=checkbox]')?.setAttribute('aria-label', `Pack ${item.label}`);
      remove.setAttribute('aria-label', `Remove ${item.label}`);
      remove.title = `Remove ${item.label}`;
      edit.setAttribute('aria-label', `Edit ${item.label}`);
      edit.title = `Edit ${item.label}`;
    };
    const finishEdit = (cancel = false, returnFocus = false) => {
      if (input.hidden) return;
      const value = input.value.trim();
      if (!cancel && value && value !== item.label) { item.label = value; save(); }
      input.hidden = true;
      input.value = item.label;
      itemText.hidden = false;
      row.classList.remove('is-editing');
      edit.textContent = '✎';
      updateLabels();
      if (returnFocus) edit.focus({ preventScroll: true });
    };
    const beginEdit = () => {
      input.value = item.label;
      input.hidden = false;
      itemText.hidden = true;
      row.classList.add('is-editing');
      edit.textContent = '✓';
      edit.setAttribute('aria-label', `Save ${item.label}`);
      edit.title = 'Save item';
      input.focus();
      input.select();
    };
    edit.addEventListener('pointerdown', event => { if (!input.hidden) event.preventDefault(); });
    edit.addEventListener('click', () => { if (input.hidden) beginEdit(); else finishEdit(false, true); });
    if (isDefault) itemText.addEventListener('click', beginEdit);
    input.addEventListener('blur', () => finishEdit());
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        finishEdit(event.key === 'Escape', true);
      }
    });
    const remove = node('button', 'remove-item', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${item.label}`);
    remove.addEventListener('click', () => {
      const next = row.nextElementSibling?.querySelector(isDefault ? '.edit-item' : 'input[type=checkbox]') || row.previousElementSibling?.querySelector(isDefault ? '.edit-item' : 'input[type=checkbox]') || (isDefault ? $('edit-default') : $('remaining-toggle'));
      section.items = section.items.filter(existing => existing.id !== item.id);
      save();
      row.remove();
      renderNavigation();
      renderProgress();
      updateSectionCount(section, isDefault);
      next?.focus({ preventScroll: true });
      announce(`${item.label} removed.`);
    });
    updateLabels();
    row.append(itemText, input, edit, remove);
    return row;
  }

  function updateSectionCount(section, isDefault) {
    const counter = document.getElementById(`count-${section.id}`);
    if (counter) counter.textContent = isDefault ? `${section.items.length} items` : `${section.items.filter(item => item.packed).length} / ${section.items.length}`;
    const empty = document.getElementById(`empty-${section.id}`);
    if (empty) {
      empty.hidden = section.items.some(item => isDefault || !remainingOnly || !item.packed);
      empty.textContent = section.items.length ? 'All packed in this section.' : 'No items yet. Add one below.';
    }
  }

  function renderSections() {
    const isDefault = state.activeId === DEFAULT_VIEW;
    $('sections').replaceChildren();
    currentSections().forEach(section => {
      const block = node('section', 'packing-section');
      const heading = node('div', 'section-header');
      const title = node('h3', '', section.name);
      title.id = `heading-${section.id}`;
      block.setAttribute('aria-labelledby', title.id);
      const count = node('small');
      count.id = `count-${section.id}`;
      heading.append(title, count);
      block.append(heading);
      const list = node('div');
      section.items.filter(item => isDefault || !remainingOnly || !item.packed).forEach(item => list.append(itemRow(section, item, isDefault)));
      block.append(list);
      const empty = node('p', 'section-empty');
      empty.id = `empty-${section.id}`;
      block.append(empty);
      const form = node('form', 'add-item');
      const input = node('input');
      input.type = 'text';
      input.maxLength = 150;
      input.placeholder = 'Add an item…';
      input.setAttribute('aria-label', `New item in ${section.name}`);
      const button = node('button', '', 'Add');
      button.type = 'submit';
      button.disabled = true;
      button.setAttribute('aria-label', `Add item to ${section.name}`);
      form.append(input, button);
      input.addEventListener('input', () => { button.disabled = !input.value.trim(); });
      form.addEventListener('submit', event => {
        event.preventDefault();
        const label = input.value.trim();
        if (!label) { input.focus(); return; }
        const item = { id: uid(), label, packed: false };
        section.items.push(item);
        list.append(itemRow(section, item, isDefault));
        input.value = '';
        button.disabled = true;
        save();
        renderNavigation();
        renderProgress();
        updateSectionCount(section, isDefault);
        input.focus();
        announce(`${label} added to ${section.name}.`);
      });
      block.append(form);
      $('sections').append(block);
      updateSectionCount(section, isDefault);
    });
  }

  function render() {
    renderNavigation();
    const workspace = $('workspace');
    workspace.replaceChildren();
    const trip = currentTrip();
    const isDefault = state.activeId === DEFAULT_VIEW;
    if (!trip && !isDefault) {
      const empty = node('div', 'empty-state');
      const mark = node('div', 'empty-mark', '✓');
      mark.setAttribute('aria-hidden', 'true');
      const button = node('button', 'primary', '＋ Add your first trip');
      button.type = 'button';
      button.addEventListener('click', addTrip);
      empty.append(mark, node('h2', '', 'Less remembering. More going.'), node('p', '', 'Add a trip and your packing list is ready. Just check things off as you go.'), button);
      workspace.append(empty);
      return;
    }
    const header = node('div', 'checklist-header');
    const titles = node('div');
    titles.append(node('p', 'eyebrow', isDefault ? 'Your starting point' : 'Your next adventure'));
    if (isDefault) {
      titles.append(node('h2', '', 'Default checklist'), node('p', 'subtext', 'The little things you always bring.'));
    } else {
      const name = node('input', 'trip-name');
      name.id = 'trip-name';
      name.value = trip.name;
      name.maxLength = 100;
      name.setAttribute('aria-label', 'Trip name');
      name.addEventListener('input', () => { trip.name = name.value.trim() || 'Untitled trip'; save(); renderNavigation(); });
      name.addEventListener('blur', () => { name.value = trip.name; });
      name.addEventListener('keydown', event => { if (event.key === 'Enter') name.blur(); });
      titles.append(name, node('p', 'subtext', 'Tap an item to pack it. Use the pencil to edit.'));
    }
    header.append(titles);
    if (trip) {
      const remove = node('button', 'delete-trip', 'Delete trip');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        pendingDelete = trip.id;
        $('delete-dialog').returnValue = 'cancel';
        $('delete-detail').textContent = `“${trip.name}” and its checklist will be removed. Your default list and other trips will stay.`;
        $('delete-dialog').showModal();
      });
      header.append(remove);
    }
    workspace.append(header);
    if (isDefault) {
      workspace.append(node('p', 'template-note', 'Changes here are saved automatically and used for new trips. Your existing trips keep their own lists.'));
    } else {
      const area = node('div', 'progress-area');
      const heading = node('div', 'progress-heading');
      const text = node('strong');
      text.id = 'progress-text';
      const toggle = node('button', 'remaining-toggle');
      toggle.id = 'remaining-toggle';
      toggle.type = 'button';
      toggle.addEventListener('click', () => { remainingOnly = !remainingOnly; renderProgress(); renderSections(); });
      heading.append(text, toggle);
      const progress = node('progress');
      progress.id = 'packing-progress';
      progress.setAttribute('aria-label', 'Checklist progress');
      const complete = node('p', 'completion-message', '✓ All checked off. You’re ready to go.');
      complete.id = 'completion';
      area.append(heading, progress, complete);
      workspace.append(area);
    }
    const sections = node('div');
    sections.id = 'sections';
    workspace.append(sections);
    renderProgress();
    renderSections();
  }

  $('add-trip').addEventListener('click', addTrip);
  $('edit-default').addEventListener('click', () => openView(DEFAULT_VIEW));
  $('delete-dialog').addEventListener('close', () => {
    if (state && $('delete-dialog').returnValue === 'delete' && pendingDelete) {
      state.trips = state.trips.filter(trip => trip.id !== pendingDelete);
      state.activeId = state.trips[0]?.id || null;
      remainingOnly = false;
      save();
      render();
      $('add-trip').focus();
      announce('Trip deleted.');
    }
    pendingDelete = null;
  });
  window.PackingApp = {
    open({ state: saved, saveState }) {
      initialState = saved;
      persistState = saveState;
      migrated = false;
      storageUnreadable = false;
      remainingOnly = false;
      state = load();
      if (migrated) save();
      render();
    },
    lock() {
      state = null;
      initialState = null;
      persistState = null;
      pendingDelete = null;
      remainingOnly = false;
      $('delete-dialog').returnValue = 'cancel';
      if ($('delete-dialog').open) $('delete-dialog').close();
      $('delete-detail').textContent = '';
      $('workspace').replaceChildren();
      $('trips').replaceChildren();
      $('trip-count').textContent = '0';
      $('storage-error').hidden = true;
      $('announcement').textContent = '';
    },
  };
})();
