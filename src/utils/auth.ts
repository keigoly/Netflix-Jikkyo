// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { DEFAULT_AUTH_STATE, DEFAULT_SETTINGS, type AuthState, type Settings } from '../types';
import { t } from '../i18n';

const AUTH_STORAGE_KEY = 'authState';
const NICKNAME_MIN = 3;
const NICKNAME_MAX = 18;
const NICKNAME_CHANGE_DAYS = 30;

// --- AuthState 読み書き ---

export async function loadAuthState(): Promise<AuthState> {
  return new Promise((resolve) => {
    chrome.storage.local.get(AUTH_STORAGE_KEY, (result) => {
      resolve(result[AUTH_STORAGE_KEY]
        ? { ...DEFAULT_AUTH_STATE, ...result[AUTH_STORAGE_KEY] }
        : { ...DEFAULT_AUTH_STATE });
    });
  });
}

export async function saveAuthState(state: AuthState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AUTH_STORAGE_KEY]: state }, resolve);
  });
}

// --- Google OAuth ---

const OAUTH_CLIENT_ID = '284840824950-rft1ifp0elnmr514hq7pkuhga49p7ft3.apps.googleusercontent.com';
const REDIRECT_URL = chrome.identity.getRedirectURL();

export async function signInWithGoogle(): Promise<AuthState> {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URL);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('prompt', 'select_account');

  const redirectedUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          reject(new Error(chrome.runtime.lastError?.message || t('auth_cancelled')));
          return;
        }
        resolve(responseUrl);
      },
    );
  });

  const hashParams = new URLSearchParams(new URL(redirectedUrl.replace('#', '?')).search);
  const token = hashParams.get('access_token');
  if (!token) {
    throw new Error(t('auth_token_failed'));
  }

  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(t('auth_userinfo_failed'));
  }
  const userInfo = await res.json();

  const authState: AuthState = {
    isAuthenticated: true,
    user: {
      googleId: userInfo.sub,
      email: userInfo.email,
      displayName: userInfo.name || userInfo.email,
      avatarUrl: userInfo.picture || undefined,
    },
    accessToken: token,
    nicknameChangedAt: null,
    onboardingCompleted: false,
  };

  // 既存のAuthStateがあればnicknameChangedAtとonboardingCompletedを引き継ぐ
  const existing = await loadAuthState();
  if (existing.user?.googleId === authState.user!.googleId) {
    authState.nicknameChangedAt = existing.nicknameChangedAt;
    authState.onboardingCompleted = existing.onboardingCompleted;
  }

  await saveAuthState(authState);
  return authState;
}

export async function signOut(): Promise<void> {
  const authState = await loadAuthState();

  // トークン無効化
  if (authState.accessToken) {
    try {
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${authState.accessToken}`);
    } catch {
      // 無視
    }
  }

  await saveAuthState({ ...DEFAULT_AUTH_STATE });
}

// --- ニックネームバリデーション ---

export interface NicknameValidation {
  valid: boolean;
  error?: string;
}

// NGワードリスト (小文字・ひらがな正規化で比較)
const NG_WORDS: string[] = [
  // 日本語
  'しね', 'ころす', 'ころし', 'くそ', 'きもい', 'うざい', 'ちんこ', 'まんこ',
  'おっぱい', 'うんこ', 'ばか', 'あほ', 'がいじ', 'きちがい', 'しねよ',
  'ころすぞ', 'レイプ', 'れいぷ',
  // 英語
  'fuck', 'shit', 'dick', 'pussy', 'bitch', 'nigger', 'nigga',
  'asshole', 'penis', 'vagina', 'cunt', 'whore', 'slut', 'faggot',
  'retard', 'kill', 'rape',
  // その他
  'admin', '管理者', '運営', 'システム', 'system', 'official',
];

/** カタカナをひらがなに変換 */
function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/** NGワードチェック */
function containsNGWord(name: string): boolean {
  const normalized = katakanaToHiragana(name.toLowerCase());
  return NG_WORDS.some((word) => normalized.includes(katakanaToHiragana(word.toLowerCase())));
}

export function validateNickname(name: string): NicknameValidation {
  const trimmed = name.trim();
  if (trimmed.length < NICKNAME_MIN) {
    return { valid: false, error: t('nickname_too_short', { min: NICKNAME_MIN }) };
  }
  if (trimmed.length > NICKNAME_MAX) {
    return { valid: false, error: t('nickname_too_long', { max: NICKNAME_MAX }) };
  }
  if (containsNGWord(trimmed)) {
    return { valid: false, error: t('nickname_ng_word') };
  }
  return { valid: true };
}

// --- ニックネーム変更制限 ---

export interface ChangeNicknameResult {
  canChange: boolean;
  remainingDays?: number;
}

export function canChangeNickname(authState: AuthState): ChangeNicknameResult {
  if (!authState.nicknameChangedAt) {
    return { canChange: true };
  }

  const changedAt = new Date(authState.nicknameChangedAt).getTime();
  const now = Date.now();
  const daysPassed = (now - changedAt) / (1000 * 60 * 60 * 24);

  if (daysPassed >= NICKNAME_CHANGE_DAYS) {
    return { canChange: true };
  }

  return {
    canChange: false,
    remainingDays: Math.ceil(NICKNAME_CHANGE_DAYS - daysPassed),
  };
}

export async function changeNickname(name: string): Promise<void> {
  const trimmed = name.trim();

  // Settings.nickname 更新
  const settings = await new Promise<Settings>((resolve) => {
    chrome.storage.sync.get('settings', (result) => {
      resolve(result.settings ? { ...DEFAULT_SETTINGS, ...result.settings } : { ...DEFAULT_SETTINGS });
    });
  });
  settings.nickname = trimmed;
  await new Promise<void>((resolve) => {
    chrome.storage.sync.set({ settings }, resolve);
  });

  // AuthState.nicknameChangedAt 更新
  const authState = await loadAuthState();
  authState.nicknameChangedAt = new Date().toISOString();
  await saveAuthState(authState);
}

/** オンボーディング完了を記録 */
export async function completeOnboarding(): Promise<void> {
  const authState = await loadAuthState();
  authState.onboardingCompleted = true;
  await saveAuthState(authState);
}
