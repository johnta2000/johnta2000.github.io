import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
export default function Modal({children,onClose,title,wide=false}:{children:ReactNode;onClose:()=>void;title:string;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;d?.showModal();d?.querySelector<HTMLElement>('[data-autofocus]')?.focus();document.body.style.overflow='hidden';return ()=>{d?.close();document.body.style.overflow='';};},[]);
  return <dialog ref={ref} className={'modal '+(wide?'wide':'')} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="modal-head"><div><span className="eyebrow">RAVE DIARY</span><h2>{title}</h2></div><button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
