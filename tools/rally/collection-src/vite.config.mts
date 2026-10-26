import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
// Keep hashed files available for cached HTML and already-open preview frames.
// New builds overwrite index.html but must not delete earlier versioned assets.
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),base:'/tools/rally/collection/',plugins:[react()],build:{outDir:'../collection',emptyOutDir:false},publicDir:'public'});
