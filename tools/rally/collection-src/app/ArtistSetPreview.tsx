import {useId,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {creditDescription} from '../lib/artists';
import './artist-set-preview.css';

export default function ArtistSetPreview({names,eventName,planned=false}:{names:string[];eventName:string;planned?:boolean}){
  const [expanded,setExpanded]=useState(false),id=useId();
  if(!names.length)return <span className="unlogged">{planned?'Add artists to your wishlist':'Artists not logged'}</span>;
  return <div className={`artist-set-preview ${expanded?'is-expanded':''}`}>
    {planned&&<small className="artist-preview-label">Wishlist</small>}
    <div id={id} className="artist-preview-names" tabIndex={expanded?0:undefined} aria-label={`${planned?'Planned sets':'Sets'} for ${eventName}`}>
      {(expanded?names:names.slice(0,2)).map((name,i)=><span key={name+i} title={creditDescription(name)||undefined}>{name}</span>)}
    </div>
    {names.length>2&&<button type="button" aria-label={`Show ${expanded?'fewer':'all'} sets for ${eventName}`} aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':`+${names.length-2} more`}<ChevronDown size={13}/></button>}
  </div>;
}
