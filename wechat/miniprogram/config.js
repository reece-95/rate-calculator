/*
 * 汇率数据来源：极速数据（jisuapi.com）免费版
 *
 * - 免费额度为每天 100 次，所有用户共用。小程序会把汇率缓存在手机上，
 *   每台手机大约每 12 小时才请求一次。
 * - AppKey 会随小程序代码一起发布，无法完全隐藏。免费版额度用完只会让当天无法刷新，
 *   不会产生费用，所以极速数据账户里不要充值。
 * - 需要在小程序后台"开发管理 → 开发设置 → 服务器域名"的 request 合法域名里添加
 *   https://api.jisuapi.com
 */
module.exports = {
    JISU_APPKEY: '50cf1fb6c5d9120f',

    /* 第一次打开时的默认设置 */
    DEFAULTS: {
        base: 'NZD',
        target: 'CNY',
        list: ['CNY', 'NZD', 'USD', 'AUD', 'HKD', 'EUR', 'GBP', 'JPY']
    },

    /* 选择器里排在最前面的常用币种 */
    COMMON: ['CNY', 'NZD', 'USD', 'AUD', 'HKD', 'EUR', 'GBP', 'JPY', 'CAD', 'SGD', 'KRW', 'TWD', 'CHF', 'THB', 'MYR', 'MOP']
};
