// Browser-side computed contrast audit, including the native lineup shadow root.
// Explicitly dimmed/disabled content is excluded; active text must remain readable.
module.exports = async function audit(page, label) {
 return page.evaluate(label => {
  const rgb=value=>{const m=value.match(/rgba?\(([^)]+)\)/);return m?m[1].split(/[,\s/]+/).filter(Boolean).map(Number):[255,255,255,1];};
  const blend=(fg,bg)=>{const a=fg[3]??1;return fg.slice(0,3).map((v,i)=>v*a+bg[i]*(1-a));};
  const lum=c=>c.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const parent=el=>el.parentElement||el.getRootNode().host;
  const roots=[document,...[...document.querySelectorAll('*')].map(e=>e.shadowRoot).filter(Boolean)];
  const issues=[],pairs=new Set();
  for(const root of roots)for(const el of root.querySelectorAll('*')){
   const ownText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
   if(!ownText||['SCRIPT','STYLE','OPTION'].includes(el.tagName)||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||el.closest('[disabled],[aria-disabled="true"]'))continue;
   const rect=el.getBoundingClientRect();if(rect.width<1||rect.height<1||rect.bottom<0||rect.top>innerHeight||rect.right<0||rect.left>innerWidth)continue;
   let chain=[],faded=false;for(let p=el;p;p=parent(p)){const s=getComputedStyle(p);if(Number(s.opacity)<.7)faded=true;chain.push(rgb(s.backgroundColor));}
   if(faded)continue;
   const style=getComputedStyle(el),bg=chain.reverse().reduce((b,c)=>blend(c,b),[255,255,255]);
   const foreground=blend(rgb(style.color),bg),a=lum(foreground),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700),minimum=large?3:4.5;
   if(ratio+.015>=minimum)continue;
   const key=style.color+':'+bg.map(Math.round)+':'+el.className;
   if(pairs.has(key))continue;pairs.add(key);
   issues.push({label,element:el.tagName.toLowerCase()+'.'+String(el.className).slice(0,100),text:el.textContent.trim().slice(0,70),ratio:+ratio.toFixed(2),color:style.color,background:bg.map(Math.round).join(',')});
  }
  return issues;
 }, label);
};
