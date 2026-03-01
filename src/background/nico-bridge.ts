// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

/**
 * ニコ生双方向ブリッジ
 *
 * Background Service Worker で動作。
 * SW が直接 WebSocket + NDGR HTTP ストリーミングを行う。
 *
 * アーキテクチャ:
 *   SW: fetchWatchData() → wsUrl + viewUri 情報取得
 *   SW: connectWebSocket(wsUrl) → seat/statistics/disconnect/postComment
 *   SW: seat 受信 → keepSeat タイマー開始
 *   SW: messageServer 受信 → viewUri 取得 → startNdgrStream(viewUri)
 *   SW: NDGR HTTP streaming → protobuf decode → comment dispatch
 */

import { decodeNdgrStream, splitLengthDelimited, parseSingleViewEntry, debugProtobufFields, type NicoLiveComment } from './nico-protobuf';
import type { NicoBridgeStatus, NicoBridgeStateMessage, NicoBridgeCommentMessage } from '../types';
import type { NicoOAuthToken } from './nico-auth';
import { log, warn } from '../utils/logger';

/** レート制限: 最大転送コメント数/秒 */
const MAX_COMMENTS_PER_SECOND = 50;

/** コメント鮮度フィルタ: これより古いコメントは過去補完データとして除外 (秒)
 * NDGR構造遅延2-5s + ネットワーク遅延を考慮し10sで十分。15sだと古すぎるコメントが通過する。 */
const MAX_COMMENT_AGE_S = 10;

/** セグメント鮮度フィルタ: until からこれ以上経過したセグメントはfetchをスキップ (秒)
 * 各Viewは2セグメント (各16s window) を返すが、seg[1]は常に古い。
 * 古いセグメントはseenCommentNosで重複除去されるがfetch+decodeが無駄。 */
const MAX_SEGMENT_AGE_S = 20;

/** View リクエスト間の最小間隔 (ms)
 * View API が即座に返答した場合の tight-loop 防止。
 * 200ms = 最大5req/s。?at=now ポーリングでは低いほど遅延が減る。 */
const MIN_VIEW_INTERVAL_MS = 200;

/** View ストリームの安全タイムアウト (ms)
 * ネットワーク障害時にハングしないためのフォールバック。
 * 通常は View API の HTTP ストリーミングが自然に完了する。 */
const VIEW_SAFETY_TIMEOUT_MS = 30000;


/** 再接続 backoff 設定 */
const RECONNECT_MIN_MS = 3000;
const RECONNECT_MAX_MS = 60000;

/** declarativeNetRequest ルール ID */
const DNR_RULE_ID_NDGR = 100;

/**
 * mpn.live.nicovideo.jp への fetch 時にヘッダーを書き換える DNR ルールを登録。
 *
 * SW の fetch() は forbidden header (Cookie, Origin, Referer) を除去するため、
 * declarativeNetRequest のネットワーク層で全ヘッダーを上書きする。
 *
 * @param cookieStr - nicovideo Cookie 文字列 (動的に取得して毎回更新)
 */
async function updateNdgrDnrRule(cookieStr?: string): Promise<void> {
  try {
    const SET = chrome.declarativeNetRequest.HeaderOperation.SET;
    const requestHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [
      { header: 'Origin', operation: SET, value: 'https://live.nicovideo.jp' },
      { header: 'Referer', operation: SET, value: 'https://live.nicovideo.jp/' },
      { header: 'Sec-Fetch-Site', operation: SET, value: 'same-site' },
      { header: 'Sec-Fetch-Dest', operation: SET, value: 'empty' },
      { header: 'Sec-Fetch-Mode', operation: SET, value: 'cors' },
      { header: 'Accept-Language', operation: SET, value: 'ja' },
    ];

    // Cookie を DNR でネットワーク層にセット (fetch() では forbidden header として除去されるため)
    if (cookieStr) {
      requestHeaders.push({ header: 'Cookie', operation: SET, value: cookieStr });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: DNR_RULE_ID_NDGR,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders,
        },
        condition: {
          // NDGR ストリーミングサーバー
          requestDomains: ['mpn.live.nicovideo.jp'],
        },
      }],
      removeRuleIds: [DNR_RULE_ID_NDGR],
    });

    log(`[NicoBridge] DNR rule updated: ${requestHeaders.length} headers${cookieStr ? ` (cookie=${cookieStr.length} chars)` : ' (no cookie)'}`);
  } catch (e) {
    warn('[NicoBridge] Failed to update DNR rule:', e);
  }
}

/** 重複排除用: 最近送信したテキストの TTL (ms) */
const DEDUP_TTL_MS = 30000;
const DEDUP_MAX_SIZE = 1000;

export class NicoBridge {
  private lvId: string;
  private status: NicoBridgeStatus = 'disconnected';
  private viewerCount = 0;
  private hasNicoSession = false;
  private userSession: string | null = null;
  private oauthToken: NicoOAuthToken | null = null;
  private destroyed = false;
  private userDisconnected = false;
  private disconnectMessageReceived = false;

  // NDGR コメント重複排除 (comment no → seen)
  private seenCommentNos = new Set<number>();

  // NDGR セグメント URI 重複排除 (closed セグメントのみ。LIVE は再fetchで新コメント取得)
  private seenSegmentUris = new Set<string>();

  // デバッグ統計
  private debugSegsReceived = 0;
  private debugCommentsDispatched = 0;

  // SW 直接 WebSocket (制御用)
  private ws: WebSocket | null = null;
  private keepSeatTimer: ReturnType<typeof setInterval> | null = null;
  private ndgrAbortController: AbortController | null = null;

  // 再接続
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_MIN_MS;

  // レート制限
  private commentCountThisSecond = 0;
  private rateLimitTimer: ReturnType<typeof setInterval> | null = null;

  // 重複排除 (送信→受信ループ防止)
  private recentlySentTexts = new Map<string, number>();
  private dedupCleanupTimer: ReturnType<typeof setInterval> | null = null;

  // WebSocket 接続情報
  private threadId: string | null = null;

  // コールバック
  private onComment: (comment: NicoBridgeCommentMessage) => void;
  private onStateChange: (state: NicoBridgeStateMessage) => void;

  constructor(
    lvId: string,
    onComment: (comment: NicoBridgeCommentMessage) => void,
    onStateChange: (state: NicoBridgeStateMessage) => void,
  ) {
    this.lvId = lvId;
    this.onComment = onComment;
    this.onStateChange = onStateChange;

    // レート制限リセットタイマー
    this.rateLimitTimer = setInterval(() => {
      this.commentCountThisSecond = 0;
    }, 1000);

    // 重複排除クリーンアップタイマー
    this.dedupCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [text, ts] of this.recentlySentTexts) {
        if (now - ts > DEDUP_TTL_MS) {
          this.recentlySentTexts.delete(text);
        }
      }
    }, 10000);
  }

  /** 接続開始 */
  async connect(): Promise<void> {
    if (this.destroyed) return;

    // 再接続時のステートリセット
    this.disconnectMessageReceived = false;

    this.setStatus('connecting');

    try {
      // 1. セッション Cookie 取得
      await this.fetchNicoSession();
      this.broadcastState();

      // 2. DNR ルールを Cookie 付きで早期登録
      //    (room メッセージでコメント WS 接続が発生するため、先に設定)
      let cookieStr = '';
      try {
        const cookies = await chrome.cookies.getAll({ domain: '.nicovideo.jp' });
        cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      } catch { /* ignore */ }
      await updateNdgrDnrRule(cookieStr);

      // 2. 視聴ページから WebSocket URL 取得
      const watchData = await this.fetchWatchData();
      if (!watchData || !watchData.wsUrl) {
        // 配信終了 → リトライ不要
        if (watchData?.programStatus === 'ENDED') {
          this.setStatus('disconnected', '配信終了');
          log('[NicoBridge] Program ENDED — not retrying');
          return;
        }
        this.setStatus('error', 'Failed to fetch watch data');
        this.scheduleReconnect();
        return;
      }

      // 3. WebSocket 接続 (SW 内で直接)
      this.connectWebSocket(watchData.wsUrl);

    } catch (e) {
      warn('[NicoBridge] Connection error:', e);
      this.setStatus('error', String(e));
      this.scheduleReconnect();
    }
  }

  /** 切断 */
  disconnect(reason?: string): void {
    this.closeWebSocket();
    this.abortNdgrStream();
    this.clearTimers();
    this.setStatus('disconnected', reason);
  }

  /** 完全破棄 */
  destroy(): void {
    this.destroyed = true;
    this.disconnect('destroyed');

    if (this.rateLimitTimer) {
      clearInterval(this.rateLimitTimer);
      this.rateLimitTimer = null;
    }
    if (this.dedupCleanupTimer) {
      clearInterval(this.dedupCleanupTimer);
      this.dedupCleanupTimer = null;
    }
    this.recentlySentTexts.clear();
    this.seenCommentNos.clear();
    this.seenSegmentUris.clear();
    this.debugSegsReceived = 0;
    this.debugCommentsDispatched = 0;
  }

  /** ニコ生にコメント投稿 (WS 直接送信) */
  async postComment(text: string): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.hasNicoSession) return false;
    try {
      this.ws.send(JSON.stringify({
        type: 'postComment',
        data: { text, vpos: 0, isAnonymous: true },
      }));
      this.recordSentText(text);
      return true;
    } catch {
      return false;
    }
  }

  /** OAuthトークンを設定 */
  setOAuthToken(token: NicoOAuthToken | null): void {
    this.oauthToken = token;
    this.hasNicoSession = !!token;
    if (token) {
      log('[NicoBridge] OAuth token set');
    }
  }

  /** セッション有無 */
  getHasNicoSession(): boolean {
    return this.hasNicoSession;
  }

  /** 現在のステータス */
  getStatus(): NicoBridgeStatus {
    return this.status;
  }

  /** ユーザーが明示的に切断したかどうかを設定 */
  setUserDisconnected(flag: boolean): void {
    this.userDisconnected = flag;
    if (flag) {
      this.hasNicoSession = false;
      this.userSession = null;
    }
  }

  /** 完全なセグメントデータを独立にデコード (leftover蓄積なし) */
  processNdgrChunk(data: Uint8Array): void {
    try {
      const result = decodeNdgrStream(data);

      if (result.statistics) {
        this.viewerCount = result.statistics.viewers;
        this.broadcastState();
      }

      for (const comment of result.comments) {
        this.handleNicoComment(comment);
      }
    } catch (e) {
      warn(`[NicoBridge] Segment decode error (${data.length}b): ${String(e).slice(0, 80)}`);
    }
  }

  // --- Private ---

  private async fetchNicoSession(): Promise<void> {
    if (this.oauthToken) {
      this.hasNicoSession = true;
      log('[NicoBridge] Using OAuth token');
      return;
    }

    if (this.userDisconnected) {
      this.userSession = null;
      this.hasNicoSession = false;
      log('[NicoBridge] User disconnected, skipping cookie');
      return;
    }

    try {
      const cookie = await chrome.cookies.get({
        url: 'https://nicovideo.jp',
        name: 'user_session',
      });
      if (cookie?.value) {
        this.userSession = cookie.value;
        this.hasNicoSession = true;
        log('[NicoBridge] Nico session found (cookie)');
      } else {
        this.userSession = null;
        this.hasNicoSession = false;
        log('[NicoBridge] No nico session (read-only mode)');
      }
    } catch (e) {
      warn('[NicoBridge] Cookie read failed:', e);
      this.userSession = null;
      this.hasNicoSession = false;
    }
  }

  private async fetchWatchData(): Promise<{ wsUrl: string; programStatus?: string } | null> {
    try {
      const url = `https://live.nicovideo.jp/watch/${this.lvId}`;
      const headers: Record<string, string> = {};
      if (this.oauthToken) {
        headers['Authorization'] = `Bearer ${this.oauthToken.accessToken}`;
      }

      const res = await fetch(url, { headers, credentials: 'include' });
      if (!res.ok) {
        warn(`[NicoBridge] Watch page fetch failed: ${res.status}`);
        return null;
      }

      const html = await res.text();

      const match = html.match(/data-props="([^"]+)"/);
      if (!match) {
        warn('[NicoBridge] data-props not found');
        return null;
      }

      const propsJson = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const props = JSON.parse(propsJson);

      // 配信状態を確認
      const programStatus = props?.program?.status || props?.status;
      if (programStatus) {
        log(`[NicoBridge] Program status: ${programStatus}`);
      }

      const wsUrl = props?.site?.relive?.webSocketUrl
        || props?.program?.supplier?.wsUrl
        || props?.site?.url?.webSocketUrl
        || props?.webSocketUrl;

      if (!wsUrl) {
        const keys = Object.keys(props || {}).join(', ');
        warn(`[NicoBridge] WebSocket URL not found in props (keys: ${keys}, status: ${programStatus || 'unknown'})`);
        return { wsUrl: '', programStatus }; // programStatus を返す (wsUrl は空)
      }

      return { wsUrl, programStatus };
    } catch (e) {
      warn('[NicoBridge] fetchWatchData error:', e);
      return null;
    }
  }

  /** SW 内で直接 WebSocket 接続 */
  private connectWebSocket(wsUrl: string): void {
    this.closeWebSocket();

    log(`[NicoBridge] Connecting WebSocket: ${wsUrl.slice(0, 80)}`);
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      log('[NicoBridge] WebSocket connected');
      // startWatching: ニコ生公式ページと同じフォーマット
      // stream.latency=low で低遅延配信をリクエスト
      // room.commentable=true でコメント投稿を有効化
      ws.send(JSON.stringify({
        type: 'startWatching',
        data: {
          stream: {
            quality: 'abr',
            protocol: 'hls+fmp4',
            latency: 'low',
            chasePlay: false,
          },
          room: { protocol: 'webSocket', commentable: true },
          reconnect: false,
        },
      }));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        this.handleWsMessage(msg.type, msg.data);
      } catch { /* parse error */ }
    };

    ws.onerror = () => {
      warn('[NicoBridge] WebSocket error');
    };

    ws.onclose = (event: CloseEvent) => {
      this.clearKeepSeat();
      log(`[NicoBridge] WebSocket closed: code=${event.code} reason=${event.reason}`);
      if (!this.destroyed && !this.disconnectMessageReceived) {
        if (event.code === 1000 && event.reason === 'END_PROGRAM') {
          this.setStatus('disconnected', '配信終了');
        } else {
          this.setStatus('disconnected');
          this.scheduleReconnect();
        }
      }
    };
  }

  /** WS メッセージ処理 */
  private handleWsMessage(type: string, data: any): void {
    switch (type) {
      case 'seat': {
        log('[NicoBridge] seat received');
        const interval = (data?.keepIntervalSec ?? 30) * 1000;
        this.startKeepSeat(interval);
        break;
      }
      case 'ping':
        this.ws?.send(JSON.stringify({ type: 'pong' }));
        break;
      case 'statistics': {
        this.viewerCount = data?.viewers ?? 0;
        this.broadcastState();
        break;
      }
      case 'room':
        // 注: 「帰ってきたニコニコ」(2024年8月) で room イベントは廃止。
        // 旧システムの互換性のため残すが、messageServer.uri は来ない。
        log('[NicoBridge] room (legacy):', JSON.stringify(data).slice(0, 200));
        this.threadId = data?.threadId;
        break;
      case 'messageServer': {
        const viewUri = data?.viewUri || data?.vposBaseUri;
        if (viewUri) {
          log(`[NicoBridge] messageServer → viewUri: ${viewUri}`);
          this.reconnectDelay = RECONNECT_MIN_MS;
          this.setStatus('connected');
          this.startNdgrStream(viewUri);
        } else {
          log(`[NicoBridge] messageServer received but no viewUri`);
          this.setStatus('connected');
        }
        break;
      }
      case 'akashicMessageServer':
        // Akashic (ゲーム/インタラクティブ用) → コメントには不要、無視
        log(`[NicoBridge] akashicMessageServer ignored`);
        break;
      case 'disconnect': {
        this.disconnectMessageReceived = true;
        const reason = data?.reason;
        log(`[NicoBridge] Server disconnect: ${reason}`);
        if (reason === 'END_PROGRAM') {
          this.setStatus('disconnected', '配信終了');
        } else if (reason === 'CROWDED') {
          warn(`[NicoBridge] CROWDED — retrying in ${RECONNECT_MIN_MS}ms`);
          this.reconnectDelay = RECONNECT_MIN_MS;
          this.scheduleReconnect();
        } else {
          warn(`[NicoBridge] Disconnected: ${reason}`);
          this.scheduleReconnect();
        }
        break;
      }
      case 'postCommentResult': {
        if (data?.chat?.resultCode === 4) {
          log('[NicoBridge] postkey expired');
        }
        break;
      }
      default:
        // 未知のメッセージタイプの完全ログ (リアルタイムコメントが来ている可能性)
        log(`>>> WS UNKNOWN [${type}]: ${JSON.stringify(data).slice(0, 300)} <<<`);
        break;
    }
  }

  /**
   * NDGR 2段ストリーミング (View → Segment)
   *
   * 「即座に次のView開始」パイプライン方式:
   *   1. View ストリームを開始
   *   2. next ポインタを受信した瞬間に次の View リクエストを開始 (ストリーム完了を待たない)
   *   3. 現在のストリームはバックグラウンドでセグメント処理を継続
   *   4. セグメントもストリーミング処理 (コメントを1つずつ即時配信)
   *
   * これにより View ストリーム (最大32秒) の完了を待つ遅延を排除。
   * 次の View ロングポールが早期に開始され、データ到着時に即座に処理される。
   */
  private async startNdgrStream(viewUri: string): Promise<void> {
    this.abortNdgrStream();
    this.seenCommentNos.clear();
    this.seenSegmentUris.clear();

    const controller = new AbortController();
    this.ndgrAbortController = controller;

    try {
      // 1. Cookie を取得して DNR ルールに動的セット
      let cookieStr = '';
      try {
        const cookies = await chrome.cookies.getAll({ domain: '.nicovideo.jp' });
        cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        log(`[NicoBridge] NDGR cookies (${cookies.length})`);
      } catch (e) {
        warn('[NicoBridge] Cookie read failed:', e);
        if (this.userSession) cookieStr = `user_session=${this.userSession}`;
      }
      await updateNdgrDnrRule(cookieStr);

      // 2. View パイプライン: サーバーのロングポールに委任
      //
      // NDGR View API の動作:
      //   ?at=now → 即座に現在の状態を返す (セグメントなしの場合が多い)
      //   ?at=T   → 時刻Tまでロングポール → データ準備完了時にセグメント付きで返答
      //
      // サーバーの next.at を使って ?at=T でリクエストすることで、
      // サーバーがデータ準備完了まで接続を保持し、最適なタイミングで配信する。
      const baseViewUri = viewUri.split('?')[0];
      let currentUrl = `${baseViewUri}?at=now`; // 初回のみ ?at=now

      let viewCount = 0;
      this.debugSegsReceived = 0;
      this.debugCommentsDispatched = 0;
      let prevViewAbort: AbortController | null = null;
      while (!this.destroyed && !controller.signal.aborted) {
        viewCount++;
        const viewStart = Date.now();

        // 前の View ストリームを中断 (セグメントfetchは controller.signal で継続)
        if (prevViewAbort) {
          prevViewAbort.abort();
        }
        const viewAbort = new AbortController();
        prevViewAbort = viewAbort;
        controller.signal.addEventListener('abort', () => viewAbort.abort(), { once: true });

        // View ストリームを開始
        log(`[NicoBridge] View #${viewCount} → ${currentUrl.replace(baseViewUri, '...')}`);
        const { nextPointerPromise } = this.startViewStream(currentUrl, viewCount, viewAbort.signal, controller.signal);

        // Race: next ポインタ到着 OR 安全タイムアウト
        const nextPointer = await Promise.race([
          nextPointerPromise,
          new Promise<null>(r => setTimeout(() => r(null), VIEW_SAFETY_TIMEOUT_MS)),
        ]);

        // 次の View URL を決定
        // サーバーの next.at を使ってロングポール: ?at=T
        // next.at がない場合のフォールバック: ?at=now
        if (nextPointer?.uri) {
          currentUrl = nextPointer.uri;
        } else if (nextPointer?.at) {
          currentUrl = `${baseViewUri}?at=${nextPointer.at}`;
        } else {
          currentUrl = `${baseViewUri}?at=now`;
        }

        // Tight-loop 防止: View が即座に完了した場合のみ最小間隔を挿入
        const viewElapsed = Date.now() - viewStart;
        if (viewElapsed < MIN_VIEW_INTERVAL_MS) {
          await new Promise(r => setTimeout(r, MIN_VIEW_INTERVAL_MS - viewElapsed));
        }

        // 定期サマリー (10 Views ごと)
        if (viewCount % 10 === 0) {
          log(`[NicoBridge] === Summary: ${viewCount} views, ${this.debugSegsReceived} segs fetched, ${this.debugCommentsDispatched} comments dispatched, ${this.seenCommentNos.size} unique nos ===`);
        }
      }

      log('[NicoBridge] NDGR stream loop ended');
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        warn('[NicoBridge] NDGR stream error:', e);
      }
    }
  }

  /**
   * View ストリームを開始し、next ポインタを受信した瞬間に Promise を resolve する。
   * ストリーム自体はバックグラウンドで継続し、残りのセグメント参照も処理する。
   *
   * これにより、メインループは View ストリーム完了 (最大32秒) を待たずに
   * 次の View リクエストを即座に開始できる。
   */
  private startViewStream(
    url: string,
    viewNum: number,
    signal: AbortSignal,
    segmentSignal?: AbortSignal,
  ): { nextPointerPromise: Promise<{ uri?: string; at?: number } | null> } {
    let resolveNext!: (value: { uri?: string; at?: number } | null) => void;
    const nextPointerPromise = new Promise<{ uri?: string; at?: number } | null>(r => { resolveNext = r; });
    let nextResolved = false;

    // バックグラウンドでストリーム処理 (メインループをブロックしない)
    (async () => {
      const fetchStart = Date.now();
      try {
        const res = await fetch(url, { credentials: 'omit', signal });
        if (!res.ok || !res.body) {
          warn(`[NicoBridge] View fetch failed: ${res.status}`);
          if (!nextResolved) { nextResolved = true; resolveNext(null); }
          return;
        }

        const reader = res.body.getReader();
        let buffer = new Uint8Array(0);
        let segCount = 0;
        let entryCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // バッファに追加
          const newBuf = new Uint8Array(buffer.length + value.length);
          newBuf.set(buffer);
          newBuf.set(value, buffer.length);
          buffer = newBuf;

          // 完全な length-delimited メッセージを抽出して即座に処理
          const { messages, consumed } = splitLengthDelimited(buffer);
          if (consumed > 0) {
            buffer = buffer.slice(consumed);
          }

          for (let mi = 0; mi < messages.length; mi++) {
            const msg = messages[mi];
            const entry = parseSingleViewEntry(msg);

            // デバッグ: パース不能なエントリのフィールド構造をダンプ
            if (!entry) {
              if (entryCount < 5) {
                const dump = debugProtobufFields(msg);
                log(`[NicoBridge] View #${viewNum}: entry[${entryCount}] UNKNOWN: ${dump.join(' | ').slice(0, 200)}`);
              }
              entryCount++;
              continue;
            }
            entryCount++;

            if (entry.segment?.uri) {
              segCount++;
              const elapsed = Date.now() - fetchStart;
              const nowSec = Math.floor(Date.now() / 1000);
              const from = entry.segment.from;
              const until = entry.segment.until;
              const isLive = until ? nowSec < until : (from !== undefined && until === undefined);
              const segAge = until ? nowSec - until : 0;
              const segWindow = (from && until) ? `${until - from}s window` : '';

              if (!isLive && until && segAge > MAX_SEGMENT_AGE_S) {
                log(`[NicoBridge] View #${viewNum}: seg[${segCount}] SKIP (${segAge}s ago) ${segWindow}`);
              } else if (!isLive && this.seenSegmentUris.has(entry.segment.uri)) {
                log(`[NicoBridge] View #${viewNum}: seg[${segCount}] DEDUP ${segWindow}`);
              } else {
                if (!isLive) {
                  this.seenSegmentUris.add(entry.segment.uri);
                }
                const src = entry.segment.source === 'segment' ? 'SEG' : 'PREV';
                log(`[NicoBridge] View #${viewNum}: seg[${segCount}] [${src}] +${elapsed}ms from=${from} until=${until} ${isLive ? 'LIVE' : `closed(${segAge}s ago)`} ${segWindow}`);
                this.fetchAndProcessSegment(entry.segment.uri, segmentSignal ?? signal);
              }
            }

            // next ポインタ → 即座に resolve
            if (entry.next && !nextResolved) {
              nextResolved = true;
              const nextAt = entry.next.at;
              const elapsed = Date.now() - fetchStart;
              const nowSec = Math.floor(Date.now() / 1000);
              const waitSec = nextAt ? nextAt - nowSec : 0;
              log(`[NicoBridge] View #${viewNum}: next +${elapsed}ms at=${nextAt} (hint=${waitSec}s) ${segCount > 0 ? `with ${segCount} segs` : 'NO SEGS'}`);
              resolveNext(entry.next);
            }
          }
        }

        const fetchMs = Date.now() - fetchStart;
        log(`[NicoBridge] View #${viewNum} stream ended: ${fetchMs}ms, ${entryCount} entries, ${segCount} segs`);

        // ストリームが next なしで終了した場合
        if (!nextResolved) { nextResolved = true; resolveNext(null); }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          warn(`[NicoBridge] View stream error: ${e}`);
        }
        if (!nextResolved) { nextResolved = true; resolveNext(null); }
      }
    })();

    return { nextPointerPromise };
  }

  /**
   * セグメントをストリーミング処理。
   *
   * セグメントサーバーは ~24秒間かけてコメントを段階的にストリーミングする。
   * fetchAllBytes で全バッファリングすると最大24秒の遅延が発生する。
   * reader.read() でチャンクごとに即座にデコード→配信することで
   * コメントを受信した瞬間にリアルタイムで表示する。
   */
  private fetchAndProcessSegment(uri: string, signal: AbortSignal): void {
    (async () => {
      try {
        const fetchStart = Date.now();
        const res = await fetch(uri, { credentials: 'omit', signal });
        if (!res.ok || !res.body) {
          warn(`[NicoBridge] Segment fetch failed: ${res.status}`);
          return;
        }

        const firstByteMs = Date.now() - fetchStart;
        const reader = res.body.getReader();
        let leftover: Uint8Array = new Uint8Array(0);
        let commentCount = 0;
        let chunkCount = 0;
        let firstCommentMs = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunkCount++;

          // leftover + 新しいチャンクを結合
          let chunk: Uint8Array;
          if (leftover.length > 0) {
            chunk = new Uint8Array(leftover.length + value.length);
            chunk.set(leftover);
            chunk.set(value, leftover.length);
          } else {
            chunk = value;
          }

          // 即座にデコードしてコメントを配信 (leftover は次のチャンクと結合)
          const result = decodeNdgrStream(chunk);
          leftover = new Uint8Array(result.leftover);

          if (result.statistics) {
            this.viewerCount = result.statistics.viewers;
            this.broadcastState();
          }

          for (const comment of result.comments) {
            commentCount++;
            if (commentCount === 1) {
              firstCommentMs = Date.now() - fetchStart;
            }
            this.handleNicoComment(comment);
          }
        }

        this.debugSegsReceived++;
        const totalMs = Date.now() - fetchStart;
        log(`[NicoBridge] Segment: TTFB=${firstByteMs}ms 1st-comment=${firstCommentMs}ms total=${totalMs}ms ${chunkCount}chunks ${commentCount}comments`);
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          warn(`[NicoBridge] Segment stream error: ${e}`);
        }
      }
    })();
  }

  /** keepSeat タイマー開始 */
  private startKeepSeat(intervalMs: number): void {
    this.clearKeepSeat();
    this.keepSeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'keepSeat' }));
      }
    }, intervalMs);
  }

  /** keepSeat タイマー停止 */
  private clearKeepSeat(): void {
    if (this.keepSeatTimer) {
      clearInterval(this.keepSeatTimer);
      this.keepSeatTimer = null;
    }
  }

  /** WebSocket クローズ */
  private closeWebSocket(): void {
    this.clearKeepSeat();
    if (this.ws) {
      this.ws.onclose = null;  // 再接続トリガー防止
      this.ws.close();
      this.ws = null;
    }
  }


  /** NDGR ストリーム中断 */
  private abortNdgrStream(): void {
    if (this.ndgrAbortController) {
      this.ndgrAbortController.abort();
      this.ndgrAbortController = null;
    }
  }

  private handleNicoComment(comment: NicoLiveComment): void {
    if (!comment.content) return;

    // /hb, /info 等のシステムコメントを除外
    if (comment.content.startsWith('/')) return;

    // NDGR 重複排除 (同じ comment no を複数回受信 — ?at=now ポーリングで発生)
    if (comment.no > 0) {
      if (this.seenCommentNos.has(comment.no)) return;
      this.seenCommentNos.add(comment.no);
      // メモリ制限: 古いエントリを定期的に削除 (10000件超で先頭半分を削除)
      if (this.seenCommentNos.size > 10000) {
        const arr = Array.from(this.seenCommentNos);
        this.seenCommentNos = new Set(arr.slice(arr.length / 2));
      }
    }

    // レート制限
    if (this.commentCountThisSecond >= MAX_COMMENTS_PER_SECOND) return;
    this.commentCountThisSecond++;

    // 重複排除 (自分が送信したコメント)
    if (this.recentlySentTexts.has(comment.content)) {
      return;
    }

    // 診断: コメントの遅延秒数
    const nowSec = Math.floor(Date.now() / 1000);
    const age = comment.postedAt ? nowSec - comment.postedAt : 0;

    // 古いコメントを除外 (NDGRの過去セグメント補完データ)
    if (age > MAX_COMMENT_AGE_S) return;

    this.debugCommentsDispatched++;
    log(`[NicoBridge] Comment #${this.debugCommentsDispatched} no=${comment.no} age=${age}s "${comment.content.slice(0, 30)}"`);

    const msg: NicoBridgeCommentMessage = {
      type: 'nico-bridge-comment',
      id: `nico-${comment.no}`,
      text: comment.content,
      nickname: comment.userId ? `nico:${comment.userId.slice(0, 8)}` : 'ニコ生',
      timestamp: comment.postedAt ? comment.postedAt * 1000 : Date.now(),
      nicoUserId: comment.userId,
    };

    this.onComment(msg);
  }

  private recordSentText(text: string): void {
    this.recentlySentTexts.set(text, Date.now());
    if (this.recentlySentTexts.size > DEDUP_MAX_SIZE) {
      const oldest = this.recentlySentTexts.keys().next().value;
      if (oldest) this.recentlySentTexts.delete(oldest);
    }
  }

  private setStatus(status: NicoBridgeStatus, error?: string): void {
    this.status = status;
    this.broadcastState(error);
  }

  private broadcastState(error?: string): void {
    const state: NicoBridgeStateMessage = {
      type: 'nico-bridge-state',
      status: this.status,
      viewerCount: this.viewerCount,
      hasNicoSession: this.hasNicoSession,
      lvId: this.lvId,
      error,
    };
    this.onStateChange(state);
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) return;

    log(`[NicoBridge] Reconnecting in ${this.reconnectDelay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
