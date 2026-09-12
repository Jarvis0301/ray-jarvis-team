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
    outbounds: [],
    outboundItems: [],
    warehouses: [],
    persons: [],
    partners: [],
    products: [],
    customers: [],
    stocks: [],
    activePipelineFilter: 'ALL',
    selectedOutboundId: ''
};

// 新增雙圖表實例追蹤
let chartScaleInstance = null;
let chartProfitInstance = null;

let outboundDataTableInstance = null;
let isInitialized = false;

let currentDetailOrderId = null; // 當前正在檢視明細的銷貨單號

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
    await initOutboundApp();
});

async function initOutboundApp() {
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
 * 資料拉取引擎
 */
async function fetchAllGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i>正在讀取雲端資料庫...', '載入中...');

    try {
        const [rawWarehouses, rawOutbounds, rawOutboundItems, rawPersons, rawPartners, rawProducts, rawCustomers, rawStocks] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '據點倉儲').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '銷貨主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '銷貨明細').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsn, '個人主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetOrg, '夥伴主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPrd, '產品主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetCrm, '客戶主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '庫存主檔').catch(() => [])
        ]);

        parseAllData({
            rawWarehouses,
            rawOutbounds,
            rawOutboundItems,
            rawPersons,
            rawPartners,
            rawProducts,
            rawCustomers,
            rawStocks
        });

        refreshAllViews();
        $('#hudSyncTime').text(getFormattedNow());
        AppToast.success(`4 大試算表同步完成 (${appState.outbounds.length} 筆銷貨單據)`);
    } catch (err) {
        console.error("試算表同步異常:", err);
        AppToast.error("部分試算表連線失敗，請檢查 4 大試算表共用權限");
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

    // 8. 解析庫存主檔 (表 302: psi_stocks)
    appState.stocks = (data.rawStocks || []).map(r => ({
        id: getVal(r, 0),
        warehouse_id: getVal(r, 1),
        product_id: getVal(r, 2),
        batch_no: getVal(r, 3),
        expiry_date: getVal(r, 4),
        quantity: parseInt(getVal(r, 5, '0'), 10) || 0,
        pieces_qty: parseInt(getVal(r, 6, '0'), 10) || 0,
        available_qty: parseInt(getVal(r, 8, '0'), 10) || 0,
        cost_price: parseFloat(getVal(r, 10, '0')) || 0,
        sv_point: parseInt(getVal(r, 11, '0'), 10) || 0
    })).filter(s => s.id !== '');

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
    // 篩選列倉庫（全部據點）
    UISelectOptions.warehouse.populate({
        target: '#filterWarehouse',
        warehouses: appState.warehouses,
        placeholder: '全部出貨倉庫',
        displayMode: 1, // 僅顯示名稱
        searchable: true
    });

    // 篩選列開單夥伴
    UISelectOptions.partner.populate({
        target: '#filterOperator',
        partners: appState.partners,
        persons: appState.persons,
        placeholder: '全部開單夥伴',
        searchable: true
    });

    // Modal 倉儲據點
    const nonOfficialFilter = w => {
        const type = String(w.warehouse_type || '').toUpperCase();
        return !type.includes('官方') && !type.includes('OFFICIAL') && w.id !== 'WH-TW-TP' && w.id !== 'WH-TW-KH';
    };

    ['#fieldWarehouseId', '#fieldOrderCenter'].forEach(target => {
        UISelectOptions.warehouse.populate({
            target,
            warehouses: appState.warehouses,
            placeholder: '-- 請選擇自營倉儲據點 --',
            dropdownParent: '#outboundModal',
            displayMode: 1, // 僅顯示名稱
            searchable: true,
            filterFn: nonOfficialFilter
        });
    });

    // Modal 夥伴與客戶
    ['#fieldOperatorPartnerId', '#fieldRecipientPartnerId'].forEach(target => {
        UISelectOptions.partner.populate({
            target,
            partners: appState.partners,
            persons: appState.persons,
            dropdownParent: '#outboundModal'
        });
    });

    UISelectOptions.customer.populate({
        target: '#fieldRecipientCustomerId',
        customers: appState.customers,
        persons: appState.persons,
        dropdownParent: '#outboundModal'
    });
}

function renderCounters() {
    const list = appState.outbounds;
    $('#countAll').text(list.length);
    $('#countDraft').text(list.filter(d => d.fulfillment_status === '草稿').length);
    $('#countPending').text(list.filter(d => d.fulfillment_status === '待取貨').length);
    $('#countShipped').text(list.filter(d => d.fulfillment_status === '已寄出').length);
    $('#countHold').text(list.filter(d => d.is_pre_order_hold === 'Y').length);
    $('#countDelivered').text(list.filter(d => d.fulfillment_status === '已交付').length);
    $('#countCancelled').text(list.filter(d => d.fulfillment_status === '已取消').length);
}

/**
 * 貨幣格式化輔助器 (支援台幣 NT$ 與馬幣 RM)
 */
function formatCurrency(amount, currencyCode = 'TWD') {
    const symbol = (currencyCode === 'MYR') ? 'RM ' : 'NT$ ';
    const num = Number(amount) || 0;
    return `${symbol}${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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
    // 符號改為 NT$
    $('#kpiTotalSales').text(formatCurrency(totalSales, 'TWD'));
    $('#kpiTotalSv').text(totalSv.toLocaleString());
    $('#kpiTotalProfit').text(formatCurrency(totalProfit, 'TWD'));
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
        $('#inspAmountAndProfit').text('NT$ 0 / +NT$ 0');
        $('#inspectorFulfillBadge').text('無選取');
        $('#btnMarkDelivered').prop('disabled', true);
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

    $('#inspPreOrderHoldBadge').html(UIBadges.psi.preOrderHold(item.is_pre_order_hold, true));

    $('#inspDeliveryMethod').text(item.delivery_method);
    $('#inspTrackingNo').text(item.tracking_no || '(無物流單號/自取)');
    $('#inspShippingAddress').text(item.shipping_address || '(現場面交/自取無地址)');
    $('#inspRemarks').text(item.remarks || '暫無特定備註事項。');

    $('#inspBoxesAndSv').text(`${item.total_boxes} 盒 / ${item.total_pieces} 支 / ${Number(item.total_sv).toLocaleString()} SV`);
    
    const curr = item.currency_code || 'TWD';
    const profitSign = item.total_profit_amount >= 0 ? '+' : '';
    const salesFormatted = formatCurrency(item.total_sales_amount, curr);
    const profitFormatted = `${profitSign}${formatCurrency(item.total_profit_amount, curr)}`;
    $('#inspAmountAndProfit').text(`${salesFormatted} / ${profitFormatted}`);

    $('#inspectorFulfillBadge').replaceWith(
        $(UIBadges.psi.outboundStatus(item.fulfillment_status)).attr('id', 'inspectorFulfillBadge')
    );

    // 依據出庫狀態控制扣庫結案按鈕
    const canDeliver = (item.fulfillment_status === '待取貨' || item.fulfillment_status === '已寄出');
    if (canDeliver) {
        $('#btnMarkDelivered').prop('disabled', false).removeClass('opacity-50')
            .html('<i class="fa-solid fa-stamp me-1"></i>標記為已交付（執行實體扣庫）');
    } else if (item.fulfillment_status === '已交付') {
        $('#btnMarkDelivered').prop('disabled', true).addClass('opacity-50')
            .html('<i class="fa-solid fa-circle-check me-1"></i>此單據已核銷交付');
    } else {
        $('#btnMarkDelivered').prop('disabled', true).addClass('opacity-50')
            .html('<i class="fa-solid fa-ban me-1"></i>此狀態不可直接交付');
    }
}

function renderChart() {
    const ctxScale = document.getElementById('outboundScaleChart');
    const ctxProfit = document.getElementById('outboundProfitChart');
    if (!ctxScale || !ctxProfit) return;

    const monthMap = {};
    appState.outbounds.forEach(d => {
        if (d.fulfillment_status !== '已取消') {
            const m = d.performance_month || '未歸類';
            if (!monthMap[m]) monthMap[m] = { sales: 0, profit: 0, sv: 0 };
            monthMap[m].sales += (parseFloat(d.total_sales_amount) || 0);
            monthMap[m].profit += (parseFloat(d.total_profit_amount) || 0);
            monthMap[m].sv += (parseInt(d.total_sv, 10) || 0);
        }
    });

    const labels = Object.keys(monthMap).sort();
    const salesData = labels.map(l => monthMap[l].sales);
    const svData = labels.map(l => monthMap[l].sv);
    const profitData = labels.map(l => monthMap[l].profit);

    // 銷毀既有圖表實例
    if (chartScaleInstance) chartScaleInstance.destroy();
    if (chartProfitInstance) chartProfitInstance.destroy();

    // 1. 銷貨規模與考核走勢圖 (實收 NT$ vs 出庫 SV，雙 Y 軸，無填滿)
    chartScaleInstance = new Chart(ctxScale, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '銷貨實收收入 (NT$)',
                    data: salesData,
                    borderColor: '#8b5cf6',
                    backgroundColor: '#8b5cf6',
                    pointBackgroundColor: '#8b5cf6',
                    pointBorderColor: '#ffffff',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: false, // 移除填滿顏色
                    yAxisID: 'y'
                },
                {
                    label: '月度考核 SV',
                    data: svData,
                    borderColor: '#f59e0b',
                    backgroundColor: '#f59e0b',
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#ffffff',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: false, // 移除填滿顏色
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { color: '#a78bfa' }, grid: { color: 'rgba(139, 92, 246, 0.08)' } },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: '金額 (NT$)', color: '#a78bfa' },
                    ticks: { color: '#c084fc' },
                    grid: { color: 'rgba(139, 92, 246, 0.12)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: '考核 SV', color: '#f59e0b' },
                    ticks: { color: '#f59e0b' },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                legend: { labels: { color: '#f5f3ff', font: { size: 11 } } }
            }
        }
    });

    // 2. 實質毛利價差走勢圖 (獨立 Y 軸，高靈敏度捕捉波動，無填滿)
    chartProfitInstance = new Chart(ctxProfit, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '毛利價差利潤 (NT$)',
                    data: profitData,
                    borderColor: '#34d399',
                    backgroundColor: '#34d399',
                    pointBackgroundColor: '#34d399',
                    pointBorderColor: '#ffffff',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: false, // 移除填滿顏色
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { color: '#a78bfa' }, grid: { color: 'rgba(139, 92, 246, 0.08)' } },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: '毛利金額 (NT$)', color: '#34d399' },
                    ticks: { color: '#34d399' },
                    grid: { color: 'rgba(52, 211, 153, 0.12)' }
                }
            },
            plugins: {
                legend: { labels: { color: '#f5f3ff', font: { size: 11 } } }
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
            order: [[3, 'desc']],
            columns: [
                { data: 'id_and_cat' },
                { data: 'center_and_warehouse' },
                { data: 'parties' },
                { data: 'dates' },
                { data: 'perf_month', className: 'text-center' },
                { data: 'quantities' },
                { data: 'financials' },
                { data: 'sv' },
                { data: 'hold', className: 'text-center' },
                { data: 'status', className: 'text-center' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }

    $('#tableSummaryInfo').text(`顯示 ${formattedRows.length} / ${appState.outbounds.length} 筆`);
}

function getFilteredData() {
    const startDate = $('#filterOrderDateStart').val();
    const endDate = $('#filterOrderDateEnd').val();
    const month = $('#filterPerformanceMonth').val();
    const wh = $('#filterWarehouse').val();
    const operator = $('#filterOperator').val();

    return appState.outbounds.filter(item => {
        let matchPipeline = true;
        if (appState.activePipelineFilter === 'HOLD') {
            matchPipeline = (item.is_pre_order_hold === 'Y');
        } else if (appState.activePipelineFilter !== 'ALL') {
            matchPipeline = (item.fulfillment_status === appState.activePipelineFilter);
        }

        const matchWh = (!wh) || (item.warehouse_id === wh || item.order_center === wh);
        const matchMonth = (!month) || (item.performance_month === month);
        const matchOperator = (!operator) || (item.operator_partner_id === operator);

        let matchDate = true;
        if (startDate && item.order_date) {
            matchDate = matchDate && (item.order_date >= startDate);
        }
        if (endDate && item.order_date) {
            matchDate = matchDate && (item.order_date <= endDate);
        }

        return matchPipeline && matchWh && matchMonth && matchOperator && matchDate;
    });
}

function formatTableRow(item) {
    const statusBadge = UIBadges.psi.outboundStatus(item.fulfillment_status);
    const holdBadge = UIBadges.psi.preOrderHold(item.is_pre_order_hold, false);

    const recipientResolved = (item.recipient_type === '經營者')
        ? getPartnerResolvedName(item.recipient_partner_id) || item.recipient_name
        : getCustomerResolvedName(item.recipient_customer_id) || item.recipient_name;

    const operatorResolved = getPartnerResolvedName(item.operator_partner_id);
    
    const curr = item.currency_code || 'TWD';
    const profitSign = item.total_profit_amount >= 0 ? '+' : '';
    const salesText = formatCurrency(item.total_sales_amount, curr);
    const profitText = `${profitSign}${formatCurrency(item.total_profit_amount, curr)}`;

    const isDelivered = (item.fulfillment_status === '已交付');
    const isCancelled = (item.fulfillment_status === '已取消');

    const deleteBtnDisabled = isDelivered ? 'disabled title="已交付單據已完成庫存核銷，禁止刪除"' : 'title="刪除/作廢單據"';
    const editBtnDisabled = isCancelled ? 'disabled title="已取消單據禁止編輯"' : 'title="編輯銷貨單"';

    // 出庫倉儲僅顯示名稱 (displayMode: 1)
    const warehousePureName = EntityResolver.warehouse(item.warehouse_id, appState.warehouses, 1);
    const orderCenterPureName = EntityResolver.warehouse(item.order_center, appState.warehouses, 1) || item.order_center;

    const actionButtons = `
        <div class="d-flex align-items-center justify-content-end gap-1">
            <button class="btn btn-sm btn-outline-info" title="置入裝箱檢驗艙" onclick="selectOutbound('${item.id}')">
                <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline-info" title="查看銷貨細項" onclick="openDetailModal('${item.id}')">
                <i class="fa-solid fa-list-ul"></i>
            </button>
            <button class="btn btn-sm btn-outline-primary" ${editBtnDisabled} onclick="openEditOutboundModal('${item.id}')">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" ${deleteBtnDisabled} onclick="deleteOutboundOrder('${item.id}')">
                <i class="fa-solid fa-trash-can"></i>
            </button>
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
                <span class="badge badge-purple-subtle">${warehousePureName}</span>
                <div class="text-secondary small mt-1"><i class="fa-solid fa-truck me-1"></i>${orderCenterPureName} / ${item.delivery_method}</div>
            </div>
        `,
        parties: `
            <div>
                <div class="small text-white fw-bold"><i class="fa-solid fa-user-tag text-info me-1"></i>${recipientResolved}</div>
                <div class="small text-secondary"><i class="fa-solid fa-hand-holding-dollar text-warning me-1"></i>經手：${operatorResolved}</div>
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
                <div class="fw-bold text-success">${salesText}</div>
                <div class="text-secondary small">${profitText} 毛利</div>
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
    $('#outboundModalTitle').html('<i class="fa-solid fa-file-circle-plus text-primary me-1"></i>開立銷貨出庫單據');
    $('#formMode').val('add');
    $('#outboundForm')[0].reset();

    const nextSeq = String(appState.outbounds.length + 1).padStart(4, '0');
    const todayStr = new Date().toISOString().slice(0, 10);
    const dateCode = todayStr.replace(/-/g, '');
    const newId = `OUT-${dateCode}-${nextSeq}`;

    $('#fieldId').val(newId);
    $('#fieldOrderCategory').val('零售客銷售');
    $('#fieldPerformanceMonth').val(todayStr.slice(0, 7));
    $('#fieldOrderDate').val(todayStr);
    $('#fieldDeliveryMethod').val('面交自取');

    // 新增單據時允許自由選取幣別
    $('#fieldCurrencyCode').prop('disabled', false).removeClass('form-control-readonly').removeAttr('title');
    $('#fieldCurrencyCode').val('TWD');

    // 歸零唯讀鎖定數值
    $('#fieldTotalBoxes').val(0);
    $('#fieldTotalPieces').val(0);
    $('#fieldTotalSv').val(0);
    $('#fieldProductAmount').val('0.00');
    $('#fieldShippingFee').val('0.00');
    $('#fieldTotalSalesAmount').val('0.00');
    $('#fieldTotalCostAmount').val('0.00');
    $('#fieldTotalProfitAmount').val('0.00');

    $('#fieldFulfillmentStatus').val('草稿');
    $('#fieldPaymentStatus').val('已收訖');
    $('#fieldPaymentMethod').val('現金');
    $('#fieldPaymentPlatform').val('現金');

    new bootstrap.Modal(document.getElementById('outboundModal')).show();
}

function openEditOutboundModal(id) {
    const item = appState.outbounds.find(d => d.id === id);
    if (!item) return;

    $('#outboundModalTitle').html('<i class="fa-solid fa-pen-to-square text-primary me-1"></i>編輯銷貨出庫單');
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

    // 幣別鎖定防呆：若該銷貨單已建立明細，嚴禁更改交易幣別
    const hasItems = appState.outboundItems.some(it => it.outbound_id === id);
    $('#fieldCurrencyCode').val(item.currency_code);
    if (hasItems) {
        $('#fieldCurrencyCode').prop('disabled', true).addClass('form-control-readonly')
            .attr('title', '此單據已存在明細細項，為確保會計一致性，禁止更改幣別');
    } else {
        $('#fieldCurrencyCode').prop('disabled', false).removeClass('form-control-readonly').removeAttr('title');
    }

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

    currentDetailOrderId = orderId;
    closeInlineItemForm();

    const recipientResolved = (item.recipient_type === '經營者')
        ? getPartnerResolvedName(item.recipient_partner_id) || item.recipient_name
        : getCustomerResolvedName(item.recipient_customer_id) || item.recipient_name;

    // 1. 上方狀態資訊卡填值 (含訂單日期、交付日期、業績月份、經手、倉庫據點、出庫狀態)
    $('#detailModalOutboundId').text(item.id);
    $('#detailModalOrderDate').text(item.order_date || '-');
    $('#detailModalOutboundDate').text(item.outbound_date || '未交付');
    $('#detailModalPerfMonth').text(item.performance_month || '-');
    $('#detailModalRecipient').text(recipientResolved);
    $('#detailModalOperator').text(getPartnerResolvedName(item.operator_partner_id));
    $('#detailModalWarehouse').text(getWarehouseDisplayName(item.warehouse_id));
    $('#detailModalStatusBadge').html(UIBadges.psi.outboundStatus(item.fulfillment_status));

    // 2. 狀態機權限控制：若是「已交付」或「已取消」，鎖定明細不可再進行增修刪
    const isLocked = (item.fulfillment_status === '已交付' || item.fulfillment_status === '已取消');
    if (isLocked) {
        $('#btnToggleAddOutboundItem').prop('disabled', true).addClass('opacity-50')
            .attr('title', `單據處於【${item.fulfillment_status}】狀態，明細已全唯讀鎖定`);
    } else {
        $('#btnToggleAddOutboundItem').prop('disabled', false).removeClass('opacity-50')
            .removeAttr('title');
    }

    // 3. 透過共用 Select2 模組填裝產品下拉選單
    populateInlineProductOptions();

    // 4. 渲染明細表格與計算底部統計
    renderOutboundItemsTable(orderId, isLocked);

    new bootstrap.Modal(document.getElementById('outboundDetailModal')).show();
}

function renderOutboundItemsTable(orderId, isLocked) {
    const parentOrder = appState.outbounds.find(d => d.id === orderId);
    const curr = parentOrder ? (parentOrder.currency_code || 'TWD') : 'TWD';

    const matchedItems = appState.outboundItems.filter(it => it.outbound_id === orderId);
    const $tbody = $('#outboundItemsTableBody').empty();

    let sumBoxes = 0;
    let sumPieces = 0;
    let sumSales = 0;
    let sumCost = 0;
    let sumProfit = 0;
    let sumSv = 0;

    if (matchedItems.length === 0) {
        $tbody.append('<tr><td colspan="14" class="text-center text-secondary py-3">本銷貨單暫無細項明細數據</td></tr>');
    } else {
        matchedItems.forEach(it => {
            const isBox = (it.sales_unit === '盒' || it.sales_unit === '組' || it.sales_unit === '箱');
            if (isBox) {
                sumBoxes += (parseInt(it.shipped_qty, 10) || 0);
            } else if (it.is_fee_item !== 'Y') {
                sumPieces += (parseInt(it.shipped_qty, 10) || 0);
            }

            sumSales += (parseFloat(it.subtotal_amount) || 0);
            sumCost += (parseFloat(it.subtotal_cost) || 0);
            sumProfit += (parseFloat(it.subtotal_profit) || 0);
            sumSv += (parseInt(it.subtotal_sv, 10) || 0);

            const opBtnDisabled = isLocked ? 'disabled' : '';

            $tbody.append(`
                <tr>
                    <td class="text-secondary">${it.item_seq}</td>
                    <td>
                        <div class="fw-bold text-white">${it.product_name_snapshot || '-'}</div>
                        <div class="text-secondary small">${it.official_product_code || '-'}</div>
                    </td>
                    <td>
                        ${UIBadges.psi.feeItem(it.is_fee_item)}
                        <span class="badge badge-purple-subtle">${it.sales_unit}</span>
                    </td>
                    <td>${formatCurrency(it.unit_price, curr)}</td>
                    <td>${formatCurrency(it.unit_cost, curr)}</td>
                    <td class="text-warning">${it.unit_sv} SV</td>
                    <td class="text-success fw-bold">${it.ordered_qty} / ${it.shipped_qty}</td>
                    <td class="text-success">${formatCurrency(it.subtotal_amount, curr)}</td>
                    <td>${formatCurrency(it.subtotal_cost, curr)}</td>
                    <td class="text-info fw-bold">${formatCurrency(it.subtotal_profit, curr)}</td>
                    <td class="text-warning">${it.subtotal_sv} SV</td>
                    <td>
                        <div>${it.batch_no || '-'}</div>
                        <div class="text-secondary small">${it.expiry_date || '-'}</div>
                    </td>
                    <td class="text-secondary">${it.stock_id || '-'}</td>
                    <td class="text-end">
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" ${opBtnDisabled} title="編輯明細" onclick="editInlineItem('${it.id}')">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn btn-outline-danger" ${opBtnDisabled} title="刪除明細" onclick="deleteInlineItem('${it.id}')">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `);
        });
    }

    // 更新底部統計區塊
    $('#sumItemCount').text(matchedItems.length);
    $('#sumBoxes').text(sumBoxes);
    $('#sumPieces').text(sumPieces);
    $('#sumSalesAmount').text(formatCurrency(sumSales, curr));
    $('#sumCostAmount').text(formatCurrency(sumCost, curr));
    $('#sumProfitAmount').text(formatCurrency(sumProfit, curr));
    $('#sumTotalSv').text(sumSv.toLocaleString());
}

/**
 * 載入明細產品選單（費用獨立分組，並對齊 Select2）
 */
function populateInlineProductOptions() {
    const $select = $('#inlineProductSelect').empty().append('<option value="">-- 請選擇產品或費用品項 --</option>');

    // 1. 常規實體商品群組
    const $optGroupProducts = $('<optgroup label="📦 官方實體商品品項"></optgroup>');
    appState.products.forEach(p => {
        $optGroupProducts.append(
            $('<option></option>')
                .val(p.product_code)
                .text(`${p.name} [${p.product_code}]`)
                .attr('data-type', 'PRODUCT')
                .attr('data-name', p.name)
                .attr('data-price', p.price)
                .attr('data-sv', p.sv_point)
        );
    });
    $select.append($optGroupProducts);

    // 2. 獨立費用項目群組
    const feeItems = [
        { code: 'FEE-A13', name: '官方運費補貼 (A13)', price: 150 },
        { code: 'FEE-PKG', name: '特殊包材與保冷費', price: 50 },
        { code: 'FEE-DLV', name: '同城 Grab 急件快遞費', price: 200 },
        { code: 'FEE-OTH', name: '其他自訂勞務費用', price: 0 }
    ];
    const $optGroupFees = $('<optgroup label="💳 運費與勞務雜費項目"></optgroup>');
    feeItems.forEach(f => {
        $optGroupFees.append(
            $('<option></option>')
                .val(f.code)
                .text(`${f.name} [${f.code}]`)
                .attr('data-type', 'FEE')
                .attr('data-name', f.name)
                .attr('data-price', f.price)
                .attr('data-sv', 0)
        );
    });
    $select.append($optGroupFees);

    if ($.fn.select2) {
        $select.select2({
            dropdownParent: $('#outboundDetailModal'),
            width: '100%',
            placeholder: '-- 請選擇產品或費用品項 --'
        });
    }

    // 監聽選取事件：自動帶出價格、SV、批號、效期、扣庫單號
    $select.off('change.itemSelect').on('change.itemSelect', function () {
        onInlineProductSelectChange();
    });
}

/**
 * 選取品項後之自動帶入邏輯
 */
function onInlineProductSelectChange() {
    const code = $('#inlineProductSelect').val();
    if (!code) return;

    const $selectedOpt = $('#inlineProductSelect option:selected');
    const itemType = $selectedOpt.attr('data-type');
    const price = parseFloat($selectedOpt.attr('data-price')) || 0;
    const sv = parseInt($selectedOpt.attr('data-sv'), 10) || 0;

    const parentOrder = appState.outbounds.find(d => d.id === currentDetailOrderId);
    const targetWh = parentOrder ? parentOrder.warehouse_id : '';

    if (itemType === 'FEE') {
        // 費用項目自動判定
        $('#inlineIsFeeItem').val('Y');
        $('#inlineSalesUnit').val('項');
        $('#inlineUnitPrice').val(price);
        $('#inlineUnitCost').val(0);
        $('#inlineUnitSv').val(0);
        $('#inlineBatchNo').val('');
        $('#inlineExpiryDate').val('');
        $('#inlineStockId').val('');
    } else {
        // 實體商品自動判定
        $('#inlineIsFeeItem').val('N');
        $('#inlineSalesUnit').val('盒');
        $('#inlineUnitPrice').val(price);
        $('#inlineUnitSv').val(sv);

        // 經理成本基準約為售價 8 折
        const estimatedCost = Math.round(price * 0.8);
        $('#inlineUnitCost').val(estimatedCost);

        // 智慧在庫批號尋找 (FIFO 原則：同倉儲且可用量 > 0，效期最近者優先)
        const matchedStock = appState.stocks
            .filter(s => s.product_id === code && s.warehouse_id === targetWh && s.available_qty > 0)
            .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'))[0];

        if (matchedStock) {
            $('#inlineBatchNo').val(matchedStock.batch_no || '');
            $('#inlineExpiryDate').val(matchedStock.expiry_date || '');
            $('#inlineStockId').val(matchedStock.id || '');
            if (matchedStock.cost_price > 0) {
                $('#inlineUnitCost').val(matchedStock.cost_price);
            }
        } else {
            // 無現貨時提供預設值（仍開放第一線手動調整）
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            $('#inlineBatchNo').val(`LOT${y}${m}`);
            
            const exp = new Date();
            exp.setFullYear(today.getFullYear() + 2);
            $('#inlineExpiryDate').val(exp.toISOString().slice(0, 10));
            $('#inlineStockId').val('');
        }
    }
    calcInlineSubtotals();
}

function toggleInlineItemForm() {
    const $collapse = $('#outboundItemInlineCollapse');
    if ($collapse.hasClass('show')) {
        closeInlineItemForm();
    } else {
        openInlineAddForm();
    }
}

function openInlineAddForm() {
    $('#inlineFormTitle').html('<i class="fa-solid fa-file-circle-plus text-primary me-1"></i>新增單筆明細');
    $('#inlineItemId').val('');
    $('#inlineItemForm')[0].reset();
    
    // 清空產品 Select2 選取狀態並觸發 UI 更新
    $('#inlineProductSelect').val('').trigger('change.select2');
    
    $('#inlineSalesUnit').val('盒');
    $('#inlineOrderedQty').val(1);
    $('#inlineShippedQty').val(1);
    $('#outboundItemInlineCollapse').collapse('show');
}

function closeInlineItemForm() {
    $('#outboundItemInlineCollapse').collapse('hide');
    $('#inlineItemId').val('');
    $('#inlineProductSelect').val('').trigger('change.select2');
}

function onInlineProductChange() {
    const code = $('#inlineProductSelect').val();
    const prod = appState.products.find(p => p.product_code === code);
    if (!prod) return;

    $('#inlineUnitPrice').val(prod.price);
    // 葡眾經理進貨成本一般為定價約 8 折（或自庫存檔動態帶入）
    const estimatedCost = Math.round(prod.price * 0.8);
    $('#inlineUnitCost').val(estimatedCost);
    $('#inlineUnitSv').val(prod.sv_point);
    calcInlineSubtotals();
}

function calcInlineSubtotals() {
    const qty = parseInt($('#inlineShippedQty').val(), 10) || 0;
    const price = parseFloat($('#inlineUnitPrice').val()) || 0;
    const cost = parseFloat($('#inlineUnitCost').val()) || 0;
    const sv = parseInt($('#inlineUnitSv').val(), 10) || 0;
    // 即時計算（此處供使用者預覽，送出時會精準封裝）
}

function editInlineItem(itemId) {
    const it = appState.outboundItems.find(d => d.id === itemId);
    if (!it) return;

    $('#inlineFormTitle').html(`<i class="fa-solid fa-pen-to-square text-primary me-1"></i>編輯明細【項次 ${it.item_seq}】`);
    $('#inlineItemId').val(it.id);

    // 回填產品並驅動 Select2 同步顯示高亮
    const targetProductCode = it.product_id || it.official_product_code;
    $('#inlineProductSelect').val(targetProductCode).trigger('change.select2');

    $('#inlineSalesUnit').val(it.sales_unit || '盒');
    $('#inlineUnitPrice').val(it.unit_price);
    $('#inlineUnitCost').val(it.unit_cost);
    $('#inlineUnitSv').val(it.unit_sv);
    $('#inlineOrderedQty').val(it.ordered_qty);
    $('#inlineShippedQty').val(it.shipped_qty);
    $('#inlineBatchNo').val(it.batch_no || '');
    $('#inlineExpiryDate').val(it.expiry_date || '');
    $('#inlineStockId').val(it.stock_id || '');
    $('#inlineIsFeeItem').prop('checked', it.is_fee_item === 'Y');
    $('#inlineIsSampleDemo').prop('checked', it.is_sample_demo === 'Y');
    $('#inlineRemarks').val(it.remarks || '');

    $('#outboundItemInlineCollapse').collapse('show');
}

async function saveInlineOutboundItem() {
    const orderId = currentDetailOrderId;
    if (!orderId) return;

    const productCode = $('#inlineProductSelect').val();
    const shippedQty = parseInt($('#inlineShippedQty').val(), 10) || 0;
    const unitPrice = $('#inlineUnitPrice').val().trim();
    const unitCost = $('#inlineUnitCost').val().trim();

    if (!productCode) {
        AppToast.warning("請選擇「產品品項 / 費用項目」！");
        $('#inlineProductSelect').select2('open');
        return;
    }
    if (shippedQty <= 0) {
        AppToast.warning("「實體出庫量」必須大於 0！");
        $('#inlineShippedQty').focus();
        return;
    }
    if (unitPrice === '') {
        AppToast.warning("請填寫「銷售單價」！");
        $('#inlineUnitPrice').focus();
        return;
    }
    if (unitCost === '') {
        AppToast.warning("請填寫「進貨成本單價」！");
        $('#inlineUnitCost').focus();
        return;
    }

    const itemId = $('#inlineItemId').val().trim();

    const prod = appState.products.find(p => p.product_code === productCode);
    const productName = prod ? prod.name : ($('#inlineProductSelect option:selected').text() || '自訂項目');
    const salesUnit = $('#inlineSalesUnit').val();
    const unitSv = parseInt($('#inlineUnitSv').val(), 10) || 0;
    const orderedQty = parseInt($('#inlineOrderedQty').val(), 10) || 1;

    const subAmount = shippedQty * unitPrice;
    const subCost = shippedQty * unitCost;
    const subProfit = subAmount - subCost;
    const subSv = shippedQty * unitSv;

    const isFee = $('#inlineIsFeeItem').is(':checked') ? 'Y' : 'N';
    const isSample = $('#inlineIsSampleDemo').is(':checked') ? 'Y' : 'N';
    const batchNo = $('#inlineBatchNo').val().trim();
    const expiryDate = $('#inlineExpiryDate').val();
    const stockId = $('#inlineStockId').val().trim();
    const remarks = $('#inlineRemarks').val().trim();

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();

    const $btn = $('#btnSaveInlineItem');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i>儲存中...');

        if (!itemId) {
            // 新增明細
            const existingItems = appState.outboundItems.filter(it => it.outbound_id === orderId);
            const nextSeq = existingItems.length + 1;
            const seqStr = String(nextSeq).padStart(2, '0');
            const newId = `${orderId}-${seqStr}`;

            // 表 306 (psi_outbound_items) 實體欄位順序 0 ~ 26
            const rowData = [
                newId, orderId, nextSeq, productCode, productName,
                productCode, isFee, salesUnit, 'TWD',
                unitPrice, unitCost, unitSv, orderedQty, shippedQty,
                subAmount, subCost, subProfit, subSv,
                batchNo, expiryDate, stockId, isSample, remarks,
                currentUser, nowStr, currentUser, nowStr
            ];

            await SheetAdapter.sendRequest('CREATE', '銷貨明細', newId, rowData);
            AppToast.success(`明細【項次 ${nextSeq}】已成功新增！`);
        } else {
            // 更新明細
            const existing = appState.outboundItems.find(it => it.id === itemId);
            const itemSeq = existing ? existing.item_seq : 1;

            const rowData = [
                itemId, orderId, itemSeq, productCode, productName,
                productCode, isFee, salesUnit, 'TWD',
                unitPrice, unitCost, unitSv, orderedQty, shippedQty,
                subAmount, subCost, subProfit, subSv,
                batchNo, expiryDate, stockId, isSample, remarks,
                existing ? existing.created_by : currentUser,
                existing ? existing.created_at : nowStr,
                currentUser, nowStr
            ];

            await SheetAdapter.sendRequest('UPDATE', '銷貨明細', itemId, rowData);
            AppToast.success(`明細【${itemId}】已更新成功！`);
        }

        closeInlineItemForm();
        await fetchAllGoogleSheetsData();
        renderOutboundItemsTable(orderId, false);
    } catch (err) {
        AppToast.error("明細儲存失敗：" + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-check me-1"></i>確認儲存明細');
    }
}

async function deleteInlineItem(itemId) {
    const it = appState.outboundItems.find(d => d.id === itemId);
    if (!it) return;

    const confirmed = await AppDialog.confirm(`確定要自雲端刪除明細項次【${it.item_seq} - ${it.product_name_snapshot}】嗎？`, {
        title: '刪除明細項目',
        confirmText: '確定刪除',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    try {
        await SheetAdapter.sendRequest('DELETE', '銷貨明細', itemId, []);
        AppToast.success(`明細已成功刪除！`);
        await fetchAllGoogleSheetsData();
        renderOutboundItemsTable(currentDetailOrderId, false);
    } catch (err) {
        AppToast.error("刪除失敗：" + err.message);
    }
}

async function saveOutboundOrder() {
    const mode = $('#formMode').val();
    const orderId = $('#fieldId').val().trim();
    const orderCenter = $('#fieldOrderCenter').val();
    const perfMonth = $('#fieldPerformanceMonth').val();
    const orderDate = $('#fieldOrderDate').val();
    const whId = $('#fieldWarehouseId').val();
    const operatorId = $('#fieldOperatorPartnerId').val();
    const recipientName = $('#fieldRecipientName').val().trim();
    const shippingFee = $('#fieldShippingFee').val().trim();

    if (!orderId) {
        AppToast.warning("銷貨單號不可為空！");
        return;
    }
    if (!orderCenter) {
        AppToast.warning("請選擇「出貨調度中心」！");
        $('#fieldOrderCenter').focus();
        return;
    }
    if (!perfMonth) {
        AppToast.warning("請選擇「業績計入月份」！");
        $('#fieldPerformanceMonth').focus();
        return;
    }
    if (!orderDate) {
        AppToast.warning("請選擇「出單建立日期」！");
        $('#fieldOrderDate').focus();
        return;
    }
    if (!whId) {
        AppToast.warning("請選擇「實體扣庫倉庫」！");
        $('#fieldWarehouseId').focus();
        return;
    }
    if (!operatorId) {
        AppToast.warning("請選擇「經手開單夥伴」！");
        $('#fieldOperatorPartnerId').focus();
        return;
    }
    if (!recipientName) {
        AppToast.warning("請填寫「收件人姓名」！");
        $('#fieldRecipientName').focus();
        return;
    }
    if (shippingFee === '') {
        AppToast.warning("請填寫「向客收運費」（無運費請填 0）！");
        $('#fieldShippingFee').focus();
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existing = appState.outbounds.find(d => d.id === orderId);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    const productAmount = parseFloat($('#fieldProductAmount').val()) || 0;
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
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i>寫入雲端中...');

        if (mode === 'add') {
            await SheetAdapter.sendRequest('CREATE', '銷貨主檔', orderId, rowDataArray);
            appState.outbounds.unshift(updatedObj);
        } else {
            await SheetAdapter.sendRequest('UPDATE', '銷貨主檔', orderId, rowDataArray);
            const idx = appState.outbounds.findIndex(d => d.id === orderId);
            if (idx !== -1) appState.outbounds[idx] = updatedObj;
        }

        await fetchAllGoogleSheetsData();

        appState.selectedOutboundId = orderId;
        renderInspectorStage();
        bootstrap.Modal.getInstance(document.getElementById('outboundModal')).hide();
        AppToast.success(`銷貨單據【${orderId}】儲存成功！`);
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i>儲存');
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
        await fetchAllGoogleSheetsData();
        await autoRecalculateParentOutbound(currentDetailOrderId);
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
        await fetchAllGoogleSheetsData();
        await autoRecalculateParentOutbound(currentDetailOrderId);
        AppToast.success(`銷貨單【${id}】已成功自雲端刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗：" + err.message);
    }
}

/**
 * 依據最新銷貨明細，自動重算銷貨主檔各項統計與財務數據
 */
async function autoRecalculateParentOutbound(orderId) {
    const parentOrder = appState.outbounds.find(d => d.id === orderId);
    if (!parentOrder) return;

    const matchedItems = appState.outboundItems.filter(it => it.outbound_id === orderId);

    let calcTotalBoxes = 0;
    let calcTotalPieces = 0;
    let calcProductAmount = 0;
    let calcTotalCost = 0;
    let calcTotalSv = 0;

    matchedItems.forEach(it => {
        const shippedQty = parseInt(it.shipped_qty, 10) || 0;
        const isBox = (it.sales_unit === '盒' || it.sales_unit === '組' || it.sales_unit === '箱');

        if (it.is_fee_item !== 'Y') {
            if (isBox) {
                calcTotalBoxes += shippedQty;
            } else {
                calcTotalPieces += shippedQty;
            }
        }

        calcProductAmount += (parseFloat(it.subtotal_amount) || 0);
        calcTotalCost += (parseFloat(it.subtotal_cost) || 0);
        calcTotalSv += (parseInt(it.subtotal_sv, 10) || 0);
    });

    const shippingFee = parseFloat(parentOrder.shipping_fee) || 0;
    const calcTotalSales = calcProductAmount + shippingFee;
    const calcTotalProfit = calcTotalSales - calcTotalCost;

    // 更新快取
    parentOrder.total_boxes = calcTotalBoxes;
    parentOrder.total_pieces = calcTotalPieces;
    parentOrder.total_sv = calcTotalSv;
    parentOrder.product_amount = calcProductAmount;
    parentOrder.total_sales_amount = calcTotalSales;
    parentOrder.total_cost_amount = calcTotalCost;
    parentOrder.total_profit_amount = calcTotalProfit;
    parentOrder.modified_by = getCurrentUser();
    parentOrder.modified_at = getFormattedNow();

    // 依表 305 物理順序回寫雲端試算表
    const rowDataArray = [
        parentOrder.id, parentOrder.order_category, parentOrder.order_center, parentOrder.performance_month,
        parentOrder.order_date, parentOrder.delivery_method, parentOrder.warehouse_id, parentOrder.operator_partner_id,
        parentOrder.recipient_type, parentOrder.recipient_customer_id, parentOrder.recipient_partner_id,
        parentOrder.outbound_date, parentOrder.currency_code, parentOrder.product_amount, parentOrder.shipping_fee,
        parentOrder.total_sales_amount, parentOrder.total_cost_amount, parentOrder.total_profit_amount,
        parentOrder.total_sv, parentOrder.total_boxes, parentOrder.total_pieces, parentOrder.tracking_no,
        parentOrder.shipping_date, parentOrder.recipient_name, parentOrder.recipient_phone, parentOrder.shipping_address,
        parentOrder.is_pre_order_hold, parentOrder.fulfillment_status, parentOrder.payment_status,
        parentOrder.payment_method, parentOrder.payment_platform, parentOrder.remarks,
        parentOrder.created_by, parentOrder.created_at, parentOrder.modified_by, parentOrder.modified_at
    ];

    await SheetAdapter.sendRequest('UPDATE', '銷貨主檔', parentOrder.id, rowDataArray);
    renderDataTable();
    renderKpis();
    renderChart();
    renderInspectorStage();
}

// ==========================================================================
// 7. 試算表連線設定與匯出
// ==========================================================================
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