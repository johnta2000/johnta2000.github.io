import {useEffect,useId,useRef} from 'react';
declare global {interface Window {SearchableSelect?:{enhance:(select:HTMLSelectElement,options?:{onCreate?:(value:string)=>void;customMaxLength?:number})=>{sync:()=>void;destroy:()=>void}}}}
export default function SharedPicker({label,value,options,onChange,compact=false,disabled=false,searchTokens=false,allowCustom=false}:{label:string;value:string;options:{value:string;label:string;disabled?:boolean}[];onChange:(v:string)=>void;compact?:boolean;disabled?:boolean;searchTokens?:boolean;allowCustom?:boolean}){
  const id=useId(),select=useRef<HTMLSelectElement>(null),picker=useRef<ReturnType<NonNullable<Window['SearchableSelect']>['enhance']>|null>(null);
  const onChangeRef=useRef(onChange);onChangeRef.current=onChange;
  useEffect(()=>{if(select.current&&window.SearchableSelect){picker.current=window.SearchableSelect.enhance(select.current,{...(allowCustom?{onCreate:(v:string)=>onChangeRef.current(v)}:{})});picker.current.sync();}return ()=>{picker.current?.destroy();picker.current=null;};},[allowCustom]);
  useEffect(()=>{picker.current?.sync();},[value,disabled,JSON.stringify(options)]);
  return <div className={`shared-picker ${compact?'compact-picker':''}`}>{!compact&&<span className="picker-label">{label}</span>}<select ref={select} id={id} disabled={disabled} data-search-tokens={searchTokens || undefined} aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}</select></div>;
}
