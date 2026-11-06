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
export function abilityKey(event) {
  return {KeyQ:'bark',KeyE:'stink',KeyR:'power'}[event.code]||{q:'bark',e:'stink',r:'power'}[event.key?.toLowerCase()]||{81:'bark',69:'stink',82:'power'}[event.keyCode||event.which]||null;
}

// A small dead zone keeps resting thumbs still; diagonal movement stays bounded.
export function joystickVector(dx,dy,radius=40) {
  const distance=Math.hypot(dx,dy);
  if(!Number.isFinite(distance)||distance<8||radius<=0)return {x:0,y:0};
  const scale=Math.min(distance/radius,1)/distance;
  return {x:dx*scale,y:dy*scale};
}
