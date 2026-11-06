const codes = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };
const directions = new Set(Object.values(codes));

// Physical keys still work when an input method reports a composed character.
// Keep the character fallback for keyboards that omit KeyboardEvent.code.
export function movementKey(event) {
  if (codes[event.code]) return codes[event.code];
  const key = event.key?.toLowerCase();
  return directions.has(key) ? key : null;
}

export function isTextEntry(target) {
  return !!(target?.isContentEditable || target?.closest?.('input, textarea, select'));
}
