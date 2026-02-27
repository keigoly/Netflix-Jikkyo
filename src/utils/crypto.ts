// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

const ADMIN_PUBLIC_KEY_JWK: JsonWebKey = {
  key_ops: ['verify'],
  ext: true,
  kty: 'EC',
  x: 'XIb3dSgQKmrdYh9GyYTfmw8MNmE3OJUI5ea4sMn-2gc',
  y: 'g8Yix_W9Mf_L5s6P2tcwao0My68FrhvaeQtlz6VEGW4',
  crv: 'P-256',
};

const ALGO: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };
const CURVE: EcKeyImportParams = { name: 'ECDSA', namedCurve: 'P-256' };

let cachedPublicKey: CryptoKey | null = null;

/** 管理者公開鍵を取得 (キャッシュ) */
async function getAdminPublicKey(): Promise<CryptoKey> {
  if (!cachedPublicKey) {
    cachedPublicKey = await crypto.subtle.importKey('jwk', ADMIN_PUBLIC_KEY_JWK, CURVE, false, ['verify']);
  }
  return cachedPublicKey;
}

/** 署名対象データを生成する (id:text:timestamp) */
function buildSignPayload(id: string, text: string, timestamp: number): ArrayBuffer {
  return new TextEncoder().encode(`${id}:${text}:${timestamp}`).buffer as ArrayBuffer;
}

/** 秘密鍵 JWK でコメントに署名する */
export async function signComment(
  privateKeyJwk: JsonWebKey,
  id: string,
  text: string,
  timestamp: number,
): Promise<string> {
  const privateKey = await crypto.subtle.importKey('jwk', privateKeyJwk, CURVE, false, ['sign']);
  const data = buildSignPayload(id, text, timestamp);
  const signature = await crypto.subtle.sign(ALGO, privateKey, data);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/** 管理者署名を検証する */
export async function verifyAdminSignature(
  id: string,
  text: string,
  timestamp: number,
  signature: string,
): Promise<boolean> {
  try {
    const publicKey = await getAdminPublicKey();
    const data = buildSignPayload(id, text, timestamp);
    const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
    return await crypto.subtle.verify(ALGO, publicKey, sigBytes, data);
  } catch {
    return false;
  }
}

/** chrome.storage.local から管理者秘密鍵を読み込む */
export async function loadAdminPrivateKey(): Promise<JsonWebKey | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get('adminPrivateKey', (result) => {
      resolve(result.adminPrivateKey ?? null);
    });
  });
}

/** chrome.storage.local に管理者秘密鍵を保存する */
export async function saveAdminPrivateKey(jwk: JsonWebKey | null): Promise<void> {
  return new Promise((resolve) => {
    if (jwk) {
      chrome.storage.local.set({ adminPrivateKey: jwk }, resolve);
    } else {
      chrome.storage.local.remove('adminPrivateKey', resolve);
    }
  });
}

/** 秘密鍵 JWK が有効かテストする (署名→検証) */
export async function validatePrivateKey(jwk: JsonWebKey): Promise<boolean> {
  try {
    const sig = await signComment(jwk, 'test', 'test', 0);
    return await verifyAdminSignature('test', 'test', 0, sig);
  } catch {
    return false;
  }
}
