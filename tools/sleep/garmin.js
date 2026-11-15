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
      message.textContent=`${result.synced ? `Synced ${result.synced} days. Your Garmin data is in My data.` : 'Connected, but Garmin returned no supported readings for this period. Sync your watch to Garmin Connect and try Sync now.'}`;
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
  if(isDemo)return;
  const message=document.querySelector('#garminMessage');
  try {
    const status=await convexQuery('garminData:status',{});
    document.querySelector('#garminForm').hidden=!status.configured || status.connected;
    document.querySelector('#garminSync').hidden=!status.configured || !status.connected;
    document.querySelector('#garminDisconnect').hidden=!status.connected;
    document.querySelector('#garminStatus').textContent=status.connected?'Connected · Manual sync':'Not connected';
    message.textContent=!status.configured?'Garmin setup is being prepared. Personal API connection is not enabled for this account yet.':status.lastSyncedAt?`Last synced ${new Date(status.lastSyncedAt).toLocaleString()}. Sync now refreshes the last 7 days.`:'Use a Personal API key from your own Garmin account. Your first sync imports the last 28 days.';
  } catch {message.textContent='Garmin setup is not available yet. Your other connections are unaffected.';}
}
