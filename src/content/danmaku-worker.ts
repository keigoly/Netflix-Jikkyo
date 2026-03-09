// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

/**
 * OffscreenCanvas 弾幕レンダリングワーカー
 * メインスレッドから描画負荷を完全に分離し、動画再生への影響をゼロにする。
 * rAF が Worker 内で利用可能ならそちらを使い、なければ setTimeout(16ms) にフォールバック。
 */

import { COMMENT_COLOR, DANMAKU_BASE_FONT_SIZE, MAX_COMMENT_TEXT_LENGTH } from '../types';
import type { DanmakuItem } from '../types';

// --- Worker 用設定型 (Settings のサブセット) ---
interface WorkerSettings {
  danmakuEnabled: boolean;
  danmakuOpacity: number;
  danmakuScale: number;
  danmakuSpeedRate: number;
  danmakuFontFamily: string;
  danmakuUnlimited: boolean;
}

// --- 適応的品質制御定数 ---
const DEFAULT_MAX_ACTIVE = 150;
const MIN_MAX_ACTIVE = 40;
const ABSOLUTE_MAX_ACTIVE = 250;

// --- レンダリング状態 ---
let canvas: OffscreenCanvas;
let ctx: OffscreenCanvasRenderingContext2D;
let settings: WorkerSettings = {
  danmakuEnabled: true,
  danmakuOpacity: 1.0,
  danmakuScale: 100,
  danmakuSpeedRate: 1.0,
  danmakuFontFamily: "'Montserrat'",
  danmakuUnlimited: false,
};
let showing = true;
let paused = false;
let isFullscreen = false;

// アクティブ弾幕
interface ActiveComment {
  text: string;
  x: number;
  y: number;
  width: number;
  speed: number;    // px / ms
  fontSize: number;
  mine: boolean;
  tunnel: number;
}

interface ActiveAdmin {
  text: string;
  width: number;
  fontSize: number;
  startTime: number;
  opacity: number;
}

let items: ActiveComment[] = [];
let adminItems: ActiveAdmin[] = [];
let tunnelAvailableAt: number[] = [];

// アニメーションループ
let animFrameId = 0;
let lastRenderTime = 0;

// DPI スケーリング
let dpr = 1;
let canvasW = 0;
let canvasH = 0;

// 適応的品質制御
let maxActive = DEFAULT_MAX_ACTIVE;
let frameCount = 0;
let lastFpsCheck = 0;
let currentFps = 60;

// テキスト計測キャッシュ
let measureCtx: OffscreenCanvasRenderingContext2D | null = null;
let measureFontSize = 0;

// --- rAF / setTimeout 抽象化 (Worker では rAF が利用できない場合がある) ---
const scheduleFrame: (cb: (t: number) => void) => number =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;

const cancelFrame: (id: number) => void =
  typeof cancelAnimationFrame === 'function'
    ? (id) => cancelAnimationFrame(id)
    : (id) => clearTimeout(id);

// --- ユーティリティ ---

function getFontSize(): number {
  return DANMAKU_BASE_FONT_SIZE * (settings.danmakuScale / 100) * (canvasW / 1920);
}

function getTunnelHeight(fontSize: number): number {
  return fontSize + 6 * (canvasW / 1920);
}

function getDurationMs(): number {
  return ((isFullscreen ? 5.5 : 5) / settings.danmakuSpeedRate) * 1000;
}

function measureText(text: string, fontSize: number): number {
  if (!measureCtx || measureFontSize !== fontSize) {
    measureFontSize = fontSize;
    measureCtx = new OffscreenCanvas(1, 1).getContext('2d');
    const fontFamily = settings.danmakuFontFamily || "'Montserrat'";
    measureCtx!.font = `bold ${fontSize}px ${fontFamily}, "Segoe UI", Arial`;
  }
  let maxWidth = 0;
  for (const line of text.split('\n')) {
    const w = measureCtx!.measureText(line).width;
    if (w > maxWidth) maxWidth = w;
  }
  return maxWidth;
}

function findTunnel(width: number, speed: number): number {
  const now = performance.now();
  const tunnelCount = Math.floor(canvasH / getTunnelHeight(getFontSize()));
  if (tunnelCount <= 0) return -1;
  const maxTunnels = settings.danmakuUnlimited ? tunnelCount * 2 : tunnelCount;

  for (let i = 0; i < maxTunnels; i++) {
    if (!tunnelAvailableAt[i] || tunnelAvailableAt[i] <= now) {
      const clearTime = (width + 30) / speed;
      tunnelAvailableAt[i] = now + clearTime;
      return i % tunnelCount;
    }
  }
  return -1;
}

function sendActiveCount(): void {
  self.postMessage({ type: 'activeCount', count: items.length + adminItems.length });
}

// --- Canvas 操作 ---

function resizeCanvas(): void {
  if (canvasW === 0 || canvasH === 0) return;
  canvas.width = Math.round(canvasW * dpr);
  canvas.height = Math.round(canvasH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// --- 弾幕追加 ---

function drawItems(danList: DanmakuItem[]): void {
  if (!showing || !settings.danmakuEnabled) return;

  const cw = canvasW;
  const fontSize = getFontSize();
  const tunnelH = getTunnelHeight(fontSize);
  const duration = getDurationMs();

  for (const item of danList) {
    let text = item.text;
    if (text.length > MAX_COMMENT_TEXT_LENGTH) {
      text = text.slice(0, MAX_COMMENT_TEXT_LENGTH);
    }

    // 管理者コメント: 上部中央固定表示
    if (item.admin) {
      adminItems.push({
        text,
        width: measureText(text, fontSize * 1.15),
        fontSize: fontSize * 1.15,
        startTime: performance.now(),
        opacity: 0,
      });
      continue;
    }

    // 容量チェック (自分のコメントは常に許可)
    if (!item.mine && items.length >= maxActive) continue;

    const width = measureText(text, fontSize);
    const speed = (cw + width) / duration;

    const tunnel = findTunnel(width, speed);
    if (tunnel < 0 && !item.mine) continue;
    const effectiveTunnel = tunnel >= 0 ? tunnel : 0;

    items.push({
      text,
      x: cw,
      y: tunnelH * effectiveTunnel + 8,
      width,
      speed,
      fontSize,
      mine: !!item.mine,
      tunnel: effectiveTunnel,
    });
  }

  sendActiveCount();
  startLoop();
}

// --- レンダリングループ ---

function startLoop(): void {
  if (animFrameId || paused) return;
  lastRenderTime = performance.now();
  lastFpsCheck = lastRenderTime;
  frameCount = 0;
  animFrameId = scheduleFrame(render);
}

function render(timestamp: number): void {
  animFrameId = 0;
  if (paused) return;
  if (items.length === 0 && adminItems.length === 0) return;

  const dt = timestamp - lastRenderTime;
  lastRenderTime = timestamp;

  // dt が異常に大きい場合 (タブ非表示からの復帰等) はスキップ
  if (dt > 500) {
    animFrameId = scheduleFrame(render);
    return;
  }

  const cw = canvasW;
  ctx.clearRect(0, 0, cw, canvasH);

  // 管理者コメント
  renderAdminComments(timestamp, cw);

  // 通常コメント
  renderFlowingComments(dt, cw);

  // FPS 計測 + 適応的品質制御 (1秒ごと)
  frameCount++;
  if (timestamp - lastFpsCheck >= 1000) {
    currentFps = frameCount;
    frameCount = 0;
    lastFpsCheck = timestamp;
    adjustQuality();
    sendActiveCount();
  }

  // 次フレーム
  if (items.length > 0 || adminItems.length > 0) {
    animFrameId = scheduleFrame(render);
  } else {
    sendActiveCount();
  }
}

function renderFlowingComments(dt: number, cw: number): void {
  const opacity = settings.danmakuOpacity;
  const fontFamily = settings.danmakuFontFamily || "'Montserrat'";

  let i = items.length;
  while (i--) {
    const item = items[i];
    item.x -= item.speed * dt;

    if (item.x + item.width < 0) {
      items.splice(i, 1);
      continue;
    }

    ctx.font = `bold ${item.fontSize}px ${fontFamily}, "Segoe UI", Arial`;
    ctx.globalAlpha = opacity;
    ctx.textBaseline = 'top';

    const x = item.x;
    const y = item.y;

    // アウトライン
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineJoin = 'round';
    ctx.strokeText(item.text, x, y);

    // 本体
    ctx.fillStyle = COMMENT_COLOR;
    ctx.fillText(item.text, x, y);

    // 自分のコメント: 黄色い枠
    if (item.mine) {
      ctx.strokeStyle = 'rgba(255,204,0,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 3, y - 2, item.width + 6, item.fontSize + 4);
    }
  }

  ctx.globalAlpha = 1;
}

function renderAdminComments(timestamp: number, cw: number): void {
  const fontFamily = settings.danmakuFontFamily || "'Montserrat'";

  let i = adminItems.length;
  while (i--) {
    const item = adminItems[i];
    const elapsed = timestamp - item.startTime;

    if (elapsed > 5000) {
      adminItems.splice(i, 1);
      continue;
    }

    const progress = elapsed / 5000;
    if (progress < 0.08) item.opacity = progress / 0.08;
    else if (progress > 0.85) item.opacity = (1 - progress) / 0.15;
    else item.opacity = 1;

    const gradH = item.fontSize + 30;
    const grad = ctx.createLinearGradient(0, 0, 0, gradH);
    grad.addColorStop(0, `rgba(0,0,0,${0.7 * item.opacity})`);
    grad.addColorStop(0.7, `rgba(0,0,0,${0.5 * item.opacity})`);
    grad.addColorStop(1, `rgba(0,0,0,0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, gradH);

    ctx.font = `bold ${item.fontSize}px ${fontFamily}, "Segoe UI", Arial`;
    ctx.textBaseline = 'top';
    ctx.globalAlpha = item.opacity;

    const x = (cw - item.width) / 2;
    const y = 10;

    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineJoin = 'round';
    ctx.strokeText(item.text, x, y);

    ctx.fillStyle = '#FFE133';
    ctx.fillText(item.text, x, y);

    ctx.globalAlpha = 1;
  }
}

function adjustQuality(): void {
  if (currentFps < 25 && maxActive > MIN_MAX_ACTIVE) {
    maxActive = Math.max(MIN_MAX_ACTIVE, maxActive - 20);
  } else if (currentFps > 50 && maxActive < ABSOLUTE_MAX_ACTIVE) {
    maxActive = Math.min(ABSOLUTE_MAX_ACTIVE, maxActive + 10);
  }
}

function clearAll(): void {
  items = [];
  adminItems = [];
  tunnelAvailableAt = [];
  if (animFrameId) {
    cancelFrame(animFrameId);
    animFrameId = 0;
  }
  if (ctx && canvasW > 0) {
    ctx.clearRect(0, 0, canvasW, canvasH);
  }
  sendActiveCount();
}

// --- メッセージハンドラ ---
self.onmessage = (e: MessageEvent) => {
  const cmd = e.data;

  switch (cmd.type) {
    case 'init':
      canvas = cmd.canvas;
      ctx = canvas.getContext('2d')!;
      settings = cmd.settings;
      canvasW = cmd.width;
      canvasH = cmd.height;
      dpr = cmd.dpr;
      isFullscreen = cmd.isFullscreen;
      resizeCanvas();
      self.postMessage({ type: 'ready' });
      break;

    case 'draw':
      drawItems(cmd.items);
      break;

    case 'pause':
      paused = true;
      if (animFrameId) {
        cancelFrame(animFrameId);
        animFrameId = 0;
      }
      break;

    case 'resume':
      paused = false;
      if ((items.length > 0 || adminItems.length > 0) && !animFrameId) {
        lastRenderTime = performance.now();
        animFrameId = scheduleFrame(render);
      }
      break;

    case 'clear':
      clearAll();
      break;

    case 'hide':
      showing = false;
      clearAll();
      break;

    case 'show':
      showing = true;
      break;

    case 'resize':
      canvasW = cmd.width;
      canvasH = cmd.height;
      dpr = cmd.dpr;
      resizeCanvas();
      break;

    case 'settings':
      settings = cmd.settings;
      measureCtx = null;
      break;

    case 'fullscreen':
      isFullscreen = cmd.isFullscreen;
      break;
  }
};
