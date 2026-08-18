/* TO DO：改成在JS中不要有預設資料，如果連不到試算表就跳出提示（AppDialog.alert）

AppDialog.alert範例：
「
    AppDialog.alert("請先選擇至少一項商品後再下載 Excel！", {
        title: "未選擇商品",
        icon: "fa-solid fa-circle-exclamation text-warning"
    });
」 */

// 設定 Google 試算表 ID 與工作表名稱 (營運時替換此處ID)
const SPREADSHEET_ID = 'YOUR_GOOGLE_SHEET_ID'; // 請替換為團隊實際試算表 ID
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    // 1. Chart.js 初始化：軍備資產分佈圖
    const ctx = document.getElementById('resourceChart').getContext('2d');
    const resourceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['產品資源', '簡報資源', '培訓教材'],
            datasets: [{
                data: [45, 25, 30],
                backgroundColor: [
                    '#38bdf8', // 電光藍
                    '#facc15', // 戰略金
                    '#34d399'  // 翡翠綠
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
                    labels: {
                        color: '#94a3b8',
                        font: {
                            family: 'Noto Sans TC',
                            size: 12
                        },
                        padding: 15
                    }
                }
            },
            cutout: '70%'
        }
    });

    // 2. 備用靜態數據 (當 Google 試算表尚未設定或連線異常時自動降級備援)
    const fallbackData = [
        { id: "RES-001", title: "2026 最新葡眾產品型錄 HD", category: "產品資源", type: "PDF", date: "2026-01-15", url: "https://drive.google.com" },
        { id: "RES-002", title: "康爾喜 / 康爾喜-N 比較海報", category: "產品資源", type: "PNG", date: "2026-02-01", url: "https://drive.google.com" },
        { id: "RES-003", title: "15分鐘事業招商簡報 (OPP)", category: "簡報資源", type: "PPTX", date: "2026-02-10", url: "https://drive.google.com" },
        { id: "RES-004", title: "新人起步 100 天實戰 SOP 手冊", category: "培訓教材", type: "PDF", date: "2026-01-20", url: "https://drive.google.com" },
        { id: "RES-005", title: "葡眾四大獎金制度算式解構", category: "培訓教材", type: "PDF", date: "2026-02-05", url: "https://drive.google.com" }
    ];

    // 3. 欄位名稱解耦映射表 (Header Mapping Strategy)
    const HEADER_MAP = {
        id: ['編號', '序號', 'ID', 'id'],
        title: ['資源名稱', '檔案標題', '標題', 'Title', 'Name'],
        category: ['分類', '資源類別', '類別', 'Category'],
        type: ['檔案類型', '類型', '格式', 'Type'],
        date: ['更新日期', '日期', 'Date'],
        url: ['雲端連結', '連結', '網址', 'URL', 'Link']
    };

    // 解耦解析函式：尋找符合的 key
    function getFieldValue(row, possibleKeys, defaultValue = '') {
        for (let key of possibleKeys) {
            if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                return row[key];
            }
        }
        return defaultValue;
    }

    // 4. 初始化 DataTable
    let dataTable = $('#resourceTable').DataTable({
        columns: [
            { data: 'id' },
            { data: 'title' },
            { 
                data: 'category',
                render: function(data) {
                    let badgeClass = 'bg-secondary';
                    if (data === '產品資源') badgeClass = 'bg-info text-dark';
                    if (data === '簡報資源') badgeClass = 'bg-warning text-dark';
                    if (data === '培訓教材') badgeClass = 'bg-success';
                    return `<span class="badge ${badgeClass}">${data}</span>`;
                }
            },
            { data: 'type' },
            { data: 'date' },
            { 
                data: 'url',
                render: function(data) {
                    return `<a href="${data}" target="_blank" class="btn btn-sm btn-outline-info">
                        <i class="fa-solid fa-cloud-arrow-down"></i> 前往下載
                    </a>`;
                }
            }
        ]
    });

    // 5. 抓取 Google 試算表 (gviz/PapaParse)

    Papa.parse(GVIZ_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (results.data && results.data.length > 0) {
                // 欄位解耦轉換
                const parsedData = results.data.map((row, index) => {
                    return {
                        id: getFieldValue(row, HEADER_MAP.id, `RES-${(index + 1).toString().padStart(3, '0')}`),
                        title: getFieldValue(row, HEADER_MAP.title, '未命名檔案'),
                        category: getFieldValue(row, HEADER_MAP.category, '一般資源'),
                        type: getFieldValue(row, HEADER_MAP.type, 'FILE'),
                        date: getFieldValue(row, HEADER_MAP.date, '2026-01-01'),
                        url: getFieldValue(row, HEADER_MAP.url, 'https://drive.google.com')
                    };
                });

                dataTable.clear().rows.add(parsedData).draw();
                $('#syncStatus').html('<i class="fa-solid fa-circle-check text-success"></i> 已同步最新雲端資料');
            } else {
                renderFallback();
            }
        },
        error: function() {
            renderFallback();
        }
    });

    // 連線失敗或無 Sheet ID 時載入備份數據
    function renderFallback() {
        dataTable.clear().rows.add(fallbackData).draw();
        $('#syncStatus').html('<i class="fa-solid fa-triangle-exclamation text-warning"></i> 使用預設離線清單');
    }

});