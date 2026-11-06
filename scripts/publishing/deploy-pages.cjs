// Use the official Pages API, allowing time for its server-side deployment queue.
module.exports = async function publish({ github, context, core, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, timeout = 30 * 60 * 1000 }) {
  const repo = context.repo;
  const artifacts = await github.rest.actions.listWorkflowRunArtifacts({ ...repo, run_id: context.runId, headers: { 'cache-control': 'no-cache' }, cache_check: now() });
  const artifact = artifacts.data.artifacts
    .filter(item => item.name === 'github-pages' && !item.expired)
    .sort((a, b) => b.id - a.id)[0];
  if (!artifact) throw new Error('The current run has no deployable Pages artifact.');
  core.info(`Publishing current artifact ${artifact.id}`);
  const oidcToken = await core.getIDToken();
  const response = await github.request('POST /repos/{owner}/{repo}/pages/deployments', {
    ...repo, artifact_id: artifact.id, pages_build_version: context.sha, oidc_token: oidcToken,
  });
  const deploymentId = response.data.id;
  if (!deploymentId) throw new Error('GitHub did not return a deployment ID.');
  core.setOutput('page_url', response.data.page_url);
  core.info(`Waiting for Pages deployment ${deploymentId}`);
  const start = now();
  let previous;
  let failures = 0;
  const terminal = new Set(['deployment_failed', 'deployment_content_failed', 'deployment_cancelled', 'deployment_lost']);
  while (now() - start < timeout) {
    await sleep(15000);
    let status;
    try {
      const result = await github.request('GET /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}', { ...repo, pages_deployment_id: deploymentId, headers: { 'cache-control': 'no-cache' }, cache_check: now() });
      status = result.data.status;
      failures = 0;
    } catch (error) {
      if (++failures >= 10) throw new Error('Unable to read Pages status. Check the deployment before starting another release.');
      core.warning('Temporary Pages status request failure; retrying.');
      continue;
    }
    if (status !== previous) { core.info(`Pages: ${status || 'awaiting status'}`); previous = status; }
    if (status === 'succeed') { core.setOutput('status', 'succeed'); return; }
    if (terminal.has(status)) throw new Error(`Pages reported ${status}.`);
  }
  // Keep a pending server-side publish recoverable instead of cancelling its file copy.
  throw new Error(`Pages is still pending after 30 minutes: ${deploymentId}. Inspect its status before retrying.`);
};
