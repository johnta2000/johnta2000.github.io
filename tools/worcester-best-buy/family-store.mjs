import { applyChange } from './family-picks.mjs';
import { callPicks, validSnapshot } from './pick-storage.mjs?v=1';

// A separate local journal entry for each tap survives reloads and avoids two tabs
// overwriting each other's unsent edits. The server deduplicates retries by request ID.
export function familyStore(id, { storage, request=callPicks, notify=()=>{}, uuid=()=>crypto.randomUUID() } = {}) {
  const prefix='worcester-best-buy.family.'+id+'.';
  const baselineKey=prefix+'confirmed';
  const editPrefix=prefix+'edit.';
  const queue=[];
  let confirmed, running, lastFailure=false;
  function read(key) { try { return JSON.parse(storage?.getItem(key) || 'null'); } catch { return null; } }
  function write(key,value) { try { storage?.setItem(key,JSON.stringify(value)); } catch {} }
  function forget(key) { try { storage?.removeItem(key); } catch {} }
  function valid(state) { return validSnapshot(state) && Number.isSafeInteger(state.version) && state.version>=0; }

  const cached=read(baselineKey);
  if (valid(cached)) confirmed=cached;
  try {
    for (let i=0; i<storage.length; i++) {
      const key=storage.key(i);
      if (!key?.startsWith(editPrefix)) continue;
      const edit=read(key);
      if (edit?.request && Array.isArray(edit.change?.items)) queue.push(edit);
    }
    queue.sort((a,b)=>a.time-b.time || a.request.localeCompare(b.request));
  } catch {}

  function acknowledge(state) {
    if (!valid(state)) throw new Error('Family list unavailable');
    if (!confirmed || confirmed.version<=state.version) {
      confirmed=state;
      const previous=read(baselineKey);
      if (!valid(previous) || previous.version<=state.version) write(baselineKey,state);
    }
  }
  function value() {
    if (!confirmed) return null;
    return queue.reduce((result,edit)=>applyChange(result,edit.change),confirmed);
  }
  function refresh() {
    if (running) return running;
    running=Promise.resolve().then(async()=>{
      if (!confirmed || !queue.length) acknowledge(await request('getFamily',{id}));
      while (queue.length) {
        const edit=queue[0];
        acknowledge(await request('updateFamily',{id,request:edit.request,change:edit.change}));
        queue.shift();
        forget(editPrefix+edit.request);
      }
      lastFailure=false;
    }).catch(error=>{ lastFailure=true; if (!confirmed) throw error; })
      .finally(()=>{ running=undefined; notify(); });
    return running;
  }
  function edit(change) {
    if (!confirmed) throw new Error('Open the list before editing it');
    const entry={request:uuid(),change,time:Math.max(Date.now(),(queue.at(-1)?.time || 0)+1)};
    queue.push(entry); write(editPrefix+entry.request,entry);
    lastFailure=false; notify();
    void refresh().catch(()=>{});
  }
  function phase() { return lastFailure?'error':queue.length?'saving':'saved'; }
  return { value, refresh, edit, phase, pending:()=>queue.length };
}
