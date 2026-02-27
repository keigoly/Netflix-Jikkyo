// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { DEFAULT_SETTINGS, type Settings } from '../types';
import { getTitleList } from '../content/storage';
import { clearElement } from '../utils/sanitize';
import { t, setLocale, applyTranslations } from '../i18n';

// --- 設定読み込み・保存 ---

async function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get('settings', (result) => {
      resolve(result.settings ? { ...DEFAULT_SETTINGS, ...result.settings } : { ...DEFAULT_SETTINGS });
    });
  });
}

async function saveSettings(settings: Settings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ settings }, resolve);
  });
}

// --- UI 初期化 ---

async function init(): Promise<void> {
  const settings = await loadSettings();

  // i18n初期化
  await setLocale(settings.language || 'ja');
  applyTranslations();

  // ニックネーム
  const nicknameInput = document.getElementById('nickname') as HTMLInputElement;
  nicknameInput.value = settings.nickname;
  nicknameInput.addEventListener('input', () => {
    settings.nickname = nicknameInput.value;
    saveSettings(settings);
  });

  // コメント速度
  const speedInput = document.getElementById('speed') as HTMLInputElement;
  const speedVal = document.getElementById('speed-val')!;
  speedInput.value = String(settings.danmakuSpeedRate);
  speedVal.textContent = `${settings.danmakuSpeedRate}x`;
  speedInput.addEventListener('input', () => {
    settings.danmakuSpeedRate = parseFloat(speedInput.value);
    speedVal.textContent = `${settings.danmakuSpeedRate}x`;
    saveSettings(settings);
  });

  // 透明度
  const opacityInput = document.getElementById('opacity') as HTMLInputElement;
  const opacityVal = document.getElementById('opacity-val')!;
  opacityInput.value = String(settings.danmakuOpacity);
  opacityVal.textContent = `${Math.round(settings.danmakuOpacity * 100)}%`;
  opacityInput.addEventListener('input', () => {
    settings.danmakuOpacity = parseFloat(opacityInput.value);
    opacityVal.textContent = `${Math.round(settings.danmakuOpacity * 100)}%`;
    saveSettings(settings);
  });

  // フォントサイズ
  const fontsizeInput = document.getElementById('fontsize') as HTMLInputElement;
  const fontsizeVal = document.getElementById('fontsize-val')!;
  fontsizeInput.value = String(settings.danmakuScale);
  fontsizeVal.textContent = `${settings.danmakuScale}%`;
  fontsizeInput.addEventListener('input', () => {
    settings.danmakuScale = parseInt(fontsizeInput.value);
    fontsizeVal.textContent = `${settings.danmakuScale}%`;
    saveSettings(settings);
  });

  // 弾幕表示
  const enabledInput = document.getElementById('enabled') as HTMLInputElement;
  enabledInput.checked = settings.danmakuEnabled;
  enabledInput.addEventListener('change', () => {
    settings.danmakuEnabled = enabledInput.checked;
    saveSettings(settings);
  });

  // 弾幕数制限なし
  const unlimitedInput = document.getElementById('unlimited') as HTMLInputElement;
  unlimitedInput.checked = settings.danmakuUnlimited;
  unlimitedInput.addEventListener('change', () => {
    settings.danmakuUnlimited = unlimitedInput.checked;
    saveSettings(settings);
  });

  // サイドパネルを開くボタン
  const openPanelBtn = document.getElementById('open-panel') as HTMLButtonElement;
  openPanelBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close(); // ポップアップを閉じる
    }
  });

  // 過去ログ
  loadLogList();

  // 接続ステータス (アクティブタブからピア数を取得)
  updateStatus();
}

async function loadLogList(): Promise<void> {
  const logList = document.getElementById('log-list')!;
  try {
    const titles = await getTitleList();
    if (titles.length === 0) {
      clearElement(logList);
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'log-empty';
      emptyDiv.textContent = t('popup_log_empty');
      logList.appendChild(emptyDiv);
      return;
    }

    clearElement(logList);
    for (const title of titles) {
      const item = document.createElement('div');
      item.classList.add('log-item');
      const date = new Date(title.lastTimestamp).toLocaleDateString('ja-JP');

      const titleSpan = document.createElement('span');
      titleSpan.className = 'log-title';
      titleSpan.textContent = t('popup_log_title_id', { id: title.titleId });

      const countSpan = document.createElement('span');
      countSpan.className = 'log-count';
      countSpan.textContent = `${t('popup_log_count', { count: title.count })} (${date})`;

      item.appendChild(titleSpan);
      item.appendChild(countSpan);
      logList.appendChild(item);
    }
  } catch {
    clearElement(logList);
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'log-empty';
    emptyDiv.textContent = t('popup_log_failed');
    logList.appendChild(emptyDiv);
  }
}

async function updateStatus(): Promise<void> {
  const dot = document.getElementById('status-dot')!;
  const statusText = document.getElementById('status-text')!;
  const peerCount = document.getElementById('peer-count')!;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('netflix.com/watch/')) {
      dot.classList.add('connected');
      statusText.textContent = t('popup_status_connected');

      // バッジテキストからピア数を取得
      if (tab.id !== undefined) {
        const badgeText = await chrome.action.getBadgeText({ tabId: tab.id });
        peerCount.textContent = badgeText || '0';
      }
    } else {
      statusText.textContent = t('popup_status_open_netflix');
    }
  } catch {
    statusText.textContent = t('popup_status_disconnected');
  }
}

document.addEventListener('DOMContentLoaded', init);
