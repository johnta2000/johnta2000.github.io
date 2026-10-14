// Generate only interaction coordinates from public lineup art. Original image
// pixels, branding, typography, and ordering are never reconstructed or altered.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(root+'/lost-lands-2026-lineup/controller.js','utf8');
const names=[...source.matchAll(/const legacy(?:Main|Support)Lineup = `([\s\S]*?)`;/g)].flatMap(m=>m[1].split('|').map(s=>s.trim()).filter(Boolean));
const rows=JSON.parse(execFileSync('swift',['-module-cache-path','/tmp/rally-poster-ocr-cache',__dirname+'/scan-lineup-poster.swift',root+'/lost-lands-2026-lineup/assets/lost-lands-2026-lineup.jpg',JSON.stringify(names)],{encoding:'utf8',maxBuffer:5e6}));
const spots=rows.flatMap(row=>row.matches).map(({artist,box})=>({artist,box:box.map(n=>Math.round(n*100000)/100000)}));
fs.writeFileSync(root+'/tools/rally/lost-lands-poster-spots.js','// Generated from the original marketing poster by build-poster-hotspots.cjs.\nwindow.RallyLostLandsPosterSpots='+JSON.stringify(spots)+';\n');
console.log(`${spots.length} exact artist labels mapped on the original Lost Lands poster.`);
