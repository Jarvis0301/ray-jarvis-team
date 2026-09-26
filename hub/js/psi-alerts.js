// ==========================================================================
// 1. Google 雲端試算表設定與常數定義
// ==========================================================================
const SPREADSHEET_ID = {
    PSI: APP_CONFIG.SHEETS.PSI,
    PRD: APP_CONFIG.SHEETS.PRD
};

const GAS_DEPLOY_ID = {
    PSI: APP_CONFIG.GAS.PSI
};

const SHEET_NAMES = {
    ALERTS: APP_CONFIG.SHEET_NAMES?.PSI?.ALERTS || '庫存預警',
    THRESHOLDS: APP_CONFIG.SHEET_NAMES?.PSI?.SAFETY_THRESHOLDS || '安全門檻',
    WAREHOUSES: APP_CONFIG.SHEET_NAMES?.PSI?.WAREHOUSES || '據點倉儲',
    PRODUCTS: APP_CONFIG.SHEET_NAMES?.PRD?.PRODUCTS || '產品主檔'
};

function getWarehouseName(whId, displayMode = 1) {
    return EntityResolver.warehouse(whId, appState.warehouses, displayMode);
}

function getProductShortName(prdId, displayMode = 1) {
    return EntityResolver.product(prdId, appState.products, displayMode);
}

function getWarehouseTypeOrder(type) {
    const orderMap = {
        '自用常備倉': 1,
        '海外商務倉': 2,
        '官方營運中心': 3,
        '物流在途倉': 4
    };
    return orderMap[type] || 99;
}

// ==========================================================================
// 2. 系統狀態管理 (State Management)
// ==========================================================================
let appState = {
    alerts: [],
    thresholds: [],
    warehouses: {}, // 格式: { [id]: { id, name, type } }
    products: {},   // 格式: { [code]: { code, region, name, short_name } }
    currentWorkspace: 'ALERTS', // 'ALERTS' | 'THRESHOLDS' | 'CHARTS'
    alertFilter: 'ALL', // 膠囊快篩
    filters: {
        warehouse: 'ALL',   // 據點倉儲
        product: 'ALL',     // 產品品項
        alertType: 'ALL',   // 預警類型
        severity: 'ALL',    // 嚴重性
        status: 'ALL',      // 處置狀態
        monitored: 'ALL'    // 監控狀態
    }
};

let alertsDataTableInstance = null;
let thresholdsDataTableInstance = null;
let isInitialized = false;

// ==========================================================================
// 3. 生命週期與初始化
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(GAS_DEPLOY_ID.PSI);
    }
    await initAlertsApp();
});

async function initAlertsApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindUIEvents();
    await fetchGoogleSheetsData();
}

// ==========================================================================
// 4. 資料讀取引擎：PapaParse 0-Based 順序解析
// ==========================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i>正在讀取雲端資料庫...', '載入中...');
    
    try {
        const [rawAlertRows, rawThresholdRows, rawWhRows, rawPrdRows] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSI, SHEET_NAMES.ALERTS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSI, SHEET_NAMES.THRESHOLDS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSI, SHEET_NAMES.WAREHOUSES).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.PRODUCTS).catch(() => [])
        ]);

        // 1. 解析據點主檔 (表 301)
        appState.warehouses = {};
        (rawWhRows || []).forEach(r => {
            const id = getVal(r, 0);   // Col 0: id
            const name = getVal(r, 1); // Col 1: warehouse_name
            const type = getVal(r, 2); // Col 2: warehouse_type
            if (id) {
                appState.warehouses[id] = { id, name: name || id, type };
            }
        });

        // 2. 解析產品主檔 (表 101)
        appState.products = {};
        (rawPrdRows || []).forEach(r => {
            const code = getVal(r, 0);       // Col 0: product_code (PK)
            const region = getVal(r, 1, 'TW').toUpperCase(); // Col 1: region_code
            const name = getVal(r, 3);       // Col 3: name
            const shortName = getVal(r, 4);  // Col 4: short_name
            if (code) {
                appState.products[code] = {
                    code,
                    region,
                    name: name || code,
                    short_name: shortName || name || code
                };
            }
        });

        // 3. 解析預警表與門檻表
        appState.alerts = (rawAlertRows && rawAlertRows.length > 0) ? parseAlertsTable(rawAlertRows) : [];
        appState.thresholds = (rawThresholdRows && rawThresholdRows.length > 0) ? parseThresholdsTable(rawThresholdRows) : [];

        // 初始化下拉選單與介面渲染
        populateFilterSelectOptions();
        populateThresholdSelectOptions();
        refreshView();
        AppToast.success(`同步完成：${appState.alerts.length.toLocaleString()} 筆預警、${appState.thresholds.length.toLocaleString()} 組門檻規則`);
    } catch (err) {
        console.error("Google Sheets 同步失敗:", err);
        appState.alerts = [];
        appState.thresholds = [];
        refreshView();
        AppToast.error(`資料同步異常：${err.message}`);
    } finally {
        AppLoading.hide();
    }
}

/**
 * 依據表 308 (psi_alerts) 物理順序解析 (Index 0 ~ 18)
 */
function parseAlertsTable(rows) {
    return rows.map((r, idx) => {
        return {
            id: getVal(r, 0, `ALT-${AppDate.toClean8()}-${String(idx + 1).padStart(4, '0')}`), // Col 0: id
            alert_type: getVal(r, 1, '低於安全水位'),                      // Col 1: alert_type
            warehouse_id: getVal(r, 2, ''),                               // Col 2: warehouse_id
            product_id: getVal(r, 3, ''),                                 // Col 3: product_id
            stock_id: getVal(r, 4, ''),                                   // Col 4: stock_id
            batch_no: getVal(r, 5, '-'),                                  // Col 5: batch_no
            expiry_date: getVal(r, 6, '-'),                               // Col 6: expiry_date
            current_qty: parseInt(getVal(r, 7, '0'), 10) || 0,            // Col 7: current_qty
            threshold_qty: getVal(r, 8) !== '' ? parseInt(getVal(r, 8), 10) : null, // Col 8: threshold_qty
            days_to_expire: getVal(r, 9) !== '' ? parseInt(getVal(r, 9), 10) : null, // Col 9: days_to_expire
            alert_level: getVal(r, 10, '注意'),                           // Col 10: alert_level
            status: getVal(r, 11, '未處理'),                               // Col 11: status
            remarks: getVal(r, 12, ''),                                   // Col 12: remarks
            resolved_by: getVal(r, 13, ''),                               // Col 13: resolved_by
            resolved_at: getVal(r, 14, ''),                               // Col 14: resolved_at
            created_by: getVal(r, 15, 'SYSTEM'),                          // Col 15: created_by
            created_at: getVal(r, 16, AppDate.now('full')),                 // Col 16: created_at
            modified_by: getVal(r, 17, 'SYSTEM'),                         // Col 17: modified_by
            modified_at: getVal(r, 18, AppDate.now('full'))                 // Col 18: modified_at
        };
    });
}

/**
 * 依據表 310 (psi_safety_thresholds) 物理順序解析 (Index 0 ~ 9)
 */
function parseThresholdsTable(rows) {
    return rows.map((r, idx) => {
        return {
            id: getVal(r, 0, `TH-${String(idx + 1).padStart(3, '0')}`),   // Col 0: id
            warehouse_id: getVal(r, 1, 'WH-TW-TP'),                       // Col 1: warehouse_id
            product_id: getVal(r, 2, 'PRD-0101-01'),                      // Col 2: product_id
            threshold_qty: parseInt(getVal(r, 3, '0'), 10) || 0,          // Col 3: threshold_qty
            is_monitored: getVal(r, 4, 'Y').toUpperCase(),                 // Col 4: is_monitored
            remarks: getVal(r, 5, ''),                                    // Col 5: remarks
            created_by: getVal(r, 6, 'SYSTEM'),                           // Col 6: created_by
            created_at: getVal(r, 7, AppDate.now('full')),                  // Col 7: created_at
            modified_by: getVal(r, 8, 'SYSTEM'),                          // Col 8: modified_by
            modified_at: getVal(r, 9, AppDate.now('full'))                  // Col 9: modified_at
        };
    });
}

// ==========================================================================
// 5. 介面事件綁定、篩選器與視圖切換
// ==========================================================================
function bindUIEvents() {
    // 膠囊快捷篩選按鈕
    $('[data-alert-filter]').on('click', function() {
        $('[data-alert-filter]').removeClass('active');
        $(this).addClass('active');
        appState.alertFilter = $(this).data('alert-filter');
        $('#filter-alert-type').val(appState.alertFilter);
        appState.filters.alertType = appState.alertFilter;
        onFilterStateChanged();
    });

    // 6 個獨立篩選條件變更事件監聽
    $('#filter-warehouse, #filter-product')
        .off('select2:clear')
        .on('select2:clear', function () {
            const $this =$(this);
            setTimeout(() => {
                $this.val('ALL').trigger('change');
            }, 0);
        });

    $('#filter-warehouse, #filter-product, #filter-alert-type, #filter-alert-level, #filter-status, #filter-monitored').on('change', function() {
        appState.filters.warehouse = $('#filter-warehouse').val() || 'ALL';
        appState.filters.product = $('#filter-product').val() || 'ALL';
        appState.filters.alertType = $('#filter-alert-type').val() || 'ALL';
        appState.filters.severity = $('#filter-alert-level').val() || 'ALL';
        appState.filters.status = $('#filter-status').val() || 'ALL';
        appState.filters.monitored = $('#filter-monitored').val() || 'ALL';

        // 雙向連動膠囊按鈕狀態
        $('[data-alert-filter]').removeClass('active');$(`[data-alert-filter="${appState.filters.alertType}"]`).addClass('active');

        onFilterStateChanged();
    });

    // 全選 Checkbox
    $('#check-all-alerts').on('change', function() {
        $('.alert-item-check').prop('checked', this.checked);
    });
}

/**
 * 填充 6 聯篩選工具列之動態選單 (據點與產品)
 */
function populateFilterSelectOptions() {
    // 1. 據點倉儲篩選器
    const rawWhs = Object.values(appState.warehouses || {});
    const whOptions = [
        { id: 'ALL', name: '全部據點倉儲' },
        ...rawWhs.map(w => ({
            id: w.id,
            name: `${w.name || w.id} [${w.id}]`
        }))
    ];
    UISelectOptions.core.render({
        target: '#filter-warehouse',
        data: whOptions,
        valueKey: 'id',
        textKey: 'name',
        placeholder: '全部據點倉儲',
        selectedValue: appState.filters.warehouse || 'ALL',
        searchable: true,
        onChange: (val) => {
            appState.filters.warehouse = val || 'ALL';
            onFilterStateChanged();
        }
    });

    // 2. 產品品項篩選器
    const rawPrds = Object.values(appState.products || {});
    const prdOptions = [
        { code: 'ALL', name: '全部產品品項' },
        ...rawPrds.map(p => ({
            code: p.code,
            name: `${p.short_name || p.name} [${p.code}]`
        }))
    ];
    UISelectOptions.core.render({
        target: '#filter-product',
        data: prdOptions,
        valueKey: 'code',
        textKey: 'name',
        placeholder: '全部產品品項',
        selectedValue: appState.filters.product || 'ALL',
        searchable: true,
        onChange: (val) => {
            appState.filters.product = val || 'ALL';
            onFilterStateChanged();
        }
    });
}

/**
 * 篩選狀態變更時重新計算 HUD、表格與圖表
 */
function onFilterStateChanged() {
    renderHudMetrics();
    if (appState.currentWorkspace === 'ALERTS') {
        renderAlertsDataTable();
    } else if (appState.currentWorkspace === 'THRESHOLDS') {
        renderThresholdsDataTable();
    } else if (appState.currentWorkspace === 'CHARTS') {
        renderAlertCharts();
    }
}

/**
 * 依 6 個維度條件精算告警清冊資料子集
 */
function getFilteredAlerts() {
    return appState.alerts.filter(a => {
        if (appState.filters.warehouse !== 'ALL' && a.warehouse_id !== appState.filters.warehouse) return false;
        if (appState.filters.product !== 'ALL' && a.product_id !== appState.filters.product) return false;
        if (appState.filters.alertType !== 'ALL' && a.alert_type !== appState.filters.alertType) return false;
        if (appState.filters.severity !== 'ALL' && a.alert_level !== appState.filters.severity) return false;
        if (appState.filters.status !== 'ALL' && a.status !== appState.filters.status) return false;
        if (appState.filters.monitored !== 'ALL') {
            const th = appState.thresholds.find(t => t.warehouse_id === a.warehouse_id && t.product_id === a.product_id);
            const isMon = th ? th.is_monitored : 'N';
            if (isMon !== appState.filters.monitored) return false;
        }
        return true;
    });
}

/**
 * 依 6 個維度條件精算門檻規則資料子集
 */
function getFilteredThresholds() {
    return appState.thresholds.filter(t => {
        if (appState.filters.warehouse !== 'ALL' && t.warehouse_id !== appState.filters.warehouse) return false;
        if (appState.filters.product !== 'ALL' && t.product_id !== appState.filters.product) return false;
        if (appState.filters.monitored !== 'ALL' && t.is_monitored !== appState.filters.monitored) return false;
        return true;
    });
}

/**
 * 工作區頁籤切換中樞
 */
function switchMainWorkspace(tab) {
    appState.currentWorkspace = tab;

    $('#tab-btn-alerts, #tab-btn-thresholds, #tab-btn-charts').removeClass('active');
    $('#workspace-alerts, #workspace-thresholds, #workspace-charts').addClass('d-none');

    if (tab === 'ALERTS') {
        $('#tab-btn-alerts').addClass('active');
        $('#workspace-alerts').removeClass('d-none');
        renderAlertsDataTable();
    } else if (tab === 'THRESHOLDS') {
        $('#tab-btn-thresholds').addClass('active');
        $('#workspace-thresholds').removeClass('d-none');
        renderThresholdsDataTable();
    } else if (tab === 'CHARTS') {
        $('#tab-btn-charts').addClass('active');
        $('#workspace-charts').removeClass('d-none');
        renderAlertCharts();
    }
}

function refreshView() {
    renderHudMetrics();
    renderAlertsDataTable();
    renderThresholdsDataTable();
    if (appState.currentWorkspace === 'CHARTS') {
        renderAlertCharts();
    }
}

function renderHudMetrics() {
    const alertsToCount = getFilteredAlerts();
    const thresholdsToCount = getFilteredThresholds();

    const stockout = alertsToCount.filter(a => a.alert_type === '低於安全水位').length;
    const expiring90 = alertsToCount.filter(a => a.alert_type === '90天近效期').length;
    const expiring30 = alertsToCount.filter(a => a.alert_type === '30天極危效期').length;
    const expired = alertsToCount.filter(a => a.alert_type === '已過期').length;
    const pending = alertsToCount.filter(a => a.status === '未處理').length;

    $('#stat-stockout-count').text(stockout.toLocaleString());
    $('#stat-expiry90-count').text(expiring90.toLocaleString());
    $('#stat-expiry30-count').text(expiring30.toLocaleString());
    $('#stat-expired-count').text(expired.toLocaleString());
    $('#stat-pending-count').text(pending.toLocaleString());
    $('#count-alerts-total').text(alertsToCount.length.toLocaleString());

    if ($('#count-thresholds-total').length) {
        $('#count-thresholds-total').text(thresholdsToCount.length.toLocaleString());
    }
}

// ==========================================================================
// 6. DataTables 渲染：預警清冊表 (物件資料直接載入重構)
// ==========================================================================
function renderAlertsDataTable() {
    const filtered = getFilteredAlerts();
    const formatted = filtered.map(a => formatAlertRow(a));

    if (alertsDataTableInstance) {
        alertsDataTableInstance.clear().rows.add(formatted).draw();
    } else {
        alertsDataTableInstance = $('#alertsDataTable').DataTable({
            data: formatted,
            columns: [
                { data: 'checkbox', className: 'text-center', orderable: false },
                { data: 'id' },
                { data: 'type', className: 'text-center' },
                { data: 'warehouse' },
                { data: 'product' },
                { data: 'batch' },
                { data: 'qty', className: 'text-end' },
                { data: 'days', className: 'text-end' },
                { data: 'level', className: 'text-center' },
                { data: 'status', className: 'text-center' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }
}

function formatAlertRow(a) {
    const typeBadge = UIBadges.psi.alertType(a.alert_type);
    const levelBadge = UIBadges.psi.alertLevel(a.alert_level);
    const statusBadge = UIBadges.psi.alertStatus(a.status);

    // 效期倒數天數格式化顯示
    let daysDisplay = '<span class="text-secondary">-</span>';
    if (a.days_to_expire !== null && !isNaN(a.days_to_expire)) {
        if (a.days_to_expire <= 0) {
            daysDisplay = `<span class="text-danger fw-bold"><i class="fa-solid fa-circle-xmark me-1"></i>逾期 ${Math.abs(a.days_to_expire).toLocaleString()} 天</span>`;
        } else if (a.days_to_expire <= 90) {
            daysDisplay = `<span class="text-warning fw-bold"><i class="fa-solid fa-clock me-1"></i>剩 ${a.days_to_expire.toLocaleString()} 天</span>`;
        } else {
            daysDisplay = `<span class="text-secondary">剩 ${a.days_to_expire.toLocaleString()} 天</span>`;
        }
    }

    const actionBtn = `
        <button type="button" class="btn btn-sm btn-secondary" onclick="openResolveAlertModal('${a.id}')">
            <i class="fa-solid fa-bolt me-1"></i>處置
        </button>
    `;

    return {
        checkbox: `<input type="checkbox" class="alert-item-check form-check-input" value="${a.id}">`,
        id: `<span class="fw-bold text-info-emphasis">${a.id}</span>`,
        type: typeBadge,
        warehouse: `<div><div class="text-white">${getWarehouseName(a.warehouse_id)}</div><span class="badge badge-outline-secondary-subtle small">${a.warehouse_id}</span></div>`,
        product: `<div><div class="fw-bold text-white">${getProductShortName(a.product_id)}</div><span class="small text-secondary">${a.product_id}</span></div>`,
        batch: `<div><span class="small text-light">${a.batch_no || '-'}</span><div class="small text-secondary">${a.expiry_date || '-'}</div></div>`,
        qty: `<div><span class="fw-bold text-white">${a.current_qty.toLocaleString()}</span> <span class="text-secondary small">/ 門檻 ${a.threshold_qty !== null ? a.threshold_qty.toLocaleString() : '-'}</span></div>`,
        days: daysDisplay,
        level: levelBadge,
        status: statusBadge,
        actions: actionBtn
    };
}

// ==========================================================================
// 7. DataTables 渲染與 CRUD：門檻規則表 (物件資料直接載入重構)
// ==========================================================================
function renderThresholdsDataTable() {
    const filtered = getFilteredThresholds();
    const formatted = filtered.map(t => formatThresholdRow(t));

    if (thresholdsDataTableInstance) {
        thresholdsDataTableInstance.clear().rows.add(formatted).draw();
    } else {
        thresholdsDataTableInstance = $('#thresholdsDataTable').DataTable({
            data: formatted,
            columns: [
                { data: 'id' },
                { data: 'warehouse' },
                { data: 'product' },
                { data: 'qty', className: 'text-end' },
                { data: 'monitored', className: 'text-center' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }
}

function formatThresholdRow(t) {
    const monitoredPill = UIBadges.common.boolean(t.is_monitored, '監控中', '暫停');

    const actionButtons = `
        <button type="button" class="btn btn-sm btn-outline-primary" onclick="openEditThresholdModal('${t.id}')" title="編輯規則">
            <i class="fa-solid fa-pen"></i>
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteThresholdItem('${t.id}')" title="刪除規則">
            <i class="fa-solid fa-trash-alt"></i>
        </button>
    `;

    return {
        id: `<span class="fw-bold text-info">${t.id}</span>`,
        warehouse: `<div><div class="text-white">${getWarehouseName(t.warehouse_id)}</div><span class="badge badge-outline-secondary-subtle small">${t.warehouse_id}</span></div>`,
        product: `<div><div class="fw-bold text-white">${getProductShortName(t.product_id)}</div><span class="small text-secondary">${t.product_id}</span></div>`,
        qty: `<span class="h6 fw-bold text-warning mb-0">${t.threshold_qty.toLocaleString()} 盒</span>`,
        monitored: monitoredPill,
        actions: actionButtons
    };
}

/**
 * 動態填入門檻 Modal 之下拉選單 (改接 UISelectOptions 共用模組)
 */
function populateThresholdSelectOptions() {
    const $wh = $('#fieldThresholdWarehouse');
    const $prd = $('#fieldThresholdProduct');

    UISelectOptions.warehouse.populate({
        target: '#fieldThresholdWarehouse',
        warehouses: appState.warehouses,
        displayMode: 2,
        placeholder: '-- 請選擇據點倉儲 --',
        selectedValue: $wh.val() || '',
        dropdownParent: '#thresholdModal',
        searchable: true,
        onChange: () => {
            if ($('#thresholdFormMode').val() === 'add') updateGeneratedThresholdId();
        }
    });

    UISelectOptions.product.populate({
        target: '#fieldThresholdProduct',
        products: appState.products,
        displayMode: 2,
        placeholder: '-- 請選擇產品品項 --',
        selectedValue: $prd.val() || '',
        dropdownParent: '#thresholdModal',
        searchable: true,
        grouped: true,
        onChange: () => {
            if ($('#thresholdFormMode').val() === 'add') updateGeneratedThresholdId();
        }
    });
}

function updateGeneratedThresholdId() {
    const wh = $('#fieldThresholdWarehouse').val();
    const prd = $('#fieldThresholdProduct').val();

    if (wh && prd) {
        $('#fieldThresholdId').val(`${wh}_${prd}`);
    } else {
        $('#fieldThresholdId').val('');
    }
}

function openAddThresholdModal() {
    $('#thresholdModalLabel').html('<i class="fa-solid fa-plus text-primary me-1"></i>新增安全門檻規則');
    $('#thresholdFormMode').val('add');
    $('#thresholdForm')[0].reset();

    $('#fieldThresholdId').val('');
    $('#fieldThresholdWarehouse').prop('disabled', false).val('').trigger('change');
    $('#fieldThresholdProduct').prop('disabled', false).val('').trigger('change');

    $('#fieldThresholdQty').val(0);
    $('#fieldThresholdRemarks').val('');
    $('#fieldThresholdIsMonitored').prop('checked', true);
    $('#thresholdFieldCreatedAt').val('');
    $('#thresholdFieldCreatedBy').val('');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('thresholdModal')).show();
}

function openEditThresholdModal(thresholdId) {
    const t = appState.thresholds.find(item => item.id === thresholdId);
    if (!t) return;

    $('#thresholdModalLabel').html('<i class="fa-solid fa-pen-to-square text-primary me-1"></i>編輯安全門檻規則');
    $('#thresholdFormMode').val('edit');

    $('#fieldThresholdId').val(t.id);
    $('#fieldThresholdWarehouse').val(t.warehouse_id).trigger('change').prop('disabled', true);
    $('#fieldThresholdProduct').val(t.product_id).trigger('change').prop('disabled', true);

    $('#fieldThresholdQty').val(t.threshold_qty);
    $('#fieldThresholdRemarks').val(t.remarks);
    $('#fieldThresholdIsMonitored').prop('checked', t.is_monitored === 'Y');
    $('#thresholdFieldCreatedAt').val(t.created_at);
    $('#thresholdFieldCreatedBy').val(t.created_by);

    bootstrap.Modal.getOrCreateInstance(document.getElementById('thresholdModal')).show();
}

async function saveThresholdItem() {
    const mode = $('#thresholdFormMode').val();
    const wh = $('#fieldThresholdWarehouse').val();
    const prd = $('#fieldThresholdProduct').val();
    const qtyVal = $('#fieldThresholdQty').val().trim();

    if (!wh) {
        AppToast.warning("請選擇「據點倉儲」！");
        $('#fieldThresholdWarehouse').select2('open');
        return;
    }
    if (!prd) {
        AppToast.warning("請選擇「產品品項」！");
        $('#fieldThresholdProduct').select2('open');
        return;
    }
    if (qtyVal === '' || parseInt(qtyVal, 10) < 0) {
        AppToast.warning("請填寫大於或等於 0 的「安全存量門檻盒數」！");
        $('#fieldThresholdQty').focus();
        return;
    }

    const id = `${wh}_${prd}`;
    $('#fieldThresholdId').val(id);

    if (mode === 'add') {
        const isDuplicate = appState.thresholds.some(t => t.id === id);
        if (isDuplicate) {
            AppToast.warning(`門檻規則【${id}】已存在，不可重複建立！如需修改請直接編輯既有規則。`);
            return;
        }
    }

    const qty = parseInt(qtyVal, 10) || 0;
    const remarks = $('#fieldThresholdRemarks').val().trim();
    const isMonitored = $('#fieldThresholdIsMonitored').is(':checked') ? 'Y' : 'N';

    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');
    const existing = appState.thresholds.find(t => t.id === id);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    const rowDataArray = [
        id, wh, prd, qty, isMonitored, remarks,
        createdBy, createdAt, currentUser, nowStr
    ];

    const updatedObj = {
        id: id,
        warehouse_id: wh,
        product_id: prd,
        threshold_qty: qty,
        is_monitored: isMonitored,
        remarks: remarks,
        created_by: createdBy,
        created_at: createdAt,
        modified_by: currentUser,
        modified_at: nowStr
    };

    const $btn = $('button[onclick="saveThresholdItem()"]');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i>寫入中...');

        if (mode === 'add') {
            await SheetAdapter.createRow(SHEET_NAMES.THRESHOLDS, id, rowDataArray, GAS_DEPLOY_ID.PSI);
            appState.thresholds.unshift(updatedObj);
        } else {
            await SheetAdapter.updateRow(SHEET_NAMES.THRESHOLDS, id, rowDataArray, GAS_DEPLOY_ID.PSI);
            const index = appState.thresholds.findIndex(t => t.id === id);
            if (index !== -1) appState.thresholds[index] = updatedObj;
        }

        refreshView();
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('thresholdModal'));
        if (modalInstance) modalInstance.hide();

        AppToast.success(`門檻規則【${id}】儲存成功！`);
    } catch (err) {
        AppToast.error("門檻寫入失敗: " + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i>儲存');
    }
}

async function deleteThresholdItem(thresholdId) {
    const confirmed = await AppDialog.confirm(`確定要自 Google 試算表中永久刪除門檻規則【${thresholdId}】嗎？`, {
        title: '刪除門檻規則確認',
        confirmText: '確定刪除',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    try {
        await SheetAdapter.deleteRow(SHEET_NAMES.THRESHOLDS, thresholdId, GAS_DEPLOY_ID.PSI);
        appState.thresholds = appState.thresholds.filter(t => t.id !== thresholdId);
        refreshView();
        AppToast.success(`門檻規則【${thresholdId}】已成功刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗: " + err.message);
    }
}

// ==========================================================================
// 8. 告警處置回寫 (psi_alerts 表 308)
// ==========================================================================
function openResolveAlertModal(alertId) {
    const a = appState.alerts.find(item => item.id === alertId);
    if (!a) return;

    $('#resolveAlertId').val(a.id);
    $('#resolveAlertItemText').text(`${getProductShortName(a.product_id)} (${a.product_id})`);
    $('#resolveAlertWhText').text(`${getWarehouseName(a.warehouse_id)} (${a.warehouse_id})`);
    $('#resolveAlertSuggestedText').text(a.remarks || '常規調撥備貨防線');
    $('#resolveStatusSelect').val(a.status || '已知悉');
    $('#resolveRemarksInput').val('');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('resolveAlertModal')).show();
}

async function saveAlertResolution() {
    const alertId = $('#resolveAlertId').val();
    const alertItem = appState.alerts.find(a => a.id === alertId);
    if (!alertItem) return;

    const newStatus = $('#resolveStatusSelect').val();
    const userRemarks = $('#resolveRemarksInput').val().trim();
    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');

    const updatedRemarks = userRemarks 
        ? (alertItem.remarks ? `${alertItem.remarks} ‧ [處置：${userRemarks}]` : userRemarks)
        : alertItem.remarks;

    const rowDataArray = [
        alertItem.id, alertItem.alert_type, alertItem.warehouse_id, alertItem.product_id,
        alertItem.stock_id || '', alertItem.batch_no || '', alertItem.expiry_date || '',
        alertItem.current_qty, alertItem.threshold_qty ?? '', alertItem.days_to_expire ?? '',
        alertItem.alert_level, newStatus, updatedRemarks,
        currentUser, nowStr, alertItem.created_by, alertItem.created_at,
        currentUser, nowStr
    ];

    try {
        await SheetAdapter.updateRow(SHEET_NAMES.ALERTS, alertId, rowDataArray, GAS_DEPLOY_ID.PSI);
        
        alertItem.status = newStatus;
        alertItem.remarks = updatedRemarks;
        alertItem.resolved_by = currentUser;
        alertItem.resolved_at = nowStr;
        alertItem.modified_by = currentUser;
        alertItem.modified_at = nowStr;

        refreshView();
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('resolveAlertModal'));
        if (modalInstance) modalInstance.hide();

        AppToast.success(`告警【${alertId}】處置狀態已更新為【${newStatus}】！`);
    } catch (err) {
        AppToast.error("告警處置失敗: " + err.message);
    }
}

async function triggerBatchResolve() {
    const checkedBoxes = $('.alert-item-check:checked');
    if (checkedBoxes.length === 0) {
        AppToast.warning("請先勾選欲處置之告警項目！");
        return;
    }

    const confirmed = await AppDialog.confirm(`確定要將已選取的 ${checkedBoxes.length} 筆告警批次標記為【已知悉】嗎？`, {
        title: '批次知悉處理確認',
        confirmText: '確定知悉',
        confirmClass: 'btn-purple'
    });
    if (!confirmed) return;

    AppLoading.show("批次處置中...", "正在回寫試算表");
    try {
        const currentUser = getCurrentUser();
        const nowStr = AppDate.now('full');

        for (let i = 0; i < checkedBoxes.length; i++) {
            const alertId = $(checkedBoxes[i]).val();
            const a = appState.alerts.find(item => item.id === alertId);
            if (a) {
                a.status = '已知悉';
                a.resolved_by = currentUser;
                a.resolved_at = nowStr;
                a.modified_by = currentUser;
                a.modified_at = nowStr;

                const rowDataArray = [
                    a.id, a.alert_type, a.warehouse_id, a.product_id, a.stock_id || '',
                    a.batch_no || '', a.expiry_date || '', a.current_qty, a.threshold_qty ?? '',
                    a.days_to_expire ?? '', a.alert_level, a.status, a.remarks || '',
                    a.resolved_by, a.resolved_at, a.created_by, a.created_at,
                    a.modified_by, a.modified_at
                ];
                await SheetAdapter.updateRow(SHEET_NAMES.ALERTS, alertId, rowDataArray, GAS_DEPLOY_ID.PSI);
            }
        }
        refreshView();
        AppToast.success(`已完成 ${checkedBoxes.length} 筆告警之批次知悉簽核！`);
    } catch (err) {
        AppToast.error("批次處置失敗: " + err.message);
    } finally {
        AppLoading.hide();
    }
}

// ==========================================================================
// 9. 統計圖表渲染引擎 (8 張戰術分析圖 + 1 張複合圖表)
// ==========================================================================
function renderAlertCharts() {
    const filteredAlerts = getFilteredAlerts();
    const filteredThresholds = getFilteredThresholds();

    // ======================================================================
    // 區塊 A：結構分佈分析 (4 張甜甜圈環形圖)
    // ======================================================================
    // 1. 預警類型結構分佈 (甜甜圈環形圖 + 中央 KPI 注入)
    const typeCounts = {};
    filteredAlerts.forEach(a => {
        typeCounts[a.alert_type] = (typeCounts[a.alert_type] || 0) + 1;
    });

    AppChart.render('chartAlertType', AppChart.createDoughnut({
        labels: Object.keys(typeCounts),
        data: Object.values(typeCounts),
        colors: ['#f97316', '#eab308', '#ef4444', '#a855f7', '#38bdf8'],
        unit: '件',
        centerKpi: { label: '告警總件數', value: `${filteredAlerts.length.toLocaleString()} 件` }
    }));

    // 2. 嚴重性等級佔比 (由 pie 升級為 doughnut)
    const levels = { '緊急': 0, '注意': 0, '一般': 0 };
    filteredAlerts.forEach(a => {
        if (levels[a.alert_level] !== undefined) levels[a.alert_level]++;
    });

    AppChart.render('chartAlertSeverity', AppChart.createDoughnut({
        labels: ['緊急', '注意', '一般'],
        data: [levels['緊急'], levels['注意'], levels['一般']],
        colors: ['#ef4444', '#f59e0b', '#38bdf8'],
        unit: '件'
    }));

    // 3. 處置狀態進度佔比 (甜甜圈環形圖)
    const statusCounts = {};
    filteredAlerts.forEach(a => {
        statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    });

    AppChart.render('chartAlertStatus', AppChart.createDoughnut({
        labels: Object.keys(statusCounts),
        data: Object.values(statusCounts),
        colors: ['#64748b', '#0ea5e9', '#10b981', '#a855f7'],
        unit: '件'
    }));

    // 4. 門檻即時監控狀態佔比 (由 pie 升級為 doughnut)
    const activeCount = filteredThresholds.filter(t => t.is_monitored === 'Y').length;
    const pausedCount = filteredThresholds.filter(t => t.is_monitored === 'N').length;

    AppChart.render('chartMonitoredRatio', AppChart.createDoughnut({
        labels: ['啟動監控中', '暫停掃描'],
        data: [activeCount, pausedCount],
        colors: ['#10b981', '#64748b'],
        unit: '組'
    }));

    // ======================================================================
    // 區塊 B：長條統計與排行 (4 張長條圖)
    // ======================================================================
    // 5. 各據點倉儲預警案件數量分佈 (垂直長條圖)
    const whMap = {};
    filteredAlerts.forEach(a => {
        const name = getWarehouseName(a.warehouse_id);
        whMap[name] = (whMap[name] || 0) + 1;
    });

    AppChart.render('chartWarehouseAlerts', AppChart.createBar({
        labels: Object.keys(whMap),
        data: Object.values(whMap),
        datasetLabel: '預警次數',
        colors: '#8b5cf6',
        isHorizontal: false,
        unit: '件',
        yStepInteger: true
    }));

    // 6. Top 8 高頻告警品項排行 (水平長條圖)
    const prdMap = {};
    filteredAlerts.forEach(a => {
        const name = getProductShortName(a.product_id);
        prdMap[name] = (prdMap[name] || 0) + 1;
    });
    const sortedPrd = Object.entries(prdMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

    AppChart.render('chartProductAlerts', AppChart.createBar({
        labels: sortedPrd.map(i => i[0]),
        data: sortedPrd.map(i => i[1]),
        datasetLabel: '告警次數',
        colors: '#f59e0b',
        isHorizontal: true,
        unit: '次',
        yStepInteger: true
    }));

    // 7. 效期剩餘天數區間分佈 (垂直長條圖)
    const agingBuckets = { '已逾期 (<=0天)': 0, '1~30天極危': 0, '31~60天警戒': 0, '61~90天注意': 0, '90天以上常態': 0 };
    filteredAlerts.forEach(a => {
        const d = a.days_to_expire;
        if (d === null || isNaN(d)) return;
        if (d <= 0) agingBuckets['已逾期 (<=0天)']++;
        else if (d <= 30) agingBuckets['1~30天極危']++;
        else if (d <= 60) agingBuckets['31~60天警戒']++;
        else if (d <= 90) agingBuckets['61~90天注意']++;
        else agingBuckets['90天以上常態']++;
    });

    AppChart.render('chartExpiryAging', AppChart.createBar({
        labels: Object.keys(agingBuckets),
        data: Object.values(agingBuckets),
        datasetLabel: '批號筆數',
        colors: ['#ef4444', '#f43f5e', '#f97316', '#eab308', '#10b981'],
        isHorizontal: false,
        unit: '筆',
        yStepInteger: true
    }));

    // 8. 低於水位缺口深度排行 (水平長條圖)
    const gaps = filteredAlerts
        .filter(a => a.alert_type === '低於安全水位' && a.threshold_qty !== null)
        .map(a => {
            const diff = Math.max(0, (a.threshold_qty || 0) - a.current_qty);
            return {
                label: `${getProductShortName(a.product_id)} (${getWarehouseName(a.warehouse_id)})`,
                gap: diff
            };
        })
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 6);

    AppChart.render('chartStockGapDepth', AppChart.createBar({
        labels: gaps.length ? gaps.map(g => g.label) : ['目前無缺口'],
        data: gaps.length ? gaps.map(g => g.gap) : [0],
        datasetLabel: '缺口盒數',
        colors: '#ef4444',
        isHorizontal: true,
        unit: '盒',
        yStepInteger: true
    }));

    // ======================================================================
    // 區塊 C：各項產品庫存滿足率與安全警戒線對比圖 (Mixed Charts)
    // 結構：堆疊柱狀圖 (現有安全現貨 + 預扣鎖定現貨) + 警戒折線 (最低安全存量)
    // ======================================================================
    const prdCodeList = appState.filters.product !== 'ALL'
        ? [appState.filters.product]
        : (Object.keys(appState.products).length > 0
            ? Object.keys(appState.products)
            : [...new Set([...filteredThresholds.map(t => t.product_id), ...filteredAlerts.map(a => a.product_id)])]);

    const labels = prdCodeList.map(code => getProductShortName(code));
    const safeStockData = [];
    const reservedStockData = [];
    const thresholdLineData = [];

    prdCodeList.forEach(code => {
        // 累計各據點為該產品設定之安全門檻盒數 (監控中)
        const prdThresholds = filteredThresholds.filter(t => t.product_id === code && t.is_monitored === 'Y');
        const totalThreshold = prdThresholds.reduce((sum, t) => sum + (Number(t.threshold_qty) || 0), 0);
        thresholdLineData.push(totalThreshold);

        // 累計該產品在庫現有安全現貨與品質/代領預扣鎖定現貨
        const prdAlerts = filteredAlerts.filter(a => a.product_id === code);
        let lockedQty = 0;
        let currentSafeQty = 0;

        prdAlerts.forEach(a => {
            if (a.alert_type === '品質鎖定') {
                lockedQty += (Number(a.current_qty) || 0);
            } else {
                currentSafeQty += (Number(a.current_qty) || 0);
            }
        });

        safeStockData.push(currentSafeQty);
        reservedStockData.push(lockedQty);
    });

    // 透過 AppChart.calcCeil5Max 動態計算 Y 軸最高點，向上取整至 5 的倍數
    const allValues = [...safeStockData.map((v, i) => v + reservedStockData[i]), ...thresholdLineData];
    const yMax = AppChart.calcCeil5Max(allValues, 10);

    AppChart.render('chartWarehouseSafetyFulfillment', {
        data: {
            labels,
            datasets: [
                {
                    type: 'line',
                    label: '最低安全存量警戒線 (Safety Line)',
                    data: thresholdLineData,
                    borderColor: '#ef4444',
                    backgroundColor: '#ef4444',
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#ef4444',
                    pointBorderWidth: 2,
                    fill: false,
                    tension: 0,
                    order: 1
                },
                {
                    type: 'bar',
                    label: '現有安全現貨 (Safe Stock)',
                    data: safeStockData,
                    backgroundColor: '#38bdf8',
                    stack: 'stockStack',
                    borderRadius: 4,
                    order: 2
                },
                {
                    type: 'bar',
                    label: '預扣鎖定現貨 (Reserved / Hold)',
                    data: reservedStockData,
                    backgroundColor: '#f59e0b',
                    stack: 'stockStack',
                    borderRadius: 4,
                    order: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    ticks: { color: AppChart.tokens.text, font: { size: 12 } },
                    grid: { color: AppChart.tokens.grid }
                },
                y: {
                    stacked: false,
                    beginAtZero: true,
                    max: yMax,
                    title: {
                        display: true,
                        text: '存量盒數 (盒)',
                        color: AppChart.tokens.text,
                        font: { size: 12, weight: 'bold' }
                    },
                    ticks: {
                        stepSize: 1,
                        precision: 0,
                        color: AppChart.tokens.text,
                        font: { size: 12 },
                        callback: v => `${Number(v).toLocaleString()} 盒`
                    },
                    grid: { color: AppChart.tokens.grid }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: AppChart.tokens.text, font: { size: 12 }, boxWidth: 10 }
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            const val = Number(ctx.parsed.y) || 0;
                            const dsLabel = ctx.dataset.label || '';
                            return ` ${dsLabel}：${val.toLocaleString()} 盒`;
                        },
                        afterBody: function (ctxItems) {
                            if (!ctxItems || ctxItems.length === 0) return '';
                            const idx = ctxItems[0].dataIndex;
                            const prdName = labels[idx];
                            const totalAvailable = safeStockData[idx] + reservedStockData[idx];
                            const threshold = thresholdLineData[idx];
                            if (threshold > 0 && totalAvailable < threshold) {
                                const gap = threshold - totalAvailable;
                                return `\n⚠️ 戰術警報：【${prdName}】總庫存跌破安全線 (短缺 ${gap.toLocaleString()} 盒)，已自動觸發進貨提單流程！`;
                            }
                            return `\n✅ 戰術狀態：【${prdName}】庫存充裕，高於安全警戒線。`;
                        }
                    }
                }
            }
        }
    });
}