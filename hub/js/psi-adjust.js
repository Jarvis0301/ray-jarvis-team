// ==========================================================================
// 1. 系統組態與 4 大試算表來源定義
// ==========================================================================
const SPREADSHEET_CONFIG = {
    sheetPsi: APP_CONFIG.SHEETS.PSI,
    sheetOrg: APP_CONFIG.SHEETS.ORG,
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
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetOrg, '個人主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetOrg, '夥伴主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPrd, '產品主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetCrm, '客戶主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '庫存主檔').catch(() => []) // 🚀 表 302
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

    // 2. 解析個人主檔 (表 201: org_persons)
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
        name_zh: getVal(r, 4)
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
    // 嚴格過濾排除官方營運中心，僅保留自營私倉、海外前哨與在途倉
    const nonOfficialWarehouseFilter = w => {
        const type = String(w.warehouse_type || '').toUpperCase();
        return !type.includes('官方') && !type.includes('OFFICIAL') && w.id !== 'WH-TW-TP' && w.id !== 'WH-TW-KH';
    };

    // 1. 現場實物盤點倉儲
    UISelectOptions.warehouse.populate({
        target: '#auditWarehouseSelect',
        warehouses: appState.warehouses,
        placeholder: '-- 請選擇盤點自營倉儲 --',
        displayMode: 1, // 僅顯示名稱
        searchable: true,
        filterFn: nonOfficialWarehouseFilter
    });

    // 2. 跨倉調撥來源與目的倉
    ['#trFromWarehouseSelect', '#trToWarehouseSelect'].forEach(target => {
        UISelectOptions.warehouse.populate({
            target,
            warehouses: appState.warehouses,
            placeholder: target.includes('From') ? '-- 請選擇調出來源倉 --' : '-- 請選擇調入目的倉 --',
            displayMode: 1, // 僅顯示名稱
            searchable: true,
            filterFn: nonOfficialWarehouseFilter
        });
    });

    // 3. 單據 Modal 倉儲
    ['#fieldFromWarehouseId', '#fieldToWarehouseId'].forEach(target => {
        UISelectOptions.warehouse.populate({
            target,
            warehouses: appState.warehouses,
            placeholder: target.includes('From') ? '-- 請選擇調出倉儲 --' : '-- 請選擇調入倉儲 (單倉免填) --',
            dropdownParent: '#adjustModal',
            displayMode: 1, // 僅顯示名稱
            searchable: true,
            filterFn: nonOfficialWarehouseFilter
        });
    });

    // 產品選單
    ['#auditProductSelect', '#trProductSelect', '#fieldProductId'].forEach(target => {
        UISelectOptions.product.populate({
            target,
            products: appState.products,
            dropdownParent: target.startsWith('#field') ? '#adjustModal' : null
        });
    });

    // 夥伴選單
    ['#auditOperatorSelect', '#trOperatorSelect', '#fieldOperatorPartnerId'].forEach(target => {
        UISelectOptions.partner.populate({
            target,
            partners: appState.partners,
            persons: appState.persons,
            dropdownParent: target.startsWith('#field') ? '#adjustModal' : null
        });
    });

    // 客戶選單
    ['#auditProspectSelect', '#fieldTargetProspectId'].forEach(target => {
        UISelectOptions.customer.populate({
            target,
            customers: appState.customers,
            persons: appState.persons,
            placeholder: '-- 非試用體驗無須選擇 --',
            dropdownParent: target.startsWith('#field') ? '#adjustModal' : null
        });
    });
}

function renderMetrics() {
    let transferQty = 0;
    let transferBatches = 0;
    let lossAmount = 0;
    let lossBoxes = 0;
    let demoQty = 0;
    let demoCost = 0;
    let unboxingQty = 0;

    appState.adjustments.forEach(item => {
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
    $('#statDemoQty').text(`${demoQty.toLocaleString()} 件`);
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

    const formatted = appState.adjustments.map(a => {
        const typeBadge = UIBadges.psi.adjustType(a.adj_type);

        const operatorResolved = getPartnerResolvedName(a.operator_partner_id);
        const prospectResolved = a.target_prospect_id ? getCustomerResolvedName(a.target_prospect_id) : '';

        const qtyTag = a.quantity > 0 
            ? `<span class="variance-tag variance-gain">+${a.quantity}</span>` 
            : (a.quantity < 0 ? `<span class="variance-tag variance-loss">${a.quantity}</span>` : `<span class="variance-tag variance-balanced">0</span>`);

        const actionButtons = `
            <div class="d-flex align-items-center justify-content-end gap-1">
                ${`
                    <button class="btn btn-sm btn-outline-primary" title="編輯單據" onclick="openEditAdjustmentModal('${a.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" title="刪除單據" onclick="deleteAdjustmentRecord('${a.id}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                `}
            </div>
        `;

        return {
            id_and_type: `
                <div>
                    <div class="fw-bold text-white">${a.id}</div>
                    ${typeBadge}
                </div>
            `,
            warehouses: `
                <div>
                    <span class="badge badge-purple-subtle">${getWarehouseDisplayName(a.from_warehouse_id)}</span>
                    ${a.to_warehouse_id ? `<div class="text-info small mt-1"><i class="fa-solid fa-arrow-down-long me-1"></i>${getWarehouseDisplayName(a.to_warehouse_id)}</div>` : ''}
                </div>
            `,
            product_batch: `
                <div>
                    <div class="fw-bold text-white">${a.product_name_snaps || '-'}</div>
                    <span class="batch-chip">LOT：${a.batch_no || '-'}</span>
                </div>
            `,
            quantity_unit: `
                <div>
                    ${qtyTag} <span class="badge badge-muted-subtle ms-1">${a.adj_unit}</span>
                </div>
            `,
            cost_breakdown: `
                <div>
                    <div class="fw-bold text-white">${formatCurrency(a.total_cost, a.currency_code)}</div>
                    <div class="text-secondary small">@ ${formatCurrency(a.unit_cost, a.currency_code)}</div>
                </div>
            `,
            sv_breakdown: `<span class="text-warning fw-bold">${a.total_sv.toLocaleString()} SV</span>`,
            parties: `
                <div>
                    <div class="small text-white fw-bold"><i class="fa-solid fa-user-shield text-primary me-1"></i>${operatorResolved}</div>
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
    const transfersOnly = appState.adjustments.filter(a => a.adj_type === '跨倉調撥');

    const formatted = transfersOnly.map(t => {
        const operatorResolved = getPartnerResolvedName(t.operator_partner_id);

        const actionButtons = `
            <div class="d-flex align-items-center justify-content-end gap-1">
                ${`
                    <button class="btn btn-sm btn-outline-primary" title="編輯調撥單" onclick="openEditAdjustmentModal('${t.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" title="刪除單據" onclick="deleteAdjustmentRecord('${t.id}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                `}
            </div>
        `;

        return {
            id_and_date: `
                <div>
                    <div class="fw-bold text-info">${t.id}</div>
                    <div class="text-secondary small">${t.adj_date}</div>
                </div>
            `,
            route: `
                <div>
                    <span class="badge badge-purple-subtle">${getWarehouseDisplayName(t.from_warehouse_id)}</span>
                    <div class="text-info small mt-1"><i class="fa-solid fa-arrow-down-long me-1"></i>${getWarehouseDisplayName(t.to_warehouse_id) || '未指定'}</div>
                </div>
            `,
            product: `
                <div>
                    <div class="fw-bold text-white">${t.product_name_snaps || '-'}</div>
                    <span class="batch-chip">LOT：${t.batch_no || '-'}</span>
                </div>
            `,
            quantity: `<span class="badge badge-info-subtle px-2 py-1">${Math.abs(t.quantity)} ${t.adj_unit}</span>`,
            cost: `<span class="text-white fw-bold">${formatCurrency(t.total_cost, t.currency_code)}</span>`,
            sv: `<span class="text-warning fw-bold">${t.total_sv.toLocaleString()} SV</span>`,
            operator: `<span class="small text-light">${operatorResolved}</span>`,
            reason: `<div class="small text-secondary" style="max-width: 140px;" title="${t.reason_desc}">${t.reason_desc || '-'}</div>`,
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
                { data: 'reason' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }
}

function renderCharts() {
    // 1. 銷毀既有所有圖表實例
    Object.keys(appState.chartInstances).forEach(k => {
        if (appState.chartInstances[k]) {
            appState.chartInstances[k].destroy();
            appState.chartInstances[k] = null;
        }
    });

    const adjustments = appState.adjustments || [];

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

    // --- 圖表 4：損耗成本最高品項 Top 5 (長條圖) ---
    const ctxLossPrd = document.getElementById('chartLossTopPrd');
    if (ctxLossPrd) {
        const lossPrdMap = {};
        adjustments.filter(a => a.adj_type === '盤虧' || a.adj_type === '破損過期').forEach(a => {
            const name = a.product_name_snaps || a.product_id || '未知品項';
            lossPrdMap[name] = (lossPrdMap[name] || 0) + (parseFloat(a.total_cost) || 0);
        });

        const sortedLoss = Object.entries(lossPrdMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const totalLoss = Object.values(lossPrdMap).reduce((a, b) => a + b, 0);

        appState.chartInstances.lossTopPrd = new Chart(ctxLossPrd, {
            type: 'bar',
            data: {
                labels: sortedLoss.map(i => i[0]),
                datasets: [{
                    label: '損耗金額 (NT$)',
                    data: sortedLoss.map(i => i[1]),
                    backgroundColor: '#fb7185',
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
                            label: function (ctx) {
                                const val = Number(ctx.parsed.x) || 0;
                                const pct = totalLoss > 0 ? ((val / totalLoss) * 100).toFixed(1) : '0.0';
                                return ` 累計損耗：NT$ ${val.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 9 }, callback: v => `NT$ ${v.toLocaleString()}` }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } }
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

    // --- 圖表 6：跨倉調撥主力品項 Top 5 (長條圖) ---
    const ctxTransferTop = document.getElementById('chartTransferTopPrd');
    if (ctxTransferTop) {
        const transferPrdMap = {};
        adjustments.filter(a => a.adj_type === '跨倉調撥').forEach(a => {
            const name = a.product_name_snaps || a.product_id || '未知品項';
            transferPrdMap[name] = (transferPrdMap[name] || 0) + Math.abs(a.quantity);
        });

        const sortedTransfer = Object.entries(transferPrdMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

        appState.chartInstances.transferTopPrd = new Chart(ctxTransferTop, {
            type: 'bar',
            data: {
                labels: sortedTransfer.map(i => i[0]),
                datasets: [{
                    label: '調撥流通量 (盒)',
                    data: sortedTransfer.map(i => i[1]),
                    backgroundColor: '#34d399',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` 調撥總量：${Number(ctx.parsed.y).toLocaleString()} 盒`
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } },
                    y: { ticks: { color: '#94a3b8', font: { size: 9 }, callback: v => `${v.toLocaleString()} 盒` }, grid: { color: 'rgba(255,255,255,0.05)' } }
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
        $tag.attr('class', 'variance-tag variance-balanced').html('<i class="fa-solid fa-check me-1"></i> 帳實相符 (0)');
        $lblCost.text(formatCurrency(0, currency));
        $reasonBox.addClass('d-none');
    } else if (diff < 0) {
        $tag.attr('class', 'variance-tag variance-loss').html(`<i class="fa-solid fa-triangle-exclamation me-1"></i> 盤虧短少 (${diff})`);
        $lblCost.text(`-${formatCurrency(totalCost, currency)}`);
        $reasonBox.removeClass('d-none');
        $('#auditSelAdjType').val('盤虧');
    } else {
        $tag.attr('class', 'variance-tag variance-gain').html(`<i class="fa-solid fa-plus me-1"></i> 盤盈溢出 (+${diff})`);
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
        $('#auditInputBatchNo').val('LOT: -');
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
        $('#trInputBatchNo').val('LOT: -');
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