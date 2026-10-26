import {useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Check,Plus} from 'lucide-react';
import {artistCatalog,searchArtistCatalog} from '../lib/artistCatalog';
import {creditDescription,performanceKey} from '../lib/artists';
import './artist-autocomplete.css';

export default function ArtistAutocomplete({id,label,value,onChange,onChoose,onCommit,selected,context}:{id:string;label:string;value:string;onChange:(value:string)=>void;onChoose:(name:string)=>void;onCommit:()=>void;selected:string[];context:string[]}){
  const listId=useId(),wrapper=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),panel=useRef<HTMLDivElement>(null),skipFocus=useRef(false);
  const [open,setOpen]=useState(false),[active,setActive]=useState(-1),[style,setStyle]=useState<CSSProperties>({});
  const matches=useMemo(()=>searchArtistCatalog(value,context),[value,context.join('\n')]);
  const selectedKeys=new Set(selected.map(performanceKey));
  const custom=value.trim(),showCustom=!!custom&&!matches.some(name=>performanceKey(name)===performanceKey(custom));
  const choices=[...matches,...(showCustom?[custom]:[])];
  const enabled=(index:number)=>!selectedKeys.has(performanceKey(choices[index]));
  const close=()=>{setOpen(false);setActive(-1);};
  const choose=(index:number)=>{
    if(!choices[index]||!enabled(index))return;
    if(index===matches.length)onCommit();else onChoose(choices[index]);
    close();skipFocus.current=true;input.current?.focus({preventScroll:true});skipFocus.current=false;
  };
  useLayoutEffect(()=>{
    if(!open)return;
    const node=panel.current;if(!node)return;
    node.showPopover?.();
    const position=()=>{
      const rect=input.current?.getBoundingClientRect();if(!rect)return;
      const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
      const above=rect.top-top-14,below=top+height-rect.bottom-14,openAbove=below<240&&above>below;
      const menuWidth=Math.min(Math.max(rect.width,280),width-16),maxHeight=Math.min(370,Math.max(100,openAbove?above:below),height-16);
      const panelHeight=Math.min(node.scrollHeight||maxHeight,maxHeight);
      setStyle({width:menuWidth,maxHeight,left:Math.max(left+8,Math.min(rect.left,left+width-menuWidth-8)),top:Math.max(top+8,Math.min(openAbove?rect.top-panelHeight-6:rect.bottom+6,top+height-panelHeight-8))});
    };
    position();window.addEventListener('resize',position);window.addEventListener('scroll',position,true);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);
    return()=>{node.hidePopover?.();window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);window.visualViewport?.removeEventListener('resize',position);window.visualViewport?.removeEventListener('scroll',position);};
  },[open,value]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!wrapper.current?.contains(event.target as Node))close();};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  useEffect(()=>{if(active>=0)panel.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({block:'nearest'});},[active]);
  return <div className="artist-autocomplete" ref={wrapper} onBlur={e=>{if(!wrapper.current?.contains(e.relatedTarget as Node))close();}}>
    <input id={id} ref={input} aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open?listId:undefined} aria-activedescendant={open&&active>=0?`${listId}-${active}`:undefined} autoComplete="off" value={value} placeholder="Search all artists…" onClick={()=>setOpen(true)} onFocus={()=>{if(!skipFocus.current)setOpen(true);}} onChange={e=>{onChange(e.target.value);setActive(-1);setOpen(true);}} onKeyDown={e=>{
      if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close();}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();setOpen(true);const step=e.key==='ArrowDown'?1:-1,start=active<0?(step===1?-1:0):active;
        for(let n=1;n<=choices.length;n++){const next=(start+step*n+choices.length)%choices.length;if(enabled(next)){setActive(next);break;}}
      }
      if(e.key==='Enter'){e.preventDefault();if(open&&active>=0)choose(active);else{onCommit();close();}}
      if(e.key===','){e.preventDefault();onCommit();close();}
      if(e.key==='Tab')close();
    }}/>
    {open&&<div ref={panel} popover="manual" className="artist-catalog-menu" style={style}>
      <div className="artist-catalog-heading">All artists <span>{artistCatalog.length.toLocaleString()} in the catalog</span></div>
      {!custom&&<p className="artist-catalog-hint">Type to find an artist. You can also add your own set name.</p>}
      {custom&&!matches.length&&<p className="artist-catalog-hint" role="status">No catalog matches. Add this name below.</p>}
      <div id={listId} role="listbox" aria-label="Artist catalog results">{choices.map((name,index)=>{
        const alreadySelected=selectedKeys.has(performanceKey(name)),isCustom=index===matches.length;
        return <button type="button" role="option" tabIndex={-1} id={`${listId}-${index}`} data-index={index} key={name} aria-selected={alreadySelected} aria-disabled={alreadySelected} className={active===index?'is-active':''} onPointerDown={e=>{if(e.pointerType==='mouse')e.preventDefault();}} onClick={()=>choose(index)}>
          {isCustom&&<Plus size={15}/>}<span><strong>{isCustom?`Add “${name}”`:name}</strong>{creditDescription(name)&&<small>{creditDescription(name)}</small>}</span>{alreadySelected&&<Check size={16}/>} 
        </button>;
      })}</div>
    </div>}
  </div>;
}
