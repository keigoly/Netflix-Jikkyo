// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import type { Comment } from '../types';

/** アクティブな Netflix watch タブを取得する */
async function getNetflixTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id !== undefined && tab.url?.includes('netflix.com/watch/')) {
    return tab;
  }
  // アクティブタブがNetflixでない場合、全タブから探す
  const netflixTabs = await chrome.tabs.query({ url: '*://*.netflix.com/watch/*' });
  return netflixTabs[0] ?? null;
}

/** コンテンツスクリプトにストレージクエリを送信する */
async function query<T>(method: string, args: unknown[] = []): Promise<T> {
  const tab = await getNetflixTab();
  if (!tab?.id) {
    throw new Error('Netflix tab not found');
  }
  const result = await chrome.tabs.sendMessage(tab.id, {
    type: 'storage-query',
    method,
    args,
  });
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(result.error as string);
  }
  return result as T;
}

/** タイトルIDでコメントを取得する */
export async function getCommentsByTitle(titleId: string): Promise<Comment[]> {
  return query<Comment[]>('getCommentsByTitle', [titleId]);
}

/** ストレージ統計 */
export async function getStorageStats(): Promise<{ totalComments: number; titleCount: number; oldestTimestamp: number | null }> {
  return query('getStorageStats');
}

/** ストレージ使用量を推定 (バイト) */
export async function estimateStorageSize(): Promise<number> {
  return query<number>('estimateStorageSize');
}

/** 全コメントをJSON文字列で取得 (エクスポート用) */
export async function exportAllComments(): Promise<string> {
  return query<string>('exportAllComments');
}

/** 全コメントを削除 */
export async function clearAllComments(): Promise<void> {
  await query<{ ok: boolean }>('clearAllComments');
}

/** タイトル別コメントを最大件数にトリムする */
export async function trimCommentsByTitle(titleId: string, maxCount: number): Promise<number> {
  return query<number>('trimCommentsByTitle', [titleId, maxCount]);
}

/** タイトルの直近N件のコメントを削除する */
export async function deleteLatestComments(titleId: string, count: number): Promise<number> {
  return query<number>('deleteLatestComments', [titleId, count]);
}
