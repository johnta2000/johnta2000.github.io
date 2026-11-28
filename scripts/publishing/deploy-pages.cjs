const pollInterval = 15_000;
const retryDelay = 30_000;
const terminalFailure = new Set([
  'deployment_failed', 'deployment_content_failed', 'deployment_cancelled', 'deployment_lost',
]);

async function waitForDeployment({ github, repo, core, sleep, now, deadline, deploymentId }) {
  let previous;
  let failures = 0;
  while (now() < deadline) {
    await sleep(Math.min(pollInterval, deadline - now()));
    let status;
    try {
      const result = await github.request('GET /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}', {
        ...repo, pages_deployment_id: deploymentId,
        headers: { 'cache-control': 'no-cache' }, cache_check: now(),
      });
      status = result.data.status;
      failures = 0;
    } catch (error) {
      if (++failures >= 10) throw new Error(`Unable to read Pages status for ${deploymentId}. Check the deployment before starting another release.`);
      core.warning('Temporary Pages status request failure; retrying.');
      continue;
    }
    if (status !== previous) { core.info(`Pages: ${status || 'awaiting status'}`); previous = status; }
    if (status === 'succeed' || terminalFailure.has(status)) return status;
  }
  // A timed-out poll does not establish whether Pages is still deploying.
  throw new Error(`Pages did not report a final status for ${deploymentId} before the deadline. Inspect its status before retrying.`);
}

module.exports = async function publish({
  github, context, core,
  artifactId = Number(process.env.PAGES_ARTIFACT_ID),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now,
  timeout = 30 * 60 * 1000,
}) {
  if (!Number.isSafeInteger(artifactId) || artifactId <= 0) throw new Error('The Pages upload did not return an artifact ID.');
  const { repo, sha } = context;
  const deadline = now() + timeout;
  for (let attempt = 1; attempt <= 2; attempt++) {
    core.info(`Publishing artifact ${artifactId} (attempt ${attempt} of 2)`);
    const oidcToken = await core.getIDToken();
    const { data } = await github.request('POST /repos/{owner}/{repo}/pages/deployments', {
      ...repo, artifact_id: artifactId, pages_build_version: sha, oidc_token: oidcToken,
    });
    const deploymentId = data.id;
    if (!deploymentId) throw new Error('GitHub did not return a deployment ID.');
    core.info(`Waiting for Pages deployment ${deploymentId}`);
    const status = await waitForDeployment({ github, repo, core, sleep, now, deadline, deploymentId });
    if (status === 'succeed') {
      core.setOutput('page_url', data.page_url);
      core.setOutput('status', status);
      return;
    }
    // Only resubmit after GitHub specifically reports a completed, generic deployment failure.
    if (status !== 'deployment_failed' || attempt === 2 || now() + retryDelay + pollInterval >= deadline) {
      throw new Error(`Pages reported ${status} for ${deploymentId} (attempt ${attempt} of 2).`);
    }
    core.warning(`Pages reported ${status} for ${deploymentId}. Retrying the same build once in 30 seconds.`);
    await sleep(retryDelay);
  }
};
