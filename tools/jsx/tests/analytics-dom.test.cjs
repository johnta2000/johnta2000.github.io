const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
test('booking intent, actual outbound actions, referrals, and committed filters are distinguishable',async()=>{
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://www.john-ta.com/tools/jsx/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,captures=[];
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const fixed=Date.parse('2026-10-19T12:00:00-07:00'),D=w.Date;w.Date=class extends D{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};
  const fakeScript=d.createElement('script');fakeScript.dataset.app='jsx';Object.defineProperty(d,'currentScript',{value:fakeScript,configurable:true});
  w.eval(fs.readFileSync(path.resolve(root,'../../assets/js/analytics.js'),'utf8'));
  for(const file of ['searchable-select.js','fares.js','map-data.js','route-map.js','app.js']) w.eval(fs.readFileSync(path.join(root,file),'utf8'));
  d.addEventListener('click',event=>{if(event.target.closest('a'))event.preventDefault();});
  let config;
  const count=name=>captures.filter(e=>e.event===name).length;
  const first=d.querySelector('#fares .book');first.click();
  assert.equal(d.getElementById('account-dialog').open,true);
  w.posthog={init:(_,options)=>{config=options;},capture:(event,properties)=>{const clean=config.before_send({event,properties});if(clean)captures.push(clean);}};
  d.querySelector('script[src*="us-assets.i.posthog.com"]').onload();
  assert.equal(count('jsx_booking_clicked'),1);assert.equal(count('jsx_account_prompt_shown'),1);assert.equal(count('jsx_booking_opened'),0);
  d.getElementById('account-continue').click();assert.equal(count('jsx_booking_opened'),1);
  first.click();assert.equal(count('jsx_booking_clicked'),2);assert.equal(count('jsx_booking_opened'),2);assert.equal(count('jsx_account_prompt_shown'),1);
  for(const placement of ['offer_header','guide','account_dialog']) {
    d.querySelector(`a[data-analytics-control="referral"][data-analytics-placement="${placement}"]`).click();
    assert.equal(captures.filter(e=>e.event==='jsx_referral_clicked'&&e.properties.placement===placement).length,1);
  }
  const origin=d.getElementById('origin');origin.value='OAK';origin.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(count('jsx_filter_changed'),1);assert.equal(captures.find(e=>e.event==='jsx_filter_changed').properties.filter_name,'origin');
  const search=d.getElementById('search');for(const value of ['PRIVATE','PRIVATE EMAIL']){search.value=value;search.dispatchEvent(new w.Event('input',{bubbles:true}));}
  await new Promise(resolve=>setTimeout(resolve,650));assert.equal(count('jsx_filter_changed'),2);
  assert.doesNotMatch(JSON.stringify(captures),/PRIVATE|EMAIL/);
  const genericBook=captures.filter(e=>e.event==='ui_interaction'&&e.properties.control==='book');assert.equal(genericBook.length,2);
  const mapPort=d.getElementById('map-airport');mapPort.value='OAK';mapPort.dispatchEvent(new w.Event('change',{bubbles:true}));
  d.querySelector('#map-routes button[data-route="OAK-LAS"]').click();d.querySelector('#map-detail .book').click();
  assert.equal(captures.filter(e=>e.event==='jsx_booking_opened'&&e.properties.placement==='route_map').length,1);
  first.dispatchEvent(new w.MouseEvent('auxclick',{button:1,bubbles:true,cancelable:true}));
  assert.equal(count('jsx_booking_clicked'),4);assert.equal(count('jsx_booking_opened'),4);
  assert.equal(config.disable_session_recording,true);assert.equal(config.cookieless_mode,'always');
  w.close();
});
