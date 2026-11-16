/* Shared controls move into a mobile sheet; their existing URL-backed state stays authoritative. */
window.initializeSleepFilters = function () {
  const dialog = document.querySelector('#mobileFiltersDialog');
  const opener = document.querySelector('#openMobileFilters');
  const range = document.querySelector('#rangeControl');
  const providers = document.querySelector('#comparisonProviders');
  const providerHome = providers.parentElement;
  let pressedBackdrop = false;
  function restoreControls() {
    document.querySelector('#rangeControlHome').append(range);
    providerHome.prepend(providers);
  }
  function sync() {
    const params = new URLSearchParams(location.search);
    const selected = ['7', '28', '90', 'all'].includes(params.get('range')) ? params.get('range') : '7';
    const personal = document.querySelector('#app').dataset.activeView === 'overview';
    const allProviders = [...providers.querySelectorAll('[data-source]')];
    const shown = allProviders.filter(button => button.getAttribute('aria-pressed') === 'true');
    const providerText = shown.length === allProviders.length ? 'All providers' : shown.length === 1 ? shown[0].textContent.trim() : shown.length ? `${shown.length} providers` : 'No providers';
    document.querySelector('#mobileFilterSummary').textContent = `${selected === 'all' ? 'All available' : selected + ' days'}${personal ? ' · ' + providerText : ''}`;
    document.querySelector('#filterProvidersSection').hidden = !personal;
    const enabled = !document.querySelector('#app').hidden && ['overview','trends','friends'].includes(document.querySelector('#app').dataset.activeView);
    if (params.get('dialog') === 'filters' && enabled) {
      const rangeSlot = document.querySelector('#filterRangeSlot');
      if (range.parentElement !== rangeSlot) rangeSlot.append(range);
      const providerSlot = personal ? document.querySelector('#filterProvidersSlot') : providerHome;
      if (providers.parentElement !== providerSlot) providerSlot.prepend(providers);
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) dialog.close();
  }
  function close() { dialog.close(); }
  opener.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('dialog','filters');
    history.pushState({},'',url.pathname + url.search + url.hash);
    sync();
  });
  dialog.querySelectorAll('[data-close-filters]').forEach(button => button.addEventListener('click',close));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  // The dialog has no padding: its children handle padding, so only the actual backdrop targets it.
  dialog.addEventListener('pointerdown', event => { pressedBackdrop = event.target === dialog; });
  dialog.addEventListener('click', event => {
    if (pressedBackdrop && event.target === dialog) close();
    pressedBackdrop = false;
  });
  dialog.addEventListener('close', () => {
    restoreControls();
    const url = new URL(location.href);
    if (url.searchParams.get('dialog') === 'filters') {
      url.searchParams.delete('dialog');
      history.replaceState({},'',url.pathname + url.search + url.hash);
    }
    (opener.getClientRects().length ? opener : range.querySelector('[aria-pressed="true"]'))?.focus({preventScroll:true});
  });
  window.SleepFilters = {sync};
  window.addEventListener('popstate',sync);
};
