import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),base:'/tools/rally/collection/',plugins:[react()],build:{outDir:'../collection',emptyOutDir:true},publicDir:'public'});
