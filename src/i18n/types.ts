// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

/** 対応ロケール */
export type Locale = 'ja' | 'en' | 'ko' | 'cs' | 'zh-TW';

/** 翻訳キー定義 */
export interface TranslationKeys {
  // --- アプリ名 ---
  app_title: string;

  // --- 認証ゲート ---
  auth_desc: string;
  auth_google_btn: string;
  auth_login_failed: string;
  auth_token_failed: string;
  auth_userinfo_failed: string;
  auth_cancelled: string;

  // --- オンボーディング ---
  onboarding_welcome: string;
  onboarding_nickname: string;
  onboarding_nickname_placeholder: string;
  onboarding_hint: string;
  onboarding_start: string;
  onboarding_error: string;

  // --- ヘッダー ---
  header_popout_title: string;
  header_settings_title: string;

  // --- タイトル情報 ---
  title_reload_tooltip: string;

  // --- 非Netflix ---
  no_netflix_message: string;
  no_netflix_hint: string;

  // --- 設定 ---
  settings_title: string;
  settings_back_title: string;

  // --- ユーザーセクション ---
  section_user: string;
  user_preview_guest: string;
  user_nickname_label: string;
  user_nickname_placeholder: string;
  user_nickname_save: string;
  user_nickname_hint: string;
  user_nickname_remaining: string; // {days}日

  // --- ニックネームバリデーション ---
  nickname_too_short: string; // {min}文字
  nickname_too_long: string;  // {max}文字
  nickname_ng_word: string;

  // --- 言語セクション ---
  section_language: string;
  language_preview: string; // 現在の言語名

  // --- アップデートセクション ---
  section_update: string;
  update_preview_loading: string;
  update_preview_failed: string;
  update_github_btn: string;
  update_fetch_error: string;

  // --- コメント設定セクション ---
  section_danmaku: string;
  danmaku_enabled: string;
  danmaku_speed: string;
  danmaku_opacity: string;
  danmaku_scale: string;
  danmaku_font: string;
  danmaku_unlimited: string;
  danmaku_highlight: string;
  danmaku_preview: string; // 速度 {speed}x / 不透明度 {opacity}%

  // --- デザインセクション ---
  section_display: string;
  display_fontsize: string;
  display_system_font: string;
  display_background: string;
  bg_default: string;
  bg_light: string;
  bg_darkblue: string;
  bg_black: string;

  // --- NG設定セクション ---
  section_ng: string;
  ng_preview_total: string; // 合計 {count}件
  ng_comment: string;
  ng_command: string;
  ng_userid: string;
  ng_edit: string;
  ng_modal_title_comment: string;
  ng_modal_title_command: string;
  ng_modal_title_userid: string;
  ng_add_placeholder: string;
  ng_add_btn: string;
  ng_empty: string;
  ng_delete_title: string;
  ng_count: string; // {count}件

  // --- ストレージセクション ---
  section_storage: string;
  storage_preview_loading: string;
  storage_total_label: string;
  storage_stats: string; // {size} / {count}件 / {titles}タイトル
  storage_stats_failed: string;
  storage_export: string;
  storage_export_btn: string;
  storage_import: string;
  storage_import_btn: string;
  storage_reset: string;
  storage_reset_desc: string;
  storage_reset_btn: string;
  storage_reset_confirm: string;
  storage_clear: string;
  storage_clear_desc: string;
  storage_clear_btn: string;
  storage_clear_confirm: string;

  // --- その他セクション ---
  section_about: string;
  about_bug_report: string;
  about_bug_report_desc: string;
  about_privacy: string;
  about_privacy_desc: string;
  about_source: string;
  about_source_desc: string;
  about_support: string;
  about_support_desc: string;
  about_extensions: string;
  about_extensions_desc: string;
  about_website: string;
  about_website_desc: string;

  // --- ログアウト ---
  signout: string;
  signout_desc: string;

  // --- 統計バー ---
  stat_pace: string; // 勢い: {count} コメ/分
  stat_total: string; // 累計コメント数: {count}
  stat_peers: string; // {count}人

  // --- コメントバッファ ---
  buffer_new_comments: string; // {count}件の新しいコメント

  // --- カラムヘッダー ---
  col_time: string;
  col_no: string;
  col_user: string;
  col_comment: string;
  col_date: string;

  // --- コメント表示 ---
  comment_empty: string;
  comment_scroll_btn: string;

  // --- オフセット ---
  offset_btn: string;

  // --- コンテキストメニュー ---
  ctx_copy_comment: string;
  ctx_copy_userid: string;
  ctx_copied: string;
  ctx_ng_section: string;
  ctx_ng_add_comment: string;
  ctx_ng_add_userid: string;
  ctx_ng_added: string;
  ctx_userid_unknown: string;

  // --- コメント入力 ---
  input_placeholder: string;
  input_send_title: string;
  input_ng_blocked: string;

  // --- コメント行 ---
  comment_admin: string;
  comment_you: string;
  comment_guest: string;

  // --- 曜日 ---
  weekday_sun: string;
  weekday_mon: string;
  weekday_tue: string;
  weekday_wed: string;
  weekday_thu: string;
  weekday_fri: string;
  weekday_sat: string;

  // --- ニコ生連携 ---
  section_nico: string;
  nico_connect_btn: string;
  nico_disconnect_btn: string;
  nico_preview_disconnected: string;
  nico_preview_connecting: string;
  nico_preview_connected: string;
  nico_preview_error: string;
  nico_account_status: string;
  nico_account_logged_in: string;
  nico_account_not_logged_in: string;
  nico_show_comments: string;
  nico_comments_on: string;
  nico_comments_off: string;
  nico_broadcast_info: string;
  nico_viewer_count: string;
  nico_viewer_count_title: string;
  nico_badge: string;
  nico_broadcast_ended: string;
  nico_broadcast_waiting: string;

  // --- SNSシェア ---
  sns_share_text: string;
  sns_share_content: string;

  // --- コンテンツスクリプトUI ---
  cs_input_placeholder: string;
  cs_send: string;
  cs_danmaku_toggle: string;
  cs_danmaku_label: string;

  // --- ポップアップ ---
  popup_status_title: string;
  popup_status_connected: string;
  popup_status_disconnected: string;
  popup_status_open_netflix: string;
  popup_peers_label: string;
  popup_open_panel: string;
  popup_settings_title: string;
  popup_nickname_label: string;
  popup_nickname_placeholder: string;
  popup_speed_label: string;
  popup_opacity_label: string;
  popup_scale_label: string;
  popup_enabled_label: string;
  popup_unlimited_label: string;
  popup_log_title: string;
  popup_log_empty: string;
  popup_log_failed: string;
  popup_log_title_id: string; // タイトル {id}
  popup_log_count: string;    // {count}件
  popup_footer: string;
}
