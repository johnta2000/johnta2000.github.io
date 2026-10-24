import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {CalendarDays,ChevronLeft,ChevronRight,X} from 'lucide-react';
import SharedPicker from './SharedPicker';
import {displayDate,localToday,parseDate} from '../lib/dates';
import './date-field.css';
const months=Array.from({length:12},(_,i)=>new Date(2020,i,1).toLocaleDateString('en-US',{month:'long'}));
function Calendar({label,value,min,onChoose,onClose}:{label:string;value:string;min?:string;onChoose:(date:string)=>void;onClose:()=>void}){
 const selected=parseDate(value),minimum=parseDate(min||'');
 const initial=selected||minimum||localToday();
 const [cursor,setCursor]=useState(initial),dialog=useRef<HTMLDialogElement>(null),focusGrid=useRef(false);
 const [year,month]=cursor.split('-').map(Number),id=useId();
 const first=new Date(year,month-1,1).getDay(),count=new Date(year,month,0).getDate();
 const iso=(day:number)=>`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 const firstYear=Math.min(1900,year),lastYear=Math.max(new Date().getFullYear()+10,year);
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 useEffect(()=>{if(focusGrid.current){dialog.current?.querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`)?.focus();focusGrid.current=false;}},[cursor]);
 const shift=(delta:number)=>{const d=new Date(year,month-1+delta,1);setCursor(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);};
 const move=(event:KeyboardEvent<HTMLButtonElement>,day:number)=>{
  const deltas:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-new Date(year,month-1,day).getDay(),End:6-new Date(year,month-1,day).getDay()};
  if(!(event.key in deltas))return;event.preventDefault();
  const d=new Date(year,month-1,day+deltas[event.key]),next=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if(minimum&&next<minimum)return;focusGrid.current=true;setCursor(next);
 };
 const active=Math.max(Number(cursor.slice(-2)),minimum?.startsWith(cursor.slice(0,7))?Number(minimum.slice(-2)):1);
 return createPortal(<dialog className="date-calendar-dialog" ref={dialog} aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}>
  <header><div><span>JUMP TO ANY MONTH OR YEAR</span><h2 id={id}>{label}</h2></div><button type="button" aria-label="Close calendar" onClick={onClose}><X size={20}/></button></header>
  <div className="date-jump"><SharedPicker label="Calendar month" value={String(month)} options={months.map((name,i)=>({value:String(i+1),label:name}))} onChange={m=>setCursor(`${year}-${m.padStart(2,'0')}-01`)}/><SharedPicker label="Calendar year" value={String(year)} options={Array.from({length:lastYear-firstYear+1},(_,i)=>({value:String(lastYear-i),label:String(lastYear-i)}))} onChange={y=>setCursor(`${y}-${String(month).padStart(2,'0')}-01`)}/></div>
  <div className="date-month-heading"><button type="button" aria-label="Previous month" onClick={()=>shift(-1)} disabled={year===1000&&month===1}><ChevronLeft size={20}/></button><strong aria-live="polite">{months[month-1]} {year}</strong><button type="button" aria-label="Next month" onClick={()=>shift(1)} disabled={year===9999&&month===12}><ChevronRight size={20}/></button></div>
  <div className="date-days" role="group" aria-label="Choose a day">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(day=><span className="date-weekday" key={day} aria-hidden="true">{day}</span>)}{Array.from({length:first},(_,i)=><span key={`blank-${i}`} aria-hidden="true"/>)}{Array.from({length:count},(_,i)=>{const day=i+1,date=iso(day);return <button type="button" key={date} data-day={date} tabIndex={day===active?0:-1} disabled={!!minimum&&date<minimum} aria-label={new Date(year,month-1,day).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} aria-pressed={selected===date} aria-current={date===localToday()?'date':undefined} onFocus={()=>{if(cursor!==date)setCursor(date);}} onKeyDown={e=>move(e,day)} onClick={()=>onChoose(date)}>{day}</button>;})}</div>
  <footer><button type="button" disabled={!!minimum&&localToday()<minimum} onClick={()=>onChoose(localToday())}>Today</button><button type="button" onClick={onClose}>Cancel</button></footer>
 </dialog>,document.body);
}
export default function DateField({label,value,onChange,min,required=false,hint}:{label:string;value:string;onChange:(value:string)=>void;min?:string;required?:boolean;hint?:string}){
 const id=useId(),input=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const wasOpen=useRef(false);
 const [text,setText]=useState(()=>displayDate(value)),[open,setOpen]=useState(false),[touched,setTouched]=useState(false);
 useEffect(()=>{setText(prev=>prev===value||parseDate(prev)===value?prev:displayDate(value));},[value]);
 const valid=parseDate(text),minimum=parseDate(min||'');
 const error=text&&!valid?'Use a real date in MM/DD/YYYY format.':valid&&minimum&&valid<minimum?'Choose a date on or after '+displayDate(minimum)+'.':'';
 useEffect(()=>{input.current?.setCustomValidity(error);},[error]);
 useEffect(()=>{if(wasOpen.current&&!open)trigger.current?.focus();wasOpen.current=open;},[open]);
 const close=()=>setOpen(false);
 return <div className="field date-field"><label htmlFor={id}>{label} {required?<span className="required-label">Required</span>:hint?<span className="optional">{hint}</span>:null}</label><div className="date-entry"><input ref={input} id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="MM/DD/YYYY" aria-label={label} aria-describedby={id+'-help'} aria-invalid={touched&&!!error||undefined} required={required} value={text} maxLength={10} onChange={e=>{const next=e.target.value;setText(next);onChange(parseDate(next)||next);}} onBlur={()=>{setTouched(true);if(valid)setText(displayDate(valid));}}/><button ref={trigger} type="button" aria-label={`Choose ${label.toLowerCase()} on calendar`} aria-haspopup="dialog" onClick={()=>setOpen(true)}><CalendarDays size={19}/></button></div><small id={id+'-help'} className={touched&&error?'date-error':''}>{touched&&error?error:'Type MM/DD/YYYY or use the calendar.'}</small>
 {open&&<Calendar label={label} value={value} min={min} onClose={close} onChoose={date=>{setText(displayDate(date));onChange(date);setTouched(false);close();}}/>}</div>;
}
