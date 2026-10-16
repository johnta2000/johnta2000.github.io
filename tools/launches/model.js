(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.LaunchModel = model;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const types = { news: 'Quick news', targeted: 'Targeted update', tool: 'Tool update', flagship: 'Major launch' };
  const kinds = { facebook: 'Facebook', reddit: 'Reddit', outreach: 'Editorial outreach', owned: 'Owned channel' };
  const statusLabels = { draft: 'To draft', ready: 'Ready', submitted: 'Submitted', waiting: 'Awaiting approval', live: 'Live', sent: 'Sent', skipped: 'Skipped' };
  const uid = () => crypto.randomUUID();
  const tags = value => [...new Set(String(value).split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  const safeUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } };
  const done = task => ['live', 'sent', 'skipped'].includes(task.status);
  function newLaunch(owner = '') {
    return { name: 'Untitled launch', sourceUrl: '', summary: '', type: 'news', tags: [], owner, dueDate: '', status: 'active', materials: [], tasks: [], notes: '', checks: [
      { id: uid(), stage: 'prepare', label: 'Verify the source, dates, eligibility, and key facts', done: false, owner: '' },
      { id: uid(), stage: 'prepare', label: 'Check whether existing NextCard content or tools need an update', done: false, owner: '' },
      { id: uid(), stage: 'prepare', label: 'Gather the key takeaway, useful visuals, and supporting links', done: false, owner: '' },
      { id: uid(), stage: 'followup', label: 'Check pending submissions and reply to questions', done: false, owner: '' },
      { id: uid(), stage: 'followup', label: 'Record results and lessons for the next launch', done: false, owner: '' },
    ] };
  }
  function newChannel() {
    return { name: '', url: '', kind: 'facebook', tags: [], fit: '', rules: '', ruleStatus: 'unverified', verifiedDate: '', linkPolicy: 'unknown', approval: 'unknown', relationship: '', notes: '', archived: false };
  }
  function duplicate(value) {
    const result = structuredClone(value);
    result.name = `${value.name.slice(0, 140)} — copy`; result.status = 'active'; result.dueDate = ''; result.notes = '';
    result.materials = result.materials.map(item => ({ ...item, id: uid() }));
    result.checks = result.checks.map(item => ({ ...item, id: uid(), done: false }));
    result.tasks = result.tasks.map(task => ({ ...task, id: uid(), status: 'draft', draft: '', dueDate: '', liveUrl: '', outcome: '', activityAt: 0 }));
    return result;
  }
  function progress(launch) {
    const complete = launch.checks.filter(check => check.done).length + launch.tasks.filter(done).length;
    return { complete, total: launch.checks.length + launch.tasks.length };
  }
  function suggestion(channel, launch, now = Date.now()) {
    const matched = channel.tags.filter(tag => launch.tags.includes(tag) && !['general', 'points', 'travel', 'video', 'credit cards', 'hotels'].includes(tag));
    const rulesCurrent = channel.ruleStatus === 'verified' && channel.verifiedDate && now - Date.parse(channel.verifiedDate) < 90 * 86400000;
    if (channel.archived) return { group: 'skip', label: 'Archived', reason: 'This destination is archived.' };
    if (channel.kind === 'owned') {
      const product = /website|existing tool|r\/nextcard/i.test(channel.name);
      if (product && ['tool', 'flagship'].includes(launch.type)) return { group: 'recommended', label: 'Suggested', reason: 'A natural home for a meaningful NextCard product update.' };
      if (product) return { group: 'maybe', label: 'Consider', reason: 'Use when the story has a meaningful NextCard product connection.' };
      if (/linkedin/i.test(channel.name) && launch.type !== 'flagship' && !launch.tags.includes('original research')) return { group: 'maybe', label: 'Consider', reason: 'Best for substantive research or a significant product story.' };
      return { group: 'recommended', label: 'Suggested', reason: 'Adapt the takeaway for your existing audience.' };
    }
    if (channel.kind === 'outreach') return { group: 'maybe', label: 'Consider', reason: 'Pitch only if you have a distinct news tip, useful tool, or original finding.' };
    if (matched.length) return { group: rulesCurrent ? 'recommended' : 'maybe', label: rulesCurrent ? 'Suggested' : 'Check fit & rules', reason: `Audience match: ${matched.join(', ')}.${rulesCurrent ? ' Tailor the post to these members.' : ' Confirm current posting rules first.'}` };
    if (!launch.tags.length) return { group: 'maybe', label: 'Add audience tags', reason: 'Add audience tags above to find matching communities.' };
    if (channel.tags.includes('general')) return { group: 'maybe', label: 'Consider', reason: 'Broad points audience. Select only if the story has clear value for these members.' };
    return { group: 'skip', label: 'No tag match', reason: 'No matching audience tags. You can still select it if there is a specific connection.' };
  }
  function addTask(channel, owner = '') {
    return { id: uid(), channelKey: channel.key, channelName: channel.value.name, channelKind: channel.value.kind, angle: '', draft: '', owner, dueDate: '', status: 'draft', liveUrl: '', outcome: '', activityAt: 0 };
  }
  function history(channelKey, launches, excluding = '') {
    return launches.filter(launch => launch.key !== excluding).flatMap(launch => launch.value.tasks.filter(task => task.channelKey === channelKey && task.activityAt > 0).map(task => ({ task, launch: launch.value.name, launchKey: launch.key }))).sort((a, b) => b.task.activityAt - a.task.activityAt);
  }
  function ticket(launch) {
    const lines = [`${launch.name}`, '', launch.summary, launch.sourceUrl ? `Source: ${launch.sourceUrl}` : '', '', 'Preparation', ...launch.checks.filter(check => check.stage === 'prepare').map(check => `- [${check.done ? 'x' : ' '}] ${check.label}`), '', 'Channel deliverables', ...launch.tasks.filter(task => task.status !== 'skipped').map(task => `- [${done(task) ? 'x' : ' '}] ${task.channelName}: ${task.angle || (task.channelKind === 'outreach' ? 'Prepare a tailored news pitch' : 'Prepare a useful native post')}${task.owner ? ` (${task.owner})` : ''}`), '', 'Follow-up', ...launch.checks.filter(check => check.stage === 'followup').map(check => `- [${check.done ? 'x' : ' '}] ${check.label}`)];
    return lines.filter((line, index) => line || lines[index - 1]).join('\n');
  }
  return { uid, tags, safeUrl, types, kinds, statusLabels, done, newLaunch, newChannel, duplicate, progress, suggestion, addTask, history, ticket };
});
