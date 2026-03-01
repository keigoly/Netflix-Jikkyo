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
  NICO_BRIDGE_TITLE: string;
  NICO_BRIDGE_TITLE_IDS: string;
  NICO_OAUTH_CLIENT_ID: string;
  NICO_OAUTH_CLIENT_SECRET: string;
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

    if (url.pathname === '/config') {
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
          lvId: env.NICO_BRIDGE_LV_ID || null,
          title: env.NICO_BRIDGE_TITLE || undefined,
          titleIds: env.NICO_BRIDGE_TITLE_IDS
            ? env.NICO_BRIDGE_TITLE_IDS.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          clientId: env.NICO_OAUTH_CLIENT_ID || undefined,
          clientSecret: env.NICO_OAUTH_CLIENT_SECRET || undefined,
        },
      };

      return new Response(JSON.stringify(config), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
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
