import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await build({absWorkingDir:root,entryPoints:['convex/meetupTiming.ts'],outfile:'tools/rally/meetup-timing.js',bundle:true,format:'iife',globalName:'RallyMeetupTiming',banner:{js:'// Generated from convex/meetupTiming.ts. Run node scripts/build-meetup-timing.mjs.'}});
