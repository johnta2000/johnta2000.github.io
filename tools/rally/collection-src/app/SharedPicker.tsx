import {useEffect,useId,useRef} from 'react';
declare global {interface Window {SearchableSelect?:{enhance:(select:HTMLSelectElement)=>{sync:()=>void;destroy:()=>void}}}}
export default function SharedPicker({label,value,options,onChange,compact=false,disabled=false}:{label:string;value:string;options:{value:string;label:string}[];onChange:(v:string)=>void;compact?:boolean;disabled?:boolean}){
  const id=useId(),select=useRef<HTMLSelectElement>(null),picker=useRef<ReturnType<NonNullable<Window['SearchableSelect']>['enhance']>|null>(null);
  useEffect(()=>{if(select.current&&window.SearchableSelect){picker.current=window.SearchableSelect.enhance(select.current);picker.current.sync();}return ()=>{picker.current?.destroy();picker.current=null;};},[]);
  useEffect(()=>{picker.current?.sync();},[value,disabled,JSON.stringify(options)]);
  return <div className={`shared-picker ${compact?'compact-picker':''}`}>{!compact&&<span className="picker-label">{label}</span>}<select ref={select} id={id} disabled={disabled} aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
}
