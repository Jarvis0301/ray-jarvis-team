/**
 * 戰情室 Google Sheets 欄位解耦對照字典 (Decoupled Schema Mapping)
 * 確保當 Google 試算表欄位更名或結構微調時，前端不需大幅重構
 */
const SCHEMA_MAPPING = {
    psiAlerts: {
        warehouseName: ['倉別', '營運中心', '據點名稱', 'warehouse_name'],
        productName: ['產品名稱', '品項名稱', '品名', 'product_name'],
        batchNumber: ['批號', '批次代號', 'batch_no'],
        currentStock: ['現有庫存', '現有量', '庫存量', 'current_stock'],
        expiryDate: ['保存期限', '到期日', '效期', 'expiry_date'],
        alertType: ['預警類型', '警戒等級', 'alert_level'],
        actionSuggestion: ['處置建議', '補貨調度', 'suggested_action']
    },
    dailyStats: {
        date: ['日期', 'stat_date'],
        totalSv: ['總SV', '當日SV', 'total_sv'],
        totalPv: ['全站PV', 'total_pv'],
        newLeads: ['新名單', 'new_leads_count']
    }
};

// 解耦資料解析器
function mapDecoupledRow(row, mappingConfig) {
    const mapped = {};
    for (const key in mappingConfig) {
        const possibleHeaders = mappingConfig[key];
        for (const header of possibleHeaders) {
            if (row[header] !== undefined) {
                mapped[key] = row[header];
                break;
            }
        }
    }
    return mapped;
}

window.addEventListener('AppReady', function () {
    // 1. 初始化 Chart.js SV 總量動態圖表
    initSvChart();

    // 2. 初始化 DataTable.js 庫存預警表
    initPsiDataTable();

    // 3. 啟動馬來西亞拓荒倒數計時器
    initMissionCountdown();

    // 4. 刷新按鈕事件
    $('#btnRefreshHub').on('click', function () {
        const $btn = $(this);
        $btn.html('<i class="fa-solid fa-spinner fa-spin"></i> 同步中...');
        setTimeout(function () {
            $btn.html('<i class="fa-solid fa-arrows-rotate"></i> 刷新戰情快取');
            const now = new Date();
            const timeStr = now.getFullYear() + '-' + 
                String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                String(now.getDate()).padStart(2, '0') + ' ' + 
                String(now.getHours()).padStart(2, '0') + ':' + 
                String(now.getMinutes()).padStart(2, '0') + ':' + 
                String(now.getSeconds()).padStart(2, '0');
            $('#syncTimestamp').text('即時同步：' + timeStr);
        }, 800);
    });
});

// 1. 初始化 Chart.js (帶紫色/粉色微光漸層)
let svChartInstance = null;
function initSvChart() {
    const ctx = document.getElementById('svPerformanceChart').getContext('2d');
    
    // 建立魅影紫與霓虹粉漸層
    const gradientPurple = ctx.createLinearGradient(0, 0, 0, 300);
    gradientPurple.addColorStop(0, 'rgba(139, 92, 246, 0.45)');
    gradientPurple.addColorStop(1, 'rgba(139, 92, 246, 0.0)');

    const gradientPink = ctx.createLinearGradient(0, 0, 0, 300);
    gradientPink.addColorStop(0, 'rgba(236, 72, 153, 0.35)');
    gradientPink.addColorStop(1, 'rgba(236, 72, 153, 0.0)');

    const chartData = {
        labels: ['3月', '4月', '5月', '6月', '7月', '8月 (現況)'],
        datasets: [
            {
                label: '團隊總 SV 業績',
                data: [610000, 685000, 720000, 789000, 815000, 842650],
                borderColor: '#c084fc',
                backgroundColor: gradientPurple,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#8b5cf6',
                pointBorderColor: '#ffffff',
                pointRadius: 5,
                pointHoverRadius: 8
            },
            {
                label: '月度營收目標 SV',
                data: [650000, 700000, 750000, 800000, 850000, 1000000],
                borderColor: 'rgba(251, 191, 36, 0.75)',
                borderWidth: 2,
                borderDash: [6, 6],
                fill: false,
                pointRadius: 0,
                tension: 0.1
            }
        ]
    };

    svChartInstance = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e9d5ff',
                        font: {
                            family: "'Plus Jakarta Sans', sans-serif",
                            size: 12
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(19, 9, 36, 0.95)',
                    titleColor: '#c084fc',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(139, 92, 246, 0.4)',
                    borderWidth: 1,
                    padding: 12,
                    boxPadding: 6,
                    usePointStyle: true
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(139, 92, 246, 0.1)'
                    },
                    ticks: {
                        color: '#a1a1aa'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(139, 92, 246, 0.1)'
                    },
                    ticks: {
                        color: '#a1a1aa',
                        callback: function (value) {
                            return (value / 1000) + 'k SV';
                        }
                    }
                }
            }
        }
    });

    // 圖表維度切換按鈕事件
    $('#btnTrendMonth').on('click', function () {
        $(this).addClass('active');
        $('#btnTrendDay').removeClass('active');
        svChartInstance.data.labels = ['3月', '4月', '5月', '6月', '7月', '8月 (現況)'];
        svChartInstance.data.datasets[0].data = [610000, 685000, 720000, 789000, 815000, 842650];
        svChartInstance.update();
    });

    $('#btnTrendDay').on('click', function () {
        $(this).addClass('active');
        $('#btnTrendMonth').removeClass('active');
        svChartInstance.data.labels = ['8/16', '8/17', '8/18', '8/19', '8/20', '8/21', '8/22'];
        svChartInstance.data.datasets[0].data = [24500, 31200, 28900, 45000, 38200, 51000, 62400];
        svChartInstance.update();
    });
}

// 2. 初始化 DataTable.js 庫存預警表格 (模擬解耦載入)
function initPsiDataTable() {
    // 模擬自 Google 試算表解耦抓取之資料列 (Raw Sheets Data)
    const rawMockRows = [
        {
            '營運中心': '台北總部中繼倉',
            '產品名稱': '康爾喜益生菌 (乳酸菌顆粒)',
            '批號': 'BATCH-202511-01',
            '現有庫存': '18 盒',
            '保存期限': '2026-11-20 (剩 89 天)',
            '預警類型': 'CRITICAL',
            '處置建議': '優先 FIFO 出庫 / 推播促銷'
        },
        {
            '營運中心': '台中營運中心',
            '產品名稱': '樟芝益生技菌絲體發酵液',
            '批號': 'BATCH-202604-03',
            '現有庫存': '8 箱 (低於安全水位)',
            '保存期限': '2027-04-15 (正常)',
            '預警類型': 'LOW_STOCK',
            '處置建議': '提報總公司提貨進單'
        },
        {
            '營運中心': '高雄營運中心',
            '產品名稱': '995生技營養液 (24包/箱)',
            '批號': 'BATCH-202512-05',
            '現有庫存': '12 箱',
            '保存期限': '2026-12-05 (剩 104 天)',
            '預警類型': 'EXPIRY_WARN',
            '處置建議': '協調大額 VIP 訂單配發'
        },
        {
            '營運中心': '馬來西亞吉隆坡營業處',
            '產品名稱': '愛益 (Ay-Yi Capsules)',
            '批號': 'BATCH-MY-202601',
            '現有庫存': '5 瓶 (即將見底)',
            '保存期限': '2027-08-10 (正常)',
            '預警類型': 'LOW_STOCK',
            '處置建議': '啟動台灣現貨對沖調撥'
        }
    ];

    // 執行解耦欄位 Mapping
    const mappedDataset = rawMockRows.map(row => mapDecoupledRow(row, SCHEMA_MAPPING.psiAlerts));

    // 初始化 DataTable
    $('#psiAlertTable').DataTable({
        data: mappedDataset,
        responsive: true,
        pageLength: 4,
        lengthMenu: [4, 10, 25],
        language: {
            search: "_INPUT_",
            searchPlaceholder: "搜尋產品/倉別/批號...",
            lengthMenu: "每頁 _MENU_ 筆",
            info: "顯示第 _START_ 至 _END_ 筆，共 _TOTAL_ 筆",
            paginate: {
                previous: '<i class="fa-solid fa-chevron-left"></i>',
                next: '<i class="fa-solid fa-chevron-right"></i>'
            },
            emptyTable: "目前無任何庫存與效期警示"
        },
        columns: [
            { 
                data: 'warehouseName',
                render: function (data) {
                    return `<span class="fw-semibold text-white"><i class="fa-solid fa-location-dot text-purple me-1"></i> ${data}</span>`;
                }
            },
            { 
                data: 'productName',
                render: function (data) {
                    return `<strong class="text-light">${data}</strong>`;
                }
            },
            { 
                data: 'batchNumber',
                render: function (data) {
                    return `<span class="mono-font text-secondary">${data}</span>`;
                }
            },
            { 
                data: 'currentStock',
                render: function (data, type, row) {
                    const isLow = data.includes('低於') || data.includes('見底');
                    return `<span class="mono-font fw-bold ${isLow ? 'text-danger' : 'text-warning'}">${data}</span>`;
                }
            },
            { 
                data: 'expiryDate',
                render: function (data) {
                    const isNear = data.includes('剩');
                    return `<span class="${isNear ? 'text-pink fw-semibold' : 'text-secondary'}">${data}</span>`;
                }
            },
            { 
                data: 'alertType',
                render: function (data) {
                    if (data === 'CRITICAL') {
                        return '<span class="badge bg-danger text-white rounded-pill px-2 py-1"><i class="fa-solid fa-skull-crossbones"></i> 極急迫</span>';
                    } else if (data === 'LOW_STOCK') {
                        return '<span class="badge bg-warning text-dark rounded-pill px-2 py-1"><i class="fa-solid fa-arrow-down-short-wide"></i> 存量告急</span>';
                    } else {
                        return '<span class="badge bg-purple-subtle text-secondary rounded-pill px-2 py-1"><i class="fa-solid fa-clock"></i> 近效期</span>';
                    }
                }
            },
            { 
                data: 'actionSuggestion',
                render: function (data) {
                    return `<span class="small text-info"><i class="fa-solid fa-bolt me-1"></i>${data}</span>`;
                }
            }
        ]
    });
}

// 3. 馬來西亞出差倒數計時器
function initMissionCountdown() {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 14);
    targetDate.setHours(targetDate.getHours() + 9);

    function updateClock() {
        const now = new Date().getTime();
        const diff = targetDate.getTime() - now;

        if (diff > 0) {
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            $('#cdDays').text(String(days).padStart(2, '0'));
            $('#cdHours').text(String(hours).padStart(2, '0'));
            $('#cdMins').text(String(minutes).padStart(2, '0'));
            $('#cdSecs').text(String(seconds).padStart(2, '0'));
        }
    }

    setInterval(updateClock, 1000);
    updateClock();
}