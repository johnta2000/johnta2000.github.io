export function locationFix(value: any, now: number) {
  const {latitude, longitude, accuracy, observedAt} = value || {};
  if (![latitude, longitude, accuracy, observedAt].every(Number.isFinite) || Math.abs(latitude)>90 || Math.abs(longitude)>180 || accuracy<0 || accuracy>100000 || observedAt>now+10000 || observedAt<now-120000) throw new Error('A recent valid GPS fix is required.');
  return {latitude, longitude, accuracy, observedAt:Math.min(now,observedAt)};
}
