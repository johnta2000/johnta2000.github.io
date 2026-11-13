(() => {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount(guide) {
    if (!guide.wifi?.network || !guide.wifi?.password) return;
    const page = document.querySelector('main.page');
    if (!page) return;
    document.getElementById('wifi')?.remove();
    const section = document.createElement('section');
    section.id = 'wifi'; section.className = 'guest-wifi';
    section.setAttribute('aria-labelledby', 'guest-wifi-title');
    section.innerHTML = `<h2 id="guest-wifi-title" tabindex="-1">Wi-Fi</h2><div class="guest-wifi-fields"><div><span class="guest-wifi-label">Network</span><div class="guest-wifi-row"><span class="guest-wifi-value">${escape(guide.wifi.network)}</span><button type="button" data-wifi-copy="network" aria-label="Copy Wi-Fi network name">Copy</button></div></div><div><span class="guest-wifi-label">Password</span><div class="guest-wifi-row"><span class="guest-wifi-value">${escape(guide.wifi.password)}</span><button type="button" data-wifi-copy="password">Copy password</button></div></div></div><p class="guest-wifi-help">Choose this network in your Wi-Fi settings, then paste the password.</p><p class="guest-wifi-status" role="status" aria-live="polite"></p>`;
    const nav = page.querySelector('.jump-links');
    const footer = page.querySelector(':scope > footer');
    if (footer) footer.before(section); else page.append(section);
    // Legacy guide has no section navigation. Keep the Wi-Fi destination linkable.
    if (!nav) {
      const link = document.createElement('a');
      link.className = 'guest-wifi-link'; link.textContent = 'Wi-Fi ↓';
      const state = new URLSearchParams(location.hash.slice(1));
      if (state.has('share')) { state.set('section', 'wifi'); link.href = '#' + state.toString(); }
      else link.href = '#wifi';
      const header = page.querySelector('header');
      if (header) header.after(link); else page.prepend(link);
    }
    section.querySelectorAll('[data-wifi-copy]').forEach(button => {
      const normal = button.textContent;
      let reset;
      button.onclick = async () => {
        const kind = button.dataset.wifiCopy;
        const status = section.querySelector('[role="status"]');
        const value = guide.wifi[kind];
        try {
          try { await navigator.clipboard.writeText(value); }
          catch {
            const field = document.createElement('textarea');
            field.value = value; field.style.cssText = 'position:fixed;left:-9999px;top:0';
            document.body.append(field);
            try { field.select(); if (!document.execCommand('copy')) throw Error(); }
            finally { field.remove(); button.focus({preventScroll:true}); }
          }
          button.textContent = 'Copied ✓';
          status.textContent = kind === 'password' ? 'Wi-Fi password copied.' : 'Network name copied.';
          clearTimeout(reset); reset = setTimeout(() => { button.textContent = normal; }, 2000);
        } catch {
          // Leave the actual value visible and select it for manual copying.
          const valueNode = button.previousElementSibling;
          const selection = window.getSelection(); const range = document.createRange();
          range.selectNodeContents(valueNode); selection.removeAllRanges(); selection.addRange(range);
          status.textContent = 'Couldn’t copy automatically. Select and copy the highlighted text.';
        }
      };
    });
    const restore = () => {
      const hash = location.hash.slice(1);
      if (hash === 'wifi' || new URLSearchParams(hash).get('section') === 'wifi') {
        section.scrollIntoView({block:'start'});
        section.querySelector('h2').focus({preventScroll:true});
      }
    };
    window.addEventListener('hashchange', restore);
    window.addEventListener('popstate', restore);
    restore();
  }
  window.ApartmentWifi = {mount};
})();
