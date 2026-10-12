/*
 * 汇率数据从哪里来
 *
 * 默认：ExchangeRate-API 的免 Key 接口（每天更新一次，要求页面上保留署名链接）。
 *
 * 部署了 worker/ 里的中转服务之后，把 RATES_URL 改成你的 Worker 地址，
 * 例如 'https://rate-calculator-rates.<你的子域>.workers.dev'，
 * 并把 SHOW_ATTRIBUTION 改成 false（用自己的 Key 不需要署名）。
 *
 * 不要把 API Key 写在这里：网页代码对所有访客都是公开的。
 */
export const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
export const SHOW_ATTRIBUTION = true;

/* 第一次打开时的默认设置 */
export const DEFAULTS = {
    base: 'USD',
    target: 'CNY',
    list: ['USD', 'CNY', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'NZD', 'HKD', 'SGD']
};

/* 下拉框里排在最前面的常用币种 */
export const COMMON = ['USD', 'CNY', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'NZD', 'HKD', 'SGD', 'KRW', 'TWD', 'CHF', 'THB', 'MYR'];
