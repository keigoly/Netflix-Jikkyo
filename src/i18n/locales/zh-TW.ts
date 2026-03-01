import type { TranslationKeys } from '../types';

const zhTW: TranslationKeys = {
  // --- 應用名稱 ---
  app_title: 'Netflix Jikkyo',

  // --- 認證閘門 ---
  auth_desc: '使用前需以 Google 帳號登入。',
  auth_google_btn: '以 Google 登入',
  auth_login_failed: '登入失敗',
  auth_token_failed: '取得權杖失敗',
  auth_userinfo_failed: '取得使用者資訊失敗',
  auth_cancelled: '登入已取消',

  // --- 引導頁 ---
  onboarding_welcome: '歡迎！',
  onboarding_nickname: '暱稱',
  onboarding_nickname_placeholder: '暱稱',
  onboarding_hint: '3～18 字元 / 每 30 天可更改一次',
  onboarding_start: '開始',
  onboarding_error: '發生錯誤',

  // --- 標題列 ---
  header_popout_title: '在新視窗中開啟',
  header_settings_title: '設定',

  // --- 標題資訊 ---
  title_reload_tooltip: '重新載入標題資訊與留言',

  // --- 非 Netflix ---
  no_netflix_message: '請開啟 Netflix 作品頁面',
  no_netflix_hint: '可在 netflix.com/watch/... 頁面使用',

  // --- 設定 ---
  settings_title: '設定',
  settings_back_title: '返回',

  // --- 使用者區段 ---
  section_user: '使用者',
  user_preview_guest: '訪客',
  user_nickname_label: '暱稱',
  user_nickname_placeholder: '暱稱',
  user_nickname_save: '儲存',
  user_nickname_hint: '3～18 字元 / 每 30 天可更改一次',
  user_nickname_remaining: '距離下次更改還有 {days} 天',

  // --- 暱稱驗證 ---
  nickname_too_short: '請輸入至少 {min} 個字元',
  nickname_too_long: '請輸入 {max} 個字元以內',
  nickname_ng_word: '包含禁止使用的字串',

  // --- 語言區段 ---
  section_language: '語言',
  language_preview: '繁體中文',

  // --- 更新區段 ---
  section_update: '最新更新資訊',
  update_preview_loading: '載入中…',
  update_preview_failed: '取得失敗',
  update_github_btn: '在 GitHub 上查看',
  update_fetch_error: '無法取得更新資訊',

  // --- 留言設定 ---
  section_danmaku: '留言設定',
  danmaku_enabled: '顯示留言',
  danmaku_speed: '留言速度',
  danmaku_opacity: '透明度',
  danmaku_scale: '顯示大小',
  danmaku_font: '留言字型',
  danmaku_unlimited: '無限制留言顯示',
  danmaku_highlight: '播放位置高亮',
  danmaku_preview: '速度 {speed}x / 透明度 {opacity}%',

  // --- 設計區段 ---
  section_display: '設計',
  display_fontsize: '字體大小',
  display_system_font: '系統字型',
  display_background: '背景',
  bg_default: '預設',
  bg_light: '明亮',
  bg_darkblue: '深藍',
  bg_black: '黑色',

  // --- NG 區段 ---
  section_ng: 'NG 設定',
  ng_preview_total: '共 {count} 筆',
  ng_comment: '留言',
  ng_command: '指令',
  ng_userid: '使用者 ID',
  ng_edit: '編輯',
  ng_modal_title_comment: 'NG 留言',
  ng_modal_title_command: 'NG 指令',
  ng_modal_title_userid: 'NG 使用者 ID',
  ng_add_placeholder: '新增...',
  ng_add_btn: '新增',
  ng_empty: '無登錄資料',
  ng_delete_title: '刪除',
  ng_count: '{count} 筆',

  // --- 儲存空間區段 ---
  section_storage: '儲存空間',
  storage_preview_loading: '載入中…',
  storage_total_label: '合計：',
  storage_stats: '{size} / {count} 筆 / {titles} 個標題',
  storage_stats_failed: '取得失敗',
  storage_export: '匯出設定',
  storage_export_btn: '匯出',
  storage_import: '匯入設定',
  storage_import_btn: '匯入',
  storage_reset: '重設設定',
  storage_reset_desc: '將所有設定恢復為預設值',
  storage_reset_btn: '重設',
  storage_reset_confirm: '將所有設定恢復為預設值？',
  storage_clear: '初始化儲存空間',
  storage_clear_desc: '完全刪除所有資料',
  storage_clear_btn: '初始化',
  storage_clear_confirm: '確定要完全刪除所有資料嗎？\n此操作無法復原。',

  // --- 其他區段 ---
  section_about: '其他與聯絡',
  about_bug_report: '回報問題',
  about_bug_report_desc: '回報錯誤與問題',
  about_privacy: '隱私權政策',
  about_privacy_desc: '關於個人資料的處理',
  about_source: '原始碼',
  about_source_desc: '查看 GitHub 儲存庫',
  about_support: '支持開發者',
  about_support_desc: 'Amazon 願望清單',
  about_extensions: '開發者的擴充功能一覽',
  about_extensions_desc: 'keigoly.jp/apps',
  about_website: '開發者官方網站',
  about_website_desc: 'keigoly.jp',

  // --- 登出 ---
  signout: '登出',
  signout_desc: '解除 Google 帳號的連結',

  // --- 統計列 ---
  stat_pace: '熱度：{count} 留言/分',
  stat_total: '累計留言數：{count}',
  stat_peers: '{count} 人',

  // --- 留言緩衝 ---
  buffer_new_comments: '{count} 則新留言',

  // --- 欄位標題 ---
  col_time: '播放時間',
  col_no: 'No',
  col_user: '使用者',
  col_comment: '留言',
  col_date: '發表時間',

  // --- 留言顯示 ---
  comment_empty: '等待留言中…',
  comment_scroll_btn: '↓ 新留言',

  // --- 偏移 ---
  offset_btn: '同步偏移',

  // --- 右鍵選單 ---
  ctx_copy_comment: '複製留言',
  ctx_copy_userid: '複製使用者 ID',
  ctx_copied: '已複製',
  ctx_ng_section: 'NG 設定',
  ctx_ng_add_comment: '新增留言至 NG',
  ctx_ng_add_userid: '新增使用者 ID 至 NG',
  ctx_ng_added: '已新增',
  ctx_userid_unknown: '不明',

  // --- 留言輸入 ---
  input_placeholder: '輸入留言…（最多 45 字）',
  input_send_title: '送出',
  input_ng_blocked: '此留言無法送出',

  // --- 留言列 ---
  comment_admin: '管理員',
  comment_you: '你',
  comment_guest: '訪客',

  // --- 星期 ---
  weekday_sun: '日',
  weekday_mon: '一',
  weekday_tue: '二',
  weekday_wed: '三',
  weekday_thu: '四',
  weekday_fri: '五',
  weekday_sat: '六',

  // --- Nico 生放送連動 ---
  section_nico: 'Nico 生放送',
  nico_connect_btn: '連動',
  nico_disconnect_btn: '解除',
  nico_preview_disconnected: '未連線',
  nico_preview_connecting: '連線中…',
  nico_preview_connected: '已連線',
  nico_preview_error: '錯誤',
  nico_account_status: 'niconico 帳號：',
  nico_account_logged_in: '已登入',
  nico_account_not_logged_in: '未登入',
  nico_show_comments: '顯示 Nico 生放送留言',
  nico_comments_on: '留言 ON',
  nico_comments_off: '留言 OFF',
  nico_broadcast_info: '直播資訊：',
  nico_viewer_count: '觀眾：{count}人',
  nico_viewer_count_title: 'Nico 生放送觀眾數',
  nico_badge: 'N',
  nico_broadcast_ended: '直播已結束',
  nico_broadcast_waiting: '等待直播開始',

  // --- SNS 分享 ---
  sns_share_text: '請在社群媒體上分享！',
  sns_share_content: '#Netflix實況 - 一起在Netflix上留言吧！\n享受niconico風格彈幕留言的Chrome擴充功能！\n歡迎試用 → ',

  // --- 內容腳本 UI ---
  cs_input_placeholder: '輸入留言…',
  cs_send: '送出',
  cs_danmaku_toggle: '彈幕 ON/OFF',
  cs_danmaku_label: '彈',

  // --- 彈出視窗 ---
  popup_status_title: '連線狀態',
  popup_status_connected: '已連線',
  popup_status_disconnected: '未連線',
  popup_status_open_netflix: '請開啟 Netflix 觀賞頁面',
  popup_peers_label: '已連線的對等端：',
  popup_open_panel: '開啟留言面板',
  popup_settings_title: '設定',
  popup_nickname_label: '暱稱',
  popup_nickname_placeholder: '訪客',
  popup_speed_label: '留言速度',
  popup_opacity_label: '透明度',
  popup_scale_label: '顯示大小',
  popup_enabled_label: '顯示留言',
  popup_unlimited_label: '無限制留言顯示',
  popup_log_title: '歷史記錄',
  popup_log_empty: '尚無記錄',
  popup_log_failed: '記錄載入失敗',
  popup_log_title_id: '標題 {id}',
  popup_log_count: '{count} 筆',
  popup_footer: 'Netflix Jikkyo - P2P 無伺服器即時留言',
};

export default zhTW;
