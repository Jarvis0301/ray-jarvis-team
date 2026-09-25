/**
 * ============================================================================
 * 榮祥團隊戰術控制台 - Chart.js 全域視覺中樞 (chart-helper.js)
 * 專為榮祥團隊（Ray's Team）量身打造之 10 大戰術圖表產生引擎
 * 支援圖表：
 * 1. createLine (折線圖 / 曲線圖 / 面積圖)
 * 2. createBar (長條圖 / 柱狀圖 / 水平橫條圖)
 * 3. createPie (實心圓餅圖)
 * 4. createDoughnut (甜甜圈環形圖 / 支援中央 KPI 垂直置中)
 * 5. createRadar (多維雷達圖 / 蜘蛛網圖)
 * 6. createPolarArea (極區面積圖)
 * 7. createScatter (笛卡爾卡氏座標散佈圖)
 * 8. createBubble (三維氣泡圖)
 * 9. createBarLineMixed (柱狀 + 折線雙軸複合圖表)
 * 10. createMultiLine (2 條以上多折線趨勢圖)
 * 
 * 核心標準：
 * - 依據團隊規範：字體統一 size: 12，標籤/刻度文字 color: '#f5f3ff'
 * - 折線圖標準：Y 軸間隔整數步長、從 0 開始向上取整至 5 的倍數、無填色、無曲率
 * - 數值與單位：智慧探測貨幣前綴 (NT$ 1,250、RM 30.00) 與計量後綴 (1,200 SV、5 盒)
 * - 實例防禦：自動銷毀既有 Canvas 實例，杜絕 Canvas is already in use 崩潰
 * ============================================================================
 */
const AppChart = {
    // 1. 全域暗黑主題 Token 規範 (相容 UVACO 色彩標準)
    tokens: {
        text: '#f5f3ff',
        textMuted: '#94a3b8',
        grid: 'rgba(255, 255, 255, 0.06)',
        gridActive: 'rgba(139, 92, 246, 0.20)',
        border: 'rgba(255, 255, 255, 0.12)',
        palette: [
            '#8b5cf6', '#38bdf8', '#10b981', '#fbbf24', '#f43f5e',
            '#a855f7', '#06b6d4', '#f97316', '#ec4899', '#34d399',
            '#6366f1', '#eab308', '#14b8a6', '#64748b'
        ]
    },

    // 實例快取管理池 (防止 Canvas 重疊渲染與記憶體洩漏)
    _instances: {},

    /**
     * 核心數值與單位格式化引擎
     * 自動判定貨幣前綴 (如 'NT$ 1,250', 'RM 35.50') 與計量後綴 (如 '1,200 SV', '5 盒', '12 人')
     * 
     * @param {number|string} val - 欲格式化之數值
     * @param {Object} [options={}] - 格式化配置物件
     * @param {string} [options.unit=''] - 單位名稱 (如 'NT$', 'RM', '人', '盒', 'SV', '%')
     * @param {'auto'|'prefix'|'suffix'} [options.unitPosition='auto'] - 單位位置 (預設 auto 自動探測貨幣符號)
     * @param {string} [options.prefix=''] - 強制前綴符號 (如 '+NT$ ')
     * @param {string} [options.suffix=''] - 強制後綴符號
     * @param {number|null} [options.decimals=null] - 強制小數位數 (null 表純千分位整數)
     * @returns {string} 格式化後之字串
     */
    formatValue(val, { unit = '', unitPosition = 'auto', prefix = '', suffix = '', decimals = null } = {}) {
        if (val === undefined || val === null || isNaN(Number(val))) return '-';
        const num = Number(val);

        const formattedNum = decimals !== null
            ? num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
            : num.toLocaleString();

        // 若顯式設定 prefix 或 suffix，優先採用雙向客製化裝飾
        if (prefix || suffix) {
            return `${prefix}${formattedNum}${suffix}`;
        }

        if (!unit) return formattedNum;

        const trimmedUnit = String(unit).trim();

        // 智慧自動探測國際通用貨幣代碼與符號 (NT$、RM、USD、HKD、$、¥、€、£)
        const isPrefix = unitPosition === 'prefix' || (
            unitPosition === 'auto' && /^(NT\$?|RM|USD|HKD|\$|¥|€|£)$/i.test(trimmedUnit)
        );

        if (isPrefix) {
            return `${trimmedUnit} ${formattedNum}`;
        }
        return `${formattedNum} ${trimmedUnit}`;
    },

    /**
     * 輔助工具：安全色彩轉換為 RGBA 格式
     * 解決字串直接相加 (如 ${color}25) 造成 3 碼 Hex 或 rgb() 破圖退化為黑色的問題
     * 
     * @param {string} colorStr - 原始色彩字串 (支援 Hex 3碼/6碼、rgb、rgba)
     * @param {number} [opacity=1] - 透明度數值 (0.0 ~ 1.0)
     * @returns {string} 標準 rgba(...) 字串
     */
    toRgba(colorStr, opacity = 1) {
        if (!colorStr || typeof colorStr !== 'string') return `rgba(139, 92, 246, ${opacity})`;
        const clean = colorStr.trim();
        if (clean.startsWith('rgba') || clean.startsWith('rgb')) return clean;

        let hex = clean.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }
        if (hex.length === 6) {
            const num = parseInt(hex, 16);
            return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${opacity})`;
        }
        return clean;
    },

    /**
     * 輔助工具：動態計算數值陣列上限，並強制向上取整至 5 的倍數 (折線圖規範)
     * 
     * @param {Array<number|Object>} dataArray - 原始數值陣列或具備 {x, y} 物件陣列
     * @param {number} [fallbackMin=5] - 當陣列最大值 <= 0 時的保底上限值
     * @returns {number} 向上取整至 5 的倍數之整數值
     */
    calcCeil5Max(dataArray, fallbackMin = 5) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) return fallbackMin;
        const validNums = dataArray.map(item => {
            if (typeof item === 'object' && item !== null) {
                return Number(item.y !== undefined ? item.y : (item.x !== undefined ? item.x : 0)) || 0;
            }
            return Number(item) || 0;
        });
        const maxVal = Math.max(...validNums, 0);
        if (maxVal <= 0) return fallbackMin;
        return Math.ceil(maxVal / 5) * 5;
    },

    /**
     * 統一實例註冊與銷毀管理器
     * 杜絕 Canvas is already in use 崩潰報錯，實現切換頁籤與快速篩選時的平滑重繪
     * 
     * @param {string|HTMLCanvasElement} canvasId - Canvas 容器 ID 或 DOM 實體
     * @param {Object} config - 完整的 Chart.js 配置物件
     * @returns {Chart|null} 新建之 Chart.js 實體
     */
    render(canvasId, config) {
        const el = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
        if (!el) return null;

        // 核心防禦：向 Chart.js 註冊中心檢查並銷毀可能脫鉤的既有實例
        const existingChart = Chart.getChart(el);
        if (existingChart) {
            existingChart.destroy();
        }

        const id = el.id || `chart-${Date.now()}`;
        if (this._instances[id]) {
            this._instances[id].destroy();
            this._instances[id] = null;
        }

        const ctx = el.getContext('2d');
        const instance = new Chart(ctx, config);
        this._instances[id] = instance;
        return instance;
    },

    /**
     * 銷毀指定或全體快取實例
     * 
     * @param {string} [canvasId] - 欲銷毀的 Canvas ID，未傳則銷毀全部實例
     * @returns {void}
     */
    destroy(canvasId) {
        if (canvasId) {
            const el = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
            if (el) {
                const existing = Chart.getChart(el);
                if (existing) existing.destroy();
            }
            if (this._instances[canvasId]) {
                this._instances[canvasId].destroy();
                delete this._instances[canvasId];
            }
        } else {
            Object.keys(this._instances).forEach(id => {
                if (this._instances[id]) {
                    this._instances[id].destroy();
                }
            });
            this._instances = {};
        }
    },

    // ========================================================================
    // 1. line 折線圖 / 曲線圖 / 面積圖
    // ========================================================================
    /**
     * 產生單條折線圖 / 曲線圖 / 面積圖之完整設定物件
     * 
     * @param {Object} params - 配置參數
     * @param {Array<string>} [params.labels=[]] - X 軸時序或類別標籤
     * @param {Array<number>} [params.data=[]] - Y 軸數值陣列
     * @param {string} [params.datasetLabel='趨勢數據'] - 資料集圖例名稱
     * @param {string} [params.color='#38bdf8'] - 主線條與端點代表色碼
     * @param {number} [params.tension=0] - 貝茲曲率 (依規範預設 0 為硬派無曲率)
     * @param {boolean} [params.fill=false] - 是否填色 (依規範預設 false 不填色，true 時轉為面積圖)
     * @param {string} [params.unit='人'] - 數值度量單位 (如 '人', '盒', 'NT$', 'RM')
     * @param {'auto'|'prefix'|'suffix'} [params.unitPosition='auto'] - 單位前綴/後綴位置
     * @param {string} [params.prefix=''] - 強制前綴字串
     * @param {string} [params.suffix=''] - 強制後綴字串
     * @param {number|null} [params.decimals=null] - 小數顯示位數
     * @param {boolean} [params.yStepInteger=true] - Y 軸是否強制鎖定整數步長
     * @param {string} [params.yAxisTitle=''] - Y 軸輔助標題
     * @returns {Object} Chart.js 配置物件
     */
    createLine({
        labels = [],
        data = [],
        datasetLabel = '趨勢數據',
        color = '#38bdf8',
        tension = 0,
        fill = false,
        unit = '人',
        unitPosition = 'auto',
        prefix = '',
        suffix = '',
        decimals = null,
        yStepInteger = true,
        yAxisTitle = ''
    } = {}) {
        const self = this;
        const yMax = self.calcCeil5Max(data, 5);

        return {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: datasetLabel,
                    data: data,
                    borderColor: color,
                    backgroundColor: fill ? self.toRgba(color, 0.18) : color,
                    fill: fill,
                    tension: tension,
                    borderWidth: 2,
                    pointBackgroundColor: color,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: self.tokens.text, font: { size: 12 }, boxWidth: 10 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}：${self.formatValue(ctx.parsed.y, { unit, unitPosition, prefix, suffix, decimals })}`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: self.tokens.text, font: { size: 12 } },
                        grid: { display: false }
                    },
                    y: {
                        min: 0,
                        max: yMax,
                        title: yAxisTitle ? { display: true, text: yAxisTitle, color: self.tokens.textMuted, font: { size: 12 } } : undefined,
                        ticks: {
                            stepSize: yStepInteger ? 1 : undefined,
                            precision: yStepInteger ? 0 : undefined,
                            color: self.tokens.text,
                            font: { size: 12 },
                            callback: (v) => self.formatValue(v, { unit, unitPosition, prefix, suffix, decimals })
                        },
                        grid: { color: self.tokens.grid }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 2. bar 長條圖 / 柱狀圖 / 橫條圖
    // ========================================================================
    /**
     * 產生長條圖 / 垂直柱狀圖 / 水平橫條圖之完整設定物件
     * 具備單一色碼字串與陣列自適應容錯、數值軸整數防禦
     * 
     * @param {Object} params - 配置參數
     * @param {Array<string>} [params.labels=[]] - 類別項目標籤
     * @param {Array<number>} [params.data=[]] - 統計數值陣列
     * @param {string} [params.datasetLabel='統計數值'] - 資料集圖例名稱
     * @param {string|Array<string>|null} [params.colors=null] - 長條色彩 (單一字串全同色，陣列自訂多色，null 調用全域調色盤)
     * @param {boolean} [params.isHorizontal=false] - 是否水平橫向呈現 (true 時 indexAxis 設為 'y')
     * @param {string} [params.unit='項'] - 數值度量單位
     * @param {'auto'|'prefix'|'suffix'} [params.unitPosition='auto'] - 單位前綴/後綴位置
     * @param {string} [params.prefix=''] - 強制前綴字串
     * @param {string} [params.suffix=''] - 強制後綴字串
     * @param {number|null} [params.decimals=null] - 小數顯示位數
     * @param {boolean} [params.yStepInteger=true] - 數值軸是否強制鎖定整數步長
     * @returns {Object} Chart.js 配置物件
     */
    createBar({
        labels = [],
        data = [],
        datasetLabel = '統計數值',
        colors = null,
        isHorizontal = false,
        unit = '項',
        unitPosition = 'auto',
        prefix = '',
        suffix = '',
        decimals = null,
        yStepInteger = true
    } = {}) {
        const self = this;
        const valAxis = isHorizontal ? 'x' : 'y';
        const catAxis = isHorizontal ? 'y' : 'x';

        // 色彩容錯處理：相容單一字串全同色、多色陣列與調色盤輪播
        let bgColors;
        if (typeof colors === 'string' && colors.trim() !== '') {
            bgColors = colors.trim();
        } else if (Array.isArray(colors) && colors.length > 0) {
            bgColors = colors;
        } else {
            bgColors = labels.map((_, idx) => self.tokens.palette[idx % self.tokens.palette.length]);
        }

        const config = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: datasetLabel,
                    data: data,
                    backgroundColor: bgColors,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: isHorizontal ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label || '數值'}：${self.formatValue(ctx.parsed[valAxis], { unit, unitPosition, prefix, suffix, decimals })}`
                        }
                    }
                },
                scales: {}
            }
        };

        // 數值軸刻度防禦 (水平橫條圖為 X 軸，垂直柱狀圖為 Y 軸)
        config.options.scales[valAxis] = {
            beginAtZero: true,
            ticks: {
                stepSize: yStepInteger ? 1 : undefined,
                precision: yStepInteger ? 0 : undefined,
                color: self.tokens.text,
                font: { size: 12 },
                callback: (v) => self.formatValue(v, { unit, unitPosition, prefix, suffix, decimals })
            },
            grid: { color: self.tokens.grid }
        };

        // 類別軸樣式防禦
        config.options.scales[catAxis] = {
            ticks: { color: self.tokens.text, font: { size: 12 } },
            grid: { display: false }
        };

        return config;
    },

    // ========================================================================
    // 3. pie 實心圓餅圖
    // ========================================================================
    /**
     * 產生實心圓餅圖之完整設定物件 (懸停自動展示千分位數值與百分比)
     * 
     * @param {Object} params - 配置參數
     * @param {Array<string>} [params.labels=[]] - 各扇區項目標籤
     * @param {Array<number>} [params.data=[]] - 各扇區數值陣列
     * @param {string|Array<string>|null} [params.colors=null] - 各扇區色彩
     * @param {string} [params.unit='人'] - 數值度量單位
     * @param {'auto'|'prefix'|'suffix'} [params.unitPosition='auto'] - 單位前綴/後綴位置
     * @param {string} [params.prefix=''] - 強制前綴字串
     * @param {string} [params.suffix=''] - 強制後綴字串
     * @param {number|null} [params.decimals=null] - 小數顯示位數
     * @returns {Object} Chart.js 配置物件
     */
    createPie({
        labels = [],
        data = [],
        colors = null,
        unit = '人',
        unitPosition = 'auto',
        prefix = '',
        suffix = '',
        decimals = null
    } = {}) {
        const self = this;
        const total = data.reduce((acc, cur) => acc + (Number(cur) || 0), 0);
        const isEmpty = total === 0 || labels.length === 0;

        let bgColors;
        if (isEmpty) {
            bgColors = ['#334155'];
        } else if (typeof colors === 'string' && colors.trim() !== '') {
            bgColors = labels.map(() => colors.trim());
        } else if (Array.isArray(colors) && colors.length > 0) {
            bgColors = colors;
        } else {
            bgColors = self.tokens.palette.slice(0, labels.length);
        }

        return {
            type: 'pie',
            data: {
                labels: isEmpty ? ['暫無資料'] : labels,
                datasets: [{
                    data: isEmpty ? [1] : data,
                    backgroundColor: bgColors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: self.tokens.text, font: { size: 12 }, boxWidth: 10, padding: 8 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                if (isEmpty) return ` 暫無資料：0 (0.0%)`;
                                const val = Number(ctx.parsed) || 0;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                                const formattedVal = self.formatValue(val, { unit, unitPosition, prefix, suffix, decimals });
                                return ` ${ctx.label}：${formattedVal} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 4. doughnut 甜甜圈圖 / 環形圖
    // ========================================================================
    /**
     * 產生甜甜圈環形圖之完整設定物件 (中空扇區，支援幾何真圓心垂直置中 KPI 數字)
     * 
     * @param {Object} params - 配置參數
     * @param {Array<string>} [params.labels=[]] - 各環形項目標籤
     * @param {Array<number>} [params.data=[]] - 各環形數值陣列
     * @param {string|Array<string>|null} [params.colors=null] - 各環形色彩
     * @param {string} [params.cutout='65%'] - 環形中空比例 (預設 65%)
     * @param {string} [params.unit='盒'] - 數值度量單位
     * @param {'auto'|'prefix'|'suffix'} [params.unitPosition='auto'] - 單位前綴/後綴位置
     * @param {string} [params.prefix=''] - 強制前綴字串
     * @param {string} [params.suffix=''] - 強制後綴字串
     * @param {number|null} [params.decimals=null] - 小數顯示位數
     * @param {Object|null} [params.centerKpi=null] - 中央注入之 KPI 數字物件 (例：{ label: '在線總盒數', value: '1,280 盒' })
     * @returns {Object} Chart.js 配置物件
     */
    createDoughnut({
        labels = [],
        data = [],
        colors = null,
        cutout = '65%',
        unit = '盒',
        unitPosition = 'auto',
        prefix = '',
        suffix = '',
        decimals = null,
        centerKpi = null
    } = {}) {
        const self = this;
        const total = data.reduce((acc, cur) => acc + (Number(cur) || 0), 0);
        const isEmpty = total === 0 || labels.length === 0;

        let bgColors;
        if (isEmpty) {
            bgColors = ['#334155'];
        } else if (typeof colors === 'string' && colors.trim() !== '') {
            bgColors = labels.map(() => colors.trim());
        } else if (Array.isArray(colors) && colors.length > 0) {
            bgColors = colors;
        } else {
            bgColors = self.tokens.palette.slice(0, labels.length);
        }

        const plugins = [];
        // 幾何真圓心垂直置中插件：精確讀取 DatasetMeta 弧形中心，杜絕底部圖例拉偏中心
        if (centerKpi) {
            plugins.push({
                id: 'centerTextPlugin',
                beforeDraw: function (chart) {
                    const { ctx, chartArea } = chart;
                    if (!chartArea) return;

                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const meta = chart.getDatasetMeta(0);
                    const firstArc = meta && meta.data && meta.data[0];
                    const centerX = firstArc ? firstArc.x : (chartArea.left + chartArea.right) / 2;
                    const centerY = firstArc ? firstArc.y : (chartArea.top + chartArea.bottom) / 2;

                    const labelText = centerKpi.label ? String(centerKpi.label).trim() : '';
                    const valueText = centerKpi.value ? String(centerKpi.value).trim() : '';

                    if (labelText && valueText) {
                        ctx.font = '500 12px system-ui, -apple-system, sans-serif';
                        ctx.fillStyle = self.tokens.textMuted;
                        ctx.fillText(labelText, centerX, centerY - 10);

                        ctx.font = '700 18px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
                        ctx.fillStyle = self.tokens.text;
                        ctx.fillText(valueText, centerX, centerY + 11);
                    } else {
                        const singleText = valueText || labelText;
                        ctx.font = '700 18px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
                        ctx.fillStyle = self.tokens.text;
                        ctx.fillText(singleText, centerX, centerY);
                    }

                    ctx.restore();
                }
            });
        }

        return {
            type: 'doughnut',
            data: {
                labels: isEmpty ? ['暫無資料'] : labels,
                datasets: [{
                    data: isEmpty ? [1] : data,
                    backgroundColor: bgColors,
                    borderWidth: 0,
                    hoverOffset: isEmpty ? 0 : 5
                }]
            },
            plugins: plugins,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: cutout,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: self.tokens.text, font: { size: 12 }, boxWidth: 8, padding: 8 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                if (isEmpty) return ` 暫無資料：0 (0.0%)`;
                                const val = Number(ctx.parsed) || 0;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                                const formattedVal = self.formatValue(val, { unit, unitPosition, prefix, suffix, decimals });
                                return ` ${ctx.label}：${formattedVal} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 5. radar 多維雷達圖 / 蜘蛛網圖
    // ========================================================================
    /**
     * 產生多維平衡評估雷達圖之完整設定物件
     * 
     * @param {Object} params - 配置參數
     * @param {Array<string>} [params.labels=[]] - 各維度放射軸標籤 (3~8 項)
     * @param {Array<Object>} [params.datasets=[]] - 各實體資料集 (格式：[{ label, data, color, fill }])
     * @param {number} [params.suggestedMax=100] - 放射坐標軸建議上限
     * @param {string} [params.unit='分'] - 維度評級單位
     * @param {'auto'|'prefix'|'suffix'} [params.unitPosition='auto'] - 單位前綴/後綴位置
     * @param {string} [params.prefix=''] - 強制前綴字串
     * @param {string} [params.suffix=''] - 強制後綴字串
     * @returns {Object} Chart.js 配置物件
     */
    createRadar({
        labels = [],
        datasets = [],
        suggestedMax = 100,
        unit = '分',
        unitPosition = 'auto',
        prefix = '',
        suffix = ''
    } = {}) {
        const self = this;
        const formattedDatasets = datasets.map((ds, idx) => {
            const baseColor = ds.color || self.tokens.palette[idx % self.tokens.palette.length];
            return {
                label: ds.label || `維度評估 ${idx + 1}`,
                data: ds.data || [],
                borderColor: baseColor,
                backgroundColor: ds.fill !== false ? self.toRgba(baseColor, 0.22) : 'transparent',
                fill: ds.fill !== false,
                borderWidth: 2,
                pointBackgroundColor: baseColor,
                pointBorderColor: '#ffffff',
                pointRadius: 3,
                pointHoverRadius: 5
            };
        });

        return {
            type: 'radar',
            data: {
                labels: labels,
                datasets: formattedDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true,
                        suggestedMax: suggestedMax,
                        angleLines: { color: self.tokens.grid },
                        grid: { color: self.tokens.grid },
                        pointLabels: {
                            color: self.tokens.text,
                            font: { size: 12, weight: '500' }
                        },
                        ticks: {
                            display: false,
                            backdropColor: 'transparent',
                            stepSize: Math.ceil(suggestedMax / 5)
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: self.tokens.text, font: { size: 12 }, boxWidth: 10 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}：${self.formatValue(ctx.parsed.r, { unit, unitPosition, prefix, suffix })}`
                        }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 6. polarArea 極區面積圖
    // ========================================================================
    /**
     * 產生等角度放射狀極區面積圖之完整設定物件
     * 
     * @param {Object} params - 配置參數
     * @param {Array<string>} [params.labels=[]] - 各扇區項目標籤
     * @param {Array<number>} [params.data=[]] - 各扇區數值陣列
     * @param {string|Array<string>|null} [params.colors=null] - 各扇區色彩
     * @param {string} [params.unit='次'] - 數值度量單位
     * @param {'auto'|'prefix'|'suffix'} [params.unitPosition='auto'] - 單位前綴/後綴位置
     * @param {string} [params.prefix=''] - 強制前綴字串
     * @param {string} [params.suffix=''] - 強制後綴字串
     * @param {number|null} [params.decimals=null] - 小數顯示位數
     * @returns {Object} Chart.js 配置物件
     */
    createPolarArea({
        labels = [],
        data = [],
        colors = null,
        unit = '次',
        unitPosition = 'auto',
        prefix = '',
        suffix = '',
        decimals = null
    } = {}) {
        const self = this;
        let bgColors;
        if (typeof colors === 'string' && colors.trim() !== '') {
            bgColors = labels.map(() => self.toRgba(colors.trim(), 0.72));
        } else if (Array.isArray(colors) && colors.length > 0) {
            bgColors = colors.map(c => self.toRgba(c, 0.72));
        } else {
            bgColors = self.tokens.palette.slice(0, labels.length).map(c => self.toRgba(c, 0.72));
        }

        return {
            type: 'polarArea',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: bgColors,
                    borderWidth: 1,
                    borderColor: self.tokens.border
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true,
                        grid: { color: self.tokens.grid },
                        ticks: {
                            color: self.tokens.textMuted,
                            backdropColor: 'transparent',
                            font: { size: 12 },
                            callback: (v) => self.formatValue(v, { unit, unitPosition, prefix, suffix, decimals })
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: self.tokens.text, font: { size: 12 }, boxWidth: 10, padding: 8 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.label}：${self.formatValue(ctx.parsed.r, { unit, unitPosition, prefix, suffix, decimals })}`
                        }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 7. scatter 笛卡爾卡氏座標散佈圖 / 散點圖
    // ========================================================================
    /**
     * 產生雙連續變數相關性散佈圖之完整設定物件
     * 
     * @param {Object} params - 配置參數
     * @param {Array<Object>} [params.datasets=[]] - 散點資料集 (格式：[{ label, data: [{x, y, name, ...}], color }])
     * @param {string} [params.xTitle='X 軸'] - X 軸標題
     * @param {string} [params.yTitle='Y 軸'] - Y 軸標題
     * @param {string} [params.xUnit=''] - X 軸度量單位 (如 'NT$', '天')
     * @param {string} [params.yUnit=''] - Y 軸度量單位 (如 'SV', '分')
     * @param {'auto'|'prefix'|'suffix'} [params.xUnitPosition='auto'] - X 軸單位位置
     * @param {'auto'|'prefix'|'suffix'} [params.yUnitPosition='auto'] - Y 軸單位位置
     * @returns {Object} Chart.js 配置物件
     */
    createScatter({
        datasets = [],
        xTitle = 'X 軸',
        yTitle = 'Y 軸',
        xUnit = '',
        yUnit = '',
        xUnitPosition = 'auto',
        yUnitPosition = 'auto'
    } = {}) {
        const self = this;
        const formattedDatasets = datasets.map((ds, idx) => {
            const baseColor = ds.color || self.tokens.palette[idx % self.tokens.palette.length];
            return {
                label: ds.label || '散點分佈',
                data: ds.data || [],
                backgroundColor: Array.isArray(ds.data) && ds.data[0] && ds.data[0].color ? ds.data.map(p => p.color) : baseColor,
                borderColor: '#ffffff',
                borderWidth: 1,
                pointRadius: 6,
                pointHoverRadius: 9,
                pointHoverBorderWidth: 2
            };
        });

        return {
            type: 'scatter',
            data: { datasets: formattedDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: self.tokens.text, font: { size: 12 }, boxWidth: 10 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const pt = ctx.raw;
                                const titleLine = pt.name ? ` 標的：${pt.name}` : ` ${ctx.dataset.label}`;
                                const xFormatted = self.formatValue(ctx.parsed.x, { unit: xUnit, unitPosition: xUnitPosition });
                                const yFormatted = self.formatValue(ctx.parsed.y, { unit: yUnit, unitPosition: yUnitPosition });
                                return [
                                    titleLine,
                                    ` ${xTitle}：${xFormatted}`,
                                    ` ${yTitle}：${yFormatted}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: xTitle, color: '#a78bfa', font: { size: 12, weight: 'bold' } },
                        ticks: {
                            color: self.tokens.text,
                            font: { size: 12 },
                            callback: (v) => self.formatValue(v, { unit: xUnit, unitPosition: xUnitPosition })
                        },
                        grid: { color: self.tokens.grid }
                    },
                    y: {
                        title: { display: true, text: yTitle, color: '#38bdf8', font: { size: 12, weight: 'bold' } },
                        ticks: {
                            color: self.tokens.text,
                            font: { size: 12 },
                            callback: (v) => self.formatValue(v, { unit: yUnit, unitPosition: yUnitPosition })
                        },
                        grid: { color: self.tokens.grid }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 8. bubble 三維氣泡圖
    // ========================================================================
    /**
     * 產生具備位置與權重量級三維氣泡圖之完整設定物件
     * 
     * @param {Object} params - 配置參數
     * @param {Array<Object>} [params.datasets=[]] - 氣泡資料集 (格式：[{ label, data: [{x, y, r, name}], color }])
     * @param {string} [params.xTitle='X 軸'] - X 軸標題
     * @param {string} [params.yTitle='Y 軸'] - Y 軸標題
     * @param {string} [params.rLabel='權重量級'] - 半徑維度說明標籤
     * @param {string} [params.xUnit=''] - X 軸度量單位
     * @param {string} [params.yUnit=''] - Y 軸度量單位
     * @param {string} [params.rUnit=''] - 半徑度量單位
     * @param {'auto'|'prefix'|'suffix'} [params.xUnitPosition='auto'] - X 軸單位位置
     * @param {'auto'|'prefix'|'suffix'} [params.yUnitPosition='auto'] - Y 軸單位位置
     * @returns {Object} Chart.js 配置物件
     */
    createBubble({
        datasets = [],
        xTitle = 'X 軸',
        yTitle = 'Y 軸',
        rLabel = '權重量級',
        xUnit = '',
        yUnit = '',
        rUnit = '',
        xUnitPosition = 'auto',
        yUnitPosition = 'auto'
    } = {}) {
        const self = this;
        const formattedDatasets = datasets.map((ds, idx) => {
            const baseColor = ds.color || self.tokens.palette[idx % self.tokens.palette.length];
            return {
                label: ds.label || '氣泡矩陣',
                data: ds.data || [],
                backgroundColor: self.toRgba(baseColor, 0.55),
                borderColor: baseColor,
                borderWidth: 1.5,
                hoverBorderWidth: 2.5
            };
        });

        return {
            type: 'bubble',
            data: { datasets: formattedDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: self.tokens.text, font: { size: 12 }, boxWidth: 10 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const pt = ctx.raw;
                                const titleLine = pt.name ? ` 項目：${pt.name}` : ` ${ctx.dataset.label}`;
                                const xFormatted = self.formatValue(pt.x, { unit: xUnit, unitPosition: xUnitPosition });
                                const yFormatted = self.formatValue(pt.y, { unit: yUnit, unitPosition: yUnitPosition });
                                const rFormatted = self.formatValue(pt.r, { unit: rUnit });
                                return [
                                    titleLine,
                                    ` ${xTitle}：${xFormatted}`,
                                    ` ${yTitle}：${yFormatted}`,
                                    ` ${rLabel}：${rFormatted}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: xTitle, color: '#a78bfa', font: { size: 12, weight: 'bold' } },
                        ticks: {
                            color: self.tokens.text,
                            font: { size: 12 },
                            callback: (v) => self.formatValue(v, { unit: xUnit, unitPosition: xUnitPosition })
                        },
                        grid: { color: self.tokens.grid }
                    },
                    y: {
                        title: { display: true, text: yTitle, color: '#38bdf8', font: { size: 12, weight: 'bold' } },
                        ticks: {
                            color: self.tokens.text,
                            font: { size: 12 },
                            callback: (v) => self.formatValue(v, { unit: yUnit, unitPosition: yUnitPosition })
                        },
                        grid: { color: self.tokens.grid }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 9. bar + line 柱狀與折線複合圖表 (Mixed Chart)
    // ========================================================================
    /**
     * 產生柱狀圖疊加趨勢折線圖之複合圖表設定物件
     * 嚴格規範：折線圖層懸浮於柱狀之上 (order: 1 vs 2)、副軸網格關閉防疊紋、Y 軸上限 5 的倍數防禦
     * 
     * @param {Object} params - 配置參數
     * @param {Array<string>} [params.labels=[]] - X 軸標籤
     * @param {Array<number>} [params.barData=[]] - 柱狀圖數值陣列
     * @param {Array<number>} [params.lineData=[]] - 折線圖數值陣列
     * @param {string} [params.barLabel='總量數據'] - 柱狀圖資料集標籤
     * @param {string} [params.lineLabel='指標趨勢'] - 折線圖資料集標籤
     * @param {string} [params.barColor='#8b5cf6'] - 柱狀色碼
     * @param {string} [params.lineColor='#10b981'] - 折線色碼
     * @param {string} [params.barUnit='盒'] - 柱狀圖度量單位
     * @param {string} [params.lineUnit='%'] - 折線圖度量單位
     * @param {'auto'|'prefix'|'suffix'} [params.barUnitPosition='auto'] - 柱狀圖單位前綴/後綴位置
     * @param {'auto'|'prefix'|'suffix'} [params.lineUnitPosition='auto'] - 折線圖單位前綴/後綴位置
     * @param {boolean} [params.useDualAxis=true] - 是否啟用左右雙 Y 軸獨立刻度
     * @param {number} [params.lineTension=0] - 折線貝茲曲率 (依規範預設 0 為硬派無曲率)
     * @returns {Object} Chart.js 配置物件
     */
    createBarLineMixed({
        labels = [],
        barData = [],
        lineData = [],
        barLabel = '總量數據',
        lineLabel = '指標趨勢',
        barColor = '#8b5cf6',
        lineColor = '#10b981',
        barUnit = '盒',
        lineUnit = '%',
        barUnitPosition = 'auto',
        lineUnitPosition = 'auto',
        useDualAxis = true,
        lineTension = 0
    } = {}) {
        const self = this;
        const yBarMax = self.calcCeil5Max(barData, 5);
        const yLineMax = useDualAxis ? self.calcCeil5Max(lineData, 5) : Math.max(yBarMax, self.calcCeil5Max(lineData, 5));

        return {
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: lineLabel,
                        data: lineData,
                        borderColor: lineColor,
                        backgroundColor: lineColor,
                        fill: false,
                        tension: lineTension,
                        borderWidth: 2.5,
                        pointBackgroundColor: lineColor,
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 1.5,
                        pointRadius: 4,
                        order: 1,
                        yAxisID: useDualAxis ? 'y1' : 'y'
                    },
                    {
                        type: 'bar',
                        label: barLabel,
                        data: barData,
                        backgroundColor: barColor,
                        borderRadius: 4,
                        order: 2,
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: self.tokens.text, font: { size: 12 }, boxWidth: 10 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const isBar = ctx.dataset.type === 'bar';
                                const u = isBar ? barUnit : lineUnit;
                                const pos = isBar ? barUnitPosition : lineUnitPosition;
                                return ` ${ctx.dataset.label}：${self.formatValue(ctx.parsed.y, { unit: u, unitPosition: pos })}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: self.tokens.text, font: { size: 12 } },
                        grid: { color: self.tokens.grid }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        min: 0,
                        max: yBarMax,
                        title: { display: true, text: barLabel, color: barColor, font: { size: 12 } },
                        ticks: {
                            stepSize: 1,
                            precision: 0,
                            color: self.tokens.text,
                            font: { size: 12 },
                            callback: (v) => self.formatValue(v, { unit: barUnit, unitPosition: barUnitPosition })
                        },
                        grid: { color: self.tokens.grid }
                    },
                    y1: useDualAxis ? {
                        type: 'linear',
                        position: 'right',
                        min: 0,
                        max: yLineMax,
                        title: { display: true, text: lineLabel, color: lineColor, font: { size: 12 } },
                        ticks: {
                            stepSize: 1,
                            precision: 0,
                            color: lineColor,
                            font: { size: 12 },
                            callback: (v) => self.formatValue(v, { unit: lineUnit, unitPosition: lineUnitPosition })
                        },
                        grid: { drawOnChartArea: false }
                    } : undefined
                }
            }
        };
    },

    // ========================================================================
    // 10. multiLine 2 條以上的多折線走勢圖
    // ========================================================================
    /**
     * 產生多條趨勢折線圖之完整設定物件
     * 嚴格落實無曲率、不填色、整數步長防禦與 5 的倍數上限防禦
     * 
     * @param {Object} params - 配置參數
     * @param {Array<string>} [params.labels=[]] - X 軸標籤
     * @param {Array<Object>} [params.lines=[]] - 各折線資料集 (格式：[{ label, data, color, yAxisID, fill, tension }])
     * @param {string} [params.unit='SV'] - 數值度量單位
     * @param {'auto'|'prefix'|'suffix'} [params.unitPosition='auto'] - 單位前綴/後綴位置
     * @param {boolean} [params.useDualAxis=false] - 是否啟用左右雙軸 (左軸 'y', 右軸 'y1')
     * @param {string} [params.yLeftTitle=''] - 左側 Y 軸標題
     * @param {string} [params.yRightTitle=''] - 右側 Y 軸標題
     * @returns {Object} Chart.js 配置物件
     */
    createMultiLine({
        labels = [],
        lines = [],
        unit = 'SV',
        unitPosition = 'auto',
        useDualAxis = false,
        yLeftTitle = '',
        yRightTitle = ''
    } = {}) {
        const self = this;
        const allLeftData = lines.filter(l => !l.yAxisID || l.yAxisID === 'y').flatMap(l => l.data || []);
        const allRightData = lines.filter(l => l.yAxisID === 'y1').flatMap(l => l.data || []);

        const yLeftMax = self.calcCeil5Max(allLeftData, 5);
        const yRightMax = useDualAxis ? self.calcCeil5Max(allRightData, 5) : 5;

        const formattedDatasets = lines.map((line, idx) => {
            const baseColor = line.color || self.tokens.palette[idx % self.tokens.palette.length];
            return {
                label: line.label || `線路 ${idx + 1}`,
                data: line.data || [],
                borderColor: baseColor,
                backgroundColor: line.fill ? self.toRgba(baseColor, 0.18) : baseColor,
                fill: line.fill || false,
                tension: line.tension !== undefined ? line.tension : 0,
                borderWidth: 2,
                pointBackgroundColor: baseColor,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 1.5,
                pointRadius: 4,
                pointHoverRadius: 6,
                yAxisID: line.yAxisID || 'y'
            };
        });

        return {
            type: 'line',
            data: {
                labels: labels,
                datasets: formattedDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: self.tokens.text, font: { size: 12 }, boxWidth: 10, padding: 8 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                return ` ${ctx.dataset.label}：${self.formatValue(ctx.parsed.y, { unit, unitPosition })}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: self.tokens.text, font: { size: 12 } },
                        grid: { color: self.tokens.grid }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        min: 0,
                        max: yLeftMax,
                        title: yLeftTitle ? { display: true, text: yLeftTitle, color: self.tokens.textMuted, font: { size: 12 } } : undefined,
                        ticks: {
                            stepSize: 1,
                            precision: 0,
                            color: self.tokens.text,
                            font: { size: 12 },
                            callback: (v) => self.formatValue(v, { unit, unitPosition })
                        },
                        grid: { color: self.tokens.grid }
                    },
                    y1: useDualAxis ? {
                        type: 'linear',
                        position: 'right',
                        min: 0,
                        max: yRightMax,
                        title: yRightTitle ? { display: true, text: yRightTitle, color: self.tokens.palette[1], font: { size: 12 } } : undefined,
                        ticks: {
                            stepSize: 1,
                            precision: 0,
                            color: self.tokens.palette[1],
                            font: { size: 12 },
                            callback: (v) => self.formatValue(v, { unit, unitPosition })
                        },
                        grid: { drawOnChartArea: false }
                    } : undefined
                }
            }
        };
    }
};