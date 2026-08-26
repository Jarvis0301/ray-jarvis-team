// ==========================================================================
// 1. Google 雲端試算表設定與核心轉接器
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

// ==========================================================================
// 2. 系統狀態管理 (State Management)
// ==========================================================================
let appState = {
    products: [],          // prd_items (主表) + prd_details (詳情) 聯合資料
    categories: [],        // 表 01 prd_categories
    subcategories: [],     // 表 02 prd_subcategories
    types: [],             // 表 03 prd_types
    selectedProductId: null
};

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
// 4. 資料讀取與 5 表解析引擎 (GViz + PapaParse 非快取串流)
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
            fetchSheet('prd_items').catch(() => []),
            fetchSheet('prd_details').catch(() => []),
            fetchSheet('prd_categories').catch(() => []),
            fetchSheet('prd_subcategories').catch(() => []),
            fetchSheet('prd_types').catch(() => [])
        ]);

        appState.categories = parseCategoriesTable(rawCats);
        appState.subcategories = parseSubcategoriesTable(rawSubcats);
        appState.types = parseTypesTable(rawTypes);

        const items = parseItemsTable(rawItems);
        const details = parseDetailsTable(rawDetails);

        // 1:1 合併主表 (prd_items) 與詳情表 (prd_details)
        appState.products = items.map(item => {
            const detail = details.find(d => String(d.product_id) === String(item.id)) || {};
            return { ...item, ...detail, id: item.id };
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
 * 表 01: prd_items (24 欄位結構)
 */
function parseItemsTable(rows) {
    return rows.map((r, idx) => ({
        id: parseInt(getVal(r, 0, `${idx + 1}`), 10) || (idx + 1),
        region_code: getVal(r, 1, 'TW'),
        base_code: getVal(r, 2, ''),
        product_code: getVal(r, 3, `SKU_${idx + 1}`),
        name: getVal(r, 4, '未命名產品'),
        short_name: getVal(r, 5, ''),
        short_summary: getVal(r, 6, ''),
        type_id: parseInt(getVal(r, 7, '1'), 10) || 1,              // 外鍵：prd_types.id
        subcategory_id: parseInt(getVal(r, 8, '1'), 10) || 1,       // 外鍵：prd_subcategories.id
        package_spec: getVal(r, 9, ''),
        price: parseFloat(getVal(r, 10, '0')) || 0,
        currency: getVal(r, 11, 'TWD'),
        sv_point: parseInt(getVal(r, 12, '0'), 10) || 0,
        primary_image_url: getVal(r, 13, 'https://via.placeholder.com/150/1a122d/c084fc?text=No+Image'),
        is_featured: ['TRUE', 'Y', '1'].includes(getVal(r, 14, 'FALSE').toUpperCase()),
        stock_status: getVal(r, 15, 'IN_STOCK'),
        sort_order: parseInt(getVal(r, 16, '0'), 10) || 0,
        is_active: ['TRUE', 'Y', '1'].includes(getVal(r, 17, 'TRUE').toUpperCase()),
        launch_date: getVal(r, 18, ''),
        official_update_date: getVal(r, 19, ''),
        created_by: getVal(r, 20, 'SYSTEM'),
        created_at: getVal(r, 21, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 22, 'SYSTEM'),
        modified_at: getVal(r, 23, '2026-01-01 00:00:00')
    })).filter(item => item.name !== '未命名產品');
}

/**
 * 表 02: prd_details (14 欄位結構)
 */
function parseDetailsTable(rows) {
    return rows.map((r, idx) => ({
        detail_id: parseInt(getVal(r, 0, `${idx + 1}`), 10) || (idx + 1),
        product_id: parseInt(getVal(r, 1, '0'), 10) || 0,           // 外鍵：prd_items.id
        hd_image_url: getVal(r, 2, ''),
        certifications: getVal(r, 3, ''),
        detailed_description: getVal(r, 4, ''),
        usage_scenarios: getVal(r, 5, ''),
        phrase_tags: getVal(r, 6, ''),
        features_and_functions: getVal(r, 7, ''),
        ingredients: getVal(r, 8, ''),
        official_site_url: getVal(r, 9, ''),
        detail_created_by: getVal(r, 10, 'SYSTEM'),
        detail_created_at: getVal(r, 11, '2026-01-01 00:00:00'),
        detail_modified_by: getVal(r, 12, 'SYSTEM'),
        detail_modified_at: getVal(r, 13, '2026-01-01 00:00:00')
    }));
}

/**
 * 表 03: prd_categories (13 欄位結構)
 */
function parseCategoriesTable(rows) {
    return rows.map((r, idx) => ({
        id: parseInt(getVal(r, 0, `${idx + 1}`), 10) || (idx + 1),
        category_code: getVal(r, 1, `CAT_${idx + 1}`),
        name_zh: getVal(r, 2, '未命名主系列'),
        name_en: getVal(r, 3, ''),
        icon_class: getVal(r, 4, 'fa-solid fa-folder'),
        text_color: getVal(r, 5, '#8b5cf6'),
        bg_color: getVal(r, 6, '#1a122d'),
        sort_order: parseInt(getVal(r, 7, '0'), 10) || 0,
        is_active: ['TRUE', 'Y', '1'].includes(getVal(r, 8, 'TRUE').toUpperCase()),
        created_by: getVal(r, 9, 'SYSTEM'),
        created_at: getVal(r, 10, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 11, 'SYSTEM'),
        modified_at: getVal(r, 12, '2026-01-01 00:00:00')
    })).filter(c => c.name_zh !== '未命名主系列');
}

/**
 * 表 04: prd_subcategories (14 欄位結構)
 */
function parseSubcategoriesTable(rows) {
    return rows.map((r, idx) => ({
        id: parseInt(getVal(r, 0, `${idx + 1}`), 10) || (idx + 1),
        category_id: parseInt(getVal(r, 1, '1'), 10) || 1,          // 外鍵：prd_categories.id
        subcategory_code: getVal(r, 2, `SUBCAT_${idx + 1}`),
        name_zh: getVal(r, 3, '未命名次系列'),
        name_en: getVal(r, 4, ''),
        icon_class: getVal(r, 5, 'fa-solid fa-tag'),
        text_color: getVal(r, 6, '#c084fc'),
        bg_color: getVal(r, 7, '#1a122d'),
        sort_order: parseInt(getVal(r, 8, '0'), 10) || 0,
        is_active: ['TRUE', 'Y', '1'].includes(getVal(r, 9, 'TRUE').toUpperCase()),
        created_by: getVal(r, 10, 'SYSTEM'),
        created_at: getVal(r, 11, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 12, 'SYSTEM'),
        modified_at: getVal(r, 13, '2026-01-01 00:00:00')
    })).filter(s => s.name_zh !== '未命名次系列');
}

/**
 * 表 05: prd_types (12 欄位結構)
 */
function parseTypesTable(rows) {
    return rows.map((r, idx) => ({
        id: parseInt(getVal(r, 0, `${idx + 1}`), 10) || (idx + 1),
        type_code: getVal(r, 1, `TYPE_${idx + 1}`),
        name_zh: getVal(r, 2, '未命名型態'),
        name_en: getVal(r, 3, ''),
        icon_class: getVal(r, 4, 'fa-solid fa-cubes'),
        text_color: getVal(r, 5, '#38bdf8'),
        bg_color: getVal(r, 6, '#1a122d'),
        sort_order: parseInt(getVal(r, 7, '0'), 10) || 0,
        created_by: getVal(r, 8, 'SYSTEM'),
        created_at: getVal(r, 9, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 10, 'SYSTEM'),
        modified_at: getVal(r, 11, '2026-01-01 00:00:00')
    })).filter(t => t.name_zh !== '未命名型態');
}

// ==========================================================================
// 5. 字典查找與圖示色彩徽章渲染工具
// ==========================================================================
function getCategoryById(id) {
    return appState.categories.find(c => c.id === Number(id)) || {
        name_zh: '未分類主系列',
        icon_class: 'fa-solid fa-folder',
        text_color: '#8b5cf6',
        bg_color: '#1a122d'
    };
}

function getSubcatById(id) {
    return appState.subcategories.find(s => s.id === Number(id)) || {
        name_zh: '未分類次系列',
        icon_class: 'fa-solid fa-tag',
        text_color: '#c084fc',
        bg_color: '#1a122d'
    };
}

function getTypeById(id) {
    return appState.types.find(t => t.id === Number(id)) || {
        name_zh: '未指定型態',
        icon_class: 'fa-solid fa-cubes',
        text_color: '#38bdf8',
        bg_color: '#1a122d'
    };
}

function buildCategoryBadge(categoryId) {
    const c = getCategoryById(categoryId);
    const bg = c.bg_color && c.bg_color !== '#1a122d' ? c.bg_color : `${c.text_color}18`;
    return `<span class="badge" style="color: ${c.text_color}; background-color: ${bg}; border: 1px solid ${c.text_color}40;"><i class="${c.icon_class}"></i> ${c.name_zh}</span>`;
}

function buildSubcategoryBadge(subcatId) {
    const s = getSubcatById(subcatId);
    const bg = s.bg_color && s.bg_color !== '#1a122d' ? s.bg_color : `${s.text_color}18`;
    return `<span class="badge" style="color: ${s.text_color}; background-color: ${bg}; border: 1px solid ${s.text_color}40;"><i class="${s.icon_class}"></i> ${s.name_zh}</span>`;
}

function buildTypeBadge(typeId) {
    const t = getTypeById(typeId);
    const bg = t.bg_color && t.bg_color !== '#1a122d' ? t.bg_color : `${t.text_color}18`;
    return `<span class="badge badge-type" style="color: ${t.text_color}; background-color: ${bg}; border: 1px solid ${t.text_color}40;"><i class="${t.icon_class}"></i> ${t.name_zh}</span>`;
}

// ==========================================================================
// 6. 介面事件綁定與視圖渲染中樞
// ==========================================================================
function bindUIEvents() {
    $('#btnOpenNewProductModal').on('click', () => openAddModal());
    $('#btnSaveFullProduct').on('click', () => saveProductItem());
    $('#btnSaveBatchPrices').on('click', () => saveBatchPrices());

    $('#filterMasterRegion, #filterMasterCategory, #filterMasterSubcategory, #filterMasterType, #filterMasterStock').on('change', () => {
        applyMasterFilters();
    });

    $('button[data-bs-toggle="tab"]').on('shown.bs.tab', (e) => {
        if (e.target.id === 'tab-analytics-link') {
            renderAnalyticsCharts();
        }
    });

    AppDialog.bindIframeAutoCenter('#modalProductFullEdit');
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

function populateSelects() {
    const $filterCat = $('#filterMasterCategory');
    $filterCat.find('option:not(:first)').remove();
    appState.categories.forEach(c => {
        $filterCat.append(`<option value="${c.id}">${c.name_zh}</option>`);
    });

    const $filterType = $('#filterMasterType');
    const $modalType = $('#modalSelectType');
    $filterType.find('option:not(:first)').remove();
    $modalType.empty();
    appState.types.forEach(t => {
        $filterType.append(`<option value="${t.id}">${t.name_zh} (${t.name_en || ''})</option>`);
        $modalType.append(`<option value="${t.id}">${t.name_zh} (${t.name_en || ''})</option>`);
    });

    const $filterSubcat = $('#filterMasterSubcategory');
    const $modalSubcat = $('#modalSelectSubcategory');
    $filterSubcat.find('option:not(:first)').remove();
    $modalSubcat.empty();
    appState.subcategories.forEach(s => {
        $filterSubcat.append(`<option value="${s.id}">${s.name_zh}</option>`);
        $modalSubcat.append(`<option value="${s.id}">${s.name_zh}</option>`);
    });
}

function renderMasterTable() {
    const formattedData = appState.products.map(p => formatMasterTableRow(p));

    if (masterDataTableInstance) {
        masterDataTableInstance.clear();
        masterDataTableInstance.rows.add(formattedData);
        masterDataTableInstance.draw();
    } else {
        masterDataTableInstance = $('#tableMasterProducts').DataTable({
            data: formattedData,
            responsive: true,
            pageLength: 10,
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
                { data: 'status', className: 'text-center' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }
}

function formatMasterTableRow(p) {
    const star = p.is_featured ? ' <i class="fa-solid fa-star text-warning" title="明星熱銷商品"></i>' : '';
    const badgeRegion = p.region_code === 'TW' ? 'border-primary text-secondary' : 'border-danger text-danger';
    const subcat = getSubcatById(p.subcategory_id);

    let stockBadge = '';
    if (p.stock_status === 'IN_STOCK') stockBadge = '<span class="badge bg-success bg-opacity-25 text-success border border-success"><i class="fa-solid fa-box"></i> 現貨</span>';
    else if (p.stock_status === 'OUT_OF_STOCK') stockBadge = '<span class="badge bg-danger bg-opacity-25 text-danger border border-danger"><i class="fa-solid fa-circle-xmark"></i> 缺貨</span>';
    else stockBadge = '<span class="badge bg-warning bg-opacity-25 text-warning border border-warning"><i class="fa-solid fa-clock"></i> 預購</span>';

    const activeBadge = p.is_active
        ? '<span class="text-success ms-1" title="有效上架"><i class="fa-solid fa-circle-check"></i></span>'
        : '<span class="text-muted ms-1" title="已封存"><i class="fa-solid fa-ban"></i></span>';

    return {
        thumb: `<img src="${p.primary_image_url}" alt="${p.name}" class="img-thumb-preview" onerror="window.imgError(this, 'product', 42, 42)">`,
        code: `<div>
                   <span class="badge bg-dark border ${badgeRegion} me-1">${p.region_code}</span>
                   <span class="fw-bold font-monospace text-light">${p.product_code}</span>
               </div>`,
        name: `<div class="fw-bold text-light">${p.name}${star}</div>
               <div class="text-muted small">${p.short_name ? `簡稱: ${p.short_name}` : (p.short_summary || '')}</div>`,
        category: buildCategoryBadge(subcat.category_id),
        subcategory: buildSubcategoryBadge(p.subcategory_id),
        type: buildTypeBadge(p.type_id),
        spec: `<span class="text-muted small font-monospace">${p.package_spec || '-'}</span>`,
        price: `<span class="badge-price">${p.currency} $${Number(p.price).toLocaleString()}</span>`,
        sv: `<span class="badge-sv">${p.sv_point} SV</span>`,
        status: `<div>${stockBadge}${activeBadge}</div>`,
        actions: `
            <button class="btn btn-outline-primary btn-sm py-1 px-2" onclick="openEditModal(${p.id})" title="完整維護主檔與詳細資料">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-outline-danger btn-sm py-1 px-2 ms-1" onclick="deleteProductItem(${p.id})" title="刪除產品">
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
    const stock = $('#filterMasterStock').val();

    const filtered = appState.products.filter(p => {
        const sub = getSubcatById(p.subcategory_id);
        const matchReg = !reg || p.region_code === reg;
        const matchCat = !cat || sub.category_id === Number(cat);
        const matchSubcat = !subcat || p.subcategory_id === Number(subcat);
        const matchType = !type || p.type_id === Number(type);
        const matchStock = !stock || p.stock_status === stock;
        return matchReg && matchCat && matchSubcat && matchType && matchStock;
    });

    const formattedData = filtered.map(p => formatMasterTableRow(p));
    masterDataTableInstance.clear().rows.add(formattedData).draw();
}

/**
 * 渲染系列與型態體系 (表 01 ~ 表 03)
 */
function renderTaxonomyTables() {
    // 表 01 主系列
    const $catTbody = $('#tableCategories tbody').empty();
    appState.categories.forEach(c => {
        $catTbody.append(`
            <tr>
                <td><span class="font-monospace text-secondary">${c.category_code}</span></td>
                <td class="fw-bold text-light"><i class="${c.icon_class} text-primary me-1"></i> ${c.name_zh}</td>
                <td class="text-muted small">${c.name_en || '-'}</td>
                <td class="text-center">
                    <span class="badge" style="color: ${c.text_color}; background-color: ${c.bg_color || c.text_color + '20'}; border: 1px solid ${c.text_color};">
                        <i class="${c.icon_class}"></i> ${c.text_color}
                    </span>
                </td>
            </tr>
        `);
    });

    // 表 02 次系列
    const $subcatTbody = $('#tableSubcategories tbody').empty();
    appState.subcategories.forEach(s => {
        $subcatTbody.append(`
            <tr>
                <td><span class="font-monospace text-secondary">${s.subcategory_code}</span></td>
                <td class="fw-bold text-light">${s.name_zh}</td>
                <td>
                    <span class="badge" style="color: ${s.text_color}; background-color: ${s.bg_color || s.text_color + '20'}; border: 1px solid ${s.text_color};">
                        <i class="${s.icon_class}"></i> ${s.text_color}
                    </span>
                </td>
                <td class="text-center">
                    <button class="btn btn-link btn-sm text-secondary p-0"><i class="fa-solid fa-pen"></i></button>
                </td>
            </tr>
        `);
    });

    // 表 03 產品型態
    const $typeTbody = $('#tableTypes tbody').empty();
    appState.types.forEach(t => {
        $typeTbody.append(`
            <tr>
                <td><span class="font-monospace text-secondary">${t.type_code}</span></td>
                <td class="fw-bold text-light">${t.name_zh}</td>
                <td>
                    <span class="badge badge-type" style="color: ${t.text_color}; background-color: ${t.bg_color || t.text_color + '20'}; border-color: ${t.text_color};">
                        <i class="${t.icon_class}"></i> ${t.name_en || t.name_zh}
                    </span>
                </td>
                <td class="text-center">
                    <button class="btn btn-link btn-sm text-info p-0"><i class="fa-solid fa-pen"></i></button>
                </td>
            </tr>
        `);
    });
}

/**
 * 渲染跨國批次定價編輯表 (表 04)
 */
function renderBatchEditorTable() {
    const $tbody = $('#tableBatchEditor tbody').empty();
    appState.products.forEach(p => {
        $tbody.append(`
            <tr data-product-id="${p.id}">
                <td>
                    <span class="badge bg-dark border ${p.region_code === 'TW' ? 'border-primary text-secondary' : 'border-danger text-danger'} me-1">${p.region_code}</span>
                    <span class="font-monospace fw-bold text-light">${p.product_code}</span>
                </td>
                <td class="fw-bold text-light">${p.name}</td>
                <td>${buildTypeBadge(p.type_id)}</td>
                <td>
                    <input type="number" step="0.01" class="form-control form-control-sm batch-input-price font-monospace text-end" value="${p.price}">
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm batch-input-currency font-monospace text-center" value="${p.currency}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm batch-input-sv font-monospace text-end" value="${p.sv_point}">
                </td>
                <td>
                    <select class="form-select form-select-sm batch-select-stock">
                        <option value="IN_STOCK" ${p.stock_status === 'IN_STOCK' ? 'selected' : ''}>現貨</option>
                        <option value="OUT_OF_STOCK" ${p.stock_status === 'OUT_OF_STOCK' ? 'selected' : ''}>缺貨</option>
                        <option value="PRE_ORDER" ${p.stock_status === 'PRE_ORDER' ? 'selected' : ''}>預購</option>
                    </select>
                </td>
                <td class="text-center">
                    <input class="form-check-input batch-check-active" type="checkbox" ${p.is_active ? 'checked' : ''}>
                </td>
            </tr>
        `);
    });
}

/**
 * 渲染 6 張獨立統計圖表 (動態套用資料庫色彩)
 */
function renderAnalyticsCharts() {
    const total = appState.products.length;
    const totalSv = appState.products.reduce((sum, p) => sum + p.sv_point, 0);
    const avgSv = total > 0 ? (totalSv / total).toFixed(1) : 0;
    const twCount = appState.products.filter(p => p.region_code === 'TW').length;
    const inStockCount = appState.products.filter(p => p.stock_status === 'IN_STOCK').length;
    const stockRate = total > 0 ? Math.round((inStockCount / total) * 100) : 0;

    $('#statTotalSku').text(total);
    $('#statAvgSv').text(`${avgSv} SV`);
    $('#statRegionRatio').text(`TW: ${twCount} / MY: ${total - twCount}`);
    $('#statStockRate').text(`${stockRate}%`);

    // 1. 主系列分布圓餅圖
    const catMap = {};
    appState.categories.forEach(c => {
        catMap[c.name_zh] = { count: 0, color: c.text_color || '#8b5cf6' };
    });
    appState.products.forEach(p => {
        const subcat = getSubcatById(p.subcategory_id);
        const cat = getCategoryById(subcat.category_id);
        if (catMap[cat.name_zh]) {
            catMap[cat.name_zh].count++;
        }
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
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#c084fc', boxWidth: 10, font: { size: 10 } } }
                }
            }
        });
    }

    // 2. 次系列分布圓餅圖
    const subcatMap = {};
    appState.subcategories.forEach(s => {
        subcatMap[s.name_zh] = { count: 0, color: s.text_color || '#c084fc' };
    });
    appState.products.forEach(p => {
        const s = getSubcatById(p.subcategory_id);
        if (subcatMap[s.name_zh]) {
            subcatMap[s.name_zh].count++;
        }
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
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#c084fc', boxWidth: 10, font: { size: 10 } } }
                }
            }
        });
    }

    // 3. 產品型態分布圓餅圖
    const typeMap = {};
    appState.types.forEach(t => {
        typeMap[t.name_zh] = { count: 0, color: t.text_color || '#38bdf8' };
    });
    appState.products.forEach(p => {
        const t = getTypeById(p.type_id);
        if (typeMap[t.name_zh]) {
            typeMap[t.name_zh].count++;
        }
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
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#c084fc', boxWidth: 10, font: { size: 10 } } }
                }
            }
        });
    }

    // 4. 產品售價排行 (Top 5)
    const topPriceProducts = [...appState.products].sort((a, b) => b.price - a.price).slice(0, 5);
    if (chartInstances.priceRank) chartInstances.priceRank.destroy();
    const ctxPriceRank = document.getElementById('chartPriceRank')?.getContext('2d');
    if (ctxPriceRank) {
        chartInstances.priceRank = new Chart(ctxPriceRank, {
            type: 'bar',
            data: {
                labels: topPriceProducts.map(p => p.short_name || p.name),
                datasets: [{
                    label: '售價 (當地幣別)',
                    data: topPriceProducts.map(p => p.price),
                    backgroundColor: '#ef4444',
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

    // 5. 全球 SV 點數排行 (Top 5)
    const topSvProducts = [...appState.products].sort((a, b) => b.sv_point - a.sv_point).slice(0, 5);
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

    // 6. 產品供應狀態統計
    const statusCounts = { '現貨': 0, '缺貨': 0, '預購': 0 };
    appState.products.forEach(p => {
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
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#c084fc', boxWidth: 10, font: { size: 10 } } }
                }
            }
        });
    }
}

// ==========================================================================
// 7. Modal 表單雙表原子化寫入 (prd_items + prd_details)
// ==========================================================================
function openAddModal() {
    $('#productModalHeading').html('<i class="fa-solid fa-plus text-primary"></i> 新增產品資料與規格詳情');
    const form = document.getElementById('formFullProduct');
    form.reset();
    $(form).data('mode', 'add').data('id', '');
    $('input[name="product_code"]').prop('readonly', false);
    populateSelects();
    new bootstrap.Modal(document.getElementById('modalProductFullEdit')).show();
}

function openEditModal(productId) {
    const item = appState.products.find(p => p.id === Number(productId));
    if (!item) return;

    $('#productModalHeading').html(`<i class="fa-solid fa-pen-to-square text-primary"></i> 編輯產品：${item.name} (${item.product_code})`);
    const form = document.getElementById('formFullProduct');
    form.reset();
    $(form).data('mode', 'edit').data('id', item.id);

    populateSelects();

    // prd_items 主檔
    form.elements['region_code'].value = item.region_code;
    form.elements['product_code'].value = item.product_code;
    $('input[name="product_code"]').prop('readonly', true);
    form.elements['base_code'].value = item.base_code;
    form.elements['type_id'].value = item.type_id;
    form.elements['name'].value = item.name;
    form.elements['short_name'].value = item.short_name || '';
    form.elements['subcategory_id'].value = item.subcategory_id;
    form.elements['package_spec'].value = item.package_spec || '';
    form.elements['price'].value = item.price;
    form.elements['currency'].value = item.currency;
    form.elements['sv_point'].value = item.sv_point;
    form.elements['primary_image_url'].value = item.primary_image_url || '';
    form.elements['stock_status'].value = item.stock_status || 'IN_STOCK';
    form.elements['is_featured'].checked = item.is_featured;
    form.elements['is_active'].checked = item.is_active;

    // prd_details 規格
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
    const existingId = $(form).data('id');
    const productCode = form.elements['product_code'].value.trim();

    if (!productCode) {
        AppToast.warning("產品編號 (SKU) 為必填欄位！");
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    
    const productId = mode === 'edit' && existingId ? Number(existingId) : (appState.products.length > 0 ? Math.max(...appState.products.map(p => p.id || 0)) + 1 : 1);
    const existingNode = appState.products.find(p => p.id === productId);
    const createdBy = (mode === 'edit' && existingNode) ? (existingNode.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existingNode) ? (existingNode.created_at || nowStr) : nowStr;

    // 1. prd_items 陣列 (24 欄位)
    const itemsRowArray = [
        productId,
        form.elements['region_code'].value,
        form.elements['base_code'].value.trim(),
        productCode,
        form.elements['name'].value.trim(),
        form.elements['short_name'].value.trim(),
        form.elements['short_summary'] ? form.elements['short_summary'].value.trim() : '',
        parseInt(form.elements['type_id'].value, 10) || 1,
        parseInt(form.elements['subcategory_id'].value, 10) || 1,
        form.elements['package_spec'].value.trim(),
        parseFloat(form.elements['price'].value) || 0,
        form.elements['currency'].value.trim() || 'TWD',
        parseInt(form.elements['sv_point'].value, 10) || 0,
        form.elements['primary_image_url'].value.trim(),
        form.elements['is_featured'].checked ? 'TRUE' : 'FALSE',
        form.elements['stock_status'].value,
        0,
        form.elements['is_active'].checked ? 'TRUE' : 'FALSE',
        '',
        nowStr.slice(0, 10),
        createdBy,
        createdAt,
        currentUser,
        nowStr
    ];

    // 2. prd_details 陣列 (14 欄位)
    const detailId = (existingNode && existingNode.detail_id) ? existingNode.detail_id : productId;
    const detailsRowArray = [
        detailId,
        productId,
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
        $btnSave.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入雲端中...');

        if (mode === 'add') {
            await Promise.all([
                SheetAdapter.createRow('prd_items', productId, itemsRowArray),
                SheetAdapter.createRow('prd_details', detailId, detailsRowArray)
            ]);
        } else {
            await Promise.all([
                SheetAdapter.updateRow('prd_items', productId, itemsRowArray),
                SheetAdapter.updateRow('prd_details', detailId, detailsRowArray)
            ]);
        }

        const modalEl = document.getElementById('modalProductFullEdit');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        AppToast.success(`產品【${productCode}】已雙表儲存成功！`);
        await fetchGoogleSheetsData();
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btnSave.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存所有異動');
    }
}

function deleteProductItem(productId) {
    const item = appState.products.find(p => p.id === Number(productId));
    if (!item) return;

    AppDialog.confirm(
        `確定要自 Google 試算表中永久刪除【${item.name} (${item.product_code})】及其規格資料嗎？`,
        async function () {
            try {
                await Promise.all([
                    SheetAdapter.deleteRow('prd_items', item.id),
                    SheetAdapter.deleteRow('prd_details', item.detail_id || item.id)
                ]);
                AppToast.success(`產品【${item.product_code}】已自雲端刪除！`);
                await fetchGoogleSheetsData();
            } catch (err) {
                AppToast.error("刪除失敗：" + err.message);
            }
        },
        { title: "確認刪除產品", confirmText: "確認刪除", btnClass: "btn-danger" }
    );
}

async function saveBatchPrices() {
    const $btn = $('#btnSaveBatchPrices');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 批次儲存中...');
        
        const rows = $('#tableBatchEditor tbody tr');
        const updatePromises = [];
        const currentUser = getCurrentUser();
        const nowStr = getFormattedNow();

        rows.each(function() {
            const productId = $(this).data('product-id');
            const item = appState.products.find(p => p.id === Number(productId));
            if (!item) return;

            item.price = parseFloat($(this).find('.batch-input-price').val()) || 0;
            item.currency = $(this).find('.batch-input-currency').val().trim();
            item.sv_point = parseInt($(this).find('.batch-input-sv').val(), 10) || 0;
            item.stock_status = $(this).find('.batch-select-stock').val();
            item.is_active = $(this).find('.batch-check-active').is(':checked');
            item.modified_by = currentUser;
            item.modified_at = nowStr;

            const itemsRowArray = [
                item.id, item.region_code, item.base_code, item.product_code, item.name,
                item.short_name, item.short_summary || '', item.type_id, item.subcategory_id,
                item.package_spec, item.price, item.currency, item.sv_point, item.primary_image_url,
                item.is_featured ? 'TRUE' : 'FALSE', item.stock_status, item.sort_order || 0,
                item.is_active ? 'TRUE' : 'FALSE', item.launch_date || '', item.official_update_date || '',
                item.created_by || currentUser, item.created_at || nowStr, item.modified_by, item.modified_at
            ];

            updatePromises.push(SheetAdapter.updateRow('prd_items', item.id, itemsRowArray));
        });

        await Promise.all(updatePromises);
        AppToast.success('所有批次價格與 SV 點數已同步更新！');
        await fetchGoogleSheetsData();
    } catch (err) {
        AppToast.error("批次儲存失敗：" + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 批次寫入儲存');
    }
}