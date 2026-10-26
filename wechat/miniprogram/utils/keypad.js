/*
 * 自带数字键盘的输入规则（纯函数，方便测试）
 *
 * 输入框里保存的是"原始文本"，只含数字和一个小数点，例如 "1234.5"；
 * 显示时再加千位分隔，例如 "1,234.5"。
 */

const MAX_INT_DIGITS = 12;

/**
 * 按下一个键后的新文本。
 * key: '0'–'9'、'.'、'del'（退格）、'clear'（清空）
 * maxDecimals: 允许的小数位数，0 表示不允许输入小数点
 */
function applyKey(text, key, maxDecimals) {
    text = String(text || '');
    if (key === 'del') return text.slice(0, -1);
    if (key === 'clear') return '';

    const dot = text.indexOf('.');
    const intPart = dot === -1 ? text : text.slice(0, dot);
    const decPart = dot === -1 ? '' : text.slice(dot + 1);

    if (key === '.') {
        if (maxDecimals <= 0 || dot !== -1) return text;
        return (text === '' ? '0' : text) + '.';
    }

    if (!/^[0-9]$/.test(key)) return text;

    if (dot !== -1) {
        return decPart.length >= maxDecimals ? text : text + key;
    }
    // 去掉多余的前导 0：0 → 5 变成 5，而不是 05
    if (intPart === '0') return key;
    return intPart.length >= MAX_INT_DIGITS ? text : text + key;
}

/** 原始文本 → 显示文本（整数部分加千位分隔） */
function displayText(text) {
    text = String(text || '');
    if (text === '') return '';
    const dot = text.indexOf('.');
    const intPart = dot === -1 ? text : text.slice(0, dot);
    const grouped = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return dot === -1 ? grouped : grouped + '.' + text.slice(dot + 1);
}

/** 旧数据或格式化后的文本（如 "1,234.50"）→ 原始文本 */
function toRaw(text) {
    const cleaned = String(text || '').replace(/[,，\s]/g, '');
    return /^\d*\.?\d*$/.test(cleaned) ? cleaned : '';
}

module.exports = { applyKey, displayText, toRaw };
