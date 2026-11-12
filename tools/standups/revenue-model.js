(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StandupRevenueModel=api;})(typeof window==='object'?window:globalThis,()=>{
 const amounts=['compliance','chase','bofa','bofaMonthly','bilt','nextcard'];
 const counts=['chaseCount','bofaCount','biltCount','nextcardSubscriptions'];
 const fields=[...amounts,...counts];
 const empty=()=>Object.fromEntries(fields.map(key=>[key,null]));
 const comma=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n);
 const money=cents=>{
  if(cents===null)return 'Not entered';
  const thousands=Math.abs(cents)>=100000;
  // Five decimal places in thousands preserve the original cents in editable fields.
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:thousands?0:cents%100?2:0,maximumFractionDigits:thousands?5:2}).format(cents/(thousands?100000:100))+(thousands?'k':'');
 };
 function parse(raw,count=false){
  const str=String(raw??'').replace(/[,$\s]/g,'');if(!str)return null;
  let value;
  if(count){if(!/^\d+$/.test(str))throw Error('Use a whole number for counts.');value=Number(str);}
  else{
   const match=/^(\d+)(?:\.(\d*))?([kK])?$/.exec(str),places=match?.[3]?5:2;
   if(!match||(match[2]||'').length>places)throw Error('Use a dollar amount, such as 27k, 27,000 or 27,000.50.');
   value=Number(match[1])*(10**places)+Number((match[2]||'').padEnd(places,'0'));
  }
  if(!Number.isSafeInteger(value)||value>(count?100000000:1000000000000))throw Error('That number is too large.');return value;
 }
 const total=v=>amounts.reduce((sum,key)=>sum+(v[key]??0),0);
 const bofa=v=>(v.bofa??0)+(v.bofaMonthly??0);
 const acquisitions=v=>(v.chase??0)+bofa(v)+(v.bilt??0);
 const dateLabel=date=>new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
 function slack(date,v,target){return `${new Date(date+'T12:00:00').toLocaleDateString('en-US')}:\n\nRevenue: ${money(total(v))} MTD${target!==null?' (target: '+money(target)+')':''}\n• Compliance: ${money(v.compliance)}\n• Acquisition commissions: ${money(acquisitions(v))}\n  • Chase: ${comma(v.chaseCount??0)} (${money(v.chase)})\n  • BOFA: ${money(bofa(v))}\n    • Acquisitions: ${comma(v.bofaCount??0)} (${money(v.bofa)})\n    • Monthly payment: ${money(v.bofaMonthly)}\n  • Bilt: ${comma(v.biltCount??0)}${v.bilt===null?'':' ('+money(v.bilt)+')'}\n• Nextcard: ${comma(v.nextcardSubscriptions??0)} subscriptions (${money(v.nextcard)})`;}
 return {amounts,counts,fields,empty,comma,money,parse,total,bofa,acquisitions,dateLabel,slack};
});
