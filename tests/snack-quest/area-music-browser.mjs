import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {homedir} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:homedir()+'/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
const out='/tmp/snack-quest-goose-qa';mkdirSync(out,{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1400,height:1000}});await page.goto('http://127.0.0.1:8766/games/snack-quest/');
 const scores=await page.evaluate(async()=>{
  const {Soundscape}=await import('./audio.mjs?v=43');const result={};
  for(const room of ['meadow','woods','hills','orchard','laundry','kitchen','boss']){
   const context=new OfflineAudioContext(1,22050*10,22050),score=new Soundscape(()=>context);score.setEnabled(true);score.unlock();score.setScene('play',room);
   const theme=score.theme,tempo=score.tempo;for(let i=0;i<32;i++)score.musicBeat(i,.1+i*30/tempo,30/tempo);
   const buffer=await context.startRendering();result[room]={theme,tempo,samples:[...buffer.getChannelData(0)]};
   score.setScene('pause',room);if(score.musicVoices.size)throw Error('pause kept music voices');score.setScene('play',room);if(score.theme!==theme)throw Error('resume lost area theme');
   score.setEnabled(false);if(score.musicVoices.size||score.effectVoices.size)throw Error('mute retained voices');
  }return result;
 });
 for(const [room,{theme,tempo,samples}] of Object.entries(scores)){
  const expected=['laundry','kitchen'].includes(room)?'cottage':room;assert.equal(theme,expected);
  let peak=0;for(const n of samples){assert.ok(Number.isFinite(n));peak=Math.max(peak,Math.abs(n));}assert.ok(peak>.03&&peak<.8);
  if(!['meadow','kitchen'].includes(room))assert.ok(samples.some((n,i)=>Math.abs(n-scores.meadow.samples[i])>.01),'distinct melody '+room);
  console.log(room,theme,tempo,'BPM, peak',peak.toFixed(3));
 }
 // A short listenable medley of all four new area themes.
 const samples=['woods','hills','orchard','laundry'].flatMap(room=>scores[room].samples.slice(0,22050*4));
 const wav=Buffer.alloc(44+samples.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);samples.forEach((n,i)=>wav.writeInt16LE(Math.round(n*32767),44+i*2));writeFileSync(out+'/area-music-preview.wav',wav);
 await page.evaluate(async()=>{
  const {createRun,makeWorld}=await import('./engine.mjs?v=43'),{drawWorld}=await import('./art.mjs?v=43');
  const run=createRun('goosephoto');run.keyFound=run.pepperFound=run.peeFound=run.pepperoniFound=true;run.health=4;
  const world=makeWorld(run,'orchard');world.toys.find(t=>t.kind==='goose').mode='honk';world.toys.find(t=>t.kind==='goose').timer=.5;
  const c=document.createElement('canvas');c.id='goose-preview';c.width=1600;c.height=992;c.style.width='100%';document.body.replaceChildren(c);c.getContext('2d').scale(1.6,1.6);drawWorld(c.getContext('2d'),world,run,1000,true);
 });
 await page.locator('#goose-preview').screenshot({path:out+'/goose-honk.png'});
 console.log('PASS: area themes, pause/resume/mute, finite unclipped audio and goose artwork. Live speaker output is not verified.');
} finally {await browser.close();}
