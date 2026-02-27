import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest }),
  ],
  server: {
    cors: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
