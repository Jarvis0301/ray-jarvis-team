// ==========================================
// 1. Google 試算表欄位名稱解耦字典 (Adapter Pattern)
// ==========================================
const sheetColumnMapping = {
    id: ['產品編號', 'ID', 'Item_ID', 'p_id'],
    name: ['產品名稱', '品名', 'Product_Name', 'p_name'],
    category: ['產品類別', '分類', 'Category', 'cat'],
    stock: ['實體庫存', '現有庫存', 'Stock_Qty', 'qty'],
    pv: ['單品 PV', 'PV點數', 'PV'],
    sv: ['單品 SV', 'SV金額', 'SV'],
    status: ['庫存狀態', '狀態', 'Status']
};

// 解耦轉接器函式：確保標頭名稱修改時系統依然穩定運作
function adaptSheetData(rawRows) {
    if (!rawRows || rawRows.length === 0) return [];
    const headers = Object.keys(rawRows[0]);

    const findHeaderKey = (possibleNames) => {
        return headers.find(h => possibleNames.includes(h.trim())) || possibleNames[0];
    };

    const keyMap = {
        id: findHeaderKey(sheetColumnMapping.id),
        name: findHeaderKey(sheetColumnMapping.name),
        category: findHeaderKey(sheetColumnMapping.category),
        stock: findHeaderKey(sheetColumnMapping.stock),
        pv: findHeaderKey(sheetColumnMapping.pv),
        sv: findHeaderKey(sheetColumnMapping.sv),
        status: findHeaderKey(sheetColumnMapping.status)
    };

    return rawRows.map(row => ({
        id: row[keyMap.id] || 'N/A',
        name: row[keyMap.name] || '未指定品項',
        category: row[keyMap.category] || '通用保健',
        stock: parseInt(row[keyMap.stock]) || 0,
        pv: parseInt(row[keyMap.pv]) || 0,
        sv: parseInt(row[keyMap.sv]) || 0,
        status: row[keyMap.status] || '正常'
    }));
}

// 模擬從 Google 試算表 (GViz/PapaParse) 抓回之原始 Raw Data
const mockRawSheetData = [
    { "產品編號": "P001", "產品名稱": "康爾喜 (NBF 益生菌)", "產品類別": "保健食品", "實體庫存": 140, "單品 PV": 1200, "單品 SV": 1512, "庫存狀態": "充足" },
    { "產品編號": "P002", "產品名稱": "樟芝益 (Antrodia)", "產品類別": "保健食品", "實體庫存": 8, "單品 PV": 2840, "單品 SV": 3578, "庫存狀態": "低庫存預警" },
    { "產品編號": "P003", "產品名稱": "995 營養液", "產品類別": "保健食品", "實體庫存": 85, "單品 PV": 2840, "單品 SV": 3578, "庫存狀態": "充足" },
    { "產品編號": "P004", "產品名稱": "迪斯尼 (衛傑)", "產品類別": "保健食品", "實體庫存": 5, "單品 PV": 1350, "單品 SV": 1701, "庫存狀態": "低庫存預警" },
    { "產品編號": "P005", "產品名稱": "雅姿保養精華", "產品類別": "個人保養", "實體庫存": 42, "單品 PV": 950, "單品 SV": 1197, "庫存狀態": "正常" }
];

// ==========================================
// 2. 初始化 DataTable.js
// ==========================================
let dataTableInstance = null;

function initDataTable() {
    const cleanData = adaptSheetData(mockRawSheetData);

    const tableBody = cleanData.map(item => {
        let badgeClass = 'bg-success';
        if (item.status.includes('預警') || item.stock < 10) {
            badgeClass = 'bg-danger text-white';
        } else if (item.stock < 50) {
            badgeClass = 'bg-warning text-dark';
        }

        return `
            <tr>
                <td class="font-monospace fw-bold text-purple-light">${item.id}</td>
                <td class="fw-bold">${item.name}</td>
                <td><span class="badge bg-secondary">${item.category}</span></td>
                <td class="font-monospace fw-bold">${item.stock}</td>
                <td class="font-monospace">${item.pv.toLocaleString()}</td>
                <td class="font-monospace text-warning">${item.sv.toLocaleString()}</td>
                <td><span class="badge ${badgeClass}">${item.status}</span></td>
            </tr>
        `;
    }).join('');

    $('#inventoryTable tbody').html(tableBody);

    dataTableInstance = $('#inventoryTable').DataTable();
}

// ==========================================
// 3. 初始化 Chart.js 圖表
// ==========================================
let trendChart = null;

function initChart() {
    const ctx = document.getElementById('svTrendChart').getContext('2d');
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['3月', '4月', '5月', '6月', '7月', '8月 (本月)'],
            datasets: [
                {
                    label: 'SV 銷售總金額',
                    data: [1200000, 1350000, 1420000, 1600000, 1640000, 1850000],
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.15)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3
                },
                {
                    label: 'PV 積分總量',
                    data: [950000, 1080000, 1150000, 1280000, 1310000, 1480000],
                    borderColor: '#f59e0b',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#f8fafc',
                        font: { size: 13 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(51, 38, 99, 0.5)' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    grid: { color: 'rgba(51, 38, 99, 0.5)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

// ==========================================
// 4. 預留圖片 Slot 動態載入範例功能
// ==========================================
function toggleSampleImage(containerId, imageUrl) {
    const container = document.getElementById(containerId);
    const existingImg = container.querySelector('img');

    if (existingImg) {
        existingImg.remove();
    } else {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = "創始人自訂預留照片";
        container.appendChild(img);
    }
}

function reloadChartData() {
    if (trendChart) {
        trendChart.data.datasets[0].data = trendChart.data.datasets[0].data.map(v => v + Math.floor(Math.random() * 50000));
        trendChart.update();
    }
}

function logoutSystem() {
    if (confirm("確定要登出核心樞系統？")) {
        localStorage.removeItem('ray_team_auth_session');
        window.location.href = 'login.html';
    }
}

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    initDataTable();
    initChart();
});