import type { TranslationKeys } from '../types';

const ko: TranslationKeys = {
  // --- 앱 이름 ---
  app_title: 'Netflix Jikkyo',

  // --- 인증 게이트 ---
  auth_desc: 'Google 계정으로 로그인해야 사용할 수 있습니다.',
  auth_google_btn: 'Google로 로그인',
  auth_login_failed: '로그인에 실패했습니다',
  auth_token_failed: '토큰 취득에 실패했습니다',
  auth_userinfo_failed: '사용자 정보를 가져오지 못했습니다',
  auth_cancelled: '로그인이 취소되었습니다',

  // --- 온보딩 ---
  onboarding_welcome: '환영합니다!',
  onboarding_nickname: '닉네임',
  onboarding_nickname_placeholder: '닉네임',
  onboarding_hint: '3~18자 / 30일에 1회 변경 가능',
  onboarding_start: '시작하기',
  onboarding_error: '오류가 발생했습니다',

  // --- 헤더 ---
  header_popout_title: '새 창에서 열기',
  header_settings_title: '설정',

  // --- 타이틀 정보 ---
  title_reload_tooltip: '타이틀 정보 및 댓글 새로고침',

  // --- 넷플릭스 아님 ---
  no_netflix_message: 'Netflix 작품 페이지를 열어주세요',
  no_netflix_hint: 'netflix.com/watch/... 페이지에서 이용 가능합니다',

  // --- 설정 ---
  settings_title: '설정',
  settings_back_title: '뒤로',

  // --- 사용자 섹션 ---
  section_user: '사용자',
  user_preview_guest: '게스트',
  user_nickname_label: '닉네임',
  user_nickname_placeholder: '닉네임',
  user_nickname_save: '저장',
  user_nickname_hint: '3~18자 / 30일에 1회 변경 가능',
  user_nickname_remaining: '다음 변경까지 {days}일 남음',

  // --- 닉네임 검증 ---
  nickname_too_short: '{min}자 이상 입력해주세요',
  nickname_too_long: '{max}자 이내로 입력해주세요',
  nickname_ng_word: '사용할 수 없는 문자열이 포함되어 있습니다',

  // --- 언어 섹션 ---
  section_language: '언어',
  language_preview: '한국어',

  // --- 업데이트 섹션 ---
  section_update: '최신 업데이트',
  update_preview_loading: '로딩 중…',
  update_preview_failed: '가져오기 실패',
  update_github_btn: 'GitHub에서 보기',
  update_fetch_error: '업데이트 정보를 가져오지 못했습니다',

  // --- 댓글 설정 ---
  section_danmaku: '댓글 설정',
  danmaku_enabled: '댓글 표시',
  danmaku_speed: '댓글 속도',
  danmaku_opacity: '투명도',
  danmaku_scale: '표시 크기',
  danmaku_font: '댓글 폰트',
  danmaku_unlimited: '무제한 댓글 표시',
  danmaku_highlight: '재생 위치 하이라이트',
  danmaku_preview: '속도 {speed}x / 투명도 {opacity}%',

  // --- 디자인 섹션 ---
  section_display: '디자인',
  display_fontsize: '글꼴 크기',
  display_system_font: '시스템 폰트',
  display_background: '배경',
  bg_default: '기본',
  bg_light: '라이트',
  bg_darkblue: '다크 블루',
  bg_black: '블랙',

  // --- NG 섹션 ---
  section_ng: 'NG 설정',
  ng_preview_total: '총 {count}건',
  ng_comment: '댓글',
  ng_command: '명령어',
  ng_userid: '사용자 ID',
  ng_edit: '편집',
  ng_modal_title_comment: 'NG 댓글',
  ng_modal_title_command: 'NG 명령어',
  ng_modal_title_userid: 'NG 사용자 ID',
  ng_add_placeholder: '추가...',
  ng_add_btn: '추가',
  ng_empty: '등록 없음',
  ng_delete_title: '삭제',
  ng_count: '{count}건',

  // --- 저장소 섹션 ---
  section_storage: '저장소',
  storage_preview_loading: '로딩 중…',
  storage_total_label: '합계:',
  storage_stats: '{size} / {count}건 / {titles}개 타이틀',
  storage_stats_failed: '가져오기 실패',
  storage_export: '설정 내보내기',
  storage_export_btn: '내보내기',
  storage_import: '설정 가져오기',
  storage_import_btn: '가져오기',
  storage_reset: '설정 초기화',
  storage_reset_desc: '모든 설정을 기본값으로 되돌립니다',
  storage_reset_btn: '초기화',
  storage_reset_confirm: '모든 설정을 기본값으로 되돌리시겠습니까?',
  storage_clear: '저장소 초기화',
  storage_clear_desc: '모든 데이터를 완전히 삭제합니다',
  storage_clear_btn: '삭제',
  storage_clear_confirm: '모든 데이터를 완전히 삭제하시겠습니까?\n이 작업은 취소할 수 없습니다.',

  // --- 기타 섹션 ---
  section_about: '기타・문의',
  about_bug_report: '버그 신고',
  about_bug_report_desc: '버그 및 문제 보고',
  about_privacy: '개인정보 처리방침',
  about_privacy_desc: '개인정보 취급에 대하여',
  about_source: '소스 코드',
  about_source_desc: 'GitHub 리포지토리 보기',
  about_support: '개발자 응원하기',
  about_support_desc: 'Amazon 위시리스트',
  about_extensions: '개발자의 확장 프로그램 목록',
  about_extensions_desc: 'keigoly.jp/apps',
  about_website: '개발자 공식 사이트',
  about_website_desc: 'keigoly.jp',

  // --- 로그아웃 ---
  signout: '로그아웃',
  signout_desc: 'Google 계정 연결을 해제합니다',

  // --- 통계 바 ---
  stat_pace: '속도: {count} 댓글/분',
  stat_total: '총 댓글 수: {count}',
  stat_peers: '{count}명',

  // --- 댓글 버퍼 ---
  buffer_new_comments: '{count}건의 새 댓글',

  // --- 열 헤더 ---
  col_time: '재생시간',
  col_no: 'No',
  col_user: '사용자',
  col_comment: '댓글',
  col_date: '작성일시',

  // --- 댓글 표시 ---
  comment_empty: '댓글을 기다리는 중…',
  comment_scroll_btn: '↓ 새 댓글',

  // --- 오프셋 ---
  offset_btn: '오프셋 맞추기',

  // --- 컨텍스트 메뉴 ---
  ctx_copy_comment: '댓글 복사',
  ctx_copy_userid: '사용자 ID 복사',
  ctx_copied: '복사됨',
  ctx_ng_section: 'NG 설정',
  ctx_ng_add_comment: '댓글 추가',
  ctx_ng_add_userid: '사용자 ID 추가',
  ctx_ng_added: '추가됨',
  ctx_userid_unknown: '불명',

  // --- 댓글 입력 ---
  input_placeholder: '댓글을 입력... (최대 45자)',
  input_send_title: '전송',
  input_ng_blocked: '이 댓글은 전송할 수 없습니다',

  // --- 댓글 행 ---
  comment_admin: '관리자',
  comment_you: '나',
  comment_guest: '게스트',

  // --- 요일 ---
  weekday_sun: '일',
  weekday_mon: '월',
  weekday_tue: '화',
  weekday_wed: '수',
  weekday_thu: '목',
  weekday_fri: '금',
  weekday_sat: '토',

  // --- SNS 공유 ---
  sns_share_text: 'SNS에서 공유해 주세요!',
  sns_share_content: '#넷플릭스실황 - Netflix에서 다 같이 댓글을 달자!\n니코니코 스타일의 탄막 댓글을 즐길 수 있는 Chrome 확장 프로그램!\n한번 사용해 보세요 → ',

  // --- 콘텐츠 스크립트 UI ---
  cs_input_placeholder: '댓글을 입력...',
  cs_send: '전송',
  cs_danmaku_toggle: '탄막 ON/OFF',
  cs_danmaku_label: '弾',

  // --- 팝업 ---
  popup_status_title: '연결 상태',
  popup_status_connected: '연결됨',
  popup_status_disconnected: '미연결',
  popup_status_open_netflix: 'Netflix 시청 페이지를 열어주세요',
  popup_peers_label: '연결된 피어:',
  popup_open_panel: '댓글 패널 열기',
  popup_settings_title: '설정',
  popup_nickname_label: '닉네임',
  popup_nickname_placeholder: '게스트',
  popup_speed_label: '댓글 속도',
  popup_opacity_label: '투명도',
  popup_scale_label: '표시 크기',
  popup_enabled_label: '댓글 표시',
  popup_unlimited_label: '무제한 댓글 표시',
  popup_log_title: '과거 로그',
  popup_log_empty: '로그가 없습니다',
  popup_log_failed: '로그 로드에 실패했습니다',
  popup_log_title_id: '타이틀 {id}',
  popup_log_count: '{count}건',
  popup_footer: 'Netflix Jikkyo - P2P 서버리스 실황',
};

export default ko;
