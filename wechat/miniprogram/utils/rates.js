/*
 * 汇率数据：从极速数据获取，缓存在手机本地
 *
 * 免费额度是所有用户每天共 100 次，所以每台手机默认 12 小时才请求一次；
 * 手动刷新（下拉或点刷新按钮）也至少间隔 1 小时。
 */
const { JISU_APPKEY } = require('../config.js');

const CACHE_KEY = 'gch-rates-v2';
const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000;
const MIN_REFETCH_MS = 60 * 60 * 1000;
const API_URL = 'https://api.jisuapi.com/exchange/single';

// 已停用、会和现行货币混淆的旧代码
const OBSOLETE = ['LVL', 'LTL', 'STD'];

// 极速数据的错误码 → 内部错误名
const ERROR_CODES = { 101: 'invalid-key', 102: 'invalid-key', 103: 'invalid-key', 104: 'quota-reached', 106: 'rate-limited', 107: 'maintenance' };

function readCache() {
    try {
        const snap = wx.getStorageSync(CACHE_KEY);
        return isValid(snap) ? snap : null;
    } catch (e) {
        return null;
    }
}

function writeCache(snap) {
    try { wx.setStorageSync(CACHE_KEY, snap); } catch (e) { /* 存储已满等情况，忽略 */ }
}

function isValid(snap) {
    return Boolean(snap && snap.rates && snap.rates.USD === 1 && isFinite(snap.updatedAt));
}

/** "2026-10-14 04:49:41"（北京时间）→ 毫秒时间戳 */
function parseBeijingTime(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(text || ''));
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5], +m[6]);
}

/** 极速数据的返回 → { rates: { USD: 1, CNY: 6.69, ... }, updatedAt, ... } */
function normalize(body) {
    if (!body || typeof body !== 'object') throw new Error('unexpected-response');
    if (body.status !== 0) throw new Error(ERROR_CODES[body.status] || 'api-error');
    const result = body.result || {};
    const list = result.list || {};
    if (result.currency !== 'USD') throw new Error('unexpected-response');

    const rates = { USD: 1 };
    let latest = 0;
    Object.keys(list).forEach(code => {
        if (OBSOLETE.indexOf(code) !== -1) return;
        const rate = Number(list[code] && list[code].rate);
        if (!isFinite(rate) || rate <= 0) return;
        rates[code] = rate;
        const t = parseBeijingTime(list[code].updatetime);
        if (isFinite(t) && t > latest) latest = t;
    });
    if (!rates.CNY) throw new Error('unexpected-response');

    const now = Date.now();
    return {
        rates,
        updatedAt: latest || now,
        nextUpdateAt: now + REFRESH_AFTER_MS,
        fetchedAt: now
    };
}

function fetchRates() {
    return new Promise((resolve, reject) => {
        wx.request({
            url: API_URL,
            data: { appkey: JISU_APPKEY, currency: 'USD' },
            timeout: 10000,
            success: res => {
                if (res.statusCode !== 200) return reject(new Error('http-' + res.statusCode));
                try { resolve(normalize(res.data)); } catch (e) { reject(e); }
            },
            fail: () => reject(new Error('network-error'))
        });
    });
}

function isDue(snap, now) {
    now = now || Date.now();
    if (!snap) return true;
    return now >= snap.nextUpdateAt;
}

function cachedRates() {
    return readCache();
}

/** 返回 Promise<{ snapshot, fetched }>；失败时 reject，调用方继续用缓存 */
function loadRates(options) {
    const force = Boolean(options && options.force);
    const cached = readCache();
    const now = Date.now();
    const shouldFetch = !cached || isDue(cached, now) || (force && now - cached.fetchedAt >= MIN_REFETCH_MS);
    if (!shouldFetch) return Promise.resolve({ snapshot: cached, fetched: false });
    return fetchRates().then(fresh => {
        writeCache(fresh);
        return { snapshot: fresh, fetched: true };
    });
}

/** 交叉汇率：1 单位 from 可兑换多少 to */
function crossRate(rates, from, to) {
    const a = rates && rates[from];
    const b = rates && rates[to];
    if (!a || !b) return null;
    return b / a;
}

module.exports = { cachedRates, loadRates, isDue, crossRate, normalize, parseBeijingTime };
