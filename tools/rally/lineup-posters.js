// Original organizer artwork + normalized interaction coordinates. No redraws.
(() => {
  const normalize = value => String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/æ/gi,'ae').replace(/\bset\b/gi,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const baseName = value => normalize(String(value).replace(/\([^)]*\)/g,''));
  const spot=(artist,box,extra={})=>({artist,box,...extra});
  const midnight={src:'/tools/rally/assets/midnight-carnival-2026-poster.png',width:510,height:638,alt:'Official Midnight Carnival Block Party and afterparty lineup poster',sourceLabel:'Original organizer artwork',spots:[
    spot('RL GRIME',[.255,.392,.50,.074],{blockId:'block-party'}),
    spot('NGHTMRE',[.278,.468,.446,.067]),spot('IMANU B2B NITEPUNK',[.154,.532,.688,.053]),
    spot('CASEY CLUB B2B 2SPADE',[.142,.583,.716,.050]),spot('STROBEZ B2B BUNS',[.251,.633,.499,.044]),
    spot('FALLDREN',[.085,.705,.139,.025]),spot('ODD LANGUAGE',[.244,.705,.182,.025]),
    spot('RATCHAELBEATS',[.455,.705,.207,.025]),spot('REIGN',[.69,.705,.084,.025]),spot('SILCROW',[.796,.705,.115,.025]),
    spot('DEVYN',[.073,.752,.091,.025]),spot('DYAN B2B VICEVERSA',[.189,.752,.267,.025]),
    spot('HIRAETH',[.477,.752,.102,.025]),spot('IKE B2B JUJUSEPH',[.6,.752,.188,.025]),spot('NYKOE',[.813,.752,.107,.025]),
    spot('RL GRIME',[.266,.808,.467,.067],{blockId:'afterparty'}),
    spot('CONTROL FREAK',[.065,.881,.465,.041]),spot('LUCKY',[.578,.881,.158,.041]),spot('WINK',[.792,.881,.15,.041]),
  ]};
  const niteharts={src:'/tools/rally/assets/niteharts-2026-poster.png',width:900,height:1125,alt:'Official Niteharts 2026 day-by-day lineup poster',source:'https://www.niteharts.com/',spots:[
    spot('ISOxo H.C.D.',[.198,.049,.50,.047],{day:'Friday'}),spot('Jane Remover',[.386,.097,.495,.042],{day:'Friday'}),
    spot('Frost Children (DJ set)',[.282,.147,.68,.042],{day:'Friday'}),
    spot('Porter Robinson (DJ set)',[.20,.197,.347,.043],{day:'Friday'}),spot('Porter Robinson (DJ set)',[.315,.229,.663,.05],{day:'Friday'}),
    spot('Yaego',[.373,.282,.203,.044],{day:'Friday'}),spot('Devault',[.67,.282,.293,.043],{day:'Friday'}),
    spot('ISOKNOCK',[.198,.493,.446,.043],{day:'Saturday'}),spot('Daine',[.728,.493,.208,.041],{day:'Saturday'}),
    spot('Thaiboy Digital & swedm®',[.244,.538,.578,.044],{day:'Saturday'}),spot('Thaiboy Digital & swedm®',[.59,.58,.372,.045],{day:'Saturday'}),
    spot('KimJ',[.22,.625,.18,.039],{day:'Saturday'}),spot('2hollis',[.484,.619,.36,.045],{day:'Saturday'}),
    spot('LYNY',[.355,.668,.188,.041],{day:'Saturday'}),spot('Flava D',[.688,.668,.25,.041],{day:'Saturday'}),
    spot('Knock2 B2B DJ Snake',[.196,.73,.473,.042],{day:'Sunday'}),spot('Knock2 B2B DJ Snake',[.438,.772,.42,.044],{day:'Sunday'}),
    spot('Borne',[.72,.734,.216,.038],{day:'Sunday'}),spot('underscores',[.34,.818,.481,.042],{day:'Sunday'}),
    spot('Nitepunk',[.155,.866,.333,.040],{day:'Sunday'}),spot('RL Grime',[.566,.867,.382,.042],{day:'Sunday'}),
    spot('Hamdi',[.118,.913,.24,.043],{day:'Sunday'}),spot('Control Freak',[.446,.912,.49,.041],{day:'Sunday'}),
    spot('ISOxo & Friends',[.664,.967,.118,.025],{day:'Saturday'}),spot('Knock2 & Friends',[.8,.967,.15,.025],{day:'Friday'}),
  ]};
  function get(id) {
    if(id==='midnight-carnival-rl-grime-2026')return midnight;
    if(id==='niteharts-festival-2026')return niteharts;
    if(id==='lost-lands-2026')return {src:'/lost-lands-2026-lineup/assets/lost-lands-2026-lineup.jpg',width:1000,height:1250,alt:'Official Lost Lands 2026 lineup poster',source:'https://www.lostlandsfestival.com/',spots:window.RallyLostLandsPosterSpots||[]};
    return null;
  }
  function resolve(artwork, entries) {
    if(!artwork)return [];
    return artwork.spots.map((s,index)=>({...s,index,entries:entries.filter(entry=>{
      if(s.day&&s.day!==entry.day||s.blockId&&s.blockId!==entry.blockId)return false;
      const name=entry.artist||entry.name;
      return normalize(name)===normalize(s.artist)||(!s.artist.includes('(')&&baseName(name)===normalize(s.artist));
    })})).filter(s=>s.entries.length&&s.box.length===4&&s.box.every(Number.isFinite)&&s.box[0]>=0&&s.box[1]>=0&&s.box[2]>0&&s.box[3]>0&&s.box[0]+s.box[2]<=1&&s.box[1]+s.box[3]<=1);
  }
  window.RallyLineupPosters={get,resolve};
})();
