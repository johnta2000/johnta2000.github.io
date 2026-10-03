import { getMonitorHealth } from '../../hertz-las-may-2027/health.mjs';
const response = await fetch(`https://www.john-ta.com/hertz-las-may-2027/history.json?health=${Date.now()}`, { signal: AbortSignal.timeout(30_000), cache: 'no-store' });
if (!response.ok) throw new Error(`Public history is unavailable (${response.status})`);
const history = await response.json();
const health = getMonitorHealth(history.runs, Date.now(), history.criteriaVersion);
console.log(JSON.stringify({ status: health.status, latestAttempt: health.latestAttempt?.checkedAt, latestSuccess: health.latestSuccess?.checkedAt, failureStreak: health.failureStreak }));
if (health.status !== 'fresh') throw new Error(`Hertz refresh needs attention: ${health.status}; last verified price ${health.latestSuccess?.checkedAt || 'never'}. Open the local browser refresh task.`);
