// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

declare const __DEV_MOCK__: boolean;

/** chrome.tabs.query 用パターン — コンテンツスクリプトが動作するタブの検索に使用 */
export const CONTENT_TAB_PATTERNS: string[] = [
  '*://*.netflix.com/watch/*',
  '*://*.netflix.com/live/*',
  '*://*.netflix.com/event/*',
];

// モックモード: localhost のモック Netflix ページも対象にする
if (typeof __DEV_MOCK__ !== 'undefined' && __DEV_MOCK__) {
  CONTENT_TAB_PATTERNS.push(
    'http://localhost:*/watch/*',
    'http://localhost:*/live/*',
    'http://localhost:*/event/*',
  );
}

/** URL がコンテンツスクリプト対象ページ (モック時は localhost も含む) かを判定 */
export function isContentPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (!/\/(watch|live|event)\/\d+/.test(url)) return false;
  if (url.includes('netflix.com')) return true;
  if (typeof __DEV_MOCK__ !== 'undefined' && __DEV_MOCK__ && url.includes('localhost')) return true;
  return false;
}
