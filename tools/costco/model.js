(function(root) {
  'use strict';
  const money = value => Number.isSafeInteger(value) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100) : '—';
  const date = value => new Date(value+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const channel = value => ({warehouse:'Warehouse',online:'Online','same-day':'Same-day'}[value] || value);
  const haystack = row => [row.order.orderId,row.order.date,row.order.location,row.order.recipient,row.order.status,row.note, ...row.order.items.flatMap(i=>[i.name,i.itemNumber])].filter(Boolean).join(' ').toLowerCase();
  function matches(row, filters) {
    return (!filters.channel || row.order.channel===filters.channel) && (!filters.from || row.order.date>=filters.from) && (!filters.to || row.order.date<=filters.to) && (filters.search||'').toLowerCase().trim().split(/\s+/).every(word=>haystack(row).includes(word));
  }
  function filter(rows, filters) { return rows.filter(r=>matches(r,filters)).sort((a,b)=>b.order.date.localeCompare(a.order.date)||b.importedAt-a.importedAt); }
  function items(rows, search) {
    const terms=(search||'').toLowerCase().trim().split(/\s+/).filter(Boolean);
    return rows.flatMap(row=> {
      const matching=row.order.items.filter(item=>terms.every(t=>[item.name,item.itemNumber].join(' ').toLowerCase().includes(t)));
      return (terms.length && matching.length ? matching : row.order.items).map(item=>({row,item}));
    });
  }
  function csv(rows) {
    const quote = value => '"'+String(value??'').replace(/^[=+@\t\r]/,"'$&").replace(/^-([^\d])/ ,"'-$1").replace(/"/g,'""')+'"';
    const output=[['Order / receipt ID','Date','Type','Channel','Recipient','Location','Total paid (USD)','Item','Item number','Quantity','Item total (USD)']];
    for(const row of rows) for(const item of row.order.items.length?row.order.items:[{}]) { const o=row.order; output.push([o.orderId,o.date,o.kind,channel(o.channel),o.recipient,o.location,(o.totalCents/100).toFixed(2),item.name,item.itemNumber,item.quantity,item.totalCents===undefined?'':(item.totalCents/100).toFixed(2)]); }
    return output.map(r=>r.map(quote).join(',')).join('\r\n');
  }
  const api={money,date,channel,filter,items,csv};
  if(typeof module==='object' && module.exports)module.exports=api; else root.CostcoModel=api;
})(typeof window==='object'?window:this);
