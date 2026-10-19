const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/analytics.js', 'utf8');
function setup(host = 'www.john-ta.com', app = 'rally', load = true) {
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
  if (load) script?.onload();
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
    '$title': 'Private person name', '$session_id': 'session123', '$cookieless_mode': true, '$raw_user_agent': 'Mozilla/5.0',
    '$set': { email: 'PRIVATE' }, email: 'PRIVATE', '$initial_utm_source': 'SECRET',
  } });
  assert.equal(event.properties.$current_url, 'https://www.john-ta.com/tools/tranquil-connect/');
  assert.equal(event.properties.$referrer, 'https://example.com/');
  assert.equal(event.properties.$session_id, 'session123');
  assert.equal(event.properties.$cookieless_mode, true);
  assert.equal(event.properties.$raw_user_agent, 'Mozilla/5.0');
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
test('all published HTML pages declare their analytics policy and page identity', () => {
  const manifest = JSON.parse(fs.readFileSync('scripts/monitoring/site-pages.json'));
  const tracked = require('node:child_process').execFileSync('git', ['ls-files', '*.html'], {encoding:'utf8'}).trim().split('\n');
  assert.deepEqual(manifest.map(x=>x.file).sort(), tracked.sort());
  for (const page of manifest) {
    const html = fs.readFileSync(page.file,'utf8');
    if (page.analytics === false) {
      assert.ok(page.title, `${page.file}: pages without analytics need an identifying title`);
      assert.ok(html.includes(`<title>${page.title}</title>`), page.file);
      assert.doesNotMatch(html, /<script\b[^>]*\bsrc=["'][^"']*\/assets\/js\/analytics\.js(?:[?"'])/i, page.file);
      continue;
    }
    assert.equal(html.match(/src="\/assets\/js\/analytics.js\?v=20261019-1"/g)?.length, 1, page.file);
    assert.ok(html.includes(`data-app="${page.app}"`),page.file);
  }
});

test('JSX goal events accept only fixed public dimensions and remain scoped to JSX', () => {
  const {config} = setup('www.john-ta.com','jsx');
  const clean=config.before_send({event:'jsx_referral_clicked',properties:{placement:'guide',control:'referral',filter_name:'origin',trip_type:'one_way',result_count:12,email:'PRIVATE',href:'SECRET',query:'PRIVATE'}});
  assert.equal(clean.properties.placement,'guide');assert.equal(clean.properties.control,'referral');
  assert.doesNotMatch(JSON.stringify(clean),/PRIVATE|SECRET/);
  const invalid=config.before_send({event:'jsx_filter_changed',properties:{placement:'PRIVATE',control:'SECRET',filter_name:'SECRET',result_count:-1,trip_type:'PRIVATE'}});
  assert.deepEqual(Object.keys(invalid.properties).sort(),['app','tracking_version']);
  assert.equal(setup().config.before_send({event:'jsx_referral_clicked',properties:{}}),null);
});
test('early events queue once and flush when the SDK becomes ready', () => {
  const {context,script,captures}=setup('www.john-ta.com','jsx',false);
  context.window.SiteAnalytics.capture('jsx_booking_clicked',{placement:'fare_table'});
  assert.equal(captures.length,0);script.onload();
  assert.equal(captures.length,1);assert.equal(captures[0][0],'jsx_booking_clicked');
  for(let i=0;i<100;i++) context.window.SiteAnalytics.capture('unapproved_event',{email:'PRIVATE'});
  assert.equal(captures.length,1);
});
test('tool entry clicks omit queries and refuse private or external destinations', () => {
  const {click,captures}=setup('www.john-ta.com','home');
  for(const href of ['https://www.john-ta.com/tools/jsx/?secret=PRIVATE','https://example.com/tools/jsx/','https://www.john-ta.com/tools/payment/questions/?secret=PRIVATE']) {
    click({target:{closest:()=>({tagName:'A',dataset:{},href})}});
  }
  assert.equal(captures[0][1].target_tool,'/tools/jsx/');
  assert.equal(captures[1][1].target_tool,undefined);assert.equal(captures[2][1].target_tool,undefined);
  assert.doesNotMatch(JSON.stringify(captures),/PRIVATE|secret/);
});
test('verification visits are explicitly marked and the startup queue is bounded', () => {
  let config, sdkScript, captures=[];
  const context={URL,window:{location:{hostname:'www.john-ta.com',origin:'https://www.john-ta.com',search:'?analytics_test=1'},posthog:{init:(_,value)=>config=value,capture:(event,properties)=>captures.push(config.before_send({event,properties}))}},document:{currentScript:{dataset:{app:'jsx'}},createElement:()=>({}),head:{appendChild:s=>sdkScript=s},addEventListener:()=>{}}};
  vm.runInNewContext(source,context);
  for(let i=0;i<100;i++)context.window.SiteAnalytics.capture('jsx_referral_clicked',{placement:'guide'});
  sdkScript.onload();assert.equal(captures.length,50);assert.ok(captures.every(e=>e.properties.is_test===true&&e.properties.tracking_version==='20261019-1'));
});
