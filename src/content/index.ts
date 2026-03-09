// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { v4 as uuidv4 } from 'uuid';
import './danmaku.css';
import { getTitleId, getPlayerContainer, watchNavigation, waitForElement, getTitleMetadata } from '../utils/netflix';
import { createOverlay, removeOverlay, watchFullscreen } from './overlay';
import { DanmakuRenderer } from './danmaku';
import { P2PRoom, createRoom } from './room';
import {
  saveComments, cleanupOldComments, getCommentsByTitleSince, getLatestTimestamp,
  trimCommentsByTitle, getCommentsByTitle, getStorageStats, estimateStorageSize,
  exportAllComments, clearAllComments, deleteLatestComments,
} from './storage';
import { signComment, verifyAdminSignature, loadAdminPrivateKey } from '../utils/crypto';
import type { ArchiveComment, Comment, CommentSource, DanmakuItem, FeatureFlags, NicoBridgeCommentMessage, NicoBridgeStateMessage, P2PCommentMessage, P2PLogRequest, P2PLogResponse, Settings, SidePanelComment, SidePanelLogSynced, SidePanelTitleInfo } from '../types';
import { DEFAULT_SETTINGS, DEFAULT_FEATURE_FLAGS, MAX_COMMENT_TEXT_LENGTH, MAX_TITLE_ID_LENGTH } from '../types';
import { isNGComment, isUserNGComment } from '../utils/ng-filter';
import { sanitizeText, sanitizeId } from '../utils/sanitize';
import { setLocale } from '../i18n';
import { log, warn } from '../utils/logger';
import { initDebugOverlay, debugLog, destroyDebugOverlay } from './debug-overlay';

/** ログ同期チャンクサイズ */
const LOG_SYNC_CHUNK_SIZE = 200;

/** タイトル別コメント最大保持数 */
const MAX_COMMENTS_PER_TITLE = 100000;

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

/** Extension context が有効かどうか (リロードで無効化される) */
let extensionContextValid = true;

/** ニコ生ブリッジ状態 */
let nicoBridgeHasSession = false;
/** ニコ生ブリッジ接続中 (= ライブ配信中のシグナル) */
let nicoBridgeConnected = false;
/** ニコ生コメント重複排除 (IDベース) */
const receivedNicoCommentIds = new Set<string>();
const NICO_DEDUP_MAX_SIZE = 5000;

/** ニコ生弾幕ドリップキュー: NDGRバッチ到着を1コメントずつ滑らかに逐次描画 */
const nicoDanmakuDripQueue: DanmakuItem[] = [];
let nicoDanmakuDripTimer: ReturnType<typeof setTimeout> | null = null;
const DANMAKU_DRIP_MAX_TOTAL_MS = 500; // バッチ全体の最大ドレイン時間 (これ以内に全コメント表示)
const DANMAKU_DRIP_MIN_MS = 16;        // 最速間隔 ≈ 1フレーム (Canvas は低コスト)
const DANMAKU_DRIP_MAX_MS = 200;       // 最遅間隔 (少量コメント時、1コメントの上限)
const DANMAKU_DRIP_MAX_QUEUE = 150;    // キュー上限 (Canvas レンダラーは200+同時表示可能)

/** パフォーマンス計測用カウンター (デバッグオーバーレイ向け) */
let perfDroppedComments = 0;
let perfTotalReceived = 0;

/** IndexedDB バッチ書き込み: 個別トランザクションを避け、500ms or 20件ごとに一括コミット */
let commentSaveBatch: Comment[] = [];
let saveBatchTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_BATCH_MAX = 20;
const SAVE_BATCH_INTERVAL_MS = 500;

function queueCommentSave(comment: Comment): void {
  commentSaveBatch.push(comment);
  if (commentSaveBatch.length >= SAVE_BATCH_MAX) {
    flushCommentSaves();
  } else if (!saveBatchTimer) {
    saveBatchTimer = setTimeout(flushCommentSaves, SAVE_BATCH_INTERVAL_MS);
  }
}

function flushCommentSaves(): void {
  if (saveBatchTimer) {
    clearTimeout(saveBatchTimer);
    saveBatchTimer = null;
  }
  if (commentSaveBatch.length === 0) return;
  const batch = commentSaveBatch;
  commentSaveBatch = [];
  saveComments(batch).catch(console.error);
}

/** 過去コメント弾幕再生 */
let pastDanmakuComments: Comment[] = [];
let pastDanmakuIndex = 0;
let lastVideoTime = -1;

/** アーカイブコメント取得管理 */
let archiveFetchedRanges: { from: number; to: number }[] = [];
let archiveFetchInProgress = false;
const ARCHIVE_CHUNK_SEC = 600; // 10分チャンク
const ARCHIVE_PREFETCH_SEC = 300; // 現在位置の5分先まで先読み

/** 動画の現在再生位置 (秒) を取得する */
function getVideoCurrentTime(): number {
  const video = document.querySelector('video');
  return video ? video.currentTime : 0;
}

/** 現在のタイトルがニコ生ブリッジ対象かどうかを判定する */
function isBridgeTargetTitle(): boolean {
  if (!nicoBridgeConnected || !currentTitleId) return false;
  const bridgeTitleIds = featureFlags.nicoBridge?.titleIds;
  // titleIds が空配列 = 全タイトル対象
  if (!bridgeTitleIds?.length) return true;
  return bridgeTitleIds.includes(currentTitleId);
}

/** コンテンツ側ライブエッジ粘着タイムスタンプ */
let contentLastLiveEdgeTs = 0;
/** コンテンツ側ライブエッジ粘着期間 (ms) — 一時的な揺れを吸収 */
const CONTENT_LIVE_EDGE_STICKY_MS = 60_000;

/** 動画がライブエッジ（リアルタイム視聴中）かどうかを判定する
 * - /live/ /event/ URLで再生位置が末尾付近ならライブエッジ（true）
 * - /watch/ URLでもブリッジ接続中かつ対象タイトルなら動画位置で判定（WBCなど /watch/ でのライブ配信対応）
 * - 追っかけ再生やアーカイブ再生ではfalse */
function isVideoAtLiveEdge(): boolean {
  const isWatchUrl = /\/watch\//.test(location.pathname);
  const isLiveUrl = /\/(?:live|event)\//.test(location.pathname);
  const isBridgeTarget = isWatchUrl && isBridgeTargetTitle();

  if (isWatchUrl) {
    if (!isBridgeTarget) return false;
  } else if (!isLiveUrl) {
    return false;
  }

  const video = document.querySelector('video');
  if (!video) {
    // Bridge target で video が null = Netflix 広告遷移中。粘着判定で維持
    if (isBridgeTarget && (Date.now() - contentLastLiveEdgeTs) < CONTENT_LIVE_EDGE_STICKY_MS) return true;
    return false;
  }
  // Infinite duration = ライブストリーミング
  if (!isFinite(video.duration)) { contentLastLiveEdgeTs = Date.now(); return true; }
  // Duration未ロード = ライブページではデフォルトtrue
  if (video.duration <= 0) { contentLastLiveEdgeTs = Date.now(); return true; }

  // /watch/ URL (DASH ライブ): バッファギャップが大きいため緩い閾値 + 粘着判定
  if (isBridgeTarget) {
    if ((video.duration - video.currentTime) < 120) {
      contentLastLiveEdgeTs = Date.now();
      return true;
    }
    // 粘着: 最近ライブエッジだった場合は維持 (一時的な揺れを吸収)
    if ((Date.now() - contentLastLiveEdgeTs) < CONTENT_LIVE_EDGE_STICKY_MS) return true;
    return false;
  }

  // /live/ /event/ URL: 従来の30秒閾値
  return (video.duration - video.currentTime) < 30;
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
  pauseBuffer = [];
  // ドリップキュークリア
  if (nicoDanmakuDripTimer) {
    clearTimeout(nicoDanmakuDripTimer);
    nicoDanmakuDripTimer = null;
  }
  nicoDanmakuDripQueue.length = 0;
  // ライブ弾幕ヘルスチェック停止
  stopLiveDanmakuHealthCheck();
  // IDB バッチを flush して保存漏れ防止
  flushCommentSaves();
  pastDanmakuComments = [];
  pastDanmakuIndex = 0;
  lastVideoTime = -1;
  archiveFetchedRanges = [];
  archiveFetchInProgress = false;
  destroyDebugOverlay();
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

/** chrome.runtime.sendMessage の安全ラッパー
 * Extension context が無効化されていたら検知して通知を表示する */
function safeSendMessage(message: unknown): void {
  if (!extensionContextValid) return;
  try {
    chrome.runtime.sendMessage(message).catch((e: Error) => {
      if (e?.message?.includes('Extension context invalidated')) {
        onContextInvalidated();
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes('Extension context invalidated')) {
      onContextInvalidated();
    }
  }
}

/** Extension context 無効化時の処理 */
function onContextInvalidated(): void {
  if (!extensionContextValid) return;
  extensionContextValid = false;
  warn('Extension context invalidated — extension was reloaded. Please reload the Netflix tab.');
  showReloadBanner();
}

/** タブリロードを促すバナーを表示する */
function showReloadBanner(): void {
  if (document.getElementById('nfjk-reload-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'nfjk-reload-banner';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    background: #E50914; color: #fff; text-align: center;
    padding: 8px 16px; font: bold 14px/1.4 "Segoe UI", Arial, sans-serif;
    cursor: pointer;
  `;
  banner.textContent = '⟳ Netflix Jikkyo: 拡張機能が更新されました。クリックでページをリロード';
  banner.addEventListener('click', () => location.reload());
  document.body.appendChild(banner);
}

// --- ピアカウント統計 (管理者向け) ---
const peerStats = {
  current: 0,
  max: 0,
  /** { timestamp, count }[] — 5秒ごとのサンプル */
  samples: [] as { t: number; c: number }[],
  startTime: Date.now(),
};

function updateBadge(count: number): void {
  peerStats.current = count;
  if (count > peerStats.max) peerStats.max = count;
  safeSendMessage({ type: 'peer-count', count });
}

/** 定期的にピアカウントをサンプリング (gossip と同期して呼ばれる) */
function samplePeerCount(): void {
  if (peerStats.current > 0) {
    peerStats.samples.push({ t: Date.now(), c: peerStats.current });
    // 24時間分以上は古いものを捨てる
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    while (peerStats.samples.length > 0 && peerStats.samples[0].t < cutoff) {
      peerStats.samples.shift();
    }
  }
}

/** ピアカウント統計を返す */
function getPeerStats(): { current: number; max: number; average: number; samples: number; uptimeMin: number } {
  const avg = peerStats.samples.length > 0
    ? peerStats.samples.reduce((sum, s) => sum + s.c, 0) / peerStats.samples.length
    : peerStats.current;
  return {
    current: peerStats.current,
    max: peerStats.max,
    average: Math.round(avg * 10) / 10,
    samples: peerStats.samples.length,
    uptimeMin: Math.round((Date.now() - peerStats.startTime) / 60000),
  };
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
  safeSendMessage(msg);
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
function sendToSidePanel(text: string, nickname: string, timestamp: number, mine: boolean, admin = false, videoTime?: number, userId?: string, source?: CommentSource): void {
  const msg: SidePanelComment = {
    type: 'comment',
    comment: { text, nickname, timestamp, mine, admin, videoTime, userId, source },
  };
  safeSendMessage(msg);
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
      safeSendMessage(msg);
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
    debugLog(`loadPastDanmaku: ${pastDanmakuComments.length} comments, vt range: ${pastDanmakuComments.length > 0 ? `${(pastDanmakuComments[0].videoTime || 0).toFixed(1)}~${(pastDanmakuComments[pastDanmakuComments.length - 1].videoTime || 0).toFixed(1)}` : 'empty'}`);
  } catch (e) {
    console.error('[Netflix Jikkyo] Failed to load past danmaku:', e);
  }
}

/** アーカイブコメントを取得して pastDanmakuComments に挿入する */
async function fetchArchiveComments(titleId: string, fromSec: number, toSec: number): Promise<void> {
  // 既に取得済みの範囲はスキップ
  if (archiveFetchedRanges.some(r => r.from <= fromSec && r.to >= toSec)) return;
  if (archiveFetchInProgress) return;

  archiveFetchInProgress = true;
  try {
    const response = await new Promise<{ comments: ArchiveComment[]; total: number; error?: string }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'fetch-archive-comments', titleId, from: fromSec, to: toSec },
        (res) => {
          if (chrome.runtime.lastError) {
            resolve({ comments: [], total: 0, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(res ?? { comments: [], total: 0 });
        },
      );
    });

    if (response.error) {
      warn('Archive comments fetch error:', response.error);
      return;
    }

    archiveFetchedRanges.push({ from: fromSec, to: toSec });

    if (response.comments.length === 0) return;

    // ArchiveComment → Comment に変換して pastDanmakuComments にマージ
    const newComments: Comment[] = response.comments.map((ac, i) => ({
      id: `archive-${fromSec}-${i}`,
      text: ac.text,
      nickname: '',
      timestamp: ac.timestamp,
      titleId,
      videoTime: ac.videoTime,
      source: 'niconico' as CommentSource,
    }));

    // videoTime 順ソート済みでマージ (バッチ挿入)
    newComments.sort((a, b) => (a.videoTime || 0) - (b.videoTime || 0));
    for (const c of newComments) {
      insertPastDanmakuComment(c);
    }

    log(`Archive: loaded ${newComments.length} comments for ${fromSec}s-${toSec}s (total: ${pastDanmakuComments.length})`);
    debugLog(`archive: +${newComments.length} comments, range ${fromSec}-${toSec}s`);
  } catch (e) {
    warn('Archive comments fetch failed:', e);
  } finally {
    archiveFetchInProgress = false;
  }
}

/** アーカイブコメントの先読みチェック (timeupdate から呼ばれる) */
function checkArchivePrefetch(titleId: string, currentTime: number): void {
  if (!featureFlags.archive?.enabled) return;
  if (!featureFlags.archive.titles[titleId]) return;

  // 現在位置 + PREFETCH 先までカバーされているか確認
  const targetEnd = currentTime + ARCHIVE_PREFETCH_SEC;
  const needsFetch = !archiveFetchedRanges.some(r => r.from <= currentTime && r.to >= targetEnd);
  if (!needsFetch) return;

  // 次のチャンクを取得
  const chunkStart = Math.floor(currentTime / ARCHIVE_CHUNK_SEC) * ARCHIVE_CHUNK_SEC;
  const chunkEnd = chunkStart + ARCHIVE_CHUNK_SEC + ARCHIVE_PREFETCH_SEC;
  fetchArchiveComments(titleId, chunkStart, chunkEnd);
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
    // ライブ配信中 (ブリッジ対象タイトル) は弾幕を一時停止しない
    // Netflix の広告ブレイクで video.pause → danmaku が永久停止するのを防止
    if (isBridgeTargetTitle()) {
      log('Video paused (live broadcast) → danmaku NOT paused');
      return;
    }
    danmaku?.pause();
    log('Video paused → danmaku paused');
  };
  const onPlay = () => {
    danmaku?.resume();
    // 一時停止中に溜まったコメントを流す (最新5件のみ、古いものは破棄)
    const MAX_RESUME_COMMENTS = 5;
    const recent = pauseBuffer.length > MAX_RESUME_COMMENTS
      ? pauseBuffer.slice(-MAX_RESUME_COMMENTS)
      : pauseBuffer;
    for (const item of recent) {
      danmaku?.draw(item);
    }
    pauseBuffer = [];
    log(`Video playing → danmaku resumed (${recent.length}/${pauseBuffer.length + recent.length} shown)`);
  };
  const onTimeUpdate = () => onVideoTimeUpdate();

  video.addEventListener('pause', onPause);
  video.addEventListener('play', onPlay);
  video.addEventListener('timeupdate', onTimeUpdate);

  // 初期状態に応じてpause/resume同期
  // (MutationObserverが非同期のため、新video検出時点で play イベントを逃す場合がある)
  if (video.paused && !isBridgeTargetTitle()) {
    danmaku?.pause();
  } else {
    danmaku?.resume();
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
let lastOverlayCheck = 0;
let liveDanmakuHealthTimer: ReturnType<typeof setInterval> | null = null;

/** ライブ配信中の弾幕ヘルスチェック (3秒間隔)
 *  timeupdate イベント非依存で、弾幕の pause 状態とオーバーレイ健全性を監視 */
function startLiveDanmakuHealthCheck(): void {
  if (liveDanmakuHealthTimer) return;
  liveDanmakuHealthTimer = setInterval(() => {
    if (!isBridgeTargetTitle()) {
      // ライブ終了 → タイマー停止
      if (liveDanmakuHealthTimer) {
        clearInterval(liveDanmakuHealthTimer);
        liveDanmakuHealthTimer = null;
      }
      return;
    }
    // 弾幕が paused なら強制 resume
    if (danmaku && danmaku.isPaused()) {
      log('Live health check: danmaku paused, forcing resume');
      danmaku.resume();
      pauseBuffer = [];
    }
    // オーバーレイ健全性チェック
    checkOverlayHealth();
  }, 3000);
}

function stopLiveDanmakuHealthCheck(): void {
  if (liveDanmakuHealthTimer) {
    clearInterval(liveDanmakuHealthTimer);
    liveDanmakuHealthTimer = null;
  }
}

/** オーバーレイ復旧のリトライ回数 (5分ごとにリセット) */
let overlayRecoveryRetries = 0;
let overlayRecoveryResetTime = 0;
const MAX_OVERLAY_RECOVERY_RETRIES = 10;
const OVERLAY_RECOVERY_RESET_MS = 300_000; // 5分

/** オーバーレイの健全性チェック (DOMから外れた場合に再マウント) */
function checkOverlayHealth(): void {
  const now = Date.now();
  if (now - lastOverlayCheck < 5000) return;
  lastOverlayCheck = now;

  if (!currentTitleId) return;

  // danmaku が null の場合 (cleanup後の再初期化前など)
  if (!danmaku) {
    log('Danmaku renderer is null, attempting re-initialization...');
    const container = getPlayerContainer();
    if (container) {
      const newOverlay = createOverlay(container);
      danmaku = new DanmakuRenderer({ container: newOverlay, settings });
      watchVideoElement();
      overlayRecoveryRetries = 0;
      log('Danmaku renderer re-created');
    }
    return;
  }

  const overlay = document.getElementById('nfjk-danmaku-overlay');
  if (overlay && document.body.contains(overlay) && overlay.offsetWidth > 0) {
    overlayRecoveryRetries = 0;
    return;
  }

  // リトライカウンターを定期的にリセット (ライブ配信中はNetflixがプレイヤーを再構築する)
  if (now - overlayRecoveryResetTime > OVERLAY_RECOVERY_RESET_MS) {
    overlayRecoveryRetries = 0;
    overlayRecoveryResetTime = now;
  }
  if (overlayRecoveryRetries >= MAX_OVERLAY_RECOVERY_RETRIES) return;
  overlayRecoveryRetries++;

  log(`Overlay detached or invisible, reinitializing... (attempt ${overlayRecoveryRetries}/${MAX_OVERLAY_RECOVERY_RETRIES})`);
  const container = getPlayerContainer();
  if (container) {
    danmaku.destroy();
    const newOverlay = createOverlay(container);
    danmaku = new DanmakuRenderer({ container: newOverlay, settings });
    watchVideoElement();
    log('Overlay recovered');
  } else {
    warn('Player container not found, will retry on next health check');
  }
}

/** 動画のtimeupdateで過去コメントを弾幕として描画する + サイドパネルに再生時間を送信 */
function onVideoTimeUpdate(): void {
  const video = document.querySelector('video');
  if (!video) return;

  const currentTime = video.currentTime;

  // 大幅な巻き戻し検出 → ライブエッジ粘着をリセット (追っかけ再生開始)
  // safeSendMessage より前に行い、isVideoAtLiveEdge() が正しい値を返すようにする
  if (lastVideoTime >= 0 && currentTime < lastVideoTime - 10) {
    contentLastLiveEdgeTs = 0;
  }

  // オーバーレイ健全性チェック (5秒間隔)
  checkOverlayHealth();

  // 弾幕pause/play状態の整合性チェック
  // Netflix のシーク・ライブ復帰時に play イベントが発火しない場合の自動回復
  if (danmaku && danmaku.isPaused() && !video.paused) {
    log('Desync detected: video playing but danmaku paused, forcing resume');
    danmaku.resume();
    // 一時停止中に溜まったコメントを流す (最新5件)
    const MAX_RESUME_COMMENTS = 5;
    const recent = pauseBuffer.length > MAX_RESUME_COMMENTS
      ? pauseBuffer.slice(-MAX_RESUME_COMMENTS)
      : pauseBuffer;
    for (const item of recent) {
      danmaku.draw(item);
    }
    pauseBuffer = [];
  }

  // サイドパネルに再生時間を送信 (1秒間隔スロットル)
  const now = Date.now();
  if (now - lastVideoTimeSent >= 1000) {
    lastVideoTimeSent = now;
    safeSendMessage({
      type: 'video-time-update',
      videoTime: currentTime,
      paused: video.paused,
      isAtLiveEdge: isVideoAtLiveEdge(),
    });
  }

  // アーカイブコメント先読みチェック
  if (currentTitleId) {
    checkArchivePrefetch(currentTitleId, currentTime);
  }

  if (!danmaku || danmaku.isPaused()) return;
  if (pastDanmakuComments.length === 0) return;

  // シーク検出 (2秒以上の飛びor巻き戻し)
  if (lastVideoTime >= 0 && (currentTime < lastVideoTime - 0.5 || currentTime > lastVideoTime + 2)) {
    // シーク → インデックスをリセット
    const oldIndex = pastDanmakuIndex;
    pastDanmakuIndex = pastDanmakuComments.findIndex(c => (c.videoTime || 0) > currentTime);
    if (pastDanmakuIndex === -1) pastDanmakuIndex = pastDanmakuComments.length;
    debugLog(`seek detected: vt ${lastVideoTime.toFixed(2)}→${currentTime.toFixed(2)}, idx ${oldIndex}→${pastDanmakuIndex}/${pastDanmakuComments.length}`);
  }
  lastVideoTime = currentTime;

  // 現在時刻までのコメントを描画 (1回のtimeupdateで最大10件)
  const PAST_DANMAKU_BATCH_LIMIT = 10;
  let drawn = 0;
  while (pastDanmakuIndex < pastDanmakuComments.length) {
    const c = pastDanmakuComments[pastDanmakuIndex];
    const vt = c.videoTime || 0;
    if (vt <= currentTime) {
      // 2秒以内のコメントのみ描画 (遠い過去は飛ばす)
      if (currentTime - vt < 2) {
        if (drawn >= PAST_DANMAKU_BATCH_LIMIT) break;
        const isMine = !!currentUserId && c.userId === currentUserId;
        danmaku.draw({ text: c.text, mine: isMine, admin: c.admin });
        debugLog(`past danmaku: "${c.text}" vt=${vt.toFixed(1)} ct=${currentTime.toFixed(1)}`);
        drawn++;
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
  injectBundledFonts();

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
  if (extensionContextValid) {
    try {
      featureFlags = await new Promise<FeatureFlags>((resolve) => {
        chrome.runtime.sendMessage({ type: 'get-feature-flags' }, (response) => {
          if (chrome.runtime.lastError?.message?.includes('Extension context invalidated')) {
            onContextInvalidated();
            resolve(DEFAULT_FEATURE_FLAGS);
            return;
          }
          resolve(response ?? DEFAULT_FEATURE_FLAGS);
        });
      });
      log('Feature flags:', featureFlags);
    } catch {
      featureFlags = { ...DEFAULT_FEATURE_FLAGS };
    }
  }

  // ニコ生ブリッジ状態を初期取得 (ページリロード後に nicoBridgeConnected が false のまま放置されるのを防止)
  if (extensionContextValid) {
    try {
      const bridgeState = await new Promise<NicoBridgeStateMessage | null>((resolve) => {
        chrome.runtime.sendMessage({ type: 'get-nico-bridge-state' }, (response) => {
          if (chrome.runtime.lastError?.message?.includes('Extension context invalidated')) {
            onContextInvalidated();
            resolve(null);
            return;
          }
          resolve(response ?? null);
        });
      });
      if (bridgeState) {
        nicoBridgeHasSession = !!bridgeState.hasNicoSession;
        nicoBridgeConnected = bridgeState.status === 'connected';
        log('NicoBridge initial state:', bridgeState.status, 'session:', nicoBridgeHasSession);
        // ブリッジ接続中ならライブ弾幕ヘルスチェック開始
        if (nicoBridgeConnected) {
          startLiveDanmakuHealthCheck();
        }
      }
    } catch {
      // BG SW が非アクティブの場合は無視
    }
  }

  // アーカイブコメント初回取得 (ライブエッジでなければ)
  if (featureFlags.archive?.enabled && featureFlags.archive.titles[titleId] && !isVideoAtLiveEdge()) {
    const videoTime = getVideoCurrentTime();
    const chunkStart = Math.floor(videoTime / ARCHIVE_CHUNK_SEC) * ARCHIVE_CHUNK_SEC;
    fetchArchiveComments(titleId, chunkStart, chunkStart + ARCHIVE_CHUNK_SEC + ARCHIVE_PREFETCH_SEC);
    log(`Archive mode detected for title ${titleId}, fetching comments from ${chunkStart}s`);
  }

  room = createRoom(titleId, {
    onComment: async (msg, peerId) => {
      // ニコ生ソースのコメントで表示OFF → スキップ
      const source: CommentSource = (msg.source === 'niconico') ? 'niconico' : 'p2p';
      if (source === 'niconico') {
        // userId が無い匿名コメントは除外 (NG設定不可のため表示しない)
        if (!msg.userId) return;
        // 連携ユーザーは自分がブリッジしているのでP2Pからの再配信は無視
        if (nicoBridgeHasSession) return;
        // 非連携ユーザーは設定に従う
        if (settings.showNicoComments === false) return;
        // アーカイブ再生時 (ブリッジ未接続) はリアルタイムのニコ生コメントを表示しない
        if (!isVideoAtLiveEdge() && !nicoBridgeConnected) return;
        // ブリッジ機能が無効の場合はP2P経由のニコ生コメントも表示しない
        if (!featureFlags.nicoBridge?.enabled) return;
        // 重複排除 (IDベース)
        if (receivedNicoCommentIds.has(msg.id)) return;
        receivedNicoCommentIds.add(msg.id);
      }

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

      // 全ソース共通: ブリッジユーザーの videoTime を活用
      const videoTime = msg.videoTime ?? getVideoCurrentTime();
      debugLog(`recv[${source}]: "${msg.text.slice(0, 20)}" vt=${videoTime.toFixed(1)} from=${msg.nickname}`);
      const displayText = msg.text.slice(0, MAX_COMMENT_TEXT_LENGTH);

      if (isAdmin) {
        // 管理者コメントはバッファせず即座に描画 (上部中央固定表示)
        danmaku?.draw({ text: displayText, admin: true });
      } else if (source === 'niconico') {
        // ニコ生コメント: ライブエッジならドリップキュー描画、追っかけ中は pastDanmaku に任せる
        if (isVideoAtLiveEdge()) {
          enqueueNicoDanmaku({ text: displayText });
        }
      } else if (danmaku?.isPaused()) {
        pauseBuffer.push({ text: displayText });
      } else {
        danmaku?.draw({ text: displayText });
      }

      // サイドパネルに送信
      sendToSidePanel(displayText, msg.nickname, msg.timestamp, false, isAdmin, videoTime, msg.userId, source);

      // IndexedDB に保存
      const comment: Comment = {
        id: msg.id,
        text: displayText,
        nickname: msg.nickname,
        timestamp: msg.timestamp,
        titleId,
        videoTime,
        userId: msg.userId,
        source,
        admin: isAdmin || undefined,
        nicoLinked: msg.nicoLinked || undefined,
      };
      queueCommentSave(comment);
      // 過去弾幕配列に挿入 (次回シーク時に再生可能にする)
      insertPastDanmakuComment(comment);
    },
    onPeerJoin: async (peerId) => {
      updateBadge(room?.getGlobalPeerCount() ?? 1);

      // ログ同期リクエスト送信
      if (room && currentTitleId) {
        const sinceTimestamp = await getLatestTimestamp(currentTitleId);
        room.requestLogSync(peerId, sinceTimestamp ?? undefined);
      }
    },
    onPeerLeave: (_peerId) => {
      updateBadge(room?.getGlobalPeerCount() ?? 1);
    },
    onPeerCountUpdate: (count) => {
      updateBadge(count);
      samplePeerCount();
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
  safeSendMessage({ type: 'title-ready', titleId });

  sendTitleInfoToSidePanel();
  setTimeout(() => sendTitleInfoToSidePanel(), 2000);
  setTimeout(() => sendTitleInfoToSidePanel(), 5000);
  watchDocumentTitle();

  // 過去コメントの弾幕再生用に読み込み
  await loadPastDanmaku(titleId);

  // デバッグオーバーレイ初期化 (mock ビルドのみ)
  initDebugOverlay(() => {
    const video = document.querySelector('video');
    return {
      pastDanmakuCount: pastDanmakuComments.length,
      pastDanmakuIndex,
      lastVideoTime,
      videoCurrentTime: video?.currentTime ?? -1,
      videoDuration: video?.duration ?? -1,
      videoPaused: video?.paused ?? true,
      danmakuExists: danmaku !== null,
      danmakuPaused: danmaku?.isPaused() ?? true,
      danmakuActiveCount: danmaku?.getActiveCount() ?? 0,
      isLiveEdge: isVideoAtLiveEdge(),
      isBridgeTarget: isBridgeTargetTitle(),
      nicoBridgeConnected,
      currentTitleId,
      overlayExists: !!document.getElementById('nfjk-danmaku-overlay'),
      dripQueueLength: nicoDanmakuDripQueue.length,
      droppedComments: perfDroppedComments,
      totalReceived: perfTotalReceived,
      pauseBufferLength: pauseBuffer.length,
    };
  });

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
  debugLog(`send: "${text}" vt=${videoTime.toFixed(1)} admin=${isAdmin}`);
  danmaku?.draw({ text, mine: true, admin: isAdmin });

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
    nicoLinked: nicoBridgeHasSession || undefined,
  };
  room?.send(msg);

  // ニコ生ブリッジ投稿 (連携ユーザーのみ、管理者コメントは除外)
  if (nicoBridgeHasSession && !isAdmin) {
    safeSendMessage({ type: 'nico-bridge-post', text });
  }

  // IndexedDB 保存
  const comment: Comment = {
    id,
    text,
    nickname: settings.nickname || 'ゲスト',
    timestamp,
    titleId,
    videoTime,
    userId: currentUserId,
    admin: isAdmin || undefined,
    nicoLinked: nicoBridgeHasSession || undefined,
  };
  queueCommentSave(comment);
  // 過去弾幕配列に挿入 (次回シーク時に再生可能にする)
  insertPastDanmakuComment(comment);
}

/** ニコ生弾幕ドリップキューにコメントを追加 */
function enqueueNicoDanmaku(item: DanmakuItem): void {
  if (danmaku?.isPaused()) {
    pauseBuffer.push(item);
    return;
  }
  nicoDanmakuDripQueue.push(item);
  // キュー上限超過 → 古いコメントを破棄 (過負荷時の安全弁)
  if (nicoDanmakuDripQueue.length > DANMAKU_DRIP_MAX_QUEUE) {
    const dropCount = nicoDanmakuDripQueue.length - DANMAKU_DRIP_MAX_QUEUE;
    perfDroppedComments += dropCount;
    nicoDanmakuDripQueue.splice(0, dropCount);
  }
  // ドレインが未起動なら遅延開始 (バッチ蓄積待ち)
  // ※ 同期的に drain するとメッセージが1件ずつ即座に描画されてバーストする
  //   setTimeout で遅延することで、同一バッチの全メッセージがキューに蓄積されてから
  //   ドレインが開始される
  if (!nicoDanmakuDripTimer) {
    nicoDanmakuDripTimer = setTimeout(drainNicoDanmakuDrip, DANMAKU_DRIP_MIN_MS);
  }
}

/** 弾幕が満杯で待機中のリトライ間隔 (ms) */
const DANMAKU_DRIP_WAIT_MS = 200;

/** ドリップキューから1コメントずつ描画 (適応的間隔) */
function drainNicoDanmakuDrip(): void {
  nicoDanmakuDripTimer = null;
  if (nicoDanmakuDripQueue.length === 0) return;
  // danmaku 未初期化: キューに残して待機 (initialize 完了後に再開)
  if (!danmaku) {
    nicoDanmakuDripTimer = setTimeout(drainNicoDanmakuDrip, DANMAKU_DRIP_WAIT_MS);
    return;
  }
  // 一時停止中の処理
  if (danmaku.isPaused()) {
    // ライブ配信中は強制 resume して弾幕を流し続ける
    if (isBridgeTargetTitle()) {
      log('Drip queue: danmaku paused during live broadcast, forcing resume');
      danmaku.resume();
      pauseBuffer = [];
    } else {
      // 通常再生: pauseBuffer に退避 (resume 時に処理)
      for (const item of nicoDanmakuDripQueue) {
        pauseBuffer.push(item);
      }
      nicoDanmakuDripQueue.length = 0;
      return;
    }
  }
  // 描画不可 (満杯 or コンテナ不健全): キューに残して待機 + オーバーレイ復旧トリガー
  if (!danmaku.canDraw()) {
    checkOverlayHealth();
    nicoDanmakuDripTimer = setTimeout(drainNicoDanmakuDrip, DANMAKU_DRIP_WAIT_MS);
    return;
  }
  const item = nicoDanmakuDripQueue.shift()!;
  danmaku.draw(item);
  if (nicoDanmakuDripQueue.length > 0) {
    // 適応的間隔: バッチ全体を MAX_TOTAL_MS 以内に完了
    // 14コメント → 500/14=36ms間隔 → 504ms で全表示
    // 3コメント → 500/3=167ms間隔 → 501ms で全表示
    const interval = Math.max(
      DANMAKU_DRIP_MIN_MS,
      Math.min(DANMAKU_DRIP_MAX_MS, Math.floor(DANMAKU_DRIP_MAX_TOTAL_MS / nicoDanmakuDripQueue.length)),
    );
    nicoDanmakuDripTimer = setTimeout(drainNicoDanmakuDrip, interval);
  }
}

/** ドリップキューを即座に全フラッシュ */
function flushNicoDanmakuDrip(): void {
  if (nicoDanmakuDripTimer) {
    clearTimeout(nicoDanmakuDripTimer);
    nicoDanmakuDripTimer = null;
  }
  for (const item of nicoDanmakuDripQueue) {
    danmaku?.draw(item);
  }
  nicoDanmakuDripQueue.length = 0;
}

/** ニコ生コメント受信処理 */
function handleNicoBridgeComment(msg: NicoBridgeCommentMessage): void {
  perfTotalReceived++;
  // コメント表示OFFなら無視 (連携ユーザーでもOFF)
  if (settings.showNicoComments === false) return;
  // ブリッジ対象タイトルでなければスキップ
  if (!isBridgeTargetTitle()) return;

  // 重複排除 (IDベース)
  if (receivedNicoCommentIds.has(msg.id)) return;
  receivedNicoCommentIds.add(msg.id);
  if (receivedNicoCommentIds.size > NICO_DEDUP_MAX_SIZE) {
    // 古いエントリを削除 (Set は挿入順を保持)
    const iter = receivedNicoCommentIds.values();
    for (let i = 0; i < 1000; i++) iter.next();
    // Set は古い要素を削除するAPIがないので再構築
    const arr = [...receivedNicoCommentIds];
    receivedNicoCommentIds.clear();
    for (const id of arr.slice(1000)) {
      receivedNicoCommentIds.add(id);
    }
  }

  // userId が無い匿名コメントは除外 (NG設定不可のため表示しない)
  if (!msg.nicoUserId) return;

  const text = sanitizeText(msg.text, MAX_COMMENT_TEXT_LENGTH);
  if (!text) return;

  // NGフィルター
  if (isNGComment(text)) return;
  if (isUserNGComment(text, settings.ngComments, msg.nicoUserId ?? '', settings.ngUserIds)) return;

  const atLiveEdge = isVideoAtLiveEdge();

  // videoTime: ライブエッジなら現在位置、追っかけなら video.duration ≈ ライブ位置
  let videoTime: number;
  if (atLiveEdge) {
    videoTime = getVideoCurrentTime();
  } else {
    const video = document.querySelector('video');
    videoTime = (video && isFinite(video.duration) && video.duration > 0) ? video.duration : getVideoCurrentTime();
  }

  // サイドパネルに送信 (追っかけ再生時はサイドパネル側でバッファ制御)
  sendToSidePanel(text, msg.nickname, msg.timestamp, false, false, videoTime, msg.nicoUserId, 'niconico');

  // ライブエッジ: 弾幕即座に描画 / 追っかけ: pastDanmaku が担当
  if (atLiveEdge) {
    enqueueNicoDanmaku({ text });
  }

  // IndexedDB に保存 (アーカイブ弾幕再生用 — 追っかけ中も常に保存)
  const comment: Comment = {
    id: msg.id,
    text,
    nickname: msg.nickname,
    timestamp: msg.timestamp,
    titleId: currentTitleId!,
    videoTime,
    userId: msg.nicoUserId,
    source: 'niconico',
  };
  queueCommentSave(comment);
  insertPastDanmakuComment(comment);

  // P2P再配信 (連携ユーザーのみ)
  if (nicoBridgeHasSession && room) {
    const p2pMsg: P2PCommentMessage = {
      id: msg.id,
      text,
      nickname: msg.nickname,
      timestamp: msg.timestamp,
      videoTime,
      source: 'niconico',
    };
    room.send(p2pMsg);
  }
}

// --- けいふぉんと注入 ---

function injectBundledFonts(): void {
  if (document.getElementById('nfjk-bundled-fonts')) return;
  const keifontUrl = chrome.runtime.getURL('fonts/keifont.ttf');
  const notoUrl = chrome.runtime.getURL('fonts/NotoSansJP.ttf');
  const style = document.createElement('style');
  style.id = 'nfjk-bundled-fonts';
  style.textContent = [
    `@font-face { font-family: 'keifont'; src: url('${keifontUrl}') format('truetype'); font-display: swap; }`,
    `@font-face { font-family: 'NotoSansJP'; src: url('${notoUrl}') format('truetype'); font-weight: 100 900; font-display: swap; }`,
  ].join('\n');
  document.head.appendChild(style);
}

// --- エントリポイント ---

// SPA遷移監視
cleanupNav = watchNavigation((url) => {
  if (/\/(?:watch|live|event)\//.test(url)) {
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
      const video = document.querySelector('video');
      if (video) {
        debugLog(`seek-video: ${video.currentTime.toFixed(2)} → ${message.time.toFixed(2)}`);
        video.currentTime = message.time;
      } else {
        debugLog('seek-video: video element not found');
      }
    }
  }
  // 弾幕バッファフラッシュ (レガシー: 現在は即座描画のため空操作)
  if (message.type === 'flush-danmaku') {
    // P2Pコメントは受信時に即座に描画されるため、バッファフラッシュは不要
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
  // 設定変更通知 (サイドパネルからのトグル操作等)
  if (message.type === 'settings-changed' && message.settings) {
    settings = { ...DEFAULT_SETTINGS, ...message.settings };
  }
  // ニコ生ブリッジ状態更新
  if (message.type === 'nico-bridge-state') {
    nicoBridgeHasSession = !!message.hasNicoSession;
    const wasConnected = nicoBridgeConnected;
    nicoBridgeConnected = message.status === 'connected';
    // ブリッジ接続開始 → ライブ弾幕ヘルスチェック開始
    if (nicoBridgeConnected && !wasConnected) {
      startLiveDanmakuHealthCheck();
      // 弾幕が paused なら即座に resume
      if (danmaku?.isPaused()) {
        danmaku.resume();
        pauseBuffer = [];
      }
    } else if (!nicoBridgeConnected && wasConnected) {
      stopLiveDanmakuHealthCheck();
    }
  }
  // ニコ生コメント受信
  if (message.type === 'nico-bridge-comment' && currentTitleId) {
    const bridgeTitleIds = featureFlags.nicoBridge?.titleIds;
    if (bridgeTitleIds?.length && !bridgeTitleIds.includes(currentTitleId)) return;
    handleNicoBridgeComment(message as NicoBridgeCommentMessage);
  }
  // 弾幕描画のみ (テスト・プレビュー用、P2P送信なし)
  if (message.type === 'render-danmaku') {
    danmaku?.draw({ text: message.text, mine: message.mine ?? false, admin: message.admin ?? false });
  }
  // 管理者向けピアカウント統計
  if (message.type === 'get-peer-stats') {
    sendResponse(getPeerStats());
    return;
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

// モックモード: ページスクリプトからの postMessage でリアルタイムコメント注入
declare const __DEV_MOCK__: boolean;
if (typeof __DEV_MOCK__ !== 'undefined' && __DEV_MOCK__) {
  window.addEventListener('message', (event) => {
    if (!currentTitleId) return;

    // ブリッジ経路モック: handleNicoBridgeComment() を通す (ドリップキュー・重複排除・NGフィルター全経路テスト)
    if (event.data?.type === 'nfjk-mock-bridge-comment') {
      const c = event.data.comment;
      if (!c?.text || !c?.nickname) return;
      const msg: NicoBridgeCommentMessage = {
        type: 'nico-bridge-comment',
        id: c.id || `mock-nico-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: c.text,
        nickname: c.nickname,
        timestamp: c.timestamp || Date.now(),
        nicoUserId: c.userId || `mock-nico-${(perfTotalReceived % 500) + 1}`,
      };
      handleNicoBridgeComment(msg);
      return;
    }

    // 直接描画モック: danmaku.draw() に直接渡す (ドリップキューをバイパス)
    if (event.data?.type !== 'nfjk-mock-comment') return;
    const c = event.data.comment;
    if (!c?.text || !c?.nickname) return;

    const tid = currentTitleId;
    const text = sanitizeText(c.text, MAX_COMMENT_TEXT_LENGTH);
    if (!text) return;
    const comment: Comment = {
      id: `mock-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      nickname: c.nickname,
      timestamp: c.timestamp || Date.now(),
      titleId: tid,
      videoTime: c.videoTime ?? getVideoCurrentTime(),
      userId: c.userId,
      source: (c.source as CommentSource) || 'niconico',
    };

    // 弾幕描画
    danmaku?.draw({ text: comment.text, mine: false });
    // IndexedDB保存
    queueCommentSave(comment);
    // 過去弾幕配列に挿入
    insertPastDanmakuComment(comment);
    // サイドパネルに転送
    safeSendMessage({
      type: 'comment',
      ...comment,
      _relayed: false,
    });
  });
}

// 初回起動
initialize();

