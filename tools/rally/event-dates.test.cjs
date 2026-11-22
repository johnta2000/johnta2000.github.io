const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=file=>fs.readFileSync(__dirname+'/'+file,'utf8');
test('a bad date stays inside its own menu row; valid dates and concert time still render',()=>{
 const ctx=vm.createContext({window:{},Intl,Date,escapeAttr:String,escapeHtml:String});
 vm.runInContext(read('event-lifecycle.js'),ctx);
 const app=read('app.js');vm.runInContext(['dateRange','eventDateLine'].map(name=>app.split('\n').find(line=>line.startsWith('function '+name+'('))).join('\n'),ctx);
 vm.runInContext(read('event-history.js'),ctx);
 const good={id:'valid',startsAt:'2027-05-15',endsAt:'2027-05-15',startTime:'20:00',timeZoneLabel:'PDT'};
 for(const invalid of ['2027-05-15T20:00:00-07:00','2027-02-29','2027-19-01',null,undefined]){
   const bad={id:'bad',startsAt:invalid,endsAt:invalid,eventTimeZone:'America/Los_Angeles'};
   assert.equal(ctx.RallyEvents.validDay(invalid),false);
   assert.match(ctx.window.RallyHistory.menu([good,bad],good),/Dates TBD/);
   assert.equal(ctx.eventDateLine(bad),'Dates TBD');
 }
 assert.match(ctx.eventDateLine(good),/May 15, 2027 · 8:00 PM PDT/);
 assert(ctx.RallyEvents.validDay('2028-02-29'));
});
