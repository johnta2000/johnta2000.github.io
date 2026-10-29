import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { brotliCompressSync } from 'node:zlib';
import vm from 'node:vm';
const root = new URL('../../', import.meta.url).pathname;
// Resolve spaces in local project paths.
const projectRoot = decodeURIComponent(root);
const require = createRequire(projectRoot + '/package.json');
const { build } = require('esbuild'), { ConvexHttpClient } = require('convex/browser');
const mode = process.argv[2] || 'dry-run';
if (!['dry-run', 'deploy', 'verify'].includes(mode)) throw Error('Unsupported release mode.');
const account = JSON.parse(readFileSync('/Users/johnta/.convex/config.json', 'utf8'));
const authorization = await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project', { method: 'POST', headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', 'Convex-Client': 'npm-cli-1.41.0' }, body: JSON.stringify({ selectedDeploymentName: 'rapid-shark-565', projectSelection: { kind: 'deploymentName', deploymentName: 'rapid-shark-565' } }), signal: AbortSignal.timeout(30000) });
if (!authorization.ok) throw Error('Backend authorization failed: ' + authorization.status);
const credentials = await authorization.json();
if (credentials.url !== 'https://rapid-shark-565.convex.cloud' || !credentials.adminKey) throw Error('Unexpected deployment.');
async function request(path, body, compressed = false) {
  const encoded = JSON.stringify(body);
  const r = await fetch(credentials.url + path, { method: 'POST', headers: { Authorization: `Convex ${credentials.adminKey}`, 'Content-Type': 'application/json', ...(compressed ? { 'Content-Encoding': 'br' } : {}) }, body: compressed ? brotliCompressSync(encoded) : encoded, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw Error(path + ': ' + r.status + ' ' + (await r.text()).slice(0, 500));
  const text = await r.text(); return text ? JSON.parse(text) : {};
}
const metadata = () => request('/api/get_config_hashes', { adminKey: credentials.adminKey, version: '1.41.0' });
const stable = x => Array.isArray(x) ? x.map(stable) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])])) : x;
const canonical = x => JSON.stringify(stable(x));
const hash = m => createHash('sha256').update(m.source).update(m.sourceMap || '').digest('hex');
function normalize(schema) { const x = structuredClone(schema); for (const t of x.tables) { if (t.stagedDocumentType === null) delete t.stagedDocumentType; for (const i of t.indexes || []) i.fields = i.fields.filter(f => f !== '_creationTime'); } return x; }
const client = new ConvexHttpClient(credentials.url); client.setAdminAuth(credentials.adminKey);
const before = await metadata(), beforeSchema = normalize(JSON.parse((await client.query('_system/frontend/getSchemas', {})).active));
const ownBundle = await build({ absWorkingDir: projectRoot, entryPoints: ['convex/pdpApprovals.ts'], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'esnext' });
const ownModule = { path: 'pdpApprovals.js', source: ownBundle.outputFiles[0].text, environment: 'isolate' };
const sb = await build({ absWorkingDir: projectRoot, stdin: { contents: 'import {defineSchema} from "convex/server";import {pdpApprovalTables} from "./pdpApprovalTables";export default defineSchema(pdpApprovalTables);', resolveDir: projectRoot + '/convex', sourcefile: 'pdp-schema.ts' }, bundle: true, write: false, platform: 'node', format: 'cjs' });
const schemaModule = { exports: {} }; vm.runInNewContext(sb.outputFiles[0].text, { module: schemaModule, exports: schemaModule.exports, require });
const ownSchema = JSON.parse(schemaModule.exports.default.export()), merged = structuredClone(beforeSchema);
for (const table of ownSchema.tables) {
  const existing = merged.tables.find(t => t.tableName === table.tableName);
  const legacy=structuredClone(table);
  if(legacy.documentType?.value?.value?.fieldType?.value)delete legacy.documentType.value.value.fieldType.value.references;
  if(existing && canonical(existing)!==canonical(table) && canonical(existing)!==canonical(legacy))throw Error('Unexpected PDP schema change.');
  if(existing)merged.tables[merged.tables.indexOf(existing)]=table;else merged.tables.push(table);

}
const snapshot = await request('/api/get_config', { adminKey: credentials.adminKey, version: '1.41.0' });
const definition = snapshot.modules?.find(m => m.path === 'convex.config.js');
if (!definition || hash(definition) !== before.moduleHashes.find(m => m.path === definition.path)?.hash) throw Error('Could not verify current app definition.');
const baseHttp=snapshot.modules.find(m=>m.path==='pdpApprovalBaseHttp.js') || {...snapshot.modules.find(m=>m.path==='http.js'),path:'pdpApprovalBaseHttp.js'};
if(!baseHttp.source)throw Error('Live HTTP module is missing.');
const httpBundle=await build({absWorkingDir:projectRoot,stdin:{contents:"import http from './pdpApprovalBaseHttp.js';import {file,preflight} from './pdpApprovalFileHttp';for(const method of ['GET','OPTIONS'])http.exactRoutes.get('/pdp-approval-file')?.delete(method);http.route({path:'/pdp-approval-file',method:'GET',handler:file});http.route({path:'/pdp-approval-file',method:'OPTIONS',handler:preflight});export default http;",resolveDir:projectRoot+'/convex',sourcefile:'http.ts'},bundle:true,write:false,platform:'browser',format:'esm',target:'esnext',external:['./pdpApprovalBaseHttp.js']});
const httpModule={path:'http.js',source:httpBundle.outputFiles[0].text,environment:'isolate'};
const changedModules=[ownModule,httpModule,baseHttp];
const changedPaths=new Set(changedModules.map(m=>m.path));
const beforeSpec = await client.query('_system/cli/modules:apiSpec', {});
const members = [{email:'john@affil.ai'}, {email:'johnta2018@gmail.com'}];
if (mode !== 'verify') {
  const dryRun = mode === 'dry-run';
  const push = { adminKey: credentials.adminKey, dryRun, functions: before.config.functions, appDefinition: { definition, dependencies: [], schema: { path: 'schema.js', source: `const active=${JSON.stringify(JSON.stringify(merged))};\nexport default {export(){return active;}};\n`, environment: 'isolate' }, changedModules, unchangedModuleHashes: before.moduleHashes.filter(m => !changedPaths.has(m.path) && ![definition.path,'schema.js'].includes(m.path)).map(m => ({ path: m.path, environment: m.environment, sha256: m.hash })), udfServerVersion: before.udfServerVersion }, componentDefinitions: [], nodeDependencies: before.nodeDependencies || [], ...(before.nodeVersion ? { nodeVersion: before.nodeVersion } : {}) };
  console.log(JSON.stringify({ mode, changedModules: [...changedPaths], retainedModules: push.appDefinition.unchangedModuleHashes.length, changedTables: ownSchema.tables.map(t=>t.tableName) }));
  const start = await request('/api/deploy2/start_push', push, true);
  let state; do { state = await request('/api/deploy2/wait_for_schema', { adminKey: credentials.adminKey, schemaChange: start.schemaChange, timeoutMs: 10000, dryRun }); if (!['inProgress','complete'].includes(state.type)) throw Error('Schema validation failed.'); } while (state.type === 'inProgress');
  // New indexes are limited to the two new PDP tables by the exact merged-schema check.
  if (canonical((await metadata()).moduleHashes) !== canonical(before.moduleHashes)) throw Error('Concurrent backend change; do not finish.');
  const result = await request('/api/deploy2/finish_push', { adminKey: credentials.adminKey, startPush: start, dryRun, message: 'Add device-specific PDP references and authenticated private PDF access; preserve existing services' }, true);
  if ((result.authDiff?.added || []).length || (result.authDiff?.removed || []).length) throw Error('Unexpected auth change.');
  for (const [component, diff] of Object.entries(result.componentDiffs || {})) {
    if (component !== '') throw Error('Unexpected component change.');
    if ((diff.moduleDiff?.removed || []).length || (diff.moduleDiff?.added || []).some(p => !changedPaths.has(typeof p === 'string' ? p : p.path))) throw Error('Unexpected module change.');
    for (const d of [diff.cronDiff]) if (Object.values(d || {}).some(v => Array.isArray(v) && v.length)) throw Error('Unexpected index or cron change.');
  }
  console.log(JSON.stringify({ mode, schemaValidation: state.type, authPreserved: true, existingServicesPreserved: true }));
  if (dryRun) process.exit(0);
}
const after = await metadata(), afterMap = new Map(after.moduleHashes.map(m => [m.path, m]));
for (const item of before.moduleHashes) if (!changedPaths.has(item.path) && item.path!=='schema.js' && canonical(afterMap.get(item.path)) !== canonical(item)) throw Error('An unrelated backend module changed: ' + item.path);
for(const module of changedModules)if(afterMap.get(module.path)?.hash!==hash(module))throw Error('Published module differs: '+module.path);
const actualSchema = normalize(JSON.parse((await client.query('_system/frontend/getSchemas', {})).active));
if (canonical({...merged,tables:[...merged.tables].sort((a,b)=>a.tableName.localeCompare(b.tableName))}) !== canonical({...actualSchema,tables:[...actualSchema.tables].sort((a,b)=>a.tableName.localeCompare(b.tableName))})) throw Error('Published schema differs from the preserved schema.');
const afterSpec = new Set((await client.query('_system/cli/modules:apiSpec', {})).map(canonical));
for (const endpoint of beforeSpec) if (!JSON.stringify(endpoint).includes('pdpApprovals') && !afterSpec.has(canonical(endpoint))) throw Error('An unrelated endpoint changed.');

for (const member of members) { client.setAdminAuth(credentials.adminKey, { subject: 'pdp-access-verification', issuer: 'https://clerk.john-ta.com', email: member.email, emailVerified: true, tokenIdentifier: 'https://clerk.john-ta.com|pdp-access-verification' }); if ((await client.query('pdpApprovals:verify', {})).email !== member.email) throw Error('A configured account could not verify access.'); }
const anon = new ConvexHttpClient(credentials.url, { logger: false });
try { await anon.query('pdpApprovals:workspace', {}); throw Error('Signed-out read permitted.'); } catch (e) { if (!/not authorized/.test(e.message)) throw e; }
console.log(JSON.stringify({ verified: true, approvedAccounts: members.length, signedOutDenied: true, otherBackendServicesPreserved: true, tables: ownSchema.tables.map(t=>t.tableName) }));
