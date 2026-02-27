// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { v4 as uuidv4 } from 'uuid';
import './danmaku.css';
import { getTitleId, getPlayerContainer, watchNavigation, waitForElement, getTitleMetadata } from '../utils/netflix';
import { createOverlay, removeOverlay, watchFullscreen } from './overlay';
import { DanmakuRenderer } from './danmaku';
import { P2PRoom, createRoom } from './room';
import {
  saveComment, saveComments, cleanupOldComments, getCommentsByTitleSince, getLatestTimestamp,
  trimCommentsByTitle, getCommentsByTitle, getStorageStats, estimateStorageSize,
  exportAllComments, clearAllComments, deleteLatestComments,
} from './storage';
import { signComment, verifyAdminSignature, loadAdminPrivateKey } from '../utils/crypto';
import type { Comment, DanmakuItem, FeatureFlags, P2PCommentMessage, P2PLogRequest, P2PLogResponse, Settings, SidePanelComment, SidePanelLogSynced, SidePanelTitleInfo } from '../types';
import { DEFAULT_SETTINGS, DEFAULT_FEATURE_FLAGS, MAX_COMMENT_TEXT_LENGTH, MAX_TITLE_ID_LENGTH } from '../types';
import { isNGComment, isUserNGComment } from '../utils/ng-filter';
import { sanitizeText, sanitizeId } from '../utils/sanitize';
import { setLocale } from '../i18n';
import { log, warn } from '../utils/logger';

let danmakuBuffer: DanmakuItem[] = [];

/** ログ同期チャンクサイズ */
const LOG_SYNC_CHUNK_SIZE = 200;

/** タイトル別コメント最大保持数 */
const MAX_COMMENTS_PER_TITLE = 10000;

let danmaku: DanmakuRenderer | null = null;
let room: P2PRoom | null = null;
let adminPrivateKey: JsonWebKey | null = null;
let cleanupNav: (() => void) | null = null;
let cleanupFs: (() => void) | null = null;
let cleanupVideo: (() => void) | null = null;
let videoObserver: MutationObserver | null = null;
let connectedVideo: HTMLVideoElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let currentTitleId: string | null = null;
let settings: Settings = { ...DEFAULT_SETTINGS };
let featureFlags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS };
let currentUserId: string | undefined;

let pauseBuffer: DanmakuItem[] = [];

/** 過去コメント弾幕再生 */
let pastDanmakuComments: Comment[] = [];
let pastDanmakuIndex = 0;
let lastVideoTime = -1;

/** 動画の現在再生位置 (秒) を取得する */
function getVideoCurrentTime(): number {
  const video = document.querySelector('video');
  return video ? video.currentTime : 0;
}

async function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get('settings', (result) => {
      if (result.settings) {
        resolve({ ...DEFAULT_SETTINGS, ...result.settings });
      } else {
        resolve({ ...DEFAULT_SETTINGS });
      }
    });
  });
}

/** 全リソースをクリーンアップする */
function cleanup(): void {
  danmaku?.destroy();
  danmaku = null;
  room?.destroy();
  room = null;
  danmakuBuffer = [];
  pauseBuffer = [];
  pastDanmakuComments = [];
  pastDanmakuIndex = 0;
  lastVideoTime = -1;
  removeOverlay();
  if (cleanupFs) {
    cleanupFs();
    cleanupFs = null;
  }
  if (cleanupVideo) {
    cleanupVideo();
    cleanupVideo = null;
  }
  if (videoObserver) {
    videoObserver.disconnect();
    videoObserver = null;
  }
  connectedVideo = null;
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  currentTitleId = null;
  lastSentTitle = '';
}

function updateBadge(count: number): void {
  chrome.runtime.sendMessage({ type: 'peer-count', count }).catch(() => {
    // Service Worker が非アクティブの場合は無視
  });
}

let lastSentTitle = '';

/** サイドパネルにタイトル情報を送信する */
async function sendTitleInfoToSidePanel(): Promise<void> {
  if (!currentTitleId) return;
  const metadata = await getTitleMetadata(currentTitleId);
  // "タイトル {id}" フォールバック値の場合は送信しない
  if (metadata.title === `タイトル ${currentTitleId}`) return;
  // 同じタイトルは再送しない
  if (metadata.title === lastSentTitle) return;
  lastSentTitle = metadata.title;
  const msg: SidePanelTitleInfo = { type: 'title-info', metadata };
  chrome.runtime.sendMessage(msg).catch(() => {
    // サイドパネルが閉じている場合は無視
  });
}

/** document.title の変更を監視してタイトル情報を再送する */
function watchDocumentTitle(): void {
  let prevTitle = document.title;
  const observer = new MutationObserver(() => {
    if (document.title !== prevTitle) {
      prevTitle = document.title;
      sendTitleInfoToSidePanel();
    }
  });
  const titleEl = document.querySelector('title');
  if (titleEl) {
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }
}

/** サイドパネルにコメントを送信する */
function sendToSidePanel(text: string, nickname: string, timestamp: number, mine: boolean, admin = false, videoTime?: number, userId?: string): void {
  const msg: SidePanelComment = {
    type: 'comment',
    comment: { text, nickname, timestamp, mine, admin, videoTime, userId },
  };
  chrome.runtime.sendMessage(msg).catch(() => {
    // サイドパネルが閉じている場合は無視
  });
}

async function handleLogSyncRequest(request: P2PLogRequest, peerId: string): Promise<void> {
  if (!room || !currentTitleId) return;
  if (request.titleId !== currentTitleId) return;

  try {
    const comments = request.sinceTimestamp
      ? await getCommentsByTitleSince(request.titleId, request.sinceTimestamp)
      : await getCommentsByTitleSince(request.titleId, 0);

    const totalChunks = Math.max(1, Math.ceil(comments.length / LOG_SYNC_CHUNK_SIZE));
    log(`Sending ${comments.length} comments in ${totalChunks} chunks to peer: ${peerId}`);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = comments.slice(i * LOG_SYNC_CHUNK_SIZE, (i + 1) * LOG_SYNC_CHUNK_SIZE);
      const response: P2PLogResponse = {
        titleId: request.titleId,
        comments: chunk,
        chunkIndex: i,
        totalChunks,
        done: i === totalChunks - 1,
      };
      room.sendLogResponseChunk(response, peerId);

      // WebRTCバッファ溢れ防止: チャンク間に100ms間隔
      if (i < totalChunks - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  } catch (e) {
    console.error('[Netflix Jikkyo] Failed to handle log sync request:', e);
  }
}

async function handleLogSyncResponse(response: P2PLogResponse, _peerId: string): Promise<void> {
  if (!currentTitleId || response.titleId !== currentTitleId) return;

  try {
    if (response.comments.length > 0) {
      await saveComments(response.comments);
      log(`Synced chunk ${response.chunkIndex + 1}/${response.totalChunks} (${response.comments.length} comments)`);
    }

    // 全チャンク受信完了 → サイドパネルに通知 + 過去弾幕リロード
    if (response.done) {
      const totalSynced = response.chunkIndex * LOG_SYNC_CHUNK_SIZE + response.comments.length;
      log(`Log sync complete: ${totalSynced} comments`);

      // 1万件超過をトリム + 過去弾幕配列をリロード
      if (currentTitleId) {
        trimCommentsByTitle(currentTitleId, MAX_COMMENTS_PER_TITLE).catch(console.error);
        loadPastDanmaku(currentTitleId);
      }

      const msg: SidePanelLogSynced = {
        type: 'log-synced',
        titleId: response.titleId,
        count: totalSynced,
      };
      chrome.runtime.sendMessage(msg).catch(() => {
        // サイドパネルが閉じている場合は無視
      });
    }
  } catch (e) {
    console.error('[Netflix Jikkyo] Failed to handle log sync response:', e);
  }
}

/** 過去コメントをIndexedDBから読み込み、videoTime順にソートする */
async function loadPastDanmaku(titleId: string): Promise<void> {
  try {
    const comments = await getCommentsByTitleSince(titleId, 0);
    pastDanmakuComments = comments
      .filter(c => c.videoTime != null && c.videoTime >= 0)
      .sort((a, b) => (a.videoTime || 0) - (b.videoTime || 0));
    pastDanmakuIndex = 0;
    lastVideoTime = -1;
    log(`Loaded ${pastDanmakuComments.length} past comments for danmaku playback`);
  } catch (e) {
    console.error('[Netflix Jikkyo] Failed to load past danmaku:', e);
  }
}

function insertPastDanmakuComment(comment: Comment): void {
  if (comment.videoTime == null || comment.videoTime < 0) return;
  const vt = comment.videoTime;
  // 二分探索で挿入位置を見つける
  let lo = 0, hi = pastDanmakuComments.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((pastDanmakuComments[mid].videoTime || 0) <= vt) lo = mid + 1;
    else hi = mid;
  }
  pastDanmakuComments.splice(lo, 0, comment);
  // 挿入位置が現在のインデックス以前なら、インデックスをずらす
  if (lo <= pastDanmakuIndex) pastDanmakuIndex++;
}

/** video要素にイベントリスナーを接続する */
function attachVideoListeners(video: HTMLVideoElement): void {
  // 既存リスナーをクリーンアップ
  if (cleanupVideo) {
    cleanupVideo();
    cleanupVideo = null;
  }
  connectedVideo = video;

  const onPause = () => {
    danmaku?.pause();
    log('Video paused → danmaku paused');
  };
  const onPlay = () => {
    danmaku?.resume();
    // 一時停止中に溜まったコメントを流す
    for (const item of pauseBuffer) {
      danmaku?.draw(item);
    }
    pauseBuffer = [];
    log('Video playing → danmaku resumed');
  };
  const onTimeUpdate = () => onVideoTimeUpdate();

  video.addEventListener('pause', onPause);
  video.addEventListener('play', onPlay);
  video.addEventListener('timeupdate', onTimeUpdate);

  // 初期状態が一時停止中の場合
  if (video.paused) {
    danmaku?.pause();
  }

  cleanupVideo = () => {
    video.removeEventListener('pause', onPause);
    video.removeEventListener('play', onPlay);
    video.removeEventListener('timeupdate', onTimeUpdate);
    connectedVideo = null;
  };

  log('Video listeners attached');
}

function watchVideoElement(): void {
  // 既存のobserverを解除
  if (videoObserver) {
    videoObserver.disconnect();
    videoObserver = null;
  }

  // 既存のvideoがあれば即接続
  const existing = document.querySelector('video');
  if (existing) {
    attachVideoListeners(existing);
  }

  // video要素の出現・消失を監視
  videoObserver = new MutationObserver(() => {
    const video = document.querySelector('video');
    if (video && video !== connectedVideo) {
      log('New video element detected, re-attaching listeners');
      attachVideoListeners(video);
    }
  });

  videoObserver.observe(document.body, { childList: true, subtree: true });
}

let lastVideoTimeSent = 0;

/** 動画のtimeupdateで過去コメントを弾幕として描画する + サイドパネルに再生時間を送信 */
function onVideoTimeUpdate(): void {
  const video = document.querySelector('video');
  if (!video) return;

  const currentTime = video.currentTime;

  // サイドパネルに再生時間を送信 (1秒間隔スロットル)
  const now = Date.now();
  if (now - lastVideoTimeSent >= 1000) {
    lastVideoTimeSent = now;
    chrome.runtime.sendMessage({
      type: 'video-time-update',
      videoTime: currentTime,
      paused: video.paused,
    }).catch(() => {});
  }

  if (!danmaku || danmaku.isPaused()) return;
  if (pastDanmakuComments.length === 0) return;

  // シーク検出 (2秒以上の飛びor巻き戻し)
  if (lastVideoTime >= 0 && (currentTime < lastVideoTime - 0.5 || currentTime > lastVideoTime + 2)) {
    // シーク → インデックスをリセット
    pastDanmakuIndex = pastDanmakuComments.findIndex(c => (c.videoTime || 0) > currentTime);
    if (pastDanmakuIndex === -1) pastDanmakuIndex = pastDanmakuComments.length;
  }
  lastVideoTime = currentTime;

  // 現在時刻までのコメントを描画
  while (pastDanmakuIndex < pastDanmakuComments.length) {
    const c = pastDanmakuComments[pastDanmakuIndex];
    const vt = c.videoTime || 0;
    if (vt <= currentTime) {
      // 2秒以内のコメントのみ描画 (遠い過去は飛ばす)
      if (currentTime - vt < 2) {
        const isMine = !!currentUserId && c.userId === currentUserId;
        danmaku.draw({ text: c.text, mine: isMine });
      }
      pastDanmakuIndex++;
    } else {
      break;
    }
  }
}

async function initialize(): Promise<void> {
  const titleId = getTitleId();
  if (!titleId) return;

  // 同じタイトルなら再初期化しない
  if (titleId === currentTitleId) return;

  // 前のセッションをクリーンアップ
  cleanup();
  currentTitleId = titleId;

  log(`Initializing for title: ${titleId}`);

  // けいふぉんと注入
  injectKeifont();

  // 設定読み込み
  settings = await loadSettings();

  // i18n初期化
  await setLocale(settings.language || 'ja');

  try {
    currentUserId = await new Promise<string | undefined>((resolve) => {
      chrome.storage.local.get('authState', (result) => {
        resolve(result.authState?.user?.googleId);
      });
    });
  } catch {
    currentUserId = undefined;
  }

  // 管理者秘密鍵読み込み
  adminPrivateKey = await loadAdminPrivateKey();

  // プレイヤーDOM出現待ち (複数セレクタを試行)
  const playerSelectors = [
    '.watch-video--player-view',
    '[data-uia="video-canvas"]',
    '[data-uia="player"]',
    '.watch-video',
  ];

  let playerContainer: HTMLElement | null = null;

  for (const selector of playerSelectors) {
    try {
      playerContainer = await waitForElement(selector, 5000);
      log(`Player found with: ${selector}`);
      break;
    } catch {
      // 次のセレクタを試す
    }
  }

  // 最終フォールバック
  if (!playerContainer) {
    playerContainer = getPlayerContainer();
  }

  if (!playerContainer) {
    warn('Player container not found, retrying in 3s...');
    setTimeout(() => {
      currentTitleId = null; // リトライ可能にする
      initialize();
    }, 3000);
    return;
  }

  // 弾幕オーバーレイ作成
  const overlay = createOverlay(playerContainer);

  // 弾幕レンダラー初期化
  danmaku = new DanmakuRenderer({
    container: overlay,
    settings,
  });

  // リサイズ対応
  resizeObserver = new ResizeObserver(() => {
    danmaku?.resize();
  });
  resizeObserver.observe(playerContainer);

  // フルスクリーン対応
  cleanupFs = watchFullscreen(
    () => getPlayerContainer(),
    (newOverlay) => {
      danmaku?.destroy();
      danmaku = new DanmakuRenderer({
        container: newOverlay,
        settings,
      });
    },
  );

  watchVideoElement();

  // リモート機能フラグ取得
  try {
    featureFlags = await new Promise<FeatureFlags>((resolve) => {
      chrome.runtime.sendMessage({ type: 'get-feature-flags' }, (response) => {
        resolve(response ?? DEFAULT_FEATURE_FLAGS);
      });
    });
    log('Feature flags:', featureFlags);
  } catch {
    featureFlags = { ...DEFAULT_FEATURE_FLAGS };
  }

  room = createRoom(titleId, {
    onComment: async (msg, peerId) => {
      // NGフィルター: ブロック対象はスキップ (管理者は除外)
      const isAdminMsg = msg.admin === '1' && msg.signature;
      if (!isAdminMsg) {
        if (isNGComment(msg.text)) {
          log('NG comment blocked:', msg.text.slice(0, 20));
          return;
        }
        if (isUserNGComment(msg.text, settings.ngComments, msg.userId ?? peerId, settings.ngUserIds)) {
          log('User NG blocked:', msg.text.slice(0, 20));
          return;
        }
      }

      // 管理者署名を検証
      let isAdmin = false;
      if (msg.admin === '1' && msg.signature) {
        isAdmin = await verifyAdminSignature(msg.id, msg.text, msg.timestamp, msg.signature);
      }

      const videoTime = msg.videoTime ?? getVideoCurrentTime();
      const displayText = msg.text.slice(0, MAX_COMMENT_TEXT_LENGTH);

      if (danmaku?.isPaused()) {
        pauseBuffer.push({ text: displayText, admin: isAdmin });
      } else {
        danmakuBuffer.push({ text: displayText, admin: isAdmin });
      }

      // サイドパネルに送信
      sendToSidePanel(displayText, msg.nickname, msg.timestamp, false, isAdmin, videoTime, msg.userId);

      // IndexedDB に保存
      const comment: Comment = {
        id: msg.id,
        text: displayText,
        nickname: msg.nickname,
        timestamp: msg.timestamp,
        titleId,
        videoTime,
        userId: msg.userId,
      };
      saveComment(comment).catch(console.error);
      // 過去弾幕配列に挿入 (次回シーク時に再生可能にする)
      insertPastDanmakuComment(comment);
    },
    onPeerJoin: async (peerId) => {
      const count = (room?.getPeerCount() ?? 0) + 1; // +1 で自分自身を含める
      updateBadge(count);

      // ログ同期リクエスト送信
      if (room && currentTitleId) {
        const sinceTimestamp = await getLatestTimestamp(currentTitleId);
        room.requestLogSync(peerId, sinceTimestamp ?? undefined);
      }
    },
    onPeerLeave: (_peerId) => {
      const count = (room?.getPeerCount() ?? 0) + 1; // +1 で自分自身を含める
      updateBadge(count);
    },
    onLogRequest: (request, peerId) => {
      handleLogSyncRequest(request, peerId);
    },
    onLogResponse: (response, peerId) => {
      handleLogSyncResponse(response, peerId);
    },
  }, featureFlags);

  updateBadge(1);

  // サイドパネルにタイトル準備完了を即座に通知 (コメント読み込みトリガー)
  chrome.runtime.sendMessage({ type: 'title-ready', titleId }).catch(() => {});

  sendTitleInfoToSidePanel();
  setTimeout(() => sendTitleInfoToSidePanel(), 2000);
  setTimeout(() => sendTitleInfoToSidePanel(), 5000);
  watchDocumentTitle();

  // 過去コメントの弾幕再生用に読み込み
  await loadPastDanmaku(titleId);

  // 起動時にIndexedDBクリーンアップ
  cleanupOldComments().then((deleted) => {
    if (deleted > 0) {
      log(`Cleaned up ${deleted} old comments`);
    }
  }).catch(console.error);
}

async function handleCommentSend(text: string, titleId: string, fromSidePanel = false): Promise<void> {
  // テキスト無害化
  const sanitized = sanitizeText(text, MAX_COMMENT_TEXT_LENGTH);
  if (!sanitized) return;
  text = sanitized;

  // NGフィルター: 送信前チェック
  if (isNGComment(text)) {
    log('NG comment rejected (send):', text.slice(0, 20));
    return;
  }

  const id = uuidv4();
  const timestamp = Date.now();
  const videoTime = getVideoCurrentTime();
  const isAdmin = adminPrivateKey !== null;

  // 管理者の場合は署名を付与
  let signature: string | undefined;
  if (isAdmin && adminPrivateKey) {
    try {
      signature = await signComment(adminPrivateKey, id, text, timestamp);
    } catch (e) {
      console.error('[Netflix Jikkyo] Admin signing failed:', e);
    }
  }

  // ローカル描画 (自分のコメント)
  danmaku?.draw({ text, mine: true, admin: isAdmin });

  // バッファフラッシュ: 蓄積された受信コメントをまとめて描画
  for (const item of danmakuBuffer) {
    danmaku?.draw(item);
  }
  danmakuBuffer = [];

  // サイドパネルに送信 (サイドパネル経由のコメントは楽観UIで表示済みなので送らない)
  if (!fromSidePanel) {
    sendToSidePanel(text, settings.nickname || 'ゲスト', timestamp, true, isAdmin, videoTime, currentUserId);
  }

  // P2P送信
  const msg: P2PCommentMessage = {
    id,
    text,
    nickname: settings.nickname || 'ゲスト',
    timestamp,
    videoTime,
    userId: currentUserId,
    admin: isAdmin ? '1' : undefined,
    signature,
  };
  room?.send(msg);

  // IndexedDB 保存
  const comment: Comment = {
    id,
    text,
    nickname: settings.nickname || 'ゲスト',
    timestamp,
    titleId,
    videoTime,
    userId: currentUserId,
  };
  saveComment(comment).catch(console.error);
  // 過去弾幕配列に挿入 (次回シーク時に再生可能にする)
  insertPastDanmakuComment(comment);
}

// --- けいふぉんと注入 ---

function injectKeifont(): void {
  if (document.getElementById('nfjk-keifont')) return;
  const fontUrl = chrome.runtime.getURL('fonts/keifont.ttf');
  const style = document.createElement('style');
  style.id = 'nfjk-keifont';
  style.textContent = `@font-face { font-family: 'keifont'; src: url('${fontUrl}') format('truetype'); font-display: swap; }`;
  document.head.appendChild(style);
}

// --- エントリポイント ---

// SPA遷移監視
cleanupNav = watchNavigation((url) => {
  if (url.includes('/watch/')) {
    initialize();
  } else {
    cleanup();
    updateBadge(0);
  }
});

// ページ離脱時クリーンアップ
window.addEventListener('beforeunload', () => {
  cleanup();
  if (cleanupNav) {
    cleanupNav();
    cleanupNav = null;
  }
});

// 設定変更を監視
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings?.newValue) {
    const newSettings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    // 言語変更検知
    if (newSettings.language && newSettings.language !== settings.language) {
      setLocale(newSettings.language);
    }
    settings = newSettings;
    danmaku?.updateSettings(settings);
  }
});

// メッセージ受信 (ping応答 + サイドパネルからのコメント送信)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'ping') {
    sendResponse('pong');
    return;
  }
  if (message.type === 'get-title-info') {
    if (currentTitleId) {
      getTitleMetadata(currentTitleId).then((metadata) => {
        sendResponse(metadata);
      }).catch(() => {
        sendResponse(null);
      });
      return true; // 非同期sendResponse
    } else {
      sendResponse(null);
    }
    return;
  }
  if (message.type === 'sidepanel-send-comment' && currentTitleId) {
    // サイドパネルに videoTime を返送してから送信処理
    sendResponse({ videoTime: getVideoCurrentTime() });
    handleCommentSend(message.text, currentTitleId, true);
    return; // sendResponse 済み
  }
  // 動画シーク (サイドパネルからのオフセット合わせ)
  if (message.type === 'seek-video') {
    if (typeof message.time === 'number') {
      document.dispatchEvent(new CustomEvent('nfjk-seek', {
        detail: { timeMs: message.time * 1000 },
      }));
    }
  }
  // 弾幕バッファフラッシュ (サイドパネルからの通知)
  if (message.type === 'flush-danmaku') {
    for (const item of danmakuBuffer) {
      danmaku?.draw(item);
    }
    danmakuBuffer = [];
  }
  // 弾幕オーバーレイ再初期化 (タブ復帰時にオーバーレイが外れた場合のリカバリ)
  if (message.type === 'reinit-danmaku') {
    const overlayEl = document.getElementById('nfjk-danmaku-overlay');
    const needsReinit = !danmaku || !overlayEl || !document.body.contains(overlayEl);
    if (needsReinit && currentTitleId) {
      log('Reinitializing danmaku overlay...');
      const container = getPlayerContainer();
      if (container) {
        danmaku?.destroy();
        const newOverlay = createOverlay(container);
        danmaku = new DanmakuRenderer({ container: newOverlay, settings });
        // video要素の再接続
        watchVideoElement();
        // 過去弾幕の再読み込み
        loadPastDanmaku(currentTitleId);
      }
    }
    sendResponse({ reinited: needsReinit });
    return;
  }
  // リモート機能フラグ更新
  if (message.type === 'feature-flags-updated' && message.flags) {
    featureFlags = message.flags;
    log('Feature flags updated:', featureFlags);
  }
  // 弾幕描画のみ (テスト・プレビュー用、P2P送信なし)
  if (message.type === 'render-danmaku') {
    danmaku?.draw({ text: message.text, mine: message.mine ?? false, admin: message.admin ?? false });
  }
  if (message.type === 'storage-query') {
    const { method, args } = message;
    (async () => {
      try {
        // titleId引数を検証 (サイドパネルからの不正リクエスト防止)
        const safeTitleId = args?.[0] !== undefined ? sanitizeId(args[0], MAX_TITLE_ID_LENGTH) : null;
        switch (method) {
          case 'getCommentsByTitle':
            if (!safeTitleId) { sendResponse([]); break; }
            sendResponse(await getCommentsByTitle(safeTitleId));
            break;
          case 'getStorageStats':
            sendResponse(await getStorageStats());
            break;
          case 'estimateStorageSize':
            sendResponse(await estimateStorageSize());
            break;
          case 'exportAllComments':
            sendResponse(await exportAllComments());
            break;
          case 'clearAllComments':
            await clearAllComments();
            sendResponse({ ok: true });
            break;
          case 'trimCommentsByTitle':
            if (!safeTitleId) { sendResponse(0); break; }
            sendResponse(await trimCommentsByTitle(safeTitleId, args[1]));
            break;
          case 'deleteLatestComments':
            if (!safeTitleId) { sendResponse(0); break; }
            sendResponse(await deleteLatestComments(safeTitleId, args[1]));
            break;
          default:
            sendResponse({ error: `Unknown method: ${method}` });
        }
      } catch (e) {
        console.error('[Netflix Jikkyo] Storage query failed:', e);
        sendResponse({ error: String(e) });
      }
    })();
    return true; // 非同期 sendResponse
  }
});

// 初回起動
initialize();

