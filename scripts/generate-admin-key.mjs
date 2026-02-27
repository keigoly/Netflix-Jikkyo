/**
 * 管理者用 ECDSA P-256 鍵ペア生成
 * 実行: node scripts/generate-admin-key.mjs
 *
 * 出力:
 * - 公開鍵 JWK → ソースコードにハードコード
 * - 秘密鍵 JWK → 管理者がサイドパネル設定で入力 (秘密に保管)
 */

import { webcrypto } from 'crypto';
const { subtle } = webcrypto;

const keyPair = await subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);

const publicKey = await subtle.exportKey('jwk', keyPair.publicKey);
const privateKey = await subtle.exportKey('jwk', keyPair.privateKey);

console.log('=== 公開鍵 (PUBLIC KEY) ===');
console.log('ソースコード src/utils/crypto.ts にハードコードしてください:');
console.log(JSON.stringify(publicKey, null, 2));
console.log('');
console.log('=== 秘密鍵 (PRIVATE KEY) ===');
console.log('管理者のみが保持。サイドパネルの設定に貼り付けてください:');
console.log(JSON.stringify(privateKey));
