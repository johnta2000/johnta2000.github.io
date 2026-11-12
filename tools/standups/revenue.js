/* Shared revenue snapshots; private drafts are saved to Convex before navigation. */
window.StandupRevenue={create(root,api){
 const M=window.StandupRevenueModel,$=id=>root.querySelector('#'+id),rf=id=>$('rf-'+id);
 const fieldIds={compliance:'compliance',chase:'chase',bofa:'bofa',bofaMonthly:'monthly',bilt:'bilt',nextcard:'nextcard',chaseCount:'chase-count',bofaCount:'bofa-count',biltCount:'bilt-count',nextcardSubscriptions:'nextcard-count'};
 const state={date:null,data:null,values:M.empty(),target:null,baseVersion:null,baseTargetVersion:null,draftVersion:null,mode:'summary',dirty:false,invalid:false,revision:0,loading:false};
 let timer,pending=Promise.resolve(true),loadVersion=0,saving=false,publicationWork=Promise.resolve(true);
 const tabId=(()=>{try{let id=sessionStorage.getItem('standups:revenue-tab');if(!id){id=crypto.randomUUID();sessionStorage.setItem('standups:revenue-tab',id);}return id;}catch{return crypto.randomUUID();}})();
 const key=date=>'standups:revenue-recovery:'+api.owner()+':'+tabId+':'+date;
 function localRecover(){try{return JSON.parse(localStorage.getItem(key(state.date)));}catch{return null;}}
 function cache(){try{localStorage.setItem(key(state.date),JSON.stringify({values:state.values,target:state.target,baseVersion:state.baseVersion,baseTargetVersion:state.baseTargetVersion,draftVersion:state.draftVersion,raw:Object.fromEntries([...root.querySelectorAll('[data-number]')].map(el=>[el.id,el.value])),revision:state.revision}));}catch{/* The backend draft remains the primary recovery store. */}}
 function clearCache(){try{localStorage.removeItem(key(state.date));}catch{}}
 function status(message,error=false){rf('status').textContent=message;rf('status').style.color=error?'var(--rf-danger)':'';}
 function draftTotals(){rf('draft-total').textContent=M.money(M.total(state.values));rf('bofa-draft-total').textContent=M.money(M.bofa(state.values));}
 function fields(){rf('date').value=state.date||'';rf('date').readOnly=true;rf('date').setAttribute('aria-label','Revenue date; change it using standup date navigation');for(const [key,id]of Object.entries(fieldIds)){if(document.activeElement!==rf(id))rf(id).value=state.values[key]===null?'':(M.counts.includes(key)?M.comma(state.values[key]):M.money(state.values[key]).slice(1));}if(document.activeElement!==rf('target'))rf('target').value=state.target===null?'':M.money(state.target).slice(1);draftTotals();}
 function setMode(mode,{route=true}={}){state.mode=['summary','edit','history'].includes(mode)?mode:'summary';render();if(route)api.modeChanged(state.mode);}
 function render(){
  const data=state.data,record=data?.selected||data?.previous,v=record?.values||M.empty(),total=record?M.total(v):0,target=data?.target?.targetCents??null,ratio=target?total/target*100:0;
  root.setAttribute('aria-busy',String(state.loading));rf('update').disabled=state.loading||!data;
  rf('update').hidden=state.mode==='edit';rf('update').setAttribute('aria-expanded',String(state.mode==='edit'));rf('form').hidden=state.mode!=='edit';rf('overview').hidden=state.mode==='edit'||!record;$('revenueEmpty').hidden=state.mode==='edit'||Boolean(record)||state.loading;
  rf('asof').textContent=state.loading?'Loading revenue…':record?(data.selected?'As of ':'Latest update: ')+M.dateLabel(record.date)+(data.selected?'':` · no update for ${M.dateLabel(state.date)}`):state.date?`As of ${M.dateLabel(state.date)}`:'';
  rf('total').textContent=M.money(total);rf('target-copy').textContent='Month to date'+(target!==null?' · target '+M.money(target):'');rf('percent').textContent=target?ratio.toFixed(1)+'% of target':'Monthly target not entered';rf('remaining').textContent=target?(total>target?M.money(total-target)+' above target':M.money(target-total)+' to go'):'';root.querySelector('.rf-progress span').style.width=Math.min(100,ratio)+'%';root.querySelector('.rf-progress').setAttribute('aria-valuenow',String(Math.min(100,ratio)));
  for(const [key,id]of Object.entries(fieldIds)){const out=rf(id+'-out');if(!out)continue;if(M.counts.includes(key)){const n=v[key];out.textContent=n===null?'Count not entered':M.comma(n)+' '+(key==='nextcardSubscriptions'?'subscription':'acquisition')+(n===1?'':'s');}else out.textContent=M.money(v[key]);}
  rf('bofa-total-out').textContent=M.money(M.bofa(v));rf('acquisitions-out').textContent=M.money(M.acquisitions(v));rf('saved').textContent=record?'Saved '+new Date(record.updatedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'';
  rf('slack').disabled=!record;rf('summary').value=record?M.slack(record.date,v,target):'';
  fields();history();
 }
 function history(){const rows=state.data?.history||[];rf('history-count').textContent=rows.length+' update'+(rows.length===1?'':'s');const container=root.querySelector('.rf-history');container.open=state.mode==='history';rf('history-rows').replaceChildren(...rows.map((record,i)=>{const row=document.createElement('div');row.className='rf-history-row';const link=document.createElement('a');link.href=api.dateUrl(record.date);link.textContent=M.dateLabel(record.date);if(record.date===state.date)link.setAttribute('aria-current','date');link.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();api.navigateDate(record.date);});row.append(link);const prior=rows[i-1],change=prior?record.totalCents-prior.totalCents:null;for(const text of [M.money(record.totalCents),change===null?'First update':(change>=0?'+':'−')+M.money(Math.abs(change))]){const span=document.createElement('span');span.textContent=text;row.append(span);}return row;}));
  const chart=$('revenueChart');chart.replaceChildren();if(rows.length<2){const text=document.createElement('p');text.className='rf-muted';text.textContent=rows.length?'The monthly trend appears after the next dated update.':'No saved snapshots this month.';chart.append(text);return;}
  const svgNS='http://www.w3.org/2000/svg',svg=document.createElementNS(svgNS,'svg');svg.classList.add('revenue-chart');const measuredWidth=Math.max(280,Math.round(root.getBoundingClientRect().width));svg.setAttribute('viewBox',`0 0 ${measuredWidth} 200`);svg.setAttribute('role','img');svg.setAttribute('aria-label','Month-to-date revenue by snapshot date. Exact values are listed below.');
  const width=measuredWidth,height=200,left=78,right=12,top=20,bottom=35,days=new Date(Number(state.date.slice(0,4)),Number(state.date.slice(5,7)),0).getDate();const target=state.data.target?.targetCents;const max=Math.max(1,...rows.map(row=>row.totalCents),target||0)*1.2;const x=day=>left+(day-1)/(days-1)*(width-left-right),y=value=>height-bottom-value/max*(height-top-bottom);
  const node=(name,attrs,text)=>{const el=document.createElementNS(svgNS,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;svg.append(el);return el;};
  const sub='var(--rf-sub)',line='var(--rf-line)';for(const value of [0,max/2,max]){node('line',{x1:left,x2:width-right,y1:y(value),y2:y(value),stroke:line});node('text',{x:left-8,y:y(value)+4,'text-anchor':'end',fill:sub,'font-size':11},M.money(Math.round(value)));}
  for(const day of [1,15,days])node('text',{x:x(day),y:height-12,'text-anchor':'middle',fill:sub,'font-size':12},state.date.slice(5,7)+'/'+day);
  if(target){node('line',{x1:left,x2:width-right,y1:y(target),y2:y(target),stroke:sub,'stroke-dasharray':'4 4'});node('text',{x:width-right,y:y(target)-5,'text-anchor':'end',fill:sub,'font-size':11},'Target '+M.money(target));}
  node('polyline',{points:rows.map(row=>x(Number(row.date.slice(8)))+','+y(row.totalCents)).join(' '),fill:'none',stroke:'var(--rf-blue)','stroke-width':2.5});for(const row of rows){const dot=node('circle',{cx:x(Number(row.date.slice(8))),cy:y(row.totalCents),r:3.5,fill:'var(--rf-blue)'});const title=document.createElementNS(svgNS,'title');title.textContent=M.dateLabel(row.date)+': '+M.money(row.totalCents);dot.append(title);}chart.append(svg);
 }
 async function load(date,{force=false,preserve=false}={}){
  if(date===state.date&&state.data&&!force)return;
  const version=++loadVersion;state.loading=true;state.date=date;state.data=null;render();status('Loading revenue…');
  try{const data=await api.load(date);if(version!==loadVersion)return;state.data=data;const source=data.draft||data.selected||data.previous;state.values={...(source?.values||M.empty())};state.target=data.draft?data.draft.targetCents:data.target?.targetCents??null;state.baseVersion=data.draft?data.draft.baseVersion:data.selected?.version??null;state.baseTargetVersion=data.draft?data.draft.baseTargetVersion:data.target?.version??null;state.draftVersion=data.draft?.version??null;state.dirty=false;state.invalid=false;
   const recovery=localRecover();if(recovery){state.values={...state.values,...recovery.values};state.target=recovery.target;state.baseVersion=recovery.baseVersion;state.baseTargetVersion=recovery.baseTargetVersion;if('draftVersion' in recovery)state.draftVersion=recovery.draftVersion;state.dirty=true;state.revision++;}
   state.loading=false;render();if(recovery?.raw){for(const [id,value]of Object.entries(recovery.raw)){const input=$(id);if(input)input.value=value;}readInputs();}
   status(recovery?'Recovered your unsaved draft.':data.draft?'Draft restored. Save update to share it with the team.':data.selected?'Saved for the team.':data.previous?'Starting from the latest snapshot this month.':'Enter the first revenue update for this month.');
   if(state.dirty&&!state.invalid)schedule();
  }catch(error){if(version!==loadVersion)return;state.loading=false;render();status('Revenue could not load. '+error.message,true);$('revenueRetry').hidden=false;}
 }
 function readInputs(){try{for(const [key,id]of Object.entries(fieldIds))state.values[key]=M.parse(rf(id).value,M.counts.includes(key));state.target=M.parse(rf('target').value);state.invalid=false;rf('error').textContent='';}catch(error){state.invalid=true;rf('error').textContent=error.message;}draftTotals();}
 function schedule(){clearTimeout(timer);timer=setTimeout(flush,450);}
 function flush({forPublish=false}={}){if(saving&&!forPublish)return publicationWork;clearTimeout(timer);pending=pending.then(async()=>{if(state.invalid){status('Check the number fields. Your draft is kept on this device until it can save.',true);return false;}if(!state.dirty||!state.data)return !state.dirty;const revision=state.revision,date=state.date;const args={date,values:{...state.values},targetCents:state.target,baseVersion:state.baseVersion,baseTargetVersion:state.baseTargetVersion,expectedDraftVersion:state.draftVersion};status('Saving draft…');try{const saved=await api.saveDraft(args);if(date!==state.date)return true;state.draftVersion=saved.version;if(revision===state.revision){state.dirty=false;clearCache();}status('Draft saved. Save update to share it with the team.');$('revenueRetry').hidden=true;return true;}catch(error){cache();status('Draft could not save. '+error.message,true);$('revenueRetry').hidden=false;if(/another tab|draft changed/i.test(error.message))$('revenueReload').hidden=false;return false;}});return pending.then(ok=>ok&&state.dirty?flush({forPublish}):ok);}
 rf('update').addEventListener('click',()=>{setMode('edit');});
 rf('done').addEventListener('click',async()=>{if(!await flush())return;setMode('summary');rf('update').focus({preventScroll:true});});
 root.addEventListener('input',event=>{if(!event.target.matches('[data-number]'))return;state.revision++;state.dirty=true;readInputs();cache();if(!state.invalid)schedule();});
 root.addEventListener('focusout',event=>{const input=event.target;if(!input.matches('[data-number]'))return;try{const key=Object.keys(fieldIds).find(key=>fieldIds[key]===input.id.slice(3)),isCount=M.counts.includes(key),n=M.parse(input.value,isCount);input.value=n===null?'':(isCount?M.comma(n):M.money(n).slice(1));}catch{}});
 rf('save').addEventListener('click',()=>{
  if(!state.data||saving)return;readInputs();if(state.invalid)return;
  saving=true;rf('save').disabled=true;root.querySelectorAll('input').forEach(input=>input.disabled=true);
  publicationWork=(async()=>{
   try{if(!await flush({forPublish:true}))return false;await api.publish({date:state.date,values:{...state.values},targetCents:state.target,baseVersion:state.baseVersion,baseTargetVersion:state.baseTargetVersion,expectedDraftVersion:state.draftVersion});clearCache();state.dirty=false;await load(state.date,{force:true});setMode('summary');status('Update saved for the team.');return true;}
   catch(error){rf('error').textContent=error.message;$('revenueReload').hidden=false;cache();status('Your draft is kept. Review the latest totals before trying again.',true);return false;}
   finally{saving=false;rf('save').disabled=false;root.querySelectorAll('input').forEach(input=>input.disabled=false);}
  })();
 });
 $('revenueReload').addEventListener('click',async()=>{const values={...state.values},target=state.target;await load(state.date,{force:true});if(!state.data)return;state.values=values;state.target=target;state.baseVersion=state.data.selected?.version??null;state.baseTargetVersion=state.data.target?.version??null;state.draftVersion=state.data.draft?.version??null;state.dirty=true;state.revision++;render();cache();$('revenueReload').hidden=true;rf('error').textContent='Latest team total: '+M.money(state.data.selected?.totalCents??0)+'. Your draft is kept; review before saving again.';});
 $('revenueRetry').addEventListener('click',()=>state.data?flush():load(state.date,{force:true}));
 root.querySelector('.rf-history summary').addEventListener('click',event=>{event.preventDefault();setMode(state.mode==='history'?'summary':'history');});
 rf('slack').addEventListener('click',async()=>{
  const record=state.data?.selected||state.data?.previous;if(!record)return;
  const text=rf('summary').value,html=M.slackHtml(record.date,record.values,state.data.target?.targetCents??null);
  if(navigator.clipboard?.write&&window.ClipboardItem){
   try{
    await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);
    rf('summary').hidden=true;status('Copied with formatting. Paste into Slack with ⌘V or Ctrl+V.');return;
   }catch{/* A plain-text copy can still work when rich clipboard writes are blocked. */}
  }
  try{await navigator.clipboard.writeText(text);rf('summary').hidden=true;status('Copied as plain text; formatted copying is unavailable in this browser.');}
  catch{rf('summary').hidden=false;rf('summary').focus();rf('summary').select();status('Select and copy the Slack summary.');}
 });
 window.addEventListener('resize',()=>{if(state.data&&state.mode==='history')history();});
 window.addEventListener('beforeunload',event=>{if(state.dirty||state.invalid||saving){cache();event.preventDefault();event.returnValue='';}});
 return {load,flush,setMode,get mode(){return state.mode;},get date(){return state.date;},get dirty(){return state.dirty;}};
}};
