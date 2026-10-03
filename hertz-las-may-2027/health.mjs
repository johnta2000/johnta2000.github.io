export function getMonitorHealth(runs, now = Date.now(), criteriaVersion = 2) {
  const scoped = runs.filter(run => run.criteriaVersion === criteriaVersion).sort((a,b) => Date.parse(b.checkedAt)-Date.parse(a.checkedAt));
  const latestAttempt = scoped[0] ?? null;
  const latestSuccess = scoped.find(run => run.status === 'success' && Number.isFinite(run.lowestVisibleDailyRateUsd)) ?? null;
  const ageHours = latestSuccess ? (now - Date.parse(latestSuccess.checkedAt)) / 3_600_000 : Infinity;
  const failureStreak = scoped.findIndex(run => run === latestSuccess);
  const stale = !Number.isFinite(ageHours) || ageHours > 36 || ageHours < -1 / 60;
  return { latestAttempt, latestSuccess, ageHours, stale, failureStreak: failureStreak < 0 ? scoped.length : failureStreak,
    status: stale ? 'stale' : latestAttempt?.status === 'success' ? 'fresh' : 'unavailable' };
}
