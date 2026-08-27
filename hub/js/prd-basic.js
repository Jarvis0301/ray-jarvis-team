// ==========================================================================
// 1. Google 雲端試算表設定與核心常數
// ==========================================================================
const SPREADSHEET_ID = "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I";

/**
 * 試算表欄位索引安全取值工具函式
 */
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && row[colIndex] !== '') {
        return row[colIndex].toString().trim();
    }
    return defaultVal;
}

/**
 * 取得當前登入者名稱
 */
function getCurrentUser() {
    const rawSession = localStorage.getItem('ray_team_auth_session');
    if (!rawSession) return 'SYSTEM';
    try {
        const session = JSON.parse(rawSession);
        return session.userName || session.user || 'SYSTEM';
    } catch (e) {
        return 'SYSTEM';
    }
}

/**
 * 取得當前格式化時間字串 (YYYY-MM-DD HH:mm:ss)
 */
function getFormattedNow() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 依據「上市日期」與「下市日期」計算產品上市狀態
 */
function getLaunchStatus(launchDateStr, discontinueDateStr) {
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

    const lDate = parseDate(launchDateStr);
    const dDate = parseDate(discontinueDateStr);

    // 1. 若上市日期晚於今天 -> 即將上市
    if (lDate) {
        lDate.setHours(0, 0, 0, 0);
        if (lDate.getTime() > today.getTime()) {
            return {
                code: 'COMING_SOON',
                text: '即將上市',
                badge: '<span class="badge bg-warning text-dark"><i class="fa-solid fa-clock"></i> 即將上市</span>'
            };
        }
    }

    // 2. 若下市日期早於今天 -> 已下市
    if (dDate) {
        dDate.setHours(0, 0, 0, 0);
        if (dDate.getTime() < today.getTime()) {
            return {
                code: 'DISCONTINUED',
                text: '已下市',
                badge: '<span class="badge bg-danger text-white"><i class="fa-solid fa-ban"></i> 已下市</span>'
            };
        }
    }

    // 3. 正常販售中
    return {
        code: 'ACTIVE',
        text: '販售中',
        badge: '<span class="badge bg-success text-white"><i class="fa-solid fa-circle-check"></i> 販售中</span>'
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

let currentAnalyticsRegion = 'ALL'; // 統計全域地區：'ALL' | 'TW' | 'MY'
let masterDataTableInstance = null;
let chartInstances = {};
let isInitialized = false;

// ==========================================================================
// 3. 系統生命週期與事件初始化
// ==========================================================================
window.addEventListener('AppReady', async () => {
    SheetAdapter.init("AKfycbwWirZHIj1JrwJqipOsfNXpPo-GWVi9ia6faEhLNH5ewPdy-xepBZmHnqTmF5dBLY3H");
    initIframeAutoResize();
    await initApp();
});

async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindUIEvents();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        AppToast.error("未設定 Google 試算表 ID，無法讀取產品資料！");
        refreshView();
    }
}

/**
 * 監聽 iframe 內容高度變化並通知外層母視窗調整高度
 */
function initIframeAutoResize() {
    const notifyParent = () => {
        const height = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            $('#productCrudTabsContent').outerHeight(true) + 140
        );

        window.parent.postMessage({
            type: 'IFRAME_RESIZE',
            height: height
        }, '*');

        if (window.parent && window.parent.AppDialog && typeof window.parent.AppDialog.resizeIframe === 'function') {
            window.parent.AppDialog.resizeIframe(height);
        }
    };

    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => notifyParent());
        resizeObserver.observe(document.body);
    }

    $('button[data-bs-toggle="tab"]').on('shown.bs.tab', () => setTimeout(notifyParent, 150));
    $(window).on('resize', () => notifyParent());
}

// ==========================================================================
// 4. 資料讀取與 5 表解析引擎 (嚴格對齊 Schema 欄位順序)
// ==========================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步產品資料庫...', '載入 5 表架構');

    try {
        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`工作表【${sheetName}】通訊狀態碼: ${res.status}`);
            const text = await res.text();

            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return parsed.data.slice(1);
        };

        const [rawItems, rawDetails, rawCats, rawSubcats, rawTypes] = await Promise.all([
            fetchSheet('產品主檔').catch(() => fetchSheet('prd_items').catch(() => [])),
            fetchSheet('產品詳細資料').catch(() => fetchSheet('prd_item_details').catch(() => fetchSheet('prd_details').catch(() => []))),
            fetchSheet('產品主系列').catch(() => fetchSheet('prd_categories').catch(() => [])),
            fetchSheet('產品次系列').catch(() => fetchSheet('prd_subcategories').catch(() => [])),
            fetchSheet('產品型態').catch(() => fetchSheet('prd_types').catch(() => []))
        ]);

        appState.categories = parseCategoriesTable(rawCats);
        appState.subcategories = parseSubcategoriesTable(rawSubcats);
        appState.types = parseTypesTable(rawTypes);

        const items = parseItemsTable(rawItems);
        const details = parseDetailsTable(rawDetails);

        // 1:1 外鍵關聯主表 (prd_items) 與詳情表 (prd_item_details)
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

/**
 * 產品主檔: prd_items (26 欄位嚴格對齊)
 */
function parseItemsTable(rows) {
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
        product_weight: getVal(r, 10, ''),
        price: parseFloat(getVal(r, 11, '0')) || 0,
        currency: getVal(r, 12, 'TWD'),
        sv_point: parseInt(getVal(r, 13, '0'), 10) || 0,
        primary_image_url: getVal(r, 14, 'https://via.placeholder.com/150/1a122d/c084fc?text=No+Image'),
        is_featured: ['TRUE', 'Y', '1'].includes(getVal(r, 15, 'FALSE').toUpperCase()),
        stock_status: getVal(r, 16, 'IN_STOCK'),
        sort_order: parseInt(getVal(r, 17, '0'), 10) || 0,
        is_valid: getVal(r, 18, 'Y').toUpperCase() === 'Y' ? 'Y' : 'N',
        launch_date: getVal(r, 19, ''),
        discontinue_date: getVal(r, 20, ''),
        official_update_date: getVal(r, 21, ''),
        created_by: getVal(r, 22, 'SYSTEM'),
        created_at: getVal(r, 23, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 24, 'SYSTEM'),
        modified_at: getVal(r, 25, '2026-01-01 00:00:00')
    })).filter(item => item.product_code && item.name !== '未命名產品');
}

/**
 * 產品詳細資料: prd_item_details (13 欄位嚴格對齊)
 */
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

/**
 * 產品主系列: prd_categories (12 欄位 Schema)
 * 欄位：[0: category_code, 1: name_zh, 2: name_en, 3: icon_class, 4: text_color, 5: bg_color, 6: sort_order, 7: is_valid, 8: created_by, 9: created_at, 10: modified_by, 11: modified_at]
 */
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

/**
 * 產品次系列: prd_subcategories (13 欄位 Schema)
 * 欄位：[0: subcategory_code, 1: category_code, 2: name_zh, 3: name_en, 4: icon_class, 5: text_color, 6: bg_color, 7: sort_order, 8: is_valid, 9: created_by, 10: created_at, 11: modified_by, 12: modified_at]
 */
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

/**
 * 產品型態: prd_types (12 欄位 Schema)
 * 欄位：[0: type_code, 1: name_zh, 2: name_en, 3: icon_class, 4: text_color, 5: bg_color, 6: sort_order, 7: is_valid, 8: created_by, 9: created_at, 10: modified_by, 11: modified_at]
 */
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
// 5. 外鍵關聯與多語系名稱解析 (TW：中文、MY：英文)
// ==========================================================================
function getCategoryByCode(code) {
    if (!code) return { category_code: '', name_zh: '未分類主系列', name_en: 'Uncategorized', icon_class: 'fa-solid fa-folder', text_color: '#8b5cf6', bg_color: '#1a122d' };
    const found = appState.categories.find(c => String(c.category_code).trim() === String(code).trim());
    return found || { category_code: code, name_zh: '未分類主系列', name_en: 'Uncategorized', icon_class: 'fa-solid fa-folder', text_color: '#8b5cf6', bg_color: '#1a122d' };
}

function getSubcategoryByCode(code) {
    if (!code) return { subcategory_code: '', category_code: '', name_zh: '未分類次系列', name_en: 'General Subcategory', icon_class: 'fa-solid fa-tag', text_color: '#c084fc', bg_color: '#1a122d' };
    const found = appState.subcategories.find(s => String(s.subcategory_code).trim() === String(code).trim());
    return found || { subcategory_code: code, category_code: '', name_zh: '未分類次系列', name_en: 'General Subcategory', icon_class: 'fa-solid fa-tag', text_color: '#c084fc', bg_color: '#1a122d' };
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

function buildCategoryBadge(categoryCode, regionCode = 'TW') {
    const c = getCategoryByCode(categoryCode);
    const label = getLocalizedName(c, regionCode);
    const bg = c.bg_color && c.bg_color !== '#1a122d' ? c.bg_color : `${c.text_color}18`;
    return `<span class="badge" style="color: ${c.text_color}; background-color: ${bg}; border: 1px solid ${c.text_color}40;"><i class="${c.icon_class}"></i> ${label}</span>`;
}

function buildSubcategoryBadge(subcategoryCode, regionCode = 'TW') {
    const s = getSubcategoryByCode(subcategoryCode);
    const label = getLocalizedName(s, regionCode);
    const bg = s.bg_color && s.bg_color !== '#1a122d' ? s.bg_color : `${s.text_color}18`;
    return `<span class="badge" style="color: ${s.text_color}; background-color: ${bg}; border: 1px solid ${s.text_color}40;"><i class="${s.icon_class}"></i> ${label}</span>`;
}

function buildTypeBadge(typeCode, regionCode = 'TW') {
    const t = getTypeByCode(typeCode);
    const label = getLocalizedName(t, regionCode);
    const bg = t.bg_color && t.bg_color !== '#1a122d' ? t.bg_color : `${t.text_color}18`;
    return `<span class="badge badge-type" style="color: ${t.text_color}; background-color: ${bg}; border: 1px solid ${t.text_color}40;"><i class="${t.icon_class}"></i> ${label}</span>`;
}

// ==========================================================================
// 6. 介面事件綁定與視圖渲染中樞
// ==========================================================================
function bindUIEvents() {
    $('#btnOpenNewProductModal').on('click', () => openAddModal());
    $('#btnSaveFullProduct').on('click', () => saveProductItem());
    $('#btnSaveBatchPrices').on('click', () => saveBatchPrices());
    $('#btnSaveTaxonomy').on('click', () => saveTaxonomyItem());

    // 篩選條件聯動
    $('#filterMasterRegion, #filterMasterCategory, #filterMasterSubcategory, #filterMasterType, #filterMasterLaunchStatus, #filterMasterStock').on('change', () => {
        applyMasterFilters();
    });

    // 產品 Modal 地區切換時重新渲染次系列與型態的多語系標籤
    $('select[name="region_code"]').on('change', function () {
        const reg = $(this).val();
        populateModalTaxonomySelects(reg);
    });

    // 次系列變更時自動同步主系列代碼
    $('select[name="subcategory_code"], #modalSelectSubcategory').on('change', function () {
        const subcatCode = $(this).val();
        const subcat = getSubcategoryByCode(subcatCode);
        if (subcat && subcat.category_code) {
            $('input[name="category_code"]').val(subcat.category_code);
        }
    });

    // 統計看板全域地區切換按鈕
    $('#analyticsRegionButtonGroup button').on('click', function () {
        $('#analyticsRegionButtonGroup button').removeClass('active');
        $(this).addClass('active');
        currentAnalyticsRegion = $(this).data('region') || 'ALL';
        renderAnalyticsCharts();
    });

    // 頁籤切換監聽
    $('button[data-bs-toggle="tab"]').on('shown.bs.tab', (e) => {
        if (e.target.id === 'tab-analytics-link') {
            renderAnalyticsCharts();
        }
    });

    AppDialog.bindIframeAutoCenter('#modalProductFullEdit');
    AppDialog.bindIframeAutoCenter('#modalTaxonomyEdit');
}

function refreshView() {
    populateSelects();
    renderMasterTable();
    renderTaxonomyTables();
    renderBatchEditorTable();
    renderAnalyticsCharts();

    setTimeout(() => {
        $(window).trigger('resize');
    }, 200);
}

/**
 * 格式化篩選器標籤文字：如果沒有英文，就不顯示英文與「()」
 */
function formatFilterOptionText(nameZh, nameEn) {
    const zh = (nameZh || '').trim();
    const en = (nameEn || '').trim();
    return en ? `${zh} (${en})` : zh;
}

function populateSelects() {
    const $filterCat = $('#filterMasterCategory');
    $filterCat.find('option:not(:first)').remove();
    appState.categories.forEach(c => {
        $filterCat.append(`<option value="${c.category_code}">${formatFilterOptionText(c.name_zh, c.name_en)}</option>`);
    });

    const $filterSubcat = $('#filterMasterSubcategory');
    $filterSubcat.find('option:not(:first)').remove();
    appState.subcategories.forEach(s => {
        $filterSubcat.append(`<option value="${s.subcategory_code}">${formatFilterOptionText(s.name_zh, s.name_en)}</option>`);
    });

    const $filterType = $('#filterMasterType');
    $filterType.find('option:not(:first)').remove();
    appState.types.forEach(t => {
        $filterType.append(`<option value="${t.type_code}">${formatFilterOptionText(t.name_zh, t.name_en)}</option>`);
    });

    populateModalTaxonomySelects('TW');
}

function populateModalTaxonomySelects(regionCode = 'TW') {
    const $modalType = $('#modalSelectType, select[name="type_code"]');
    const $modalSubcat = $('#modalSelectSubcategory, select[name="subcategory_code"]');

    $modalType.empty();
    appState.types.forEach(t => {
        const name = getLocalizedName(t, regionCode);
        $modalType.append(`<option value="${t.type_code}">${name} (${t.type_code})</option>`);
    });

    $modalSubcat.empty();
    appState.subcategories.forEach(s => {
        const name = getLocalizedName(s, regionCode);
        const parentCat = getCategoryByCode(s.category_code);
        const catName = getLocalizedName(parentCat, regionCode);
        $modalSubcat.append(`<option value="${s.subcategory_code}">[${catName}] ${name} (${s.subcategory_code})</option>`);
    });
}

// ==========================================================================
// 7. Tab 1：產品主檔與詳細資料表格渲染
// ==========================================================================
function renderMasterTable() {
    const formattedData = appState.products.map(p => formatMasterTableRow(p));

    if (masterDataTableInstance) {
        masterDataTableInstance.clear();
        masterDataTableInstance.rows.add(formattedData);
        masterDataTableInstance.draw();
    } else {
        masterDataTableInstance = $('#tableMasterProducts').DataTable({
            data: formattedData,
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
    const badgeRegion = p.region_code === 'TW' ? 'border-primary text-secondary' : 'border-danger text-danger';

    let categoryCode = p.category_code;
    if (!categoryCode && p.subcategory_code) {
        const sub = getSubcategoryByCode(p.subcategory_code);
        categoryCode = sub.category_code;
    }

    // 庫存狀態
    let stockBadge = '';
    if (p.stock_status === 'IN_STOCK') {
        stockBadge = '<span class="badge badge-success"><i class="fa-solid fa-box"></i> 現貨</span>';
    } else if (p.stock_status === 'OUT_OF_STOCK') {
        stockBadge = '<span class="badge badge-danger"><i class="fa-solid fa-circle-xmark"></i> 缺貨</span>';
    } else {
        stockBadge = '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> 預購</span>';
    }

    // 上市狀態
    const launchStatus = getLaunchStatus(p.launch_date, p.discontinue_date);

    // 價格格式化 (NT$0 / RM0)
    const formattedPrice = (p.currency === 'MYR' || p.region_code === 'MY')
        ? `RM${Number(p.price).toLocaleString()}`
        : `NT$${Number(p.price).toLocaleString()}`;

    // 簡稱或短評
    const subTitle = p.short_name || p.short_summary || '';

    return {
        thumb: `<img src="${p.primary_image_url}" alt="${p.name}" class="img-thumb-preview" onerror="window.imgError(this, 'product', 42, 42)">`,
        code: `<div>
                   <div><span class="badge bg-dark border ${badgeRegion}">${p.region_code}</span></div>
                   <div class="fw-bold font-monospace text-light mt-1">${p.product_code}</div>
               </div>`,
        name: `<div class="fw-bold text-light">${p.name}${star}</div>
               ${subTitle ? `<div class="text-muted small">${subTitle}</div>` : ''}`,
        category: buildCategoryBadge(categoryCode, p.region_code),
        subcategory: buildSubcategoryBadge(p.subcategory_code, p.region_code),
        type: buildTypeBadge(p.type_code, p.region_code),
        spec: `<span class="text-muted small font-monospace">${p.package_spec || '-'}</span>`,
        price: `<span class="badge badge-outline-accent py-2">${formattedPrice}</span>`,
        sv: `<span class="badge badge-outline-secondary py-2">${p.sv_point} SV</span>`,
        launch_status: `<div>${launchStatus.badge}</div>`,
        stock_status: `<div>${stockBadge}</div>`,
        actions: `
            <button class="btn btn-outline-primary btn-sm py-1 px-2" onclick="openEditModal('${p.product_code}')" title="完整維護主檔與詳細資料">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-outline-danger btn-sm py-1 px-2 ms-1" onclick="deleteProductItem('${p.product_code}')" title="刪除產品">
                <i class="fa-solid fa-trash-alt"></i>
            </button>
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

    const formattedData = filtered.map(p => formatMasterTableRow(p));
    masterDataTableInstance.clear().rows.add(formattedData).draw();
}

// ==========================================================================
// 8. Tab 2：系列與型態體系維護
// ==========================================================================
function renderTaxonomyTables() {
    // 產品主系列
    const $catTbody = $('#tableCategories tbody').empty();
    appState.categories.forEach(c => {
        $catTbody.append(`
            <tr>
                <td><span class="font-monospace text-secondary">${c.category_code}</span></td>
                <td>
                    <div class="fw-bold text-light"><i class="${c.icon_class} text-primary me-1"></i> ${c.name_zh}</div>
                    <div class="text-muted small">${c.name_en || '-'}</div>
                </td>
                <td>
                    <span class="badge" style="color: ${c.text_color}; background-color: ${c.bg_color || c.text_color + '20'}; border: 1px solid ${c.text_color};">
                        <i class="${c.icon_class}"></i> ${c.text_color}
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

    // 產品次系列
    const $subcatTbody = $('#tableSubcategories tbody').empty();
    appState.subcategories.forEach(s => {
        const parentCat = getCategoryByCode(s.category_code);
        $subcatTbody.append(`
            <tr>
                <td><span class="font-monospace text-secondary">${s.subcategory_code}</span></td>
                <td>
                    <div class="fw-bold text-light"><i class="${s.icon_class} text-secondary me-1"></i> ${s.name_zh}</div>
                    <div class="text-muted small">${s.name_en || '-'}</div>
                </td>
                <td>
                    <span class="badge" style="color: ${s.text_color}; background-color: ${s.bg_color || s.text_color + '20'}; border: 1px solid ${s.text_color};">
                        <i class="${s.icon_class}"></i> ${s.text_color}
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

    // 產品型態
    const $typeTbody = $('#tableTypes tbody').empty();
    appState.types.forEach(t => {
        $typeTbody.append(`
            <tr>
                <td><span class="font-monospace text-secondary">${t.type_code}</span></td>
                <td>
                    <div class="fw-bold text-light"><i class="${t.icon_class} text-info me-1"></i> ${t.name_zh}</div>
                    <div class="text-muted small">${t.name_en || '-'}</div>
                </td>
                <td>
                    <span class="badge badge-type" style="color: ${t.text_color}; background-color: ${t.bg_color || t.text_color + '20'}; border-color: ${t.text_color};">
                        <i class="${t.icon_class}"></i> ${t.text_color}
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
    const headingText = code ? `<i class="fa-solid fa-pen-to-square text-primary"></i> 編輯${typeTitle}` : `<i class="fa-solid fa-plus text-primary"></i> 新增${typeTitle}`;
    $('#modalTaxonomyHeading').html(headingText);

    if (code) {
        let item = null;
        if (type === 'category') item = appState.categories.find(c => c.category_code === code);
        else if (type === 'subcategory') item = appState.subcategories.find(s => s.subcategory_code === code);
        else item = appState.types.find(t => t.type_code === code);

        if (item) {
            $('#taxCode').val(item.category_code || item.subcategory_code || item.type_code);
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

    if (!code || !nameZh) {
        AppToast.warning("代碼與中文名稱為必填項目！");
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const $btnSave = $('#btnSaveTaxonomy');

    try {
        $btnSave.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 儲存中...');

        if (type === 'category') {
            const sheetName = 'prd_categories';
            const existing = appState.categories.find(c => c.category_code === code);
            const rowArray = [
                code, nameZh, nameEn, iconClass, textColor, bgColor, sortOrder, 'Y',
                existing ? existing.created_by : currentUser,
                existing ? existing.created_at : nowStr,
                currentUser, nowStr
            ];
            if (existing) await SheetAdapter.updateRow(sheetName, code, rowArray);
            else await SheetAdapter.createRow(sheetName, code, rowArray);
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
            if (existing) await SheetAdapter.updateRow(sheetName, code, rowArray);
            else await SheetAdapter.createRow(sheetName, code, rowArray);
        } else if (type === 'type') {
            const sheetName = 'prd_types';
            const existing = appState.types.find(t => t.type_code === code);
            const rowArray = [
                code, nameZh, nameEn, iconClass, textColor, bgColor, sortOrder, 'Y',
                existing ? existing.created_by : currentUser,
                existing ? existing.created_at : nowStr,
                currentUser, nowStr
            ];
            if (existing) await SheetAdapter.updateRow(sheetName, code, rowArray);
            else await SheetAdapter.createRow(sheetName, code, rowArray);
        }

        const modalEl = document.getElementById('modalTaxonomyEdit');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        AppToast.success(`項目【${nameZh}】已成功儲存！`);
        await fetchGoogleSheetsData();
    } catch (err) {
        AppToast.error("儲存失敗：" + err.message);
    } finally {
        $btnSave.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存設定');
    }
}

function deleteTaxonomyItem(type, code) {
    const sheetName = type === 'category' ? 'prd_categories' : (type === 'subcategory' ? 'prd_subcategories' : 'prd_types');
    const title = type === 'category' ? '主系列' : (type === 'subcategory' ? '次系列' : '產品型態');

    AppDialog.confirm(
        `確定要自 Google 試算表中永久刪除【${title}：${code}】嗎？`,
        async function () {
            try {
                await SheetAdapter.deleteRow(sheetName, code);
                AppToast.success(`【${title}：${code}】已成功刪除！`);
                await fetchGoogleSheetsData();
            } catch (err) {
                AppToast.error("刪除失敗：" + err.message);
            }
        },
        { title: `確認刪除${title}`, confirmText: "確認刪除", btnClass: "btn-danger" }
    );
}

// ==========================================================================
// 9. Tab 3：跨國批次定價與 SV 點數編輯
// ==========================================================================
function renderBatchEditorTable() {
    const $tbody = $('#tableBatchEditor tbody').empty();
    appState.products.forEach(p => {
        $tbody.append(`
            <tr data-product-code="${p.product_code}">
                <td>
                    <span class="badge bg-dark border ${p.region_code === 'TW' ? 'border-primary text-secondary' : 'border-danger text-danger'} me-1">${p.region_code}</span>
                    <span class="font-monospace fw-bold text-light">${p.product_code}</span>
                </td>
                <td class="fw-bold text-light">${p.name}</td>
                <td>${buildTypeBadge(p.type_code, p.region_code)}</td>
                <td>
                    <input type="number" step="0.01" class="form-control form-control-sm batch-input-price font-monospace text-end" value="${p.price}">
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm batch-input-currency font-monospace text-center" value="${p.currency}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm batch-input-sv font-monospace text-end" value="${p.sv_point}">
                </td>
                <td class="text-center">
                    <input class="form-check-input batch-check-featured" type="checkbox" ${p.is_featured ? 'checked' : ''}>
                </td>
                <td>
                    <select class="form-select form-select-sm batch-select-stock">
                        <option value="IN_STOCK" ${p.stock_status === 'IN_STOCK' ? 'selected' : ''}>現貨</option>
                        <option value="OUT_OF_STOCK" ${p.stock_status === 'OUT_OF_STOCK' ? 'selected' : ''}>缺貨</option>
                        <option value="PRE_ORDER" ${p.stock_status === 'PRE_ORDER' ? 'selected' : ''}>預購</option>
                    </select>
                </td>
                <td class="text-center">
                    <input class="form-check-input batch-check-active" type="checkbox" ${p.is_valid === 'Y' ? 'checked' : ''}>
                </td>
            </tr>
        `);
    });
}

async function saveBatchPrices() {
    const $btn = $('#btnSaveBatchPrices');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 批次儲存中...');

        const rows = $('#tableBatchEditor tbody tr');
        const updatePromises = [];
        const currentUser = getCurrentUser();
        const nowStr = getFormattedNow();

        rows.each(function () {
            const productCode = $(this).data('product-code');
            const item = appState.products.find(p => p.product_code === String(productCode));
            if (!item) return;

            item.price = parseFloat($(this).find('.batch-input-price').val()) || 0;
            item.currency = $(this).find('.batch-input-currency').val().trim();
            item.sv_point = parseInt($(this).find('.batch-input-sv').val(), 10) || 0;
            item.is_featured = $(this).find('.batch-check-featured').is(':checked');
            item.stock_status = $(this).find('.batch-select-stock').val();
            item.is_valid = $(this).find('.batch-check-active').is(':checked') ? 'Y' : 'N';
            item.modified_by = currentUser;
            item.modified_at = nowStr;

            const itemsRowArray = [
                item.product_code, item.region_code, item.base_code, item.name, item.short_name,
                item.short_summary || '', item.category_code, item.subcategory_code, item.type_code,
                item.package_spec, item.product_weight || '', item.price, item.currency, item.sv_point,
                item.primary_image_url, item.is_featured ? 'TRUE' : 'FALSE', item.stock_status,
                item.sort_order || 0, item.is_valid, item.launch_date || '', item.discontinue_date || '',
                item.official_update_date || nowStr.slice(0, 10),
                item.created_by || currentUser, item.created_at || nowStr, item.modified_by, item.modified_at
            ];

            updatePromises.push(SheetAdapter.updateRow('prd_items', item.product_code, itemsRowArray));
        });

        await Promise.all(updatePromises);
        AppToast.success('所有批次價格、SV 點數與明星商品標記已同步更新！');
        await fetchGoogleSheetsData();
    } catch (err) {
        AppToast.error("批次儲存失敗：" + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 批次寫入儲存');
    }
}

// ==========================================================================
// 10. Tab 4：統計分析與 10 張視覺化圖表
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
                        return ` ${label}: ${value} 筆 (${percentage}%)`;
                    }
                }
            },
            legend: {
                position: 'bottom',
                labels: { color: '#c084fc', boxWidth: 10, font: { size: 10 } }
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

    // 最新上市產品
    const sortedByLaunch = [...dataset]
        .filter(p => p.launch_date)
        .sort((a, b) => new Date(b.launch_date) - new Date(a.launch_date));
    const latestItem = sortedByLaunch[0] || null;

    // 1. 更新 4 張置頂 KPI 指標卡片
    $('#statTotalSku').text(total);
    $('#statRegionBreakdown').text(`台灣: ${twProducts.length} / 馬來西亞: ${myProducts.length}`);

    if (currentAnalyticsRegion === 'MY') {
        $('#statAvgPrice').text(`RM${myAvgPrice.toLocaleString()}`);
        $('#statAvgPriceSub').text(`(僅顯示馬來西亞品項)`);
    } else if (currentAnalyticsRegion === 'TW') {
        $('#statAvgPrice').text(`NT$${twAvgPrice.toLocaleString()}`);
        $('#statAvgPriceSub').text(`(僅顯示台灣品項)`);
    } else {
        $('#statAvgPrice').text(`NT$${twAvgPrice.toLocaleString()}`);
        $('#statAvgPriceSub').text(`馬幣均價: RM${myAvgPrice.toLocaleString()}`);
    }

    $('#statAvgSv').text(`${avgSv} SV`);
    $('#statValidRatio').text(`有效上架率: ${validRate}%`);

    if (latestItem) {
        $('#statLatestProduct').text(latestItem.name);
        $('#statLatestProductDate').text(`上市日期: ${latestItem.launch_date}`);
    } else {
        $('#statLatestProduct').text('暫無數據');
        $('#statLatestProductDate').text('-');
    }

    // 2. 主系列分布
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

    // 3. 次系列分布
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

    // 4. 產品型態分布
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

    // 5. 上市狀態占比
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

    // 6. 產品供應狀態統計
    const statusCounts = { '現貨': 0, '缺貨': 0, '預購': 0 };
    dataset.forEach(p => {
        if (p.stock_status === 'IN_STOCK') statusCounts['現貨']++;
        else if (p.stock_status === 'OUT_OF_STOCK') statusCounts['缺貨']++;
        else statusCounts['預購']++;
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
                    backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                    borderColor: '#1a122d',
                    borderWidth: 2
                }]
            },
            options: getDoughnutTooltipOptions()
        });
    }

    // 7. 產品售價排行 (Top 5)
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
                                return ` 售價: ${prefix}${Number(ctx.parsed.x).toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#a1a1aa' }, grid: { color: 'rgba(192, 132, 252, 0.1)' } },
                    y: { ticks: { color: '#c084fc', font: { size: 10 } }, grid: { display: false } }
                }
            }
        });
    }

    // 8. 全球 SV 點數排行 (Top 5)
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
                    x: { ticks: { color: '#a1a1aa' }, grid: { color: 'rgba(192, 132, 252, 0.1)' } },
                    y: { ticks: { color: '#c084fc', font: { size: 10 } }, grid: { display: false } }
                }
            }
        });
    }

    // 9. SV 貢獻率排行 (Top 5，TWD 為每千元產出、MYR 為每百元產出)
    const isMyr = currentAnalyticsRegion === 'MY';
    const multiplier = isMyr ? 100 : 1000;
    const unitText = isMyr ? 'SV / 百元 (MYR)' : 'SV / 千元 (TWD)';
    $('#titleSvEfficiencyRank').html(`<i class="fa-solid fa-bolt text-warning"></i> 每${isMyr ? '百' : '千'}元 SV 貢獻率排行 (Top 5)`);

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
                            label: (ctx) => ` 點數貢獻: ${ctx.parsed.x} ${unitText}`
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#a1a1aa' }, grid: { color: 'rgba(192, 132, 252, 0.1)' } },
                    y: { ticks: { color: '#c084fc', font: { size: 10 } }, grid: { display: false } }
                }
            }
        });
    }

    // 10. 產品重量 Top 5 (條形圖) - 僅使用「產品重量」欄位運算
    const weightList = dataset
        .map(p => {
            const raw = (p.product_weight || '').trim().toLowerCase();
            let weightVal = 0;
            if (raw.includes('kg')) weightVal = parseFloat(raw) * 1000;
            else if (raw.includes('g')) weightVal = parseFloat(raw);
            else if (raw.includes('ml')) weightVal = parseFloat(raw);
            else weightVal = parseFloat(raw) || 0;
            return {
                name: p.short_name || p.name,
                weight: weightVal,
                rawDisplay: p.product_weight || '-'
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
                    label: '產品重量 (g/ml)',
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
                                return ` 規格重量: ${item.rawDisplay} (${ctx.parsed.x} g/ml)`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#a1a1aa' }, grid: { color: 'rgba(192, 132, 252, 0.1)' } },
                    y: { ticks: { color: '#c084fc', font: { size: 10 } }, grid: { display: false } }
                }
            }
        });
    }

    // 11. 各年度上市品項趨勢 (折線圖)
    const yearCounts = {};
    dataset.forEach(p => {
        const year = p.launch_date ? p.launch_date.slice(0, 4) : '未設定';
        if (year !== '未設定') {
            yearCounts[year] = (yearCounts[year] || 0) + 1;
        }
    });

    const sortedYears = Object.keys(yearCounts).sort();
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
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderWidth: 3,
                    pointBackgroundColor: '#10b981',
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    fill: true,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` 上市商品數: ${ctx.parsed.y} 項`
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#a1a1aa' }, grid: { color: 'rgba(192, 132, 252, 0.05)' } },
                    y: { ticks: { color: '#c084fc', stepSize: 1 }, grid: { color: 'rgba(192, 132, 252, 0.1)' } }
                }
            }
        });
    }
}

// ==========================================================================
// 11. Modal 產品主檔與規格彈窗維護
// ==========================================================================
function openAddModal() {
    $('#productModalHeading').html('<i class="fa-solid fa-plus text-primary"></i> 新增產品資料與規格詳情');
    const form = document.getElementById('formFullProduct');
    form.reset();
    $(form).data('mode', 'add').data('code', '');
    $('input[name="product_code"]').prop('readonly', false);
    populateModalTaxonomySelects('TW');
    new bootstrap.Modal(document.getElementById('modalProductFullEdit')).show();
}

function openEditModal(productCode) {
    const item = appState.products.find(p => p.product_code === String(productCode));
    if (!item) return;

    $('#productModalHeading').html(`<i class="fa-solid fa-pen-to-square text-primary"></i> 編輯產品：${item.name} (${item.product_code})`);
    const form = document.getElementById('formFullProduct');
    form.reset();
    $(form).data('mode', 'edit').data('code', item.product_code);

    populateModalTaxonomySelects(item.region_code);

    // prd_items 主檔數值綁定
    form.elements['region_code'].value = item.region_code;
    form.elements['product_code'].value = item.product_code;
    $('input[name="product_code"]').prop('readonly', true);
    form.elements['base_code'].value = item.base_code;

    if (form.elements['type_code']) form.elements['type_code'].value = item.type_code;
    else if (form.elements['type_id']) form.elements['type_id'].value = item.type_code;

    form.elements['name'].value = item.name;
    form.elements['short_name'].value = item.short_name || '';
    if (form.elements['short_summary']) form.elements['short_summary'].value = item.short_summary || '';

    if (form.elements['subcategory_code']) form.elements['subcategory_code'].value = item.subcategory_code;
    else if (form.elements['subcategory_id']) form.elements['subcategory_id'].value = item.subcategory_code;

    form.elements['package_spec'].value = item.package_spec || '';
    if (form.elements['product_weight']) form.elements['product_weight'].value = item.product_weight || '';

    form.elements['price'].value = item.price;
    form.elements['currency'].value = item.currency;
    form.elements['sv_point'].value = item.sv_point;
    form.elements['primary_image_url'].value = item.primary_image_url || '';
    form.elements['stock_status'].value = item.stock_status || 'IN_STOCK';
    if (form.elements['sort_order']) form.elements['sort_order'].value = item.sort_order || 0;
    form.elements['is_featured'].checked = item.is_featured;

    const activeCheckbox = form.elements['is_valid'] || form.elements['is_active'];
    if (activeCheckbox) activeCheckbox.checked = item.is_valid === 'Y';

    if (form.elements['launch_date']) form.elements['launch_date'].value = item.launch_date || '';
    if (form.elements['discontinue_date']) form.elements['discontinue_date'].value = item.discontinue_date || '';
    if (form.elements['official_update_date']) form.elements['official_update_date'].value = item.official_update_date || '';

    // prd_item_details 規格數值綁定
    form.elements['hd_image_url'].value = item.hd_image_url || '';
    form.elements['official_site_url'].value = item.official_site_url || '';
    form.elements['certifications'].value = item.certifications || '';
    form.elements['phrase_tags'].value = item.phrase_tags || '';
    form.elements['usage_scenarios'].value = item.usage_scenarios || '';
    form.elements['ingredients'].value = item.ingredients || '';

    new bootstrap.Modal(document.getElementById('modalProductFullEdit')).show();
}

async function saveProductItem() {
    const form = document.getElementById('formFullProduct');
    const mode = $(form).data('mode') || 'add';
    const productCode = form.elements['product_code'].value.trim();

    if (!productCode) {
        AppToast.warning("產品編號 (product_code) 為必填欄位！");
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existingNode = appState.products.find(p => p.product_code === productCode);

    const createdBy = (mode === 'edit' && existingNode) ? (existingNode.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existingNode) ? (existingNode.created_at || nowStr) : nowStr;

    const subcategoryCode = (form.elements['subcategory_code'] ? form.elements['subcategory_code'].value : (form.elements['subcategory_id'] ? form.elements['subcategory_id'].value : '')).trim();
    const typeCode = (form.elements['type_code'] ? form.elements['type_code'].value : (form.elements['type_id'] ? form.elements['type_id'].value : '')).trim();

    let categoryCode = (form.elements['category_code'] ? form.elements['category_code'].value : '').trim();
    if (!categoryCode && subcategoryCode) {
        categoryCode = getSubcategoryByCode(subcategoryCode).category_code || '';
    }

    const isActive = (form.elements['is_valid'] ? form.elements['is_valid'].checked : (form.elements['is_active'] ? form.elements['is_active'].checked : true));
    const sortOrderVal = form.elements['sort_order'] ? (parseInt(form.elements['sort_order'].value, 10) || 0) : (existingNode && existingNode.sort_order !== undefined ? existingNode.sort_order : 0);
    const officialUpdateDateVal = form.elements['official_update_date'] ? form.elements['official_update_date'].value : (existingNode ? existingNode.official_update_date : '');

    // 1. prd_items 主檔陣列 (26 欄位順序)
    const itemsRowArray = [
        productCode,                                                                             // 0: 產品編號
        form.elements['region_code'].value.trim() || 'TW',                                       // 1: 地區代碼
        form.elements['base_code'].value.trim(),                                                 // 2: 跨國基本編號
        form.elements['name'].value.trim(),                                                      // 3: 產品名稱
        form.elements['short_name'].value.trim(),                                                // 4: 產品簡稱
        form.elements['short_summary'] ? form.elements['short_summary'].value.trim() : '',       // 5: 產品簡介
        categoryCode,                                                                            // 6: 產品主系列
        subcategoryCode,                                                                         // 7: 產品次系列
        typeCode,                                                                                // 8: 產品型態
        form.elements['package_spec'].value.trim(),                                              // 9: 包裝規格
        form.elements['product_weight'] ? form.elements['product_weight'].value.trim() : '',     // 10: 產品重量
        parseFloat(form.elements['price'].value) || 0,                                           // 11: 售價
        form.elements['currency'].value.trim() || 'TWD',                                         // 12: 幣別
        parseInt(form.elements['sv_point'].value, 10) || 0,                                      // 13: 全球 SV
        form.elements['primary_image_url'].value.trim(),                                         // 14: 圖片網址
        form.elements['is_featured'].checked ? 'TRUE' : 'FALSE',                                 // 15: 明星產品
        form.elements['stock_status'].value,                                                     // 16: 庫存狀態
        sortOrderVal,                                                                            // 17: 前端顯示排序
        isActive ? 'Y' : 'N',                                                                    // 18: 是否有效
        form.elements['launch_date'] ? form.elements['launch_date'].value : '',                 // 19: 上市日期
        form.elements['discontinue_date'] ? form.elements['discontinue_date'].value : '',       // 20: 下市日期
        officialUpdateDateVal,                                                                   // 21: 官方最新異動/更新日期
        createdBy,                                                                               // 22: 建立者
        createdAt,                                                                               // 23: 建立日期
        currentUser,                                                                             // 24: 編輯者
        nowStr                                                                                   // 25: 編輯日期
    ];

    // 2. prd_item_details 規格陣列 (13 欄位順序)
    const detailsRowArray = [
        productCode,                                                                             // 0: product_id
        form.elements['hd_image_url'].value.trim(),                                              // 1: hd_image_url
        form.elements['certifications'].value.trim(),                                            // 2: certifications
        form.elements['detailed_description'] ? form.elements['detailed_description'].value.trim() : '', // 3: detailed_description
        form.elements['usage_scenarios'].value.trim(),                                           // 4: usage_scenarios
        form.elements['phrase_tags'].value.trim(),                                               // 5: phrase_tags
        form.elements['features_and_functions'] ? form.elements['features_and_functions'].value.trim() : '', // 6: features_and_functions
        form.elements['ingredients'].value.trim(),                                               // 7: ingredients
        form.elements['official_site_url'].value.trim(),                                         // 8: official_site_url
        createdBy,                                                                               // 9: created_by
        createdAt,                                                                               // 10: created_at
        currentUser,                                                                             // 11: modified_by
        nowStr                                                                                   // 12: modified_at
    ];

    const $btnSave = $('#btnSaveFullProduct');
    try {
        $btnSave.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入雲端中...');

        if (mode === 'add') {
            await Promise.all([
                SheetAdapter.createRow('prd_items', productCode, itemsRowArray),
                SheetAdapter.createRow('prd_item_details', productCode, detailsRowArray)
            ]);
        } else {
            await Promise.all([
                SheetAdapter.updateRow('prd_items', productCode, itemsRowArray),
                SheetAdapter.updateRow('prd_item_details', productCode, detailsRowArray)
            ]);
        }

        const modalEl = document.getElementById('modalProductFullEdit');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        AppToast.success(`產品【${productCode}】已成功儲存！`);
        await fetchGoogleSheetsData();
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btnSave.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存所有異動');
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
                    SheetAdapter.deleteRow('prd_items', item.product_code),
                    SheetAdapter.deleteRow('prd_item_details', item.product_code)
                ]);
                AppToast.success(`產品【${item.product_code}】已成功刪除！`);
                await fetchGoogleSheetsData();
            } catch (err) {
                AppToast.error("刪除失敗：" + err.message);
            }
        },
        { title: "確認刪除產品", confirmText: "確認刪除", btnClass: "btn-danger" }
    );
}