import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown,Music2,Search,X} from 'lucide-react';
import {artistsForRave,creditDescription} from '../lib/artists';
import './set-list-popover.css';

export default function SetListPopover({names,eventName,planned=false}:{names:string[];eventName:string;planned?:boolean}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[style,setStyle]=useState<CSSProperties>({});
  const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null),id=useId();
  const close=(restore=false)=>{setOpen(false);if(restore)trigger.current?.focus({preventScroll:true});};
  useLayoutEffect(()=>{
    if(!open)return;
    const position=()=>{
      const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
      const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
      const width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight;
      const menuWidth=Math.min(360,width-24),above=rect.top-top-20,below=top+height-rect.bottom-20;
      const openAbove=below<300&&above>below,maxHeight=Math.min(420,Math.max(160,openAbove?above:below),height-24);
      const panelHeight=Math.min(panel.current?.scrollHeight||maxHeight,maxHeight);
      const y=openAbove?rect.top-panelHeight-8:rect.bottom+8;
      setStyle({width:menuWidth,maxHeight,left:Math.max(left+12,Math.min(rect.left,left+width-menuWidth-12)),top:Math.max(top+12,Math.min(y,top+height-panelHeight-12))});
    };
    position();search.current?.focus({preventScroll:true});
    window.addEventListener('resize',position);window.addEventListener('scroll',position,true);window.visualViewport?.addEventListener('resize',position);
    return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);window.visualViewport?.removeEventListener('resize',position);};
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const outside=(e:Event)=>{const target=e.target as Node;if(!panel.current?.contains(target)&&!trigger.current?.contains(target))setOpen(false);};
    document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);};
  },[open]);
  const artists=artistsForRave({artists:names}),matches=names.filter(name=>`${name} ${creditDescription(name)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  if(!names.length)return <span className="unlogged">{planned?'No wishlist yet':'Not logged'}</span>;
  return <>
    <button className="sets-summary" ref={trigger} aria-label={`View ${planned?'planned sets':'attended sets'} for ${eventName}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} onDoubleClick={e=>e.stopPropagation()} onClick={()=>{setQuery('');setOpen(!open);}}><Music2 size={14}/><strong>{names.length}</strong> {planned?'planned ':''}{names.length===1?'set':'sets'}<ChevronDown size={13}/></button>
    {open&&createPortal(<div ref={panel} id={id} role="dialog" aria-labelledby={id+'-title'} className="sets-popover" style={style} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}}}>
      <header><div><h2 id={id+'-title'}>{planned?'Planned sets':'Sets attended'}</h2><p>{eventName}</p></div><button aria-label="Close sets popup" onClick={()=>close(true)}><X size={18}/></button></header>
      <label className="sets-popover-search"><Search size={16}/><input ref={search} type="search" aria-label={planned?'Search planned sets':'Search logged sets'} placeholder="Find an artist or set…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div className="sets-popover-count">{names.length} {names.length===1?'set':'sets'} · {artists.length} {artists.length===1?'artist':'artists'}</div>
      <div className="sets-popover-list">{matches.length?<ul>{matches.map((name,i)=><li key={name+i}><Music2 size={15}/><div><strong>{name}</strong>{creditDescription(name)&&<small>{creditDescription(name)}</small>}</div></li>)}</ul>:<p className="sets-popover-empty">No matching sets. Try another artist or set name.</p>}</div>
    </div>,document.body)}
  </>;
}
