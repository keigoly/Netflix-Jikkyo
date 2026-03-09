// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { COMMENT_COLOR, DANMAKU_BASE_FONT_SIZE, MAX_COMMENT_TEXT_LENGTH, type DanmakuItem, type Settings } from '../types';

interface DanmakuOptions {
  container: HTMLElement;
  settings: Settings;
}

/** 同時に画面上に存在できる弾幕の上限 (適応的に変動) */
const DEFAULT_MAX_ACTIVE = 150;
const MIN_MAX_ACTIVE = 40;
const ABSOLUTE_MAX_ACTIVE = 250;

/** Canvas ベース弾幕レンダラー
 * Worker + OffscreenCanvas が利用可能な環境ではレンダリングを別スレッドで実行し
 * メインスレッドの負荷をゼロにする。利用できない場合はメインスレッドにフォールバック。 */
export class DanmakuRenderer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private settings: Settings;

  // --- Worker モード ---
  private worker: Worker | null = null;
  private workerMode = false;
  private shadowActiveCount = 0;
  private shadowPaused = false;
  private shadowShowing = true;

  // --- メインスレッドモード (フォールバック) ---
  private showing = true;
  private paused = false;
  private items: ActiveComment[] = [];
  private adminItems: ActiveAdmin[] = [];
  private tunnelInfo: { entryTime: number; width: number; speed: number }[] = [];
  private animFrameId = 0;
  private lastRenderTime = 0;
  private dpr = 1;
  private canvasW = 0;
  private canvasH = 0;
  private maxActive = DEFAULT_MAX_ACTIVE;
  private frameCount = 0;
  private lastFpsCheck = 0;
  private currentFps = 60;
  private measureCanvas: CanvasRenderingContext2D | null = null;
  private measureFontSize = 0;

  // フルスクリーン監視 (Worker モードのみ)
  private boundFullscreenChange: (() => void) | null = null;

  constructor(options: DanmakuOptions) {
    this.container = options.container;
    this.settings = options.settings;

    // Canvas 生成
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    this.container.appendChild(this.canvas);

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Worker + OffscreenCanvas を試行
    if (!this.tryInitWorker()) {
      // フォールバック: メインスレッドレンダリング
      this.ctx = this.canvas.getContext('2d')!;
      this.resizeCanvas();
    }
  }

  /** Worker + OffscreenCanvas の初期化を試みる
   *  ※ Netflix コンテンツスクリプト環境では CSP が chrome-extension:// の
   *    Worker スクリプト読み込みをブロックするため、常に false を返す。
   *    new Worker(url) は同期的に throw しないため、canvas.transferControlToOffscreen()
   *    後に非同期エラーとなり InvalidStateError を引き起こしていた。 */
  private tryInitWorker(): boolean {
    // Netflix の CSP が Worker スクリプトをブロックするためメインスレッドのみ使用
    return false;

    /* --- 以下は将来 CSP 問題が解決した場合の参考コード ---
    try {
      if (!this.canvas.transferControlToOffscreen) return false;
      if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return false;

      const workerUrl = chrome.runtime.getURL('danmaku-worker.js');
      const worker = new Worker(workerUrl);

      const offscreen = this.canvas.transferControlToOffscreen();
      this.worker = worker;

      this.worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'activeCount') {
          this.shadowActiveCount = e.data.count;
        }
      };

      this.worker.onerror = () => {
        console.warn('[DanmakuRenderer] Worker error, falling back to main thread');
        this.worker?.terminate();
        this.worker = null;
        this.workerMode = false;
        this.cleanupFullscreenListener();
        // Canvas が transfer 済みなので再生成
        this.recreateCanvas();
      };

      const w = this.container.offsetWidth;
      const h = this.container.offsetHeight;

      this.worker.postMessage({
        type: 'init',
        canvas: offscreen,
        settings: this.extractWorkerSettings(),
        width: w,
        height: h,
        dpr: this.dpr,
        isFullscreen: !!document.fullscreenElement,
      }, [offscreen]);

      this.workerMode = true;
      this.canvasW = w;
      this.canvasH = h;

      // Worker にフルスクリーン状態を通知
      this.boundFullscreenChange = () => {
        if (this.workerMode && this.worker) {
          this.worker.postMessage({ type: 'fullscreen', isFullscreen: !!document.fullscreenElement });
        }
      };
      document.addEventListener('fullscreenchange', this.boundFullscreenChange);

      return true;
    } catch {
      return false;
    }
    */
  }

  /** Canvas を再生成 (Worker 失敗時のフォールバック用) */
  private recreateCanvas(): void {
    this.canvas.remove();
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resizeCanvas();
  }

  /** Worker に送る設定サブセットを抽出 */
  private extractWorkerSettings(): object {
    return {
      danmakuEnabled: this.settings.danmakuEnabled,
      danmakuOpacity: this.settings.danmakuOpacity,
      danmakuScale: this.settings.danmakuScale,
      danmakuSpeedRate: this.settings.danmakuSpeedRate,
      danmakuFontFamily: this.settings.danmakuFontFamily,
      danmakuUnlimited: this.settings.danmakuUnlimited,
    };
  }

  /** フルスクリーンリスナーのクリーンアップ */
  private cleanupFullscreenListener(): void {
    if (this.boundFullscreenChange) {
      document.removeEventListener('fullscreenchange', this.boundFullscreenChange);
      this.boundFullscreenChange = null;
    }
  }

  // ========== パブリック API ==========

  /** 設定を更新する */
  updateSettings(settings: Settings): void {
    this.settings = settings;
    if (this.workerMode && this.worker) {
      this.worker.postMessage({ type: 'settings', settings: this.extractWorkerSettings() });
    } else {
      this.measureCanvas = null;
    }
  }

  /** 一時停止中かどうか */
  isPaused(): boolean {
    return this.workerMode ? this.shadowPaused : this.paused;
  }

  /** アクティブな弾幕数 */
  getActiveCount(): number {
    return this.workerMode ? this.shadowActiveCount : (this.items.length + this.adminItems.length);
  }

  /** 動画一時停止に連動: アニメーションを凍結する */
  pause(): void {
    if (this.workerMode && this.worker) {
      this.shadowPaused = true;
      this.worker.postMessage({ type: 'pause' });
    } else {
      this.paused = true;
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = 0;
      }
    }
  }

  /** 動画再生に連動: アニメーションを再開する */
  resume(): void {
    if (this.workerMode && this.worker) {
      this.shadowPaused = false;
      this.worker.postMessage({ type: 'resume' });
    } else {
      this.paused = false;
      if ((this.items.length > 0 || this.adminItems.length > 0) && !this.animFrameId) {
        this.lastRenderTime = performance.now();
        this.animFrameId = requestAnimationFrame((t) => this.render(t));
      }
    }
  }

  /** 弾幕を描画できる状態かどうか (容量 + コンテナ健全性チェック) */
  canDraw(): boolean {
    if (this.workerMode) {
      return this.shadowShowing && this.settings.danmakuEnabled
        && this.shadowActiveCount < this.maxActive && this.isContainerHealthy();
    }
    return this.showing && this.settings.danmakuEnabled
      && this.items.length < this.maxActive && this.isContainerHealthy();
  }

  /** コンテナが描画可能な状態かどうか (DOM接続 + 有効サイズ) */
  isContainerHealthy(): boolean {
    return this.container.isConnected && this.container.offsetWidth > 0;
  }

  /** 弾幕を描画する */
  draw(dan: DanmakuItem | DanmakuItem[]): void {
    if (this.workerMode && this.worker) {
      if (!this.shadowShowing || !this.settings.danmakuEnabled) return;
      if (!this.isContainerHealthy()) return;

      // Canvas サイズ変更検出
      const cw = this.container.offsetWidth;
      const ch = this.container.offsetHeight;
      if (cw !== this.canvasW || ch !== this.canvasH) {
        this.canvasW = cw;
        this.canvasH = ch;
        this.worker.postMessage({ type: 'resize', width: cw, height: ch, dpr: this.dpr });
      }

      const items = Array.isArray(dan) ? dan : [dan];
      this.worker.postMessage({ type: 'draw', items });
      return;
    }

    // --- メインスレッドレンダリング (フォールバック) ---
    if (!this.showing || !this.settings.danmakuEnabled) return;
    if (!this.isContainerHealthy()) return;

    if (this.container.offsetWidth !== this.canvasW || this.container.offsetHeight !== this.canvasH) {
      this.resizeCanvas();
    }

    const danList = Array.isArray(dan) ? dan : [dan];
    const cw = this.canvasW;
    const fontSize = this.getFontSize();
    const tunnelH = this.getTunnelHeight(fontSize);
    const duration = this.getDurationMs();

    for (const item of danList) {
      let text = item.text;
      if (text.length > MAX_COMMENT_TEXT_LENGTH) {
        text = text.slice(0, MAX_COMMENT_TEXT_LENGTH);
      }

      if (item.admin) {
        this.adminItems.push({
          text,
          width: this.measureText(text, fontSize * 1.15),
          fontSize: fontSize * 1.15,
          startTime: performance.now(),
          opacity: 0,
        });
        continue;
      }

      if (!item.mine && this.items.length >= this.maxActive) continue;

      const width = this.measureText(text, fontSize);
      const speed = (cw + width) / duration;

      const tunnel = this.findTunnel(width, speed, duration);
      if (tunnel < 0 && !item.mine) continue;
      const effectiveTunnel = tunnel >= 0 ? tunnel : 0;

      this.items.push({
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

    this.startLoop();
  }

  /** Canvas サイズを再計算する */
  resize(): void {
    if (this.workerMode && this.worker) {
      this.canvasW = this.container.offsetWidth;
      this.canvasH = this.container.offsetHeight;
      this.worker.postMessage({ type: 'resize', width: this.canvasW, height: this.canvasH, dpr: this.dpr });
    } else {
      this.resizeCanvas();
    }
  }

  /** 弾幕コンテナをクリアする */
  clear(): void {
    if (this.workerMode && this.worker) {
      this.shadowActiveCount = 0;
      this.worker.postMessage({ type: 'clear' });
    } else {
      this.items = [];
      this.adminItems = [];
      this.tunnelInfo = [];
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = 0;
      }
      this.ctx.clearRect(0, 0, this.canvasW, this.canvasH);
    }
  }

  /** 弾幕を非表示にする */
  hide(): void {
    if (this.workerMode && this.worker) {
      this.shadowShowing = false;
      this.shadowActiveCount = 0;
      this.worker.postMessage({ type: 'hide' });
    } else {
      this.showing = false;
      this.clear();
    }
  }

  /** 弾幕を表示する */
  show(): void {
    if (this.workerMode && this.worker) {
      this.shadowShowing = true;
      this.worker.postMessage({ type: 'show' });
    } else {
      this.showing = true;
    }
  }

  /** 弾幕の表示/非表示をトグルする */
  toggle(): void {
    if (this.workerMode ? this.shadowShowing : this.showing) {
      this.hide();
    } else {
      this.show();
    }
  }

  /** 破棄 */
  destroy(): void {
    this.cleanupFullscreenListener();
    if (this.workerMode && this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.workerMode = false;
    } else {
      this.clear();
    }
    this.canvas.remove();
    this.measureCanvas = null;
  }

  // ========== メインスレッドレンダリング (フォールバック用内部メソッド) ==========

  private resizeCanvas(): void {
    const w = this.container.offsetWidth;
    const h = this.container.offsetHeight;
    if (w === 0 || h === 0) return;

    this.canvasW = w;
    this.canvasH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private getFontSize(): number {
    const ratio = this.canvasW / 1920;
    return DANMAKU_BASE_FONT_SIZE * (this.settings.danmakuScale / 100) * ratio;
  }

  private getTunnelHeight(fontSize: number): number {
    const ratio = this.canvasW / 1920;
    return fontSize + 6 * ratio;
  }

  private getDurationMs(): number {
    const rate = this.settings.danmakuSpeedRate;
    const isFullScreen = !!document.fullscreenElement;
    return ((isFullScreen ? 5.5 : 5) / rate) * 1000;
  }

  private findTunnel(width: number, speed: number, _duration: number): number {
    const now = performance.now();
    const cw = this.canvasW;
    const tunnelCount = Math.floor(this.canvasH / this.getTunnelHeight(this.getFontSize()));
    const maxTunnels = this.settings.danmakuUnlimited ? tunnelCount * 2 : tunnelCount;
    const gap = 30;

    for (let i = 0; i < maxTunnels; i++) {
      const info = this.tunnelInfo[i];

      if (!info || !info.speed) {
        this.tunnelInfo[i] = { entryTime: now, width, speed };
        return i % tunnelCount;
      }

      // 条件1: 前のコメントの末尾が右端を通過済みか (間隔確保)
      const tailClearedTime = info.entryTime + (info.width + gap) / info.speed;
      if (now < tailClearedTime) continue;

      // 条件2: 追い越し防止 — 新コメントの先頭が左端に到達するのが
      //        前コメントの末尾が左端に到達するより後であること
      const prevTailExitTime = info.entryTime + (cw + info.width) / info.speed;
      const newLeadExitTime = now + cw / speed;
      if (newLeadExitTime < prevTailExitTime) continue;

      this.tunnelInfo[i] = { entryTime: now, width, speed };
      return i % tunnelCount;
    }
    return -1;
  }

  private measureText(text: string, fontSize: number): number {
    if (!this.measureCanvas || this.measureFontSize !== fontSize) {
      this.measureFontSize = fontSize;
      this.measureCanvas = document.createElement('canvas').getContext('2d');
      const fontFamily = this.settings.danmakuFontFamily || "'Montserrat'";
      this.measureCanvas!.font = `bold ${fontSize}px ${fontFamily}, "Segoe UI", Arial`;
    }

    let maxWidth = 0;
    for (const line of text.split('\n')) {
      const w = this.measureCanvas!.measureText(line).width;
      if (w > maxWidth) maxWidth = w;
    }
    return maxWidth;
  }

  private startLoop(): void {
    if (this.animFrameId || this.paused) return;
    this.lastRenderTime = performance.now();
    this.lastFpsCheck = this.lastRenderTime;
    this.frameCount = 0;
    this.animFrameId = requestAnimationFrame((t) => this.render(t));
  }

  private render(timestamp: number): void {
    this.animFrameId = 0;

    if (this.paused) return;
    if (this.items.length === 0 && this.adminItems.length === 0) return;

    const dt = timestamp - this.lastRenderTime;
    this.lastRenderTime = timestamp;

    if (dt > 500) {
      this.animFrameId = requestAnimationFrame((t) => this.render(t));
      return;
    }

    const cw = this.canvasW;
    const ch = this.canvasH;

    this.ctx.clearRect(0, 0, cw, ch);
    this.renderAdminComments(timestamp, cw);
    this.renderFlowingComments(dt, cw, ch);

    this.frameCount++;
    if (timestamp - this.lastFpsCheck >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsCheck = timestamp;
      this.adjustQuality();
    }

    if (this.items.length > 0 || this.adminItems.length > 0) {
      this.animFrameId = requestAnimationFrame((t) => this.render(t));
    }
  }

  private renderFlowingComments(dt: number, cw: number, _ch: number): void {
    const opacity = this.settings.danmakuOpacity;
    const fontFamily = this.settings.danmakuFontFamily || "'Montserrat'";

    let i = this.items.length;
    while (i--) {
      const item = this.items[i];

      item.x -= item.speed * dt;

      if (item.x + item.width < 0) {
        this.items.splice(i, 1);
        continue;
      }

      this.ctx.font = `bold ${item.fontSize}px ${fontFamily}, "Segoe UI", Arial`;
      this.ctx.globalAlpha = opacity;
      this.ctx.textBaseline = 'top';

      const x = item.x;
      const y = item.y;

      this.ctx.lineWidth = 4;
      this.ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      this.ctx.lineJoin = 'round';
      this.ctx.strokeText(item.text, x, y);

      this.ctx.fillStyle = COMMENT_COLOR;
      this.ctx.fillText(item.text, x, y);

      if (item.mine) {
        this.ctx.strokeStyle = 'rgba(255,204,0,0.85)';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x - 3, y - 2, item.width + 6, item.fontSize + 4);
      }
    }

    this.ctx.globalAlpha = 1;
  }

  private renderAdminComments(timestamp: number, cw: number): void {
    const fontFamily = this.settings.danmakuFontFamily || "'Montserrat'";

    let i = this.adminItems.length;
    while (i--) {
      const item = this.adminItems[i];
      const elapsed = timestamp - item.startTime;

      if (elapsed > 5000) {
        this.adminItems.splice(i, 1);
        continue;
      }

      const progress = elapsed / 5000;
      if (progress < 0.08) item.opacity = progress / 0.08;
      else if (progress > 0.85) item.opacity = (1 - progress) / 0.15;
      else item.opacity = 1;

      const gradH = item.fontSize + 30;
      const grad = this.ctx.createLinearGradient(0, 0, 0, gradH);
      grad.addColorStop(0, `rgba(0,0,0,${0.7 * item.opacity})`);
      grad.addColorStop(0.7, `rgba(0,0,0,${0.5 * item.opacity})`);
      grad.addColorStop(1, `rgba(0,0,0,0)`);
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, cw, gradH);

      this.ctx.font = `bold ${item.fontSize}px ${fontFamily}, "Segoe UI", Arial`;
      this.ctx.textBaseline = 'top';
      this.ctx.globalAlpha = item.opacity;

      const x = (cw - item.width) / 2;
      const y = 10;

      this.ctx.lineWidth = 4;
      this.ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      this.ctx.lineJoin = 'round';
      this.ctx.strokeText(item.text, x, y);

      this.ctx.fillStyle = '#FFE133';
      this.ctx.fillText(item.text, x, y);

      this.ctx.globalAlpha = 1;
    }
  }

  private adjustQuality(): void {
    if (this.currentFps < 25 && this.maxActive > MIN_MAX_ACTIVE) {
      this.maxActive = Math.max(MIN_MAX_ACTIVE, this.maxActive - 20);
    } else if (this.currentFps > 50 && this.maxActive < ABSOLUTE_MAX_ACTIVE) {
      this.maxActive = Math.min(ABSOLUTE_MAX_ACTIVE, this.maxActive + 10);
    }
  }
}

/** アクティブな通常コメント */
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

/** アクティブな管理者コメント */
interface ActiveAdmin {
  text: string;
  width: number;
  fontSize: number;
  startTime: number;
  opacity: number;
}
