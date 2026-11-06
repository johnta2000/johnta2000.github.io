// Original eight-bar adventure and vacuum-battle themes, synthesized locally.
const MELODY=[
  [76,null,79,81,79,null,76,74], [72,null,76,79,76,null,74,null],
  [76,null,81,83,81,79,76,null], [74,76,79,null,76,null,72,null],
  [77,null,81,84,81,null,79,77], [76,77,81,null,79,77,76,null],
  [74,null,79,83,81,79,76,74], [71,74,79,null,74,null,72,null],
];
const CHORDS=[[48,60,64,67],[48,60,64,67],[45,57,60,64],[45,57,60,64],
  [41,53,57,60],[41,53,57,60],[43,55,59,62],[43,55,59,62]];
const BOSS_MELODY=[
  [74,74,81,77,74,77,81,84], [86,null,84,81,77,81,76,73],
  [74,77,82,81,77,null,74,72], [70,74,79,77,74,77,79,81],
  [86,81,86,89,88,86,84,81], [82,81,77,74,77,81,82,84],
  [85,null,81,76,73,76,81,85], [88,85,81,76,73,null,76,73],
];
const BOSS_CHORDS=[[38,50,53,57],[38,50,53,57],[34,46,50,53],[31,43,46,50],
  [38,50,53,57],[34,46,50,53],[33,45,49,52],[33,45,49,52]];
// Area melodies use their own phrasing and harmony, not just tempo changes.
const AREA_SCORES={
 woods:{tempo:88,type:'sine',volume:.055,notes:[[81,null,84,83,79,null,76,null],[77,81,null,84,83,null,79,null],[76,null,79,83,86,83,null,79],[77,76,null,74,71,null,74,null]],chords:[[45,57,60,64],[41,53,57,60],[40,52,55,59],[43,55,59,62]]},
 hills:{tempo:108,type:'sine',volume:.065,notes:[[79,81,83,null,86,83,81,79],[76,null,79,81,83,81,79,null],[81,83,84,86,88,null,86,84],[83,81,79,null,76,74,79,null]],chords:[[43,55,59,62],[40,52,55,59],[48,60,64,67],[38,50,54,57]]},
 orchard:{tempo:112,type:'triangle',volume:.05,notes:[[72,76,79,76,81,null,79,76],[77,81,84,null,83,81,79,null],[76,79,84,83,81,79,76,72],[74,null,77,79,83,79,74,null]],chords:[[48,60,64,67],[41,53,57,60],[45,57,60,64],[43,55,59,62]]},
 cottage:{tempo:102,type:'triangle',volume:.05,notes:[[69,null,72,76,null,75,76,null],[65,69,null,72,71,null,69,null],[67,null,71,74,null,72,71,67],[68,null,71,76,74,null,71,null]],chords:[[45,57,60,64],[41,53,57,60],[43,55,59,62],[40,52,56,59]]},
};
const frequency=midi=>440*2**((midi-69)/12);

export class Soundscape {
  constructor(contextFactory=()=>new (window.AudioContext||window.webkitAudioContext)()) {
    this.contextFactory=contextFactory;
    this.context=null;this.enabled=false;this.foreground=true;
    this.view='home';this.room='meadow';this.bossDefeated=false;this.nextNote=0;this.beat=0;
    this.musicVoices=new Set();this.effectVoices=new Set();
  }
  setEnabled(enabled) {
    this.enabled=enabled;
    if(!enabled)this.stopAll();
  }
  // Called only from a real click/key gesture, including after a saved preference loads.
  unlock() {
    if(!this.enabled||!this.foreground)return;
    try {
      if(!this.context) {
        this.context=this.contextFactory();
        this.master=this.context.createGain();this.master.gain.value=.65;
        this.master.connect(this.context.destination);
      }
      if(this.context.state==='suspended')this.context.resume().catch(()=>{});
    }catch{this.context=null;}
  }
  setForeground(foreground) {
    this.foreground=foreground;
    if(!foreground)this.stopAll();
  }
  setScene(view,room='meadow',{bossDefeated=false}={}) {
    if(this.view!==view||this.room!==room||this.bossDefeated!==bossDefeated) {
      this.stopVoices(this.musicVoices);this.nextNote=0;
      if(this.room!==room||view==='home'||this.bossDefeated!==bossDefeated)this.beat=0;
      // Leave room for the victory jingle before the gentle theme returns.
      if(room==='boss'&&bossDefeated&&!this.bossDefeated&&this.context)this.nextNote=this.context.currentTime+1.7;
    }
    this.view=view;this.room=room;this.bossDefeated=bossDefeated;
  }
  get battleMusic(){return this.view==='play'&&this.room==='boss'&&!this.bossDefeated;}
  get theme(){return this.battleMusic?'boss':this.view==='play'&&['woods','hills','orchard'].includes(this.room)?this.room:this.view==='play'&&['laundry','kitchen'].includes(this.room)?'cottage':'meadow';}
  get tempo(){return this.battleMusic?136:AREA_SCORES[this.theme]?.tempo||(['home','picnic'].includes(this.view)||this.room==='boss'&&this.bossDefeated?84:this.room==='pond'?88:96);}

  stopVoices(voices) {
    if(!this.context)return;
    const now=this.context.currentTime;
    for(const voice of voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0,now,.008);
      try{voice.source.stop(now+.04);}catch{/* It may already have ended. */}
    }
    voices.clear();
  }
  stopAll(){this.stopVoices(this.musicVoices);this.stopVoices(this.effectVoices);this.nextNote=0;}
  get ready(){return this.enabled&&this.foreground&&this.context?.state==='running';}
  voice(source,when,duration,volume,voices,filter=null) {
    const context=this.context,gain=context.createGain();
    gain.gain.setValueAtTime(0,when);
    gain.gain.linearRampToValueAtTime(volume,when+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    if(filter){source.connect(filter);filter.connect(gain);}else source.connect(gain);
    gain.connect(this.master);
    const voice={source,gain};voices.add(voice);
    source.onended=()=>{voices.delete(voice);source.disconnect();filter?.disconnect();gain.disconnect();};
    source.start(when);source.stop(when+duration+.015);
    return source;
  }
  tone(midi,when,duration,volume,voices=this.effectVoices,type='sine',endMidi=null) {
    const source=this.context.createOscillator();source.type=type;
    source.frequency.setValueAtTime(frequency(midi),when);
    if(endMidi!==null)source.frequency.exponentialRampToValueAtTime(frequency(endMidi),when+duration);
    return this.voice(source,when,duration,volume,voices);
  }
  pluck(midi,when,volume,duration=.45,voices=this.effectVoices) {
    this.tone(midi,when,duration,volume,voices);
    this.tone(midi+12,when,.12,volume*.2,voices);
  }
  noise(when,duration,volume,pitch,voices=this.effectVoices) {
    const context=this.context;
    if(!this.noiseBuffer) {
      this.noiseBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*.5),context.sampleRate);
      const samples=this.noiseBuffer.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
    }
    const source=context.createBufferSource();source.buffer=this.noiseBuffer;
    const filter=context.createBiquadFilter();filter.type='bandpass';filter.Q.value=.65;
    filter.frequency.setValueAtTime(pitch,when);
    filter.frequency.exponentialRampToValueAtTime(pitch*.4,when+duration);
    this.voice(source,when,duration,volume,voices,filter);
  }
  musicBeat(step,when,eighth) {
    if(this.battleMusic){this.battleBeat(step,when,eighth);return;}
    if(AREA_SCORES[this.theme]){this.areaBeat(step,when,eighth);return;}
    const bar=Math.floor(step/8),slot=step%8,note=MELODY[bar][slot],chord=CHORDS[bar];
    if(note!==null)this.pluck(note,when,.065,eighth*1.7,this.musicVoices);
    if(slot===0||slot===4)this.tone(chord[0]+(slot===4?7:0),when,eighth*2.5,.085,this.musicVoices);
    if(slot%2===0)this.pluck(chord[1+(slot/2)%3],when+.025,.026,eighth*1.4,this.musicVoices);
    if(this.view==='play'&&(slot===2||slot===6||this.room==='orchard'&&slot%2===1))
      this.noise(when,.055,.022,3200,this.musicVoices);
  }
  areaBeat(step,when,eighth) {
    const score=AREA_SCORES[this.theme],bar=Math.floor(step/8)%4,slot=step%8,note=score.notes[bar][slot],chord=score.chords[bar];
    if(note!==null){
      this.tone(note,when,eighth*(this.theme==='cottage'?.6:1.6),score.volume,this.musicVoices,score.type);
      if(this.theme==='woods')this.pluck(note+12,when+.07,.017,eighth*2,this.musicVoices);
    }
    if(slot===0||slot===4)this.tone(chord[0]+(slot===4?7:0),when,eighth*1.8,.07,this.musicVoices,'triangle');
    if(slot%2===0)this.pluck(chord[1+(slot/2)%3],when+.025,.028,eighth,this.musicVoices);
    if(this.theme==='orchard'&&slot%2===1)this.noise(when,.045,.03,3600,this.musicVoices);
    if(this.theme==='cottage'&&(slot===2||slot===6))this.pluck(88,when,.018,.08,this.musicVoices);
  }
  battleBeat(step,when,eighth) {
    const bar=Math.floor(step/8),slot=step%8,note=BOSS_MELODY[bar][slot],chord=BOSS_CHORDS[bar];
    if(note!==null){
      this.tone(note,when,eighth*1.25,.065,this.musicVoices,'triangle');
      this.pluck(note+12,when,.018,eighth*.65,this.musicVoices);
    }
    // Galloping bass, tiny drum hits, and bright minor-key chord stabs.
    this.tone(chord[0]+[0,12,7,12,0,12,7,12][slot],when,eighth*.85,.08,this.musicVoices,'triangle');
    if(slot===0||slot===4){
      this.tone(43,when,.13,.12,this.musicVoices,'sine',27);
      for(const pitch of chord.slice(1))this.tone(pitch+12,when+.012,eighth*1.5,.018,this.musicVoices,'triangle');
    }
    if(slot===2||slot===6)this.noise(when,.09,.055,1800,this.musicVoices);
    if(slot%2===1)this.noise(when,.035,.024,5600,this.musicVoices);
  }
  tick() {
    if(!this.ready||!['home','play','picnic'].includes(this.view))return;
    const now=this.context.currentTime;
    const eighth=30/this.tempo;
    // Discard missed beats after a delayed frame; never replay a backlog of notes.
    if(!this.nextNote||this.nextNote<now-.15)this.nextNote=now+.035;
    while(this.nextNote<now+.12) {
      this.musicBeat(this.beat,this.nextNote,eighth);
      this.nextNote+=eighth;this.beat=(this.beat+1)%64;
    }
  }
  play(kind) {
    if(!this.ready)return;
    const now=this.context.currentTime+.008;
    const chime=(notes,spacing=.095,volume=.12)=>notes.forEach((note,i)=>this.pluck(note,now+i*spacing,volume,.42));
    if(kind==='dash'){this.noise(now,.2,.17,1500);this.tone(53,now,.16,.07,this.effectVoices,'sine',65);}
    else if(kind==='bark'){for(const delay of [0,.14]){this.noise(now+delay,.09,.08,650);this.tone(54,now+delay,.1,.12,this.effectVoices,'triangle',44);}}
    else if(kind==='honk'){for(const delay of [0,.16]){this.tone(58,now+delay,.19,.12,this.effectVoices,'sawtooth',54);this.tone(65,now+delay,.16,.045,this.effectVoices,'triangle',61);}}
    else if(kind==='toot'){this.tone(43,now,.25,.11,this.effectVoices,'triangle',35);this.tone(47,now+.12,.22,.06,this.effectVoices,'sine',32);}
    else if(kind==='bonk'){
      // A soft impact, a rubbery downward boing, then a tiny springy rebound.
      this.noise(now,.065,.18,1050);this.tone(65,now,.19,.3,this.effectVoices,'sine',36);
      this.tone(49,now+.09,.15,.12,this.effectVoices,'triangle',65);
    }
    else if(kind==='bonk-boss'){
      this.tone(48,now,.32,.34,this.effectVoices,'sine',25);this.noise(now,.13,.2,1800);
      for(const [note,delay] of [[83,.015],[89,.045],[78,.085]])this.tone(note,now+delay,.22,.055,this.effectVoices,'triangle',note-7);
      this.tone(39,now+.14,.22,.1,this.effectVoices,'sine',53);
    }
    else if(kind==='bonk-crate'){
      this.tone(58,now,.12,.24,this.effectVoices,'triangle',34);
      for(const [delay,pitch] of [[0,1700],[.035,2400],[.075,1200]])this.noise(now+delay,.075,.15,pitch);
    }
    else if(kind==='stun'){this.tone(62,now,.13,.17,this.effectVoices,'sine',43);this.pluck(86,now+.09,.05,.2);}
    else if(kind==='hit'){this.tone(55,now,.21,.18,this.effectVoices,'sine',37);this.noise(now,.1,.08,550);}
    else if(kind==='defeat')chime([64,60,57,48],.15,.09);
    else if(kind==='snack')chime([84,88],.075,.10);
    else if(kind==='key'){this.noise(now,.15,.12,850);chime([72,76,79,84]);}
    else if(kind==='basket')chime([79,83,86,91]);
    else if(kind==='rescue'){chime([72,76,79,84,83,79,84],.13);this.tone(60,now,.9,.08);}
    else if(kind==='win'){chime([72,76,79,84,79,84,88],.15);[48,60,64,67].forEach(n=>this.tone(n,now+.9,1.1,.055));}
    else if(kind==='start')chime([72,76,79],.11,.09);
  }
}
