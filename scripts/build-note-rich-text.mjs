import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),entryPoints:['convex/noteRichText.ts'],outfile:'tools/rally/note-rich-text.js',bundle:true,format:'iife',globalName:'RallyNoteRichText',banner:{js:'// Generated from convex/noteRichText.ts. Run node scripts/build-note-rich-text.mjs.'}});
