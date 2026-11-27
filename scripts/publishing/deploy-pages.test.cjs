const assert = require('node:assert/strict');
const { test } = require('node:test');
const publish = require('./deploy-pages.cjs');

function simulate(statuses, { timeout } = {}) {
  const submissions = [];
  const outputs = {};
  const warnings = [];
  const polls = [];
  let elapsed = 0;
  let tokens = 0;

  const result = publish({
    artifactId: 123,
    context: { repo: { owner: 'owner', repo: 'site' }, sha: 'built-commit' },
    core: {
      info() {},
      warning(message) { warnings.push(message); },
      getIDToken: async () => `token-${++tokens}`,
      setOutput(name, value) { outputs[name] = value; },
    },
    github: {
      async request(route, params) {
        if (route.startsWith('POST ')) {
          submissions.push({ ...params, at: elapsed });
          return { data: { id: `deployment-${submissions.length}`, page_url: 'https://example.com/' } };
        }
        polls.push(params.pages_deployment_id);
        return { data: { status: statuses.shift() } };
      },
    },
    now: () => elapsed,
    sleep: async ms => { elapsed += ms; },
    timeout,
  });
  return { result, submissions, outputs, warnings, polls };
}

test('resubmits the same commit and artifact once after a confirmed Pages failure', async () => {
  const run = simulate(['deployment_failed', 'succeed']);
  await run.result;
  assert.deepEqual(run.submissions.map(({ artifact_id, pages_build_version, oidc_token, at }) =>
    [artifact_id, pages_build_version, oidc_token, at]), [
    [123, 'built-commit', 'token-1', 0],
    [123, 'built-commit', 'token-2', 45_000],
  ]);
  assert.deepEqual(run.polls, ['deployment-1', 'deployment-2']);
  assert.equal(run.warnings.length, 1);
  assert.deepEqual(run.outputs, { page_url: 'https://example.com/', status: 'succeed' });
});

test('ordinary success submits once', async () => {
  const run = simulate(['deployment_attempt_error', 'succeed']);
  await run.result;
  assert.equal(run.submissions.length, 1);
  assert.equal(run.warnings.length, 0);
  assert.equal(run.outputs.status, 'succeed');
});

test('persistent and non-retryable failures stay visible', async () => {
  const repeated = simulate(['deployment_failed', 'deployment_failed']);
  await assert.rejects(repeated.result, /deployment_failed for deployment-2/);
  assert.equal(repeated.submissions.length, 2);
  assert.deepEqual(repeated.outputs, {});

  for (const status of ['deployment_content_failed', 'deployment_cancelled', 'deployment_lost']) {
    const run = simulate([status]);
    await assert.rejects(run.result, new RegExp(status));
    assert.equal(run.submissions.length, 1);
  }
});

test('does not resubmit a deployment that may still be in progress', async () => {
  const run = simulate(['deployment_attempt_error'], { timeout: 15_000 });
  await assert.rejects(run.result, /did not report a final status/);
  assert.equal(run.submissions.length, 1);
});
