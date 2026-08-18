// -------------------------------------------------------------
// ⚙️ 自訂標籤優先排序清單（可在此直接調整按鈕排在前順序）
// -------------------------------------------------------------
const PREFERRED_TYPE_ORDER = ['線上講座', '創業說明會', '表揚大會', '暖性活動', '其他'];
const PREFERRED_REGION_ORDER = ['線上', '台北', '台中', '高雄', '吉隆坡', '其他'];

// Google 試算表 ID
const SPREADSHEET_ID = '16jsmQdMRYXTJpl6ZVOsE6WnP7eqz-Y8MpgN7t37z9tE';
// 試算表工作表名稱
const SHEET_NAME = '活動';
// Google Visualization API Endpoint
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

let rawEventsData = [];
let selectedType = 'ALL';
let selectedRegion = 'ALL';
let searchTerm = '';

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function () {
    fetchEventData();
    bindFilterEvents();
});

// 1. Fetch 試算表 JSONP 資料
function fetchEventData() {
    $.ajax({
        url: GVIZ_URL,
        dataType: 'text',
        success: function (response) {
            try {
                const jsonMatch = response.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
                if (!jsonMatch || !jsonMatch[1]) {
                    throw new Error('無效的資料格式');
                }
                const data = JSON.parse(jsonMatch[1]);
                if (data && data.table && data.table.rows) {
                    parseRawData(data.table.rows);
                } else {
                    throw new Error('試算表無資料列');
                }
            } catch (err) {
                handleFetchError(err);
            }
        },
        error: function (err) {
            handleFetchError(err);
        }
    });
}

// 錯誤處理與提示視窗
function handleFetchError(err) {
    console.error('資料讀取失敗:', err);

    rawEventsData = [];
    $('#loading-spinner').html('<div class="text-danger"><i class="fa-solid fa-circle-exclamation me-1"></i> 無法載入活動資料，請檢查試算表權限。</div>');
    filterAndRender();

    if (typeof AppDialog !== 'undefined' && AppDialog.alert) {
        AppDialog.alert("無法載入活動資料，請確認網路連線或試算表讀取權限！", {
            title: "連線失敗",
            icon: "fa-solid fa-circle-exclamation text-danger"
        });
    }
}

// 2. Google Drive 圖片轉化引擎
function parseDriveImageUrl(url) {
    if (!url || url.trim() === '') {
        return '';
    }
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
    }
    return url;
}

// 3. 智慧排序函數 (對照權重矩陣)
function sortSetItems(setItems, preferredOrder) {
    const arr = Array.from(setItems);
    return arr.sort((a, b) => {
        let idxA = preferredOrder.indexOf(a);
        let idxB = preferredOrder.indexOf(b);

        // 未在優先清單中的項目，自動排至最後面
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;

        if (idxA !== idxB) {
            return idxA - idxB;
        }
        // 若兩者權重相同，預設依繁體中文筆劃排序
        return a.localeCompare(b, 'zh-TW');
    });
}

// 4. 解析與標準化資料結構
function parseRawData(rows) {
    const now = new Date();
    rawEventsData = [];

    const typeSet = new Set();
    const regionSet = new Set();

    rows.forEach((row) => {
        if (!row.c || row.c.length === 0) return;

        const startTime = row.c[0] ? (row.c[0].f || row.c[0].v) : '';
        const endTime = row.c[1] ? (row.c[1].f || row.c[1].v) : '';
        const location = row.c[2] ? row.c[2].v : '其他';
        const venue = row.c[3] ? row.c[3].v : '';
        const address = row.c[4] ? row.c[4].v : '';
        const type = row.c[5] ? row.c[5].v : '公開活動';
        const title = row.c[6] ? row.c[6].v : '未命名活動';
        const regUrl = row.c[7] ? row.c[7].v : '';
        const rawImgUrl = row.c[8] ? row.c[8].v : '';
        const performer = row.c[9] ? row.c[9].v : '';

        if (type) typeSet.add(type);
        if (location) regionSet.add(location);

        // 生命週期判定
        let isExpired = false;
        const checkTimeStr = endTime || startTime;
        if (checkTimeStr) {
            const eventEndDate = new Date(checkTimeStr.replace(/-/g, '/'));
            if (!isNaN(eventEndDate.getTime()) && eventEndDate < now) {
                isExpired = true;
            }
        }

        rawEventsData.push({
            startTime, endTime, location, venue, address, type, title,
            regUrl, imgUrl: parseDriveImageUrl(rawImgUrl), performer, isExpired
        });
    });

    // 進行智慧權重排序
    const sortedTypes = sortSetItems(typeSet, PREFERRED_TYPE_ORDER);
    const sortedRegions = sortSetItems(regionSet, PREFERRED_REGION_ORDER);

    // 動態生成選單膠囊按鈕
    renderFilterPills(sortedTypes, sortedRegions);

    $('#loading-spinner').addClass('d-none');
    filterAndRender();
}

// 5. 動態生成篩選膠囊 DOM
function renderFilterPills(typeSet, regionSet) {
    const typeContainer = $('#type-pills');
    typeSet.forEach(t => {
        typeContainer.append(`<span class="filter-pill" data-filter-type="${t}">${t}</span>`);
    });

    const regionContainer = $('#region-pills');
    regionSet.forEach(r => {
        regionContainer.append(`<span class="filter-pill" data-filter-region="${r}">${r}</span>`);
    });
}

// 6. 事件監聽綁定
function bindFilterEvents() {
    // 類型按鈕點擊
    $(document).on('click', '[data-filter-type]', function () {
        $('[data-filter-type]').removeClass('active');
        $(this).addClass('active');
        selectedType = $(this).data('filter-type');
        filterAndRender();
    });

    // 地區按鈕點擊
    $(document).on('click', '[data-filter-region]', function () {
        $('[data-filter-region]').removeClass('active');
        $(this).addClass('active');
        selectedRegion = $(this).data('filter-region');
        filterAndRender();
    });

    // 搜尋輸入框事件
    $('#search-input').on('input keyup', function () {
        searchTerm = $(this).val().toLowerCase().trim();
        filterAndRender();
    });
}

// 7. 核心篩選與渲染繪製邏輯
function filterAndRender() {
    const activeContainer = $('#active-events-container').empty();
    const expiredContainer = $('#expired-events-container').empty();

    let activeCount = 0;
    let expiredCount = 0;

    rawEventsData.forEach(item => {
        // 1. 類型過濾
        if (selectedType !== 'ALL' && item.type !== selectedType) return;

        // 2. 地區過濾
        if (selectedRegion !== 'ALL' && item.location !== selectedRegion) return;

        // 3. 關鍵字模糊匹配
        if (searchTerm !== '') {
            const matchText = `${item.title} ${item.venue} ${item.address} ${item.performer} ${item.type} ${item.location}`.toLowerCase();
            if (!matchText.includes(searchTerm)) return;
        }

        // 生成 DOM
        const cardHtml = createEventCardHtml(item);

        if (item.isExpired) {
            expiredContainer.append(cardHtml);
            expiredCount++;
        } else {
            activeContainer.append(cardHtml);
            activeCount++;
        }
    });

    // UI 狀態顯示邏輯
    $('#active-count').text(activeCount);
    $('#expired-count').text(expiredCount);

    if (activeCount > 0) {
        $('#active-events-section').removeClass('d-none');
    } else {
        $('#active-events-section').addClass('d-none');
    }

    if (expiredCount > 0) {
        $('#expired-events-section').removeClass('d-none');
    } else {
        $('#expired-events-section').addClass('d-none');
    }

    if (activeCount === 0 && expiredCount === 0) {
        $('#no-events-found').removeClass('d-none');
    } else {
        $('#no-events-found').addClass('d-none');
    }
}

// 8. 卡片 HTML DOM 生成器
function createEventCardHtml(item) {
    // 狀態標籤
    const statusBadge = item.isExpired
        ? `<span class="status-badge expired-badge"><span class="status-dot expired-dot"></span> 活動已結束</span>`
        : `<span class="status-badge"><span class="status-dot"></span> 開放報名中</span>`;

    // 類型標籤
    const typeBadge = `<span class="type-badge"><i class="fa-solid fa-tag me-1"></i> ${item.type}</span>`;

    // 表演藝人標籤 (若無藝人資料則不渲染)
    const performerBadge = item.performer
        ? `<span class="performer-badge"><i class="fa-solid fa-microphone-lines me-1"></i> 藝人：${item.performer}</span>`
        : '';

    // 按鈕邏輯
    let actionBtnHtml = '';
    if (item.isExpired) {
        actionBtnHtml = `<div class="btn-uvaco-disabled"><i class="fa-solid fa-lock me-1"></i> 活動已結束</div>`;
    } else if (item.regUrl && item.regUrl.trim() !== '') {
        actionBtnHtml = `<a href="${item.regUrl}" target="_blank" rel="noopener noreferrer" class="btn-uvaco-primary"><i class="fa-solid fa-paper-plane me-1"></i> 立即線上報名</a>`;
    } else {
        actionBtnHtml = `<div class="btn-uvaco-secondary"><i class="fa-solid fa-circle-info me-1"></i> 現場自由入場 / 聯繫我們</div>`;
    }

    const expiredClass = item.isExpired ? 'expired' : '';

    // 格式化時間
    const timeDisplay = item.startTime === item.endTime || !item.endTime
        ? item.startTime
        : `${item.startTime} ~ ${item.endTime.split(' ')[1] || item.endTime}`;

    // 活動時間獨立模組化
    const timeHtml = timeDisplay
        ? `<div class="info-item"><i class="fa-regular fa-clock me-1"></i><div>活動時間：<span class="highlight">${timeDisplay}</span></div></div>`
        : '';

    // 活動地區獨立模組化
    const locationHtml = item.location
        ? `<div class="info-item"><i class="fa-solid fa-earth-asia me-1"></i><div>活動地區：<span class="highlight">${item.location}</span></div></div>`
        : '';

    // 活動場地獨立模組化
    const venueHtml = item.venue
        ? `<div class="info-item"><i class="fa-solid fa-building me-1"></i><div>活動場地：<span class="highlight">${item.venue}</span></div></div>`
        : '';

    // 活動地址獨立模組化
    const addressHtml = item.address
        ? `<div class="info-item"><i class="fa-solid fa-map-pin me-1"></i><div>活動地址：<span class="highlight">${item.address}</span></div></div>`
        : '';

    const html = `
        <div class="event-card ${expiredClass}">
            <div class="row g-0">
                <div class="col-md-5 col-lg-4">
                    <div class="event-img-wrapper">
                        <img src="${item.imgUrl}" class="event-img" alt="${item.title}" onerror="imgError(this);">
                    </div>
                </div>
                <div class="col-md-7 col-lg-8">
                    <div class="event-content h-100">
                        <div>
                            <div class="header-badges-row">
                                ${statusBadge}
                                ${typeBadge}
                                ${performerBadge}
                            </div>

                            <h3 class="event-title">${item.title}</h3>

                            <div class="info-list">
                                ${timeHtml}
                                ${locationHtml}
                                ${venueHtml}
                                ${addressHtml}
                            </div>
                        </div>
                        <div class="action-group mt-2">
                            ${actionBtnHtml}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    return html;
}

function imgError(imgDiv) {
    let currentSrc = imgDiv.src;

    // 1. 如果目前是 .jpg 且還沒嘗試過切換為 .png
    if (currentSrc.endsWith('.jpg') && !imgDiv.dataset.triedPng) {
        imgDiv.dataset.triedPng = "true"; // 設定標記，避免無限迴圈
        imgDiv.src = currentSrc.replace(/\.jpg$/, '.png'); // 嘗試改載入 .png
        return; // 結束本次 onerror，給瀏覽器時間載入新圖片
    }

    // 2. 如果連 .png 也載入失敗（或原本就不是 .jpg），才替換成 Icon
    let html = `<i class="fa-solid fa-calendar-days img-placeholder-icon"></i>`;
    $(imgDiv).replaceWith(html);
}