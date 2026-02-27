// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import type { Locale, TranslationKeys } from './types';
import ja from './locales/ja';

/** 言語選択肢 (ネイティブ名表示) */
export const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'cs', label: 'Čeština' },
  { value: 'zh-TW', label: '繁體中文' },
];

/** ロケールファイルのlazy import */
const loaders: Record<Locale, () => Promise<{ default: TranslationKeys }>> = {
  ja: () => Promise.resolve({ default: ja }),
  en: () => import('./locales/en'),
  ko: () => import('./locales/ko'),
  cs: () => import('./locales/cs'),
  'zh-TW': () => import('./locales/zh-TW'),
};

/** キャッシュ済み翻訳 */
const cache: Partial<Record<Locale, TranslationKeys>> = { ja };

let currentLocale: Locale = 'ja';
let currentTranslations: TranslationKeys = ja;
const listeners: Array<(locale: Locale) => void> = [];

/** 翻訳を取得 + {key} 形式の補間 */
export function t(key: keyof TranslationKeys, params?: Record<string, string | number>): string {
  let text = currentTranslations[key] ?? ja[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

/** 現在のロケールを取得 */
export function getLocale(): Locale {
  return currentLocale;
}

/** ロケールを変更し、リスナーに通知 */
export async function setLocale(locale: Locale): Promise<void> {
  if (!loaders[locale]) locale = 'ja';

  if (!cache[locale]) {
    try {
      const mod = await loaders[locale]();
      cache[locale] = mod.default;
    } catch {
      console.error(`[i18n] Failed to load locale: ${locale}, falling back to ja`);
      locale = 'ja';
    }
  }

  currentLocale = locale;
  currentTranslations = cache[locale] ?? ja;

  // html lang属性更新
  document.documentElement.lang = locale;

  for (const fn of listeners) {
    try { fn(locale); } catch (e) { console.error('[i18n] Listener error:', e); }
  }
}

/** ロケール変更コールバック登録 */
export function onLocaleChange(fn: (locale: Locale) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/**
 * data-i18n / data-i18n-placeholder / data-i18n-title 属性を持つ
 * DOM要素を一括翻訳する
 */
export function applyTranslations(root: ParentNode = document): void {
  // textContent
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as keyof TranslationKeys;
    if (key) el.textContent = t(key);
  });

  // placeholder
  root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder as keyof TranslationKeys;
    if (key && el instanceof HTMLInputElement) el.placeholder = t(key);
  });

  // title
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle as keyof TranslationKeys;
    if (key) el.title = t(key);
  });
}

export type { Locale, TranslationKeys };
