// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    // 1. 初始化 DataTable.js (暗黑主題配對)
    const materialsTable = $('#materialsTable').DataTable({
        "language": {
            "url": "https://cdn.datatables.net/plug-ins/1.13.7/i18n/zh-TW.json"
        },
        "pageLength": 5,
        "lengthMenu": [5, 10, 20],
        "ordering": true,
        "responsive": true
    });

    // 2. 初始化 Chart.js (學習進度圓弧圖)
    const ctx = document.getElementById('learningProgressChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['已通關階段', '未解鎖階段'],
            datasets: [{
                data: [75, 25],
                backgroundColor: [
                    '#38bdf8',
                    '#334155'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ' ' + context.label + ': ' + context.raw + '%';
                        }
                    }
                }
            },
            cutout: '75%'
        }
    });

    // 3. PapaParse / gviz 動態數據抓取與欄位解耦架構實作
    function loadGoogleSheetData() {
        // 示範 GViz CSV 讀取 URL 結構
        const sheetId = 'YOUR_GOOGLE_SHEET_ID';
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Materials`;

        Papa.parse(gvizUrl, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (results.data && results.data.length > 0) {
                    // 清空 DataTable
                    materialsTable.clear();

                    // 欄位解耦對映映射 Adapter (不依賴固定的欄位標題文字)
                    results.data.forEach(function(row) {
                        const keys = Object.keys(row);
                        const title = row[keys[0]] || '未命名教材';
                        const category = row[keys[1]] || '通用';
                        const format = row[keys[2]] || 'PDF';
                        const stage = row[keys[3]] || '全階段';
                        const usage = row[keys[4]] || '自學研讀';
                        const downloadUrl = row[keys[5]] || '#';

                        materialsTable.row.add([
                            `<span class="fw-bold text-white"><i class="fa-regular fa-file text-info me-2"></i>${title}</span>`,
                            `<span class="badge bg-primary">${category}</span>`,
                            format,
                            stage,
                            usage,
                            `<a href="${downloadUrl}" class="btn btn-blue btn-sm" target="_blank"><i class="fa-solid fa-download me-1"></i>下載</a>`
                        ]);
                    });

                    materialsTable.draw();
                }
            },
            error: function(err) {
                console.log('Google 試算表動態同步訊息：使用預設備援資料庫。');
            }
        });
    }

    // 按鈕觸發同步
    $('#btnReloadSheet').on('click', function() {
        loadGoogleSheetData();
    });
});