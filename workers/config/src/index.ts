/**
 * Netflix Jikkyo - 設定配信 Worker
 *
 * GET /config → 機能フラグをJSONで返す
 * 環境変数はCloudflareダッシュボードから変更可能
 */

interface Env {
  LIVE_RELAY: string;
  RELAY_ENDPOINT: string;
  RELAY_TITLE_IDS: string;
  ANNOUNCEMENT: string;
  MIN_VERSION: string;
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

    if (url.pathname === '/config') {
      const config = {
        liveRelay: env.LIVE_RELAY === 'true',
        relayEndpoint: env.RELAY_ENDPOINT || null,
        relayTitleIds: env.RELAY_TITLE_IDS
          ? env.RELAY_TITLE_IDS.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        announcement: env.ANNOUNCEMENT || null,
        minVersion: env.MIN_VERSION || null,
      };

      return new Response(JSON.stringify(config), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
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
