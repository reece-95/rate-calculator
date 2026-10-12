/*
 * 云函数 getRates：获取以 USD 为基准的最新汇率
 *
 * - API Key 放在云函数的环境变量 EXCHANGE_RATE_API_KEY 里，不写进代码，用户看不到。
 * - 结果存进云数据库 rates_cache 集合，到数据源的下次更新时间之前都直接返回缓存。
 *   无论多少人使用，每天只会请求上游一两次，不会用完 ExchangeRate-API 的额度。
 * - 上游失败时返回数据库里的旧数据，并标记 stale: true。
 */
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTION = 'rates_cache';
const DOC_ID = 'latest-USD';
const RETRY_GAP_MS = 10 * 60 * 1000; // 数据源偶尔会晚更新，过了更新时间后最多每 10 分钟重试一次

let memo = null; // 同一个云函数实例在热启动时可以复用

function getJSON(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 8000 }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('bad-json')); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}

const isFresh = snap => Boolean(snap && Date.now() < snap.time_next_update_unix * 1000);
const recentlyTried = snap => Boolean(snap && Date.now() - (snap.fetchedAt || 0) < RETRY_GAP_MS);

function publicData(snap) {
    return {
        base_code: snap.base_code,
        time_last_update_unix: snap.time_last_update_unix,
        time_next_update_unix: snap.time_next_update_unix,
        conversion_rates: snap.conversion_rates
    };
}

async function readStored() {
    try {
        const res = await db.collection(COLLECTION).doc(DOC_ID).get();
        return res.data || null;
    } catch (e) {
        return null; // 集合或记录还不存在
    }
}

async function writeStored(snap) {
    const { _id, _openid, ...data } = snap; // 数据库读出来的记录带 _id，写入时不能再带
    const save = () => db.collection(COLLECTION).doc(DOC_ID).set({ data });
    try {
        await save();
    } catch (e) {
        // 第一次运行时集合不存在：创建后再写一次
        try {
            await db.createCollection(COLLECTION);
            await save();
        } catch (err) {
            console.error('[getRates] cache write failed', err);
        }
    }
}

exports.main = async () => {
    if (isFresh(memo)) return { ok: true, data: publicData(memo) };

    const stored = await readStored();
    if (stored && (isFresh(stored) || recentlyTried(stored))) {
        if (isFresh(stored)) memo = stored;
        return { ok: true, stale: !isFresh(stored), data: publicData(stored) };
    }

    const key = process.env.EXCHANGE_RATE_API_KEY;
    if (!key) {
        if (stored) return { ok: true, stale: true, data: publicData(stored) };
        return { ok: false, error: 'missing-key' };
    }

    try {
        const res = await getJSON(`https://v6.exchangerate-api.com/v6/${key}/latest/USD`);
        if (res.result !== 'success' || !res.conversion_rates) {
            throw new Error(String(res['error-type'] || 'upstream-error'));
        }
        const snap = { ...publicData(res), fetchedAt: Date.now() };
        await writeStored(snap);
        memo = snap;
        return { ok: true, data: publicData(snap) };
    } catch (e) {
        // 只记录错误类型，不记录可能包含 Key 的请求地址
        console.error('[getRates] upstream failed:', e.message);
        if (stored) {
            await writeStored({ ...stored, fetchedAt: Date.now() });
            return { ok: true, stale: true, data: publicData(stored) };
        }
        return { ok: false, error: e.message };
    }
};
