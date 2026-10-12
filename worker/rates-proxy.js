/*
 * 汇率中转服务（Cloudflare Worker）
 *
 * 作用：把 ExchangeRate-API 的 Key 存在服务器端，网页只请求这个 Worker，
 * 访客在浏览器里看不到 Key。
 *
 * - Key 存在 Worker 的加密变量 EXCHANGE_RATE_API_KEY 里，不写进代码。
 * - 结果缓存 1 小时：不管多少人打开网页，每天最多请求上游约 24 次，
 *   别人就算拿到 Worker 地址狂刷，也耗不掉你的额度。
 * - ALLOWED_ORIGINS 限制只有你的网站能在浏览器里调用（逗号分隔，留空表示不限制）。
 */

const UPSTREAM = 'https://v6.exchangerate-api.com/v6';
const CACHE_SECONDS = 3600;

export default {
    async fetch(request, env, ctx) {
        const origin = request.headers.get('Origin');
        const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        const allowOrigin = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : null;

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) });
        }
        if (request.method !== 'GET') {
            return json({ result: 'error', 'error-type': 'method-not-allowed' }, 405, allowOrigin);
        }
        // 浏览器跨站请求会带 Origin；不在名单里的网站直接拒绝
        if (origin && allowOrigin === null) {
            return json({ result: 'error', 'error-type': 'origin-not-allowed' }, 403, null);
        }
        if (!env.EXCHANGE_RATE_API_KEY) {
            return json({ result: 'error', 'error-type': 'missing-key' }, 500, allowOrigin);
        }

        // 只提供 USD 基准的最新汇率，忽略其他路径，缓存只有一份
        const cache = caches.default;
        const cacheKey = new Request(new URL('/latest/USD', request.url).toString());
        let cached = await cache.match(cacheKey);

        if (!cached) {
            let data;
            try {
                const upstream = await fetch(`${UPSTREAM}/${env.EXCHANGE_RATE_API_KEY}/latest/USD`);
                data = await upstream.json();
            } catch {
                return json({ result: 'error', 'error-type': 'upstream-unavailable' }, 502, allowOrigin);
            }
            if (data.result !== 'success') {
                // 只转发错误类型，不转发任何可能包含 Key 的内容
                return json({ result: 'error', 'error-type': String(data['error-type'] || 'upstream-error') }, 502, allowOrigin);
            }
            const body = JSON.stringify({
                result: 'success',
                base_code: data.base_code,
                time_last_update_unix: data.time_last_update_unix,
                time_last_update_utc: data.time_last_update_utc,
                time_next_update_unix: data.time_next_update_unix,
                conversion_rates: data.conversion_rates
            });
            cached = new Response(body, {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` }
            });
            ctx.waitUntil(cache.put(cacheKey, cached.clone()));
        }

        const res = new Response(cached.body, cached);
        for (const [k, v] of Object.entries(corsHeaders(allowOrigin))) res.headers.set(k, v);
        return res;
    }
};

function corsHeaders(allowOrigin) {
    if (!allowOrigin) return {};
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin'
    };
}

function json(obj, status, allowOrigin) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(allowOrigin) }
    });
}
