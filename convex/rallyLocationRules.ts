export function locationFix(value: any, now: number, maxAge=120000) {
  const {latitude, longitude, accuracy, observedAt} = value || {};
  if (![latitude, longitude, accuracy, observedAt].every(Number.isFinite) || Math.abs(latitude)>90 || Math.abs(longitude)>180 || accuracy<0 || accuracy>100000 || observedAt>now+10000 || observedAt<now-maxAge) throw new Error('A recent valid GPS fix is required.');
  return {latitude, longitude, accuracy, observedAt:Math.min(now,observedAt)};
}
export function mergeTrail(old:any[], incoming:any[], now:number, startedAt:number){
  if(!Array.isArray(incoming)||incoming.length>60)throw new Error('Upload at most 60 points.');
  const points=incoming.map(p=>locationFix(p,now,30*60000)).filter(p=>p.observedAt>=startedAt);
  return [...new Map([...old,...points].filter(p=>p.observedAt>=now-30*60000).map(p=>[p.observedAt,p])).values()].sort((a,b)=>a.observedAt-b.observedAt).slice(-120);
}
