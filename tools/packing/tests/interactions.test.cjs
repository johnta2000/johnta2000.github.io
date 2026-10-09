const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const KEY = 'jt-packing-v1';

// Isolated application-event fixture. No browser profiles or real trip data.
function fixture({ saved, failSaving = false } = {}) {
  const storage = new Map(saved === undefined ? [] : [[KEY, typeof saved === 'string' ? saved : JSON.stringify(saved)]]);
  let doc;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {};
      this.attributes = {}; this.dataset = {}; this.style = {}; this.className = '';
      this.hidden = false; this.value = ''; this.scrollLeft = 0; this.parentElement = null;
      this.classList = {
        contains: value => this.className.split(' ').includes(value),
        add: value => { if (!this.classList.contains(value)) this.className = [this.className, value].filter(Boolean).join(' '); },
        remove: value => { this.className = this.className.split(' ').filter(item => item !== value).join(' '); },
        toggle: (value, enabled) => { if (enabled ?? !this.classList.contains(value)) this.classList.add(value); else this.classList.remove(value); },
      };
    }
    append(...nodes) { nodes.forEach(node => { node.parentElement = this; this.children.push(node); }); }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this.append(...nodes); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    addEventListener(event, callback) { (this.listeners[event] ||= []).push(callback); }
    fire(type, extra = {}) {
      const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
      (this.listeners[type] || []).forEach(callback => callback(event));
      return event;
    }
    click() { if (this.disabled) return; if (!this.fire('pointerdown').defaultPrevented) this.focus(); this.fire('click'); }
    focus() { if (doc.activeElement === this) return; doc.activeElement?.fire('blur'); doc.activeElement = this; }
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body; this.fire('blur'); }
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
    scrollIntoView() { this.scrolledIntoView = true; }
    showModal() { this.open = true; }
    close(value) { if (value !== undefined) this.returnValue = value; this.open = false; this.fire('close'); }
    get nextElementSibling() { const siblings = this.parentElement?.children || []; return siblings[siblings.indexOf(this) + 1]; }
    get previousElementSibling() { const siblings = this.parentElement?.children || []; return siblings[siblings.indexOf(this) - 1]; }
    matches(selector) {
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      const match = selector.match(/^(\w+)?(?:\[([^=]+)=([^\]]+)\])?$/);
      return Boolean(match && (!match[1] || this.tagName === match[1].toUpperCase()) && (!match[2] || String(this[match[2]] ?? this.attributes[match[2]]) === match[3]));
    }
    querySelector(selector) {
      const space = selector.indexOf(' ');
      if (space >= 0) return this.querySelector(selector.slice(0, space))?.querySelector(selector.slice(space + 1));
      for (const child of this.children) { if (child.matches(selector)) return child; const nested = child.querySelector(selector); if (nested) return nested; }
      return null;
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  }
  doc = { body: new Element('body'), createElement: tag => new Element(tag), getElementById: id => doc.body.querySelector('#' + id) };
  doc.activeElement = doc.body;
  for (const id of ['add-trip', 'storage-error', 'trips', 'trip-count', 'edit-default', 'no-trips', 'save-status', 'workspace', 'announcement', 'delete-detail', 'delete-dialog']) {
    const element = new Element(id === 'delete-dialog' ? 'dialog' : 'div'); element.id = id; doc.body.append(element);
  }
  const window = {};
  vm.runInNewContext(source, { document: doc, crypto: webcrypto, window });
  let initialState = saved ?? null;
  if (typeof initialState === 'string') { try { initialState = JSON.parse(initialState); } catch { /* Exercise invalid state handling. */ } }
  window.PackingApp.open({ state: initialState, saveState: state => {
    if (failSaving) throw Error('Save unavailable');
    storage.set(KEY, JSON.stringify(state));
  } });
  return {
    doc, storage, window, el: doc.getElementById,
    saved: () => JSON.parse(storage.get(KEY)),
    addTrip() { doc.getElementById('add-trip').click(); },
    section() { return doc.getElementById('sections').children[0]; },
    row() { return this.section().children[1].children[0]; },
    check(row) { const checkbox = row.querySelector('input[type=checkbox]'); checkbox.checked = !checkbox.checked; checkbox.fire('change'); },
    edit(row, value, key = 'Enter') { row.querySelector('.edit-item').click(); const input = row.querySelector('.item-name'); input.value = value; input.fire('keydown', { key }); },
  };
}

test('quick add creates an unchecked list with the trip name ready to type', () => {
  const app = fixture(); app.addTrip();
  assert.equal(app.el('progress-text').textContent, '0 of 24 done');
  assert.equal(app.doc.activeElement, app.el('trip-name'));
  assert.equal(app.el('trip-name').selectionEnd, 'Untitled trip'.length);
  assert.equal(app.saved().trips.length, 1);
  assert.equal(app.saved().trips[0].sections.length, 5);
});

test('item text labels its checkbox; editing is a separate control', () => {
  const app = fixture(); app.addTrip(); const row = app.row();
  const label = row.querySelector('.item-label');
  assert.equal(label.tagName, 'LABEL');
  assert.equal(label.htmlFor, row.querySelector('input[type=checkbox]').id);
  assert.equal(row.querySelector('.item-name').hidden, true);
  app.check(row);
  assert.equal(app.el('progress-text').textContent, '1 of 24 done');
  assert.equal(row.classList.contains('is-packed'), true);
  assert.equal(app.saved().trips[0].sections[0].items[0].packed, true);
});

test('Enter saves, Escape cancels, and leaving an edit saves without changing its checkmark', () => {
  const app = fixture(); app.addTrip(); const row = app.row(); app.check(row);
  app.edit(row, 'Passport');
  assert.equal(row.querySelector('.item-label').textContent, 'Passport');
  assert.equal(app.saved().trips[0].sections[0].items[0].label, 'Passport');
  assert.equal(app.doc.activeElement, row.querySelector('.edit-item'));
  app.edit(row, 'Discard this edit', 'Escape');
  assert.equal(row.querySelector('.item-label').textContent, 'Passport');
  row.querySelector('.edit-item').click();
  const input = row.querySelector('.item-name'); input.value = 'My passport'; input.blur();
  assert.equal(app.saved().trips[0].sections[0].items[0].label, 'My passport');
  assert.equal(app.saved().trips[0].sections[0].items[0].packed, true);
  app.edit(row, '   ');
  assert.equal(row.querySelector('.item-label').textContent, 'My passport');
});

test('the save pencil commits a mouse edit instead of reopening the input', () => {
  const app = fixture(); app.addTrip(); const row = app.row();
  row.querySelector('.edit-item').click(); row.querySelector('.item-name').value = 'Travel wallet';
  row.querySelector('.edit-item').click();
  assert.equal(row.querySelector('.item-name').hidden, true);
  assert.equal(row.querySelector('.item-label').textContent, 'Travel wallet');
});

test('remaining-only filtering keeps focus and explains an empty section', () => {
  const app = fixture(); app.addTrip();
  const section = app.section();
  for (const row of section.children[1].children.slice(0, 3)) app.check(row);
  app.el('remaining-toggle').click();
  assert.equal(app.el('remaining-toggle').getAttribute('aria-pressed'), 'true');
  const current = app.section(); assert.equal(current.children[1].children.length, 1);
  app.check(current.children[1].children[0]);
  assert.equal(current.querySelector('.section-empty').hidden, false);
  assert.equal(current.querySelector('.section-empty').textContent, 'All packed in this section.');
  assert.equal(app.doc.activeElement, app.el('remaining-toggle'));
  app.el('remaining-toggle').click();
  assert.equal(app.section().children[1].children.length, 4);
});

test('adding an item has an explicit disabled state until text exists', () => {
  const app = fixture(); app.addTrip(); const form = app.section().querySelector('.add-item');
  const input = form.querySelector('input'), button = form.querySelector('button');
  assert.equal(button.disabled, true);
  input.value = '   '; input.fire('input'); assert.equal(button.disabled, true);
  input.value = 'Travel adapter'; input.fire('input'); assert.equal(button.disabled, false);
  form.fire('submit');
  assert.equal(app.el('progress-text').textContent, '0 of 25 done');
  assert.equal(input.value, ''); assert.equal(button.disabled, true);
  assert.equal(app.doc.activeElement, input);
});

test('default edits apply to future trips and keep existing trips independent', () => {
  const app = fixture(); app.addTrip(); app.check(app.row());
  const firstTrip = app.saved().trips[0].id;
  app.el('edit-default').click(); app.edit(app.row(), 'Passport & visa'); app.addTrip();
  const saved = app.saved();
  assert.equal(saved.trips[0].sections[0].items[0].label, 'Passport & visa');
  assert.equal(saved.trips[0].sections[0].items[0].packed, false);
  assert.equal(saved.trips.find(trip => trip.id === firstTrip).sections[0].items[0].label, 'ID / passport');
  assert.equal(saved.trips.find(trip => trip.id === firstTrip).sections[0].items[0].packed, true);
  const restored = fixture({ saved });
  assert.equal(restored.row().querySelector('.item-label').textContent, 'Passport & visa');
});

test('Escape cannot repeat an earlier confirmed trip deletion', () => {
  const app = fixture(); app.addTrip(); app.addTrip(); app.addTrip();
  app.el('workspace').querySelector('.delete-trip').click(); app.el('delete-dialog').close('delete');
  assert.equal(app.saved().trips.length, 2);
  assert.equal(app.el('delete-dialog').returnValue, 'delete');
  app.el('workspace').querySelector('.delete-trip').click();
  assert.equal(app.el('delete-dialog').returnValue, 'cancel');
  app.el('delete-dialog').close();
  assert.equal(app.saved().trips.length, 2);
});

test('sidebar updates preserve its horizontal scroll position', () => {
  const app = fixture(); app.addTrip(); app.addTrip(); app.el('trips').scrollLeft = 150;
  app.check(app.row()); assert.equal(app.el('trips').scrollLeft, 150);
});

test('removing the last item preserves focus without opening a phone keyboard', () => {
  const app = fixture(); app.addTrip();
  while (app.section().children[1].children.length) app.row().querySelector('.remove-item').click();
  assert.equal(app.doc.activeElement, app.el('remaining-toggle'));
  assert.equal(app.section().querySelector('.section-empty').textContent, 'No items yet. Add one below.');
});

test('retired before-leaving sections are removed without resetting saved checkmarks', () => {
  const app = fixture(); app.addTrip(); app.check(app.row()); const saved = app.saved();
  const oldSection = { id: 'old', name: 'Before leaving', items: [{ id: 'trash', label: 'Take out trash', packed: true }] };
  saved.template.push(oldSection); saved.trips[0].sections.push(oldSection);
  const restored = fixture({ saved });
  assert.equal(restored.saved().template.length, 5);
  assert.equal(restored.saved().trips[0].sections.length, 5);
  assert.equal(restored.row().querySelector('input[type=checkbox]').checked, true);
});

test('save failures show an error and unreadable saved data is never overwritten', () => {
  const blocked = fixture({ failSaving: true }); blocked.addTrip();
  assert.equal(blocked.el('storage-error').hidden, false);
  assert.equal(blocked.el('save-status').textContent, 'Changes have not been saved.');
  const unreadable = fixture({ saved: '{broken' }); unreadable.addTrip();
  assert.equal(unreadable.storage.get(KEY), '{broken');
  assert.equal(unreadable.el('storage-error').hidden, false);
});
