/* TO DO：改成在JS中不要有預設資料，如果連不到試算表就跳出提示（AppDialog.alert）

AppDialog.alert範例：
「
    AppDialog.alert("請先選擇至少一項商品後再下載 Excel！", {
        title: "未選擇商品",
        icon: "fa-solid fa-circle-exclamation text-warning"
    });
」 */

// 設定 Google 試算表 ID 與工作表名稱 (營運時替換此處ID)
const SPREADSHEET_ID = '1YOUR_GOOGLE_SHEET_ID_HERE'; 

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    // 1. 初始化 DataTable.js 最新動態表格
    $('#eventsTable').DataTable({
        "language": {
            "url": "https://cdn.datatables.net/plug-ins/1.13.7/i18n/zh-TW.json"
        },
        "pageLength": 5,
        "lengthChange": false,
        "searching": true,
        "ordering": true,
        "info": false
    });

    // 2. 初始化 Chart.js 健康防護矩陣雷達圖
    const ctx = document.getElementById('healthRadarChart').getContext('2d');
    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['消化道保健', '全能免疫防護', '精力與體質調節', '晶亮守護', '循環順暢', '骨骼與關鍵'],
            datasets: [{
                label: '產品配方覆蓋率 (%)',
                data: [98, 95, 90, 88, 85, 92],
                backgroundColor: 'rgba(16, 185, 129, 0.25)',
                borderColor: '#10b981',
                borderWidth: 2,
                pointBackgroundColor: '#34d399',
                pointBorderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    pointLabels: {
                        color: '#f8fafc',
                        font: { size: 12 }
                    },
                    ticks: {
                        display: false,
                        max: 100
                    }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#f8fafc' }
                }
            }
        }
    });

    // 3. PapaParse / Google 試算表資料解耦介面預留 (以 gviz/CSV 格式異步抓取動態)
    function fetchGoogleSheetNews(sheetId) {
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=LatestNews`;
        Papa.parse(sheetUrl, {
            download: true,
            header: true,
            complete: function(results) {
                const data = results.data;
                // 欄位解耦合映射範例：不直接依賴中文標題，透過 key 防禦
                console.log("已成功動態同步最新試算表資料，總筆數：", data.length);
            },
            error: function(err) {
                console.warn("未設定動態試算表 ID，採用預設靜態資料庫展示。");
            }
        });
    }

    // 呼叫試算表更新介面 (發布時帶入正式工作表 ID)
    fetchGoogleSheetNews(SPREADSHEET_ID);
});