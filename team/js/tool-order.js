// ==========================================
// 1. Google 雲端硬碟試算表設定與解耦合輔助工具
// ==========================================
const SPREADSHEET_ID = "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I";

// 依欄位索引位置取值，避免 Google 試算表重複/空白標題造成的警告
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
        return String(row[colIndex]).trim();
    }
    return defaultVal;
}

// ==========================================
// 2. 系統狀態管理
// ==========================================
let appState = {
    country: 'TW',
    twRegion: 'PICKUP', // 'PICKUP' | 'DELIVERY'
    myRegion: 'PICKUP', // 'PICKUP' | 'WEST' | 'EAST'
    displayCurrency: 'TWD', // 'TWD' | 'MYR'
    exchangeRate: 8.0,
    mainSeries: 'ALL',
    subSeries: 'ALL',
    productType: 'ALL',
    searchKeyword: '',
    products: { TW: [], MY: [] },
    categories: {},
    subcategories: {},
    types: {},
    categoryList: [],
    subcategoryList: [],
    typeList: []
};

let cartState = {}; // { product_code: qty }
let currentView = "card";
let dataTableInstance = null;
let isInitialized = false;

// 圖表指標全域變數
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
// 3. 頁面生命週期初始化
// ==========================================
window.addEventListener('AppReady', async () => {
    initAllCharts();
    await initApp();
    setupIframeFloatingPositionEngine();
});

async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindEvents();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        AppToast.error("未設定 Google 試算表 ID，無法讀取產品資料！");
    }

    renderProducts();
    updateCartSummary();
}

// ==========================================
// 4. 解析 Google Sheets 數據 (解耦合載入)
// ==========================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步產品資料...', '載入即時價目與規格主檔');
    try {
        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP 錯誤狀態碼: ${res.status}`);
            const text = await res.text();
            
            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            // 跳過第一列標題行
            return (parsed.data || []).slice(1);
        };

        const [productsData, mainCategoriesData, subcategoriesData, productTypesData] = await Promise.all([
            fetchSheet('產品主檔'),
            fetchSheet('產品主系列'),
            fetchSheet('產品次系列'),
            fetchSheet('產品型態')
        ]);

        // 1. 解析產品主系列 (Schema: 0:category_code, 1:name_zh, 2:name_en, 3:icon_class, 4:text_color, 5:bg_color, 6:sort_order, 7:is_valid)
        appState.categories = {};
        appState.categoryList = [];
        (mainCategoriesData || []).forEach(row => {
            const code = getVal(row, 0);
            const isValid = getVal(row, 7, 'Y');
            if (code && isValid !== 'N') {
                const item = {
                    category_code: code,
                    name_zh: getVal(row, 1),
                    name_en: getVal(row, 2),
                    icon_class: getVal(row, 3, 'fa-solid fa-layer-group'),
                    text_color: getVal(row, 4, '#38bdf8'),
                    bg_color: getVal(row, 5, 'rgba(10, 25, 19, 0.88)'),
                    sort_order: parseInt(getVal(row, 6, '0'), 10) || 0
                };
                appState.categories[code] = item;
                appState.categoryList.push(item);
            }
        });
        appState.categoryList.sort((a, b) => a.sort_order - b.sort_order);

        // 2. 解析產品次系列 (Schema: 0:subcategory_code, 1:category_code, 2:name_zh, 3:name_en, 4:icon_class, 5:text_color, 6:bg_color, 7:sort_order, 8:is_valid)
        appState.subcategories = {};
        appState.subcategoryList = [];
        (subcategoriesData || []).forEach(row => {
            const subCode = getVal(row, 0);
            const isValid = getVal(row, 8, 'Y');
            if (subCode && isValid !== 'N') {
                const item = {
                    subcategory_code: subCode,
                    category_code: getVal(row, 1),
                    name_zh: getVal(row, 2),
                    name_en: getVal(row, 3),
                    icon_class: getVal(row, 4, 'fa-solid fa-tag'),
                    text_color: getVal(row, 5, '#52b788'),
                    bg_color: getVal(row, 6, 'rgba(10, 25, 19, 0.88)'),
                    sort_order: parseInt(getVal(row, 7, '0'), 10) || 0
                };
                appState.subcategories[subCode] = item;
                appState.subcategoryList.push(item);
            }
        });
        appState.subcategoryList.sort((a, b) => a.sort_order - b.sort_order);

        // 3. 解析產品型態 (Schema: 0:type_code, 1:name_zh, 2:name_en, 3:icon_class, 4:text_color, 5:bg_color, 6:sort_order, 7:is_valid)
        appState.types = {};
        appState.typeList = [];
        (productTypesData || []).forEach(row => {
            const typeCode = getVal(row, 0);
            const isValid = getVal(row, 7, 'Y');
            if (typeCode && isValid !== 'N') {
                const item = {
                    type_code: typeCode,
                    name_zh: getVal(row, 1),
                    name_en: getVal(row, 2),
                    icon_class: getVal(row, 3, 'fa-solid fa-box'),
                    text_color: getVal(row, 4, '#34d399'),
                    bg_color: getVal(row, 5, 'rgba(10, 25, 19, 0.88)'),
                    sort_order: parseInt(getVal(row, 6, '0'), 10) || 0
                };
                appState.types[typeCode] = item;
                appState.typeList.push(item);
            }
        });
        appState.typeList.sort((a, b) => a.sort_order - b.sort_order);

        // 4. 解析產品主檔
        let parsedAll = [];
        (productsData || []).forEach(row => {
            const productCode = getVal(row, 0);
            const isValid = getVal(row, 18, 'Y');
            const launchDate = getVal(row, 19);
            const discontinueDate = getVal(row, 20);
            const status = getProductStatus(launchDate, discontinueDate);

            // 僅保留「即將上市」與「販售中」，排除「已下市」與無效項目
            if (productCode && isValid !== 'N' && status !== 'DISCONTINUED') {
                let regionCode = getVal(row, 1, 'TW').toUpperCase();
                if (!regionCode || (regionCode !== 'TW' && regionCode !== 'MY')) {
                    regionCode = productCode.startsWith('MY') ? 'MY' : 'TW';
                }

                parsedAll.push({
                    product_code: productCode,
                    region_code: regionCode,
                    base_code: getVal(row, 2),
                    name: getVal(row, 3),
                    short_name: getVal(row, 4),
                    short_summary: getVal(row, 5),
                    category_code: getVal(row, 6),
                    subcategory_code: getVal(row, 7),
                    type_code: getVal(row, 8),
                    package_spec: getVal(row, 9),
                    product_weight: getVal(row, 10),
                    price: parseFloat(getVal(row, 11, '0')) || 0,
                    currency: getVal(row, 12, regionCode === 'MY' ? 'MYR' : 'TWD'),
                    sv_point: parseFloat(getVal(row, 13, '0')) || 0,
                    primary_image_url: getVal(row, 14),
                    is_featured: ['TRUE', 'Y', '1'].includes(getVal(row, 15, 'FALSE').toUpperCase()),
                    stock_status: getVal(row, 16, 'IN_STOCK'),
                    sort_order: parseInt(getVal(row, 17, '0'), 10) || 0,
                    launch_date: launchDate,
                    discontinue_date: discontinueDate,
                    status: status
                });
            }
        });

        parsedAll.sort((a, b) => a.sort_order - b.sort_order);

        appState.products.TW = parsedAll.filter(p => p.region_code === 'TW');
        appState.products.MY = parsedAll.filter(p => p.region_code === 'MY');

        updateSeriesDropdowns();
        renderTypeFilterButtons();
        renderSubSeriesChartCards();

        AppToast.success(`產品資料庫同步完成 (共 ${parsedAll.length} 筆商品)`);
    } catch (err) {
        console.error("無法連線至 Google 試算表或讀取失敗:", err);
        AppDialog.alert("無法連線至雲端試算表或讀取資料，請檢查網路連線或試算表共用設定！", {
            title: "資料同步失敗",
            icon: "fa-solid fa-triangle-exclamation text-danger"
        });
    } finally {
        AppLoading.hide();
    }
}

// 依據上市日期與下市日期判定狀態：'COMING_SOON' (即將上市)、'ACTIVE' (販售中)、'DISCONTINUED' (已下市)
function getProductStatus(launchDateVal, discontinueDateVal) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parseDate = (val) => {
        if (!val || (typeof val !== 'string' && typeof val !== 'number')) return null;
        const str = String(val).trim();
        if (!str || str === '-' || str === 'N/A' || str === '0' || str.toLowerCase() === 'null') {
            return null;
        }
        const d = new Date(str.replace(/\//g, '-'));
        return isNaN(d.getTime()) ? null : d;
    };

    const launchDate = parseDate(launchDateVal);
    const discontinueDate = parseDate(discontinueDateVal);

    // 1. 若有上市日期且晚於今天 -> 即將上市
    if (launchDate) {
        launchDate.setHours(0, 0, 0, 0);
        if (launchDate.getTime() > today.getTime()) {
            return 'COMING_SOON';
        }
    }

    // 2. 若有下市日期且早於今天 -> 已下市
    if (discontinueDate) {
        discontinueDate.setHours(0, 0, 0, 0);
        if (discontinueDate.getTime() < today.getTime()) {
            return 'DISCONTINUED';
        }
    }

    // 3. 其餘情況 -> 販售中
    return 'ACTIVE';
}

// ==========================================
// 5. 外鍵名稱與樣式關聯取值函式 (TW: 中文 / MY: 英文)
// ==========================================
function getCategoryInfo(categoryCode, country = appState.country) {
    const isMY = country === 'MY';
    const cat = appState.categories[categoryCode];
    if (cat) {
        const name = (isMY && cat.name_en) ? cat.name_en : (cat.name_zh || categoryCode);
        return {
            code: cat.category_code,
            name: name,
            icon: cat.icon_class || 'fa-solid fa-layer-group',
            color: cat.text_color || '#38bdf8',
            bg: cat.bg_color || 'rgba(10, 25, 19, 0.88)'
        };
    }
    return {
        code: categoryCode || 'OTHER',
        name: categoryCode || '其他主系列',
        icon: 'fa-solid fa-layer-group',
        color: '#38bdf8',
        bg: 'rgba(10, 25, 19, 0.88)'
    };
}

function getSubcategoryInfo(subcategoryCode, country = appState.country) {
    const isMY = country === 'MY';
    const sub = appState.subcategories[subcategoryCode];
    if (sub) {
        const name = (isMY && sub.name_en) ? sub.name_en : (sub.name_zh || subcategoryCode);
        return {
            code: sub.subcategory_code,
            category_code: sub.category_code,
            name: name,
            icon: sub.icon_class || 'fa-solid fa-tag',
            color: sub.text_color || '#52b788',
            bg: sub.bg_color || 'rgba(10, 25, 19, 0.88)'
        };
    }
    return {
        code: subcategoryCode || 'OTHER',
        category_code: '',
        name: subcategoryCode || '一般系列',
        icon: 'fa-solid fa-tag',
        color: '#52b788',
        bg: 'rgba(10, 25, 19, 0.88)'
    };
}

function getTypeInfo(typeCode, country = appState.country) {
    const isMY = country === 'MY';
    const typeObj = appState.types[typeCode];
    if (typeObj) {
        const name = (isMY && typeObj.name_en) ? typeObj.name_en : (typeObj.name_zh || typeCode);
        return {
            code: typeObj.type_code,
            name: name,
            icon: typeObj.icon_class || 'fa-solid fa-box',
            color: typeObj.text_color || '#34d399',
            bg: typeObj.bg_color || 'rgba(10, 25, 19, 0.88)'
        };
    }
    return {
        code: typeCode || 'OTHER',
        name: typeCode || '一般型態',
        icon: 'fa-solid fa-box',
        color: '#34d399',
        bg: 'rgba(10, 25, 19, 0.88)'
    };
}

// ==========================================
// 6. 下拉選單與型態篩選器
// ==========================================
function updateSeriesDropdowns() {
    const mainSelect = document.getElementById('mainSeriesSelect');
    if (!mainSelect) return;

    mainSelect.innerHTML = '<option value="ALL">全部主系列</option>';

    appState.categoryList.forEach(cat => {
        const catInfo = getCategoryInfo(cat.category_code, appState.country);
        const opt = document.createElement('option');
        opt.value = cat.category_code;
        opt.textContent = `${cat.category_code} ${catInfo.name}`;
        mainSelect.appendChild(opt);
    });

    mainSelect.value = appState.mainSeries || 'ALL';
    updateSubSeriesDropdown(mainSelect.value);
}

function updateSubSeriesDropdown(mainCode) {
    const subSelect = document.getElementById('subSeriesSelect');
    if (!subSelect) return;

    subSelect.innerHTML = '';

    if (!mainCode || mainCode === 'ALL') {
        subSelect.disabled = true;
        subSelect.innerHTML = '<option value="ALL">請先選擇主系列</option>';
        return;
    }

    subSelect.disabled = false;
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'ALL';
    defaultOpt.textContent = '全部次系列';
    subSelect.appendChild(defaultOpt);

    const filteredSubs = appState.subcategoryList.filter(s => s.category_code === mainCode);
    filteredSubs.forEach(sub => {
        const subInfo = getSubcategoryInfo(sub.subcategory_code, appState.country);
        const opt = document.createElement('option');
        opt.value = sub.subcategory_code;
        opt.textContent = `${sub.subcategory_code} ${subInfo.name}`;
        subSelect.appendChild(opt);
    });

    subSelect.value = appState.subSeries || 'ALL';
}

function renderTypeFilterButtons() {
    let html = `
        <button class="type-btn ${appState.productType === 'ALL' ? 'active' : ''}" data-type="ALL">
            <i class="fa-solid fa-border-all"></i> 全部型態
        </button>
    `;

    appState.typeList.forEach(t => {
        const typeInfo = getTypeInfo(t.type_code, appState.country);
        const isActive = appState.productType === t.type_code ? 'active' : '';
        html += `
            <button class="type-btn ${isActive}" data-type="${t.type_code}">
                <i class="${typeInfo.icon}"></i> ${typeInfo.name}
            </button>
        `;
    });

    const $container = $('#typeFilterContainer');
    if ($container.length > 0) {
        $container.html(html);
    }
}

// ==========================================
// 7. UI 事件綁定
// ==========================================
function bindEvents() {
    $("#countrySelect").on("change", function () {
        appState.country = $(this).val();
        appState.mainSeries = 'ALL';
        appState.subSeries = 'ALL';
        appState.productType = 'ALL';

        if (appState.country === 'MY') {
            appState.displayCurrency = 'MYR';
            $("#displayCurrencySelect").val('MYR');
            $("#myRegionBlock").removeClass('d-none');
            $("#twRegionBlock").addClass('d-none');
        } else {
            appState.displayCurrency = 'TWD';
            $("#displayCurrencySelect").val('TWD');
            $("#myRegionBlock").addClass('d-none');
            $("#twRegionBlock").removeClass('d-none');
        }

        updateSeriesDropdowns();
        renderTypeFilterButtons();
        renderSubSeriesChartCards();
        renderProducts();
        updateCartSummary();
        AppToast.info(`已切換銷售地區至【${appState.country === 'MY' ? '馬來西亞' : '台灣'}】`);
    });

    $('input[name="twRegion"]').on("change", function () {
        appState.twRegion = $(this).val();
        updateCartSummary();
    });

    $('input[name="myRegion"]').on("change", function () {
        appState.myRegion = $(this).val();
        updateCartSummary();
    });

    $("#displayCurrencySelect").on("change", function () {
        appState.displayCurrency = $(this).val();
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

    $("#btn-export-excel").on("click", exportOrderToExcel);
    $("#btn-export-pdf").on("click", exportOrderToPDF);

    $("#btn-clear-all").on("click", function () {
        if (Object.keys(cartState).length === 0) {
            AppToast.warning("購物車目前為空！");
            return;
        }

        AppDialog.confirm(
            "您確定要清空目前已選擇的所有商品與訂購數量嗎？",
            function () {
                cartState = {};
                renderProducts();
                updateCartSummary();
                AppToast.success("已清空所有選購商品");
            },
            { title: "確認清空購物車", confirmText: "確認清空" }
        );
    });
}

// ==========================================
// 8. 產品資料篩選與畫面渲染
// ==========================================
function getFilteredProducts() {
    let currentDataset = [];
    if (appState.country === 'ALL') {
        currentDataset = [...(appState.products.TW || []), ...(appState.products.MY || [])];
    } else {
        currentDataset = appState.products[appState.country] || [];
    }

    return currentDataset.filter(item => {
        // 主系列篩選 (依 category_code)
        if (appState.mainSeries !== 'ALL') {
            const itemCatCode = item.category_code || (item.subcategory_code ? item.subcategory_code.slice(0, 2) : '');
            if (itemCatCode !== appState.mainSeries) return false;
        }

        // 次系列篩選 (依 subcategory_code)
        if (appState.subSeries !== 'ALL') {
            if (item.subcategory_code !== appState.subSeries) return false;
        }

        // 產品型態篩選 (依 type_code)
        if (appState.productType !== 'ALL') {
            if (item.type_code !== appState.productType) return false;
        }

        // 關鍵字搜尋
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
                <div class="col-12 text-center text-muted py-5 card">
                    <i class="fa-solid fa-magnifying-glass-minus fa-3x mb-3 opacity-50"></i>
                    <p class="mb-0">未找到符合條件的產品，請調整篩選條件或搜尋關鍵字。</p>
                </div>
            `);
            return;
        }

        // 卡片模式：右下角標籤（即將上市 或 明星商品）
        filtered.forEach(item => {
            const qty = cartState[item.product_code] || 0;
            const price = item.price || 0;
            const sv = item.sv_point || 0;
            const currencySymbol = item.currency === 'MYR' ? 'RM ' : 'NT$ ';

            const subInfo = getSubcategoryInfo(item.subcategory_code, item.region_code);
            const typeInfo = getTypeInfo(item.type_code, item.region_code);

            let bottomTagHtml = '';
            if (item.status === 'COMING_SOON') {
                bottomTagHtml = '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> 即將上市</span>';
            } else if (item.is_featured) {
                bottomTagHtml = '<span class="badge badge-danger"><i class="fa-solid fa-fire"></i> 明星商品</span>';
            }

            const cardHtml = `
                <div class="col-12 col-sm-6 col-md-4">
                    <div class="product-item-card">
                        <div>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <span class="product-badge">${item.product_code}</span>
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
                            <div class="d-flex justify-content-between align-items-center mt-2">
                                <div class="qty-control">
                                    <button class="btn-qty btn-minus" data-id="${item.product_code}">
                                        <i class="fa-solid fa-minus"></i>
                                    </button>
                                    <input type="number" class="qty-input" value="${qty}" min="0" data-id="${item.product_code}">
                                    <button class="btn-qty btn-plus" data-id="${item.product_code}">
                                        <i class="fa-solid fa-plus"></i>
                                    </button>
                                </div>
                                <div>
                                    ${bottomTagHtml}
                                </div>
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
            // 表格模式：產品名稱後標籤（即將上市 或 明星商品）
            filtered.forEach(item => {
                const qty = cartState[item.product_code] || 0;
                const price = item.price || 0;
                const sv = item.sv_point || 0;
                const currencySymbol = item.currency === 'MYR' ? 'RM ' : 'NT$ ';

                const subInfo = getSubcategoryInfo(item.subcategory_code, item.region_code);
                const typeInfo = getTypeInfo(item.type_code, item.region_code);

                let nameTagHtml = '';
                if (item.status === 'COMING_SOON') {
                    nameTagHtml = ' <span class="badge badge-warning"><i class="fa-solid fa-clock"></i> 即將上市</span>';
                } else if (item.is_featured) {
                    nameTagHtml = ' <span class="badge badge-danger"><i class="fa-solid fa-fire"></i> 明星商品</span>';
                }

                const rowHtml = `
                    <tr>
                        <td><span class="product-badge">${item.product_code}</span></td>
                        <td class="fw-bold text-white">${item.name}${nameTagHtml}</td>
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
                                <button class="btn-qty btn-minus" data-id="${item.product_code}">
                                    <i class="fa-solid fa-minus"></i>
                                </button>
                                <input type="number" class="qty-input" value="${qty}" min="0" data-id="${item.product_code}">
                                <button class="btn-qty btn-plus" data-id="${item.product_code}">
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

    if (dataTableInstance) {
        dataTableInstance.on('draw', function () {
            Object.keys(cartState).forEach(id => {
                updateQtyInputsUI(id);
            });
        });
    }

    bindQtyEvents();
}

function bindQtyEvents() {
    // 1. 卡片與表格「+」按鈕
    $(document).off("click", ".btn-plus").on("click", ".btn-plus", function () {
        const id = String($(this).attr("data-id") || $(this).data("id")).trim();
        cartState[id] = (cartState[id] || 0) + 1;
        updateQtyInputsUI(id);
        updateCartSummary();
    });

    // 2. 卡片與表格「-」按鈕
    $(document).off("click", ".btn-minus").on("click", ".btn-minus", function () {
        const id = String($(this).attr("data-id") || $(this).data("id")).trim();
        if (cartState[id] && cartState[id] > 0) {
            cartState[id] -= 1;
            if (cartState[id] === 0) delete cartState[id];
            updateQtyInputsUI(id);
            updateCartSummary();
        }
    });

    // 3. 所有數量輸入框「即時手動輸入（input）」
    $(document).off("input", ".qty-input").on("input", ".qty-input", function () {
        const id = String($(this).attr("data-id") || $(this).data("id")).trim();
        const rawVal = $(this).val();

        // 允許使用者先清空輸入框以便重新鍵入數字，不立即強制覆蓋為 0
        if (rawVal === '') {
            return;
        }

        let val = parseInt(rawVal, 10);
        if (isNaN(val) || val < 0) val = 0;

        if (val === 0) {
            delete cartState[id];
        } else {
            cartState[id] = val;
        }

        updateQtyInputsUI(id, this);

        // 若當前是在明細卡片內輸入，直接更新統計，避免完全清空 DOM 導致失去輸入焦點
        if ($(this).hasClass('cart-qty-input')) {
            if (val === 0) {
                updateCartSummary();
            } else {
                updateCartSummaryTotalsOnly();
            }
        } else {
            updateCartSummary();
        }
    });

    // 4. 輸入框「完成輸入或離開焦點（change / blur）」：校正空值與無效值
    $(document).off("change blur", ".qty-input").on("change blur", function () {
        const id = String($(this).attr("data-id") || $(this).data("id")).trim();
        const rawVal = $(this).val().trim();
        let val = parseInt(rawVal, 10);

        if (isNaN(val) || val <= 0) {
            delete cartState[id];
            $(this).val(0);
        } else {
            cartState[id] = val;
            $(this).val(val);
        }

        updateQtyInputsUI(id);
        updateCartSummary();
    });

    // 5. 訂購明細「+」按鈕
    $(document).off("click", ".btn-cart-plus").on("click", ".btn-cart-plus", function () {
        const id = String($(this).attr("data-id")).trim();
        cartState[id] = (cartState[id] || 0) + 1;
        updateQtyInputsUI(id);
        updateCartSummary();
    });

    // 6. 訂購明細「-」按鈕
    $(document).off("click", ".btn-cart-minus").on("click", ".btn-cart-minus", function () {
        const id = String($(this).attr("data-id")).trim();
        if (cartState[id] && cartState[id] > 0) {
            cartState[id] -= 1;
            if (cartState[id] === 0) delete cartState[id];
            updateQtyInputsUI(id);
            updateCartSummary();
        }
    });

    // 7. 訂購明細「刪除品項」垃圾桶按鈕
    $(document).off("click", ".btn-remove-cart-item").on("click", ".btn-remove-cart-item", function () {
        const id = String($(this).attr("data-id")).trim();
        delete cartState[id];
        updateQtyInputsUI(id);
        updateCartSummary();
        AppToast.info("已從訂購清單移除該品項");
    });
}

// 強化商品比對，避免型別不一致或空白問題
function findProductByCode(code) {
    if (!code) return null;
    const targetCode = String(code).trim();
    const all = [...(appState.products.TW || []), ...(appState.products.MY || [])];
    return all.find(p => String(p.product_code).trim() === targetCode);
}

// 同步所有相同商品編號的輸入框值（卡片、表格、明細）
function updateQtyInputsUI(id, activeInput = null) {
    const safeId = String(id).trim();
    const qty = cartState[safeId] !== undefined ? cartState[safeId] : 0;
    $('.qty-input').each(function () {
        if (this === activeInput) return; // 避免打字中途被強制覆寫
        if (String($(this).attr('data-id')).trim() === safeId) {
            $(this).val(qty);
        }
    });
}

// ==========================================
// 9. 訂購試算摘要與運費/回饋金計算
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

    // 判斷是否為「配送」模式（非自取）
    const isDelivery = (appState.country === 'MY')
        ? (appState.myRegion === 'WEST' || appState.myRegion === 'EAST')
        : (appState.twRegion === 'DELIVERY');

    // 依模式控制免運門檻進度條的顯示與隱藏
    if (isDelivery) {
        $("#shipping-progress-container").removeClass("d-none");
    } else {
        $("#shipping-progress-container").addClass("d-none");
    }

    const selectedKeys = Object.keys(cartState);

    if (selectedKeys.length === 0) {
        $container.html(`
            <div class="text-center text-muted d-flex flex-column align-items-center justify-content-center" style="min-height: 150px;" id="empty-cart-msg">
                <i class="fa-solid fa-basket-shopping fa-2x mb-2 opacity-50"></i> 尚未選擇任何商品，請點擊數量增減選擇。
            </div>
        `);

        if (appState.country === 'MY') {
            $("#shipping-progress-text").text(`0 / 800 RM`);
        } else {
            $("#shipping-progress-text").text(`0 / 400 SV`);
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

        updateAllChartsData();
        return;
    }

selectedKeys.forEach(code => {
        const qty = cartState[code];
        const product = findProductByCode(code);
        if (product && qty > 0) {
            const itemPriceOrig = product.price || 0;
            const itemCurr = product.currency || (product.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = product.sv_point || 0;

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

            // 優先採用產品簡稱 short_name
            const displayName = product.short_name || product.name;

            // 訂購明細調整為單行排版
            $container.append(`
                <div class="cart-item-row" data-row-id="${product.product_code}">
                    <div class="cart-item-title" title="${product.name} (${product.product_code})">
                        <i class="fa-solid fa-box text-info"></i> ${displayName}
                    </div>
                    <div class="qty-control">
                        <button type="button" class="btn-qty btn-cart-minus" data-id="${product.product_code}">
                            <i class="fa-solid fa-minus"></i>
                        </button>
                        <input type="number" class="qty-input cart-qty-input" value="${qty}" min="0" data-id="${product.product_code}">
                        <button type="button" class="btn-qty btn-cart-plus" data-id="${product.product_code}">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    <div class="cart-item-price-block">
                        <div class="text-warning font-weight-bold" data-field="price">${currSymbol}${Math.round(itemTotalPrice).toLocaleString()}</div>
                        <div class="text-info" data-field="sv" style="font-size: 0.72rem;">${itemTotalSV.toLocaleString()} SV</div>
                    </div>
                    <button type="button" class="btn-remove-cart-item" data-id="${product.product_code}" title="刪除品項">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `);
        }
    });

    let shippingFeeInDisplay = 0;
    let shippingPercent = 0;

    if (appState.country === 'MY') {
        let subtotalMYR = isTargetMYR ? subtotalDisplay : subtotalDisplay / rate;
        const thresholdMYR = 800;
        let baseShippingMYR = 0;

        if (appState.myRegion === 'EAST') {
            baseShippingMYR = 35;
        } else if (appState.myRegion === 'WEST') {
            baseShippingMYR = 15;
        } else {
            baseShippingMYR = 0; // 自取免運
        }

        if (subtotalMYR >= thresholdMYR || appState.myRegion === 'PICKUP') {
            shippingFeeInDisplay = 0;
        } else {
            shippingFeeInDisplay = isTargetMYR ? baseShippingMYR : baseShippingMYR * rate;
        }

        shippingPercent = Math.min(100, (subtotalMYR / thresholdMYR) * 100);
        $("#shipping-progress-text").text(`${Math.round(subtotalMYR).toLocaleString()} / 800 RM`);
    } else {
        const thresholdSV = 400;
        const baseShippingTWD = appState.twRegion === 'PICKUP' ? 0 : 150;

        if (totalSV >= thresholdSV || appState.twRegion === 'PICKUP') {
            shippingFeeInDisplay = 0;
        } else {
            shippingFeeInDisplay = isTargetMYR ? baseShippingTWD / rate : baseShippingTWD;
        }

        shippingPercent = Math.min(100, (totalSV / thresholdSV) * 100);
        $("#shipping-progress-text").text(`${totalSV.toLocaleString()} / 400 SV`);
    }

    $("#shipping-progress-bar").css("width", `${shippingPercent}%`);

    const grandTotal = subtotalDisplay + shippingFeeInDisplay;
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;

    const pvMultiplier = (appState.country === 'MY' || isTargetMYR) ? 3.5 : 25;
    let estimatedRebateDisplay = totalSV * rankRatio * pvMultiplier;

    if (appState.country === 'TW' && isTargetMYR) {
        estimatedRebateDisplay = (totalSV * rankRatio * 25) / rate;
    } else if (appState.country === 'MY' && !isTargetMYR) {
        estimatedRebateDisplay = (totalSV * rankRatio * 3.5) * rate;
    }

    $("#total-qty-badge").text(`${totalItemsCount} 件商品`);
    $("#summary-subtotal").text(`${currSymbol}${Math.round(subtotalDisplay).toLocaleString()}`);
    $("#summary-shipping").text(shippingFeeInDisplay > 0 ? `${currSymbol}${Math.round(shippingFeeInDisplay).toLocaleString()}` : "免運費");
    $("#summary-grand-total").text(`${currSymbol}${Math.round(grandTotal).toLocaleString()}`);
    $("#summary-total-sv").text(`${totalSV.toLocaleString()} SV`);
    $("#summary-rebate-cash").text(`${currSymbol}${Math.round(estimatedRebateDisplay).toLocaleString()}`);

    $("#sticky-grand-total").text(`${currSymbol}${Math.round(grandTotal).toLocaleString()}`);
    $("#sticky-total-sv").text(`${totalSV.toLocaleString()} SV`);
    $("#sticky-rebate-cash").text(`${currSymbol}${Math.round(estimatedRebateDisplay).toLocaleString()}`);

    updateAllChartsData();
}

// ==========================================
// 10. Chart.js 初始化與外鍵關聯動態統計
// ==========================================
function initAllCharts() {
    bindChartControls();

    const mainCats = appState.categoryList.map(c => getCategoryInfo(c.category_code, appState.country));
    const allTypes = appState.typeList.map(t => getTypeInfo(t.type_code, appState.country).name);

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

    $('#subSeriesChartsModal').off('shown.bs.modal').on('shown.bs.modal', function () {
        if (Object.keys(chartSubInstances).length === 0) {
            renderSubSeriesChartCards();
        }
        updateCartSummary();

        Object.values(chartSubInstances).forEach(inst => {
            if (inst) {
                inst.resize();
                inst.update();
            }
        });
    });
}

function updateAllChartsData() {
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
    const mainCats = appState.categoryList.map(c => getCategoryInfo(c.category_code, appState.country));
    const allTypes = appState.typeList.map(t => getTypeInfo(t.type_code, appState.country));

    let mainCatData = {};
    mainCats.forEach(c => {
        mainCatData[c.code] = { TWD: 0, MYR: 0, SV: 0 };
    });

    let subCatDataMap = {};
    let typeQtyMap = {};
    let typeMetricMap5 = {};
    allTypes.forEach(t => { 
        typeQtyMap[t.code] = 0; 
        typeMetricMap5[t.code] = 0; 
    });

    Object.keys(cartState).forEach(code => {
        const qty = cartState[code];
        const p = findProductByCode(code);
        if (p && qty > 0) {
            const priceOrig = p.price || 0;
            const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = p.sv_point || 0;

            let priceTWD = itemCurr === 'MYR' ? priceOrig * rate : priceOrig;
            let priceMYR = itemCurr === 'TWD' ? priceOrig / rate : priceOrig;

            let itemTWD = priceTWD * qty;
            let itemMYR = priceMYR * qty;
            let itemSV = sv * qty;

            let mainCode = p.category_code || (p.subcategory_code ? p.subcategory_code.slice(0, 2) : '01');
            if (!mainCatData[mainCode] && mainCats[0]) mainCode = mainCats[0].code;

            if (mainCatData[mainCode]) {
                mainCatData[mainCode].TWD += itemTWD;
                mainCatData[mainCode].MYR += itemMYR;
                mainCatData[mainCode].SV += itemSV;
            }

            const subCode = p.subcategory_code;
            if (subCode) {
                const subInfo = getSubcategoryInfo(subCode, appState.country);
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

            const typeCode = p.type_code;
            if (typeQtyMap[typeCode] !== undefined) {
                typeQtyMap[typeCode] += qty;
                typeMetricMap5[typeCode] += (chart5Metric === 'SV' ? itemSV : (chart5Metric === 'MYR' ? itemMYR : itemTWD));
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
        chartTypeQtyInstance.data.labels = allTypes.map(t => t.name);
        chartTypeQtyInstance.data.datasets[0].data = allTypes.map(t => typeQtyMap[t.code] || 0);
        chartTypeQtyInstance.update();
    }

    if (chartTopItemsInstance) {
        let topList = [];
        Object.keys(cartState).forEach(code => {
            const qty = cartState[code];
            const p = findProductByCode(code);
            if (p && qty > 0) {
                const priceOrig = p.price || 0;
                const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
                const sv = p.sv_point || 0;

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
        chartTypeSvRadarInstance.data.labels = allTypes.map(t => t.name);
        chartTypeSvRadarInstance.data.datasets[0].label = `貢獻度 (${chart5Metric})`;
        chartTypeSvRadarInstance.data.datasets[0].data = allTypes.map(t => typeMetricMap5[t.code] || 0);
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

function renderSubSeriesChartCards() {
    const $container = $('#subSeriesChartsContainer');
    if (!$container.length) return;
    $container.empty();

    Object.values(chartSubInstances).forEach(inst => {
        if (inst) inst.destroy();
    });
    chartSubInstances = {};

    const mainCats = appState.categoryList.map(c => getCategoryInfo(c.category_code, appState.country));
    if (!mainCats || mainCats.length === 0) return;

    mainCats.forEach(cat => {
        const canvasId = `chartSub_${cat.code}`;
        const html = `
            <div class="col-12 col-md-6 mb-3">
                <div class="p-3 rounded bg-dark-subtle border border-secondary border-opacity-50 h-100">
                    <div class="fw-bold mb-2" style="color: ${cat.color};">
                        <i class="${cat.icon}"></i> ${cat.code} ${cat.name}
                    </div>
                    <div style="height: 180px; position: relative;">
                        <canvas id="${canvasId}"></canvas>
                    </div>
                </div>
            </div>
        `;
        $container.append(html);

        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (ctx) {
            chartSubInstances[cat.code] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['無選購項目'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#334155'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color: '#94a3b8', font: { size: 10 } }
                        }
                    }
                }
            });
        }
    });
}

// ==========================================
// 11. Excel 匯出與 PDF 列印模組
// ==========================================
function exportOrderToExcel() {
    const selectedKeys = Object.keys(cartState);
    if (selectedKeys.length === 0) {
        AppToast.warning("請先選擇至少一項商品後再下載 Excel！");
        return;
    }

    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
    const targetCurr = appState.displayCurrency;
    const isTargetMYR = targetCurr === 'MYR';

    let excelData = [];
    excelData.push(["產品編號", "產品名稱", "主系列", "次系列", "型態", "規格", `單價(${targetCurr})`, "單項SV", "數量", `小計金額(${targetCurr})`, "小計SV"]);

    let subtotal = 0;
    let totalSV = 0;

    selectedKeys.forEach(code => {
        const qty = cartState[code];
        const p = findProductByCode(code);
        if (p && qty > 0) {
            const itemPriceOrig = p.price || 0;
            const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = p.sv_point || 0;

            let priceInDisplay = itemPriceOrig;
            if (itemCurr === 'TWD' && targetCurr === 'MYR') priceInDisplay = itemPriceOrig / rate;
            else if (itemCurr === 'MYR' && targetCurr === 'TWD') priceInDisplay = itemPriceOrig * rate;

            const itemTotalNT = priceInDisplay * qty;
            const itemTotalSV = sv * qty;
            subtotal += itemTotalNT;
            totalSV += itemTotalSV;

            const catInfo = getCategoryInfo(p.category_code, appState.country);
            const subInfo = getSubcategoryInfo(p.subcategory_code, appState.country);
            const typeInfo = getTypeInfo(p.type_code, appState.country);

            excelData.push([
                p.product_code,
                p.name,
                catInfo.name,
                subInfo.name,
                typeInfo.name,
                p.package_spec || '-',
                Math.round(priceInDisplay),
                sv,
                qty,
                Math.round(itemTotalNT),
                itemTotalSV
            ]);
        }
    });

    let shipping = 0;
    if (appState.country === 'MY') {
        let subtotalMYR = isTargetMYR ? subtotal : subtotal / rate;
        if (subtotalMYR < 800 && appState.myRegion !== 'PICKUP') {
            const baseMYR = appState.myRegion === 'EAST' ? 35 : 15;
            shipping = isTargetMYR ? baseMYR : baseMYR * rate;
        }
    } else {
        if (totalSV < 400 && appState.twRegion !== 'PICKUP') {
            shipping = isTargetMYR ? 150 / rate : 150;
        }
    }

    const grandTotal = subtotal + shipping;
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const pvMultiplier = (appState.country === 'MY' || isTargetMYR) ? 3.5 : 25;
    
    let rebate = totalSV * rankRatio * pvMultiplier;
    if (appState.country === 'TW' && isTargetMYR) {
        rebate = (totalSV * rankRatio * 25) / rate;
    } else if (appState.country === 'MY' && !isTargetMYR) {
        rebate = (totalSV * rankRatio * 3.5) * rate;
    }

    excelData.push([]);
    excelData.push(["", "", "", "", "", "", "", "", "產品金額小計：", Math.round(subtotal), totalSV]);
    excelData.push(["", "", "", "", "", "", "", "", "物流運費：", Math.round(shipping), ""]);
    excelData.push(["", "", "", "", "", "", "", "", "應付總金額：", Math.round(grandTotal), ""]);
    excelData.push(["", "", "", "", "", "", "", "", "預估現金回饋：", Math.round(rebate), ""]);

    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "訂購試算明細");

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `葡眾團隊訂購試算單_${dateStr}.xlsx`);
    AppToast.success("訂購試算 Excel 檔案下載成功！");
}

function exportOrderToPDF() {
    const selectedKeys = Object.keys(cartState);
    if (selectedKeys.length === 0) {
        AppToast.warning("請先選擇至少一項商品後再進行列印 / 匯出！");
        return;
    }

    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
    const targetCurr = appState.displayCurrency;
    const isTargetMYR = targetCurr === 'MYR';
    const currSymbol = isTargetMYR ? 'RM ' : 'NT$ ';

    let subtotal = 0;
    let totalSV = 0;
    let itemsList = [];

    selectedKeys.forEach(code => {
        const qty = cartState[code];
        const p = findProductByCode(code);
        if (p && qty > 0) {
            const itemPriceOrig = p.price || 0;
            const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = p.sv_point || 0;

            let priceInDisplay = itemPriceOrig;
            if (itemCurr === 'TWD' && targetCurr === 'MYR') priceInDisplay = itemPriceOrig / rate;
            else if (itemCurr === 'MYR' && targetCurr === 'TWD') priceInDisplay = itemPriceOrig * rate;

            const itemPrice = priceInDisplay * qty;
            const itemSv = sv * qty;
            subtotal += itemPrice;
            totalSV += itemSv;

            itemsList.push({
                code: p.product_code,
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
        if (subtotalMYR < 800 && appState.myRegion !== 'PICKUP') {
            const baseMYR = appState.myRegion === 'EAST' ? 35 : 15;
            shipping = isTargetMYR ? baseMYR : baseMYR * rate;
        }
    } else {
        if (totalSV < 400 && appState.twRegion !== 'PICKUP') {
            shipping = isTargetMYR ? 150 / rate : 150;
        }
    }

    const grandTotal = subtotal + shipping;
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const pvMultiplier = (appState.country === 'MY' || isTargetMYR) ? 3.5 : 25;

    let rebate = totalSV * rankRatio * pvMultiplier;
    if (appState.country === 'TW' && isTargetMYR) {
        rebate = (totalSV * rankRatio * 25) / rate;
    } else if (appState.country === 'MY' && !isTargetMYR) {
        rebate = (totalSV * rankRatio * 3.5) * rate;
    }
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
        AppToast.error("未找到 order-printer.js 列印模組！");
    }
}

// ==========================================
// 12. 戰情數據報表列印
// ==========================================
function exportAnalyticsReport() {
    const $btn = $('#btnPrintAnalytics');
    const originalHtml = $btn.html();

    $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 報表產生中...');

    setTimeout(() => {
        try {
            const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
            const mainCats = appState.categoryList.map(c => getCategoryInfo(c.category_code, appState.country));
            const allTypes = appState.typeList.map(t => getTypeInfo(t.type_code, appState.country));
            const showDataLabels = $('#btnGroupShowData button.active').data('value') === true;

            let mainCatData = {};
            mainCats.forEach(c => { mainCatData[c.code] = { TWD: 0, MYR: 0, SV: 0 }; });

            let typeQtyMap = {};
            let typeMetricMap5 = {};
            allTypes.forEach(t => { typeQtyMap[t.code] = 0; typeMetricMap5[t.code] = 0; });

            let totalChart1Val = 0;

            Object.keys(cartState).forEach(code => {
                const qty = cartState[code];
                const p = findProductByCode(code);
                if (p && qty > 0) {
                    const priceOrig = p.price || 0;
                    const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
                    const sv = p.sv_point || 0;

                    let priceTWD = itemCurr === 'MYR' ? priceOrig * rate : priceOrig;
                    let priceMYR = itemCurr === 'TWD' ? priceOrig / rate : priceOrig;

                    let itemTWD = priceTWD * qty;
                    let itemMYR = priceMYR * qty;
                    let itemSV = sv * qty;

                    let mainCode = p.category_code || (p.subcategory_code ? p.subcategory_code.slice(0, 2) : '01');
                    if (!mainCatData[mainCode] && mainCats[0]) mainCode = mainCats[0].code;

                    if (mainCatData[mainCode]) {
                        mainCatData[mainCode].TWD += itemTWD;
                        mainCatData[mainCode].MYR += itemMYR;
                        mainCatData[mainCode].SV += itemSV;
                    }

                    const typeCode = p.type_code;
                    if (typeQtyMap[typeCode] !== undefined) {
                        typeQtyMap[typeCode] += qty;
                        typeMetricMap5[typeCode] += (chart5Metric === 'SV' ? itemSV : (chart5Metric === 'MYR' ? itemMYR : itemTWD));
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
            Object.keys(cartState).forEach(code => {
                const qty = cartState[code];
                const p = findProductByCode(code);
                if (p && qty > 0) {
                    const priceOrig = p.price || 0;
                    const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
                    const sv = p.sv_point || 0;

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
                    rows: allTypes.map(t => ({ name: t.name, qty: typeQtyMap[t.code] }))
                },
                chart4: {
                    metric: chart4Metric,
                    img: generatePrintChartImg(chartTopItemsInstance, 'bar', chart4Metric, showDataLabels),
                    rows: top5List
                },
                chart5: {
                    metric: chart5Metric,
                    img: generatePrintChartImg(chartTypeSvRadarInstance, 'radar', chart5Metric, showDataLabels),
                    rows: allTypes.map(t => ({ name: t.name, val: Math.round(typeMetricMap5[t.code]) }))
                }
            };

            if (typeof printAnalyticsReport === 'function') {
                printAnalyticsReport(reportData);
            } else {
                AppToast.error("未找到 printAnalyticsReport 列印模組！");
            }
        } catch (err) {
            console.error("產生戰報時發生錯誤:", err);
            AppToast.error("產生戰報失敗");
        } finally {
            $btn.prop('disabled', false).html(originalHtml);
        }
    }, 50);
}

// ==========================================
// 13. iframe 視窗滾動動態追蹤定位引擎
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
    } catch (e) {}

    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });

    updatePosition();
    setTimeout(updatePosition, 300);
    setTimeout(updatePosition, 800);
}

function updateCartSummaryTotalsOnly() {
    let totalItemsCount = 0;
    let totalSV = 0;
    let subtotalDisplay = 0;

    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
    const targetCurr = appState.displayCurrency;
    const isTargetMYR = targetCurr === 'MYR';
    const currSymbol = isTargetMYR ? 'RM ' : 'NT$ ';

    Object.keys(cartState).forEach(code => {
        const qty = cartState[code];
        const product = findProductByCode(code);
        if (product && qty > 0) {
            const itemPriceOrig = product.price || 0;
            const itemCurr = product.currency || (product.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = product.sv_point || 0;

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

            const $row = $(`.cart-item-row[data-row-id="${code}"]`);
            if ($row.length) {
                $row.find('[data-field="price"]').text(`${currSymbol}${Math.round(itemTotalPrice).toLocaleString()}`);
                $row.find('[data-field="sv"]').text(`${itemTotalSV.toLocaleString()} SV`);
            }
        }
    });

    let shippingFeeInDisplay = 0;
    let shippingPercent = 0;

    if (appState.country === 'MY') {
        let subtotalMYR = isTargetMYR ? subtotalDisplay : subtotalDisplay / rate;
        const thresholdMYR = 800;
        let baseShippingMYR = 0;
        if (appState.myRegion === 'EAST') baseShippingMYR = 35;
        else if (appState.myRegion === 'WEST') baseShippingMYR = 15;

        if (subtotalMYR >= thresholdMYR || appState.myRegion === 'PICKUP') {
            shippingFeeInDisplay = 0;
        } else {
            shippingFeeInDisplay = isTargetMYR ? baseShippingMYR : baseShippingMYR * rate;
        }
        shippingPercent = Math.min(100, (subtotalMYR / thresholdMYR) * 100);
        $("#shipping-progress-text").text(`${Math.round(subtotalMYR).toLocaleString()} / 800 RM`);
    } else {
        const thresholdSV = 400;
        const baseShippingTWD = appState.twRegion === 'PICKUP' ? 0 : 150;
        if (totalSV >= thresholdSV || appState.twRegion === 'PICKUP') {
            shippingFeeInDisplay = 0;
        } else {
            shippingFeeInDisplay = isTargetMYR ? baseShippingTWD / rate : baseShippingTWD;
        }
        shippingPercent = Math.min(100, (totalSV / thresholdSV) * 100);
        $("#shipping-progress-text").text(`${totalSV.toLocaleString()} / 400 SV`);
    }

    $("#shipping-progress-bar").css("width", `${shippingPercent}%`);

    const grandTotal = subtotalDisplay + shippingFeeInDisplay;
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const pvMultiplier = (appState.country === 'MY' || isTargetMYR) ? 3.5 : 25;
    let estimatedRebateDisplay = totalSV * rankRatio * pvMultiplier;

    if (appState.country === 'TW' && isTargetMYR) {
        estimatedRebateDisplay = (totalSV * rankRatio * 25) / rate;
    } else if (appState.country === 'MY' && !isTargetMYR) {
        estimatedRebateDisplay = (totalSV * rankRatio * 3.5) * rate;
    }

    $("#total-qty-badge").text(`${totalItemsCount} 件商品`);
    $("#summary-subtotal").text(`${currSymbol}${Math.round(subtotalDisplay).toLocaleString()}`);
    $("#summary-shipping").text(shippingFeeInDisplay > 0 ? `${currSymbol}${Math.round(shippingFeeInDisplay).toLocaleString()}` : "免運費");
    $("#summary-grand-total").text(`${currSymbol}${Math.round(grandTotal).toLocaleString()}`);
    $("#summary-total-sv").text(`${totalSV.toLocaleString()} SV`);
    $("#summary-rebate-cash").text(`${currSymbol}${Math.round(estimatedRebateDisplay).toLocaleString()}`);

    $("#sticky-grand-total").text(`${currSymbol}${Math.round(grandTotal).toLocaleString()}`);
    $("#sticky-total-sv").text(`${totalSV.toLocaleString()} SV`);
    $("#sticky-rebate-cash").text(`${currSymbol}${Math.round(estimatedRebateDisplay).toLocaleString()}`);

    updateAllChartsData();
}