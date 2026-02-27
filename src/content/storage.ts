// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { openDB, type IDBPDatabase } from 'idb';
import type { Comment } from '../types';

const DB_NAME = 'netflix-jikkyo';
const DB_VERSION = 1;
const STORE_NAME = 'comments';

const RETENTION_DAYS = 365;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('byTitleId', 'titleId', { unique: false });
          store.createIndex('byTimestamp', 'timestamp', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

/** コメントを保存する */
export async function saveComment(comment: Comment): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, comment);
}

/** 複数コメントを一括保存する */
export async function saveComments(comments: Comment[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const comment of comments) {
    tx.store.put(comment);
  }
  await tx.done;
}

/** タイトルIDでコメントを取得する (タイムスタンプ昇順) */
export async function getCommentsByTitle(titleId: string): Promise<Comment[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_NAME, 'byTitleId', titleId);
}

/** 古いコメントをクリーンアップする */
export async function cleanupOldComments(): Promise<number> {
  const db = await getDB();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const index = tx.store.index('byTimestamp');
  let cursor = await index.openCursor();
  let deleted = 0;

  while (cursor) {
    if (cursor.value.timestamp < cutoff) {
      await cursor.delete();
      deleted++;
    } else {
      break; // タイムスタンプ昇順なのでこれ以降は新しい
    }
    cursor = await cursor.continue();
  }

  await tx.done;
  return deleted;
}

/** タイムスタンプ以降のコメントをタイトルIDで取得 */
export async function getCommentsByTitleSince(titleId: string, sinceTimestamp: number): Promise<Comment[]> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.store.index('byTitleId');
  const all = await index.getAll(titleId);
  return all.filter((c) => c.timestamp > sinceTimestamp);
}

/** タイトル別コメントを最大件数にトリムする (古い順に削除) */
export async function trimCommentsByTitle(titleId: string, maxCount: number): Promise<number> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const index = tx.store.index('byTitleId');
  const all = await index.getAll(titleId);
  if (all.length <= maxCount) {
    await tx.done;
    return 0;
  }
  // timestamp昇順ソートして古い方から削除
  all.sort((a, b) => a.timestamp - b.timestamp);
  const toDelete = all.slice(0, all.length - maxCount);
  for (const c of toDelete) {
    await tx.store.delete(c.id);
  }
  await tx.done;
  return toDelete.length;
}

/** タイトルの最新タイムスタンプを取得 */
export async function getLatestTimestamp(titleId: string): Promise<number | null> {
  const comments = await getCommentsByTitle(titleId);
  if (comments.length === 0) return null;
  return Math.max(...comments.map((c) => c.timestamp));
}

/** 全コメント数を取得 */
export async function getCommentCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_NAME);
}

/** タイトル一覧 (titleId のユニークリスト + コメント数) を取得 */
export async function getTitleList(): Promise<{ titleId: string; count: number; lastTimestamp: number }[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);

  const map = new Map<string, { count: number; lastTimestamp: number }>();
  for (const c of all) {
    const existing = map.get(c.titleId);
    if (existing) {
      existing.count++;
      existing.lastTimestamp = Math.max(existing.lastTimestamp, c.timestamp);
    } else {
      map.set(c.titleId, { count: 1, lastTimestamp: c.timestamp });
    }
  }

  return Array.from(map.entries())
    .map(([titleId, data]) => ({ titleId, ...data }))
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
}

/** 全コメントをJSON文字列で取得 (エクスポート用) */
export async function exportAllComments(): Promise<string> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  all.sort((a, b) => a.timestamp - b.timestamp);
  return JSON.stringify(all, null, 2);
}

/** タイトル別にコメントをエクスポート */
export async function exportCommentsByTitle(titleId: string): Promise<string> {
  const comments = await getCommentsByTitle(titleId);
  comments.sort((a, b) => a.timestamp - b.timestamp);
  return JSON.stringify(comments, null, 2);
}

/** タイトルの直近N件のコメントを削除する (新しい順) */
export async function deleteLatestComments(titleId: string, count: number): Promise<number> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const index = tx.store.index('byTitleId');
  const all = await index.getAll(titleId);
  if (all.length === 0) { await tx.done; return 0; }
  // timestamp降順 (新しい順) で上位N件を削除
  all.sort((a, b) => b.timestamp - a.timestamp);
  const toDelete = all.slice(0, count);
  for (const c of toDelete) {
    await tx.store.delete(c.id);
  }
  await tx.done;
  return toDelete.length;
}

/** 全コメントを削除 (ストレージ初期化) */
export async function clearAllComments(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

/** ストレージ使用量を推定 (バイト) */
export async function estimateStorageSize(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  // JSONシリアライズで概算
  return new Blob([JSON.stringify(all)]).size;
}

/** ストレージ統計 */
export async function getStorageStats(): Promise<{ totalComments: number; titleCount: number; oldestTimestamp: number | null }> {
  const db = await getDB();
  const totalComments = await db.count(STORE_NAME);

  const titles = await getTitleList();
  const titleCount = titles.length;

  let oldestTimestamp: number | null = null;
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.store.index('byTimestamp');
  const cursor = await index.openCursor();
  if (cursor) {
    oldestTimestamp = cursor.value.timestamp;
  }

  return { totalComments, titleCount, oldestTimestamp };
}
