import type { TranslationKeys } from '../types';

/** 日本語 (ソースオブトゥルース) */
const ja: TranslationKeys = {
  // --- アプリ名 ---
  app_title: 'ネトフリで実況',

  // --- 認証ゲート ---
  auth_desc: '利用にはGoogleアカウントでのログインが必要です。',
  auth_google_btn: 'Googleでログイン',
  auth_login_failed: 'ログインに失敗しました',
  auth_token_failed: 'トークン取得に失敗しました',
  auth_userinfo_failed: 'ユーザー情報の取得に失敗しました',
  auth_cancelled: 'ログインがキャンセルされました',

  // --- オンボーディング ---
  onboarding_welcome: 'ようこそ！',
  onboarding_nickname: 'ニックネーム',
  onboarding_nickname_placeholder: 'ニックネーム',
  onboarding_hint: '3〜18文字 / 変更は30日に1回',
  onboarding_start: 'はじめる',
  onboarding_error: 'エラーが発生しました',

  // --- ヘッダー ---
  header_popout_title: '別ウィンドウで開く',
  header_settings_title: '設定',

  // --- タイトル情報 ---
  title_reload_tooltip: 'タイトル情報・コメントを再読み込み',

  // --- 非Netflix ---
  no_netflix_message: 'Netflix の作品ページを開いてください',
  no_netflix_hint: 'netflix.com/watch/... のページで利用できます',

  // --- 設定 ---
  settings_title: '設定',
  settings_back_title: '戻る',

  // --- ユーザーセクション ---
  section_user: 'ユーザー',
  user_preview_guest: 'ゲスト',
  user_nickname_label: 'ニックネーム',
  user_nickname_placeholder: 'ニックネーム',
  user_nickname_save: '保存',
  user_nickname_hint: '3〜18文字 / 変更は30日に1回',
  user_nickname_remaining: '次の変更まであと{days}日',

  // --- ニックネームバリデーション ---
  nickname_too_short: '{min}文字以上で入力してください',
  nickname_too_long: '{max}文字以内で入力してください',
  nickname_ng_word: '使用できない文字列が含まれています',

  // --- 言語セクション ---
  section_language: '言語',
  language_preview: '日本語',

  // --- アップデートセクション ---
  section_update: '最新アップデート情報',
  update_preview_loading: '読み込み中…',
  update_preview_failed: '取得失敗',
  update_github_btn: 'GitHubで見る',
  update_fetch_error: '取得に失敗しました',

  // --- コメント設定セクション ---
  section_danmaku: 'コメント設定',
  danmaku_enabled: 'コメント表示',
  danmaku_speed: 'コメント速度',
  danmaku_opacity: '透明度',
  danmaku_scale: '表示サイズ',
  danmaku_font: 'コメントフォント',
  danmaku_unlimited: 'コメント表示を無制限',
  danmaku_highlight: '再生位置ハイライト',
  danmaku_preview: '速度 {speed}x / 不透明度 {opacity}%',

  // --- デザインセクション ---
  section_display: 'デザイン',
  display_fontsize: 'フォントサイズ',
  display_system_font: 'システムフォント',
  display_background: '背景',
  bg_default: 'デフォルト',
  bg_light: 'ライト',
  bg_darkblue: 'ダークブルー',
  bg_black: 'ブラック',

  // --- NG設定セクション ---
  section_ng: 'NG設定',
  ng_preview_total: '合計 {count}件',
  ng_comment: 'コメント',
  ng_command: 'コマンド',
  ng_userid: 'ユーザーID',
  ng_edit: '編集',
  ng_modal_title_comment: 'NGコメント',
  ng_modal_title_command: 'NGコマンド',
  ng_modal_title_userid: 'NGユーザーID',
  ng_add_placeholder: '追加...',
  ng_add_btn: '追加',
  ng_empty: '登録なし',
  ng_delete_title: '削除',
  ng_count: '{count}件',

  // --- ストレージセクション ---
  section_storage: 'ストレージ',
  storage_preview_loading: '読み込み中…',
  storage_total_label: '合計:',
  storage_stats: '{size} / {count}件 / {titles}タイトル',
  storage_stats_failed: '取得失敗',
  storage_export: '設定をエクスポート',
  storage_export_btn: 'エクスポート',
  storage_import: '設定をインポート',
  storage_import_btn: 'インポート',
  storage_reset: '設定をリセット',
  storage_reset_desc: '全ての設定を初期値に戻します',
  storage_reset_btn: 'リセット',
  storage_reset_confirm: '全ての設定を初期値に戻しますか？',
  storage_clear: 'ストレージ初期化',
  storage_clear_desc: '全てのデータを完全に削除します',
  storage_clear_btn: '初期化',
  storage_clear_confirm: '全てのデータを完全に削除しますか？\nこの操作は取り消せません。',

  // --- その他セクション ---
  section_about: 'その他・問い合わせ',
  about_bug_report: '不具合の報告',
  about_bug_report_desc: 'バグや問題を報告する',
  about_privacy: 'プライバシーポリシー',
  about_privacy_desc: '個人情報の取り扱いについて',
  about_source: 'ソースコード',
  about_source_desc: 'GitHubリポジトリを見る',
  about_support: '開発者を応援する',
  about_support_desc: 'Amazon 欲しいものリスト',
  about_extensions: '開発者が製作した拡張機能一覧',
  about_extensions_desc: 'keigoly.jp/apps',
  about_website: '開発者のオフィシャルサイト',
  about_website_desc: 'keigoly.jp',

  // --- ログアウト ---
  signout: 'ログアウト',
  signout_desc: 'Googleアカウントとの連携を解除します',

  // --- 統計バー ---
  stat_pace: '勢い: {count} コメ/分',
  stat_total: '累計コメント数: {count}',
  stat_peers: '{count}人',

  // --- コメントバッファ ---
  buffer_new_comments: '{count}件の新しいコメント',

  // --- カラムヘッダー ---
  col_time: '再生時間',
  col_no: 'No',
  col_user: 'ユーザー',
  col_comment: 'コメント',
  col_date: '書き込み日時',

  // --- コメント表示 ---
  comment_empty: 'コメントを待っています…',
  comment_scroll_btn: '↓ 新しいコメント',

  // --- オフセット ---
  offset_btn: 'オフセットを合わせる',

  // --- コンテキストメニュー ---
  ctx_copy_comment: 'コメントをコピー',
  ctx_copy_userid: 'ユーザーIDをコピー',
  ctx_copied: 'コピーしました',
  ctx_ng_section: 'NG設定',
  ctx_ng_add_comment: 'コメントを追加',
  ctx_ng_add_userid: 'ユーザーIDを追加',
  ctx_ng_added: '追加しました',
  ctx_userid_unknown: '不明',

  // --- コメント入力 ---
  input_placeholder: 'コメントを入力... (45文字まで)',
  input_send_title: '送信',
  input_ng_blocked: 'このコメントは送信できません',

  // --- コメント行 ---
  comment_admin: '管理者',
  comment_you: 'あなた',
  comment_guest: 'ゲスト',

  // --- 曜日 ---
  weekday_sun: '日',
  weekday_mon: '月',
  weekday_tue: '火',
  weekday_wed: '水',
  weekday_thu: '木',
  weekday_fri: '金',
  weekday_sat: '土',

  // --- コンテンツスクリプトUI ---
  cs_input_placeholder: 'コメントを入力...',
  cs_send: '送信',
  cs_danmaku_toggle: '弾幕ON/OFF',
  cs_danmaku_label: '弾',

  // --- ポップアップ ---
  popup_status_title: '接続ステータス',
  popup_status_connected: '接続中',
  popup_status_disconnected: '未接続',
  popup_status_open_netflix: 'Netflixの視聴ページを開いてください',
  popup_peers_label: '接続中のピア:',
  popup_open_panel: 'コメントパネルを開く',
  popup_settings_title: '設定',
  popup_nickname_label: 'ニックネーム',
  popup_nickname_placeholder: 'ゲスト',
  popup_speed_label: 'コメント速度',
  popup_opacity_label: '透明度',
  popup_scale_label: '表示サイズ',
  popup_enabled_label: 'コメント表示',
  popup_unlimited_label: 'コメント表示を無制限',
  popup_log_title: '過去ログ',
  popup_log_empty: 'ログはまだありません',
  popup_log_failed: 'ログの読み込みに失敗しました',
  popup_log_title_id: 'タイトル {id}',
  popup_log_count: '{count}件',
  popup_footer: 'Netflix Jikkyo - P2Pサーバーレス実況',
};

export default ja;
