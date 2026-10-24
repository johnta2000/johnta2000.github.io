// Calendar dates stay timezone-free until a local display date is needed.
export function parseDate(value:string):string|null {
  const text=value.trim();
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text),us=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if(!iso&&!us)return null;
  const year=Number(iso?iso[1]:us![3]),month=Number(iso?iso[2]:us![1]),day=Number(iso?iso[3]:us![2]);
  if(year<1000||year>9999||month<1||month>12||day<1||day>new Date(year,month,0).getDate())return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function displayDate(value:string):string {
 const iso=parseDate(value);return iso?`${iso.slice(5,7)}/${iso.slice(8,10)}/${iso.slice(0,4)}`:value;
}
export function localToday():string {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
