const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculate}=require('../reconciliation.js');
const row=(kind,amountCents,extra={})=>({kind,amountCents,...extra});
test('charges, carried balances, payments and excluded rows explain the exact statement difference',()=>{
 const d={balanceCents:4900,rows:[
  row('opening',2000,{ignored:true}),row('payment',-3000,{ignored:true}),
  row('purchase',6500,{allocation:{john:6000,parents:500}}),
  row('credit',-700),row('purchase',100),
 ]};
 const before=JSON.stringify(d),m=calculate(d);
 assert.equal(m.charges,5900);assert.equal(m.opening,2000);assert.equal(m.payments,-3000);
 assert.equal(m.assigned,6500);assert.equal(m.unassigned,-600);assert.equal(m.ignored,-1000);
 assert.equal(m.assigned+m.unassigned+m.ignored,d.balanceCents);
 assert.equal(m.balanceGap,1600);assert.equal(m.chargeUnassignedCount,2);assert.equal(m.importMatches,true);
 assert.equal(m.balanceAllocated,false);assert.equal(JSON.stringify(d),before);
});
test('person charge totals exclude even allocated opening balances and payments; balance totals retain them',()=>{
 const m=calculate({balanceCents:8000,rows:[
  row('opening',5000,{allocation:{parents:3000,john:2000}}),
  row('payment',-4000,{allocation:{parents:-3000,john:-1000}}),
  row('purchase',8000,{allocation:{john:5000,jevin:3000}}),
  row('credit',-1000,{allocation:{jevin:-1000}}),
 ]});
 assert.equal(m.personCharges.parents,0);assert.equal(m.personCharges.john,5000);assert.equal(m.personCharges.jevin,2000);
 assert.equal(m.personBalances.parents,0);assert.equal(m.personBalances.john,6000);assert.equal(m.personBalances.jevin,2000);
 assert.equal(m.balanceAllocated,true);
});
test('a zero-sum unassigned pair and ignored charges never imply a completed balance allocation',()=>{
 const m=calculate({balanceCents:1000,rows:[row('purchase',2000),row('credit',-2000),row('purchase',1000,{ignored:true,allocation:{john:1000}})]});
 assert.equal(m.unassigned,0);assert.equal(m.chargeUnassignedCount,2);assert.equal(m.chargeIgnored,1000);
 assert.equal(m.personCharges.john,0);assert.equal(m.importMatches,true);assert.equal(m.balanceAllocated,false);
});
test('import differences and malformed splits remain visible',()=>{
 const m=calculate({balanceCents:1001,rows:[row('purchase',1000,{allocation:{john:900}})]});
 assert.equal(m.importMatches,false);assert.equal(m.invalidSplits,1);assert.equal(m.balanceAllocated,false);
});
