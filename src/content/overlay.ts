// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

const OVERLAY_ID = 'nfjk-danmaku-overlay';

/** 弾幕オーバーレイを作成してプレイヤーコンテナに注入する */
export function createOverlay(playerContainer: HTMLElement): HTMLElement {
  // 既存のオーバーレイがあれば削除
  removeOverlay();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.classList.add('nfjk-danmaku');

  // プレイヤーの position が static なら relative に変更
  const computed = getComputedStyle(playerContainer);
  if (computed.position === 'static') {
    playerContainer.style.position = 'relative';
  }

  playerContainer.appendChild(overlay);
  return overlay;
}

/** オーバーレイを削除する */
export function removeOverlay(): void {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();
}

/** フルスクリーン変更時にオーバーレイを再マウントする */
export function watchFullscreen(
  getPlayerContainer: () => HTMLElement | null,
  onRemount: (overlay: HTMLElement) => void,
): () => void {
  const handler = () => {
    const container = getPlayerContainer();
    if (!container) return;

    // オーバーレイがDOMから外れていたら再マウント
    const existing = document.getElementById(OVERLAY_ID);
    if (!existing || !document.body.contains(existing)) {
      const overlay = createOverlay(container);
      onRemount(overlay);
    }
  };

  document.addEventListener('fullscreenchange', handler);
  return () => document.removeEventListener('fullscreenchange', handler);
}
