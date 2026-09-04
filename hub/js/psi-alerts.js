// ==========================================================================
// 1. Google 雲端試算表設定與常數定義
// ==========================================================================
const SPREADSHEET_ID = "1_plHUdfzIublSv1apN5qQ5reO6YxqBkI1MdnQeDbAxo";            // 主試算表 (表 308 預警、表 310 門檻、表 301 倉儲)
const SPREADSHEET_ID_PRD = "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I";        // 獨立產品主檔試算表 (表 101 prd_items)
const GAS_DEPLOY_ID = "AKfycbx3vDysJBLkmscZG8Jonv6EMyHLzmb-AjxfDqzjOSiGD-8oInz8UowbLLJRKVbbxPVt";
const SHEET_PRODUCTS = "產品主檔";   // 表 101: prd_items
const SHEET_WAREHOUSES = "據點倉儲"; // 表 301: psi_warehouses
const SHEET_ALERTS = "庫存預警";     // 表 308: psi_alerts
const SHEET_THRESHOLDS = "安全門檻"; // 表 310: psi_safety_thresholds

/**
 * 試算表欄位索引安全取值工具函式 (0-Based 絕對物理順序)
 */
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
        return String(row[colIndex]).trim();
    }
    return defaultVal;
}

function getCurrentUser() {
    const rawSession = localStorage.getItem('ray_team_auth_session');
    if (!rawSession) return 'ADMIN';
    try {
        const session = JSON.parse(rawSession);
        return session.userName || session.user || 'ADMIN';
    } catch (e) {
        return 'ADMIN';
    }
}

function getCurrentUserEmail() {
    const rawSession = localStorage.getItem('ray_team_auth_session');
    if (!rawSession) return 'jarvis20250807@gmail.com';
    try {
        const session = JSON.parse(rawSession);
        return (session.user || '').toLowerCase().trim();
    } catch (e) {
        return 'jarvis20250807@gmail.com';
    }
}

function getFormattedNow() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 取得據點中文名稱
 */
function getWarehouseName(whId) {
    if (!whId) return '-';
    return appState.warehouses[whId]?.name || whId;
}

/**
 * 取得產品簡稱 (優先 short_name，次之完整 name)
 */
function getProductShortName(prdId) {
    if (!prdId) return '-';
    return appState.products[prdId]?.short_name || appState.products[prdId]?.name || prdId;
}

// ==========================================================================
// 2. 系統狀態管理 (State Management)
// ==========================================================================
let appState = {
    alerts: [],
    thresholds: [],
    warehouses: {}, // 格式: { [id]: { id, name } }
    products: {},   // 格式: { [code]: { code, name, short_name } }
    currentWorkspace: 'ALERTS', // 'ALERTS' | 'THRESHOLDS'
    alertFilter: 'ALL'
};

let alertsDataTableInstance = null;
let thresholdsDataTableInstance = null;
let isInitialized = false;

// ==========================================================================
// 3. 生命週期與初始化 (對齊 common.js 共用規範)
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(GAS_DEPLOY_ID);
    }
    await initAlertsApp();
    applyUIPermissions();
});

async function initAlertsApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindUIEvents();
    await fetchGoogleSheetsData();
}

function isMasterAdmin() {
    const rawSession = localStorage.getItem('ray_team_auth_session');
    if (!rawSession) return false;
    try {
        const session = JSON.parse(rawSession);
        const adminEmails = [
            "jarvis20250807@gmail.com",
            "fish7548@gmail.com"
        ];
        return adminEmails.includes((session.user || '').toLowerCase().trim());
    } catch (e) {
        return false;
    }
}

function applyUIPermissions() {
    const hasAdminRights = isMasterAdmin();
    if (!hasAdminRights) {
        $('#btnOpenAddThreshold').hide();
        $('.admin-action-btn').addClass('disabled').prop('disabled', true);
    }
}

// ==========================================================================
// 4. 資料讀取引擎：PapaParse 0-Based 順序解析，無假資料注入
// ==========================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步預警與主檔資料...', '連線 Google 試算表');
    try {
        // 擴充支援傳入特定試算表 ID (預設為 SPREADSHEET_ID)
        const fetchSheet = async (sheetName, targetSpreadsheetId = SPREADSHEET_ID) => {
            const url = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP 錯誤碼: ${res.status}`);
            const text = await res.text();

            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return (parsed.data || []).slice(1);
        };

        // 並行獲取預警表、門檻表、據點表，以及來自另一試算表的產品主檔
        const [rawAlertRows, rawThresholdRows, rawWhRows, rawPrdRows] = await Promise.all([
            fetchSheet(SHEET_ALERTS).catch(() => []),
            fetchSheet(SHEET_THRESHOLDS).catch(() => []),
            fetchSheet(SHEET_WAREHOUSES).catch(() => []),
            fetchSheet(SHEET_PRODUCTS, SPREADSHEET_ID_PRD).catch(() => []) // 指向獨立產品主檔試算表
        ]);

        // 1. 解析據點主檔 (表 301)
        appState.warehouses = {};
        (rawWhRows || []).forEach(r => {
            const id = getVal(r, 0);   // Col 0: id
            const name = getVal(r, 1); // Col 1: warehouse_name
            const type = getVal(r, 2);     // Col 2: warehouse_type ('自用常備倉','海外商務倉','官方營運中心','物流在途倉')
            if (id) {
                appState.warehouses[id] = { id, name: name || id, type };
            }
        });

        // 2. 解析產品主檔 (表 101 prd_items)
        appState.products = {};
        (rawPrdRows || []).forEach(r => {
           const code = getVal(r, 0);       // Col 0: product_code (PK)
            const region = getVal(r, 1, 'TW').toUpperCase(); // Col 1: region_code ('TW' / 'MY')
            const name = getVal(r, 3);       // Col 3: name (官方完整中文品名)
            const shortName = getVal(r, 4);  // Col 4: short_name (產品簡稱)
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

        // 刷新 Select2 選單與 DataTables 視圖
        populateThresholdSelectOptions();
        refreshView();
        AppToast.success(`同步完成：${appState.alerts.length} 筆預警、${appState.thresholds.length} 組門檻規則`);
    } catch (err) {
        console.error("Google Sheets 同步失敗:", err);
        appState.alerts = [];
        appState.thresholds = [];
        refreshView();
        AppToast.error(`資料同步異常: ${err.message}`);
    } finally {
        AppLoading.hide();
    }
}

/**
 * 依據表 308 (psi_alerts) 物理順序解析 (Index 0 ~ 18)
 */
function parseAlertsTable(rows) {
    const todayStr = getFormattedNow().slice(0, 10).replace(/-/g, '');
    return rows.map((r, idx) => {
        return {
            id: getVal(r, 0, `ALT-${todayStr}-${String(idx + 1).padStart(4, '0')}`), // Col 0: id (PK)
            alert_type: getVal(r, 1, '低於安全水位'),                      // Col 1: alert_type
            warehouse_id: getVal(r, 2, ''),                               // Col 2: warehouse_id (FK)
            product_id: getVal(r, 3, ''),                                 // Col 3: product_id (FK)
            stock_id: getVal(r, 4, ''),                                   // Col 4: stock_id (FK)
            batch_no: getVal(r, 5, '-'),                                  // Col 5: batch_no
            expiry_date: getVal(r, 6, '-'),                               // Col 6: expiry_date
            current_qty: parseInt(getVal(r, 7, '0'), 10) || 0,            // Col 7: current_qty
            threshold_qty: getVal(r, 8) !== '' ? parseInt(getVal(r, 8), 10) : null, // Col 8: threshold_qty
            days_to_expire: getVal(r, 9) !== '' ? parseInt(getVal(r, 9), 10) : null, // Col 9: days_to_expire
            alert_level: getVal(r, 10, '注意'),                           // Col 10: alert_level ('一般','注意','緊急')
            status: getVal(r, 11, '未處理'),                               // Col 11: status
            remarks: getVal(r, 12, ''),                                   // Col 12: remarks (系統建議)
            resolved_by: getVal(r, 13, ''),                               // Col 13: resolved_by
            resolved_at: getVal(r, 14, ''),                               // Col 14: resolved_at
            created_by: getVal(r, 15, 'SYSTEM'),                          // Col 15: created_by
            created_at: getVal(r, 16, getFormattedNow()),                 // Col 16: created_at
            modified_by: getVal(r, 17, 'SYSTEM'),                         // Col 17: modified_by
            modified_at: getVal(r, 18, getFormattedNow())                 // Col 18: modified_at
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
            created_at: getVal(r, 7, getFormattedNow()),                  // Col 7: created_at
            modified_by: getVal(r, 8, 'SYSTEM'),                          // Col 8: modified_by
            modified_at: getVal(r, 9, getFormattedNow())                  // Col 9: modified_at
        };
    });
}

// ==========================================================================
// 5. 介面事件綁定與視圖渲染中樞
// ==========================================================================
function bindUIEvents() {
    $('[data-alert-filter]').on('click', function() {
        $('[data-alert-filter]').removeClass('active');
        $(this).addClass('active');
        appState.alertFilter = $(this).data('alert-filter');
        filterAlertsTable();
    });

    $('#check-all-alerts').on('change', function() {
        $('.alert-item-check').prop('checked', this.checked);
    });
}

function switchMainWorkspace(tab) {
    appState.currentWorkspace = tab;
    if (tab === 'ALERTS') {
        $('#tab-btn-alerts').addClass('active');
        $('#tab-btn-thresholds').removeClass('active');
        $('#workspace-alerts').removeClass('d-none');
        $('#workspace-thresholds').addClass('d-none');
    } else {
        $('#tab-btn-thresholds').addClass('active');
        $('#tab-btn-alerts').removeClass('active');
        $('#workspace-thresholds').removeClass('d-none');
        $('#workspace-alerts').addClass('d-none');
        renderThresholdsDataTable();
    }
}

function refreshView() {
    renderHudMetrics();
    renderAlertsDataTable();
    renderThresholdsDataTable();
    applyUIPermissions();
}

function renderHudMetrics() {
    const stockout = appState.alerts.filter(a => a.alert_type === '低於安全水位').length;
    const expiring = appState.alerts.filter(a => a.alert_type.includes('效期') || a.days_to_expire <= 90).length;
    const monitored = appState.thresholds.filter(t => t.is_monitored === 'Y').length;
    const pending = appState.alerts.filter(a => a.status === '未處理').length;

    $('#stat-stockout-count').text(stockout);
    $('#stat-expiry-count').text(expiring);
    $('#stat-monitored-rules').text(monitored);
    $('#stat-pending-count').text(pending);

    $('#count-alerts-total').text(appState.alerts.length);
    $('#count-thresholds-total').text(appState.thresholds.length);
}

// ==========================================================================
// 6. DataTables 渲染：預警清冊表 (psi_alerts)
// ==========================================================================
function renderAlertsDataTable() {
    const formatted = appState.alerts.map(a => formatAlertRow(a));

    if (alertsDataTableInstance) {
        alertsDataTableInstance.clear();
        alertsDataTableInstance.rows.add(formatted);
        alertsDataTableInstance.draw();
    } else {
        alertsDataTableInstance = $('#alertsDataTable').DataTable({
            data: formatted,
            columns: [
                { data: 'checkbox' },
                { data: 'id' },
                { data: 'type' },
                { data: 'warehouse' },
                { data: 'product' },
                { data: 'batch' },
                { data: 'qty' },
                { data: 'days' },
                { data: 'level' },
                { data: 'status' },
                { data: 'actions' }
            ]
        });
    }
    filterAlertsTable();
}

function filterAlertsTable() {
    if (!alertsDataTableInstance) return;
    if (appState.alertFilter === 'ALL') {
        alertsDataTableInstance.column(2).search('').draw();
    } else {
        alertsDataTableInstance.column(2).search(appState.alertFilter).draw();
    }
}

function formatAlertRow(a) {
    const hasAdminRights = isMasterAdmin();

    // 改接 UIBadges.stockAlert 核心模組
    const typeBadge = UIBadges.stockAlert.type(a.alert_type);
    const levelBadge = UIBadges.stockAlert.level(a.alert_level);
    const statusBadge = UIBadges.stockAlert.status(a.status);

    // 效期倒數顯示
    let daysDisplay = '<span class="text-secondary">-</span>';
    if (a.days_to_expire !== null && !isNaN(a.days_to_expire)) {
        if (a.days_to_expire <= 0) {
            daysDisplay = `<span class="text-danger fw-bold"><i class="fa-solid fa-circle-xmark"></i> 逾期 ${Math.abs(a.days_to_expire)} 天</span>`;
        } else if (a.days_to_expire <= 90) {
            daysDisplay = `<span class="text-warning fw-bold"><i class="fa-solid fa-clock"></i> 剩 ${a.days_to_expire} 天</span>`;
        } else {
            daysDisplay = `<span class="text-secondary">剩 ${a.days_to_expire} 天</span>`;
        }
    }

    const actionBtn = hasAdminRights ? `
        <button class="btn btn-sm btn-secondary" onclick="openResolveAlertModal('${a.id}')">
            <i class="fa-solid fa-bolt"></i> 處置
        </button>
    ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>';

    return {
        checkbox: `<input type="checkbox" class="alert-item-check form-check-input" value="${a.id}">`,
        id: `<span class="fw-bold text-info">${a.id}</span>`,
        type: typeBadge,
        warehouse: `<div><div class="text-white">${getWarehouseName(a.warehouse_id)}</div><span class="badge badge-outline-cyan small">${a.warehouse_id}</span></div>`,
        product: `<div><div class="fw-bold text-white">${getProductShortName(a.product_id)}</div><span class="small text-secondary">${a.product_id}</span></div>`,
        batch: `<div><span class="small text-light">${a.batch_no || '-'}</span><div class="small text-secondary">${a.expiry_date || '-'}</div></div>`,
        qty: `<div><span class="fw-bold text-white">${a.current_qty}</span> <span class="text-secondary small">/ 門檻 ${a.threshold_qty ?? '-'}</span></div>`,
        days: daysDisplay,
        level: levelBadge,
        status: statusBadge,
        actions: actionBtn
    };
}

// ==========================================================================
// 7. DataTables 渲染與 CRUD：門檻規則表 (psi_safety_thresholds)
// ==========================================================================
function renderThresholdsDataTable() {
    const formatted = appState.thresholds.map(t => formatThresholdRow(t));

    if (thresholdsDataTableInstance) {
        thresholdsDataTableInstance.clear();
        thresholdsDataTableInstance.rows.add(formatted);
        thresholdsDataTableInstance.draw();
    } else {
        thresholdsDataTableInstance = $('#thresholdsDataTable').DataTable({
            data: formatted,
            columns: [
                { data: 'id' },
                { data: 'warehouse' },
                { data: 'product' },
                { data: 'qty' },
                { data: 'monitored' },
                { data: 'actions' }
            ]
        });
    }
}

function formatThresholdRow(t) {
    const hasAdminRights = isMasterAdmin();
    const monitoredPill = UIBadges.common.boolean(t.is_monitored, '監控中', '暫停');

    const actionButtons = hasAdminRights ? `
        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="openEditThresholdModal('${t.id}')" title="編輯規則">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-outline-danger" onclick="deleteThresholdItem('${t.id}')" title="刪除規則">
                <i class="fa-solid fa-trash-alt"></i>
            </button>
        </div>
    ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>';

    return {
        id: `<span class="fw-bold text-info">${t.id}</span>`,
        warehouse: `<div><div class="text-white">${getWarehouseName(t.warehouse_id)}</div><span class="badge badge-outline-cyan small">${t.warehouse_id}</span></div>`,
        product: `<div><div class="fw-bold text-white">${getProductShortName(t.product_id)}</div><span class="small text-secondary">${t.product_id}</span></div>`,
        qty: `<span class="h6 fw-bold text-warning mb-0">${t.threshold_qty} 盒</span>`,
        monitored: monitoredPill,
        actions: actionButtons
    };
}

/**
 * 取得倉儲類型排序權重 (自用 -> 海外 -> 官方 -> 物流)
 */
function getWarehouseTypeOrder(type = '') {
    const t = String(type).trim().toUpperCase();
    if (t.includes('自用') || t === 'PRIVATE_HUB') return 1;
    if (t.includes('海外') || t === 'TRANSIT_OVERSEAS') return 2;
    if (t.includes('官方') || t === 'OFFICIAL_CENTER') return 3;
    if (t.includes('物流') || t === 'LOGISTICS_IN_TRANSIT') return 4;
    return 99;
}

/**
 * 動態填入門檻 Modal 之 Select2 下拉選單 (據點名稱與產品簡稱)
 */
function populateThresholdSelectOptions() {
    const $whSelect = $('#fieldThresholdWarehouse');
    const $prdSelect = $('#fieldThresholdProduct');

    // 1. 倉儲選單排序：自用 -> 海外 -> 官方 -> 物流
    const sortedWarehouses = Object.values(appState.warehouses).sort((a, b) => {
        const orderA = getWarehouseTypeOrder(a.type);
        const orderB = getWarehouseTypeOrder(b.type);
        if (orderA !== orderB) return orderA - orderB;
        return a.id.localeCompare(b.id);
    });

    $whSelect.empty().append('<option value="">-- 請選擇據點倉儲 --</option>');
    sortedWarehouses.forEach(wh => {
        const typeBadgeText = wh.type ? ` [${wh.type}]` : '';
        $whSelect.append(`<option value="${wh.id}">${wh.name} (${wh.id})${typeBadgeText}</option>`);
    });

    // 2. 產品選單分類：TW、MY 分組
    $prdSelect.empty().append('<option value="">-- 請選擇產品品項 --</option>');

    const twProducts = [];
    const myProducts = [];
    const otherProducts = [];

    Object.values(appState.products).forEach(prd => {
        if (prd.region === 'TW') twProducts.push(prd);
        else if (prd.region === 'MY') myProducts.push(prd);
        else otherProducts.push(prd);
    });

    // 排序各群組產品 (依品號升冪)
    const sortByCode = (a, b) => a.code.localeCompare(b.code);
    twProducts.sort(sortByCode);
    myProducts.sort(sortByCode);

    if (twProducts.length > 0) {
        const $twGroup = $('<optgroup label="🇹🇼 台灣"></optgroup>');
        twProducts.forEach(prd => {
            $twGroup.append(`<option value="${prd.code}">${prd.short_name} (${prd.code})</option>`);
        });
        $prdSelect.append($twGroup);
    }

    if (myProducts.length > 0) {
        const $myGroup = $('<optgroup label="🇲🇾 馬來西亞"></optgroup>');
        myProducts.forEach(prd => {
            $myGroup.append(`<option value="${prd.code}">${prd.short_name} (${prd.code})</option>`);
        });
        $prdSelect.append($myGroup);
    }

    if (otherProducts.length > 0) {
        const $otherGroup = $('<optgroup label="🌐 其他"></optgroup>');
        otherProducts.forEach(prd => {
            $otherGroup.append(`<option value="${prd.code}">${prd.short_name} (${prd.code})</option>`);
        });
        $prdSelect.append($otherGroup);
    }

    initThresholdSelect2();
}

/**
 * 依據當前選擇的倉儲與產品，自動生成門檻主鍵 (PK: {warehouse_id}_{product_id})
 */
function updateGeneratedThresholdId() {
    const wh = $('#fieldThresholdWarehouse').val();
    const prd = $('#fieldThresholdProduct').val();

    if (wh && prd) {
        $('#fieldThresholdId').val(`${wh}_${prd}`);
    } else {
        $('#fieldThresholdId').val('');
    }
}

/**
 * 初始化門檻視窗之 Select2
 */
function initThresholdSelect2() {
    if (!$.fn.select2) return;

    const $wh = $('#fieldThresholdWarehouse');
    const $prd = $('#fieldThresholdProduct');

    $wh.select2({
        theme: 'default',
        dropdownParent: $('#thresholdModal'),
        width: '100%',
        placeholder: '-- 請選擇據點倉儲 --',
        allowClear: true
    });

    $prd.select2({
        theme: 'default',
        dropdownParent: $('#thresholdModal'),
        width: '100%',
        placeholder: '-- 請選擇產品品項 --',
        allowClear: true
    });

    // 監聽變更事件以即時自動生成 ID
    $wh.off('change.autoId').on('change.autoId', function() {
        if ($('#thresholdFormMode').val() === 'add') {
            updateGeneratedThresholdId();
        }
    });

    $prd.off('change.autoId').on('change.autoId', function() {
        if ($('#thresholdFormMode').val() === 'add') {
            updateGeneratedThresholdId();
        }
    });
}

/**
 * 開啟新增門檻 Modal
 */
function openAddThresholdModal() {
    $('#thresholdModalLabel').html('<i class="fa-solid fa-plus text-primary"></i> 新增安全門檻規則');
    $('#thresholdFormMode').val('add');
    $('#thresholdForm')[0].reset();

    // 主鍵由系統生成，維持 readonly
    $('#fieldThresholdId').val('');

    // 新增時開放選擇據點與產品
    $('#fieldThresholdWarehouse').prop('disabled', false).val('').trigger('change');
    $('#fieldThresholdProduct').prop('disabled', false).val('').trigger('change');

    $('#fieldThresholdQty').val(0);
    $('#fieldThresholdRemarks').val('');
    $('#fieldThresholdIsMonitored').prop('checked', true);
    $('#thresholdFieldCreatedAt').val('');
    $('#thresholdFieldCreatedBy').val('');

    new bootstrap.Modal(document.getElementById('thresholdModal')).show();
}

/**
 * 開啟編輯門檻 Modal
 */
function openEditThresholdModal(thresholdId) {
    const t = appState.thresholds.find(item => item.id === thresholdId);
    if (!t) return;

    $('#thresholdModalLabel').html('<i class="fa-solid fa-pen-to-square text-primary"></i> 編輯安全門檻規則');
    $('#thresholdFormMode').val('edit');

    // 載入主鍵，並鎖定據點與產品（複合主鍵禁止直接修改）
    $('#fieldThresholdId').val(t.id);
    $('#fieldThresholdWarehouse').val(t.warehouse_id).trigger('change').prop('disabled', true);
    $('#fieldThresholdProduct').val(t.product_id).trigger('change').prop('disabled', true);

    $('#fieldThresholdQty').val(t.threshold_qty);
    $('#fieldThresholdRemarks').val(t.remarks);
    $('#fieldThresholdIsMonitored').prop('checked', t.is_monitored === 'Y');
    $('#thresholdFieldCreatedAt').val(t.created_at);
    $('#thresholdFieldCreatedBy').val(t.created_by);

    new bootstrap.Modal(document.getElementById('thresholdModal')).show();
}

async function saveThresholdItem() {
    const mode = $('#thresholdFormMode').val();
    const wh = $('#fieldThresholdWarehouse').val();
    const prd = $('#fieldThresholdProduct').val();

    if (!wh || !prd) {
        AppToast.warning("請完整選擇「據點倉儲」與「產品品項」！");
        return;
    }

    // 系統強制依規格生成主鍵：倉儲據點ID_產品SKU ID
    const id = `${wh}_${prd}`;
    $('#fieldThresholdId').val(id);

    // 新增時防呆：不可建立重複據點與產品之門檻
    if (mode === 'add') {
        const isDuplicate = appState.thresholds.some(t => t.id === id);
        if (isDuplicate) {
            AppToast.warning(`門檻規則【${id}】已存在，不可重複建立！如需修改請直接編輯既有規則。`);
            return;
        }
    }

    const qty = parseInt($('#fieldThresholdQty').val(), 10) || 0;
    const remarks = $('#fieldThresholdRemarks').val().trim();
    const isMonitored = $('#fieldThresholdIsMonitored').is(':checked') ? 'Y' : 'N';

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existing = appState.thresholds.find(t => t.id === id);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    // 表 310 (psi_safety_thresholds) 依實體物理欄位 Index 0 ~ 9 組裝
    const rowDataArray = [
        id,                 // Col 0: id (PK: WH_PRD)
        wh,                 // Col 1: warehouse_id
        prd,                // Col 2: product_id
        qty,                // Col 3: threshold_qty
        isMonitored,        // Col 4: is_monitored
        remarks,            // Col 5: remarks
        createdBy,          // Col 6: created_by
        createdAt,          // Col 7: created_at
        currentUser,        // Col 8: modified_by
        nowStr              // Col 9: modified_at
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
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入中...');

        if (mode === 'add') {
            await SheetAdapter.createRow(SHEET_THRESHOLDS, id, rowDataArray, GAS_DEPLOY_ID);
            appState.thresholds.push(updatedObj);
        } else {
            await SheetAdapter.updateRow(SHEET_THRESHOLDS, id, rowDataArray, GAS_DEPLOY_ID);
            const index = appState.thresholds.findIndex(t => t.id === id);
            if (index !== -1) appState.thresholds[index] = updatedObj;
        }

        refreshView();

        const modalEl = document.getElementById('thresholdModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        AppToast.success(`門檻規則【${id}】儲存成功！`);
    } catch (err) {
        AppToast.error("門檻寫入失敗: " + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存門檻規則');
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
        await SheetAdapter.deleteRow(SHEET_THRESHOLDS, thresholdId, GAS_DEPLOY_ID);
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
    $('#resolveAlertIdDisplay').text(a.id);
    $('#resolveAlertTypeBadge').html(UIBadges.stockAlert.type(a.alert_type));
    $('#resolveAlertItemText').text(`${getProductShortName(a.product_id)} (${a.product_id})`);
    $('#resolveAlertWhText').text(`${getWarehouseName(a.warehouse_id)} (${a.warehouse_id})`);
    $('#resolveAlertSuggestedText').text(a.remarks || '常規調撥備貨防線');
    $('#resolveStatusSelect').val(a.status || '已知悉');
    $('#resolveRemarksInput').val('');

    new bootstrap.Modal(document.getElementById('resolveAlertModal')).show();
}

async function saveAlertResolution() {
    const alertId = $('#resolveAlertId').val();
    const alertItem = appState.alerts.find(a => a.id === alertId);
    if (!alertItem) return;

    const newStatus = $('#resolveStatusSelect').val();
    const userRemarks = $('#resolveRemarksInput').val().trim();
    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();

    // 更新系統建議/備註欄位 (Col 12)
    const updatedRemarks = userRemarks 
        ? (alertItem.remarks ? `${alertItem.remarks} ‧ [處置: ${userRemarks}]` : userRemarks)
        : alertItem.remarks;

    // 嚴格依照表 308 (psi_alerts) 欄位順序 Index 0 ~ 18
    const rowDataArray = [
        alertItem.id,                                   // Col 0: id
        alertItem.alert_type,                           // Col 1: alert_type
        alertItem.warehouse_id,                         // Col 2: warehouse_id
        alertItem.product_id,                           // Col 3: product_id
        alertItem.stock_id || '',                       // Col 4: stock_id
        alertItem.batch_no || '',                       // Col 5: batch_no
        alertItem.expiry_date || '',                    // Col 6: expiry_date
        alertItem.current_qty,                          // Col 7: current_qty
        alertItem.threshold_qty ?? '',                  // Col 8: threshold_qty
        alertItem.days_to_expire ?? '',                 // Col 9: days_to_expire
        alertItem.alert_level,                          // Col 10: alert_level
        newStatus,                                      // Col 11: status
        updatedRemarks,                                 // Col 12: remarks
        currentUser,                                    // Col 13: resolved_by
        nowStr,                                         // Col 14: resolved_at
        alertItem.created_by,                           // Col 15: created_by
        alertItem.created_at,                           // Col 16: created_at
        currentUser,                                    // Col 17: modified_by
        nowStr                                          // Col 18: modified_at
    ];

    try {
        await SheetAdapter.updateRow(SHEET_ALERTS, alertId, rowDataArray, GAS_DEPLOY_ID);
        
        alertItem.status = newStatus;
        alertItem.remarks = updatedRemarks;
        alertItem.resolved_by = currentUser;
        alertItem.resolved_at = nowStr;
        alertItem.modified_by = currentUser;
        alertItem.modified_at = nowStr;

        refreshView();

        const modalEl = document.getElementById('resolveAlertModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
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
        const nowStr = getFormattedNow();

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
                await SheetAdapter.updateRow(SHEET_ALERTS, alertId, rowDataArray, GAS_DEPLOY_ID);
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