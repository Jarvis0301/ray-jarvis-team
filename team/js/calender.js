// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    
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
    // 示範用 Google Sheet ID (可替換為團隊真實試算表 ID)
    const sheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Events`;

    Papa.parse(gvizUrl, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            if (results.data && results.data.length > 0) {
                renderEventsTable(results.data);
            } else {
                renderFallbackEventsData();
            }
        },
        error: function (err) {
            console.warn('Google 試算表擷取失敗，載入備用預設行程:', err);
            renderFallbackEventsData();
        }
    });
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
                <td><i class="fa-regular fa-clock text-info"></i> ${dateStr}</td>
                <td>${badgeHtml}</td>
                <td class="fw-bold text-light">${title}</td>
                <td><i class="fa-solid fa-user-circle text-secondary"></i> ${speaker}</td>
                <td><small class="text-secondary">${location}</small></td>
                <td>
                    <button class="btn btn-sm btn-outline-custom" onclick="alert('已複製會議詳細資訊！')">
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
 * 備用預設靜態數據 (當 Google 試算表尚未連線時顯示)
 */
function renderFallbackEventsData() {
    const fallbackData = [
        {
            date: '2026/08/10 20:00',
            category: '線上研討',
            title: '榮祥團隊新星啟航 SOP 線上說明會',
            speaker: 'Ray 藍鑽',
            location: 'Zoom 房號: 888-999-000'
        },
        {
            date: '2026/08/15 14:00',
            category: '實體聚會',
            title: '全台月度表揚大會與事業榮譽論壇',
            speaker: 'Jarvis 與 核心團隊',
            location: '台北國際會議中心 301 室'
        },
        {
            date: '2026/08/20 20:30',
            category: '高階會議',
            title: '珍珠/藍鑽級領導人全球戰略會報',
            speaker: '創始領導人會議',
            location: '加密線上會議室'
        },
        {
            date: '2026/08/25 19:30',
            category: '線上研討',
            title: '葡眾產品全能防護系列深度拆解',
            speaker: '產品戰略顧問',
            location: 'Zoom 房號: 777-666-555'
        }
    ];

    const $tbody = $('#eventsTableBody');
    $tbody.empty();

    fallbackData.forEach(item => {
        let badgeHtml = '<span class="badge badge-online"><i class="fa-solid fa-video"></i> 線上</span>';
        if (item.category.includes('實體')) {
            badgeHtml = '<span class="badge badge-offline"><i class="fa-solid fa-users"></i> 實體</span>';
        } else if (item.category.includes('高階')) {
            badgeHtml = '<span class="badge badge-leadership"><i class="fa-solid fa-crown"></i> 領導</span>';
        }

        const trHtml = `
            <tr>
                <td class="text-nowrap"><i class="fa-regular fa-clock text-info"></i> ${item.date}</td>
                <td>${badgeHtml}</td>
                <td class="fw-bold text-light">${item.title}</td>
                <td><i class="fa-solid fa-user-circle text-secondary"></i> ${item.speaker}</td>
                <td><small class="text-secondary">${item.location}</small></td>
                <td>
                    <button class="btn btn-sm btn-outline-custom" onclick="copyEventDetail('${item.title}', '${item.date}', '${item.location}')">
                        <i class="fa-solid fa-copy"></i> 複製資訊
                    </button>
                </td>
            </tr>
        `;
        $tbody.append(trHtml);
    });

    initDataTable();
}

/**
 * 初始化 DataTable.js 配置
 */
function initDataTable() {
    if ($.fn.DataTable.isDataTable('#eventsDataTable')) {
        $('#eventsDataTable').DataTable().destroy();
    }

    $('#eventsDataTable').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.8/i18n/zh-TW.json'
        },
        responsive: true,
        pageLength: 5,
        lengthMenu: [5, 10, 20],
        order: [[0, 'asc']],
        columnDefs: [
            { orderable: false, targets: [5] } // 操作列不提供排序
        ]
    });
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