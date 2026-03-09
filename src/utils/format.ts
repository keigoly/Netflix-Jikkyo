// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

/**
 * 大きな数値をコンパクトに表示する (ロケール対応)
 *
 * ja: 1.2万, 10万, 100万, 1000万
 * en: 12K, 100K, 1M, 10M
 * 10,000 未満はカンマ区切りでそのまま表示
 */
export function formatCount(count: number, locale = 'ja'): string {
  if (count < 10000) return count.toLocaleString(locale);
  try {
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(count);
  } catch {
    // フォールバック: カンマ区切り
    return count.toLocaleString(locale);
  }
}
