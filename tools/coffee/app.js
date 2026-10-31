(() => {
  'use strict';
  const tbody = document.querySelector('tbody');
  const rows = [...tbody.rows];
  const search = document.querySelector('#search');
  const compared = document.querySelector('#compared');
  const filterLinks = [...document.querySelectorAll('[data-filter]')];
  const sortLinks = [...document.querySelectorAll('[data-sort]')];
  let editingSearch = false;
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  rows.forEach(row => { row.searchText = normalize([row.dataset.name, row.dataset.category, row.dataset.cafe].join(' ')); });
  function state() {
    const p = new URLSearchParams(location.search);
    return {
      cafe: ['delah','sightglass','philz','binge'].includes(p.get('cafe')) ? p.get('cafe') : 'all',
      kind: ['drinks','food','pantry'].includes(p.get('kind')) ? p.get('kind') : 'all',
      q: p.get('q') || '', compared: p.get('compared') === '1',
      sort: ['name','dd','direct','diff'].includes(p.get('sort')) ? p.get('sort') : 'name',
      dir: p.get('dir') === 'desc' ? 'desc' : 'asc'
    };
  }
  function url(s) {
    const p = new URLSearchParams();
    for (const key of ['cafe','kind']) if (s[key] !== 'all') p.set(key,s[key]);
    if (s.q) p.set('q',s.q);
    if (s.compared) p.set('compared','1');
    if (s.sort !== 'name') p.set('sort',s.sort);
    if (s.dir !== 'asc') p.set('dir',s.dir);
    return location.pathname + (p.size ? '?' + p.toString() : '');
  }
  function render() {
    const s = state(), terms = normalize(s.q).trim().split(/\s+/).filter(Boolean);
    if (search.value !== s.q) search.value = s.q;
    compared.checked = s.compared;
    document.querySelector('#clear-search').hidden = !s.q;
    const sorted = [...rows].sort((a,b) => {
      if (s.sort === 'name') return a.dataset.name.localeCompare(b.dataset.name,undefined,{sensitivity:'base'}) * (s.dir === 'desc' ? -1 : 1);
      const av = a.dataset[s.sort], bv = b.dataset[s.sort];
      if (av === '' || bv === '') return av === bv ? a.dataset.name.localeCompare(b.dataset.name) : av === '' ? 1 : -1;
      return (Number(av)-Number(bv)) * (s.dir === 'desc' ? -1 : 1) || a.dataset.name.localeCompare(b.dataset.name);
    });
    let count = 0, both = 0;
    const fragment = document.createDocumentFragment();
    for (const row of sorted) {
      const visible = (s.cafe === 'all' || row.dataset.cafe === s.cafe) && (s.kind === 'all' || row.dataset.kind === s.kind) && (!s.compared || row.dataset.direct !== '') && terms.every(term=>row.searchText.includes(term));
      row.hidden = !visible;
      if (visible) { count++; if (row.dataset.direct !== '') both++; }
      fragment.append(row);
    }
    tbody.append(fragment);
    document.querySelector('#count').textContent = `${count} ${count === 1 ? 'item' : 'items'} · ${both} with both prices`;
    document.querySelector('#empty').hidden = count !== 0;
    filterLinks.forEach(link => {
      if (s[link.dataset.filter] === link.dataset.value) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
      link.href = url({...s,[link.dataset.filter]:link.dataset.value});
    });
    sortLinks.forEach(link => {
      const active = s.sort === link.dataset.sort;
      link.closest('th').setAttribute('aria-sort',active ? s.dir === 'asc' ? 'ascending' : 'descending' : 'none');
      link.querySelector('span').textContent = active ? s.dir === 'asc' ? '↑' : '↓' : '';
      link.href = url({...s,sort:link.dataset.sort,dir:active && s.dir === 'asc' ? 'desc' : 'asc'});
    });
  }
  function navigate(next,replace=false) {
    const dest = typeof next === 'string' ? next : url(next);
    if (dest !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState'](null,'',dest);
    render();
  }
  function isPlainClick(event) { return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey; }
  [...filterLinks,...sortLinks].forEach(link=>link.addEventListener('click',event=>{
    if (!isPlainClick(event)) return;
    event.preventDefault(); editingSearch=false; navigate(link.pathname+link.search);
  }));
  search.addEventListener('input',()=>{
    navigate({...state(),q:search.value},editingSearch);
    editingSearch=true;
  });
  search.addEventListener('blur',()=>{editingSearch=false;});
  document.querySelector('#search-form').addEventListener('submit',event=>{event.preventDefault();editingSearch=false;});
  document.querySelector('#clear-search').addEventListener('click',()=>{editingSearch=false;navigate({...state(),q:''});search.focus();});
  compared.addEventListener('change',()=>{editingSearch=false;navigate({...state(),compared:compared.checked});});
  document.querySelectorAll('#reset,[data-reset]').forEach(link=>link.addEventListener('click',event=>{
    if (!isPlainClick(event)) return;
    event.preventDefault();editingSearch=false;navigate(location.pathname);
  }));
  window.addEventListener('popstate',()=>{editingSearch=false;render();});
  render();
})();
