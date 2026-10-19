const {test}=require('node:test');
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..')+'/';
function setup(query=''){
 const dom=new JSDOM(fs.readFileSync(root+'index.html','utf8'),{url:'https://www.john-ta.com/tools/jsx/'+query,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const fixed=Date.parse('2026-10-19T12:00:00-07:00'),D=w.Date;w.Date=class extends D{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};
 for(const f of ['searchable-select.js','fares.js','map-data.js','route-map.js','app.js'])w.eval(fs.readFileSync(root+f,'utf8'));
 const get=id=>d.getElementById(id),change=(id,value)=>{get(id).value=value;get(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const airport=code=>d.querySelector(`.map-airport[data-code="${code}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 return {w,d,get,change,airport,close:()=>w.close()};
}
test('one set of filters controls the table, map, and booking details across pages',()=>{
 const {w,d,get,change,airport,close}=setup('?origin=BUR#route-map');
 assert.equal(get('map-airport'),null);
 assert.equal(d.querySelectorAll('.map-airport').length,29);
 assert.ok([...d.querySelectorAll('#map-routes button')].every(b=>b.dataset.route.startsWith('BUR-')));
 const corridorCount=d.querySelectorAll('.map-connection').length;
 const initial=get('map-summary').textContent;
 change('per-page','25');assert.equal(get('map-summary').textContent,initial);
 airport('OAK');assert.equal(get('origin').value,'OAK');assert.ok(get('origin-trigger').textContent.includes('OAK'));
 assert.ok([...d.querySelectorAll('#map-routes button')].every(b=>b.dataset.route.startsWith('OAK-')));
 d.querySelector('#map-routes button[data-route="OAK-LAS"]').click();
 assert.equal(get('destination').value,'LAS');assert.equal(new URL(w.location.href).searchParams.get('destination'),'LAS');
 assert.match(get('map-detail').textContent,/Oakland → Las Vegas/);assert.match(get('map-detail').textContent,/\$169/);
 assert.ok([...d.querySelectorAll('#fares tr')].every(row=>row.textContent.includes('Oakland (OAK) → Las Vegas (LAS)')));
 assert.equal(d.querySelectorAll('.map-connection').length,corridorCount);
 assert.equal(d.querySelectorAll('.map-connection.is-matching').length,1);
 const book=d.querySelector('#map-detail .book');assert.match(book.href,/o=OAK&d=LAS/);book.click();assert.equal(get('account-dialog').open,true);get('account-close').click();
 change('trip','round_trip');assert.match(get('map-detail').textContent,/round-trip total/);assert.match(d.querySelector('#map-detail .book').href,/&rd=/);
 get('map-clear').click();assert.equal(get('origin').value,'');assert.equal(get('destination').value,'');assert.equal(get('trip').value,'round_trip');
 get('map-zoom-in').click();assert.ok(Number(get('flight-map').getAttribute('viewBox').split(' ')[2])<1000);get('map-fit').click();assert.equal(get('flight-map').getAttribute('viewBox'),'0 0 1000 600');
 close();
});
test('map selections preserve restrictive filters and never offer a nonmatching booking',()=>{
 const {w,d,get,change,airport,close}=setup('?trip=round_trip&budget=400&after=2026-12-01&before=2027-01-01&weekend=1');
 const kept={trip:'round_trip',budget:'400',after:'2026-12-01',before:'2027-01-01'};
 airport('OAK');d.querySelector('.map-connection[data-route="OAK-LAS"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 assert.equal(get('origin').value,'OAK');assert.equal(get('destination').value,'LAS');
 for(const [key,value]of Object.entries(kept))assert.equal(get(key).value,value,key);
 assert.equal(get('weekend').checked,true);
 const detailBook=d.querySelector('#map-detail .book');
 if(detailBook && /booking\/select/.test(detailBook.href)){
  assert.match(detailBook.href,/&rd=/);const departure=new URL(detailBook.href).searchParams.get('dd');assert.ok(departure>='2026-12-01'&&departure<='2027-01-01');
 }
 // An impossible budget retains every geographic pairing without showing stale fares.
 get('budget').value='1';get('budget').dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(d.querySelectorAll('#map-routes button').length,0);assert.match(get('map-summary').textContent,/0 routes match/);
 assert.equal(get('empty').hidden,false);assert.equal(get('map-empty').hidden,true);assert.ok(d.querySelectorAll('.map-connection').length>60);
 assert.match(get('map-detail').textContent,/No fares on this route match/);assert.doesNotMatch(get('map-detail').textContent,/\$|Infinity|Invalid Date/);
 assert.equal(d.querySelector('#map-detail a[href*="booking/select"]'),null);
 // Catalog-only airports still work through the existing searchable From control.
 airport('SAF');assert.equal(get('origin').value,'SAF');assert.match(get('origin-trigger').textContent,/SAF/);
 get('map-clear').click();assert.equal(get('budget').value,'1');assert.equal(get('after').value,'2026-12-01');assert.equal(get('weekend').checked,true);
 close();
});
