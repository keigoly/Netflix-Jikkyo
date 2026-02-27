// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

import type { Settings } from '../types';
import { t } from '../i18n';

const UI_HOST_ID = 'nfjk-comment-ui-host';

export interface CommentUICallbacks {
  onSend: (text: string) => void;
  onToggleDanmaku: () => void;
}

export class CommentUI {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private input!: HTMLInputElement;
  private callbacks: CommentUICallbacks;
  private peerCountEl!: HTMLElement;
  private visible = true;

  constructor(playerContainer: HTMLElement, _settings: Settings, callbacks: CommentUICallbacks) {
    this.callbacks = callbacks;

    // 既存のUIを削除
    document.getElementById(UI_HOST_ID)?.remove();

    // Shadow DOM ホスト
    this.host = document.createElement('div');
    this.host.id = UI_HOST_ID;
    this.host.style.cssText = `
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      pointer-events: auto;
    `;

    this.shadow = this.host.attachShadow({ mode: 'closed' });
    this.buildUI();

    playerContainer.appendChild(this.host);
  }

  private buildUI(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        font-family: "Segoe UI", "Yu Gothic", "Meiryo", Arial, sans-serif;
      }

      .nfjk-ui-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(20, 20, 20, 0.85);
        backdrop-filter: blur(8px);
        border-radius: 8px;
        padding: 6px 10px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        transition: opacity 0.3s;
      }

      .nfjk-ui-bar.hidden {
        opacity: 0;
        pointer-events: none;
      }

      .nfjk-input {
        width: 260px;
        height: 30px;
        border: none;
        border-radius: 4px;
        padding: 0 8px;
        font-size: 13px;
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        outline: none;
        font-family: inherit;
      }

      .nfjk-input::placeholder {
        color: rgba(255, 255, 255, 0.45);
      }

      .nfjk-input:focus {
        background: rgba(255, 255, 255, 0.18);
      }

      .nfjk-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        cursor: pointer;
        font-size: 13px;
        padding: 0;
        transition: background 0.2s;
      }

      .nfjk-btn:hover {
        background: rgba(255, 255, 255, 0.25);
      }

      .nfjk-btn.active {
        background: #E50914;
      }

      .nfjk-send-btn {
        width: auto;
        padding: 0 12px;
        height: 30px;
        font-size: 13px;
        background: #E50914;
        font-weight: bold;
      }

      .nfjk-send-btn:hover {
        background: #b20710;
      }

      .nfjk-peer-count {
        color: rgba(255, 255, 255, 0.6);
        font-size: 11px;
        white-space: nowrap;
        min-width: 30px;
        text-align: center;
      }
    `;

    const bar = document.createElement('div');
    bar.classList.add('nfjk-ui-bar');

    // テキスト入力
    this.input = document.createElement('input');
    this.input.classList.add('nfjk-input');
    this.input.type = 'text';
    this.input.placeholder = t('cs_input_placeholder');
    this.input.maxLength = 45;

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.isComposing) {
        this._send();
      }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('keypress', (e) => e.stopPropagation());

    // 送信ボタン
    const sendBtn = document.createElement('button');
    sendBtn.classList.add('nfjk-btn', 'nfjk-send-btn');
    sendBtn.textContent = t('cs_send');
    sendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._send();
    });

    // 弾幕トグルボタン
    const toggleBtn = document.createElement('button');
    toggleBtn.classList.add('nfjk-btn');
    toggleBtn.textContent = t('cs_danmaku_label');
    toggleBtn.title = t('cs_danmaku_toggle');
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBtn.classList.toggle('active');
      this.callbacks.onToggleDanmaku();
    });
    toggleBtn.classList.add('active'); // デフォルトON

    // ピア数表示
    this.peerCountEl = document.createElement('span');
    this.peerCountEl.classList.add('nfjk-peer-count');
    this.peerCountEl.textContent = t('stat_peers', { count: 0 });

    bar.appendChild(this.input);
    bar.appendChild(sendBtn);
    bar.appendChild(toggleBtn);
    bar.appendChild(this.peerCountEl);

    this.shadow.appendChild(style);
    this.shadow.appendChild(bar);
  }

  private _send(): void {
    const text = this.input.value.trim();
    if (!text) return;
    this.callbacks.onSend(text);
    this.input.value = '';
  }

  /** ピア数を更新する */
  updatePeerCount(count: number): void {
    this.peerCountEl.textContent = t('stat_peers', { count });
  }

  /** UI の表示/非表示 */
  setVisible(v: boolean): void {
    this.visible = v;
    const bar = this.shadow.querySelector<HTMLElement>('.nfjk-ui-bar');
    if (bar) bar.classList.toggle('hidden', !v);
  }

  /** 破棄 */
  destroy(): void {
    this.host.remove();
  }
}
