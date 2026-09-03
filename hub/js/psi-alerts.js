// ==========================================================================
// 1. Google 雲端試算表設定與常數定義
// ==========================================================================
const SPREADSHEET_ID = "1_plHUdfzIublSv1apN5qQ5reO6YxqBkI1MdnQeDbAxo";
const GAS_DEPLOY_ID = "AKfycbyJ5FLoBXSHQsKRLF6UovYqulT7uBDPwmybRZ1Up2VN12nT4KnvkUELLC3N8pZK73A7cA";
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

// ==========================================================================
// 2. 系統狀態管理 (State Management)
// ==========================================================================
let appState = {
    alerts: [],
    thresholds: [],
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

$(document).ready(async function() {
    if (!isInitialized) {
        if (window.SheetAdapter) {
            SheetAdapter.init(GAS_DEPLOY_ID);
        }
        await initAlertsApp();
        applyUIPermissions();
    }
});

async function initAlertsApp() {
    if (isInitialized) return;
    isInitialized = true;

    $('#hudSyncTime').text(getFormattedNow());
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
            "fish7548@gmail.com",
            "jarvis.lin@gmail.com",
            "ray.weng@gmail.com"
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
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步預警與門檻資料...', '連線 Google 試算表');
    try {
        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP 錯誤碼: ${res.status}`);
            const text = await res.text();

            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return (parsed.data || []).slice(1);
        };

        const [rawAlertRows, rawThresholdRows] = await Promise.all([
            fetchSheet(SHEET_ALERTS).catch(() => []),
            fetchSheet(SHEET_THRESHOLDS).catch(() => [])
        ]);

        appState.alerts = (rawAlertRows && rawAlertRows.length > 0) ? parseAlertsTable(rawAlertRows) : [];
        appState.thresholds = (rawThresholdRows && rawThresholdRows.length > 0) ? parseThresholdsTable(rawThresholdRows) : [];

        refreshView();
        AppToast.success(`已自雲端同步 ${appState.alerts.length} 筆預警與 ${appState.thresholds.length} 組門檻規則`);
    } catch (err) {
        console.error("Google Sheets 預警資料讀取失敗:", err);
        appState.alerts = [];
        appState.thresholds = [];
        refreshView();
        AppToast.error(`雲端連線異常: ${err.message}`);
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
            id: getVal(r, 0, `ALT-${String(idx + 1).padStart(4, '0')}`),  // Col 0: id
            alert_type: getVal(r, 1, '低於安全水位'),                      // Col 1: alert_type
            warehouse_id: getVal(r, 2, 'WH-TW-TP'),                       // Col 2: warehouse_id
            product_id: getVal(r, 3, 'PRD-0101-01'),                      // Col 3: product_id
            stock_id: getVal(r, 4, ''),                                   // Col 4: stock_id
            batch_no: getVal(r, 5, '-'),                                  // Col 5: batch_no
            expiry_date: getVal(r, 6, '-'),                               // Col 6: expiry_date
            current_qty: parseInt(getVal(r, 7, '0'), 10) || 0,            // Col 7: current_qty
            threshold_qty: parseInt(getVal(r, 8, '0'), 10) || 0,          // Col 8: threshold_qty
            days_to_expire: parseInt(getVal(r, 9, '999'), 10) || 999,     // Col 9: days_to_expire
            alert_level: getVal(r, 10, '注意'),                           // Col 10: alert_level
            status: getVal(r, 11, '未處理'),                               // Col 11: status
            suggested_action: getVal(r, 12, '建議檢視備貨'),               // Col 12: suggested_action
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

    $('#alerts-table-search').on('input', function() {
        if (alertsDataTableInstance) {
            alertsDataTableInstance.search($(this).val()).draw();
        }
    });

    $('#thresholds-table-search').on('input', function() {
        if (thresholdsDataTableInstance) {
            thresholdsDataTableInstance.search($(this).val()).draw();
        }
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
            responsive: true,
            pageLength: 10,
            columns: [
                { data: 'checkbox' },
                { data: 'id' },
                { data: 'type' },
                { data: 'product' },
                { data: 'warehouse' },
                { data: 'batch' },
                { data: 'qty' },
                { data: 'days' },
                { data: 'level' },
                { data: 'status' },
                { data: 'actions' }
            ],
            language: {
                search: "表格搜尋：",
                info: "顯示 _START_ 到 _END_ 筆，共 _TOTAL_ 筆告警",
                paginate: { first: "首頁", last: "末頁", next: "下頁", previous: "上頁" },
                zeroRecords: "目前無任何庫存風險告警"
            }
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

    let typeBadge = '<span class="badge badge-purple-glow">日常提示</span>';
    if (a.alert_type === '低於安全水位') typeBadge = '<span class="badge badge-danger-glow"><i class="fa-solid fa-triangle-exclamation"></i> 低於安全水位</span>';
    else if (a.alert_type === '90天近效期') typeBadge = '<span class="badge badge-warning-glow"><i class="fa-solid fa-hourglass-half"></i> 90天近效期</span>';
    else if (a.alert_type === '30天極危效期') typeBadge = '<span class="badge badge-danger-glow"><i class="fa-solid fa-skull-crossbones"></i> 30天極危效期</span>';
    else if (a.alert_type === '品質鎖定') typeBadge = '<span class="badge bg-secondary"><i class="fa-solid fa-lock"></i> 品質鎖定</span>';

    let statusBadge = '<span class="badge bg-secondary">未處理</span>';
    if (a.status === '已知悉') statusBadge = '<span class="badge bg-info bg-opacity-20 text-info border border-info border-opacity-30">已知悉</span>';
    else if (a.status === '已轉特惠促銷/試用') statusBadge = '<span class="badge bg-warning bg-opacity-20 text-warning border border-warning border-opacity-30">已轉特惠/試用</span>';
    else if (a.status === '已結案出清') statusBadge = '<span class="badge bg-success bg-opacity-20 text-success border border-success border-opacity-30">已結案出清</span>';

    const actionBtn = hasAdminRights ? `
        <button class="btn btn-sm btn-purple text-white py-0 px-2 admin-action-btn fw-bold" onclick="openResolveAlertModal('${a.id}')">
            <i class="fa-solid fa-bolt"></i> 處置
        </button>
    ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>';

    return {
        checkbox: `<input type="checkbox" class="alert-item-check form-check-input" value="${a.id}">`,
        id: `<span class="font-chakra fw-bold text-info">${a.id}</span>`,
        type: typeBadge,
        product: `<div><span class="font-chakra text-white fw-bold">${a.product_id}</span><div class="small text-secondary">${getProductName(a.product_id)}</div></div>`,
        warehouse: `<span class="badge bg-dark border border-purple-subtle font-chakra">${a.warehouse_id}</span>`,
        batch: `<div><span class="font-chakra small text-light">${a.batch_no}</span><div class="small text-secondary font-chakra">${a.expiry_date}</div></div>`,
        qty: `<div><span class="font-chakra fw-bold text-white">${a.current_qty}</span> <span class="text-secondary small font-chakra">/ 門檻 ${a.threshold_qty}</span></div>`,
        days: a.days_to_expire <= 90 
            ? `<span class="font-chakra text-danger fw-bold"><i class="fa-solid fa-clock"></i> 剩 ${a.days_to_expire} 天</span>` 
            : `<span class="font-chakra text-secondary">剩 ${a.days_to_expire} 天</span>`,
        level: a.alert_level === '緊急' ? '<span class="text-danger fw-bold">緊急</span>' : '<span class="text-warning">注意</span>',
        status: statusBadge,
        actions: actionBtn
    };
}

function getProductName(pid) {
    const map = {
        'PRD-0101-01': '康爾喜乳酸菌 (顆粒)',
        'PRD-0101-02': '995 生技營養品 (液體)',
        'PRD-0102-01': '樟芝益菌絲體飲',
        'PRD-0201-01': '衛傑膠囊',
        'PRD-0301-02': '百克斯膠囊'
    };
    return map[pid] || '葡眾營養保健品';
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
            responsive: true,
            pageLength: 10,
            columns: [
                { data: 'id' },
                { data: 'warehouse' },
                { data: 'product' },
                { data: 'qty' },
                { data: 'monitored' },
                { data: 'remarks' },
                { data: 'creator' },
                { data: 'updated_at' },
                { data: 'actions' }
            ],
            language: {
                search: "表格搜尋：",
                info: "顯示 _START_ 到 _END_ 筆，共 _TOTAL_ 組門檻規則",
                paginate: { first: "首頁", last: "末頁", next: "下頁", previous: "上頁" },
                zeroRecords: "查無門檻規則資料"
            }
        });
    }
}

function formatThresholdRow(t) {
    const hasAdminRights = isMasterAdmin();
    const isMonitored = t.is_monitored === 'Y';

    const monitoredPill = isMonitored
        ? '<span class="badge bg-success bg-opacity-20 text-success border border-success border-opacity-30"><i class="fa-solid fa-circle-check"></i> 監控中</span>'
        : '<span class="badge bg-danger bg-opacity-20 text-danger border border-danger border-opacity-30"><i class="fa-solid fa-pause"></i> 暫停</span>';

    const actionButtons = hasAdminRights ? `
        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary py-0 px-2 admin-action-btn" onclick="openEditThresholdModal('${t.id}')" title="編輯規則">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-outline-danger py-0 px-2 admin-action-btn" onclick="deleteThresholdItem('${t.id}')" title="刪除規則">
                <i class="fa-solid fa-trash-alt"></i>
            </button>
        </div>
    ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>';

    return {
        id: `<span class="font-chakra fw-bold text-info">${t.id}</span>`,
        warehouse: `<span class="badge bg-dark border border-purple-subtle font-chakra">${t.warehouse_id}</span>`,
        product: `<div><span class="font-chakra text-white fw-bold">${t.product_id}</span><div class="small text-secondary">${getProductName(t.product_id)}</div></div>`,
        qty: `<span class="font-chakra h6 fw-bold text-warning mb-0">${t.threshold_qty} 盒</span>`,
        monitored: monitoredPill,
        remarks: `<div class="small text-secondary text-truncate" style="max-width: 220px;" title="${t.remarks || ''}">${t.remarks || '-'}</div>`,
        creator: `<span class="small">${t.created_by || 'SYSTEM'}</span>`,
        updated_at: `<span class="font-chakra small text-secondary">${t.modified_at || '-'}</span>`,
        actions: actionButtons
    };
}

function openAddThresholdModal() {
    $('#thresholdModalLabel').html('<i class="fa-solid fa-plus text-primary"></i> 新增安全門檻規則');
    $('#thresholdFormMode').val('add');
    $('#thresholdForm')[0].reset();
    $('#fieldThresholdId').prop('readonly', false).val(`TH-${Date.now().toString().slice(-6)}`);
    $('#fieldThresholdWarehouse').val('WH-TW-TP');
    $('#fieldThresholdProduct').val('PRD-0101-01');
    $('#fieldThresholdQty').val(0);
    $('#fieldThresholdRemarks').val('');
    $('#fieldThresholdIsMonitored').prop('checked', true);
    $('#thresholdFieldCreatedAt').val('');
    $('#thresholdFieldCreatedBy').val('');

    new bootstrap.Modal(document.getElementById('thresholdModal')).show();
}

function openEditThresholdModal(thresholdId) {
    const t = appState.thresholds.find(item => item.id === thresholdId);
    if (!t) return;

    $('#thresholdModalLabel').html('<i class="fa-solid fa-pen-to-square text-primary"></i> 編輯安全門檻規則');
    $('#thresholdFormMode').val('edit');
    $('#fieldThresholdId').prop('readonly', true).val(t.id);
    $('#fieldThresholdWarehouse').val(t.warehouse_id);
    $('#fieldThresholdProduct').val(t.product_id);
    $('#fieldThresholdQty').val(t.threshold_qty);
    $('#fieldThresholdRemarks').val(t.remarks);
    $('#fieldThresholdIsMonitored').prop('checked', t.is_monitored === 'Y');
    $('#thresholdFieldCreatedAt').val(t.created_at);
    $('#thresholdFieldCreatedBy').val(t.created_by);

    new bootstrap.Modal(document.getElementById('thresholdModal')).show();
}

async function saveThresholdItem() {
    const mode = $('#thresholdFormMode').val();
    const id = $('#fieldThresholdId').val().trim();
    const wh = $('#fieldThresholdWarehouse').val();
    const prd = $('#fieldThresholdProduct').val();
    const qty = parseInt($('#fieldThresholdQty').val(), 10) || 0;
    const remarks = $('#fieldThresholdRemarks').val().trim();
    const isMonitored = $('#fieldThresholdIsMonitored').is(':checked') ? 'Y' : 'N';

    if (!id) {
        AppToast.warning("請完整填寫門檻唯一識別碼！");
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existing = appState.thresholds.find(t => t.id === id);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    // 表 310: psi_safety_thresholds 依實體順序組成 0 ~ 9 陣列
    const rowDataArray = [
        id,                 // Col 0: id (PK)
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
    $('#resolveAlertItemText').text(`${getProductName(a.product_id)} (${a.product_id})`);
    $('#resolveAlertWhText').text(a.warehouse_id);
    $('#resolveAlertSuggestedText').text(a.suggested_action || '常規調撥防線');
    $('#resolveStatusSelect').val(a.status || '已知悉');
    $('#resolveRemarksInput').val('');

    new bootstrap.Modal(document.getElementById('resolveAlertModal')).show();
}

async function saveAlertResolution() {
    const alertId = $('#resolveAlertId').val();
    const alertItem = appState.alerts.find(a => a.id === alertId);
    if (!alertItem) return;

    const newStatus = $('#resolveStatusSelect').val();
    const remarks = $('#resolveRemarksInput').val().trim();
    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();

    // 表 308: psi_alerts 依實體順序組成 0 ~ 18 陣列
    const rowDataArray = [
        alertItem.id,                                   // Col 0: id
        alertItem.alert_type,                           // Col 1: alert_type
        alertItem.warehouse_id,                         // Col 2: warehouse_id
        alertItem.product_id,                           // Col 3: product_id
        alertItem.stock_id,                             // Col 4: stock_id
        alertItem.batch_no,                             // Col 5: batch_no
        alertItem.expiry_date,                          // Col 6: expiry_date
        alertItem.current_qty,                          // Col 7: current_qty
        alertItem.threshold_qty,                        // Col 8: threshold_qty
        alertItem.days_to_expire,                       // Col 9: days_to_expire
        alertItem.alert_level,                          // Col 10: alert_level
        newStatus,                                      // Col 11: status
        remarks ? `${alertItem.suggested_action} ‧ [備註: ${remarks}]` : alertItem.suggested_action, // Col 12: suggested_action
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
                    a.id, a.alert_type, a.warehouse_id, a.product_id, a.stock_id,
                    a.batch_no, a.expiry_date, a.current_qty, a.threshold_qty,
                    a.days_to_expire, a.alert_level, a.status, a.suggested_action,
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