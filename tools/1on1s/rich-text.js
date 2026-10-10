/* The journal stores a small, safe subset of document HTML. */
(() => {
  const allowed = new Set(['P','DIV','BR','UL','OL','LI','B','STRONG','I','EM','U','S','STRIKE','BLOCKQUOTE','CODE','PRE','A','H1','H2','H3']);
  const discard = new Set(['SCRIPT','STYLE','SVG','MATH','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','TEXTAREA','SELECT','LINK','META','IMG','VIDEO','AUDIO']);
  function sanitize(html) {
    const input = document.createElement('template'); input.innerHTML = html || '';
    const output = document.createElement('div');
    function copy(source, target) {
      for (const child of source.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) { target.append(document.createTextNode(child.textContent)); continue; }
        if (child.nodeType !== Node.ELEMENT_NODE || discard.has(child.tagName)) continue;
        const result = allowed.has(child.tagName) ? document.createElement(child.tagName.toLowerCase()) : document.createDocumentFragment();
        if (child.tagName === 'A') {
          const href = child.getAttribute('href') || '';
          if (/^(https?:\/\/|mailto:)/i.test(href.trim())) {
            result.setAttribute('href', href.trim()); result.setAttribute('target', '_blank'); result.setAttribute('rel', 'noopener noreferrer');
          }
        }
        if (child.tagName === 'OL' && /^\d{1,5}$/.test(child.getAttribute('start') || '')) result.setAttribute('start', child.getAttribute('start'));
        // Google Docs and Word often express basic formatting with styled spans.
        let inner = result;
        const styles = child.style;
        for (const [enabled, tag] of [[styles?.fontWeight === 'bold' || Number(styles?.fontWeight) >= 600, 'strong'], [styles?.fontStyle === 'italic', 'em'], [styles?.textDecorationLine?.includes('underline'), 'u']]) {
          if (enabled) { const wrapper = document.createElement(tag); inner.append(wrapper); inner = wrapper; }
        }
        copy(child, inner); target.append(result);
      }
    }
    copy(input.content, output); return output.innerHTML;
  }
  function render(target, value, format = 'plain') {
    if (format === 'html') target.innerHTML = sanitize(value);
    else target.textContent = value || '';
    target._updateEditorMeta?.();
    target._resetToolbarState?.();
  }
  function enhance(textarea) {
    const wrapper = document.createElement('div'); wrapper.className = 'rich-field';
    const toolbar = document.createElement('div'); toolbar.className = 'rich-toolbar'; toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', `Formatting for ${textarea.getAttribute('aria-label') || textarea.id}`);
    const editor = document.createElement('div'); editor.id = textarea.id; editor.className = 'rich-editor';
    editor.contentEditable = 'true'; editor.setAttribute('role','textbox'); editor.setAttribute('aria-multiline','true');
    const label = document.querySelector(`label[for="${textarea.id}"]`);
    if (label) { label.id ||= `${textarea.id}-label`; editor.setAttribute('aria-labelledby',label.id); }
    else editor.setAttribute('aria-label', textarea.getAttribute('aria-label') || textarea.id);
    toolbar.setAttribute('aria-label', `Formatting for ${label?.textContent.trim() || textarea.getAttribute('aria-label') || textarea.id}`);
    editor.dataset.placeholder = textarea.placeholder || 'Write your thoughts…'; editor.spellcheck = true;
    const footer = document.createElement('div'); footer.className = 'rich-footer';
    const wordCount = document.createElement('span'); wordCount.textContent = '0 words';
    const shortcut = document.createElement('span'); shortcut.textContent = '⌘/Ctrl + B · I · U';
    footer.append(wordCount, shortcut);
    const linkForm = document.createElement('form'); linkForm.className = 'rich-link-popover'; linkForm.hidden = true;
    linkForm.innerHTML = '<label>Link URL <input type="text" inputmode="url" autocomplete="url" placeholder="https://example.com"></label><div class="rich-link-actions"><button type="submit">Apply link</button><button type="button" data-cancel-link>Cancel</button></div><p class="rich-link-error" role="alert" hidden></p>';
    const linkInput = linkForm.querySelector('input'), linkError = linkForm.querySelector('.rich-link-error');
    let selectionRange = null, disabled = false;
    function wordCountUpdate() {
      const text = editor.textContent.trim(); const count = text ? text.split(/\s+/u).length : 0;
      wordCount.textContent = `${count} word${count === 1 ? '' : 's'}`;
    }
    editor._updateEditorMeta = wordCountUpdate;
    editor._resetToolbarState = () => toolbar.querySelectorAll('[aria-pressed]').forEach(button => button.setAttribute('aria-pressed','false'));
    function selectionInside() {
      const selection = window.getSelection();
      return selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode);
    }
    function currentBlock() {
      if (!selectionInside()) return null;
      let element = window.getSelection().anchorNode;
      if (element?.nodeType === Node.TEXT_NODE) element = element.parentElement;
      return element?.closest?.('h2,blockquote,p,div,li') || null;
    }
    function updateButtons() {
      if (!selectionInside()) return;
      for (const name of ['bold','italic','underline','insertUnorderedList','insertOrderedList']) {
        toolbar.querySelector(`[data-command="${name}"]`)?.setAttribute('aria-pressed', String(document.queryCommandState(name)));
      }
      const block = currentBlock();
      toolbar.querySelector('[data-command="heading"]')?.setAttribute('aria-pressed', String(block?.tagName === 'H2'));
      toolbar.querySelector('[data-command="quote"]')?.setAttribute('aria-pressed', String(block?.tagName === 'BLOCKQUOTE'));
    }
    function remember() {
      if (selectionInside()) selectionRange = window.getSelection().getRangeAt(0).cloneRange();
      updateButtons();
    }
    function restore() {
      editor.focus();
      if (selectionRange && editor.contains(selectionRange.commonAncestorContainer)) {
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(selectionRange);
      }
    }
    function changed() {
      remember(); wordCountUpdate(); editor.dispatchEvent(new Event('input',{bubbles:true}));
    }
    function command(name) {
      if (disabled) return;
      restore();
      if (name === 'heading' || name === 'quote') {
        const tag = name === 'heading' ? 'H2' : 'BLOCKQUOTE';
        document.execCommand('formatBlock', false, currentBlock()?.tagName === tag ? 'P' : tag);
      } else if (name === 'clear') {
        document.execCommand('removeFormat', false, null);
        document.execCommand('formatBlock', false, 'P');
      } else document.execCommand(name, false, null);
      changed();
    }
    function addButton(name, text, label, action = () => command(name)) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.title = label; button.setAttribute('aria-label',label); button.dataset.command = name;
      if (['bold','italic','underline','insertUnorderedList','insertOrderedList','heading','quote'].includes(name)) button.setAttribute('aria-pressed','false');
      button.onmousedown = event => event.preventDefault(); button.onclick = action; toolbar.append(button);
    }
    function divider() { const line = document.createElement('span'); line.className = 'toolbar-divider'; line.setAttribute('aria-hidden','true'); toolbar.append(line); }
    addButton('undo','↶','Undo'); addButton('redo','↷','Redo'); divider();
    addButton('heading','H2','Heading'); addButton('bold','B','Bold'); addButton('italic','I','Italic'); addButton('underline','U','Underline'); divider();
    addButton('insertUnorderedList','• List','Bulleted list'); addButton('insertOrderedList','1. List','Numbered list');
    addButton('outdent','←','Decrease indent'); addButton('indent','→','Increase indent'); addButton('quote','❝','Quote'); divider();
    addButton('link','↗','Insert link',openLink); addButton('clear','Tx','Clear formatting');
    function closeLink() { linkForm.hidden = true; linkError.hidden = true; linkInput.value = ''; }
    function openLink() {
      if (disabled) return;
      linkForm.hidden = false; linkError.hidden = true;
      const anchor = currentBlock()?.closest?.('a') || (selectionInside() ? window.getSelection().anchorNode.parentElement?.closest?.('a') : null);
      linkInput.value = anchor?.getAttribute('href') || '';
      linkInput.focus();
    }
    linkForm.querySelector('[data-cancel-link]').onclick = () => { closeLink(); editor.focus(); };
    linkForm.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeLink(); editor.focus(); } });
    linkForm.onsubmit = event => {
      event.preventDefault();
      let url = linkInput.value.trim();
      if (url && !/^[a-z][a-z\d+.-]*:/i.test(url)) url = `https://${url}`;
      if (!/^(https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/i.test(url)) {
        linkError.textContent = 'Enter an http, https, or email link.'; linkError.hidden = false; return;
      }
      restore();
      const selection = window.getSelection();
      if (selection?.toString()) document.execCommand('createLink', false, url);
      else {
        const anchor = document.createElement('a'); anchor.href = url; anchor.textContent = url;
        document.execCommand('insertHTML', false, anchor.outerHTML);
      }
      closeLink(); changed();
    };
    editor.addEventListener('keyup',remember); editor.addEventListener('mouseup',remember); editor.addEventListener('input',wordCountUpdate); editor.addEventListener('blur',remember);
    document.addEventListener('selectionchange', () => { if (selectionInside()) remember(); });
    editor.addEventListener('keydown',event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); remember(); openLink(); }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && ['Digit7','Digit8'].includes(event.code)) { event.preventDefault(); command(event.code === 'Digit8' ? 'insertUnorderedList' : 'insertOrderedList'); }
    });
    editor.addEventListener('click',event => { if (event.target.closest('a')) event.preventDefault(); });
    editor.addEventListener('paste',event => {
      event.preventDefault(); if (disabled) return;
      const html = event.clipboardData?.getData('text/html');
      const plain = event.clipboardData?.getData('text/plain') || '';
      if (html) document.execCommand('insertHTML',false,sanitize(html));
      else { const temp = document.createElement('div'); temp.textContent = plain; document.execCommand('insertHTML',false,temp.innerHTML.replace(/\r?\n/g,'<br>')); }
      changed();
    });
    editor.addEventListener('drop',event => event.preventDefault());
    Object.defineProperty(editor,'value',{get:()=>editor.textContent.trim() ? sanitize(editor.innerHTML) : '',set:value=>{render(editor,value,'html');selectionRange=null;}});
    Object.defineProperty(editor,'disabled',{get:()=>disabled,set:value=>{
      disabled = Boolean(value); editor.contentEditable = String(!disabled); editor.setAttribute('aria-disabled',String(disabled));
      toolbar.querySelectorAll('button').forEach(button => { button.disabled = disabled; });
      if (disabled) closeLink();
    }});
    wrapper.append(toolbar,editor,footer,linkForm); textarea.replaceWith(wrapper); return editor;
  }
  window.JournalRichText = {enhance,render,sanitize};
})();
