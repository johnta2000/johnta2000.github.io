export const personKey = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
export function text(value: string, max: number, label: string, optional = false) {
  const clean = value.trim().replace(/\s+/g, " ");
  if ((!optional && !clean) || clean.length > max) throw Error(`${label} must be ${optional ? "at most" : "1–"}${max} characters.`);
  return clean;
}
export function count(value: number, max: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw Error(`${label} must be a whole number from 0 to ${max}.`);
  return value;
}
export function validateCounts(patties: number, burgers?: number, cheese?: number) {
  count(patties, 200, "Patties");
  if (burgers !== undefined) {
    count(burgers, 50, "Burgers");
    if (burgers > patties || (!burgers && patties)) throw Error("Check the burger and patty counts. Each burger needs at least one patty.");
    if (patties > burgers * 10) throw Error("Check the patties per burger (up to 10 each).");
  }
  if (cheese !== undefined) count(cheese, 200, "Cheese slices");
}
type Draft = {
  merchant: string; location: string; purchasedAt: string; currency: string;
  subtotalCents: number | null; taxCents: number | null; totalCents: number | null;
  items: { label: string; category: string; quantity: number; pattiesEach: number | null; cheeseEach: number | null; lineTotalCents: number | null; modifiers: string[]; person: string; customizations?: Customization[] }[];
  warnings: string[]; confidence: string;
};
export type Customization = {id:string;amount:"regular"|"light"|"extra"|"double_extra"|"no"};
export type BurgerItem = {label:string;quantity:number;pattiesEach:number;cheeseEach:number|null;customizations:Customization[]};
export function validateBurgerItems(items: BurgerItem[], patties: number, burgers: number|undefined, cheese?: number) {
  if(items.length>50)throw Error("Check the burger item details: use at most 50 burger types.");
  let pattyTotal=0,burgerTotal=0,cheeseTotal=0,allCheeseKnown=true;
  for(const item of items){
    text(item.label,150,"Item");count(item.quantity,50,"Item quantity");count(item.pattiesEach,10,"Patties per burger");
    if(!item.quantity||!item.pattiesEach)throw Error("Each burger item needs a quantity and at least one patty.");
    if(item.cheeseEach===null)allCheeseKnown=false;else count(item.cheeseEach,10,"Cheese per burger");
    validateCustomizations(item.customizations);
    pattyTotal+=item.quantity*item.pattiesEach;burgerTotal+=item.quantity;cheeseTotal+=item.quantity*(item.cheeseEach||0);
  }
  if(pattyTotal!==patties||burgerTotal!==burgers||(allCheeseKnown&&cheese!==undefined&&cheeseTotal!==cheese))throw Error("Check the burger item details: they must match the order totals.");
  if(!allCheeseKnown&&cheese!==undefined)throw Error("Check the cheese total: leave it unknown when an item has unknown cheese.");
  return items.map(item=>({...item,label:text(item.label,150,"Item"),customizations:validateCustomizations(item.customizations) as Customization[]}));
}
export function validateDraft(draft: Draft, confirming = false) {
  text(draft.merchant, 150, "Restaurant", true); text(draft.location, 250, "Location", true);
  if (draft.purchasedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.purchasedAt) || new Date(`${draft.purchasedAt}T12:00:00Z`).toISOString().slice(0, 10) !== draft.purchasedAt)) throw Error("Choose a valid receipt date or leave it blank.");
  if (!/^[A-Z]{3}$/.test(draft.currency)) throw Error("Use a three-letter currency code.");
  for (const value of [draft.subtotalCents, draft.taxCents, draft.totalCents]) if (value !== null) count(value, 1000000, "Receipt amount in cents");
  if (draft.items.length > 100 || (confirming && !draft.items.length)) throw Error("Add between 1 and 100 receipt items.");
  if (draft.warnings.length > 20 || draft.warnings.some(w => w.length > 500)) throw Error("Receipt notes are too long.");
  for (const item of draft.items) {
    text(item.label, 150, "Item"); count(item.quantity, 50, "Item quantity");
    if (!item.quantity) throw Error("Each item needs a quantity of at least 1.");
    text(item.person, 80, "Person", true);
    if (item.modifiers.length > 20 || item.modifiers.some(m => m.length > 100)) throw Error("Item modifiers are too long.");
    if(item.customizations!==undefined)validateCustomizations(item.customizations);
    if (item.lineTotalCents !== null) count(item.lineTotalCents, 1000000, "Item amount in cents");
    if (item.pattiesEach !== null) count(item.pattiesEach, 10, "Patties per burger");
    if (item.cheeseEach !== null) count(item.cheeseEach, 10, "Cheese per burger");
    if (confirming && item.category === "burger" && (!item.person.trim() || item.pattiesEach === null || item.pattiesEach < 1)) throw Error("Assign every burger to a person and confirm its patties per burger.");
  }
}
export function allocations(draft: Draft) {
  validateDraft(draft, true);
  const people = new Map<string, { person: string; personKey: string; patties: number; burgers: number; cheese?: number; log: string; items:BurgerItem[] }>();
  for (const item of draft.items.filter(i => i.category === "burger")) {
    const key = personKey(item.person);
    const entry = people.get(key) || { person: text(item.person, 80, "Person"), personKey: key, patties: 0, burgers: 0, cheese: 0, log: "", items:[] };
    entry.burgers += item.quantity; entry.patties += item.quantity * item.pattiesEach!;
    if (entry.cheese !== undefined) entry.cheese = item.cheeseEach === null ? undefined : entry.cheese + item.quantity * item.cheeseEach;
    entry.log += `${entry.log ? " + " : ""}${item.quantity} × ${item.label}`;
    const customizations=item.customizations===undefined?parseCustomizations(item.modifiers).customizations:item.customizations;
    entry.items.push({label:text(item.label,150,"Item"),quantity:item.quantity,pattiesEach:item.pattiesEach!,cheeseEach:item.cheeseEach,customizations:validateCustomizations(customizations) as Customization[]});
    people.set(key, entry);
  }
  for (const entry of people.values()) { validateCounts(entry.patties, entry.burgers, entry.cheese); validateBurgerItems(entry.items,entry.patties,entry.burgers,entry.cheese);text(entry.log, 2000, "Order"); }
  return [...people.values()];
}
import { validateCustomizations, parseCustomizations } from "../burgery/customizations.js";
