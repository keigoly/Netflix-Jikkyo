// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import type { FeatureFlags } from '../types';
import { DEFAULT_FEATURE_FLAGS } from '../types';
import { log, warn } from '../utils/logger';

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

const CONFIG_URL = 'https://netflix-jikkyo-config.skeigoly.workers.dev/config';
const FLAGS_ALARM_NAME = 'fetch-feature-flags';
const FLAGS_CACHE_KEY = 'featureFlags';

async function fetchFeatureFlags(): Promise<FeatureFlags> {
  try {
    const res = await fetch(CONFIG_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const flags: FeatureFlags = await res.json();
    await chrome.storage.session.set({ [FLAGS_CACHE_KEY]: flags });
    log('[Netflix Jikkyo] Feature flags fetched:', flags);

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
chrome.alarms.create(FLAGS_ALARM_NAME, { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLAGS_ALARM_NAME) {
    fetchFeatureFlags();
  }
});

// インストールイベント
chrome.runtime.onInstalled.addListener(() => {
  log('[Netflix Jikkyo] Extension installed');
});

// IIFE injection fallback
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.match(/netflix\.com\/watch\//)) return;

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
