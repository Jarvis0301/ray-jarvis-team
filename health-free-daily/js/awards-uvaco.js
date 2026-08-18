// Google 試算表 ID
const SPREADSHEET_ID = '1bs8fVTroG3vTN6vjlPw6rtgelNYlJ6XIK9tYI9o4yOE';

// 當前狀態維護
let currentRegion = '台灣';
let currentSubCategory = '企業'; // 台灣預設『企業』，馬來西亞預設『Corporate』
let searchText = '';

// 全域記憶體快取
const awardsCache = {
    '台灣': null,
    '馬來西亞': null
};

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    Utils.equalizeWidths('#region-tabs label');

    // 初始化渲染子分類按鈕與數據載入
    updateSubCategoryTabs();
    loadRegionAwards(currentRegion);

    bindFilterEvents();
});

// 通用錯誤提示對話框 (優先使用 AppDialog)
function showErrorAlert(message, title = "資料連線失敗") {
    if (typeof AppDialog !== 'undefined') {
        AppDialog.alert(message, {
            title: title,
            icon: "fa-solid fa-circle-exclamation text-danger"
        });
    } else {
        alert(message);
    }
}

// 動態生成區域對應的子分類按鈕 (企業/產品 vs Corporate/Products)
function updateSubCategoryTabs() {
    const isTaiwan = currentRegion === '台灣';
    const options = isTaiwan ? [
        { val: '企業', label: '企業榮譽', icon: 'fa-building' },
        { val: '產品', label: '產品榮譽', icon: 'fa-leaf' }
    ] : [
        { val: 'Corporate', label: 'Corporate', icon: 'fa-building' },
        { val: 'Products', label: 'Products', icon: 'fa-leaf' }
    ];

    let html = '';
    options.forEach((opt, idx) => {
        const isChecked = currentSubCategory === opt.val ? 'checked' : '';
        const inputId = `sub-tab-${idx}`;

        html += `
            <input type="radio" class="btn-check" name="sub-category" id="${inputId}" value="${opt.val}" autocomplete="off" ${isChecked}>
            <label class="btn btn-outline-primary btn-sm rounded-pill" for="${inputId}">
                <i class="fa-solid ${opt.icon} me-1"></i> ${opt.label}
            </label>
        `;
    });

    $('#sub-category-wrapper').html(html);

    Utils.equalizeWidths('#sub-category-wrapper label');
}

// 載入區域榮譽資料 (快取優先，失敗時顯示 AppDialog 提示)
function loadRegionAwards(regionName) {
    if (awardsCache[regionName] !== null) {
        renderAwards();
        return;
    }

    showLoadingSpinner(regionName);

    const gvizUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(regionName)}`;

    $.ajax({
        url: gvizUrl,
        dataType: 'text',
        success: function(response) {
            try {
                const jsonMatch = response.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
                if (!jsonMatch) {
                    throw new Error("回應格式不符合 GViz JSON 格式");
                }

                const data = JSON.parse(jsonMatch[1]);
                const rows = data.table ? data.table.rows : [];

                const parsedList = [];
                if (rows && rows.length > 0) {
                    rows.forEach(row => {
                        if (!row.c) return;
                        const defaultType = (regionName === '台灣') ? '企業' : 'Corporate';
                        const type   = row.c[0] && row.c[0].v !== null ? String(row.c[0].v).trim() : defaultType;
                        const year   = row.c[1] && row.c[1].v !== null ? String(row.c[1].v).trim() : '';
                        const title  = row.c[2] && row.c[2].v !== null ? String(row.c[2].v).trim() : '';
                        const detail = row.c[3] && row.c[3].v !== null ? String(row.c[3].v).trim() : '';

                        if (title || detail) {
                            parsedList.push({ type, year, title, detail });
                        }
                    });
                }

                awardsCache[regionName] = parsedList;
                renderAwards();

                if (parsedList.length === 0) {
                    showErrorAlert(`試算表頁籤【${regionName}】無任何榮譽紀錄或資料欄位空白。`, "查無資料");
                }

            } catch (e) {
                console.error(`解析【${regionName}】試算表失敗:`, e);
                awardsCache[regionName] = [];
                renderAwards();
                showErrorAlert(`解析【${regionName}】榮譽資料失敗，請檢查試算表欄位結構！`);
            }
        },
        error: function(xhr, status, error) {
            console.error(`無法連線【${regionName}】試算表:`, error);
            awardsCache[regionName] = [];
            renderAwards();
            showErrorAlert(`無法連線至雲端試算表【${regionName}】，請確認網路連線或試算表共用權限！`);
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

// 事件監聽綁定
function bindFilterEvents() {
    // 區域分頁切換事件
    $(document).on('change', 'input[name="region-type"]', function () {
        const selectedRegion = $(this).val();
        if (selectedRegion === currentRegion) return;

        currentRegion = selectedRegion;
        
        // 重置子類別與搜尋字串
        currentSubCategory = (currentRegion === '台灣') ? '企業' : 'Corporate';
        searchText = '';
        $('#award-search').val('');

        updateSubCategoryTabs();
        loadRegionAwards(currentRegion);
    });

    // 子分類按鈕點擊切換事件
    $(document).on('change', 'input[name="sub-category"]', function () {
        currentSubCategory = $(this).val();
        renderAwards();
    });

    // 即時搜尋輸入事件
    $('#award-search').on('input', function() {
        searchText = $(this).val().toLowerCase().trim();
        renderAwards();
    });
}

// 顯示 Loading Spinner
function showLoadingSpinner(regionName) {
    $('#awards-grid').html(`
        <div class="loading-spinner text-center col-12">
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