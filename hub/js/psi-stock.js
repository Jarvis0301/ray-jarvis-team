// ==========================================================================
// 1. Google 雲端試算表設定與常數定義
// ==========================================================================
const SPREADSHEET_ID = APP_CONFIG.SHEETS.PSI;         // 主試算表 (庫存主檔、據點倉儲)
const SPREADSHEET_ID_PRD = APP_CONFIG.SHEETS.PRD;     // 產品主檔試算表 (prd_items)
const GAS_DEPLOY_ID = APP_CONFIG.GAS.PSI; // GAS 部署 ID

const SHEET_STOCKS = "庫存主檔";       // 表 302: psi_stocks
const SHEET_WAREHOUSES = "據點倉儲";   // 表 301: psi_warehouses
const SHEET_PRODUCTS = "產品主檔";     // 表 101: prd_items

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
    stocks: [],            // 表 302: psi_stocks
    warehouses: {},        // 表 301: psi_warehouses 映射
    products: {},          // 表 101: prd_items 映射
    currentWhFilter: 'ALL',
    currentPrdFilter: 'ALL',
    currentExpiryFilter: 'ALL',
    currentStatusFilter: 'ALL'
};

let chartInstances = {
    warehouse: null,
    product: null,
    expiry: null,
    status: null
};

let stockDataTableInstance = null;
let isInitialized = false;

/**
 * 取得符合當前 4 維度篩選條件的庫存資料集
 */
function getFilteredStocks() {
    return appState.stocks.filter(row => {
        // 1. 據點倉儲
        if (appState.currentWhFilter && appState.currentWhFilter !== 'ALL' && row.warehouse_id !== appState.currentWhFilter) {
            return false;
        }
        // 2. 產品品項
        if (appState.currentPrdFilter && appState.currentPrdFilter !== 'ALL' && row.product_id !== appState.currentPrdFilter) {
            return false;
        }
        // 3. 時效區間
        if (appState.currentExpiryFilter && appState.currentExpiryFilter !== 'ALL') {
            const days = getDaysToExpiry(row.expiry_date);
            if (!row.expiry_date) return false;
            if (appState.currentExpiryFilter === 'NORMAL' && days <= 90) return false;
            if (appState.currentExpiryFilter === 'WARNING' && (days > 90 || days <= 0)) return false;
            if (appState.currentExpiryFilter === 'DANGER' && (days > 30 || days <= 0)) return false;
            if (appState.currentExpiryFilter === 'EXPIRED' && days > 0) return false;
        }
        // 4. 庫存狀態
        if (appState.currentStatusFilter && appState.currentStatusFilter !== 'ALL') {
            if (appState.currentStatusFilter === 'NORMAL' && row.is_locked === 'Y') return false;
            if (appState.currentStatusFilter === 'LOCKED' && row.is_locked !== 'Y') return false;
        }
        return true;
    });
}

// ==========================================================================
// 3. 生命週期與權限管理 (對齊 common.js 共用規範)[cite: 5, 11]
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(GAS_DEPLOY_ID); // 初始化共用試算表配接器[cite: 7, 11]
    }
    await initStockApp();
});

async function initStockApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindUIEvents();
    await fetchGoogleSheetsData();
}

// ==========================================================================
// 4. 資料讀取引擎：PapaParse 0-Based 順序解析，無假資料注入[cite: 11]
// ==========================================================================
/**
 * 資料讀取引擎
 */
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在讀取雲端資料庫...', '載入中...');

    try {
        const fetchSheet = async (sheetName, targetSpreadsheetId = SPREADSHEET_ID) => {
            const url = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP 錯誤碼：${res.status}`);
            const text = await res.text();

            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return (parsed.data || []).slice(1);
        };

        const [rawStockRows, rawWhRows, rawPrdRows] = await Promise.all([
            fetchSheet(SHEET_STOCKS).catch(() => []),
            fetchSheet(SHEET_WAREHOUSES).catch(() => []),
            fetchSheet(SHEET_PRODUCTS, SPREADSHEET_ID_PRD).catch(() => [])
        ]);

        appState.warehouses = {};
        (rawWhRows || []).forEach(r => {
            const id = getVal(r, 0);
            const name = getVal(r, 1);
            const type = getVal(r, 2, '官方營運中心');
            const country = getVal(r, 3, 'TW');
            if (id) {
                appState.warehouses[id] = { id, name: name || id, type, country };
            }
        });

        appState.products = {};
        (rawPrdRows || []).forEach(r => {
            const code = getVal(r, 0);
            const region = getVal(r, 1, 'TW').toUpperCase();
            const name = getVal(r, 3);
            const shortName = getVal(r, 4);
            if (code) {
                appState.products[code] = {
                    code,
                    region,
                    name: name || code,
                    short_name: shortName || name || code
                };
            }
        });

        appState.stocks = (rawStockRows && rawStockRows.length > 0) 
            ? parseStocksTable(rawStockRows) 
            : [];

        populateStockSelectOptions();
        refreshView();
        $('#hudSyncTime').text(getFormattedNow());

        AppToast.success(`已自雲端同步 ${appState.stocks.length} 筆批號庫存主檔`);
    } catch (err) {
        console.error("Google Sheets 庫存同步異常:", err);
        AppToast.error(`雲端連線異常：${err.message}`);
    } finally {
        AppLoading.hide();
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
function getWarehouseName(whId, displayMode = 1) {
    return EntityResolver.warehouse(whId, appState.warehouses, displayMode);
}

function getProductShortName(prdId, displayMode = 1) {
    return EntityResolver.product(prdId, appState.products, displayMode);
}

function populateStockSelectOptions() {
    // 1. 頂部篩選列 - 據點倉儲
    UISelectOptions.warehouse.populate({
        target: '#filterWarehouse',
        warehouses: appState.warehouses,
        placeholder: '全部據點倉儲',
        selectedValue: appState.currentWhFilter === 'ALL' ? '' : appState.currentWhFilter,
        searchable: true
    });

    // 2. 頂部篩選列 - 產品品項
    UISelectOptions.product.populate({
        target: '#filterProduct',
        products: appState.products,
        placeholder: '全部產品品項',
        selectedValue: appState.currentPrdFilter === 'ALL' ? '' : appState.currentPrdFilter,
        searchable: true
    });

    // 3. Modal 編輯表單 - 據點倉儲
    UISelectOptions.warehouse.populate({
        target: '#fieldWarehouseId',
        warehouses: appState.warehouses,
        placeholder: '-- 請選擇存放據點倉儲 --',
        selectedValue: $('#fieldWarehouseId').val() || '',
        dropdownParent: '#stockModal'
    });

    // 4. Modal 編輯表單 - 產品品項
    UISelectOptions.product.populate({
        target: '#fieldProductId',
        products: appState.products,
        placeholder: '-- 請選擇產品品項 --',
        selectedValue: $('#fieldProductId').val() || '',
        dropdownParent: '#stockModal'
    });
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

    // 4 個下拉選單變更事件：同時觸發表格重繪與圖表聯動
    $('#filterWarehouse').on('change', function() {
        appState.currentWhFilter = $(this).val() || 'ALL';
        if (stockDataTableInstance) stockDataTableInstance.draw();
        renderTacticalCharts();
    });

    $('#filterProduct').on('change', function() {
        appState.currentPrdFilter = $(this).val() || 'ALL';
        if (stockDataTableInstance) stockDataTableInstance.draw();
        renderTacticalCharts();
    });

    $('#filterExpiry').on('change', function() {
        appState.currentExpiryFilter = $(this).val() || 'ALL';
        if (stockDataTableInstance) stockDataTableInstance.draw();
        renderTacticalCharts();
    });

    $('#filterStatus').on('change', function() {
        appState.currentStatusFilter = $(this).val() || 'ALL';
        if (stockDataTableInstance) stockDataTableInstance.draw();
        renderTacticalCharts();
    });
}

function refreshView() {
    renderHudMetrics();
    renderStockDataTable();
    renderTacticalCharts();
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

    $('#hudTotalQty').html(totalQty.toLocaleString());
    $('#hudAvailableQty').text(totalAvailable.toLocaleString());
    $('#hudReservedQty').text(totalReserved.toLocaleString());
    $('#hudTotalPieces').html(totalPieces.toLocaleString());
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
            columns: [
                { data: 'warehouse' },
                { data: 'product' },
                { data: 'batch' },
                { data: 'expiry' },
                { data: 'quantity' },
                { data: 'reserved' },
                { data: 'available' },
                { data: 'cost_sv' },
                { data: 'status', className: 'text-center' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });

        // 4 維度正交聯合過濾引擎
        $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
            const row = appState.stocks[dataIndex];
            if (!row) return true;

            // 1. 據點倉儲維度
            if (appState.currentWhFilter && appState.currentWhFilter !== 'ALL' && row.warehouse_id !== appState.currentWhFilter) {
                return false;
            }

            // 2. 產品品項維度
            if (appState.currentPrdFilter && appState.currentPrdFilter !== 'ALL' && row.product_id !== appState.currentPrdFilter) {
                return false;
            }

            // 3. 時效區間維度
            if (appState.currentExpiryFilter && appState.currentExpiryFilter !== 'ALL') {
                const days = getDaysToExpiry(row.expiry_date);
                if (!row.expiry_date) return false;

                if (appState.currentExpiryFilter === 'NORMAL' && days <= 90) return false;
                if (appState.currentExpiryFilter === 'WARNING' && (days > 90 || days <= 0)) return false;
                if (appState.currentExpiryFilter === 'DANGER' && (days > 30 || days <= 0)) return false;
                if (appState.currentExpiryFilter === 'EXPIRED' && days > 0) return false;
            }

            // 4. 庫存狀態維度
            if (appState.currentStatusFilter && appState.currentStatusFilter !== 'ALL') {
                if (appState.currentStatusFilter === 'NORMAL' && row.is_locked === 'Y') return false;
                if (appState.currentStatusFilter === 'LOCKED' && row.is_locked !== 'Y') return false;
            }

            return true;
        });
    }
}

function formatStockRow(s) {
    const days = getDaysToExpiry(s.expiry_date);

    let expiryColor = "bg-success text-success";
    let expiryPercent = Math.min(100, Math.max(10, Math.round((days / 365) * 100)));
    if (days <= 30) expiryColor = "bg-danger text-danger";
    else if (days <= 90) expiryColor = "bg-warning text-warning";

    const isLocked = s.is_locked === 'Y';
    const statusBadge = UIBadges.psi.stockLock(s.is_locked);

    const actionButtons = `
        <button class="btn btn-sm btn-outline-primary" onclick="openEditStockModal('${s.id}')" title="編輯批號">
            <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn btn-sm ${isLocked ? 'btn-outline-success' : 'btn-outline-warning'}" onclick="toggleStockLock('${s.id}')" title="${isLocked ? '解凍批號' : '凍結出庫'}">
            <i class="fa-solid ${isLocked ? 'fa-lock-open' : 'fa-lock'}"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteStockItem('${s.id}')" title="刪除庫存項目">
            <i class="fa-solid fa-trash-alt"></i>
        </button>
    `;

    return {
        id: `<span class="fw-bold text-info">${s.id}</span>`,
        warehouse: `<div><div class="text-white">${getWarehouseName(s.warehouse_id)}</div><span class="badge badge-outline-secondary-subtle small">${s.warehouse_id}</span></div>`,
        product: `<div><div class="fw-bold text-white">${getProductShortName(s.product_id)}</div><span class="small text-secondary">${s.product_id}</span></div>`,
        batch: `<span class="batch-chip fw-bold"><i class="fa-solid fa-barcode"></i> ${s.batch_no || '--'}</span>`,
        expiry: `
            <div style="min-width: 110px;">
                <div class="d-flex justify-content-between small mb-1">
                    <span class="text-light">${s.expiry_date || '--'}</span>
                    <span class="fw-bold ${expiryColor.split(' ')[1]}">${days.toLocaleString()} 天</span>
                </div>
                <div class="expiry-progress">
                    <div class="progress-bar ${expiryColor.split(' ')[0]}" style="width：${expiryPercent}%;"></div>
                </div>
            </div>
        `,
        quantity: `
            <div>
                <span class="fw-bold text-white">${s.quantity}</span> <span class="small text-muted">盒</span>
                ${s.pieces_qty > 0 ? `<div class="mt-1"><span class="badge badge-secondary-subtle small">+${s.pieces_qty} 支/條</span></div>` : ''}
            </div>
        `,
        reserved: `<span class="text-warning">${s.reserved_qty.toLocaleString()}</span>`,
        available: `<span class="fw-bold text-success">${s.available_qty.toLocaleString()}</span>`,
        cost_sv: `<div><span class="small text-light">${s.currency_code==='TWD' ? 'NT$' : 'RM'} ${s.cost_price.toLocaleString()}</span><div class="small text-secondary">${s.sv_point.toLocaleString()} SV</div></div>`,
        status: statusBadge,
        actions: actionButtons
    };
}

// ==========================================================================
// 8. 視覺化圖表渲染 (Chart.js)
// ==========================================================================
function renderTacticalCharts() {
    // 1. 銷毀舊有圖表實例避免記憶體洩漏與渲染殘影
    Object.keys(chartInstances).forEach(k => {
        if (chartInstances[k]) {
            chartInstances[k].destroy();
            chartInstances[k] = null;
        }
    });

    // 2. 取得經過 4 維度篩選後的有效資料集
    const filtered = getFilteredStocks();

    // 通用甜甜圈圖設定（懸浮 Tooltip 即時精算百分比）
    const getDoughnutConfig = (labels, data, colors) => {
        const total = data.reduce((acc, cur) => acc + Number(cur), 0);
        const isEmpty = total === 0 || labels.length === 0;

        return {
            type: 'doughnut',
            data: {
                labels: isEmpty ? ['暫無庫存現貨'] : labels,
                datasets: [{
                    data: isEmpty ? [1] : data,
                    backgroundColor: isEmpty ? ['#334155'] : colors,
                    borderWidth: 0,
                    hoverOffset: isEmpty ? 0 : 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#94a3b8',
                            boxWidth: 8,
                            padding: 8,
                            font: { size: 10 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (isEmpty) return ' 0 盒 (0.0%)';
                                const label = context.label || '';
                                const val = Number(context.parsed) || 0;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                                return ` ${label}：${val.toLocaleString()} 盒 (${pct}%)`;
                            }
                        }
                    }
                }
            }
        };
    };

    // --- 圖表 1：據點倉儲容積佔比 ---
    const ctxWh = document.getElementById('chartWarehouseShare');
    if (ctxWh) {
        const whTotals = {};
        filtered.forEach(s => {
            const name = getWarehouseName(s.warehouse_id);
            whTotals[name] = (whTotals[name] || 0) + s.quantity;
        });
        chartInstances.warehouse = new Chart(ctxWh.getContext('2d'), getDoughnutConfig(
            Object.keys(whTotals),
            Object.values(whTotals),
            ['#a855f7', '#ec4899', '#38bdf8', '#f59e0b', '#10b981', '#6366f1']
        ));
    }

    // --- 圖表 2：產品品項分佈佔比 ---
    const ctxPrd = document.getElementById('chartProductShare');
    if (ctxPrd) {
        const prdTotals = {};
        filtered.forEach(s => {
            const name = getProductShortName(s.product_id);
            prdTotals[name] = (prdTotals[name] || 0) + s.quantity;
        });
        chartInstances.product = new Chart(ctxPrd.getContext('2d'), getDoughnutConfig(
            Object.keys(prdTotals),
            Object.values(prdTotals),
            ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fbbf24', '#34d399', '#f97316']
        ));
    }

    // --- 圖表 3：時效區間階梯佔比 ---
    const ctxExp = document.getElementById('chartExpiryShare');
    if (ctxExp) {
        const expTotals = { '效期充裕 (>90天)': 0, '近效期 (31-90天)': 0, '極限警示 (1-30天)': 0, '已逾期 (≤0天)': 0 };
        filtered.forEach(s => {
            if (!s.expiry_date) return;
            const days = getDaysToExpiry(s.expiry_date);
            if (days <= 0) expTotals['已逾期 (≤0天)'] += s.quantity;
            else if (days <= 30) expTotals['極限警示 (1-30天)'] += s.quantity;
            else if (days <= 90) expTotals['近效期 (31-90天)'] += s.quantity;
            else expTotals['效期充裕 (>90天)'] += s.quantity;
        });

        // 僅保留有現貨盒數的項目呈現
        const activeExpKeys = Object.keys(expTotals).filter(k => expTotals[k] > 0);
        const expColorMap = {
            '效期充裕 (>90天)': '#10b981',
            '近效期 (31-90天)': '#f59e0b',
            '極限警示 (1-30天)': '#f43f5e',
            '已逾期 (≤0天)': '#64748b'
        };

        chartInstances.expiry = new Chart(ctxExp.getContext('2d'), getDoughnutConfig(
            activeExpKeys.length > 0 ? activeExpKeys : Object.keys(expTotals),
            activeExpKeys.length > 0 ? activeExpKeys.map(k => expTotals[k]) : Object.values(expTotals),
            activeExpKeys.length > 0 ? activeExpKeys.map(k => expColorMap[k]) : ['#10b981', '#f59e0b', '#f43f5e', '#64748b']
        ));
    }

    // --- 圖表 4：管制狀態佔比 ---
    const ctxStatus = document.getElementById('chartStatusShare');
    if (ctxStatus) {
        let normalQty = 0;
        let lockedQty = 0;
        filtered.forEach(s => {
            if (s.is_locked === 'Y') lockedQty += s.quantity;
            else normalQty += s.quantity;
        });

        chartInstances.status = new Chart(ctxStatus.getContext('2d'), getDoughnutConfig(
            ['自由流通', '凍結禁出'],
            [normalQty, lockedQty],
            ['#10b981', '#ef4444']
        ));
    }
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

        // 關閉 Modal 並自動向雲端試算表靜默同步最新狀態
        const modalEl = document.getElementById('stockModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        await fetchGoogleSheetsData();
        bootstrap.Modal.getInstance(document.getElementById('stockModal')).hide();
        AppToast.success(`庫存批號【${id}】儲存成功！`);
    } catch (err) {
        AppToast.error("庫存批號儲存失敗: " + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存');
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

        await fetchGoogleSheetsData();
        AppToast.success(`批號【${stockId}】已變更為【${newLock === 'Y' ? '凍結出庫' : '自由流通'}】`);
    } catch (err) {
        AppToast.error("鎖定狀態更新失敗: " + err.message);
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

        await fetchGoogleSheetsData();
        AppToast.success(`批號【${stockId}】已自雲端試算表刪除！`); //[cite: 10]
    } catch (err) {
        AppToast.error("刪除失敗: " + err.message); //[cite: 10]
    }
}