import {useEffect,useRef} from 'react';
import {ArrowUpRight,CalendarDays,LockKeyhole,Music2,Sparkles,Ticket,Users,X} from 'lucide-react';
type Section='raves'|'artists'|'crew'|'recap';
const destinations=[{id:'raves',label:'Rave history',icon:Ticket},{id:'artists',label:'Artists',icon:Music2},{id:'crew',label:'Crew',icon:Users},{id:'recap',label:'Recap',icon:Sparkles}] as const;
export default function CollectionNavigation({section,name,onSelect,onClose}:{section:Section;name:string;onSelect:(section:Section)=>void;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=dialog.current,previous=document.activeElement as HTMLElement|null;el?.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{el?.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};},[]);
  return <dialog ref={dialog} id="collectionNavigation" className="collection-drawer" aria-label="Rally navigation" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}>
    <div className="drawer-content"><header><strong>Rally</strong><button aria-label="Close navigation" onClick={onClose}><X size={20}/></button></header>
      <nav aria-label="Rally workspaces"><a className="drawer-plans" href="/tools/rally/collection/?view=projects"><CalendarDays size={19}/><span>My raves<small>Plan a night with your crew</small></span><ArrowUpRight size={16}/></a>
        <p className="drawer-section-label">Rave diary <LockKeyhole size={12}/></p>
        {destinations.map(n=><button key={n.id} aria-current={section===n.id?'page':undefined} onClick={()=>{onSelect(n.id);onClose();}}><n.icon size={19}/>{n.label}</button>)}
      </nav>
      <footer><LockKeyhole size={16}/><span><strong>{name}’s collection</strong><small>Your costs, notes, and memories are private.</small></span></footer>
    </div>
  </dialog>;
}
