import { DEFAULTS, COMMON, SHOW_ATTRIBUTION } from './config.js';
import { cachedRates, loadRates, isDue, crossRate } from './rates.js';
import { currencyName, currencyFlag, formatAmount, formatRate, parseAmount } from './currency.js';

const $ = id => document.getElementById(id);

/* ==========================================================================
   状态（保存在浏览器里，下次打开还原）
   ========================================================================== */

const STATE_KEY = 'gch-state-v1';

const state = {
    tab: 'calc',
    base: DEFAULTS.base,
    target: DEFAULTS.target,
    amount: '',
    targetRate: '',
    list: [...DEFAULTS.list],
    multi: { code: null, text: '' }   // 全币种页：用户在哪一行输入了什么
};

try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (saved && typeof saved === 'object') {
        for (const key of Object.keys(state)) if (key in saved) state[key] = saved[key];
    }
} catch { /* 第一次打开或存储不可用 */ }

let saveTimer = null;
function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
    }, 200);
}

let snapshot = cachedRates();
const rates = () => snapshot?.rates ?? null;

/** 可选币种：有数据时用接口里的全部币种，没有时先用默认列表 */
function availableCodes() {
    const r = rates();
    return r ? Object.keys(r) : [...new Set([...COMMON, ...DEFAULTS.list])];
}

/* ==========================================================================
   下拉框
   ========================================================================== */

function buildOptions(select, codes, { exclude = [], placeholder = null } = {}) {
    const available = new Set(codes);
    const common = COMMON.filter(c => available.has(c) && !exclude.includes(c));
    const others = codes.filter(c => !COMMON.includes(c) && !exclude.includes(c)).sort();

    const frag = document.createDocumentFragment();
    if (placeholder) frag.append(new Option(placeholder, ''));
    for (const [label, group] of [['常用', common], ['全部币种', others]]) {
        if (!group.length) continue;
        const optgroup = document.createElement('optgroup');
        optgroup.label = label;
        for (const code of group) optgroup.append(new Option(`${code} - ${currencyName(code)}`, code));
        frag.append(optgroup);
    }
    select.replaceChildren(frag);
}

const baseSel = $('baseCurrency');
const targetSel = $('targetCurrency');
const addSel = $('addCurrency');

function renderSelects() {
    const codes = availableCodes();
    if (!codes.includes(state.base)) state.base = DEFAULTS.base;
    if (!codes.includes(state.target)) state.target = DEFAULTS.target;
    buildOptions(baseSel, codes);
    buildOptions(targetSel, codes);
    baseSel.value = state.base;
    targetSel.value = state.target;
    renderAddSelect();
}

function renderAddSelect() {
    buildOptions(addSel, availableCodes(), { exclude: state.list, placeholder: '添加币种' });
    addSel.value = '';
}

/* ==========================================================================
   工具 1：汇率差（损益）计算器
   ========================================================================== */

const amountInput = $('calcAmount');
const targetRateInput = $('userTargetRate');
const calcError = $('calcError');

amountInput.value = state.amount;
targetRateInput.value = state.targetRate;

function markInvalid(input, invalid) {
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
}

/** 币种按钮上显示的国旗、代码和中文名 */
function renderPicker(prefix, code) {
    $(`${prefix}Flag`).textContent = currencyFlag(code);
    $(`${prefix}Code`).textContent = code;
    $(`${prefix}Name`).textContent = currencyName(code);
}

function renderCalc() {
    const { base, target } = state;
    const rate = crossRate(rates(), base, target);

    renderPicker('base', base);
    renderPicker('target', target);
    document.querySelector('.rate-label').textContent = `1 ${base} =`;
    $('rateValue').textContent = rate == null ? '—' : formatRate(rate);
    $('rateUnit').textContent = rate == null ? '' : target;
    $('rateInverse').textContent = rate == null ? '' : `1 ${target} = ${formatRate(1 / rate)} ${base}`;
    $('useRateBtn').disabled = rate == null;
    $('amountUnit').textContent = `（${base}）`;
    $('targetRateUnit').textContent = `（1 ${base} = ? ${target}）`;
    targetRateInput.placeholder = rate == null ? '你想锁定的汇率' : `例如 ${formatRate(rate)}`;

    const amount = parseAmount(amountInput.value);
    const targetRate = parseAmount(targetRateInput.value);
    const amountBad = Number.isNaN(amount);
    const rateBad = Number.isNaN(targetRate) || targetRate === 0;
    markInvalid(amountInput, amountBad);
    markInvalid(targetRateInput, rateBad);
    calcError.hidden = !(amountBad || rateBad);
    calcError.textContent = amountBad || rateBad ? '请输入大于 0 的数字，例如 1,000 或 6.85' : '';

    const result = $('calcResult');
    if (rate == null || amount == null || targetRate == null || amountBad || rateBad) {
        result.hidden = true;
        return;
    }

    // 汇率始终用完整精度计算，显示时才四舍五入
    const nowTotal = amount * rate;
    const targetTotal = amount * targetRate;
    const diff = nowTotal - targetTotal;
    const diffText = formatAmount(Math.abs(diff), target);
    const isZero = Number(diffText.replace(/,/g, '')) === 0;
    const pct = targetTotal ? (diff / targetTotal) * 100 : 0;

    $('resNow').textContent = `${formatAmount(nowTotal, target)} ${target}`;
    $('resTarget').textContent = `${formatAmount(targetTotal, target)} ${target}`;

    const row = $('resDiffRow');
    row.classList.toggle('is-up', !isZero && diff > 0);
    row.classList.toggle('is-down', !isZero && diff < 0);
    if (isZero) {
        $('resDiffLabel').textContent = '与目标持平';
        $('resDiff').textContent = `0 ${target}`;
        $('resPct').textContent = '';
    } else {
        const sign = diff > 0 ? '+' : '−';
        $('resDiffLabel').textContent = diff > 0 ? '现在换比目标多得' : '现在换比目标少得';
        $('resDiff').textContent = `${sign}${diffText} ${target}`;
        $('resPct').textContent = `相差 ${Math.abs(pct).toFixed(2)}%`;
    }
    result.hidden = false;
}

baseSel.addEventListener('change', () => { state.base = baseSel.value; renderCalc(); saveState(); });
targetSel.addEventListener('change', () => { state.target = targetSel.value; renderCalc(); saveState(); });
amountInput.addEventListener('input', () => { state.amount = amountInput.value; renderCalc(); saveState(); });
targetRateInput.addEventListener('input', () => { state.targetRate = targetRateInput.value; renderCalc(); saveState(); });

$('useRateBtn').addEventListener('click', () => {
    const rate = crossRate(rates(), state.base, state.target);
    if (rate == null) return;
    targetRateInput.value = formatRate(rate).replace(/,/g, '');
    state.targetRate = targetRateInput.value;
    renderCalc();
    saveState();
    targetRateInput.focus();
});

$('swapBtn').addEventListener('click', () => {
    $('swapBtn').classList.toggle('is-flipped');
    [state.base, state.target] = [state.target, state.base];
    baseSel.value = state.base;
    targetSel.value = state.target;
    // 目标汇率跟着换成反方向：1 USD = 6.85 CNY → 1 CNY = 0.145985 USD
    const tr = parseAmount(targetRateInput.value);
    if (tr) {
        targetRateInput.value = formatRate(1 / tr).replace(/,/g, '');
        state.targetRate = targetRateInput.value;
    }
    renderCalc();
    saveState();
});

/* ==========================================================================
   工具 2：多币种联动
   ========================================================================== */

const list = $('multiList');

function createItem(code) {
    const li = document.createElement('li');
    li.className = 'multi-item';
    li.dataset.code = code;

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'drag-handle';
    handle.setAttribute('aria-label', `调整 ${code} 的位置（↑ ↓ 移动）`);
    handle.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-grip"/></svg>';

    const label = document.createElement('label');
    label.className = 'currency-label';
    label.htmlFor = `m-${code}`;
    const flag = currencyFlag(code);
    label.innerHTML = `${flag ? '<span class="flag" aria-hidden="true"></span>' : ''}<span class="code"></span><span class="name"></span>`;
    if (flag) label.querySelector('.flag').textContent = flag;
    label.querySelector('.code').textContent = code;
    label.querySelector('.name').textContent = currencyName(code);

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.className = 'multi-input';
    input.id = `m-${code}`;
    input.dataset.code = code;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn remove-btn';
    remove.setAttribute('aria-label', `移除 ${code}`);
    remove.title = '移除';
    remove.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-x"/></svg>';

    li.append(handle, label, input, remove);
    return li;
}

function renderMultiList() {
    state.list = state.list.filter(code => availableCodes().includes(code));
    list.replaceChildren(...state.list.map(createItem));
    updateMulti();
}

/** 根据用户输入的那一行，算出其他所有行；同时更新占位提示（第一行币种 100 单位的等值） */
function updateMulti() {
    const r = rates();
    const inputs = [...list.querySelectorAll('.multi-input')];
    const first = state.list[0];
    const { code: srcCode, text } = state.multi;
    const srcAmount = srcCode && state.list.includes(srcCode) ? parseAmount(text) : null;
    const valid = srcAmount != null && !Number.isNaN(srcAmount);

    for (const input of inputs) {
        const code = input.dataset.code;
        const hint = crossRate(r, first, code);
        input.placeholder = hint == null ? '' : formatAmount(100 * hint, code);

        if (code === srcCode) {
            if (input.value !== text && document.activeElement !== input) input.value = text;
            markInvalid(input, Number.isNaN(srcAmount));
            continue;
        }
        markInvalid(input, false);
        const rate = crossRate(r, srcCode, code);
        input.value = valid && rate != null ? formatAmount(srcAmount * rate, code) : '';
    }
    list.querySelectorAll('.remove-btn').forEach(btn => { btn.disabled = state.list.length <= 2; });
}

list.addEventListener('input', e => {
    const input = e.target.closest('.multi-input');
    if (!input) return;
    state.multi = { code: input.dataset.code, text: input.value };
    updateMulti();
    saveState();
});

// 离开输入框时把输入的数字整理成标准格式，例如 1234.5 → 1,234.50
list.addEventListener('focusout', e => {
    const input = e.target.closest('.multi-input');
    if (!input || input.dataset.code !== state.multi.code) return;
    const amount = parseAmount(input.value);
    if (amount != null && !Number.isNaN(amount)) {
        input.value = formatAmount(amount, input.dataset.code);
        state.multi.text = input.value;
        saveState();
    }
});

list.addEventListener('click', e => {
    const btn = e.target.closest('.remove-btn');
    if (!btn || state.list.length <= 2) return;
    const item = btn.closest('.multi-item');
    const code = item.dataset.code;
    const nextFocus = (item.nextElementSibling || item.previousElementSibling)?.querySelector('.multi-input');
    state.list = state.list.filter(c => c !== code);
    if (state.multi.code === code) state.multi = { code: null, text: '' };
    item.remove();
    nextFocus?.focus();
    updateMulti();
    renderAddSelect();
    saveState();
});

addSel.addEventListener('change', () => {
    const code = addSel.value;
    if (!code || state.list.includes(code)) return;
    state.list.push(code);
    const item = createItem(code);
    list.append(item);
    updateMulti();
    renderAddSelect();
    saveState();
    item.querySelector('.multi-input').focus();
});

function syncOrder() {
    state.list = [...list.children].map(li => li.dataset.code);
    updateMulti();
    saveState();
}

/* --- 拖动排序：Pointer Events，鼠标、手指、触控笔通用；只有把手能拖 --- */

list.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || e.button !== 0) return;
    e.preventDefault();

    const item = handle.closest('.multi-item');
    const grabOffset = e.clientY - item.getBoundingClientRect().top;
    handle.setPointerCapture(e.pointerId);
    item.classList.add('is-dragging');

    const onMove = ev => {
        // 手指在哪个条目的上半部分，就插到它前面
        const others = [...list.children].filter(el => el !== item);
        const before = others.find(el => {
            const r = el.getBoundingClientRect();
            return ev.clientY < r.top + r.height / 2;
        }) ?? null;
        // 挪动的是旁边的条目而不是被拖的这一个：被拖元素一旦离开 DOM，浏览器就会丢掉指针捕获，拖动会中断
        if (item.nextElementSibling !== before) {
            if (before === null || item.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING) {
                while (item.nextElementSibling !== before) list.insertBefore(item.nextElementSibling, item);
            } else {
                while (item.nextElementSibling !== before) list.insertBefore(item.previousElementSibling, item.nextElementSibling);
            }
        }

        item.style.transform = 'none';
        const naturalTop = item.getBoundingClientRect().top;
        item.style.transform = `translateY(${ev.clientY - grabOffset - naturalTop}px)`;
    };

    const onEnd = () => {
        handle.removeEventListener('pointermove', onMove);
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.removeEventListener(type, onEnd);
        item.classList.remove('is-dragging');
        item.style.transform = '';
        syncOrder();
    };

    handle.addEventListener('pointermove', onMove);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(type, onEnd);
});

/* --- 键盘排序：聚焦把手后按 ↑ ↓ --- */

list.addEventListener('keydown', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const item = handle.closest('.multi-item');
    if (e.key === 'ArrowUp' && item.previousElementSibling) list.insertBefore(item, item.previousElementSibling);
    else if (e.key === 'ArrowDown' && item.nextElementSibling) list.insertBefore(item.nextElementSibling, item);
    else return;
    handle.focus();
    syncOrder();
});

/* ==========================================================================
   标签页
   ========================================================================== */

const tabs = [...document.querySelectorAll('[role="tab"]')];
// 宽屏时两个工具并排显示，标签栏隐藏（见 CSS），此时面板不再是标签页
const wide = window.matchMedia('(min-width: 960px)');

function selectTab(name, { focus = false } = {}) {
    state.tab = name === 'multi' ? 'multi' : 'calc';
    for (const tab of tabs) {
        const selected = tab.id === `tab-${state.tab}`;
        const panel = $(tab.getAttribute('aria-controls'));
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panel.hidden = !selected && !wide.matches;
        if (wide.matches) panel.removeAttribute('role');
        else panel.setAttribute('role', 'tabpanel');
        if (selected && focus) tab.focus();
    }
    saveState();
}

wide.addEventListener('change', () => {
    selectTab(state.tab);
    drawGuilloche();
});

tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab.id.replace('tab-', '')));
    tab.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        selectTab(next.id.replace('tab-', ''), { focus: true });
    });
});

/* ==========================================================================
   数据加载与状态栏
   ========================================================================== */

const statusBar = $('status');
const statusText = $('statusText');
const refreshBtn = $('refreshBtn');
const timeFormat = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

$('attribution').hidden = !SHOW_ATTRIBUTION;

const ERROR_TEXT = {
    'rate-limited': '请求太频繁，请过一会儿再试',
    'invalid-key': 'API Key 无效',
    'quota-reached': '本月请求次数已用完'
};

function setStatus(text, isError = false) {
    statusText.textContent = text;
    statusBar.classList.toggle('is-error', isError);
}

function renderAll() {
    renderSelects();
    renderCalc();
    renderMultiList();
}

let loading = false;
async function refresh({ force = false } = {}) {
    if (loading) return;
    loading = true;
    refreshBtn.disabled = true;
    refreshBtn.classList.add('is-loading');
    if (!snapshot) setStatus('正在获取汇率…');

    try {
        const { snapshot: next, fetched } = await loadRates({ force });
        const firstData = !snapshot;
        snapshot = next;
        if (fetched || firstData) renderAll();
        setStatus(force && !fetched
            ? `已是最新，下次更新约 ${timeFormat.format(snapshot.nextUpdateAt)}`
            : `汇率更新于 ${timeFormat.format(snapshot.updatedAt)}`);
    } catch (err) {
        console.error('[rates]', err);
        const reason = ERROR_TEXT[err.message];
        if (snapshot) {
            setStatus(`${reason || '暂时连不上汇率服务'}，正在使用 ${timeFormat.format(snapshot.updatedAt)} 的数据`);
        } else {
            setStatus(`${reason || '无法获取汇率'}，请检查网络后点右侧按钮重试`, true);
        }
    } finally {
        loading = false;
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('is-loading');
    }
}

refreshBtn.addEventListener('click', () => refresh({ force: true }));

// 网页放在后台很久再切回来时，到了更新时间就自动更新
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isDue(snapshot)) refresh();
});

/* ==========================================================================
   汇率票据背后的防伪花纹（guilloche）：纯装饰，静态绘制
   ========================================================================== */

const guilloche = $('guilloche');

function drawGuilloche() {
    const ctx = guilloche.getContext('2d');
    const { width: w, height: h } = guilloche.getBoundingClientRect();
    if (!ctx || !w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    guilloche.width = Math.round(w * dpr);
    guilloche.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--note').trim() || '#1d5a47';
    ctx.lineWidth = 0.7;

    // 右侧的玫瑰花纹：一圈圈带相位差的波浪环叠在一起，形成钞票上的干涉纹理
    const cx = w - Math.min(h * 0.55, w * 0.18);
    const cy = h / 2;
    const rings = 16;
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < rings; i++) {
        const base = h * 0.12 + i * h * 0.035;
        ctx.beginPath();
        for (let s = 0; s <= 360; s++) {
            const t = (s / 360) * Math.PI * 2;
            const r = base + h * 0.06 * Math.sin(12 * t + i * 0.45) + h * 0.025 * Math.sin(5 * t - i * 0.3);
            const x = cx + r * Math.cos(t);
            const y = cy + r * Math.sin(t);
            s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // 底部的细波浪线带
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 7; i++) {
        const y0 = h - 10 - i * 3.2;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) {
            const y = y0 + 2.6 * Math.sin(x / 9 + i * 0.7) + 1.4 * Math.sin(x / 23 - i);
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
}

if ('ResizeObserver' in window) new ResizeObserver(drawGuilloche).observe(guilloche);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawGuilloche);

/* ==========================================================================
   启动：先用缓存立刻显示，再在后台检查更新
   ========================================================================== */

renderAll();
selectTab(state.tab);
if (snapshot) setStatus(`汇率更新于 ${timeFormat.format(snapshot.updatedAt)}`);
refresh();
