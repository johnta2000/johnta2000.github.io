// An original, eight-bar music-box tune. All audio is synthesized locally.
const MELODY=[
  [76,null,79,81,79,null,76,74], [72,null,76,79,76,null,74,null],
  [76,null,81,83,81,79,76,null], [74,76,79,null,76,null,72,null],
  [77,null,81,84,81,null,79,77], [76,77,81,null,79,77,76,null],
  [74,null,79,83,81,79,76,74], [71,74,79,null,74,null,72,null],
];
const CHORDS=[[48,60,64,67],[48,60,64,67],[45,57,60,64],[45,57,60,64],
  [41,53,57,60],[41,53,57,60],[43,55,59,62],[43,55,59,62]];
const frequency=midi=>440*2**((midi-69)/12);

export class Soundscape {
  constructor(contextFactory=()=>new (window.AudioContext||window.webkitAudioContext)()) {
    this.contextFactory=contextFactory;
    this.context=null;this.enabled=false;this.foreground=true;
    this.view='home';this.room='meadow';this.nextNote=0;this.beat=0;
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
  setScene(view,room='meadow') {
    if(this.view!==view||this.room!==room) {
      this.stopVoices(this.musicVoices);this.nextNote=0;
      if(this.room!==room||view==='home')this.beat=0;
    }
    this.view=view;this.room=room;
  }
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
    const bar=Math.floor(step/8),slot=step%8,note=MELODY[bar][slot],chord=CHORDS[bar];
    if(note!==null)this.pluck(note,when,.065,eighth*1.7,this.musicVoices);
    if(slot===0||slot===4)this.tone(chord[0]+(slot===4?7:0),when,eighth*2.5,.085,this.musicVoices);
    if(slot%2===0)this.pluck(chord[1+(slot/2)%3],when+.025,.026,eighth*1.4,this.musicVoices);
    if(this.view==='play'&&(slot===2||slot===6||this.room==='orchard'&&slot%2===1))
      this.noise(when,.055,.022,3200,this.musicVoices);
  }
  tick() {
    if(!this.ready||!['home','play','picnic'].includes(this.view))return;
    const now=this.context.currentTime;
    const tempo=this.view==='home'||this.view==='picnic'?84:this.room==='pond'?88:this.room==='orchard'?104:96;
    const eighth=30/tempo;
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
    else if(kind==='toot'){this.tone(43,now,.25,.11,this.effectVoices,'triangle',35);this.tone(47,now+.12,.22,.06,this.effectVoices,'sine',32);}
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
