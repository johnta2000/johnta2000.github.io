(() => {
  'use strict';
  const sections = [...document.querySelectorAll('.cafe-section')];
  const form = document.querySelector('#search-form');
  const search = document.querySelector('#search');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const normal = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function state() {
    const params = new URLSearchParams(location.search);
    return { cafe: ['delah', 'sightglass', 'philz', 'binge'].includes(params.get('cafe')) ? params.get('cafe') : 'all', kind: ['drinks', 'food', 'pantry'].includes(params.get('kind')) ? params.get('kind') : 'all', q: (params.get('q') || '').trim() };
  }
  function url(next) {
    const params = new URLSearchParams();
    for (const key of ['cafe', 'kind', 'q']) if (next[key] && next[key] !== 'all') params.set(key, next[key]);
    return location.pathname + (params.size ? '?' + params.toString() : '');
  }
  function render() {
    const s = state();
    search.value = s.q;
    const terms = normal(s.q).split(/\s+/).filter(Boolean);
    let count = 0, cafeCount = 0;
    for (const section of sections) {
      let cafeItems = 0;
      const matchesCafe = s.cafe === 'all' || section.dataset.cafe === s.cafe;
      for (const group of section.querySelectorAll('.menu-group')) {
        let groupItems = 0;
        const category = group.querySelector('h3').textContent;
        for (const item of group.querySelectorAll('li')) {
          const haystack = normal(item.dataset.name + ' ' + category + ' ' + section.querySelector('h2').textContent);
          const visible = matchesCafe && (s.kind === 'all' || item.dataset.kind === s.kind) && terms.every(term => haystack.includes(term));
          item.hidden = !visible;
          if (visible) groupItems++;
        }
        group.hidden = !groupItems;
        cafeItems += groupItems;
      }
      section.hidden = !cafeItems;
      if (cafeItems) cafeCount++;
      count += cafeItems;
      const note = section.querySelector('.unpriced');
      if (note) note.hidden = s.q !== '' || !['all', 'food'].includes(s.kind);
    }
    filters.forEach(link => {
      const active = s[link.dataset.filter] === link.dataset.value;
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      link.href = url({...s, [link.dataset.filter]: link.dataset.value});
    });
    document.querySelector('#result-count').textContent = `${count} priced ${count === 1 ? 'item' : 'items'} · ${cafeCount} ${cafeCount === 1 ? 'café' : 'cafés'}`;
    document.querySelector('#empty').hidden = count !== 0;
    const selectedCafe = sections.find(section => section.dataset.cafe === s.cafe);
    document.title = `${selectedCafe ? selectedCafe.querySelector('h2').textContent + ' menu' : 'Coffee, decided.'} — John Ta`;
  }
  function navigate(next) {
    if (next !== location.pathname + location.search) history.pushState(null, '', next);
    render();
  }
  filters.forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(url({...state(), [link.dataset.filter]: link.dataset.value, q: search.value.trim()}));
  }));
  form.addEventListener('submit', event => { event.preventDefault(); navigate(url({...state(), q: search.value.trim()})); });
  document.querySelectorAll('a[href="?"]:not([data-filter])').forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(location.pathname);
  }));
  window.addEventListener('popstate', render);
  render();
})();
