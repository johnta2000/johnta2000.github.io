const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/analytics.js', 'utf8');
function setup(host = 'www.john-ta.com', app = 'rally') {
  let config, script, click;
  const captures = [];
  const window = { location: { hostname: host, origin: `https://${host}` }, posthog: {
    init: (token, options) => config = options,
    capture: (...args) => captures.push(args),
  } };
  const document = { currentScript: { dataset: { app } }, createElement: () => ({}),
    head: { appendChild: (node) => script = node }, addEventListener: (_, fn) => click = fn };
  const context = { window, document, URL };
  vm.runInNewContext(source, context);
  script?.onload();
  return { config, script, context, captures, click };
}
test('development and native bundled pages never load telemetry', () => {
  for (const host of ['localhost', '127.0.0.1', '', 'evil-john-ta.com']) assert.equal(setup(host).script, undefined);
});
test('anonymous configuration disables replay, forms, console logs, and profiles', () => {
  const { config } = setup();
  assert.equal(config.cookieless_mode, 'always');
  assert.equal(config.person_profiles, 'never');
  assert.equal(config.autocapture, false);
  assert.equal(config.disable_session_recording, true);
  assert.equal(config.capture_exceptions.capture_console_errors, false);
});
test('tokens, private URLs, identity, and arbitrary payloads are removed', () => {
  const { config } = setup('www.john-ta.com', 'tranquil-connect');
  const event = config.before_send({ event: '$pageview', properties: {
    '$current_url': 'https://www.john-ta.com/tools/tranquil-connect/?code=SECRET#TOKEN',
    '$referrer': 'https://example.com/private/person?email=PRIVATE#secret',
    '$title': 'Private person name', '$session_id': 'session123', '$cookieless_mode': true,
    '$set': { email: 'PRIVATE' }, email: 'PRIVATE', '$initial_utm_source': 'SECRET',
  } });
  assert.equal(event.properties.$current_url, 'https://www.john-ta.com/tools/tranquil-connect/');
  assert.equal(event.properties.$referrer, 'https://example.com/');
  assert.equal(event.properties.$session_id, 'session123');
  assert.equal(event.properties.$cookieless_mode, true);
  assert.equal(event.properties.app, 'tranquil-connect');
  assert.doesNotMatch(JSON.stringify(event), /SECRET|TOKEN|PRIVATE|Private person/);
  assert.equal(config.before_send({event: '$snapshot', properties: {}}), null);
});
test('error payloads preserve source locations but omit messages and context', () => {
  const { config } = setup();
  const event = config.before_send({ event: '$exception', properties: { '$exception_list': [{
    type: 'TypeError', value: 'Password SECRET failed', stacktrace: {frames: [{
      filename: 'https://www.john-ta.com/tools/rally/app.js?token=SECRET',
      function: 'render', lineno: 42, colno: 10, vars: { email: 'PRIVATE' }, context_line: 'SECRET',
    }]},
  }] } });
  assert.doesNotMatch(JSON.stringify(event), /SECRET|PRIVATE/);
  assert.equal(event.properties.$exception_list[0].stacktrace.frames[0].lineno, 42);
  for (let i = 0; i < 9; i++) assert.ok(config.before_send({event:'$exception'}));
  assert.equal(config.before_send({event:'$exception'}), null);
});
test('interaction capture ignores labels, values, and dynamic links', () => {
  const { click, captures } = setup();
  click({ target: { closest: () => ({tagName:'BUTTON', dataset:{}, textContent:'PRIVATE', value:'SECRET'}) } });
  assert.equal(captures[0][0], 'ui_interaction');
  assert.doesNotMatch(JSON.stringify(captures), /PRIVATE|SECRET/);
});
test('all published HTML pages have exactly one correctly named analytics script', () => {
  const manifest = JSON.parse(fs.readFileSync('scripts/monitoring/site-pages.json'));
  const tracked = require('node:child_process').execFileSync('git', ['ls-files', '*.html'], {encoding:'utf8'}).trim().split('\n');
  assert.deepEqual(manifest.map(x=>x.file).sort(), tracked.sort());
  for (const page of manifest) {
    const html = fs.readFileSync(page.file,'utf8');
    assert.equal(html.match(/src="\/assets\/js\/analytics.js"/g)?.length, 1, page.file);
    assert.ok(html.includes(`data-app="${page.app}"`),page.file);
  }
});
