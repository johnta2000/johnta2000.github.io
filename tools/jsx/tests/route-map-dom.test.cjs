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
test('small result sets omit pagination and keep the map directly in the fare results',()=>{
 const {w,d,get,change,close}=setup('?origin=BUR&destination=CCR');
 assert.equal(get('total').textContent,'3 fares');
 assert.equal(get('page-controls').hidden,true);
 assert.equal(get('route-map').closest('.fare-section'),get('fares').closest('.fare-section'));
 assert.ok(get('route-map').previousElementSibling.matches('.pagination'));
 const notes=d.querySelector('.fare-notes');
 assert.equal(notes.open,false);assert.equal(get('route-map').nextElementSibling,notes);
 assert.match(get('map-summary').textContent,/^3 fares · 1 route matches · BUR → CCR$/);
 assert.equal(get('map-routes').hidden,true);
 // Multiple pages still work, including resetting to page one after filtering.
 get('reset').click();assert.equal(get('page-controls').hidden,false);
 change('per-page','25');assert.equal(d.querySelectorAll('#fares tr').length,25);
 get('next').click();assert.match(get('page').textContent,/Page 2 of/);assert.equal(get('prev').disabled,false);
 change('origin','BUR');change('destination','CCR');
 assert.equal(get('page-controls').hidden,true);assert.equal(get('page').textContent,'Page 1 of 1');
 get('budget').value='1';get('budget').dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(get('total').textContent,'0 fares');assert.equal(get('page-controls').hidden,true);
 close();
});
test('fare route links select that same map route while preserving budget, dates, and trip type',()=>{
 const {d,get,close}=setup('?trip=round_trip&budget=600&after=2026-12-01&before=2027-01-01&weekend=1');
 const first=d.querySelector('#fares tr');assert.ok(first);
 const book=new URL(first.querySelector('.book').href);
 first.querySelector('.fare-route-link').click();
 assert.equal(get('origin').value,book.searchParams.get('o'));
 assert.equal(get('destination').value,book.searchParams.get('d'));
 assert.equal(get('trip').value,'round_trip');assert.equal(get('budget').value,'600');
 assert.equal(get('after').value,'2026-12-01');assert.equal(get('before').value,'2027-01-01');assert.equal(get('weekend').checked,true);
 assert.equal(get('map-detail').hidden,false);assert.equal(get('map-routes').hidden,true);
 assert.match(get('map-detail').textContent,/round-trip total/);
 assert.equal(d.activeElement,get('map-title'));
 const before=get('total').textContent;
 get('map-detail').querySelector('button').click();assert.equal(get('total').textContent,before);
 close();
});
