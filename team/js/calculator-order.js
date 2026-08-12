// ==========================================
// 1. Google 雲端硬碟試算表設定與核心轉接器
// ==========================================
let SPREADSHEET_ID = "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I"; // 公開的 Google Sheet ID

function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && row[colIndex] !== '') {
        return row[colIndex].toString().trim();
    }
    return defaultVal;
}

// ==========================================
// 2. 系統狀態管理 (不使用預設靜態資料庫)
// ==========================================
let appState = {
    country: 'TW',
    myRegion: 'WEST', // 'WEST' | 'EAST'
    displayCurrency: 'TWD', // 'TWD' | 'MYR'
    exchangeRate: 8.0, // 預設新台幣:馬幣 = 8:1
    mainSeries: 'ALL',
    subSeries: 'ALL',
    productType: 'ALL',
    searchKeyword: '',
    products: { TW: [], MY: [] },
    seriesList: [],
    typeList: []
};

let cartState = {}; // { productId: qty }
let currentView = "card";
let dataTableInstance = null;
let clearModalInstance = null;

// ==========================================
// 圖表全域變數與切換狀態
// ==========================================
let chart1Metric = 'TWD';
let chartBarMetric = 'TWD';
let chart4Metric = 'TWD';
let chart5Metric = 'TWD';

let chartMainCategoryPieInstance = null;
let chartSeriesCombinedBarInstance = null;
let chartTypeQtyInstance = null;
let chartTopItemsInstance = null;
let chartTypeSvRadarInstance = null;

let chartSubInstances = {};

// ==========================================
// 3. 頁面初始化與事件監聽
// ==========================================
window.addEventListener('AppReady', async () => {
    initAllCharts();
    await initApp();
    setupIframeFloatingPositionEngine();
});

let isInitialized = false;
async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindEvents();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        const syncElem = document.getElementById('syncStatus');
        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 未設定試算表 ID';
        
        if (typeof AppDialog !== 'undefined') {
            AppDialog.alert("未設定 Google 試算表 ID，無法讀取產品資料！", {
                title: "資料讀取失敗",
                icon: "fa-solid fa-triangle-exclamation text-danger"
            });
        } else {
            alert("未設定 Google 試算表 ID，無法讀取產品資料！");
        }
    }

    renderProducts();
    updateCartSummary();
}

// ==========================================
// 4. 解析 Google Sheets 數據 (無連線備援資料，連線失敗時觸發 AppDialog.alert)
// ==========================================
async function fetchGoogleSheetsData() {
    try {
        const syncElem = document.getElementById('syncStatus');
        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 產品資訊同步中...';

        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP 錯誤狀態: ${res.status}`);
            const text = await res.text();
            
            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return parsed.data.slice(1);
        };

        const [productsData, mainCategoriesData, subcategoriesData, productTypesData] = await Promise.all([
            fetchSheet('產品主表'),
            fetchSheet('產品主系列表'),
            fetchSheet('產品次系列表'),
            fetchSheet('產品型態表')
        ]);

        let hasData = false;

        if (productsData && productsData.length > 0) {
            const parsedAll = parseProductsTable(productsData);
            appState.products.TW = parsedAll.filter(p => p.region_code === 'TW');
            appState.products.MY = parsedAll.filter(p => p.region_code === 'MY');
            if (parsedAll.length > 0) hasData = true;
        }

        if (mainCategoriesData && mainCategoriesData.length > 0) {
            appState.seriesList = buildSeriesTree(mainCategoriesData, subcategoriesData || []);
            updateSeriesDropdowns();
        }

        if (productTypesData && productTypesData.length > 0) {
            appState.typeList = [{ id: "0", code: "ALL", name: "全部", icon: "fa-solid fa-border-all", color: "#94a3b8", bg: "rgba(10, 25, 19, 0.88)" }];
            productTypesData.forEach((row, idx) => {
                const id = getVal(row, 0, String(idx + 1));
                const code = getVal(row, 1, `TYPE${idx + 1}`);
                const name = getVal(row, 2);
                const nameEn = getVal(row, 3);
                const icon = getVal(row, 4, 'fa-solid fa-tag');
                const color = getVal(row, 5, '#94a3b8');
                const bg = getVal(row, 6, 'rgba(10, 25, 19, 0.88)');
                
                if (name) {
                    appState.typeList.push({ id, code, name, nameEn, icon, color, bg });
                }
            });
            renderTypeFilterButtons();
        }

        if (!hasData) {
            throw new Error("Google 試算表中未找到任何有效的產品資料。");
        }

        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-circle-check"></i> 雲端資料同步完成';
    } catch (err) {
        console.error("無法連線至 Google 試算表或讀取失敗:", err);
        const syncElem = document.getElementById('syncStatus');
        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 雲端同步失敗';

        if (typeof AppDialog !== 'undefined') {
            AppDialog.alert("無法連線至雲端試算表或讀取資料，請檢查網路連線或 Google 試算表設定！", {
                title: "資料同步失敗",
                icon: "fa-solid fa-circle-exclamation text-danger"
            });
        } else {
            alert("無法連線至雲端試算表或讀取資料，請檢查網路連線或 Google 試算表設定！");
        }
    }
}

function parseProductsTable(rows) {
    return rows.map((r, idx) => {
        const rawId = getVal(r, 0, String(idx + 1));
        const productCode = getVal(r, 3);
        let regionCode = getVal(r, 1, 'TW').toUpperCase();
        
        if (!regionCode || (regionCode !== 'TW' && regionCode !== 'MY')) {
            regionCode = productCode.startsWith('MY') ? 'MY' : 'TW';
        }

        const baseCode = getVal(r, 2, productCode.replace(/^(TW|MY)/, ''));

        return {
            id: rawId,
            region_code: regionCode,
            base_code: baseCode,
            product_code: productCode,
            name: getVal(r, 4),
            short_name: getVal(r, 5),
            short_summary: getVal(r, 6),
            type_name: getVal(r, 7),
            subcategory_code: getVal(r, 8),
            package_spec: getVal(r, 9),
            price: getVal(r, 10, '0'),
            currency: getVal(r, 11, regionCode === 'MY' ? 'MYR' : 'TWD'),
            sv_point: getVal(r, 12, '0'),
            primary_image_url: getVal(r, 13)
        };
    }).filter(item => item.product_code !== '' || item.name !== '');
}

function buildSeriesTree(mainRows, subRows) {
    const seriesList = [];    

    mainRows.forEach((r, idx) => {
        const id = getVal(r, 0, String(idx + 1));
        const code = getVal(r, 1);
        const name = getVal(r, 2);
        const nameEn = getVal(r, 3);
        const icon = getVal(r, 4, 'fa-solid fa-tag');
        const color = getVal(r, 5, '#52b788');
        const bg = getVal(r, 6, 'rgba(10, 25, 19, 0.88)');

        if (code) {
            seriesList.push({ id, code, name, nameEn, icon, color, bg, subs: [] });
        }
    });

    subRows.forEach((r, idx) => {
        const id = getVal(r, 0, String(idx + 101));
        const parentCode = getVal(r, 1);
        const subCode = getVal(r, 2);
        const name = getVal(r, 3);
        const nameEn = getVal(r, 4);
        const icon = getVal(r, 5, 'fa-solid fa-tag');
        const color = getVal(r, 6, '#52b788');
        const bg = getVal(r, 7, 'rgba(10, 25, 19, 0.88)');

        if (subCode) {
            let parentSeries = seriesList.find(s => s.code === parentCode);
            if (!parentSeries) {
                parentSeries = { id: `M_${parentCode}`, code: parentCode, name: name || '系列', nameEn: nameEn || '', subs: [] };
                seriesList.push(parentSeries);
            }
            parentSeries.subs.push({ id, code: subCode, name, nameEn, icon, color, bg });
        }
    });

    return seriesList;
}

function getLanguageName(item, isMY) {
    if (!item) return '';
    return isMY ? (item.nameEn || '') : item.name;
}

function getSubSeriesInfo(subCode, isMY) {
    let subObj = null;
    if (subCode) {
        for (const series of appState.seriesList) {
            if (series.subs) {
                const found = series.subs.find(s => s.code === subCode);
                if (found) {
                    subObj = found;
                    break;
                }
            }
        }
    }
    if (subObj) {
        return {
            name: getLanguageName(subObj, isMY) || subObj.name || subCode,
            icon: subObj.icon || 'fa-solid fa-tag',
            color: subObj.color || '#38bdf8',
            bg: subObj.bg || 'rgba(10, 25, 19, 0.88)'
        };
    }
    return {
        name: subCode || '一般系列',
        icon: 'fa-solid fa-tag',
        color: '#38bdf8',
        bg: 'rgba(10, 25, 19, 0.88)'
    };
}

function getTypeInfo(typeName) {
    if (!typeName) return { name: '保健', icon: 'fa-solid fa-box', color: '#34d399', bg: 'rgba(10, 25, 19, 0.88)' };
    const found = appState.typeList.find(t => t.name === typeName);
    if (found) {
        return {
            name: found.name,
            icon: found.icon || 'fa-solid fa-tag',
            color: found.color || '#34d399',
            bg: found.bg || 'rgba(10, 25, 19, 0.88)'
        };
    }
    return {
        name: typeName,
        icon: 'fa-solid fa-tag',
        color: '#34d399',
        bg: 'rgba(10, 25, 19, 0.88)'
    };
}

// ==========================================
// 5. 下拉選單與型態篩選器
// ==========================================
function updateSeriesDropdowns() {
    const mainSelect = document.getElementById('mainSeriesSelect');
    if (!mainSelect) return;

    const isMY = appState.country === 'MY';
    mainSelect.innerHTML = '<option value="ALL">全部主系列</option>';

    appState.seriesList.forEach(series => {
        const displayName = getLanguageName(series, isMY);
        if (displayName) {
            const opt = document.createElement('option');
            opt.value = series.code;
            opt.textContent = `${series.code} ${displayName}`;
            mainSelect.appendChild(opt);
        }
    });

    mainSelect.value = 'ALL';
    updateSubSeriesDropdown(mainSelect.value);
}

function updateSubSeriesDropdown(mainCode) {
    const subSelect = document.getElementById('subSeriesSelect');
    if (!subSelect) return;

    const isMY = appState.country === 'MY';
    subSelect.innerHTML = '';

    if (mainCode === 'ALL') {
        subSelect.disabled = true;
        subSelect.innerHTML = '<option value="ALL">請先選擇主系列</option>';
        return;
    }

    const targetSeries = appState.seriesList.find(s => s.code === mainCode);
    if (targetSeries && targetSeries.subs) {
        subSelect.disabled = false;
        const defaultOpt = document.createElement('option');
        defaultOpt.value = 'ALL';
        defaultOpt.textContent = '全部次分類';
        subSelect.appendChild(defaultOpt);

        targetSeries.subs.forEach(sub => {
            const displayName = getLanguageName(sub, isMY);
            if (displayName) {
                const opt = document.createElement('option');
                opt.value = sub.code;
                opt.textContent = `${sub.code} ${displayName}`;
                subSelect.appendChild(opt);
            }
        });
    }
}

function renderTypeFilterButtons() {
    let html = '';

    appState.typeList.forEach((item) => {
        const val = (item.name === '全部' ? 'ALL' : item.name);
        const isActive = appState.productType === val ? 'active' : '';

        html += `
            <button class="type-btn ${isActive}" data-type="${val}">
                <i class="${item.icon}"></i> ${item.name}
            </button>
        `;
    });

    const $container = $('#typeFilterContainer');
    if ($container.length > 0) {
        $container.html(html);
    }
}

// ==========================================
// 6. UI 事件綁定
// ==========================================
function bindEvents() {
    $("#countrySelect").on("change", function () {
        appState.country = $(this).val();
        appState.mainSeries = 'ALL';
        appState.subSeries = 'ALL';

        if (appState.country === 'MY') {
            appState.displayCurrency = 'MYR';
            $("#displayCurrencySelect").val('MYR');
            $("#myRegionBlock").removeClass('d-none');
        } else {
            appState.displayCurrency = 'TWD';
            $("#displayCurrencySelect").val('TWD');
            $("#myRegionBlock").addClass('d-none');
        }

        updateSeriesDropdowns();
        renderProducts();
        updateCartSummary();
    });

    $("#displayCurrencySelect").on("change", function () {
        appState.displayCurrency = $(this).val();
        if (appState.displayCurrency === 'MYR' || appState.country === 'MY') {
            $("#myRegionBlock").removeClass('d-none');
        } else {
            $("#myRegionBlock").addClass('d-none');
        }
        updateCartSummary();
    });

    $("#exchangeRateInput").on("input change", function () {
        let rate = parseFloat($(this).val());
        if (isNaN(rate) || rate <= 0) rate = 8.0;
        appState.exchangeRate = rate;
        updateCartSummary();
    });

    $('input[name="myRegion"]').on("change", function () {
        appState.myRegion = $(this).val();
        updateCartSummary();
    });

    $("#mainSeriesSelect").on("change", function () {
        appState.mainSeries = $(this).val();
        appState.subSeries = 'ALL';
        updateSubSeriesDropdown(appState.mainSeries);
        renderProducts();
    });

    $("#subSeriesSelect").on("change", function () {
        appState.subSeries = $(this).val();
        renderProducts();
    });

    $("#searchInput").on("input", function () {
        appState.searchKeyword = $(this).val().trim().toLowerCase();
        renderProducts();
    });

    $("#typeFilterContainer").on("click", ".type-btn", function () {
        $("#typeFilterContainer .type-btn").removeClass("active");
        $(this).addClass("active");
        appState.productType = $(this).data("type");
        renderProducts();
    });

    $("#rank-select").on("change", function () {
        updateCartSummary();
    });

    $("#btn-view-card").on("click", function () {
        if (currentView !== "card") {
            currentView = "card";
            $(".view-switch-btn").removeClass("active");
            $(this).addClass("active");
            $("#productGrid").removeClass("d-none");
            $("#productTableCard").addClass("d-none");
            renderProducts();
        }
    });

    $("#btn-view-table").on("click", function () {
        if (currentView !== "table") {
            currentView = "table";
            $(".view-switch-btn").removeClass("active");
            $(this).addClass("active");
            $("#productGrid").addClass("d-none");
            $("#productTableCard").removeClass("d-none");
            renderProducts();
        }
    });

    $("#btnHideFloatingBar").on("click", function () {
        $("#floatingIslandBar").addClass("is-hidden");
        $("#btnShowFloatingBar").fadeIn(100);
    });

    $("#btnShowFloatingBar").on("click", function () {
        $("#floatingIslandBar").removeClass("is-hidden");
        $(this).fadeOut(100);
        setupIframeFloatingPositionEngine();
    });

    $("#btn-confirm-clear").on("click", function () {
        cartState = {};
        renderProducts();
        updateCartSummary();
        if (clearModalInstance) {
            clearModalInstance.hide();
        }
    });

    $("#btn-export-excel").on("click", exportOrderToExcel);
    $("#btn-export-pdf").on("click", exportOrderToPDF);

    $("#btn-clear-all").on("click", function () {
        if (Object.keys(cartState).length === 0) return;

        AppDialog.confirm(
            "您確定要清空目前已選擇的所有商品與訂購數量嗎？",
            function () {
                cartState = {};
                renderProducts();
                updateCartSummary();
            },
            { title: "確認清空購物車", confirmText: "確認清空" }
        );
    });
}

// ==========================================
// 綁定圖表控制與數值顯示開關事件
// ==========================================
function bindChartControls() {
    $('#btnGroupShowData button').off('click').on('click', function () {
        $('#btnGroupShowData button').removeClass('active');
        $(this).addClass('active');
    });

    $('.chart1-metric-btn').off('click').on('click', function () {
        $('.chart1-metric-btn').removeClass('active');
        $(this).addClass('active');
        chart1Metric = $(this).data('metric');
        updateCartSummary();
    });

    $('.chartBar-metric-btn').off('click').on('click', function () {
        $('.chartBar-metric-btn').removeClass('active');
        $(this).addClass('active');
        chartBarMetric = $(this).data('metric');
        updateCartSummary();
    });

    $('.chart4-metric-btn').off('click').on('click', function () {
        $('.chart4-metric-btn').removeClass('active');
        $(this).addClass('active');
        chart4Metric = $(this).data('metric');
        updateCartSummary();
    });

    $('.chart5-metric-btn').off('click').on('click', function () {
        $('.chart5-metric-btn').removeClass('active');
        $(this).addClass('active');
        chart5Metric = $(this).data('metric');
        updateCartSummary();
    });

    $('#btnPrintAnalytics').off('click').on('click', function () {
        exportAnalyticsReport();
    });

    $('#btnOpenSubSeriesModal').off('click').on('click', function () {
        const modalElem = document.getElementById('subSeriesChartsModal');
        if (modalElem) {
            const bsModal = bootstrap.Modal.getOrCreateInstance(modalElem);
            bsModal.show();
        }
    });
}

// ==========================================
// 7. 產品渲染引擎
// ==========================================
function getFilteredProducts() {
    let currentDataset = [];
    if (appState.country === 'ALL') {
        currentDataset = [...(appState.products.TW || []), ...(appState.products.MY || [])];
    } else {
        currentDataset = appState.products[appState.country] || [];
    }

    return currentDataset.filter(item => {
        if (appState.mainSeries !== 'ALL') {
            let itemSubCode = item.subcategory_code || '';
            
            if (item.product_code === '80050' || item.product_code === '80070') {
                itemSubCode = '0302';
            } else if (!itemSubCode && item.product_code.length >= 6) {
                itemSubCode = item.product_code.replace(/^(TW|MY)/, '').slice(0, 4);
            }

            if (appState.subSeries !== 'ALL') {
                if (itemSubCode !== appState.subSeries) return false;
            } else {
                if (itemSubCode.slice(0, 2) !== appState.mainSeries) return false;
            }
        }

        if (appState.productType !== 'ALL' && item.type_name !== appState.productType) {
            return false;
        }

        if (appState.searchKeyword !== '') {
            const k = appState.searchKeyword;
            const mName = (item.name || '').toLowerCase().includes(k);
            const mShort = (item.short_name || '').toLowerCase().includes(k);
            const mCode = (item.product_code || '').toLowerCase().includes(k);
            const mSummary = (item.short_summary || '').toLowerCase().includes(k);
            if (!mName && !mShort && !mCode && !mSummary) return false;
        }

        return true;
    });
}

function renderProducts() {
    const filtered = getFilteredProducts();

    if (currentView === "card") {
        const $grid = $("#productGrid");
        $grid.empty();

        if (filtered.length === 0) {
            $grid.append(`
                <div class="col-12 text-center text-muted py-5 war-card">
                    <i class="fa-solid fa-magnifying-glass-minus fa-3x mb-3 opacity-50"></i>
                    <p class="mb-0">未找到符合條件的產品，請調整篩選條件或搜尋關鍵字。</p>
                </div>
            `);
            return;
        }

        filtered.forEach(item => {
            const qty = cartState[item.id] || 0;
            const price = parseFloat(item.price) || 0;
            const sv = parseFloat(item.sv_point) || 0;
            const currencySymbol = item.currency === 'MYR' ? 'RM ' : 'NT$ ';
            const isMY = appState.country === 'MY' || item.region_code === 'MY';

            let subCode = item.subcategory_code || '';
            if (item.product_code === '80050' || item.product_code === '80070') {
                subCode = '0302';
            } else if (!subCode && item.product_code && item.product_code.length >= 6) {
                subCode = item.product_code.replace(/^(TW|MY)/, '').slice(0, 4);
            }

            const subInfo = getSubSeriesInfo(subCode, isMY);
            const typeInfo = getTypeInfo(item.type_name);

            const cardHtml = `
                <div class="col-12 col-sm-6 col-md-4">
                    <div class="product-item-card">
                        <div>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <span class="product-badge">${item.product_code || item.id}</span>
                                <span class="badge border" style="color: ${subInfo.color}; border-color: ${subInfo.color} !important; background-color: ${subInfo.bg};">
                                    <i class="${subInfo.icon}"></i> ${subInfo.name}
                                </span>
                                <span class="badge border" style="color: ${typeInfo.color}; border-color: ${typeInfo.color} !important; background-color: ${typeInfo.bg};">
                                    <i class="${typeInfo.icon}"></i> ${typeInfo.name}
                                </span>
                            </div>
                            <h6 class="product-title">${item.name}</h6>
                            <p class="small text-muted mb-2 text-truncate-2">${item.short_summary || "暫無產品簡介"}</p>
                        </div>
                        <div>
                            <div class="d-flex justify-content-between align-items-center mb-1 small">
                                <span>售價: <span class="price-num">${currencySymbol}${price.toLocaleString()}</span></span>
                                <span>積分: <span class="sv-num">${sv.toLocaleString()} SV</span></span>
                            </div>
                            <div class="qty-control">
                                <button class="btn-qty btn-minus" data-id="${item.id}">
                                    <i class="fa-solid fa-minus"></i>
                                </button>
                                <input type="number" class="qty-input" value="${qty}" min="0" data-id="${item.id}">
                                <button class="btn-qty btn-plus" data-id="${item.id}">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            $grid.append(cardHtml);
        });
    } else {
        if (dataTableInstance) {
            dataTableInstance.destroy();
            dataTableInstance = null;
        }

        const $tbody = $("#productTable tbody");
        $tbody.empty();

        if (filtered.length === 0) {
            $tbody.append(`
                <tr>
                    <td colspan="7" class="text-center text-muted py-4">
                        <i class="fa-solid fa-magnifying-glass-minus fa-2x mb-2 opacity-50 d-block"></i>
                        未找到符合條件的產品，請調整篩選條件或搜尋關鍵字。
                    </td>
                </tr>
            `);
        } else {
            filtered.forEach(item => {
                const qty = cartState[item.id] || 0;
                const price = parseFloat(item.price) || 0;
                const sv = parseFloat(item.sv_point) || 0;
                const currencySymbol = item.currency === 'MYR' ? 'RM ' : 'NT$ ';
                const isMY = appState.country === 'MY' || item.region_code === 'MY';

                let subCode = item.subcategory_code || '';
                if (item.product_code === '80050' || item.product_code === '80070') {
                    subCode = '0302';
                } else if (!subCode && item.product_code && item.product_code.length >= 6) {
                    subCode = item.product_code.replace(/^(TW|MY)/, '').slice(0, 4);
                }

                const subInfo = getSubSeriesInfo(subCode, isMY);
                const typeInfo = getTypeInfo(item.type_name);

                const rowHtml = `
                    <tr>
                        <td><span class="product-badge">${item.product_code || item.id}</span></td>
                        <td class="fw-bold text-white">${item.name}</td>
                        <td>
                            <span class="badge border" style="color: ${subInfo.color}; border-color: ${subInfo.color} !important; background-color: ${subInfo.bg};">
                                <i class="${subInfo.icon}"></i> ${subInfo.name}
                            </span>
                        </td>
                        <td>
                            <span class="badge border" style="color: ${typeInfo.color}; border-color: ${typeInfo.color} !important; background-color: ${typeInfo.bg};">
                                <i class="${typeInfo.icon}"></i> ${typeInfo.name}
                            </span>
                        </td>
                        <td class="text-end price-num">${currencySymbol}${price.toLocaleString()}</td>
                        <td class="text-end sv-num">${sv.toLocaleString()} SV</td>
                        <td class="text-center">
                            <div class="qty-control justify-content-center">
                                <button class="btn-qty btn-minus" data-id="${item.id}">
                                    <i class="fa-solid fa-minus"></i>
                                </button>
                                <input type="number" class="qty-input" value="${qty}" min="0" data-id="${item.id}">
                                <button class="btn-qty btn-plus" data-id="${item.id}">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
                $tbody.append(rowHtml);
            });

            dataTableInstance = $('#productTable').DataTable();
        }
    }

    bindQtyEvents();
}

function bindQtyEvents() {
    $(".btn-plus").off("click").on("click", function () {
        const id = String($(this).data("id"));
        cartState[id] = (cartState[id] || 0) + 1;
        updateQtyInputsUI(id);
        updateCartSummary();
    });

    $(".btn-minus").off("click").on("click", function () {
        const id = String($(this).data("id"));
        if (cartState[id] && cartState[id] > 0) {
            cartState[id] -= 1;
            if (cartState[id] === 0) delete cartState[id];
            updateQtyInputsUI(id);
            updateCartSummary();
        }
    });

    $(".qty-input").off("change input").on("change input", function () {
        const id = String($(this).data("id"));
        let val = parseInt($(this).val()) || 0;
        if (val < 0) val = 0;
        if (val === 0) {
            delete cartState[id];
        } else {
            cartState[id] = val;
        }
        updateQtyInputsUI(id);
        updateCartSummary();
    });
}

function updateQtyInputsUI(id) {
    const qty = cartState[id] || 0;
    $(`.qty-input[data-id="${id}"]`).val(qty);
}

function findProductById(id) {
    const all = [...(appState.products.TW || []), ...(appState.products.MY || [])];
    return all.find(p => p.id === id);
}

// ==========================================
// 8. 訂購試算摘要與運費/匯率邏輯
// ==========================================
function updateCartSummary() {
    const $container = $("#cart-items-container");
    $container.empty();

    let totalItemsCount = 0;
    let totalSV = 0;
    let subtotalDisplay = 0;

    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
    const targetCurr = appState.displayCurrency;
    const isTargetMYR = targetCurr === 'MYR';
    const currSymbol = isTargetMYR ? 'RM ' : 'NT$ ';

    let catSvMap = {};
    let catAmountMap = {};
    let typeQtyMap = {};
    let subSeriesSvMap = {};

    const selectedKeys = Object.keys(cartState);

    if (selectedKeys.length === 0) {
        $container.html(`
            <div class="text-center text-muted d-flex flex-column align-items-center justify-content-center" style="min-height: 150px;" id="empty-cart-msg">
                <i class="fa-solid fa-basket-shopping fa-2x mb-2 opacity-50"></i>
                尚未選擇任何商品，請點擊數量增減選擇。
            </div>
        `);

        if (appState.country === 'MY') {
            $("#shipping-threshold-title").html(`<i class="fa-solid fa-truck-fast"></i> RM 800 免運費門檻`);
            $("#shipping-progress-text").text(`0 / 800 RM`);
        } else {
            $("#shipping-threshold-title").html(`<i class="fa-solid fa-truck-fast"></i> 480 SV 免運費門檻`);
            $("#shipping-progress-text").text(`0 / 480 SV`);
        }

        $("#shipping-progress-bar").css("width", `0%`);

        $("#total-qty-badge").text(`0 件商品`);
        $("#summary-subtotal").text(`${currSymbol}0`);
        $("#summary-shipping").text("-");
        $("#summary-grand-total").text(`${currSymbol}0`);
        $("#summary-total-sv").text(`0 SV`);
        $("#summary-rebate-cash").text(`${currSymbol}0`);

        $("#sticky-grand-total").text(`${currSymbol}0`);
        $("#sticky-total-sv").text(`0 SV`);
        $("#sticky-rebate-cash").text(`${currSymbol}0`);

        updateAllChartsData({ catSvMap, catAmountMap, typeQtyMap, subSeriesSvMap, totalSV: 0 });
        return;
    }

    selectedKeys.forEach(id => {
        const qty = cartState[id];
        const product = findProductById(id);
        if (product && qty > 0) {
            const itemPriceOrig = parseFloat(product.price) || 0;
            const itemCurr = product.currency || (product.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = parseFloat(product.sv_point) || 0;

            let itemPriceInDisplay = itemPriceOrig;
            if (itemCurr === 'TWD' && targetCurr === 'MYR') {
                itemPriceInDisplay = itemPriceOrig / rate;
            } else if (itemCurr === 'MYR' && targetCurr === 'TWD') {
                itemPriceInDisplay = itemPriceOrig * rate;
            }

            const itemTotalPrice = itemPriceInDisplay * qty;
            const itemTotalSV = sv * qty;

            subtotalDisplay += itemTotalPrice;
            totalSV += itemTotalSV;
            totalItemsCount += qty;

            let mainCategoryName = "保健食品";
            let subCategoryName = product.subcategory_code || "其他";

            appState.seriesList.forEach(s => {
                if (s.subs) {
                    const sub = s.subs.find(sub => sub.code === product.subcategory_code);
                    if (sub) {
                        mainCategoryName = s.name;
                        subCategoryName = sub.name;
                    }
                }
            });

            const typeName = product.type_name || '其他';

            catSvMap[mainCategoryName] = (catSvMap[mainCategoryName] || 0) + itemTotalSV;
            catAmountMap[mainCategoryName] = (catAmountMap[mainCategoryName] || 0) + itemTotalPrice;
            typeQtyMap[typeName] = (typeQtyMap[typeName] || 0) + qty;
            subSeriesSvMap[subCategoryName] = (subSeriesSvMap[subCategoryName] || 0) + itemTotalSV;

            $container.append(`
                <div class="cart-item-row">
                    <div class="cart-item-title" title="${product.name}">
                        <i class="fa-solid fa-box text-info me-1"></i>${product.name}
                    </div>
                    <div class="cart-item-qty">
                        x ${qty}
                    </div>
                    <div class="cart-item-price-block">
                        <div class="text-warning font-weight-bold">${currSymbol}${Math.round(itemTotalPrice).toLocaleString()}</div>
                        <div class="text-info" style="font-size: 0.75rem;">${itemTotalSV.toLocaleString()} SV</div>
                    </div>
                </div>
            `);
        }
    });

    let shippingFeeInDisplay = 0;
    let shippingPercent = 0;

    if (appState.country === 'MY') {
        let subtotalMYR = isTargetMYR ? subtotalDisplay : subtotalDisplay / rate;
        const thresholdMYR = 800;
        const baseShippingMYR = appState.myRegion === 'EAST' ? 35 : 15;

        if (subtotalMYR >= thresholdMYR) {
            shippingFeeInDisplay = 0;
        } else {
            shippingFeeInDisplay = isTargetMYR ? baseShippingMYR : baseShippingMYR * rate;
        }

        shippingPercent = Math.min(100, (subtotalMYR / thresholdMYR) * 100);
        $("#shipping-threshold-title").html(`<i class="fa-solid fa-truck-fast"></i> RM 800 免運費門檻`);
        $("#shipping-progress-text").text(`${Math.round(subtotalMYR).toLocaleString()} / 800 RM`);

    } else {
        const thresholdSV = 480;
        const baseShippingTWD = 150;

        if (totalSV >= thresholdSV) {
            shippingFeeInDisplay = 0;
        } else {
            shippingFeeInDisplay = isTargetMYR ? baseShippingTWD / rate : baseShippingTWD;
        }

        shippingPercent = Math.min(100, (totalSV / thresholdSV) * 100);
        $("#shipping-threshold-title").html(`<i class="fa-solid fa-truck-fast"></i> 480 SV 免運費門檻`);
        $("#shipping-progress-text").text(`${totalSV.toLocaleString()} / 480 SV`);
    }

    $("#shipping-progress-bar").css("width", `${shippingPercent}%`);

    const grandTotal = subtotalDisplay + shippingFeeInDisplay;

    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const estimatedRebateDisplay = isTargetMYR ? (totalSV * rankRatio) / rate : Math.round(totalSV * rankRatio);

    $("#total-qty-badge").text(`${totalItemsCount} 件商品`);
    $("#summary-subtotal").text(`${currSymbol}${Math.round(subtotalDisplay).toLocaleString()}`);
    $("#summary-shipping").text(shippingFeeInDisplay > 0 ? `${currSymbol}${Math.round(shippingFeeInDisplay).toLocaleString()}` : "免運費");
    $("#summary-grand-total").text(`${currSymbol}${Math.round(grandTotal).toLocaleString()}`);
    $("#summary-total-sv").text(`${totalSV.toLocaleString()} SV`);
    $("#summary-rebate-cash").text(`${currSymbol}${Math.round(estimatedRebateDisplay).toLocaleString()}`);

    $("#sticky-grand-total").text(`${currSymbol}${Math.round(grandTotal).toLocaleString()}`);
    $("#sticky-total-sv").text(`${totalSV.toLocaleString()} SV`);
    $("#sticky-rebate-cash").text(`${currSymbol}${Math.round(estimatedRebateDisplay).toLocaleString()}`);

    updateAllChartsData({
        catSvMap,
        catAmountMap,
        typeQtyMap,
        subSeriesSvMap,
        totalSV
    });
}

// ==========================================
// 9. Chart.js 初始化與動態更新
// ==========================================
function initAllCharts() {
    bindChartControls();

    const mainCats = getMainCategories();
    const allTypes = getAllTypes();

    const ctx1 = document.getElementById('chartMainCategoryPie')?.getContext('2d');
    if (ctx1) {
        chartMainCategoryPieInstance = new Chart(ctx1, {
            type: 'pie',
            data: {
                labels: mainCats.map(c => `${c.code} ${c.name}`),
                datasets: [{
                    data: new Array(mainCats.length).fill(0),
                    backgroundColor: ['#38bdf8', '#fb923c', '#34d399', '#f43f5e', '#a855f7', '#facc15', '#22d3ee'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const label = context.label || '';
                                const val = context.raw || 0;
                                const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                const symbol = chart1Metric === 'SV' ? ' SV' : (chart1Metric === 'MYR' ? ' RM' : ' NT$');
                                return ` ${label}: ${symbol} ${Math.round(val).toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    const ctx2 = document.getElementById('chartSeriesCombinedBar')?.getContext('2d');
    if (ctx2) {
        chartSeriesCombinedBarInstance = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: mainCats.map(c => `${c.code} ${c.name}`),
                datasets: [{
                    label: '數據',
                    data: new Array(mainCats.length).fill(0),
                    backgroundColor: ['rgba(56, 189, 248, 0.8)', 'rgba(251, 146, 60, 0.8)', 'rgba(52, 211, 153, 0.8)', 'rgba(244, 63, 94, 0.8)', 'rgba(168, 85, 247, 0.8)'],
                    borderWidth: 0,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: '#f8fafc', font: { size: 11 } }, grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    const ctx3 = document.getElementById('chartTypeQty')?.getContext('2d');
    if (ctx3) {
        chartTypeQtyInstance = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: allTypes,
                datasets: [{
                    label: '訂購數量',
                    data: new Array(allTypes.length).fill(0),
                    backgroundColor: 'rgba(52, 211, 153, 0.75)',
                    borderColor: '#34d399',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#94a3b8', precision: 0 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    const ctx4 = document.getElementById('chartTopItems')?.getContext('2d');
    if (ctx4) {
        chartTopItemsInstance = new Chart(ctx4, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: '數值',
                    data: [],
                    backgroundColor: 'rgba(251, 191, 36, 0.8)',
                    borderColor: '#fbbf24',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#f8fafc', font: { size: 10 } }, grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    const ctx5 = document.getElementById('chartTypeSvRadar')?.getContext('2d');
    if (ctx5) {
        chartTypeSvRadarInstance = new Chart(ctx5, {
            type: 'radar',
            data: {
                labels: allTypes,
                datasets: [{
                    label: '貢獻度',
                    data: new Array(allTypes.length).fill(0),
                    backgroundColor: 'rgba(244, 63, 94, 0.25)',
                    borderColor: '#f43f5e',
                    borderWidth: 2,
                    pointBackgroundColor: '#f43f5e'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        pointLabels: { color: '#94a3b8', font: { size: 9 } },
                        ticks: { display: false, beginAtZero: true }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    renderSubSeriesChartCards();
}

function updateAllChartsData(data) {
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
    const mainCats = getMainCategories();
    const allTypes = getAllTypes();

    let mainCatData = {};
    mainCats.forEach(c => {
        mainCatData[c.code] = { TWD: 0, MYR: 0, SV: 0 };
    });

    let subCatDataMap = {};
    let typeQtyMap = {};
    let typeMetricMap5 = {};
    allTypes.forEach(t => { typeQtyMap[t] = 0; typeMetricMap5[t] = 0; });

    Object.keys(cartState).forEach(id => {
        const qty = cartState[id];
        const p = findProductById(id);
        if (p && qty > 0) {
            const priceOrig = parseFloat(p.price) || 0;
            const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = parseFloat(p.sv_point) || 0;

            let priceTWD = itemCurr === 'MYR' ? priceOrig * rate : priceOrig;
            let priceMYR = itemCurr === 'TWD' ? priceOrig / rate : priceOrig;

            let itemTWD = priceTWD * qty;
            let itemMYR = priceMYR * qty;
            let itemSV = sv * qty;

            let subCode = p.subcategory_code || '';
            if (p.product_code === '80050' || p.product_code === '80070') subCode = '0302';
            else if (!subCode && p.product_code && p.product_code.length >= 6) {
                subCode = p.product_code.replace(/^(TW|MY)/, '').slice(0, 4);
            }

            let mainCode = subCode ? subCode.slice(0, 2) : (mainCats[0] ? mainCats[0].code : '01');
            if (!mainCatData[mainCode]) mainCode = mainCats[0] ? mainCats[0].code : '01';

            if (mainCatData[mainCode]) {
                mainCatData[mainCode].TWD += itemTWD;
                mainCatData[mainCode].MYR += itemMYR;
                mainCatData[mainCode].SV += itemSV;
            }

            if (subCode) {
                const subInfo = getSubSeriesInfo(subCode, appState.country === 'MY');
                if (!subCatDataMap[subCode]) {
                    subCatDataMap[subCode] = {
                        code: subCode,
                        mainCode: mainCode,
                        name: subInfo.name,
                        TWD: 0, MYR: 0, SV: 0
                    };
                }
                subCatDataMap[subCode].TWD += itemTWD;
                subCatDataMap[subCode].MYR += itemMYR;
                subCatDataMap[subCode].SV += itemSV;
            }

            const typeName = p.type_name || '特殊';
            if (typeQtyMap[typeName] !== undefined) {
                typeQtyMap[typeName] += qty;
                typeMetricMap5[typeName] += (chart5Metric === 'SV' ? itemSV : (chart5Metric === 'MYR' ? itemMYR : itemTWD));
            }
        }
    });

    if (chartMainCategoryPieInstance) {
        chartMainCategoryPieInstance.data.labels = mainCats.map(c => `${c.code} ${c.name}`);
        chartMainCategoryPieInstance.data.datasets[0].data = mainCats.map(c => mainCatData[c.code] ? mainCatData[c.code][chart1Metric] : 0);
        chartMainCategoryPieInstance.update();
    }

    if (chartSeriesCombinedBarInstance) {
        chartSeriesCombinedBarInstance.data.labels = mainCats.map(c => `${c.code} ${c.name}`);
        chartSeriesCombinedBarInstance.data.datasets[0].label = `採購數值 (${chartBarMetric})`;
        chartSeriesCombinedBarInstance.data.datasets[0].data = mainCats.map(c => mainCatData[c.code] ? mainCatData[c.code][chartBarMetric] : 0);
        chartSeriesCombinedBarInstance.update();
    }

    if (chartTypeQtyInstance) {
        chartTypeQtyInstance.data.labels = allTypes;
        chartTypeQtyInstance.data.datasets[0].data = allTypes.map(t => typeQtyMap[t] || 0);
        chartTypeQtyInstance.update();
    }

    if (chartTopItemsInstance) {
        let topList = [];
        Object.keys(cartState).forEach(id => {
            const qty = cartState[id];
            const p = findProductById(id);
            if (p && qty > 0) {
                const priceOrig = parseFloat(p.price) || 0;
                const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
                const sv = parseFloat(p.sv_point) || 0;

                let val = 0;
                if (chart4Metric === 'SV') {
                    val = sv * qty;
                } else if (chart4Metric === 'MYR') {
                    val = (itemCurr === 'TWD' ? priceOrig / rate : priceOrig) * qty;
                } else {
                    val = (itemCurr === 'MYR' ? priceOrig * rate : priceOrig) * qty;
                }

                topList.push({ name: p.name, val: Math.round(val) });
            }
        });

        topList.sort((a, b) => b.val - a.val);
        const top5 = topList.slice(0, 5);

        chartTopItemsInstance.data.labels = top5.map(i => i.name);
        chartTopItemsInstance.data.datasets[0].label = `數值 (${chart4Metric})`;
        chartTopItemsInstance.data.datasets[0].data = top5.map(i => i.val);
        chartTopItemsInstance.update();
    }

    if (chartTypeSvRadarInstance) {
        chartTypeSvRadarInstance.data.labels = allTypes;
        chartTypeSvRadarInstance.data.datasets[0].label = `貢獻度 (${chart5Metric})`;
        chartTypeSvRadarInstance.data.datasets[0].data = allTypes.map(t => typeMetricMap5[t] || 0);
        chartTypeSvRadarInstance.update();
    }

    mainCats.forEach(cat => {
        const instance = chartSubInstances[cat.code];
        if (instance) {
            const subList = Object.values(subCatDataMap)
                .filter(s => s.mainCode === cat.code && s[chart1Metric] > 0)
                .sort((a, b) => a.code.localeCompare(b.code));

            if (subList.length > 0) {
                instance.data.labels = subList.map(s => `${s.code} ${s.name}`);
                instance.data.datasets[0].data = subList.map(s => s[chart1Metric]);
                instance.data.datasets[0].backgroundColor = [
                    '#38bdf8', '#fb923c', '#34d399', '#f43f5e', '#a855f7', '#facc15', '#22d3ee'
                ];
            } else {
                instance.data.labels = ['無選購項目'];
                instance.data.datasets[0].data = [1];
                instance.data.datasets[0].backgroundColor = ['#334155'];
            }
            instance.update();
        }
    });
}

function getMainCategories() {
    const isMY = appState.country === 'MY';
    return (appState.seriesList || []).map(s => ({
        code: s.code,
        name: getLanguageName(s, isMY) || s.name || s.code,
        color: s.color || '#38bdf8',
        icon: s.icon || 'fa-solid fa-tag'
    }));
}

function getAllTypes() {
    return (appState.typeList || [])
        .filter(t => t.code !== 'ALL' && t.name !== '全部')
        .map(t => t.name);
}

function renderSubSeriesChartCards() {
    const $container = $('#subSeriesChartsContainer');
    if (!$container.length) return;
    $container.empty();

    const mainCats = getMainCategories();
    mainCats.forEach(cat => {
        const html = `
            <div class="col-12 col-md-6">
                <div class="p-3 rounded bg-dark-subtle border border-secondary border-opacity-50 h-100">
                    <div class="fw-bold mb-2" style="color: ${cat.color};">
                        <i class="${cat.icon}"></i> ${cat.code} ${cat.name}
                    </div>
                    <div style="height: 180px; position: relative;">
                        <canvas id="chartSub_${cat.code}"></canvas>
                    </div>
                </div>
            </div>
        `;
        $container.append(html);
    });
}

// ==========================================
// 10. Excel / PDF 匯出功能
// ==========================================
function exportOrderToExcel() {
    const selectedKeys = Object.keys(cartState);
    if (selectedKeys.length === 0) {
        AppDialog.alert("請先選擇至少一項商品後再下載 Excel！", {
            title: "未選擇商品",
            icon: "fa-solid fa-circle-exclamation text-warning"
        });
        return;
    }

    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
    const targetCurr = appState.displayCurrency;
    const isTargetMYR = targetCurr === 'MYR';

    let excelData = [];
    excelData.push(["產品編號", "產品名稱", "規格", `單價(${targetCurr})`, "單項SV", "數量", `小計金額(${targetCurr})`, "小計SV"]);

    let subtotal = 0;
    let totalSV = 0;

    selectedKeys.forEach(id => {
        const qty = cartState[id];
        const p = findProductById(id);
        if (p && qty > 0) {
            const itemPriceOrig = parseFloat(p.price) || 0;
            const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = parseFloat(p.sv_point) || 0;

            let priceInDisplay = itemPriceOrig;
            if (itemCurr === 'TWD' && targetCurr === 'MYR') priceInDisplay = itemPriceOrig / rate;
            else if (itemCurr === 'MYR' && targetCurr === 'TWD') priceInDisplay = itemPriceOrig * rate;

            const itemTotalNT = priceInDisplay * qty;
            const itemTotalSV = sv * qty;
            subtotal += itemTotalNT;
            totalSV += itemTotalSV;
            excelData.push([p.product_code || p.id, p.name, p.package_spec || '-', Math.round(priceInDisplay), sv, qty, Math.round(itemTotalNT), itemTotalSV]);
        }
    });

    let shipping = 0;
    if (appState.country === 'MY') {
        let subtotalMYR = isTargetMYR ? subtotal : subtotal / rate;
        if (subtotalMYR < 800) {
            const baseMYR = appState.myRegion === 'EAST' ? 35 : 15;
            shipping = isTargetMYR ? baseMYR : baseMYR * rate;
        }
    } else {
        if (totalSV < 480) {
            shipping = isTargetMYR ? 150 / rate : 150;
        }
    }

    const grandTotal = subtotal + shipping;
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const rebate = isTargetMYR ? (totalSV * rankRatio) / rate : Math.round(totalSV * rankRatio);

    excelData.push([]);
    excelData.push(["", "", "", "", "", "產品金額小計：", Math.round(subtotal), totalSV]);
    excelData.push(["", "", "", "", "", "物流運費：", Math.round(shipping), ""]);
    excelData.push(["", "", "", "", "", "應付總金額：", Math.round(grandTotal), ""]);
    excelData.push(["", "", "", "", "", "預估現金回饋：", Math.round(rebate), ""]);

    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "訂購試算明細");

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `葡眾團隊訂購試算單_${dateStr}.xlsx`);
}

function exportOrderToPDF() {
    const selectedKeys = Object.keys(cartState);
    if (selectedKeys.length === 0) {
        AppDialog.alert("請先選擇至少一項商品後再進行列印 / 匯出！", {
            title: "未選擇商品",
            icon: "fa-solid fa-circle-exclamation text-warning",
            btnClass: "btn-warning"
        });
        return;
    }

    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
    const targetCurr = appState.displayCurrency;
    const isTargetMYR = targetCurr === 'MYR';
    const currSymbol = isTargetMYR ? 'RM ' : 'NT$ ';

    let subtotal = 0;
    let totalSV = 0;
    let itemsList = [];

    selectedKeys.forEach(id => {
        const qty = cartState[id];
        const p = findProductById(id);
        if (p && qty > 0) {
            const itemPriceOrig = parseFloat(p.price) || 0;
            const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = parseFloat(p.sv_point) || 0;

            let priceInDisplay = itemPriceOrig;
            if (itemCurr === 'TWD' && targetCurr === 'MYR') priceInDisplay = itemPriceOrig / rate;
            else if (itemCurr === 'MYR' && targetCurr === 'TWD') priceInDisplay = itemPriceOrig * rate;

            const itemPrice = priceInDisplay * qty;
            const itemSv = sv * qty;
            subtotal += itemPrice;
            totalSV += itemSv;

            itemsList.push({
                code: p.product_code || p.id,
                name: p.name,
                qty: qty,
                price: itemPrice,
                sv: itemSv
            });
        }
    });

    let shipping = 0;
    if (appState.country === 'MY') {
        let subtotalMYR = isTargetMYR ? subtotal : subtotal / rate;
        if (subtotalMYR < 800) {
            const baseMYR = appState.myRegion === 'EAST' ? 35 : 15;
            shipping = isTargetMYR ? baseMYR : baseMYR * rate;
        }
    } else {
        if (totalSV < 480) {
            shipping = isTargetMYR ? 150 / rate : 150;
        }
    }

    const grandTotal = subtotal + shipping;
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const rebate = isTargetMYR ? (totalSV * rankRatio) / rate : Math.round(totalSV * rankRatio);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    if (typeof printOrderReceipt === 'function') {
        printOrderReceipt({
            items: itemsList,
            subtotal: subtotal,
            shipping: shipping,
            grandTotal: grandTotal,
            totalSV: totalSV,
            rebate: rebate,
            currencySymbol: currSymbol,
            dateStr: dateStr
        });
    } else {
        console.error("未找到 order-printer.js 列印模組！");
    }
}

// ==========================================
// 收集戰情圖表數據與畫布影像並送出列印
// ==========================================
function exportAnalyticsReport() {
    const $btn = $('#btnPrintAnalytics');
    const originalHtml = $btn.html();

    $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 報表產生中...');

    setTimeout(() => {
        try {
            const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
            const mainCats = getMainCategories();
            const allTypes = getAllTypes();

            const showDataLabels = $('#btnGroupShowData button.active').data('value') === true;

            let mainCatData = {};
            mainCats.forEach(c => { mainCatData[c.code] = { TWD: 0, MYR: 0, SV: 0 }; });

            let typeQtyMap = {};
            let typeMetricMap5 = {};
            allTypes.forEach(t => { typeQtyMap[t] = 0; typeMetricMap5[t] = 0; });

            let totalChart1Val = 0;

            Object.keys(cartState).forEach(id => {
                const qty = cartState[id];
                const p = findProductById(id);
                if (p && qty > 0) {
                    const priceOrig = parseFloat(p.price) || 0;
                    const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
                    const sv = parseFloat(p.sv_point) || 0;

                    let priceTWD = itemCurr === 'MYR' ? priceOrig * rate : priceOrig;
                    let priceMYR = itemCurr === 'TWD' ? priceOrig / rate : priceOrig;

                    let itemTWD = priceTWD * qty;
                    let itemMYR = priceMYR * qty;
                    let itemSV = sv * qty;

                    let subCode = p.subcategory_code || '';
                    if (p.product_code === '80050' || p.product_code === '80070') subCode = '0302';
                    else if (!subCode && p.product_code && p.product_code.length >= 6) {
                        subCode = p.product_code.replace(/^(TW|MY)/, '').slice(0, 4);
                    }

                    let mainCode = subCode ? subCode.slice(0, 2) : (mainCats[0] ? mainCats[0].code : '01');
                    if (!mainCatData[mainCode]) mainCode = mainCats[0] ? mainCats[0].code : '01';

                    mainCatData[mainCode].TWD += itemTWD;
                    mainCatData[mainCode].MYR += itemMYR;
                    mainCatData[mainCode].SV += itemSV;

                    const typeName = p.type_name || '特殊';
                    if (typeQtyMap[typeName] !== undefined) {
                        typeQtyMap[typeName] += qty;
                        typeMetricMap5[typeName] += (chart5Metric === 'SV' ? itemSV : (chart5Metric === 'MYR' ? itemMYR : itemTWD));
                    }
                }
            });

            mainCats.forEach(c => {
                totalChart1Val += mainCatData[c.code][chart1Metric];
            });

            const chart1Rows = mainCats.map(c => {
                const val = mainCatData[c.code][chart1Metric];
                const pct = totalChart1Val > 0 ? ((val / totalChart1Val) * 100).toFixed(1) : '0.0';
                return { name: `${c.code} ${c.name}`, val: Math.round(val), pct: pct };
            });

            let topList = [];
            Object.keys(cartState).forEach(id => {
                const qty = cartState[id];
                const p = findProductById(id);
                if (p && qty > 0) {
                    const priceOrig = parseFloat(p.price) || 0;
                    const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
                    const sv = parseFloat(p.sv_point) || 0;

                    let val = 0;
                    if (chart4Metric === 'SV') val = sv * qty;
                    else if (chart4Metric === 'MYR') val = (itemCurr === 'TWD' ? priceOrig / rate : priceOrig) * qty;
                    else val = (itemCurr === 'MYR' ? priceOrig * rate : priceOrig) * qty;

                    topList.push({ name: p.name, val: Math.round(val) });
                }
            });
            topList.sort((a, b) => b.val - a.val);
            const top5List = topList.slice(0, 5);

            const generatePrintChartImg = (sourceChart, chartType, metricUnit = '', showData = true) => {
                if (!sourceChart || !sourceChart.canvas) return '';

                const srcCanvas = sourceChart.canvas;
                if (srcCanvas.width === 0 || srcCanvas.height === 0) return '';

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = srcCanvas.width;
                tempCanvas.height = srcCanvas.height;
                const ctx = tempCanvas.getContext('2d');

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

                ctx.drawImage(srcCanvas, 0, 0);

                if (showData) {
                    ctx.save();
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    sourceChart.data.datasets.forEach((dataset, datasetIndex) => {
                        const meta = sourceChart.getDatasetMeta(datasetIndex);
                        if (!meta || meta.hidden) return;

                        const total = dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);

                        meta.data.forEach((element, index) => {
                            const val = dataset.data[index];
                            if (val === undefined || val === null || val === 0) return;

                            const formattedVal = Math.round(val).toLocaleString();
                            const pct = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '';

                            if (chartType === 'pie' || chartType === 'doughnut') {
                                const { x, y, startAngle, endAngle, innerRadius, outerRadius } = element;
                                const midAngle = startAngle + (endAngle - startAngle) / 2;
                                const radius = (innerRadius !== undefined && outerRadius !== undefined)
                                    ? innerRadius + (outerRadius - innerRadius) * 0.55
                                    : (element.outerRadius || 80) * 0.55;
                                const labelX = x + Math.cos(midAngle) * radius;
                                const labelY = y + Math.sin(midAngle) * radius;

                                ctx.fillStyle = '#ffffff';
                                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                                ctx.shadowBlur = 4;
                                ctx.fillText(`${formattedVal}`, labelX, labelY - 7);
                                ctx.fillText(`(${pct})`, labelX, labelY + 7);
                            } else if (chartType === 'bar') {
                                const { x, y } = element;
                                ctx.fillStyle = '#0f172a';
                                ctx.shadowBlur = 0;
                                if (meta.indexAxis === 'y') {
                                    ctx.textAlign = 'left';
                                    ctx.fillText(` ${formattedVal} ${metricUnit}`, x + 5, y);
                                } else {
                                    ctx.textAlign = 'center';
                                    ctx.fillText(`${formattedVal}`, x, y - 10);
                                }
                            } else if (chartType === 'radar') {
                                const { x, y } = element;
                                ctx.fillStyle = '#0f172a';
                                ctx.shadowBlur = 0;
                                ctx.fillText(`${formattedVal}`, x, y - 10);
                            }
                        });
                    });
                    ctx.restore();
                }

                return tempCanvas.toDataURL('image/png');
            };

            const reportData = {
                dateStr: new Date().toLocaleDateString('zh-TW'),
                chart1: {
                    metric: chart1Metric,
                    img: generatePrintChartImg(chartMainCategoryPieInstance, 'pie', chart1Metric, showDataLabels),
                    rows: chart1Rows,
                    total: Math.round(totalChart1Val)
                },
                chart2: {
                    metric: chartBarMetric,
                    img: generatePrintChartImg(chartSeriesCombinedBarInstance, 'bar', chartBarMetric, showDataLabels)
                },
                chart3: {
                    img: generatePrintChartImg(chartTypeQtyInstance, 'bar', '件', showDataLabels),
                    rows: allTypes.map(t => ({ name: t, qty: typeQtyMap[t] }))
                },
                chart4: {
                    metric: chart4Metric,
                    img: generatePrintChartImg(chartTopItemsInstance, 'bar', chart4Metric, showDataLabels),
                    rows: top5List
                },
                chart5: {
                    metric: chart5Metric,
                    img: generatePrintChartImg(chartTypeSvRadarInstance, 'radar', chart5Metric, showDataLabels),
                    rows: allTypes.map(t => ({ name: t, val: Math.round(typeMetricMap5[t]) }))
                }
            };

            if (typeof printAnalyticsReport === 'function') {
                printAnalyticsReport(reportData);
            } else {
                console.error("未找到 printAnalyticsReport 列印模組！");
            }
        } catch (err) {
            console.error("產生戰報時發生錯誤:", err);
        } finally {
            $btn.prop('disabled', false).html(originalHtml);
        }
    }, 50);
}

// ==========================================
// 11. iframe 視窗滾動動態追蹤定位引擎
// ==========================================
function setupIframeFloatingPositionEngine() {
    function updatePosition() {
        try {
            const isInsideIframe = (window.self !== window.top);
            const isDesktop = window.innerWidth >= 1200;

            if (isInsideIframe) {
                const parentWin = window.parent;
                const frameEl = window.frameElement;
                if (!parentWin || !frameEl) return;

                const parentScrollY = parentWin.scrollY || parentWin.pageYOffset || 0;
                const parentInnerHeight = parentWin.innerHeight || document.documentElement.clientHeight;
                
                const frameRect = frameEl.getBoundingClientRect();
                const iframeTopInParent = frameRect.top + parentScrollY;
                const iframeHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);

                const $cart = $('.cart-summary-card');
                if ($cart.length && isDesktop) {
                    const cartHeight = $cart.outerHeight() || 400;
                    const viewportTopInIframe = parentScrollY - iframeTopInParent;
                    
                    let targetTop = viewportTopInIframe + 70;
                    const offset = $('#analyticsSection').offset();
                    const absoluteTop = offset ? offset.top : iframeHeight;

                    const maxAllowedTop = absoluteTop - cartHeight - 50;
                    targetTop = Math.max(0, Math.min(targetTop, maxAllowedTop));

                    $cart.css({
                        'position': 'relative',
                        'top': targetTop + 'px'
                    });
                } else if ($cart.length && !isDesktop) {
                    $cart.css({ 'position': '', 'top': '' });
                }

                const $bar = $('#floatingIslandBar');
                if ($bar.length && !$bar.hasClass('is-hidden')) {
                    const barHeight = $bar.outerHeight() || 65;
                    const viewportBottomInIframe = (parentScrollY + parentInnerHeight) - iframeTopInParent;

                    let targetTop = viewportBottomInIframe - barHeight - 20;
                    const maxAllowedTop = iframeHeight - barHeight - 20;
                    targetTop = Math.max(20, Math.min(targetTop, maxAllowedTop));

                    $bar.css({
                        'position': 'absolute',
                        'top': targetTop + 'px',
                        'bottom': 'auto',
                        'transform': 'translateX(-50%)'
                    });
                }

                const $wakeBtn = $('#btnShowFloatingBar');
                if ($wakeBtn.length) {
                    const btnHeight = $wakeBtn.outerHeight() || 40;
                    const viewportBottomInIframe = (parentScrollY + parentInnerHeight) - iframeTopInParent;

                    let btnTargetTop = viewportBottomInIframe - btnHeight - 25;
                    const maxAllowedBtnTop = iframeHeight - btnHeight - 20;
                    btnTargetTop = Math.max(25, Math.min(btnTargetTop, maxAllowedBtnTop));

                    $wakeBtn.css({
                        'position': 'absolute',
                        'top': btnTargetTop + 'px',
                        'bottom': 'auto',
                        'left': '25px',
                        'right': 'auto'
                    });
                }
            }
        } catch (e) {
            console.warn("Cross-origin iframe tracking notice:", e);
        }
    }

    try {
        if (window.self !== window.top && window.parent) {
            window.parent.addEventListener('scroll', updatePosition, { passive: true });
            window.parent.addEventListener('resize', updatePosition, { passive: true });
        }
    } catch (e) {
        console.warn(e);
    }

    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });

    updatePosition();
    setTimeout(updatePosition, 300);
    setTimeout(updatePosition, 800);
}