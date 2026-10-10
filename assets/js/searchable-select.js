/* Shared searchable single-select. Keep the native select as the form's source of truth. */
(() => {
  'use strict';
  const instances = new WeakMap();
  let sequence = 0, current = null;
  function enhance(select) {
    if (instances.has(select)) return instances.get(select);
    const id = select.id || `picker-${++sequence}`;
    const label = select.getAttribute('aria-label') || document.getElementById(select.getAttribute('aria-labelledby'))?.textContent || 'Choose an option';
    const make = (tag, className) => Object.assign(document.createElement(tag), { className });
    const wrapper = make('div', 'search-select');
    const trigger = make('button', 'search-select-trigger');
    trigger.type = 'button'; trigger.id = `${id}-trigger`;
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
    const value = make('span', 'search-select-value');
    const chevron = make('span', 'search-select-chevron'); chevron.setAttribute('aria-hidden', 'true');
    trigger.append(value, chevron);
    const panel = make('div', 'search-select-panel');
    panel.id = `${id}-panel`; panel.hidden = true;
    if (typeof panel.showPopover === 'function') panel.setAttribute('popover', 'manual');
    const searchBox = make('div', 'search-select-search');
    const search = make('input', 'search-select-input');
    search.type = 'text'; search.placeholder = `Search ${label.toLowerCase()}…`; search.autocomplete = 'off'; search.spellcheck = false;
    search.setAttribute('role', 'combobox'); search.setAttribute('aria-label', `Search ${label.toLowerCase()}`);
    search.setAttribute('aria-autocomplete', 'list'); search.setAttribute('aria-expanded', 'false');
    const list = make('div', 'search-select-list'); list.id = `${id}-options`; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label);
    const empty = make('p', 'search-select-empty'); empty.textContent = 'No matches. Try another search.'; empty.setAttribute('role', 'status'); empty.hidden = true;
    search.setAttribute('aria-controls', list.id); trigger.setAttribute('aria-controls', list.id);
    searchBox.append(search); panel.append(searchBox, list, empty); wrapper.append(trigger, panel); select.after(wrapper); select.hidden = true;
    let opened = false, matches = [], active = -1;
    const normalized = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    function activate(index, scroll = true) {
      active = index;
      Array.from(list.children).forEach((item, i) => item.classList.toggle('is-active', i === index));
      const item = list.children[index];
      if (item) { search.setAttribute('aria-activedescendant', item.id); if (scroll) item.scrollIntoView({ block: 'nearest' }); }
      else search.removeAttribute('aria-activedescendant');
    }
    function filter() {
      const query = normalized(search.value.trim());
      matches = Array.from(select.options).filter(option => !option.hidden && normalized(option.textContent).includes(query));
      list.replaceChildren();
      matches.forEach((option, i) => {
        const item = make('div', 'search-select-option'); item.id = `${id}-option-${i}`;
        item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(option.selected));
        item.setAttribute('aria-disabled', String(option.disabled));
        const text = make('span', 'search-select-option-text'); text.textContent = option.textContent;
        const check = make('span', 'search-select-check'); check.textContent = option.selected ? '✓' : ''; check.setAttribute('aria-hidden', 'true');
        item.append(text, check);
        // Safari suppresses the synthesized click when touch pointerdown is cancelled.
        item.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse') event.preventDefault(); });
        item.addEventListener('click', () => choose(i)); list.append(item);
      });
      empty.hidden = matches.length > 0;
      const selected = matches.findIndex(option => option.selected && !option.disabled);
      activate(selected >= 0 ? selected : matches.findIndex(option => !option.disabled), false);
    }
    function position() {
      if (!opened) return;
      const rect = trigger.getBoundingClientRect(), viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft || 0, topEdge = viewport?.offsetTop || 0;
      const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
      const panelWidth = Math.min(Math.max(rect.width, 240), width - 16);
      panel.style.width = `${panelWidth}px`;
      const anchorTop = Math.min(Math.max(rect.top, topEdge + 8), topEdge + height - 8);
      const anchorBottom = Math.min(Math.max(rect.bottom, topEdge + 8), topEdge + height - 8);
      const below = topEdge + height - anchorBottom - 14, above = anchorTop - topEdge - 14;
      const belowAnchor = below >= Math.min(310, panel.scrollHeight) || below >= above;
      const available = Math.max(80, belowAnchor ? below : above);
      panel.style.maxHeight = `${available}px`;
      list.style.maxHeight = `${Math.max(44, Math.min(264, available - 68))}px`;
      panel.style.left = `${Math.max(leftEdge + 8, Math.min(rect.left, leftEdge + width - panelWidth - 8))}px`;
      panel.style.top = `${belowAnchor ? anchorBottom + 6 : Math.max(topEdge + 8, anchorTop - panel.getBoundingClientRect().height - 6)}px`;
    }
    function close(focus = false) {
      if (!opened) return;
      opened = false; if (current === api) current = null;
      if (panel.hidePopover && panel.matches(':popover-open')) panel.hidePopover();
      panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); search.setAttribute('aria-expanded', 'false');
      search.removeAttribute('aria-activedescendant'); search.value = ''; list.replaceChildren(); matches = [];
      if (focus && !trigger.disabled) trigger.focus({ preventScroll: true });
    }
    function open(query = '') {
      if (select.disabled) return;
      current?.close(); opened = true; current = api;
      search.value = query; filter(); panel.hidden = false;
      if (panel.showPopover) panel.showPopover();
      trigger.setAttribute('aria-expanded', 'true'); search.setAttribute('aria-expanded', 'true');
      position(); search.focus({ preventScroll: true }); search.setSelectionRange(query.length, query.length);
      activate(active); position();
    }
    function choose(index) {
      const option = matches[index]; if (!option || option.disabled || select.disabled) return;
      const changed = select.value !== option.value;
      select.value = option.value; close(true); sync();
      if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function sync() {
      value.textContent = select.selectedOptions[0]?.textContent || 'Choose…';
      trigger.setAttribute('aria-label', `${label}: ${value.textContent}`); trigger.disabled = select.disabled;
      if (select.disabled) close();
      if (opened) { filter(); position(); }
    }
    const api = { sync, close }; instances.set(select, api);
    trigger.addEventListener('click', () => opened ? close() : open());
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); }
      else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); open(event.key); }
    });
    search.addEventListener('input', () => { filter(); position(); });
    search.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); choose(active); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); const step = event.key === 'ArrowDown' ? 1 : -1;
        for (let n = 1; n <= matches.length; n++) {
          const index = (active + step * n + matches.length) % matches.length;
          if (!matches[index].disabled) { activate(index); break; }
        }
      }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      // Return to the trigger before the browser advances focus to the next/previous control.
      if (event.key === 'Tab') close(true);
    });
    document.addEventListener('pointerdown', event => { if (opened && !wrapper.contains(event.target)) close(); });
    document.addEventListener('focusin', event => { if (opened && !wrapper.contains(event.target)) close(); });
    window.addEventListener('resize', position);
    document.addEventListener('scroll', event => { if (!panel.contains(event.target)) position(); }, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    select.closest('dialog')?.addEventListener('close', () => close());
    select.addEventListener('change', sync);
    select.form?.addEventListener('reset', () => { close(); queueMicrotask(sync); });
    new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label', 'selected', 'hidden'], characterData: true });
    sync(); return api;
  }
  window.SearchableSelect = { enhance };
})();
