// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import type { FeatureFlags, NicoBridgeCommentMessage, NicoBridgeStateMessage } from '../types';
import { DEFAULT_FEATURE_FLAGS } from '../types';
import { log, warn } from '../utils/logger';
import { CONTENT_TAB_PATTERNS } from '../utils/url-patterns';
import { NicoBridge } from './nico-bridge';
import { startNicoOAuth, loadNicoToken, clearNicoToken, type NicoOAuthConfig } from './nico-auth';
import { loadAuthState } from '../utils/auth';

// アイコンクリックでサイドパネルを開く
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const uiLang = chrome.i18n.getUILanguage();
if (!uiLang.startsWith('ja')) {
  chrome.action.setIcon({
    path: {
      '16': 'icons/icon16-en.png',
      '48': 'icons/icon48-en.png',
      '128': 'icons/icon128-en.png',
    },
  });
}

const WORKER_BASE = 'https://netflix-jikkyo-config.skeigoly.workers.dev';
const CONFIG_URL = `${WORKER_BASE}/config`;
const FLAGS_ALARM_NAME = 'fetch-feature-flags';
const FLAGS_CACHE_KEY = 'featureFlags';

async function fetchFeatureFlags(): Promise<FeatureFlags> {
  try {
    const res = await fetch(CONFIG_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const flags: FeatureFlags = await res.json();
    await chrome.storage.session.set({ [FLAGS_CACHE_KEY]: flags });
    log('[Netflix Jikkyo] Feature flags fetched:', flags);

    // OAuth config をキャッシュ
    if (flags.nicoBridge?.clientId && flags.nicoBridge?.clientSecret) {
      cachedNicoOAuthConfig = {
        clientId: flags.nicoBridge.clientId,
        clientSecret: flags.nicoBridge.clientSecret,
      };
    }

    // ニコ生ブリッジ更新
    updateNicoBridge(flags);

    // フラグ更新をコンテンツスクリプトに通知
    chrome.runtime.sendMessage({
      type: 'feature-flags-updated',
      flags,
      _relayed: true,
    }).catch(() => {});

    return flags;
  } catch (e) {
    warn('[Netflix Jikkyo] Feature flags fetch failed, using defaults:', e);
    return DEFAULT_FEATURE_FLAGS;
  }
}

/** キャッシュ済みフラグを返す (なければフェッチ) */
async function getCachedFlags(): Promise<FeatureFlags> {
  const result = await chrome.storage.session.get(FLAGS_CACHE_KEY);
  if (result[FLAGS_CACHE_KEY]) return result[FLAGS_CACHE_KEY];
  return fetchFeatureFlags();
}

// SW起動時にフラグ取得 + 定期アラーム登録
fetchFeatureFlags();
chrome.alarms.create(FLAGS_ALARM_NAME, { periodInMinutes: 5 });

// SW起動時に既存 Netflix タブへ Content Script を再注入
// (拡張機能リロードで既存タブの Content Script コンテキストが無効化されるため)
async function reinjectContentScripts(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: CONTENT_TAB_PATTERNS });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const pong = await chrome.tabs.sendMessage(tab.id, { type: 'ping' }).catch(() => null);
      if (pong === 'pong') continue;
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content-bundle.css'],
      }).catch(() => {});
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-bundle.js'],
        world: 'ISOLATED' as chrome.scripting.ExecutionWorld,
      });
      log(`[Netflix Jikkyo] Re-injected content script into tab ${tab.id}`);
    } catch (e) {
      warn(`[Netflix Jikkyo] Re-injection failed for tab ${tab.id}:`, e);
    }
  }
}
reinjectContentScripts();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLAGS_ALARM_NAME) {
    fetchFeatureFlags();
  }
});

// --- ニコ生ブリッジ管理 ---
let nicoBridge: NicoBridge | null = null;
let lastNicoBridgeState: NicoBridgeStateMessage | null = null;
let lastPeerCount = 0;
let cachedNicoOAuthConfig: NicoOAuthConfig | null = null;

/** 現在ログイン中の Google アカウント ID を取得 */
async function getCurrentGoogleId(): Promise<string | null> {
  const authState = await loadAuthState();
  if (!authState.isAuthenticated) return null;
  return authState.user?.googleId ?? null;
}

/** Google アカウント別のニコ生切断フラグキー */
function nicoDisconnectedKey(googleId: string): string {
  return `nicoUserDisconnected_${googleId}`;
}

function sendToNetflixTabs(message: NicoBridgeCommentMessage | NicoBridgeStateMessage): void {
  chrome.tabs.query({ url: CONTENT_TAB_PATTERNS }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  });
}

async function startNicoBridge(lvId: string): Promise<void> {
  if (nicoBridge) {
    nicoBridge.destroy();
    nicoBridge = null;
  }

  const googleId = await getCurrentGoogleId();

  // ユーザーが明示的に切断済みなら接続しない (アカウント別フラグ)
  let userDisconnected = false;
  if (googleId) {
    const key = nicoDisconnectedKey(googleId);
    const result = await chrome.storage.local.get(key);
    userDisconnected = !!result[key];
    // v1.0.5→v1.0.6 マイグレーション: 旧グローバルキーからの移行
    if (!userDisconnected) {
      const legacy = await chrome.storage.local.get('nicoUserDisconnected');
      if (legacy.nicoUserDisconnected) {
        userDisconnected = true;
        await chrome.storage.local.set({ [key]: true });
        await chrome.storage.local.remove('nicoUserDisconnected');
      }
    }
  }

  log(`[Netflix Jikkyo] Starting NicoBridge for ${lvId} (googleId=${googleId ?? 'none'})`);

  nicoBridge = new NicoBridge(
    lvId,
    // onComment: ニコ生コメント → Netflix タブに転送
    (comment: NicoBridgeCommentMessage) => {
      sendToNetflixTabs(comment);
    },
    // onStateChange: 状態変更 → サイドパネルに転送
    (state: NicoBridgeStateMessage) => {
      lastNicoBridgeState = state;
      chrome.runtime.sendMessage({ ...state, _relayed: true }).catch(() => {});
      // content script にも状態を転送
      sendToNetflixTabs(state);
    },
  );

  if (userDisconnected) {
    log('[Netflix Jikkyo] NicoBridge created but not connecting (user disconnected)');
    nicoBridge.setUserDisconnected(true);
    return;
  }

  // 保存済み OAuth トークンがあれば適用 (アカウント別)
  const token = await loadNicoToken(cachedNicoOAuthConfig ?? undefined, googleId ?? undefined).catch(() => null);
  if (token) {
    nicoBridge.setOAuthToken(token);
  }

  nicoBridge.connect();
}

function stopNicoBridge(): void {
  if (nicoBridge) {
    nicoBridge.destroy();
    nicoBridge = null;
    lastNicoBridgeState = null;
  }
}

/** ニコ生セッション状態をブロードキャスト */
function broadcastNicoBridgeSession(hasSession: boolean): void {
  const state: NicoBridgeStateMessage = {
    type: 'nico-bridge-state',
    status: nicoBridge?.getStatus() ?? 'disconnected',
    hasNicoSession: hasSession,
    lvId: lastNicoBridgeState?.lvId,
  };
  lastNicoBridgeState = state;
  chrome.runtime.sendMessage({ ...state, _relayed: true }).catch(() => {});
  sendToNetflixTabs(state);
}

/** Cookie 出現を最大60秒待つ (ニコニコログイン完了検出) */
async function waitForNicoCookie(): Promise<boolean> {
  const MAX_WAIT = 60000;
  const INTERVAL = 2000;
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT) {
    try {
      const cookie = await chrome.cookies.get({
        url: 'https://nicovideo.jp',
        name: 'user_session',
      });
      if (cookie?.value) {
        log('[Netflix Jikkyo] Nico cookie detected after login');
        return true;
      }
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, INTERVAL));
  }
  return false;
}

/** フラグに基づいてニコ生ブリッジの起動/停止を管理 */
function updateNicoBridge(flags: FeatureFlags): void {
  if (flags.nicoBridge?.enabled && flags.nicoBridge?.lvId) {
    // 既に同じ lvId で起動中なら何もしない
    if (nicoBridge && lastNicoBridgeState?.lvId === flags.nicoBridge.lvId) {
      return;
    }
    startNicoBridge(flags.nicoBridge.lvId);
  } else {
    stopNicoBridge();
  }
}

// インストールイベント
chrome.runtime.onInstalled.addListener(() => {
  log('[Netflix Jikkyo] Extension installed');
});

// IIFE injection fallback
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.match(/netflix\.com\/(?:watch|live|event)\//)) return;

  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    // コンテンツスクリプトが既に動作しているか確認
    const response = await chrome.tabs.sendMessage(tabId, { type: 'ping' }).catch(() => null);
    if (response === 'pong') {
      log('[Netflix Jikkyo] Content script already running');
      return;
    }

    log('[Netflix Jikkyo] Content script not detected, injecting IIFE fallback...');

    // CSS注入 (esbuild抽出のCSS)
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content-bundle.css'],
    }).catch((e) => {
      warn('[Netflix Jikkyo] CSS injection failed (may not exist):', e);
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-bundle.js'],
      world: 'ISOLATED' as chrome.scripting.ExecutionWorld,
    });
    log(`[Netflix Jikkyo] IIFE content script injected into tab ${tabId}`);
  } catch (e) {
    console.error('[Netflix Jikkyo] Content script injection failed:', e);
  }
});

// タブ切替
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    chrome.runtime.sendMessage({
      type: 'tab-changed',
      url: tab.url || '',
      tabId: activeInfo.tabId,
      windowId: activeInfo.windowId,
      reason: 'tab-switch',
    }).catch(() => {
      // サイドパネルが閉じている場合は無視
    });
  } catch {
    // タブ取得失敗は無視
  }
});

// URL変更 (SPA遷移含む)
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;

  // アクティブタブのみ通知
  if (!tab.active) return;

  chrome.runtime.sendMessage({
    type: 'tab-changed',
    url: changeInfo.url,
    tabId: tab.id,
    windowId: tab.windowId,
    reason: 'url-change',
  }).catch(() => {
    // サイドパネルが閉じている場合は無視
  });
});

// Message handlers
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'get-window-id') {
    chrome.windows.getLastFocused().then(win => {
      sendResponse({ windowId: win.id });
    }).catch(() => {
      sendResponse({ windowId: undefined });
    });
    return true; // 非同期レスポンス
  }
  if (message.type === 'get-feature-flags') {
    getCachedFlags().then(flags => {
      sendResponse(flags);
    }).catch(() => {
      sendResponse(DEFAULT_FEATURE_FLAGS);
    });
    return true; // 非同期レスポンス
  }
  // 設定の即時リフレッシュ (サイドパネル起動時など)
  if (message.type === 'refresh-config') {
    fetchFeatureFlags();
    return;
  }
  // コンテンツスクリプト生存確認 + 必要なら再注入 (サイドパネル開閉リカバリ)
  if (message.type === 'ensure-content-script') {
    const tabId = message.tabId as number | undefined;
    if (!tabId) { sendResponse({ ok: false }); return; }
    (async () => {
      try {
        const pong = await chrome.tabs.sendMessage(tabId, { type: 'ping' }).catch(() => null);
        if (pong === 'pong') {
          sendResponse({ ok: true, injected: false });
          return;
        }
        log('[Netflix Jikkyo] Content script not responding, re-injecting...');
        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ['content-bundle.css'],
        }).catch(() => {});
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-bundle.js'],
          world: 'ISOLATED' as chrome.scripting.ExecutionWorld,
        });
        log(`[Netflix Jikkyo] Content script re-injected into tab ${tabId}`);
        sendResponse({ ok: true, injected: true });
      } catch (e) {
        warn('[Netflix Jikkyo] Content script re-injection failed:', e);
        sendResponse({ ok: false });
      }
    })();
    return true; // 非同期レスポンス
  }
  // アーカイブコメント取得 (CF Worker プロキシ経由)
  if (message.type === 'fetch-archive-comments') {
    const { titleId, from, to } = message as { titleId: string; from: number; to: number };
    (async () => {
      try {
        const url = `${WORKER_BASE}/archive-comments?id=${encodeURIComponent(titleId)}&from=${from}&to=${to}`;
        const res = await fetch(url);
        if (!res.ok) {
          sendResponse({ comments: [], error: `HTTP ${res.status}` });
          return;
        }
        const data = await res.json();
        sendResponse(data);
      } catch (e) {
        sendResponse({ comments: [], error: String(e) });
      }
    })();
    return true; // 非同期レスポンス
  }
  // 管理者向けピアカウント統計 (サイドパネル → コンテンツスクリプトに中継)
  if (message.type === 'get-peer-stats') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: CONTENT_TAB_PATTERNS });
        const activeTab = tabs.find(t => t.active) ?? tabs[0];
        if (activeTab?.id) {
          const stats = await chrome.tabs.sendMessage(activeTab.id, { type: 'get-peer-stats' });
          sendResponse(stats);
        } else {
          sendResponse(null);
        }
      } catch {
        sendResponse(null);
      }
    })();
    return true;
  }
  // ニコ生ブリッジ状態取得
  if (message.type === 'get-nico-bridge-state') {
    sendResponse(lastNicoBridgeState);
    return;
  }
  // P2Pピア数取得 (サイドパネル起動時の即時表示用)
  if (message.type === 'get-peer-count') {
    sendResponse({ count: lastPeerCount });
    return;
  }
  // ニコ生ブリッジ投稿リクエスト
  if (message.type === 'nico-bridge-post') {
    if (nicoBridge && typeof message.text === 'string') {
      nicoBridge.postComment(message.text).then(ok => {
        sendResponse({ ok });
      }).catch(() => {
        sendResponse({ ok: false });
      });
      return true; // 非同期レスポンス
    }
    sendResponse({ ok: false });
    return;
  }
  // Google アカウント切り替え通知 → ニコ生ブリッジを再評価
  if (message.type === 'google-account-changed') {
    (async () => {
      // 現在のブリッジセッションをリセット
      if (nicoBridge) {
        nicoBridge.setOAuthToken(null);
        nicoBridge.disconnect('account-changed');
      }
      broadcastNicoBridgeSession(false);

      // 新ユーザーの状態でブリッジを再起動
      const googleId = await getCurrentGoogleId();
      if (googleId) {
        const flags = await getCachedFlags();
        if (flags.nicoBridge?.enabled && flags.nicoBridge?.lvId) {
          await startNicoBridge(flags.nicoBridge.lvId);
        }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  // ニコニコ連携開始 (OAuth or Cookie フォールバック)
  if (message.type === 'nico-oauth-start') {
    (async () => {
      const googleId = await getCurrentGoogleId();
      if (!googleId) {
        sendResponse({ ok: false, error: 'Not authenticated' });
        return;
      }

      // 連携開始 → disconnect フラグをクリア (アカウント別)
      chrome.storage.local.remove(nicoDisconnectedKey(googleId));
      if (nicoBridge) {
        nicoBridge.setUserDisconnected(false);
      }

      if (cachedNicoOAuthConfig) {
        // OAuth フロー
        try {
          const token = await startNicoOAuth(cachedNicoOAuthConfig, googleId);
          if (nicoBridge) {
            nicoBridge.setOAuthToken(token);
            broadcastNicoBridgeSession(true);
            nicoBridge.connect();
          }
          sendResponse({ ok: true, method: 'oauth' });
        } catch (e) {
          warn('[Netflix Jikkyo] Nico OAuth failed:', e);
          sendResponse({ ok: false, error: String(e) });
        }
      } else {
        // OAuth未設定 → Cookie ベースフォールバック
        try {
          const cookie = await chrome.cookies.get({ url: 'https://nicovideo.jp', name: 'user_session' });
          if (cookie?.value) {
            log('[Netflix Jikkyo] Nico cookie already exists, skipping login page');
            if (nicoBridge) {
              broadcastNicoBridgeSession(true);
              nicoBridge.connect();
            }
            sendResponse({ ok: true, method: 'cookie' });
          } else {
            chrome.windows.create({
              url: 'https://account.nicovideo.jp/login?site=nicolive&next_url=https%3A%2F%2Flive.nicovideo.jp%2F',
              type: 'popup',
              width: 500,
              height: 700,
            });
            const found = await waitForNicoCookie();
            if (found && nicoBridge) {
              broadcastNicoBridgeSession(true);
              nicoBridge.connect();
            }
            sendResponse({ ok: found, method: 'cookie' });
          }
        } catch {
          chrome.windows.create({
            url: 'https://account.nicovideo.jp/login?site=nicolive&next_url=https%3A%2F%2Flive.nicovideo.jp%2F',
            type: 'popup',
            width: 500,
            height: 700,
          });
          const found = await waitForNicoCookie();
          if (found && nicoBridge) {
            broadcastNicoBridgeSession(true);
            nicoBridge.connect();
          }
          sendResponse({ ok: found, method: 'cookie' });
        }
      }
    })();
    return true; // 非同期レスポンス
  }
  // ニコニコ連携解除
  if (message.type === 'nico-oauth-disconnect') {
    (async () => {
      const googleId = await getCurrentGoogleId();

      // disconnect フラグを保存 (アカウント別)
      if (googleId) {
        chrome.storage.local.set({ [nicoDisconnectedKey(googleId)]: true });
      }
      if (nicoBridge) {
        nicoBridge.setUserDisconnected(true);
        nicoBridge.disconnect('user-disconnect');
      }

      // Cookie を削除 (再連携時にログインを要求)
      chrome.cookies.remove({
        url: 'https://nicovideo.jp',
        name: 'user_session',
      }).catch(() => {});

      try {
        await clearNicoToken(googleId ?? undefined);
        if (nicoBridge) {
          nicoBridge.setOAuthToken(null);
        }
        broadcastNicoBridgeSession(false);
        sendResponse({ ok: true });
      } catch {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
  // ニコニコ連携状態確認
  if (message.type === 'nico-oauth-status') {
    (async () => {
      const googleId = await getCurrentGoogleId();
      if (!googleId) {
        sendResponse({ linked: false });
        return;
      }

      // ユーザーが明示的に切断した場合は linked: false (アカウント別)
      const result = await chrome.storage.local.get(nicoDisconnectedKey(googleId));
      if (result[nicoDisconnectedKey(googleId)]) {
        sendResponse({ linked: false });
        return;
      }
      // OAuth トークン or Cookie で判定
      try {
        const token = await loadNicoToken(cachedNicoOAuthConfig ?? undefined, googleId).catch(() => null);
        if (token) {
          sendResponse({ linked: true });
          return;
        }
        // Cookie フォールバック
        const cookie = await chrome.cookies.get({ url: 'https://nicovideo.jp', name: 'user_session' });
        sendResponse({ linked: !!cookie?.value });
      } catch {
        sendResponse({ linked: false });
      }
    })();
    return true;
  }
});

// コンテンツスクリプトからのメッセージ受信
chrome.runtime.onMessage.addListener((message, sender) => {
  // サイドパネルからのメッセージ (中継済みフラグ付き) は無視
  if (message._relayed) return;

  // コンテンツスクリプトからのメッセージのみ中継
  if (!sender.tab) return;

  if (message.type === 'peer-count') {
    const count = message.count as number;
    const tabId = sender.tab.id;
    lastPeerCount = count;

    // バッジテキスト更新
    if (tabId !== undefined) {
      chrome.action.setBadgeText({
        text: count > 0 ? String(count) : '',
        tabId,
      });
      chrome.action.setBadgeBackgroundColor({
        color: '#E50914', // Netflix赤
        tabId,
      });
    }

    // サイドパネルにピア数を中継
    chrome.runtime.sendMessage({
      type: 'side-panel-peer-count',
      count,
      _relayed: true,
    }).catch(() => {});
    return;
  }

  // Relay to sidepanel
  if (message.type === 'comment' || message.type === 'title-info' || message.type === 'title-ready' || message.type === 'log-synced' || message.type === 'video-time-update') {
    log(`[Netflix Jikkyo BG] Relaying ${message.type} to sidepanel`);
    chrome.runtime.sendMessage({ ...message, _relayed: true }).catch((err) => {
      log(`[Netflix Jikkyo BG] Relay failed (sidepanel closed?):`, err?.message);
    });
  }
});
