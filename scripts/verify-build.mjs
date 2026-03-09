// ビルド成果物の整合性を自動検証するスクリプト
// npm run build の最後に実行され、既知の問題パターンを検出する

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, '..', 'dist');

let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`  [ERROR] ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`  [WARN]  ${msg}`);
  warnings++;
}

function ok(msg) {
  console.log(`  [OK]    ${msg}`);
}

console.log('[verify-build] Checking build artifacts...\n');

// --- 1. manifest.json が content-bundle.js を参照しているか ---
try {
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf-8'));
  const csJs = manifest.content_scripts?.[0]?.js ?? [];
  const csCss = manifest.content_scripts?.[0]?.css ?? [];

  if (csJs.includes('content-bundle.js')) {
    ok('manifest.json: content_scripts → content-bundle.js');
  } else {
    error(`manifest.json: content_scripts.js = ${JSON.stringify(csJs)} (expected ["content-bundle.js"])`);
    error('CRXJS ESM ローダーが残っています。patch-mock-manifest.mjs が実行されていない可能性があります。');
  }

  if (csCss.includes('content-bundle.css')) {
    ok('manifest.json: content_scripts → content-bundle.css');
  } else {
    error(`manifest.json: content_scripts.css = ${JSON.stringify(csCss)} (expected ["content-bundle.css"])`);
  }
} catch (e) {
  error(`manifest.json の読み込みに失敗: ${e.message}`);
}

// --- 2. CSS と JS の translate 関数型が一致しているか ---
try {
  const css = readFileSync(join(dist, 'content-bundle.css'), 'utf-8');
  const js = readFileSync(join(dist, 'content-bundle.js'), 'utf-8');

  // CSS: esbuild が translateX → translate に変換するパターンを検出
  const cssUsesTranslateX = /translateX\(/.test(css);
  const cssUsesTranslate = /translate\(/.test(css);

  // JS: インラインスタイルで設定される translate 関数を検出
  const jsUsesTranslateX = /\.transform\s*=\s*[`"']translateX\(/.test(js);
  const jsUsesTranslate = /\.transform\s*=\s*[`"']translate\(/.test(js);

  if (cssUsesTranslateX && !jsUsesTranslateX) {
    // CSS が translateX、JS も translateX → OK (esbuild が変換しなかった)
  }

  if (cssUsesTranslate && !cssUsesTranslateX) {
    // CSS は translate() のみ (esbuild が変換した)
    if (jsUsesTranslateX) {
      error('CSS は translate() だが JS は translateX() を使用 → アニメーション補間に不整合');
    } else if (jsUsesTranslate) {
      ok('CSS/JS ともに translate() で統一');
    }
  } else if (cssUsesTranslateX) {
    if (jsUsesTranslate && !jsUsesTranslateX) {
      warn('CSS は translateX() だが JS は translate() を使用 (動作はするが要確認)');
    } else {
      ok('CSS/JS ともに translateX() で統一');
    }
  }
} catch (e) {
  error(`content-bundle の読み込みに失敗: ${e.message}`);
}

// --- 3. content-bundle.js が存在し、空でないか ---
try {
  const js = readFileSync(join(dist, 'content-bundle.js'), 'utf-8');
  if (js.length < 1000) {
    error(`content-bundle.js が異常に小さい (${js.length} bytes)`);
  } else {
    ok(`content-bundle.js: ${(js.length / 1024).toFixed(1)}KB`);
  }
} catch (e) {
  error(`content-bundle.js が存在しません: ${e.message}`);
}

// --- 4. danmaku-worker.js が存在し、空でないか ---
try {
  const workerJs = readFileSync(join(dist, 'danmaku-worker.js'), 'utf-8');
  if (workerJs.length < 100) {
    error(`danmaku-worker.js が異常に小さい (${workerJs.length} bytes)`);
  } else {
    ok(`danmaku-worker.js: ${(workerJs.length / 1024).toFixed(1)}KB`);
  }
} catch (e) {
  error(`danmaku-worker.js が存在しません: ${e.message}`);
}

// --- 結果サマリー ---
console.log('');
if (errors > 0) {
  console.error(`[verify-build] FAILED: ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
} else if (warnings > 0) {
  console.warn(`[verify-build] PASSED with ${warnings} warning(s)`);
} else {
  console.log('[verify-build] ALL CHECKS PASSED');
}
