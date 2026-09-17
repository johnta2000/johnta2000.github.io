// Small rich-note editor. Only the validated document tree crosses the API boundary.
(() => {
  const model=RallyNoteRichText;
  const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function fromDOM(parent,depth=0){
    if(depth>12)throw Error('This note has too much formatting. Simplify it and try again.');
    return [...parent.childNodes].flatMap(node=>{
      if(node.nodeType===3)return [{type:'text',text:node.textContent}];
      if(node.nodeType!==1)return [];
      const tag=node.tagName.toLowerCase();
      if(['script','style','iframe','object','embed','svg','math','img','video','audio','input','textarea','select'].includes(tag))return [];
      if(tag==='br')return [{type:'br'}];
      let children=fromDOM(node,depth+1);
      const type=({div:'p',b:'strong',i:'em',h1:'p',h2:'p',h3:'p',blockquote:'p'})[tag]||tag;
      if(type==='a'){const href=model.safeNoteLink(node.getAttribute('href'));return href?[{type,href,children}]:children;}
      if(['p','strong','em','u','ul','ol','li'].includes(type))return [{type,children}];
      if(node.style.fontWeight==='bold'||Number(node.style.fontWeight)>=600)children=[{type:'strong',children}];
      if(node.style.fontStyle==='italic')children=[{type:'em',children}];
      if(node.style.textDecoration.includes('underline'))children=[{type:'u',children}];
      return children;
    });
  }
  function render(note){
    if(note.richText){try{return model.richTextHtml(note.richText);}catch{/* Read older/plain snapshots safely. */}}
    return escape(note.body).replace(/\n/g,'<br>');
  }
  function mount(input,note={body:input.value}){
    const box=document.createElement('div');box.className='rich-note-editor';
    const commands=[['bold','Bold','<b>B</b>'],['italic','Italic','<i>I</i>'],['underline','Underline','<u>U</u>'],['insertUnorderedList','Bullet list','• List'],['insertOrderedList','Numbered list','1. List'],['link','Add link','Link'],['unlink','Remove link','Unlink']];
box.innerHTML=`<div class="rich-note-toolbar" role="group" aria-label="Note formatting">${commands.map(([command,label,icon])=>`<button type="button" data-command="${command}" aria-label="${label}" title="${label}">${icon}</button>`).join('')}</div><div class="rich-note-link" hidden><label>Link URL<input type="text" inputmode="url" placeholder="https://…" aria-label="Link URL"></label><button type="button" data-link-apply>Add</button><button type="button" data-link-cancel>Cancel</button></div><div class="rich-note-input" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note" data-placeholder="${escape(input.placeholder||'Write a note…')}"></div><p class="rich-note-feedback" role="status"></p>`;
    input.hidden=true;input.required=false;input.after(box);
    const editor=box.querySelector('.rich-note-input'),feedback=box.querySelector('.rich-note-feedback'),linkRow=box.querySelector('.rich-note-link'),linkInput=linkRow.querySelector('input');
    for(const label of input.labels||[]){if(label.htmlFor===input.id){label.onclick=()=>editor.focus();}}
    editor.innerHTML=render(note);
    let range=null,disabled=false;
    function remember(){const selection=getSelection();if(selection?.rangeCount&&editor.contains(selection.anchorNode)&&editor.contains(selection.focusNode))range=selection.getRangeAt(0).cloneRange();}
    function restore(){editor.focus({preventScroll:true});const selection=getSelection();if(!range||!editor.contains(range.commonAncestorContainer)){range=document.createRange();range.selectNodeContents(editor);range.collapse(false);}selection.removeAllRanges();selection.addRange(range);}
    function sync(){try{const nodes=model.normalizeRichText(fromDOM(editor));input.value=model.richTextPlain(nodes).trim();feedback.textContent=input.value.length>4000?'Keep notes under 4,000 characters.':'';}catch(error){feedback.textContent=error.message;}}
    function command(name,value){if(disabled)return;restore();document.execCommand(name,false,value);remember();sync();}
    editor.addEventListener('input',()=>{remember();sync();});
    editor.addEventListener('keyup',remember);editor.addEventListener('mouseup',remember);editor.addEventListener('touchend',remember);
    box.querySelector('.rich-note-toolbar').addEventListener('pointerdown',event=>{if(event.target.closest('button')){remember();event.preventDefault();}});
    box.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>{
      if(disabled)return;
      if(button.dataset.command==='link'){remember();linkRow.hidden=false;linkInput.value='';linkInput.focus();return;}
      command(button.dataset.command);
    });
    const applyLink=()=>{const href=model.safeNoteLink(linkInput.value.trim());if(!href){feedback.textContent='Use an https://, http://, or mailto: link.';return;}restore();if(getSelection().isCollapsed)command('insertHTML',model.richTextHtml([{type:'a',href,children:[{type:'text',text:href}]}]));else command('createLink',href);linkRow.hidden=true;};
    linkRow.querySelector('[data-link-apply]').onclick=applyLink;
    linkRow.querySelector('[data-link-cancel]').onclick=()=>{linkRow.hidden=true;restore();};
    linkInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();applyLink();}if(event.key==='Escape'){event.preventDefault();linkRow.hidden=true;restore();}});
    editor.addEventListener('paste',event=>{
      event.preventDefault();if(disabled)return;remember();
      try{const html=event.clipboardData.getData('text/html');if(html){const template=document.createElement('template');template.innerHTML=html;command('insertHTML',model.richTextHtml(fromDOM(template.content)));}else command('insertText',event.clipboardData.getData('text/plain'));}
      catch(error){feedback.textContent=error.message;}
    });
    editor.addEventListener('drop',event=>event.preventDefault());
    const api={
      getValue(){const richText=model.normalizeRichText(fromDOM(editor)),body=model.richTextPlain(richText).trim();if(!body||body.length>4000)throw Error('Write a note between 1 and 4,000 characters.');return {body,richText};},
      clear(){editor.replaceChildren();input.value='';range=null;feedback.textContent='';},
      focus(){editor.focus();},
      setDisabled(value){disabled=value;editor.contentEditable=String(!value);editor.setAttribute('aria-disabled',String(value));box.querySelectorAll('button,input').forEach(control=>control.disabled=value);},
      element:editor
    };
    input.richEditor=api;return api;
  }
  window.RallyNoteEditor={mount,render,fromDOM};
})();
