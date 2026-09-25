/**
 * ============================================================================
 * 榮祥團隊戰術控制台 - Chart.js 全域視覺中樞 (chart-helper.js)
 * 專為榮祥團隊（Ray's Team）量身打造之 10 大戰術圖表產生引擎
 * 支援：Line/Area、Bar/Horizontal Bar、Pie、Doughnut、Radar、PolarArea、
 *       Scatter、Bubble、Mixed Bar+Line、Multi-Line
 * 規範：Chart.js 4.5.0、暗黑主題 Token、Y 軸整數防禦、5 的倍數上限對齊
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
     * 輔助工具：安全色彩轉 RGBA (支援 3 碼/6 碼 Hex 及原生 rgb/rgba，徹底解決字串拼接破圖)
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
     * 輔助工具：動態計算數值陣列上限，並向上取整至 5 的倍數 (折線圖規範)
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
     * 統一實例註冊與銷毀管理器 (解決 Canvas is already in use 崩潰)
     */
    render(canvasId, config) {
        const el = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
        if (!el) return null;

        // 核心防禦：向 Chart.js 核心登錄註冊表確認並徹底銷毀既有實例
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
     * 銷毀指定或全體圖表實例
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
    // 1. line 折線圖 / 曲線圖 / 面積圖 (鎖定無曲率、不填色、5 的倍數上限)
    // ========================================================================
    createLine({
        labels = [],
        data = [],
        datasetLabel = '趨勢數據',
        color = '#38bdf8',
        tension = 0,             // 依規範預設 0 為硬派無曲率
        fill = false,            // 依規範預設不填色
        unit = '人',
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
                            label: (ctx) => ` ${ctx.dataset.label}：${Number(ctx.parsed.y || 0).toLocaleString()} ${unit}`
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
                            callback: (v) => Number(v).toLocaleString()
                        },
                        grid: { color: self.tokens.grid }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 2. bar 長條圖 / 柱狀圖 / 橫條圖 (修復單一色碼與水平軸刻度顛倒)
    // ========================================================================
    createBar({
        labels = [],
        data = [],
        datasetLabel = '統計數值',
        colors = null,
        isHorizontal = false,    // true 時轉為水平橫條圖 (indexAxis: 'y')
        unit = '項',
        yStepInteger = true
    } = {}) {
        const self = this;
        const valAxis = isHorizontal ? 'x' : 'y';
        const catAxis = isHorizontal ? 'y' : 'x';

        // 核心防禦：相容單一色碼字串、自訂多色陣列與調色盤輪播
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
                            label: (ctx) => ` ${ctx.dataset.label || '數值'}：${Number(ctx.parsed[valAxis] || 0).toLocaleString()} ${unit}`
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
                callback: (v) => Number(v).toLocaleString()
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
    // 3. pie 圓餅圖 (相容單色與多色，懸停展示精準百分比)
    // ========================================================================
    createPie({
        labels = [],
        data = [],
        colors = null,
        unit = '人'
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
                                if (isEmpty) return ` 暫無資料：0 ${unit} (0.0%)`;
                                const val = Number(ctx.parsed) || 0;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：${val.toLocaleString()} ${unit} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 4. doughnut 甜甜圈圖 / 環形圖 (中空扇區，支援中央 KPI 注入)
    // ========================================================================
    createDoughnut({
        labels = [],
        data = [],
        colors = null,
        cutout = '65%',
        unit = '盒',
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
        if (centerKpi) {
            plugins.push({
                id: 'centerTextPlugin',
                beforeDraw: function (chart) {
                    // 防禦：若尚未完成幾何佈局或無資料則不繪製
                    const { ctx, chartArea } = chart;
                    if (!chartArea) return;

                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    // 核心修正 1：精準取得甜甜圈圓環的真實幾何中心 (排除底部圖例干擾)
                    const meta = chart.getDatasetMeta(0);
                    const firstArc = meta && meta.data && meta.data[0];
                    const centerX = firstArc ? firstArc.x : (chartArea.left + chartArea.right) / 2;
                    const centerY = firstArc ? firstArc.y : (chartArea.top + chartArea.bottom) / 2;

                    const labelText = centerKpi.label ? String(centerKpi.label).trim() : '';
                    const valueText = centerKpi.value ? String(centerKpi.value).trim() : '';

                    // 核心修正 2：雙行文字相對於圓心的精確平衡排版
                    if (labelText && valueText) {
                        // 上層 Label（小型次要字）向上微調 10px
                        ctx.font = '500 12px system-ui, -apple-system, sans-serif';
                        ctx.fillStyle = self.tokens.textMuted;
                        ctx.fillText(labelText, centerX, centerY - 10);

                        // 下層 Value（大型強調字）向下微調 11px
                        ctx.font = '700 18px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
                        ctx.fillStyle = self.tokens.text;
                        ctx.fillText(valueText, centerX, centerY + 11);
                    } else {
                        // 若僅有單行文字，直接鎖定在幾何絕對正中心
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
                                if (isEmpty) return ` 暫無資料：0 ${unit} (0.0%)`;
                                const val = Number(ctx.parsed) || 0;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：${val.toLocaleString()} ${unit} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 5. radar 雷達圖 / 蜘蛛網圖 (修復底層背板與透明度字串破圖)
    // ========================================================================
    createRadar({
        labels = [],
        datasets = [],
        suggestedMax = 100
    } = {}) {
        const self = this;
        const formattedDatasets = datasets.map((ds, idx) => {
            const baseColor = ds.color || self.tokens.palette[idx % self.tokens.palette.length];
            return {
                label: ds.label || `面向 ${idx + 1}`,
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
                            backdropColor: 'transparent', // 核心防禦：杜絕白底遮塊
                            stepSize: Math.ceil(suggestedMax / 5)
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: self.tokens.text, font: { size: 12 }, boxWidth: 10 }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 6. polarArea 極區面積圖 (修復邊界與文字大小)
    // ========================================================================
    createPolarArea({
        labels = [],
        data = [],
        colors = null,
        unit = '次'
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
                            callback: (v) => Number(v).toLocaleString()
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
                            label: (ctx) => ` ${ctx.label}：${Number(ctx.parsed.r || 0).toLocaleString()} ${unit}`
                        }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 7. scatter 散佈圖 / 散點圖 (防禦浮點座標與軸線標籤)
    // ========================================================================
    createScatter({
        datasets = [],
        xTitle = 'X 軸',
        yTitle = 'Y 軸',
        xUnit = '',
        yUnit = ''
    } = {}) {
        const self = this;
        const formattedDatasets = datasets.map((ds, idx) => {
            const baseColor = ds.color || self.tokens.palette[idx % self.tokens.palette.length];
            return {
                label: ds.label || '散點集',
                data: ds.data || [],
                backgroundColor: baseColor,
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
                                return [
                                    titleLine,
                                    ` ${xTitle}：${Number(ctx.parsed.x || 0).toLocaleString()} ${xUnit}`,
                                    ` ${yTitle}：${Number(ctx.parsed.y || 0).toLocaleString()} ${yUnit}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: xTitle, color: '#a78bfa', font: { size: 12, weight: 'bold' } },
                        ticks: { color: self.tokens.text, font: { size: 12 }, callback: (v) => `${Number(v).toLocaleString()} ${xUnit}` },
                        grid: { color: self.tokens.grid }
                    },
                    y: {
                        title: { display: true, text: yTitle, color: '#38bdf8', font: { size: 12, weight: 'bold' } },
                        ticks: { color: self.tokens.text, font: { size: 12 }, callback: (v) => `${Number(v).toLocaleString()} ${yUnit}` },
                        grid: { color: self.tokens.grid }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 8. bubble 氣泡圖 (修復透明度拼接破圖)
    // ========================================================================
    createBubble({
        datasets = [],
        xTitle = 'X 軸',
        yTitle = 'Y 軸',
        rLabel = '權重量級',
        xUnit = '',
        yUnit = '',
        rUnit = ''
    } = {}) {
        const self = this;
        const formattedDatasets = datasets.map((ds, idx) => {
            const baseColor = ds.color || self.tokens.palette[idx % self.tokens.palette.length];
            return {
                label: ds.label || '氣泡集',
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
                                return [
                                    titleLine,
                                    ` ${xTitle}：${Number(pt.x || 0).toLocaleString()} ${xUnit}`,
                                    ` ${yTitle}：${Number(pt.y || 0).toLocaleString()} ${yUnit}`,
                                    ` ${rLabel}：${Number(pt.r || 0).toLocaleString()} ${rUnit}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: xTitle, color: '#a78bfa', font: { size: 12, weight: 'bold' } },
                        ticks: { color: self.tokens.text, font: { size: 12 }, callback: (v) => `${Number(v).toLocaleString()} ${xUnit}` },
                        grid: { color: self.tokens.grid }
                    },
                    y: {
                        title: { display: true, text: yTitle, color: '#38bdf8', font: { size: 12, weight: 'bold' } },
                        ticks: { color: self.tokens.text, font: { size: 12 }, callback: (v) => `${Number(v).toLocaleString()} ${yUnit}` },
                        grid: { color: self.tokens.grid }
                    }
                }
            }
        };
    },

    // ========================================================================
    // 9. bar + line 複合圖表 (圖層覆蓋、雙 Y 軸網格隔離、5 的倍數上限)
    // ========================================================================
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
        useDualAxis = true,
        lineTension = 0          // 依規範預設無曲率
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
                        fill: false,     // 依規範不填色
                        tension: lineTension,
                        borderWidth: 2.5,
                        pointBackgroundColor: lineColor,
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 1.5,
                        pointRadius: 4,
                        order: 1,        // 核心規範：折線優先覆蓋於色塊之上
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
                                return ` ${ctx.dataset.label}：${Number(ctx.parsed.y || 0).toLocaleString()} ${u}`;
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
                            callback: (v) => `${Number(v).toLocaleString()} ${barUnit}`
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
                            callback: (v) => `${Number(v).toLocaleString()} ${lineUnit}`
                        },
                        grid: { drawOnChartArea: false } // 核心防禦：副軸格線關閉，防疊紋干擾
                    } : undefined
                }
            }
        };
    },

    // ========================================================================
    // 10. 2 條以上的 line 多折線走勢圖 (多線對比、無曲率、整數步長防禦)
    // ========================================================================
    createMultiLine({
        labels = [],
        lines = [],              // [{ label, data, color, yAxisID, fill, tension }]
        unit = 'SV',
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
                tension: line.tension !== undefined ? line.tension : 0, // 依規範預設 0
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
                                return ` ${ctx.dataset.label}：${Number(ctx.parsed.y || 0).toLocaleString()} ${unit}`;
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
                            callback: (v) => Number(v).toLocaleString()
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
                            callback: (v) => Number(v).toLocaleString()
                        },
                        grid: { drawOnChartArea: false }
                    } : undefined
                }
            }
        };
    }
};