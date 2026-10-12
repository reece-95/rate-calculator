/*
 * 汇率数据：获取、校验、本地缓存
 *
 * 数据每天只更新一次，所以存在浏览器里，到了接口告知的下次更新时间才重新请求。
 * 这样打开更快，断网也能用，也不会碰到请求次数限制。
 */
import { RATES_URL } from './config.js';

const CACHE_KEY = 'gch-rates-v1';
const MIN_REFETCH_MS = 60 * 60 * 1000; // 接口建议同一来源最多每小时请求一次

/**
 * @typedef {Object} RatesSnapshot
 * @property {Record<string, number>} rates  1 USD 可兑换的各币种数量
 * @property {number} updatedAt     数据本身的更新时间（毫秒）
 * @property {number} nextUpdateAt  数据源下次更新的时间（毫秒）
 * @property {number} fetchedAt     本机上次请求的时间（毫秒）
 */

function readCache() {
    try {
        const snapshot = JSON.parse(localStorage.getItem(CACHE_KEY));
        return isValid(snapshot) ? snapshot : null;
    } catch {
        return null;
    }
}

function writeCache(snapshot) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); } catch { /* 存储不可用时忽略 */ }
}

function isValid(snapshot) {
    return Boolean(snapshot && snapshot.rates && snapshot.rates.USD === 1 && Number.isFinite(snapshot.updatedAt));
}

/** 兼容两种格式：免 Key 接口的 rates，和带 Key 接口（经 Worker 转发）的 conversion_rates */
function normalize(data) {
    if (!data || data.result !== 'success') {
        throw new Error(data?.['error-type'] || 'unknown-error');
    }
    const rates = data.rates || data.conversion_rates;
    if (!rates || data.base_code !== 'USD' || rates.USD !== 1) {
        throw new Error('unexpected-response');
    }
    const now = Date.now();
    return {
        rates,
        updatedAt: (data.time_last_update_unix || now / 1000) * 1000,
        nextUpdateAt: (data.time_next_update_unix || now / 1000 + 86400) * 1000,
        fetchedAt: now
    };
}

async function fetchRates() {
    // 不用浏览器的 HTTP 缓存：本地缓存已由上面的 localStorage 负责；
    // 浏览器缓存里可能留着一份直接打开接口地址时得到、没有跨站许可头的旧响应，会被 CORS 拦下
    const res = await fetch(RATES_URL, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (res.status === 429) throw new Error('rate-limited');
    if (!res.ok) throw new Error(`http-${res.status}`);
    return normalize(await res.json());
}

/** 缓存是否该更新了 */
export function isDue(snapshot, now = Date.now()) {
    if (!snapshot) return true;
    return now >= snapshot.nextUpdateAt && now - snapshot.fetchedAt >= MIN_REFETCH_MS / 6;
}

/** 立刻拿到的数据（可能为 null） */
export function cachedRates() {
    return readCache();
}

/**
 * 获取最新汇率。没到更新时间就直接用缓存，除非 force 且距离上次请求已超过一小时。
 * 返回 { snapshot, fetched }；请求失败时抛出错误，调用方继续用缓存。
 */
export async function loadRates({ force = false } = {}) {
    const cached = readCache();
    const now = Date.now();
    const shouldFetch = !cached || isDue(cached, now) || (force && now - cached.fetchedAt >= MIN_REFETCH_MS);
    if (!shouldFetch) return { snapshot: cached, fetched: false };

    const fresh = await fetchRates();
    writeCache(fresh);
    return { snapshot: fresh, fetched: true };
}

/** 交叉汇率：1 单位 from 可兑换多少 to（数据都以 USD 为基准） */
export function crossRate(rates, from, to) {
    const a = rates?.[from];
    const b = rates?.[to];
    if (!a || !b) return null;
    return b / a;
}
