// ==========================================================================
// 1. 系統組態與 4 大試算表來源定義
// ==========================================================================
const SPREADSHEET_CONFIG = {
    sheetPsi: '1_plHUdfzIublSv1apN5qQ5reO6YxqBkI1MdnQeDbAxo',
    sheetOrg: '1N-HniBDo7wJHidfsKyG-dr7kh0-UTNtFpM7nyFDL3eg',
    sheetPrd: '18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I',
    sheetCrm: '1TofIohkI-arOGmgRzm0rFm3sXBWvfYyThmm9pp1IGqw',
    gasDeploymentId: 'AKfycbx3vDysJBLkmscZG8Jonv6EMyHLzmb-AjxfDqzjOSiGD-8oInz8UowbLLJRKVbbxPVt'
};

// 系統資料狀態庫 (全面移除預設假資料)
let appState = {
    adjustments: [],
    warehouses: [],
    persons: [],
    partners: [],
    products: [],
    customers: [],
    currentTacticalMode: 'AUDIT',
    chartTransferInstance: null,
    chartParetoInstance: null
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
// 3. 個人與實體名稱權重解析核心 (展示名稱 > 中文 > 英文 > 暱稱)
// ==========================================================================
function getPersonResolvedName(personId) {
    if (!personId) return '';
    const person = appState.persons.find(p => p.person_id === personId);
    if (!person) return personId;

    if (person.display_name && person.display_name.trim()) return person.display_name.trim();
    if (person.name_zh && person.name_zh.trim()) return person.name_zh.trim();
    if (person.name_en && person.name_en.trim()) return person.name_en.trim();
    if (person.preferred_name && person.preferred_name.trim()) return person.preferred_name.trim();
    return personId;
}

function getPartnerResolvedName(partnerId) {
    if (!partnerId) return '-';
    const partner = appState.partners.find(p => p.partner_id === partnerId || p.member_no === partnerId);
    if (partner && partner.person_id) {
        const name = getPersonResolvedName(partner.person_id);
        if (name && name !== partner.person_id) return name;
    }
    if (partner && partner.name_zh && partner.name_zh.trim()) return partner.name_zh.trim();
    return getPersonResolvedName(partnerId);
}

function getCustomerResolvedName(customerId) {
    if (!customerId) return '-';
    const customer = appState.customers.find(c => c.customer_id === customerId);
    if (customer && customer.person_id) {
        const name = getPersonResolvedName(customer.person_id);
        if (name && name !== customer.person_id) return name;
    }
    return customerId;
}

function getWarehouseDisplayName(whId) {
    const wh = appState.warehouses.find(w => w.id === whId);
    return wh ? `${wh.warehouse_name} (${wh.id})` : whId;
}

function getWarehouseTypeOrder(type = '') {
    const t = String(type).trim();
    if (t.includes('自用') || t === 'PRIVATE_HUB') return 1;
    if (t.includes('海外') || t === 'TRANSIT_OVERSEAS') return 2;
    if (t.includes('官方') || t === 'OFFICIAL_CENTER') return 3;
    if (t.includes('物流') || t === 'LOGISTICS_IN_TRANSIT') return 4;
    return 99;
}

// ==========================================================================
// 4. 生命週期與資料拉取引擎 (跨 4 大試算表物理順序讀取)
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(SPREADSHEET_CONFIG.gasDeploymentId);
    }
    await initAdjustApp();
    applyUIPermissions();
});

async function initAdjustApp() {
    if (isInitialized) return;
    isInitialized = true;

    $('#hudSyncTime').text(getFormattedNow());
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

async function fetchAllGoogleSheetsData() {
    if (window.AppLoading) {
        AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在連動同步 4 大試算表...', '盤點調撥雲端同步');
    }
    const $btn = $('#btnSyncSheets');
    $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 同步中...');

    try {
        const [rawWarehouses, rawAdjustments, rawPersons, rawPartners, rawProducts, rawCustomers] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '據點倉儲').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '盤點調撥').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetOrg, '個人主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetOrg, '夥伴主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPrd, '產品主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetCrm, '客戶主檔').catch(() => [])
        ]);

        parseAllData({
            rawWarehouses,
            rawAdjustments,
            rawPersons,
            rawPartners,
            rawProducts,
            rawCustomers
        });

        refreshAllViews();
        AppToast.success(`4 大試算表連動同步完成 (${appState.adjustments.length} 筆盤點調撥紀錄)`);
    } catch (err) {
        console.error("試算表同步異常:", err);
        AppToast.error("部分試算表連線失敗，請檢查 4 大試算表共用設定");
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-cloud-arrow-down"></i> 重新同步');
        if (window.AppLoading) {
            AppLoading.hide();
        }
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

    // 6. 解析盤點調撥 (表 307: psi_adjustments, 0~24 實體欄位順序)
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
    // 倉儲選單 (無假資料)
    const $auditWh = $('#auditWarehouseSelect').empty().append('<option value="">-- 請選擇盤點倉儲 --</option>');
    const $trFromWh = $('#trFromWarehouseSelect').empty().append('<option value="">-- 請選擇調出倉 --</option>');
    const $trToWh = $('#trToWarehouseSelect').empty().append('<option value="">-- 請選擇調入倉 --</option>');
    const $modalFromWh = $('#fieldFromWarehouseId').empty().append('<option value="">-- 請選擇發生倉儲 --</option>');
    const $modalToWh = $('#fieldToWarehouseId').empty().append('<option value="">-- 單倉異動無須填寫 --</option>');

    const sortedWarehouses = [...appState.warehouses].sort((a, b) => {
        const orderA = getWarehouseTypeOrder(a.warehouse_type);
        const orderB = getWarehouseTypeOrder(b.warehouse_type);
        if (orderA !== orderB) return orderA - orderB;
        return a.id.localeCompare(b.id);
    });

    sortedWarehouses.forEach(w => {
        const opt = `<option value="${w.id}">${w.warehouse_name} (${w.id})</option>`;
        $auditWh.append(opt);
        $trFromWh.append(opt);
        $trToWh.append(opt);
        $modalFromWh.append(opt);
        $modalToWh.append(opt);
    });

    if (sortedWarehouses.length > 1) {
        $('#trFromWarehouseSelect').val(sortedWarehouses[0].id);
        $('#trToWarehouseSelect').val(sortedWarehouses[1].id);
    }

    // 產品選單 (無假資料)
    const $auditPrd = $('#auditProductSelect').empty().append('<option value="">-- 請選擇盤點品項 --</option>');
    const $trPrd = $('#trProductSelect').empty().append('<option value="">-- 請選擇調撥品項 --</option>');
    const $modalPrd = $('#fieldProductId').empty().append('<option value="">-- 請選擇品項 --</option>');

    appState.products.forEach(p => {
        const opt = `<option value="${p.product_code}" data-base="${p.official_product_code || p.product_code}" data-name="${p.name}" data-price="${p.price}" data-sv="${p.sv_point}">${p.name} (${p.product_code})</option>`;
        $auditPrd.append(opt);
        $trPrd.append(opt);
        $modalPrd.append(opt);
    });

    // 夥伴選單 (operator_partner_id)
    const $auditOp = $('#auditOperatorSelect').empty().append('<option value="">-- 請選擇經手夥伴 --</option>');
    const $trOp = $('#trOperatorSelect').empty().append('<option value="">-- 請選擇經手夥伴 --</option>');
    const $modalOp = $('#fieldOperatorPartnerId').empty().append('<option value="">-- 請選擇經手夥伴 --</option>');

    const sortedPartners = [...appState.partners].map(p => ({
        id: p.partner_id,
        label: `${getPartnerResolvedName(p.partner_id)} (${p.member_no || p.partner_id})`
    })).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));

    sortedPartners.forEach(p => {
        const opt = `<option value="${p.id}">${p.label}</option>`;
        $auditOp.append(opt);
        $trOp.append(opt);
        $modalOp.append(opt);
    });

    // 客戶選單 (target_prospect_id)
    const $auditProspect = $('#auditProspectSelect').empty().append('<option value="">-- 非試用體驗無須選擇 --</option>');
    const $modalProspect = $('#fieldTargetProspectId').empty().append('<option value="">-- 非試用發放無須選擇 --</option>');

    const sortedCustomers = [...appState.customers].map(c => ({
        id: c.customer_id,
        label: `${getCustomerResolvedName(c.customer_id)} (${c.customer_id})`
    })).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));

    sortedCustomers.forEach(c => {
        const opt = `<option value="${c.id}">${c.label}</option>`;
        $auditProspect.append(opt);
        $modalProspect.append(opt);
    });
}

function renderMetrics() {
    let transferQty = 0;
    let transferBatches = 0;
    let lossAmount = 0;
    let lossBoxes = 0;
    let demoQty = 0;
    let demoSv = 0;
    let unboxingQty = 0;

    appState.adjustments.forEach(item => {
        const absQty = Math.abs(item.quantity);
        if (item.adj_type === '跨倉調撥') {
            transferQty += absQty;
            transferBatches++;
        } else if (item.adj_type === '盤虧' || item.adj_type === '破損過期') {
            lossAmount += item.total_cost;
            lossBoxes += absQty;
        } else if (item.adj_type === '試用發放' || item.adj_type === '自用消耗') {
            demoQty += absQty;
            demoSv += item.total_sv;
        } else if (item.adj_type === '拆盒解封') {
            unboxingQty += absQty;
        }
    });

    $('#statTransferQty').text(`${transferQty.toLocaleString()} 盒`);
    $('#statTransferBatches').text(transferBatches);
    $('#statLossAmount').text(`$${lossAmount.toLocaleString()}`);
    $('#statLossBoxes').text(lossBoxes);
    $('#statDemoQty').text(`${demoQty.toLocaleString()} 件`);
    $('#statDemoSv').text(demoSv.toLocaleString());
    $('#statUnboxingQty').text(`${unboxingQty.toLocaleString()} 支/條`);
}

function switchTacticalMode(mode) {
    appState.currentTacticalMode = mode;
    if (mode === 'AUDIT') {
        $('#btnModeAudit').addClass('active');
        $('#btnModeTransfer').removeClass('active');
        $('#sectionAuditWorkbench').removeClass('d-none');
        $('#sectionTransferWorkbench').addClass('d-none');
        if (dtAdjustmentsInstance) dtAdjustmentsInstance.columns.adjust().responsive.recalc();
    } else {
        $('#btnModeTransfer').addClass('active');
        $('#btnModeAudit').removeClass('active');
        $('#sectionTransferWorkbench').removeClass('d-none');
        $('#sectionAuditWorkbench').addClass('d-none');
        if (dtTransfersInstance) dtTransfersInstance.columns.adjust().responsive.recalc();
    }
}

function renderAdjustmentsTable() {
    const hasAdminRights = isMasterAdmin();

    const formatted = appState.adjustments.map(a => {
        let badgeClass = 'badge-info-subtle';
        if (a.adj_type === '盤盈') badgeClass = 'badge-success-subtle';
        else if (a.adj_type === '盤虧') badgeClass = 'badge-danger-subtle';
        else if (a.adj_type === '破損過期') badgeClass = 'badge-danger-subtle';
        else if (a.adj_type === '自用消耗') badgeClass = 'badge-purple-subtle';
        else if (a.adj_type === '試用發放') badgeClass = 'badge-warning-subtle';
        else if (a.adj_type === '拆盒解封') badgeClass = 'badge-purple-subtle';

        const operatorResolved = getPartnerResolvedName(a.operator_partner_id);
        const prospectResolved = a.target_prospect_id ? getCustomerResolvedName(a.target_prospect_id) : '';

        const qtyTag = a.quantity > 0 
            ? `<span class="variance-tag variance-gain">+${a.quantity}</span>` 
            : (a.quantity < 0 ? `<span class="variance-tag variance-loss">${a.quantity}</span>` : `<span class="variance-tag variance-balanced">0</span>`);

        const actionButtons = `
            <div class="d-flex align-items-center justify-content-end gap-1">
                ${hasAdminRights ? `
                    <button class="btn btn-sm btn-outline-primary py-0 px-2 admin-action-btn" title="編輯單據" onclick="openEditAdjustmentModal('${a.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger py-0 px-2 admin-action-btn" title="刪除單據" onclick="deleteAdjustmentRecord('${a.id}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>'}
            </div>
        `;

        return {
            id_and_type: `
                <div>
                    <div class="fw-bold text-white">${a.id}</div>
                    <span class="badge ${badgeClass}">${a.adj_type}</span>
                </div>
            `,
            warehouses: `
                <div>
                    <span class="badge badge-purple-subtle">${getWarehouseDisplayName(a.from_warehouse_id)}</span>
                    ${a.to_warehouse_id ? `<div class="text-info small mt-1"><i class="fa-solid fa-arrow-down-long"></i> ${getWarehouseDisplayName(a.to_warehouse_id)}</div>` : ''}
                </div>
            `,
            product_batch: `
                <div>
                    <div class="fw-bold text-white">${a.product_name_snaps || '-'}</div>
                    <span class="batch-chip">LOT: ${a.batch_no || '-'}</span>
                </div>
            `,
            quantity_unit: `
                <div>
                    ${qtyTag} <span class="badge badge-muted-subtle ms-1">${a.adj_unit}</span>
                </div>
            `,
            cost_breakdown: `
                <div>
                    <div class="fw-bold text-white">$${a.total_cost.toLocaleString()}</div>
                    <div class="text-secondary small">@ $${a.unit_cost} ${a.currency_code}</div>
                </div>
            `,
            sv_breakdown: `<span class="text-warning fw-bold">${a.total_sv.toLocaleString()} SV</span>`,
            parties: `
                <div>
                    <div class="small text-white fw-bold"><i class="fa-solid fa-user-shield text-primary"></i> ${operatorResolved}</div>
                    ${prospectResolved ? `<div class="small text-info"><i class="fa-solid fa-user text-warning"></i> 對象：${prospectResolved}</div>` : ''}
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
            responsive: true,
            pageLength: 8,
            lengthChange: false,
            ordering: true,
            order: [[7, 'desc']],
            columns: [
                { data: 'id_and_type' },
                { data: 'warehouses' },
                { data: 'product_batch' },
                { data: 'quantity_unit' },
                { data: 'cost_breakdown' },
                { data: 'sv_breakdown' },
                { data: 'parties' },
                { data: 'date_info' },
                { data: 'actions' }
            ]
        });
    }
}

function renderTransfersTable() {
    const hasAdminRights = isMasterAdmin();
    const transfersOnly = appState.adjustments.filter(a => a.adj_type === '跨倉調撥');

    const formatted = transfersOnly.map(t => {
        const operatorResolved = getPartnerResolvedName(t.operator_partner_id);

        const actionButtons = `
            <div class="d-flex align-items-center justify-content-end gap-1">
                ${hasAdminRights ? `
                    <button class="btn btn-sm btn-outline-primary py-0 px-2 admin-action-btn" title="編輯調撥單" onclick="openEditAdjustmentModal('${t.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger py-0 px-2 admin-action-btn" title="刪除單據" onclick="deleteAdjustmentRecord('${t.id}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>'}
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
                    <div class="text-info small mt-1"><i class="fa-solid fa-arrow-down-long"></i> ${getWarehouseDisplayName(t.to_warehouse_id) || '未指定'}</div>
                </div>
            `,
            product: `
                <div>
                    <div class="fw-bold text-white">${t.product_name_snaps || '-'}</div>
                    <span class="batch-chip">LOT: ${t.batch_no || '-'}</span>
                </div>
            `,
            quantity: `<span class="badge badge-info-subtle px-2 py-1">${Math.abs(t.quantity)} ${t.adj_unit}</span>`,
            cost: `<span class="text-white fw-bold">$${t.total_cost.toLocaleString()} ${t.currency_code}</span>`,
            sv: `<span class="text-warning fw-bold">${t.total_sv.toLocaleString()} SV</span>`,
            operator: `<span class="small text-light">${operatorResolved}</span>`,
            reason: `<div class="small text-secondary text-truncate" style="max-width: 140px;" title="${t.reason_desc}">${t.reason_desc || '-'}</div>`,
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
            responsive: true,
            pageLength: 8,
            lengthChange: false,
            ordering: true,
            order: [[0, 'desc']],
            columns: [
                { data: 'id_and_date' },
                { data: 'route' },
                { data: 'product' },
                { data: 'quantity' },
                { data: 'cost' },
                { data: 'sv' },
                { data: 'operator' },
                { data: 'reason' },
                { data: 'actions' }
            ]
        });
    }
}

function renderCharts() {
    const ctxTransfer = document.getElementById('chartTransferFlow');
    if (ctxTransfer) {
        const monthMap = {};
        appState.adjustments.filter(a => a.adj_type === '跨倉調撥').forEach(t => {
            const m = (t.adj_date || '').slice(0, 7) || '未分類';
            monthMap[m] = (monthMap[m] || 0) + Math.abs(t.quantity);
        });

        const labels = Object.keys(monthMap).sort();
        const data = labels.map(l => monthMap[l]);

        if (appState.chartTransferInstance) appState.chartTransferInstance.destroy();
        appState.chartTransferInstance = new Chart(ctxTransfer, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '跨倉調撥總盒數',
                    data: data,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.15)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: '#a78bfa' }, grid: { color: 'rgba(139, 92, 246, 0.1)' } },
                    y: { ticks: { color: '#c084fc' }, grid: { color: 'rgba(139, 92, 246, 0.15)' } }
                },
                plugins: { legend: { labels: { color: '#f5f3ff', font: { size: 11 } } } }
            }
        });
    }

    const ctxPareto = document.getElementById('chartVariancePareto');
    if (ctxPareto) {
        const types = ['跨倉調撥', '盤盈', '盤虧', '破損過期', '自用消耗', '試用發放', '拆盒解封'];
        const counts = types.map(t => appState.adjustments.filter(a => a.adj_type === t).length);

        if (appState.chartParetoInstance) appState.chartParetoInstance.destroy();
        appState.chartParetoInstance = new Chart(ctxPareto, {
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
                cutout: '68%',
                plugins: { legend: { position: 'right', labels: { color: '#e2d9f3', font: { size: 10 } } } }
            }
        });
    }
}

// ==========================================================================
// 6. 工作台交互運算與 C/R/U/D 實體回寫引擎
// ==========================================================================
function initEvents() {
    // 預留鍵盤與通用監聽
}

function adjustCountStep(delta) {
    const input = document.getElementById('auditInputPhysicalQty');
    let val = parseInt(input.value, 10) || 0;
    val = Math.max(0, val + delta);
    input.value = val;
    calculateAuditVariance();
}

function calculateAuditVariance() {
    const bookQty = parseInt($('#auditValBookQty').text(), 10) || 0;
    const physicalQty = parseInt($('#auditInputPhysicalQty').val(), 10) || 0;
    const diff = physicalQty - bookQty;

    const $opt = $('#auditProductSelect option:selected');
    const price = parseFloat($opt.data('price')) || 0;
    const totalCost = Math.abs(diff) * price;

    const $tag = $('#auditTagVarianceStatus');
    const $lblCost = $('#auditLblVarianceCost');
    const $reasonBox = $('#auditReasonContainer');

    if (diff === 0) {
        $tag.attr('class', 'variance-tag variance-balanced').html('<i class="fa-solid fa-check"></i> 帳實相符 (0)');
        $lblCost.text('$0 TWD');
        $reasonBox.addClass('d-none');
    } else if (diff < 0) {
        $tag.attr('class', 'variance-tag variance-loss').html(`<i class="fa-solid fa-triangle-exclamation"></i> 盤虧短少 (${diff})`);
        $lblCost.text(`-$${totalCost.toLocaleString()} TWD`);
        $reasonBox.removeClass('d-none');
        $('#auditSelAdjType').val('盤虧');
    } else {
        $tag.attr('class', 'variance-tag variance-gain').html(`<i class="fa-solid fa-plus"></i> 盤盈溢出 (+${diff})`);
        $lblCost.text(`+$${totalCost.toLocaleString()} TWD`);
        $reasonBox.removeClass('d-none');
        $('#auditSelAdjType').val('盤盈');
    }
}

function loadProductStockForAudit() {
    const $opt = $('#auditProductSelect option:selected');
    if (!$opt.length || !$opt.val()) {
        $('#auditLblProductCode').text('-');
        $('#auditLblProductName').text('請先選擇盤點品項');
        $('#auditLblBatchNo').text('LOT: -');
        $('#auditValBookQty').html(`0 <span class="fs-6 text-muted">盒</span>`);
        $('#auditLblUnitCost').text('$0 TWD');
        $('#auditLblUnitSv').text('0 SV');
        $('#auditInputPhysicalQty').val(0);
        calculateAuditVariance();
        return;
    }

    const code = $opt.val();
    const name = $opt.data('name');
    const price = parseFloat($opt.data('price')) || 0;
    const sv = parseInt($opt.data('sv'), 10) || 0;

    $('#auditLblProductCode').text(code);
    $('#auditLblProductName').text(name);
    $('#auditLblBatchNo').text('LOT: -');
    $('#auditValBookQty').html(`0 <span class="fs-6 text-muted">盒</span>`);
    $('#auditLblUnitCost').text(`$${price.toLocaleString()} TWD`);
    $('#auditLblUnitSv').text(`${sv} SV`);
    $('#auditInputPhysicalQty').val(0);

    calculateAuditVariance();
}

function updateTransferCostCalc() {
    const $opt = $('#trProductSelect option:selected');
    const price = parseFloat($opt.data('price')) || 0;
    const sv = parseInt($opt.data('sv'), 10) || 0;
    const qty = parseInt($('#trQtyInput').val(), 10) || 0;
    const currency = $('#trCurrencySelect').val();

    $('#trLblTotalCost').text(`$${(price * qty).toLocaleString()} ${currency}`);
    $('#trLblTotalSv').text(`${(sv * qty).toLocaleString()} SV`);
}

function resetAuditForm() {
    $('#auditInputPhysicalQty').val(0);
    $('#auditTxtReason').val('');
    $('#auditProspectSelect').val('');
    calculateAuditVariance();
}

async function commitAuditRecord() {
    const $opt = $('#auditProductSelect option:selected');
    if (!$opt.val()) {
        AppToast.warning("請先選擇盤點品項！");
        return;
    }

    const bookQty = parseInt($('#auditValBookQty').text(), 10) || 0;
    const physicalQty = parseInt($('#auditInputPhysicalQty').val(), 10) || 0;
    const diff = physicalQty - bookQty;

    const unitCost = parseFloat($opt.data('price')) || 0;
    const unitSv = parseInt($opt.data('sv'), 10) || 0;
    const totalCost = Math.abs(diff) * unitCost;
    const totalSv = Math.abs(diff) * unitSv;

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
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入中...');
        await SheetAdapter.sendRequest('CREATE', '盤點調撥', adjNo, rowDataArray);
        appState.adjustments.unshift(newObj);
        refreshAllViews();
        AppToast.success(`盤點單據【${adjNo}】已成功同步至 Google 試算表！`);
    } catch (err) {
        AppToast.error("寫入失敗: " + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 寫入盤點覆核單據');
    }
}

async function commitTransferOrder() {
    const fromWh = $('#trFromWarehouseSelect').val();
    const toWh = $('#trToWarehouseSelect').val();
    const qty = parseInt($('#trQtyInput').val(), 10) || 0;

    if (!fromWh || !toWh) {
        AppToast.warning("請完整選擇調出倉儲與調入倉儲！");
        return;
    }
    if (fromWh === toWh) {
        AppToast.warning("調出倉儲與調入倉儲不能相同！");
        return;
    }
    if (qty <= 0) {
        AppToast.warning("請填寫大於 0 的調撥數量！");
        return;
    }

    const $opt = $('#trProductSelect option:selected');
    if (!$opt.val()) {
        AppToast.warning("請選擇調撥品項！");
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
    const reason = $('#trReasonInput').val().trim() || '跨據點戰術調撥';

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
        refreshAllViews();
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

function handleModalProductChange() {
    const $opt = $('#fieldProductId option:selected');
    $('#fieldOfficialProductCode').val($opt.data('base') || $opt.val() || '');
    $('#fieldProductNameSnaps').val($opt.data('name') || '');
    $('#fieldUnitCost').val($opt.data('price') || 0);
    $('#fieldUnitSv').val($opt.data('sv') || 0);
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
    $('#adjustModalTitle').html('<i class="fa-solid fa-file-circle-plus text-primary"></i> 發起盤點調撥單據');
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

    $('#adjustModalTitle').html('<i class="fa-solid fa-pen-to-square text-primary"></i> 編輯盤點調撥單據');
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
    if (!id) {
        AppToast.warning("單號為主鍵必填項！");
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
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入中...');
        if (mode === 'add') {
            await SheetAdapter.sendRequest('CREATE', '盤點調撥', id, rowDataArray);
            appState.adjustments.unshift(updatedObj);
        } else {
            await SheetAdapter.sendRequest('UPDATE', '盤點調撥', id, rowDataArray);
            const idx = appState.adjustments.findIndex(a => a.id === id);
            if (idx !== -1) appState.adjustments[idx] = updatedObj;
        }

        refreshAllViews();
        bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide();
        AppToast.success(`單據【${id}】已成功儲存！`);
    } catch (err) {
        AppToast.error("寫入失敗: " + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存單據變更');
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
        refreshAllViews();
        AppToast.success(`單據【${id}】已成功刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗: " + err.message);
    }
}

// ==========================================================================
// 8. 4 大試算表連線設定與匯出
// ==========================================================================
function openConfigModal() {
    $('#cfgSheetPsi').val(SPREADSHEET_CONFIG.sheetPsi);
    $('#cfgSheetOrg').val(SPREADSHEET_CONFIG.sheetOrg);
    $('#cfgSheetPrd').val(SPREADSHEET_CONFIG.sheetPrd);
    $('#cfgSheetCrm').val(SPREADSHEET_CONFIG.sheetCrm);
    $('#cfgGasDeploymentId').val(SPREADSHEET_CONFIG.gasDeploymentId);
    new bootstrap.Modal(document.getElementById('configModal')).show();
}

function saveSpreadsheetConfig() {
    SPREADSHEET_CONFIG.sheetPsi = $('#cfgSheetPsi').val().trim();
    SPREADSHEET_CONFIG.sheetOrg = $('#cfgSheetOrg').val().trim();
    SPREADSHEET_CONFIG.sheetPrd = $('#cfgSheetPrd').val().trim();
    SPREADSHEET_CONFIG.sheetCrm = $('#cfgSheetCrm').val().trim();
    SPREADSHEET_CONFIG.gasDeploymentId = $('#cfgGasDeploymentId').val().trim();

    localStorage.setItem('cfg_adj_sheet_psi', SPREADSHEET_CONFIG.sheetPsi);
    localStorage.setItem('cfg_adj_sheet_org', SPREADSHEET_CONFIG.sheetOrg);
    localStorage.setItem('cfg_adj_sheet_prd', SPREADSHEET_CONFIG.sheetPrd);
    localStorage.setItem('cfg_adj_sheet_crm', SPREADSHEET_CONFIG.sheetCrm);
    localStorage.setItem('cfg_adj_gas_id', SPREADSHEET_CONFIG.gasDeploymentId);

    if (window.SheetAdapter) {
        SheetAdapter.init(SPREADSHEET_CONFIG.gasDeploymentId);
    }
    bootstrap.Modal.getInstance(document.getElementById('configModal')).hide();
    AppToast.success("4 大試算表連線組態已更新，開始重新同步...");
    fetchAllGoogleSheetsData();
}

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