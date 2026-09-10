// ==========================================================================
// 1. 系統組態與三張試算表來源定義
// ==========================================================================
const SPREADSHEET_CONFIG = {
    sheetPsi: APP_CONFIG.SHEETS.PSI,
    sheetOrg: APP_CONFIG.SHEETS.ORG,
    sheetPrd: APP_CONFIG.SHEETS.PRD,
    gasDeploymentId: APP_CONFIG.GAS.PSI
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

let currentDetailOrderId = null; // 當前開啟的進貨單號

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

/**
 * 解析訂購中心顯示名稱（將 ID 轉為中文營業處名稱）
 */
function getOrderCenterDisplayName(centerVal) {
    if (!centerVal) return '-';
    if (centerVal === '網路' || centerVal === '網路 (TW)') return '網路 (TW)';
    if (centerVal === '網路 (MY)') return '網路 (MY)';

    // 從據點倉儲表中尋找匹配之中心
    const wh = appState.warehouses.find(w => w.id === centerVal || w.warehouse_name === centerVal);
    return wh ? wh.warehouse_name : centerVal;
}

/**
 * 正規化訂購中心 ID（確保 Select2 能精準選取對應的 Option Value）
 */
function normalizeOrderCenterId(centerVal) {
    if (!centerVal || centerVal === '網路' || centerVal === '網路 (TW)') return '網路 (TW)';
    if (centerVal === '網路 (MY)') return '網路 (MY)';

    // 若傳入的是據點 ID，直接返回
    const matchById = appState.warehouses.find(w => w.id === centerVal);
    if (matchById) return matchById.id;

    // 若傳入的是據點名稱（舊資料相容），反查其 ID
    const matchByName = appState.warehouses.find(w => w.warehouse_name === centerVal);
    if (matchByName) return matchByName.id;

    return centerVal;
}

// ==========================================================================
// 3. 實體名稱權重解析核心 (接軌 EntityResolver)
// ==========================================================================
function getPartnerResolvedName(partnerId, displayMode = 1) {
    return EntityResolver.partner(partnerId, appState.partners, appState.persons, displayMode);
}

function getWarehouseDisplayName(whId, displayMode = 1) {
    return EntityResolver.warehouse(whId, appState.warehouses, displayMode);
}

// ==========================================================================
// 4. 生命週期與資料拉取引擎 (跨 3 大試算表物理順序讀取)
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(SPREADSHEET_CONFIG.gasDeploymentId);
    }
    await initInboundApp();
});

async function initInboundApp() {
    if (isInitialized) return;
    isInitialized = true;

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

/**
 * 資料讀取引擎
 */
async function fetchAllGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i>正在讀取雲端資料庫...', '載入中...');

    try {
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
        $('#hudSyncTime').text(getFormattedNow());

        AppToast.success(`已完成 3 大試算表連動同步 (${appState.inbounds.length} 筆進貨單據)`);
    } catch (err) {
        console.error("試算表同步異常:", err);
        AppToast.error("部分試算表連線失敗，請檢查試算表 ID 與共用權限");
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
        warehouse_type: getVal(r, 2, '官方營運中心'),
        country_code: getVal(r, 3, 'TW'),
        address: getVal(r, 4, ''),
        contact_phone: getVal(r, 5, ''),
        operating_hours: getVal(r, 6, ''),
        is_active: getVal(r, 9, 'Y')
    })).filter(w => w.id !== '' && (w.is_active === 'Y' || w.is_active === 'TRUE' || w.is_active === true));

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
    // 1. 篩選列：倉庫選單（包含所有倉庫）
    UISelectOptions.warehouse.populate({
        target: '#filterWarehouse',
        warehouses: appState.warehouses,
        placeholder: '全部收貨倉庫',
        displayMode: 1, // 僅顯示名稱
        searchable: true
    });

    // 2. 篩選列：出資夥伴選單
    UISelectOptions.partner.populate({
        target: '#filterPurchaser',
        partners: appState.partners,
        persons: appState.persons,
        placeholder: '全部出資夥伴',
        searchable: true
    });

    // 3. Modal：入庫實體據點選單（嚴格排除官方營運中心，僅保留團隊自營私倉、海外前哨與物流倉）
    UISelectOptions.warehouse.populate({
        target: '#fieldWarehouseId',
        warehouses: appState.warehouses,
        placeholder: '-- 請選擇入庫自營倉儲 --',
        dropdownParent: '#inboundModal',
        displayMode: 1, // 僅顯示名稱
        searchable: true,
        filterFn: w => {
            const type = String(w.warehouse_type || '').toUpperCase();
            return !type.includes('官方') && !type.includes('OFFICIAL') && w.id !== 'WH-TW-TP' && w.id !== 'WH-TW-KH';
        }
    });

    // 4. Modal：官方訂購中心選單（拆分網路 TW 與 網路 MY，並連動幣別）
    populateOrderCenterOptions('網路 (TW)');

    // 5. Modal：出資夥伴與點數歸屬人
    ['#fieldPurchaserPartnerId', '#fieldSvOwnerPartnerId'].forEach(target => {
        UISelectOptions.partner.populate({
            target,
            partners: appState.partners,
            persons: appState.persons,
            placeholder: target.includes('Purchaser') ? '-- 請選擇出資夥伴 --' : '-- 請選擇點數歸屬人 --',
            dropdownParent: '#inboundModal'
        });
    });
}

function renderCounters() {
    const list = appState.inbounds;
    $('#countAll').text(list.length);
    $('#countDraft').text(list.filter(d => d.status === '草稿').length);
    $('#countPickup').text(list.filter(d => d.status === '待自取').length);
    $('#countTransit').text(list.filter(d => d.status === '運輸中').length);
    $('#countCompleted').text(list.filter(d => d.status === '已入庫').length);
    $('#countVoid').text(list.filter(d => d.status === '已取消').length);
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
        if (d.status !== '已取消') {
            const m = d.performance_month || '未分類';
            if (!monthMap[m]) monthMap[m] = { sv: 0, cost: 0 };
            monthMap[m].sv += (parseInt(d.total_sv, 10) || 0);
            monthMap[m].cost += (parseFloat(d.total_cost_amount) || 0);
        }
    });

    const labels = Object.keys(monthMap).sort();
    const svData = labels.map(l => monthMap[l].sv);
    const costData = labels.map(l => monthMap[l].cost);

    if (appState.inboundChartInstance) {
        appState.inboundChartInstance.destroy();
    }

    // 兩條重疊折線圖：月度考核 SV 與進貨實付支出
    appState.inboundChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '月度考核 SV',
                    data: svData,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.15)',
                    pointBackgroundColor: '#8b5cf6',
                    pointBorderColor: '#ffffff',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: false,
                    yAxisID: 'y'
                },
                {
                    label: '進貨實付支出 (TWD)',
                    data: costData,
                    borderColor: '#34d399',
                    backgroundColor: 'rgba(52, 211, 153, 0.12)',
                    pointBackgroundColor: '#34d399',
                    pointBorderColor: '#ffffff',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: false,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: {
                    ticks: { color: '#a78bfa' },
                    grid: { color: 'rgba(139, 92, 246, 0.08)' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: '考核 SV', color: '#8b5cf6' },
                    ticks: { color: '#c084fc' },
                    grid: { color: 'rgba(139, 92, 246, 0.12)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: '支出金額 (TWD)', color: '#34d399' },
                    ticks: { color: '#34d399' },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#f5f3ff', font: { size: 12 } }
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
            order: [[3, 'desc']],
            columns: [
                { data: 'order_id' },
                { data: 'center_and_warehouse' },
                { data: 'four_flow' },
                { data: 'order_dates' },
                { data: 'perf_month', className: 'text-center' },
                { data: 'total_boxes' },
                { data: 'cost_breakdown' },
                { data: 'total_sv' },
                { data: 'status', className: 'text-center' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }

    $('#tableSummaryInfo').text(`顯示 ${formattedRows.length} / ${appState.inbounds.length} 筆`);
}

function getFilteredData() {
    const startDate = $('#filterOrderDateStart').val();
    const endDate = $('#filterOrderDateEnd').val();
    const month = $('#filterPerformanceMonth').val();
    const wh = $('#filterWarehouse').val();
    const purchaser = $('#filterPurchaser').val();

    return appState.inbounds.filter(item => {
        const matchPipeline = (appState.activePipelineFilter === 'ALL') || (item.status === appState.activePipelineFilter);
        const matchWh = (!wh) || (item.warehouse_id === wh);
        const matchMonth = (!month) || (item.performance_month === month);
        const matchPurchaser = (!purchaser) || (item.purchaser_partner_id === purchaser);

        let matchDate = true;
        if (startDate && item.order_date) {
            matchDate = matchDate && (item.order_date >= startDate);
        }
        if (endDate && item.order_date) {
            matchDate = matchDate && (item.order_date <= endDate);
        }

        return matchPipeline && matchWh && matchMonth && matchPurchaser && matchDate;
    });
}

function formatTableRow(item) {
    const statusBadge = UIBadges.psi.inboundStatus(item.status);
    const purchaserName = getPartnerResolvedName(item.purchaser_partner_id);
    const svOwnerName = getPartnerResolvedName(item.sv_owner_partner_id);
    const isDecoupled = item.purchaser_partner_id && item.sv_owner_partner_id && (item.purchaser_partner_id !== item.sv_owner_partner_id);

    const isCompleted = item.status === '已入庫';
    const canQuickVerify = item.status === '待自取' || item.status === '運輸中';
    const deleteBtnDisabled = isCompleted ? 'disabled title="已入庫單據不可刪除"' : 'title="刪除單據"';

    // 1. 倉庫僅顯示名稱
    const warehouseOnlyName = EntityResolver.warehouse(item.warehouse_id, appState.warehouses, 1);

    // 2. 訂購中心改為名稱顯示（非 ID）
    const centerDisplayName = getOrderCenterDisplayName(item.order_center);

    // 3. 金額符號依據幣別切換為 NT$ 或 RM
    const currSym = item.currency_code === 'MYR' ? 'RM ' : 'NT$ ';

    const actionButtons = `
        <div class="d-flex align-items-center justify-content-end gap-1">
            <button class="btn btn-sm btn-outline-info" title="查看明細清單" onclick="openDetailModal('${item.id}')">
                <i class="fa-solid fa-list-ul"></i>
            </button>
            <button class="btn btn-sm btn-outline-primary" title="${isCompleted ? '檢視/修改備註' : '編輯單據'}" onclick="openEditModal('${item.id}')">
                <i class="fa-solid fa-pen"></i>
            </button>
            ${canQuickVerify ? `
                <button class="btn btn-sm btn-outline-success" title="驗收合格歸戶入庫" onclick="quickVerifyInbound('${item.id}')">
                    <i class="fa-solid fa-stamp"></i>
                </button>
            ` : ''}
            <button class="btn btn-sm btn-outline-danger" ${deleteBtnDisabled} onclick="deleteInboundItem('${item.id}')">
                <i class="fa-solid fa-trash-can"></i>
            </button>
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
                <span class="badge badge-purple-subtle">${warehouseOnlyName}</span>
                <div class="text-secondary small mt-1">
                    <i class="fa-solid fa-store text-primary"></i> ${centerDisplayName} / ${item.delivery_method || '-'}
                </div>
            </div>
        `,
        four_flow: `
            <div>
                <div class="small"><i class="fa-solid fa-credit-card text-secondary"></i> 出資：<span class="text-white fw-bold">${purchaserName}</span></div>
                <div class="small"><i class="fa-solid fa-award text-warning"></i> 掛點：<span class="text-warning fw-bold">${svOwnerName}</span></div>
                ${isDecoupled ? '<span class="badge badge-purple-subtle mt-1">四流分離</span>' : ''}
            </div>
        `,
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
                <div class="fw-bold text-success">${currSym}${item.total_cost_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</div>
                <div class="text-secondary small">品：${currSym}${item.product_amount.toLocaleString()} | 運：${currSym}${item.shipping_fee.toLocaleString()}</div>
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
    $('#fieldPerformanceMonth').val(todayStr.slice(0, 7));
    $('#fieldOrderDate').val(todayStr);
    $('#fieldDeliveryMethod').val('運送');

    // 訂購中心設為「網路 (TW)」並觸發 Select2 與幣別連動
    const defaultCenter = '網路 (TW)';
    $('#fieldOrderCenter').val(defaultCenter).trigger('change.select2');
    syncCurrencyAndDeliveryByCenter(defaultCenter);

    // 入庫倉庫自動選取第一個自營私倉（排除官方門市後之倉別）
    const firstPrivateWh = appState.warehouses.find(w => {
        const type = String(w.warehouse_type || '').toUpperCase();
        return !type.includes('官方') && !type.includes('OFFICIAL') && w.id !== 'WH-TW-TP' && w.id !== 'WH-TW-KH';
    });
    $('#fieldWarehouseId').val(firstPrivateWh ? firstPrivateWh.id : '').trigger('change.select2');

    // 自動計算欄位重置
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
    $('#fieldPerformanceMonth').val(item.performance_month);
    $('#fieldOrderDate').val(item.order_date);
    $('#fieldDeliveryMethod').val(item.delivery_method);

    // 核心修正：將資料庫中的訂購中心代碼正規化，並觸發 Select2 精準回顯
    const targetCenterId = normalizeOrderCenterId(item.order_center);
    $('#fieldOrderCenter').val(targetCenterId).trigger('change.select2');
    syncCurrencyAndDeliveryByCenter(targetCenterId);

    $('#fieldWarehouseId').val(item.warehouse_id).trigger('change.select2');
    $('#fieldPurchaserPartnerId').val(item.purchaser_partner_id).trigger('change.select2');
    $('#fieldSvOwnerPartnerId').val(item.sv_owner_partner_id).trigger('change.select2');

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

    currentDetailOrderId = orderId;
    closeInlineItemForm();

    // 注入單據抬頭資訊（倉庫僅顯示中文名稱）
    $('#detailOrderNo').text(item.id);
    $('#detailOfficialNo').text(item.official_order_no || '無');
    $('#detailOrderDate').text(item.order_date || '-');
    $('#detailPerfMonth').text(item.performance_month || '-');
    $('#detailPurchaser').text(getPartnerResolvedName(item.purchaser_partner_id));
    $('#detailSvOwner').text(getPartnerResolvedName(item.sv_owner_partner_id));
    $('#detailWarehouse').text(EntityResolver.warehouse(item.warehouse_id, appState.warehouses, 1));
    $('#detailStatusBadge').html(UIBadges.psi.inboundStatus(item.status));

    const isLocked = item.status === '已入庫' || item.status === '已取消';
    $('#btnToggleAddItem').prop('disabled', isLocked).toggleClass('opacity-50', isLocked);

    // 依據訂購中心市場過濾產品選單，費用項目獨立分組
    populateLinkedProductOptions(item.order_center);

    // 渲染明細清單與計算統計
    renderInboundItemsTable(orderId, isLocked);

    new bootstrap.Modal(document.getElementById('inboundDetailModal')).show();
}

/**
 * 依據單據之訂購中心市場，連動產品選單並將費用獨立成組
 */
function populateLinkedProductOptions(orderCenter) {
    const isMalaysia = String(orderCenter || '').includes('(MY)') || String(orderCenter || '').includes('吉隆坡');
    const targetRegion = isMalaysia ? 'MY' : 'TW';

    // 1. 篩選產品品項
    const filteredProducts = appState.products.filter(p => (p.region_code || 'TW').toUpperCase() === targetRegion);

    // 2. 獨立費用分組
    const feeOptions = [
        { id: 'FEE_A13', name: '🚚 葡眾官方物流運費 (A13)', price: 150, sv: 0, is_fee: 'Y' }
    ];

    const $select = $('#inlineFieldProduct').empty();
    $select.append('<option value="">-- 請選擇品項或費用項 --</option>');

    // 費用項目獨立分組
    const $feeGroup = $('<optgroup label="🚚 官方運費與規費項目"></optgroup>');
    feeOptions.forEach(f => {
        $feeGroup.append(`<option value="${f.id}" data-name="${f.name}" data-price="${f.price}" data-sv="${f.sv}" data-fee="Y">${f.name}</option>`);
    });
    $select.append($feeGroup);

    // 產品品項分組
    const groupLabel = isMalaysia ? '🇲🇾 馬來西亞市場實體產品' : '🇹🇼 台灣市場實體產品';
    const $prodGroup = $(`<optgroup label="${groupLabel}"></optgroup>`);
    filteredProducts.forEach(p => {
        $prodGroup.append(`<option value="${p.product_code}" data-name="${p.name}" data-price="${p.price}" data-sv="${p.sv_point}" data-fee="N">📦 ${p.name} [${p.product_code}]</option>`);
    });
    $select.append($prodGroup);

    // 初始化 Select2 並監聽選取自動帶入單價與 SV（商品唯讀）
    if ($select.hasClass('select2-hidden-accessible')) {
        $select.select2('destroy');
    }

    $select.select2({
        width: '100%',
        dropdownParent: $('#inboundDetailModal'),
        placeholder: '-- 請選擇品項或費用項 --'
    }).off('select2:select').on('select2:select', function () {
        const $opt = $(this).find(':selected');
        const price = parseFloat($opt.data('price')) || 0;
        const sv = parseInt($opt.data('sv'), 10) || 0;
        const isFee = $opt.data('fee') || 'N';

        // 系統自動判定性質與帶入單價/點數（商品唯讀）
        $('#inlineFieldIsFee').val(isFee);
        $('#inlineFieldUnitCost').val(price.toFixed(2));
        $('#inlineFieldUnitSv').val(sv);
    });
}

function renderInboundItemsTable(orderId, isLocked) {
    const parentOrder = appState.inbounds.find(d => d.id === orderId);
    const currSym = (parentOrder && parentOrder.currency_code === 'MYR') ? 'RM ' : 'NT$ ';

    const matchedItems = appState.inboundItems.filter(it => it.inbound_id === orderId);
    const $tbody = $('#inboundItemsTableBody').empty();

    let sumOrdered = 0;
    let sumReceived = 0;
    let sumAmount = 0;
    let sumSv = 0;

    if (matchedItems.length === 0) {
        $tbody.append('<tr><td colspan="13" class="text-center text-secondary py-3">本單據暫無細項明細數據</td></tr>');
    } else {
        matchedItems.forEach(it => {
            sumOrdered += (parseInt(it.ordered_qty, 10) || 0);
            sumReceived += (parseInt(it.received_qty, 10) || 0);
            sumAmount += (parseFloat(it.subtotal_amount) || 0);
            sumSv += (parseInt(it.subtotal_sv, 10) || 0);

            const editBtnDisabled = isLocked ? 'disabled' : '';
            const delBtnDisabled = isLocked ? 'disabled' : '';

            const stockBadge = it.stock_id 
                ? `<span class="badge badge-purple-subtle font-monospace"><i class="fa-solid fa-boxes-stacked text-primary"></i> ${it.stock_id}</span>`
                : '<span class="text-secondary small">未入庫</span>';

            $tbody.append(`
                <tr>
                    <td class="text-secondary">${it.item_seq}</td>
                    <td>
                        <div class="fw-bold text-white">${it.product_name_snapshot || '-'}</div>
                        <div class="text-secondary small">${it.official_product_code || '-'}</div>
                    </td>
                    <td>${UIBadges.psi.feeItem(it.is_fee_item)}</td>
                    <td>${currSym}${it.unit_cost.toLocaleString()}</td>
                    <td class="text-warning">${it.unit_sv} SV</td>
                    <td>${it.ordered_qty}</td>
                    <td>${it.official_shipped_qty}</td>
                    <td class="text-success fw-bold">${it.received_qty}</td>
                    <td class="text-success">${currSym}${it.subtotal_amount.toLocaleString()}</td>
                    <td class="text-warning">${it.subtotal_sv} SV</td>
                    <td>
                        <div>${it.batch_no || '-'}</div>
                        <div class="text-secondary small">${it.expiry_date || '-'}</div>
                    </td>
                    <td>${stockBadge}</td>
                    <td class="text-end">
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" ${editBtnDisabled} title="編輯此明細" onclick="editInlineItem('${it.id}')">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn btn-outline-danger" ${delBtnDisabled} title="刪除此明細" onclick="deleteInlineItem('${it.id}')">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `);
        });
    }

    // 刷新下方統計卡片
    $('#sumItemCount').text(matchedItems.length);
    $('#sumOrderedQty').text(sumOrdered);
    $('#sumReceivedQty').text(sumReceived);
    $('#sumCurrencySymbol').text(currSym.trim());
    $('#sumTotalAmount').text(sumAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
    $('#sumTotalSv').text(sumSv.toLocaleString());
}

// ==========================================================================
// 行內明細項目互動處理模組 (免彈窗堆疊設計)
// ==========================================================================

/**
 * 載入官方訂購中心（支援「網路 (TW)」、「網路 (MY)」與實體官方營業處）
 */
function populateOrderCenterOptions(selectedValue = '網路 (TW)') {
    const officialCenters = appState.warehouses.filter(wh => {
        const type = String(wh.warehouse_type || '').toUpperCase();
        return type.includes('官方') || type.includes('OFFICIAL');
    });

    const dataList = [
        { id: '網路 (TW)', name: '🌐 網路 (TW) - 官方線上商城 / App', group: '線上電子商務' },
        { id: '網路 (MY)', name: '🌐 網路 (MY) - 大馬線上商城 / App', group: '線上電子商務' }
    ];

    officialCenters.forEach(wh => {
        const flag = wh.country_code === 'MY' ? '🇲🇾' : '🇹🇼';
        dataList.push({
            id: wh.id, // 核心修正：使用倉庫 ID 作為 Option Key，確保與資料庫值精確對齊
            name: `${flag} ${wh.warehouse_name}`,
            group: '實體官方營業處'
        });
    });

    UISelectOptions.core.render({
        target: '#fieldOrderCenter',
        data: dataList,
        valueKey: 'id',
        textKey: 'name',
        groupKey: 'group',
        grouped: true,
        placeholder: '-- 請選擇官方訂購中心 --',
        selectedValue: normalizeOrderCenterId(selectedValue),
        searchable: true,
        dropdownParent: '#inboundModal'
    });

    // 連動監聽：幣別連動不可更改、交付方式與運費防呆
    $('#fieldOrderCenter').off('select2:select.centerSync').on('select2:select.centerSync', function () {
        syncCurrencyAndDeliveryByCenter($(this).val());
    });
}

/**
 * 依訂購中心自動連動幣別與交付方式
 */
function syncCurrencyAndDeliveryByCenter(centerVal) {
    const val = String(centerVal || '');
    const isMalaysia = val.includes('(MY)') || val.includes('吉隆坡') || val.includes('大馬');

    // 幣別連動不可更改
    $('#fieldCurrencyCode').val(isMalaysia ? 'MYR' : 'TWD');

    // 交付方式自動設定
    if (val.startsWith('網路')) {
        $('#fieldDeliveryMethod').val('運送');
    } else {
        $('#fieldDeliveryMethod').val('自取');
        $('#fieldShippingFee').val('0.00');
        calculateTotalCost();
    }
}

/**
 * 載入進貨明細產品品項下拉選單 (共用 Select2)
 * 資料來源：Google 試算表表 101 產品主檔 + 官方運費費用項
 */
function populateInlineProductOptions() {
    // 注入產品主檔，並附加官方運費費用項
    const feeItem = {
        product_code: 'FEE_A13',
        name: '官方物流運費 (A13)',
        short_name: '官方運費',
        region_code: 'TW',
        price: 150,
        sv_point: 0
    };

    const productDataSource = [...appState.products, feeItem];

    // 透過 UISelectOptions.product.populate 渲染並掛載至明細 Modal
    UISelectOptions.product.populate({
        target: '#inlineFieldProduct',
        products: productDataSource,
        displayMode: 2, // 格式：品名 [代碼]
        placeholder: '-- 請選擇產品品項或費用項 --',
        searchable: true,
        grouped: true,
        dropdownParent: '#inboundDetailModal'
    });

    // 選取品項時自動帶入單價與單件 SV
    $('#inlineFieldProduct').off('select2:select.productSync').on('select2:select.productSync', function (e) {
        const selectedCode = $(this).val();
        if (!selectedCode) return;

        if (selectedCode === 'FEE_A13') {
            $('#inlineFieldIsFee').val('Y');
            $('#inlineFieldUnitCost').val('150.00');
            $('#inlineFieldUnitSv').val('0');
            $('#inlineFieldOrderedQty').val('1');
        } else {
            const prod = appState.products.find(p => p.product_code === selectedCode);
            if (prod) {
                $('#inlineFieldIsFee').val('N');
                $('#inlineFieldUnitCost').val(prod.price || 0);
                $('#inlineFieldUnitSv').val(prod.sv_point || 0);
            }
        }
        calcInlineSubtotal();
    });
}

function toggleInlineItemForm() {
    $('#inlineFormTitle').html('<i class="fa-solid fa-plus text-primary me-1"></i>新增明細細項');
    $('#inlineItemId').val('');
    $('#inlineItemForm')[0].reset();

    // 清空產品 Select2 選取狀態
    $('#inlineFieldProduct').val('').trigger('change.select2');
    $('#itemInlineFormCollapse').collapse('toggle');
}

function closeInlineItemForm() {
    $('#itemInlineFormCollapse').collapse('hide');
    $('#inlineItemId').val('');
}

function onInlineProductChange() {
    const $opt = $('#inlineFieldProduct').find(':selected');
    if (!$opt.val()) return;

    const price = parseFloat($opt.data('price')) || 0;
    const sv = parseInt($opt.data('sv'), 10) || 0;
    const isFee = $opt.val() === 'FEE_A13' ? 'Y' : 'N';

    $('#inlineFieldUnitCost').val(price);
    $('#inlineFieldUnitSv').val(sv);
    $('#inlineFieldIsFee').val(isFee);
    calcInlineSubtotal();
}

function calcInlineSubtotal() {
    // 提供即時預覽計算 (若需要可擴展)
}

function editInlineItem(itemId) {
    const item = appState.inboundItems.find(it => it.id === itemId);
    if (!item) return;

    $('#inlineFormTitle').html('<i class="fa-solid fa-pen-to-square text-primary me-1"></i>編輯明細細項');
    $('#inlineItemId').val(item.id);

    // 判斷是否為費用項並同步至 Select2
    const targetCode = (item.official_product_code === 'A13' || item.is_fee_item === 'Y') 
        ? 'FEE_A13' 
        : (item.product_id || item.official_product_code);

    $('#inlineFieldProduct').val(targetCode).trigger('change.select2');

    $('#inlineFieldIsFee').val(item.is_fee_item);
    $('#inlineFieldUnitCost').val(item.unit_cost);
    $('#inlineFieldUnitSv').val(item.unit_sv);
    $('#inlineFieldOrderedQty').val(item.ordered_qty);
    $('#inlineFieldReceivedQty').val(item.received_qty);
    $('#inlineFieldBatchNo').val(item.batch_no);
    $('#inlineFieldExpiryDate').val(item.expiry_date);
    $('#inlineFieldRemarks').val(item.remarks);

    $('#itemInlineFormCollapse').collapse('show');
}

async function saveInlineItem() {
    if (!currentDetailOrderId) return;
    const parentInbound = appState.inbounds.find(d => d.id === currentDetailOrderId);
    if (!parentInbound) return;

    const itemId = $('#inlineItemId').val().trim();
    const isEdit = Boolean(itemId);

    // 自 Select2 取得選定之產品代碼
    const productCode = $('#inlineFieldProduct').val();
    if (!productCode) {
        AppToast.warning("請選擇產品或費用項目！");
        return;
    }

    // 解析品名快照
    let productName = '';
    if (productCode === 'FEE_A13') {
        productName = '官方物流運費';
    } else {
        const prod = appState.products.find(p => p.product_code === productCode);
        productName = prod ? prod.name : productCode;
    }

    const isFee = $('#inlineFieldIsFee').val();
    const unitCost = parseFloat($('#inlineFieldUnitCost').val()) || 0;
    const unitSv = parseInt($('#inlineFieldUnitSv').val(), 10) || 0;
    const orderedQty = parseInt($('#inlineFieldOrderedQty').val(), 10) || 1;
    const receivedQty = parseInt($('#inlineFieldReceivedQty').val(), 10) || 0;
    const batchNo = $('#inlineFieldBatchNo').val().trim();
    const expiryDate = $('#inlineFieldExpiryDate').val();
    const remarks = $('#inlineFieldRemarks').val().trim();

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();

    let nextSeq = 1;
    let finalItemId = itemId;
    if (!isEdit) {
        const existingItems = appState.inboundItems.filter(it => it.inbound_id === currentDetailOrderId);
        nextSeq = existingItems.length > 0 ? Math.max(...existingItems.map(it => it.item_seq)) + 1 : 1;
        finalItemId = `${currentDetailOrderId}_${String(nextSeq).padStart(2, '0')}`;
    } else {
        const existingObj = appState.inboundItems.find(it => it.id === itemId);
        nextSeq = existingObj ? existingObj.item_seq : 1;
    }

    const subtotalAmount = unitCost * (receivedQty > 0 ? receivedQty : orderedQty);
    const subtotalSv = unitSv * (receivedQty > 0 ? receivedQty : orderedQty);

    // 依據表 304 實體欄位順序 (0~22) 封裝寫入陣列
    const rowDataArray = [
        finalItemId,
        currentDetailOrderId,
        nextSeq,
        productCode === 'FEE_A13' ? 'A13' : productCode,
        productName,
        productCode === 'FEE_A13' ? '' : productCode,
        isFee,
        'TWD',
        unitCost,
        unitSv,
        orderedQty,
        orderedQty,
        receivedQty,
        subtotalSv,
        subtotalAmount,
        batchNo,
        expiryDate,
        '', // stock_id
        remarks,
        currentUser,
        nowStr,
        currentUser,
        nowStr
    ];

    const $btn = $('#btnSaveInlineItem');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i>寫入中...');

        if (!isEdit) {
            await SheetAdapter.sendRequest('CREATE', '進貨明細', finalItemId, rowDataArray);
        } else {
            await SheetAdapter.sendRequest('UPDATE', '進貨明細', finalItemId, rowDataArray);
        }

        await fetchAllGoogleSheetsData();
        closeInlineItemForm();
        renderInboundItemsTable(currentDetailOrderId, parentInbound.status === '已入庫' || parentInbound.status === '已取消');
        AppToast.success(`明細項目【${productName}】已成功儲存！`);
    } catch (err) {
        AppToast.error("細項寫入失敗：" + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-check me-1"></i>確認儲存細項');
    }
}

async function deleteInlineItem(itemId) {
    const parentInbound = appState.inbounds.find(d => d.id === currentDetailOrderId);
    if (parentInbound && (parentInbound.status === '已入庫' || parentInbound.status === '已取消')) {
        AppToast.warning("該單據已封存鎖定，禁止刪除細項！");
        return;
    }

    const confirmed = await AppDialog.confirm(`確定要刪除此筆進貨明細嗎？此動作不可復原！`, {
        title: '刪除明細確認',
        confirmText: '確定刪除',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    try {
        await SheetAdapter.sendRequest('DELETE', '進貨明細', itemId, []);
        await fetchAllGoogleSheetsData();
        renderInboundItemsTable(currentDetailOrderId, false);
        AppToast.success("明細已自雲端試算表刪除！");
    } catch (err) {
        AppToast.error("明細刪除失敗：" + err.message);
    }
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
        $btnSave.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i>寫入中...');

        if (mode === 'add') {
            await SheetAdapter.sendRequest('CREATE', '進貨主檔', orderId, rowDataArray);
            appState.inbounds.unshift(updatedObj);
        } else {
            await SheetAdapter.sendRequest('UPDATE', '進貨主檔', orderId, rowDataArray);
            const idx = appState.inbounds.findIndex(d => d.id === orderId);
            if (idx !== -1) appState.inbounds[idx] = updatedObj;
        }

        await fetchAllGoogleSheetsData();
        await autoRecalculateParentInbound(currentDetailOrderId);
        bootstrap.Modal.getInstance(document.getElementById('inboundModal')).hide();
        AppToast.success(`進貨單據【${orderId}】儲存成功！`);
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btnSave.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i>儲存');
    }
}

async function quickVerifyInbound(orderId) {
    const item = appState.inbounds.find(d => d.id === orderId);
    if (!item) return;

    const confirmed = await AppDialog.confirm(`確定要將進貨單據【${item.id}】標記為「已入庫」並完成歸戶嗎？`, {
        title: '入庫驗收確認',
        confirmText: '確定入庫',
        confirmClass: 'btn-purple'
    });
    if (!confirmed) return;

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const todayStr = new Date().toISOString().slice(0, 10);

    item.status = '已入庫'; // 🚀 改為 5 態標準值
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
        await fetchAllGoogleSheetsData();
        AppToast.success(`單號【${item.id}】已合格入庫，庫存現貨正式生效！`);
    } catch (err) {
        AppToast.error("入庫狀態更新失敗：" + err.message);
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
        await fetchAllGoogleSheetsData();
        await autoRecalculateParentInbound(currentDetailOrderId);
        AppToast.success(`進貨單【${item.id}】已成功刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗：" + err.message);
    }
}

/**
 * 依據進貨明細重算主檔數值（商品金額、總盒數、總SV、實付總額）
 */
async function autoRecalculateParentInbound(inboundId) {
    const parentInbound = appState.inbounds.find(d => d.id === inboundId);
    if (!parentInbound) return;

    const matchedItems = appState.inboundItems.filter(it => it.inbound_id === inboundId);

    let calcProductAmount = 0;
    let calcTotalBoxes = 0;
    let calcTotalSv = 0;

    matchedItems.forEach(it => {
        const qty = parseInt(it.ordered_qty, 10) || 0;
        if (it.is_fee_item === 'Y') {
            // 費用項不計入盒數與商品金額
        } else {
            calcProductAmount += (parseFloat(it.subtotal_amount) || 0);
            calcTotalBoxes += qty;
            calcTotalSv += (parseInt(it.subtotal_sv, 10) || 0);
        }
    });

    const shippingFee = parseFloat(parentInbound.shipping_fee) || 0;
    const calcTotalCost = calcProductAmount + shippingFee;

    // 更新本機資料快取
    parentInbound.product_amount = calcProductAmount;
    parentInbound.total_boxes = calcTotalBoxes;
    parentInbound.total_sv = calcTotalSv;
    parentInbound.total_cost_amount = calcTotalCost;
    parentInbound.modified_by = getCurrentUser();
    parentInbound.modified_at = getFormattedNow();

    // 回寫表 303 進貨主檔
    const rowDataArray = [
        parentInbound.id, parentInbound.official_order_no, parentInbound.order_category, parentInbound.order_center,
        parentInbound.performance_month, parentInbound.order_date, parentInbound.delivery_method,
        parentInbound.warehouse_id, parentInbound.purchaser_partner_id, parentInbound.sv_owner_partner_id,
        parentInbound.inbound_date, parentInbound.currency_code, parentInbound.product_amount,
        parentInbound.shipping_fee, parentInbound.total_cost_amount, parentInbound.total_sv, parentInbound.total_boxes,
        parentInbound.official_shipping_no, parentInbound.shipping_date, parentInbound.status,
        parentInbound.remarks, parentInbound.created_by, parentInbound.created_at, parentInbound.modified_by, parentInbound.modified_at
    ];

    await SheetAdapter.sendRequest('UPDATE', '進貨主檔', parentInbound.id, rowDataArray);
    renderDataTable();
    renderKpis();
    renderChart();
}

// ==========================================================================
// 7. 試算表連線設定與匯出
// ==========================================================================
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