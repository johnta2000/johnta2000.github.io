// Original eight-bar music-box loop. Preference is private to each pet account.
const bars = [[72,76,79,0],[74,0,71,67],[69,72,76,0],[67,0,64,0],
              [65,69,72,0],[67,71,74,0],[76,74,71,67],[72,0,0,0]];
const roots = [48,43,45,40,41,43,43,48];
let context, master, interval, step=0, when=0, enabled=false, volume=25;
function tone(midi,time,duration,level) {
  const osc=context.createOscillator(), env=context.createGain();
  osc.type='sine'; osc.frequency.value=440*2**((midi-69)/12);
  env.gain.setValueAtTime(0.0001,time);
  env.gain.exponentialRampToValueAtTime(level,time+0.024);
  env.gain.exponentialRampToValueAtTime(0.0001,time+duration);
  osc.connect(env); env.connect(master); osc.start(time); osc.stop(time+duration+0.01);
  osc.onended=()=>{osc.disconnect();env.disconnect();};
}
function tick() {
  if (context.state!=='running') return;
  when=Math.max(when,context.currentTime+0.02);
  while (when<context.currentTime+0.14) {
    const bar=Math.floor(step/4),note=bars[bar][step%4];
    if (note) tone(note,when,0.48,0.15);
    if (step%4===0) tone(roots[bar],when,1.2,0.095);
    step=(step+1)%32; when+=0.46;
  }
}
function pause() {
  clearInterval(interval); interval=null;
  if (context?.state==='running') void context.suspend().catch(()=>{});
}
export async function play() {
  if (!enabled || document.hidden) return;
  if (!context) {
    const Audio=window.AudioContext || window.webkitAudioContext;
    context=new Audio();master=context.createGain();master.connect(context.destination);
  }
  master.gain.value=volume/100;
  await context.resume();
  if (!enabled || document.hidden) {pause();return;}
  if (!interval) {tick();interval=setInterval(tick,80);}
}
export function configure(m) {
  enabled=m?.enabled===true;volume=Number.isFinite(m?.volume)?Math.min(100,Math.max(0,m.volume)):25;
  if(master)master.gain.setTargetAtTime(volume/100,context.currentTime,0.025);
  if(!enabled)pause();
}
document.addEventListener('click',()=>{if(enabled && context?.state!=='running') void play().catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else if(context && enabled)void play().catch(()=>{});});
window.addEventListener('pagehide',pause);
