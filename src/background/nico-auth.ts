// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

/**
 * ニコニコ OAuth2 認可フロー
 *
 * chrome.identity.launchWebAuthFlow() を使用して
 * ニコニコのアプリケーション連携 (OAuth2) を行う。
 */

import { log, warn } from '../utils/logger';

const NICO_OAUTH_AUTHORIZE = 'https://oauth.nicovideo.jp/oauth2/authorize';
const NICO_OAUTH_TOKEN = 'https://oauth.nicovideo.jp/oauth2/token';
const STORAGE_KEY_PREFIX = 'nicoOAuthToken';

/** Google アカウント別のストレージキーを生成 */
function storageKey(googleId: string): string {
  return `${STORAGE_KEY_PREFIX}_${googleId}`;
}

export interface NicoOAuthToken {
  accessToken: string;
  tokenType: string;
  expiresAt: number;
  refreshToken?: string;
}

export interface NicoOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * OAuth2 認可フローを開始
 * ユーザーにニコニコの認可画面を表示し、トークンを取得する
 */
export async function startNicoOAuth(config: NicoOAuthConfig, googleId: string): Promise<NicoOAuthToken> {
  const redirectUri = chrome.identity.getRedirectURL('nicovideo');
  log('[NicoAuth] Redirect URI:', redirectUri);

  const authUrl = new URL(NICO_OAUTH_AUTHORIZE);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);

  // 認可画面を開く
  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });

  if (!callbackUrl) {
    throw new Error('OAuth flow was cancelled');
  }

  // コールバック URL から認可コードを取得
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  if (!code) {
    const error = url.searchParams.get('error') || 'No authorization code';
    throw new Error(`OAuth error: ${error}`);
  }

  log('[NicoAuth] Authorization code received');

  // 認可コード → アクセストークン交換
  const tokenData = await exchangeCodeForToken(config, code, redirectUri);

  // ストレージに保存 (Google アカウント別)
  await saveNicoToken(tokenData, googleId);

  return tokenData;
}

/**
 * 認可コードをアクセストークンに交換
 */
async function exchangeCodeForToken(
  config: NicoOAuthConfig,
  code: string,
  redirectUri: string,
): Promise<NicoOAuthToken> {
  const res = await fetch(NICO_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  return {
    accessToken: data.access_token,
    tokenType: data.token_type || 'Bearer',
    expiresAt: Date.now() + ((data.expires_in ?? 3600) * 1000),
    refreshToken: data.refresh_token,
  };
}

/**
 * リフレッシュトークンでアクセストークンを更新
 */
export async function refreshNicoToken(
  config: NicoOAuthConfig,
  refreshToken: string,
  googleId?: string,
): Promise<NicoOAuthToken> {
  const res = await fetch(NICO_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = await res.json();

  const token: NicoOAuthToken = {
    accessToken: data.access_token,
    tokenType: data.token_type || 'Bearer',
    expiresAt: Date.now() + ((data.expires_in ?? 3600) * 1000),
    refreshToken: data.refresh_token || refreshToken,
  };

  if (googleId) {
    await saveNicoToken(token, googleId);
  }
  return token;
}

/**
 * 保存済みトークンを読み込み (期限切れなら自動リフレッシュ)
 * @param config OAuth 設定 (リフレッシュ用)
 * @param googleId Google アカウント ID (アカウント別ストレージ)
 */
export async function loadNicoToken(config?: NicoOAuthConfig, googleId?: string): Promise<NicoOAuthToken | null> {
  if (!googleId) return null;
  const key = storageKey(googleId);
  const result = await chrome.storage.local.get(key);
  let token = result[key];

  // v1.0.5→v1.0.6 マイグレーション: 旧グローバルキーからの移行
  if (!token) {
    const legacy = await chrome.storage.local.get('nicoOAuthToken');
    if (legacy.nicoOAuthToken?.accessToken) {
      log('[NicoAuth] Migrating legacy token to per-user key');
      token = legacy.nicoOAuthToken;
      await chrome.storage.local.set({ [key]: token });
      await chrome.storage.local.remove('nicoOAuthToken');
    }
  }

  if (!token) return null;

  // 期限切れチェック (5分のマージン)
  if (token.expiresAt < Date.now() + 5 * 60 * 1000) {
    if (token.refreshToken && config) {
      try {
        log('[NicoAuth] Token expired, refreshing...');
        return await refreshNicoToken(config, token.refreshToken, googleId);
      } catch (e) {
        warn('[NicoAuth] Token refresh failed:', e);
        await clearNicoToken(googleId);
        return null;
      }
    }
    // リフレッシュ不可 → トークン無効
    await clearNicoToken(googleId);
    return null;
  }

  return token as NicoOAuthToken;
}

/**
 * トークンをストレージに保存 (Google アカウント別)
 */
async function saveNicoToken(token: NicoOAuthToken, googleId: string): Promise<void> {
  await chrome.storage.local.set({ [storageKey(googleId)]: token });
  log('[NicoAuth] Token saved for', googleId);
}

/**
 * トークンを削除 (連携解除)
 * @param googleId Google アカウント ID
 */
export async function clearNicoToken(googleId?: string): Promise<void> {
  if (!googleId) return;
  await chrome.storage.local.remove(storageKey(googleId));
  log('[NicoAuth] Token cleared for', googleId);
}

/**
 * ニコニコ連携済みかどうか
 * @param googleId Google アカウント ID
 */
export async function isNicoLinked(googleId?: string): Promise<boolean> {
  if (!googleId) return false;
  const key = storageKey(googleId);
  const result = await chrome.storage.local.get(key);
  return !!result[key]?.accessToken;
}
