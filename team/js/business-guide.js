/* TO DO：改成在JS中不要有預設資料，如果連不到試算表就跳出提示（AppDialog.alert）

AppDialog.alert範例：
「
    AppDialog.alert("請先選擇至少一項商品後再下載 Excel！", {
        title: "未選擇商品",
        icon: "fa-solid fa-circle-exclamation text-warning"
    });
」 */

// 設定 Google 試算表 ID 與工作表名稱 (營運時替換此處ID)
const SPREADSHEET_ID = 'YOUR_GOOGLE_SPREADSHEET_ID_HERE';
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=BusinessGuide`;

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    // 1. 初始化 DataTable.js
    const table = $('#guideTable').DataTable({
        "language": {
            "url": "https://cdn.datatables.net/plug-ins/1.13.7/i18n/zh-TW.json"
        },
        "pageLength": 5,
        "responsive": true,
        "order": [[0, 'asc']]
    });

    // 2. 初始化 Chart.js - 漏斗模型圖 (Doughnut)
    const ctxFunnel = document.getElementById('funnelChart').getContext('2d');
    new Chart(ctxFunnel, {
        type: 'doughnut',
        data: {
            labels: ['接觸與暖身', '需求引導', 'OPP 招商說明', '成交與進系統'],
            datasets: [{
                data: [100, 45, 20, 8],
                backgroundColor: [
                    '#38bdf8',
                    '#06b6d4',
                    '#0284c7',
                    '#10b981'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { size: 11 } }
                }
            }
        }
    });

    // 3. 初始化 Chart.js - 管道效益統計圖 (Bar)
    const ctxChannel = document.getElementById('channelChart').getContext('2d');
    new Chart(ctxChannel, {
        type: 'bar',
        data: {
            labels: ['親友暖身', '社群媒體 (IG/FB)', '線上研討會', '線下家庭聚會', '舊客戶轉介紹'],
            datasets: [{
                label: '平均月成功轉化人數',
                data: [12, 19, 15, 8, 22],
                backgroundColor: '#38bdf8',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                },
                y: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#94a3b8' }
                }
            }
        }
    });

    // 4. Google 試算表 PapaParse 動態抓取與解耦邏輯
    function fetchSheetData() {
        // 若沒有真實 ID 則提示並跳過實質抓取
        if (SPREADSHEET_ID === 'YOUR_GOOGLE_SPREADSHEET_ID_HERE') {
            console.log('請設定有效的 Google 試算表 ID 以動態載入最新話術資料。');
            return;
        }

        Papa.parse(GVIZ_URL, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                const rawData = results.data;
                if (rawData && rawData.length > 0) {
                    // 解耦機制：自動比對與適應欄位名稱
                    table.clear();
                    rawData.forEach(row => {
                        const keys = Object.keys(row);
                        // 採用欄位 key 的包含字詞比對，達成就地解耦
                        const category = row[keys.find(k => k.includes('分類') || k.includes('Category'))] || '通用';
                        const target = row[keys.find(k => k.includes('受眾') || k.includes('情境') || k.includes('Target'))] || '-';
                        const painPoint = row[keys.find(k => k.includes('痛點') || k.includes('切入'))] || '-';
                        const script = row[keys.find(k => k.includes('話術') || k.includes('SOP') || k.includes('Script'))] || '-';
                        const note = row[keys.find(k => k.includes('注意') || k.includes('備註') || k.includes('Note'))] || '-';

                        table.row.add([
                            `<span class="badge badge-category"><i class="fa-solid fa-tag me-1"></i> ${category}</span>`,
                            target,
                            painPoint,
                            script,
                            note
                        ]);
                    });
                    table.draw();
                }
            },
            error: function(err) {
                console.error('抓取 Google 試算表資料失敗:', err);
            }
        });
    }

    $('#btnReloadSheet').on('click', function() {
        fetchSheetData();
    });
});