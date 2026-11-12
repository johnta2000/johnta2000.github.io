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
 const reportCount=value=>value===null?'Not entered':comma(value);
 function slackItems(v){return [
  {text:'Compliance: '+money(v.compliance)},
  {text:'Acquisition commissions: '+money(acquisitions(v)),children:[
   {text:'Chase: '+reportCount(v.chaseCount)+' ('+money(v.chase)+')'},
   {text:'BOFA: '+money(bofa(v)),children:[
    {text:'Acquisitions: '+reportCount(v.bofaCount)+' ('+money(v.bofa)+')'},
    {text:'Monthly payment: '+money(v.bofaMonthly)},
   ]},
   {text:'Bilt: '+reportCount(v.biltCount)+(v.bilt===null?'':' ('+money(v.bilt)+')')},
  ]},
  {text:'Nextcard: '+reportCount(v.nextcardSubscriptions)+' subscriptions ('+money(v.nextcard)+')'},
 ];}
 const reportDate=date=>new Date(date+'T12:00:00').toLocaleDateString('en-US');
 function slack(date,v,target){
  const list=(items,depth=0)=>items.map(item=>'  '.repeat(depth)+'• '+item.text+(item.children?'\n'+list(item.children,depth+1):'')).join('\n');
  return reportDate(date)+':\n\nRevenue: '+money(total(v))+' MTD'+(target!==null?' (target: '+money(target)+')':'')+'\n'+list(slackItems(v));
 }
 function slackHtml(date,v,target){
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list=items=>'<ul>'+items.map(item=>'<li>'+escape(item.text)+(item.children?list(item.children):'')+'</li>').join('')+'</ul>';
  return '<p><strong>'+escape(reportDate(date))+':</strong></p>'+
   '<p><strong>Revenue: '+escape(money(total(v)))+' MTD</strong>'+(target!==null?' (target: '+escape(money(target))+')':'')+'</p>'+list(slackItems(v));
 }
 return {amounts,counts,fields,empty,comma,money,parse,total,bofa,acquisitions,dateLabel,slack,slackHtml};
});
