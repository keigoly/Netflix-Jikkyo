import type { TranslationKeys } from '../types';

const cs: TranslationKeys = {
  // --- Název aplikace ---
  app_title: 'Netflix Jikkyo',

  // --- Autentizační brána ---
  auth_desc: 'Pro používání se přihlaste účtem Google.',
  auth_google_btn: 'Přihlásit se přes Google',
  auth_login_failed: 'Přihlášení selhalo',
  auth_token_failed: 'Nepodařilo se získat token',
  auth_userinfo_failed: 'Nepodařilo se získat informace o uživateli',
  auth_cancelled: 'Přihlášení bylo zrušeno',

  // --- Onboarding ---
  onboarding_welcome: 'Vítejte!',
  onboarding_nickname: 'Přezdívka',
  onboarding_nickname_placeholder: 'Přezdívka',
  onboarding_hint: '3–18 znaků / Změna jednou za 30 dní',
  onboarding_start: 'Začít',
  onboarding_error: 'Došlo k chybě',

  // --- Záhlaví ---
  header_popout_title: 'Otevřít v novém okně',
  header_settings_title: 'Nastavení',

  // --- Informace o titulu ---
  title_reload_tooltip: 'Znovu načíst informace o titulu a komentáře',

  // --- Není Netflix ---
  no_netflix_message: 'Otevřete stránku s titulem na Netflixu',
  no_netflix_hint: 'Dostupné na stránkách netflix.com/watch/...',

  // --- Nastavení ---
  settings_title: 'Nastavení',
  settings_back_title: 'Zpět',

  // --- Sekce uživatele ---
  section_user: 'Uživatel',
  user_preview_guest: 'Host',
  user_nickname_label: 'Přezdívka',
  user_nickname_placeholder: 'Přezdívka',
  user_nickname_save: 'Uložit',
  user_nickname_hint: '3–18 znaků / Změna jednou za 30 dní',
  user_nickname_remaining: '{days} dní do další změny',

  // --- Validace přezdívky ---
  nickname_too_short: 'Zadejte alespoň {min} znaků',
  nickname_too_long: 'Maximálně {max} znaků',
  nickname_ng_word: 'Obsahuje zakázané slovo',

  // --- Sekce jazyka ---
  section_language: 'Jazyk',
  language_preview: 'Čeština',

  // --- Sekce aktualizací ---
  section_update: 'Poslední aktualizace',
  update_preview_loading: 'Načítání…',
  update_preview_failed: 'Načtení selhalo',
  update_github_btn: 'Zobrazit na GitHubu',
  update_fetch_error: 'Nepodařilo se načíst informace o aktualizaci',

  // --- Nastavení komentářů ---
  section_danmaku: 'Nastavení komentářů',
  danmaku_enabled: 'Zobrazit komentáře',
  danmaku_speed: 'Rychlost komentářů',
  danmaku_opacity: 'Průhlednost',
  danmaku_scale: 'Velikost zobrazení',
  danmaku_font: 'Písmo komentářů',
  danmaku_unlimited: 'Neomezené komentáře',
  danmaku_highlight: 'Zvýraznění přehrávání',
  danmaku_preview: 'Rychlost {speed}x / Průhlednost {opacity} %',

  // --- Sekce designu ---
  section_display: 'Design',
  display_fontsize: 'Velikost písma',
  display_system_font: 'Systémové písmo',
  display_background: 'Pozadí',
  bg_default: 'Výchozí',
  bg_light: 'Světlý',
  bg_darkblue: 'Tmavě modrý',
  bg_black: 'Černý',

  // --- Sekce NG ---
  section_ng: 'Nastavení NG',
  ng_preview_total: 'Celkem: {count}',
  ng_comment: 'Komentáře',
  ng_command: 'Příkazy',
  ng_userid: 'ID uživatele',
  ng_edit: 'Upravit',
  ng_modal_title_comment: 'NG komentáře',
  ng_modal_title_command: 'NG příkazy',
  ng_modal_title_userid: 'NG ID uživatele',
  ng_add_placeholder: 'Přidat...',
  ng_add_btn: 'Přidat',
  ng_empty: 'Žádné záznamy',
  ng_delete_title: 'Smazat',
  ng_count: '{count}',

  // --- Sekce úložiště ---
  section_storage: 'Úložiště',
  storage_preview_loading: 'Načítání…',
  storage_total_label: 'Celkem:',
  storage_stats: '{size} / {count} položek / {titles} titulů',
  storage_stats_failed: 'Načtení selhalo',
  storage_export: 'Exportovat nastavení',
  storage_export_btn: 'Export',
  storage_import: 'Importovat nastavení',
  storage_import_btn: 'Import',
  storage_reset: 'Obnovit nastavení',
  storage_reset_desc: 'Obnovit všechna nastavení na výchozí hodnoty',
  storage_reset_btn: 'Obnovit',
  storage_reset_confirm: 'Obnovit všechna nastavení na výchozí hodnoty?',
  storage_clear: 'Vymazat úložiště',
  storage_clear_desc: 'Trvale smazat všechna data',
  storage_clear_btn: 'Vymazat',
  storage_clear_confirm: 'Trvale smazat všechna data?\nTuto akci nelze vrátit.',

  // --- Sekce o aplikaci ---
  section_about: 'Ostatní a podpora',
  about_bug_report: 'Nahlásit chybu',
  about_bug_report_desc: 'Nahlásit chyby a problémy',
  about_privacy: 'Zásady ochrany osobních údajů',
  about_privacy_desc: 'O nakládání s osobními údaji',
  about_source: 'Zdrojový kód',
  about_source_desc: 'Zobrazit repozitář na GitHubu',
  about_support: 'Podpořit vývojáře',
  about_support_desc: 'Amazon seznam přání',
  about_extensions: 'Rozšíření od vývojáře',
  about_extensions_desc: 'keigoly.jp/apps',
  about_website: 'Webové stránky vývojáře',
  about_website_desc: 'keigoly.jp',

  // --- Odhlášení ---
  signout: 'Odhlásit se',
  signout_desc: 'Odpojit účet Google',

  // --- Statistický panel ---
  stat_pace: 'Tempo: {count} komentářů/min',
  stat_total: 'Celkem komentářů: {count}',
  stat_peers: '{count} účastníků',

  // --- Vyrovnávací paměť komentářů ---
  buffer_new_comments: '{count} nových komentářů',

  // --- Záhlaví sloupců ---
  col_time: 'Čas',
  col_no: 'Č.',
  col_user: 'Uživatel',
  col_comment: 'Komentář',
  col_date: 'Datum',

  // --- Zobrazení komentářů ---
  comment_empty: 'Čekání na komentáře…',
  comment_scroll_btn: '↓ Nové komentáře',

  // --- Offset ---
  offset_btn: 'Synchronizovat offset',

  // --- Kontextová nabídka ---
  ctx_copy_comment: 'Kopírovat komentář',
  ctx_copy_userid: 'Kopírovat ID uživatele',
  ctx_copied: 'Zkopírováno',
  ctx_ng_section: 'Nastavení NG',
  ctx_ng_add_comment: 'Přidat komentář do NG',
  ctx_ng_add_userid: 'Přidat ID uživatele do NG',
  ctx_ng_added: 'Přidáno',
  ctx_userid_unknown: 'Neznámý',

  // --- Vstup komentáře ---
  input_placeholder: 'Napsat komentář... (max 45 znaků)',
  input_send_title: 'Odeslat',
  input_ng_blocked: 'Tento komentář nelze odeslat',

  // --- Řádek komentáře ---
  comment_admin: 'Admin',
  comment_you: 'Vy',
  comment_guest: 'Host',

  // --- Dny v týdnu ---
  weekday_sun: 'Ne',
  weekday_mon: 'Po',
  weekday_tue: 'Út',
  weekday_wed: 'St',
  weekday_thu: 'Čt',
  weekday_fri: 'Pá',
  weekday_sat: 'So',

  // --- Integrace Nico Live ---
  section_nico: 'Nico Live',
  nico_connect_btn: 'Připojit',
  nico_disconnect_btn: 'Odpojit',
  nico_preview_disconnected: 'Nepřipojeno',
  nico_preview_connecting: 'Připojování...',
  nico_preview_connected: 'Připojeno',
  nico_preview_error: 'Chyba',
  nico_account_status: 'Účet Niconico:',
  nico_account_logged_in: 'Přihlášen',
  nico_account_not_logged_in: 'Nepřihlášen',
  nico_show_comments: 'Zobrazit komentáře Nico Live',
  nico_comments_on: 'Komentáře ZAP',
  nico_comments_off: 'Komentáře VYP',
  nico_broadcast_info: 'Informace o vysílání:',
  nico_viewer_count: 'Diváci: {count}',
  nico_viewer_count_title: 'Počet diváků Nico Live',
  nico_badge: 'N',
  nico_broadcast_ended: 'Vysílání ukončeno',
  nico_broadcast_waiting: 'Čekání na vysílání',

  // --- Sdílení na sociálních sítích ---
  sns_share_text: 'Sdílejte prosím na sociálních sítích!',
  sns_share_content: '#NetflixJikkyo - Sledujte Netflix s živými komentáři!\nRozšíření pro Chrome s komentáři ve stylu Niconico!\nVyzkoušejte → ',

  // --- UI obsahového skriptu ---
  cs_input_placeholder: 'Napsat komentář...',
  cs_send: 'Odeslat',
  cs_danmaku_toggle: 'Danmaku ZAP/VYP',
  cs_danmaku_label: 'D',

  // --- Popup ---
  popup_status_title: 'Stav připojení',
  popup_status_connected: 'Připojeno',
  popup_status_disconnected: 'Nepřipojeno',
  popup_status_open_netflix: 'Otevřete stránku sledování na Netflixu',
  popup_peers_label: 'Připojení účastníci:',
  popup_open_panel: 'Otevřít panel komentářů',
  popup_settings_title: 'Nastavení',
  popup_nickname_label: 'Přezdívka',
  popup_nickname_placeholder: 'Host',
  popup_speed_label: 'Rychlost komentářů',
  popup_opacity_label: 'Průhlednost',
  popup_scale_label: 'Velikost zobrazení',
  popup_enabled_label: 'Zobrazit komentáře',
  popup_unlimited_label: 'Neomezené komentáře',
  popup_log_title: 'Historie',
  popup_log_empty: 'Žádné záznamy',
  popup_log_failed: 'Nepodařilo se načíst záznamy',
  popup_log_title_id: 'Titul {id}',
  popup_log_count: '{count}',
  popup_footer: 'Netflix Jikkyo - P2P komentáře bez serveru',
};

export default cs;
