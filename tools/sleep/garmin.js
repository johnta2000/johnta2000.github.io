/* Invited-member Personal API setup. Keys never enter URLs, localStorage, or browser logs. */
function bindGarminControls() {
  const form=document.querySelector('#garminForm'),message=document.querySelector('#garminMessage');
  async function sync(apiKey) {
    const buttons=[...document.querySelectorAll('#garminCard button')];buttons.forEach(b=>b.disabled=true);
    message.textContent='Syncing Garmin…';
    try {
      const result=await convexAction('garmin:syncPersonal',apiKey?{apiKey}:{});
      form.elements.apiKey.value='';
      await loadDashboard();await initializeGarmin();
      message.textContent=garminSyncSummary(result);
    } catch(error) { message.textContent=error.message || 'Garmin could not sync. Try again.'; }
    finally { buttons.forEach(b=>b.disabled=false); }
  }
  window.addEventListener('beforeunload',event=>{if(form.elements.apiKey.value){event.preventDefault();event.returnValue='';}});
  form.addEventListener('submit',event=>{event.preventDefault();if(!isDemo)sync(form.elements.apiKey.value.trim());});
  document.querySelector('#garminSync').addEventListener('click',()=>{if(!isDemo)sync();});
  document.querySelector('#garminDisconnect').addEventListener('click',async()=>{
    if(isDemo)return;
    const button=document.querySelector('#garminDisconnect');button.disabled=true;
    try {await convexMutation('garminData:disconnect',{});await initializeGarmin();message.textContent='Disconnected. Imported history is retained. Delete the key in Garmin Connect to revoke it there too.';}
    catch(error){message.textContent=error.message || 'Could not disconnect. Try again.';}
    finally{button.disabled=false;}
  });
}
async function initializeGarmin() {
  if(isDemo){
    document.querySelector('#garminForm').hidden=true;
    document.querySelector('#garminSync').hidden=true;
    document.querySelector('#garminDisconnect').hidden=true;
    document.querySelector('#garminStatus').textContent='Sign in to connect';
    document.querySelector('#garminMessage').textContent='Garmin connections are available in your signed-in account. Preview mode does not connect or save data.';
    return;
  }
  const message=document.querySelector('#garminMessage');
  try {
    const status=await convexQuery('garminData:status',{});
    document.querySelector('#garminForm').hidden=!status.configured || status.connected;
    document.querySelector('#garminSync').hidden=!status.configured || !status.connected;
    document.querySelector('#garminDisconnect').hidden=!status.connected;
    document.querySelector('#garminStatus').textContent=status.connected?(status.complete===false?'Connected · Sync incomplete':'Connected · Manual sync'):'Not connected';
    const syncHint = !status.activityReady
      ? 'Sync now imports at least 28 days, including workouts.'
      : status.complete === false
        ? 'Sync now retries the last ' + status.syncDays + ' days.'
        : 'Sync now refreshes the last 7 days.';
    const warnings = status.complete === false ? (status.warnings || []).join(' ') : '';
    message.textContent = !status.configured
      ? 'Garmin setup is being prepared. Personal API connection is not enabled for this account yet.'
      : status.lastSyncedAt
        ? `${status.complete === false ? 'Last checked' : 'Last synced'} ${new Date(status.lastSyncedAt).toLocaleString()}. ${warnings} ${syncHint}`
        : 'Use a Personal API key from your own Garmin account. Your first sync imports the last 28 days.';
  } catch {message.textContent='Garmin setup is not available yet. Your other connections are unaffected.';}
}

function garminSyncSummary(result) {
  if(result.complete===false)return `Your Garmin key was accepted. ${result.synced?`Imported available readings for ${result.synced} ${result.synced===1?'day':'days'}.`:'The data sync is incomplete.'} ${(result.warnings||[]).join(' ')} Your existing readings were kept for failed requests. Use Sync now to retry; you do not need to enter your key again.`;
  return result.synced?`Synced ${result.synced} days. Your Garmin data is in My data.`:'Connected, but Garmin returned no supported readings for this period. Sync your watch to Garmin Connect and try Sync now.';
}
