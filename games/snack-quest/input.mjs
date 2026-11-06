const codes = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };
const directions = new Set(Object.values(codes));

// Physical keys still work when an input method reports a composed character.
// Keep the character fallback for keyboards that omit KeyboardEvent.code.
export function movementKey(event) {
  if (codes[event.code]) return codes[event.code];
  const key = event.key?.toLowerCase();
  if(directions.has(key))return key;
  return {87:'w',65:'a',83:'s',68:'d'}[event.keyCode||event.which]||null;
}

export function isTextEntry(target) {
  return !!(target?.isContentEditable || target?.closest?.('input, textarea, select'));
}
