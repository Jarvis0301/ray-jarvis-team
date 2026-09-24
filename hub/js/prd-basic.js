// ==========================================================================
// 1. Google 雲端試算表設定與核心常數
// ==========================================================================
const SPREADSHEET_ID = {
    PRD: APP_CONFIG.SHEETS.PRD
};

const GAS_DEPLOY_ID = {
    PRD: APP_CONFIG.GAS.PRD
};

const SHEET_NAMES = {
    PRODUCTS: APP_CONFIG.SHEET_NAMES.PRD.PRODUCTS,
    DETAILS: APP_CONFIG.SHEET_NAMES.PRD.DETAILS,
    CATEGORIES: APP_CONFIG.SHEET_NAMES.PRD.CATEGORIES,
    SUBCATEGORIES: APP_CONFIG.SHEET_NAMES.PRD.SUBCATEGORIES,
    TYPES: APP_CONFIG.SHEET_NAMES.PRD.TYPES
};

/**
 * 依據「上市日期」與「下市日期」計算產品上市狀態
 * 全面整合 AppDate 多階精度時間戳轉換，支援 YYYY / YYYY-MM / YYYY-MM-DD
 */
function getLaunchStatus(launchDateStr, discontinueDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    // 透過 AppDate 取得毫秒時間戳記 (解析失敗回傳 0)
    const lTs = AppDate.toTimestamp(launchDateStr);
    const dTs = AppDate.toTimestamp(discontinueDateStr);

    // 1. 若上市日期大於今日零時 -> 即將上市
    if (lTs > 0 && lTs > todayTs) {
        return { 
            code: 'COMING_SOON', 
            text: '即將上市', 
            badge: UIBadges.product.launchStatus('COMING_SOON') 
        };
    }

    // 2. 若下市日期小於等於今日零時 -> 已下市
    if (dTs > 0 && dTs <= todayTs) {
        return { 
            code: 'DISCONTINUED', 
            text: '已下市', 
            badge: UIBadges.product.launchStatus('DISCONTINUED') 
        };
    }

    // 3. 其餘情況皆為正常販售中
    return { 
        code: 'ACTIVE', 
        text: '販售中', 
        badge: UIBadges.product.launchStatus('ACTIVE') 
    };
}

// ==========================================================================
// 2. 系統狀態管理 (State Management)
// ==========================================================================
let appState = {
    products: [],          // prd_items (主檔) + prd_item_details (詳情) 聯合資料
    categories: [],        // prd_categories (產品主系列)
    subcategories: [],     // prd_subcategories (產品次系列)
    types: []              // prd_types (產品型態)
};

let currentAnalyticsRegion = 'ALL';
let masterDataTableInstance = null;
let chartInstances = {};
let isInitialized = false;
let currentFxRate = APP_CONFIG.FIN?.EXCHANGE_RATE?.MYR_TWD || 8.00;           // 基準結算匯率狀態變數 (預設 1 MYR = 8.00 TWD)
let matrixTableInstance = null;
let rawTableInstance = null;

// ==========================================================================
// 3. 系統生命週期與事件初始化
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(GAS_DEPLOY_ID.PRD);
    }
    await initApp();
});

async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    $('#crossBorderFxRateInput').val(currentFxRate.toFixed(2));

    bindUIEvents();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        AppToast.error("未設定 Google 試算表 ID，無法讀取產品資料！");
        refreshView();
    }
}

// ==========================================================================
// 4. 資料讀取與 5 表解析引擎 (依欄位順序解析)
// ==========================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i>正在讀取雲端資料庫...', '載入中...');

    try {
        const [rawItems, rawDetails, rawCats, rawSubcats, rawTypes] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.PRODUCTS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.DETAILS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.CATEGORIES).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.SUBCATEGORIES).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.TYPES).catch(() => [])
        ]);

        appState.categories = parseCategoriesTable(rawCats);
        appState.subcategories = parseSubcategoriesTable(rawSubcats);
        appState.types = parseTypesTable(rawTypes);

        const items = parseItemsTable(rawItems);
        const details = parseDetailsTable(rawDetails);

        appState.products = items.map(item => {
            const detail = details.find(d => String(d.product_id) === String(item.product_code)) || {};
            return {
                ...item,
                ...detail,
                product_code: item.product_code
            };
        });

        refreshView();
        AppToast.success(`已成功同步 ${appState.products.length} 筆產品資料`);
    } catch (err) {
        console.warn("Google Sheets 資料讀取異常:", err);
        AppToast.error("Google 試算表連線異常，無法讀取完整產品資料！");
        refreshView();
    } finally {
        AppLoading.hide();
    }
}

function parseItemsTable(rows) {
    const defaultCurr = APP_CONFIG.FIN?.DEFAULT_CURRENCY || 'TWD';
    return rows.map((r, idx) => ({
        product_code: getVal(r, 0, `SKU_${idx + 1}`),
        region_code: getVal(r, 1, 'TW'),
        base_code: getVal(r, 2, ''),
        name: getVal(r, 3, '未命名產品'),
        short_name: getVal(r, 4, ''),
        short_summary: getVal(r, 5, ''),
        category_code: getVal(r, 6, ''),
        subcategory_code: getVal(r, 7, ''),
        type_code: getVal(r, 8, ''),
        package_spec: getVal(r, 9, ''),
        piece_spec: getVal(r, 10, ''),             // Index 10: 最小受控單位規格
        product_weight: parseInt(getVal(r, 11, '0'), 10) || 0, // Index 11: 產品重量(g)
        base_unit: getVal(r, 12, '盒'),             // Index 12: 官方原裝標準計量單位
        sub_unit: getVal(r, 13, ''),               // Index 13: 散裝出貨最小受控單位
        pieces_per_box: parseInt(getVal(r, 14, '1'), 10) || 1, // Index 14: 單盒(箱)散件總量 N
        allow_decant: getVal(r, 15, 'Y').toUpperCase() === 'N' ? 'N' : 'Y', // Index 15: 是否開放拆盒散賣
        price: parseFloat(getVal(r, 16, '0')) || 0,
        currency: getVal(r, 17, defaultCurr),
        sv_point: parseInt(getVal(r, 18, '0'), 10) || 0,
        primary_image_url: getVal(r, 19, 'https://via.placeholder.com/150/1a122d/c084fc?text=No+Image'),
        is_featured: ['TRUE', 'Y', '1'].includes(getVal(r, 20, 'FALSE').toUpperCase()),
        stock_status: getVal(r, 21, '現貨'),
        remarks: getVal(r, 22, ''),
        is_valid: getVal(r, 23, 'Y').toUpperCase() === 'Y' ? 'Y' : 'N',
        launch_date: getVal(r, 24, ''),
        discontinue_date: getVal(r, 25, ''),       // Index 25: 停售/下市日期
        official_update_date: getVal(r, 26, ''),
        created_by: getVal(r, 27, 'SYSTEM'),
        created_at: getVal(r, 28, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 29, 'SYSTEM'),
        modified_at: getVal(r, 30, '2026-01-01 00:00:00')
    })).filter(item => item.product_code && item.name !== '未命名產品');
}

function parseDetailsTable(rows) {
    return rows.map((r, idx) => ({
        product_id: getVal(r, 0, `SKU_${idx + 1}`),
        hd_image_url: getVal(r, 1, ''),
        certifications: getVal(r, 2, ''),
        detailed_description: getVal(r, 3, ''),
        usage_scenarios: getVal(r, 4, ''),
        phrase_tags: getVal(r, 5, ''),
        features_and_functions: getVal(r, 6, ''),
        ingredients: getVal(r, 7, ''),
        official_site_url: getVal(r, 8, ''),
        created_by: getVal(r, 9, 'SYSTEM'),
        created_at: getVal(r, 10, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 11, 'SYSTEM'),
        modified_at: getVal(r, 12, '2026-01-01 00:00:00')
    }));
}

function parseCategoriesTable(rows) {
    return rows.map((r, idx) => ({
        category_code: getVal(r, 0, `0${idx + 1}`),
        name_zh: getVal(r, 1, '未命名主系列'),
        name_en: getVal(r, 2, ''),
        icon_class: getVal(r, 3, 'fa-solid fa-folder'),
        text_color: getVal(r, 4, '#8b5cf6'),
        bg_color: getVal(r, 5, '#1a122d'),
        sort_order: parseInt(getVal(r, 6, '0'), 10) || 0,
        is_valid: getVal(r, 7, 'Y').toUpperCase() === 'Y' ? 'Y' : 'N',
        created_by: getVal(r, 8, 'SYSTEM'),
        created_at: getVal(r, 9, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 10, 'SYSTEM'),
        modified_at: getVal(r, 11, '2026-01-01 00:00:00')
    })).filter(c => c.category_code && c.name_zh !== '未命名主系列');
}

function parseSubcategoriesTable(rows) {
    return rows.map((r, idx) => ({
        subcategory_code: getVal(r, 0, `0${idx + 1}01`),
        category_code: getVal(r, 1, '01'),
        name_zh: getVal(r, 2, '未命名次系列'),
        name_en: getVal(r, 3, ''),
        icon_class: getVal(r, 4, 'fa-solid fa-tag'),
        text_color: getVal(r, 5, '#c084fc'),
        bg_color: getVal(r, 6, '#1a122d'),
        sort_order: parseInt(getVal(r, 7, '0'), 10) || 0,
        is_valid: getVal(r, 8, 'Y').toUpperCase() === 'Y' ? 'Y' : 'N',
        created_by: getVal(r, 9, 'SYSTEM'),
        created_at: getVal(r, 10, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 11, 'SYSTEM'),
        modified_at: getVal(r, 12, '2026-01-01 00:00:00')
    })).filter(s => s.subcategory_code && s.name_zh !== '未命名次系列');
}

function parseTypesTable(rows) {
    return rows.map((r, idx) => ({
        type_code: getVal(r, 0, `0${idx + 1}01`),
        name_zh: getVal(r, 1, '未命名型態'),
        name_en: getVal(r, 2, ''),
        icon_class: getVal(r, 3, 'fa-solid fa-cubes'),
        text_color: getVal(r, 4, '#38bdf8'),
        bg_color: getVal(r, 5, '#1a122d'),
        sort_order: parseInt(getVal(r, 6, '0'), 10) || 0,
        is_valid: getVal(r, 7, 'Y').toUpperCase() === 'Y' ? 'Y' : 'N',
        created_by: getVal(r, 8, 'SYSTEM'),
        created_at: getVal(r, 9, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 10, 'SYSTEM'),
        modified_at: getVal(r, 11, '2026-01-01 00:00:00')
    })).filter(t => t.type_code && t.name_zh !== '未命名型態');
}

// ==========================================================================
// 5. 外鍵關聯與多語系名稱解析
// ==========================================================================
function getCategoryByCode(code) {
    if (!code) return { category_code: '', name_zh: '未分類主系列', name_en: 'Uncategorized', icon_class: 'fa-solid fa-folder', text_color: '#8b5cf6', bg_color: '#1a122d' };
    const found = appState.categories.find(c => String(c.category_code).trim() === String(code).trim());
    return found || { category_code: code, name_zh: '未分類主系列', name_en: 'Uncategorized', icon_class: 'fa-solid fa-folder', text_color: '#8b5cf6', bg_color: '#1a122d' };
}

function getSubcategoryByCode(code) {
    if (!code) return { subcategory_code: '', category_code: '', name_zh: '未分類次系列', name_en: 'General Subcategory', icon_class: 'fa-solid fa-tag', text_color: '#f5f3ff', bg_color: '#1a122d' };
    const found = appState.subcategories.find(s => String(s.subcategory_code).trim() === String(code).trim());
    return found || { subcategory_code: code, category_code: '', name_zh: '未分類次系列', name_en: 'General Subcategory', icon_class: 'fa-solid fa-tag', text_color: '#f5f3ff', bg_color: '#1a122d' };
}

function getTypeByCode(code) {
    if (!code) return { type_code: '', name_zh: '未指定型態', name_en: 'General Type', icon_class: 'fa-solid fa-cubes', text_color: '#38bdf8', bg_color: '#1a122d' };
    const found = appState.types.find(t => String(t.type_code).trim() === String(code).trim());
    return found || { type_code: code, name_zh: '未指定型態', name_en: 'General Type', icon_class: 'fa-solid fa-cubes', text_color: '#38bdf8', bg_color: '#1a122d' };
}

function getLocalizedName(entity, regionCode = 'TW') {
    if (!entity) return '';
    const isMY = String(regionCode).toUpperCase() === 'MY';
    if (isMY) {
        return entity.name_en || entity.name_zh || '';
    }
    return entity.name_zh || entity.name_en || '';
}

// ==========================================================================
// 6. 介面事件綁定與視圖渲染中樞
// ==========================================================================
function bindUIEvents() {
    $('#btnOpenNewProductModal').on('click', () => openAddModal());
    $('#btnSaveFullProduct').on('click', () => saveProductItem());
    $('#btnSaveTaxonomy').on('click', () => saveTaxonomyItem());

    // 篩選條件聯動
    $('#filterMasterRegion, #filterMasterCategory, #filterMasterSubcategory, #filterMasterType, #filterMasterLaunchStatus, #filterMasterStock').on('change', () => {
        applyMasterFilters();
    });

    // 產品 Modal 地區切換時重新渲染主/次系列與型態選項
    $('select[name="region_code"]').on('change', function () {
        const reg = $(this).val();
        populateModalTaxonomySelects(reg);
        updateModalCurrency(reg);
    });

    // 次系列變更時自動同步主系列下拉值
    $('#modalSelectSubcategory, select[name="subcategory_code"]').on('change', function () {
        const subcatCode = $(this).val();
        const subcat = getSubcategoryByCode(subcatCode);
        if (subcat && subcat.category_code) {
            $('#modalSelectCategory, select[name="category_code"]').val(subcat.category_code);
        }
    });

    // 統計看板全域地區切換按鈕
    $('#analyticsRegionButtonGroup button').on('click', function () {
        $('#analyticsRegionButtonGroup button').removeClass('active');
        $(this).addClass('active');
        currentAnalyticsRegion = $(this).data('region') || 'ALL';
        renderAnalyticsCharts();
    });

    // 跨國產品對照表：動態匯率變動監聽
    $('#crossBorderFxRateInput').off('input change').on('input change', function () {
        let rate = parseFloat($(this).val());
        if (isNaN(rate) || rate <= 0) {
            rate = APP_CONFIG.FIN?.EXCHANGE_RATE?.MYR_TWD || 8.00;
        }
        currentFxRate = rate;
        renderCrossBorderMatrix();
    });

    // 頁籤切換至跨國產品對照表時重新校正 DataTable 欄寬
    $('button[data-bs-toggle="tab"]').on('shown.bs.tab', (e) => {
        if (e.target.id === 'tab-analytics-link') {
            renderAnalyticsCharts();
        } else if (e.target.id === 'tab-crossborder-link') {
            if (matrixTableInstance) {
                matrixTableInstance.columns.adjust().draw(false);
            }
        }
    });

    // 子頁籤切換時校正寬度
    $('#matrixViewTabs button[data-bs-toggle="pill"]').on('shown.bs.tab', (e) => {
        if (matrixTableInstance) matrixTableInstance.columns.adjust().draw(false);
        if (rawTableInstance) rawTableInstance.columns.adjust().draw(false);
    });
}

function refreshView() {
    populateSelects();
    renderMasterTable();
    renderTaxonomyTables();
    renderCrossBorderMatrix();
    renderAnalyticsCharts();

    setTimeout(() => {
        $(window).trigger('resize');
    }, 200);
}

function formatFilterOptionText(nameZh, nameEn) {
    const zh = (nameZh || '').trim();
    const en = (nameEn || '').trim();
    return en ? `${zh} (${en})` : zh;
}

function populateSelects() {
    UISelectOptions.core.render({
        target: '#filterMasterCategory',
        data: appState.categories,
        valueKey: 'category_code',
        textKey: (c) => formatFilterOptionText(c.name_zh, c.name_en),
        placeholder: '全部主系列'
    });

    UISelectOptions.core.render({
        target: '#filterMasterSubcategory',
        data: appState.subcategories,
        valueKey: 'subcategory_code',
        textKey: (s) => formatFilterOptionText(s.name_zh, s.name_en),
        placeholder: '全部次系列'
    });

    UISelectOptions.core.render({
        target: '#filterMasterType',
        data: appState.types,
        valueKey: 'type_code',
        textKey: (t) => formatFilterOptionText(t.name_zh, t.name_en),
        placeholder: '全部型態'
    });

    populateModalTaxonomySelects('TW');
}

function populateModalTaxonomySelects(regionCode = 'TW') {
    const $modalCat = $('#modalSelectCategory, select[name="category_code"]');
    const $modalSubcat = $('#modalSelectSubcategory, select[name="subcategory_code"]');
    const $modalType = $('#modalSelectType, select[name="type_code"]');

    $modalCat.empty().append('<option value="">請選擇產品主系列</option>');
    appState.categories.forEach(c => {
        const name = getLocalizedName(c, regionCode);
        $modalCat.append(`<option value="${c.category_code}">${name} (${c.category_code})</option>`);
    });

    $modalSubcat.empty().append('<option value="">請選擇產品次系列</option>');
    appState.subcategories.forEach(s => {
        const name = getLocalizedName(s, regionCode);
        const parentCat = getCategoryByCode(s.category_code);
        const catName = getLocalizedName(parentCat, regionCode);
        $modalSubcat.append(`<option value="${s.subcategory_code}">[${catName}] ${name} (${s.subcategory_code})</option>`);
    });

    $modalType.empty().append('<option value="">請選擇產品型態</option>');
    appState.types.forEach(t => {
        const name = getLocalizedName(t, regionCode);
        $modalType.append(`<option value="${t.type_code}">${name} (${t.type_code})</option>`);
    });
}

function getCurrencyByRegion(regionCode) {
    return String(regionCode).toUpperCase() === 'MY' ? 'MYR' : (APP_CONFIG.FIN?.DEFAULT_CURRENCY || 'TWD');
}

function updateModalCurrency(regionCode, forcedCurrency = null) {
    const currency = forcedCurrency || getCurrencyByRegion(regionCode);
    $('#modalCurrencyText').text(currency);
    $('input[name="currency"]').val(currency);
}

// ==========================================================================
// 7. Tab 1：產品主檔與詳細資料表格渲染
// ==========================================================================
function renderMasterTable() {
    const formatted = appState.products.map(p => formatMasterTableRow(p));

    if (masterDataTableInstance) {
        masterDataTableInstance.clear();
        masterDataTableInstance.rows.add(formatted);
        masterDataTableInstance.draw();
    } else {
        masterDataTableInstance = $('#tableMasterProducts').DataTable({
            data: formatted,
            order: [[1, 'asc']],
            drawCallback: function () {
                $(window).trigger('resize');
            },
            columns: [
                { data: 'thumb', className: 'text-center', orderable: false },
                { data: 'code' },
                { data: 'name' },
                { data: 'category' },
                { data: 'subcategory' },
                { data: 'type' },
                { data: 'spec' },
                { data: 'price', className: 'text-end' },
                { data: 'sv', className: 'text-end' },
                { data: 'launch_status', className: 'text-center' },
                { data: 'stock_status', className: 'text-center' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }
}

function formatMasterTableRow(p) {
    const star = p.is_featured ? ' <i class="fa-solid fa-star text-warning" title="明星熱銷商品"></i>' : '';

    let categoryCode = p.category_code;
    if (!categoryCode && p.subcategory_code) {
        const sub = getSubcategoryByCode(p.subcategory_code);
        categoryCode = sub.category_code;
    }

    let stockBadge = UIBadges.product.stockStatus(p.stock_status);

    const launchStatus = getLaunchStatus(p.launch_date, p.discontinue_date);

    const formattedPrice = (p.currency === 'MYR' || p.region_code === 'MY')
        ? `RM ${Number(p.price).toLocaleString()}`
        : `NT$ ${Number(p.price).toLocaleString()}`;

    const subTitle = p.short_name || p.short_summary || '';

    // 組合格格與散裝受控單位標籤
    let specHtml = `<div class="font-monospace text-light">${p.package_spec || '-'}</div>`;
    if (p.piece_spec) {
        specHtml += `<div class="small text-info"><i class="fa-solid fa-cube me-1"></i>${p.piece_spec}</div>`;
    }
    if (p.allow_decant === 'Y' && p.sub_unit && p.pieces_per_box > 1) {
        specHtml += `<span class="badge badge-secondary-subtle small mt-1">1${p.base_unit || '盒'} = ${p.pieces_per_box}${p.sub_unit}</span>`;
    }

    return {
        thumb: `<img src="${p.primary_image_url}" alt="${p.name}" class="img-thumb-preview" onerror="window.imgError(this, 'product', 42, 42)">`,
        code: `<div>
                   <div>${UIBadges.common.country(p.region_code)}</div>
                   <div class="fw-bold text-light mt-1">${p.product_code}</div>
               </div>`,
        name: `<div class="fw-bold text-light">${p.name}${star}</div>
               ${subTitle ? `<div class="text-primary-emphasis small">${subTitle}</div>` : ''}`,
        category: UIBadges.product.category(getCategoryByCode(categoryCode), p.region_code),
        subcategory: UIBadges.product.subcategory(getSubcategoryByCode(p.subcategory_code), p.region_code),
        type: UIBadges.product.type(getTypeByCode(p.type_code), p.region_code),
        spec: `<span class="text-info">${p.package_spec || '-'}</span>`,
        price: `<span class="text-yellow fw-bold">${formattedPrice}</span>`,
        sv: `<span class="text-teal fw-bold">${p.sv_point} SV</span>`,
        launch_status: `<div>${launchStatus.badge}</div>`,
        stock_status: `<div>${stockBadge}</div>`,
        actions: `
            <div class="d-flex align-items-center justify-content-end gap-1">
                <button class="btn btn-outline-info btn-sm" onclick="openDetailModal('${p.product_code}')" title="查看完整產品詳情">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>
                <button class="btn btn-outline-primary btn-sm" onclick="openEditModal('${p.product_code}')" title="完整維護主檔與詳細資料">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-outline-danger btn-sm" onclick="deleteProductItem('${p.product_code}')" title="刪除產品">
                    <i class="fa-solid fa-trash-alt"></i>
                </button>
            </div>
        `
    };
}

function applyMasterFilters() {
    const reg = $('#filterMasterRegion').val();
    const cat = $('#filterMasterCategory').val();
    const subcat = $('#filterMasterSubcategory').val();
    const type = $('#filterMasterType').val();
    const launch = $('#filterMasterLaunchStatus').val();
    const stock = $('#filterMasterStock').val();

    const filtered = appState.products.filter(p => {
        let currentCatCode = p.category_code;
        if (!currentCatCode && p.subcategory_code) {
            currentCatCode = getSubcategoryByCode(p.subcategory_code).category_code;
        }

        const matchReg = !reg || p.region_code === reg;
        const matchCat = !cat || String(currentCatCode) === String(cat);
        const matchSubcat = !subcat || String(p.subcategory_code) === String(subcat);
        const matchType = !type || String(p.type_code) === String(type);
        const matchStock = !stock || p.stock_status === stock;

        const currentLaunch = getLaunchStatus(p.launch_date, p.discontinue_date).code;
        const matchLaunch = !launch || currentLaunch === launch;

        return matchReg && matchCat && matchSubcat && matchType && matchStock && matchLaunch;
    });

    const formatted = filtered.map(p => formatMasterTableRow(p));
    masterDataTableInstance.clear().rows.add(formatted).draw();
}

// ==========================================================================
// 8. 產品完整資訊檢視彈窗 (Detail Modal)
// ==========================================================================
function openDetailModal(productCode) {
    const item = appState.products.find(p => p.product_code === String(productCode));
    if (!item) {
        AppToast.warning("找不到該產品資料！");
        return;
    }

    let categoryCode = item.category_code;
    if (!categoryCode && item.subcategory_code) {
        categoryCode = getSubcategoryByCode(item.subcategory_code).category_code;
    }

    const priceText = (item.currency === 'MYR' || item.region_code === 'MY')
        ? `RM ${Number(item.price).toLocaleString()}`
        : `NT$ ${Number(item.price).toLocaleString()}`;

    const stockBadge = UIBadges.product.stockStatus(item.stock_status);
    const launchStatus = getLaunchStatus(item.launch_date, item.discontinue_date);

    const imgSrc = item.hd_image_url || item.primary_image_url || 'https://via.placeholder.com/300x300/1a122d/c084fc?text=No+Image';
    $('#viewPrdImage').attr('src', imgSrc).attr('alt', item.name);

    $('#viewPrdName').text(item.name || '-');
    $('#viewPrdShortName').text(item.short_name ? `(${item.short_name})` : '');
    $('#viewPrdCode').text(item.product_code || '-');
    $('#viewPrdRegion').text(item.region_code || 'TW');
    $('#viewPrdBaseCode').text(item.base_code || '-');
    $('#viewPrdSummary').text(item.short_summary || '暫無簡介');

    // 主系列、次系列、型態套用彩色 Badge 標籤函式
    $('#viewPrdCategory').html(UIBadges.product.category(getCategoryByCode(categoryCode), item.region_code));
    $('#viewPrdSubcategory').html(UIBadges.product.subcategory(getSubcategoryByCode(item.subcategory_code), item.region_code));
    $('#viewPrdType').html(UIBadges.product.type(getTypeByCode(item.type_code), item.region_code));

    $('#viewPrdSpec').text(item.package_spec || '-');
    $('#viewPrdPieceSpec').text(item.piece_spec || '未設定');
    $('#viewPrdWeight').text(item.product_weight ? `${item.product_weight.toLocaleString()} g` : '-');

    // 拆盒規則徽章
    if (item.allow_decant === 'Y') {
        const decantText = (item.sub_unit && item.pieces_per_box > 1)
            ? `可拆賣 (1 ${item.base_unit || '盒'} = ${item.pieces_per_box} ${item.sub_unit})`
            : `可拆賣 (原裝單位: ${item.base_unit || '盒'})`;
        $('#viewPrdDecantRule').html(`<span class="badge badge-success-subtle"><i class="fa-solid fa-check me-1"></i>${decantText}</span>`);
    } else {
        $('#viewPrdDecantRule').html(`<span class="badge badge-secondary-subtle"><i class="fa-solid fa-lock me-1"></i>僅限原裝 (${item.base_unit || '盒'})</span>`);
    }

    $('#viewPrdPrice').text(priceText);
    $('#viewPrdSv').text(`${item.sv_point} SV`);

    $('#viewPrdFeatured').html(item.is_featured ? '<span class="badge badge-warning"><i class="fa-solid fa-star me-1"></i>明星商品</span>' : '<span class="text-muted">否</span>');
    $('#viewPrdStock').html(`${stockBadge}`);
    $('#viewPrdIsValid').html(`<div>${launchStatus.badge}</div>`);

    // 日期欄位透過 AppDate.toDisplay 統一呈現 (YYYY/MM/DD 或 YYYY/MM)
    $('#viewPrdLaunchDate').text(AppDate.toDisplay(item.launch_date, '-'));
    $('#viewPrdDiscontinueDate').text(AppDate.toDisplay(item.discontinue_date, '-'));
    $('#viewPrdOfficialUpdateDate').text(AppDate.toDisplay(item.official_update_date, '-'));
    $('#viewPrdCertifications').text(item.certifications || '無特別標註');

    $('#viewPrdRemarks').text(item.remarks || '-');

    if (item.phrase_tags) {
        const tagBadges = item.phrase_tags.split(',').map(t => `<span class="badge badge-dark me-1 mb-1"># ${t.trim()}</span>`).join('');
        $('#viewPrdPhraseTags').html(tagBadges);
    } else {
        $('#viewPrdPhraseTags').html('<span class="text-muted">暫無短語標籤</span>');
    }

    $('#viewPrdDescription').html(item.detailed_description ? item.detailed_description.replace(/\n/g, '<br>') : '<span class="text-muted">暫無詳細介紹</span>');
    $('#viewPrdUsageScenarios').html(item.usage_scenarios ? item.usage_scenarios.replace(/\n/g, '<br>') : '<span class="text-muted">請參照專業建議或包裝指示</span>');
    $('#viewPrdFeatures').html(item.features_and_functions ? item.features_and_functions.replace(/\n/g, '<br>') : '<span class="text-muted">暫無特色與功能資料</span>');
    $('#viewPrdIngredients').html(item.ingredients ? item.ingredients.replace(/\n/g, '<br>') : '<span class="text-muted">請參閱產品外包裝標示</span>');

    if (item.official_site_url && item.official_site_url.startsWith('http')) {
        $('#viewPrdOfficialSite').html(`<a href="${item.official_site_url}" target="_blank" class="btn btn-sm btn-outline-primary"><i class="fa-solid fa-arrow-up-right-from-square me-1"></i>前往官方產品頁面</a>`);
    } else {
        $('#viewPrdOfficialSite').html('<span class="text-muted">未設定官方網站連結</span>');
    }

    // 綁定「編輯」按鈕
    $('#btnDetailToEdit').off('click').on('click', function () {
        const detailModalEl = document.getElementById('modalProductDetailView');
        const modalInstance = bootstrap.Modal.getInstance(detailModalEl);
        if (modalInstance) {
            modalInstance.hide();
        }
        setTimeout(() => {
            openEditModal(item.product_code);
        }, 250);
    });

    new bootstrap.Modal(document.getElementById('modalProductDetailView')).show();
}

// ==========================================================================
// 9. Tab 2：系列與型態體系維護
// ==========================================================================
function renderTaxonomyTables() {
    const $catTbody = $('#tableCategories tbody').empty();
    appState.categories.forEach(c => {
        $catTbody.append(`
            <tr>
                <td><span class="font-monospace text-secondary">${c.category_code}</span></td>
                <td>
                    <div class="fw-bold text-light"><i class="${c.icon_class} text-primary me-1"></i>${c.name_zh}</div>
                    <div class="text-muted small">${c.name_en || '-'}</div>
                </td>
                <td>
                    <span class="badge" style="color: ${c.text_color}; background-color: ${c.bg_color || c.text_color + '20'}; border: 1px solid ${c.text_color};">
                        <i class="${c.icon_class} me-1"></i>${c.text_color}
                    </span>
                </td>
                <td class="text-center">
                    <button class="btn btn-outline-primary btn-sm py-1 px-2" onclick="openTaxonomyModal('category', '${c.category_code}')" title="編輯主系列">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm py-1 px-2 ms-1" onclick="deleteTaxonomyItem('category', '${c.category_code}')" title="刪除主系列">
                        <i class="fa-solid fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `);
    });

    const $subcatTbody = $('#tableSubcategories tbody').empty();
    appState.subcategories.forEach(s => {
        $subcatTbody.append(`
            <tr>
                <td><span class="font-monospace text-secondary">${s.subcategory_code}</span></td>
                <td>
                    <div class="fw-bold text-light"><i class="${s.icon_class} text-secondary me-1"></i>${s.name_zh}</div>
                    <div class="text-muted small">${s.name_en || '-'}</div>
                </td>
                <td>
                    <span class="badge" style="color: ${s.text_color}; background-color: ${s.bg_color || s.text_color + '20'}; border: 1px solid ${s.text_color};">
                        <i class="${s.icon_class} me-1"></i>${s.text_color}
                    </span>
                </td>
                <td class="text-center">
                    <button class="btn btn-outline-primary btn-sm py-1 px-2" onclick="openTaxonomyModal('subcategory', '${s.subcategory_code}')" title="編輯次系列">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm py-1 px-2 ms-1" onclick="deleteTaxonomyItem('subcategory', '${s.subcategory_code}')" title="刪除次系列">
                        <i class="fa-solid fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `);
    });

    const $typeTbody = $('#tableTypes tbody').empty();
    appState.types.forEach(t => {
        $typeTbody.append(`
            <tr>
                <td><span class="font-monospace text-secondary">${t.type_code}</span></td>
                <td>
                    <div class="fw-bold text-light"><i class="${t.icon_class} text-info me-1"></i>${t.name_zh}</div>
                    <div class="text-muted small">${t.name_en || '-'}</div>
                </td>
                <td>
                    <span class="badge badge-type" style="color: ${t.text_color}; background-color: ${t.bg_color || t.text_color + '20'}; border-color: ${t.text_color};">
                        <i class="${t.icon_class} me-1"></i>${t.text_color}
                    </span>
                </td>
                <td class="text-center">
                    <button class="btn btn-outline-primary btn-sm py-1 px-2" onclick="openTaxonomyModal('type', '${t.type_code}')" title="編輯型態">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm py-1 px-2 ms-1" onclick="deleteTaxonomyItem('type', '${t.type_code}')" title="刪除型態">
                        <i class="fa-solid fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `);
    });
}

function openTaxonomyModal(type, code = null) {
    const form = document.getElementById('formTaxonomy');
    form.reset();
    $('#taxType').val(type);
    $('#taxCode').prop('readonly', !!code);

    const $parentGroup = $('#taxParentCategoryGroup');
    const $parentSelect = $('#taxParentCategory').empty();

    if (type === 'subcategory') {
        $parentGroup.show();
        appState.categories.forEach(c => {
            $parentSelect.append(`<option value="${c.category_code}">${formatFilterOptionText(c.name_zh, c.name_en)}</option>`);
        });
    } else {
        $parentGroup.hide();
    }

    const typeTitle = type === 'category' ? '產品主系列' : (type === 'subcategory' ? '產品次系列' : '產品型態');
    const headingText = code ? `<i class="fa-solid fa-pen-to-square text-primary me-1"></i>編輯${typeTitle}` : `<i class="fa-solid fa-plus text-primary me-1"></i>新增${typeTitle}`;
    $('#modalTaxonomyHeading').html(headingText);

    if (code) {
        let item = null;
        if (type === 'category') item = appState.categories.find(c => c.category_code === code);
        else if (type === 'subcategory') item = appState.subcategories.find(s => s.subcategory_code === code);
        else item = appState.types.find(t => t.type_code === code);

        if (item) {
            $('#taxCode').val(code);
            $('#taxNameZh').val(item.name_zh || '');
            $('#taxNameEn').val(item.name_en || '');
            $('#taxIconClass').val(item.icon_class || '');
            $('#taxTextColor').val(item.text_color || '#8b5cf6');
            $('#taxBgColor').val(item.bg_color || '');
            $('#taxSortOrder').val(item.sort_order || 0);
            if (type === 'subcategory' && item.category_code) {
                $('#taxParentCategory').val(item.category_code);
            }
        }
    } else {
        $('#taxSortOrder').val(0);
        $('#taxTextColor').val(type === 'category' ? '#8b5cf6' : (type === 'subcategory' ? '#c084fc' : '#38bdf8'));
    }

    new bootstrap.Modal(document.getElementById('modalTaxonomyEdit')).show();
}

async function saveTaxonomyItem() {
    const type = $('#taxType').val();
    const code = $('#taxCode').val().trim();
    const nameZh = $('#taxNameZh').val().trim();
    const nameEn = $('#taxNameEn').val().trim();
    const iconClass = $('#taxIconClass').val().trim() || 'fa-solid fa-tag';
    const textColor = $('#taxTextColor').val().trim() || '#8b5cf6';
    const bgColor = $('#taxBgColor').val().trim() || '';
    const sortOrder = parseInt($('#taxSortOrder').val(), 10) || 0;

    if (!code) {
        AppToast.warning("請輸入「唯一代碼」！");
        $('#taxCode').focus();
        return;
    }
    if (!nameZh) {
        AppToast.warning("請輸入「中文名稱」！");
        $('#taxNameZh').focus();
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');
    const $btnSave = $('#btnSaveTaxonomy');

    try {
        $btnSave.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i>儲存中...');

        if (type === 'category') {
            const sheetName = 'prd_categories';
            const existing = appState.categories.find(c => c.category_code === code);
            const rowArray = [
                code, nameZh, nameEn, iconClass, textColor, bgColor, sortOrder, 'Y',
                existing ? existing.created_by : currentUser,
                existing ? existing.created_at : nowStr,
                currentUser, nowStr
            ];
            if (existing) {
                await SheetAdapter.updateRow(targetTable, code, rowArray, GAS_DEPLOY_ID.PRD);
            } else {
                await SheetAdapter.createRow(targetTable, code, rowArray, GAS_DEPLOY_ID.PRD);
            }
        } else if (type === 'subcategory') {
            const sheetName = 'prd_subcategories';
            const categoryCode = $('#taxParentCategory').val() || '01';
            const existing = appState.subcategories.find(s => s.subcategory_code === code);
            const rowArray = [
                code, categoryCode, nameZh, nameEn, iconClass, textColor, bgColor, sortOrder, 'Y',
                existing ? existing.created_by : currentUser,
                existing ? existing.created_at : nowStr,
                currentUser, nowStr
            ];
            if (existing) {
                await SheetAdapter.updateRow(targetTable, code, rowArray, GAS_DEPLOY_ID.PRD);
            } else {
                await SheetAdapter.createRow(targetTable, code, rowArray, GAS_DEPLOY_ID.PRD);
            }
        } else if (type === 'type') {
            const sheetName = 'prd_types';
            const existing = appState.types.find(t => t.type_code === code);
            const rowArray = [
                code, nameZh, nameEn, iconClass, textColor, bgColor, sortOrder, 'Y',
                existing ? existing.created_by : currentUser,
                existing ? existing.created_at : nowStr,
                currentUser, nowStr
            ];
            if (existing) {
                await SheetAdapter.updateRow(targetTable, code, rowArray, GAS_DEPLOY_ID.PRD);
            } else {
                await SheetAdapter.createRow(targetTable, code, rowArray, GAS_DEPLOY_ID.PRD);
            }
        }

        // 記憶體就地更新分類/型態陣列
        if (type === 'category') {
            const catObj = parseCategoriesTable([rowArray])[0];
            const idx = appState.categories.findIndex(c => c.category_code === code);
            if (idx !== -1) appState.categories[idx] = catObj; else appState.categories.push(catObj);
        } else if (type === 'subcategory') {
            const subcatObj = parseSubcategoriesTable([rowArray])[0];
            const idx = appState.subcategories.findIndex(s => s.subcategory_code === code);
            if (idx !== -1) appState.subcategories[idx] = subcatObj; else appState.subcategories.push(subcatObj);
        } else if (type === 'type') {
            const typeObj = parseTypesTable([rowArray])[0];
            const idx = appState.types.findIndex(t => t.type_code === code);
            if (idx !== -1) appState.types[idx] = typeObj; else appState.types.push(typeObj);
        }

        const modalEl = document.getElementById('modalTaxonomyEdit');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        // 移除 await fetchGoogleSheetsData(); 改為直接重繪畫面
        refreshView();
        AppToast.success(`項目【${nameZh}】已成功儲存！`);
    } catch (err) {
        AppToast.error("儲存失敗：" + err.message);
    } finally {
        $btnSave.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i>儲存');
    }
}

function deleteTaxonomyItem(type, code) {
    const sheetName = type === 'category' ? 'prd_categories' : (type === 'subcategory' ? 'prd_subcategories' : 'prd_types');
    const title = type === 'category' ? '主系列' : (type === 'subcategory' ? '次系列' : '產品型態');

    AppDialog.confirm(
        `確定要自 Google 試算表中永久刪除【${title}：${code}】嗎？`,
        async function () {
            try {
                await SheetAdapter.deleteRow(sheetName, code, GAS_DEPLOY_ID.PRD);
                if (type === 'category') {
                    appState.categories = appState.categories.filter(c => c.category_code !== code);
                } else if (type === 'subcategory') {
                    appState.subcategories = appState.subcategories.filter(s => s.subcategory_code !== code);
                } else if (type === 'type') {
                    appState.types = appState.types.filter(t => t.type_code !== code);
                }
                // 移除 await fetchGoogleSheetsData(); 改為直接重繪畫面
                refreshView();
                AppToast.success(`【${title}：${code}】已成功刪除！`);
            } catch (err) {
                AppToast.error("刪除失敗：" + err.message);
            }
        },
        { title: `確認刪除${title}`, confirmText: "確認刪除", btnClass: "btn-danger" }
    );
}

// ==========================================================================
// 10. Tab 3：葡眾全系列產品台馬對照庫渲染
// ==========================================================================
/**
 * 格式化跨國產品對照表單列資料物件
 */
function formatCrossBorderMatrixRow(code, twProducts, myProducts) {
    const twProd = twProducts.find(p => p.base_code === code);
    const myProd = myProducts.find(p => p.base_code === code);

    const getStatusBadge = (prod) => {
        if (!prod) return '';
        const st = getLaunchStatus(prod.launch_date, prod.discontinue_date);
        return (st.code === 'COMING_SOON' || st.code === 'DISCONTINUED')
            ? ` ${UIBadges.product.launchStatus(st.code)}`
            : '';
    };

    const twInfo = twProd
        ? `<div class="fw-bold text-secondary">${twProd.name}${getStatusBadge(twProd)} <span class="text-muted small">(${twProd.product_code})</span></div><div class="text-secondary-emphasis small">${twProd.package_spec || '-'}</div>`
        : `<span class="badge badge-danger-subtle">台灣未發行</span>`;

    const twPrice = twProd
        ? `<span class="text-yellow fw-bold">NT$ ${Number(twProd.price).toLocaleString()}</span> / <span class="text-teal fw-bold">${Number(twProd.sv_point).toLocaleString()} SV</span>`
        : `-`;

    const myInfo = myProd
        ? `<div class="fw-bold text-secondary">${myProd.name}${getStatusBadge(myProd)} <span class="text-muted small">(${myProd.product_code})</span></div><div class="text-secondary-emphasis small">${myProd.package_spec || '-'}</div>`
        : `<span class="badge badge-danger-subtle">大馬未上市</span>`;

    const myPrice = myProd
        ? `<span class="text-yellow fw-bold">RM ${Number(myProd.price).toLocaleString()}</span> / <span class="text-teal fw-bold">${Number(myProd.sv_point).toLocaleString()} SV</span>`
        : `-`;

    const twCostPerSv = twProd && twProd.sv_point > 0 ? AppCalc.divide(twProd.price, twProd.sv_point, 2) : null;
    const myCostPerSv = myProd && myProd.sv_point > 0 ? AppCalc.divide(myProd.price, myProd.sv_point, 2) : null;

    let costCompare = `-`;
    if (twCostPerSv && myCostPerSv) {
        costCompare = `<span class="text-light small">${Number(twCostPerSv).toLocaleString()} NT$/SV</span> <span class="text-muted">vs</span> <span class="text-light small">${Number(myCostPerSv).toLocaleString()} RM/SV</span>`;
    } else if (twCostPerSv) {
        costCompare = `<span class="text-light small">${Number(twCostPerSv).toLocaleString()} NT$/SV</span>`;
    } else if (myCostPerSv) {
        costCompare = `<span class="text-light small">${Number(myCostPerSv).toLocaleString()} RM/SV</span>`;
    }

    let diffText = `<span class="text-muted">-</span>`;
    if (twProd && myProd) {
        const myConvertedTwd = AppCalc.multiply(myProd.price, currentFxRate, 2);
        const diff = AppCalc.sub(myConvertedTwd, twProd.price);
        diffText = diff >= 0
            ? `<span class="badge badge-warning-subtle">+NT$ ${Math.round(diff).toLocaleString()}</span>`
            : `<span class="badge badge-warning-subtle">-NT$ ${Math.abs(Math.round(diff)).toLocaleString()}</span>`;
    }

    const targetCode = twProd ? twProd.product_code : (myProd ? myProd.product_code : '');
    const actionBtn = targetCode
        ? `<button type="button" class="btn btn-sm btn-outline-info" onclick="openDetailModal('${targetCode}')" title="查看產品詳情"><i class="fa-solid fa-magnifying-glass me-1"></i>詳情</button>`
        : `<button type="button" class="btn btn-sm btn-outline-secondary" disabled><i class="fa-solid fa-ban me-1"></i>無貨</button>`;

    return {
        base_code: `<span class="badge badge-secondary-subtle">${code}</span>`,
        tw_info: twInfo,
        tw_price: twPrice,
        my_info: myInfo,
        my_price: myPrice,
        cost_compare: costCompare,
        diff: diffText,
        actions: actionBtn
    };
}

function renderCrossBorderMatrix() {
    if (!$('#crossBorderMatrixTable').length) return;

    const twProducts = appState.products.filter(p => p.region_code === 'TW');
    const myProducts = appState.products.filter(p => p.region_code === 'MY');
    const baseCodes = Array.from(new Set(appState.products.map(p => p.base_code).filter(Boolean))).sort();

    const formatted = baseCodes.map(code => formatCrossBorderMatrixRow(code, twProducts, myProducts));

    if (matrixTableInstance) {
        matrixTableInstance.clear().rows.add(formatted).draw();
    } else {
        matrixTableInstance = $('#crossBorderMatrixTable').DataTable({
            data: formatted,
            columns: [
                { data: 'base_code', className: 'text-center' },
                { data: 'tw_info' },
                { data: 'tw_price', className: 'text-end' },
                { data: 'my_info' },
                { data: 'my_price', className: 'text-end' },
                { data: 'cost_compare', className: 'text-end' },
                { data: 'diff', className: 'text-end' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }
}

// ==========================================================================
// 11. Tab 4：統計分析與視覺化圖表
// ==========================================================================
function getDoughnutTooltipOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            tooltip: {
                callbacks: {
                    label: function (context) {
                        const label = context.label || '';
                        const value = Number(context.parsed) || 0;
                        const dataset = context.dataset;
                        const total = dataset.data.reduce((acc, curr) => acc + Number(curr), 0);
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                        return ` ${label}：${value} 筆 (${percentage}%)`;
                    }
                }
            },
            legend: {
                position: 'bottom',
                labels: { color: '#f5f3ff', boxWidth: 10, font: { size: 12 } }
            }
        }
    };
}

function renderAnalyticsCharts() {
    const dataset = appState.products.filter(p => {
        if (currentAnalyticsRegion === 'ALL') return true;
        return p.region_code === currentAnalyticsRegion;
    });

    const total = dataset.length;
    const totalSv = dataset.reduce((sum, p) => sum + p.sv_point, 0);
    const avgSv = total > 0 ? (totalSv / total).toFixed(1) : 0;

    const twProducts = appState.products.filter(p => p.region_code === 'TW');
    const myProducts = appState.products.filter(p => p.region_code === 'MY');

    const twAvgPrice = twProducts.length > 0 ? Math.round(twProducts.reduce((sum, p) => sum + p.price, 0) / twProducts.length) : 0;
    const myAvgPrice = myProducts.length > 0 ? Math.round(myProducts.reduce((sum, p) => sum + p.price, 0) / myProducts.length) : 0;

    const validCount = dataset.filter(p => p.is_valid === 'Y').length;
    const validRate = total > 0 ? Math.round((validCount / total) * 100) : 0;

    // 1. 最新上市產品識別：利用 AppDate.toTimestamp 排序，避免原生 Date 解析字串異常
    const sortedByLaunch = [...dataset]
        .filter(p => p.launch_date && String(p.launch_date).trim() !== '')
        .sort((a, b) => AppDate.toTimestamp(b.launch_date) - AppDate.toTimestamp(a.launch_date));
    const latestItem = sortedByLaunch[0] || null;

    $('#statTotalSku').text(total);
    $('#statRegionBreakdown').text(`台灣：${twProducts.length} / 馬來西亞：${myProducts.length}`);

    if (currentAnalyticsRegion === 'MY') {
        $('#statAvgPrice').text(`RM ${myAvgPrice.toLocaleString()}`);
        $('#statAvgPriceSub').text(`(僅顯示馬來西亞品項)`);
    } else if (currentAnalyticsRegion === 'TW') {
        $('#statAvgPrice').text(`NT$ ${twAvgPrice.toLocaleString()}`);
        $('#statAvgPriceSub').text(`(僅顯示台灣品項)`);
    } else {
        $('#statAvgPrice').text(`NT$ ${twAvgPrice.toLocaleString()}`);
        $('#statAvgPriceSub').text(`馬幣均價: RM ${myAvgPrice.toLocaleString()}`);
    }

    $('#statAvgSv').text(`${avgSv} SV`);
    $('#statValidRatio').text(`有效上架率：${validRate}%`);

    if (latestItem) {
        $('#statLatestProduct').text(latestItem.name);
        $('#statLatestProductDate').html(`<i class="fa-solid fa-calendar-check text-success me-1"></i>上市日期：${AppDate.toDisplay(latestItem.launch_date)}`);
    } else {
        $('#statLatestProduct').text('暫無數據');
        $('#statLatestProductDate').text('-');
    }

    const catMap = {};
    appState.categories.forEach(c => {
        catMap[c.name_zh] = { count: 0, color: c.text_color || '#8b5cf6' };
    });
    dataset.forEach(p => {
        let catCode = p.category_code;
        if (!catCode && p.subcategory_code) {
            catCode = getSubcategoryByCode(p.subcategory_code).category_code;
        }
        const cat = getCategoryByCode(catCode);
        if (catMap[cat.name_zh]) catMap[cat.name_zh].count++;
    });

    if (chartInstances.cat) chartInstances.cat.destroy();
    const ctxCat = document.getElementById('chartCategoryDist')?.getContext('2d');
    if (ctxCat) {
        chartInstances.cat = new Chart(ctxCat, {
            type: 'doughnut',
            data: {
                labels: Object.keys(catMap),
                datasets: [{
                    data: Object.values(catMap).map(v => v.count),
                    backgroundColor: Object.values(catMap).map(v => v.color),
                    borderColor: '#1a122d',
                    borderWidth: 2
                }]
            },
            options: getDoughnutTooltipOptions()
        });
    }

    const subcatMap = {};
    appState.subcategories.forEach(s => {
        subcatMap[s.name_zh] = { count: 0, color: s.text_color || '#c084fc' };
    });
    dataset.forEach(p => {
        const s = getSubcategoryByCode(p.subcategory_code);
        if (subcatMap[s.name_zh]) subcatMap[s.name_zh].count++;
    });

    if (chartInstances.subcat) chartInstances.subcat.destroy();
    const ctxSubcat = document.getElementById('chartSubcategoryDist')?.getContext('2d');
    if (ctxSubcat) {
        chartInstances.subcat = new Chart(ctxSubcat, {
            type: 'doughnut',
            data: {
                labels: Object.keys(subcatMap),
                datasets: [{
                    data: Object.values(subcatMap).map(v => v.count),
                    backgroundColor: Object.values(subcatMap).map(v => v.color),
                    borderColor: '#1a122d',
                    borderWidth: 2
                }]
            },
            options: getDoughnutTooltipOptions()
        });
    }

    const typeMap = {};
    appState.types.forEach(t => {
        typeMap[t.name_zh] = { count: 0, color: t.text_color || '#38bdf8' };
    });
    dataset.forEach(p => {
        const t = getTypeByCode(p.type_code);
        if (typeMap[t.name_zh]) typeMap[t.name_zh].count++;
    });

    if (chartInstances.type) chartInstances.type.destroy();
    const ctxType = document.getElementById('chartTypeDist')?.getContext('2d');
    if (ctxType) {
        chartInstances.type = new Chart(ctxType, {
            type: 'doughnut',
            data: {
                labels: Object.keys(typeMap),
                datasets: [{
                    data: Object.values(typeMap).map(v => v.count),
                    backgroundColor: Object.values(typeMap).map(v => v.color),
                    borderColor: '#1a122d',
                    borderWidth: 2
                }]
            },
            options: getDoughnutTooltipOptions()
        });
    }

    const launchStatusMap = { '販售中': 0, '即將上市': 0, '已下市': 0 };
    dataset.forEach(p => {
        const st = getLaunchStatus(p.launch_date, p.discontinue_date);
        launchStatusMap[st.text] = (launchStatusMap[st.text] || 0) + 1;
    });

    if (chartInstances.launchStatus) chartInstances.launchStatus.destroy();
    const ctxLaunchSt = document.getElementById('chartLaunchStatusDist')?.getContext('2d');
    if (ctxLaunchSt) {
        chartInstances.launchStatus = new Chart(ctxLaunchSt, {
            type: 'doughnut',
            data: {
                labels: Object.keys(launchStatusMap),
                datasets: [{
                    data: Object.values(launchStatusMap),
                    backgroundColor: ['#10b981', '#38bdf8', '#71717a'],
                    borderColor: '#1a122d',
                    borderWidth: 2
                }]
            },
            options: getDoughnutTooltipOptions()
        });
    }

    const statusCounts = { '現貨': 0, '缺貨': 0, '預購': 0 };
    dataset.forEach(p => {
        if (p.stock_status === '現貨') statusCounts['現貨']++;
        else if (p.stock_status === '缺貨') statusCounts['缺貨']++;
        else if (p.stock_status === '預購') statusCounts['預購']++;
        else statusCounts['未設定']++;
    });

    if (chartInstances.statusDist) chartInstances.statusDist.destroy();
    const ctxStatusDist = document.getElementById('chartStatusDist')?.getContext('2d');
    if (ctxStatusDist) {
        chartInstances.statusDist = new Chart(ctxStatusDist, {
            type: 'doughnut',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#71717a'],
                    borderColor: '#1a122d',
                    borderWidth: 2
                }]
            },
            options: getDoughnutTooltipOptions()
        });
    }

    const topPriceProducts = [...dataset].sort((a, b) => b.price - a.price).slice(0, 5);
    if (chartInstances.priceRank) chartInstances.priceRank.destroy();
    const ctxPriceRank = document.getElementById('chartPriceRank')?.getContext('2d');
    if (ctxPriceRank) {
        chartInstances.priceRank = new Chart(ctxPriceRank, {
            type: 'bar',
            data: {
                labels: topPriceProducts.map(p => p.short_name || p.name),
                datasets: [{
                    label: '售價',
                    data: topPriceProducts.map(p => p.price),
                    backgroundColor: currentAnalyticsRegion === 'MY' ? '#f97316' : '#ef4444',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const item = topPriceProducts[ctx.dataIndex];
                                const prefix = (item.currency === 'MYR' || item.region_code === 'MY') ? 'RM' : 'NT$';
                                return ` 售價：${prefix} ${Number(ctx.parsed.x).toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#f5f3ff' }, grid: { color: 'rgba(192, 132, 252, 0.1)' } },
                    y: { ticks: { color: '#f5f3ff', font: { size: 12 } }, grid: { display: false } }
                }
            }
        });
    }

    const topSvProducts = [...dataset].sort((a, b) => b.sv_point - a.sv_point).slice(0, 5);
    if (chartInstances.topSv) chartInstances.topSv.destroy();
    const ctxTopSv = document.getElementById('chartTopSvRank')?.getContext('2d');
    if (ctxTopSv) {
        chartInstances.topSv = new Chart(ctxTopSv, {
            type: 'bar',
            data: {
                labels: topSvProducts.map(p => p.short_name || p.name),
                datasets: [{
                    label: 'SV 點數',
                    data: topSvProducts.map(p => p.sv_point),
                    backgroundColor: '#ec4899',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#f5f3ff' }, grid: { color: 'rgba(192, 132, 252, 0.1)' } },
                    y: { ticks: { color: '#f5f3ff', font: { size: 12 } }, grid: { display: false } }
                }
            }
        });
    }

    const isMyr = currentAnalyticsRegion === 'MY';
    const multiplier = isMyr ? 100 : 1000;
    const unitText = isMyr ? 'SV / 百元 (MYR)' : 'SV / 千元 (TWD)';
    $('#titleSvEfficiencyRank').html(`<i class="fa-solid fa-bolt text-warning me-1"></i>每${isMyr ? '百' : '千'}元 SV 貢獻率排行 (Top 5)`);

    const svEfficiencyList = dataset
        .filter(p => Number(p.price) > 0 && Number(p.sv_point) > 0)
        .map(p => ({
            name: p.short_name || p.name,
            ratio: Number(((p.sv_point / p.price) * multiplier).toFixed(1))
        }))
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, 5);

    if (chartInstances.svEfficiency) chartInstances.svEfficiency.destroy();
    const ctxSvEff = document.getElementById('chartSvEfficiencyRank')?.getContext('2d');
    if (ctxSvEff) {
        chartInstances.svEfficiency = new Chart(ctxSvEff, {
            type: 'bar',
            data: {
                labels: svEfficiencyList.map(item => item.name),
                datasets: [{
                    label: `點數貢獻 (${unitText})`,
                    data: svEfficiencyList.map(item => item.ratio),
                    backgroundColor: '#eab308',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` 點數貢獻：${ctx.parsed.x} ${unitText}`
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#f5f3ff' }, grid: { color: 'rgba(192, 132, 252, 0.1)' } },
                    y: { ticks: { color: '#f5f3ff', font: { size: 12 } }, grid: { display: false } }
                }
            }
        });
    }

    const weightList = dataset
        .map(p => {
            const weightVal = parseInt(p.product_weight, 10) || 0;
            return {
                name: p.short_name || p.name,
                weight: weightVal,
                rawDisplay: weightVal > 0 ? `${weightVal.toLocaleString()} g` : '-'
            };
        })
        .filter(p => p.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5);

    if (chartInstances.weightRank) chartInstances.weightRank.destroy();
    const ctxWeight = document.getElementById('chartWeightRank')?.getContext('2d');
    if (ctxWeight) {
        chartInstances.weightRank = new Chart(ctxWeight, {
            type: 'bar',
            data: {
                labels: weightList.map(item => item.name),
                datasets: [{
                    label: '產品重量 (g)',
                    data: weightList.map(item => item.weight),
                    backgroundColor: '#06b6d4',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const item = weightList[ctx.dataIndex];
                                return ` 產品重量：${item.rawDisplay} (${ctx.parsed.x} g)`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#f5f3ff' }, grid: { color: 'rgba(192, 132, 252, 0.1)' } },
                    y: { ticks: { color: '#f5f3ff', font: { size: 12 } }, grid: { display: false } }
                }
            }
        });
    }

    // 2. 歷年上市趨勢圖：利用 AppDate.toYear 自適應解析年份 (支援 YYYY, YYYY-MM, YYYY/MM/DD)
    const yearCounts = {};
    dataset.forEach(p => {
        const year = AppDate.toYear(p.launch_date);
        if (year) {
            yearCounts[year] = (yearCounts[year] || 0) + 1;
        }
    });

    const sortedYears = Object.keys(yearCounts).sort();
    const launchCounts = Object.values(yearCounts);
    const maxLaunchCount = launchCounts.length > 0 ? Math.max(...launchCounts) : 0;
    const yMaxLaunch = maxLaunchCount > 0 ? Math.ceil(maxLaunchCount / 5) * 5 : 5;

    if (chartInstances.launchTrend) chartInstances.launchTrend.destroy();
    const ctxLaunch = document.getElementById('chartLaunchTrend')?.getContext('2d');
    if (ctxLaunch) {
        chartInstances.launchTrend = new Chart(ctxLaunch, {
            type: 'line',
            data: {
                labels: sortedYears.length > 0 ? sortedYears : ['無年份資料'],
                datasets: [{
                    label: '上市品項數',
                    data: sortedYears.length > 0 ? sortedYears.map(y => yearCounts[y]) : [0],
                    borderColor: '#10b981',
                    backgroundColor: '#10b981',
                    borderWidth: 2,
                    pointBackgroundColor: '#10b981',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: false,        // ★ 線條下方不填色
                    tension: 0          // ★ 線條不要有曲率
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` 上市商品數：${ctx.parsed.y} 項`
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#f5f3ff' }, grid: { color: 'rgba(192, 132, 252, 0.05)' } },
                    y: { 
                        min: 0,
                        max: yMaxLaunch,
                        ticks: { 
                            color: '#f5f3ff', 
                            stepSize: 1, 
                            precision: 0 
                        }, 
                        grid: { color: 'rgba(192, 132, 252, 0.1)' } 
                    }
                }
            }
        });
    }
}

// ==========================================================================
// 12. Modal 產品主檔與規格彈窗維護
// ==========================================================================
function openAddModal() {
    $('#productModalHeading').html('<i class="fa-solid fa-plus text-primary me-1"></i>新增產品資料與規格詳情');
    const form = document.getElementById('formFullProduct');
    form.reset();
    $(form).data('mode', 'add').data('code', '');
    $('input[name="product_code"]').prop('readonly', false);
    populateModalTaxonomySelects('TW');

    // 預設拆盒參數
    form.elements['pieces_per_box'].value = 1;
    form.elements['allow_decant'].value = 'Y';

    // 動態綁定特化單位 Select2 (依據現存產品資料動態提取可選單位，並允許即時新增)
    UISelectOptions.unit.populateBaseUnit({
        target: '#modalBaseUnit',
        products: appState.products,
        selectedValue: '盒',
        dropdownParent: '#modalProductFullEdit'
    });

    UISelectOptions.unit.populateSubUnit({
        target: '#modalSubUnit',
        products: appState.products,
        selectedValue: '',
        dropdownParent: '#modalProductFullEdit'
    });

    // 預設營運地區為台灣，並同步綁定 TWD 幣別
    form.elements['region_code'].value = 'TW';
    updateModalCurrency('TW');

    populateModalTaxonomySelects('TW');

    $('#productEditTabs button:first').tab('show');
    new bootstrap.Modal(document.getElementById('modalProductFullEdit')).show();
}

function openEditModal(productCode) {
    const item = appState.products.find(p => p.product_code === String(productCode));
    if (!item) return;

    $('#productModalHeading').html(`<i class="fa-solid fa-pen-to-square text-primary me-1"></i>編輯產品：${item.name} (${item.product_code})`);
    const form = document.getElementById('formFullProduct');
    form.reset();
    $(form).data('mode', 'edit').data('code', item.product_code);

    populateModalTaxonomySelects(item.region_code);

    form.elements['region_code'].value = item.region_code;
    form.elements['product_code'].value = item.product_code;
    $('input[name="product_code"]').prop('readonly', true);
    form.elements['base_code'].value = item.base_code;

    // ★ 依據產品實體營運地區與現存幣別，精準刷新不可修改之幣別徽章與隱藏欄位
    updateModalCurrency(item.region_code, item.currency);

    if (form.elements['type_code']) form.elements['type_code'].value = item.type_code;
    form.elements['name'].value = item.name;
    form.elements['short_name'].value = item.short_name || '';
    if (form.elements['short_summary']) form.elements['short_summary'].value = item.short_summary || '';

    let catCode = item.category_code;
    if (!catCode && item.subcategory_code) {
        catCode = getSubcategoryByCode(item.subcategory_code).category_code;
    }
    if (form.elements['category_code']) form.elements['category_code'].value = catCode || '';
    if (form.elements['subcategory_code']) form.elements['subcategory_code'].value = item.subcategory_code || '';

    // 【新增與擴充之規格與拆盒欄位反顯】
    form.elements['package_spec'].value = item.package_spec || '';
    form.elements['piece_spec'].value = item.piece_spec || '';
    form.elements['product_weight'].value = item.product_weight || '';
    form.elements['pieces_per_box'].value = item.pieces_per_box || 1;
    form.elements['allow_decant'].value = item.allow_decant || 'Y';

    // 動態綁定特化單位 Select2 並帶入儲存值
    UISelectOptions.unit.populateBaseUnit({
        target: '#modalBaseUnit',
        products: appState.products,
        selectedValue: item.base_unit || '盒',
        dropdownParent: '#modalProductFullEdit'
    });

    UISelectOptions.unit.populateSubUnit({
        target: '#modalSubUnit',
        products: appState.products,
        selectedValue: item.sub_unit || '',
        dropdownParent: '#modalProductFullEdit'
    });

    form.elements['price'].value = item.price;
    form.elements['currency'].value = item.currency || 'TWD';
    form.elements['sv_point'].value = item.sv_point;
    form.elements['primary_image_url'].value = item.primary_image_url || '';
    form.elements['stock_status'].value = item.stock_status || '現貨';
    if (form.elements['remarks']) form.elements['remarks'].value = item.remarks || '';
    form.elements['is_featured'].checked = item.is_featured;

    const activeCheckbox = form.elements['is_valid'] || form.elements['is_active'];
    if (activeCheckbox) activeCheckbox.checked = item.is_valid === 'Y';

    if (form.elements['launch_date']) form.elements['launch_date'].value = AppDate.toInput(item.launch_date);
    if (form.elements['discontinue_date']) form.elements['discontinue_date'].value = AppDate.toInput(item.discontinue_date);
    if (form.elements['official_update_date']) form.elements['official_update_date'].value = AppDate.toInput(item.official_update_date);

    // 詳細資料
    form.elements['hd_image_url'].value = item.hd_image_url || '';
    form.elements['official_site_url'].value = item.official_site_url || '';
    form.elements['certifications'].value = item.certifications || '';
    form.elements['phrase_tags'].value = item.phrase_tags || '';
    form.elements['usage_scenarios'].value = item.usage_scenarios || '';
    form.elements['features_and_functions'].value = item.features_and_functions || '';
    form.elements['ingredients'].value = item.ingredients || '';
    form.elements['detailed_description'].value = item.detailed_description || '';

    $('#productEditTabs button:first').tab('show');
    new bootstrap.Modal(document.getElementById('modalProductFullEdit')).show();
}

async function saveProductItem() {
    const form = document.getElementById('formFullProduct');
    const mode = $(form).data('mode') || 'add';

    const productCode = form.elements['product_code'].value.trim();
    const baseCode = form.elements['base_code'].value.trim();
    const name = form.elements['name'].value.trim();
    const typeCode = (form.elements['type_code'] ? form.elements['type_code'].value : '').trim();
    const subcategoryCode = (form.elements['subcategory_code'] ? form.elements['subcategory_code'].value : '').trim();
    const price = form.elements['price'].value.trim();
    const svPoint = form.elements['sv_point'].value.trim();
    const baseUnit = ($('#modalBaseUnit').val() || form.elements['base_unit'].value || '盒').trim();
    const subUnit = ($('#modalSubUnit').val() || form.elements['sub_unit']?.value || '').trim();
    const piecesPerBox = parseInt(form.elements['pieces_per_box'].value, 10) || 1;
    const allowDecant = form.elements['allow_decant'].value || 'Y';

    const warnMasterField = (msg, inputElem) => {
        AppToast.warning(msg);
        $('#tab-btn-prd-master').tab('show');
        if (inputElem) inputElem.focus();
    };

    if (!productCode) return warnMasterField("請輸入「完整產品編號」！", form.elements['product_code']);
    if (!baseCode) return warnMasterField("請輸入「跨國基本編號」！", form.elements['base_code']);
    if (!typeCode) return warnMasterField("請選擇「產品型態」！", form.elements['type_code']);
    if (!name) return warnMasterField("請輸入「官方完整品名」！", form.elements['name']);
    if (!subcategoryCode) return warnMasterField("請選擇「次系列歸屬」！", form.elements['subcategory_code']);
    if (!baseUnit) return warnMasterField("請設定「官方原裝標準計量單位」！", form.elements['base_unit']);
    if (price === '') return warnMasterField("請輸入「售價」！", form.elements['price']);
    if (svPoint === '') return warnMasterField("請輸入「全球統一 SV」！", form.elements['sv_point']);

    // 防呆：若指定散裝出貨單位且開放拆盒，散件總量必須 >= 1
    if (subUnit && piecesPerBox < 1) {
        return warnMasterField("設定散裝單位時，「單盒(箱)散件總量」必須大於或等於 1！", form.elements['pieces_per_box']);
    }

    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');
    const existingNode = appState.products.find(p => p.product_code === productCode);

    const createdBy = (mode === 'edit' && existingNode) ? (existingNode.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existingNode) ? (existingNode.created_at || nowStr) : nowStr;

    let categoryCode = (form.elements['category_code'] ? form.elements['category_code'].value : '').trim();
    if (!categoryCode && subcategoryCode) {
        categoryCode = getSubcategoryByCode(subcategoryCode).category_code || '';
    }

    const isActive = form.elements['is_valid'] ? form.elements['is_valid'].checked : true;
    const remarksVal = form.elements['remarks'] ? form.elements['remarks'].value.trim() : (existingNode?.remarks || '');
    const launchDateVal = form.elements['launch_date'] ? AppDate.toSheet(form.elements['launch_date'].value) : '';
    const discontinueDateVal = form.elements['discontinue_date'] ? AppDate.toSheet(form.elements['discontinue_date'].value) : '';
    
    let officialUpdateDateVal = form.elements['official_update_date'] ? AppDate.toSheet(form.elements['official_update_date'].value) : '';
    if (!officialUpdateDateVal && existingNode?.official_update_date) {
        officialUpdateDateVal = AppDate.toSheet(existingNode.official_update_date);
    }

    // 1. prd_items 主檔陣列 (精準對齊最新 31 欄 Schema)
    const itemsRowArray = [
        productCode,                                                // 0: product_code
        form.elements['region_code'].value.trim() || 'TW',          // 1: region_code
        baseCode,                                                   // 2: base_code
        name,                                                       // 3: name
        form.elements['short_name'].value.trim(),                   // 4: short_name
        form.elements['short_summary'] ? form.elements['short_summary'].value.trim() : '', // 5: short_summary
        categoryCode,                                               // 6: category_code
        subcategoryCode,                                            // 7: subcategory_code
        typeCode,                                                   // 8: type_code
        form.elements['package_spec'].value.trim(),                 // 9: package_spec
        form.elements['piece_spec'] ? form.elements['piece_spec'].value.trim() : '', // 10: piece_spec (最小受控單位規格)
        parseInt(form.elements['product_weight'] ? form.elements['product_weight'].value : '0', 10) || 0, // 11: product_weight (g)
        baseUnit,                                                   // 12: base_unit (官方原裝計量單位)
        subUnit,                                                    // 13: sub_unit (散裝出貨最小單位)
        piecesPerBox,                                               // 14: pieces_per_box (單盒散件數 N)
        allowDecant,                                                // 15: allow_decant (是否開放拆盒散賣 Y/N)
        parseFloat(price) || 0,                                     // 16: price
        form.elements['currency'].value.trim() || 'TWD',            // 17: currency
        parseInt(svPoint, 10) || 0,                                 // 18: sv_point
        form.elements['primary_image_url'].value.trim(),            // 19: primary_image_url
        form.elements['is_featured'].checked ? 'TRUE' : 'FALSE',    // 20: is_featured
        form.elements['stock_status'].value,                       // 21: stock_status
        remarksVal,                                                 // 22: remarks
        isActive ? 'Y' : 'N',                                       // 23: is_valid
        launchDateVal,                                              // 24: launch_date
        discontinueDateVal,                                         // 25: discontinue_date
        officialUpdateDateVal,                                      // 26: official_update_date
        createdBy,                                                  // 27: created_by
        createdAt,                                                  // 28: created_at
        currentUser,                                                // 29: modified_by
        nowStr                                                      // 30: modified_at
    ];

    // 2. prd_item_details 規格陣列 (13 欄位維持原樣)
    const detailsRowArray = [
        productCode,
        form.elements['hd_image_url'].value.trim(),
        form.elements['certifications'].value.trim(),
        form.elements['detailed_description'] ? form.elements['detailed_description'].value.trim() : '',
        form.elements['usage_scenarios'].value.trim(),
        form.elements['phrase_tags'].value.trim(),
        form.elements['features_and_functions'] ? form.elements['features_and_functions'].value.trim() : '',
        form.elements['ingredients'].value.trim(),
        form.elements['official_site_url'].value.trim(),
        createdBy,
        createdAt,
        currentUser,
        nowStr
    ];

    const $btnSave = $('#btnSaveFullProduct');
    try {
        $btnSave.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i>寫入雲端中...');

        if (mode === 'add') {
            await Promise.all([
                SheetAdapter.createRow(SHEET_NAMES.PRODUCTS, productCode, itemsRowArray, GAS_DEPLOY_ID.PRD),
                SheetAdapter.createRow(SHEET_NAMES.DETAILS, productCode, detailsRowArray, GAS_DEPLOY_ID.PRD)
            ]);
            // 組裝新物件推入本地陣列置頂
            const newProd = parseItemsTable([itemsRowArray])[0];
            const newDetail = parseDetailsTable([detailsRowArray])[0];
            appState.products.unshift({ ...newProd, ...newDetail, product_code: productCode });
        } else {
            await Promise.all([
                SheetAdapter.updateRow(SHEET_NAMES.PRODUCTS, productCode, itemsRowArray, GAS_DEPLOY_ID.PRD),
                SheetAdapter.updateRow(SHEET_NAMES.DETAILS, productCode, detailsRowArray, GAS_DEPLOY_ID.PRD)
            ]);
            const pIdx = appState.products.findIndex(p => p.product_code === productCode);
            if (pIdx !== -1) {
                const updatedProd = parseItemsTable([itemsRowArray])[0];
                const updatedDetail = parseDetailsTable([detailsRowArray])[0];
                appState.products[pIdx] = { ...updatedProd, ...updatedDetail, product_code: productCode };
            }
        }

        const modalEl = document.getElementById('modalProductFullEdit');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        // 移除 await fetchGoogleSheetsData(); 改為直接重繪畫面
        refreshView();
        AppToast.success(`產品【${productCode}】規格主檔已成功更新儲存！`);
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btnSave.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i>儲存');
    }
}

function deleteProductItem(productCode) {
    const item = appState.products.find(p => p.product_code === String(productCode));
    if (!item) return;

    AppDialog.confirm(
        `確定要自 Google 試算表中永久刪除產品【${item.name} (${item.product_code})】及其規格資料嗎？`,
        async function () {
            try {
                await Promise.all([
                    SheetAdapter.deleteRow(SHEET_NAMES.PRODUCTS, item.product_code, GAS_DEPLOY_ID.PRD),
                    SheetAdapter.deleteRow(SHEET_NAMES.DETAILS, item.product_code, GAS_DEPLOY_ID.PRD)
                ]);
                // 記憶體過濾移除該項目
                appState.products = appState.products.filter(p => p.product_code !== item.product_code);
                // 移除 await fetchGoogleSheetsData(); 改為直接重繪畫面
                refreshView();
                AppToast.success(`產品【${item.product_code}】已成功刪除！`);
            } catch (err) {
                AppToast.error("刪除失敗：" + err.message);
            }
        },
        { title: "確認刪除產品", confirmText: "確認刪除", btnClass: "btn-danger" }
    );
}