export const key = name => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export const known = n => typeof n === 'number' && Number.isFinite(n);
export const dateLabel = month => new Date(`${month}-15T12:00:00`).toLocaleDateString('en-US', {month:'short',year:'numeric'});
export const number = n => new Intl.NumberFormat('en-US', {maximumFractionDigits:1}).format(n);
export const initials = name => name.split(/\s+/).map(n => n[0]).slice(0,2).join('').toUpperCase();
export function stats(trips) {
  const entries = trips.flatMap(trip => trip.entries.map(e => ({...e, trip})));
  const names = [...new Set(entries.map(e => key(e.name)))];
  const people = names.map(id => {
    const logs = entries.filter(e => key(e.name) === id);
    const byTrip = [...new Set(logs.map(e => e.trip.key))].map(tripKey => logs.filter(e => e.trip.key === tripKey));
    const completeBurgerTrips = byTrip.filter(group => group.every(e => known(e.burgers)));
    const patties = logs.reduce((s,e) => s + e.patties, 0);
    const burgers = logs.filter(e => known(e.burgers)).reduce((s,e) => s + e.burgers, 0);
    const burgerTripTotal = completeBurgerTrips.flat().reduce((s,e) => s + e.burgers, 0);
    return {key:id, name:logs[0].name, entries:logs, patties, burgers, tripCount:byTrip.length, pattyAverage:patties / byTrip.length, burgerTrips:completeBurgerTrips.length, burgerAverage:completeBurgerTrips.length ? burgerTripTotal / completeBurgerTrips.length : null};
  }).sort((a,b) => b.patties-a.patties || a.name.localeCompare(b.name));
  return {entries, people, patties:entries.reduce((s,e)=>s+e.patties,0), burgers:entries.filter(e=>known(e.burgers)).reduce((s,e)=>s+e.burgers,0), knownEntries:entries.filter(e=>known(e.burgers)).length, receiptEntries:entries.filter(e=>e.receiptBacked).length, trips:trips.length};
}
export function rankPeople(people, metric) {
  const field = {patties:'patties',burgers:'burgers','patties-per-trip':'pattyAverage','burgers-per-trip':'burgerAverage'}[metric];
  if (!field) throw new Error('Unknown ranking metric.');
  return people.filter(person => metric === 'burgers'
    ? person.entries.some(entry => known(entry.burgers))
    : metric === 'burgers-per-trip' ? known(person.burgerAverage) : true)
    .sort((a,b) => b[field]-a[field] || a.name.localeCompare(b.name));
}
export function overviewStats(trips) {
  const all = stats(trips);
  const byTrip = trips.map(trip => ({key:trip.key,name:trip.name,month:trip.month,location:trip.location,...tripStats(trip)}));
  const definitions = [
    {key:'patties',label:'Total patties',title:'Total patties',unit:'patties',perPatty:1},
    {key:'calories',label:'Calories (kcal)',title:'Calories',unit:'kcal',perPatty:110},
    {key:'sodium',label:'Sodium (mg)',title:'Sodium',unit:'mg',perPatty:90},
    {key:'fat',label:'Fat (g)',title:'Fat',unit:'g',perPatty:6},
    {key:'protein',label:'Protein (g)',title:'Protein',unit:'g',perPatty:10}
  ];
  const divide = (value,count) => count ? value/count : 0;
  return [...definitions.map(metric => ({
    ...metric,
    value:all.patties*metric.perPatty,
    averages:[{label:'Per trip',value:divide(all.patties*metric.perPatty,all.trips)},{label:'Per person',value:divide(all.patties*metric.perPatty,all.people.length)}],
    trips:[...byTrip].sort((a,b)=>b.patties-a.patties||b.month.localeCompare(a.month)).map(trip=>({...trip,value:trip.patties*metric.perPatty,share:divide(trip.patties,all.patties)*100})),
    contributors:all.people.slice(0,3).map(person=>({name:person.name,value:person.patties*metric.perPatty,share:divide(person.patties,all.patties)*100})),
    note:metric.key==='patties'?`${all.people.length} people · ${all.entries.length} logged entries`:'Patty-only estimates. Buns, cheese, toppings, sides, and drinks are excluded.'
  })),{
    key:'trips',label:'Trips',title:'Trips',unit:'trips',value:all.trips,
    averages:[{label:'People',value:all.people.length},{label:'Places',value:new Set(byTrip.map(trip=>key(trip.location||'')).filter(Boolean)).size},{label:'People / trip',value:divide(byTrip.reduce((sum,trip)=>sum+trip.people,0),all.trips)}],
    trips:[...byTrip].sort((a,b)=>b.month.localeCompare(a.month)).map(trip=>({...trip,value:trip.people,share:0})),
    contributors:[],note:`${all.patties} patties · ${all.entries.length} logged entries`
  }];
}
export function tripStats(trip) {
  const groups = new Map();
  for (const e of trip.entries) { const p=groups.get(key(e.name)) || {name:e.name,patties:0}; p.patties+=e.patties; groups.set(key(e.name),p); }
  const people=[...groups.values()].sort((a,b)=>b.patties-a.patties || a.name.localeCompare(b.name));
  const patties=trip.entries.reduce((s,e)=>s+e.patties,0);
  return {patties, burgers:trip.entries.every(e=>known(e.burgers)) ? trip.entries.reduce((s,e)=>s+e.burgers,0) : null, people:people.length, average:people.length ? patties/people.length : 0, top:people[0]?.name};
}
export function emptyDraft() { return {merchant:'',location:'',purchasedAt:'',currency:'USD',subtotalCents:null,taxCents:null,totalCents:null,items:[],warnings:[],confidence:'low'}; }
export function emptyItem() { return {label:'',category:'burger',quantity:1,pattiesEach:null,cheeseEach:null,lineTotalCents:null,modifiers:[],person:''}; }
export function receiptTotals(items) {
  const burgers=items.filter(i=>i.category==='burger');
  return {burgers:burgers.reduce((s,i)=>s+i.quantity,0),patties:burgers.every(i=>known(i.pattiesEach)) ? burgers.reduce((s,i)=>s+i.quantity*i.pattiesEach,0) : null,unassigned:burgers.filter(i=>!i.person.trim()).length};
}
