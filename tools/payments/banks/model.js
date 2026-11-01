(function(root){
const types={purchase_or_adjustment:'Purchase',credit_or_refund:'Credit / refund',payment:'Payment',fee:'Fee',interest:'Interest'};
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100):'—';
const date=s=>s?new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Unavailable';
function filter(rows,s){let q=(s.q||'').toLowerCase().trim();let r=rows.filter(({data:d})=>(!s.type||d.type===s.type)&&(!s.from||d.posted_date>=s.from)&&(!s.to||d.posted_date<=s.to)&&(!s.period||d.statement_id===s.period)&&(!q||[d.description,d.reference_number,d.address,...(d.pdf_details||[])].join(' ').toLowerCase().includes(q)));return r.sort((a,b)=>s.sort==='oldest'?a.data.posted_date.localeCompare(b.data.posted_date):s.sort==='amount-high'?b.data.amount_cents-a.data.amount_cents:s.sort==='amount-low'?a.data.amount_cents-b.data.amount_cents:b.data.posted_date.localeCompare(a.data.posted_date));}
function state(search){const p=new URLSearchParams(search);return Object.fromEntries(['account','view','transaction','statement','q','type','from','to','sort','period','page','pdfPage'].map(k=>[k,p.get(k)||'']));}
const api={types,money,date,filter,state};if(typeof module!=='undefined')module.exports=api;else root.BankHistory=api;
})(typeof window!=='undefined'?window:globalThis);
