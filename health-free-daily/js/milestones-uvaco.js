// Google 試算表 ID
const SHEET_ID = '1bufPMYTaMInbvI9IuJyNYBn58cQIqywqJ8tW-56yvnY';

// 當前選取區域與記憶體快取
let currentRegion = '台灣';
const historyCache = {
    '台灣': null,
    '馬來西亞': null
};

// 預設備用示範資料（當連線失敗或試算表空值時調用）
const fallbackDataMap = {
    '台灣': [
        {
            year: "2025",
            month: "08月",
            photo: "https://cdn.uvaco.com.tw/History/2025/0.png",
            content: "邁向國際市場，以嶄新形象「UVACO葡眾」面世，帶來「美滿生活 就此展開」的品牌信念，期許共創豐盈美好的生活面貌。"
        }
    ],
    '馬來西亞': [
        {
            year: "2026",
            month: "May",
            photo: "https://cdn.uvaco.com.tw/History/2026/0.jpg",
            content: "The Kuala Lumpur, Malaysia branch has officially commenced operations."
        }
    ]
};

// 核心修改：監聽 vendorReady 事件，確保 jQuery 與 Chart.js 已全部載入記憶體
window.addEventListener('vendorReady', function() {
    // 頁面初始化：載入預設區域（台灣）資料
    loadRegionTimeline(currentRegion);

    // 區域標籤切換事件處理
    $('#region-tabs .nav-link').on('click', function() {
        const selectedRegion = $(this).data('region');
        if (selectedRegion === currentRegion) return;

        // 更新標籤 active 樣式
        $('#region-tabs .nav-link').removeClass('active');
        $(this).addClass('active');

        // 切換當前區域並重置搜尋列
        currentRegion = selectedRegion;
        $('#timeline-search').val('');

        // 載入該區域資料
        loadRegionTimeline(currentRegion);
    });

    // 即時動態搜尋監聽 (Live Search)
    $('#timeline-search').on('input', function() {
        const keyword = $(this).val().trim().toLowerCase();
        renderFilteredTimeline(keyword);
    });
});

// 讀取指定區域的時間軸資料（快取優先）
function loadRegionTimeline(regionName) {
    // 若快取中已存在資料，直接繪製
    if (historyCache[regionName] !== null) {
        renderFilteredTimeline($('#timeline-search').val().trim().toLowerCase());
        return;
    }

    // 顯示載入動畫
    showLoadingSpinner(regionName);

    // Google Visualization API Endpoint
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(regionName)}`;

    $.ajax({
        url: gvizUrl,
        dataType: 'text',
        success: function(response) {
            try {
                const jsonString = response.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/)[1];
                const data = JSON.parse(jsonString);
                const rows = data.table.rows;

                if (!rows || rows.length === 0) {
                    historyCache[regionName] = fallbackDataMap[regionName] || [];
                    renderFilteredTimeline($('#timeline-search').val().trim().toLowerCase());
                    return;
                }

                let parsedData = [];
                rows.forEach(row => {
                    if (!row.c) return;
                    parsedData.push({
                        year: row.c[0] && row.c[0].v ? String(row.c[0].v) : '',
                        month: row.c[1] && row.c[1].v ? String(row.c[1].v) : '',
                        photo: row.c[2] && row.c[2].v ? String(row.c[2].v) : '',
                        content: row.c[3] && row.c[3].v ? String(row.c[3].v) : ''
                    });
                });

                historyCache[regionName] = parsedData.length > 0 ? parsedData : (fallbackDataMap[regionName] || []);
                renderFilteredTimeline($('#timeline-search').val().trim().toLowerCase());

            } catch (e) {
                console.warn(`解析【${regionName}】試算表失敗，切換至備用展示資料:`, e);
                historyCache[regionName] = fallbackDataMap[regionName] || [];
                renderFilteredTimeline($('#timeline-search').val().trim().toLowerCase());
            }
        },
        error: function(xhr, status, error) {
            console.warn(`無法連線【${regionName}】試算表，切換至備用展示資料:`, error);
            historyCache[regionName] = fallbackDataMap[regionName] || [];
            renderFilteredTimeline($('#timeline-search').val().trim().toLowerCase());
        }
    });
}

// 依據搜尋關鍵字過濾並繪製時間軸
function renderFilteredTimeline(keyword) {
    const rawItems = historyCache[currentRegion];
    if (!rawItems) return;

    const $container = $('#timeline-wrapper');
    $container.empty();

    if (rawItems.length === 0) {
        $container.html('<div class="text-center text-muted py-5"><i class="fa-regular fa-folder-open me-2"></i> 目前尚無相關歷史大事記資料</div>');
        return;
    }

    // 多維度過濾（年份、月份/標籤、內容）
    const filteredItems = rawItems.filter(item => {
        if (!keyword) return true;
        return (item.year && item.year.toLowerCase().includes(keyword)) ||
                (item.month && item.month.toLowerCase().includes(keyword)) ||
                (item.content && item.content.toLowerCase().includes(keyword));
    });

    if (filteredItems.length === 0) {
        $container.html(`
            <div class="text-center py-5">
                <i class="fa-solid fa-magnifying-glass me-2"></i> 查無符合條件的大事記記錄
            </div>
        `);
        return;
    }

    // 按年份分組
    const groupedByYear = {};
    filteredItems.forEach(item => {
        const y = item.year || '歷史里程';
        if (!groupedByYear[y]) groupedByYear[y] = [];
        groupedByYear[y].push(item);
    });

    // 按年份降冪排序 (最新的年份在最上面)
    const sortedYears = Object.keys(groupedByYear).sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
        return b.localeCompare(a);
    });

    sortedYears.forEach(year => {
        let yearBlockHtml = `
            <div class="timeline-year-block">
                <div class="timeline-year-header">
                    <div class="year-badge">
                        <i class="fa-solid fa-flag-checkered me-2 text-warning"></i> ${year}
                    </div>
                </div>
        `;

        groupedByYear[year].forEach(item => {
            const hasPhoto = item.photo && item.photo.trim() !== '';
            const monthText = item.month || '';

            // 動態判斷是否為「年度業績」關鍵字
            const isPerformance = monthText.includes('業績') || 
                                    monthText.includes('Performance') || 
                                    monthText.includes('Sales') || 
                                    monthText.includes('Revenue');

            const nodeStyleClass = isPerformance ? 'performance-dot' : 'green-dot';
            const pillIconClass  = isPerformance ? 'fa-solid fa-trophy' : 'fa-regular fa-calendar-check';
            const pillStyleClass  = isPerformance ? 'performance-pill' : 'month-pill';
            const cardStyleClass  = isPerformance ? 'performance-card' : 'green-card';

            yearBlockHtml += `
                <div class="timeline-item">
                    <div class="timeline-node">
                        <div class="node-dot ${nodeStyleClass}"></div>
                    </div>

                    <div class="timeline-content-card ${cardStyleClass}">
                        <div class="${pillStyleClass} mb-2">
                            <i class="${pillIconClass} me-1"></i> ${monthText}
                        </div>
                        <div class="card-body-wrapper ${hasPhoto ? 'has-image' : ''}">
                            ${hasPhoto ? `
                                <div class="event-photo-container">
                                    <img src="${item.photo}" alt="UVACO History Image" class="event-photo" loading="lazy">
                                </div>
                            ` : ''}
                            <div class="event-text">
                                ${item.content}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        yearBlockHtml += `</div>`;
        $container.append(yearBlockHtml);
    });
}

// 顯示載入動畫
function showLoadingSpinner(regionName) {
    $('#timeline-wrapper').html(`
        <div id="loading-spinner" class="text-center col-12">
            <div class="spinner-border mb-3" role="status" style="width: 2.5rem; height: 2.5rem;">
                <span class="visually-hidden">Loading...</span>
            </div>
            <div>【${regionName}】UVACO 大事記同步中...</div>
        </div>
    `);
}

// HTML 轉義安全性防護 (XSS 防禦)
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}