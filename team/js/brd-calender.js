// 設定 Google 試算表 ID 與工作表名稱 (營運時替換此處ID)
const SPREADSHEET_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Events`;

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function () {

    // 1. 初始化 Google Calendar 濾鏡主題切換功能
    initCalendarThemeToggle();

    // 2. 初始化 Chart.js 活動分佈圖表
    initEventDistributionChart();

    // 3. 從 Google 試算表動態載入活動清單 (PapaParse + gviz API)
    fetchGoogleSheetEvents();

});

/**
 * 1. Google 行事曆深色/淺色濾鏡切換控制
 */
function initCalendarThemeToggle() {
    $('#toggleThemeBtn').on('click', function () {
        const $wrapper = $('#calendarContainer');
        $wrapper.toggleClass('light-mode');

        if ($wrapper.hasClass('light-mode')) {
            $(this).html('<i class="fa-solid fa-moon"></i> 切換深色模式');
        } else {
            $(this).html('<i class="fa-solid fa-circle-half-stroke"></i> 切換深/淺模式');
        }
    });
}

/**
 * 2. 初始化 Chart.js 活動型態分佈圖表
 */
function initEventDistributionChart() {
    const ctx = document.getElementById('eventDistributionChart').getContext('2d');

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['線上直播研討', '線下表揚/聚會', '高階領導會議', '新人培訓營'],
            datasets: [{
                data: [16, 9, 3, 5],
                backgroundColor: [
                    '#38bdf8', // 電光藍
                    '#34d399', // 翡翠綠
                    '#facc15', // 高亮黃
                    '#818cf8'  // 紫羅蘭
                ],
                borderWidth: 2,
                borderColor: '#0f172a'
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
                        padding: 15,
                        font: {
                            size: 11
                        }
                    }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#38bdf8',
                    bodyColor: '#f8fafc',
                    borderColor: '#334155',
                    borderWidth: 1
                }
            },
            cutout: '70%'
        }
    });
}

/**
 * 3. Google 試算表動態數據抓取與欄位解耦 (PapaParse + gviz)
 */
function fetchGoogleSheetEvents() {
    Papa.parse(GVIZ_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            if (results.data && results.data.length > 0) {
                renderEventsTable(results.data);
            } else {
                handleFetchError('試算表內無活動行程資料');
            }
        },
        error: function (err) {
            handleFetchError(err);
        }
    });
}

/**
 * 錯誤處理與提示視窗
 */
function handleFetchError(err) {
    console.error('Google 試算表行程資料載入失敗:', err);

    // 清空表格並重新初始化 DataTable 以呈現空狀態
    renderEventsTable([]);

    if (typeof AppDialog !== 'undefined' && AppDialog.alert) {
        AppDialog.alert("無法載入行程活動資料，請確認網路連線或試算表讀取權限！", {
            title: "連線失敗",
            icon: "fa-solid fa-circle-exclamation text-danger"
        });
    }
}

/**
 * 欄位名稱解耦比對器 (Field Decoupling Adapter)
 */
function getDecoupledValue(row, possibleKeys, defaultValue) {
    const keys = Object.keys(row);
    for (let possibleKey of possibleKeys) {
        const matchedKey = keys.find(k => k.trim().toLowerCase().includes(possibleKey.toLowerCase()));
        if (matchedKey && row[matchedKey]) {
            return row[matchedKey].trim();
        }
    }
    return defaultValue;
}

/**
 * 渲染動態表格數據並初始化 DataTable.js
 */
function renderEventsTable(data) {
    const $tbody = $('#eventsTableBody');
    $tbody.empty();

    data.forEach(row => {
        // 進行解耦提取
        const dateStr = getDecoupledValue(row, ['日期', '時間', 'date', 'time'], '未定');
        const category = getDecoupledValue(row, ['類別', '類型', 'category', 'type'], '一般');
        const title = getDecoupledValue(row, ['主題', '名稱', 'title', 'event'], '團隊研討');
        const speaker = getDecoupledValue(row, ['主講', '講師', 'speaker', 'host'], '核心幹部');
        const location = getDecoupledValue(row, ['地點', '連結', 'location', 'link'], '線上 Zoom');

        let badgeHtml = '<span class="badge badge-online"><i class="fa-solid fa-video"></i> 線上</span>';
        if (category.includes('線下') || category.includes('實體')) {
            badgeHtml = '<span class="badge badge-offline"><i class="fa-solid fa-users"></i> 實體</span>';
        } else if (category.includes('高階') || category.includes('領導')) {
            badgeHtml = '<span class="badge badge-leadership"><i class="fa-solid fa-crown"></i> 領導</span>';
        }

        const trHtml = `
            <tr>
                <td class="text-nowrap"><i class="fa-regular fa-clock text-info"></i> ${dateStr}</td>
                <td>${badgeHtml}</td>
                <td class="fw-bold text-light">${title}</td>
                <td><i class="fa-solid fa-user-circle text-secondary"></i> ${speaker}</td>
                <td><small class="text-secondary">${location}</small></td>
                <td>
                    <button class="btn btn-sm btn-outline-custom" onclick="copyEventDetail('${title}', '${dateStr}', '${location}')">
                        <i class="fa-solid fa-share-nodes"></i> 分享
                    </button>
                </td>
            </tr>
        `;
        $tbody.append(trHtml);
    });

    // 初始化 DataTable
    initDataTable();
}

/**
 * 初始化 DataTable.js 配置
 */
function initDataTable() {
    if ($.fn.DataTable.isDataTable('#eventsDataTable')) {
        $('#eventsDataTable').DataTable().destroy();
    }

    $('#eventsDataTable').DataTable();
}

/**
 * 複製活動細節
 */
function copyEventDetail(title, time, location) {
    const text = `【榮祥團隊活動邀請】\n📌 活動主題：${title}\n⏰ 時間：${time}\n📍 地點/連結：${location}\n歡迎各位夥伴踴躍參加！`;
    navigator.clipboard.writeText(text).then(() => {
        alert('已將活動資訊複製至剪貼簿！');
    });
}

/**
 * 複製 iCal 訂閱連結
 */
function copyIcalLink() {
    const url = 'https://calendar.google.com/calendar/ical/f05b8ad09d9bf34cfe63c78b6d4b57f677036de772c76c59a41d440f1668dbb8%40group.calendar.google.com/public/basic.ics';
    navigator.clipboard.writeText(url).then(() => {
        alert('已複製 iCal 訂閱網址！');
    });
}