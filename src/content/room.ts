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

export interface RoomCallbacks {
  onComment: (comment: ValidatedComment, peerId: string) => void;
  onPeerJoin: (peerId: string) => void;
  onPeerLeave: (peerId: string) => void;
  onLogRequest?: (request: P2PLogRequest, peerId: string) => void;
  onLogResponse?: (response: P2PLogResponse, peerId: string) => void;
}

export class P2PRoom {
  private room: Room | null = null;
  private sendComment: ((data: P2PCommentMessage, targetPeers?: string[]) => void) | null = null;
  private sendLogRequest: ((data: P2PLogRequest, targetPeers?: string[]) => void) | null = null;
  private sendLogResponse: ((data: P2PLogResponse, targetPeers?: string[]) => void) | null = null;
  private titleId: string;
  private callbacks: RoomCallbacks;
  private peers = new Set<string>();
  private syncedPeers = new Set<string>();
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private commentLimiter = new PeerRateLimiter(RATE_LIMIT_MAX_MESSAGES, RATE_LIMIT_WINDOW_MS);
  private logSyncLimiter = new PeerRateLimiter(LOG_SYNC_RATE_LIMIT_MAX, LOG_SYNC_RATE_LIMIT_WINDOW_MS);

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

      this.room.onPeerJoin((peerId) => {
        this.peers.add(peerId);
        this.callbacks.onPeerJoin(peerId);
      });

      this.room.onPeerLeave((peerId) => {
        this.peers.delete(peerId);
        this.syncedPeers.delete(peerId);
        this.commentLimiter.removePeer(peerId);
        this.logSyncLimiter.removePeer(peerId);
        this.callbacks.onPeerLeave(peerId);
      });

      log(`P2P room joined: nfjk-${this.titleId}`);
    } catch (err) {
      console.error('[Netflix Jikkyo] Failed to join P2P room:', err);
      this.scheduleReconnect();
    }
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

  /** 現在のピア数を返す */
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
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
    this.sendComment = null;
    this.sendLogRequest = null;
    this.sendLogResponse = null;
    this.peers.clear();
    this.syncedPeers.clear();
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
