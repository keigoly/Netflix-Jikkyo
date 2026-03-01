// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { log, warn } from './logger';

/** /watch/(\d+), /live/(\d+), /event/(\d+) からタイトルIDを抽出する */
export function getTitleId(): string | null {
  const match = location.pathname.match(/\/(?:watch|live|event)\/(\d+)/);
  return match ? match[1] : null;
}

/** 動画プレイヤーのコンテナDOMを取得する (複数セレクタでフォールバック) */
export function getPlayerContainer(): HTMLElement | null {
  const selectors = [
    '.watch-video--player-view',
    '[data-uia="video-canvas"]',
    '[data-uia="player"]',
    '.VideoContainer',
    '.NFPlayer',
    '.watch-video',
    '.ltr-omkt8s',
  ];
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}

/** SPA遷移を監視し、URL変更時にコールバックを呼ぶ */
export function watchNavigation(callback: (url: string) => void): () => void {
  let currentUrl = location.href;

  const check = () => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      callback(currentUrl);
    }
  };

  // pushState / replaceState をフック
  const origPushState = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    origPushState(...args);
    check();
  };
  history.replaceState = function (...args) {
    origReplaceState(...args);
    check();
  };

  // popstate (ブラウザバック/フォワード)
  window.addEventListener('popstate', check);

  // クリーンアップ
  return () => {
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
    window.removeEventListener('popstate', check);
  };
}

/** "Netflix" 単体やサイト名だけのテキストを除外する */
function isUsefulText(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return lower !== '' && lower !== 'netflix' && lower !== 'netflix japan';
}

/** テキストからタイトル部分を抽出する ("タイトル | Netflix" → "タイトル") */
function stripNetflixSuffix(text: string): string {
  return text.replace(/\s*[-–—|]\s*Netflix.*$/i, '').trim();
}

/** Netflix メタデータAPIからタイトル情報を取得する */
async function fetchMetadataFromNetflixAPI(titleId: string): Promise<{ title?: string; subtitle?: string; description?: string } | null> {
  try {
    const url = new URL('https://www.netflix.com/nq/website/memberapi/release/metadata');
    url.searchParams.set('movieid', titleId);
    url.searchParams.set('_', Date.now().toString());

    const res = await fetch(url.toString(), { credentials: 'same-origin' });
    if (!res.ok) {
      warn(`Metadata API returned ${res.status}`);
      return null;
    }

    const json = await res.json();
    if (!json.video) return null;

    const video = json.video;
    const result: { title?: string; subtitle?: string; description?: string } = {};

    // メインタイトル (シリーズ名 or 映画名)
    if (video.title && isUsefulText(video.title)) {
      result.title = video.title;
    }
    if (video.synopsis) {
      result.description = video.synopsis;
    }

    // エピソードの場合: seasons から該当エピソードを探す
    if (video.seasons && Array.isArray(video.seasons)) {
      const episodeId = Number(titleId);
      for (const season of video.seasons) {
        if (!season.episodes || !Array.isArray(season.episodes)) continue;
        const episode = season.episodes.find((ep: { id: number }) => ep.id === episodeId);
        if (episode) {
          // シーズンタイトルを含める
          if (season.title && isUsefulText(season.title)) {
            if (season.title.startsWith(video.title)) {
              result.title = season.title;
            } else {
              result.title = `${video.title} ${season.title}`;
            }
          }
          // エピソード名をサブタイトルに
          if (episode.title) {
            result.subtitle = episode.seq ? `${episode.seq}話 ${episode.title}` : episode.title;
          }
          if (episode.synopsis) {
            result.description = episode.synopsis;
          }
          break;
        }
      }
    }

    log('Metadata API result:', result);
    return result.title ? result : null;
  } catch (e) {
    console.error('[Netflix Jikkyo] Metadata API failed:', e);
    return null;
  }
}

/** Netflix ページからタイトルメタデータを抽出する (同期版 — フォールバック) */
export function getTitleMetadataSync(titleId: string): { titleId: string; title: string; subtitle?: string; description?: string } {
  let title = '';
  let subtitle: string | undefined;
  let description: string | undefined;

  // document.title
  const docTitle = stripNetflixSuffix(document.title);
  if (isUsefulText(docTitle)) {
    const colonIndex = docTitle.indexOf(':');
    if (colonIndex > 0) {
      title = docTitle.substring(0, colonIndex).trim();
      subtitle = docTitle.substring(colonIndex + 1).trim();
    } else {
      title = docTitle;
    }
  }

  // og:title
  if (!title) {
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle?.content) {
      const ogText = stripNetflixSuffix(ogTitle.content);
      if (isUsefulText(ogText)) {
        title = ogText;
      }
    }
  }

  // meta description
  const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDesc?.content && isUsefulText(metaDesc.content)) {
    description = metaDesc.content.trim();
  }
  if (!description) {
    const ogDesc = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (ogDesc?.content && isUsefulText(ogDesc.content)) {
      description = ogDesc.content.trim();
    }
  }

  return { titleId, title: title || `タイトル ${titleId}`, subtitle, description };
}

/** Netflix ページからタイトルメタデータを抽出する (非同期版) */
export async function getTitleMetadata(titleId: string): Promise<{ titleId: string; title: string; subtitle?: string; description?: string }> {
  // 1. Netflix メタデータAPI (最も確実)
  const apiResult = await fetchMetadataFromNetflixAPI(titleId);
  if (apiResult?.title && isUsefulText(apiResult.title)) {
    return {
      titleId,
      title: apiResult.title,
      subtitle: apiResult.subtitle,
      description: apiResult.description,
    };
  }

  // 2. 同期版フォールバック (document.title / meta tags)
  const syncResult = getTitleMetadataSync(titleId);
  return syncResult;
}

export function waitForElement(selector: string, timeout = 15000): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLElement>(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`waitForElement: "${selector}" not found within ${timeout}ms`));
    }, timeout);
  });
}
