// ==========================================================================
// 1. 系統組態與三張試算表來源定義
// ==========================================================================
const SPREADSHEET_CONFIG = {
    sheetPsi: '1_plHUdfzIublSv1apN5qQ5reO6YxqBkI1MdnQeDbAxo',
    sheetOrg: '1N-HniBDo7wJHidfsKyG-dr7kh0-UTNtFpM7nyFDL3eg',
    sheetPrd: '18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I',
    gasDeploymentId: 'AKfycbx3vDysJBLkmscZG8Jonv6EMyHLzmb-AjxfDqzjOSiGD-8oInz8UowbLLJRKVbbxPVt'
};

// 系統資料狀態庫 (不注入預設假資料)
let appState = {
    inbounds: [],
    inboundItems: [],
    warehouses: [],
    persons: [],
    partners: [],
    products: [],
    activePipelineFilter: 'ALL',
    inboundChartInstance: null
};

let inboundDataTableInstance = null;
let isInitialized = false;

// ==========================================================================
// 2. 欄位物理索引安全取值器 (0-Based 絕對物理順序)
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
// 3. 夥伴名稱權重解析核心 (展示名稱 > 中文 > 英文 > 暱稱)
// ==========================================================================
function getPartnerResolvedName(partnerId) {
    if (!partnerId) return '-';
    const partner = appState.partners.find(p => p.partner_id === partnerId || p.member_no === partnerId);
    const personId = partner ? partner.person_id : partnerId;
    const person = appState.persons.find(p => p.person_id === personId || p.person_id === partnerId);

    let chosenName = '';
    if (person) {
        if (person.display_name && person.display_name.trim()) chosenName = person.display_name.trim();
        else if (person.name_zh && person.name_zh.trim()) chosenName = person.name_zh.trim();
        else if (person.name_en && person.name_en.trim()) chosenName = person.name_en.trim();
        else if (person.preferred_name && person.preferred_name.trim()) chosenName = person.preferred_name.trim();
    }

    if (!chosenName && partner) {
        if (partner.name_zh && partner.name_zh.trim()) chosenName = partner.name_zh.trim();
    }

    return chosenName || partnerId;
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
// 4. 生命週期與資料拉取引擎 (跨 3 大試算表物理順序讀取)
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(SPREADSHEET_CONFIG.gasDeploymentId);
    }
    await initInboundApp();
    applyUIPermissions();
});

async function initInboundApp() {
    if (isInitialized) return;
    isInitialized = true;

    $('#hudSyncTime').text(getFormattedNow());
    initFormEvents();
    await fetchAllGoogleSheetsData();
}

async function fetchGoogleSheetCsv(spreadsheetId, sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`讀取工作表 [${sheetName}] 失敗 (HTTP ${res.status})`);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
    return (parsed.data || []).slice(1); // 略過第 0 列標題
}

async function fetchAllGoogleSheetsData() {
    if (window.AppLoading) {
        AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在連動同步 3 大試算表...', '進貨入庫雲端同步');
    }
    const $btn = $('#btnSyncSheets');
    $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 同步中...');

    try {
        // 試算表 1：據點倉儲、進貨主檔、進貨明細
        // 試算表 2：個人主檔、夥伴主檔
        // 試算表 3：產品主檔
        const [rawWarehouses, rawInbounds, rawInboundItems, rawPersons, rawPartners, rawProducts] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '據點倉儲').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '進貨主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '進貨明細').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetOrg, '個人主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetOrg, '夥伴主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPrd, '產品主檔').catch(() => [])
        ]);

        parseAllData({
            rawWarehouses,
            rawInbounds,
            rawInboundItems,
            rawPersons,
            rawPartners,
            rawProducts
        });

        refreshAllViews();
        AppToast.success(`已完成 3 大試算表連動同步 (${appState.inbounds.length} 筆進貨單據)`);
    } catch (err) {
        console.error("試算表同步異常:", err);
        AppToast.error("部分試算表連線失敗，請檢查試算表 ID 與共用權限");
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

    // 4. 解析產品主檔 (表 101: prd_items)
    appState.products = (data.rawProducts || []).map(r => ({
        product_code: getVal(r, 0),
        region_code: getVal(r, 1, 'TW'),
        name: getVal(r, 3),
        short_name: getVal(r, 4),
        price: parseFloat(getVal(r, 11, '0')) || 0,
        sv_point: parseInt(getVal(r, 13, '0'), 10) || 0
    })).filter(p => p.product_code !== '');

    // 5. 解析進貨明細 (表 304: psi_inbound_items, 0~22 實體欄位順序)
    appState.inboundItems = (data.rawInboundItems || []).map(r => ({
        id: getVal(r, 0),
        inbound_id: getVal(r, 1),
        item_seq: parseInt(getVal(r, 2, '1'), 10) || 1,
        official_product_code: getVal(r, 3),
        product_name_snapshot: getVal(r, 4),
        product_id: getVal(r, 5),
        is_fee_item: getVal(r, 6, 'N'),
        currency_code: getVal(r, 7, 'TWD'),
        unit_cost: parseFloat(getVal(r, 8, '0')) || 0,
        unit_sv: parseInt(getVal(r, 9, '0'), 10) || 0,
        ordered_qty: parseInt(getVal(r, 10, '1'), 10) || 1,
        official_shipped_qty: parseInt(getVal(r, 11, '0'), 10) || 0,
        received_qty: parseInt(getVal(r, 12, '0'), 10) || 0,
        subtotal_sv: parseInt(getVal(r, 13, '0'), 10) || 0,
        subtotal_amount: parseFloat(getVal(r, 14, '0')) || 0,
        batch_no: getVal(r, 15),
        expiry_date: getVal(r, 16),
        stock_id: getVal(r, 17),
        remarks: getVal(r, 18),
        created_by: getVal(r, 19, 'SYSTEM'),
        created_at: getVal(r, 20),
        modified_by: getVal(r, 21, 'SYSTEM'),
        modified_at: getVal(r, 22)
    })).filter(item => item.id !== '');

    // 6. 解析進貨主檔 (表 303: psi_inbounds, 0~24 實體欄位順序)
    appState.inbounds = (data.rawInbounds || []).map(r => ({
        id: getVal(r, 0),
        official_order_no: getVal(r, 1),
        order_category: getVal(r, 2, '本人訂購'),
        order_center: getVal(r, 3, '網路'),
        performance_month: getVal(r, 4, ''),
        order_date: getVal(r, 5, ''),
        delivery_method: getVal(r, 6, '運送'),
        warehouse_id: getVal(r, 7, ''),
        purchaser_partner_id: getVal(r, 8, ''),
        sv_owner_partner_id: getVal(r, 9, ''),
        inbound_date: getVal(r, 10, ''),
        currency_code: getVal(r, 11, 'TWD'),
        product_amount: parseFloat(getVal(r, 12, '0')) || 0,
        shipping_fee: parseFloat(getVal(r, 13, '0')) || 0,
        total_cost_amount: parseFloat(getVal(r, 14, '0')) || 0,
        total_sv: parseInt(getVal(r, 15, '0'), 10) || 0,
        total_boxes: parseInt(getVal(r, 16, '0'), 10) || 0,
        official_shipping_no: getVal(r, 17, ''),
        shipping_date: getVal(r, 18, ''),
        status: getVal(r, 19, '草稿'),
        remarks: getVal(r, 20, ''),
        created_by: getVal(r, 21, 'SYSTEM'),
        created_at: getVal(r, 22, ''),
        modified_by: getVal(r, 23, 'SYSTEM'),
        modified_at: getVal(r, 24, '')
    })).filter(d => d.id !== '');
}

// ==========================================================================
// 5. 畫面渲染與圖表更新
// ==========================================================================
function refreshAllViews() {
    populateFilterOptions();
    renderCounters();
    renderKpis();
    renderChart();
    renderDataTable();
}

function populateFilterOptions() {
    const $whFilter = $('#filterWarehouse').empty().append('<option value="">全部收貨倉庫 (All Warehouses)</option>');
    const $whField = $('#fieldWarehouseId').empty().append('<option value="">-- 請選擇入庫實體據點 --</option>');
    const $centerField = $('#fieldOrderCenter').empty().append('<option value="網路">網路 (APP / 官方電商)</option>');

    // 依自用 -> 海外 -> 官方 -> 物流排序倉儲
    const sortedWarehouses = [...appState.warehouses].sort((a, b) => {
        const orderA = getWarehouseTypeOrder(a.warehouse_type);
        const orderB = getWarehouseTypeOrder(b.warehouse_type);
        if (orderA !== orderB) return orderA - orderB;
        return a.id.localeCompare(b.id);
    });

    sortedWarehouses.forEach(w => {
        const opt = `<option value="${w.id}">${w.warehouse_name} (${w.id})</option>`;
        $whFilter.append(opt);
        $whField.append(opt);
        if (w.warehouse_type === 'OFFICIAL_CENTER' || (w.warehouse_type && w.warehouse_type.includes('官方'))) {
            $centerField.append(`<option value="${w.warehouse_name}">${w.warehouse_name}</option>`);
        }
    });

    // 夥伴下拉選單：依據展示名稱排序，完全依賴主檔無假資料
    const $purchaser = $('#fieldPurchaserPartnerId').empty().append('<option value="">-- 請選擇出資夥伴 --</option>');
    const $svOwner = $('#fieldSvOwnerPartnerId').empty().append('<option value="">-- 請選擇點數歸屬人 --</option>');

    const sortedPartners = [...appState.partners].map(p => ({
        id: p.partner_id,
        label: `${getPartnerResolvedName(p.partner_id)} (${p.member_no || p.partner_id})`
    })).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));

    sortedPartners.forEach(p => {
        $purchaser.append(`<option value="${p.id}">${p.label}</option>`);
        $svOwner.append(`<option value="${p.id}">${p.label}</option>`);
    });

    // 月份選單
    const months = Array.from(new Set(appState.inbounds.map(d => d.performance_month))).filter(Boolean).sort().reverse();
    const $mFilter = $('#filterPerformanceMonth').empty().append('<option value="">全部業績月份 (All Months)</option>');
    months.forEach(m => $mFilter.append(`<option value="${m}">${m}</option>`));
}

function renderCounters() {
    const list = appState.inbounds;
    $('#countAll').text(list.length);
    $('#countDraft').text(list.filter(d => d.status === '草稿').length);
    $('#countTransit').text(list.filter(d => d.status === '運輸中').length);
    $('#countCompleted').text(list.filter(d => d.status === '已入庫驗收').length);
    $('#countVoid').text(list.filter(d => d.status === '已作廢').length);
}

function renderKpis() {
    let totalBoxes = 0;
    let totalCost = 0;
    let totalSv = 0;
    let decoupledCount = 0;

    appState.inbounds.forEach(item => {
        if (item.status !== '已作廢') {
            totalBoxes += item.total_boxes;
            totalCost += item.total_cost_amount;
            totalSv += item.total_sv;
            if (item.purchaser_partner_id && item.sv_owner_partner_id && item.purchaser_partner_id !== item.sv_owner_partner_id) {
                decoupledCount++;
            }
        }
    });

    $('#kpiTotalBoxes').text(totalBoxes.toLocaleString());
    $('#kpiTotalCost').text(`$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
    $('#kpiTotalSv').text(totalSv.toLocaleString());
    $('#kpiDecoupledOrders').text(decoupledCount);
}

function renderChart() {
    const ctx = document.getElementById('inboundChart');
    if (!ctx) return;

    const monthMap = {};
    appState.inbounds.forEach(d => {
        if (d.status !== '已作廢') {
            const m = d.performance_month || '未分類';
            if (!monthMap[m]) monthMap[m] = { sv: 0, cost: 0 };
            monthMap[m].sv += d.total_sv;
            monthMap[m].cost += d.total_cost_amount;
        }
    });

    const labels = Object.keys(monthMap).sort();
    const svData = labels.map(l => monthMap[l].sv);
    const costData = labels.map(l => monthMap[l].cost);

    if (appState.inboundChartInstance) {
        appState.inboundChartInstance.destroy();
    }

    appState.inboundChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '月度考核 SV',
                    data: svData,
                    backgroundColor: 'rgba(139, 92, 246, 0.7)',
                    borderColor: '#8b5cf6',
                    borderRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: '進貨實付支出 (TWD)',
                    data: costData,
                    type: 'line',
                    borderColor: '#34d399',
                    backgroundColor: 'rgba(52, 211, 153, 0.2)',
                    tension: 0.35,
                    fill: false,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: { color: '#a78bfa' },
                    grid: { color: 'rgba(139, 92, 246, 0.1)' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: { color: '#c084fc' },
                    grid: { color: 'rgba(139, 92, 246, 0.15)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: { color: '#34d399' },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#f5f3ff', font: { size: 11 } }
                }
            }
        }
    });
}

function renderDataTable() {
    const currentList = getFilteredData();
    const formattedRows = currentList.map(item => formatTableRow(item));

    if (inboundDataTableInstance) {
        inboundDataTableInstance.clear();
        inboundDataTableInstance.rows.add(formattedRows);
        inboundDataTableInstance.draw();
    } else {
        inboundDataTableInstance = $('#inboundDataTable').DataTable({
            data: formattedRows,
            responsive: true,
            pageLength: 10,
            ordering: true,
            order: [[3, 'desc']],
            columns: [
                { data: 'order_id' },
                { data: 'center_and_warehouse' },
                { data: 'four_flow' },
                { data: 'order_dates' },
                { data: 'perf_month' },
                { data: 'total_boxes' },
                { data: 'cost_breakdown' },
                { data: 'total_sv' },
                { data: 'status' },
                { data: 'actions' }
            ]
        });
    }

    $('#tableSummaryInfo').text(`顯示 ${formattedRows.length} / ${appState.inbounds.length} 筆`);
}

function getFilteredData() {
    const wh = $('#filterWarehouse').val();
    const month = $('#filterPerformanceMonth').val();

    return appState.inbounds.filter(item => {
        const matchPipeline = (appState.activePipelineFilter === 'ALL') || (item.status === appState.activePipelineFilter);
        const matchWh = (!wh) || (item.warehouse_id === wh);
        const matchMonth = (!month) || (item.performance_month === month);
        return matchPipeline && matchWh && matchMonth;
    });
}

function formatTableRow(item) {
    const hasAdminRights = isMasterAdmin();

    // 狀態標籤全面套用筆記本共用 subtle 類別
    let statusBadge = '<span class="badge badge-muted-subtle"><i class="fa-solid fa-pen-ruler me-1"></i>草稿</span>';
    if (item.status === '運輸中') {
        statusBadge = '<span class="badge badge-info-subtle"><i class="fa-solid fa-truck-fast me-1"></i>運輸中</span>';
    } else if (item.status === '已入庫驗收') {
        statusBadge = '<span class="badge badge-success-subtle"><i class="fa-solid fa-circle-check me-1"></i>已入庫驗收</span>';
    } else if (item.status === '已作廢') {
        statusBadge = '<span class="badge badge-danger-subtle"><i class="fa-solid fa-ban me-1"></i>已作廢</span>';
    }

    const purchaserName = getPartnerResolvedName(item.purchaser_partner_id);
    const svOwnerName = getPartnerResolvedName(item.sv_owner_partner_id);
    const isDecoupled = item.purchaser_partner_id && item.sv_owner_partner_id && (item.purchaser_partner_id !== item.sv_owner_partner_id);

    const fourFlowHtml = `
        <div>
            <div class="small"><i class="fa-solid fa-credit-card text-secondary"></i> 出資：<span class="text-white fw-bold">${purchaserName}</span></div>
            <div class="small"><i class="fa-solid fa-award text-warning"></i> 掛點：<span class="text-warning fw-bold">${svOwnerName}</span></div>
            ${isDecoupled ? '<span class="badge badge-purple-subtle mt-1">四流分離</span>' : ''}
        </div>
    `;

    const actionButtons = `
        <div class="d-flex align-items-center justify-content-end gap-1">
            <button class="btn btn-sm btn-outline-info py-0 px-2" title="查看明細項" onclick="openDetailModal('${item.id}')">
                <i class="fa-solid fa-list-ul"></i>
            </button>
            ${hasAdminRights ? `
                <button class="btn btn-sm btn-outline-primary py-0 px-2 admin-action-btn" title="編輯單據" onclick="openEditModal('${item.id}')">
                    <i class="fa-solid fa-pen"></i>
                </button>
                ${item.status === '運輸中' ? `
                    <button class="btn btn-sm btn-outline-success py-0 px-2 admin-action-btn" title="驗收入庫歸戶" onclick="quickVerifyInbound('${item.id}')">
                        <i class="fa-solid fa-stamp"></i>
                    </button>
                ` : ''}
                <button class="btn btn-sm btn-outline-danger py-0 px-2 admin-action-btn" title="刪除單據" onclick="deleteInboundItem('${item.id}')">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>'}
        </div>
    `;

    return {
        order_id: `
            <div>
                <div class="fw-bold text-white">${item.id}</div>
                <div class="text-secondary small">官方訂單：${item.official_order_no || '-'}</div>
            </div>
        `,
        center_and_warehouse: `
            <div>
                <span class="badge badge-purple-subtle">${getWarehouseDisplayName(item.warehouse_id)}</span>
                <div class="text-secondary small mt-1"><i class="fa-solid fa-truck"></i> ${item.order_center || '-'} / ${item.delivery_method || '-'}</div>
            </div>
        `,
        four_flow: fourFlowHtml,
        order_dates: `
            <div>
                <div class="text-light">${item.order_date || '-'}</div>
                <div class="text-secondary small">驗收：${item.inbound_date || '未入庫'}</div>
            </div>
        `,
        perf_month: `<span class="badge badge-purple-subtle">${item.performance_month || '-'}</span>`,
        total_boxes: `<span class="fw-bold text-white">${item.total_boxes}</span> 盒`,
        cost_breakdown: `
            <div>
                <div class="fw-bold text-success">$${item.total_cost_amount.toLocaleString()}</div>
                <div class="text-secondary small">品：$${item.product_amount.toLocaleString()} | 運：$${item.shipping_fee.toLocaleString()}</div>
            </div>
        `,
        total_sv: `<span class="text-warning fw-bold">${item.total_sv.toLocaleString()} SV</span>`,
        status: statusBadge,
        actions: actionButtons
    };
}

// ==========================================================================
// 6. 互動與表單事件管理
// ==========================================================================
function initFormEvents() {
    $('#customTableSearch').on('keyup', function () {
        if (inboundDataTableInstance) {
            inboundDataTableInstance.search(this.value).draw();
        }
    });

    $('#filterWarehouse, #filterPerformanceMonth').on('change', function () {
        applyFilters();
    });
}

function filterByPipeline(status, element) {
    appState.activePipelineFilter = status;
    $('.pipeline-stepper .step-node').removeClass('active');
    $(element).addClass('active');
    applyFilters();
}

function applyFilters() {
    if (!inboundDataTableInstance) return;
    const filteredRows = getFilteredData().map(item => formatTableRow(item));
    inboundDataTableInstance.clear();
    inboundDataTableInstance.rows.add(filteredRows);
    inboundDataTableInstance.draw();
    $('#tableSummaryInfo').text(`過濾後共 ${filteredRows.length} 筆`);
}

function calculateTotalCost() {
    const product = parseFloat($('#fieldProductAmount').val()) || 0;
    const shipping = parseFloat($('#fieldShippingFee').val()) || 0;
    $('#fieldTotalCostAmount').val((product + shipping).toFixed(2));
}

function openAddModal() {
    $('#modalTitle').html('<i class="fa-solid fa-file-circle-plus text-primary"></i> 新增進貨入庫單據');
    $('#formMode').val('add');
    $('#inboundForm')[0].reset();

    const todayStr = new Date().toISOString().slice(0, 10);
    const dateCode = todayStr.replace(/-/g, '');
    const nextSeq = String(appState.inbounds.length + 1).padStart(4, '0');
    const newId = `INB-${dateCode}-${nextSeq}`;

    $('#fieldId').val(newId);
    $('#fieldOrderCategory').val('本人訂購');
    $('#fieldOrderCenter').val('網路');
    $('#fieldPerformanceMonth').val(todayStr.slice(0, 7));
    $('#fieldOrderDate').val(todayStr);
    $('#fieldDeliveryMethod').val('運送');
    $('#fieldWarehouseId').val(appState.warehouses[0] ? appState.warehouses[0].id : '');
    $('#fieldPurchaserPartnerId').val('');
    $('#fieldSvOwnerPartnerId').val('');
    $('#fieldCurrencyCode').val('TWD');
    $('#fieldStatus').val('運輸中');
    $('#fieldProductAmount').val('0.00');
    $('#fieldShippingFee').val('0.00');
    $('#fieldTotalCostAmount').val('0.00');
    $('#fieldTotalBoxes').val('0');
    $('#fieldTotalSv').val('0');

    new bootstrap.Modal(document.getElementById('inboundModal')).show();
}

function openEditModal(orderId) {
    const item = appState.inbounds.find(d => d.id === orderId);
    if (!item) return;

    $('#modalTitle').html('<i class="fa-solid fa-pen-to-square text-primary"></i> 編輯進貨單據');
    $('#formMode').val('edit');

    $('#fieldId').val(item.id);
    $('#fieldOfficialOrderNo').val(item.official_order_no);
    $('#fieldOrderCategory').val(item.order_category);
    $('#fieldOrderCenter').val(item.order_center);
    $('#fieldWarehouseId').val(item.warehouse_id);
    $('#fieldDeliveryMethod').val(item.delivery_method);
    $('#fieldPerformanceMonth').val(item.performance_month);
    $('#fieldOrderDate').val(item.order_date);
    $('#fieldPurchaserPartnerId').val(item.purchaser_partner_id);
    $('#fieldSvOwnerPartnerId').val(item.sv_owner_partner_id);
    $('#fieldCurrencyCode').val(item.currency_code);
    $('#fieldInboundDate').val(item.inbound_date);
    $('#fieldOfficialShippingNo').val(item.official_shipping_no);
    $('#fieldShippingDate').val(item.shipping_date);
    $('#fieldStatus').val(item.status);
    $('#fieldProductAmount').val(item.product_amount);
    $('#fieldShippingFee').val(item.shipping_fee);
    $('#fieldTotalCostAmount').val(item.total_cost_amount);
    $('#fieldTotalBoxes').val(item.total_boxes);
    $('#fieldTotalSv').val(item.total_sv);
    $('#fieldRemarks').val(item.remarks);

    new bootstrap.Modal(document.getElementById('inboundModal')).show();
}

function openDetailModal(orderId) {
    const item = appState.inbounds.find(d => d.id === orderId);
    if (!item) return;

    $('#detailOrderNo').text(item.id);
    $('#detailOfficialNo').text(item.official_order_no || '無');
    $('#detailPurchaser').text(getPartnerResolvedName(item.purchaser_partner_id));
    $('#detailSvOwner').text(getPartnerResolvedName(item.sv_owner_partner_id));

    const matchedItems = appState.inboundItems.filter(it => it.inbound_id === orderId);
    const $tbody = $('#inboundItemsTableBody').empty();

    if (matchedItems.length === 0) {
        $tbody.append('<tr><td colspan="12" class="text-center text-secondary py-3">本單據暫無細項明細數據</td></tr>');
    } else {
        matchedItems.forEach(it => {
            $tbody.append(`
                <tr>
                    <td class="text-secondary">${it.item_seq}</td>
                    <td>
                        <div class="fw-bold text-white">${it.product_name_snapshot || '-'}</div>
                        <div class="text-secondary small">${it.official_product_code || '-'}</div>
                    </td>
                    <td><span class="badge ${it.is_fee_item === 'Y' ? 'badge-muted-subtle' : 'badge-purple-subtle'}">${it.is_fee_item === 'Y' ? '費用' : '實體商品'}</span></td>
                    <td>$${it.unit_cost.toLocaleString()}</td>
                    <td class="text-warning">${it.unit_sv} SV</td>
                    <td>${it.ordered_qty}</td>
                    <td>${it.official_shipped_qty}</td>
                    <td class="text-success fw-bold">${it.received_qty}</td>
                    <td class="text-success">$${it.subtotal_amount.toLocaleString()}</td>
                    <td class="text-warning">${it.subtotal_sv} SV</td>
                    <td>
                        <div>${it.batch_no || '-'}</div>
                        <div class="text-secondary small">${it.expiry_date || '-'}</div>
                    </td>
                    <td class="text-secondary">${it.stock_id || '-'}</td>
                </tr>
            `);
        });
    }

    new bootstrap.Modal(document.getElementById('inboundDetailModal')).show();
}

async function saveInboundItem() {
    const mode = $('#formMode').val();
    const orderId = $('#fieldId').val().trim();
    if (!orderId) {
        AppToast.warning("進貨單號為必填主鍵！");
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existing = appState.inbounds.find(d => d.id === orderId);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    // 依據表 303 (psi_inbounds) 物理順序組成 0 ~ 24 陣列
    const rowDataArray = [
        orderId,                                                    // 0: id
        $('#fieldOfficialOrderNo').val().trim(),                    // 1: official_order_no
        $('#fieldOrderCategory').val(),                             // 2: order_category
        $('#fieldOrderCenter').val(),                               // 3: order_center
        $('#fieldPerformanceMonth').val(),                          // 4: performance_month
        $('#fieldOrderDate').val(),                                 // 5: order_date
        $('#fieldDeliveryMethod').val(),                            // 6: delivery_method
        $('#fieldWarehouseId').val(),                               // 7: warehouse_id
        $('#fieldPurchaserPartnerId').val(),                        // 8: purchaser_partner_id
        $('#fieldSvOwnerPartnerId').val(),                          // 9: sv_owner_partner_id
        $('#fieldInboundDate').val(),                               // 10: inbound_date
        $('#fieldCurrencyCode').val(),                              // 11: currency_code
        parseFloat($('#fieldProductAmount').val()) || 0,            // 12: product_amount
        parseFloat($('#fieldShippingFee').val()) || 0,              // 13: shipping_fee
        parseFloat($('#fieldTotalCostAmount').val()) || 0,          // 14: total_cost_amount
        parseInt($('#fieldTotalSv').val(), 10) || 0,                // 15: total_sv
        parseInt($('#fieldTotalBoxes').val(), 10) || 0,             // 16: total_boxes
        $('#fieldOfficialShippingNo').val().trim(),                 // 17: official_shipping_no
        $('#fieldShippingDate').val(),                              // 18: shipping_date
        $('#fieldStatus').val(),                                    // 19: status
        $('#fieldRemarks').val().trim(),                            // 20: remarks
        createdBy,                                                  // 21: created_by
        createdAt,                                                  // 22: created_at
        currentUser,                                                // 23: modified_by
        nowStr                                                      // 24: modified_at
    ];

    const updatedObj = {
        id: orderId,
        official_order_no: $('#fieldOfficialOrderNo').val().trim(),
        order_category: $('#fieldOrderCategory').val(),
        order_center: $('#fieldOrderCenter').val(),
        performance_month: $('#fieldPerformanceMonth').val(),
        order_date: $('#fieldOrderDate').val(),
        delivery_method: $('#fieldDeliveryMethod').val(),
        warehouse_id: $('#fieldWarehouseId').val(),
        purchaser_partner_id: $('#fieldPurchaserPartnerId').val(),
        sv_owner_partner_id: $('#fieldSvOwnerPartnerId').val(),
        inbound_date: $('#fieldInboundDate').val(),
        currency_code: $('#fieldCurrencyCode').val(),
        product_amount: parseFloat($('#fieldProductAmount').val()) || 0,
        shipping_fee: parseFloat($('#fieldShippingFee').val()) || 0,
        total_cost_amount: parseFloat($('#fieldTotalCostAmount').val()) || 0,
        total_sv: parseInt($('#fieldTotalSv').val(), 10) || 0,
        total_boxes: parseInt($('#fieldTotalBoxes').val(), 10) || 0,
        official_shipping_no: $('#fieldOfficialShippingNo').val().trim(),
        shipping_date: $('#fieldShippingDate').val(),
        status: $('#fieldStatus').val(),
        remarks: $('#fieldRemarks').val().trim(),
        created_by: createdBy,
        created_at: createdAt,
        modified_by: currentUser,
        modified_at: nowStr
    };

    const $btnSave = $('#btnSaveInbound');
    try {
        $btnSave.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入中...');

        if (mode === 'add') {
            await SheetAdapter.sendRequest('CREATE', '進貨主檔', orderId, rowDataArray);
            appState.inbounds.unshift(updatedObj);
        } else {
            await SheetAdapter.sendRequest('UPDATE', '進貨主檔', orderId, rowDataArray);
            const idx = appState.inbounds.findIndex(d => d.id === orderId);
            if (idx !== -1) appState.inbounds[idx] = updatedObj;
        }

        refreshAllViews();
        bootstrap.Modal.getInstance(document.getElementById('inboundModal')).hide();
        AppToast.success(`進貨單據【${orderId}】儲存成功！`);
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btnSave.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存單據變更');
    }
}

async function quickVerifyInbound(orderId) {
    const item = appState.inbounds.find(d => d.id === orderId);
    if (!item) return;

    const confirmed = await AppDialog.confirm(`確定要將進貨單據【${item.id}】標記為「已入庫驗收」並完成歸戶嗎？`, {
        title: '入庫驗收確認',
        confirmText: '確定驗收',
        confirmClass: 'btn-purple'
    });
    if (!confirmed) return;

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const todayStr = new Date().toISOString().slice(0, 10);

    item.status = '已入庫驗收';
    item.inbound_date = todayStr;
    item.modified_by = currentUser;
    item.modified_at = nowStr;

    const rowDataArray = [
        item.id, item.official_order_no, item.order_category, item.order_center,
        item.performance_month, item.order_date, item.delivery_method,
        item.warehouse_id, item.purchaser_partner_id, item.sv_owner_partner_id,
        item.inbound_date, item.currency_code, item.product_amount,
        item.shipping_fee, item.total_cost_amount, item.total_sv, item.total_boxes,
        item.official_shipping_no, item.shipping_date, item.status,
        item.remarks, item.created_by, item.created_at, item.modified_by, item.modified_at
    ];

    try {
        await SheetAdapter.sendRequest('UPDATE', '進貨主檔', item.id, rowDataArray);
        refreshAllViews();
        AppToast.success(`單號【${item.id}】已驗收合格，正式歸戶入庫！`);
    } catch (err) {
        AppToast.error("驗收狀態更新失敗：" + err.message);
    }
}

async function deleteInboundItem(orderId) {
    const item = appState.inbounds.find(d => d.id === orderId);
    if (!item) return;

    const confirmed = await AppDialog.confirm(`確定要自雲端試算表中永久刪除進貨單【${item.id}】嗎？此動作不可復原！`, {
        title: '刪除單據確認',
        confirmText: '確定刪除',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    try {
        await SheetAdapter.sendRequest('DELETE', '進貨主檔', orderId, []);
        appState.inbounds = appState.inbounds.filter(d => d.id !== orderId);
        refreshAllViews();
        AppToast.success(`進貨單【${item.id}】已成功刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗：" + err.message);
    }
}

// ==========================================================================
// 7. 試算表連線設定與匯出
// ==========================================================================
function openConfigModal() {
    $('#cfgSheetPsi').val(SPREADSHEET_CONFIG.sheetPsi);
    $('#cfgSheetOrg').val(SPREADSHEET_CONFIG.sheetOrg);
    $('#cfgSheetPrd').val(SPREADSHEET_CONFIG.sheetPrd);
    $('#cfgGasDeploymentId').val(SPREADSHEET_CONFIG.gasDeploymentId);
    new bootstrap.Modal(document.getElementById('configModal')).show();
}

function saveSpreadsheetConfig() {
    SPREADSHEET_CONFIG.sheetPsi = $('#cfgSheetPsi').val().trim();
    SPREADSHEET_CONFIG.sheetOrg = $('#cfgSheetOrg').val().trim();
    SPREADSHEET_CONFIG.sheetPrd = $('#cfgSheetPrd').val().trim();
    SPREADSHEET_CONFIG.gasDeploymentId = $('#cfgGasDeploymentId').val().trim();

    localStorage.setItem('cfg_sheet_psi', SPREADSHEET_CONFIG.sheetPsi);
    localStorage.setItem('cfg_sheet_org', SPREADSHEET_CONFIG.sheetOrg);
    localStorage.setItem('cfg_sheet_prd', SPREADSHEET_CONFIG.sheetPrd);
    localStorage.setItem('cfg_gas_id', SPREADSHEET_CONFIG.gasDeploymentId);

    if (window.SheetAdapter) {
        SheetAdapter.init(SPREADSHEET_CONFIG.gasDeploymentId);
    }
    bootstrap.Modal.getInstance(document.getElementById('configModal')).hide();
    AppToast.success("試算表連線配置已更新，開始重新同步...");
    fetchAllGoogleSheetsData();
}

function exportCsv() {
    const csv = Papa.unparse(appState.inbounds);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psi_inbound_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    AppToast.info('已匯出進貨單據 CSV 檔案');
}