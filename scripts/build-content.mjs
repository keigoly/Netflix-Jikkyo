// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { build } from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const isMock = process.argv.includes('--mock');
const commonDefine = {
  'process.env.NODE_ENV': '"production"',
  '__DEV_MOCK__': isMock ? 'true' : 'false',
};

// Content Script バンドル (IIFE)
await build({
  entryPoints: [join(root, 'src/content/index.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(root, 'dist/content-bundle.js'),
  target: 'chrome120',
  minify: true,
  define: commonDefine,
  logLevel: 'info',
});

console.log('[build-content] IIFE bundle → dist/content-bundle.js + dist/content-bundle.css');

// 弾幕レンダリングワーカー (IIFE)
await build({
  entryPoints: [join(root, 'src/content/danmaku-worker.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(root, 'dist/danmaku-worker.js'),
  target: 'chrome120',
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

console.log('[build-content] Worker bundle → dist/danmaku-worker.js');
