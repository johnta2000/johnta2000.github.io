/* Private journal editor: sanitize on paste, save, load, and history rendering. */
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
        let result = allowed.has(child.tagName) ? document.createElement(child.tagName.toLowerCase()) : document.createDocumentFragment();
        if (child.tagName === 'A') {
          const href = child.getAttribute('href') || '';
          if (/^(https?:\/\/|mailto:)/i.test(href.trim())) { result.setAttribute('href', href.trim()); result.setAttribute('target', '_blank'); result.setAttribute('rel', 'noopener noreferrer'); }
        }
        if (child.tagName === 'OL' && /^\d{1,5}$/.test(child.getAttribute('start') || '')) result.setAttribute('start', child.getAttribute('start'));
        // Google Docs/Word commonly put bold and italic text inside styled spans.
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
    editor.dataset.placeholder = textarea.placeholder || 'Write your thoughts…'; editor.spellcheck = true;
    let selectionRange = null, disabled = false;
    function remember() {
      const selection = window.getSelection();
      if (selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) selectionRange = selection.getRangeAt(0).cloneRange();
    }
    function command(name) {
      if (disabled) return;
      editor.focus();
      if (selectionRange && editor.contains(selectionRange.commonAncestorContainer)) { const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(selectionRange); }
      document.execCommand(name, false, null); remember(); editor.dispatchEvent(new Event('input',{bubbles:true}));
    }
    const buttons = [['bold','B','Bold'],['italic','I','Italic'],['underline','U','Underline'],['insertUnorderedList','• List','Bulleted list'],['insertOrderedList','1. List','Numbered list'],['outdent','←','Decrease indent'],['indent','→','Increase indent'],['undo','↶','Undo'],['redo','↷','Redo']];
    for (const [name, text, title] of buttons) {
      const button = document.createElement('button'); button.type='button'; button.textContent=text; button.title=title; button.setAttribute('aria-label',title); button.dataset.command=name;
      button.onmousedown = event => event.preventDefault(); button.onclick=()=>command(name); toolbar.append(button);
    }
    editor.addEventListener('keyup',remember); editor.addEventListener('mouseup',remember); editor.addEventListener('input',remember); editor.addEventListener('blur',remember);
    editor.addEventListener('keydown',event=>{
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && ['Digit7','Digit8'].includes(event.code)) { event.preventDefault(); command(event.code === 'Digit8' ? 'insertUnorderedList' : 'insertOrderedList'); }
    });
    editor.addEventListener('paste', event=>{
      event.preventDefault(); if(disabled) return;
      const html=event.clipboardData?.getData('text/html');
      const plain=event.clipboardData?.getData('text/plain') || '';
      if(html) document.execCommand('insertHTML',false,sanitize(html));
      else { const temp=document.createElement('div'); temp.textContent=plain; document.execCommand('insertHTML',false,temp.innerHTML.replace(/\r?\n/g,'<br>')); }
      remember(); editor.dispatchEvent(new Event('input',{bubbles:true}));
    });
    // External drops must pass through the paste sanitizer rather than native HTML insertion.
    editor.addEventListener('drop', event=>event.preventDefault());
    Object.defineProperty(editor,'value',{get:()=>editor.textContent.trim() ? sanitize(editor.innerHTML) : '',set:value=>{render(editor,value,'html');selectionRange=null;}});
    Object.defineProperty(editor,'disabled',{get:()=>disabled,set:value=>{disabled=Boolean(value);editor.contentEditable=String(!disabled);editor.setAttribute('aria-disabled',String(disabled));toolbar.querySelectorAll('button').forEach(button=>{button.disabled=disabled;});}});
    wrapper.append(toolbar,editor); textarea.replaceWith(wrapper); return editor;
  }
  window.JournalRichText={enhance,render,sanitize};
})();
