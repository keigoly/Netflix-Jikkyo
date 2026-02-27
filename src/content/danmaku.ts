// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import { COMMENT_COLOR, DANMAKU_BASE_FONT_SIZE, MAX_COMMENT_TEXT_LENGTH, type DanmakuItem, type Settings } from '../types';

interface DanmakuOptions {
  container: HTMLElement;
  settings: Settings;
}

type TunnelMap = { [key: string]: HTMLElement[] };

export class DanmakuRenderer {
  private container: HTMLElement;
  private settings: Settings;
  private danTunnel: TunnelMap;
  private danFontSize = 24;
  private context: CanvasRenderingContext2D | null = null;
  private showing = true;
  private paused = false;

  constructor(options: DanmakuOptions) {
    this.container = options.container;
    this.settings = options.settings;
    this.danTunnel = {};
    // Canvas コンテキスト初期化
    this._measure('', 0);
  }

  /** 設定を更新する */
  updateSettings(settings: Settings): void {
    this.settings = settings;
    this.container.style.setProperty('--nfjk-danmaku-opacity', `${settings.danmakuOpacity}`);
    this.container.style.setProperty('--nfjk-danmaku-font-family', settings.danmakuFontFamily);
    // フォント変更時にCanvas計測コンテキストをリセット
    this.context = null;
  }

  /** 一時停止中かどうか */
  isPaused(): boolean {
    return this.paused;
  }

  /** 動画一時停止に連動: アニメーションを凍結する */
  pause(): void {
    this.paused = true;
    this.container.classList.add('nfjk-paused');
  }

  /** 動画再生に連動: アニメーションを再開する */
  resume(): void {
    this.paused = false;
    this.container.classList.remove('nfjk-paused');
  }

  /** 弾幕を描画する */
  draw(dan: DanmakuItem | DanmakuItem[]): void {
    if (!this.showing || !this.settings.danmakuEnabled) return;

    const danList = Array.isArray(dan) ? dan : [dan];

    // 最終安全弁: テキスト長を制限
    for (const item of danList) {
      if (item.text.length > MAX_COMMENT_TEXT_LENGTH) {
        item.text = item.text.slice(0, MAX_COMMENT_TEXT_LENGTH);
      }
    }

    const ratio = this.container.offsetWidth / 1920;
    const baseFontSize = DANMAKU_BASE_FONT_SIZE * (this.settings.danmakuScale / 100) * ratio;
    const itemHeight = baseFontSize + (6 * ratio);

    const danWidth = this.container.offsetWidth;
    const danHeight = this.container.offsetHeight;
    const itemY = danHeight / itemHeight;

    const danItemRight = (el: HTMLElement): number => {
      const elWidth = el.offsetWidth || parseInt(el.style.width);
      const elRight = el.getBoundingClientRect().right || this.container.getBoundingClientRect().right + elWidth;
      return this.container.getBoundingClientRect().right - elRight;
    };

    const danSpeed = (width: number) => (danWidth + width) / 5;

    const getTunnel = (el: HTMLElement, width: number): number => {
      const tmp = danWidth / danSpeed(width);

      for (let i = 0; this.settings.danmakuUnlimited || i < itemY; i++) {
        const item = this.danTunnel[i + ''];
        if (item && item.length) {
          for (let j = 0; j < item.length; j++) {
            const danRight = danItemRight(item[j]) - 10;
            if (danRight <= danWidth - tmp * danSpeed(parseInt(item[j].style.width)) || danRight <= 0) {
              break;
            }
            if (j === item.length - 1) {
              this.danTunnel[i + ''].push(el);
              el.addEventListener('animationend', () => {
                this.danTunnel[i + ''].splice(0, 1);
              });
              return i % itemY;
            }
          }
        } else {
          this.danTunnel[i + ''] = [el];
          el.addEventListener('animationend', () => {
            this.danTunnel[i + ''].splice(0, 1);
          });
          return i % itemY;
        }
      }
      return -1;
    };

    const docFragment = document.createDocumentFragment();

    for (const item of danList) {
      // 管理者コメント: 上部中央に固定表示
      if (item.admin) {
        const el = document.createElement('div');
        el.classList.add('nfjk-danmaku-admin');
        el.textContent = item.text;
        el.addEventListener('animationend', () => {
          el.remove();
        });
        el.classList.add('nfjk-danmaku-move');
        el.style.animationDuration = '5s';
        this.container.style.setProperty('--nfjk-danmaku-font-size', `${baseFontSize}px`);
        docFragment.appendChild(el);
        continue;
      }

      // テキスト幅を計測
      const itemWidth = (() => {
        let measure = 0;
        for (const line of item.text.split('\n')) {
          const result = this._measure(line, baseFontSize);
          if (result > measure) measure = result;
        }
        return measure;
      })();

      const lines = item.text.split('\n');

      for (const line of lines) {
        const el = document.createElement('div');
        el.classList.add('nfjk-danmaku-item', 'nfjk-danmaku-right');
        if (item.mine) el.classList.add('nfjk-danmaku-mine');
        el.style.color = COMMENT_COLOR;
        el.textContent = line;

        // animationend でDOM削除
        el.addEventListener('animationend', () => {
          el.remove();
        });

        // トンネル取得・配置
        const tunnel = getTunnel(el, itemWidth);
        if (tunnel >= 0) {
          el.style.width = itemWidth + 1 + 'px';
          el.style.top = itemHeight * tunnel + 8 + 'px';
          el.style.transform = `translateX(-${danWidth}px)`;
          el.style.willChange = 'transform';
          el.classList.add('nfjk-danmaku-move');
          el.style.animationDuration = this._getAnimationDuration();
          docFragment.appendChild(el);
        }
      }

      // フォントサイズ CSS変数を更新
      this.container.style.setProperty('--nfjk-danmaku-font-size', `${baseFontSize}px`);
    }

    this.container.appendChild(docFragment);
  }

  /** Canvas でテキスト幅を計測する */
  private _measure(text: string, itemFontSize: number): number {
    if (!this.context || this.danFontSize !== itemFontSize) {
      this.danFontSize = itemFontSize;
      this.context = document.createElement('canvas').getContext('2d');
      const fontFamily = this.settings.danmakuFontFamily || "'Montserrat'";
      this.context!.font = `bold ${this.danFontSize}px ${fontFamily}, "Segoe UI", Arial`;
    }

    const lines = text.split('\n');
    let maxWidth = 0;
    for (const line of lines) {
      maxWidth = Math.max(maxWidth, this.context!.measureText(line).width);
    }
    return maxWidth;
  }

  /** アニメーション時間を算出する */
  private _getAnimationDuration(): string {
    const rate = this.settings.danmakuSpeedRate;
    const isFullScreen = !!document.fullscreenElement;
    return `${(isFullScreen ? 5.5 : 5) / rate}s`;
  }

  /** 弾幕コンテナをクリアする */
  clear(): void {
    this.danTunnel = {};
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }

  /** リサイズ時に既存の弾幕アニメーションを更新 */
  resize(): void {
    const danWidth = this.container.offsetWidth;
    const items = this.container.querySelectorAll<HTMLElement>('.nfjk-danmaku-right');
    for (const item of items) {
      item.style.transform = `translateX(-${danWidth}px)`;
    }
  }

  /** 弾幕を非表示にする */
  hide(): void {
    this.showing = false;
    this.clear();
  }

  /** 弾幕を表示する */
  show(): void {
    this.showing = true;
  }

  /** 弾幕の表示/非表示をトグルする */
  toggle(): void {
    if (this.showing) {
      this.hide();
    } else {
      this.show();
    }
  }

  /** 破棄 */
  destroy(): void {
    this.clear();
    this.context = null;
  }
}
