// ==========================================================================
// 1. 系統組態與 4 大試算表來源定義
// ==========================================================================
const SPREADSHEET_CONFIG = {
    sheetPsi: APP_CONFIG.SHEETS.PSI,
    sheetOrg: APP_CONFIG.SHEETS.ORG,
    sheetPsn: APP_CONFIG.SHEETS.PSN,
    sheetPrd: APP_CONFIG.SHEETS.PRD,
    sheetCrm: APP_CONFIG.SHEETS.CRM,
    gasDeploymentId: APP_CONFIG.GAS.PSI
};

// 系統資料狀態庫 (全面移除預設假資料)
let appState = {
    adjustments: [],
    warehouses: [],
    persons: [],
    partners: [],
    products: [],
    customers: [],
    stocks: [],
    filters: {
        startDate: '',
        endDate: '',
        fromWh: 'ALL',
        toWh: 'ALL',
        productId: 'ALL',
        operatorId: 'ALL'
    },
    chartInstances: {
        transferFlow: null,
        variancePareto: null,
        whActivity: null,
        lossTopPrd: null,
        svDist: null,
        transferTopPrd: null
    }
};

let dtAdjustmentsInstance = null;
let dtTransfersInstance = null;
let isInitialized = false;

// ==========================================================================
// 2. 欄位物理索引取值器 (0-Based 絕對物理順序)
// ==========================================================================
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

function getFormattedNow() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 依據幣別標準化金額格式 (支援 NT$ 與 RM)
 */
function formatCurrency(amount, currencyCode = 'TWD') {
    const num = parseFloat(amount) || 0;
    const prefix = currencyCode === 'MYR' ? 'RM ' : 'NT$ ';
    return `${prefix}${num.toLocaleString()}`;
}

/**
 * 取得符合當前 6 大全域篩選條件之單據資料集
 */
function getFilteredAdjustments() {
    return appState.adjustments.filter(item => {
        const f = appState.filters;

        // 1. 發生日期起
        if (f.startDate && item.adj_date && item.adj_date < f.startDate) {
            return false;
        }
        // 2. 發生日期迄
        if (f.endDate && item.adj_date && item.adj_date > f.endDate) {
            return false;
        }
        // 3. 調出倉庫
        if (f.fromWh && f.fromWh !== 'ALL' && item.from_warehouse_id !== f.fromWh) {
            return false;
        }
        // 4. 調入倉庫
        if (f.toWh && f.toWh !== 'ALL' && item.to_warehouse_id !== f.toWh) {
            return false;
        }
        // 5. 產品品項
        if (f.productId && f.productId !== 'ALL') {
            const isMatch = (item.product_id === f.productId) || (item.official_product_code === f.productId);
            if (!isMatch) return false;
        }
        // 6. 經手夥伴
        if (f.operatorId && f.operatorId !== 'ALL' && item.operator_partner_id !== f.operatorId) {
            return false;
        }

        return true;
    });
}

// ==========================================================================
// 3. 實體名稱權重解析核心 (接軌 EntityResolver)
// ==========================================================================
function getPersonResolvedName(personId, displayMode = 1) {
    return EntityResolver.person(personId, appState.persons, displayMode);
}

function getPartnerResolvedName(partnerId, displayMode = 1) {
    return EntityResolver.partner(partnerId, appState.partners, appState.persons, displayMode);
}

function getCustomerResolvedName(customerId, displayMode = 1) {
    return EntityResolver.customer(customerId, appState.customers, appState.persons, displayMode);
}

function getWarehouseDisplayName(whId, displayMode = 1) {
    return EntityResolver.warehouse(whId, appState.warehouses, displayMode);
}

// ==========================================================================
// 4. 生命週期與資料拉取引擎 (跨 4 大試算表物理順序讀取)
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(SPREADSHEET_CONFIG.gasDeploymentId);
    }
    await initAdjustApp();
});

async function initAdjustApp() {
    if (isInitialized) return;
    isInitialized = true;

    initEvents();
    await fetchAllGoogleSheetsData();
}

async function fetchGoogleSheetCsv(spreadsheetId, sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`讀取工作表 [${sheetName}] 失敗 (HTTP ${res.status})`);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
    return (parsed.data || []).slice(1);
}

/**
 * 資料讀取引擎
 */
async function fetchAllGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i> 正在讀取雲端資料庫...', '載入中...');

    try {
        const [rawWarehouses, rawAdjustments, rawPersons, rawPartners, rawProducts, rawCustomers, rawStocks] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '據點倉儲').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '盤點調撥').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsn, '個人主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetOrg, '夥伴主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPrd, '產品主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetCrm, '客戶主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '庫存主檔').catch(() => [])
        ]);

        parseAllData({
            rawWarehouses,
            rawAdjustments,
            rawPersons,
            rawPartners,
            rawProducts,
            rawCustomers,
            rawStocks
        });
        refreshAllViews();
        $('#hudSyncTime').text(getFormattedNow());

        AppToast.success(`4 大試算表連動同步完成 (${appState.adjustments.length} 筆盤點調撥紀錄)`);
    } catch (err) {
        console.error("試算表同步異常:", err);
        AppToast.error("部分試算表連線失敗，請檢查 4 大試算表共用設定");
    } finally {
        AppLoading.hide();
    }
}

/**
 * 嚴格依 0-Based 絕對物理欄位順序解析各工作表資料
 */
function parseAllData(data) {
    // 1. 解析據點倉儲 (表 301: psi_warehouses)
    appState.warehouses = (data.rawWarehouses || []).map(r => ({
        id: getVal(r, 0),
        warehouse_name: getVal(r, 1),
        warehouse_type: getVal(r, 2, 'OFFICIAL_CENTER')
    })).filter(w => w.id !== '');

    // 2. 解析個人主檔 (表 201 / psn_master)
    appState.persons = (data.rawPersons || []).map(r => ({
        person_id: getVal(r, 0),
        name_zh: getVal(r, 1),
        name_en: getVal(r, 2),
        preferred_name: getVal(r, 3),
        display_name: getVal(r, 4)
    })).filter(p => p.person_id !== '');

    // 3. 解析夥伴主檔 (表 202: org_partners)
    appState.partners = (data.rawPartners || []).map(r => ({
        partner_id: getVal(r, 0),
        person_id: getVal(r, 1),
        member_no: getVal(r, 2),
        leader_title: getVal(r, 3)
    })).filter(p => p.partner_id !== '');

    // 4. 解析客戶主檔 (表 401: crm_customers)
    appState.customers = (data.rawCustomers || []).map(r => ({
        customer_id: getVal(r, 0),
        person_id: getVal(r, 1),
        customer_type: getVal(r, 2, 'RETAIL')
    })).filter(c => c.customer_id !== '');

    // 5. 解析產品主檔 (表 101: prd_items)
    appState.products = (data.rawProducts || []).map(r => ({
        product_code: getVal(r, 0),
        region_code: getVal(r, 1, 'TW'),
        official_product_code: getVal(r, 2) || getVal(r, 0),
        name: getVal(r, 3),
        short_name: getVal(r, 4),
        price: parseFloat(getVal(r, 11, '0')) || 0,
        sv_point: parseInt(getVal(r, 13, '0'), 10) || 0
    })).filter(p => p.product_code !== '');

    // 6. 解析庫存主檔 (表 302: psi_stocks)
    appState.stocks = (data.rawStocks || []).map(r => ({
        id: getVal(r, 0),
        warehouse_id: getVal(r, 1),
        product_id: getVal(r, 2),
        batch_no: getVal(r, 3),
        expiry_date: getVal(r, 4),
        quantity: parseInt(getVal(r, 5, '0'), 10) || 0,
        pieces_qty: parseInt(getVal(r, 6, '0'), 10) || 0,
        reserved_qty: parseInt(getVal(r, 7, '0'), 10) || 0,
        available_qty: parseInt(getVal(r, 8, '0'), 10) || 0,
        currency_code: getVal(r, 9, 'TWD'),
        cost_price: parseFloat(getVal(r, 10, '0')) || 0,
        sv_point: parseInt(getVal(r, 11, '0'), 10) || 0
    })).filter(s => s.id !== '');

    // 7. 解析盤點調撥 (表 307: psi_adjustments, 0~24 實體欄位順序)
    appState.adjustments = (data.rawAdjustments || []).map(r => {
        const qty = parseInt(getVal(r, 11, '0'), 10) || 0;
        const unitCost = parseFloat(getVal(r, 13, '0')) || 0;
        const rawTotalCost = getVal(r, 14);
        const totalCost = (rawTotalCost !== '') ? (parseFloat(rawTotalCost) || 0) : (Math.abs(qty) * unitCost);
        const unitSv = parseInt(getVal(r, 15, '0'), 10) || 0;
        const rawTotalSv = getVal(r, 16);
        const totalSv = (rawTotalSv !== '') ? (parseInt(rawTotalSv, 10) || 0) : (Math.abs(qty) * unitSv);

        return {
            id: getVal(r, 0),
            adj_type: getVal(r, 1, '跨倉調撥'),
            from_warehouse_id: getVal(r, 2),
            to_warehouse_id: getVal(r, 3),
            official_product_code: getVal(r, 4),
            product_name_snaps: getVal(r, 5),
            product_id: getVal(r, 6),
            stock_id: getVal(r, 7),
            batch_no: getVal(r, 8),
            expiry_date: getVal(r, 9),
            adj_unit: getVal(r, 10, '盒'),
            quantity: qty,
            currency_code: getVal(r, 12, 'TWD'),
            unit_cost: unitCost,
            total_cost: totalCost,
            unit_sv: unitSv,
            total_sv: totalSv,
            target_prospect_id: getVal(r, 17),
            operator_partner_id: getVal(r, 18),
            adj_date: getVal(r, 19),
            reason_desc: getVal(r, 20),
            created_by: getVal(r, 21, 'SYSTEM'),
            created_at: getVal(r, 22),
            modified_by: getVal(r, 23, 'SYSTEM'),
            modified_at: getVal(r, 24)
        };
    }).filter(a => a.id !== '');
}

// ==========================================================================
// 5. 畫面渲染與視圖更新中樞
// ==========================================================================
function refreshAllViews() {
    populateSelectOptions();
    renderMetrics();
    renderAdjustmentsTable();
    renderTransfersTable();
    renderCharts();
    loadProductStockForAudit();
    updateTransferCostCalc();
}

function populateSelectOptions() {
    // 嚴格過濾排除官方營運中心，僅保留自營私倉與海外/在途倉
    const nonOfficialWarehouseFilter = w => {
        const type = String(w.warehouse_type || '').toUpperCase();
        return !type.includes('官方') && !type.includes('OFFICIAL') && w.id !== 'WH-TW-TP' && w.id !== 'WH-TW-KH';
    };

    // ==========================================
    // 頂部 4 個全域篩選下拉選單 (共用 UISelectOptions)
    // ==========================================
    // 1. 調出倉庫
    UISelectOptions.warehouse.populate({
        target: '#filterFromWarehouse',
        warehouses: appState.warehouses,
        placeholder: '全部調出倉',
        selectedValue: appState.filters.fromWh === 'ALL' ? '' : appState.filters.fromWh,
        displayMode: 1,
        searchable: true,
        filterFn: nonOfficialWarehouseFilter
    });

    // 2. 調入倉庫
    UISelectOptions.warehouse.populate({
        target: '#filterToWarehouse',
        warehouses: appState.warehouses,
        placeholder: '全部調入倉',
        selectedValue: appState.filters.toWh === 'ALL' ? '' : appState.filters.toWh,
        displayMode: 1,
        searchable: true,
        filterFn: nonOfficialWarehouseFilter
    });

    // 3. 產品品項
    UISelectOptions.product.populate({
        target: '#filterProduct',
        products: appState.products,
        placeholder: '全部產品品項',
        selectedValue: appState.filters.productId === 'ALL' ? '' : appState.filters.productId,
        searchable: true
    });

    // 4. 經手夥伴
    UISelectOptions.partner.populate({
        target: '#filterOperator',
        partners: appState.partners,
        persons: appState.persons,
        placeholder: '全部經手夥伴',
        selectedValue: appState.filters.operatorId === 'ALL' ? '' : appState.filters.operatorId,
        searchable: true
    });

    // ==========================================
    // 工作台與彈窗選單
    // ==========================================
    // 盤點工作台選單 (綁定 #modalAuditWorkbench)
    UISelectOptions.warehouse.populate({
        target: '#auditWarehouseSelect',
        warehouses: appState.warehouses,
        placeholder: '-- 請選擇盤點自營倉儲 --',
        displayMode: 1,
        searchable: true,
        dropdownParent: '#modalAuditWorkbench',
        filterFn: nonOfficialWarehouseFilter
    });

    UISelectOptions.product.populate({
        target: '#auditProductSelect',
        products: appState.products,
        dropdownParent: '#modalAuditWorkbench'
    });

    UISelectOptions.partner.populate({
        target: '#auditOperatorSelect',
        partners: appState.partners,
        persons: appState.persons,
        dropdownParent: '#modalAuditWorkbench'
    });

    UISelectOptions.customer.populate({
        target: '#auditProspectSelect',
        customers: appState.customers,
        persons: appState.persons,
        placeholder: '-- 非試用體驗無須選擇 --',
        dropdownParent: '#modalAuditWorkbench'
    });

    // 調撥工作台選單 (綁定 #modalTransferWorkbench)
    ['#trFromWarehouseSelect', '#trToWarehouseSelect'].forEach(target => {
        UISelectOptions.warehouse.populate({
            target,
            warehouses: appState.warehouses,
            placeholder: target.includes('From') ? '-- 請選擇調出來源倉 --' : '-- 請選擇調入目的倉 --',
            displayMode: 1,
            searchable: true,
            dropdownParent: '#modalTransferWorkbench',
            filterFn: nonOfficialWarehouseFilter
        });
    });

    UISelectOptions.product.populate({
        target: '#trProductSelect',
        products: appState.products,
        dropdownParent: '#modalTransferWorkbench'
    });

    UISelectOptions.partner.populate({
        target: '#trOperatorSelect',
        partners: appState.partners,
        persons: appState.persons,
        dropdownParent: '#modalTransferWorkbench'
    });
}

function renderMetrics() {
    const filtered = getFilteredAdjustments();
    let transferQty = 0;
    let transferBatches = 0;
    let lossAmount = 0;
    let lossBoxes = 0;
    let demoQty = 0;
    let demoCost = 0;
    let unboxingQty = 0;

    filtered.forEach(item => {
        const absQty = Math.abs(item.quantity);
        const itemCost = parseFloat(item.total_cost) || 0;

        if (item.adj_type === '跨倉調撥') {
            transferQty += absQty;
            transferBatches++;
        } else if (item.adj_type === '盤虧' || item.adj_type === '破損過期') {
            lossAmount += itemCost;
            lossBoxes += absQty;
        } else if (item.adj_type === '試用發放' || item.adj_type === '自用消耗') {
            demoQty += absQty;
            demoCost += itemCost;
        } else if (item.adj_type === '拆盒解封') {
            unboxingQty += absQty;
        }
    });

    $('#statTransferQty').text(`${transferQty.toLocaleString()} 盒`);
    $('#statTransferBatches').text(transferBatches.toLocaleString());
    $('#statLossAmount').text(`NT$ ${lossAmount.toLocaleString()}`);
    $('#statLossBoxes').text(lossBoxes.toLocaleString());
    $('#statDemoCost').text(`NT$ ${demoCost.toLocaleString()}`);
    $('#statDemoQty').text(`${demoQty.toLocaleString()}`);
    $('#statUnboxingQty').text(`${unboxingQty.toLocaleString()} 支/條`);
}

function switchTacticalMode(mode) {
    appState.currentTacticalMode = mode;
    if (mode === 'AUDIT') {
        $('#btnModeAudit').addClass('active');
        $('#btnModeTransfer').removeClass('active');
        $('#sectionAuditWorkbench').removeClass('d-none');
        $('#sectionTransferWorkbench').addClass('d-none');
        if (dtAdjustmentsInstance) dtAdjustmentsInstance.columns.adjust().responsive;
    } else {
        $('#btnModeTransfer').addClass('active');
        $('#btnModeAudit').removeClass('active');
        $('#sectionTransferWorkbench').removeClass('d-none');
        $('#sectionAuditWorkbench').addClass('d-none');
        if (dtTransfersInstance) dtTransfersInstance.columns.adjust().responsive;
    }
}

function renderAdjustmentsTable() {
    const filtered = getFilteredAdjustments();
    const formatted = filtered.map(a => {
        const typeBadge = UIBadges.psi.adjustType(a.adj_type);

        const operatorResolved = getPartnerResolvedName(a.operator_partner_id);
        const prospectResolved = a.target_prospect_id ? getCustomerResolvedName(a.target_prospect_id) : '';

        const qtyTag = a.quantity > 0 
            ? `<span class="fw-bold text-success mono-mun">+${a.quantity}</span>` 
            : (a.quantity < 0 ? `<span class="fw-bold text-danger mono-mun">${a.quantity}</span>` : `<span class="fw-bold text-info">0</span>`);

        const actionButtons = `
            <div class="d-flex align-items-center justify-content-center gap-1">
                <button class="btn btn-sm btn-outline-info" title="查看詳細資料" onclick="openAdjustmentDetailDrawer('${a.id}')">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>
                <button class="btn btn-sm btn-outline-primary" title="編輯單據" onclick="openEditAdjustmentModal('${a.id}')">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" title="刪除單據" onclick="deleteAdjustmentRecord('${a.id}')">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;

        return {
            id_and_type: `
                <div>
                    <div class="fw-bold text-info-emphasis">${a.id}</div>
                    ${typeBadge}
                </div>
            `,
            warehouses: `
                <div>
                    <span class="text-white">${getWarehouseDisplayName(a.from_warehouse_id)}</span>
                    ${a.to_warehouse_id ? `<div class="text-info small mt-1"><i class="fa-solid fa-arrow-down-long me-1"></i>${getWarehouseDisplayName(a.to_warehouse_id)}</div>` : ''}
                </div>
            `,
            product_batch: `
                <div>
                    <div class="fw-bold text-white">${a.product_name_snaps || '-'}</div>
                    <span class="text-primary-emphasis small">批號：${a.batch_no || '-'}</span>
                </div>
            `,
            quantity_unit: `
                <div>
                    ${qtyTag} <span class="text-muted-emphasis">${a.adj_unit}</span>
                </div>
            `,
            cost_breakdown: `
                <div>
                    <div class="fw-bold text-warning">${formatCurrency(a.total_cost, a.currency_code)}</div>
                    <div class="text-warning-emphasis small d-none">@ ${formatCurrency(a.unit_cost, a.currency_code)}</div>
                </div>
            `,
            sv_breakdown: `<span class="text-teal fw-bold">${a.total_sv.toLocaleString()} SV</span>`,
            parties: `
                <div>
                    <div class="text-white fw-bold"><i class="fa-solid fa-user-shield text-primary me-1"></i>${operatorResolved}</div>
                    ${prospectResolved ? `<div class="small text-info"><i class="fa-solid fa-user text-warning me-1"></i>對象：${prospectResolved}</div>` : ''}
                </div>
            `,
            date_info: `<span class="text-light">${a.adj_date}</span>`,
            actions: actionButtons
        };
    });

    if (dtAdjustmentsInstance) {
        dtAdjustmentsInstance.clear();
        dtAdjustmentsInstance.rows.add(formatted);
        dtAdjustmentsInstance.draw();
    } else {
        dtAdjustmentsInstance = $('#tableAdjustments').DataTable({
            data: formatted,
            order: [[7, 'desc']],
            columns: [
                { data: 'id_and_type' },
                { data: 'warehouses' },
                { data: 'product_batch' },
                { data: 'quantity_unit', className: 'text-end' },
                { data: 'cost_breakdown', className: 'text-end' },
                { data: 'sv_breakdown', className: 'text-end' },
                { data: 'parties' },
                { data: 'date_info' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }
}

function renderTransfersTable() {
    const filtered = getFilteredAdjustments();
    const transfersOnly = filtered.filter(a => a.adj_type === '跨倉調撥');
    const formatted = transfersOnly.map(t => {
        const operatorResolved = getPartnerResolvedName(t.operator_partner_id);

        const actionButtons = `
            <div class="d-flex align-items-center justify-content-center gap-1">
                <button class="btn btn-sm btn-outline-info" title="查看詳細資料" onclick="openAdjustmentDetailDrawer('${t.id}')">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>
                <button class="btn btn-sm btn-outline-primary" title="編輯調撥單" onclick="openEditAdjustmentModal('${t.id}')">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" title="刪除單據" onclick="deleteAdjustmentRecord('${t.id}')">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;

        return {
            id_and_date: `
                <div>
                    <div class="fw-bold text-info-emphasis">${t.id}</div>
                    <div class="text-secondary small">${t.adj_date}</div>
                </div>
            `,
            route: `
                <div>
                    <span class="text-white">${getWarehouseDisplayName(t.from_warehouse_id)}</span>
                    <div class="text-info small mt-1"><i class="fa-solid fa-arrow-down-long me-1"></i>${getWarehouseDisplayName(t.to_warehouse_id) || '未指定'}</div>
                </div>
            `,
            product: `
                <div>
                    <div class="fw-bold text-white">${t.product_name_snaps || '-'}</div>
                    <span class="text-primary-emphasis small">批號：${t.batch_no || '-'}</span>
                </div>
            `,
            quantity: `<span class="text-info">${Math.abs(t.quantity)} ${t.adj_unit}</span>`,
            cost: `<span class="text-warning fw-bold">${formatCurrency(t.total_cost, t.currency_code)}</span>`,
            sv: `<span class="text-teal fw-bold">${t.total_sv.toLocaleString()} SV</span>`,
            operator: `<span class="text-light">${operatorResolved}</span>`,
            actions: actionButtons
        };
    });

    if (dtTransfersInstance) {
        dtTransfersInstance.clear();
        dtTransfersInstance.rows.add(formatted);
        dtTransfersInstance.draw();
    } else {
        dtTransfersInstance = $('#tableTransfers').DataTable({
            data: formatted,
            order: [[0, 'desc']],
            columns: [
                { data: 'id_and_date' },
                { data: 'route' },
                { data: 'product' },
                { data: 'quantity', className: 'text-end' },
                { data: 'cost', className: 'text-end' },
                { data: 'sv', className: 'text-end' },
                { data: 'operator' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }
}

/**
 * 開啟右側抽屜查看盤點調撥單據詳細資料
 */
function openAdjustmentDetailDrawer(adjId) {
    const item = appState.adjustments.find(a => a.id === adjId);
    if (!item) {
        AppToast.warning("找不到該筆單據資料！");
        return;
    }

    const typeBadge = UIBadges.psi.adjustType(item.adj_type);
    const operatorName = getPartnerResolvedName(item.operator_partner_id);
    const prospectName = item.target_prospect_id ? getCustomerResolvedName(item.target_prospect_id) : '無';
    const fromWh = getWarehouseDisplayName(item.from_warehouse_id);
    const toWh = item.to_warehouse_id ? getWarehouseDisplayName(item.to_warehouse_id) : '無 (單倉異動)';

    const qtyDisplay = (item.quantity > 0 ? `+${item.quantity.toLocaleString()}` : item.quantity.toLocaleString()) + ` ${item.adj_unit}`;
    const costDisplay = formatCurrency(item.total_cost, item.currency_code);
    const unitCostDisplay = formatCurrency(item.unit_cost, item.currency_code);
    const svDisplay = `${(item.total_sv || 0).toLocaleString()} SV`;
    const unitSvDisplay = `${(item.unit_sv || 0).toLocaleString()} SV`;

    const html = `
        <article class="card p-3 mb-3 border-secondary border-opacity-25" style="background: rgba(19, 10, 33, 0.4);">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-secondary small">單據編號 (PK)</span>
                <span class="text-info-emphasis fw-bold">${item.id}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-secondary small">異動類型</span>
                <div>${typeBadge}</div>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-secondary small">調整發生日期</span>
                <span class="text-light">${item.adj_date || '-'}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center">
                <span class="text-secondary small">扣庫庫存編號</span>
                <span class="text-info-emphasis fw-bold">${item.stock_id}</span>
            </div>
        </article>

        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-3 d-flex align-items-center gap-2 border-bottom border-secondary border-opacity-25 pb-2">
                <i class="fa-solid fa-boxes-stacked text-primary"></i> 異動物資品項明細
            </h6>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">產品名稱快照</div>
                <div class="col-7 text-white fw-bold text-end">${item.product_name_snaps || '-'}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">官方產品編號</div>
                <div class="col-7 text-info text-end font-monospace">${item.official_product_code || item.product_id || '-'}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">異動批號</div>
                <div class="col-7 text-end text-primary-emphasis font-monospace">${item.batch_no || '-'}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">效期截止日</div>
                <div class="col-7 text-light text-end">${item.expiry_date || '-'}</div>
            </div>
            <div class="row g-2">
                <div class="col-5 text-secondary small">異動數量</div>
                <div class="col-7 text-end fw-bold fs-6 ${item.quantity >= 0 ? 'text-success' : 'text-danger'}">${qtyDisplay}</div>
            </div>
        </article>

        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-3 d-flex align-items-center gap-2 border-bottom border-secondary border-opacity-25 pb-2">
                <i class="fa-solid fa-warehouse text-info"></i> 倉儲流轉與經手資訊
            </h6>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">調出/發生倉儲</div>
                <div class="col-7 text-white text-end">${fromWh}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">調入目的倉儲</div>
                <div class="col-7 text-info text-end">${toWh}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">執行經手夥伴</div>
                <div class="col-7 text-white text-end fw-bold">${operatorName}</div>
            </div>
            <div class="row g-2">
                <div class="col-5 text-secondary small">試用體驗對象</div>
                <div class="col-7 text-warning text-end">${prospectName}</div>
            </div>
        </article>

        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-3 d-flex align-items-center gap-2 border-bottom border-secondary border-opacity-25 pb-2">
                <i class="fa-solid fa-calculator text-warning"></i> 成本損益與 SV 結算
            </h6>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">單件成本</div>
                <div class="col-7 text-warning-emphasis text-end">${unitCostDisplay}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">成本總損益 / 額度</div>
                <div class="col-7 text-warning fw-bold text-end">${costDisplay}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">單件 SV</div>
                <div class="col-7 text-teal-emphasis text-end">${unitSvDisplay}</div>
            </div>
            <div class="row g-2">
                <div class="col-5 text-secondary small">影響總 SV</div>
                <div class="col-7 text-teal fw-bold text-end">${svDisplay}</div>
            </div>
        </article>

        <article class="card p-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-2 d-flex align-items-center gap-2">
                <i class="fa-solid fa-comment-dots text-secondary"></i> 詳細事由與物流說明
            </h6>
            <div class="text-light small p-2 rounded" style="background: rgba(10, 5, 18, 0.4);">
                ${item.reason_desc || '未填寫詳細說明'}
            </div>
        </article>
    `;

    $('#drawerAdjustDetailBody').html(html);
    const drawerEl = document.getElementById('drawerAdjustDetail');
    const drawerInstance = bootstrap.Offcanvas.getOrCreateInstance(drawerEl);
    drawerInstance.show();
}

function renderCharts() {
    // 1. 銷毀既有所有圖表實例
    Object.keys(appState.chartInstances).forEach(k => {
        if (appState.chartInstances[k]) {
            appState.chartInstances[k].destroy();
            appState.chartInstances[k] = null;
        }
    });

    const adjustments = getFilteredAdjustments();

    // --- 圖表 1：跨倉調撥與異動流通月度趨勢 (折線雙軸) ---
    const ctxTransfer = document.getElementById('chartTransferFlow');
    if (ctxTransfer) {
        const transferMonthMap = {};
        const lossCostMonthMap = {};

        adjustments.filter(a => a.adj_type === '跨倉調撥').forEach(t => {
            const m = (t.adj_date || '').slice(0, 7) || '未分類';
            transferMonthMap[m] = (transferMonthMap[m] || 0) + Math.abs(t.quantity);
        });

        adjustments.filter(a => a.adj_type === '盤虧' || a.adj_type === '破損過期').forEach(l => {
            const m = (l.adj_date || '').slice(0, 7) || '未分類';
            lossCostMonthMap[m] = (lossCostMonthMap[m] || 0) + (parseFloat(l.total_cost) || 0);
        });

        const allMonths = Array.from(new Set([...Object.keys(transferMonthMap), ...Object.keys(lossCostMonthMap)])).sort();

        appState.chartInstances.transferFlow = new Chart(ctxTransfer, {
            type: 'line',
            data: {
                labels: allMonths,
                datasets: [
                    {
                        label: '跨倉調撥流通總量 (盒)',
                        data: allMonths.map(m => transferMonthMap[m] || 0),
                        borderColor: '#38bdf8',
                        backgroundColor: '#38bdf8',
                        fill: false,
                        tension: 0.35,
                        pointRadius: 4,
                        yAxisID: 'yQty'
                    },
                    {
                        label: '盤損與過期報廢成本 (NT$)',
                        data: allMonths.map(m => lossCostMonthMap[m] || 0),
                        borderColor: '#fb7185',
                        backgroundColor: '#fb7185',
                        fill: false,
                        tension: 0.35,
                        pointRadius: 4,
                        borderDash: [5, 5],
                        yAxisID: 'yCost'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { ticks: { color: '#a78bfa' }, grid: { color: 'rgba(139, 92, 246, 0.1)' } },
                    yQty: {
                        type: 'linear', position: 'left',
                        ticks: { color: '#38bdf8', callback: v => `${v.toLocaleString()} 盒` },
                        grid: { color: 'rgba(56, 189, 248, 0.15)' }
                    },
                    yCost: {
                        type: 'linear', position: 'right',
                        ticks: { color: '#fb7185', callback: v => `NT$ ${v.toLocaleString()}` },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#f5f3ff', font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const val = ctx.parsed.y || 0;
                                return ctx.dataset.yAxisID === 'yCost'
                                    ? ` ${ctx.dataset.label}：NT$ ${val.toLocaleString()}`
                                    : ` ${ctx.dataset.label}：${val.toLocaleString()} 盒`;
                            }
                        }
                    }
                }
            }
        });
    }

    // --- 圖表 2：庫存異動類型佔比分佈 (甜甜圈圖) ---
    const ctxPareto = document.getElementById('chartVariancePareto');
    if (ctxPareto) {
        const types = ['跨倉調撥', '盤盈', '盤虧', '破損過期', '自用消耗', '試用發放', '拆盒解封'];
        const counts = types.map(t => adjustments.filter(a => a.adj_type === t).length);
        const totalCount = counts.reduce((acc, c) => acc + c, 0);

        appState.chartInstances.variancePareto = new Chart(ctxPareto, {
            type: 'doughnut',
            data: {
                labels: types,
                datasets: [{
                    data: counts,
                    backgroundColor: ['#38bdf8', '#34d399', '#fb7185', '#ec4899', '#c084fc', '#fbbf24', '#0284c7'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#e2d9f3', boxWidth: 8, font: { size: 9 } } },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const val = ctx.parsed || 0;
                                const pct = totalCount > 0 ? ((val / totalCount) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：${val.toLocaleString()} 筆 (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // --- 圖表 3：各據點異動熱度 (調出 / 調入雙軌水平長條圖) ---
    const ctxWhAct = document.getElementById('chartWarehouseActivity');
    if (ctxWhAct) {
        const whMap = {};
        adjustments.forEach(a => {
            if (a.from_warehouse_id) {
                const name = getWarehouseDisplayName(a.from_warehouse_id);
                if (!whMap[name]) whMap[name] = { outCount: 0, inCount: 0 };
                whMap[name].outCount++;
            }
            if (a.to_warehouse_id) {
                const name = getWarehouseDisplayName(a.to_warehouse_id);
                if (!whMap[name]) whMap[name] = { outCount: 0, inCount: 0 };
                whMap[name].inCount++;
            }
        });

        const whLabels = Object.keys(whMap);
        const outData = whLabels.map(k => whMap[k].outCount);
        const inData = whLabels.map(k => whMap[k].inCount);

        appState.chartInstances.whActivity = new Chart(ctxWhAct, {
            type: 'bar',
            data: {
                labels: whLabels,
                datasets: [
                    { label: '調出/發生次數', data: outData, backgroundColor: '#c084fc', borderRadius: 4 },
                    { label: '調入轉移次數', data: inData, backgroundColor: '#38bdf8', borderRadius: 4 }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#e2d9f3', boxWidth: 8, font: { size: 9 } } },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.dataset.label}：${Number(ctx.parsed.x).toLocaleString()} 次`
                        }
                    }
                }
            }
        });
    }

    // --- 圖表 4：損耗成本品項分佈佔比 (甜甜圈佔比圖，不限 Top 5) ---
    const ctxLossPrd = document.getElementById('chartLossPrd');
    if (ctxLossPrd) {
        const lossPrdMap = {};

        // 彙整盤虧與破損過期單據之各品項損耗總成本 (NT$)
        adjustments.filter(a => a.adj_type === '盤虧' || a.adj_type === '破損過期').forEach(a => {
            const name = a.product_name_snaps || a.product_id || '未知品項';
            const cost = parseFloat(a.total_cost) || 0;
            if (cost > 0) {
                lossPrdMap[name] = (lossPrdMap[name] || 0) + cost;
            }
        });

        // 不設 Top 5 截斷，依損耗金額由高至低完整排序
        const sortedLoss = Object.entries(lossPrdMap).sort((a, b) => b[1] - a[1]);
        const labels = sortedLoss.map(i => i[0]);
        const data = sortedLoss.map(i => i[1]);
        const totalLossAmount = data.reduce((sum, val) => sum + val, 0);

        // 警示與損耗主題高辨識循環色盤
        const lossPalette = [
            '#fb7185', '#f43f5e', '#e11d48', '#f97316', '#ea580c',
            '#fbbf24', '#d97706', '#c084fc', '#a855f7', '#818cf8', '#64748b'
        ];
        const backgroundColors = labels.map((_, idx) => lossPalette[idx % lossPalette.length]);

        appState.chartInstances.lossTopPrd = new Chart(ctxLossPrd, {
            type: 'doughnut',
            data: {
                labels: labels.length > 0 ? labels : ['無盤損與報廢紀錄'],
                datasets: [{
                    data: data.length > 0 ? data : [1],
                    backgroundColor: data.length > 0 ? backgroundColors : ['#334155'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#e2d9f3', boxWidth: 8, font: { size: 9 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                if (data.length === 0) return ' NT$ 0 (0.0%)';
                                const val = ctx.parsed || 0;
                                const pct = totalLossAmount > 0 ? ((val / totalLossAmount) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：NT$ ${val.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // --- 圖表 5：試用發放 vs 自用消耗成本佔比 (甜甜圈圖) ---
    const ctxCost = document.getElementById('chartCostDistribution');
    if (ctxCost) {
        let demoCost = 0;
        let selfCost = 0;

        adjustments.forEach(a => {
            const cost = parseFloat(a.total_cost) || 0;
            if (a.adj_type === '試用發放') demoCost += cost;
            else if (a.adj_type === '自用消耗') selfCost += cost;
        });

        const totalPromoCost = demoCost + selfCost;

        appState.chartInstances.svDist = new Chart(ctxCost, {
            type: 'doughnut',
            data: {
                labels: ['試用發放 (拓展)', '自用消耗 (內部)'],
                datasets: [{
                    data: [demoCost, selfCost],
                    backgroundColor: ['#fbbf24', '#c084fc'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#e2d9f3', boxWidth: 8, font: { size: 9 } } },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const val = ctx.parsed || 0;
                                const pct = totalPromoCost > 0 ? ((val / totalPromoCost) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：NT$ ${val.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // --- 圖表 6：跨倉調撥品項流通佔比 (甜甜圈佔比圖，不限 Top 5) ---
    const ctxTransferTop = document.getElementById('chartTransferPrd');
    if (ctxTransferTop) {
        const transferPrdMap = {};

        // 彙整所有跨倉調撥之各品項流通盒數
        adjustments.filter(a => a.adj_type === '跨倉調撥').forEach(a => {
            const name = a.product_name_snaps || a.product_id || '未知品項';
            const qty = Math.abs(a.quantity);
            if (qty > 0) {
                transferPrdMap[name] = (transferPrdMap[name] || 0) + qty;
            }
        });

        // 不限 Top 5，依調撥流通總量由高至低完整排序
        const sortedTransfer = Object.entries(transferPrdMap).sort((a, b) => b[1] - a[1]);
        const labels = sortedTransfer.map(i => i[0]);
        const data = sortedTransfer.map(i => i[1]);
        const totalTransferQty = data.reduce((sum, val) => sum + val, 0);

        // 支援多品項循環高辨識戰術色盤
        const palette = [
            '#34d399', '#38bdf8', '#fbbf24', '#c084fc', '#fb7185',
            '#a855f7', '#ec4899', '#f97316', '#10b981', '#0284c7', '#818cf8', '#64748b'
        ];
        const backgroundColors = labels.map((_, idx) => palette[idx % palette.length]);

        appState.chartInstances.transferTopPrd = new Chart(ctxTransferTop, {
            type: 'doughnut',
            data: {
                labels: labels.length > 0 ? labels : ['無調撥流通紀錄'],
                datasets: [{
                    data: data.length > 0 ? data : [1],
                    backgroundColor: data.length > 0 ? backgroundColors : ['#334155'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#e2d9f3', boxWidth: 8, font: { size: 9 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                if (data.length === 0) return ' 0 盒 (0.0%)';
                                const val = ctx.parsed || 0;
                                const pct = totalTransferQty > 0 ? ((val / totalTransferQty) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：${val.toLocaleString()} 盒 (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// ==========================================================================
// 6. 工作台交互運算與 C/R/U/D 實體回寫引擎
// ==========================================================================
function initEvents() {
    // 現場盤點品項與倉儲變動監聽
    $(document).on('change', '#auditProductSelect, #auditWarehouseSelect', function () {
        loadProductStockForAudit();
    });

    // 跨倉調撥品項與來源倉變動監聽
    $(document).on('change', '#trProductSelect, #trFromWarehouseSelect', function () {
        loadProductStockForTransfer();
    });

    // 跨倉調撥數量輸入監聽
    $(document).on('input change', '#trQtyInput', function () {
        updateTransferCostCalc();
    });

    // Tab 頁籤切換監聽 (參考 psi-stock.js 規範)
    $('#adjustViewTabs button[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        const targetId = $(e.target).attr('data-bs-target');
        if (targetId === '#container-audit-view') {
            if (dtAdjustmentsInstance) {
                setTimeout(() => dtAdjustmentsInstance.columns.adjust().draw(false), 100);
            }
        } else if (targetId === '#container-transfer-view') {
            if (dtTransfersInstance) {
                setTimeout(() => dtTransfersInstance.columns.adjust().draw(false), 100);
            }
        } else if (targetId === '#container-charts-view') {
            renderCharts();
        }
    });

    // 全域 6 聯篩選條件變動監聽 (比照 psi-stock.js)
    $('#filterStartDate, #filterEndDate, #filterFromWarehouse, #filterToWarehouse, #filterProduct, #filterOperator').on('change input', function () {
        appState.filters.startDate = $('#filterStartDate').val() || '';
        appState.filters.endDate = $('#filterEndDate').val() || '';
        appState.filters.fromWh = $('#filterFromWarehouse').val() || 'ALL';
        appState.filters.toWh = $('#filterToWarehouse').val() || 'ALL';
        appState.filters.productId = $('#filterProduct').val() || 'ALL';
        appState.filters.operatorId = $('#filterOperator').val() || 'ALL';

        // 即時刷新指標、表格與圖表
        renderMetrics();
        renderAdjustmentsTable();
        renderTransfersTable();
        if ($('#container-charts-view').hasClass('active')) {
            renderCharts();
        }
    });
}

function adjustCountStep(delta) {
    const input = document.getElementById('auditInputPhysicalQty');
    let val = parseInt(input.value, 10) || 0;
    val = Math.max(0, val + delta);
    input.value = val;
    calculateAuditVariance();
}

/**
 * 盤點差異計算邏輯 (金額格式化對齊 NT$ / RM)
 */
function calculateAuditVariance() {
    const bookQty = parseInt($('#auditValBookQty').text(), 10) || 0;
    const physicalQty = parseInt($('#auditInputPhysicalQty').val(), 10) || 0;
    const diff = physicalQty - bookQty;

    const unitCost = parseFloat($('#auditInputUnitCost').data('raw-cost')) || 0;
    const currency = $('#auditInputCurrency').val() || 'TWD';
    const totalCost = Math.abs(diff) * unitCost;

    const $tag = $('#auditTagVarianceStatus');
    const $lblCost = $('#auditLblVarianceCost');
    const $reasonBox = $('#auditReasonContainer');

    if (diff === 0) {
        $tag.attr('class', 'fw-bold text-info mono-mun').html('<i class="fa-solid fa-check me-1"></i> 帳實相符 (0)');
        $lblCost.text(formatCurrency(0, currency));
        $reasonBox.addClass('d-none');
    } else if (diff < 0) {
        $tag.attr('class', 'fw-bold text-danger mono-mun').html(`<i class="fa-solid fa-triangle-exclamation me-1"></i> 盤虧短少 (${diff})`);
        $lblCost.text(`-${formatCurrency(totalCost, currency)}`);
        $reasonBox.removeClass('d-none');
        $('#auditSelAdjType').val('盤虧');
    } else {
        $tag.attr('class', 'fw-bold text-success mono-mun').html(`<i class="fa-solid fa-plus me-1"></i> 盤盈溢出 (+${diff})`);
        $lblCost.text(`+${formatCurrency(totalCost, currency)}`);
        $reasonBox.removeClass('d-none');
        $('#auditSelAdjType').val('盤盈');
    }
}

/**
 * 現場實物盤點：選擇產品後自動帶出規格與帳面庫存
 */
function loadProductStockForAudit() {
    const prodCode = $('#auditProductSelect').val();
    const currentWh = $('#auditWarehouseSelect').val();

    if (!prodCode) {
        $('#auditInputProductName').val('');
        $('#auditInputBatchNo').val('-');
        $('#auditInputCurrency').val('TWD');
        $('#auditInputUnitCost').val(formatCurrency(0, 'TWD'));
        $('#auditInputUnitSv').val('0 SV');
        $('#auditValBookQty').html(`0 <span class="fs-6">盒</span>`);
        $('#auditLblProductCode').text('-');
        $('#auditInputPhysicalQty').val(0);
        calculateAuditVariance();
        return;
    }

    // 1. 直接自全域主檔精準查找產品實體
    const prod = appState.products.find(p => p.product_code === prodCode || p.official_product_code === prodCode);
    const prodName = prod ? prod.name : '-';
    const officialCode = prod ? (prod.official_product_code || prod.product_code) : prodCode;
    const unitCost = prod ? prod.price : 0;
    const unitSv = prod ? prod.sv_point : 0;
    const currency = (prod && (prod.region_code === 'MY' || String(prod.product_code).startsWith('MY'))) ? 'MYR' : 'TWD';

    // 2. 智慧匹配該倉庫與產品之在庫批號與帳面盒數
    const matchedStock = appState.stocks
        .filter(s => s.product_id === prodCode && s.warehouse_id === currentWh && s.available_qty > 0)
        .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'))[0]
        || appState.stocks.find(s => s.product_id === prodCode && s.warehouse_id === currentWh)
        || appState.stocks.find(s => s.product_id === prodCode);

    const batchNo = matchedStock ? matchedStock.batch_no : `LOT${new Date().toISOString().slice(0, 7).replace('-', '')}A`;
    const bookQty = matchedStock ? matchedStock.quantity : 0;

    // 3. 自動寫入唯讀欄位 (不能修改)
    $('#auditInputProductName').val(prodName);
    $('#auditInputBatchNo').val(batchNo);
    $('#auditInputCurrency').val(currency);
    $('#auditInputUnitCost').val(formatCurrency(unitCost, currency)).data('raw-cost', unitCost);
    $('#auditInputUnitSv').val(`${unitSv} SV`).data('raw-sv', unitSv);
    $('#auditValBookQty').html(`${bookQty} <span class="fs-6">盒</span>`);
    $('#auditLblProductCode').text(officialCode);

    // 4. 重設實盤數並觸發差異計算
    $('#auditInputPhysicalQty').val(bookQty);
    calculateAuditVariance();
}

/**
 * 跨倉調撥：品項或調出倉變動時自動帶入
 */
function loadProductStockForTransfer() {
    const prodCode = $('#trProductSelect').val();
    const fromWh = $('#trFromWarehouseSelect').val();

    if (!prodCode) {
        $('#trInputProductName').val('');
        $('#trInputBatchNo').val('-');
        $('#trInputCurrency').val('TWD');
        $('#trInputUnitCost').val(formatCurrency(0, 'TWD'));
        $('#trInputUnitSv').val('0 SV');
        $('#trInputTotalCost').val(formatCurrency(0, 'TWD'));
        $('#trInputTotalSv').val('0 SV');
        return;
    }

    // 1. 檢索產品實體
    const prod = appState.products.find(p => p.product_code === prodCode || p.official_product_code === prodCode);
    const prodName = prod ? prod.name : '-';
    const unitCost = prod ? prod.price : 0;
    const unitSv = prod ? prod.sv_point : 0;
    const currency = (prod && (prod.region_code === 'MY' || String(prod.product_code).startsWith('MY'))) ? 'MYR' : 'TWD';

    // 2. 匹配該來源倉在庫批號
    const matchedStock = appState.stocks
        .filter(s => s.product_id === prodCode && s.warehouse_id === fromWh && s.available_qty > 0)
        .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'))[0]
        || appState.stocks.find(s => s.product_id === prodCode && s.warehouse_id === fromWh)
        || appState.stocks.find(s => s.product_id === prodCode);

    const batchNo = matchedStock ? matchedStock.batch_no : `LOT${new Date().toISOString().slice(0, 7).replace('-', '')}A`;

    // 3. 寫入 5 大自動帶出唯讀屬性
    $('#trInputProductName').val(prodName);
    $('#trInputBatchNo').val(batchNo);
    $('#trInputCurrency').val(currency);
    $('#trInputUnitCost').val(formatCurrency(unitCost, currency)).data('raw-cost', unitCost);
    $('#trInputUnitSv').val(`${unitSv} SV`).data('raw-sv', unitSv);

    // 4. 即時核算「成本」與「SV」
    updateTransferCostCalc();
}

/**
 * 跨倉調撥：自動核算「成本 (總額)」與「SV (總額)」並唯讀展示
 */
function updateTransferCostCalc() {
    const qty = parseInt($('#trQtyInput').val(), 10) || 0;
    const unitCost = parseFloat($('#trInputUnitCost').data('raw-cost')) || 0;
    const unitSv = parseInt($('#trInputUnitSv').data('raw-sv'), 10) || 0;
    const currency = $('#trInputCurrency').val() || 'TWD';

    const totalCost = qty * unitCost;
    const totalSv = qty * unitSv;

    // 自動計算並鎖定填入
    $('#trInputTotalCost').val(formatCurrency(totalCost, currency));
    $('#trInputTotalSv').val(`${totalSv.toLocaleString()} SV`);
}

function resetAuditForm() {
    $('#auditInputPhysicalQty').val(0);
    $('#auditTxtReason').val('');
    $('#auditProspectSelect').val('');
    calculateAuditVariance();
}

async function commitAuditRecord() {
    const $opt = $('#auditProductSelect option:selected');

    const whId = $('#auditWarehouseSelect').val();
    const prodId = $('#auditProductSelect').val();
    const operatorId = $('#auditOperatorSelect').val();

    if (!whId) {
        AppToast.warning("請先選擇「盤點倉儲據點」！");
        $('#auditWarehouseSelect').focus();
        return;
    }
    if (!prodId) {
        AppToast.warning("請先選擇「盤點品項」！");
        $('#auditProductSelect').focus();
        return;
    }
    if (!operatorId) {
        AppToast.warning("請選擇「執行經手人」！");
        $('#auditOperatorSelect').focus();
        return;
    }

    const bookQty = parseInt($('#auditValBookQty').text(), 10) || 0;
    const physicalQty = parseInt($('#auditInputPhysicalQty').val(), 10) || 0;
    const diff = physicalQty - bookQty;

    const prodCode = $('#trProductSelect').val();
    const prodName = $('#trInputProductName').val();
    const batchNo = $('#trInputBatchNo').val();
    const currency = $('#trInputCurrency').val();
    const unitCost = parseFloat($('#trInputUnitCost').data('raw-cost')) || 0;
    const unitSv = parseInt($('#trInputUnitSv').data('raw-sv'), 10) || 0;
    const totalCost = qty * unitCost;
    const totalSv = qty * unitSv;

    const adjType = diff === 0 ? '盤盈' : $('#auditSelAdjType').val();
    const reason = diff === 0 ? '帳實相符例行備忘' : ($('#auditTxtReason').val().trim() || '現場實物盤點差異調整');

    const nextSeq = String(appState.adjustments.length + 1).padStart(4, '0');
    const todayStr = new Date().toISOString().slice(0, 10);
    const dateCode = todayStr.replace(/-/g, '');
    const adjNo = `ADJ-${dateCode}-${nextSeq}`;

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();

    // 嚴格對齊 表 307 psi_adjustments 全 25 物理欄位順序 (Index 0 ~ 24)
    const rowDataArray = [
        adjNo,                                      // 0: id
        adjType,                                    // 1: adj_type
        $('#auditWarehouseSelect').val(),           // 2: from_warehouse_id
        '',                                         // 3: to_warehouse_id
        $opt.data('base') || $opt.val(),            // 4: official_product_code
        $opt.data('name'),                          // 5: product_name_snaps
        $opt.val(),                                 // 6: product_id
        '',                                         // 7: stock_id
        '',                                         // 8: batch_no
        todayStr,                                   // 9: expiry_date
        $('#auditAdjUnit').val(),                   // 10: adj_unit
        diff,                                       // 11: quantity
        'TWD',                                      // 12: currency_code
        unitCost,                                   // 13: unit_cost
        totalCost,                                  // 14: total_cost
        unitSv,                                     // 15: unit_sv
        totalSv,                                    // 16: total_sv
        $('#auditProspectSelect').val() || '',      // 17: target_prospect_id
        $('#auditOperatorSelect').val(),            // 18: operator_partner_id
        todayStr,                                   // 19: adj_date
        reason,                                     // 20: reason_desc
        currentUser,                                // 21: created_by
        nowStr,                                     // 22: created_at
        currentUser,                                // 23: modified_by
        nowStr                                      // 24: modified_at
    ];

    const newObj = {
        id: adjNo,
        adj_type: adjType,
        from_warehouse_id: $('#auditWarehouseSelect').val(),
        to_warehouse_id: '',
        official_product_code: $opt.data('base') || $opt.val(),
        product_name_snaps: $opt.data('name'),
        product_id: $opt.val(),
        stock_id: '',
        batch_no: '',
        expiry_date: todayStr,
        adj_unit: $('#auditAdjUnit').val(),
        quantity: diff,
        currency_code: 'TWD',
        unit_cost: unitCost,
        total_cost: totalCost,
        unit_sv: unitSv,
        total_sv: totalSv,
        target_prospect_id: $('#auditProspectSelect').val() || '',
        operator_partner_id: $('#auditOperatorSelect').val(),
        adj_date: todayStr,
        reason_desc: reason,
        created_by: currentUser,
        created_at: nowStr,
        modified_by: currentUser,
        modified_at: nowStr
    };

    const $btn = $('#btnSubmitAudit');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i>寫入中...');
        await SheetAdapter.sendRequest('CREATE', '盤點調撥', adjNo, rowDataArray);
        appState.adjustments.unshift(newObj);
        await fetchAllGoogleSheetsData();

        const auditModalEl = document.getElementById('modalAuditWorkbench');
        if (auditModalEl) {
            const auditModal = bootstrap.Modal.getInstance(auditModalEl);
            if (auditModal) auditModal.hide();
        }

        AppToast.success(`盤點單據【${adjNo}】已成功同步至 Google 試算表！`);
    } catch (err) {
        AppToast.error("寫入失敗: " + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i>寫入盤點覆核單據');
    }
}

async function commitTransferOrder() {
    const $opt = $('#trProductSelect option:selected');

    const fromWh = $('#trFromWarehouseSelect').val();
    const toWh = $('#trToWarehouseSelect').val();
    const prodCode = $('#trProductSelect').val();
    const qty = parseInt($('#trQtyInput').val(), 10) || 0;
    const operatorId = $('#trOperatorSelect').val();
    const adjDate = $('#trAdjDate').val();
    const reason = $('#trReasonInput').val().trim();

    if (!fromWh) {
        AppToast.warning("請選擇「調出來源倉」！");
        $('#trFromWarehouseSelect').focus();
        return;
    }
    if (!toWh) {
        AppToast.warning("請選擇「調入目的倉」！");
        $('#trToWarehouseSelect').focus();
        return;
    }
    if (fromWh === toWh) {
        AppToast.warning("調出來源倉與調入目的倉不可相同！");
        $('#trToWarehouseSelect').focus();
        return;
    }
    if (!prodCode) {
        AppToast.warning("請選擇「調撥品項」！");
        $('#trProductSelect').focus();
        return;
    }
    if (qty <= 0) {
        AppToast.warning("請填寫大於 0 的調撥數量！");
        $('#trQtyInput').focus();
        return;
    }
    if (!operatorId) {
        AppToast.warning("請選擇「執行經手夥伴」！");
        $('#trOperatorSelect').focus();
        return;
    }
    if (!adjDate) {
        AppToast.warning("請選擇「調撥日期」！");
        $('#trAdjDate').focus();
        return;
    }
    if (!reason) {
        AppToast.warning("請輸入「調撥事由與物流追蹤說明」！");
        $('#trReasonInput').focus();
        return;
    }

    const unitCost = parseFloat($opt.data('price')) || 0;
    const unitSv = parseInt($opt.data('sv'), 10) || 0;
    const currency = $('#trCurrencySelect').val();
    const totalCost = qty * unitCost;
    const totalSv = qty * unitSv;

    const nextSeq = String(appState.adjustments.length + 1).padStart(4, '0');
    const todayStr = $('#trAdjDate').val() || new Date().toISOString().slice(0, 10);
    const dateCode = todayStr.replace(/-/g, '');
    const adjNo = `ADJ-${dateCode}-${nextSeq}`;

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();

    // 依 25 欄位順序打包 (跨倉調撥調出為負數)
    const rowDataArray = [
        adjNo,
        '跨倉調撥',
        fromWh,
        toWh,
        $opt.data('base') || $opt.val(),
        $opt.data('name'),
        $opt.val(),
        '',
        '',
        todayStr,
        $('#trAdjUnit').val(),
        -qty,
        currency,
        unitCost,
        totalCost,
        unitSv,
        totalSv,
        '',
        $('#trOperatorSelect').val(),
        todayStr,
        reason,
        currentUser,
        nowStr,
        currentUser,
        nowStr
    ];

    const newObj = {
        id: adjNo,
        adj_type: '跨倉調撥',
        from_warehouse_id: fromWh,
        to_warehouse_id: toWh,
        official_product_code: $opt.data('base') || $opt.val(),
        product_name_snaps: $opt.data('name'),
        product_id: $opt.val(),
        stock_id: '',
        batch_no: '',
        expiry_date: todayStr,
        adj_unit: $('#trAdjUnit').val(),
        quantity: -qty,
        currency_code: currency,
        unit_cost: unitCost,
        total_cost: totalCost,
        unit_sv: unitSv,
        total_sv: totalSv,
        target_prospect_id: '',
        operator_partner_id: $('#trOperatorSelect').val(),
        adj_date: todayStr,
        reason_desc: reason,
        created_by: currentUser,
        created_at: nowStr,
        modified_by: currentUser,
        modified_at: nowStr
    };

    try {
        await SheetAdapter.sendRequest('CREATE', '盤點調撥', adjNo, rowDataArray);
        appState.adjustments.unshift(newObj);
        await fetchAllGoogleSheetsData();

        const transferModalEl = document.getElementById('modalTransferWorkbench');
        if (transferModalEl) {
            const transferModal = bootstrap.Modal.getInstance(transferModalEl);
            if (transferModal) transferModal.hide();
        }

        AppToast.success(`跨倉調撥單【${adjNo}】已成功建立！`);
    } catch (err) {
        AppToast.error("調撥單建立失敗: " + err.message);
    }
}

// ==========================================================================
// 7. Modal 編輯與更新 / 刪除 (C/R/U/D)
// ==========================================================================
function handleModalAdjTypeChange() {
    const type = $('#fieldAdjType').val();
    if (type === '跨倉調撥') {
        $('#fieldToWarehouseId').prop('disabled', false);
    } else {
        $('#fieldToWarehouseId').val('').prop('disabled', true);
    }
}

/**
 * 單據視窗：品項變更時自動填入 8 項唯讀資料
 */
function handleModalProductChange() {
    const $opt = $('#fieldProductId option:selected');
    const prodId = $opt.val();
    if (!prodId) return;

    const prod = appState.products.find(p => p.product_code === prodId);
    const officialCode = prod ? (prod.official_product_code || prod.product_code) : ($opt.data('base') || prodId);
    const prodName = prod ? prod.name : ($opt.data('name') || '');
    const unitCost = prod ? prod.price : (parseFloat($opt.data('price')) || 0);
    const unitSv = prod ? prod.sv_point : (parseInt($opt.data('sv'), 10) || 0);
    const currency = (prod && prod.region_code === 'MY') ? 'MYR' : 'TWD';

    const todayStr = new Date().toISOString().slice(0, 10);
    const dateCode = todayStr.replace(/-/g, '');

    // 自動帶出並鎖定
    $('#fieldOfficialProductCode').val(officialCode);
    $('#fieldProductNameSnaps').val(prodName);
    $('#fieldStockId').val(`STK-${dateCode}-SYS`);
    $('#fieldBatchNo').val(`LOT${dateCode}`);
    $('#fieldExpiryDate').val(todayStr);
    $('#fieldCurrencyCode').val(currency);
    $('#fieldUnitCost').val(unitCost);
    $('#fieldUnitSv').val(unitSv);

    calculateModalTotals();
}

function calculateModalTotals() {
    const qty = parseInt($('#fieldQuantity').val(), 10) || 0;
    const cost = parseFloat($('#fieldUnitCost').val()) || 0;
    const sv = parseInt($('#fieldUnitSv').val(), 10) || 0;
    $('#fieldTotalCost').val((Math.abs(qty) * cost).toFixed(2));
    $('#fieldTotalSv').val(Math.abs(qty) * sv);
}

function openAddAdjustmentModal() {
    $('#adjustModalTitle').html('<i class="fa-solid fa-file-circle-plus text-primary me-1"></i>發起盤點調撥單據');
    $('#formMode').val('add');
    $('#adjustForm')[0].reset();

    const nextSeq = String(appState.adjustments.length + 1).padStart(4, '0');
    const todayStr = new Date().toISOString().slice(0, 10);
    const dateCode = todayStr.replace(/-/g, '');
    const adjNo = `ADJ-${dateCode}-${nextSeq}`;

    $('#fieldId').val(adjNo);
    $('#fieldAdjType').val('自用消耗');
    handleModalAdjTypeChange();
    $('#fieldAdjDate').val(todayStr);
    $('#fieldAdjUnit').val('盒');
    $('#fieldQuantity').val(-1);
    $('#fieldCurrencyCode').val('TWD');
    $('#fieldFromWarehouseId').val(appState.warehouses[0] ? appState.warehouses[0].id : '');
    $('#fieldOperatorPartnerId').val(appState.partners[0] ? appState.partners[0].partner_id : '');
    $('#fieldExpiryDate').val(todayStr);

    handleModalProductChange();
    new bootstrap.Modal(document.getElementById('adjustModal')).show();
}

function openEditAdjustmentModal(id) {
    const adj = appState.adjustments.find(a => a.id === id);
    if (!adj) return;

    $('#adjustModalTitle').html('<i class="fa-solid fa-pen-to-square text-primary me-1"></i>編輯盤點調撥單據');
    $('#formMode').val('edit');

    $('#fieldId').val(adj.id);
    $('#fieldAdjType').val(adj.adj_type);
    handleModalAdjTypeChange();

    $('#fieldAdjDate').val(adj.adj_date);
    $('#fieldOperatorPartnerId').val(adj.operator_partner_id);
    $('#fieldFromWarehouseId').val(adj.from_warehouse_id);
    $('#fieldToWarehouseId').val(adj.to_warehouse_id);

    $('#fieldProductId').val(adj.product_id);
    $('#fieldOfficialProductCode').val(adj.official_product_code);
    $('#fieldProductNameSnaps').val(adj.product_name_snaps);
    $('#fieldStockId').val(adj.stock_id);
    $('#fieldBatchNo').val(adj.batch_no);
    $('#fieldExpiryDate').val(adj.expiry_date);

    $('#fieldAdjUnit').val(adj.adj_unit);
    $('#fieldQuantity').val(adj.quantity);
    $('#fieldCurrencyCode').val(adj.currency_code);
    $('#fieldUnitCost').val(adj.unit_cost);
    $('#fieldUnitSv').val(adj.unit_sv);
    $('#fieldTotalCost').val(adj.total_cost);
    $('#fieldTotalSv').val(adj.total_sv);

    $('#fieldTargetProspectId').val(adj.target_prospect_id);
    $('#fieldReasonDesc').val(adj.reason_desc);

    new bootstrap.Modal(document.getElementById('adjustModal')).show();
}

async function saveAdjustmentRecord() {
    const mode = $('#formMode').val();
    const id = $('#fieldId').val().trim();
    const adjType = $('#fieldAdjType').val();
    const adjDate = $('#fieldAdjDate').val();
    const operatorId = $('#fieldOperatorPartnerId').val();
    const fromWh = $('#fieldFromWarehouseId').val();
    const toWh = $('#fieldToWarehouseId').val();
    const prodId = $('#fieldProductId').val();
    const reason = $('#fieldReasonDesc').val().trim();

    if (!id) {
        AppToast.warning("調撥單號主鍵不可為空！");
        return;
    }
    if (!adjDate) {
        AppToast.warning("請選擇「調整發生日期」！");
        $('#fieldAdjDate').focus();
        return;
    }
    if (!operatorId) {
        AppToast.warning("請選擇「經手夥伴」！");
        $('#fieldOperatorPartnerId').focus();
        return;
    }
    if (!fromWh) {
        AppToast.warning("請選擇「調出/發生倉儲」！");
        $('#fieldFromWarehouseId').focus();
        return;
    }
    if (adjType === '跨倉調撥' && !toWh) {
        AppToast.warning("跨倉調撥必須選擇「調入倉儲」！");
        $('#fieldToWarehouseId').focus();
        return;
    }
    if (!prodId) {
        AppToast.warning("請選擇「產品品項」！");
        $('#fieldProductId').focus();
        return;
    }
    if (!reason) {
        AppToast.warning("請輸入「詳細事由」！");
        $('#fieldReasonDesc').focus();
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existing = appState.adjustments.find(a => a.id === id);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    const qty = parseInt($('#fieldQuantity').val(), 10) || 0;
    const cost = parseFloat($('#fieldUnitCost').val()) || 0;
    const sv = parseInt($('#fieldUnitSv').val(), 10) || 0;
    const totalCost = Math.abs(qty) * cost;
    const totalSv = Math.abs(qty) * sv;

    // 嚴格依表 307 psi_adjustments 全 25 欄位順序打包 (Index 0 ~ 24)
    const rowDataArray = [
        id,                                         // 0: id
        $('#fieldAdjType').val(),                   // 1: adj_type
        $('#fieldFromWarehouseId').val(),           // 2: from_warehouse_id
        $('#fieldToWarehouseId').val() || '',       // 3: to_warehouse_id
        $('#fieldOfficialProductCode').val().trim(),// 4: official_product_code
        $('#fieldProductNameSnaps').val().trim(),   // 5: product_name_snaps
        $('#fieldProductId').val(),                 // 6: product_id
        $('#fieldStockId').val().trim(),            // 7: stock_id
        $('#fieldBatchNo').val().trim(),            // 8: batch_no
        $('#fieldExpiryDate').val(),                // 9: expiry_date
        $('#fieldAdjUnit').val(),                   // 10: adj_unit
        qty,                                        // 11: quantity
        $('#fieldCurrencyCode').val(),              // 12: currency_code
        cost,                                       // 13: unit_cost
        totalCost,                                  // 14: total_cost
        sv,                                         // 15: unit_sv
        totalSv,                                    // 16: total_sv
        $('#fieldTargetProspectId').val() || '',    // 17: target_prospect_id
        $('#fieldOperatorPartnerId').val(),         // 18: operator_partner_id
        $('#fieldAdjDate').val(),                   // 19: adj_date
        $('#fieldReasonDesc').val().trim(),         // 20: reason_desc
        createdBy,                                  // 21: created_by
        createdAt,                                  // 22: created_at
        currentUser,                                // 23: modified_by
        nowStr                                      // 24: modified_at
    ];

    const updatedObj = {
        id: id,
        adj_type: $('#fieldAdjType').val(),
        from_warehouse_id: $('#fieldFromWarehouseId').val(),
        to_warehouse_id: $('#fieldToWarehouseId').val() || '',
        official_product_code: $('#fieldOfficialProductCode').val().trim(),
        product_name_snaps: $('#fieldProductNameSnaps').val().trim(),
        product_id: $('#fieldProductId').val(),
        stock_id: $('#fieldStockId').val().trim(),
        batch_no: $('#fieldBatchNo').val().trim(),
        expiry_date: $('#fieldExpiryDate').val(),
        adj_unit: $('#fieldAdjUnit').val(),
        quantity: qty,
        currency_code: $('#fieldCurrencyCode').val(),
        unit_cost: cost,
        total_cost: totalCost,
        unit_sv: sv,
        total_sv: totalSv,
        target_prospect_id: $('#fieldTargetProspectId').val() || '',
        operator_partner_id: $('#fieldOperatorPartnerId').val(),
        adj_date: $('#fieldAdjDate').val(),
        reason_desc: $('#fieldReasonDesc').val().trim(),
        created_by: createdBy,
        created_at: createdAt,
        modified_by: currentUser,
        modified_at: nowStr
    };

    const $btn = $('#btnSaveAdjust');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i>寫入中...');
        if (mode === 'add') {
            await SheetAdapter.sendRequest('CREATE', '盤點調撥', id, rowDataArray);
            appState.adjustments.unshift(updatedObj);
        } else {
            await SheetAdapter.sendRequest('UPDATE', '盤點調撥', id, rowDataArray);
            const idx = appState.adjustments.findIndex(a => a.id === id);
            if (idx !== -1) appState.adjustments[idx] = updatedObj;
        }

        await fetchAllGoogleSheetsData();
        bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide();
        AppToast.success(`單據【${id}】已成功儲存！`);
    } catch (err) {
        AppToast.error("寫入失敗: " + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i>儲存');
    }
}

async function deleteAdjustmentRecord(id) {
    let confirmed = false;
    if (window.AppDialog && typeof AppDialog.confirm === 'function') {
        confirmed = await AppDialog.confirm(`確定要自 Google 試算表中永久撤銷/刪除單據【${id}】嗎？此動作不可復原！`, {
            title: '刪除單據確認',
            confirmText: '確定刪除',
            confirmClass: 'btn-danger'
        });
    } else {
        confirmed = confirm(`確定要自 Google 試算表中永久撤銷/刪除單據【${id}】嗎？`);
    }

    if (!confirmed) return;

    try {
        await SheetAdapter.sendRequest('DELETE', '盤點調撥', id, []);
        appState.adjustments = appState.adjustments.filter(a => a.id !== id);
        await fetchAllGoogleSheetsData();
        AppToast.success(`單據【${id}】已成功刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗: " + err.message);
    }
}

// ==========================================================================
// 8. 4 大試算表連線設定與匯出
// ==========================================================================
function exportAdjustmentsCsv() {
    const csv = Papa.unparse(appState.adjustments);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psi_adjustments_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    AppToast.info("已成功匯出盤點調撥 CSV 總檔");
}