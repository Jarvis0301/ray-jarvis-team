// ==========================================================================
// 全域日期時間處理核心 (AppDate - 支援 YYYY / YYYY-MM / YYYYMM / YYYY-MM-DD 多階精度)
// 職責：解耦 Google 試算表 (斜線/緊湊碼)、HTML5 原生表單 (連字號) 與單據業務編碼
// ==========================================================================
const AppDate = (function () {
    'use strict';

    // 業績日曆記憶體快取陣列
    let _perfCalendars = [];

    /**
     * 動態精度解析器：自適應解析純年 (YYYY)、年月 (YYYY-MM, YYYY/MM, YYYYMM) 與年月日
     * @returns {Object|null} { year, month, day, precision: 'Y'|'M'|'D' }
     */
    function parseParts(val) {
        if (!val || val === '-' || val === '未填寫' || val === 'NULL') return null;

        // 若傳入原生 Date 物件
        if (val instanceof Date && !isNaN(val.getTime())) {
            return {
                year: String(val.getFullYear()),
                month: String(val.getMonth() + 1).padStart(2, '0'),
                day: String(val.getDate()).padStart(2, '0'),
                precision: 'D'
            };
        }

        // 截除時間戳記 (例如 2026-09-13 10:00:00 -> 2026-09-13)
        const cleanStr = String(val).trim().replace(/[上下]午.*$/, '').split(' ')[0].split('T')[0];

        // 1. 純數字緊湊格式判定
        if (/^\d{4}$/.test(cleanStr)) {
            // 純年份：2026
            return {
                year: cleanStr,
                month: null,
                day: null,
                precision: 'Y'
            };
        }
        if (/^\d{6}$/.test(cleanStr)) {
            // 緊湊年月：202608 (如 org_monthly_perfs 週期代碼)
            return {
                year: cleanStr.substring(0, 4),
                month: cleanStr.substring(4, 6),
                day: null,
                precision: 'M'
            };
        }
        if (/^\d{8}$/.test(cleanStr)) {
            // 緊湊年月日：20260901 (如 ALT/ADJ 單號中段)
            return {
                year: cleanStr.substring(0, 4),
                month: cleanStr.substring(4, 6),
                day: cleanStr.substring(6, 8),
                precision: 'D'
            };
        }

        // 2. 分隔符標準化清洗 (相容 /、-、. 以及 中文年月日)
        const normalized = cleanStr.replace(/[\/\.年月]/g, '-').replace(/日/g, '');
        const parts = normalized.split('-').filter(Boolean);

        if (parts.length === 1) {
            const y = parseInt(parts[0], 10);
            if (!isNaN(y) && y >= 1900 && y <= 2100) {
                return {
                    year: String(y).padStart(4, '0'),
                    month: null,
                    day: null,
                    precision: 'Y'
                };
            }
        } else if (parts.length === 2) {
            // 年月維度：2026-08 或 2026/8
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
                return {
                    year: String(y).padStart(4, '0'),
                    month: String(m).padStart(2, '0'),
                    day: null,
                    precision: 'M'
                };
            }
        } else if (parts.length >= 3) {
            // 年月日完整維度：2026-09-13 或 2026/9/1
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                return {
                    year: String(y).padStart(4, '0'),
                    month: String(m).padStart(2, '0'),
                    day: String(d).padStart(2, '0'),
                    precision: 'D'
                };
            }
        }

        return null;
    }

    return {
        /**
         * 取得內部解析結構 (供進階比對或條件分支判定)
         */
        parse: parseParts,

        /**
         * 轉換為 HTML5 原生 <input type="date"> 格式 (YYYY-MM-DD)
         * 若來源僅為月或年，自動補齊至該區間首日 (01)，防止表單回顯空白
         */
        toInput: function (val) {
            const p = parseParts(val);
            if (!p) return '';
            if (p.precision === 'Y') return `${p.year}-01-01`;
            if (p.precision === 'M') return `${p.year}-${p.month}-01`;
            return `${p.year}-${p.month}-${p.day}`;
        },

        /**
         * 轉換為 HTML5 原生 <input type="month"> 格式 (YYYY-MM)
         * 支援 YYYYMM (202608) 或完整日期自動截取至月份
         */
        toInputMonth: function (val) {
            const p = parseParts(val);
            if (!p) return '';
            if (p.precision === 'Y') return `${p.year}-01`;
            return `${p.year}-${p.month}`;
        },

        /**
         * 轉換為 Google 試算表寫入專用格式
         * 依據資料原始精度輸出對應格式 (年->YYYY、月->YYYY/MM、日->YYYY/MM/DD)
         */
        toSheet: function (val, fallback = '') {
            const p = parseParts(val);
            if (!p) return fallback;
            if (p.precision === 'Y') return p.year;
            if (p.precision === 'M') return `${p.year}/${p.month}`;
            return `${p.year}/${p.month}/${p.day}`;
        },

        /**
         * 人因介面顯示格式化 (配合人類閱讀習慣)
         * 保留原始精度呈現：YYYY、YYYY/MM、YYYY/MM/DD
         */
        toDisplay: function (val, fallback = '-') {
            const p = parseParts(val);
            if (!p) return fallback;
            if (p.precision === 'Y') return p.year;
            if (p.precision === 'M') return `${p.year}/${p.month}`;
            return `${p.year}/${p.month}/${p.day}`;
        },

        /**
         * 提取純年份 (YYYY)
         */
        toYear: function (val, fallback = '') {
            const p = parseParts(val);
            return p ? p.year : fallback;
        },

        /**
         * 統一提取年月維度字串
         * @param {string} separator 分隔符號，預設為 '/' (如 '2026/08')，亦可指定 '-' (如 '2026-08')
         */
        toYearMonth: function (val, separator = '/', fallback = '-') {
            const p = parseParts(val);
            if (!p) return fallback;
            const m = p.month || '01';
            return `${p.year}${separator}${m}`;
        },

        /**
         * 提取緊湊 6 碼年月 (YYYYMM)
         * 專供獎金結算期別、月度業績週期代碼 (如 202608)
         */
        toClean6: function (val) {
            const p = parseParts(val);
            if (p) {
                const m = p.month || '01';
                return `${p.year}${m}`;
            }
            const d = new Date();
            const y = String(d.getFullYear());
            const m = String(d.getMonth() + 1).padStart(2, '0');
            return `${y}${m}`;
        },

        /**
         * 提取緊湊 8 碼年月日 (YYYYMMDD)
         * 專供 17 碼業務單號生成 (如 ALT-20260901-0001, ADJ-20260815-0001)
         */
        toClean8: function (val) {
            const p = parseParts(val);
            if (p) {
                const m = p.month || '01';
                const d = p.day || '01';
                return `${p.year}${m}${d}`;
            }
            const d = new Date();
            const y = String(d.getFullYear());
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}${m}${day}`;
        },

        /**
         * 轉換為 Unix 毫秒時間戳記 (Timestamp)
         * 專供 Chart.js 趨勢圖 (如晉升折線圖) 橫軸定位與歷史排序
         */
        toTimestamp: function (val) {
            const p = parseParts(val);
            if (!p) return 0;
            const y = parseInt(p.year, 10);
            const m = p.month ? parseInt(p.month, 10) - 1 : 0;
            const d = p.day ? parseInt(p.day, 10) : 1;
            return new Date(y, m, d).getTime();
        },

        /**
         * 取得當前系統時間
         * @param {'sheet'|'display'|'input'|'year'|'month'|'clean6'|'clean8'|'full'} format 
         */
        now: function (format = 'sheet') {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');

            switch (format) {
                case 'sheet':
                case 'display':
                    return `${y}/${m}/${day}`;
                case 'input':
                    return `${y}-${m}-${day}`;
                case 'year':
                    return `${y}`;
                case 'month':
                    return `${y}-${m}`;
                case 'clean6':
                    return `${y}${m}`;
                case 'clean8':
                    return `${y}${m}${day}`;
                case 'full':
                    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
                default:
                    return `${y}/${m}/${day}`;
            }
        },

        /**
         * DataTable.js 欄位自適應渲染器
         * 排序時依精度補齊為標準 ISO 格式以確保字典序正確，展示時維持人類習慣斜線
         */
        dtRender: function (data, type) {
            if (!data) return '-';
            const p = parseParts(data);
            if (!p) return String(data);

            if (type === 'sort' || type === 'type') {
                if (p.precision === 'Y') return p.year;
                if (p.precision === 'M') return `${p.year}-${p.month}`;
                return `${p.year}-${p.month}-${p.day}`;
            }
            return AppDate.toDisplay(data);
        },

        /**
         * 注入並快取業績日曆資料（由資料抓取腳本於 App 啟動時呼叫一次）
         * @param {Array<Object>} calendarList 表 709 之日曆列物件陣列
         */
        initPerfCalendars: function (calendarList) {
            _perfCalendars = Array.isArray(calendarList) ? calendarList : [];
        },

        /**
         * 推導單據實質業績月份 (YYYY-MM)
         * @param {string|Date} dateVal 下單日期
         * @param {string} [timeVal] 下單時間 (HH:mm:ss)
         * @param {boolean} [isSupplementAllowed=false] 是否具備補業績核准資格 (珍珠級以上且已填報備表)
         * @returns {string} 實質業績月份 (YYYY-MM)
         */
        resolvePerfMonth: function (dateVal, timeVal, isSupplementAllowed = false) {
            const inputDate = this.toInput(dateVal);
            if (!inputDate) return this.toYearMonth(dateVal, '-');
            if (!_perfCalendars || _perfCalendars.length === 0) {
                return this.toYearMonth(inputDate, '-');
            }

            const timeStr = (timeVal && /^\d{2}:\d{2}/.test(timeVal.trim())) ? timeVal.trim() : '12:00:00';
            const targetTs = new Date(`${inputDate}T${timeStr}`).getTime();

            for (let i = 0; i < _perfCalendars.length; i++) {
                const row = _perfCalendars[i];
                if (!row.period_start_at || !row.closing_cutoff_at || !row.supp_cutoff_at) continue;

                const startTs = new Date(row.period_start_at.replace(/\//g, '-').replace(' ', 'T')).getTime();
                const closeTs = new Date(row.closing_cutoff_at.replace(/\//g, '-').replace(' ', 'T')).getTime();
                const suppTs  = new Date(row.supp_cutoff_at.replace(/\//g, '-').replace(' ', 'T')).getTime();

                // 1. 常態收單期間內：一律計入當月
                if (targetTs >= startTs && targetTs <= closeTs) {
                    return row.calc_month;
                }

                // 2. 落在補業績窗口內 (結業績日 20:00:01 ~ 補業績日 20:00:00)
                if (targetTs > closeTs && targetTs <= suppTs) {
                    // 僅有資格符合者能算當月，其餘一律推入次月
                    return isSupplementAllowed ? row.calc_month : this._getNextMonth(row.calc_month);
                }
            }

            return this.toYearMonth(inputDate, '-');
        },

        /**
         * 取得指定月份（或當前營運中月份）的日曆排程明細
         * @param {string} [calcMonth] 指定月份 (如 '2026-09')，未傳則自動推導今日
         */
        getPerfCalendar: function (calcMonth) {
            const targetMonth = calcMonth || this.resolvePerfMonth(this.now('input'));
            return _perfCalendars.find(row => row.calc_month === targetMonth) || null;
        },

        /**
         * 取得次月 YYYY-MM
         */
        _getNextMonth: function(ymStr) {
            const parts = ymStr.split('-');
            let y = parseInt(parts[0], 10);
            let m = parseInt(parts[1], 10);
            m++;
            if (m > 12) {
                y++;
                m = 1;
            }
            return `${y}-${String(m).padStart(2, '0')}`;
        },

        /**
         * 精準計算實歲年齡 (支援身故日期凍結與 YYYY / YYYY-MM / YYYY-MM-DD 多階精度)
         * @param {string|Date} val 生日字串或 Date 物件
         * @param {string|Date} [deceasedVal=null] 身故日期字串或 Date 物件 (若有填則以身故日為終點結算享年)
         * @returns {number|null} 實歲數值 (異常或未填時回傳 null)
         */
        calculateAge: function (val, deceasedVal = null) {
            const p = parseParts(val);
            if (!p || !p.year) return null;

            const birthYear = parseInt(p.year, 10);
            if (isNaN(birthYear) || birthYear < 1900) return null;

            // 1. 決定基準終點：若有身故日期則以身故日為準，否則以當前時間為準
            const pEnd = deceasedVal ? parseParts(deceasedVal) : null;
            let endYear, endMonth, endDay, endPrecision;

            if (pEnd && pEnd.year) {
                endYear = parseInt(pEnd.year, 10);
                endMonth = pEnd.month ? parseInt(pEnd.month, 10) : null;
                endDay = pEnd.day ? parseInt(pEnd.day, 10) : null;
                endPrecision = pEnd.precision;
            } else {
                const now = new Date();
                endYear = now.getFullYear();
                endMonth = now.getMonth() + 1;
                endDay = now.getDate();
                endPrecision = 'D';
            }

            if (isNaN(endYear) || birthYear > endYear) return null;

            let age = endYear - birthYear;

            // 2. 雙方皆具備日精度 (D)：精準判定該年身故日/當前日是否已過生日
            if (p.precision === 'D' && p.month && p.day && endPrecision === 'D' && endMonth && endDay) {
                const birthMonth = parseInt(p.month, 10);
                const birthDay = parseInt(p.day, 10);
                if (endMonth < birthMonth || (endMonth === birthMonth && endDay < birthDay)) {
                    age--;
                }
            // 3. 雙方至少具備月精度 (M)：依月份先後判定
            } else if (p.month && endMonth) {
                const birthMonth = parseInt(p.month, 10);
                if (endMonth < birthMonth) {
                    age--;
                }
            }

            return age >= 0 ? age : null;
        },

        /**
         * 取得年齡展示文字 (身故者自動標示為「享年 X 歲」)
         * @param {string|Date} val 生日字串
         * @param {string|Date} [deceasedVal=null] 身故日期字串
         * @param {string} [fallback=''] 預設替代文字
         * @returns {string}
         */
        toAgeDisplay: function (val, deceasedVal = null, fallback = '') {
            const age = this.calculateAge(val, deceasedVal);
            if (age === null) return fallback;
            return deceasedVal ? `享年 ${age} 歲` : `${age} 歲`;
        }
    };
})();

// 掛載至全域 window 物件
if (typeof window !== 'undefined') {
    window.AppDate = AppDate;
}