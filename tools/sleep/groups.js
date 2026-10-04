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
  $('#createGroup').addEventListener('click', () => openGroupForm('create'));
  $('#createFirstGroup').addEventListener('click', () => openGroupForm('create'));
  $('#editSharing').addEventListener('click', () => openGroupForm('sharing'));
  $('#inviteFriend').addEventListener('click', createGroupInvitation);
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
  $('#friendSample').hidden = true; $('#groupManagement').hidden = true;
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
    $('#groupMessage').textContent = data.members.length === 1 ? 'Your group is ready. Invite a friend to compare sleep.' : '';
    $('#inviteFriend').hidden = !data.owner;
    $('#editSharing').hidden = false;
    $('#friendSample').hidden = false;
    $('#groupManagement').hidden = false;
    $('#groupMemberList').innerHTML = data.members.map(member => `<div class="group-member-row"><span><strong>${escapeHtml(member.name)}${member.self ? ' (you)' : ''}</strong><small>${member.metrics.length ? `Sharing ${member.metrics.length} ${member.metrics.length === 1 ? 'metric' : 'metrics'} · last ${member.shareDays} days` : 'Not sharing sleep data'}</small></span>${data.owner && !member.self ? `<button type="button" class="text-button" data-remove-member="${escapeHtml(member.id)}">Remove</button>` : ''}</div>`).join('');
    $('#groupMemberList').querySelectorAll('[data-remove-member]').forEach(button => button.addEventListener('click', () => {
      if (confirm('Remove this person from the group? Their private records will remain in their account.')) groupOperation(async () => { await convexMutation('sleepGroups:removeMember', {groupId: id, memberId: button.dataset.removeMember}); await refreshLiveGroup(); });
    }));
    $('#pendingInvites').innerHTML = data.invites.length ? `<h4>Unused invitations</h4>${data.invites.map(invite => `<div class="group-member-row"><span>Created ${formatShortDate(new Date(invite.createdAt).toISOString().slice(0,10))}<small>Expires ${formatShortDate(new Date(invite.expiresAt).toISOString().slice(0,10))}</small></span><button type="button" class="text-button" data-revoke-invite="${escapeHtml(invite.id)}">Revoke</button></div>`).join('')}` : '';
    $('#pendingInvites').querySelectorAll('[data-revoke-invite]').forEach(button => button.addEventListener('click', () => groupOperation(async () => { await convexMutation('sleepGroups:revokeInvite', {inviteId: button.dataset.revokeInvite}); $('#newInvite').hidden = true; await refreshLiveGroup(); })));
    $('#leaveGroup').textContent = data.owner ? 'Close group' : 'Leave group';
    drawGroupChart();
  } catch (error) {
    if (request !== groupsRequest) return;
    clearLiveGroup(); $('#newInvite').hidden = true;
    $('#groupMessage').textContent = groupError(error);
  }
}
async function createGroupInvitation() {
  const button = $('#inviteFriend'); button.disabled = true;
  await groupOperation(async () => {
    const invite = await convexAction('sleepGroups:createInvite', {groupId: activeGroupId});
    const link = new URL(location.pathname, location.origin); link.searchParams.set('view', 'groups'); link.hash = `invite=${invite.token}`;
    $('#inviteLink').value = link.toString();
    $('#newInvite').hidden = false; $('#copyInviteStatus').textContent = '';
    await refreshLiveGroup();
    $('#inviteLink').focus(); $('#inviteLink').select();
  });
  button.disabled = false;
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
  $('#groupEmptyState').hidden = true;
  $('#newInvite').hidden = true;
  $('#groupsPreviewBadge').hidden = false;
}
