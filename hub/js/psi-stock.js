// ==========================================================================
// 1. Google 雲端試算表設定與常數定義
// ==========================================================================
const SPREADSHEET_ID = "1_plHUdfzIublSv1apN5qQ5reO6YxqBkI1MdnQeDbAxo";         // 主試算表 (庫存主檔、據點倉儲)[cite: 11]
const SPREADSHEET_ID_PRD = "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I";     // 產品主檔試算表 (prd_items)[cite: 4]
const GAS_DEPLOY_ID = "AKfycbx3vDysJBLkmscZG8Jonv6EMyHLzmb-AjxfDqzjOSiGD-8oInz8UowbLLJRKVbbxPVt"; // GAS 部署 ID[cite: 11]

const SHEET_STOCKS = "庫存主檔";       // 表 302: psi_stocks[cite: 11]
const SHEET_WAREHOUSES = "據點倉儲";   // 表 301: psi_warehouses[cite: 11]
const SHEET_PRODUCTS = "產品主檔";     // 表 101: prd_items[cite: 4]

/**
 * 試算表欄位索引安全取值工具函式 (0-Based 絕對物理順序)[cite: 11]
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
 * 依據 Schema 規格生成庫存主鍵 (格式: STK-YYYYMMDD-流水4碼)
 */
function generateStockId() {
    const today = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ymd = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
    const prefix = `STK-${ymd}-`;

    const todayCount = appState.stocks.filter(s => s.id && s.id.startsWith(prefix)).length;
    const seq = String(todayCount + 1).padStart(4, '0');
    return `${prefix}${seq}`;
}

// ==========================================================================
// 2. 系統狀態管理 (State Management)
// ==========================================================================
let appState = {
    stocks: [],            // 表 302: psi_stocks[cite: 11]
    warehouses: {},        // 表 301: psi_warehouses 映射[cite: 11]
    products: {},          // 表 101: prd_items 映射[cite: 4]
    currentWhFilter: 'ALL',
    currentStatusFilter: 'ALL'
};

let stockDataTableInstance = null;
let chartShareInstance = null;
let chartExpiryInstance = null;
let isInitialized = false;

// ==========================================================================
// 3. 生命週期與權限管理 (對齊 common.js 共用規範)[cite: 5, 11]
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(GAS_DEPLOY_ID); // 初始化共用試算表配接器[cite: 7, 11]
    }
    await initStockApp();
    applyUIPermissions();
});

async function initStockApp() {
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
        $('#btnOpenAddModal').hide();
        $('.admin-action-btn').addClass('disabled').prop('disabled', true);
    }
}

// ==========================================================================
// 4. 資料讀取引擎：PapaParse 0-Based 順序解析，無假資料注入[cite: 11]
// ==========================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步庫存與主檔數據...', '連線 Google 試算表'); //[cite: 10, 11]
    try {
        const fetchSheet = async (sheetName, targetSpreadsheetId = SPREADSHEET_ID) => {
            const url = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP 錯誤碼: ${res.status}`);
            const text = await res.text();

            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return (parsed.data || []).slice(1); // 略過第 0 列標題列[cite: 11]
        };

        const [rawStockRows, rawWhRows, rawPrdRows] = await Promise.all([
            fetchSheet(SHEET_STOCKS).catch(() => []),
            fetchSheet(SHEET_WAREHOUSES).catch(() => []),
            fetchSheet(SHEET_PRODUCTS, SPREADSHEET_ID_PRD).catch(() => [])
        ]);

        // 1. 解析據點倉儲主檔 (表 301: psi_warehouses，Index 0 ~ 14)
        appState.warehouses = {};
        (rawWhRows || []).forEach(r => {
            const id = getVal(r, 0);                  // Col 0: id (PK)
            const name = getVal(r, 1);                // Col 1: warehouse_name
            const type = getVal(r, 2, '官方營運中心'); // Col 2: warehouse_type
            const country = getVal(r, 3, 'TW');       // Col 3: country_code
            if (id) {
                appState.warehouses[id] = { id, name: name || id, type, country };
            }
        });

        // 2. 解析產品品項主檔 (表 101: prd_items)
        appState.products = {};
        (rawPrdRows || []).forEach(r => {
            const code = getVal(r, 0);                        // Col 0: product_code (PK)
            const region = getVal(r, 1, 'TW').toUpperCase();  // Col 1: region_code ('TW' / 'MY')
            const name = getVal(r, 3);                        // Col 3: name (完整品名)
            const shortName = getVal(r, 4);                   // Col 4: short_name (簡稱)
            if (code) {
                appState.products[code] = {
                    code,
                    region,
                    name: name || code,
                    short_name: shortName || name || code
                };
            }
        });

        // 3. 解析庫存主檔 (表 302: psi_stocks，Index 0 ~ 16)
        appState.stocks = (rawStockRows && rawStockRows.length > 0)
            ? parseStocksTable(rawStockRows)
            : [];

        populateStockSelectOptions();
        refreshView();
        AppToast.success(`已自雲端同步 ${appState.stocks.length} 筆批號庫存主檔`); //[cite: 10, 11]
    } catch (err) {
        console.error("Google Sheets 庫存資料同步失敗:", err);
        appState.stocks = [];
        refreshView();
        AppToast.error(`雲端連線異常: ${err.message}`); //[cite: 10, 11]
    } finally {
        AppLoading.hide(); //[cite: 7, 10]
    }
}

/**
 * 依據表 302 (psi_stocks) 物理順序解析 (Index 0 ~ 16)[cite: 11]
 */
/**
 * 依據更新後表 302 (psi_stocks) 物理順序解析 (Index 0 ~ 17)
 */
function parseStocksTable(rows) {
    return rows.map((r, idx) => {
        const qty = parseInt(getVal(r, 5, '0'), 10) || 0;
        const pieces = parseInt(getVal(r, 6, '0'), 10) || 0;
        const reserved = parseInt(getVal(r, 7, '0'), 10) || 0;
        const calcAvail = parseInt(getVal(r, 8, String(Math.max(0, qty - reserved))), 10) || Math.max(0, qty - reserved);

        return {
            id: getVal(r, 0, `STK-${String(idx + 1).padStart(4, '0')}`),      // Col 0: id (PK)
            warehouse_id: getVal(r, 1, 'WH-TW-TP'),                           // Col 1: warehouse_id
            product_id: getVal(r, 2, 'PRD-0101-01'),                          // Col 2: product_id
            batch_no: getVal(r, 3, ''),                                       // Col 3: batch_no
            expiry_date: getVal(r, 4, ''),                                    // Col 4: expiry_date
            quantity: qty,                                                    // Col 5: quantity (整盒)
            pieces_qty: pieces,                                               // Col 6: pieces_qty (散裝支/條)
            reserved_qty: reserved,                                           // Col 7: reserved_qty (預扣盒數)
            available_qty: calcAvail,                                         // Col 8: available_qty (可用盒數)
            currency_code: getVal(r, 9, 'TWD'),                               // Col 9: currency_code
            cost_price: parseFloat(getVal(r, 10, '0')) || 0,                 // Col 10: cost_price
            sv_point: parseInt(getVal(r, 11, '0'), 10) || 0,                 // Col 11: sv_point
            is_locked: getVal(r, 12, 'N').toUpperCase(),                      // Col 12: is_locked ('Y'/'N')
            remarks: getVal(r, 13, ''),                                       // Col 13: remarks
            created_by: getVal(r, 14, 'SYSTEM'),                              // Col 14: created_by
            created_at: getVal(r, 15, getFormattedNow()),                     // Col 15: created_at
            modified_by: getVal(r, 16, 'SYSTEM'),                             // Col 16: modified_by
            modified_at: getVal(r, 17, getFormattedNow())                     // Col 17: modified_at
        };
    });
}

// ==========================================================================
// 5. 下拉選單中樞介接 (UISelectOptions.core.render)[cite: 4]
// ==========================================================================
function getWarehouseTypeOrder(type) {
    const orderMap = {
        '自用常備倉': 1,
        '海外商務倉': 2,
        '官方營運中心': 3,
        '物流在途倉': 4
    };
    return orderMap[type] || 99;
}

function getWarehouseName(whId) {
    if (!whId) return '-';
    return appState.warehouses[whId]?.name || whId;
}

function getProductShortName(prdId) {
    if (!prdId) return '-';
    return appState.products[prdId]?.short_name || appState.products[prdId]?.name || prdId;
}

function populateStockSelectOptions() {
    const $wh = $('#fieldWarehouseId');
    const $prd = $('#fieldProductId');

    // 1. 倉儲選單排序：自用 -> 海外 -> 官方 -> 物流
    const sortedWarehouses = Object.values(appState.warehouses).sort((a, b) => {
        const orderA = getWarehouseTypeOrder(a.type);
        const orderB = getWarehouseTypeOrder(b.type);
        if (orderA !== orderB) return orderA - orderB;
        return a.id.localeCompare(b.id);
    });

    if (window.UISelectOptions && UISelectOptions.core) {
        UISelectOptions.core.render({
            target: $wh,
            data: sortedWarehouses,
            valueKey: 'id',
            textKey: (wh) => `${wh.name} (${wh.id})${wh.type ? ` [${wh.type}]` : ''}`,
            placeholder: '-- 請選擇存放據點倉儲 --',
            selectedValue: $wh.val() || '',
            searchable: true,
            creatable: false,
            grouped: false,
            dropdownParent: '#stockModal'
        }); //[cite: 4]

        // 2. 產品品項選單分組：TW 優先 -> MY 次之 -> 其他市場
        const regionPriority = { 'TW': 1, 'MY': 2 };
        const structuredProducts = Object.values(appState.products)
            .sort((a, b) => {
                const prioA = regionPriority[a.region] || 99;
                const prioB = regionPriority[b.region] || 99;
                if (prioA !== prioB) return prioA - prioB;
                return a.code.localeCompare(b.code);
            })
            .map(prd => ({
                ...prd,
                group: prd.region === 'TW' ? '🇹🇼 台灣市場' : (prd.region === 'MY' ? '🇲🇾 馬來西亞市場' : '🌐 其他市場')
            }));

        UISelectOptions.core.render({
            target: $prd,
            data: structuredProducts,
            valueKey: 'code',
            textKey: (prd) => `${prd.short_name} (${prd.code})`,
            groupKey: 'group',
            placeholder: '-- 請選擇產品品項 --',
            selectedValue: $prd.val() || '',
            searchable: true,
            creatable: false,
            grouped: true,
            dropdownParent: '#stockModal'
        }); //[cite: 4]
    }
}

// ==========================================================================
// 6. 介面事件綁定與視圖渲染中樞
// ==========================================================================
function getDaysToExpiry(expiryDateStr) {
    if (!expiryDateStr) return 0;
    const today = new Date();
    const exp = new Date(expiryDateStr);
    const diffTime = exp - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function bindUIEvents() {
    $('#fieldQuantity, #fieldReservedQty').on('input', function() {
        const q = parseInt($('#fieldQuantity').val(), 10) || 0;
        const r = parseInt($('#fieldReservedQty').val(), 10) || 0;
        $('#fieldAvailableQty').val(Math.max(0, q - r));
    });

    $('[data-filter-wh]').on('click', function() {
        $('[data-filter-wh]').removeClass('active');
        $(this).addClass('active');
        appState.currentWhFilter = $(this).data('filter-wh');
        if (stockDataTableInstance) stockDataTableInstance.draw();
    });

    $('[data-filter-status]').on('click', function() {
        $('[data-filter-status]').removeClass('active');
        $(this).addClass('active');
        appState.currentStatusFilter = $(this).data('filter-status');
        if (stockDataTableInstance) stockDataTableInstance.draw();
    });
}

function refreshView() {
    renderHudMetrics();
    renderStockDataTable();
    renderTacticalCharts();
    applyUIPermissions();
}

function renderHudMetrics() {
    let totalQty = 0;
    let totalPieces = 0;
    let totalAvailable = 0;
    let totalReserved = 0;
    let expiringBatches = 0;

    appState.stocks.forEach(s => {
        totalQty += s.quantity;
        totalPieces += (s.pieces_qty || 0);
        totalAvailable += s.available_qty;
        totalReserved += s.reserved_qty;
        if (s.expiry_date) {
            const days = getDaysToExpiry(s.expiry_date);
            if (days <= 90) expiringBatches++;
        }
    });

    const qtyDisplay = totalPieces > 0 
        ? `${totalQty.toLocaleString()} 盒 <span class="small text-secondary fw-normal">(+${totalPieces} 散裝)</span>`
        : `${totalQty.toLocaleString()} 盒`;

    $('#hudTotalQty').html(qtyDisplay);
    $('#hudAvailableQty').text(totalAvailable.toLocaleString());
    $('#hudReservedQty').text(totalReserved.toLocaleString());
    $('#hudExpiringBatches').text(expiringBatches);
}

// ==========================================================================
// 7. DataTables 渲染：批號庫存表
// ==========================================================================
function renderStockDataTable() {
    const formatted = appState.stocks.map(s => formatStockRow(s));

    if (stockDataTableInstance) {
        stockDataTableInstance.clear();
        stockDataTableInstance.rows.add(formatted);
        stockDataTableInstance.draw();
    } else {
        stockDataTableInstance = $('#stockMasterTable').DataTable({
            data: formatted,
            responsive: true,
            pageLength: 10,
            columns: [
                { data: 'id' },
                { data: 'warehouse' },
                { data: 'product' },
                { data: 'batch' },
                { data: 'expiry' },
                { data: 'quantity' },
                { data: 'reserved' },
                { data: 'available' },
                { data: 'cost_sv' },
                { data: 'status' },
                { data: 'actions' }
            ],
            language: {
                search: "檢索品項/批號：",
                info: "顯示 _START_ 到 _END_ 筆，共 _TOTAL_ 筆批號庫存",
                paginate: { first: "首頁", last: "末頁", next: "下頁", previous: "上頁" },
                zeroRecords: "查無符合條件的庫存批號"
            }
        });

        $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
            const row = appState.stocks[dataIndex];
            if (!row) return true;

            if (appState.currentWhFilter !== 'ALL' && row.warehouse_id !== appState.currentWhFilter) {
                return false;
            }

            if (appState.currentStatusFilter !== 'ALL') {
                const days = getDaysToExpiry(row.expiry_date);
                if (appState.currentStatusFilter === 'NORMAL' && (row.is_locked === 'Y' || days <= 90)) return false;
                if (appState.currentStatusFilter === 'WARNING_EXPIRY' && days > 90) return false;
                if (appState.currentStatusFilter === 'LOCKED' && row.is_locked !== 'Y') return false;
            }

            return true;
        });
    }

    const info = stockDataTableInstance.page.info();
    $('#tableRecordBadge').text(`${info.recordsTotal} 個批號項目`);
}

function formatStockRow(s) {
    const hasAdminRights = isMasterAdmin();
    const days = getDaysToExpiry(s.expiry_date);

    let expiryColor = "bg-success text-success";
    let expiryPercent = Math.min(100, Math.max(10, Math.round((days / 365) * 100)));
    if (days <= 30) expiryColor = "bg-danger text-danger";
    else if (days <= 90) expiryColor = "bg-warning text-warning";

    const isLocked = s.is_locked === 'Y';
    const statusBadge = isLocked
        ? `<span class="badge bg-danger bg-opacity-20 text-danger border border-danger border-opacity-30"><i class="fa-solid fa-lock"></i> 凍結禁出</span>`
        : `<span class="badge bg-success bg-opacity-20 text-success border border-success border-opacity-30"><i class="fa-solid fa-circle-check"></i> 自由流通</span>`;

    const actionButtons = hasAdminRights ? `
        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary py-0 px-2 admin-action-btn" onclick="openEditStockModal('${s.id}')" title="編輯批號">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn ${isLocked ? 'btn-outline-success' : 'btn-outline-warning'} py-0 px-2 admin-action-btn" onclick="toggleStockLock('${s.id}')" title="${isLocked ? '解凍批號' : '凍結出庫'}">
                <i class="fa-solid ${isLocked ? 'fa-lock-open' : 'fa-lock'}"></i>
            </button>
            <button class="btn btn-outline-danger py-0 px-2 admin-action-btn" onclick="deleteStockItem('${s.id}')" title="刪除庫存項目">
                <i class="fa-solid fa-trash-alt"></i>
            </button>
        </div>
    ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>';

    return {
        id: `<span class="fw-bold text-info">${s.id}</span>`,
        warehouse: `<div><div class="text-white">${getWarehouseName(s.warehouse_id)}</div><span class="badge bg-dark border border-purple-subtle small">${s.warehouse_id}</span></div>`,
        product: `<div><div class="fw-bold text-white">${getProductShortName(s.product_id)}</div><span class="small text-secondary">${s.product_id}</span></div>`,
        batch: `<span class="batch-chip fw-bold"><i class="fa-solid fa-barcode"></i> ${s.batch_no || '--'}</span>`,
        expiry: `
            <div style="min-width: 110px;">
                <div class="d-flex justify-content-between small mb-1">
                    <span class="text-light">${s.expiry_date || '--'}</span>
                    <span class="fw-bold ${expiryColor.split(' ')[1]}">${days} 天</span>
                </div>
                <div class="expiry-progress">
                    <div class="progress-bar ${expiryColor.split(' ')[0]}" style="width: ${expiryPercent}%;"></div>
                </div>
            </div>
        `,
        quantity: `
            <div>
                <span class="fw-bold text-white">${s.quantity}</span> <span class="small text-muted">盒</span>
                ${s.pieces_qty > 0 ? `<div class="mt-1"><span class="badge badge-purple-subtle small">+${s.pieces_qty} 支/條</span></div>` : ''}
            </div>
        `,
        reserved: `<span class="text-warning">${s.reserved_qty}</span>`,
        available: `<span class="fw-bold text-success">${s.available_qty}</span>`,
        cost_sv: `<div><span class="small text-light">${s.currency_code} ${s.cost_price}</span><div class="small text-secondary">${s.sv_point} SV</div></div>`,
        status: statusBadge,
        actions: actionButtons
    };
}

// ==========================================================================
// 8. 視覺化圖表渲染 (Chart.js)
// ==========================================================================
function renderTacticalCharts() {
    const ctxShareEl = document.getElementById('chartWarehouseShare');
    const ctxExpiryEl = document.getElementById('chartExpiryTimeline');
    if (!ctxShareEl || !ctxExpiryEl) return;

    // 1. 跨倉實體庫存容積佔比 Doughnut
    const whTotals = {};
    appState.stocks.forEach(s => {
        const whLabel = getWarehouseName(s.warehouse_id);
        whTotals[whLabel] = (whTotals[whLabel] || 0) + s.quantity;
    });

    if (chartShareInstance) chartShareInstance.destroy();
    chartShareInstance = new Chart(ctxShareEl.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(whTotals),
            datasets: [{
                data: Object.values(whTotals),
                backgroundColor: ['#a855f7', '#ec4899', '#38bdf8', '#f59e0b', '#10b981'],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#94a3b8', boxWidth: 10, font: { size: 10 } }
                }
            }
        }
    });

    // 2. FIFO 效期階梯時空圖 Bar
    const validExpiryStocks = appState.stocks.filter(s => s.expiry_date);
    const labels = validExpiryStocks.map(s => (s.batch_no ? s.batch_no.substring(0, 8) : s.id));
    const daysData = validExpiryStocks.map(s => getDaysToExpiry(s.expiry_date));
    const barColors = daysData.map(d => (d <= 30 ? '#f43f5e' : d <= 90 ? '#f59e0b' : '#10b981'));

    if (chartExpiryInstance) chartExpiryInstance.destroy();
    chartExpiryInstance = new Chart(ctxExpiryEl.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '剩餘天數',
                data: daysData,
                backgroundColor: barColors,
                borderRadius: 4,
                barThickness: 14
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(168, 85, 247, 0.1)' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// ==========================================================================
// 9. 表單 CRUD 操作 (嚴格依據 表 302 欄位順序 0～16 封裝)[cite: 11]
// ==========================================================================
function openAddStockModal() {
    $('#stockModalLabel').html('<i class="fa-solid fa-plus text-primary"></i> 新增庫存批號');
    $('#formMode').val('add');
    $('#stockForm')[0].reset();

    $('#fieldId').prop('readonly', true).val(generateStockId());
    populateStockSelectOptions();

    $('#fieldBatchNo').val('');
    $('#fieldExpiryDate').val('');
    $('#fieldQuantity').val(0);
    $('#fieldPiecesQty').val(0);
    $('#fieldReservedQty').val(0);
    $('#fieldAvailableQty').val(0);
    $('#fieldCurrencyCode').val('TWD');
    $('#fieldCostPrice').val(0);
    $('#fieldSvPoint').val(0);
    $('#fieldRemarks').val('');
    $('#fieldIsLocked').prop('checked', false);
    $('#fieldCreatedAt').val('');
    $('#fieldCreatedBy').val('');

    new bootstrap.Modal(document.getElementById('stockModal')).show();
}

function openEditStockModal(stockId) {
    const s = appState.stocks.find(item => item.id === stockId);
    if (!s) return;

    $('#stockModalLabel').html('<i class="fa-solid fa-pen-to-square text-primary"></i> 編輯庫存批號');
    $('#formMode').val('edit');
    $('#fieldId').prop('readonly', true).val(s.id);
    $('#fieldBatchNo').val(s.batch_no);
    $('#fieldExpiryDate').val(s.expiry_date);
    $('#fieldQuantity').val(s.quantity);
    $('#fieldPiecesQty').val(s.pieces_qty || 0);
    $('#fieldReservedQty').val(s.reserved_qty);
    $('#fieldAvailableQty').val(s.available_qty);
    $('#fieldCurrencyCode').val(s.currency_code);
    $('#fieldCostPrice').val(s.cost_price);
    $('#fieldSvPoint').val(s.sv_point);
    $('#fieldRemarks').val(s.remarks);
    $('#fieldIsLocked').prop('checked', s.is_locked === 'Y');
    $('#fieldCreatedAt').val(s.created_at);
    $('#fieldCreatedBy').val(s.created_by);

    populateStockSelectOptions();
    $('#fieldWarehouseId').val(s.warehouse_id).trigger('change');
    $('#fieldProductId').val(s.product_id).trigger('change');

    new bootstrap.Modal(document.getElementById('stockModal')).show();
}

async function saveStockItem() {
    const mode = $('#formMode').val();
    const id = $('#fieldId').val().trim();
    const wh = $('#fieldWarehouseId').val();
    const prd = $('#fieldProductId').val();
    const batch = $('#fieldBatchNo').val().trim();
    const exp = $('#fieldExpiryDate').val();
    const qty = parseInt($('#fieldQuantity').val(), 10) || 0;
    const pieces = parseInt($('#fieldPiecesQty').val(), 10) || 0;
    const reserved = parseInt($('#fieldReservedQty').val(), 10) || 0;
    const avail = Math.max(0, qty - reserved);
    const curr = $('#fieldCurrencyCode').val();
    const cost = parseFloat($('#fieldCostPrice').val()) || 0;
    const sv = parseInt($('#fieldSvPoint').val(), 10) || 0;
    const isLocked = $('#fieldIsLocked').is(':checked') ? 'Y' : 'N';
    const remarks = $('#fieldRemarks').val().trim();

    if (!id || !batch || !exp) {
        AppToast.warning("請完整填寫庫存代碼、批號與有效期限！");
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existing = appState.stocks.find(item => item.id === id);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    // 表 302: psi_stocks 實體順序 0 ~ 17
    const rowDataArray = [
        id,                 // Col 0: id
        wh,                 // Col 1: warehouse_id
        prd,                // Col 2: product_id
        batch,              // Col 3: batch_no
        exp,                // Col 4: expiry_date
        qty,                // Col 5: quantity (整盒)
        pieces,             // Col 6: pieces_qty (散裝)
        reserved,           // Col 7: reserved_qty
        avail,              // Col 8: available_qty
        curr,               // Col 9: currency_code
        cost,               // Col 10: cost_price
        sv,                 // Col 11: sv_point
        isLocked,           // Col 12: is_locked
        remarks,            // Col 13: remarks
        createdBy,          // Col 14: created_by
        createdAt,          // Col 15: created_at
        currentUser,        // Col 16: modified_by
        nowStr              // Col 17: modified_at
    ];

    const updatedObj = {
        id, warehouse_id: wh, product_id: prd, batch_no: batch, expiry_date: exp,
        quantity: qty, pieces_qty: pieces, reserved_qty: reserved, available_qty: avail,
        currency_code: curr, cost_price: cost, sv_point: sv, is_locked: isLocked,
        remarks, created_by: createdBy, created_at: createdAt, modified_by: currentUser, modified_at: nowStr
    };

    const $btn = $('button[onclick="saveStockItem()"]');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入中...');

        if (mode === 'add') {
            await SheetAdapter.createRow(SHEET_STOCKS, id, rowDataArray, GAS_DEPLOY_ID);
            appState.stocks.push(updatedObj);
        } else {
            await SheetAdapter.updateRow(SHEET_STOCKS, id, rowDataArray, GAS_DEPLOY_ID);
            const idx = appState.stocks.findIndex(item => item.id === id);
            if (idx !== -1) appState.stocks[idx] = updatedObj;
        }

        refreshView();
        bootstrap.Modal.getInstance(document.getElementById('stockModal')).hide();
        AppToast.success(`庫存批號【${id}】儲存成功！`);
    } catch (err) {
        AppToast.error("庫存批號儲存失敗: " + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存批號庫存');
    }
}

async function toggleStockLock(stockId) {
    const s = appState.stocks.find(item => item.id === stockId);
    if (!s) return;

    const newLock = s.is_locked === 'Y' ? 'N' : 'Y';
    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();

    const rowDataArray = [
        s.id, s.warehouse_id, s.product_id, s.batch_no, s.expiry_date,
        s.quantity, s.pieces_qty || 0, s.reserved_qty, s.available_qty,
        s.currency_code, s.cost_price, s.sv_point, newLock, s.remarks,
        s.created_by, s.created_at, currentUser, nowStr
    ];

    try {
        await SheetAdapter.updateRow(SHEET_STOCKS, stockId, rowDataArray, GAS_DEPLOY_ID);
        s.is_locked = newLock;
        s.modified_by = currentUser;
        s.modified_at = nowStr;

        refreshView();
        AppToast.success(`批號【${stockId}】已變更為【${newLock === 'Y' ? '凍結出庫' : '自由流通'}】`);
    } catch (err) {
        AppToast.error("鎖定狀態更新失敗: " + err.message);
    }
}

async function toggleStockLock(stockId) {
    const s = appState.stocks.find(item => item.id === stockId);
    if (!s) return;

    const newLock = s.is_locked === 'Y' ? 'N' : 'Y';
    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();

    const rowDataArray = [
        s.id,
        s.warehouse_id,
        s.product_id,
        s.batch_no,
        s.expiry_date,
        s.quantity,
        s.reserved_qty,
        s.available_qty,
        s.currency_code,
        s.cost_price,
        s.sv_point,
        newLock,
        s.remarks,
        s.created_by,
        s.created_at,
        currentUser,
        nowStr
    ];

    try {
        await SheetAdapter.updateRow(SHEET_STOCKS, stockId, rowDataArray, GAS_DEPLOY_ID); //[cite: 7, 11]
        s.is_locked = newLock;
        s.modified_by = currentUser;
        s.modified_at = nowStr;

        refreshView();
        AppToast.success(`批號【${stockId}】已變更為【${newLock === 'Y' ? '凍結出庫' : '自由流通'}】`); //[cite: 10]
    } catch (err) {
        AppToast.error("鎖定狀態更新失敗: " + err.message); //[cite: 10]
    }
}

async function deleteStockItem(stockId) {
    const confirmed = await AppDialog.confirm(`確定要自 Google 試算表中永久刪除批號庫存【${stockId}】嗎？`, {
        title: '刪除庫存批號確認',
        confirmText: '確定刪除',
        confirmClass: 'btn-danger'
    }); //[cite: 10, 11]
    if (!confirmed) return;

    try {
        await SheetAdapter.deleteRow(SHEET_STOCKS, stockId, GAS_DEPLOY_ID); //[cite: 7, 11]
        appState.stocks = appState.stocks.filter(item => item.id !== stockId);
        refreshView();
        AppToast.success(`批號【${stockId}】已自雲端試算表刪除！`); //[cite: 10]
    } catch (err) {
        AppToast.error("刪除失敗: " + err.message); //[cite: 10]
    }
}