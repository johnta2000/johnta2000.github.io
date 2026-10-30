import {festivalForRave} from './festivals';
import {artistsForRave,artistId} from './artists';
import {isAttended,type Rave} from './raves';
export type NetworkNode={id:string;kind:'you'|'event'|'project'|'entry'|'person'|'artist';name:string};
export type NetworkEdge={from:string;to:string;kind:'saved'|'for-event'|'planned-with'|'logged-with'|'saw'|'linked-plan'};
// This graph is derived exclusively from this user's diary. A logged-with edge
// is their own record, never a claim about another person's private diary.
export function raveNetwork(raves:Rave[]){
 const nodes=new Map<string,NetworkNode>();const edges:NetworkEdge[]=[];
 nodes.set('you',{id:'you',kind:'you',name:'You'});
 for(const r of raves){
  const event=festivalForRave(r),eventId=event?'event:'+event.id:r.sourceEventId?'project-event:'+r.sourceEventId:'personal-event:'+r.id,entryId='entry:'+r.id;
  nodes.set(eventId,{id:eventId,kind:'event',name:event?.name||r.name});nodes.set(entryId,{id:entryId,kind:'entry',name:r.name});
  edges.push({from:'you',to:entryId,kind:'saved'},{from:entryId,to:eventId,kind:'for-event'});
  if(r.sourceEventId){const projectId='project:'+r.sourceEventId;nodes.set(projectId,{id:projectId,kind:'project',name:'Raveington plan'});edges.push({from:entryId,to:projectId,kind:'linked-plan'},{from:projectId,to:eventId,kind:'for-event'});}
  const attended=isAttended(r);
  for(const p of (r.attendance==='skipped'?[]:attended?r.crewConnections:r.plannedCrewConnections)||[]){nodes.set(p.id,{id:p.id,kind:'person',name:p.name});edges.push({from:entryId,to:p.id,kind:attended?'logged-with':'planned-with'});}
  if(attended)for(const name of artistsForRave(r)){const id=artistId(name);nodes.set(id,{id,kind:'artist',name});edges.push({from:entryId,to:id,kind:'saw'});}
 }
 return {nodes:[...nodes.values()],edges};
}
