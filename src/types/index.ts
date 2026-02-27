// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

/** Google認証ユーザー情報 */
export interface AuthUser {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

/** 認証状態 (chrome.storage.local) */
export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  accessToken: string | null;
  nicknameChangedAt: string | null;  // ISO 8601
  onboardingCompleted: boolean;
}

export const DEFAULT_AUTH_STATE: AuthState = {
  isAuthenticated: false,
  user: null,
  accessToken: null,
  nicknameChangedAt: null,
  onboardingCompleted: false,
};

import type { Locale } from '../i18n/types';

/** 弾幕コメントの型 */
export interface Comment {
  id: string;
  text: string;
  nickname: string;
  timestamp: number;
  titleId: string;
  /** 動画再生位置 (秒) */
  videoTime?: number;
  /** Google認証ベースのユーザーID */
  userId?: string;
}

/** コメントの固定色 (白) */
export const COMMENT_COLOR = '#FFFFFF';

/** 弾幕描画用アイテム (draw() に渡す) */
export interface DanmakuItem {
  text: string;
  mine?: boolean;
  admin?: boolean;
}

/** フォント選択肢 */
export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Montserrat', value: "'Montserrat'" },
  { label: '游ゴシック', value: "'Yu Gothic', 'YuGothic'" },
  { label: 'メイリオ', value: "'Meiryo'" },
  { label: 'MS Pゴシック', value: "'MS PGothic', 'ＭＳ Ｐゴシック'" },
  { label: '游明朝', value: "'Yu Mincho', 'YuMincho'" },
  { label: 'MS P明朝', value: "'MS PMincho', 'ＭＳ Ｐ明朝'" },
  { label: 'HG明朝E', value: "'HGS明朝E', 'HG明朝E'" },
  { label: 'けいふぉんと', value: "'keifont'" },
];

/** 弾幕ベースフォントサイズ (px) — 1920px幅でのニコ生medium相当 */
export const DANMAKU_BASE_FONT_SIZE = 72;

/** ユーザー設定 */
export interface Settings {
  nickname: string;
  danmakuSpeedRate: number;
  danmakuOpacity: number;
  /** 表示サイズ (50〜100 %) */
  danmakuScale: number;
  danmakuEnabled: boolean;
  danmakuUnlimited: boolean;
  /** サイドパネル: 再生位置ハイライト表示 */
  nowPlayingHighlight: boolean;
  /** システム(サイドパネル等)のフォント */
  fontFamily: string;
  /** コメント表示(画面上)のフォント */
  danmakuFontFamily: string;
  /** サイドパネルのフォントサイズ (px) */
  sidepanelFontSize: number;
  /** サイドパネルの背景テーマ */
  sidepanelBgMode: 'default' | 'light' | 'darkblue' | 'black';
  /** NG設定 */
  ngComments: string[];
  ngCommands: string[];
  ngUserIds: string[];
  /** 表示言語 */
  language: Locale;
}

/** デフォルト設定 */
export const DEFAULT_SETTINGS: Settings = {
  nickname: '',
  danmakuSpeedRate: 1.0,
  danmakuOpacity: 1.0,
  danmakuScale: 100,
  danmakuEnabled: true,
  danmakuUnlimited: false,
  nowPlayingHighlight: true,
  fontFamily: "'Montserrat'",
  danmakuFontFamily: "'Montserrat'",
  sidepanelFontSize: 13,
  sidepanelBgMode: 'default',
  ngComments: [],
  ngCommands: [],
  ngUserIds: [],
  language: 'ja',
};

/** P2P メッセージ型 */
export interface P2PCommentMessage {
  id: string;
  text: string;
  nickname: string;
  timestamp: number;
  /** 動画再生位置 (秒) */
  videoTime?: number;
  /** Google認証ベースのユーザーID */
  userId?: string;
  /** "1" = admin, 署名付き */
  admin?: string;
  /** ECDSA署名 (base64) */
  signature?: string;
}

/** Service Worker へのメッセージ */
export type BackgroundMessage =
  | { type: 'peer-count'; count: number }
  | { type: 'get-settings' }
  | { type: 'save-settings'; settings: Settings };

/** サイドパネル向けコメントメッセージ */
export interface SidePanelComment {
  type: 'comment';
  comment: {
    text: string;
    nickname: string;
    timestamp: number;
    mine: boolean;
    admin?: boolean;
    /** 動画再生位置 (秒) */
    videoTime?: number;
    /** Google認証ベースのユーザーID */
    userId?: string;
  };
}

/** サイドパネル向けピア数メッセージ */
export interface SidePanelPeerCount {
  type: 'side-panel-peer-count';
  count: number;
}

/** サイドパネルからコンテンツスクリプトへのコメント送信 */
export interface SidePanelSendComment {
  type: 'sidepanel-send-comment';
  text: string;
}

/** P2P ログ同期リクエスト */
export interface P2PLogRequest {
  titleId: string;
  sinceTimestamp?: number; // これ以降のコメントのみ要求
}

/** P2P ログ同期レスポンス (チャンク) */
export interface P2PLogResponse {
  titleId: string;
  comments: Comment[];
  chunkIndex: number;
  totalChunks: number;
  done: boolean;
}

/** サイドパネル向けログ同期通知 */
export interface SidePanelLogSynced {
  type: 'log-synced';
  titleId: string;
  count: number;
}

/** タイトルメタデータ */
export interface TitleMetadata {
  titleId: string;
  title: string;
  subtitle?: string;
  description?: string;
}

/** サイドパネル向けタイトル情報メッセージ */
export interface SidePanelTitleInfo {
  type: 'title-info';
  metadata: TitleMetadata;
}

/** サイドパネル向けタブ変更メッセージ */
export interface SidePanelTabChanged {
  type: 'tab-changed';
  url: string;
  tabId: number;
  reason: 'tab-switch' | 'url-change';
}

/** リモート機能フラグ (Cloudflare Workers から取得) */
export interface FeatureFlags {
  liveRelay: boolean;
  relayEndpoint: string | null;
  relayTitleIds: string[];       // 空 = 全タイトル対象
  announcement: string | null;
  minVersion: string | null;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  liveRelay: false,
  relayEndpoint: null,
  relayTitleIds: [],
  announcement: null,
  minVersion: null,
};

/** コメント本文の最大文字数 */
export const MAX_COMMENT_TEXT_LENGTH = 200;
/** ニックネームの最大文字数 */
export const MAX_NICKNAME_LENGTH = 30;
/** コメントIDの最大文字数 */
export const MAX_COMMENT_ID_LENGTH = 64;
/** タイトルIDの最大文字数 */
export const MAX_TITLE_ID_LENGTH = 20;
/** ユーザーIDの最大文字数 */
export const MAX_USER_ID_LENGTH = 128;
/** 最大再生時間 (秒) = 24時間 */
export const MAX_VIDEO_TIME = 86400;
/** タイムスタンプ許容過去範囲 (365日) */
export const TIMESTAMP_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
/** タイムスタンプ許容未来範囲 (60秒) */
export const TIMESTAMP_MAX_FUTURE_MS = 60 * 1000;
/** ピア別コメントレート制限: 最大メッセージ数 */
export const RATE_LIMIT_MAX_MESSAGES = 10;
/** ピア別コメントレート制限: ウィンドウ (ms) */
export const RATE_LIMIT_WINDOW_MS = 1000;
/** ログ同期レート制限: 最大チャンク数 */
export const LOG_SYNC_RATE_LIMIT_MAX = 50;
/** ログ同期レート制限: ウィンドウ (ms) */
export const LOG_SYNC_RATE_LIMIT_WINDOW_MS = 5000;
/** ログ同期レスポンス1チャンクの最大コメント数 */
export const MAX_LOG_RESPONSE_CHUNK_SIZE = 250;
/** ログ同期レスポンス最大チャンク数 */
export const MAX_LOG_RESPONSE_TOTAL_CHUNKS = 100;
