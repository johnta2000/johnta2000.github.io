export const normalizeSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[’']/g,'').replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const stop=new Set(['the','at','in','on','of','and']);
type Part={text:string;words:string[];weight:number};
export type SearchDocument={raw:string;parts:Part[]};
export function searchDocument(primary:string[],secondary:string[]=[],other:string[]=[]):SearchDocument{
  const fields=[...primary.map(text=>({text,weight:30})),...secondary.map(text=>({text,weight:15})),...other.map(text=>({text,weight:0}))];
  const prepared=fields.filter(f=>f.text).map(({text,weight})=>{
    const normalized=normalizeSearch(text),words=normalized.split(' ');
    const joined=words.slice(1).map((word,i)=>/^\p{L}+$/u.test(word)&&/^\p{L}+$/u.test(words[i])?words[i]+word:'').filter(Boolean);
    return {text:normalized,weight,words:[...words,...joined]};
  });
  return {raw:fields.map(f=>f.text).join(' ').toLocaleLowerCase(),parts:[30,15,0].map(weight=>({weight,text:prepared.filter(p=>p.weight===weight).map(p=>p.text).join('\n'),words:[...new Set(prepared.filter(p=>p.weight===weight).flatMap(p=>p.words))]}))};
}
// Restricted Damerau-Levenshtein: tolerate small spelling errors/transpositions,
// while dates, years, initials, and short venue abbreviations remain exact.
function editDistance(a:string,b:string,limit:number):number{
  if(Math.abs(a.length-b.length)>limit)return limit+1;
  let previousPrevious:number[]=[],previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const current=[i];
    for(let j=1;j<=b.length;j++){
      current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+Number(a[i-1]!==b[j-1]));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])current[j]=Math.min(current[j],previousPrevious[j-2]+1);
    }
    if(Math.min(...current)>limit)return limit+1;
    previousPrevious=previous;previous=current;
  }
  return previous[b.length];
}
export function scoreSearch(query:string,document:SearchDocument,cache=new Map<string,number>(),allowTypos=true):number{
  const dates=query.match(/\b\d{4}-\d{2}(?:-\d{2})?\b/g)||[];
  if(dates.some(date=>!document.raw.includes(date)))return -1;
  const normalized=normalizeSearch(query.replace(/\b\d{4}-\d{2}(?:-\d{2})?\b/g,' ')),terms=normalized.split(' ').filter(t=>t&&!stop.has(t));
  if(!terms.length)return dates.length?100:0;
  let score=0;
  for(const term of terms){
    let best=-1;
    const numeric=/\d/u.test(term),limit=!numeric&&term.length>=7?2:!numeric&&term.length>=4?1:0;
    for(const part of document.parts){
      for(const word of part.words){
        const cacheKey=Number(allowTypos)+'\n'+term+'\n'+word;
        let match=cache.get(cacheKey);
        if(match===undefined){
          match=-1;
          if(word===term)match=100;
          else if(!numeric&&word.startsWith(term))match=80;
          else if(!numeric&&term.length>=4&&word.includes(term))match=65;
          else if(allowTypos&&limit){const distance=editDistance(term,word,limit);if(distance<=limit)match=50-distance*10;}
          cache.set(cacheKey,match);
        }
        if(match>=0)best=Math.max(best,match+part.weight);
        if(best>=130)break;
      }
      if(best>=130)break;
    }
    if(best<0)return -1;score+=best;
  }
  if(document.parts.some(p=>p.weight===30&&p.text.includes(normalized)))score+=80;
  return score;
}
export function locationSearchText(city:string){
  if(/san francisco/i.test(city))return 'SF San Fran Bay Area';
  if(/oakland|daly city|san jose/i.test(city))return 'SF Bay Area East Bay';
  if(/los angeles|inglewood/i.test(city))return 'LA Los Angeles';
  if(/anaheim/i.test(city))return 'OC Orange County LA';
  if(/new york|brooklyn|queens/i.test(city))return 'NYC New York';
  if(/las vegas/i.test(city))return 'LV Vegas';
  if(/saint paul|st\.? paul/i.test(city))return 'St Paul Saint Paul Twin Cities Minneapolis';
  return '';
}
