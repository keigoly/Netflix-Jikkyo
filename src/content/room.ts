// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { joinRoom, type Room } from 'trystero/torrent';
import { log, warn } from '../utils/logger';
import type { P2PCommentMessage, P2PLogRequest, P2PLogResponse, FeatureFlags } from '../types';
import {
  RATE_LIMIT_MAX_MESSAGES,
  RATE_LIMIT_WINDOW_MS,
  LOG_SYNC_RATE_LIMIT_MAX,
  LOG_SYNC_RATE_LIMIT_WINDOW_MS,
} from '../types';
import {
  PeerRateLimiter,
  validateP2PComment,
  validateLogRequest,
  validateLogResponse,
  type ValidatedComment,
} from '../utils/sanitize';

const APP_ID = 'netflix-jikkyo';

/** ゴシップ間隔 (ms) */
const GOSSIP_INTERVAL_MS = 5000;
/** ゴシップ未更新のピアを除外するまでの猶予 (ms) */
const GOSSIP_STALE_MS = 20000;
/** join/leave 後のゴシップ即時発火までの debounce (ms) */
const GOSSIP_DEBOUNCE_MS = 500;

export interface RoomCallbacks {
  onComment: (comment: ValidatedComment, peerId: string) => void;
  onPeerJoin: (peerId: string) => void;
  onPeerLeave: (peerId: string) => void;
  onLogRequest?: (request: P2PLogRequest, peerId: string) => void;
  onLogResponse?: (response: P2PLogResponse, peerId: string) => void;
  /** ゴシップで算出したグローバルピア数が変化した時に発火 */
  onPeerCountUpdate?: (count: number) => void;
}

export class P2PRoom {
  private room: Room | null = null;
  private sendComment: ((data: P2PCommentMessage, targetPeers?: string[]) => void) | null = null;
  private sendLogRequest: ((data: P2PLogRequest, targetPeers?: string[]) => void) | null = null;
  private sendLogResponse: ((data: P2PLogResponse, targetPeers?: string[]) => void) | null = null;
  private sendPeerList: ((data: string[], targetPeers?: string[]) => void) | null = null;
  private titleId: string;
  private callbacks: RoomCallbacks;
  private peers = new Set<string>();
  private syncedPeers = new Set<string>();
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private commentLimiter = new PeerRateLimiter(RATE_LIMIT_MAX_MESSAGES, RATE_LIMIT_WINDOW_MS);
  private logSyncLimiter = new PeerRateLimiter(LOG_SYNC_RATE_LIMIT_MAX, LOG_SYNC_RATE_LIMIT_WINDOW_MS);

  /** 全既知ピア (直接接続 + ゴシップで学習) — peerId → lastSeen timestamp */
  private allKnownPeers = new Map<string, number>();
  private gossipTimer: ReturnType<typeof setInterval> | null = null;
  private gossipDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmittedCount = 0;

  constructor(titleId: string, callbacks: RoomCallbacks) {
    this.titleId = titleId;
    this.callbacks = callbacks;
    this.join();
  }

  /** ルームに参加する */
  private join(): void {
    if (this.destroyed) return;

    try {
      this.room = joinRoom({ appId: APP_ID }, `nfjk-${this.titleId}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [send, receive] = this.room.makeAction<any>('comment');
      this.sendComment = send as (data: P2PCommentMessage, targetPeers?: string[]) => void;

      receive((data: unknown, peerId: string) => {
        if (!this.commentLimiter.allow(peerId)) {
          warn(`Rate limited peer: ${peerId}`);
          return;
        }
        const validated = validateP2PComment(data);
        if (!validated) {
          warn(`Invalid comment from peer: ${peerId}`);
          return;
        }
        this.callbacks.onComment(validated, peerId);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [sendLogReq, receiveLogReq] = this.room.makeAction<any>('log-request');
      this.sendLogRequest = sendLogReq as (data: P2PLogRequest, targetPeers?: string[]) => void;

      receiveLogReq((data: unknown, peerId: string) => {
        const validated = validateLogRequest(data);
        if (!validated) {
          warn(`Invalid log request from peer: ${peerId}`);
          return;
        }
        this.callbacks.onLogRequest?.(validated, peerId);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [sendLogRes, receiveLogRes] = this.room.makeAction<any>('log-response');
      this.sendLogResponse = sendLogRes as (data: P2PLogResponse, targetPeers?: string[]) => void;

      receiveLogRes((data: unknown, peerId: string) => {
        if (!this.logSyncLimiter.allow(peerId)) {
          warn(`Log sync rate limited peer: ${peerId}`);
          return;
        }
        const validated = validateLogResponse(data);
        if (!validated) {
          warn(`Invalid log response from peer: ${peerId}`);
          return;
        }
        this.callbacks.onLogResponse?.(validated, peerId);
      });

      // --- ゴシッププロトコル: 全ピアの既知リストを交換 ---
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [sendPL, receivePL] = this.room.makeAction<any>('peer-list');
      this.sendPeerList = sendPL as (data: string[], targetPeers?: string[]) => void;

      receivePL((data: unknown, peerId: string) => {
        if (!Array.isArray(data)) return;
        const now = Date.now();
        // 送信者は確実に存在する
        this.allKnownPeers.set(peerId, now);
        // 受信したリストをマージ (間接的に学習)
        for (const id of data) {
          if (typeof id === 'string' && id.length > 0 && id.length < 100) {
            this.allKnownPeers.set(id, now);
          }
        }
        this.emitCountIfChanged();
      });

      this.room.onPeerJoin((peerId) => {
        this.peers.add(peerId);
        this.allKnownPeers.set(peerId, Date.now());
        this.callbacks.onPeerJoin(peerId);
        this.scheduleImmediateGossip();
      });

      this.room.onPeerLeave((peerId) => {
        this.peers.delete(peerId);
        this.allKnownPeers.delete(peerId);
        this.syncedPeers.delete(peerId);
        this.commentLimiter.removePeer(peerId);
        this.logSyncLimiter.removePeer(peerId);
        this.callbacks.onPeerLeave(peerId);
        this.scheduleImmediateGossip();
      });

      // 定期ゴシップ開始
      this.gossipTimer = setInterval(() => this.gossipRound(), GOSSIP_INTERVAL_MS);

      log(`P2P room joined: nfjk-${this.titleId}`);
    } catch (err) {
      console.error('[Netflix Jikkyo] Failed to join P2P room:', err);
      this.scheduleReconnect();
    }
  }

  // --- ゴシッププロトコル ---

  /** 定期ゴシップ: stale ピアの除外 → 既知リストを全直接ピアに送信 */
  private gossipRound(): void {
    if (!this.sendPeerList || this.peers.size === 0) return;

    const now = Date.now();

    // 直接接続中のピアは常に fresh
    for (const id of this.peers) {
      this.allKnownPeers.set(id, now);
    }

    // stale ピアを除外 (直接接続中のものは除く)
    for (const [id, lastSeen] of this.allKnownPeers) {
      if (now - lastSeen > GOSSIP_STALE_MS && !this.peers.has(id)) {
        this.allKnownPeers.delete(id);
      }
    }

    // 全既知ピアのリストを送信
    this.sendPeerList([...this.allKnownPeers.keys()]);
    this.emitCountIfChanged();
  }

  /** join/leave 直後の即時ゴシップ (debounce 付き) */
  private scheduleImmediateGossip(): void {
    if (this.gossipDebounceTimer) return;
    this.gossipDebounceTimer = setTimeout(() => {
      this.gossipDebounceTimer = null;
      this.gossipRound();
    }, GOSSIP_DEBOUNCE_MS);
  }

  /** グローバルカウントが変化した場合のみコールバックを発火 */
  private emitCountIfChanged(): void {
    const count = this.getGlobalPeerCount();
    if (count !== this.lastEmittedCount) {
      this.lastEmittedCount = count;
      this.callbacks.onPeerCountUpdate?.(count);
    }
  }

  /**
   * ゴシップで算出したグローバルピア数を返す (自分を含む)。
   *
   * - allKnownPeers にはゴシップ収束後に自分の ID も含まれる
   *   (他ピアの直接接続リストに自分が載るため)
   * - 収束前は allKnownPeers に自分が含まれないため、
   *   max(allKnownPeers.size, directPeers.size + 1) で自分を補正
   */
  getGlobalPeerCount(): number {
    return Math.max(this.allKnownPeers.size, this.peers.size + 1);
  }

  /** コメントを全ピアに送信する */
  send(comment: P2PCommentMessage): void {
    if (this.sendComment) {
      this.sendComment(comment);
    }
  }

  /** 特定ピアにログ同期リクエストを送信する */
  requestLogSync(peerId: string, sinceTimestamp?: number): void {
    if (!this.sendLogRequest) return;
    if (this.syncedPeers.has(peerId)) return; // 同期済み
    this.syncedPeers.add(peerId);
    const request: P2PLogRequest = { titleId: this.titleId, sinceTimestamp };
    this.sendLogRequest(request, [peerId]);
    log(`Log sync requested from peer: ${peerId}`);
  }

  /** 特定ピアにログ同期レスポンスチャンクを送信する */
  sendLogResponseChunk(response: P2PLogResponse, peerId: string): void {
    if (this.sendLogResponse) {
      this.sendLogResponse(response, [peerId]);
    }
  }

  /** 直接接続のピア数を返す (後方互換) */
  getPeerCount(): number {
    return this.peers.size;
  }

  /** 自動再接続スケジュール (3秒後) */
  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.reconnectTimer = setTimeout(() => {
      log('Attempting P2P reconnect...');
      this.leave();
      this.join();
    }, 3000);
  }

  /** ルームから離脱する */
  leave(): void {
    if (this.gossipTimer) {
      clearInterval(this.gossipTimer);
      this.gossipTimer = null;
    }
    if (this.gossipDebounceTimer) {
      clearTimeout(this.gossipDebounceTimer);
      this.gossipDebounceTimer = null;
    }
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
    this.sendComment = null;
    this.sendLogRequest = null;
    this.sendLogResponse = null;
    this.sendPeerList = null;
    this.peers.clear();
    this.syncedPeers.clear();
    this.allKnownPeers.clear();
    this.lastEmittedCount = 0;
  }

  /** 完全破棄 */
  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.commentLimiter.destroy();
    this.logSyncLimiter.destroy();
    this.leave();
  }
}

export function createRoom(titleId: string, callbacks: RoomCallbacks, flags: FeatureFlags): P2PRoom {
  const isRelayTarget =
    flags.liveRelay &&
    flags.relayEndpoint &&
    (flags.relayTitleIds.length === 0 || flags.relayTitleIds.includes(titleId));

  if (isRelayTarget) {
    log(`Live relay enabled for title ${titleId} → endpoint: ${flags.relayEndpoint}`);
    log('Falling back to P2P');
  }

  log(`P2P room for title: ${titleId}`);
  return new P2PRoom(titleId, callbacks);
}
