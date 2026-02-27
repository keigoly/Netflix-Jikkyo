import type { TranslationKeys } from '../types';

const en: TranslationKeys = {
  // --- App title ---
  app_title: 'Netflix Jikkyo',

  // --- Auth gate ---
  auth_desc: 'Sign in with your Google account to get started.',
  auth_google_btn: 'Sign in with Google',
  auth_login_failed: 'Login failed',
  auth_token_failed: 'Failed to obtain token',
  auth_userinfo_failed: 'Failed to fetch user info',
  auth_cancelled: 'Login was cancelled',

  // --- Onboarding ---
  onboarding_welcome: 'Welcome!',
  onboarding_nickname: 'Nickname',
  onboarding_nickname_placeholder: 'Nickname',
  onboarding_hint: '3–18 characters / Can be changed once every 30 days',
  onboarding_start: 'Get Started',
  onboarding_error: 'An error occurred',

  // --- Header ---
  header_popout_title: 'Open in new window',
  header_settings_title: 'Settings',

  // --- Title info ---
  title_reload_tooltip: 'Reload title info & comments',

  // --- No Netflix ---
  no_netflix_message: 'Please open a Netflix title page',
  no_netflix_hint: 'Available on netflix.com/watch/... pages',

  // --- Settings ---
  settings_title: 'Settings',
  settings_back_title: 'Back',

  // --- User section ---
  section_user: 'User',
  user_preview_guest: 'Guest',
  user_nickname_label: 'Nickname',
  user_nickname_placeholder: 'Nickname',
  user_nickname_save: 'Save',
  user_nickname_hint: '3–18 characters / Can be changed once every 30 days',
  user_nickname_remaining: '{days} days until next change',

  // --- Nickname validation ---
  nickname_too_short: 'Must be at least {min} characters',
  nickname_too_long: 'Must be {max} characters or fewer',
  nickname_ng_word: 'Contains prohibited words',

  // --- Language section ---
  section_language: 'Language',
  language_preview: 'English',

  // --- Update section ---
  section_update: 'Latest Update',
  update_preview_loading: 'Loading…',
  update_preview_failed: 'Fetch failed',
  update_github_btn: 'View on GitHub',
  update_fetch_error: 'Failed to fetch update info',

  // --- Comment settings ---
  section_danmaku: 'Comment Settings',
  danmaku_enabled: 'Show Comments',
  danmaku_speed: 'Comment Speed',
  danmaku_opacity: 'Opacity',
  danmaku_scale: 'Display Size',
  danmaku_font: 'Comment Font',
  danmaku_unlimited: 'Unlimited Comments',
  danmaku_highlight: 'Playback Highlight',
  danmaku_preview: 'Speed {speed}x / Opacity {opacity}%',

  // --- Display section ---
  section_display: 'Design',
  display_fontsize: 'Font Size',
  display_system_font: 'System Font',
  display_background: 'Background',
  bg_default: 'Default',
  bg_light: 'Light',
  bg_darkblue: 'Dark Blue',
  bg_black: 'Black',

  // --- NG section ---
  section_ng: 'NG Settings',
  ng_preview_total: 'Total: {count}',
  ng_comment: 'Comments',
  ng_command: 'Commands',
  ng_userid: 'User IDs',
  ng_edit: 'Edit',
  ng_modal_title_comment: 'NG Comments',
  ng_modal_title_command: 'NG Commands',
  ng_modal_title_userid: 'NG User IDs',
  ng_add_placeholder: 'Add...',
  ng_add_btn: 'Add',
  ng_empty: 'None registered',
  ng_delete_title: 'Delete',
  ng_count: '{count}',

  // --- Storage section ---
  section_storage: 'Storage',
  storage_preview_loading: 'Loading…',
  storage_total_label: 'Total:',
  storage_stats: '{size} / {count} items / {titles} titles',
  storage_stats_failed: 'Fetch failed',
  storage_export: 'Export Settings',
  storage_export_btn: 'Export',
  storage_import: 'Import Settings',
  storage_import_btn: 'Import',
  storage_reset: 'Reset Settings',
  storage_reset_desc: 'Restore all settings to default values',
  storage_reset_btn: 'Reset',
  storage_reset_confirm: 'Reset all settings to defaults?',
  storage_clear: 'Clear Storage',
  storage_clear_desc: 'Permanently delete all data',
  storage_clear_btn: 'Clear',
  storage_clear_confirm: 'Permanently delete all data?\nThis action cannot be undone.',

  // --- About section ---
  section_about: 'About & Support',
  about_bug_report: 'Report a Bug',
  about_bug_report_desc: 'Report bugs and issues',
  about_privacy: 'Privacy Policy',
  about_privacy_desc: 'About handling of personal information',
  about_source: 'Source Code',
  about_source_desc: 'View GitHub repository',
  about_support: 'Support the Developer',
  about_support_desc: 'Amazon Wishlist',
  about_extensions: 'Developer\'s Extensions',
  about_extensions_desc: 'keigoly.jp/apps',
  about_website: 'Developer\'s Website',
  about_website_desc: 'keigoly.jp',

  // --- Sign out ---
  signout: 'Sign Out',
  signout_desc: 'Disconnect your Google account',

  // --- Stats bar ---
  stat_pace: 'Pace: {count} comments/min',
  stat_total: 'Total comments: {count}',
  stat_peers: '{count} peers',

  // --- Comment buffer ---
  buffer_new_comments: '{count} new comments',

  // --- Column headers ---
  col_time: 'Time',
  col_no: 'No',
  col_user: 'User',
  col_comment: 'Comment',
  col_date: 'Date',

  // --- Comment display ---
  comment_empty: 'Waiting for comments…',
  comment_scroll_btn: '↓ New comments',

  // --- Offset ---
  offset_btn: 'Sync offset',

  // --- Context menu ---
  ctx_copy_comment: 'Copy comment',
  ctx_copy_userid: 'Copy user ID',
  ctx_copied: 'Copied',
  ctx_ng_section: 'NG Settings',
  ctx_ng_add_comment: 'Add comment to NG',
  ctx_ng_add_userid: 'Add user ID to NG',
  ctx_ng_added: 'Added',
  ctx_userid_unknown: 'Unknown',

  // --- Comment input ---
  input_placeholder: 'Type a comment... (max 45 chars)',
  input_send_title: 'Send',
  input_ng_blocked: 'This comment cannot be sent',

  // --- Comment row ---
  comment_admin: 'Admin',
  comment_you: 'You',
  comment_guest: 'Guest',

  // --- Weekdays ---
  weekday_sun: 'Sun',
  weekday_mon: 'Mon',
  weekday_tue: 'Tue',
  weekday_wed: 'Wed',
  weekday_thu: 'Thu',
  weekday_fri: 'Fri',
  weekday_sat: 'Sat',

  // --- Content script UI ---
  cs_input_placeholder: 'Type a comment...',
  cs_send: 'Send',
  cs_danmaku_toggle: 'Danmaku ON/OFF',
  cs_danmaku_label: 'D',

  // --- Popup ---
  popup_status_title: 'Connection Status',
  popup_status_connected: 'Connected',
  popup_status_disconnected: 'Disconnected',
  popup_status_open_netflix: 'Open a Netflix watch page',
  popup_peers_label: 'Connected peers:',
  popup_open_panel: 'Open Comment Panel',
  popup_settings_title: 'Settings',
  popup_nickname_label: 'Nickname',
  popup_nickname_placeholder: 'Guest',
  popup_speed_label: 'Comment Speed',
  popup_opacity_label: 'Opacity',
  popup_scale_label: 'Display Size',
  popup_enabled_label: 'Show Comments',
  popup_unlimited_label: 'Unlimited Comments',
  popup_log_title: 'Past Logs',
  popup_log_empty: 'No logs yet',
  popup_log_failed: 'Failed to load logs',
  popup_log_title_id: 'Title {id}',
  popup_log_count: '{count}',
  popup_footer: 'Netflix Jikkyo - P2P Serverless Live Comments',
};

export default en;
