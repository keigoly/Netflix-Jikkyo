// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

/**
 * Mock ページ専用デバッグオーバーレイ
 * __DEV_MOCK__ が true の場合のみ有効化される
 */

declare const __DEV_MOCK__: boolean;

interface DebugState {
  pastDanmakuCount: number;
  pastDanmakuIndex: number;
  lastVideoTime: number;
  videoCurrentTime: number;
  videoDuration: number;
  videoPaused: boolean;
  danmakuExists: boolean;
  danmakuPaused: boolean;
  danmakuActiveCount: number;
  isLiveEdge: boolean;
  isBridgeTarget: boolean;
  nicoBridgeConnected: boolean;
  currentTitleId: string | null;
  overlayExists: boolean;
  // パフォーマンスメトリクス
  dripQueueLength: number;
  droppedComments: number;
  totalReceived: number;
  pauseBufferLength: number;
}

type DebugStateGetter = () => DebugState;

let overlayEl: HTMLDivElement | null = null;
let updateTimer: ReturnType<typeof setInterval> | null = null;
let getter: DebugStateGetter | null = null;

// FPS 計測
let fps = 0;
let frameCount = 0;
let lastFpsTime = performance.now();
let rafId: number | null = null;

function measureFps(): void {
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFpsTime = now;
  }
  rafId = requestAnimationFrame(measureFps);
}

// 直近のイベントログ (最大30件)
const eventLog: string[] = [];
const MAX_LOG_ENTRIES = 30;

export function debugLog(msg: string): void {
  if (!overlayEl) return;
  const ts = new Date().toLocaleTimeString('ja-JP', { hour12: false, fractionalSecondDigits: 2 });
  eventLog.push(`[${ts}] ${msg}`);
  if (eventLog.length > MAX_LOG_ENTRIES) eventLog.shift();
  renderLog();
}

function renderLog(): void {
  const logEl = document.getElementById('nfjk-debug-log');
  if (!logEl) return;
  logEl.textContent = eventLog.join('\n');
  logEl.scrollTop = logEl.scrollHeight;
}

export function initDebugOverlay(stateGetter: DebugStateGetter): void {
  if (typeof __DEV_MOCK__ === 'undefined' || !__DEV_MOCK__) return;
  if (!location.hostname.includes('localhost')) return;

  getter = stateGetter;

  overlayEl = document.createElement('div');
  overlayEl.id = 'nfjk-debug-overlay';
  overlayEl.style.cssText = `
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 999998;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(6px);
    color: #0f0;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    line-height: 1.5;
    padding: 10px 14px;
    border-radius: 6px;
    border: 1px solid #333;
    max-width: 480px;
    min-width: 360px;
    pointer-events: auto;
    user-select: text;
  `;

  overlayEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span style="color:#E50914;font-weight:700;font-size:12px">DEBUG</span>
      <span id="nfjk-debug-toggle" style="cursor:pointer;color:#888;font-size:14px;padding:0 4px">_</span>
    </div>
    <div id="nfjk-debug-state"></div>
    <div style="border-top:1px solid #333;margin:6px 0"></div>
    <div id="nfjk-debug-log" style="max-height:140px;overflow-y:auto;color:#aaa;font-size:10px;white-space:pre-wrap"></div>
  `;

  document.body.appendChild(overlayEl);

  // 折りたたみ
  const toggleBtn = document.getElementById('nfjk-debug-toggle');
  const stateEl = document.getElementById('nfjk-debug-state');
  const logEl = document.getElementById('nfjk-debug-log');
  const sep = overlayEl.querySelector('div[style*="border-top"]') as HTMLElement;
  toggleBtn?.addEventListener('click', () => {
    const hidden = stateEl?.style.display === 'none';
    if (stateEl) stateEl.style.display = hidden ? '' : 'none';
    if (logEl) logEl.style.display = hidden ? '' : 'none';
    if (sep) sep.style.display = hidden ? '' : 'none';
    if (toggleBtn) toggleBtn.textContent = hidden ? '_' : '+';
  });

  updateTimer = setInterval(renderState, 200);
  renderState();

  // FPS 計測開始
  rafId = requestAnimationFrame(measureFps);
}

function renderState(): void {
  const el = document.getElementById('nfjk-debug-state');
  if (!el || !getter) return;

  const s = getter();

  const bool = (v: boolean) => v ? '<span style="color:#0f0">true</span>' : '<span style="color:#f55">false</span>';
  const num = (v: number) => `<span style="color:#ff0">${typeof v === 'number' && isFinite(v) ? v.toFixed(2) : v}</span>`;

  el.innerHTML = `
<span style="color:#888">-- Video --</span>
currentTime: ${num(s.videoCurrentTime)}  duration: ${num(s.videoDuration)}
paused: ${bool(s.videoPaused)}  liveEdge: ${bool(s.isLiveEdge)}

<span style="color:#888">-- Danmaku --</span>
exists: ${bool(s.danmakuExists)}  paused: ${bool(s.danmakuPaused)}  active: ${num(s.danmakuActiveCount)}
overlayInDOM: ${bool(s.overlayExists)}

<span style="color:#888">-- Past Replay --</span>
comments: ${num(s.pastDanmakuCount)}  index: ${num(s.pastDanmakuIndex)}  lastVT: ${num(s.lastVideoTime)}

<span style="color:#888">-- Bridge --</span>
titleId: <span style="color:#ff0">${s.currentTitleId ?? 'null'}</span>
bridgeTarget: ${bool(s.isBridgeTarget)}  connected: ${bool(s.nicoBridgeConnected)}

<span style="color:#888">-- Performance --</span>
FPS: <span style="color:${fps >= 50 ? '#0f0' : fps >= 30 ? '#ff0' : '#f55'}">${fps}</span>  dripQueue: ${num(s.dripQueueLength)}  pauseBuf: ${num(s.pauseBufferLength)}
received: ${num(s.totalReceived)}  dropped: <span style="color:${s.droppedComments > 0 ? '#f55' : '#0f0'}">${s.droppedComments}</span>
  `.trim();
}

export function destroyDebugOverlay(): void {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  overlayEl?.remove();
  overlayEl = null;
  getter = null;
  eventLog.length = 0;
}
