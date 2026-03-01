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
const STORAGE_KEY = 'nicoOAuthToken';

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
export async function startNicoOAuth(config: NicoOAuthConfig): Promise<NicoOAuthToken> {
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

  // ストレージに保存
  await saveNicoToken(tokenData);

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

  await saveNicoToken(token);
  return token;
}

/**
 * 保存済みトークンを読み込み (期限切れなら自動リフレッシュ)
 */
export async function loadNicoToken(config?: NicoOAuthConfig): Promise<NicoOAuthToken | null> {
  const { [STORAGE_KEY]: token } = await chrome.storage.local.get(STORAGE_KEY);
  if (!token) return null;

  // 期限切れチェック (5分のマージン)
  if (token.expiresAt < Date.now() + 5 * 60 * 1000) {
    if (token.refreshToken && config) {
      try {
        log('[NicoAuth] Token expired, refreshing...');
        return await refreshNicoToken(config, token.refreshToken);
      } catch (e) {
        warn('[NicoAuth] Token refresh failed:', e);
        await clearNicoToken();
        return null;
      }
    }
    // リフレッシュ不可 → トークン無効
    await clearNicoToken();
    return null;
  }

  return token as NicoOAuthToken;
}

/**
 * トークンをストレージに保存
 */
async function saveNicoToken(token: NicoOAuthToken): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: token });
  log('[NicoAuth] Token saved');
}

/**
 * トークンを削除 (連携解除)
 */
export async function clearNicoToken(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
  log('[NicoAuth] Token cleared');
}

/**
 * ニコニコ連携済みかどうか
 */
export async function isNicoLinked(): Promise<boolean> {
  const { [STORAGE_KEY]: token } = await chrome.storage.local.get(STORAGE_KEY);
  return !!token?.accessToken;
}
