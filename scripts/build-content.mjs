// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { build } from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

await build({
  entryPoints: [join(root, 'src/content/index.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(root, 'dist/content-bundle.js'),
  target: 'chrome120',
  minify: true,
  // chrome拡張のグローバルAPIはそのまま参照
  // idb, uuid, trystero は全てインライン化
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

console.log('[build-content] IIFE bundle → dist/content-bundle.js + dist/content-bundle.css');
