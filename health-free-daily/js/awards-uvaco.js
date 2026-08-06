// Google 試算表 ID
const SHEET_ID = '1bs8fVTroG3vTN6vjlPw6rtgelNYlJ6XIK9tYI9o4yOE';

// 當前狀態維護
let currentRegion = '台灣';
let currentSubCategory = '企業'; // 台灣預設『企業』，馬來西亞預設『Corporate』
let searchText = '';

// 全域記憶體快取
const awardsCache = {
    '台灣': null,
    '馬來西亞': null
};

// 預設備用示範資料 (備援機制)
const fallbackDataMap = {
    '台灣': [
        { type: "企業", year: "2025", title: "商業周刊", detail: "直銷本土第一品牌「UVACO 葡眾」煥新亮相 宣告進軍馬來西亞跨出國際化第一步" },
        { type: "企業", year: "2024", title: "臺灣服務稽核協會", detail: "第三屆臺灣客服中心評鑑-直銷業金牌獎" },
        { type: "產品", year: "2025", title: "康爾動", detail: "台灣生物產業發展協會-年度產業創新獎" },
        { type: "產品", year: "2024", title: "Hi Kiss+ 洗面乳", detail: "韓國首爾發明展 - 銅獎" },
        { type: "產品", year: "2024", title: "995 生技營養品", detail: "PAVONE AWARD 日本鳳凰獎" }
    ],
    '馬來西亞': [
        { type: "Corporate", year: "2025", title: "Direct Selling Century", detail: "“Unveiling the Mystery of UVACO’s Direct Selling Success”" },
        { type: "Corporate", year: "2025", title: "Business Weekly", detail: "“Taiwan’s Top Direct Selling Brand “UVACO” Unveils New Identity, Announcing Foray into Malaysia as First Step Towards International Expansion”" },
        { type: "Products", year: "2025", title: "ProbioticsD", detail: "Grape King Bio GKM3® was awarded the 21st National Innovation Award (2025)" },
        { type: "Products", year: "2025", title: "Liprofac", detail: "Grape King Bio Antrodia Cinnamomea Mycelia Fermentation Product was awarded Gold Medal at the 2025 International Innovation and Invention Competition" },
        { type: "Products", year: "2025", title: "Liprofac", detail: "Grape King Bio Antrodia Cinnamomea Mycelia Fermentation Product was awarded Gold Medal at the International Invention Fair in the Middle East 2025" }
    ]
};

// 核心修改：監聽 vendorReady 事件，確保 jQuery 與 Chart.js 已全部載入記憶體
window.addEventListener('vendorReady', function() {
    // 初始化渲染子分類按鈕與數據載入
    updateSubCategoryTabs();
    loadRegionAwards(currentRegion);

    // 1. 區域分頁切換事件
    $('#region-tabs .nav-link').on('click', function() {
        const selectedRegion = $(this).data('region');
        if (selectedRegion === currentRegion) return;

        $('#region-tabs .nav-link').removeClass('active');
        $(this).addClass('active');

        currentRegion = selectedRegion;
        // 重置子類別與搜尋字串
        currentSubCategory = (currentRegion === '台灣') ? '企業' : 'Corporate';
        searchText = '';
        $('#award-search').val('');

        updateSubCategoryTabs();
        loadRegionAwards(currentRegion);
    });

    // 2. 即時搜尋輸入事件
    $('#award-search').on('input', function() {
        searchText = $(this).val().toLowerCase().trim();
        renderAwards();
    });
});

// 動態生成區域對應的子分類按鈕 (企業/產品 vs Corporate/Products)
function updateSubCategoryTabs() {
    const $wrapper = $('#sub-category-wrapper');
    $wrapper.empty();

    if (currentRegion === '台灣') {
        $wrapper.html(`
            <button class="sub-tab-btn ${currentSubCategory === '企業' ? 'active' : ''}" data-type="企業">
                <i class="fa-solid fa-building me-1"></i> 企業榮譽
            </button>
            <button class="sub-tab-btn ${currentSubCategory === '產品' ? 'active' : ''}" data-type="產品">
                <i class="fa-solid fa-leaf me-1"></i> 產品榮譽
            </button>
        `);
    } else {
        $wrapper.html(`
            <button class="sub-tab-btn ${currentSubCategory === 'Corporate' ? 'active' : ''}" data-type="Corporate">
                <i class="fa-solid fa-building me-1"></i> Corporate
            </button>
            <button class="sub-tab-btn ${currentSubCategory === 'Products' ? 'active' : ''}" data-type="Products">
                <i class="fa-solid fa-leaf me-1"></i> Products
            </button>
        `);
    }

    // 重新綁定子分類按鈕點擊事件
    $('.sub-tab-btn').off('click').on('click', function() {
        $('.sub-tab-btn').removeClass('active');
        $(this).addClass('active');
        currentSubCategory = $(this).data('type');
        renderAwards();
    });
}

// 載入區域榮譽資料 (快取優先)
function loadRegionAwards(regionName) {
    if (awardsCache[regionName] !== null) {
        renderAwards();
        return;
    }

    showLoadingSpinner(regionName);

    const gvizUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(regionName)}`;

    $.ajax({
        url: gvizUrl,
        dataType: 'text',
        success: function(response) {
            try {
                const jsonString = response.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/)[1];
                const data = JSON.parse(jsonString);
                const rows = data.table.rows;

                const parsedList = [];
                if (rows && rows.length > 0) {
                    rows.forEach(row => {
                        if (!row.c) return;
                        const defaultType = (regionName === '台灣') ? '企業' : 'Corporate';
                        const type   = row.c[0] && row.c[0].v ? String(row.c[0].v).trim() : defaultType;
                        const year   = row.c[1] && row.c[1].v ? String(row.c[1].v).trim() : '';
                        const title  = row.c[2] && row.c[2].v ? String(row.c[2].v).trim() : '';
                        const detail = row.c[3] && row.c[3].v ? String(row.c[3].v).trim() : '';

                        if (title || detail) {
                            parsedList.push({ type, year, title, detail });
                        }
                    });
                }

                awardsCache[regionName] = (parsedList.length > 0) ? parsedList : (fallbackDataMap[regionName] || []);
                renderAwards();

            } catch (e) {
                console.warn(`解析【${regionName}】試算表失敗，載入備用榮譽資料:`, e);
                awardsCache[regionName] = fallbackDataMap[regionName] || [];
                renderAwards();
            }
        },
        error: function(xhr, status, error) {
            console.warn(`無法連線【${regionName}】試算表，載入備用榮譽資料:`, error);
            awardsCache[regionName] = fallbackDataMap[regionName] || [];
            renderAwards();
        }
    });
}

// 判斷勳章 Icon 與 色彩類別 (雙語兼適)
function getAwardBadge(detailText) {
    const text = detailText || '';

    // 金獎比對
    if (text.includes('金牌') || text.includes('金獎') || text.includes('第一名') || 
        text.includes('金鳳獎') || text.includes('金炬獎') || text.includes('特優獎') ||
        text.includes('Gold Medal Award') || text.includes('Gold Award') || 
        text.includes('Gold Medal') || text.includes('First Place')) {
        return { 
            class: 'gold-badge', 
            icon: 'fa-solid fa-trophy', 
            label: (currentRegion === '台灣') ? '金獎榮譽' : 'Gold Award' 
        };
    } 
    // 銀獎比對
    else if (text.includes('銀牌') || text.includes('銀獎') || text.includes('第二名') ||
            text.includes('Silver Medal Award') || text.includes('Silver Award') || 
            text.includes('Silver Medal') || text.includes('Second Place')) {
        return { 
            class: 'silver-badge', 
            icon: 'fa-solid fa-award', 
            label: (currentRegion === '台灣') ? '銀獎殊榮' : 'Silver Award' 
        };
    } 
    // 銅獎比對
    else if (text.includes('銅牌') || text.includes('銅獎') || text.includes('第三名') || 
            text.includes('第四名') || text.includes('Bronze Medal Award') || 
            text.includes('Bronze Award') || text.includes('Bronze Medal') || 
            text.includes('Third Place')) {
        return { 
            class: 'bronze-badge', 
            icon: 'fa-solid fa-medal', 
            label: (currentRegion === '台灣') ? '銅獎肯定' : 'Bronze Award' 
        };
    }
    // 預設權威認證
    return { 
        class: 'green-badge', 
        icon: 'fa-solid fa-certificate', 
        label: (currentRegion === '台灣') ? '權威認證' : 'Certification' 
    };
}

// 繪製卡片畫面
function renderAwards() {
    const allData = awardsCache[currentRegion];
    if (!allData) return;

    const $grid = $('#awards-grid');
    $grid.empty();

    // 多維度過濾：子類別 + 搜尋字串
    const filtered = allData.filter(item => {
        const matchType = (item.type.toLowerCase() === currentSubCategory.toLowerCase());
        const matchSearch = (searchText === "") || 
                            item.year.toLowerCase().includes(searchText) || 
                            item.title.toLowerCase().includes(searchText) || 
                            item.detail.toLowerCase().includes(searchText);
        return matchType && matchSearch;
    });

    if (filtered.length === 0) {
        $grid.html(`
            <div class="text-center py-5 col-12">
                <i class="fa-solid fa-magnifying-glass me-2"></i> 目前無符合條件的榮譽紀錄
            </div>
        `);
        return;
    }

    // 按年份降冪排列 (最新的年份在最上面)
    const grouped = {};
    filtered.forEach(item => {
        const y = item.year || (currentRegion === '台灣' ? '歷史榮譽' : 'History');
        if (!grouped[y]) grouped[y] = [];
        grouped[y].push(item);
    });

    const sortedYears = Object.keys(grouped).sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
        return b.localeCompare(a);
    });

    sortedYears.forEach(year => {
        let cardsHtml = '';
        grouped[year].forEach(item => {
            const badgeInfo = getAwardBadge(item.detail);

            cardsHtml += `
                <div class="col-12 col-md-6 col-lg-4 mb-3">
                    <div class="award-card">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="award-year-tag">${item.year}</span>
                            <span class="award-badge ${badgeInfo.class}">
                                <i class="${badgeInfo.icon} me-1"></i> ${badgeInfo.label}
                            </span>
                        </div>
                        <div class="award-title">${escapeHtml(item.title)}</div>
                        <div class="award-detail">${escapeHtml(item.detail)}</div>
                    </div>
                </div>
            `;
        });

        $grid.append(`
            <div class="col-12 mt-3 mb-2">
                <div class="year-divider">
                    <span class="year-divider-text">${year}</span>
                </div>
            </div>
            ${cardsHtml}
        `);
    });
}

// 顯示 Loading Spinner
function showLoadingSpinner(regionName) {
    $('#awards-grid').html(`
        <div id="loading-spinner" class="text-center col-12">
            <div class="spinner-border mb-3" role="status" style="width: 2.5rem; height: 2.5rem;">
                <span class="visually-hidden">Loading...</span>
            </div>
            <div>【${regionName}】榮譽資料同步中...</div>
        </div>
    `);
}

// HTML 轉義防護 (XSS 防禦)
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}