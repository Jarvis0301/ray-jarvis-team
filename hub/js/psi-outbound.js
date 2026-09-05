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
    outbounds: [],
    outboundItems: [],
    warehouses: [],
    persons: [],
    partners: [],
    products: [],
    customers: [],
    activePipelineFilter: 'ALL',
    selectedOutboundId: '',
    chartInstance: null
};

let outboundDataTableInstance = null;
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
    await initOutboundApp();
    applyUIPermissions();
});

async function initOutboundApp() {
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
        AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在連動同步 4 大試算表...', '銷貨出庫雲端同步');
    }
    const $btn = $('#btnSyncSheets');
    $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 同步中...');

    try {
        const [rawWarehouses, rawOutbounds, rawOutboundItems, rawPersons, rawPartners, rawProducts, rawCustomers] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '據點倉儲').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '銷貨主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '銷貨明細').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetOrg, '個人主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetOrg, '夥伴主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPrd, '產品主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetCrm, '客戶主檔').catch(() => [])
        ]);

        parseAllData({
            rawWarehouses,
            rawOutbounds,
            rawOutboundItems,
            rawPersons,
            rawPartners,
            rawProducts,
            rawCustomers
        });

        refreshAllViews();
        AppToast.success(`已完成 4 大試算表連動同步 (${appState.outbounds.length} 筆銷貨單據)`);
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
        name: getVal(r, 3),
        short_name: getVal(r, 4),
        price: parseFloat(getVal(r, 11, '0')) || 0,
        sv_point: parseInt(getVal(r, 13, '0'), 10) || 0
    })).filter(p => p.product_code !== '');

    // 6. 解析銷貨明細 (表 306: psi_outbound_items, 0~26 實體欄位順序)
    appState.outboundItems = (data.rawOutboundItems || []).map(r => ({
        id: getVal(r, 0),
        outbound_id: getVal(r, 1),
        item_seq: parseInt(getVal(r, 2, '1'), 10) || 1,
        official_product_code: getVal(r, 3),
        product_name_snapshot: getVal(r, 4),
        product_id: getVal(r, 5),
        is_fee_item: getVal(r, 6, 'N'),
        sales_unit: getVal(r, 7, '盒'),
        currency_code: getVal(r, 8, 'TWD'),
        unit_price: parseFloat(getVal(r, 9, '0')) || 0,
        unit_cost: parseFloat(getVal(r, 10, '0')) || 0,
        unit_sv: parseInt(getVal(r, 11, '0'), 10) || 0,
        ordered_qty: parseInt(getVal(r, 12, '1'), 10) || 1,
        shipped_qty: parseInt(getVal(r, 13, '1'), 10) || 1,
        subtotal_amount: parseFloat(getVal(r, 14, '0')) || 0,
        subtotal_cost: parseFloat(getVal(r, 15, '0')) || 0,
        subtotal_profit: parseFloat(getVal(r, 16, '0')) || 0,
        subtotal_sv: parseInt(getVal(r, 17, '0'), 10) || 0,
        batch_no: getVal(r, 18),
        expiry_date: getVal(r, 19),
        stock_id: getVal(r, 20),
        is_sample_demo: getVal(r, 21, 'N'),
        remarks: getVal(r, 22),
        created_by: getVal(r, 23, 'SYSTEM'),
        created_at: getVal(r, 24),
        modified_by: getVal(r, 25, 'SYSTEM'),
        modified_at: getVal(r, 26)
    })).filter(it => it.id !== '');

    // 7. 解析銷貨主檔 (表 305: psi_outbound_orders, 0~35 實體欄位順序)
    appState.outbounds = (data.rawOutbounds || []).map(r => {
        const salesAmt = parseFloat(getVal(r, 15, '0')) || 0;
        const costAmt = parseFloat(getVal(r, 16, '0')) || 0;
        const rawProfit = getVal(r, 17);
        const profitAmt = (rawProfit !== '') ? (parseFloat(rawProfit) || 0) : (salesAmt - costAmt);

        return {
            id: getVal(r, 0),
            order_category: getVal(r, 1, '零售客銷售'),
            order_center: getVal(r, 2, ''),
            performance_month: getVal(r, 3, ''),
            order_date: getVal(r, 4, ''),
            delivery_method: getVal(r, 5, '面交自取'),
            warehouse_id: getVal(r, 6, ''),
            operator_partner_id: getVal(r, 7, ''),
            recipient_type: getVal(r, 8, '消費者'),
            recipient_customer_id: getVal(r, 9, ''),
            recipient_partner_id: getVal(r, 10, ''),
            outbound_date: getVal(r, 11, ''),
            currency_code: getVal(r, 12, 'TWD'),
            product_amount: parseFloat(getVal(r, 13, '0')) || 0,
            shipping_fee: parseFloat(getVal(r, 14, '0')) || 0,
            total_sales_amount: salesAmt,
            total_cost_amount: costAmt,
            total_profit_amount: profitAmt,
            total_sv: parseInt(getVal(r, 18, '0'), 10) || 0,
            total_boxes: parseInt(getVal(r, 19, '0'), 10) || 0,
            total_pieces: parseInt(getVal(r, 20, '0'), 10) || 0,
            tracking_no: getVal(r, 21, ''),
            shipping_date: getVal(r, 22, ''),
            recipient_name: getVal(r, 23, '-'),
            recipient_phone: getVal(r, 24, ''),
            shipping_address: getVal(r, 25, ''),
            is_pre_order_hold: getVal(r, 26, 'N').toUpperCase(),
            fulfillment_status: getVal(r, 27, '已交付'),
            payment_status: getVal(r, 28, '已收訖'),
            payment_method: getVal(r, 29, '現金'),
            payment_platform: getVal(r, 30, '現金'),
            remarks: getVal(r, 31, ''),
            created_by: getVal(r, 32, 'SYSTEM'),
            created_at: getVal(r, 33, ''),
            modified_by: getVal(r, 34, 'SYSTEM'),
            modified_at: getVal(r, 35, '')
        };
    }).filter(d => d.id !== '');

    if (appState.outbounds.length > 0 && !appState.selectedOutboundId) {
        appState.selectedOutboundId = appState.outbounds[0].id;
    }
}

// ==========================================================================
// 5. 畫面渲染與視圖更新
// ==========================================================================
function refreshAllViews() {
    populateFormOptions();
    renderCounters();
    renderKpis();
    renderInspectorStage();
    renderChart();
    renderDataTable();
}

function populateFormOptions() {
    const $whFilter = $('#filterWarehouse').empty().append('<option value="">全部出貨倉庫 (All Warehouses)</option>');
    const $whField = $('#fieldWarehouseId').empty().append('<option value="">-- 請選擇實體扣庫倉庫 --</option>');
    const $orderCenterField = $('#fieldOrderCenter').empty().append('<option value="">-- 請選擇出貨調度中心 --</option>');

    // 依自用 -> 海外 -> 官方 -> 物流排序倉儲，無假資料
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
        $orderCenterField.append(opt);
    });

    // 經手開單夥伴 & 收件夥伴 (依中文排序)
    const $opField = $('#fieldOperatorPartnerId').empty().append('<option value="">-- 請選擇經手開單夥伴 --</option>');
    const $recPartnerField = $('#fieldRecipientPartnerId').empty().append('<option value="">-- 請選擇關聯夥伴 --</option>');

    const sortedPartners = [...appState.partners].map(p => ({
        id: p.partner_id,
        label: `${getPartnerResolvedName(p.partner_id)} (${p.member_no || p.partner_id})`
    })).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));

    sortedPartners.forEach(p => {
        $opField.append(`<option value="${p.id}">${p.label}</option>`);
        $recPartnerField.append(`<option value="${p.id}">${p.label}</option>`);
    });

    // 客戶選單
    const $recCustomerField = $('#fieldRecipientCustomerId').empty().append('<option value="">-- 請選擇關聯客戶 --</option>');
    const sortedCustomers = [...appState.customers].map(c => ({
        id: c.customer_id,
        label: `${getCustomerResolvedName(c.customer_id)} (${c.customer_id})`
    })).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));

    sortedCustomers.forEach(c => {
        $recCustomerField.append(`<option value="${c.id}">${c.label}</option>`);
    });

    // 業績月份選單
    const months = Array.from(new Set(appState.outbounds.map(d => d.performance_month))).filter(Boolean).sort().reverse();
    const $mFilter = $('#filterPerformanceMonth').empty().append('<option value="">全部業績月份 (All Months)</option>');
    months.forEach(m => $mFilter.append(`<option value="${m}">${m}</option>`));
}

function renderCounters() {
    const list = appState.outbounds;
    $('#countAll').text(list.length);
    $('#countPending').text(list.filter(d => d.fulfillment_status === '待取貨').length);
    $('#countShipped').text(list.filter(d => d.fulfillment_status === '已寄出').length);
    $('#countHold').text(list.filter(d => d.is_pre_order_hold === 'Y').length);
    $('#countDelivered').text(list.filter(d => d.fulfillment_status === '已交付').length);
    $('#countCancelled').text(list.filter(d => d.fulfillment_status === '已取消').length);
}

function renderKpis() {
    let totalBoxes = 0;
    let totalPieces = 0;
    let totalSales = 0;
    let totalProfit = 0;
    let totalSv = 0;

    appState.outbounds.forEach(item => {
        if (item.fulfillment_status !== '已取消') {
            totalBoxes += item.total_boxes;
            totalPieces += item.total_pieces;
            totalSales += item.total_sales_amount;
            totalProfit += item.total_profit_amount;
            totalSv += item.total_sv;
        }
    });

    $('#kpiTotalBoxes').text(`${totalBoxes.toLocaleString()} 盒 / ${totalPieces.toLocaleString()} 支`);
    $('#kpiTotalSales').text(`$${totalSales.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
    $('#kpiTotalSv').text(totalSv.toLocaleString());
    $('#kpiTotalProfit').text(`$${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
}

function renderInspectorStage() {
    const item = appState.outbounds.find(d => d.id === appState.selectedOutboundId);
    if (!item) {
        $('#inspOutboundId').text('-');
        $('#inspRecipientResolvedName').text('尚未選取單據');
        $('#inspOperatorName').text('-');
        $('#inspWarehouseId').text('-');
        $('#inspOrderCategory').text('-');
        $('#inspPreOrderHoldBadge').html('-');
        $('#inspDeliveryMethod').text('-');
        $('#inspTrackingNo').text('-');
        $('#inspShippingAddress').text('-');
        $('#inspRemarks').text('暫無特定備註事項。');
        $('#inspBoxesAndSv').text('0 盒 / 0 支 / 0 SV');
        $('#inspAmountAndProfit').text('$0 / +$0');
        $('#inspectorFulfillBadge').text('無選取');
        return;
    }

    const recipientResolved = (item.recipient_type === '經營者')
        ? getPartnerResolvedName(item.recipient_partner_id) || item.recipient_name
        : getCustomerResolvedName(item.recipient_customer_id) || item.recipient_name;

    const operatorResolved = getPartnerResolvedName(item.operator_partner_id);

    $('#inspOutboundId').text(item.id);
    $('#inspRecipientResolvedName').text(`${recipientResolved} (${item.recipient_type})`);
    $('#inspOperatorName').text(operatorResolved);
    $('#inspWarehouseId').text(getWarehouseDisplayName(item.warehouse_id));
    $('#inspOrderCategory').text(item.order_category);

    if (item.is_pre_order_hold === 'Y') {
        $('#inspPreOrderHoldBadge').html('<span class="badge badge-warning-subtle"><i class="fa-solid fa-lock"></i> 預扣鎖定中 (Y)</span>');
    } else {
        $('#inspPreOrderHoldBadge').html('<span class="badge badge-success-subtle"><i class="fa-solid fa-lock-open"></i> 正常交付出清 (N)</span>');
    }

    $('#inspDeliveryMethod').text(item.delivery_method);
    $('#inspTrackingNo').text(item.tracking_no || '(無物流單號/自取)');
    $('#inspShippingAddress').text(item.shipping_address || '(現場面交/自取無地址)');
    $('#inspRemarks').text(item.remarks || '暫無特定備註事項。');

    $('#inspBoxesAndSv').text(`${item.total_boxes} 盒 / ${item.total_pieces} 支 / ${Number(item.total_sv).toLocaleString()} SV`);
    const sign = item.total_profit_amount >= 0 ? '+' : '';
    $('#inspAmountAndProfit').text(`$${Number(item.total_sales_amount).toLocaleString()} / ${sign}$${Number(item.total_profit_amount).toLocaleString()}`);

    let badgeClass = 'badge-muted-subtle';
    if (item.fulfillment_status === '已交付') badgeClass = 'badge-success-subtle';
    else if (item.fulfillment_status === '已寄出') badgeClass = 'badge-info-subtle';
    else if (item.fulfillment_status === '待取貨') badgeClass = 'badge-purple-subtle';
    $('#inspectorFulfillBadge').attr('class', `badge ${badgeClass}`).html(`<i class="fa-solid fa-truck-ramp-box"></i> ${item.fulfillment_status}`);
}

function renderChart() {
    const ctx = document.getElementById('outboundChart');
    if (!ctx) return;

    const monthMap = {};
    appState.outbounds.forEach(d => {
        if (d.fulfillment_status !== '已取消') {
            const m = d.performance_month || '未歸類';
            if (!monthMap[m]) monthMap[m] = { sales: 0, profit: 0 };
            monthMap[m].sales += d.total_sales_amount;
            monthMap[m].profit += d.total_profit_amount;
        }
    });

    const labels = Object.keys(monthMap).sort();
    const salesData = labels.map(l => monthMap[l].sales);
    const profitData = labels.map(l => monthMap[l].profit);

    if (appState.chartInstance) {
        appState.chartInstance.destroy();
    }

    appState.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '銷貨實收 (TWD)',
                    data: salesData,
                    backgroundColor: 'rgba(139, 92, 246, 0.7)',
                    borderColor: '#8b5cf6',
                    borderRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: '毛利價差 (TWD)',
                    data: profitData,
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

    if (outboundDataTableInstance) {
        outboundDataTableInstance.clear();
        outboundDataTableInstance.rows.add(formattedRows);
        outboundDataTableInstance.draw();
    } else {
        outboundDataTableInstance = $('#outboundDataTable').DataTable({
            data: formattedRows,
            responsive: true,
            pageLength: 10,
            ordering: true,
            order: [[3, 'desc']],
            columns: [
                { data: 'id_and_cat' },
                { data: 'center_and_warehouse' },
                { data: 'parties' },
                { data: 'dates' },
                { data: 'perf_month' },
                { data: 'quantities' },
                { data: 'financials' },
                { data: 'sv' },
                { data: 'hold' },
                { data: 'status' },
                { data: 'actions' }
            ]
        });
    }

    $('#tableSummaryInfo').text(`顯示 ${formattedRows.length} / ${appState.outbounds.length} 筆`);
}

function getFilteredData() {
    const wh = $('#filterWarehouse').val();
    const month = $('#filterPerformanceMonth').val();

    return appState.outbounds.filter(item => {
        let matchPipeline = true;
        if (appState.activePipelineFilter === 'HOLD') {
            matchPipeline = (item.is_pre_order_hold === 'Y');
        } else if (appState.activePipelineFilter !== 'ALL') {
            matchPipeline = (item.fulfillment_status === appState.activePipelineFilter);
        }

        const matchWh = (!wh) || (item.warehouse_id === wh || item.order_center === wh);
        const matchMonth = (!month) || (item.performance_month === month);
        return matchPipeline && matchWh && matchMonth;
    });
}

function formatTableRow(item) {
    const hasAdminRights = isMasterAdmin();

    let statusBadge = '<span class="badge badge-muted-subtle"><i class="fa-solid fa-pen-ruler me-1"></i>草稿</span>';
    if (item.fulfillment_status === '待取貨') statusBadge = '<span class="badge badge-purple-subtle"><i class="fa-solid fa-clock me-1"></i>待取貨</span>';
    else if (item.fulfillment_status === '已寄出') statusBadge = '<span class="badge badge-info-subtle"><i class="fa-solid fa-truck-fast me-1"></i>已寄出</span>';
    else if (item.fulfillment_status === '已交付') statusBadge = '<span class="badge badge-success-subtle"><i class="fa-solid fa-circle-check me-1"></i>已交付</span>';
    else if (item.fulfillment_status === '已取消') statusBadge = '<span class="badge badge-danger-subtle"><i class="fa-solid fa-ban me-1"></i>已取消</span>';

    const recipientResolved = (item.recipient_type === '經營者')
        ? getPartnerResolvedName(item.recipient_partner_id) || item.recipient_name
        : getCustomerResolvedName(item.recipient_customer_id) || item.recipient_name;

    const operatorResolved = getPartnerResolvedName(item.operator_partner_id);

    const holdBadge = item.is_pre_order_hold === 'Y'
        ? '<span class="badge badge-warning-subtle"><i class="fa-solid fa-lock me-1"></i>預扣</span>'
        : '<span class="text-secondary small">正常</span>';

    const profitSign = item.total_profit_amount >= 0 ? '+' : '';

    const actionButtons = `
        <div class="d-flex align-items-center justify-content-end gap-1">
            <button class="btn btn-sm btn-outline-info py-0 px-2" title="置入裝箱檢驗艙" onclick="selectOutbound('${item.id}')">
                <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline-info py-0 px-2" title="查看銷貨細項" onclick="openDetailModal('${item.id}')">
                <i class="fa-solid fa-list-ul"></i>
            </button>
            ${hasAdminRights ? `
                <button class="btn btn-sm btn-outline-primary py-0 px-2 admin-action-btn" title="編輯單據" onclick="openEditOutboundModal('${item.id}')">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger py-0 px-2 admin-action-btn" title="廢止單據" onclick="deleteOutboundOrder('${item.id}')">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>'}
        </div>
    `;

    return {
        id_and_cat: `
            <div>
                <div class="fw-bold text-white">${item.id}</div>
                <span class="badge badge-purple-subtle">${item.order_category}</span>
            </div>
        `,
        center_and_warehouse: `
            <div>
                <span class="badge badge-purple-subtle">${getWarehouseDisplayName(item.warehouse_id)}</span>
                <div class="text-secondary small mt-1"><i class="fa-solid fa-truck"></i> ${item.delivery_method}</div>
            </div>
        `,
        parties: `
            <div>
                <div class="small text-white fw-bold"><i class="fa-solid fa-user-tag text-info"></i> ${recipientResolved}</div>
                <div class="small text-secondary"><i class="fa-solid fa-hand-holding-dollar text-warning"></i> 經手：${operatorResolved}</div>
            </div>
        `,
        dates: `
            <div>
                <div class="text-light">${item.order_date || '-'}</div>
                <div class="text-secondary small">交：${item.outbound_date || '未交付'}</div>
            </div>
        `,
        perf_month: `<span class="badge badge-purple-subtle">${item.performance_month}</span>`,
        quantities: `
            <div>
                <span class="fw-bold text-white">${item.total_boxes}</span> 盒
                ${item.total_pieces > 0 ? `<div class="text-secondary small">${item.total_pieces} 支/條</div>` : ''}
            </div>
        `,
        financials: `
            <div>
                <div class="fw-bold text-success">$${item.total_sales_amount.toLocaleString()}</div>
                <div class="text-secondary small">${profitSign}$${item.total_profit_amount.toLocaleString()} 毛利</div>
            </div>
        `,
        sv: `<span class="text-warning fw-bold">${item.total_sv.toLocaleString()} SV</span>`,
        hold: holdBadge,
        status: statusBadge,
        actions: actionButtons
    };
}

function selectOutbound(id) {
    appState.selectedOutboundId = id;
    renderInspectorStage();
    AppToast.info(`已置入單據【${id}】至裝箱檢驗艙`);
}

// ==========================================================================
// 6. 互動與表單事件管理
// ==========================================================================
function initEvents() {
    $('#customTableSearch').on('keyup', function () {
        if (outboundDataTableInstance) {
            outboundDataTableInstance.search(this.value).draw();
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
    if (!outboundDataTableInstance) return;
    const filteredRows = getFilteredData().map(item => formatTableRow(item));
    outboundDataTableInstance.clear();
    outboundDataTableInstance.rows.add(filteredRows);
    outboundDataTableInstance.draw();
    $('#tableSummaryInfo').text(`過濾後共 ${filteredRows.length} 筆`);
}

function toggleRecipientType() {
    const type = $('#fieldRecipientType').val();
    if (type === '經營者') {
        $('#wrapperCustomerSelect').hide();
        $('#wrapperPartnerSelect').show();
    } else {
        $('#wrapperCustomerSelect').show();
        $('#wrapperPartnerSelect').hide();
    }
}

function autoFillCustomerInfo() {
    const custId = $('#fieldRecipientCustomerId').val();
    if (!custId) return;
    const name = getCustomerResolvedName(custId);
    $('#fieldRecipientName').val(name);
}

function autoFillPartnerInfo() {
    const pId = $('#fieldRecipientPartnerId').val();
    if (!pId) return;
    const name = getPartnerResolvedName(pId);
    $('#fieldRecipientName').val(name);
}

function calculateFinancials() {
    const productAmt = parseFloat($('#fieldProductAmount').val()) || 0;
    const shippingFee = parseFloat($('#fieldShippingFee').val()) || 0;
    const totalSales = productAmt + shippingFee;
    $('#fieldTotalSalesAmount').val(totalSales.toFixed(2));

    const costAmt = parseFloat($('#fieldTotalCostAmount').val()) || 0;
    const profit = totalSales - costAmt;
    $('#fieldTotalProfitAmount').val(profit.toFixed(2));
}

function openCreateOutboundModal() {
    $('#outboundModalTitle').html('<i class="fa-solid fa-file-circle-plus text-primary"></i> 開立銷貨出庫單據');
    $('#formMode').val('add');
    $('#outboundForm')[0].reset();

    const nextSeq = String(appState.outbounds.length + 1).padStart(4, '0');
    const todayStr = new Date().toISOString().slice(0, 10);
    const dateCode = todayStr.replace(/-/g, '');
    const newId = `OUT-${dateCode}-${nextSeq}`;

    $('#fieldId').val(newId);
    $('#fieldOrderCategory').val('零售客銷售');
    $('#fieldOrderCenter').val(appState.warehouses[0] ? appState.warehouses[0].id : '');
    $('#fieldPerformanceMonth').val(todayStr.slice(0, 7));
    $('#fieldOrderDate').val(todayStr);
    $('#fieldDeliveryMethod').val('面交自取');
    $('#fieldWarehouseId').val(appState.warehouses[0] ? appState.warehouses[0].id : '');
    $('#fieldOperatorPartnerId').val(appState.partners[0] ? appState.partners[0].partner_id : '');
    $('#fieldRecipientType').val('消費者');
    toggleRecipientType();

    $('#fieldCurrencyCode').val('TWD');
    $('#fieldTotalBoxes').val(1);
    $('#fieldTotalPieces').val(0);
    $('#fieldTotalSv').val(0);
    $('#fieldProductAmount').val('0.00');
    $('#fieldShippingFee').val('0.00');
    $('#fieldTotalSalesAmount').val('0.00');
    $('#fieldTotalCostAmount').val('0.00');
    $('#fieldTotalProfitAmount').val('0.00');
    $('#fieldIsPreOrderHold').prop('checked', false);
    $('#fieldFulfillmentStatus').val('已交付');
    $('#fieldPaymentStatus').val('已收訖');
    $('#fieldPaymentMethod').val('現金');
    $('#fieldPaymentPlatform').val('現金');

    new bootstrap.Modal(document.getElementById('outboundModal')).show();
}

function openEditOutboundModal(id) {
    const item = appState.outbounds.find(d => d.id === id);
    if (!item) return;

    $('#outboundModalTitle').html('<i class="fa-solid fa-pen-to-square text-primary"></i> 編輯銷貨出庫單');
    $('#formMode').val('edit');

    $('#fieldId').val(item.id);
    $('#fieldOrderCategory').val(item.order_category);
    $('#fieldOrderCenter').val(item.order_center);
    $('#fieldPerformanceMonth').val(item.performance_month);
    $('#fieldOrderDate').val(item.order_date);
    $('#fieldDeliveryMethod').val(item.delivery_method);
    $('#fieldWarehouseId').val(item.warehouse_id);
    $('#fieldOperatorPartnerId').val(item.operator_partner_id);
    $('#fieldRecipientType').val(item.recipient_type);
    toggleRecipientType();

    $('#fieldRecipientCustomerId').val(item.recipient_customer_id);
    $('#fieldRecipientPartnerId').val(item.recipient_partner_id);
    $('#fieldRecipientName').val(item.recipient_name);
    $('#fieldRecipientPhone').val(item.recipient_phone);
    $('#fieldShippingAddress').val(item.shipping_address);

    $('#fieldOutboundDate').val(item.outbound_date);
    $('#fieldShippingDate').val(item.shipping_date);
    $('#fieldTrackingNo').val(item.tracking_no);
    $('#fieldIsPreOrderHold').prop('checked', item.is_pre_order_hold === 'Y');

    $('#fieldCurrencyCode').val(item.currency_code);
    $('#fieldTotalBoxes').val(item.total_boxes);
    $('#fieldTotalPieces').val(item.total_pieces);
    $('#fieldTotalSv').val(item.total_sv);
    $('#fieldProductAmount').val(item.product_amount);
    $('#fieldShippingFee').val(item.shipping_fee);
    $('#fieldTotalSalesAmount').val(item.total_sales_amount);
    $('#fieldTotalCostAmount').val(item.total_cost_amount);
    $('#fieldTotalProfitAmount').val(item.total_profit_amount);

    $('#fieldFulfillmentStatus').val(item.fulfillment_status);
    $('#fieldPaymentStatus').val(item.payment_status);
    $('#fieldPaymentMethod').val(item.payment_method);
    $('#fieldPaymentPlatform').val(item.payment_platform);
    $('#fieldRemarks').val(item.remarks);

    new bootstrap.Modal(document.getElementById('outboundModal')).show();
}

function openDetailModalForActive() {
    if (!appState.selectedOutboundId) {
        AppToast.warning("請先選取一筆銷貨單據！");
        return;
    }
    openDetailModal(appState.selectedOutboundId);
}

function openDetailModal(orderId) {
    const item = appState.outbounds.find(d => d.id === orderId);
    if (!item) return;

    const recipientResolved = (item.recipient_type === '經營者')
        ? getPartnerResolvedName(item.recipient_partner_id) || item.recipient_name
        : getCustomerResolvedName(item.recipient_customer_id) || item.recipient_name;

    $('#detailModalOutboundId').text(item.id);
    $('#detailModalRecipient').text(recipientResolved);
    $('#detailModalOperator').text(getPartnerResolvedName(item.operator_partner_id));
    $('#detailModalStatus').text(item.fulfillment_status);

    const matchedItems = appState.outboundItems.filter(it => it.outbound_id === orderId);
    const $tbody = $('#outboundItemsTableBody').empty();

    if (matchedItems.length === 0) {
        $tbody.append('<tr><td colspan="13" class="text-center text-secondary py-3">本銷貨單暫無細項明細數據</td></tr>');
    } else {
        matchedItems.forEach(it => {
            $tbody.append(`
                <tr>
                    <td class="text-secondary">${it.item_seq}</td>
                    <td>
                        <div class="fw-bold text-white">${it.product_name_snapshot || '-'}</div>
                        <div class="text-secondary small">${it.official_product_code || '-'}</div>
                    </td>
                    <td>
                        <span class="badge ${it.is_fee_item === 'Y' ? 'badge-muted-subtle' : 'badge-purple-subtle'}">${it.is_fee_item === 'Y' ? '費用' : '實物'}</span>
                        <span class="badge badge-muted-subtle">${it.sales_unit}</span>
                    </td>
                    <td>$${it.unit_price.toLocaleString()}</td>
                    <td>$${it.unit_cost.toLocaleString()}</td>
                    <td class="text-warning">${it.unit_sv} SV</td>
                    <td class="text-success fw-bold">${it.ordered_qty} / ${it.shipped_qty}</td>
                    <td class="text-success">$${it.subtotal_amount.toLocaleString()}</td>
                    <td>$${it.subtotal_cost.toLocaleString()}</td>
                    <td class="text-info fw-bold">$${it.subtotal_profit.toLocaleString()}</td>
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

    new bootstrap.Modal(document.getElementById('outboundDetailModal')).show();
}

async function saveOutboundOrder() {
    const mode = $('#formMode').val();
    const orderId = $('#fieldId').val().trim();
    if (!orderId) {
        AppToast.warning("銷貨單號為必填主鍵！");
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existing = appState.outbounds.find(d => d.id === orderId);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    const productAmount = parseFloat($('#fieldProductAmount').val()) || 0;
    const shippingFee = parseFloat($('#fieldShippingFee').val()) || 0;
    const totalSales = productAmount + shippingFee;
    const totalCost = parseFloat($('#fieldTotalCostAmount').val()) || 0;
    const totalProfit = totalSales - totalCost;

    // 依據表 305 (psi_outbound_orders) 物理順序組成 0 ~ 35 陣列
    const rowDataArray = [
        orderId,                                                    // 0: id
        $('#fieldOrderCategory').val(),                             // 1: order_category
        $('#fieldOrderCenter').val(),                               // 2: order_center
        $('#fieldPerformanceMonth').val(),                          // 3: performance_month
        $('#fieldOrderDate').val(),                                 // 4: order_date
        $('#fieldDeliveryMethod').val(),                            // 5: delivery_method
        $('#fieldWarehouseId').val(),                               // 6: warehouse_id
        $('#fieldOperatorPartnerId').val(),                         // 7: operator_partner_id
        $('#fieldRecipientType').val(),                             // 8: recipient_type
        $('#fieldRecipientCustomerId').val().trim(),                // 9: recipient_customer_id
        $('#fieldRecipientPartnerId').val().trim(),                 // 10: recipient_partner_id
        $('#fieldOutboundDate').val(),                              // 11: outbound_date
        $('#fieldCurrencyCode').val(),                              // 12: currency_code
        productAmount,                                              // 13: product_amount
        shippingFee,                                                // 14: shipping_fee
        totalSales,                                                 // 15: total_sales_amount
        totalCost,                                                  // 16: total_cost_amount
        totalProfit,                                                // 17: total_profit_amount
        parseInt($('#fieldTotalSv').val(), 10) || 0,                // 18: total_sv
        parseInt($('#fieldTotalBoxes').val(), 10) || 0,             // 19: total_boxes
        parseInt($('#fieldTotalPieces').val(), 10) || 0,            // 20: total_pieces
        $('#fieldTrackingNo').val().trim(),                         // 21: tracking_no
        $('#fieldShippingDate').val(),                              // 22: shipping_date
        $('#fieldRecipientName').val().trim(),                      // 23: recipient_name
        $('#fieldRecipientPhone').val().trim(),                     // 24: recipient_phone
        $('#fieldShippingAddress').val().trim(),                    // 25: shipping_address
        $('#fieldIsPreOrderHold').is(':checked') ? 'Y' : 'N',       // 26: is_pre_order_hold
        $('#fieldFulfillmentStatus').val(),                         // 27: fulfillment_status
        $('#fieldPaymentStatus').val(),                             // 28: payment_status
        $('#fieldPaymentMethod').val(),                             // 29: payment_method
        $('#fieldPaymentPlatform').val(),                           // 30: payment_platform
        $('#fieldRemarks').val().trim(),                            // 31: remarks
        createdBy,                                                  // 32: created_by
        createdAt,                                                  // 33: created_at
        currentUser,                                                // 34: modified_by
        nowStr                                                      // 35: modified_at
    ];

    const updatedObj = {
        id: orderId,
        order_category: $('#fieldOrderCategory').val(),
        order_center: $('#fieldOrderCenter').val(),
        performance_month: $('#fieldPerformanceMonth').val(),
        order_date: $('#fieldOrderDate').val(),
        delivery_method: $('#fieldDeliveryMethod').val(),
        warehouse_id: $('#fieldWarehouseId').val(),
        operator_partner_id: $('#fieldOperatorPartnerId').val(),
        recipient_type: $('#fieldRecipientType').val(),
        recipient_customer_id: $('#fieldRecipientCustomerId').val().trim(),
        recipient_partner_id: $('#fieldRecipientPartnerId').val().trim(),
        outbound_date: $('#fieldOutboundDate').val(),
        currency_code: $('#fieldCurrencyCode').val(),
        product_amount: productAmount,
        shipping_fee: shippingFee,
        total_sales_amount: totalSales,
        total_cost_amount: totalCost,
        total_profit_amount: totalProfit,
        total_sv: parseInt($('#fieldTotalSv').val(), 10) || 0,
        total_boxes: parseInt($('#fieldTotalBoxes').val(), 10) || 0,
        total_pieces: parseInt($('#fieldTotalPieces').val(), 10) || 0,
        tracking_no: $('#fieldTrackingNo').val().trim(),
        shipping_date: $('#fieldShippingDate').val(),
        recipient_name: $('#fieldRecipientName').val().trim(),
        recipient_phone: $('#fieldRecipientPhone').val().trim(),
        shipping_address: $('#fieldShippingAddress').val().trim(),
        is_pre_order_hold: $('#fieldIsPreOrderHold').is(':checked') ? 'Y' : 'N',
        fulfillment_status: $('#fieldFulfillmentStatus').val(),
        payment_status: $('#fieldPaymentStatus').val(),
        payment_method: $('#fieldPaymentMethod').val(),
        payment_platform: $('#fieldPaymentPlatform').val(),
        remarks: $('#fieldRemarks').val().trim(),
        created_by: createdBy,
        created_at: createdAt,
        modified_by: currentUser,
        modified_at: nowStr
    };

    const $btn = $('#btnSaveOutbound');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入雲端中...');

        if (mode === 'add') {
            await SheetAdapter.sendRequest('CREATE', '銷貨主檔', orderId, rowDataArray);
            appState.outbounds.unshift(updatedObj);
        } else {
            await SheetAdapter.sendRequest('UPDATE', '銷貨主檔', orderId, rowDataArray);
            const idx = appState.outbounds.findIndex(d => d.id === orderId);
            if (idx !== -1) appState.outbounds[idx] = updatedObj;
        }

        appState.selectedOutboundId = orderId;
        refreshAllViews();
        bootstrap.Modal.getInstance(document.getElementById('outboundModal')).hide();
        AppToast.success(`銷貨單據【${orderId}】儲存成功！`);
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存銷貨出庫單');
    }
}

async function quickMarkDelivered() {
    const item = appState.outbounds.find(d => d.id === appState.selectedOutboundId);
    if (!item) return;

    if (item.fulfillment_status === '已交付') {
        AppToast.warning("此單據早已為「已交付」狀態，無須重複扣庫！");
        return;
    }

    const confirmed = await AppDialog.confirm(`確認將出庫單【${item.id}】標記為「已交付」並正式扣減庫存解除預扣鎖定嗎？`, {
        title: '交付扣庫確認',
        confirmText: '確定交付',
        confirmClass: 'btn-purple'
    });
    if (!confirmed) return;

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const todayStr = new Date().toISOString().slice(0, 10);

    item.fulfillment_status = '已交付';
    item.is_pre_order_hold = 'N';
    item.outbound_date = todayStr;
    item.modified_by = currentUser;
    item.modified_at = nowStr;

    const rowDataArray = [
        item.id, item.order_category, item.order_center, item.performance_month,
        item.order_date, item.delivery_method, item.warehouse_id, item.operator_partner_id,
        item.recipient_type, item.recipient_customer_id, item.recipient_partner_id,
        item.outbound_date, item.currency_code, item.product_amount, item.shipping_fee,
        item.total_sales_amount, item.total_cost_amount, item.total_profit_amount,
        item.total_sv, item.total_boxes, item.total_pieces, item.tracking_no,
        item.shipping_date, item.recipient_name, item.recipient_phone, item.shipping_address,
        item.is_pre_order_hold, item.fulfillment_status, item.payment_status,
        item.payment_method, item.payment_platform, item.remarks,
        item.created_by, item.created_at, item.modified_by, item.modified_at
    ];

    try {
        await SheetAdapter.sendRequest('UPDATE', '銷貨主檔', item.id, rowDataArray);
        refreshAllViews();
        AppToast.success(`銷貨單【${item.id}】已標記交付，實體庫存成功扣減！`);
    } catch (err) {
        AppToast.error("交付狀態更新失敗：" + err.message);
    }
}

async function deleteOutboundOrder(id) {
    const item = appState.outbounds.find(d => d.id === id);
    if (!item) return;

    const confirmed = await AppDialog.confirm(`確定要自雲端試算表中永久作廢/刪除銷貨單【${item.id}】嗎？此動作將取消實體配額扣減！`, {
        title: '刪除單據確認',
        confirmText: '確定刪除',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    try {
        await SheetAdapter.sendRequest('DELETE', '銷貨主檔', id, []);
        appState.outbounds = appState.outbounds.filter(d => d.id !== id);
        if (appState.selectedOutboundId === id) {
            appState.selectedOutboundId = appState.outbounds.length > 0 ? appState.outbounds[0].id : '';
        }
        refreshAllViews();
        AppToast.success(`銷貨單【${id}】已成功自雲端刪除！`);
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

    localStorage.setItem('cfg_out_sheet_psi', SPREADSHEET_CONFIG.sheetPsi);
    localStorage.setItem('cfg_out_sheet_org', SPREADSHEET_CONFIG.sheetOrg);
    localStorage.setItem('cfg_out_sheet_prd', SPREADSHEET_CONFIG.sheetPrd);
    localStorage.setItem('cfg_out_sheet_crm', SPREADSHEET_CONFIG.sheetCrm);
    localStorage.setItem('cfg_out_gas_id', SPREADSHEET_CONFIG.gasDeploymentId);

    if (window.SheetAdapter) {
        SheetAdapter.init(SPREADSHEET_CONFIG.gasDeploymentId);
    }
    bootstrap.Modal.getInstance(document.getElementById('configModal')).hide();
    AppToast.success("4 大試算表連線組態已更新，重新同步中...");
    fetchAllGoogleSheetsData();
}

function exportOutboundCSV() {
    const csv = Papa.unparse(appState.outbounds);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psi_outbound_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    AppToast.info('已成功匯出銷貨主檔 CSV 檔案');
}