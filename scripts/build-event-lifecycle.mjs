import {build} from 'esbuild';
await build({entryPoints:['convex/rallyEventLifecycle.ts'],bundle:true,format:'iife',globalName:'RallyEvents',outfile:'tools/rally/event-lifecycle.js'});
