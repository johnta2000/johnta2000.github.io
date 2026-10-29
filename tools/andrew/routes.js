/* URLs contain navigation state only; records and form contents stay behind sign-in. */
(function(root){
'use strict';
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)?value:'';
function parse(search){const p=new URLSearchParams(search);const view=['articles','updates','social'].includes(p.get('view'))?p.get('view'):'articles';const allowed=view==='articles'?['all','scheduled','demand']:view==='updates'?['all','batch1','batch2']:['all'];const filter=allowed.includes(p.get('filter'))?p.get('filter'):'all';return {view,filter,q:view==='social'?'':(p.get('q')||'').slice(0,200),edit:id(p.get('edit')),create:['account','checkin'].includes(p.get('new'))?p.get('new'):'',account:id(p.get('account')),history:view==='social'?[...new Set((p.get('history')||'').split(',').map(id).filter(Boolean))].slice(0,100):[],archived:view==='social'&&p.get('archived')==='1'};}
function stringify(route){const p=new URLSearchParams({view:route.view});if(route.filter&&route.filter!=='all')p.set('filter',route.filter);if(route.q)p.set('q',route.q);if(route.edit)p.set('edit',route.edit);else if(route.create){p.set('new',route.create);if(route.create==='checkin'&&route.account)p.set('account',route.account);}if(route.history?.length)p.set('history',route.history.join(','));if(route.archived)p.set('archived','1');return '?'+p.toString();}
function url(route){return stringify(parse(stringify(route)));}
const api={parse,url};if(typeof module==='object'&&module.exports)module.exports=api;else root.MissionRoutes=api;
})(typeof window==='object'?window:globalThis);
