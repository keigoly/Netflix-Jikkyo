// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { DEFAULT_SETTINGS, FONT_OPTIONS, MAX_COMMENT_TEXT_LENGTH, type Settings, type SidePanelComment, type SidePanelLogSynced, type SidePanelPeerCount, type SidePanelTabChanged, type SidePanelTitleInfo, type TitleMetadata } from '../types';
import { getCommentsByTitle, exportAllComments, getStorageStats, clearAllComments, estimateStorageSize, trimCommentsByTitle } from './storage-proxy';
import { loadAdminPrivateKey } from '../utils/crypto';
import { loadAuthState, signInWithGoogle, signOut, validateNickname, canChangeNickname, changeNickname, completeOnboarding } from '../utils/auth';
import { isNGComment } from '../utils/ng-filter';
import { clearElement } from '../utils/sanitize';
import { t, setLocale, getLocale, onLocaleChange, applyTranslations, LOCALE_OPTIONS } from '../i18n';
import { log } from '../utils/logger';

const MAX_DOM_COMMENTS = 10000;

// --- DOM要素 ---
const commentList = document.getElementById('comment-list') as HTMLDivElement;
const peerCountEl = document.getElementById('peer-count') as HTMLSpanElement;
const scrollBtn = document.getElementById('scroll-btn') as HTMLButtonElement;
const gearBtn = document.getElementById('gear-btn') as HTMLButtonElement;
const settingsSlide = document.getElementById('settings-slide') as HTMLDivElement;
const settingsBackBtn = document.getElementById('settings-back') as HTMLButtonElement;
const statusDot = document.getElementById('status-dot') as HTMLSpanElement;
const statsText = document.getElementById('stats-text') as HTMLSpanElement;
const exportSettingsBtn = document.getElementById('export-settings') as HTMLButtonElement;
const importSettingsBtn = document.getElementById('import-settings') as HTMLButtonElement;
const importFileInput = document.getElementById('import-file') as HTMLInputElement;
const resetSettingsBtn = document.getElementById('reset-settings') as HTMLButtonElement;
const clearStorageBtn = document.getElementById('clear-storage') as HTMLButtonElement;
const panelTitleEl = document.querySelector('.panel-title') as HTMLSpanElement;
const titleInfoEl = document.getElementById('title-info') as HTMLDivElement;
const titleNameEl = document.getElementById('title-name') as HTMLDivElement;
const titleSubtitleEl = document.getElementById('title-subtitle') as HTMLDivElement;
const titleDescriptionEl = document.getElementById('title-description') as HTMLDivElement;
const titleReloadBtn = document.getElementById('title-reload-btn') as HTMLButtonElement;
const commentInput = document.getElementById('comment-input') as HTMLInputElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const statPace = document.getElementById('stat-pace') as HTMLSpanElement;
const statTotal = document.getElementById('stat-total') as HTMLSpanElement;
const noNetflixEl = document.getElementById('no-netflix') as HTMLDivElement;
const noNetflixGear = document.getElementById('no-netflix-gear') as HTMLButtonElement;
const contentArea = document.getElementById('content-area') as HTMLDivElement;
const inputBar = document.querySelector('.input-bar') as HTMLDivElement;

// 認証関連要素
const authGate = document.getElementById('auth-gate') as HTMLDivElement;
const authGoogleBtn = document.getElementById('auth-google-btn') as HTMLButtonElement;
const authError = document.getElementById('auth-error') as HTMLParagraphElement;
const onboardingEl = document.getElementById('onboarding') as HTMLDivElement;
const onboardingAvatar = document.getElementById('onboarding-avatar') as HTMLImageElement;
const onboardingNickname = document.getElementById('onboarding-nickname') as HTMLInputElement;
const onboardingCharCount = document.getElementById('onboarding-char-count') as HTMLSpanElement;
const onboardingError = document.getElementById('onboarding-error') as HTMLParagraphElement;
const onboardingStartBtn = document.getElementById('onboarding-start') as HTMLButtonElement;
const userAvatar = document.getElementById('user-avatar') as HTMLImageElement;
const userEmail = document.getElementById('user-email') as HTMLSpanElement;
const nicknameSaveBtn = document.getElementById('nickname-save') as HTMLButtonElement;
const nicknameHint = document.getElementById('nickname-hint') as HTMLParagraphElement;
const signoutBtn = document.getElementById('signout-btn') as HTMLButtonElement;

// アコーディオン プレビュー要素
const accPreviewUser = document.getElementById('acc-preview-user') as HTMLSpanElement;
const accPreviewDanmaku = document.getElementById('acc-preview-danmaku') as HTMLSpanElement;
const accPreviewDisplay = document.getElementById('acc-preview-display') as HTMLSpanElement;
const accPreviewData = document.getElementById('acc-preview-data') as HTMLSpanElement;
const accPreviewNg = document.getElementById('acc-preview-ng') as HTMLSpanElement;
const accPreviewLang = document.getElementById('acc-preview-lang') as HTMLSpanElement;
const accPreviewUpdate = document.getElementById('acc-preview-update') as HTMLSpanElement;

// アップデート情報要素
const updateBadge = document.getElementById('update-badge') as HTMLSpanElement;
const updateVersion = document.getElementById('update-version') as HTMLSpanElement;
const updateDate = document.getElementById('update-date') as HTMLSpanElement;
const updateBody = document.getElementById('update-body') as HTMLDivElement;
const updateGithubLink = document.getElementById('update-github-link') as HTMLAnchorElement;
const updateContent = document.getElementById('update-content') as HTMLDivElement;
const updateError = document.getElementById('update-error') as HTMLDivElement;

// NG設定要素
const ngCommentCount = document.getElementById('ng-comment-count') as HTMLSpanElement;
const ngCommandCount = document.getElementById('ng-command-count') as HTMLSpanElement;
const ngUserIdCount = document.getElementById('ng-userid-count') as HTMLSpanElement;
const ngCommentEdit = document.getElementById('ng-comment-edit') as HTMLButtonElement;
const ngCommandEdit = document.getElementById('ng-command-edit') as HTMLButtonElement;
const ngUserIdEdit = document.getElementById('ng-userid-edit') as HTMLButtonElement;
const ngModal = document.getElementById('ng-modal') as HTMLDivElement;
const ngModalBack = document.getElementById('ng-modal-back') as HTMLButtonElement;
const ngModalTitle = document.getElementById('ng-modal-title') as HTMLSpanElement;
const ngAddInput = document.getElementById('ng-add-input') as HTMLInputElement;
const ngAddBtn = document.getElementById('ng-add-btn') as HTMLButtonElement;
const ngItems = document.getElementById('ng-items') as HTMLDivElement;
const ngEmpty = document.getElementById('ng-empty') as HTMLDivElement;

// バッファ関連DOM要素
const newCommentsBar = document.getElementById('new-comments-bar') as HTMLButtonElement;

// バックドロップ・オフセットポップアップDOM要素
const backdrop = document.getElementById('backdrop') as HTMLDivElement;
const offsetPopup = document.getElementById('offset-popup') as HTMLDivElement;
const offsetBtn = document.getElementById('offset-btn') as HTMLButtonElement;

// コンテキストメニューDOM要素
const ctxMenu = document.getElementById('ctx-menu') as HTMLDivElement;
const ctxCommentText = document.getElementById('ctx-comment-text') as HTMLDivElement;
const ctxCopyComment = document.getElementById('ctx-copy-comment') as HTMLButtonElement;
const ctxCopyCommentPreview = document.getElementById('ctx-copy-comment-preview') as HTMLSpanElement;
const ctxCopyUserId = document.getElementById('ctx-copy-userid') as HTMLButtonElement;
const ctxCopyUserIdPreview = document.getElementById('ctx-copy-userid-preview') as HTMLSpanElement;
const ctxNgComment = document.getElementById('ctx-ng-comment') as HTMLButtonElement;
const ctxNgUserId = document.getElementById('ctx-ng-userid') as HTMLButtonElement;
const popoutBtn = document.getElementById('popout-btn') as HTMLButtonElement;

/** ポップアウトウィンドウかどうか */
const isPopout = new URLSearchParams(location.search).has('popout');

let autoScroll = true;
let currentVideoTime = -1;   // 現在の動画再生位置 (秒)
let isProgrammaticScroll = false; // プログラム的スクロール中フラグ
let commentCount = 0;
let totalComments = 0;
let currentTitleId: string | null = null;
let currentUserId: string | null = null; // ログインユーザーのGoogleId
let sidepanelWindowId: number | undefined; // サイドパネルが属するウィンドウID

/** コメントバッファ (受信済み・未表示) */
interface BufferedComment {
  text: string;
  nickname: string;
  timestamp: number;
  admin: boolean;
  videoTime?: number;
  userId?: string;
}
let commentBuffer: BufferedComment[] = [];

// (勢い計算の状態変数は勢い計算セクションで定義)

// --- No 管理 ---
let commentNo = 0;

// --- フォント・デザイン反映 ---

function applyFont(fontFamily: string): void {
  document.body.style.fontFamily = `${fontFamily}, 'Segoe UI', 'Hiragino Sans', sans-serif`;
}

const BG_MODE_CLASSES = ['nfjk-bg-light', 'nfjk-bg-darkblue', 'nfjk-bg-black'] as const;
const BG_LABEL_KEYS: Record<string, 'bg_default' | 'bg_light' | 'bg_darkblue' | 'bg_black'> = {
  default: 'bg_default', light: 'bg_light', darkblue: 'bg_darkblue', black: 'bg_black',
};
function getBgLabel(mode: string): string {
  return t(BG_LABEL_KEYS[mode] || 'bg_default');
}

function applySidepanelFontSize(size: number): void {
  document.body.style.setProperty('--nfjk-base-size', `${size}px`);
}

function applySidepanelBg(mode: string): void {
  document.body.classList.remove(...BG_MODE_CLASSES);
  if (mode !== 'default') {
    document.body.classList.add(`nfjk-bg-${mode}`);
  }
}

// --- 設定 ---

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

async function initSettings(): Promise<void> {
  const settings = await loadSettings();
  const authState = await loadAuthState();

  // i18n初期化
  await setLocale(settings.language || 'ja');
  applyTranslations();
  initLanguagePicker(settings);

  // ブラウザ言語に応じたアイコン・リンク切り替え
  const uiLang = chrome.i18n.getUILanguage();
  if (uiLang.startsWith('ja')) {
    const privacyLink = document.getElementById('privacy-link') as HTMLAnchorElement | null;
    if (privacyLink) privacyLink.href = 'https://github.com/keigoly/Netflix-Jikkyo/blob/main/PRIVACY_POLICY.md';
  } else {
    document.querySelectorAll<HTMLImageElement>('.nfjk-locale-icon').forEach(img => {
      img.src = img.src.replace('icon-nobg.png', 'icon-nobg-en.png');
    });
  }

  // ユーザー情報表示
  if (authState.user) {
    if (authState.user.avatarUrl) {
      userAvatar.src = authState.user.avatarUrl;
      userAvatar.alt = authState.user.displayName;
    }
    userEmail.textContent = authState.user.email;
  }

  const nicknameInput = document.getElementById('nickname') as HTMLInputElement;
  const savedNickname = settings.nickname;
  nicknameInput.value = savedNickname;

  // ニックネーム変更制限チェック
  const changeStatus = canChangeNickname(authState);
  if (!changeStatus.canChange) {
    nicknameInput.disabled = true;
    nicknameHint.textContent = t('user_nickname_remaining', { days: changeStatus.remainingDays ?? 0 });
  } else {
    nicknameHint.textContent = t('user_nickname_hint');
  }

  // 入力時に「保存」ボタン表示
  nicknameInput.addEventListener('input', () => {
    const changed = nicknameInput.value.trim() !== savedNickname;
    nicknameSaveBtn.classList.toggle('hidden', !changed);
    updateUserPreview(nicknameInput.value.trim());
  });

  // 「保存」ボタン
  nicknameSaveBtn.addEventListener('click', async () => {
    const validation = validateNickname(nicknameInput.value);
    if (!validation.valid) {
      nicknameHint.textContent = validation.error!;
      nicknameHint.style.color = '#E50914';
      return;
    }
    await changeNickname(nicknameInput.value);
    nicknameSaveBtn.classList.add('hidden');
    nicknameHint.style.color = '';
    const updated = canChangeNickname(await loadAuthState());
    if (!updated.canChange) {
      nicknameInput.disabled = true;
      nicknameHint.textContent = t('user_nickname_remaining', { days: updated.remainingDays ?? 0 });
    } else {
      nicknameHint.textContent = t('user_nickname_hint');
    }
    updateUserPreview(nicknameInput.value.trim());
  });

  const speedInput = document.getElementById('speed') as HTMLInputElement;
  const speedVal = document.getElementById('speed-val')!;
  speedInput.value = String(settings.danmakuSpeedRate);
  speedVal.textContent = `${settings.danmakuSpeedRate}x`;
  speedInput.addEventListener('input', () => {
    settings.danmakuSpeedRate = parseFloat(speedInput.value);
    speedVal.textContent = `${settings.danmakuSpeedRate}x`;
    saveSettings(settings);
    updateDanmakuPreview(settings);
  });

  const opacityInput = document.getElementById('opacity') as HTMLInputElement;
  const opacityVal = document.getElementById('opacity-val')!;
  opacityInput.value = String(settings.danmakuOpacity);
  opacityVal.textContent = `${Math.round(settings.danmakuOpacity * 100)}%`;
  opacityInput.addEventListener('input', () => {
    settings.danmakuOpacity = parseFloat(opacityInput.value);
    opacityVal.textContent = `${Math.round(settings.danmakuOpacity * 100)}%`;
    saveSettings(settings);
    updateDanmakuPreview(settings);
  });

  // コメントフォント (画面上の弾幕表示)
  const danmakuFontSelect = document.getElementById('danmaku-font-select') as HTMLSelectElement;
  for (const opt of FONT_OPTIONS) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    option.style.fontFamily = opt.value;
    danmakuFontSelect.appendChild(option);
  }
  danmakuFontSelect.value = settings.danmakuFontFamily;
  danmakuFontSelect.addEventListener('change', () => {
    settings.danmakuFontFamily = danmakuFontSelect.value;
    saveSettings(settings);
  });

  // システムフォント (サイドパネルUI)
  const fontSelect = document.getElementById('font-select') as HTMLSelectElement;
  for (const opt of FONT_OPTIONS) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    option.style.fontFamily = opt.value;
    fontSelect.appendChild(option);
  }
  fontSelect.value = settings.fontFamily;
  applyFont(settings.fontFamily);
  fontSelect.addEventListener('change', () => {
    settings.fontFamily = fontSelect.value;
    applyFont(settings.fontFamily);
    updateDisplayPreview(settings);
    saveSettings(settings);
  });

  // フォントサイズ (ドットスライダー)
  const fontSizeDots = document.querySelectorAll<HTMLElement>('.nfjk-fontsize-dot');
  applySidepanelFontSize(settings.sidepanelFontSize);
  fontSizeDots.forEach(dot => {
    const isSelected = parseInt(dot.dataset.size || '13') === settings.sidepanelFontSize;
    dot.classList.toggle('selected', isSelected);
    dot.addEventListener('click', () => {
      const size = parseInt(dot.dataset.size || '13');
      settings.sidepanelFontSize = size;
      applySidepanelFontSize(size);
      fontSizeDots.forEach(d => d.classList.toggle('selected', d === dot));
      updateDisplayPreview(settings);
      saveSettings(settings);
    });
  });

  // 背景テーマ
  const bgOptions = document.querySelectorAll<HTMLElement>('.nfjk-bg-option');
  applySidepanelBg(settings.sidepanelBgMode);
  bgOptions.forEach(opt => {
    const isSelected = opt.dataset.bg === settings.sidepanelBgMode;
    opt.classList.toggle('selected', isSelected);
    opt.addEventListener('click', () => {
      const mode = (opt.dataset.bg || 'default') as Settings['sidepanelBgMode'];
      settings.sidepanelBgMode = mode;
      applySidepanelBg(mode);
      bgOptions.forEach(o => o.classList.toggle('selected', o === opt));
      updateDisplayPreview(settings);
      saveSettings(settings);
    });
  });

  updateDisplayPreview(settings);

  const fontsizeInput = document.getElementById('fontsize') as HTMLInputElement;
  const fontsizeVal = document.getElementById('fontsize-val')!;
  fontsizeInput.value = String(settings.danmakuScale);
  fontsizeVal.textContent = `${settings.danmakuScale}%`;
  fontsizeInput.addEventListener('input', () => {
    settings.danmakuScale = parseInt(fontsizeInput.value);
    fontsizeVal.textContent = `${settings.danmakuScale}%`;
    saveSettings(settings);
  });

  const enabledInput = document.getElementById('enabled') as HTMLInputElement;
  enabledInput.checked = settings.danmakuEnabled;
  enabledInput.addEventListener('change', () => {
    settings.danmakuEnabled = enabledInput.checked;
    saveSettings(settings);
  });

  const unlimitedInput = document.getElementById('unlimited') as HTMLInputElement;
  unlimitedInput.checked = settings.danmakuUnlimited;
  unlimitedInput.addEventListener('change', () => {
    settings.danmakuUnlimited = unlimitedInput.checked;
    saveSettings(settings);
  });

  const highlightInput = document.getElementById('now-playing-highlight') as HTMLInputElement;
  highlightInput.checked = settings.nowPlayingHighlight;
  highlightInput.addEventListener('change', () => {
    settings.nowPlayingHighlight = highlightInput.checked;
    currentSettings = settings;
    saveSettings(settings);
    // オフにした場合、既存のハイライトを即座にクリア
    if (!settings.nowPlayingHighlight) {
      commentList.querySelectorAll('.comment-row.now-playing').forEach(el => {
        el.classList.remove('now-playing');
      });
    }
  });

  // グローバル設定を保存
  currentSettings = settings;

  // --- NG設定 ---
  initNGSettings(settings);

  // 初回プレビュー更新
  updateUserPreview(settings.nickname);
  updateDanmakuPreview(settings);
}

// --- NG設定 ---

/** 現在編集中のNGリスト種別 */
let currentNGType: 'comment' | 'command' | 'userId' | null = null;
let currentSettings: Settings = { ...DEFAULT_SETTINGS };

/** 再生時間連動スクロールモードが有効かどうか */
function isVideoTimeMode(): boolean {
  return currentSettings.nowPlayingHighlight && currentVideoTime >= 0;
}

function initNGSettings(settings: Settings): void {
  currentSettings = settings;

  // カウント更新
  updateNGCounts(settings);

  // 編集ボタン
  ngCommentEdit.addEventListener('click', () => openNGModal('comment', settings));
  ngCommandEdit.addEventListener('click', () => openNGModal('command', settings));
  ngUserIdEdit.addEventListener('click', () => openNGModal('userId', settings));

  // モーダル閉じる
  ngModalBack.addEventListener('click', closeNGModal);

  // 追加ボタン
  ngAddBtn.addEventListener('click', () => addNGItem(settings));
  ngAddInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      addNGItem(settings);
    }
  });
}

function updateNGCounts(settings: Settings): void {
  ngCommentCount.textContent = t('ng_count', { count: settings.ngComments.length });
  ngCommandCount.textContent = t('ng_count', { count: settings.ngCommands.length });
  ngUserIdCount.textContent = t('ng_count', { count: settings.ngUserIds.length });
  updateNgPreview(settings);
}

function getNGList(type: 'comment' | 'command' | 'userId', settings: Settings): string[] {
  if (type === 'comment') return settings.ngComments;
  if (type === 'command') return settings.ngCommands;
  return settings.ngUserIds;
}

function setNGList(type: 'comment' | 'command' | 'userId', settings: Settings, list: string[]): void {
  if (type === 'comment') settings.ngComments = list;
  else if (type === 'command') settings.ngCommands = list;
  else settings.ngUserIds = list;
}

function openNGModal(type: 'comment' | 'command' | 'userId', settings: Settings): void {
  currentNGType = type;
  const titleKeys = { comment: 'ng_modal_title_comment', command: 'ng_modal_title_command', userId: 'ng_modal_title_userid' } as const;
  ngModalTitle.textContent = t(titleKeys[type]);
  ngAddInput.value = '';
  renderNGItems(settings);
  ngModal.classList.remove('hidden');
}

function closeNGModal(): void {
  ngModal.classList.add('hidden');
  currentNGType = null;
}

function renderNGItems(settings: Settings): void {
  if (!currentNGType) return;
  const list = getNGList(currentNGType, settings);
  clearElement(ngItems);

  if (list.length === 0) {
    ngEmpty.classList.remove('hidden');
  } else {
    ngEmpty.classList.add('hidden');
    for (let i = 0; i < list.length; i++) {
      const item = document.createElement('div');
      item.className = 'nfjk-ng-item';

      const text = document.createElement('span');
      text.className = 'nfjk-ng-item-text';
      text.textContent = list[i];

      const del = document.createElement('button');
      del.className = 'nfjk-ng-item-del';
      del.textContent = '✕';
      del.title = t('ng_delete_title');
      del.addEventListener('click', () => {
        removeNGItem(i, settings);
      });

      item.appendChild(text);
      item.appendChild(del);
      ngItems.appendChild(item);
    }
  }
}

function addNGItem(settings: Settings): void {
  if (!currentNGType) return;
  const value = ngAddInput.value.trim();
  if (!value) return;

  const list = getNGList(currentNGType, settings);
  if (list.includes(value)) {
    ngAddInput.value = '';
    return;
  }

  list.push(value);
  setNGList(currentNGType, settings, list);
  saveSettings(settings);
  updateNGCounts(settings);
  renderNGItems(settings);
  ngAddInput.value = '';
  ngAddInput.focus();
}

function removeNGItem(index: number, settings: Settings): void {
  if (!currentNGType) return;
  const list = getNGList(currentNGType, settings);
  list.splice(index, 1);
  setNGList(currentNGType, settings, list);
  saveSettings(settings);
  updateNGCounts(settings);
  renderNGItems(settings);
}

// --- ヘッダータイトル (マーキー対応) ---

/** ヘッダータイトルを設定。溢れる場合はSpotify風マーキーアニメーション */
function setPanelTitle(text: string): void {
  panelTitleEl.title = text;
  panelTitleEl.classList.remove('nfjk-marquee');
  panelTitleEl.textContent = text;

  // レイアウト確定後にオーバーフロー判定
  requestAnimationFrame(() => {
    if (panelTitleEl.scrollWidth > panelTitleEl.clientWidth) {
      // マーキー化: テキストを2回繰り返して無限スクロール
      panelTitleEl.textContent = '';
      const inner = document.createElement('span');
      inner.className = 'nfjk-marquee-inner';
      inner.textContent = text + '\u00A0\u00A0\u00A0\u2014\u00A0\u00A0\u00A0' + text + '\u00A0\u00A0\u00A0\u2014\u00A0\u00A0\u00A0';

      // 速度計算: 0.75倍速 (文字数に応じた自然なスクロール)
      const baseSpeed = 40; // px/s (遅め)
      const scrollWidth = panelTitleEl.clientWidth + 48; // おおよその幅
      const charCount = text.length;
      const estimatedWidth = charCount * 10 + 48;
      const duration = Math.max(estimatedWidth / baseSpeed, 6);
      inner.style.setProperty('--nfjk-marquee-duration', `${duration}s`);

      panelTitleEl.appendChild(inner);
      panelTitleEl.classList.add('nfjk-marquee');
    }
  });
}

// --- 最新アップデート情報 (GitHub Releases API) ---

const GITHUB_REPO = 'keigoly/Netflix-Jikkyo';
const UPDATE_CACHE_KEY = 'nfjk-update-cache';
const UPDATE_CACHE_TTL = 30 * 60 * 1000; // 30分キャッシュ

let updateFetched = false;

async function fetchLatestRelease(): Promise<void> {
  if (updateFetched) return;
  updateFetched = true;

  try {
    // キャッシュチェック
    const cached = await chrome.storage.local.get(UPDATE_CACHE_KEY);
    const cache = cached[UPDATE_CACHE_KEY];
    if (cache && Date.now() - cache.fetchedAt < UPDATE_CACHE_TTL) {
      renderUpdateInfo(cache);
      return;
    }

    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const info = {
      version: data.tag_name || data.name || '',
      date: data.published_at ? new Date(data.published_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }) : '',
      body: data.body || '',
      url: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      fetchedAt: Date.now(),
    };

    await chrome.storage.local.set({ [UPDATE_CACHE_KEY]: info });
    renderUpdateInfo(info);
  } catch {
    accPreviewUpdate.textContent = t('update_preview_failed');
    updateContent.classList.add('hidden');
    updateError.classList.remove('hidden');
  }
}

function renderUpdateInfo(info: { version: string; date: string; body: string; url: string }): void {
  const currentVersion = chrome.runtime.getManifest().version;
  const latestVersion = info.version.replace(/^v/, '');

  accPreviewUpdate.textContent = info.version;
  updateVersion.textContent = info.version;
  updateDate.textContent = info.date;
  updateBody.textContent = info.body;
  updateGithubLink.href = info.url;
  updateContent.classList.remove('hidden');
  updateError.classList.add('hidden');

  // 現在のバージョンより新しいリリースがあればNEWバッジ表示
  if (latestVersion && latestVersion !== currentVersion && isNewerVersion(latestVersion, currentVersion)) {
    updateBadge.classList.remove('hidden');
  } else {
    updateBadge.classList.add('hidden');
  }
}

function isNewerVersion(latest: string, current: string): boolean {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lv = l[i] || 0;
    const cv = c[i] || 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

// --- 歯車ボタン (設定スライド開閉) ---

function openSettings(): void {
  if (isNoNetflixState) {
    noNetflixEl.classList.add('hidden');
    titleInfoEl.classList.remove('visible');
    inputBar.classList.add('hidden');
  }
  settingsSlide.classList.add('nfjk-settings-open');
  gearBtn.classList.add('active');
  refreshStorageStats();
  fetchLatestRelease();
}

function closeSettings(): void {
  settingsSlide.classList.remove('nfjk-settings-open');
  gearBtn.classList.remove('active');
  if (isNoNetflixState) {
    noNetflixEl.classList.remove('hidden');
    commentInput.disabled = true;
    sendBtn.disabled = true;
  }
  inputBar.classList.remove('hidden');
}

gearBtn.addEventListener('click', () => {
  if (settingsSlide.classList.contains('nfjk-settings-open')) {
    closeSettings();
  } else {
    openSettings();
  }
});
settingsBackBtn.addEventListener('click', closeSettings);
noNetflixGear.addEventListener('click', openSettings);

// --- ポップアウト (別ウィンドウ) ---

/** Netflix watchタブを検索 (ポップアウト時は全ウィンドウから、通常時はcurrentWindow) */
async function findNetflixTab(): Promise<chrome.tabs.Tab | null> {
  if (isPopout) {
    // ポップアウト時: 全ウィンドウからNetflix watchタブを検索
    const tabs = await chrome.tabs.query({ url: '*://*.netflix.com/watch/*' });
    return tabs[0] ?? null;
  }
  // 通常サイドパネル: currentWindowのアクティブタブ
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

popoutBtn.addEventListener('click', async () => {
  // 現在の状態を chrome.storage.session に保存
  await chrome.storage.session.set({
    popoutState: {
      titleId: currentTitleId,
      title: titleNameEl.textContent || '',
      subtitle: titleSubtitleEl.textContent || '',
      description: titleDescriptionEl.textContent || '',
    },
  });

  // 現在のウィンドウ高さを取得
  const win = await chrome.windows.getCurrent();
  const height = win.height || 600;

  // 新しいウィンドウで開く
  const popoutUrl = chrome.runtime.getURL('src/sidepanel/index.html?popout');
  chrome.windows.create({
    url: popoutUrl,
    type: 'popup',
    width: 420,
    height,
  });

  // サイドパネルを閉じる
  if (win.id !== undefined) {
    // @ts-expect-error chrome.sidePanel.close は Chrome 129+ で利用可能だが型定義が未対応
    chrome.sidePanel.close({ windowId: win.id }).catch(() => { /* ignore */ });
  }
});

// --- アコーディオン制御 ---

function initAccordion(): void {
  const headers = document.querySelectorAll<HTMLButtonElement>('.nfjk-accordion-header');
  headers.forEach((header) => {
    header.addEventListener('click', () => {
      const accordion = header.closest('.nfjk-accordion') as HTMLElement;
      const isExpanded = accordion.classList.contains('nfjk-expanded');

      // 他を全て閉じる (排他開閉)
      document.querySelectorAll('.nfjk-accordion.nfjk-expanded').forEach((el) => {
        el.classList.remove('nfjk-expanded');
      });

      // クリックしたものを開閉
      if (!isExpanded) {
        accordion.classList.add('nfjk-expanded');
      }
    });
  });
}

// --- 言語ピッカー ---

function initLanguagePicker(settings: Settings): void {
  const picker = document.getElementById('lang-picker') as HTMLDivElement;
  if (!picker) return;
  clearElement(picker);

  for (const opt of LOCALE_OPTIONS) {
    const el = document.createElement('div');
    el.className = 'nfjk-lang-option';
    if (opt.value === (settings.language || 'ja')) el.classList.add('selected');
    el.dataset.lang = opt.value;

    const radio = document.createElement('span');
    radio.className = 'nfjk-lang-radio';

    const label = document.createElement('span');
    label.className = 'nfjk-lang-label';
    label.textContent = opt.label;

    el.appendChild(radio);
    el.appendChild(label);

    el.addEventListener('click', async () => {
      const locale = opt.value;
      settings.language = locale;
      await saveSettings(settings);
      await setLocale(locale);
      applyTranslations();

      // ピッカー選択状態更新
      picker.querySelectorAll('.nfjk-lang-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');

      // プレビュー更新
      accPreviewLang.textContent = opt.label;
    });

    picker.appendChild(el);
  }

  // 初期プレビュー
  const currentOpt = LOCALE_OPTIONS.find(o => o.value === (settings.language || 'ja'));
  accPreviewLang.textContent = currentOpt?.label || LOCALE_OPTIONS[0].label;
}

// --- プレビュー更新 ---

function updateUserPreview(nickname: string): void {
  accPreviewUser.textContent = nickname || t('comment_guest');
}

function updateDanmakuPreview(settings: Settings): void {
  accPreviewDanmaku.textContent = t('danmaku_preview', {
    speed: settings.danmakuSpeedRate,
    opacity: Math.round(settings.danmakuOpacity * 100),
  });
}

function updateDisplayPreview(settings: Settings): void {
  const fontLabel = FONT_OPTIONS.find(o => o.value === settings.fontFamily)?.label || 'Montserrat';
  const bgLabel = getBgLabel(settings.sidepanelBgMode);
  accPreviewDisplay.textContent = `${settings.sidepanelFontSize}px / ${fontLabel} / ${bgLabel}`;
}

function updateNgPreview(settings: Settings): void {
  const total = (settings.ngComments?.length || 0) + (settings.ngUserIds?.length || 0);
  accPreviewNg.textContent = t('ng_preview_total', { count: total });
}

function updateAllPreviews(): void {
  loadSettings().then((settings) => {
    updateUserPreview(settings.nickname);
    updateDanmakuPreview(settings);
    updateNgPreview(settings);
  });
  refreshStorageStats();
}

// --- ストレージ統計 ---

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function refreshStorageStats(): Promise<void> {
  try {
    const [stats, sizeBytes] = await Promise.all([getStorageStats(), estimateStorageSize()]);
    statsText.textContent = t('storage_stats', { size: formatBytes(sizeBytes), count: stats.totalComments, titles: stats.titleCount });
    accPreviewData.textContent = formatBytes(sizeBytes);
  } catch {
    statsText.textContent = t('storage_stats_failed');
  }
}

// --- ストレージ操作 ---

// 設定エクスポート
exportSettingsBtn.addEventListener('click', async () => {
  exportSettingsBtn.disabled = true;
  try {
    const json = await exportAllComments();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `netflix-jikkyo-log-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('[Netflix Jikkyo] Export failed:', e);
  } finally {
    exportSettingsBtn.disabled = false;
  }
});

// 設定インポート
importSettingsBtn.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', async () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('Invalid format');
    const { saveComments } = await import('../content/storage');
    await saveComments(data);
    await refreshStorageStats();
    await reloadPastComments();
  } catch (e) {
    console.error('[Netflix Jikkyo] Import failed:', e);
  } finally {
    importFileInput.value = '';
  }
});

// 設定リセット
resetSettingsBtn.addEventListener('click', async () => {
  if (!confirm(t('storage_reset_confirm'))) return;
  await saveSettings({ ...DEFAULT_SETTINGS });
  location.reload();
});

// ストレージ初期化
clearStorageBtn.addEventListener('click', async () => {
  if (!confirm(t('storage_clear_confirm'))) return;
  try {
    await clearAllComments();
    await refreshStorageStats();
    clearElement(commentList);
    commentCount = 0;
    commentNo = 0;
    totalComments = 0;
    statTotal.textContent = t('stat_total', { count: 0 });
    showEmpty();
  } catch (e) {
    console.error('[Netflix Jikkyo] Clear storage failed:', e);
  }
});

// --- コメント送信 ---

async function sendComment(): Promise<void> {
  const text = commentInput.value.trim();
  if (!text) return;

  // NGフィルター: 送信前チェック
  if (isNGComment(text)) {
    commentInput.value = '';
    commentInput.placeholder = t('input_ng_blocked');
    setTimeout(() => { commentInput.placeholder = t('input_placeholder'); }, 2000);
    return;
  }

  commentInput.value = '';

  const settings = await loadSettings();
  const nickname = settings.nickname || t('comment_guest');
  const isAdmin = (await loadAdminPrivateKey()) !== null;

  // Netflixタブのコンテンツスクリプトに送信し、videoTimeを受け取る
  let videoTime: number | undefined;
  try {
    const tab = await findNetflixTab();
    if (tab?.id !== undefined) {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'sidepanel-send-comment', text });
      videoTime = response?.videoTime;
    }
  } catch (e) {
    console.error('[Netflix Jikkyo] Send failed:', e);
  }

  // Google認証ユーザーID取得
  const authState = await loadAuthState();
  const myUserId = authState.user?.googleId;

  // 即座にサイドパネルに表示（楽観的UI）
  addComment(text, nickname, Date.now(), true, isAdmin, false, videoTime, myUserId);

  // バッファフラッシュ: 蓄積された受信コメントをまとめて表示
  await flushCommentBuffer();
}

sendBtn.addEventListener('click', sendComment);
commentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    sendComment();
  }
});

// --- 勢い計算 ---
//
// 2つのモード:
//   1. リアルタイムモード (ライブ配信向け): 直近60秒間の受信コメント数
//   2. 動画時間モード (通常動画向け): 再生位置周辺60秒間のコメント密度
// isVideoTimeMode() で自動切替

const PACE_CLASSES = ['stat-pace-blue', 'stat-pace-yellow', 'stat-pace-green', 'stat-pace-red', 'stat-pace-gold', 'stat-pace-rainbow'] as const;
const PACE_WINDOW = 60_000;       // 60秒ウィンドウ (リアルタイムモード)
const PACE_VIDEO_WINDOW = 60;     // 60秒ウィンドウ (動画時間モード, 秒)
const PACE_UPDATE_INTERVAL = 5_000; // 5秒ごとに表示更新 (リアルタイムモード)
const PACE_ANIM_DURATION = 800;   // カウントアニメーション (ms)

/** コメント到着タイムスタンプの配列 (スライディングウィンドウ) */
let paceTimestamps: number[] = [];
let displayedPace = 0;
let paceAnimFrame: number | null = null;
let paceTimer: ReturnType<typeof setInterval> | null = null;

function updatePaceStyle(count: number): void {
  statPace.classList.remove(...PACE_CLASSES);
  if (count >= 1000) {
    statPace.classList.add('stat-pace-rainbow');
  } else if (count >= 500) {
    statPace.classList.add('stat-pace-gold');
  } else if (count >= 200) {
    statPace.classList.add('stat-pace-red');
  } else if (count >= 100) {
    statPace.classList.add('stat-pace-green');
  } else if (count >= 50) {
    statPace.classList.add('stat-pace-yellow');
  } else if (count >= 10) {
    statPace.classList.add('stat-pace-blue');
  }
}

/** 数値をアニメーションで遷移させる */
function animatePace(from: number, to: number): void {
  if (paceAnimFrame !== null) {
    cancelAnimationFrame(paceAnimFrame);
    paceAnimFrame = null;
  }

  const start = performance.now();
  const diff = to - from;

  const step = (now: number) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / PACE_ANIM_DURATION, 1);
    // easeOutCubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + diff * eased);

    statPace.textContent = t('stat_pace', { count: current });

    if (progress < 1) {
      paceAnimFrame = requestAnimationFrame(step);
    } else {
      paceAnimFrame = null;
      displayedPace = to;
      updatePaceStyle(to);
    }
  };

  paceAnimFrame = requestAnimationFrame(step);
}

/** 60秒ウィンドウ外の古いタイムスタンプを除去し、現在の勢いを返す */
function calcPace(): number {
  const cutoff = Date.now() - PACE_WINDOW;
  // 古いエントリを除去 (配列は時系列順なので先頭から削る)
  while (paceTimestamps.length > 0 && paceTimestamps[0] < cutoff) {
    paceTimestamps.shift();
  }
  return paceTimestamps.length;
}

/** 定期的に勢い表示を更新する (リアルタイムモード用) */
function updatePaceDisplay(): void {
  // 動画時間モード中は handleVideoTimeUpdate 側で更新するためスキップ
  if (isVideoTimeMode()) return;

  const newPace = calcPace();
  if (newPace === displayedPace) return;

  // 増減の演出クラス
  statPace.classList.remove('stat-pace-up', 'stat-pace-down');
  void statPace.offsetWidth; // リフロー強制で再トリガー

  if (newPace > displayedPace) {
    statPace.classList.add('stat-pace-up');
  } else {
    statPace.classList.add('stat-pace-down');
  }

  animatePace(displayedPace, newPace);
}

/** 動画再生位置ベースの勢いを計算・表示する */
function updateVideoTimePace(videoTime: number): void {
  const rows = commentList.querySelectorAll('.comment-row[data-video-time]');
  let count = 0;
  // 現在位置から過去60秒間のコメント数 = コメ/分
  const windowStart = videoTime - PACE_VIDEO_WINDOW;
  for (const row of rows) {
    const vt = parseFloat((row as HTMLElement).dataset.videoTime || '0');
    if (vt >= windowStart && vt <= videoTime) {
      count++;
    }
  }

  if (count === displayedPace) return;

  statPace.classList.remove('stat-pace-up', 'stat-pace-down');
  void statPace.offsetWidth;

  if (count > displayedPace) {
    statPace.classList.add('stat-pace-up');
  } else {
    statPace.classList.add('stat-pace-down');
  }

  animatePace(displayedPace, count);
}

/** コメント到着時にタイムスタンプを記録する */
function recordPace(): void {
  paceTimestamps.push(Date.now());
}

/** 5秒タイマーを開始する */
function startPaceTimer(): void {
  if (paceTimer !== null) return;
  paceTimer = setInterval(updatePaceDisplay, PACE_UPDATE_INTERVAL);
}

/** 勢い表示を即座にリセットする */
function resetPace(): void {
  paceTimestamps = [];
  if (paceAnimFrame !== null) {
    cancelAnimationFrame(paceAnimFrame);
    paceAnimFrame = null;
  }
  displayedPace = 0;
  statPace.textContent = t('stat_pace', { count: 0 });
  statPace.classList.remove(...PACE_CLASSES, 'stat-pace-up', 'stat-pace-down');
}

function updateTotal(): void {
  totalComments++;
  statTotal.textContent = t('stat_total', { count: totalComments });
}

// --- コメントバッファ管理 ---

/** バッファ上限 (超過時は自動フラッシュ) */
const COMMENT_BUFFER_MAX = 500;

/** バッファにコメントを追加し、バナーを更新する */
function bufferComment(text: string, nickname: string, timestamp: number, admin: boolean, videoTime?: number, userId?: string): void {
  commentBuffer.push({ text, nickname, timestamp, admin, videoTime, userId });
  updateBufferBanner();

  // 上限超過 → 自動フラッシュ
  if (commentBuffer.length >= COMMENT_BUFFER_MAX) {
    flushCommentBuffer();
  }
}

/** バッファ内のコメントを一括表示してクリアする */
async function flushCommentBuffer(): Promise<void> {
  // 再生時間順にソートしてからフラッシュ
  commentBuffer.sort((a, b) => {
    const vtA = a.videoTime ?? Infinity;
    const vtB = b.videoTime ?? Infinity;
    if (vtA !== vtB) return vtA - vtB;
    return a.timestamp - b.timestamp;
  });
  // サイドパネル側フラッシュ (勢い・累計はここで計上)
  for (const c of commentBuffer) {
    addComment(c.text, c.nickname, c.timestamp, false, c.admin, false, c.videoTime, c.userId);
  }
  commentBuffer = [];
  updateBufferBanner();

  // Netflix画面上の弾幕もフラッシュ
  try {
    const tab = await findNetflixTab();
    if (tab?.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, { type: 'flush-danmaku' });
    }
  } catch { /* 無視 */ }
}

/** バナーの表示/非表示を切り替える */
function updateBufferBanner(): void {
  if (commentBuffer.length > 0) {
    newCommentsBar.textContent = t('buffer_new_comments', { count: commentBuffer.length });
    newCommentsBar.classList.remove('hidden');
  } else {
    newCommentsBar.classList.add('hidden');
  }
}

// バナークリックでフラッシュ
newCommentsBar.addEventListener('click', () => { flushCommentBuffer(); });

// --- 接続ステータス ---

function extractTitleId(url: string): string | null {
  const match = url.match(/netflix\.com\/watch\/(\d+)/);
  return match ? match[1] : null;
}

async function updateStatus(): Promise<void> {
  try {
    const tab = await findNetflixTab();
    if (tab?.url) {
      const titleId = extractTitleId(tab.url);
      if (titleId) {
        statusDot.classList.add('connected');
        currentTitleId = titleId;
        if (tab.id !== undefined) {
          const badgeText = await chrome.action.getBadgeText({ tabId: tab.id });
          const count = parseInt(badgeText, 10) || 0;
          peerCountEl.textContent = t('stat_peers', { count: Math.max(count, 1) }); // 自分自身を最低1人
        }
        return;
      }
    }
    statusDot.classList.remove('connected');
  } catch {
    // 接続失敗
  }
}

// --- 過去ログ復元 ---

async function loadPastComments(): Promise<void> {
  if (!currentTitleId) return;

  try {
    // 1万件超過分をIndexedDBからトリム
    const trimmed = await trimCommentsByTitle(currentTitleId, MAX_DOM_COMMENTS);
    if (trimmed > 0) {
      log(`[Netflix Jikkyo] Trimmed ${trimmed} old comments for title ${currentTitleId}`);
    }

    const comments = await getCommentsByTitle(currentTitleId);
    if (comments.length === 0) return;

    // 再生時間順にソート (videoTimeがないコメントは末尾)
    comments.sort((a, b) => {
      const vtA = a.videoTime ?? Infinity;
      const vtB = b.videoTime ?? Infinity;
      if (vtA !== vtB) return vtA - vtB;
      return a.timestamp - b.timestamp;
    });

    const toShow = comments.length > MAX_DOM_COMMENTS
      ? comments.slice(-MAX_DOM_COMMENTS)
      : comments;

    const empty = commentList.querySelector('.empty-message');
    if (empty) empty.remove();

    const fragment = document.createDocumentFragment();
    for (const c of toShow) {
      commentNo++;
      const row = createCommentRow(commentNo, c.nickname, c.text, c.timestamp, false, true, false, c.videoTime, c.userId);
      fragment.appendChild(row);
    }
    commentList.appendChild(fragment);
    commentCount += toShow.length;
    totalComments = toShow.length;
    statTotal.textContent = t('stat_total', { count: totalComments });

    // 再生時間連動モード: 現在の再生位置にスクロール
    if (isVideoTimeMode()) {
      scrollToVideoTime(currentVideoTime);
    } else {
      commentList.scrollTop = commentList.scrollHeight;
    }
  } catch (e) {
    console.error('[Netflix Jikkyo] Failed to load past comments:', e);
  }
}

// --- コメント行の生成 ---

function createCommentRow(
  no: number,
  nickname: string,
  text: string,
  timestamp: number,
  mine: boolean,
  past: boolean,
  admin = false,
  videoTime?: number,
  userId?: string,
): HTMLDivElement {
  // 自分のコメント判定: mine フラグ or userId一致
  const isMine = mine || (!!userId && !!currentUserId && userId === currentUserId);

  const row = document.createElement('div');
  row.className = 'comment-row';
  if (isMine) row.classList.add('mine');
  if (past) row.classList.add('past');
  if (admin) row.classList.add('admin');

  // コンテキストメニュー用データ
  row.dataset.commentText = text;
  row.dataset.userId = userId || '';
  row.dataset.nickname = admin ? t('comment_admin') : (nickname || t('comment_guest'));
  if (videoTime != null) row.dataset.videoTime = String(videoTime);

  const noEl = document.createElement('span');
  noEl.className = 'comment-no';
  noEl.textContent = String(no);

  // 自分のコメントは「あなた」表示
  const displayName = admin ? t('comment_admin') : (isMine ? t('comment_you') : (nickname || t('comment_guest')));
  const nicknameEl = document.createElement('span');
  nicknameEl.className = 'comment-nickname';
  nicknameEl.textContent = displayName;

  const textEl = document.createElement('span');
  textEl.className = 'comment-text';
  textEl.textContent = text;

  const timeEl = document.createElement('span');
  timeEl.className = 'comment-time';
  timeEl.textContent = formatVideoTime(videoTime);
  if (videoTime != null) timeEl.dataset.videoTime = String(videoTime);

  const dateEl = document.createElement('span');
  dateEl.className = 'comment-date';
  dateEl.textContent = formatWriteDate(timestamp);

  row.appendChild(timeEl);
  row.appendChild(noEl);
  row.appendChild(nicknameEl);
  row.appendChild(textEl);
  row.appendChild(dateEl);

  return row;
}

// --- コメント表示 ---

function showEmpty(): void {
  clearElement(commentList);
  const emptyDiv = document.createElement('div');
  emptyDiv.className = 'empty-message';
  emptyDiv.textContent = t('comment_empty');
  commentList.appendChild(emptyDiv);
}

/** 動画再生位置 (秒) を MM:SS or H:MM:SS 形式にフォーマットする */
function formatVideoTime(seconds?: number): string {
  if (seconds == null || seconds < 0) return '--:--';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 書き込み日時をフォーマットする (例: 2026/02/25(水) 09:41) */
function formatWriteDate(ts: number): string {
  if (!ts) return '--';
  const d = new Date(ts);
  const weekdays = [t('weekday_sun'), t('weekday_mon'), t('weekday_tue'), t('weekday_wed'), t('weekday_thu'), t('weekday_fri'), t('weekday_sat')];
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const day = weekdays[d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${MM}/${dd}(${day}) ${hh}:${mm}`;
}

function addComment(text: string, nickname: string, timestamp: number, mine: boolean, admin = false, skipStats = false, videoTime?: number, userId?: string): void {
  const empty = commentList.querySelector('.empty-message');
  if (empty) empty.remove();

  commentNo++;
  const row = createCommentRow(commentNo, nickname, text, timestamp, mine, false, admin, videoTime, userId);

  // videoTime が有効な場合、再生時間順の正しい位置に挿入する
  if (videoTime != null) {
    const rows = commentList.querySelectorAll('.comment-row[data-video-time]');
    let insertBefore: Element | null = null;
    for (const existingRow of rows) {
      const vt = parseFloat((existingRow as HTMLElement).dataset.videoTime || '0');
      if (vt > videoTime) {
        insertBefore = existingRow;
        break;
      }
    }
    if (insertBefore) {
      commentList.insertBefore(row, insertBefore);
    } else {
      commentList.appendChild(row);
    }
  } else {
    commentList.appendChild(row);
  }
  commentCount++;

  // 勢い・累計更新 (バッファフラッシュ時はスキップ: 受信時に計上済み)
  if (!skipStats) {
    recordPace();
    updateTotal();
  }

  // DOM上限
  while (commentCount > MAX_DOM_COMMENTS) {
    const first = commentList.querySelector('.comment-row');
    if (first) {
      first.remove();
      commentCount--;
    } else {
      break;
    }
  }

  // 再生時間連動モード: handleVideoTimeUpdate に任せる (最下部スクロールしない)
  if (!isVideoTimeMode() && autoScroll) {
    commentList.scrollTop = commentList.scrollHeight;
  }
}

// --- スクロール制御 ---

const colHeader = document.querySelector('.col-header') as HTMLDivElement;

commentList.addEventListener('scroll', () => {
  // プログラム的スクロール中はユーザー操作判定をスキップ
  if (isProgrammaticScroll) {
    colHeader.scrollLeft = commentList.scrollLeft;
    return;
  }

  // 再生時間連動モード中: 手動スクロールで autoScroll を無効化しない
  // (handleVideoTimeUpdate が常にスクロール位置を制御する)
  if (isVideoTimeMode()) {
    colHeader.scrollLeft = commentList.scrollLeft;
    return;
  }

  // 非連動モード: 従来の自動スクロール判定
  const threshold = 40;
  const atBottom = commentList.scrollHeight - commentList.scrollTop - commentList.clientHeight < threshold;
  if (atBottom) {
    autoScroll = true;
    scrollBtn.classList.add('hidden');
  } else {
    autoScroll = false;
    scrollBtn.classList.remove('hidden');
  }
  // 横スクロール: カラムヘッダーと同期
  colHeader.scrollLeft = commentList.scrollLeft;
});

scrollBtn.addEventListener('click', () => {
  autoScroll = true;
  scrollBtn.classList.add('hidden');
  if (isVideoTimeMode()) {
    // 再生位置に即座にスクロール
    scrollToVideoTime(currentVideoTime);
  } else {
    commentList.scrollTop = commentList.scrollHeight;
  }
});

// --- 再生時間連動スクロール ---

/** プログラム的スクロールを安全に実行する (scroll イベントとの競合防止) */
function programmaticScroll(fn: () => void): void {
  isProgrammaticScroll = true;
  fn();
  // scroll イベントは scrollTop 設定後に非同期で発火するため、
  // setTimeout で確実にイベント処理後にフラグをリセットする
  setTimeout(() => { isProgrammaticScroll = false; }, 100);
}

/** 指定された再生時間の位置にスクロール+ハイライトする */
function scrollToVideoTime(videoTime: number): void {
  const rows = commentList.querySelectorAll('.comment-row[data-video-time]');
  if (rows.length === 0) return;

  // 現在のハイライトをクリア
  commentList.querySelectorAll('.comment-row.now-playing').forEach(el => {
    el.classList.remove('now-playing');
  });

  // 現在の再生位置以下の最後の行を見つける
  let targetRow: HTMLElement | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i] as HTMLElement;
    const vt = parseFloat(row.dataset.videoTime || '0');
    if (vt <= videoTime) {
      targetRow = row;
      break;
    }
  }

  if (!targetRow) return;

  // ハイライト: 現在時刻 ±2秒 の範囲
  for (const row of rows) {
    const el = row as HTMLElement;
    const vt = parseFloat(el.dataset.videoTime || '0');
    if (vt >= videoTime - 2 && vt <= videoTime + 1) {
      el.classList.add('now-playing');
    }
  }

  // targetRow が見えるようにスクロール (中央に配置)
  programmaticScroll(() => {
    const listRect = commentList.getBoundingClientRect();
    const rowRect = targetRow.getBoundingClientRect();
    const rowCenter = rowRect.top + rowRect.height / 2;
    const listCenter = listRect.top + listRect.height / 2;
    const offset = rowCenter - listCenter;
    commentList.scrollTop += offset;
  });
}

/** 動画再生位置の更新を受けてサイドパネルを自動スクロールする */
function handleVideoTimeUpdate(videoTime: number, paused: boolean): void {
  currentVideoTime = videoTime;

  // 動画時間ベースの勢い更新 (一時停止中も再生位置は変わらないが更新する)
  updateVideoTimePace(videoTime);

  if (paused) return; // 一時停止中はスクロールしない

  // ハイライト設定がオフの場合はスクロール・ハイライトしない
  if (!currentSettings.nowPlayingHighlight) return;

  scrollToVideoTime(videoTime);
}

// --- ログ同期後の再読み込み ---

async function reloadPastComments(): Promise<void> {
  if (!currentTitleId) return;

  // 過去ログ部分をクリアして再読み込み
  clearElement(commentList);
  commentCount = 0;
  commentNo = 0;
  totalComments = 0;

  await loadPastComments();

  // 過去ログが無かった場合、空メッセージ表示
  if (commentCount === 0) {
    showEmpty();
  }
}

// --- タイトル情報表示 ---

function updateTitleInfo(metadata: TitleMetadata): void {
  // タイトルIDが変わった場合はコメントリストも切り替え
  const titleChanged = metadata.titleId && metadata.titleId !== currentTitleId;
  if (titleChanged) {
    currentTitleId = metadata.titleId;
  }

  // タイトルはヘッダーに表示、サブタイトル+説明はタイトル情報エリアに表示
  setPanelTitle(metadata.title);
  titleNameEl.textContent = metadata.subtitle || '';
  titleSubtitleEl.textContent = '';
  titleDescriptionEl.textContent = metadata.description || '';
  titleInfoEl.classList.add('visible');

  // タイトルが変わったらバッファクリア + コメントリスト再読み込み
  if (titleChanged) {
    commentBuffer = [];
    updateBufferBanner();
    reloadPastComments();
    resetPace();
  }
}

/** アクティブタブにタイトル情報をリクエストしてコメントも再読み込みする */
async function reloadTitleAndComments(): Promise<void> {
  titleReloadBtn.classList.add('spinning');
  try {
    let metadataLoaded = false;

    // リトライ付きでタイトル情報取得 (コンテンツスクリプト初期化待ち)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const tab = await findNetflixTab();
        if (tab?.id !== undefined) {
          // URL からタイトルID更新
          if (tab.url) {
            const match = tab.url.match(/netflix\.com\/watch\/(\d+)/);
            if (match) currentTitleId = match[1];
          }

          // タイトル情報取得
          const metadata = await chrome.tabs.sendMessage(tab.id, { type: 'get-title-info' }).catch(() => null);
          if (metadata && (metadata as TitleMetadata).title) {
            const m = metadata as TitleMetadata;
            currentTitleId = m.titleId;
            setPanelTitle(m.title);
            titleNameEl.textContent = m.subtitle || '';
            titleSubtitleEl.textContent = '';
            titleDescriptionEl.textContent = m.description || '';
            titleInfoEl.classList.add('visible');
            metadataLoaded = true;
            break;
          }
        }
      } catch { /* コンテンツスクリプト未ロード */ }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
    }

    // メタデータ取得失敗でもURLベースでタイトルIDがあればコメントは読み込む
    if (!metadataLoaded && currentTitleId) {
      log('[Netflix Jikkyo SP] メタデータ取得失敗、URLベースで続行');
    }

    // 弾幕オーバーレイ再初期化 (タブ復帰でオーバーレイが外れた場合のリカバリ)
    try {
      const tab = await findNetflixTab();
      if (tab?.id !== undefined) {
        await chrome.tabs.sendMessage(tab.id, { type: 'reinit-danmaku' }).catch(() => null);
      }
    } catch { /* 無視 */ }

    // バッファフラッシュ + コメント再読み込み
    await flushCommentBuffer();
    resetPace();
    await reloadPastComments();
    await updateStatus();
  } catch {
    // エラーは無視
  } finally {
    titleReloadBtn.classList.remove('spinning');
  }
}

/** アクティブタブにタイトル情報をリクエストする (リトライ付き) */
async function requestTitleInfo(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tab = await findNetflixTab();
      if (tab?.id !== undefined) {
        // URL から titleId をフォールバック取得 (メタデータ取得前にIDだけ確保)
        if (!currentTitleId && tab.url) {
          const titleId = extractTitleId(tab.url);
          if (titleId) currentTitleId = titleId;
        }
        const metadata = await chrome.tabs.sendMessage(tab.id, { type: 'get-title-info' });
        if (metadata && (metadata as TitleMetadata).title) {
          updateTitleInfo(metadata as TitleMetadata);
          return;
        }
      }
    } catch {
      // コンテンツスクリプトが未ロードの場合は無視
    }
    // リトライ前に待機 (コンテンツスクリプト初期化待ち)
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

// --- リロードボタン ---

titleReloadBtn.addEventListener('click', () => {
  reloadTitleAndComments();
});

// --- 非Netflix画面の表示/非表示 ---

let isNoNetflixState = false;

function showNoNetflix(): void {
  isNoNetflixState = true;
  // 設定パネルが開いている間は案内オーバーレイを表示しない (閉じた時に反映)
  if (settingsSlide.classList.contains('nfjk-settings-open')) return;
  noNetflixEl.classList.remove('hidden');
  commentInput.disabled = true;
  sendBtn.disabled = true;
}

function hideNoNetflix(): void {
  isNoNetflixState = false;
  noNetflixEl.classList.add('hidden');
  commentInput.disabled = false;
  sendBtn.disabled = false;
  // タイトル情報が設定画面で非表示にされていた場合、復元
  if (currentTitleId && panelTitleEl.textContent) {
    titleInfoEl.classList.add('visible');
  }
}

// --- タブ変更ハンドラ ---

async function handleTabChanged(url: string, _tabId: number, reason: 'tab-switch' | 'url-change'): Promise<void> {
  const titleId = extractTitleId(url);
  const isNetflix = /netflix\.com/i.test(url);

  if (!titleId) {
    if (isNetflix) {
      // Netflixドメインだが作品ページではない → ヘッダーを "NETFLIX JIKKYO" にしてコメント非表示
      hideNoNetflix();
      currentTitleId = null;
      setPanelTitle('NETFLIX JIKKYO');
      titleNameEl.textContent = '';
      titleSubtitleEl.textContent = '';
      titleDescriptionEl.textContent = '';
      titleInfoEl.classList.remove('visible');
      clearElement(commentList);
      statusDot.classList.remove('connected');
      peerCountEl.textContent = t('stat_peers', { count: 0 });
      resetPace();
      return;
    }
    // Netflix以外のページ
    // タブ切替の場合、Netflix watchタブがまだ存在するなら状態を維持
    if (reason === 'tab-switch' && currentTitleId) {
      try {
        const tabs = await chrome.tabs.query({ url: '*://*.netflix.com/watch/*' });
        if (tabs.length > 0) return;
      } catch { /* fall through */ }
    }
    showNoNetflix();
    statusDot.classList.remove('connected');
    peerCountEl.textContent = t('stat_peers', { count: 0 });
    return;
  }

  // Netflix作品ページ → 設定が開いていたら閉じる + 案内を隠す
  settingsSlide.classList.remove('nfjk-settings-open');
  gearBtn.classList.remove('active');
  hideNoNetflix();
  statusDot.classList.add('connected');

  if (titleId !== currentTitleId) {
    // 別タイトルに切り替わった → コメント・タイトル再読み込み
    currentTitleId = titleId;
    resetPace();
    await reloadPastComments();

    // タイトル情報を再取得
    await requestTitleInfo();
    await updateStatus();
  } else if (reason === 'tab-switch') {
    // 同じタイトルのタブに戻ってきた → タイトル情報が未表示なら再取得
    if (!titleInfoEl.classList.contains('visible') || !panelTitleEl.textContent?.trim()) {
      await requestTitleInfo();
    }
  }
}

// --- メッセージ受信 ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
chrome.runtime.onMessage.addListener((message: any) => {
  // background 中継メッセージのみ処理 (tab-changed は background 発信なので除外)
  if (message.type !== 'tab-changed' && !message._relayed) {
    log(`[Netflix Jikkyo SP] Ignoring non-relayed message: ${message.type}`);
    return;
  }

  log(`[Netflix Jikkyo SP] Processing message: ${message.type}`, message._relayed ? '(relayed)' : '(direct)');

  if (message.type === 'comment') {
    const c = message.comment;
    // 基本型チェック (背景スクリプト経由でも防御的に検証)
    if (!c || typeof c.text !== 'string' || typeof c.nickname !== 'string' || typeof c.timestamp !== 'number') return;
    const text = c.text.slice(0, MAX_COMMENT_TEXT_LENGTH);
    const { nickname, timestamp, mine, admin, videoTime, userId } = c;
    if (mine) {
      // 自分のコメントは即座に表示 (今まで通り)
      addComment(text, nickname, timestamp, mine, admin, false, videoTime, userId);
    } else {
      // 他者のコメントはバッファに追加 (表示保留、勢い・累計はフラッシュ時に計上)
      bufferComment(text, nickname, timestamp, admin ?? false, videoTime, userId);
    }
  } else if (message.type === 'side-panel-peer-count') {
    peerCountEl.textContent = t('stat_peers', { count: message.count });
  } else if (message.type === 'log-synced') {
    log(`[Netflix Jikkyo] Log synced: ${message.count} comments for title ${message.titleId}`);
    reloadPastComments();
  } else if (message.type === 'title-ready') {
    // コンテンツスクリプトが新タイトルで初期化完了 → コメント即時読み込み
    if (message.titleId && message.titleId !== currentTitleId) {
      currentTitleId = message.titleId;
      hideNoNetflix();
      statusDot.classList.add('connected');
      resetPace();
      reloadPastComments();
    } else if (message.titleId && message.titleId === currentTitleId) {
      // 同じタイトルでも再初期化(リロード等)の場合はコメント再読み込み
      reloadPastComments();
    }
  } else if (message.type === 'title-info') {
    updateTitleInfo(message.metadata);
  } else if (message.type === 'video-time-update') {
    handleVideoTimeUpdate(message.videoTime, message.paused);
  } else if (message.type === 'tab-changed') {
    // ポップアウト時はタブ変更を無視 (タイトル固定表示)
    if (isPopout) return;
    // 自分のウィンドウのタブ変更のみ処理 (別ウィンドウの操作を無視)
    if (sidepanelWindowId !== undefined && message.windowId !== undefined && message.windowId !== sidepanelWindowId) {
      return;
    }
    handleTabChanged(message.url, message.tabId, message.reason);
  }
});

// --- 認証フロー ---

/** メインUI初期化 (認証済み＆オンボーディング完了後) */
async function initMainUI(): Promise<void> {
  // サイドパネルのウィンドウIDを取得 (マルチウィンドウ対応)
  try {
    const win = await chrome.windows.getCurrent();
    sidepanelWindowId = win.id;
    log(`[Netflix Jikkyo SP] Window ID: ${sidepanelWindowId}`);
  } catch {
    // フォールバック: backgroundに問い合わせ
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'get-window-id' });
      if (resp?.windowId !== undefined) {
        sidepanelWindowId = resp.windowId;
        log(`[Netflix Jikkyo SP] Window ID (from BG): ${sidepanelWindowId}`);
      }
    } catch { /* ignore */ }
  }

  // ログインユーザーID取得 (自分のコメント判定用)
  const authState = await loadAuthState();
  currentUserId = authState.user?.googleId ?? null;

  showEmpty();
  initSettings();
  initAccordion();
  startPaceTimer();
  updateAllPreviews();

  // 言語変更時に動的文字列を再レンダリング
  onLocaleChange(() => {
    applyTranslations();
    // 動的に生成されたテキストを再更新
    updateAllPreviews();
    resetPace();
    statTotal.textContent = t('stat_total', { count: totalComments });
    if (commentCount === 0) showEmpty();
    document.documentElement.lang = getLocale();
  });

  if (isPopout) {
    // ポップアウトモード: session storageから状態復元
    document.body.classList.add('nfjk-popout');
    try {
      const result = await chrome.storage.session.get('popoutState');
      const state = result.popoutState;
      if (state) {
        currentTitleId = state.titleId;
        setPanelTitle(state.title || '');
        titleNameEl.textContent = state.subtitle || '';
        titleSubtitleEl.textContent = '';
        titleDescriptionEl.textContent = state.description || '';
        titleInfoEl.classList.add('visible');
        hideNoNetflix();
        statusDot.classList.add('connected');
      }
    } catch { /* ignore */ }
    await updateStatus();
    await loadPastComments();
  } else {
    // 通常サイドパネル
    await updateStatus();
    await requestTitleInfo();
    await loadPastComments();
  }
}

/** 認証状態チェック → UI切り替え */
async function checkAuth(): Promise<void> {
  const authState = await loadAuthState();

  if (!authState.isAuthenticated) {
    // 未認証 → 認証ゲート表示
    authGate.classList.remove('hidden');
    onboardingEl.classList.add('hidden');
    return;
  }

  if (!authState.onboardingCompleted) {
    // 認証済み＆オンボーディング未完了
    authGate.classList.add('hidden');
    onboardingEl.classList.remove('hidden');

    // アバター設定
    if (authState.user?.avatarUrl) {
      onboardingAvatar.src = authState.user.avatarUrl;
      onboardingAvatar.alt = authState.user.displayName;
    }

    // デフォルトニックネーム (Google表示名を18文字切り詰め)
    const defaultName = (authState.user?.displayName || '').slice(0, 18);
    onboardingNickname.value = defaultName;
    onboardingCharCount.textContent = `${defaultName.length}/18`;
    return;
  }

  // 認証済み＆オンボーディング完了 → メインUI
  authGate.classList.add('hidden');
  onboardingEl.classList.add('hidden');
  await initMainUI();
}

// --- Googleログインボタン ---

authGoogleBtn.addEventListener('click', async () => {
  authGoogleBtn.disabled = true;
  authError.textContent = '';
  try {
    await signInWithGoogle();
    await checkAuth(); // オンボーディングへ遷移
  } catch (e) {
    authError.textContent = e instanceof Error ? e.message : t('auth_login_failed');
  } finally {
    authGoogleBtn.disabled = false;
  }
});

// --- オンボーディング ---

onboardingNickname.addEventListener('input', () => {
  const len = onboardingNickname.value.length;
  onboardingCharCount.textContent = `${len}/18`;
});

onboardingStartBtn.addEventListener('click', async () => {
  const validation = validateNickname(onboardingNickname.value);
  if (!validation.valid) {
    onboardingError.textContent = validation.error!;
    return;
  }
  onboardingError.textContent = '';
  onboardingStartBtn.disabled = true;

  try {
    await changeNickname(onboardingNickname.value);
    await completeOnboarding();
    await checkAuth(); // メインUIへ遷移
  } catch (e) {
    onboardingError.textContent = t('onboarding_error');
    console.error('[Netflix Jikkyo] Onboarding error:', e);
  } finally {
    onboardingStartBtn.disabled = false;
  }
});

// --- ログアウト ---

signoutBtn.addEventListener('click', async () => {
  await signOut();
  // 設定スライドを閉じてから認証ゲートへ
  settingsSlide.classList.remove('nfjk-settings-open');
  gearBtn.classList.remove('active');
  await checkAuth();
});

// --- バックドロップ (メニュー/ポップアップ共通) ---

function showBackdrop(): void {
  backdrop.classList.remove('hidden');
}

function hideBackdrop(): void {
  backdrop.classList.add('hidden');
}

// バックドロップクリック → すべてのポップアップを閉じる
backdrop.addEventListener('click', () => {
  closeCtxMenu();
  closeOffsetPopup();
});

// --- オフセットポップアップ ---

let offsetVideoTime: number | null = null;

function openOffsetPopup(timeEl: HTMLElement): void {
  const vt = parseFloat(timeEl.dataset.videoTime || '');
  if (isNaN(vt)) return;
  offsetVideoTime = vt;

  // 位置計算
  const area = contentArea.getBoundingClientRect();
  const rect = timeEl.getBoundingClientRect();

  let left = rect.right - area.left + 4;
  let top = rect.top - area.top - 2;

  // 表示して幅取得
  offsetPopup.classList.remove('hidden');
  showBackdrop();

  const pw = offsetPopup.offsetWidth;
  const ph = offsetPopup.offsetHeight;
  if (left + pw > area.width) left = rect.left - area.left - pw - 4;
  if (top + ph > area.height) top = area.height - ph - 4;
  if (left < 0) left = 4;
  if (top < 0) top = 4;

  offsetPopup.style.left = `${left}px`;
  offsetPopup.style.top = `${top}px`;
}

function closeOffsetPopup(): void {
  offsetPopup.classList.add('hidden');
  offsetVideoTime = null;
  hideBackdrop();
}

// オフセットを合わせるボタン → 動画をシーク
offsetBtn.addEventListener('click', async () => {
  if (offsetVideoTime == null) return;
  try {
    const tab = await findNetflixTab();
    if (tab?.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, { type: 'seek-video', time: offsetVideoTime });
    }
  } catch { /* 無視 */ }
  closeOffsetPopup();
});

// --- コメントコンテキストメニュー ---

let ctxActiveRow: HTMLDivElement | null = null;

function openCtxMenu(row: HTMLDivElement, x: number, y: number): void {
  const text = row.dataset.commentText || '';
  const userId = row.dataset.userId || '';

  // 内容セット
  ctxCommentText.textContent = text;
  ctxCopyCommentPreview.textContent = text;
  ctxCopyUserIdPreview.textContent = userId || t('ctx_userid_unknown');

  // ユーザーIDがない場合はコピー・NG追加を無効化
  ctxCopyUserId.style.display = userId ? '' : 'none';
  ctxNgUserId.style.display = userId ? '' : 'none';

  // ボタン状態リセット
  ctxCopyComment.classList.remove('nfjk-ctx-done');
  ctxCopyUserId.classList.remove('nfjk-ctx-done');
  ctxNgComment.classList.remove('nfjk-ctx-done');
  ctxNgUserId.classList.remove('nfjk-ctx-done');

  // アクティブ行ハイライト
  if (ctxActiveRow) ctxActiveRow.classList.remove('nfjk-ctx-active');
  row.classList.add('nfjk-ctx-active');
  ctxActiveRow = row;

  // 表示
  ctxMenu.classList.remove('hidden');
  showBackdrop();

  // 位置計算 (content-area内に収まるように)
  const area = contentArea.getBoundingClientRect();
  const menuWidth = ctxMenu.offsetWidth;
  const menuHeight = ctxMenu.offsetHeight;

  let left = x - area.left;
  let top = y - area.top;

  // 右端・下端はみ出し補正
  if (left + menuWidth > area.width) left = area.width - menuWidth - 4;
  if (top + menuHeight > area.height) top = top - menuHeight;
  if (left < 0) left = 4;
  if (top < 0) top = 4;

  ctxMenu.style.left = `${left}px`;
  ctxMenu.style.top = `${top}px`;
}

function closeCtxMenu(): void {
  ctxMenu.classList.add('hidden');
  hideBackdrop();
  if (ctxActiveRow) {
    ctxActiveRow.classList.remove('nfjk-ctx-active');
    ctxActiveRow = null;
  }
}

// コメント行クリック → 再生時間ならオフセット、それ以外ならコンテキストメニュー
commentList.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;

  // 再生時間クリック → オフセットポップアップ
  if (target.classList.contains('comment-time')) {
    e.stopPropagation();
    closeCtxMenu(); // 既存メニューを閉じる
    openOffsetPopup(target);
    return;
  }

  // コメント行クリック → コンテキストメニュー
  const row = target.closest('.comment-row') as HTMLDivElement | null;
  if (!row) return;
  e.stopPropagation();
  closeOffsetPopup(); // 既存ポップアップを閉じる
  openCtxMenu(row, e.clientX, e.clientY);
});

// コメントをコピー
ctxCopyComment.addEventListener('click', async () => {
  const text = ctxActiveRow?.dataset.commentText || '';
  await navigator.clipboard.writeText(text);
  ctxCopyComment.classList.add('nfjk-ctx-done');
  const label = ctxCopyComment.querySelector('.nfjk-ctx-item-label')!;
  const prev = label.textContent;
  label.textContent = t('ctx_copied');
  setTimeout(() => {
    label.textContent = prev;
    ctxCopyComment.classList.remove('nfjk-ctx-done');
    closeCtxMenu();
  }, 800);
});

// ユーザーIDをコピー
ctxCopyUserId.addEventListener('click', async () => {
  const userId = ctxActiveRow?.dataset.userId || '';
  await navigator.clipboard.writeText(userId);
  ctxCopyUserId.classList.add('nfjk-ctx-done');
  const label = ctxCopyUserId.querySelector('.nfjk-ctx-item-label')!;
  const prev = label.textContent;
  label.textContent = t('ctx_copied');
  setTimeout(() => {
    label.textContent = prev;
    ctxCopyUserId.classList.remove('nfjk-ctx-done');
    closeCtxMenu();
  }, 800);
});

// NG設定にコメントを追加
ctxNgComment.addEventListener('click', async () => {
  const text = ctxActiveRow?.dataset.commentText || '';
  if (!text) return;
  const settings = await loadSettings();
  if (!settings.ngComments.includes(text)) {
    settings.ngComments.push(text);
    await saveSettings(settings);
    // カウント更新
    ngCommentCount.textContent = t('ng_count', { count: settings.ngComments.length });
    updateNgPreview(settings);
    if (currentSettings) currentSettings.ngComments = settings.ngComments;
  }
  ctxNgComment.classList.add('nfjk-ctx-done');
  const label = ctxNgComment.querySelector('.nfjk-ctx-item-label')!;
  label.textContent = t('ctx_ng_added');
  setTimeout(() => {
    label.textContent = t('ctx_ng_add_comment');
    ctxNgComment.classList.remove('nfjk-ctx-done');
    closeCtxMenu();
  }, 800);
});

// NG設定にユーザーIDを追加
ctxNgUserId.addEventListener('click', async () => {
  const userId = ctxActiveRow?.dataset.userId || '';
  if (!userId) return;
  const settings = await loadSettings();
  if (!settings.ngUserIds.includes(userId)) {
    settings.ngUserIds.push(userId);
    await saveSettings(settings);
    // カウント更新
    ngUserIdCount.textContent = t('ng_count', { count: settings.ngUserIds.length });
    updateNgPreview(settings);
    if (currentSettings) currentSettings.ngUserIds = settings.ngUserIds;
  }
  ctxNgUserId.classList.add('nfjk-ctx-done');
  const label = ctxNgUserId.querySelector('.nfjk-ctx-item-label')!;
  label.textContent = t('ctx_ng_added');
  setTimeout(() => {
    label.textContent = t('ctx_ng_add_userid');
    ctxNgUserId.classList.remove('nfjk-ctx-done');
    closeCtxMenu();
  }, 800);
});

// --- 初期化 ---

checkAuth();

