// Google 試算表 ID
const SPREADSHEET_ID = '1RCto8TOW2efggT_eUAvb9N-DJT2Z0OlqiEsraVC8QcI';

// 當前選取區域狀態與快取記憶體
let currentRegion = '台灣';
const announcementCache = {
    '台灣': null,
    '馬來西亞': null
};

// 分類色彩配置對照表
const categoryMap = {
    '重要': { itemClass: 'announcement-important', badgeClass: 'bg-danger' },
    '活動': { itemClass: 'announcement-activity', badgeClass: 'bg-primary' },
    '權益': { itemClass: 'announcement-benefit', badgeClass: 'bg-info text-dark' },
    '產品': { itemClass: 'announcement-product', badgeClass: 'bg-success' },
    '法務': { itemClass: 'announcement-legal', badgeClass: 'bg-warning text-dark' },
    '其他': { itemClass: 'announcement-other', badgeClass: 'bg-secondary' },
    'Important': { itemClass: 'announcement-important', badgeClass: 'bg-danger' },
    'Activity': { itemClass: 'announcement-activity', badgeClass: 'bg-primary' },
    'Benefit': { itemClass: 'announcement-benefit', badgeClass: 'bg-info text-dark' },
    'Product': { itemClass: 'announcement-product', badgeClass: 'bg-success' },
    'Legal': { itemClass: 'announcement-legal', badgeClass: 'bg-warning text-dark' },
    'Other': { itemClass: 'announcement-other', badgeClass: 'bg-secondary' }
};

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function () {
    // 頁面初始化：自動載入預設區域（台灣）資料
    loadRegionData(currentRegion);

    // 標籤切換事件監聽
    $('#region-tabs .nav-link').on('click', function () {
        const selectedRegion = $(this).data('region');

        if (selectedRegion === currentRegion) return;

        // 更新標籤高亮樣式
        $('#region-tabs .nav-link').removeClass('active');
        $(this).addClass('active');

        // 切換當前區域並重置搜尋框
        currentRegion = selectedRegion;
        $('#announcement-search').val('');

        // 載入資料
        loadRegionData(currentRegion);
    });

    // 搜尋框即時輸入監聽 (Live Search)
    $('#announcement-search').on('input', function () {
        const keyword = $(this).val().trim().toLowerCase();
        renderFilteredAnnouncements(keyword);
    });
});

// 載入指定區域資料（包含快取防護）
function loadRegionData(regionName) {
    // 若該區域已有快取資料，直接進行畫面渲染
    if (announcementCache[regionName] !== null) {
        renderFilteredAnnouncements($('#announcement-search').val().trim().toLowerCase());
        return;
    }

    // 顯示載入中動畫
    showLoadingSpinner();

    // Google Visualization API Endpoint
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(regionName)}`;

    $.ajax({
        url: gvizUrl,
        dataType: 'text',
        success: function (response) {
            try {
                // 解析 Google gviz 回傳 JSON 格式
                const jsonMatch = response.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
                if (!jsonMatch || !jsonMatch[1]) {
                    throw new Error('無效的資料格式');
                }

                const data = JSON.parse(jsonMatch[1]);
                const rows = data.table ? data.table.rows : [];

                const parsedItems = [];

                if (rows && rows.length > 0) {
                    rows.forEach(function (row) {
                        if (!row.c) return;

                        const category = row.c[0] && row.c[0].v ? $.trim(row.c[0].v) : '其他';
                        const title = row.c[1] && row.c[1].v ? row.c[1].v : '無標題';
                        const linkUrl = row.c[2] && row.c[2].v ? row.c[2].v : '#';

                        let dateStr = '';
                        if (row.c[3] && row.c[3].f) {
                            dateStr = row.c[3].f;
                        } else if (row.c[3] && row.c[3].v) {
                            dateStr = row.c[3].v;
                        } else {
                            dateStr = '最新公告';
                        }

                        parsedItems.push({
                            category: category,
                            title: title,
                            linkUrl: linkUrl,
                            dateStr: dateStr
                        });
                    });
                }

                // 寫入全域記憶體快取
                announcementCache[regionName] = parsedItems;

                // 繪製過濾後的公告清單
                renderFilteredAnnouncements($('#announcement-search').val().trim().toLowerCase());

            } catch (e) {
                handleFetchError(regionName, e);
            }
        },
        error: function (xhr, status, error) {
            handleFetchError(regionName, error);
        }
    });
}

// 錯誤處理與提示視窗
function handleFetchError(regionName, err) {
    console.error(`無法連線【${regionName}】公告試算表:`, err);

    announcementCache[regionName] = [];
    $('#announcement-container').html(`
        <div class="text-center text-danger py-4">
            <i class="fa-solid fa-circle-exclamation me-1"></i> 無法載入【${regionName}】公告，請檢查網路連線或試算表權限。
        </div>
    `);

    if (typeof AppDialog !== 'undefined' && AppDialog.alert) {
        AppDialog.alert(`無法載入【${regionName}】最新公告，請確認網路連線或試算表讀取權限！`, {
            title: "連線失敗",
            icon: "fa-solid fa-circle-exclamation text-danger"
        });
    }
}

// 依據關鍵字過濾並繪製公告清單 HTML
function renderFilteredAnnouncements(keyword) {
    const rawData = announcementCache[currentRegion];

    if (!rawData) return;

    const $container = $('#announcement-container');
    $container.empty();

    if (rawData.length === 0) {
        $container.html('<div class="text-center text-muted py-4"><i class="fa-regular fa-folder-open me-1"></i> 目前尚無最新公告資料</div>');
        return;
    }

    // 比對標題與分類
    const filteredData = rawData.filter(item => {
        if (!keyword) return true;
        return item.title.toLowerCase().includes(keyword) ||
            item.category.toLowerCase().includes(keyword);
    });

    if (filteredData.length === 0) {
        $container.html(`
            <div class="text-center py-4">
                <i class="fa-solid fa-magnifying-glass me-1"></i> 查無符合條件的公告內容
            </div>
        `);
        return;
    }

    // 遍歷繪製卡片
    filteredData.forEach(item => {
        const config = categoryMap[item.category] || { itemClass: 'announcement-other', badgeClass: 'bg-secondary' };

        const cardHtml = `
            <a href="${item.linkUrl}" target="_blank" rel="noopener noreferrer" class="announcement-title">
                <div class="announcement-item ${config.itemClass}">
                    <div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            <span class="badge ${config.badgeClass}">${item.category}</span>
                            <span class="fs-6">
                                ${item.title}
                            </span>
                        </div>
                        <div class="announcement-date">
                            <i class="fa-regular fa-calendar-days me-1"></i> ${item.dateStr}
                        </div>
                    </div>
                </div>
            </a>
        `;

        $container.append(cardHtml);
    });
}

// 顯示 Loading Spinner
function showLoadingSpinner() {
    $('#announcement-container').html(`
        <div id="loading-spinner" class="text-center col-12">
            <div class="spinner-border mb-3" role="status" style="width: 2.5rem; height: 2.5rem;">
                <span class="visually-hidden">Loading...</span>
            </div>
            <div class="fs-6">【${currentRegion}】最新公告同步中...</div>
        </div>
    `);
}