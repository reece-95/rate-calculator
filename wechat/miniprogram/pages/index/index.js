const { DEFAULTS, COMMON } = require('../../config.js');
const { cachedRates, loadRates, isDue, crossRate } = require('../../utils/rates.js');
const { currencyName, currencyFlag, fractionDigits, formatAmount, formatRate, parseAmount } = require('../../utils/currency.js');
const { applyKey, displayText, toRaw } = require('../../utils/keypad.js');

const RATE_DECIMALS = 6;
const KB_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'];

const STATE_KEY = 'gch-state-v1';

/* 可选币种：常用的排前面，其余按代码排序 */
function orderCodes(codes) {
    const set = {};
    codes.forEach(c => { set[c] = true; });
    const common = COMMON.filter(c => set[c]);
    const others = codes.filter(c => COMMON.indexOf(c) === -1).sort();
    return common.concat(others);
}

function label(code) {
    const flag = currencyFlag(code);
    return `${flag ? flag + ' ' : ''}${code}  ${currencyName(code)}`;
}

function info(code) {
    return { code, flag: currencyFlag(code), name: currencyName(code) };
}

function pad(n) {
    return n < 10 ? '0' + n : String(n);
}

function formatTime(ms) {
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ERROR_TEXT = {
    'network-error': '网络连接失败',
    'quota-reached': '今天的汇率查询次数已用完',
    'rate-limited': '请求太频繁',
    'maintenance': '汇率服务维护中',
    'invalid-key': '汇率服务的 Key 无效'
};

Page({
    data: {
        tab: 'calc',
        loading: false,
        statusText: '正在获取汇率…',
        statusError: false,

        pickerLabels: [],
        baseIndex: 0,
        targetIndex: 0,
        base: info(DEFAULTS.base),
        target: info(DEFAULTS.target),
        flipped: false,

        rateText: '—',
        inverseText: '',
        amountText: '',
        targetRateText: '',
        targetPlaceholder: '你期望的汇率',
        amountInvalid: false,
        rateInvalid: false,
        calcError: '',
        result: { show: false },

        editing: false,
        list: [],
        addLabels: [],

        // 自带数字键盘：field 是 'amount'、'rate' 或 'm:币种代码'
        kb: { show: false, field: '', title: '', action: '完成' },
        kbDigits: KB_DIGITS
    },

    /* ---------------- 生命周期 ---------------- */

    onLoad() {
        // 不放进 data 的内部状态
        this.snapshot = cachedRates();
        this.codes = [];
        this.addCodes = [];
        this.state = {
            tab: 'calc',
            base: DEFAULTS.base,
            target: DEFAULTS.target,
            amount: '',
            targetRate: '',
            list: DEFAULTS.list.slice(),
            multi: { code: null, text: '' }
        };
        try {
            const saved = wx.getStorageSync(STATE_KEY);
            if (saved && typeof saved === 'object') Object.assign(this.state, saved);
        } catch (e) { /* 第一次打开 */ }
        // 输入框只保存原始数字文本，旧版本存的 "1,234.50" 在这里统一转换
        this.state.amount = toRaw(this.state.amount);
        this.state.targetRate = toRaw(this.state.targetRate);
        this.state.multi = { code: this.state.multi && this.state.multi.code, text: toRaw(this.state.multi && this.state.multi.text) };

        this.setData({ tab: this.state.tab });
        this.renderAll();
        if (this.snapshot) this.setStatus(`汇率更新于 ${formatTime(this.snapshot.updatedAt)}`);
        this.refresh();

        this.onTheme = () => this.drawGuilloche();
        if (wx.onThemeChange) wx.onThemeChange(this.onTheme);
        wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    },

    onReady() {
        this.drawGuilloche();
    },

    onShow() {
        // 从后台切回来时，到了更新时间就自动更新
        if (this.snapshot && isDue(this.snapshot)) this.refresh();
    },

    onUnload() {
        if (wx.offThemeChange && this.onTheme) wx.offThemeChange(this.onTheme);
    },

    onPullDownRefresh() {
        this.refresh({ force: true }).then(() => wx.stopPullDownRefresh());
    },

    onShareAppMessage() {
        return { title: this.shareTitle(), path: '/pages/index/index' };
    },

    onShareTimeline() {
        return { title: this.shareTitle() };
    },

    shareTitle() {
        const { base, target } = this.state;
        const rate = crossRate(this.rates(), base, target);
        return rate == null ? '汇率换算' : `1 ${base} = ${formatRate(rate)} ${target}，点开换算`;
    },

    /* ---------------- 状态与数据 ---------------- */

    rates() {
        return this.snapshot ? this.snapshot.rates : null;
    },

    availableCodes() {
        const r = this.rates();
        if (r) return Object.keys(r);
        return COMMON.concat(DEFAULTS.list.filter(c => COMMON.indexOf(c) === -1));
    },

    saveState() {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            try { wx.setStorageSync(STATE_KEY, this.state); } catch (e) { /* ignore */ }
        }, 200);
    },

    setStatus(text, isError) {
        this.setData({ statusText: text, statusError: Boolean(isError) });
    },

    refresh(options) {
        const force = Boolean(options && options.force);
        if (this.loading) return Promise.resolve();
        this.loading = true;
        this.setData({ loading: true });
        if (!this.snapshot) this.setStatus('正在获取汇率…');

        return loadRates({ force }).then(({ snapshot, fetched }) => {
            const first = !this.snapshot;
            this.snapshot = snapshot;
            if (fetched || first) this.renderAll();
            this.setStatus(force && !fetched
                ? `刚刚已更新过，1 小时后可再刷新`
                : `汇率更新于 ${formatTime(snapshot.updatedAt)}`);
        }).catch(err => {
            console.error('[rates]', err);
            const reason = ERROR_TEXT[err && err.message];
            if (this.snapshot) {
                this.setStatus(`${reason || '暂时连不上汇率服务'}，正在使用 ${formatTime(this.snapshot.updatedAt)} 的数据`);
            } else {
                this.setStatus(`${reason || '无法获取汇率'}，请检查网络后下拉刷新`, true);
            }
        }).then(() => {
            this.loading = false;
            this.setData({ loading: false });
        });
    },

    renderAll() {
        this.renderPickers();
        this.renderCalc();
        this.renderList();
    },

    /* ---------------- 币种选择 ---------------- */

    renderPickers() {
        const available = this.availableCodes();
        const s = this.state;
        if (available.indexOf(s.base) === -1) s.base = DEFAULTS.base;
        if (available.indexOf(s.target) === -1) s.target = DEFAULTS.target;
        this.codes = orderCodes(available);
        this.setData({
            pickerLabels: this.codes.map(label),
            baseIndex: Math.max(0, this.codes.indexOf(s.base)),
            targetIndex: Math.max(0, this.codes.indexOf(s.target))
        });
        this.renderAddPicker();
    },

    renderAddPicker() {
        this.addCodes = orderCodes(this.availableCodes().filter(c => this.state.list.indexOf(c) === -1));
        this.setData({ addLabels: this.addCodes.map(label) });
    },

    onBaseChange(e) {
        this.state.base = this.codes[Number(e.detail.value)];
        this.setData({ baseIndex: Number(e.detail.value) });
        this.renderCalc();
        this.saveState();
    },

    onTargetChange(e) {
        this.state.target = this.codes[Number(e.detail.value)];
        this.setData({ targetIndex: Number(e.detail.value) });
        this.renderCalc();
        this.saveState();
    },

    onSwap() {
        const s = this.state;
        const tmp = s.base;
        s.base = s.target;
        s.target = tmp;
        // 目标汇率换成反方向：1 NZD = 4.10 CNY → 1 CNY = 0.243902 NZD
        const tr = parseAmount(s.targetRate);
        if (tr) s.targetRate = formatRate(1 / tr).replace(/,/g, '');
        // 持有币种变了，金额允许的小数位可能跟着变（例如换成日元不能有小数）
        s.amount = this.trimDecimals(s.amount, fractionDigits(s.base));
        this.setData({
            flipped: !this.data.flipped,
            baseIndex: Math.max(0, this.codes.indexOf(s.base)),
            targetIndex: Math.max(0, this.codes.indexOf(s.target))
        });
        this.renderCalc();
        this.saveState();
    },

    /* ---------------- 工具 1：汇率差计算 ---------------- */

    renderCalc() {
        const s = this.state;
        const rate = crossRate(this.rates(), s.base, s.target);
        const amount = parseAmount(s.amount);
        const targetRate = parseAmount(s.targetRate);
        const amountInvalid = Number.isNaN(amount);
        const rateInvalid = Number.isNaN(targetRate);

        const patch = {
            amountText: displayText(s.amount),
            targetRateText: displayText(s.targetRate),
            base: info(s.base),
            target: info(s.target),
            rateText: rate == null ? '—' : formatRate(rate),
            inverseText: rate == null ? '' : `1 ${s.target} = ${formatRate(1 / rate)} ${s.base}`,
            targetPlaceholder: rate == null ? '你期望的汇率' : `例如 ${formatRate(rate)}`,
            amountInvalid,
            rateInvalid,
            calcError: amountInvalid || rateInvalid ? '请输入大于 0 的数字，例如 1000 或 4.25' : '',
            result: { show: false }
        };

        // 输入到一半（例如 "0."）时不算错，只是先不显示结果
        if (rate != null && amount > 0 && targetRate > 0 && !amountInvalid && !rateInvalid) {
            // 汇率始终用完整精度计算，显示时才四舍五入
            const nowTotal = amount * rate;
            const targetTotal = amount * targetRate;
            const diff = nowTotal - targetTotal;
            const diffText = formatAmount(Math.abs(diff), s.target);
            const isZero = Number(diffText.replace(/,/g, '')) === 0;
            const pct = targetTotal ? Math.abs(diff / targetTotal) * 100 : 0;
            patch.result = {
                show: true,
                now: `${formatAmount(nowTotal, s.target)} ${s.target}`,
                target: `${formatAmount(targetTotal, s.target)} ${s.target}`,
                tone: isZero ? '' : diff > 0 ? 'is-up' : 'is-down',
                label: isZero ? '与目标持平' : diff > 0 ? '现在换比目标多得' : '现在换比目标少得',
                diff: isZero ? `0 ${s.target}` : `${diff > 0 ? '+' : '−'}${diffText} ${s.target}`,
                pct: isZero ? '' : `相差 ${pct.toFixed(2)}%`
            };
        }
        this.setData(patch);
    },

    onUseRate() {
        const rate = crossRate(this.rates(), this.state.base, this.state.target);
        if (rate == null) return;
        this.state.targetRate = formatRate(rate).replace(/,/g, '');
        this.renderCalc();
        this.saveState();
    },

    /* ---------------- 工具 2：全币种换算 ---------------- */

    renderList() {
        const available = this.availableCodes();
        this.state.list = this.state.list.filter(c => available.indexOf(c) !== -1);
        this.updateList();
        this.renderAddPicker();
    },

    /** 根据用户输入的那一行算出其他行；占位提示是第一行币种 100 单位的等值 */
    updateList() {
        const r = this.rates();
        const s = this.state;
        const first = s.list[0];
        const src = s.multi.code && s.list.indexOf(s.multi.code) !== -1 ? s.multi.code : null;
        const srcAmount = src ? parseAmount(s.multi.text) : null;
        const valid = srcAmount != null && !Number.isNaN(srcAmount);

        const activeCode = this.data.kb.field.indexOf('m:') === 0 ? this.data.kb.field.slice(2) : null;
        const list = s.list.map(code => {
            const hint = crossRate(r, first, code);
            const item = Object.assign(info(code), {
                placeholder: hint == null ? '' : formatAmount(100 * hint, code),
                value: '',
                active: code === activeCode
            });
            if (code === src) {
                item.value = displayText(s.multi.text);
            } else if (valid) {
                const rate = crossRate(r, src, code);
                item.value = rate == null ? '' : formatAmount(srcAmount * rate, code);
            }
            return item;
        });
        this.setData({ list });
    },

    onToggleEdit() {
        this.closeKeypad();
        this.setData({ editing: !this.data.editing });
    },

    onMove(e) {
        const index = Number(e.currentTarget.dataset.index);
        const to = index + Number(e.currentTarget.dataset.dir);
        const list = this.state.list;
        if (to < 0 || to >= list.length) return;
        const moved = list.splice(index, 1)[0];
        list.splice(to, 0, moved);
        this.updateList();
        this.saveState();
    },

    onRemove(e) {
        const code = e.currentTarget.dataset.code;
        if (this.state.list.length <= 2) return;
        this.state.list = this.state.list.filter(c => c !== code);
        if (this.state.multi.code === code) this.state.multi = { code: null, text: '' };
        this.updateList();
        this.renderAddPicker();
        this.saveState();
    },

    onAdd(e) {
        const code = this.addCodes[Number(e.detail.value)];
        if (!code || this.state.list.indexOf(code) !== -1) return;
        this.state.list.push(code);
        this.updateList();
        this.renderAddPicker();
        this.saveState();
        wx.showToast({ title: `已添加 ${code}`, icon: 'none' });
    },

    /* ---------------- 标签页 ---------------- */

    onTab(e) {
        const tab = e.currentTarget.dataset.tab === 'multi' ? 'multi' : 'calc';
        if (tab === this.data.tab) return;
        this.state.tab = tab;
        this.closeKeypad();
        this.setData({ tab, editing: false }, () => {
            if (tab === 'calc') this.drawGuilloche();
        });
        this.saveState();
    },

    onRefresh() {
        this.refresh({ force: true });
    },

    /* ---------------- 自带数字键盘 ---------------- */

    /** 去掉超出允许位数的小数，例如换成日元时 "12.5" → "12" */
    trimDecimals(text, maxDecimals) {
        const dot = text.indexOf('.');
        if (dot === -1) return text;
        return maxDecimals > 0 ? text.slice(0, dot + 1 + maxDecimals) : text.slice(0, dot);
    },

    /** 当前字段的原始文本、允许的小数位和标题 */
    fieldInfo(field) {
        const s = this.state;
        if (field === 'amount') return { text: s.amount, decimals: fractionDigits(s.base), title: `兑换金额 · ${s.base}` };
        if (field === 'rate') return { text: s.targetRate, decimals: RATE_DECIMALS, title: `目标汇率 · 1 ${s.base} = ? ${s.target}` };
        const code = field.slice(2);
        return { text: s.multi.code === code ? s.multi.text : '', decimals: fractionDigits(code), title: `${code} ${currencyName(code)}` };
    },

    openField(field) {
        const fi = this.fieldInfo(field);
        // 全币种页：点另一行时，从这一行重新开始输入
        if (field.indexOf('m:') === 0 && this.state.multi.code !== field.slice(2)) {
            this.state.multi = { code: field.slice(2), text: '' };
        }
        this.setData({
            kb: { show: true, field, title: fi.title, action: field === 'amount' ? '下一项' : '完成' }
        }, () => {
            if (field.indexOf('m:') === 0) this.updateList();
            // 把正在输入的框滚到屏幕上方，让下面的结果露在键盘上面
            const selector = field === 'amount' ? '#f-amount' : field === 'rate' ? '#f-rate' : `#m-${field.slice(2)}`;
            wx.pageScrollTo({ selector, offsetTop: -16, duration: 200 });
        });
    },

    closeKeypad() {
        if (!this.data.kb.show) return;
        const field = this.data.kb.field;
        // 全币种页：收起时把金额补齐小数位，例如 1234.5 → 1234.50
        if (field.indexOf('m:') === 0 && this.state.multi.code === field.slice(2)) {
            const amount = parseAmount(this.state.multi.text);
            if (amount != null && !Number.isNaN(amount)) {
                this.state.multi.text = formatAmount(amount, field.slice(2)).replace(/,/g, '');
            }
        }
        this.setData({ kb: Object.assign({}, this.data.kb, { show: false, field: '' }) }, () => {
            this.updateList();
            this.saveState();
        });
    },

    onFieldTap(e) {
        const ds = e.currentTarget.dataset;
        const field = ds.field || `m:${ds.code}`;
        if (field === this.data.kb.field) return;
        this.openField(field);
    },

    onKey(e) {
        const field = this.data.kb.field;
        if (!field) return;
        const fi = this.fieldInfo(field);
        const next = applyKey(fi.text, e.currentTarget.dataset.key, fi.decimals);
        try { wx.vibrateShort({ type: 'light' }); } catch (err) { /* 部分机型不支持 */ }
        if (next === fi.text) return;

        if (field === 'amount') {
            this.state.amount = next;
            this.renderCalc();
        } else if (field === 'rate') {
            this.state.targetRate = next;
            this.renderCalc();
        } else {
            this.state.multi = { code: field.slice(2), text: next };
            this.updateList();
        }
        this.saveState();
    },

    onKbAction() {
        if (this.data.kb.field === 'amount') this.openField('rate');
        else this.closeKeypad();
    },

    onKbHide() {
        this.closeKeypad();
    },

    onKbNoop() {},

    // 点页面空白处也收起键盘
    onBlankTap() {
        this.closeKeypad();
    },

    /* ---------------- 汇率票据背后的防伪花纹 ---------------- */

    drawGuilloche() {
        wx.createSelectorQuery().in(this)
            .select('#guilloche')
            .fields({ node: true, size: true })
            .exec(res => {
                const hit = res && res[0];
                if (!hit || !hit.node || !hit.width || !hit.height) return;
                const canvas = hit.node;
                const ctx = canvas.getContext('2d');
                const w = hit.width;
                const h = hit.height;
                const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
                const dpr = info.pixelRatio || 2;
                canvas.width = Math.round(w * dpr);
                canvas.height = Math.round(h * dpr);
                ctx.scale(dpr, dpr);
                ctx.clearRect(0, 0, w, h);

                const base = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
                ctx.strokeStyle = base.theme === 'dark' ? '#86c9ab' : '#1d5a47';
                ctx.lineWidth = 0.7;

                // 右侧玫瑰花纹：一圈圈带相位差的波浪环叠在一起
                const cx = w - Math.min(h * 0.55, w * 0.18);
                const cy = h / 2;
                ctx.globalAlpha = 0.22;
                for (let i = 0; i < 16; i++) {
                    const r0 = h * 0.12 + i * h * 0.035;
                    ctx.beginPath();
                    for (let s = 0; s <= 360; s++) {
                        const t = (s / 360) * Math.PI * 2;
                        const r = r0 + h * 0.06 * Math.sin(12 * t + i * 0.45) + h * 0.025 * Math.sin(5 * t - i * 0.3);
                        const x = cx + r * Math.cos(t);
                        const y = cy + r * Math.sin(t);
                        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                }

                // 底部细波浪线带
                ctx.globalAlpha = 0.14;
                for (let i = 0; i < 7; i++) {
                    const y0 = h - 10 - i * 3.2;
                    ctx.beginPath();
                    for (let x = 0; x <= w; x += 4) {
                        const y = y0 + 2.6 * Math.sin(x / 9 + i * 0.7) + 1.4 * Math.sin(x / 23 - i);
                        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                }
            });
    }
});
