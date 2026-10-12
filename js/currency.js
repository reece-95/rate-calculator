/* 币种名称、国旗、小数位数和数字格式化 */

// 常用币种用大家习惯的简称，其余用浏览器自带的中文名称
const SHORT_NAMES = {
    USD: '美元', CNY: '人民币', CNH: '离岸人民币', EUR: '欧元', JPY: '日元', GBP: '英镑',
    AUD: '澳元', CAD: '加元', NZD: '纽币', HKD: '港币', SGD: '新币', KRW: '韩元',
    TWD: '新台币', CHF: '瑞士法郎', THB: '泰铢', MYR: '马币', MOP: '澳门元'
};

let displayNames = null;
try {
    displayNames = new Intl.DisplayNames(['zh-Hans'], { type: 'currency' });
} catch { /* 旧浏览器没有 Intl.DisplayNames */ }

export function currencyName(code) {
    if (SHORT_NAMES[code]) return SHORT_NAMES[code];
    try {
        const name = displayNames?.of(code);
        if (name && name !== code) return name;
    } catch { /* 非标准代码 */ }
    return code;
}

// 币种代码前两位通常就是国家/地区代码：NZD → NZ → 🇳🇿。X 开头的是特殊币种，没有国旗。
export function currencyFlag(code) {
    if (code === 'EUR') return '🇪🇺';
    if (!/^[A-WYZ][A-Z]/.test(code)) return '';
    return String.fromCodePoint(...[...code.slice(0, 2)].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

const digitsCache = new Map();

/** 这个币种通常保留几位小数（日元、韩元 0 位，大部分 2 位，科威特第纳尔 3 位），由浏览器决定 */
export function fractionDigits(code) {
    if (!digitsCache.has(code)) {
        let digits = 2;
        try {
            digits = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
        } catch { /* 用默认 2 位 */ }
        digitsCache.set(code, digits);
    }
    return digitsCache.get(code);
}

const amountFormatters = new Map();

/** 金额：按币种的小数位数，带千位分隔，如 1,234,567.89 */
export function formatAmount(value, code) {
    const digits = fractionDigits(code);
    if (!amountFormatters.has(digits)) {
        amountFormatters.set(digits, new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
    }
    return amountFormatters.get(digits).format(value);
}

const rateFormatter = new Intl.NumberFormat('en-US', { minimumSignificantDigits: 5, maximumSignificantDigits: 6 });

/** 汇率：保留 5~6 位有效数字，所以 0.0063199 这种小汇率也不会被四舍五入成 0.0063 */
export function formatRate(value) {
    return rateFormatter.format(value);
}

/**
 * 把用户输入变成数字。允许千位逗号、空格和中文输入法的全角字符。
 * 空输入返回 null，无法识别或负数返回 NaN。
 */
export function parseAmount(text) {
    const cleaned = String(text)
        .replace(/[０-９．]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/[,，\s]/g, '');
    if (cleaned === '') return null;
    if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return NaN;
    return Number(cleaned);
}
