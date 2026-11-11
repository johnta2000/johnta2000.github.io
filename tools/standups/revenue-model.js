(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StandupRevenueModel=api;})(typeof window==='object'?window:globalThis,()=>{
 const amounts=['compliance','chase','bofa','bofaMonthly','bilt','nextcard'];
 const counts=['chaseCount','bofaCount','biltCount','nextcardSubscriptions'];
 const fields=[...amounts,...counts];
 const empty=()=>Object.fromEntries(fields.map(key=>[key,null]));
 const comma=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n);
 const money=cents=>cents===null?'Not entered':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2}).format(cents/100);
 function parse(raw,count=false){const str=String(raw??'').replace(/[,$\s]/g,'');if(!str)return null;if(!(count?/^\d+$/:/^\d+(\.\d{0,2})?$/).test(str))throw Error(count?'Use a whole number for counts.':'Use a dollar amount, such as 27,000 or 27,000.50.');const value=count?Number(str):Math.round(Number(str)*100);if(!Number.isSafeInteger(value)||value>(count?100000000:1000000000000))throw Error('That number is too large.');return value;}
 const total=v=>amounts.reduce((sum,key)=>sum+(v[key]??0),0);
 const bofa=v=>(v.bofa??0)+(v.bofaMonthly??0);
 const acquisitions=v=>(v.chase??0)+bofa(v)+(v.bilt??0);
 const dateLabel=date=>new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
 function slack(date,v,target){return `${new Date(date+'T12:00:00').toLocaleDateString('en-US')}:\n\nRevenue: ${money(total(v))} MTD${target!==null?' (target: '+money(target)+')':''}\n• Compliance: ${money(v.compliance)}\n• Acquisition commissions: ${money(acquisitions(v))}\n  • Chase: ${comma(v.chaseCount??0)} (${money(v.chase)})\n  • BOFA: ${money(bofa(v))}\n    • Acquisitions: ${comma(v.bofaCount??0)} (${money(v.bofa)})\n    • Monthly payment: ${money(v.bofaMonthly)}\n  • Bilt: ${comma(v.biltCount??0)}${v.bilt===null?'':' ('+money(v.bilt)+')'}\n• Nextcard: ${comma(v.nextcardSubscriptions??0)} subscriptions (${money(v.nextcard)})`;}
 return {amounts,counts,fields,empty,comma,money,parse,total,bofa,acquisitions,dateLabel,slack};
});
