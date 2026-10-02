(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = 'https://rapid-shark-565.convex.cloud';
  const cash = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
  const monthLabel = m => new Date(m + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
  const button = (label, fn, className = 'quiet') => { const b = node('button', label, className); b.type = 'button'; b.onclick = fn; return b; };
  let session = null, sessionId, epoch = 0, serial = 0, mounted = false, data = null, calc = null, totals = null, busy = false, dirty = false, picker;
  let paymentTarget, configTarget, voidTarget, paymentAttempt, configAttempt, noteAttempt;
  const sheet = RentSheet({ root: $('rent-sheet'), save: args => call('mutation', 'saveGrid', args), refreshed: () => refresh(), selectMonth: month => navigate(month), canEdit: () => { if (dirty || busy) { notice('Save your monthly note or finish the pending save before editing the sheet.'); return false; } return true; } });
  $('month').value = localDate().slice(0, 7);
  function notice(value = '') { $('notice').textContent = value; $('notice').hidden = !value; }
  function message(e) { return e.message?.match(/(?:This month changed[^\n]*|This imported payment[^\n]*|Enter [^\n]*|Parking credit[^\n]*|Affil contribution[^\n]*|Room adjustments[^\n]*|Save the month[^\n]*)/)?.[0] || 'Couldn’t save. Your changes are still here. Try again.'; }
  async function token(current) {
    let value = await current.getToken();
    try { const claims = JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (claims.aud === 'convex' || Array.isArray(claims.aud) && claims.aud.includes('convex')) return value; } catch {}
    try { value = await current.getToken({ template: 'convex' }); } catch {}
    return value;
  }
  async function call(kind, name, args = {}) {
    const generation = epoch, current = session;
    if (!current) throw Error('Sign in again.');
    const bearer = await token(current);
    if (generation !== epoch) throw Error('Session changed.');
    const response = await fetch(`${API}/api/${kind}`, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: JSON.stringify({ path: `rent:${name}`, args, format: 'json' }) });
    const result = await response.json();
    if (generation !== epoch) throw Error('Session changed.');
    if (!response.ok || result.status !== 'success') throw Error(result.errorMessage || 'Request failed.');
    return result.value;
  }
  function lock(value) { busy = value; document.querySelectorAll('#app button, dialog button[type=submit], #month').forEach(n => n.disabled = value); sheet.setLocked(value); if(value)$('sync').textContent='Saving…'; else if($('sync').textContent==='Saving…')$('sync').textContent=''; }
  function clearPrivate() {
    sheet.clear();
    ++serial; data = calc = totals = null; busy = dirty = false; paymentTarget = configTarget = voidTarget = paymentAttempt = configAttempt = noteAttempt = null;
    document.querySelectorAll('dialog').forEach(d => d.close());
    document.querySelectorAll('dialog input, dialog textarea, #note').forEach(n => n.value = '');
    ['people','breakdown','method','payments','history','source-payments','resident-inputs','payer'].forEach(id => $(id).replaceChildren());
    ['remaining','collection-copy','received','target','gross','parking','total','source-note','sync','config-preview','payment-month','config-month','payment-error','config-error','void-error'].forEach(id => $(id).textContent = '');
    $('requests').checked = false; $('note').disabled=$('requests').disabled=false; picker?.sync(); $('app').hidden = true; $('dashboard').hidden = true; notice(); lock(false);
  }
  async function refresh() {
    const generation = epoch, request = ++serial, month = $('month').value;
    $('sync').textContent = 'Loading…';
    try {
      const [result, ledger] = await Promise.all([call('query', 'dashboard', { month }), call('query', 'ledger')]);
      if (generation !== epoch || request !== serial || month !== $('month').value) return;
      if (dirty || sheet.hasChanges()) { $('sync').textContent='Unsaved changes'; return; }
      data = result; dirty = false; noteAttempt = null; render(); sheet.load(ledger, month); $('sync').textContent = 'Up to date';
    } catch (e) { if (generation === epoch && request === serial) { $('sync').textContent = 'Couldn’t refresh'; notice('Couldn’t load this month. Check your connection and refresh.'); } }
  }
  const names = () => [...data.item.config.people.map(p => p.name), 'Affil'];
  function render() {
    const item = data.item;
    $('empty').hidden = !!item; $('dashboard').hidden = !item; $('edit').hidden = !item;
    $('create').disabled = false;
    $('empty-message').textContent = data.template ? 'Start with the previous month’s rent split. Payments and parking credits start fresh.' : 'Set up your three residents and monthly split, or wait for the approved workbook import.';
    $('history').replaceChildren(...data.months.sort((a,b) => b.month.localeCompare(a.month)).map(m => { const b = button(monthLabel(m.month), () => navigate(m.month)); b.setAttribute('aria-pressed', String(m.month === $('month').value)); return b; }));
    if (!item) return;
    calc = RentMath.calculate(item.config, item.parkingCents); totals = RentMath.summary(calc, data.payments);
    $('remaining').textContent = cash(totals.remaining);
    $('collection-copy').textContent = totals.remaining ? `${totals.rows.filter(r => r.remaining > 0).length} of 4 contributions still open${totals.overpaid ? ` · ${cash(totals.overpaid)} overpaid separately` : ''}` : `Everything is covered.${totals.overpaid ? ` ${cash(totals.overpaid)} overpaid.` : ''}`;
    $('progress').style.width = `${calc.landlordCents ? Math.min(100, (calc.landlordCents - totals.remaining) / calc.landlordCents * 100) : 100}%`;
    $('received').textContent = `${cash(totals.received)} recorded`; $('target').textContent = `${cash(calc.landlordCents)} to cover`;
    $('gross').textContent = cash(item.config.rentCents); $('parking').textContent = '−' + cash(item.parkingCents); $('total').textContent = cash(calc.landlordCents);
    const labels = names();
    $('people').replaceChildren(...labels.map((name, i) => {
      const r = totals.rows[i], card = node('article', undefined, 'person'), top = node('div', undefined, 'person-top'), who = node('div');
      who.append(node('div', name, 'person-name'), node('small', i === 3 ? 'Office contribution' : i === 1 ? 'Loft · private bath' : i === 2 ? 'Private room · shared bath' : 'Private room · private bath'));
      top.append(node('span', name[0], 'avatar'), who); card.append(top, node('div', cash(r.due), 'person-amount'), node('div', `${cash(r.received)} recorded${r.overpaid ? ` · ${cash(r.overpaid)} overpaid` : ` · ${cash(r.remaining)} left`}`, 'person-meta'));
      const bottom = node('div', undefined, 'person-bottom'); bottom.append(node('span', r.status, `status ${r.status.toLowerCase()}`), button('Record ↗', () => openPayment(i))); card.append(bottom); return card;
    }));
    $('breakdown').replaceChildren(...calc.rows.map(r => { const tr = node('tr'); [r.name,cash(r.baseCents),'−'+cash(r.parkingCents),'−'+cash(r.creditCents),cash(r.dueCents)].forEach((v,i) => tr.append(node('td',v,i===2||i===3?'credit':''))); return tr; }));
    $('method').replaceChildren(...calc.rows.map(r => node('p', `${r.name}: ${r.room} room + ${r.closet} closet = ${r.area.toFixed(1)} sq ft (${(r.share*100).toFixed(1)}%).`)), node('p', `Loft adjustment: ${cash(item.config.loftCents)}. Bathroom adjustment: ${cash(item.config.bathroomCents)}.`));
    $('note').value = item.note; $('requests').checked = item.requestsSent;
    $('source-review').hidden = !item.sourceNote; $('source-note').textContent = item.sourceNote || '';
    $('source-payments').replaceChildren(...(item.sourcePayments || []).map(p => {
      const row = node('div', undefined, 'source-row'), info = node('div'), confirmed = data.payments.some(x => x.sourcePayer === p.payer && !x.voidedAt), monthlyTotal = data.payments.some(x => x.payer === p.payer && x.date === data.item.month && !x.voidedAt);
      info.append(node('strong', `${labels[p.payer]} · ${p.amountCents === null ? 'Blank in workbook' : cash(p.amountCents)}`), node('p', p.note || 'No payment date recorded.'));
      row.append(info); if (monthlyTotal) row.append(node('span', 'Monthly total recorded', 'status paid')); else if (confirmed) row.append(node('span', 'Confirmed', 'status paid')); else if (p.amountCents > 0) row.append(button('Review payment', () => openPayment(p.payer, p), 'outline')); return row;
    }));
    $('payments').replaceChildren();
    if (!data.payments.length) $('payments').append(node('p', 'No confirmed payments yet. Record one when the money arrives.', 'empty-activity'));
    for (const p of [...data.payments].sort((a,b) => b.date.localeCompare(a.date) || b.createdAt-a.createdAt)) {
      const row = node('div', undefined, `activity-row${p.voidedAt?' voided':''}`), info = node('div'), right = node('div', undefined, 'entry-right');
      info.append(node('strong', `${labels[p.payer]}${p.voidedAt?' · Voided':''}`), node('p', `${p.date} · Recorded by ${p.createdBy}${p.note?'\n'+p.note:''}`));
      right.append(node('strong', cash(p.amountCents), 'entry-amount')); if (!p.voidedAt) right.append(button('Void', () => { if(dirty||sheet.hasChanges()){notice('Save your note and sheet edits before changing payments.');return;} voidTarget = p._id; $('void-error').textContent=''; $('void-dialog').showModal(); })); row.append(info,right); $('payments').append(row);
    }
  }
  function navigate(month) {
    if (busy) return;
    if (sheet.hasChanges()) { notice('Save or discard your sheet edits before changing month details.'); $('month').value = data?.item?.month || localDate().slice(0,7); return; }
    if (dirty) { notice('Save your monthly note before changing months.'); $('month').value = data.item.month; return; }
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) { $('month').value = data?.item?.month || localDate().slice(0,7); return; }
    $('month').value=month; $('dashboard').hidden=true; $('empty').hidden=true; notice(); void refresh();
  }
  function offsetMonth(delta) { const d = new Date($('month').value+'-15T12:00:00'); d.setMonth(d.getMonth()+delta); navigate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); }
  function openPayment(payer=0, source=null) {
    if(sheet.hasChanges()){notice('Save or discard your sheet edits before recording an individual receipt.');return;}
    if(dirty){notice('Save your monthly note before recording a payment.');return;}
    paymentTarget = { month: data.item.month, sourcePayer: source?.payer }; paymentAttempt=null;
    $('payment-month').textContent=monthLabel(paymentTarget.month); $('payer').replaceChildren(...names().map((name,i)=>{const o=node('option',name);o.value=i;return o;}));
    $('payer').value=String(payer); $('payer').disabled=!!source; if (!picker) picker=SearchableSelect.enhance($('payer')); picker.sync();
    $('amount').value=((source?.amountCents ?? totals.rows[payer].remaining)/100).toFixed(2); $('date').value=source?'':localDate(); $('payment-note').value=source?`Imported workbook entry. ${source.note}`:''; $('payment-error').textContent=''; $('payment-dialog').showModal();
  }
  $('payer').onchange=()=>{if(paymentTarget?.sourcePayer===undefined && totals)$('amount').value=(totals.rows[Number($('payer').value)].remaining/100).toFixed(2);};
  function cents(id) { const value=$(id).value; if(value.trim()==='' || !/^\d+(\.\d{1,2})?$/.test(value)) throw Error('Enter dollar amounts with at most two decimal places.'); return Math.round(Number(value)*100); }
  $('payment-form').onsubmit=async e=>{
    e.preventDefault(); if(busy)return; const generation=epoch;
    try {
      const fields={month:paymentTarget.month,payer:Number($('payer').value),amountCents:cents('amount'),date:$('date').value,note:$('payment-note').value,...(paymentTarget.sourcePayer!==undefined?{sourcePayer:paymentTarget.sourcePayer}:{})};
      if(paymentAttempt && JSON.stringify(fields)!==JSON.stringify(paymentAttempt.fields)) throw Error('A payment save is unconfirmed. Retry the original values, or close and refresh to check the ledger before recording another payment.');
      paymentAttempt ||= {fields,key:crypto.randomUUID()}; lock(true);
      await call('mutation','recordPayment',{...fields,requestKey:paymentAttempt.key}); if(generation!==epoch)return;
      $('payment-dialog').close(); paymentAttempt=null; await refresh(); notice();
    } catch(e){if(generation===epoch)$('payment-error').textContent= /unconfirmed/.test(e.message)?e.message:message(e);}
    finally{if(generation===epoch)lock(false);}
  };
  function openConfig(create=false) {
    if(sheet.hasChanges()){notice('Save or discard your sheet edits before changing room calculations.');return;}
    if (dirty) { notice('Save your monthly note before editing the calculation.'); return; }
    const initial={rentCents:0,loftCents:0,bathroomCents:0,people:[0,1,2].map(i=>({name:`Resident ${i+1}`,room:0,closet:0,creditCents:0}))};
    configTarget={month:$('month').value,version:create?0:data.item.version,config:structuredClone(create?(data.template||initial):data.item.config),note:create?'':data.item.note,requestsSent:create?false:data.item.requestsSent}; configAttempt=null;
    $('config-month').textContent=monthLabel(configTarget.month);
    for(const [id,key] of [['rent-input','rentCents'],['loft-input','loftCents'],['bath-input','bathroomCents']])$(id).value=(configTarget.config[key]/100).toFixed(2);
    $('parking-input').value=((create?0:data.item.parkingCents)/100).toFixed(2);
    $('resident-inputs').replaceChildren(...configTarget.config.people.map((p,i)=>{
      const section=node('section',undefined,'resident-input');section.append(node('h3',['Private room · private bathroom','Loft · private bathroom','Private room · shared bathroom'][i]));
      const nameLabel=node('label','Resident name'),nameInput=node('input');nameInput.id=`name-${i}`;nameInput.value=p.name;nameInput.required=true;nameInput.maxLength=80;nameLabel.htmlFor=nameInput.id;section.append(nameLabel,nameInput);const grid=node('div',undefined,'form-grid');
      for(const [field,label,value,step] of [['room','Room (sq ft)',p.room,'0.1'],['closet','Closet (sq ft)',p.closet,'0.1'],['credit','Affil share ($)',p.creditCents/100,'0.01']]){const wrap=node('div'), l=node('label',label), input=node('input');input.id=`${field}-${i}`;input.type='number';input.min='0';input.step=step;input.required=true;input.value=value;l.htmlFor=input.id;wrap.append(l,input);grid.append(wrap);} section.append(grid); return section;
    })); $('config-error').textContent='';preview();$('config-dialog').showModal();
  }
  function configFields() {
    const config={...configTarget.config,rentCents:cents('rent-input'),loftCents:cents('loft-input'),bathroomCents:cents('bath-input'),people:configTarget.config.people.map((p,i)=>({...p,name:$(`name-${i}`).value.trim(),room:Number($(`room-${i}`).value),closet:Number($(`closet-${i}`).value),creditCents:cents(`credit-${i}`)}))};
    const parkingCents=cents('parking-input');RentMath.calculate(config,parkingCents);return {month:configTarget.month,config,parkingCents,note:configTarget.note,requestsSent:configTarget.requestsSent,expectedVersion:configTarget.version};
  }
  function preview(){try{const f=configFields(),c=RentMath.calculate(f.config,f.parkingCents);$('config-preview').textContent=c.rows.map(r=>`${r.name} ${cash(r.dueCents)}`).join(' · ')+` · Affil ${cash(c.affilCents)}`;}catch(e){$('config-preview').textContent=e.message;}}
  $('config-form').oninput=preview;
  $('config-form').onsubmit=async e=>{e.preventDefault();if(busy)return;const generation=epoch;try{
    const fields=configFields(); if(!configAttempt||JSON.stringify(configAttempt.fields)!==JSON.stringify(fields))configAttempt={fields,key:crypto.randomUUID()};lock(true);
    await call('mutation','saveMonth',{...fields,requestKey:configAttempt.key});if(generation!==epoch)return;$('config-dialog').close();await refresh();notice();
  }catch(e){if(generation===epoch)$('config-error').textContent=message(e);}finally{if(generation===epoch)lock(false);}};
  $('save-note').onclick=async()=>{if(busy)return;if(sheet.hasChanges()){notice('Save or discard sheet edits before saving notes.');return;}const generation=epoch;try{
    const fields={month:data.item.month,config:data.item.config,parkingCents:data.item.parkingCents,note:$('note').value,requestsSent:$('requests').checked,expectedVersion:data.item.version};
    if(!noteAttempt||JSON.stringify(noteAttempt.fields)!==JSON.stringify(fields))noteAttempt={fields,key:crypto.randomUUID()};lock(true);$('note').disabled=$('requests').disabled=true;
    await call('mutation','saveMonth',{...fields,requestKey:noteAttempt.key});if(generation!==epoch)return;dirty=false;await refresh();notice();
  }catch(e){if(generation===epoch)notice(message(e));}finally{if(generation===epoch){lock(false);$('note').disabled=$('requests').disabled=false;}}};
  $('void-form').onsubmit=async e=>{e.preventDefault();if(busy)return;const generation=epoch;lock(true);try{await call('mutation','voidPayment',{id:voidTarget});if(generation!==epoch)return;$('void-dialog').close();await refresh();}catch(e){if(generation===epoch)$('void-error').textContent=message(e);}finally{if(generation===epoch)lock(false);}};
  $('note').onbeforeinput=e=>{if(sheet.hasChanges()){e.preventDefault();notice('Save or discard your sheet edits before changing monthly notes.');}};
  $('requests').onclick=e=>{if(sheet.hasChanges()){e.preventDefault();notice('Save or discard your sheet edits before changing monthly notes.');}};
  $('note').oninput=$('requests').onchange=()=>{dirty=true; $('sync').textContent='Unsaved note';};
  $('prev').onclick=()=>offsetMonth(-1);$('next').onclick=()=>offsetMonth(1);$('month').onchange=()=>navigate($('month').value);
  $('record').onclick=()=>openPayment();$('edit').onclick=()=>openConfig();$('create').onclick=()=>openConfig(true);
  $('refresh').onclick=()=>{if(dirty || sheet.hasChanges()){notice('Save or discard your edits before refreshing. If another account changed them, copy your edits before reloading.');return;}notice();void refresh();};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!busy)$(b.dataset.close).close();});
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('cancel',e=>{if(busy)e.preventDefault();}));
  $('export').onclick=()=>{
    const rows=[['Month','Payer','Due','Received','Remaining','Overpaid'],...totals.rows.map((r,i)=>[data.item.month,names()[i],r.due/100,r.received/100,r.remaining/100,r.overpaid/100]),[],['Payment date','Payer','Amount','Note','Status','Recorded by'],...data.payments.map(p=>[p.date,names()[p.payer],p.amountCents/100,p.note,p.voidedAt?'Voided':'Recorded',p.createdBy])];
    const csv=rows.map(row=>row.map(value=>{let s=String(value);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),a=node('a');a.href=url;a.download=`rent-${data.item.month}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  async function sessionChanged(state){
    if(state.session===undefined||(state.session?.id||null)===sessionId)return;
    session=state.session;sessionId=session?.id||null;const generation=++epoch;clearPrivate();$('gate').hidden=false;$('sign-out').hidden=!session;$('retry').hidden=true;
    if(!session){$('gate-message').textContent='Sign in with an approved email to open the shared rent tracker.';$('sign-in').hidden=false;if(!mounted){window.Clerk.mountSignIn($('sign-in'),{routing:'hash',withSignUp:false,forceRedirectUrl:location.origin+location.pathname,appearance:{variables:{colorPrimary:'#315e46'}}});mounted=true;}return;}
    if(mounted){window.Clerk.unmountSignIn($('sign-in'));mounted=false;}$('sign-in').hidden=true;$('gate-message').textContent='Checking access…';
    try{await call('query','verify');if(generation!==epoch)return;$('gate').hidden=true;$('app').hidden=false;await refresh();}catch(e){if(generation!==epoch)return;$('gate-message').textContent=/not authorized/.test(e.message)?'This account doesn’t have access to Rent. Sign out and use an approved email.':'The rent workspace couldn’t load. Try again.';$('retry').hidden=false;}
  }
  $('sign-out').onclick=async()=>{++epoch;session=null;sessionId=undefined;clearPrivate();$('gate').hidden=false;$('gate-message').textContent='Signing out…';try{await window.Clerk.signOut();await sessionChanged({session:null});}catch{$('gate-message').textContent='Sign-out failed. Try again.';}};
  $('retry').onclick=()=>location.reload();
  window.addEventListener('beforeunload',e=>{if(dirty||busy||sheet.hasChanges()){e.preventDefault();e.returnValue='';}});
  window.addEventListener('offline',()=>{if(session)notice('You’re offline. Keep this page open to retry unsaved changes when you reconnect.');});
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  setInterval(()=>{if(session&&data&&!dirty&&!busy&&!sheet.hasChanges()&&!document.hidden&&!document.querySelector('dialog[open]'))void refresh();},30000);
  async function start(){try{await new Promise((resolve,reject)=>{let ticks=0;const timer=setInterval(()=>{if(window.Clerk&&window.__internal_ClerkUICtor){clearInterval(timer);resolve();}else if(++ticks>200){clearInterval(timer);reject(Error('Sign-in timed out'));}},100);});await window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});window.Clerk.addListener(sessionChanged);await sessionChanged({session:window.Clerk.session||null});}catch{clearPrivate();$('gate-message').textContent='Sign-in couldn’t load. Use john-ta.com and check your connection.';$('retry').hidden=false;}}
  void start();
})();
