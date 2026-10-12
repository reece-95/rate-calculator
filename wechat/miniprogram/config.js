/*
 * 云开发环境 ID
 *
 * 留空表示使用开发者工具里当前选中的云开发环境。
 * 如果你有多个环境（例如测试和正式），在这里填正式环境的 ID，可在云开发控制台的"设置"里找到。
 */
module.exports = {
    CLOUD_ENV: '',

    /* 第一次打开时的默认设置 */
    DEFAULTS: {
        base: 'NZD',
        target: 'CNY',
        list: ['CNY', 'NZD', 'USD', 'AUD', 'HKD', 'EUR', 'GBP', 'JPY']
    },

    /* 选择器里排在最前面的常用币种 */
    COMMON: ['CNY', 'NZD', 'USD', 'AUD', 'HKD', 'EUR', 'GBP', 'JPY', 'CAD', 'SGD', 'KRW', 'TWD', 'CHF', 'THB', 'MYR', 'MOP']
};
