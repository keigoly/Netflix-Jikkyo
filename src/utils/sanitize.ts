// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import type { Comment, P2PCommentMessage, P2PLogRequest, P2PLogResponse } from '../types';
import {
  MAX_COMMENT_TEXT_LENGTH,
  MAX_NICKNAME_LENGTH,
  MAX_COMMENT_ID_LENGTH,
  MAX_TITLE_ID_LENGTH,
  MAX_USER_ID_LENGTH,
  MAX_VIDEO_TIME,
  TIMESTAMP_MAX_AGE_MS,
  TIMESTAMP_MAX_FUTURE_MS,
  MAX_LOG_RESPONSE_CHUNK_SIZE,
  MAX_LOG_RESPONSE_TOTAL_CHUNKS,
} from '../types';

const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF\uFFF9-\uFFFB]/g;

export function stripControlChars(text: string): string {
  return text.replace(CONTROL_CHARS_RE, '');
}

export function sanitizeText(value: unknown, maxLength: number = MAX_COMMENT_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = stripControlChars(value).trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, maxLength);
}

export function sanitizeId(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = stripControlChars(value).replace(/\s/g, '');
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, maxLength);
}

export function sanitizeNumber(value: unknown, min: number, max: number, defaultValue?: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue ?? null;
  }
  if (value < min || value > max) {
    return defaultValue ?? null;
  }
  return value;
}

export function isValidTimestamp(ts: unknown): ts is number {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return false;
  const now = Date.now();
  return ts >= now - TIMESTAMP_MAX_AGE_MS && ts <= now + TIMESTAMP_MAX_FUTURE_MS;
}

/** validateP2PComment の戻り値型 */
export type ValidatedComment = P2PCommentMessage;

export function validateP2PComment(data: unknown): ValidatedComment | null {
  if (data == null || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;

  const id = sanitizeId(msg.id, MAX_COMMENT_ID_LENGTH);
  if (!id) return null;

  const text = sanitizeText(msg.text, MAX_COMMENT_TEXT_LENGTH);
  if (!text) return null;

  const nickname = sanitizeText(msg.nickname, MAX_NICKNAME_LENGTH);
  if (!nickname) return null;

  if (!isValidTimestamp(msg.timestamp)) return null;

  const videoTime = msg.videoTime !== undefined
    ? sanitizeNumber(msg.videoTime, 0, MAX_VIDEO_TIME)
    : undefined;
  if (msg.videoTime !== undefined && videoTime === null) return null;

  const userId = msg.userId !== undefined
    ? sanitizeId(msg.userId, MAX_USER_ID_LENGTH)
    : undefined;
  if (msg.userId !== undefined && userId === null) return null;

  const admin = typeof msg.admin === 'string' ? msg.admin : undefined;
  const signature = typeof msg.signature === 'string' ? msg.signature : undefined;

  return {
    id,
    text,
    nickname,
    timestamp: msg.timestamp as number,
    videoTime: videoTime ?? undefined,
    userId: userId ?? undefined,
    admin,
    signature,
  };
}

export function validateLogRequest(data: unknown): P2PLogRequest | null {
  if (data == null || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;

  const titleId = sanitizeId(msg.titleId, MAX_TITLE_ID_LENGTH);
  if (!titleId) return null;

  const sinceTimestamp = msg.sinceTimestamp !== undefined
    ? sanitizeNumber(msg.sinceTimestamp, 0, Date.now() + TIMESTAMP_MAX_FUTURE_MS)
    : undefined;
  if (msg.sinceTimestamp !== undefined && sinceTimestamp === null) return null;

  return {
    titleId,
    sinceTimestamp: sinceTimestamp ?? undefined,
  };
}

export function validateLogResponse(data: unknown): P2PLogResponse | null {
  if (data == null || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;

  const titleId = sanitizeId(msg.titleId, MAX_TITLE_ID_LENGTH);
  if (!titleId) return null;

  if (!Array.isArray(msg.comments)) return null;
  if (msg.comments.length > MAX_LOG_RESPONSE_CHUNK_SIZE) return null;

  const chunkIndex = sanitizeNumber(msg.chunkIndex, 0, MAX_LOG_RESPONSE_TOTAL_CHUNKS - 1);
  if (chunkIndex === null) return null;

  const totalChunks = sanitizeNumber(msg.totalChunks, 1, MAX_LOG_RESPONSE_TOTAL_CHUNKS);
  if (totalChunks === null) return null;

  if (typeof msg.done !== 'boolean') return null;

  const validComments: Comment[] = [];
  for (const c of msg.comments) {
    const validated = validateComment(c, titleId);
    if (validated) {
      validComments.push(validated);
    }
  }

  return {
    titleId,
    comments: validComments,
    chunkIndex,
    totalChunks,
    done: msg.done,
  };
}

export function validateComment(data: unknown, expectedTitleId?: string): Comment | null {
  if (data == null || typeof data !== 'object') return null;
  const c = data as Record<string, unknown>;

  const id = sanitizeId(c.id, MAX_COMMENT_ID_LENGTH);
  if (!id) return null;

  const text = sanitizeText(c.text, MAX_COMMENT_TEXT_LENGTH);
  if (!text) return null;

  const nickname = sanitizeText(c.nickname, MAX_NICKNAME_LENGTH);
  if (!nickname) return null;

  if (!isValidTimestamp(c.timestamp)) return null;

  const titleId = sanitizeId(c.titleId, MAX_TITLE_ID_LENGTH);
  if (!titleId) return null;
  if (expectedTitleId && titleId !== expectedTitleId) return null;

  const videoTime = c.videoTime !== undefined
    ? sanitizeNumber(c.videoTime, 0, MAX_VIDEO_TIME)
    : undefined;
  if (c.videoTime !== undefined && videoTime === null) return null;

  const userId = c.userId !== undefined
    ? sanitizeId(c.userId, MAX_USER_ID_LENGTH)
    : undefined;
  if (c.userId !== undefined && userId === null) return null;

  return {
    id,
    text,
    nickname,
    timestamp: c.timestamp as number,
    titleId,
    videoTime: videoTime ?? undefined,
    userId: userId ?? undefined,
  };
}

interface PeerBucket {
  tokens: number;
  lastRefill: number;
}

export class PeerRateLimiter {
  private buckets = new Map<string, PeerBucket>();
  private maxTokens: number;
  private windowMs: number;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(maxTokens: number, windowMs: number) {
    this.maxTokens = maxTokens;
    this.windowMs = windowMs;
    this.cleanupTimer = setInterval(() => this.cleanup(), 30_000);
  }

  allow(peerId: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(peerId);
    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(peerId, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    if (elapsed >= this.windowMs) {
      bucket.tokens = this.maxTokens;
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }
    return false;
  }

  removePeer(peerId: string): void {
    this.buckets.delete(peerId);
  }

  private cleanup(): void {
    const threshold = Date.now() - 30_000;
    for (const [peerId, bucket] of this.buckets) {
      if (bucket.lastRefill < threshold) {
        this.buckets.delete(peerId);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.buckets.clear();
  }
}

export function clearElement(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}
