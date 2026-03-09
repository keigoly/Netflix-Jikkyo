/**
 * Netflix Jikkyo - 設定配信 Worker
 *
 * GET /config → 機能フラグをJSONで返す
 * 環境変数はCloudflareダッシュボードから変更可能
 */

/** NDGR プロキシで使用するヘッダー (ニコ生ブラウザリクエストを模倣) */
const NDGR_HEADERS: Record<string, string> = {
  'Accept': '*/*',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'ja',
  'Origin': 'https://live.nicovideo.jp',
  'Referer': 'https://live.nicovideo.jp/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

interface Env {
  LIVE_RELAY: string;
  RELAY_ENDPOINT: string;
  RELAY_TITLE_IDS: string;
  ANNOUNCEMENT: string;
  MIN_VERSION: string;
  NICO_BRIDGE_ENABLED: string;
  NICO_BRIDGE_LV_ID: string;
  NICO_BRIDGE_CHANNEL: string;
  NICO_BRIDGE_TITLE: string;
  NICO_BRIDGE_TITLE_IDS: string;
  NICO_OAUTH_CLIENT_ID: string;
  NICO_OAUTH_CLIENT_SECRET: string;
  AD_ENABLED: string;
  AD_LINK_URL: string;
  AD_DISMISS_SEC: string;
  AD_VARIANT: string;
  /** アーカイブコメント設定 JSON: { "netflixTitleId": { "start": unixSec, "end": unixSec, "label": "..." }, ... } */
  ARCHIVE_CONFIG: string;
}

/** アーカイブコメントソースの設定 (Worker 内部のみ — クライアントに露出しない) */
const ARCHIVE_SOURCE_BASE = 'https://jikkyo.tsukumijima.net/api/kakolog';
const ARCHIVE_SOURCE_CHANNEL = 'jk991';

interface ArchiveTitleConfig {
  start: number; // broadcast start (unix seconds)
  end: number;   // broadcast end (unix seconds)
  label?: string;
}

/** ARCHIVE_CONFIG 環境変数をパースする */
function parseArchiveConfig(raw: string): Record<string, ArchiveTitleConfig> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** アーカイブ過去ログを外部APIから取得し、videoTime 付きで返す */
async function fetchArchiveComments(
  titleConfig: ArchiveTitleConfig,
  fromSec: number,
  toSec: number,
): Promise<{ text: string; videoTime: number; timestamp: number }[]> {
  const starttime = titleConfig.start + fromSec;
  const endtime = Math.min(titleConfig.start + toSec, titleConfig.end);
  if (starttime >= endtime) return [];

  const url = `${ARCHIVE_SOURCE_BASE}/${ARCHIVE_SOURCE_CHANNEL}?format=json&starttime=${starttime}&endtime=${endtime}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!res.ok) return [];

  const data: { packet?: { chat: { date: string; content: string; user_id?: string; no?: string } }[] } = await res.json();
  if (!data.packet) return [];

  return data.packet.map((p) => ({
    text: p.chat.content,
    videoTime: parseInt(p.chat.date, 10) - titleConfig.start,
    timestamp: parseInt(p.chat.date, 10) * 1000,
  }));
}

/**
 * ニコニコチャンネルのライブページから「放送中」の lv ID を取得する。
 * Cloudflare の subrequest cache で 5 分間キャッシュ。
 */
async function resolveChannelLvId(channel: string): Promise<string | null> {
  const url = `https://ch.nicovideo.jp/${channel}/live`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!res.ok) return null;

    const html = await res.text();
    // <div id="live_now"> セクション内の最初の lv ID を抽出
    const liveNowStart = html.indexOf('id="live_now"');
    if (liveNowStart === -1) return null;

    // live_now セクションは数KB程度。次のセクションまでの範囲で検索
    const chunk = html.substring(liveNowStart, liveNowStart + 3000);
    const lvMatch = chunk.match(/lv(\d{9,})/);
    return lvMatch ? `lv${lvMatch[1]}` : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS プリフライト
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // NDGR プロキシ: Chrome 拡張の Service Worker から mpn.live.nicovideo.jp への
    // リクエストは Origin ヘッダーが chrome-extension:// になり 400 で拒否されるため、
    // Worker 経由で正しいヘッダーを付けてリクエストを中継する
    if (url.pathname === '/ndgr-proxy') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl || !targetUrl.startsWith('https://mpn.live.nicovideo.jp/')) {
        return new Response('Bad Request: url must start with https://mpn.live.nicovideo.jp/', {
          status: 400,
          headers: corsHeaders(),
        });
      }

      try {
        // Cookie 中継: 拡張から全 nicovideo Cookie を受け取り転送
        const nicoCookies = request.headers.get('X-Nico-Cookies');
        const headers: Record<string, string> = { ...NDGR_HEADERS };
        if (nicoCookies) {
          headers['Cookie'] = nicoCookies;
        }

        const ndgrRes = await fetch(targetUrl, { headers });

        // upstream エラー時はボディも返す (デバッグ用)
        if (!ndgrRes.ok) {
          const errBody = await ndgrRes.text().catch(() => '');
          return new Response(JSON.stringify({
            error: 'upstream_error',
            status: ndgrRes.status,
            body: errBody.slice(0, 500),
          }), {
            status: ndgrRes.status,
            headers: { 'Content-Type': 'application/json', ...corsHeaders() },
          });
        }

        // レスポンスをそのままストリーミング中継
        return new Response(ndgrRes.body, {
          status: ndgrRes.status,
          headers: {
            'Content-Type': ndgrRes.headers.get('Content-Type') || 'application/octet-stream',
            ...corsHeaders(),
          },
        });
      } catch (e) {
        return new Response(`NDGR proxy error: ${e}`, {
          status: 502,
          headers: corsHeaders(),
        });
      }
    }

    // アーカイブコメントプロキシ: クライアントは自サーバーへのリクエストのみ行う
    if (url.pathname === '/archive-comments') {
      const titleId = url.searchParams.get('id');
      const fromSec = parseInt(url.searchParams.get('from') || '0', 10);
      const toSec = parseInt(url.searchParams.get('to') || '600', 10);

      if (!titleId) {
        return new Response(JSON.stringify({ error: 'missing id' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }

      const archiveConfig = parseArchiveConfig(env.ARCHIVE_CONFIG);
      const titleConfig = archiveConfig[titleId];
      if (!titleConfig) {
        return new Response(JSON.stringify({ comments: [], total: 0 }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60',
            ...corsHeaders(),
          },
        });
      }

      try {
        const comments = await fetchArchiveComments(titleConfig, fromSec, toSec);
        return new Response(JSON.stringify({ comments, total: comments.length }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
            ...corsHeaders(),
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'fetch failed', detail: String(e) }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
    }

    if (url.pathname === '/config') {
      // lv ID 解決: 手動設定 > チャンネル自動取得
      let lvId = env.NICO_BRIDGE_LV_ID || null;
      if (!lvId && env.NICO_BRIDGE_CHANNEL) {
        lvId = await resolveChannelLvId(env.NICO_BRIDGE_CHANNEL);
      }

      const config = {
        liveRelay: env.LIVE_RELAY === 'true',
        relayEndpoint: env.RELAY_ENDPOINT || null,
        relayTitleIds: env.RELAY_TITLE_IDS
          ? env.RELAY_TITLE_IDS.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        announcement: env.ANNOUNCEMENT || null,
        minVersion: env.MIN_VERSION || null,
        nicoBridge: {
          enabled: env.NICO_BRIDGE_ENABLED === 'true',
          lvId,
          title: env.NICO_BRIDGE_TITLE || undefined,
          titleIds: env.NICO_BRIDGE_TITLE_IDS
            ? env.NICO_BRIDGE_TITLE_IDS.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          clientId: env.NICO_OAUTH_CLIENT_ID || undefined,
          clientSecret: env.NICO_OAUTH_CLIENT_SECRET || undefined,
        },
        ad: {
          enabled: env.AD_ENABLED === 'true',
          linkUrl: env.AD_LINK_URL || null,
          dismissSec: parseInt(env.AD_DISMISS_SEC, 10) || 0,
          variant: parseInt(env.AD_VARIANT, 10) || 1,
        },
        archive: (() => {
          const cfg = parseArchiveConfig(env.ARCHIVE_CONFIG);
          const titles: Record<string, { duration: number; label?: string }> = {};
          for (const [id, t] of Object.entries(cfg)) {
            titles[id] = { duration: t.end - t.start, label: t.label };
          }
          return Object.keys(titles).length > 0
            ? { enabled: true, titles }
            : { enabled: false, titles: {} };
        })(),
      };

      return new Response(JSON.stringify(config), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=15',
          ...corsHeaders(),
        },
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders() });
  },
};

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
