// Repository history remains complete. Only this run travels to Convex.
export function compactSnapshot(snapshot, monitorId) {
  const monitor = snapshot.state.monitors.find(item => item.id === monitorId);
  if (!monitor) throw new Error(`Snapshot is missing ${monitorId}.`);
  const history = monitorId === "paze-directory" ? snapshot.history : snapshot.monitorHistory?.[monitorId];
  const recent = history ? {...history, runs:(history.runs ?? []).slice(0, 1)} : {runs:[]};
  return {
    state:{...snapshot.state, monitors:[monitor]},
    history:monitorId === "paze-directory" ? recent : {runs:[]},
    baseline:monitorId === "paze-directory" ? snapshot.baseline : {},
    feed:{...snapshot.feed, events:(snapshot.feed.events ?? []).filter(event =>
      event.monitorId === monitorId && Date.parse(event.timestamp) === Date.parse(monitor.latestRunAt))},
    ...(monitorId !== "paze-directory" ? {monitorHistory:{[monitorId]:recent}} : {}),
  };
}
