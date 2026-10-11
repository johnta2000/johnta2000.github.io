// Shared by the browser, Convex validation, and receipt extraction.
// Missing selections mean unknown/unrecorded, never an inferred default.
export const AMOUNTS = [
  {id:'regular',label:'Standard / added'}, {id:'light',label:'Light'},
  {id:'extra',label:'Extra'}, {id:'double_extra',label:'Double extra'}, {id:'no',label:'None / removed'}
];
const allAmounts=AMOUNTS.map(a=>a.id), binary=['regular'];
export const CUSTOMIZATIONS = [
  {id:'grilled_onions',label:'Grilled onions',group:'Onions',aliases:['grilled onion','grilled onions','grill onions','grilled chop','chopped grilled onions']},
  {id:'whole_grilled_onion',label:'Whole grilled onion',group:'Onions',aliases:['whole grilled onion','whole grilled onions','whole grill']},
  {id:'raw_onion',label:'Raw sliced onion',group:'Onions',aliases:['raw onion','raw onions','raw sliced onion','sliced onion']},
  {id:'raw_chopped_onion',label:'Raw chopped onion',group:'Onions',aliases:['raw chop','raw chopped onion','raw chopped onions']},
  {id:'chopped_onions',label:'Chopped onions (cooking unspecified)',group:'Onions',aliases:['chopped onions','chopped onion']},
  {id:'onions',label:'Onions (preparation unspecified)',group:'Onions',aliases:['onion','onions']},
  {id:'chopped_chilies',label:'Chopped chilies',group:'Chilies',aliases:['chopped chilies','chopped chilis','chopped chillies','chopped chiles','chop chilies','chop chilis','chopped peppers']},
  {id:'whole_peppers',label:'Whole peppers',group:'Chilies',aliases:['whole peppers','whole pepper','whole chilies','whole chilis','whole chiles']},
  {id:'peppers',label:'Peppers (preparation unspecified)',group:'Chilies',aliases:['peppers','pepper','chilies','chilis','chiles','chillies']},
  {id:'extra_toast',label:'Extra toasted bun',group:'Bun',amounts:binary,exclusive:'toast',aliases:['extra toast','extra toasted bun','extra toasted buns','extra toasted','bun extra toast']},
  {id:'light_toast',label:'Lightly toasted bun',group:'Bun',amounts:binary,exclusive:'toast',aliases:['light toast','less toast','lightly toasted bun']},
  {id:'no_toast',label:'Untoasted bun',group:'Bun',amounts:binary,exclusive:'toast',aliases:['no toast','untoasted','untoasted bun','un toasted bun']},
  {id:'protein_style',label:'Protein Style (lettuce wrap)',group:'Preparation',amounts:binary,aliases:['protein style','protein-style','lettuce wrap','lettuce wrapped']},
  {id:'animal_style',label:'Animal Style',group:'Preparation',amounts:binary,exclusive:'style',aliases:['animal style','animal-style']},
  {id:'plain',label:'Plain',group:'Preparation',amounts:binary,exclusive:'style',aliases:['plain']},
  {id:'mustard_grilled',label:'Mustard-grilled patty',group:'Preparation',amounts:binary,aliases:['mustard grilled','mustard-grilled','mustard fried','fried mustard','mustard cooked','mustard-grilled patty']},
  {id:'no_salt',label:'No salt',group:'Preparation',amounts:binary,aliases:['no salt','unsalted']},
  {id:'cut_in_half',label:'Cut in half',group:'Preparation',amounts:binary,aliases:['cut in half','cut-in-half','cut half']},
  {id:'cold_cheese',label:'Cold cheese',group:'Preparation',amounts:binary,aliases:['cold cheese','unmelted cheese']},
  {id:'bun_on_side',label:'Bun on the side',group:'Preparation',amounts:binary,aliases:['bun on side','bun on the side','buns on the side']},
  {id:'lettuce',label:'Lettuce',group:'Vegetables',aliases:['lettuce']},
  {id:'tomato',label:'Tomato',group:'Vegetables',aliases:['tomato','tomatoes']},
  {id:'pickles',label:'Pickles',group:'Vegetables',aliases:['pickle','pickles']},
  {id:'spread',label:'Spread',group:'Sauces',aliases:['spread','in n out spread','burger spread']},
  {id:'mustard',label:'Mustard',group:'Sauces',aliases:['mustard']},
  {id:'ketchup',label:'Ketchup',group:'Sauces',aliases:['ketchup','catsup']},
  {id:'standard',label:'No customizations (confirmed)',group:'Preparation',amounts:binary,aliases:['no customizations','no modifications']}
].map(option=>({...option,amounts:option.amounts||allAmounts}));
const byId=new Map(CUSTOMIZATIONS.map(option=>[option.id,option]));
const clean=value=>value.trim().toLocaleLowerCase('en-US').replace(/[_–—]/g,' ').replace(/\s+/g,' ');
const aliases=new Map(CUSTOMIZATIONS.flatMap(option=>[option.id,...option.aliases].map(alias=>[clean(alias),option.id])));
export function customizationOption(id){return byId.get(id);}
export function customizationLabel(selection){
  const option=byId.get(selection.id);if(!option)return 'Unrecognized customization';
  const prefix={no:'No ',light:'Light ',extra:'Extra ',double_extra:'Double extra '}[selection.amount]||'';
  return prefix+option.label;
}
export function validateCustomizations(selections){
  if(!Array.isArray(selections)||selections.length>30)throw Error('Check the customizations: use at most 30 selections.');
  const seen=new Set(),exclusive=new Set();
  if(selections.some(s=>s?.id==='standard')&&selections.length>1)throw Error('Check the customizations: no customizations conflicts with other selections.');
  for(const selection of selections){
    const option=selection&&byId.get(selection.id);
    if(!option||!option.amounts.includes(selection.amount))throw Error('Check the customization and amount choices.');
    if(seen.has(selection.id))throw Error('Check the customizations: each option can appear only once.');
    if(option.exclusive&&exclusive.has(option.exclusive))throw Error('Check the customizations: conflicting '+option.exclusive+' choices.');
    seen.add(selection.id);if(option.exclusive)exclusive.add(option.exclusive);
  }
  if(selections.some(s=>s.id==='onions'&&s.amount==='no')&&selections.some(s=>s.id!=='onions'&&byId.get(s.id).group==='Onions'&&s.amount!=='no'))throw Error('Check the customizations: no onions conflicts with an onion preparation.');
  return selections.map(s=>({id:s.id,amount:s.amount}));
}
export function parseCustomizations(modifiers){
  const selections=[],unknown=[];
  for(const original of modifiers||[]){
    for(const piece of original.split(/[,;]+/).map(s=>s.trim()).filter(Boolean)){
      let value=clean(piece),amount='regular',id=aliases.get(value);
      if(!id){
        const prefix=value.match(/^(double extra|extra extra|extra|light|no|add|with)\s+(.+)$/);
        if(prefix){amount={'double extra':'double_extra','extra extra':'double_extra',extra:'extra',light:'light',no:'no',add:'regular',with:'regular'}[prefix[1]];value=prefix[2];id=aliases.get(value);}
      }
      if(!id||!byId.get(id).amounts.includes(amount)){unknown.push(piece);continue;}
      const prior=selections.find(s=>s.id===id);
      if(prior&&prior.amount!==amount){unknown.push(piece);continue;}
      if(!prior)selections.push({id,amount});
    }
  }
  return {customizations:selections,unknown};
}
export function effectiveCustomizations(selections){
  const result=new Map((selections||[]).map(s=>[s.id,{...s}]));
  if(result.has('animal_style'))for(const [id,amount]of [['mustard_grilled','regular'],['pickles','regular'],['spread','extra'],['grilled_onions','regular']])if(!result.has(id)&&!(id==='grilled_onions'&&[...result.values()].some(s=>byId.get(s.id)?.group==='Onions')))result.set(id,{id,amount});
  return [...result.values()];
}
export function prepareReceiptItem(item){
  const parsed=parseCustomizations(item.modifiers),explicit=item.customizations||[];
  const merged=new Map(parsed.customizations.map(s=>[s.id,s]));
  for(const selection of explicit)merged.set(selection.id,selection);
  return {...item,customizations:[...merged.values()],modifiers:parsed.unknown};
}
export function customizationStats(trips){
  const counts=new Map();let trackedBurgers=0;
  for(const trip of trips)for(const entry of trip.entries)for(const item of entry.items||[]){
    if(!Array.isArray(item.customizations)||!item.customizations.length)continue;trackedBurgers+=item.quantity;
    for(const selection of effectiveCustomizations(item.customizations)){
      const key=selection.id+':'+selection.amount,record=counts.get(key)||{...selection,label:customizationLabel(selection),burgers:0,people:new Set(),trips:new Set()};
      record.burgers+=item.quantity;record.people.add(clean(entry.name));record.trips.add(trip.key);counts.set(key,record);
    }
  }
  return {trackedBurgers,choices:[...counts.values()].map(record=>({...record,people:record.people.size,trips:record.trips.size})).sort((a,b)=>b.burgers-a.burgers||a.label.localeCompare(b.label))};
}
