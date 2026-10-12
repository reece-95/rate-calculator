/*
 * 汇率数据：通过云函数获取，缓存在手机本地
 *
 * 数据每天更新一次，所以存在本地，到了数据源告知的下次更新时间才重新请求。
 */
const CACHE_KEY = 'gch-rates-v1';
const MIN_REFETCH_MS = 60 * 60 * 1000;

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

function normalize(data) {
    const rates = data && data.conversion_rates;
    if (!rates || data.base_code !== 'USD' || rates.USD !== 1) throw new Error('unexpected-response');
    const now = Date.now();
    return {
        rates,
        updatedAt: (data.time_last_update_unix || now / 1000) * 1000,
        nextUpdateAt: (data.time_next_update_unix || now / 1000 + 86400) * 1000,
        fetchedAt: now
    };
}

function fetchRates() {
    return wx.cloud.callFunction({ name: 'getRates' }).then(res => {
        const out = res && res.result;
        if (!out || !out.ok) throw new Error((out && out.error) || 'cloud-error');
        return normalize(out.data);
    });
}

function isDue(snap, now) {
    now = now || Date.now();
    if (!snap) return true;
    return now >= snap.nextUpdateAt && now - snap.fetchedAt >= MIN_REFETCH_MS / 6;
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

module.exports = { cachedRates, loadRates, isDue, crossRate };
