(() => {
  'use strict';
  window.PaymentScreenshots = { create({ call, token, changed }) {
    const $ = id => document.getElementById(id), dialog = $('screenshots-dialog');
    let target = null, generation = 0, files = [], pending = [], uploading = false, loading = false;
    const urls = new Set();
    function el(tag, text, className) { const n = document.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n; }
    function button(text, action) { const b = el('button', text); b.type = 'button'; b.addEventListener('click', action); return b; }
    function notice(text) { $('screenshot-state').textContent = text; }
    function clearUrls() { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); }
    function reset() { generation++; target = null; files = []; pending = []; uploading = false; loading = false; clearUrls(); $('payment-screenshots').replaceChildren(); $('screenshot-input').value = ''; notice(''); if (dialog.open) dialog.close(); }
    async function request(id, options = {}, month) {
      const current = generation, auth = await token();
      if (current !== generation) throw Error('Session changed.');
      const url = new URL('https://rapid-shark-565.convex.site/payment-file'); url.searchParams.set('id', id); if (month) url.searchParams.set('month', month);
      const response = await fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(30000), headers: { ...options.headers, Authorization: `Bearer ${auth}` } });
      if (!response.ok) throw Error('Screenshot request failed.');
      return response;
    }
    function preview(file, url, status, remove, retry) {
      const card = el('figure', null, 'payment-screenshot');
      const link = el('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', `Open full-size ${file.name}`);
      const img = el('img'); img.src = url; img.alt = file.name; link.append(img);
      const caption = el('figcaption'); caption.append(el('span', status));
      if (retry) caption.append(button('Retry upload', retry));
      const removeButton = button('Remove', remove); removeButton.disabled = uploading; caption.append(removeButton);
      card.append(link, caption); return card;
    }
    async function loadImage(file, placeholder, current) {
      try {
        const response = await request(file._id), blob = await response.blob();
        if (current !== generation || !placeholder.isConnected) return;
        const url = URL.createObjectURL(blob); urls.add(url);
        placeholder.replaceWith(preview(file, url, 'Saved · click to enlarge', () => void removeFile(file)));
      } catch { if (current === generation && placeholder.isConnected) placeholder.replaceChildren(button('Retry loading screenshot', () => void loadImage(file, placeholder, current))); }
    }
    function render() {
      clearUrls(); $('payment-screenshots').replaceChildren();
      $('screenshot-add').disabled = uploading || loading;
      for (const file of files) { const placeholder = el('div', 'Loading screenshot…', 'screenshot-loading'); $('payment-screenshots').append(placeholder); void loadImage(file, placeholder, generation); }
      for (const item of pending) {
        const url = URL.createObjectURL(item.file); urls.add(url);
        $('payment-screenshots').append(preview(item.file, url, uploading ? 'Uploading…' : 'Not uploaded yet', () => { pending = pending.filter(p => p !== item); notice(''); render(); }, uploading ? null : () => void upload()));
      }
      if (!files.length && !pending.length && !loading) $('payment-screenshots').append(el('p', 'Add a receipt or payment confirmation. You can also paste or drop a screenshot here.', 'screenshot-empty'));
    }
    async function reload(current) {
      const result = await call('query', 'screenshots', { accountId: target.id, month: target.month });
      if (current !== generation) return;
      files = result;
    }
    async function removeFile(file) {
      if (uploading || !target) return;
      const current = generation; uploading = true; render();
      try { await call('mutation', 'removeScreenshot', { id: file._id }); if (current !== generation) return; files = files.filter(f => f._id !== file._id); notice('Screenshot removed.'); void changed(); }
      catch { if (current === generation) notice('Couldn’t remove the screenshot. Try again.'); }
      finally { if (current === generation) { uploading = false; render(); } }
    }
    async function upload() {
      if (!target || uploading || !pending.length || loading) return;
      const current = generation, destination = { ...target }; uploading = true; render(); notice('Uploading screenshot…');
      try {
        for (const item of [...pending]) {
          await request(destination.id, { method: 'POST', body: item.file, headers: { 'Content-Type': item.file.type, 'X-File-Name': encodeURIComponent(item.file.name), 'X-Request-Key': item.key } }, destination.month);
          if (current !== generation) return;
          pending = pending.filter(p => p !== item);
        }
        await reload(current);
        if (current === generation) { notice('Screenshots saved. Payment status is unchanged.'); void changed(); }
      } catch { if (current === generation) notice(pending.length ? 'Upload failed. Your screenshot is still here—retry below.' : 'Upload saved, but the preview couldn’t refresh. Close and reopen Screenshots.'); }
      finally { if (current === generation) { uploading = false; render(); } }
    }
    async function addFiles(incoming) {
      if (!target || uploading || loading) return;
      for (const file of incoming) {
        if (!['image/png','image/jpeg','image/webp'].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) { notice('Choose a PNG, JPEG, or WebP image under 8 MB.'); continue; }
        if (files.length + pending.length >= 10) { notice('A payment can have up to 10 screenshots.'); break; }
        pending.push({ file, key: crypto.randomUUID() });
      }
      render(); await upload();
    }
    async function open(account, month, monthLabel) {
      reset(); target = { id: account._id, month }; const current = generation;
      $('screenshots-title').textContent = `${account.person} · ${account.bank}`;
      $('screenshots-month').textContent = `${account.nickname ? account.nickname + ' · ' : ''}${monthLabel}`;
      loading = true; render(); notice('Loading screenshots…'); dialog.showModal();
      try { await reload(current); if (current === generation) notice(''); }
      catch { if (current === generation) notice('Couldn’t load screenshots. Close and reopen to retry.'); }
      finally { if (current === generation) { loading = false; render(); } }
    }
    function close(event) { if (event) event.preventDefault(); if (uploading || pending.length) { notice('Finish the upload, or remove the unsaved screenshot before closing.'); return; } reset(); }
    $('screenshots-close').addEventListener('click', close); dialog.addEventListener('cancel', close);
    $('screenshot-add').addEventListener('click', () => $('screenshot-input').click());
    $('screenshot-input').addEventListener('change', () => { const incoming = [...$('screenshot-input').files]; $('screenshot-input').value = ''; void addFiles(incoming); });
    dialog.addEventListener('paste', event => { const images = [...(event.clipboardData?.files || [])]; if (images.length) { event.preventDefault(); void addFiles(images); } });
    dialog.addEventListener('dragover', event => event.preventDefault());
    dialog.addEventListener('drop', event => { event.preventDefault(); void addFiles([...(event.dataTransfer?.files || [])]); });
    window.addEventListener('beforeunload', event => { if (uploading || pending.length) { event.preventDefault(); event.returnValue = ''; } });
    return { open, reset };
  } };
})();
