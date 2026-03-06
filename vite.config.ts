import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifestJson from './manifest.json';

export default defineConfig(({ mode }) => {
  const manifest = structuredClone(manifestJson);
  const enableLocalhost = mode === 'development' || mode === 'mock';

  // 開発/モックモード: localhost のモック Netflix ページでもコンテンツスクリプトを動作させる
  if (enableLocalhost) {
    manifest.content_scripts[0].matches.push(
      'http://localhost:*/watch/*',
      'http://localhost:*/live/*',
      'http://localhost:*/event/*',
    );
    manifest.host_permissions.push('http://localhost:*/*');
    manifest.web_accessible_resources[0].matches.push('http://localhost:*/*');
  }

  return {
    plugins: [
      crx({ manifest }),
    ],
    define: {
      '__DEV_MOCK__': JSON.stringify(enableLocalhost),
    },
    server: {
      cors: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
