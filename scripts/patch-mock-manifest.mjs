// CRXJS の動的インポートローダーを IIFE バンドルに差し替える
// CRXJS はコンテンツスクリプトを ESM dynamic import でロードするが、
// Background SW の IIFE フォールバック注入と競合して二重実行になるため、
// 常に IIFE バンドルを manifest で直接参照する

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, '..', 'dist', 'manifest.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

// content_scripts の JS を IIFE バンドルに差し替え
if (manifest.content_scripts?.[0]) {
  manifest.content_scripts[0].js = ['content-bundle.js'];
  manifest.content_scripts[0].css = ['content-bundle.css'];
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('[patch-mock-manifest] content_scripts → content-bundle.js + content-bundle.css');
