import {useId,useState} from 'react';
import {Search,Users} from 'lucide-react';
import NamePicker from './NamePicker';
import {uniqueNames,type CrewConnection} from '../lib/raves';

export default function CrewPicker({label,values,connections,people,onChange,text,onText,suggestions,planSuggestions}: {
 label:string;values:string[];connections:CrewConnection[];people:CrewConnection[];onChange:(names:string[],people:CrewConnection[])=>void;text:string;onText:(text:string)=>void;suggestions:string[];planSuggestions:string[];
}) {
 const [query,setQuery]=useState('');const id=useId();
 const options=[...new Map([...connections,...people].map(p=>[p.id,p])).values()];
 const linkedNames=new Set(options.map(p=>p.name.toLowerCase()));
 const linked=options.filter(p=>p.name.toLowerCase().includes(query.toLowerCase()));
 const selected=(p:CrewConnection)=>connections.some(c=>c.id===p.id||(c.kind==='guest'&&c.projectId===p.projectId&&c.memberId===p.memberId));
 const toggle=(p:CrewConnection)=>{
   const next=selected(p)?connections.filter(c=>c.id!==p.id&&!(c.projectId===p.projectId&&c.memberId===p.memberId)):[...connections,p];
   const removed=new Set(connections.filter(c=>!next.some(n=>n.id===c.id)).map(c=>c.name.toLowerCase()));
   const names=selected(p)?values.filter(n=>!removed.has(n.toLowerCase())||next.some(c=>c.name.toLowerCase()===n.toLowerCase())):uniqueNames([...values,p.name]);
   onChange(names,next);
 };
 return <div className="crew-identity-picker">
  {options.length>0&&<section className="crew-connections" aria-labelledby={id}>
    <h3 id={id}><Users size={17}/>Your connected friends</h3>
    <p>Choose people from Raveington or your diary. Only the people you select are included.</p>
    <label className="crew-connection-search"><Search size={16}/><input aria-label="Search connected friends" placeholder="Search connected friends…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.preventDefault();}}/></label>
    <div className="crew-connection-options">{linked.length?linked.map(p=><label key={p.id} className={'crew-connection'+(selected(p)?' chosen':'')}>
      <input type="checkbox" checked={selected(p)} onChange={()=>toggle(p)}/><span><strong>{p.name}</strong><small>{p.kind==='account'?'Raveington account · history stays connected':'Raveington guest · linked to this crew'}</small></span>
    </label>):<p>No connected friends match this search.</p>}</div>
  </section>}
  <NamePicker label={label} noun="friend" values={values.filter(n=>!connections.some(p=>p.name.toLowerCase()===n.toLowerCase()))} text={text} onText={onText}
    onChange={names=>onChange(uniqueNames([...names,...connections.map(p=>p.name)]),connections)} suggestions={suggestions.filter(n=>!linkedNames.has(n.toLowerCase()))} planSuggestions={planSuggestions.filter(n=>!linkedNames.has(n.toLowerCase()))}/>
 </div>;
}
