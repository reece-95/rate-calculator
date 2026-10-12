/*
 * 汇率数据从哪里来
 *
 * 当前：自己的 Cloudflare Worker（worker/ 目录），API Key 保存在 Worker 的加密变量里。
 * 用自己的 Key 不需要署名，所以 SHOW_ATTRIBUTION 为 false。
 *
 * 如果以后不用 Worker 了，可以改回 ExchangeRate-API 的免 Key 接口：
 *   RATES_URL = 'https://open.er-api.com/v6/latest/USD'，SHOW_ATTRIBUTION = true（要求保留署名链接）
 *
 * 不要把 API Key 写在这里：网页代码对所有访客都是公开的。
 */
export const RATES_URL = 'https://rate-calculator-rates.xuanwen997.workers.dev';
export const SHOW_ATTRIBUTION = false;

/* 第一次打开时的默认设置 */
export const DEFAULTS = {
    base: 'USD',
    target: 'CNY',
    list: ['USD', 'CNY', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'NZD', 'HKD', 'SGD']
};

/* 下拉框里排在最前面的常用币种 */
export const COMMON = ['USD', 'CNY', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'NZD', 'HKD', 'SGD', 'KRW', 'TWD', 'CHF', 'THB', 'MYR'];
