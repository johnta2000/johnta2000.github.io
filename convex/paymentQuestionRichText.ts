// A bounded, explicit document format. Never store or trust arbitrary HTML.
export type RichNode = { type: string; text?: string; href?: string; children?: RichNode[] };
const containers = new Set(['p','strong','em','u','ul','ol','li','a']);
export function safeNoteLink(value: unknown): string {
  if(typeof value!=='string'||value.length>2000||/[\u0000-\u0020\u007f]/.test(value))return '';
  try{const url=new URL(value);return ['https:','http:','mailto:'].includes(url.protocol)?url.href:'';}catch{return '';}
}
export function normalizeRichText(value: unknown): RichNode[] {
  let count=0,characters=0;
  const walk=(nodes:any,depth:number):RichNode[]=>{
    if(!Array.isArray(nodes)||depth>12)throw new Error('This note has too much formatting. Simplify it and try again.');
    return nodes.map((node:any)=>{
      if(++count>2000||!node||typeof node!=='object')throw new Error('Invalid note formatting.');
      if(node.type==='text'){
        if(typeof node.text!=='string'||(characters+=node.text.length)>4000)throw new Error('Write a note between 1 and 4,000 characters.');
        return {type:'text',text:node.text};
      }
      if(node.type==='br')return {type:'br'};
      if(!containers.has(node.type))throw new Error('Unsupported note formatting.');
      const children=walk(node.children,depth+1);
      if(node.type==='a'){
        const href=safeNoteLink(node.href);if(!href)throw new Error('Use an https://, http://, or mailto: link.');
        return {type:'a',href,children};
      }
      return {type:node.type,children};
    });
  };
  return walk(value,0);
}
export function richTextPlain(nodes:RichNode[]):string {
  return nodes.map(node=>node.type==='text'?node.text:node.type==='br'?'\n':richTextPlain(node.children||[])+(['p','li'].includes(node.type)?'\n':'')).join('');
}
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function richTextHtml(value:unknown):string {
  const render=(nodes:RichNode[]):string=>nodes.map(node=>node.type==='text'?escape(node.text||''):node.type==='br'?'<br>':`<${node.type}${node.type==='a'?` href="${escape(node.href!)}" target="_blank" rel="noopener noreferrer"`:''}>${render(node.children||[])}</${node.type}>`).join('');
  return render(normalizeRichText(value));
}
