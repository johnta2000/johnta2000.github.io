(function (root, factory) {
  const routes = factory();
  if (typeof module === 'object' && module.exports) module.exports = routes;
  else root.LaunchRoutes = routes;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const steps = ['choose', 'prepare', 'distribute', 'followup'];
  const media = ['all', 'selected', 'facebook', 'reddit', 'email', 'tiktok', 'instagram', 'threads', 'linkedin', 'website', 'other'];
  const statuses = ['active', 'complete', 'archived'];
  const validKey = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
  function parse(search) {
    const params = new URLSearchParams(search);
    const route = { view: params.get('view') === 'launches' ? 'launches' : 'channels', launchKey: null, step: steps.includes(params.get('step')) ? params.get('step') : 'choose', medium: media.includes(params.get('medium')) ? params.get('medium') : 'facebook', status: statuses.includes(params.get('status')) ? params.get('status') : 'active', archived: params.get('archived') === '1', editor: null, error: null };
    const key = (name, label) => {
      if (!params.has(name)) return null;
      if (validKey(params.get(name))) return params.get(name);
      route.error ||= label; return null;
    };
    if (params.has('launch')) { route.view = 'launches'; route.launchKey = key('launch', 'Launch'); }
    const edit = params.get('edit');
    if (edit === 'new-channel') route.editor = { type: 'new-channel' };
    else if (params.has('channel')) route.editor = { type: 'channel', key: key('channel', 'Channel') };
    else if (route.launchKey) {
      if (['launch', 'material', 'actions'].includes(edit)) route.editor = { type: edit };
      else if (params.has('task')) { route.editor = { type: 'task', key: key('task', 'Task') }; route.step = 'distribute'; }
      else if (params.has('check')) route.editor = { type: 'check', key: key('check', 'Checklist item') };
      else if (params.has('guidance')) { route.editor = { type: 'guidance', key: key('guidance', 'Channel') }; route.step = 'choose'; }
    }
    return route;
  }
  function serialize(route) {
    const params = new URLSearchParams();
    const launch = validKey(route.launchKey);
    if (launch) { params.set('launch', route.launchKey); params.set('step', steps.includes(route.step) ? route.step : 'choose'); }
    else { params.set('view', route.view === 'launches' ? 'launches' : 'channels'); if (route.view === 'launches' && statuses.includes(route.status) && route.status !== 'active') params.set('status', route.status); }
    if ((launch && route.step === 'choose') || (!launch && route.view !== 'launches')) {
      if (media.includes(route.medium) && route.medium !== 'facebook') params.set('medium', route.medium);
      if (!launch && route.archived) params.set('archived', '1');
    }
    const editor = route.editor;
    if (editor?.type === 'new-channel') params.set('edit', 'new-channel');
    else if (editor?.type === 'channel' && validKey(editor.key)) params.set('channel', editor.key);
    else if (launch && editor) {
      if (['launch', 'material', 'actions'].includes(editor.type)) params.set('edit', editor.type);
      else if (['task', 'check', 'guidance'].includes(editor.type) && validKey(editor.key)) params.set(editor.type, editor.key);
    }
    return '?' + params.toString();
  }
  return { parse, serialize };
});
