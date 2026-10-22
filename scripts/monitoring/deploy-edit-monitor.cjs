// Narrow live-backend patch. Credentials stay in memory; dry-run by default.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const version = require(path.join(root, 'node_modules/convex/package.json')).version;
(async () => {
  const credential = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.convex/config.json'), 'utf8'));
  const response = await fetch('https://api.convex.dev/api/deployment/authorize_within_current_project', {
    method: 'POST', headers: { Authorization: `Bearer ${credential.accessToken}`, 'Content-Type': 'application/json', 'Convex-Client': `npm-cli-${version}` },
    body: JSON.stringify({ selectedDeploymentName: 'rapid-shark-565', projectSelection: { kind: 'deploymentName', deploymentName: 'rapid-shark-565' } }),
  });
  assert(response.ok, 'Backend authorization failed');
  const auth = await response.json();
  assert.equal(auth.url, 'https://rapid-shark-565.convex.cloud');
  async function pull(endpoint = 'get_config') {
    const res = await fetch(`${auth.url}/api/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version, adminKey: auth.adminKey }) });
    assert(res.ok, 'Cannot snapshot live backend'); return res.json();
  }
  const before = await pull(), hashes = await pull('get_config_hashes');
  const monitor = before.modules.find(m => m.path === 'monitoring.js');
  assert(monitor, 'Missing live monitoring module');
  const marker = 'var EXTERNAL_MONITORS = {';
  assert(monitor.source.includes(marker), 'Unexpected live monitor registry; refusing blind patch');
  assert(!monitor.source.includes('"edit-hotels-ranking"'), 'Monitor already registered; no patch needed');
  const patched = monitor.source.replace(marker, marker + `\n  "edit-hotels-ranking": {
    name: "Cheapest Edit Hotels · keyword bundle",
    description: "Tracks exact-query performance, related Edit searches, and original versus Select Hotels URL visibility. US Search Console data, not a live Google rank tracker.",
    cadence: "Every 6 hours via Codex",
    defaultSource: "https://www.nextcard.com/articles/cheapest-edit-hotels"
  },`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-monitor-deploy-'));
  fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module', dependencies: { convex: version } }));
  fs.writeFileSync(path.join(dir, 'convex.json'), JSON.stringify({ functions: 'convex/', ...(hashes.nodeVersion ? { node: { nodeVersion: hashes.nodeVersion } } : {}) }));
  // Keep isolate and Node dependency namespaces distinct while rebundling.
  const paths = new Map(before.modules.map(m => [`${m.environment}:${m.path}`, m.path.startsWith('_') ? `_editSnapshot/${m.environment}/${m.path}` : m.path]));
  for (const module of before.modules) {
    assert(!module.path.includes('..') && !path.isAbsolute(module.path));
    const file = paths.get(`${module.environment}:${module.path}`);
    const source = (module.path === 'monitoring.js' ? patched : module.source).replace(/(["'])(\.\.?\/[^"']+)\1/g, (literal, quote, specifier) => {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(module.path), specifier));
      const target = paths.get(`${module.environment}:${resolved}`);
      if (!target) return literal;
      let relative = path.posix.relative(path.posix.dirname(file), target);
      if (!relative.startsWith('.')) relative = './' + relative;
      return quote + relative + quote;
    });
    const dest = path.join(dir, 'convex', file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, (module.environment === 'node' ? '"use node";\n' : '') + source);
  }
  assert.deepEqual(await pull(), before, 'Backend changed during preparation; retry from a fresh snapshot');
  console.log(`Preserving ${before.modules.length} live modules, schema, and routes; adding one monitor registry entry.`);
  const publish = process.argv.includes('--publish');
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/convex/bin/main.js'), 'deploy', '--yes', '--typecheck', 'disable', '--codegen', 'disable', ...(publish ? [] : ['--dry-run'])], {
    cwd: dir, env: { ...process.env, CONVEX_SELF_HOSTED_URL: auth.url, CONVEX_SELF_HOSTED_ADMIN_KEY: auth.adminKey }, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(dir, 'deploy.log'), result.stdout + '\n' + result.stderr);
  console.log((result.stdout + '\n' + result.stderr).slice(-4500));
  assert.equal(result.status, 0, `Deployment failed; diagnostics: ${dir}/deploy.log`);
  if (publish) {
    const after = await pull();
    assert(after.modules.find(m => m.path === 'monitoring.js')?.source.includes('"edit-hotels-ranking"'));
    const originalFunctions = before.modules.filter(m => !m.path.startsWith('_')).map(m => m.path);
    for (const name of originalFunctions) assert(after.modules.some(m => m.path === name), `Missing original module: ${name}`);
    console.log('Live monitor registry verified; all original entry modules preserved.');
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
