// ==========================================================================
// 1. 系統組態與資料庫來源定義
// ==========================================================================
const SPREADSHEET_CONFIG = {
    sheetPsi: APP_CONFIG.SHEETS.PSI,
    sheetOrg: APP_CONFIG.SHEETS.ORG,
    sheetPsn: APP_CONFIG.SHEETS.PSN,
    sheetPrd: APP_CONFIG.SHEETS.PRD,
    gasDeploymentId: APP_CONFIG.GAS.PSI
};

// 系統資料狀態庫
let appState = {
    inbounds: [],
    inboundItems: [],
    warehouses: [],
    persons: [],
    partners: [],
    products: [],
    activePipelineFilter: 'ALL',
    filters: {
        startDate: '',
        endDate: '',
        performanceMonth: '',
        warehouseId: 'ALL',
        purchaserId: 'ALL',
        svOwnerId: 'ALL'
    },
    chartInstances: {
        inboundTrend: null,
        purchaserShare: null,
        warehouseShare: null,
        centerShare: null,
        statusShare: null
    }
};

let inboundDataTableInstance = null;
let isInitialized = false;

let currentDetailOrderId = null; // 當前開啟的進貨單號

// 進貨明細前端暫存資料結構（一次性存檔專用）
let stagingInboundItems = [];
let originalInboundItemIds = [];
let deletedInboundItemIds = [];

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

/**
 * 幣別格式化工具函式 (支援 NT$ 0 與 RM 0 呈現)
 */
function formatCurrency(amount, currencyCode = 'TWD') {
    const num = parseFloat(amount) || 0;
    const prefix = String(currencyCode).toUpperCase() === 'MYR' ? 'RM ' : 'NT$ ';
    if (num === 0) return `${prefix}0`;
    return `${prefix}${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * 解析訂購中心顯示名稱
 */
function getOrderCenterDisplayName(centerVal) {
    if (!centerVal) return '-';
    if (centerVal === '網路' || centerVal === '網路 (TW)') return '網路 (TW)';
    if (centerVal === '網路 (MY)') return '網路 (MY)';

    const wh = appState.warehouses.find(w => w.id === centerVal || w.warehouse_name === centerVal);
    return wh ? wh.warehouse_name : centerVal;
}

/**
 * 正規化訂購中心 ID
 */
function normalizeOrderCenterId(centerVal) {
    if (!centerVal || centerVal === '網路' || centerVal === '網路 (TW)') return '網路 (TW)';
    if (centerVal === '網路 (MY)') return '網路 (MY)';

    const matchById = appState.warehouses.find(w => w.id === centerVal);
    if (matchById) return matchById.id;

    const matchByName = appState.warehouses.find(w => w.warehouse_name === centerVal);
    if (matchByName) return matchByName.id;

    return centerVal;
}

// ==========================================================================
// 3. 實體名稱解析核心 (接軌 EntityResolver)
// ==========================================================================
function getPartnerResolvedName(partnerId, displayMode = 1) {
    return EntityResolver.partner(partnerId, appState.partners, appState.persons, displayMode);
}

function getWarehouseDisplayName(whId, displayMode = 1) {
    return EntityResolver.warehouse(whId, appState.warehouses, displayMode);
}

// ==========================================================================
// 4. 生命週期與資料載入引擎 (跨試算表物理順序讀取)
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
    return (parsed.data || []).slice(1);
}

/**
 * 資料讀取與同步中樞
 */
async function fetchAllGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i> 正在讀取雲端資料庫...', '載入中...');

    try {
        const [rawWarehouses, rawInbounds, rawInboundItems, rawPersons, rawPartners, rawProducts] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '據點倉儲').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '進貨主檔').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsi, '進貨明細').catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_CONFIG.sheetPsn, '個人主檔').catch(() => []),
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
        AppLoading.hide();
    }
}

/**
 * 嚴格依 0-Based 物理欄位順序解析各工作表資料
 */
function parseAllData(data) {
    // 1. 據點倉儲 (表 301)
    appState.warehouses = (data.rawWarehouses || []).map(r => ({
        id: getVal(r, 0),
        warehouse_name: getVal(r, 1),
        warehouse_type: getVal(r, 2, '官方營運中心'),
        country_code: getVal(r, 3, 'TW'),
        is_active: getVal(r, 9, 'Y')
    })).filter(w => w.id !== '' && (w.is_active === 'Y' || w.is_active === 'TRUE' || w.is_active === true));

    // 2. 個人主檔 (表 201)
    appState.persons = (data.rawPersons || []).map(r => ({
        person_id: getVal(r, 0),
        name_zh: getVal(r, 1),
        name_en: getVal(r, 2),
        preferred_name: getVal(r, 3),
        display_name: getVal(r, 4)
    })).filter(p => p.person_id !== '');

    // 3. 夥伴主檔 (表 202)
    appState.partners = (data.rawPartners || []).map(r => ({
        partner_id: getVal(r, 0),
        person_id: getVal(r, 1),
        member_no: getVal(r, 2),
        name_zh: getVal(r, 4)
    })).filter(p => p.partner_id !== '');

    // 4. 產品主檔 (表 101，對齊雙軌包裝 Schema)
    appState.products = (data.rawProducts || []).map(r => {
        const isNewSchema = r.length >= 19;
        return {
            product_code: getVal(r, 0),
            region_code: getVal(r, 1, 'TW'),
            official_product_code: getVal(r, 2) || getVal(r, 0),
            name: getVal(r, 3, '未命名產品'),
            short_name: getVal(r, 4, ''),
            base_unit: isNewSchema ? getVal(r, 12, '盒') : '盒',
            sub_unit: isNewSchema ? getVal(r, 13, '') : '',
            pieces_per_box: isNewSchema ? (parseInt(getVal(r, 14, '1'), 10) || 1) : 1,
            allow_decant: isNewSchema ? (getVal(r, 15, 'Y').toUpperCase() === 'N' ? 'N' : 'Y') : 'Y',
            price: isNewSchema ? (parseFloat(getVal(r, 16, '0')) || 0) : (parseFloat(getVal(r, 11, '0')) || 0),
            currency: isNewSchema ? getVal(r, 17, 'TWD') : 'TWD',
            sv_point: isNewSchema ? (parseFloat(getVal(r, 18, '0')) || 0) : (parseFloat(getVal(r, 13, '0')) || 0)
        };
    }).filter(p => p.product_code !== '');

    // 5. 進貨明細 (表 304: psi_inbound_items，0~22 欄位順序)
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
        unit_sv: parseFloat(getVal(r, 9, '0')) || 0,
        ordered_qty: parseInt(getVal(r, 10, '1'), 10) || 1,
        official_shipped_qty: parseInt(getVal(r, 11, '0'), 10) || 0,
        received_qty: parseInt(getVal(r, 12, '0'), 10) || 0,
        subtotal_amount: parseFloat(getVal(r, 13, '0')) || 0,
        subtotal_sv: parseFloat(getVal(r, 14, '0')) || 0,
        batch_no: getVal(r, 15),
        expiry_date: getVal(r, 16),
        stock_id: getVal(r, 17),
        remarks: getVal(r, 18),
        created_by: getVal(r, 19, 'SYSTEM'),
        created_at: getVal(r, 20),
        modified_by: getVal(r, 21, 'SYSTEM'),
        modified_at: getVal(r, 22)
    })).filter(item => item.id !== '');

    // 6. 進貨主檔 (表 303: psi_inbounds，0~24 欄位順序)
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
        total_sv: parseFloat(getVal(r, 15, '0')) || 0,
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
    renderCharts();
    renderDataTable();
}

function populateFilterOptions() {
    // 頂部全域篩選下拉
    UISelectOptions.warehouse.populate({
        target: '#filterWarehouse',
        warehouses: appState.warehouses,
        placeholder: '全部收貨倉庫',
        displayMode: 1,
        searchable: true
    });

    UISelectOptions.partner.populate({
        target: '#filterPurchaser',
        partners: appState.partners,
        persons: appState.persons,
        placeholder: '全部出資夥伴',
        searchable: true
    });

    UISelectOptions.partner.populate({
        target: '#filterSvOwner',
        partners: appState.partners,
        persons: appState.persons,
        placeholder: '全部掛點人',
        searchable: true
    });

    // Modal 選單
    UISelectOptions.warehouse.populate({
        target: '#fieldWarehouseId',
        warehouses: appState.warehouses,
        placeholder: '-- 請選擇入庫自營倉儲 --',
        dropdownParent: '#inboundModal',
        displayMode: 1,
        searchable: true,
        filterFn: w => {
            const type = String(w.warehouse_type || '').toUpperCase();
            return !type.includes('官方') && !type.includes('OFFICIAL') && w.id !== 'WH-TW-TP' && w.id !== 'WH-TW-KH';
        }
    });

    populateOrderCenterOptions('網路 (TW)');

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
    $('#countAll').text(list.length.toLocaleString());
    $('#countDraft').text(list.filter(d => d.status === '草稿').length.toLocaleString());
    $('#countPickup').text(list.filter(d => d.status === '待自取').length.toLocaleString());
    $('#countTransit').text(list.filter(d => d.status === '運輸中').length.toLocaleString());
    $('#countCompleted').text(list.filter(d => d.status === '已入庫').length.toLocaleString());
    $('#countVoid').text(list.filter(d => d.status === '已取消').length.toLocaleString());
}

function renderKpis() {
    let totalBoxes = 0;
    let totalCost = 0;
    let totalSv = 0;
    let decoupledCount = 0;

    appState.inbounds.forEach(item => {
        if (item.status !== '已取消') {
            totalBoxes = AppCalc.add(totalBoxes, item.total_boxes || 0);
            totalCost = AppCalc.add(totalCost, item.total_cost_amount || 0);
            totalSv = AppCalc.add(totalSv, item.total_sv || 0);
            if (item.purchaser_partner_id && item.sv_owner_partner_id && item.purchaser_partner_id !== item.sv_owner_partner_id) {
                decoupledCount++;
            }
        }
    });

    $('#kpiTotalBoxes').text(totalBoxes.toLocaleString());
    $('#kpiTotalCost').text(formatCurrency(totalCost, 'TWD'));
    $('#kpiTotalSv').text(`${AppCalc.formatSV(totalSv, 'INTERNAL')} SV`);
    $('#kpiDecoupledOrders').text(decoupledCount.toLocaleString());
}

function renderCharts() {
    Object.keys(appState.chartInstances).forEach(k => {
        if (appState.chartInstances[k]) {
            appState.chartInstances[k].destroy();
            appState.chartInstances[k] = null;
        }
    });

    const currentList = getFilteredData().filter(d => d.status !== '已取消');

    // 圖表 1：月度進貨趨勢 (雙軸折線圖)
    const ctxTrend = document.getElementById('chartInboundTrend');
    if (ctxTrend) {
        const monthMap = {};
        currentList.forEach(d => {
            const m = d.performance_month || (d.order_date ? d.order_date.slice(0, 7) : '未分類');
            if (!monthMap[m]) monthMap[m] = { sv: 0, cost: 0 };
            monthMap[m].sv = AppCalc.add(monthMap[m].sv, parseFloat(d.total_sv) || 0);
            monthMap[m].cost = AppCalc.add(monthMap[m].cost, parseFloat(d.total_cost_amount) || 0);
        });

        const labels = Object.keys(monthMap).sort();
        const svData = labels.map(l => monthMap[l].sv);
        const costData = labels.map(l => monthMap[l].cost);

        appState.chartInstances.inboundTrend = new Chart(ctxTrend, {
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
                        borderWidth: 2.5,
                        tension: 0.35,
                        yAxisID: 'y'
                    },
                    {
                        label: '進貨實付支出 (TWD)',
                        data: costData,
                        borderColor: '#34d399',
                        backgroundColor: 'rgba(52, 211, 153, 0.12)',
                        pointBackgroundColor: '#34d399',
                        borderWidth: 2.5,
                        tension: 0.35,
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
                        type: 'linear', position: 'left',
                        title: { display: true, text: '考核 SV', color: '#8b5cf6' },
                        ticks: { color: '#c084fc' },
                        grid: { color: 'rgba(139, 92, 246, 0.12)' }
                    },
                    y1: {
                        type: 'linear', position: 'right',
                        title: { display: true, text: '支出金額 (TWD)', color: '#34d399' },
                        ticks: { color: '#34d399' },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#f5f3ff', font: { size: 11 } } }
                }
            }
        });
    }

    // 圖表 2：出資夥伴採購支出佔比
    const ctxPurchaser = document.getElementById('chartPurchaserShare');
    if (ctxPurchaser) {
        const purchaserMap = {};
        currentList.forEach(d => {
            const name = getPartnerResolvedName(d.purchaser_partner_id);
            const cost = parseFloat(d.total_cost_amount) || 0;
            purchaserMap[name] = AppCalc.add(purchaserMap[name] || 0, cost);
        });

        const pLabels = Object.keys(purchaserMap);
        const pData = pLabels.map(k => purchaserMap[k]);
        const totalPurchaserCost = pData.reduce((sum, v) => AppCalc.add(sum, v), 0);
        const pColors = ['#34d399', '#38bdf8', '#fbbf24', '#c084fc', '#fb7185', '#a855f7'];

        appState.chartInstances.purchaserShare = new Chart(ctxPurchaser, {
            type: 'doughnut',
            data: {
                labels: pLabels.length ? pLabels : ['暫無數據'],
                datasets: [{
                    data: pData.length ? pData : [1],
                    backgroundColor: pData.length ? pColors.slice(0, pLabels.length) : ['#334155'],
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
                            label: ctx => {
                                const val = ctx.parsed || 0;
                                const pct = totalPurchaserCost > 0 ? ((val / totalPurchaserCost) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：NT$ ${val.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 圖表 3：各收貨倉儲盒數佔比
    const ctxWh = document.getElementById('chartWarehouseShare');
    if (ctxWh) {
        const whMap = {};
        currentList.forEach(d => {
            const name = EntityResolver.warehouse(d.warehouse_id, appState.warehouses, 1);
            const boxes = parseInt(d.total_boxes, 10) || 0;
            whMap[name] = AppCalc.add(whMap[name] || 0, boxes);
        });

        const whLabels = Object.keys(whMap);
        const whData = whLabels.map(k => whMap[k]);
        const totalBoxesCount = whData.reduce((sum, v) => AppCalc.add(sum, v), 0);
        const whColors = ['#38bdf8', '#c084fc', '#34d399', '#f97316', '#fb7185'];

        appState.chartInstances.warehouseShare = new Chart(ctxWh, {
            type: 'doughnut',
            data: {
                labels: whLabels.length ? whLabels : ['暫無數據'],
                datasets: [{
                    data: whData.length ? whData : [1],
                    backgroundColor: whData.length ? whColors.slice(0, whLabels.length) : ['#334155'],
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
                            label: ctx => {
                                const val = ctx.parsed || 0;
                                const pct = totalBoxesCount > 0 ? ((val / totalBoxesCount) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：${val.toLocaleString()} 盒 (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 圖表 4：官方訂購中心佔比
    const ctxCenter = document.getElementById('chartCenterShare');
    if (ctxCenter) {
        const centerMap = {};
        currentList.forEach(d => {
            const name = getOrderCenterDisplayName(d.order_center);
            centerMap[name] = (centerMap[name] || 0) + 1;
        });

        const cLabels = Object.keys(centerMap);
        const cData = cLabels.map(k => centerMap[k]);
        const totalCenterOrders = cData.reduce((sum, v) => sum + v, 0);
        const centerPalette = ['#fbbf24', '#38bdf8', '#34d399', '#c084fc', '#f97316', '#ec4899', '#64748b'];

        appState.chartInstances.centerShare = new Chart(ctxCenter, {
            type: 'doughnut',
            data: {
                labels: cLabels.length ? cLabels : ['暫無數據'],
                datasets: [{
                    data: cData.length ? cData : [1],
                    backgroundColor: cData.length ? centerPalette.slice(0, cLabels.length) : ['#334155'],
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
                            label: ctx => {
                                const val = ctx.parsed || 0;
                                const pct = totalCenterOrders > 0 ? ((val / totalCenterOrders) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：${val.toLocaleString()} 筆 (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 圖表 5：進貨狀態結構佔比
    const ctxStatus = document.getElementById('chartStatusShare');
    if (ctxStatus) {
        const statusTypes = ['草稿', '待自取', '運輸中', '已入庫', '已取消'];
        const statusColors = ['#94a3b8', '#38bdf8', '#fbbf24', '#34d399', '#fb7185'];
        const statusCounts = statusTypes.map(st => appState.inbounds.filter(item => item.status === st).length);
        const totalStatusOrders = statusCounts.reduce((sum, v) => sum + v, 0);

        appState.chartInstances.statusShare = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: statusTypes,
                datasets: [{
                    data: totalStatusOrders > 0 ? statusCounts : [1],
                    backgroundColor: totalStatusOrders > 0 ? statusColors : ['#334155'],
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
                            label: ctx => {
                                const val = ctx.parsed || 0;
                                const pct = totalStatusOrders > 0 ? ((val / totalStatusOrders) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：${val.toLocaleString()} 筆 (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
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
                { data: 'total_boxes', className: 'text-end' },
                { data: 'cost_breakdown', className: 'text-end' },
                { data: 'total_sv', className: 'text-end' },
                { data: 'status', className: 'text-center' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }

    $('#tableSummaryInfo').text(`顯示 ${formattedRows.length} / ${appState.inbounds.length} 筆`);
}

function getFilteredData() {
    const f = appState.filters;

    return appState.inbounds.filter(item => {
        const matchPipeline = (appState.activePipelineFilter === 'ALL') || (item.status === appState.activePipelineFilter);
        if (!matchPipeline) return false;

        if (f.startDate && item.order_date && item.order_date < f.startDate) return false;
        if (f.endDate && item.order_date && item.order_date > f.endDate) return false;
        if (f.performanceMonth && item.performance_month !== f.performanceMonth) return false;
        if (f.warehouseId && f.warehouseId !== 'ALL' && item.warehouse_id !== f.warehouseId) return false;
        if (f.purchaserId && f.purchaserId !== 'ALL' && item.purchaser_partner_id !== f.purchaserId) return false;
        if (f.svOwnerId && f.svOwnerId !== 'ALL' && item.sv_owner_partner_id !== f.svOwnerId) return false;

        return true;
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

    const warehouseOnlyName = EntityResolver.warehouse(item.warehouse_id, appState.warehouses, 1);
    const centerDisplayName = getOrderCenterDisplayName(item.order_center);
    const curr = item.currency_code || 'TWD';

    const actionButtons = `
        <div class="d-flex align-items-center justify-content-end gap-1">
            <button class="btn btn-sm btn-outline-info" title="查看詳細資料" onclick="openInboundMasterDetailModal('${item.id}')">
                <i class="fa-solid fa-magnifying-glass"></i>
            </button>
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
                <div class="fw-bold text-info-emphasis">${item.id}</div>
                <div class="text-primary-emphasis small">官方：${item.official_order_no || '-'}</div>
            </div>
        `,
        center_and_warehouse: `
            <div>
                <span class="text-white">${warehouseOnlyName}</span>
                <div class="text-info small mt-1">
                    <i class="fa-solid fa-arrow-down-long me-1"></i> ${centerDisplayName} / <i class="fa-solid fa-truck me-1"></i>${item.delivery_method || '-'}
                </div>
            </div>
        `,
        four_flow: `
            <div>
                <div class="small"><i class="fa-solid fa-credit-card text-secondary me-1"></i> 出資：<span class="text-white fw-bold">${purchaserName}</span></div>
                <div class="small"><i class="fa-solid fa-award text-warning me-1"></i> 掛點：<span class="text-warning fw-bold">${svOwnerName}</span></div>
                ${isDecoupled ? '<span class="badge badge-danger-subtle mt-1">四流分離</span>' : ''}
            </div>
        `,
        order_dates: `
            <div>
                <div class="text-light">${item.order_date || '-'}</div>
                <div class="text-secondary small">驗收：${item.inbound_date || '未入庫'}</div>
            </div>
        `,
        perf_month: `<span class="badge badge-outline-secondary">${item.performance_month || '-'}</span>`,
        total_boxes: `<span class="fw-bold text-white">${item.total_boxes}</span> 盒`,
        cost_breakdown: `
            <div>
                <div class="fw-bold text-yellow">${formatCurrency(item.total_cost_amount, curr)}</div>
                <div class="text-secondary small">品：${formatCurrency(item.product_amount, curr)} | 運雜：${formatCurrency(item.shipping_fee, curr)}</div>
            </div>
        `,
        total_sv: `<span class="text-teal fw-bold">${AppCalc.formatSV(item.total_sv, 'INTERNAL')} SV</span>`,
        status: statusBadge,
        actions: actionButtons
    };
}

// ==========================================================================
// 6. 互動與表單事件管理
// ==========================================================================
function initFormEvents() {
    $('#filterOrderDateStart, #filterOrderDateEnd, #filterPerformanceMonth, #filterWarehouse, #filterPurchaser, #filterSvOwner').on('change input', function () {
        appState.filters.startDate = $('#filterOrderDateStart').val() || '';
        appState.filters.endDate = $('#filterOrderDateEnd').val() || '';
        appState.filters.performanceMonth = $('#filterPerformanceMonth').val() || '';
        appState.filters.warehouseId = $('#filterWarehouse').val() || 'ALL';
        appState.filters.purchaserId = $('#filterPurchaser').val() || 'ALL';
        appState.filters.svOwnerId = $('#filterSvOwner').val() || 'ALL';

        applyFilters();
    });

    $('#inboundViewTabs button[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        const targetId = $(e.target).attr('data-bs-target');
        if (targetId === '#container-orders-view') {
            if (inboundDataTableInstance) {
                setTimeout(() => inboundDataTableInstance.columns.adjust().draw(false), 100);
            }
        } else if (targetId === '#container-charts-view') {
            renderCharts();
        }
    });
}

function filterByPipeline(status, element) {
    appState.activePipelineFilter = status;
    $('.pipeline-stepper .step-node').removeClass('active');
    $(element).addClass('active');
    applyFilters();
}

function applyFilters() {
    renderCounters();
    renderKpis();
    renderDataTable();
    if ($('#container-charts-view').hasClass('active')) {
        renderCharts();
    }
}

/**
 * 母單實付總額試算 (商品金額 + 運費/雜費)
 */
function calculateTotalCost() {
    const rawProduct = parseFloat($('#fieldRawProductAmount').val()) || 0;
    const rawShipping = parseFloat($('#fieldRawShippingFee').val()) || 0;
    const curr = $('#fieldCurrencyCode').val() || 'TWD';

    // 調用 AppCalc 安全加法，消除尾差
    const total = AppCalc.add(rawProduct, rawShipping);

    $('#fieldRawTotalCostAmount').val(total);
    $('#fieldTotalCostAmount').val(formatCurrency(total, curr)).data('raw-amount', total);
}

function openAddModal() {
    $('#modalTitle').html('<i class="fa-solid fa-file-circle-plus text-primary me-1"></i> 新增進貨入庫單據');
    $('#formMode').val('add');
    $('#inboundForm')[0].reset();

    const nextSeq = String(appState.inbounds.length + 1).padStart(4, '0');
    const newId = `INB-${AppDate.toClean8()}-${nextSeq}`;

    $('#fieldId').val(newId);
    $('#fieldOrderCategory').val('本人訂購');
    $('#fieldPerformanceMonth').val(AppDate.now('month'));
    $('#fieldOrderDate').val(AppDate.now('input'));
    $('#fieldDeliveryMethod').val('運送');

    const defaultCenter = '網路 (TW)';
    $('#fieldOrderCenter').val(defaultCenter).trigger('change.select2');
    syncCurrencyAndDeliveryByCenter(defaultCenter);

    const firstPrivateWh = appState.warehouses.find(w => {
        const type = String(w.warehouse_type || '').toUpperCase();
        return !type.includes('官方') && !type.includes('OFFICIAL') && w.id !== 'WH-TW-TP' && w.id !== 'WH-TW-KH';
    });
    $('#fieldWarehouseId').val(firstPrivateWh ? firstPrivateWh.id : '').trigger('change.select2');

    // 格式化唯讀財務欄位重置
    const defaultCurr = 'TWD';
    $('#fieldRawProductAmount').val(0);
    $('#fieldProductAmount').val(formatCurrency(0, defaultCurr)).data('raw-amount', 0);

    $('#fieldRawShippingFee').val(0);
    $('#fieldShippingFee').val(formatCurrency(0, defaultCurr)).data('raw-amount', 0);

    $('#fieldRawTotalCostAmount').val(0);
    $('#fieldTotalCostAmount').val(formatCurrency(0, defaultCurr)).data('raw-amount', 0);

    $('#fieldTotalBoxes').val('0');

    // 考核總 SV 採用精密計算格式
    $('#fieldRawTotalSv').val(0);
    $('#fieldTotalSv').val('0 SV');

    new bootstrap.Modal(document.getElementById('inboundModal')).show();
}

function openEditModal(orderId) {
    const item = appState.inbounds.find(d => d.id === orderId);
    if (!item) return;

    $('#modalTitle').html('<i class="fa-solid fa-pen-to-square text-primary me-1"></i> 編輯進貨單據');
    $('#formMode').val('edit');

    $('#fieldId').val(item.id);
    $('#fieldOfficialOrderNo').val(item.official_order_no);
    $('#fieldOrderCategory').val(item.order_category);
    $('#fieldPerformanceMonth').val(AppDate.toInputMonth(item.performance_month));
    $('#fieldOrderDate').val(AppDate.toInput(item.order_date));

    const targetCenterId = normalizeOrderCenterId(item.order_center);
    $('#fieldOrderCenter').val(targetCenterId).trigger('change.select2');
    syncCurrencyAndDeliveryByCenter(targetCenterId);
    $('#fieldDeliveryMethod').val(item.delivery_method);

    $('#fieldWarehouseId').val(item.warehouse_id).trigger('change.select2');
    $('#fieldPurchaserPartnerId').val(item.purchaser_partner_id).trigger('change.select2');
    $('#fieldSvOwnerPartnerId').val(item.sv_owner_partner_id).trigger('change.select2');

    $('#fieldInboundDate').val(item.inbound_date ? AppDate.toInput(item.inbound_date) : '');
    $('#fieldOfficialShippingNo').val(item.official_shipping_no);
    $('#fieldShippingDate').val(item.shipping_date ? AppDate.toInput(item.shipping_date) : '');
    $('#fieldStatus').val(item.status);

    const curr = item.currency_code || 'TWD';

    // 依明細即時重核算商品小計與非商品運雜費
    const matchedItems = appState.inboundItems.filter(it => it.inbound_id === orderId);
    let prodAmt = 0;
    let feeAmt = 0;
    let totalBoxes = 0;
    let totalSv = 0;

    if (matchedItems.length > 0) {
        matchedItems.forEach(it => {
            const amt = parseFloat(it.subtotal_amount) || 0;
            const qty = parseInt(it.ordered_qty, 10) || 0;
            const sv = parseFloat(it.subtotal_sv) || 0;

            if (it.is_fee_item === 'Y') {
                feeAmt = AppCalc.add(feeAmt, amt);
            } else {
                prodAmt = AppCalc.add(prodAmt, amt);
                totalBoxes = AppCalc.add(totalBoxes, qty);
                totalSv = AppCalc.add(totalSv, sv);
            }
        });
    } else {
        prodAmt = parseFloat(item.product_amount) || 0;
        feeAmt = parseFloat(item.shipping_fee) || 0;
        totalBoxes = item.total_boxes || 0;
        totalSv = parseFloat(item.total_sv) || 0;
    }

    const totalCostAmt = AppCalc.add(prodAmt, feeAmt);

    // 格式化反顯純商品金額、運雜費與實付總額
    $('#fieldRawProductAmount').val(prodAmt);
    $('#fieldProductAmount').val(formatCurrency(prodAmt, curr)).data('raw-amount', prodAmt);

    $('#fieldRawShippingFee').val(feeAmt);
    $('#fieldShippingFee').val(formatCurrency(feeAmt, curr)).data('raw-amount', feeAmt);

    $('#fieldRawTotalCostAmount').val(totalCostAmt);
    $('#fieldTotalCostAmount').val(formatCurrency(totalCostAmt, curr)).data('raw-amount', totalCostAmt);

    $('#fieldTotalBoxes').val(totalBoxes);

    // 考核總 SV 採用精密計算格式化反顯
    $('#fieldRawTotalSv').val(totalSv);
    $('#fieldTotalSv').val(`${AppCalc.formatSV(totalSv, 'INTERNAL')} SV`);

    $('#fieldRemarks').val(item.remarks || '');

    new bootstrap.Modal(document.getElementById('inboundModal')).show();
}

function openDetailModal(orderId) {
    const item = appState.inbounds.find(d => d.id === orderId);
    if (!item) return;

    currentDetailOrderId = orderId;
    closeInlineItemForm();

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
    $('#btnSaveAllInboundItems').prop('disabled', isLocked).toggleClass('opacity-50', isLocked);

    populateLinkedProductOptions(item.order_center);

    // 深拷貝至前端暫存區
    const matchedItems = appState.inboundItems.filter(it => it.inbound_id === orderId);
    stagingInboundItems = JSON.parse(JSON.stringify(matchedItems));
    originalInboundItemIds = matchedItems.map(it => it.id);
    deletedInboundItemIds = [];

    renderInboundItemsTableFromStaging(isLocked);
    new bootstrap.Modal(document.getElementById('inboundDetailModal')).show();
}

/**
 * 依據暫存陣列渲染明細列表與核算統計數值
 */
function renderInboundItemsTableFromStaging(isLocked) {
    const parentOrder = appState.inbounds.find(d => d.id === currentDetailOrderId);
    const curr = (parentOrder && parentOrder.currency_code === 'MYR') ? 'MYR' : 'TWD';
    const currSym = curr === 'MYR' ? 'RM ' : 'NT$ ';
    const $tbody = $('#inboundItemsTableBody').empty();

    let sumOrdered = 0;
    let sumReceived = 0;
    let sumAmount = 0;
    let sumSv = 0;

    if (stagingInboundItems.length === 0) {
        $tbody.append('<tr><td colspan="13" class="text-center text-secondary py-3">本單據暫無細項明細數據（尚未儲存）</td></tr>');
    } else {
        stagingInboundItems.forEach(it => {
            sumOrdered = AppCalc.add(sumOrdered, parseInt(it.ordered_qty, 10) || 0);
            sumReceived = AppCalc.add(sumReceived, parseInt(it.received_qty, 10) || 0);
            sumAmount = AppCalc.add(sumAmount, parseFloat(it.subtotal_amount) || 0);
            sumSv = AppCalc.add(sumSv, parseFloat(it.subtotal_sv) || 0);

            const editBtnDisabled = isLocked ? 'disabled' : '';
            const delBtnDisabled = isLocked ? 'disabled' : '';

            const stockBadge = it.stock_id 
                ? `<span class="badge badge-purple-subtle font-monospace"><i class="fa-solid fa-boxes-stacked text-primary me-1"></i>${it.stock_id}</span>`
                : '<span class="text-secondary small">未入庫</span>';

            $tbody.append(`
                <tr>
                    <td class="text-secondary">${it.item_seq}</td>
                    <td>
                        <div class="fw-bold text-white">${it.product_name_snapshot || '-'}</div>
                        <div class="text-secondary small font-monospace">${it.official_product_code || '-'}</div>
                    </td>
                    <td>${UIBadges.psi.feeItem(it.is_fee_item)}</td>
                    <td>${formatCurrency(it.unit_cost, curr)}</td>
                    <td class="text-warning">${AppCalc.formatSV(it.unit_sv, 'INTERNAL')} SV</td>
                    <td>${it.ordered_qty}</td>
                    <td>${it.official_shipped_qty || 0}</td>
                    <td class="text-success fw-bold">${it.received_qty || 0}</td>
                    <td class="text-success">${formatCurrency(it.subtotal_amount, curr)}</td>
                    <td class="text-warning">${AppCalc.formatSV(it.subtotal_sv, 'INTERNAL')} SV</td>
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

    $('#sumItemCount').text(stagingInboundItems.length);
    $('#sumOrderedQty').text(sumOrdered);
    $('#sumReceivedQty').text(sumReceived);
    $('#sumCurrencySymbol').text(currSym.trim());
    $('#sumTotalAmount').text(sumAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
    $('#sumTotalSv').text(AppCalc.formatSV(sumSv, 'INTERNAL'));
}

// ==========================================================================
// 7. 明細暫存池 (In-Memory Staging) 操作模組 (保證不即時發送網路請求)
// ==========================================================================

function toggleInlineItemForm() {
    const $collapse = $('#itemInlineFormCollapse');
    if ($collapse.hasClass('show')) {
        closeInlineItemForm();
    } else {
        openInlineAddForm();
    }
}

function openInlineAddForm() {
    $('#inlineFormTitle').html('<i class="fa-solid fa-plus text-primary me-1"></i> 新增明細項目');
    $('#inlineItemId').val('');
    $('#inlineItemForm')[0].reset();

    const parentOrder = appState.inbounds.find(d => d.id === currentDetailOrderId);
    const curr = parentOrder ? (parentOrder.currency_code || 'TWD') : 'TWD';

    $('#inlineFieldProduct').val('').trigger('change.select2');

    // ★ 初始化唯讀文字格式與隱藏純數值
    $('#inlineFieldRawUnitCost').val(0);
    $('#inlineFieldUnitCost').val(formatCurrency(0, curr)).prop('readonly', true);

    $('#inlineFieldRawUnitSv').val(0);
    $('#inlineFieldUnitSv').val('0 SV').prop('readonly', true);

    $('#inlineFieldBatchNo').val('').prop('readonly', false).attr('placeholder', '外盒鋼印批號');
    $('#inlineFieldExpiryDate').val('').prop('readonly', false);

    $('#inlineFieldOrderedQty').val(1);
    $('#inlineFieldReceivedQty').val(1);
    $('#itemInlineFormCollapse').collapse('show');
}

function closeInlineItemForm() {
    $('#itemInlineFormCollapse').collapse('hide');
    $('#inlineItemId').val('');
    $('#inlineFieldProduct').val('').trigger('change.select2');
}

function editInlineItem(itemId) {
    const item = stagingInboundItems.find(it => it.id === itemId);
    if (!item) {
        AppToast.warning("找不到該筆暫存明細資料！");
        return;
    }

    const parentOrder = appState.inbounds.find(d => d.id === currentDetailOrderId);
    const curr = parentOrder ? (parentOrder.currency_code || 'TWD') : 'TWD';

    $('#inlineFormTitle').html(`<i class="fa-solid fa-pen-to-square text-primary me-1"></i> 編輯明細項目【項次 ${item.item_seq}】`);
    $('#inlineItemId').val(item.id);

    const isFee = item.is_fee_item === 'Y';
    let targetCode = item.product_id;
    if (isFee) {
        if (item.official_product_code === 'A13' || item.official_product_code === 'FEE_A13') {
            targetCode = 'FEE_A13';
        } else if (item.official_product_code.startsWith('FEE_')) {
            targetCode = item.official_product_code;
        } else {
            targetCode = `FEE_${item.official_product_code}`;
        }
    }
    $('#inlineFieldProduct').val(targetCode).trigger('change.select2');
    $('#inlineFieldIsFee').val(item.is_fee_item);

    // ★ 反顯進貨單價與單件 SV (不可修改)
    const costVal = parseFloat(item.unit_cost) || 0;
    const svVal = parseFloat(item.unit_sv) || 0;

    $('#inlineFieldRawUnitCost').val(costVal);
    $('#inlineFieldUnitCost').val(formatCurrency(costVal, curr)).prop('readonly', true);

    $('#inlineFieldRawUnitSv').val(svVal);
    $('#inlineFieldUnitSv').val(`${AppCalc.formatSV(svVal, 'INTERNAL')} SV`).prop('readonly', true);

    $('#inlineFieldOrderedQty').val(item.ordered_qty);
    $('#inlineFieldReceivedQty').val(item.received_qty);

    if (isFee) {
        $('#inlineFieldBatchNo').val('').prop('readonly', true).attr('placeholder', '非實體商品無批號');
        $('#inlineFieldExpiryDate').val('').prop('readonly', true);
    } else {
        $('#inlineFieldBatchNo').val(item.batch_no || '').prop('readonly', false).attr('placeholder', '外盒鋼印批號');
        $('#inlineFieldExpiryDate').val(item.expiry_date ? AppDate.toInput(item.expiry_date) : '').prop('readonly', false);
    }

    $('#inlineFieldRemarks').val(item.remarks || '');
    $('#itemInlineFormCollapse').collapse('show');
}

/**
 * 行內明細暫存儲存 (純前端陣列更新，不發送網路請求)
 */
function saveInlineItem() {
    if (!currentDetailOrderId) return;

    const productCode = $('#inlineFieldProduct').val();
    const orderedQty = parseInt($('#inlineFieldOrderedQty').val(), 10) || 0;

    if (!productCode) {
        AppToast.warning("請選擇「產品品項 / 費用項目」！");
        $('#inlineFieldProduct').select2('open');
        return;
    }
    if (orderedQty <= 0) {
        AppToast.warning("「訂購量」必須大於 0！");
        $('#inlineFieldOrderedQty').focus();
        return;
    }

    const itemId = $('#inlineItemId').val().trim();
    const isEdit = Boolean(itemId);
    const isFee = $('#inlineFieldIsFee').val();

    let productName = '';
    let officialCode = productCode;
    let prdId = productCode;

    if (isFee === 'Y') {
        productName = $('#inlineFieldProduct option:selected').text().replace(/^[^\w\u4e00-\u9fa5]+/, '');
        officialCode = productCode.replace('FEE_', '');
        prdId = '';
    } else {
        const prod = appState.products.find(p => p.product_code === productCode);
        productName = prod ? prod.name : productCode;
        officialCode = prod ? (prod.official_product_code || prod.product_code) : productCode;
    }

    // ★ 由隱藏欄位安全提取純數字，避免抓取貨幣符號或 "SV" 字串導致 NaN
    const unitCost = parseFloat($('#inlineFieldRawUnitCost').val()) || 0;
    const unitSv = parseFloat($('#inlineFieldRawUnitSv').val()) || 0;

    const receivedQty = parseInt($('#inlineFieldReceivedQty').val(), 10) || 0;
    const batchNo = $('#inlineFieldBatchNo').val().trim();
    const expiryDate = $('#inlineFieldExpiryDate').val();
    const remarks = $('#inlineFieldRemarks').val().trim();
    const effectiveQty = receivedQty > 0 ? receivedQty : orderedQty;

    // ★ 調用 AppCalc 高精度計算
    const subtotalAmount = AppCalc.multiply(effectiveQty, unitCost, 2);
    const subtotalSv = AppCalc.multiply(effectiveQty, unitSv, 0);

    if (!isEdit) {
        const nextSeq = stagingInboundItems.length > 0 
            ? Math.max(...stagingInboundItems.map(it => it.item_seq)) + 1 
            : 1;
        const newTempId = `${currentDetailOrderId}_TEMP_${Date.now()}_${nextSeq}`;

        stagingInboundItems.push({
            id: newTempId,
            inbound_id: currentDetailOrderId,
            item_seq: nextSeq,
            official_product_code: officialCode,
            product_name_snapshot: productName,
            product_id: prdId,
            is_fee_item: isFee,
            currency_code: 'TWD',
            unit_cost: unitCost,     // 純浮點數
            unit_sv: unitSv,         // 純數值
            ordered_qty: orderedQty,
            official_shipped_qty: orderedQty,
            received_qty: receivedQty,
            subtotal_amount: subtotalAmount,
            subtotal_sv: subtotalSv,
            batch_no: batchNo,
            expiry_date: expiryDate,
            stock_id: '',
            remarks: remarks,
            _isNew: true
        });
        AppToast.info(`已暫存項目【${productName}】（尚未寫入雲端）`);
    } else {
        const target = stagingInboundItems.find(it => it.id === itemId);
        if (target) {
            target.official_product_code = officialCode;
            target.product_name_snapshot = productName;
            target.product_id = prdId;
            target.is_fee_item = isFee;
            target.unit_cost = unitCost;
            target.unit_sv = unitSv;
            target.ordered_qty = orderedQty;
            target.official_shipped_qty = orderedQty;
            target.received_qty = receivedQty;
            target.subtotal_amount = subtotalAmount;
            target.subtotal_sv = subtotalSv;
            target.batch_no = batchNo;
            target.expiry_date = expiryDate;
            target.remarks = remarks;
            target._isModified = true;
            AppToast.info(`已更新暫存項目【${productName}】（尚未寫入雲端）`);
        }
    }

    closeInlineItemForm();
    renderInboundItemsTableFromStaging(false);
}

/**
 * 行內明細暫存刪除 (不發送網路請求)
 */
function deleteInlineItem(itemId) {
    const idx = stagingInboundItems.findIndex(it => it.id === itemId);
    if (idx === -1) return;

    if (!itemId.includes('_TEMP_')) {
        deletedInboundItemIds.push(itemId);
    }
    stagingInboundItems.splice(idx, 1);

    stagingInboundItems.forEach((it, index) => {
        it.item_seq = index + 1;
        it._isModified = true;
    });

    renderInboundItemsTableFromStaging(false);
    AppToast.info("明細已自暫存清單移除（尚未儲存至雲端）");
}

/**
 * 右下角【儲存明細清單變更】：唯一向雲端批次寫入之出入口
 */
async function saveAllInboundItems() {
    if (!currentDetailOrderId) return;
    const parentInbound = appState.inbounds.find(d => d.id === currentDetailOrderId);
    if (!parentInbound) return;

    const $btn = $('#btnSaveAllInboundItems');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i> 正在批次寫入雲端...');
        const currentUser = getCurrentUser();
        const nowStr = AppDate.now('full');

        // 1. 執行刪除
        for (const delId of deletedInboundItemIds) {
            await SheetAdapter.sendRequest('DELETE', '進貨明細', delId, []);
        }

        // 2. 執行新增與更新 (表 304 實體 23 欄)
        for (let i = 0; i < stagingInboundItems.length; i++) {
            const it = stagingInboundItems[i];
            const finalSeq = i + 1;
            let finalItemId = it.id;

            if (it._isNew || it.id.includes('_TEMP_')) {
                finalItemId = `${currentDetailOrderId}_${String(finalSeq).padStart(2, '0')}`;
            }

            const expiryDateVal = it.expiry_date ? AppDate.toSheet(it.expiry_date) : '';

            const rowDataArray = [
                finalItemId,
                currentDetailOrderId,
                finalSeq,
                it.official_product_code,
                it.product_name_snapshot,
                it.product_id,
                it.is_fee_item,
                it.currency_code || 'TWD',
                it.unit_cost,
                it.unit_sv,
                it.ordered_qty,
                it.official_shipped_qty,
                it.received_qty,
                it.subtotal_amount,
                it.subtotal_sv,
                it.batch_no || '',
                expiryDateVal,
                it.stock_id || '',
                it.remarks || '',
                it.created_by || currentUser,
                it.created_at || nowStr,
                currentUser,
                nowStr
            ];

            if (it._isNew || it.id.includes('_TEMP_')) {
                await SheetAdapter.sendRequest('CREATE', '進貨明細', finalItemId, rowDataArray);
            } else if (it._isModified) {
                await SheetAdapter.sendRequest('UPDATE', '進貨明細', finalItemId, rowDataArray);
            }
        }

        // 3. 自動依明細透過 AppCalc 重算母單數值
        let calcProductAmount = 0;
        let calcShippingFee = 0;
        let calcTotalBoxes = 0;
        let calcTotalSv = 0;

        stagingInboundItems.forEach(it => {
            const qty = parseInt(it.ordered_qty, 10) || 0;
            const amt = parseFloat(it.subtotal_amount) || 0;
            const sv = parseFloat(it.subtotal_sv) || 0;

            if (it.is_fee_item === 'Y') {
                calcShippingFee = AppCalc.add(calcShippingFee, amt);
            } else {
                calcProductAmount = AppCalc.add(calcProductAmount, amt);
                calcTotalBoxes = AppCalc.add(calcTotalBoxes, qty);
                calcTotalSv = AppCalc.add(calcTotalSv, sv);
            }
        });

        const calcTotalCost = AppCalc.add(calcProductAmount, calcShippingFee);

        parentInbound.product_amount = calcProductAmount;
        parentInbound.shipping_fee = calcShippingFee;
        parentInbound.total_cost_amount = calcTotalCost;
        parentInbound.total_boxes = calcTotalBoxes;
        parentInbound.total_sv = calcTotalSv;
        parentInbound.modified_by = currentUser;
        parentInbound.modified_at = nowStr;

        // 回寫表 303 進貨主檔 (0~24 實體欄位)
        const parentRowData = [
            parentInbound.id,
            parentInbound.official_order_no,
            parentInbound.order_category,
            parentInbound.order_center,
            parentInbound.performance_month,
            parentInbound.order_date,
            parentInbound.delivery_method,
            parentInbound.warehouse_id,
            parentInbound.purchaser_partner_id,
            parentInbound.sv_owner_partner_id,
            parentInbound.inbound_date,
            parentInbound.currency_code,
            parentInbound.product_amount,
            parentInbound.shipping_fee,
            parentInbound.total_cost_amount,
            parentInbound.total_sv,
            parentInbound.total_boxes,
            parentInbound.official_shipping_no,
            parentInbound.shipping_date,
            parentInbound.status,
            parentInbound.remarks,
            parentInbound.created_by,
            parentInbound.created_at,
            parentInbound.modified_by,
            parentInbound.modified_at
        ];

        await SheetAdapter.sendRequest('UPDATE', '進貨主檔', parentInbound.id, parentRowData);

        await fetchAllGoogleSheetsData();
        bootstrap.Modal.getInstance(document.getElementById('inboundDetailModal')).hide();
        AppToast.success(`進貨單【${currentDetailOrderId}】全體明細已一次性同步儲存完成！`);
    } catch (err) {
        console.error("批次儲存明細失敗:", err);
        AppToast.error("批次儲存明細失敗：" + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i> 儲存明細清單變更');
    }
}

// ==========================================================================
// 8. 產品與費用選單關聯 (對齊 psi-outbound 規範)
// ==========================================================================

function populateLinkedProductOptions(orderCenter) {
    const parentOrder = appState.inbounds.find(d => d.id === currentDetailOrderId);
    const isMalaysia = String(orderCenter || (parentOrder ? parentOrder.currency_code : '')).includes('(MY)') || 
                       String(orderCenter || '').includes('吉隆坡');
    const targetRegion = isMalaysia ? 'MY' : 'TW';

    const $select = $('#inlineFieldProduct').empty().append('<option value="">-- 請選擇產品品項或費用項目 --</option>');

    // 1. 獨立運費與勞務雜費項目群組 (is_fee_item = 'Y')
    const feeItems = [
        { code: 'FEE_A13', name: '官方物流運費 (A13)', price: 150 },
        { code: 'FEE_PKG', name: '特殊包材與保冷費', price: 50 },
        { code: 'FEE_DLV', name: '同城 Grab 急件快遞費', price: 200 },
        { code: 'FEE_OTH', name: '其他自訂勞務雜費', price: 0 }
    ];
    const $feeGroup = $('<optgroup label="🚚 官方運費與勞務雜費項目"></optgroup>');
    feeItems.forEach(f => {
        $feeGroup.append(`<option value="${f.code}" data-fee="Y" data-name="${f.name}" data-price="${f.price}" data-sv="0">${f.name}</option>`);
    });
    $select.append($feeGroup);

    // 2. 官方實體商品分組 (is_fee_item = 'N')
    const filteredProducts = appState.products.filter(p => (p.region_code || 'TW').toUpperCase() === targetRegion);
    const groupLabel = isMalaysia ? '🇲🇾 馬來西亞市場實體產品' : '📦 台灣市場官方實體商品品項';
    const $prodGroup = $(`<optgroup label="${groupLabel}"></optgroup>`);
    filteredProducts.forEach(p => {
        $prodGroup.append(`<option value="${p.product_code}" data-fee="N" data-name="${p.name}" data-price="${p.price}" data-sv="${p.sv_point}">📦 ${p.name} [${p.product_code}]</option>`);
    });
    $select.append($prodGroup);

    if ($.fn.select2) {
        if ($select.hasClass('select2-hidden-accessible')) {
            $select.select2('destroy');
        }
        $select.select2({
            width: '100%',
            dropdownParent: $('#inboundDetailModal'),
            placeholder: '-- 請選擇產品品項或費用項目 --'
        });
    }

    $select.off('select2:select.inboundItemSync change.inboundItemSync').on('select2:select.inboundItemSync change.inboundItemSync', function () {
        onInlineProductSelectChange();
    });
}

/**
 * 品項選定連動：鎖定進貨單價與 SV，推算並開放編輯批號與效期
 */
function onInlineProductSelectChange() {
    const productCode = $('#inlineFieldProduct').val();
    if (!productCode) return;

    const $opt = $('#inlineFieldProduct option:selected');
    const isFee = $opt.data('fee') === 'Y';
    const parentOrder = appState.inbounds.find(d => d.id === currentDetailOrderId);
    const curr = parentOrder ? (parentOrder.currency_code || 'TWD') : 'TWD';

    const orderDateStr = (parentOrder && parentOrder.order_date) ? parentOrder.order_date : AppDate.now('input');

    if (isFee) {
        // 費用項目：無批號與效期，單件 SV 固定為 0
        $('#inlineFieldIsFee').val('Y');
        const feePrice = parseFloat($opt.data('price')) || 0;

        // ★ 進貨單價格式化 (顯示 NT$ 150 或 RM 0)
        $('#inlineFieldRawUnitCost').val(feePrice);
        $('#inlineFieldUnitCost').val(formatCurrency(feePrice, curr)).prop('readonly', true);

        // ★ 單件 SV 格式化 (顯示 0 SV)
        $('#inlineFieldRawUnitSv').val(0);
        $('#inlineFieldUnitSv').val('0 SV').prop('readonly', true);

        $('#inlineFieldBatchNo').val('').prop('readonly', true).attr('placeholder', '非實體商品無批號');
        $('#inlineFieldExpiryDate').val('').prop('readonly', true);
    } else {
        // 實體商品：自動帶出官方經理進貨成本與考核 SV (不可修改)
        $('#inlineFieldIsFee').val('N');
        const prod = appState.products.find(p => p.product_code === productCode);
        const unitCost = prod ? (parseFloat(prod.price) || 0) : (parseFloat($opt.data('price')) || 0);
        const unitSv = prod ? (parseFloat(prod.sv_point) || 0) : (parseFloat($opt.data('sv')) || 0);

        // ★ 1. 進貨單價：顯示 NT$ 2,100 或 RM 150 格式 (不可修改)
        $('#inlineFieldRawUnitCost').val(unitCost);
        $('#inlineFieldUnitCost').val(formatCurrency(unitCost, curr)).prop('readonly', true);

        // ★ 2. 單件 SV：採用 AppCalc.formatSV 精密格式化 (type="text")
        $('#inlineFieldRawUnitSv').val(unitSv);
        $('#inlineFieldUnitSv').val(`${AppCalc.formatSV(unitSv, 'INTERNAL')} SV`).prop('readonly', true);

        // 3. 生產批號（可修改：自動預填建議批號 LOT+年月+A）
        const defaultBatch = `LOT${AppDate.toClean6(orderDateStr)}A`;
        $('#inlineFieldBatchNo').val(defaultBatch).prop('readonly', false).attr('placeholder', '外盒鋼印批號');

        // 4. 有效日期（可修改：預設自動推算 2 年效期）
        const p = AppDate.parse(orderDateStr) || AppDate.parse(new Date());
        const expYear = parseInt(p.year, 10) + 2;
        const defaultExpiry = `${expYear}-${p.month || '01'}-${p.day || '01'}`;
        $('#inlineFieldExpiryDate').val(AppDate.toInput(defaultExpiry)).prop('readonly', false);
    }
}

// ==========================================================================
// 9. 訂購中心選單與連動
// ==========================================================================

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
            id: wh.id,
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

    $('#fieldOrderCenter').off('select2:select.centerSync').on('select2:select.centerSync', function () {
        syncCurrencyAndDeliveryByCenter($(this).val());
    });
}

function syncCurrencyAndDeliveryByCenter(centerVal) {
    const val = String(centerVal || '');
    const isMalaysia = val.includes('(MY)') || val.includes('吉隆坡') || val.includes('大馬');
    const curr = isMalaysia ? 'MYR' : 'TWD';

    $('#fieldCurrencyCode').val(curr);

    if (val.startsWith('網路')) {
        $('#fieldDeliveryMethod').val('運送');
    } else {
        $('#fieldDeliveryMethod').val('自取');
    }

    const prodAmt = parseFloat($('#fieldRawProductAmount').val()) || 0;
    const feeAmt = parseFloat($('#fieldRawShippingFee').val()) || 0;

    $('#fieldProductAmount').val(formatCurrency(prodAmt, curr));
    $('#fieldShippingFee').val(formatCurrency(feeAmt, curr));
    calculateTotalCost();
}

// ==========================================================================
// 10. 進貨主檔 C/R/U/D 與覆核操作
// ==========================================================================

async function saveInboundItem() {
    const mode = $('#formMode').val();
    const orderId = $('#fieldId').val().trim();
    const orderCenter = $('#fieldOrderCenter').val();
    const whId = $('#fieldWarehouseId').val();
    const perfMonth = $('#fieldPerformanceMonth').val();
    const orderDate = $('#fieldOrderDate').val();
    const purchaserId = $('#fieldPurchaserPartnerId').val();
    const svOwnerId = $('#fieldSvOwnerPartnerId').val();

    if (!orderId) {
        AppToast.warning("進貨單號不可為空！");
        return;
    }
    if (!orderCenter) {
        AppToast.warning("請選擇「官方訂購中心」！");
        $('#fieldOrderCenter').focus();
        return;
    }
    if (!whId) {
        AppToast.warning("請選擇「入庫實體據點」！");
        $('#fieldWarehouseId').focus();
        return;
    }
    if (!perfMonth) {
        AppToast.warning("請選擇「業績計入月份」！");
        $('#fieldPerformanceMonth').focus();
        return;
    }
    if (!orderDate) {
        AppToast.warning("請選擇「官方下單訂購日期」！");
        $('#fieldOrderDate').focus();
        return;
    }
    if (!purchaserId) {
        AppToast.warning("請選擇「實際下單出資夥伴」！");
        $('#fieldPurchaserPartnerId').focus();
        return;
    }
    if (!svOwnerId) {
        AppToast.warning("請選擇「業績點數歸屬人」！");
        $('#fieldSvOwnerPartnerId').focus();
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');
    const existing = appState.inbounds.find(d => d.id === orderId);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    const orderDateVal = AppDate.toSheet($('#fieldOrderDate').val());
    const perfMonthVal = AppDate.toYearMonth($('#fieldPerformanceMonth').val(), '-', '');
    const inboundDateVal = $('#fieldInboundDate').val() ? AppDate.toSheet($('#fieldInboundDate').val()) : '';
    const shippingDateVal = $('#fieldShippingDate').val() ? AppDate.toSheet($('#fieldShippingDate').val()) : '';

    const productAmountVal = parseFloat($('#fieldRawProductAmount').val()) || 0;
    const shippingFeeVal = parseFloat($('#fieldRawShippingFee').val()) || 0;
    const totalCostAmountVal = parseFloat($('#fieldRawTotalCostAmount').val()) || 0;
    const totalSvVal = parseFloat($('#fieldRawTotalSv').val()) || 0;

    const rowDataArray = [
        orderId,
        $('#fieldOfficialOrderNo').val().trim(),
        $('#fieldOrderCategory').val(),
        $('#fieldOrderCenter').val(),
        perfMonthVal,
        orderDateVal,
        $('#fieldDeliveryMethod').val(),
        $('#fieldWarehouseId').val(),
        $('#fieldPurchaserPartnerId').val(),
        $('#fieldSvOwnerPartnerId').val(),
        inboundDateVal,
        $('#fieldCurrencyCode').val(),
        productAmountVal,
        shippingFeeVal,
        totalCostAmountVal,
        totalSvVal,
        parseInt($('#fieldTotalBoxes').val(), 10) || 0,
        $('#fieldOfficialShippingNo').val().trim(),
        shippingDateVal,
        $('#fieldStatus').val(),
        $('#fieldRemarks').val().trim(),
        createdBy,
        createdAt,
        currentUser,
        nowStr
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
        product_amount: productAmountVal,
        shipping_fee: shippingFeeVal,
        total_cost_amount: totalCostAmountVal,
        total_sv: totalSvVal,
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
        $btnSave.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i> 寫入中...');

        if (mode === 'add') {
            await SheetAdapter.sendRequest('CREATE', '進貨主檔', orderId, rowDataArray);
            appState.inbounds.unshift(updatedObj);
        } else {
            await SheetAdapter.sendRequest('UPDATE', '進貨主檔', orderId, rowDataArray);
            const idx = appState.inbounds.findIndex(d => d.id === orderId);
            if (idx !== -1) appState.inbounds[idx] = updatedObj;
        }

        await fetchAllGoogleSheetsData();
        bootstrap.Modal.getInstance(document.getElementById('inboundModal')).hide();
        AppToast.success(`進貨單據【${orderId}】儲存成功！`);
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btnSave.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i> 儲存');
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
    const nowStr = AppDate.now('full');
    const todaySheetDate = AppDate.now('sheet');

    item.status = '已入庫';
    item.inbound_date = todaySheetDate;
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
        AppToast.success(`進貨單【${item.id}】已成功刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗：" + err.message);
    }
}

/**
 * 檢視單據詳細資料 Modal
 */
function openInboundMasterDetailModal(orderId) {
    const item = appState.inbounds.find(d => d.id === orderId);
    if (!item) {
        AppToast.warning("找不到該筆進貨單據！");
        return;
    }

    const purchaserName = getPartnerResolvedName(item.purchaser_partner_id);
    const svOwnerName = getPartnerResolvedName(item.sv_owner_partner_id);
    const warehouseName = EntityResolver.warehouse(item.warehouse_id, appState.warehouses, 1);
    const centerDisplayName = getOrderCenterDisplayName(item.order_center);
    const curr = item.currency_code || 'TWD';
    const isDecoupled = item.purchaser_partner_id && item.sv_owner_partner_id && (item.purchaser_partner_id !== item.sv_owner_partner_id);

    const html = `
        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-secondary small">系統進貨單號 (PK)</span>
                <span class="text-info-emphasis fw-bold font-monospace">${item.id}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-secondary small">葡眾官方訂購單號</span>
                <span class="text-white font-monospace">${item.official_order_no || '無官方單號'}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-secondary small">入庫履約狀態</span>
                <div>${UIBadges.psi.inboundStatus(item.status)}</div>
            </div>
            <div class="d-flex justify-content-between align-items-center">
                <span class="text-secondary small">官方訂購類別</span>
                <span class="badge badge-purple-subtle">${item.order_category || '本人訂購'}</span>
            </div>
        </article>

        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-3 d-flex align-items-center gap-2 border-bottom border-secondary border-opacity-25 pb-2">
                <i class="fa-solid fa-arrows-split-up-and-left text-primary me-1"></i> 四流分離與據點調度
            </h6>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">實際出資夥伴</div>
                <div class="col-7 text-white fw-bold text-end">${purchaserName}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">業績掛點歸屬人</div>
                <div class="col-7 text-warning fw-bold text-end">${svOwnerName}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">四流分離判定</div>
                <div class="col-7 text-end">${isDecoupled ? '<span class="badge badge-danger-subtle">已解耦 (出資與點數分離)</span>' : '<span class="badge badge-secondary-subtle">合一</span>'}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">官方訂購中心</div>
                <div class="col-7 text-info text-end">${centerDisplayName}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">入庫實體據點</div>
                <div class="col-7 text-white text-end">${warehouseName}</div>
            </div>
            <div class="row g-2">
                <div class="col-5 text-secondary small">官方交付方式</div>
                <div class="col-7 text-light text-end">${item.delivery_method || '運送'}</div>
            </div>
        </article>

        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-3 d-flex align-items-center gap-2 border-bottom border-secondary border-opacity-25 pb-2">
                <i class="fa-solid fa-calendar-days text-info me-1"></i> 時間期程與物流單號
            </h6>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">下單訂購日期</div>
                <div class="col-7 text-light text-end font-monospace">${item.order_date || '-'}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">業績計入月份</div>
                <div class="col-7 text-end"><span class="badge badge-outline-secondary">${item.performance_month || '-'}</span></div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">官方出貨單號</div>
                <div class="col-7 text-light text-end font-monospace">${item.official_shipping_no || '尚未出貨'}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">官方出貨日期</div>
                <div class="col-7 text-light text-end font-monospace">${item.shipping_date || '-'}</div>
            </div>
            <div class="row g-2">
                <div class="col-5 text-secondary small">實體驗收入庫日</div>
                <div class="col-7 text-success text-end fw-bold font-monospace">${item.inbound_date || '未入庫'}</div>
            </div>
        </article>

        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-3 d-flex align-items-center gap-2 border-bottom border-secondary border-opacity-25 pb-2">
                <i class="fa-solid fa-coins text-warning me-1"></i> 採購財務與考核點數核算
            </h6>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">商品金額小計</div>
                <div class="col-7 text-white text-end">${formatCurrency(item.product_amount, curr)}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">運費/雜費小計</div>
                <div class="col-7 text-white text-end">${formatCurrency(item.shipping_fee, curr)}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">實付總額 (含運雜)</div>
                <div class="col-7 text-success fw-bold text-end fs-6">${formatCurrency(item.total_cost_amount, curr)}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">採購總盒數</div>
                <div class="col-7 text-white fw-bold text-end">${item.total_boxes || 0} 盒</div>
            </div>
            <div class="row g-2">
                <div class="col-5 text-secondary small">官方考核總 SV</div>
                <div class="col-7 text-warning fw-bold text-end fs-6">${AppCalc.formatSV(item.total_sv, 'INTERNAL')} SV</div>
            </div>
        </article>

        <article class="card p-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-2 d-flex align-items-center gap-2">
                <i class="fa-solid fa-comment-dots text-secondary me-1"></i> 單據備註事項
            </h6>
            <div class="text-light small p-2 rounded" style="background: rgba(10, 5, 18, 0.4);">
                ${item.remarks || '未填寫單據備註事項'}
            </div>
            <div class="text-secondary small mt-2 pt-2 border-top border-secondary border-opacity-10 d-flex justify-content-between">
                <span>建立：${item.created_by || 'SYSTEM'} @ ${item.created_at || '-'}</span>
                <span>異動：${item.modified_by || 'SYSTEM'} @ ${item.modified_at || '-'}</span>
            </div>
        </article>
    `;

    $('#inboundMasterDetailBody').html(html);

    $('#btnDetailViewItemsInbound').off('click').on('click', function () {
        const detailModalEl = document.getElementById('modalInboundMasterDetail');
        if (detailModalEl) {
            const inst = bootstrap.Modal.getInstance(detailModalEl);
            if (inst) inst.hide();
        }
        openDetailModal(orderId);
    });

    $('#btnDetailEditInbound').off('click').on('click', function () {
        const detailModalEl = document.getElementById('modalInboundMasterDetail');
        if (detailModalEl) {
            const inst = bootstrap.Modal.getInstance(detailModalEl);
            if (inst) inst.hide();
        }
        openEditModal(orderId);
    });

    new bootstrap.Modal(document.getElementById('modalInboundMasterDetail')).show();
}

/**
 * 匯出 CSV 報表
 */
function exportCsv() {
    const csv = Papa.unparse(appState.inbounds);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psi_inbound_orders_${AppDate.toClean8()}.csv`;
    a.click();
    AppToast.info('已匯出進貨單據 CSV 檔案');
}