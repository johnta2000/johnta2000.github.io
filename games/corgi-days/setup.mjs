import {valid, day} from './model.mjs';
export const fields={adopt:['name','coat','accessory','color'],wardrobe:['accessory','color','room'],settings:['name','coat']};
export function normalize(p){return {...p,adopted:p.adopted!==false};}
export function editorDraft(p,d={},kind){
  const out={};
  for(const key of fields[kind]){
    const value=d?.[key]??p[key];
    const candidate={...p,[key]:key==='name'?(typeof value==='string'?value.trim()||'Mochi':'Mochi'):value};
    out[key]=(key==='name'?typeof value==='string'&&value.length<=24:valid(candidate))?value:p[key];
  }
  return out;
}
export function adopt(p,d,now=Date.now()){
  if(p.adopted!==false)throw Error('Your corgi is already adopted. You can edit their identity in Settings.');
  const next={...p,...editorDraft(p,d,'adopt'),adopted:true,created:now,updated:now};
  next.name=next.name.trim();
  if(!valid(next))throw Error('Give your corgi a name before bringing them home.');
  return next;
}
export function anniversary(p,now=Date.now()){
  const start=day(p.created,p.timezone),today=day(now,p.timezone),years=Number(today.slice(0,4))-Number(start.slice(0,4));
  const leap=new Date(Date.UTC(Number(today.slice(0,4)),2,0)).getUTCDate()===29;
  const birthday=start.slice(5)==='02-29'&&!leap?'02-28':start.slice(5);
  return years>0&&birthday===today.slice(5)?years:0;
}
export function calendarReminder(p,time,now=new Date()){
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Choose a reminder time.');
  const [h,m]=time.split(':').map(Number),start=new Date(now);
  start.setHours(h,m,0,0);if(start<=now)start.setDate(start.getDate()+1);
  const pad=n=>String(n).padStart(2,'0');
  const date=`${start.getFullYear()}${pad(start.getMonth()+1)}${pad(start.getDate())}T${pad(h)}${pad(m)}00`;
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//John Ta//Corgi Days//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:corgi-${p.created}@john-ta.com`,`DTSTAMP:${now.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z/,'Z')}`,`DTSTART:${date}`,'DURATION:PT5M','RRULE:FREQ=DAILY','SUMMARY:A little time with your corgi','DESCRIPTION:Feed\\, play\\, wash and rest with your little friend.','URL:https://www.john-ta.com/games/corgi-days/?view=home','BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0M','DESCRIPTION:Time to check in with your corgi','END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
