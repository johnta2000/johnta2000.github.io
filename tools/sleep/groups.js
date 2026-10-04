/* Live groups use server-authorized summaries; sample histories never enter API calls. */
let pendingSleepInvite = null;
let liveGroup = null;
let activeGroupId = null;
let groupFormMode = null;
let groupsRequest = 0;
let groupPoll;
const GROUP_COLORS = ['#397967', '#b66b3d', '#7c6da7', '#367ea0', '#a65375', '#79702f', '#6754a1', '#277f82', '#976444', '#577545'];
function captureSleepInvite() {
  const token = new URLSearchParams(location.hash.slice(1)).get('invite');
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    sessionStorage.setItem('daylightInvite', token);
    history.replaceState({}, '', location.pathname + location.search);
  }
  pendingSleepInvite = sessionStorage.getItem('daylightInvite');
}
function bindGroupEvents() {
  $('#groupMetric').innerHTML = Object.entries(Daylight.metrics).map(([key, item]) => `<option value="${key}">${item.label}</option>`).join('');
  SearchableSelect.enhance($('#groupMetric')).sync();
  $('#competitionMetric').innerHTML = Object.entries(Daylight.competitions).map(([key, item]) => `<option value="${key}">${item.label}</option>`).join('');
  SearchableSelect.enhance($('#competitionMetric')).sync();
  $('#competitionMetric').addEventListener('change', renderStandings);
  $('#groupSharingOptions').innerHTML = '<legend>Share with this group</legend><p>Only checked metrics are shared. Your notes stay private.</p>' + [
    ['Sleep', ['durationMinutes','score','efficiency','deepMinutes','remMinutes','consistency']],
    ['Recovery', ['recovery','hrv','restingHeartRate']], ['Activity', ['strain','workoutMinutes','workoutCount']],
  ].map(([title,keys]) => `<div class="sharing-category"><h3>${title}</h3><div>${keys.map(key => `<label><input type="checkbox" name="sharedMetric" value="${key}"> ${Daylight.metrics[key].label}</label>`).join('')}</div></div>`).join('');

  $('#createGroup').addEventListener('click', () => openGroupForm('create'));
  $('#createFirstGroup').addEventListener('click', () => openGroupForm('create'));
  $('#editSharing').addEventListener('click', () => openGroupForm('sharing'));
  $('#inviteFriend').addEventListener('click', () => openInvitationForm());
  $('#manageInviteFriend').addEventListener('click', () => openInvitationForm());
  $('#cancelInvitation').addEventListener('click', () => $('#invitationDialog').close());
  $('#invitationForm').addEventListener('submit', createGroupInvitation);
  $('#reviewInviteButton').addEventListener('click', reviewSleepInvite);
  $('#cancelGroupDialog').addEventListener('click', () => $('#groupDialog').close());
  $('#groupForm').addEventListener('submit', saveGroupForm);
  $('#groupSelect').addEventListener('change', () => {
    activeGroupId = $('#groupSelect').value;
    sessionStorage.setItem('daylightActiveGroup', activeGroupId);
    $('#newInvite').hidden = true;
    refreshLiveGroup();
  });
  $('#copyInvite').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#inviteLink').value); $('#copyInviteStatus').textContent = 'Copied. Send this link to your friend.'; }
    catch { $('#inviteLink').focus(); $('#inviteLink').select(); $('#copyInviteStatus').textContent = 'Select and copy the link above.'; }
  });
  $('#leaveGroup').addEventListener('click', async () => {
    if (!liveGroup) return;
    const close = liveGroup.owner;
    if (!confirm(close ? 'Close this group? Members will lose access to its shared view. Everyone keeps their own private records.' : 'Leave this group? Its members will no longer be able to read your shared history.')) return;
    await groupOperation(async () => {
      await convexMutation(close ? 'sleepGroups:close' : 'sleepGroups:leave', {groupId: activeGroupId});
      activeGroupId = null; sessionStorage.removeItem('daylightActiveGroup');
      await initializeGroups();
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isDemo && activeGroupId && activeView === 'friends') refreshLiveGroup();
  });
}
async function reviewSleepInvite() {
  els.authStatus.hidden = false;
  els.authSignOut.hidden = false;
  els.authStatus.textContent = 'Checking your group invitation…';
  try {
    const invite = await convexQuery('sleepGroups:previewInvite', {token: pendingSleepInvite});
    if (invite.alreadyMember) {
      sessionStorage.removeItem('daylightInvite'); pendingSleepInvite = null;
      $('#reviewInviteButton').hidden = true;
      await unlockDashboard(); return;
    }
    $('#reviewInviteButton').hidden = false;
    els.authStatus.textContent = `You’re invited to ${invite.name}. Review what you want to share before joining.`;
    openGroupForm('join', invite);
  } catch (error) {
    els.authStatus.textContent = groupError(error);
    if (/invalid|used|expired|no longer available/i.test(String(error.message))) {
      $('#reviewInviteButton').hidden = true;
      sessionStorage.removeItem('daylightInvite'); pendingSleepInvite = null;
    } else $('#reviewInviteButton').hidden = false;
  }
}
function openGroupForm(mode, invite) {
  groupFormMode = mode;
  $('#groupForm').reset();
  $('#groupFormError').textContent = '';
  $('#groupNameLabel').hidden = mode !== 'create';
  $('#groupNameInput').required = mode === 'create';
  $('#groupDisplayName').value = mode === 'sharing' ? liveGroup.own.name : (window.Clerk?.user?.firstName || '');
  $('#groupDialogTitle').textContent = mode === 'create' ? 'Create a private group' : mode === 'join' ? `Join ${invite.name}` : 'Your sharing';
  $('#groupDialogIntro').textContent = mode === 'join' ? `${invite.count} ${invite.count === 1 ? 'person' : 'people'} in this group. You can connect WHOOP after joining.` : mode === 'sharing' ? `Choose what members of ${liveGroup.name} can see. Uncheck all metrics to stop sharing.` : 'Give your group a name and choose what you want to share.';
  $('#saveGroupForm').textContent = mode === 'create' ? 'Create group' : mode === 'join' ? 'Join group' : 'Save sharing';
  $('#groupShareDays').value = String(mode === 'sharing' ? liveGroup.own.shareDays : 28);
  if (mode === 'sharing') $('#groupForm').querySelectorAll('[name="sharedMetric"]').forEach(input => { input.checked = liveGroup.own.metrics.includes(input.value); });
  SearchableSelect.enhance($('#groupShareDays')).sync();
  $('#groupDialog').showModal();
}
async function saveGroupForm(event) {
  event.preventDefault();
  const button = $('#saveGroupForm'); button.disabled = true;
  const args = {name: $('#groupDisplayName').value.trim(), metrics: [...$('#groupForm').querySelectorAll('[name="sharedMetric"]:checked')].map(input => input.value), shareDays: Number($('#groupShareDays').value)};
  try {
    const joining = groupFormMode === 'join';
    if (joining) {
      activeGroupId = await convexMutation('sleepGroups:acceptInvite', {...args, token: pendingSleepInvite});
      pendingSleepInvite = null; sessionStorage.removeItem('daylightInvite');
      $('#reviewInviteButton').hidden = true;
    } else if (groupFormMode === 'create') activeGroupId = await convexMutation('sleepGroups:create', {...args, groupName: $('#groupNameInput').value.trim()});
    else await convexMutation('sleepGroups:updateSharing', {...args, groupId: activeGroupId});
    sessionStorage.setItem('daylightActiveGroup', activeGroupId);
    $('#groupDialog').close();
    if (joining) {
      await unlockDashboard();
      switchView('connections');
      els.whoopMessage.textContent = 'You joined the group. Connect your own WHOOP account to import your sleep history.';
    } else { await initializeGroups(); switchView('friends'); }
  } catch (error) { $('#groupFormError').textContent = groupError(error); }
  finally { button.disabled = false; }
}
async function initializeGroups() {
  if (isDemo) return;
  $('#groupToolbar').hidden = false;
  $('.group-preview-label').hidden = true;
  $('#groupsPreviewBadge').hidden = true;
  $('.group-onboarding').hidden = false;
  try {
    const groups = await convexQuery('sleepGroups:list', {});
    activeGroupId = activeGroupId || sessionStorage.getItem('daylightActiveGroup');
    if (!groups.some(group => group.id === activeGroupId)) activeGroupId = groups[0]?.id || null;
    const select = $('#groupSelect');
    select.innerHTML = groups.map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join('');
    select.disabled = !groups.length;
    select.value = activeGroupId || '';
    SearchableSelect.enhance(select).sync();
    $('#groupEmptyState').hidden = groups.length > 0;
    await refreshLiveGroup();
    clearInterval(groupPoll);
    groupPoll = setInterval(() => { if (!document.hidden && activeView === 'friends' && activeGroupId) refreshLiveGroup(); }, 30000);
  } catch (error) { clearLiveGroup(); $('#groupMessage').textContent = groupError(error); }
}
function clearLiveGroup() {
  liveGroup = null; groupSample = null; groupHistory = null;
  $('#friendSample').hidden = true; $('#groupStandings').hidden = true; $('#groupManagement').hidden = true;
  $('#invitationManager').hidden = true; $('#newInvite').hidden = true;
  $('#inviteFriend').hidden = true; $('#editSharing').hidden = true;
  $('#groupPlot').replaceChildren(); $('#groupSummaryRows').replaceChildren(); $('#groupMembers').replaceChildren();
}
async function refreshLiveGroup() {
  if (isDemo) return;
  const request = ++groupsRequest, id = activeGroupId;
  if (!id) { clearLiveGroup(); return; }
  if (liveGroup?.id !== id) clearLiveGroup();
  try {
    const data = await convexQuery('sleepGroups:history', {groupId: id});
    if (request !== groupsRequest || activeGroupId !== id || isDemo) return;
    const oldIds = new Set(groupSample?.map(member => member.id) || []);
    liveGroup = data;
    groupSample = data.members.map((member, index) => ({...member, color: GROUP_COLORS[index % GROUP_COLORS.length], dash: ['', '7 4', '2 5'][index % 3]}));
    for (const member of groupSample) if (!oldIds.has(member.id)) visibleGroupMembers.add(member.id);
    $('#groupMembers').replaceChildren();
    $('#groupMessage').textContent = data.members.length === 1 ? 'Your group is ready. Invite a friend to start comparing.' : '';
    $('#inviteFriend').hidden = !data.owner;
    $('#editSharing').hidden = false;
    $('#friendSample').hidden = false;
    $('#groupManagement').hidden = false;
    $('#groupMemberList').innerHTML = data.members.map(member => `<div class="group-member-row"><span><strong>${escapeHtml(member.name)}${member.self ? ' (you)' : ''}</strong><small>${member.metrics.length ? `Sharing ${member.metrics.length} ${member.metrics.length === 1 ? 'metric' : 'metrics'} · last ${member.shareDays} days` : 'Not sharing data'}</small></span>${data.owner && !member.self ? `<button type="button" class="text-button" data-remove-member="${escapeHtml(member.id)}">Remove</button>` : ''}</div>`).join('');
    $('#groupMemberList').querySelectorAll('[data-remove-member]').forEach(button => button.addEventListener('click', () => {
      if (confirm('Remove this person from the group? Their private records will remain in their account.')) groupOperation(async () => { await convexMutation('sleepGroups:removeMember', {groupId: id, memberId: button.dataset.removeMember}); await refreshLiveGroup(); });
    }));
    renderInvitations();
    $('#leaveGroup').textContent = data.owner ? 'Close group' : 'Leave group';
    drawGroupChart();
  } catch (error) {
    if (request !== groupsRequest) return;
    clearLiveGroup(); $('#newInvite').hidden = true;
    $('#groupMessage').textContent = groupError(error);
  }
}
let invitationFilter = 'all';
let invitationFormGroup = null;
let replacingInvitation = null;
let shownInvitationId = null;
let invitationLinks = {};
try { invitationLinks = JSON.parse(sessionStorage.getItem('daylightInviteLinks') || '{}'); } catch {}
if (!invitationLinks || typeof invitationLinks !== 'object' || Array.isArray(invitationLinks)) invitationLinks = {};
function persistInvitationLinks() {
  try { sessionStorage.setItem('daylightInviteLinks', JSON.stringify(invitationLinks)); } catch {}
}
function inviteTimestamp(value) {
  return new Date(value).toLocaleString('en-US', {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
}
function openInvitationForm(invite = null) {
  if (!liveGroup?.owner) return;
  invitationFormGroup = liveGroup.id;
  replacingInvitation = invite?.id || null;
  $('#invitationLabel').value = invite && invite.label !== 'Unlabeled invitation' ? invite.label : '';
  $('#invitationError').textContent = '';
  $('#invitationDialogTitle').textContent = invite ? 'Replace invitation link' : 'Invite a friend';
  $('#saveInvitation').textContent = invite ? 'Replace link' : 'Create link';
  $('#invitationExplanation').textContent = invite ? 'This creates a new 7-day link and disables the old one. Send the new link to your friend. The old invitation stays in your history.' : 'A label for your records. Anyone you send the link to can use it once. No email is sent.';
  $('#invitationDialog').showModal();
  $('#invitationLabel').focus();
}
function displayInvitation(invite, token) {
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  const link = new URL(location.pathname, location.origin); link.searchParams.set('view', 'groups'); link.hash = `invite=${token}`;
  shownInvitationId = invite.id;
  $('#inviteLink').value = link.toString();
  $('#newInvite h3').textContent = `Invitation for ${invite.label || 'your friend'}`;
  $('#newInvite > p').textContent = `One person can use this link. Expires ${inviteTimestamp(invite.expiresAt)}. No email has been sent.`;
  $('#newInvite').hidden = false; $('#copyInviteStatus').textContent = '';
}
async function createGroupInvitation(event) {
  event.preventDefault();
  if (!liveGroup?.owner || invitationFormGroup !== activeGroupId) { $('#invitationError').textContent = 'The selected group changed. Close this form and try again.'; return; }
  const groupId = invitationFormGroup, label = $('#invitationLabel').value.trim();
  if (!label) { $('#invitationError').textContent = 'Add a name or label so you can identify this invitation.'; return; }
  const button = $('#saveInvitation'); button.disabled = true;
  try {
    const invite = await convexAction('sleepGroups:createInvite', {groupId, label, ...(replacingInvitation ? {replaceInviteId: replacingInvitation} : {})});
    invitationLinks[invite.id] = invite.token;
    if (replacingInvitation) delete invitationLinks[replacingInvitation];
    persistInvitationLinks();
    $('#invitationDialog').close();
    if (groupId !== activeGroupId) return;
    invitationFilter = 'pending';
    displayInvitation({...invite, label}, invite.token);
    await refreshLiveGroup();
    $('#newInvite').scrollIntoView({block:'nearest',behavior:'smooth'});
  } catch (error) { $('#invitationError').textContent = groupError(error); }
  finally { button.disabled = false; }
}
function renderInvitations() {
  const manager = $('#invitationManager'); manager.hidden = !liveGroup?.owner;
  if (manager.hidden) return;
  const invites = liveGroup.invitationHistory || [];
  const states = {pending:'Pending',accepted:'Accepted',expired:'Expired',revoked:'Revoked'};
  $('#invitationFilters').innerHTML = [['all','All'], ...Object.entries(states)].map(([key,label]) => `<button type="button" data-invite-filter="${key}" aria-pressed="${invitationFilter === key}">${label}<span>${key === 'all' ? invites.length : invites.filter(i => i.status === key).length}</span></button>`).join('');
  $('#invitationFilters').querySelectorAll('button').forEach(button => button.onclick = () => { invitationFilter = button.dataset.inviteFilter; renderInvitations(); $('#invitationFilters').querySelector(`[data-invite-filter="${invitationFilter}"]`).focus(); });
  for (const invite of invites) if (invite.status !== 'pending') delete invitationLinks[invite.id];
  persistInvitationLinks();
  if (shownInvitationId && !invites.some(i => i.id === shownInvitationId && i.status === 'pending')) { $('#newInvite').hidden = true; $('#inviteLink').value = ''; shownInvitationId = null; }
  const filtered = invites.filter(i => invitationFilter === 'all' || i.status === invitationFilter);
  $('#invitationRows').innerHTML = filtered.length ? filtered.map(invite => {
    const state = invite.status, copyable = /^[a-f0-9]{64}$/.test(invitationLinks[invite.id] || '');
    const detail = state === 'accepted' ? `${invite.acceptedName ? `Accepted by ${escapeHtml(invite.acceptedName)}` : 'Accepted · name not recorded for this older invitation'} · ${inviteTimestamp(invite.usedAt)}` : state === 'revoked' ? `${invite.replaced ? 'Replaced with a new link' : 'Revoked'} · ${inviteTimestamp(invite.revokedAt)}` : `${state === 'expired' ? 'Expired' : 'Expires'} ${inviteTimestamp(invite.expiresAt)}`;
    return `<div class="invitation-row"><div class="invitation-identity"><strong>${escapeHtml(invite.label)}</strong><small>Created ${inviteTimestamp(invite.createdAt)}</small><p>${detail}</p>${state === 'pending' && !copyable ? '<small>Original link unavailable in this tab. Replace it to get a new link.</small>' : ''}</div><span class="invitation-status invitation-status-${state}">${states[state]}</span><div class="invitation-actions">${state === 'pending' && copyable ? `<button class="secondary-button" type="button" data-copy-invitation="${escapeHtml(invite.id)}">Copy link</button>` : ''}${state !== 'accepted' && !invite.replaced ? `<button class="text-button" type="button" data-replace-invitation="${escapeHtml(invite.id)}">Replace link</button>` : ''}${state === 'pending' ? `<button class="text-button" type="button" data-revoke-invitation="${escapeHtml(invite.id)}">Revoke</button>` : ''}</div></div>`;
  }).join('') : `<p class="invitation-empty">${invites.length ? 'No ' + (invitationFilter === 'all' ? '' : invitationFilter + ' ') + 'invitations.' : 'No invitations yet. Create a labeled link for each friend.'}</p>`;
  $('#invitationRows').querySelectorAll('[data-copy-invitation]').forEach(button => button.onclick = async () => {
    const invite = invites.find(i => i.id === button.dataset.copyInvitation);
    displayInvitation(invite, invitationLinks[invite.id]);
    try { await navigator.clipboard.writeText($('#inviteLink').value); $('#invitationMessage').textContent = `Link for ${invite.label} copied.`; }
    catch { $('#inviteLink').focus(); $('#inviteLink').select(); $('#invitationMessage').textContent = 'Select and copy the invitation link above.'; }
  });
  $('#invitationRows').querySelectorAll('[data-replace-invitation]').forEach(button => button.onclick = () => openInvitationForm(invites.find(i => i.id === button.dataset.replaceInvitation)));
  $('#invitationRows').querySelectorAll('[data-revoke-invitation]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try { await convexMutation('sleepGroups:revokeInvite', {inviteId:button.dataset.revokeInvitation}); $('#invitationMessage').textContent = 'Invitation revoked. Its link no longer works.'; await refreshLiveGroup(); }
    catch(error) { $('#invitationMessage').textContent = groupError(error); button.disabled = false; }
  });
}
function groupError(error) {
  const message = String(error?.message || 'Could not finish. Please try again.');
  return message.split('Uncaught Error: ').at(-1).split('\n')[0].replace(/^Error: /, '');
}
async function groupOperation(work) {
  $('#groupMessage').textContent = '';
  try { await work(); } catch (error) { $('#groupMessage').textContent = groupError(error); }
}

function resetGroupsPreview() {
  clearInterval(groupPoll);
  liveGroup = null;
  groupSample = null;
  groupHistory = null;
  visibleGroupMembers.clear();
  ['you', 'alex', 'morgan'].forEach(id => visibleGroupMembers.add(id));
  $('#groupMembers').replaceChildren();
  $('#groupManagement').hidden = true;
  $('#invitationManager').hidden = true;
  $('#groupEmptyState').hidden = true;
  $('#newInvite').hidden = true;
  $('#groupsPreviewBadge').hidden = false;
}

function renderStandings() {
  const panel = $('#groupStandings');
  panel.hidden = !groupSample || (!isDemo && !liveGroup);
  if (panel.hidden) return;
  const board = Daylight.standings(groupSample, $('#competitionMetric').value, todayPacific());
  $('#standingsPeriod').textContent = `${formatShortDate(board.start)} – ${formatShortDate(board.end)} · LAST 7 COMPLETE DAYS`;
  $('#standingsRule').textContent = board.rule.description;
  const baseline = ['delta','percentChange'].includes(board.rule.mode);
  $('#standingsRows').innerHTML = board.entries.map(member => {
    const value = !member.eligible ? '—' : baseline ? `${member.result > 0 ? '+' : ''}${member.result.toFixed(1)}${board.rule.mode === 'percentChange' ? '%' : ' pts'}` : board.rule.mode === 'total' ? `${Math.round(member.result)} min` : formatMetricValue(member.result, board.rule.metric);
    return `<div class="standing-row${member.rank === 1 ? ' standing-leader' : ''}"><span class="standing-rank">${member.rank || '—'}</span><span class="standing-name"><i class="group-person-marker" style="background:${member.color}"></i>${escapeHtml(member.name.replace(' (sample)', ''))}<small>${member.eligible ? `${member.count}/7 days${baseline ? ` · ${member.previousCount}/7 previous days` : ''}` : `${member.reason}${member.reason === 'Not shared' ? '' : ` · ${member.count}/7 days`}`}</small></span><strong>${value}</strong></div>`;
  }).join('');
}
function formatMetricValue(value, metric) {
  if (!Number.isFinite(value)) return 'No data';
  const unit = Daylight.metrics[metric].unit;
  return unit === 'min' ? formatDuration(value) : unit === '%' ? `${value.toFixed(1)}%` : unit === '/21' ? `${value.toFixed(1)} / 21` : `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}
