// ==========================================================================
// 1. 系統組態與 5 大試算表來源定義
// ==========================================================================
const SPREADSHEET_ID = {
    PSI: APP_CONFIG.SHEETS.PSI,
    ORG: APP_CONFIG.SHEETS.ORG,
    PSN: APP_CONFIG.SHEETS.PSN,
    PRD: APP_CONFIG.SHEETS.PRD,
    CRM: APP_CONFIG.SHEETS.CRM
};

const GAS_DEPLOY_ID = {
    PSI: APP_CONFIG.GAS.PSI
};

const SHEET_NAMES = {
    WAREHOUSES: APP_CONFIG.SHEET_NAMES.PSI.WAREHOUSES,
    STOCKS: APP_CONFIG.SHEET_NAMES.PSI.STOCKS,
    OUTBOUNDS: APP_CONFIG.SHEET_NAMES.PSI.OUTBOUND_ORDERS,
    OUTBOUND_ITEMS: APP_CONFIG.SHEET_NAMES.PSI.OUTBOUND_ITEMS,
    PERSONS: APP_CONFIG.SHEET_NAMES.PSN.PERSON,
    PARTNERS: APP_CONFIG.SHEET_NAMES.ORG.PARTNERS,
    PRODUCTS: APP_CONFIG.SHEET_NAMES.PRD.PRODUCTS,
    CUSTOMERS: APP_CONFIG.SHEET_NAMES.CRM.CUSTOMERS
};

// 系統資料狀態庫 (State Management)
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
    filters: {
        startDate: '',
        endDate: '',
        paymentStatus: 'ALL',
        warehouseId: 'ALL',
        operatorId: 'ALL',
        recipientId: 'ALL'
    }
};

let outboundDataTableInstance = null;
let isInitialized = false;

let currentDetailOrderId = null; // 當前正在檢視/編輯明細的銷貨單號

// 銷貨明細前端暫存資料結構（兩階段提交專用，未按儲存前絕不向雲端發送請求）
let stagingOutboundItems = [];
let deletedOutboundItemIds = [];

// ==========================================================================
// 2. 計量單位動態判定與輔助取值器
// ==========================================================================
/**
 * 原裝 / 整件計量單位動態判定引擎
 */
function isMasterPackUnit(salesUnit, productId, officialProductCode) {
    if (!salesUnit) return false;
    const targetCode = productId || officialProductCode;
    const prod = appState.products.find(p => p.product_code === targetCode || p.official_product_code === targetCode);
    
    // 優先依據產品主檔定義的官方原裝標準計量單位 (base_unit) 比對
    if (prod && prod.base_unit) {
        return salesUnit.trim() === prod.base_unit.trim();
    }
    
    // 兼容性防呆回退清單
    return ['盒', '箱', '組', '罐', '袋', '套', '包'].includes(salesUnit.trim());
}

// ==========================================================================
// 3. 核心實體庫存核銷與預扣鎖定連動中樞 (表 302 psi_stocks 20 欄雙軌更新)
// ==========================================================================
/**
 * 銷貨出庫庫存連動管線 (支援跨批號先進先出扣庫與雙軌預扣解除)
 * @param {string} orderId 銷貨單號
 * @param {'DELIVER'|'HOLD'|'RELEASE_HOLD'|'CANCEL'} actionType 執行動作
 * @param {boolean} forceReleaseHold 是否強制解除先前之 HOLD 預扣
 */
async function syncOutboundOrderToStocks(orderId, actionType, forceReleaseHold = false) {
    const parentOrder = appState.outbounds.find(d => d.id === orderId);
    if (!parentOrder) throw new Error(`找不到銷貨單據【${orderId}】`);

    const items = appState.outboundItems.filter(it => it.outbound_id === orderId);
    if (items.length === 0) return 0;

    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');
    let affectedStockCount = 0;

    for (const it of items) {
        // 費用項目不涉及實體庫存
        if (it.is_fee_item === 'Y') continue;

        let remainingQty = parseInt(it.shipped_qty, 10) || 0;
        if (remainingQty <= 0) continue;

        const isBox = isMasterPackUnit(it.sales_unit, it.product_id, it.official_product_code);
        const shouldRelease = (forceReleaseHold || parentOrder.is_pre_order_hold === 'Y');

        // 取得該據點倉儲符合該品項之在庫批號清單 (依有效日期由近至遠排序以實現 FIFO)
        let candidateStocks = [];
        if (it.stock_id) {
            const specificStock = appState.stocks.find(s => s.id === it.stock_id && s.warehouse_id === parentOrder.warehouse_id);
            if (specificStock) candidateStocks.push(specificStock);
        }
        if (candidateStocks.length === 0) {
            candidateStocks = appState.stocks
                .filter(s => s.product_id === it.product_id && s.warehouse_id === parentOrder.warehouse_id && s.is_locked !== 'Y')
                .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'));
        }

        if (candidateStocks.length === 0) {
            console.warn(`品項【${it.product_name_snapshot}】在倉別【${parentOrder.warehouse_id}】查無在庫批號實體，略過庫存扣減。`);
            continue;
        }

        // 走訪批號進行先進先出多批分拆扣除或預扣
        for (const targetStock of candidateStocks) {
            if (remainingQty <= 0) break;

            if (actionType === 'DELIVER') {
                if (isBox) {
                    const deductBox = Math.min(targetStock.quantity, remainingQty);
                    targetStock.quantity = Math.max(0, AppCalc.sub(targetStock.quantity, deductBox));
                    if (shouldRelease) {
                        targetStock.reserved_qty = Math.max(0, AppCalc.sub(targetStock.reserved_qty, deductBox));
                    }
                    remainingQty = AppCalc.sub(remainingQty, deductBox);
                } else {
                    const deductPiece = Math.min(targetStock.pieces_qty, remainingQty);
                    targetStock.pieces_qty = Math.max(0, AppCalc.sub(targetStock.pieces_qty, deductPiece));
                    if (shouldRelease) {
                        targetStock.reserved_pieces_qty = Math.max(0, AppCalc.sub(targetStock.reserved_pieces_qty || 0, deductPiece));
                    }
                    remainingQty = AppCalc.sub(remainingQty, deductPiece);
                }
            } else if (actionType === 'HOLD') {
                if (isBox) {
                    targetStock.reserved_qty = AppCalc.add(targetStock.reserved_qty, remainingQty);
                } else {
                    targetStock.reserved_pieces_qty = AppCalc.add(targetStock.reserved_pieces_qty || 0, remainingQty);
                }
                remainingQty = 0;
            } else if (actionType === 'RELEASE_HOLD') {
                if (isBox) {
                    const releaseBox = Math.min(targetStock.reserved_qty, remainingQty);
                    targetStock.reserved_qty = Math.max(0, AppCalc.sub(targetStock.reserved_qty, releaseBox));
                    remainingQty = AppCalc.sub(remainingQty, releaseBox);
                } else {
                    const releasePiece = Math.min(targetStock.reserved_pieces_qty || 0, remainingQty);
                    targetStock.reserved_pieces_qty = Math.max(0, AppCalc.sub(targetStock.reserved_pieces_qty || 0, releasePiece));
                    remainingQty = AppCalc.sub(remainingQty, releasePiece);
                }
            } else if (actionType === 'CANCEL') {
                if (parentOrder.fulfillment_status === '已交付') {
                    if (isBox) {
                        targetStock.quantity = AppCalc.add(targetStock.quantity, remainingQty);
                    } else {
                        targetStock.pieces_qty = AppCalc.add(targetStock.pieces_qty, remainingQty);
                    }
                } else if (parentOrder.is_pre_order_hold === 'Y') {
                    if (isBox) {
                        targetStock.reserved_qty = Math.max(0, AppCalc.sub(targetStock.reserved_qty, remainingQty));
                    } else {
                        targetStock.reserved_pieces_qty = Math.max(0, AppCalc.sub(targetStock.reserved_pieces_qty || 0, remainingQty));
                    }
                }
                remainingQty = 0;
            }

            // 動態重算雙軌自由可用量
            targetStock.available_qty = Math.max(0, AppCalc.sub(targetStock.quantity, targetStock.reserved_qty));
            targetStock.available_pieces_qty = Math.max(0, AppCalc.sub(targetStock.pieces_qty, targetStock.reserved_pieces_qty || 0));
            targetStock.modified_by = currentUser;
            targetStock.modified_at = nowStr;

            // 回寫 表 302: psi_stocks（全 20 欄實體物理結構）
            const stockRowData = [
                targetStock.id,                             // 0: id
                targetStock.warehouse_id,                   // 1: warehouse_id
                targetStock.product_id,                     // 2: product_id
                targetStock.batch_no,                       // 3: batch_no
                targetStock.expiry_date,                    // 4: expiry_date
                targetStock.quantity,                       // 5: quantity
                targetStock.pieces_qty,                     // 6: pieces_qty
                targetStock.reserved_qty,                   // 7: reserved_qty
                targetStock.reserved_pieces_qty || 0,       // 8: reserved_pieces_qty
                targetStock.available_qty,                  // 9: available_qty
                targetStock.available_pieces_qty || 0,      // 10: available_pieces_qty
                targetStock.currency_code || 'TWD',         // 11: currency_code
                targetStock.cost_price || 0,                // 12: cost_price
                targetStock.sv_point || 0,                  // 13: sv_point
                targetStock.is_locked || 'N',               // 14: is_locked
                targetStock.remarks || '',                  // 15: remarks
                targetStock.created_by,                     // 16: created_by
                targetStock.created_at,                     // 17: created_at
                currentUser,                                // 18: modified_by
                nowStr                                      // 19: modified_at
            ];

            await SheetAdapter.updateRow(SHEET_NAMES.STOCKS, targetStock.id, stockRowData, GAS_DEPLOY_ID.PSI);
            affectedStockCount++;
        }
    }

    return affectedStockCount;
}

// ==========================================================================
// 4. 生命週期與資料載入引擎 (跨 5 大試算表物理順序讀取)
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(GAS_DEPLOY_ID.PSI);
    }
    await initOutboundApp();
});

async function initOutboundApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindUIEvents();
    await fetchGoogleSheetsData();
}

/**
 * 資料拉取與多表解析引擎
 */
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i>正在讀取雲端資料庫...', '載入中...');

    try {
        const [rawWarehouses, rawOutbounds, rawOutboundItems, rawPersons, rawPartners, rawProducts, rawCustomers, rawStocks] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSI, SHEET_NAMES.WAREHOUSES).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSI, SHEET_NAMES.OUTBOUNDS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSI, SHEET_NAMES.OUTBOUND_ITEMS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSN, SHEET_NAMES.PERSONS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.ORG, SHEET_NAMES.PARTNERS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.PRODUCTS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.CRM, SHEET_NAMES.CUSTOMERS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSI, SHEET_NAMES.STOCKS).catch(() => [])
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
        $('#hudSyncTime').text(AppDate.now('full'));
        AppToast.success(`5 大試算表同步完成 (${appState.outbounds.length} 筆銷貨單據，${appState.stocks.length} 筆庫存批號)`);
    } catch (err) {
        console.error("試算表同步異常:", err);
        AppToast.error("部分試算表連線失敗，請檢查 5 大試算表共用權限");
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

    // 5. 解析產品主檔 (表 101: prd_items - 雙軌包裝架構)
    appState.products = (data.rawProducts || []).map(r => {
        const isNewSchema = r.length >= 19;
        return {
            product_code: getVal(r, 0),
            region_code: getVal(r, 1, 'TW'),
            official_product_code: getVal(r, 0),
            name: getVal(r, 3, '未命名產品'),
            short_name: getVal(r, 4, ''),
            package_spec: getVal(r, 9, ''),
            piece_spec: isNewSchema ? getVal(r, 10, '') : '',
            base_unit: isNewSchema ? getVal(r, 12, '盒') : '盒',
            sub_unit: isNewSchema ? getVal(r, 13, '') : '',
            pieces_per_box: isNewSchema ? (parseInt(getVal(r, 14, '1'), 10) || 1) : 1,
            allow_decant: isNewSchema ? (getVal(r, 15, 'Y').toUpperCase() === 'N' ? 'N' : 'Y') : 'Y',
            price: isNewSchema ? (parseFloat(getVal(r, 16, '0')) || 0) : (parseFloat(getVal(r, 11, '0')) || 0),
            currency: isNewSchema ? getVal(r, 17, 'TWD') : 'TWD',
            sv_point: isNewSchema ? (parseFloat(getVal(r, 18, '0')) || 0) : (parseFloat(getVal(r, 13, '0')) || 0)
        };
    }).filter(p => p.product_code !== '');

    // 6. 解析銷貨明細 (表 306: psi_outbound_items，共 28 欄位)
    appState.outboundItems = (data.rawOutboundItems || []).map(r => {
        const hasRatio = r.length >= 28;
        const packRatio = hasRatio ? (parseInt(getVal(r, 9, '1'), 10) || 1) : 1;
        const priceIdx = hasRatio ? 10 : 9;
        const costIdx = hasRatio ? 11 : 10;
        const svIdx = hasRatio ? 12 : 11;
        const ordQtyIdx = hasRatio ? 13 : 12;
        const shipQtyIdx = hasRatio ? 14 : 13;
        const subAmtIdx = hasRatio ? 15 : 14;
        const subCostIdx = hasRatio ? 16 : 15;
        const subProfitIdx = hasRatio ? 17 : 16;
        const subSvIdx = hasRatio ? 18 : 17;
        const batchIdx = hasRatio ? 19 : 18;
        const expIdx = hasRatio ? 20 : 19;
        const stockIdx = hasRatio ? 21 : 20;
        const sampleIdx = hasRatio ? 22 : 21;
        const remarksIdx = hasRatio ? 23 : 22;

        return {
            id: getVal(r, 0),
            outbound_id: getVal(r, 1),
            item_seq: parseInt(getVal(r, 2, '1'), 10) || 1,
            official_product_code: getVal(r, 3),
            product_name_snapshot: getVal(r, 4),
            product_id: getVal(r, 5),
            is_fee_item: getVal(r, 6, 'N'),
            sales_unit: getVal(r, 7, '盒'),
            currency_code: getVal(r, 8, 'TWD'),
            pack_ratio_snapshot: packRatio,
            unit_price: parseFloat(getVal(r, priceIdx, '0')) || 0,
            unit_cost: parseFloat(getVal(r, costIdx, '0')) || 0,
            unit_sv: parseFloat(getVal(r, svIdx, '0')) || 0,
            ordered_qty: parseInt(getVal(r, ordQtyIdx, '1'), 10) || 1,
            shipped_qty: parseInt(getVal(r, shipQtyIdx, '1'), 10) || 1,
            subtotal_amount: parseFloat(getVal(r, subAmtIdx, '0')) || 0,
            subtotal_cost: parseFloat(getVal(r, subCostIdx, '0')) || 0,
            subtotal_profit: parseFloat(getVal(r, subProfitIdx, '0')) || 0,
            subtotal_sv: parseFloat(getVal(r, subSvIdx, '0')) || 0,
            batch_no: getVal(r, batchIdx),
            expiry_date: getVal(r, expIdx),
            stock_id: getVal(r, stockIdx),
            is_sample_demo: getVal(r, sampleIdx, 'N'),
            remarks: getVal(r, remarksIdx),
            created_by: getVal(r, remarksIdx + 1, 'SYSTEM'),
            created_at: getVal(r, remarksIdx + 2),
            modified_by: getVal(r, remarksIdx + 3, 'SYSTEM'),
            modified_at: getVal(r, remarksIdx + 4)
        };
    }).filter(it => it.id !== '');

    // 7. 解析銷貨主檔 (表 305: psi_outbound_orders，標準 35 欄位，無 performance_month)
    appState.outbounds = (data.rawOutbounds || []).map(r => {
        const salesAmt = parseFloat(getVal(r, 14, '0')) || 0;
        const costAmt = parseFloat(getVal(r, 15, '0')) || 0;
        const rawProfit = getVal(r, 16);
        const profitAmt = (rawProfit !== '') ? (parseFloat(rawProfit) || 0) : AppCalc.sub(salesAmt, costAmt);

        return {
            id: getVal(r, 0),
            order_category: getVal(r, 1, '零售客銷售'),
            order_center: getVal(r, 2, ''),
            order_date: getVal(r, 3, ''),
            delivery_method: getVal(r, 4, '面交自取'),
            warehouse_id: getVal(r, 5, ''),
            operator_partner_id: getVal(r, 6, ''),
            recipient_type: getVal(r, 7, '消費者'),
            recipient_customer_id: getVal(r, 8, ''),
            recipient_partner_id: getVal(r, 9, ''),
            outbound_date: getVal(r, 10, ''),
            currency_code: getVal(r, 11, 'TWD'),
            product_amount: parseFloat(getVal(r, 12, '0')) || 0,
            shipping_fee: parseFloat(getVal(r, 13, '0')) || 0,
            total_sales_amount: salesAmt,
            total_cost_amount: costAmt,
            total_profit_amount: profitAmt,
            total_sv: parseFloat(getVal(r, 17, '0')) || 0,
            total_boxes: parseInt(getVal(r, 18, '0'), 10) || 0,
            total_pieces: parseInt(getVal(r, 19, '0'), 10) || 0,
            tracking_no: getVal(r, 20, ''),
            shipping_date: getVal(r, 21, ''),
            recipient_name: getVal(r, 22, '-'),
            recipient_phone: getVal(r, 23, ''),
            shipping_address: getVal(r, 24, ''),
            is_pre_order_hold: getVal(r, 25, 'N').toUpperCase(),
            fulfillment_status: getVal(r, 26, '已交付'),
            payment_status: getVal(r, 27, '已收訖'),
            payment_method: getVal(r, 28, '現金'),
            payment_platform: getVal(r, 29, '現金'),
            remarks: getVal(r, 30, ''),
            created_by: getVal(r, 31, 'SYSTEM'),
            created_at: getVal(r, 32, ''),
            modified_by: getVal(r, 33, 'SYSTEM'),
            modified_at: getVal(r, 34, '')
        };
    }).filter(d => d.id !== '');

    // 8. 解析庫存主檔 (表 302: psi_stocks，全 20 欄位，含雙軌預扣與可用量)
    appState.stocks = (data.rawStocks || []).map(r => ({
        id: getVal(r, 0),
        warehouse_id: getVal(r, 1),
        product_id: getVal(r, 2),
        batch_no: getVal(r, 3),
        expiry_date: getVal(r, 4),
        quantity: parseInt(getVal(r, 5, '0'), 10) || 0,
        pieces_qty: parseInt(getVal(r, 6, '0'), 10) || 0,
        reserved_qty: parseInt(getVal(r, 7, '0'), 10) || 0,
        reserved_pieces_qty: parseInt(getVal(r, 8, '0'), 10) || 0,
        available_qty: parseInt(getVal(r, 9, '0'), 10) || 0,
        available_pieces_qty: parseInt(getVal(r, 10, '0'), 10) || 0,
        currency_code: getVal(r, 11, 'TWD'),
        cost_price: parseFloat(getVal(r, 12, '0')) || 0,
        sv_point: parseFloat(getVal(r, 13, '0')) || 0,
        is_locked: getVal(r, 14, 'N').toUpperCase(),
        remarks: getVal(r, 15, ''),
        created_by: getVal(r, 16, 'SYSTEM'),
        created_at: getVal(r, 17, ''),
        modified_by: getVal(r, 18, 'SYSTEM'),
        modified_at: getVal(r, 19, '')
    })).filter(s => s.id !== '');
}

// ==========================================================================
// 5. 畫面渲染與視圖更新中樞
// ==========================================================================
function refreshAllViews() {
    populateFormOptions();
    renderCounters();
    renderKpis();
    renderCharts();
    renderDataTable();
}

function populateFormOptions() {
    // 1. 出貨倉庫
    const whOptions = [
        { id: 'ALL', name: '全部出貨倉庫' },
        ...appState.warehouses.map(w => ({
            id: w.id,
            name: `${w.warehouse_name || w.name || w.id} [${w.id}]`
        }))
    ];
    UISelectOptions.core.render({
        target: '#filterWarehouse',
        data: whOptions,
        valueKey: 'id',
        textKey: 'name',
        placeholder: '全部出貨倉庫',
        selectedValue: appState.filters.warehouseId || 'ALL',
        searchable: true
    });

    // 2. 開單夥伴
    const operatorOptions = [
        { id: 'ALL', name: '全部開單夥伴' },
        ...appState.partners.map(p => ({
            id: p.partner_id,
            name: `${EntityResolver.partner(p.partner_id, appState.partners, appState.persons, 1)} [${p.partner_id}]`
        }))
    ];
    UISelectOptions.core.render({
        target: '#filterOperator',
        data: operatorOptions,
        valueKey: 'id',
        textKey: 'name',
        placeholder: '全部開單夥伴',
        selectedValue: appState.filters.operatorId || 'ALL',
        searchable: true
    });

    // 3. 收件人（分組且首項為 ALL）
    const recipientOptions = [
        { id: 'ALL', name: '全部收件對象', group: '全部' }
    ];
    appState.customers.forEach(c => {
        recipientOptions.push({
            id: `CUST_${c.customer_id}`,
            name: `👤 客戶：${EntityResolver.customer(c.customer_id, appState.customers, appState.persons, 1)}`,
            group: '顧客 (消費者)'
        });
    });
    appState.partners.forEach(p => {
        recipientOptions.push({
            id: `PTN_${p.partner_id}`,
            name: `🤝 夥伴：${EntityResolver.partner(p.partner_id, appState.partners, appState.persons, 1)}`,
            group: '團隊 (經營者)'
        });
    });

    UISelectOptions.core.render({
        target: '#filterRecipient',
        data: recipientOptions,
        valueKey: 'id',
        textKey: 'name',
        groupKey: 'group',
        grouped: true,
        placeholder: '全部收件對象',
        selectedValue: appState.filters.recipientId || 'ALL',
        searchable: true
    });

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
            displayMode: 1,
            searchable: true,
            filterFn: nonOfficialFilter
        });
    });

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
    $('#countAll').text(list.length.toLocaleString());
    $('#countDraft').text(list.filter(d => d.fulfillment_status === '草稿').length.toLocaleString());
    $('#countPending').text(list.filter(d => d.fulfillment_status === '待取貨').length.toLocaleString());
    $('#countShipped').text(list.filter(d => d.fulfillment_status === '已寄出').length.toLocaleString());
    $('#countHold').text(list.filter(d => d.is_pre_order_hold === 'Y').length.toLocaleString());
    $('#countDelivered').text(list.filter(d => d.fulfillment_status === '已交付').length.toLocaleString());
    $('#countCancelled').text(list.filter(d => d.fulfillment_status === '已取消').length.toLocaleString());
}

function renderKpis() {
    let totalBoxes = 0;
    let totalPieces = 0;
    let totalSales = 0;
    let totalProfit = 0;
    let totalSv = 0;

    appState.outbounds.forEach(item => {
        if (item.fulfillment_status !== '已取消') {
            totalBoxes = AppCalc.add(totalBoxes, item.total_boxes || 0);
            totalPieces = AppCalc.add(totalPieces, item.total_pieces || 0);
            totalSales = AppCalc.add(totalSales, item.total_sales_amount || 0);
            totalProfit = AppCalc.add(totalProfit, item.total_profit_amount || 0);
            totalSv = AppCalc.add(totalSv, item.total_sv || 0);
        }
    });

    $('#kpiTotalBoxes').text(`${totalBoxes.toLocaleString()} 盒 / ${totalPieces.toLocaleString()} 支`);
    $('#kpiTotalSales').text(formatCurrency(totalSales, 'TWD'));
    $('#kpiTotalSv').text(formatSV(totalSv, 'INTERNAL'));
    $('#kpiTotalProfit').text(formatCurrency(totalProfit, 'TWD'));
}

function renderCharts() {
    const currentList = getFilteredData();
    const activeOrders = currentList.filter(d => d.fulfillment_status !== '已取消');

    // ======================================================================
    // 1. 銷貨規模與考核走勢 (雙 Y 軸硬派折線圖：無曲率、不填色、5 的倍數上限)
    // ======================================================================
    const monthMap = {};
    activeOrders.forEach(d => {
        const m = d.order_date ? d.order_date.slice(0, 7) : '未分類';
        if (!monthMap[m]) monthMap[m] = { sales: 0, sv: 0 };
        monthMap[m].sales = AppCalc.add(monthMap[m].sales, parseFloat(d.total_sales_amount) || 0);
        monthMap[m].sv = AppCalc.add(monthMap[m].sv, parseFloat(d.total_sv) || 0);
    });

    const labels = Object.keys(monthMap).sort();
    const salesData = labels.map(l => monthMap[l].sales);
    const svData = labels.map(l => monthMap[l].sv);

    AppChart.render('outboundScaleChart', AppChart.createMultiLine({
        labels: labels.length ? labels : ['無資料'],
        lines: [
            {
                label: '銷貨實收收入 (NT$)',
                data: salesData,
                color: '#8b5cf6',
                yAxisID: 'y',
                tension: 0,
                fill: false
            },
            {
                label: '月度考核出庫 SV',
                data: svData,
                color: '#f59e0b',
                yAxisID: 'y1',
                tension: 0,
                fill: false
            }
        ],
        unit: '',
        useDualAxis: true,
        yLeftTitle: '銷貨實收 (NT$)',
        yRightTitle: '考核 SV'
    }));

    // ======================================================================
    // 2. 實質毛利價差趨勢 (硬派單折線圖：無曲率、不填色、5 的倍數上限)
    // ======================================================================
    const profitMap = {};
    activeOrders.forEach(d => {
        const m = d.order_date ? d.order_date.slice(0, 7) : '未分類';
        profitMap[m] = AppCalc.add(profitMap[m] || 0, parseFloat(d.total_profit_amount) || 0);
    });

    const profitLabels = Object.keys(profitMap).sort();
    AppChart.render('outboundProfitChart', AppChart.createLine({
        labels: profitLabels.length ? profitLabels : ['無資料'],
        data: profitLabels.map(l => profitMap[l]),
        datasetLabel: '毛利價差利潤 (NT$)',
        color: '#34d399',
        tension: 0,
        fill: false,
        unit: 'NT$',
        yAxisTitle: '毛利 (NT$)'
    }));

    // ======================================================================
    // 3. 出資夥伴資金佔比 (甜甜圈環形圖 + 中央 KPI 注入)
    // ======================================================================
    const fundMap = {};
    let totalSalesSum = 0;
    activeOrders.forEach(d => {
        const partnerName = EntityResolver.partner(d.operator_partner_id, appState.partners, appState.persons, 1);
        const amt = parseFloat(d.total_sales_amount) || 0;
        fundMap[partnerName] = AppCalc.add(fundMap[partnerName] || 0, amt);
        totalSalesSum = AppCalc.add(totalSalesSum, amt);
    });

    AppChart.render('chartPurchaserFundShare', AppChart.createDoughnut({
        labels: Object.keys(fundMap),
        data: Object.values(fundMap),
        colors: ['#34d399', '#38bdf8', '#fbbf24', '#c084fc', '#fb7185', '#a855f7'],
        unit: 'NT$',
        centerKpi: { label: '實收總金額', value: `NT$ ${totalSalesSum.toLocaleString()}` }
    }));

    // ======================================================================
    // 4. 銷貨業務類別佔比 (甜甜圈環形圖)
    // ======================================================================
    const catMap = { '零售客銷售': 0, '下線夥伴調度': 0 };
    activeOrders.forEach(d => {
        const cat = d.order_category || '零售客銷售';
        catMap[cat] = (catMap[cat] || 0) + 1;
    });

    AppChart.render('chartCategoryShare', AppChart.createDoughnut({
        labels: Object.keys(catMap),
        data: Object.values(catMap),
        colors: ['#8b5cf6', '#38bdf8'],
        unit: '筆'
    }));

    // ======================================================================
    // 5. 收款狀態佔比 (甜甜圈環形圖)
    // ======================================================================
    const payStatusMap = { '已收訖': 0, '未付款': 0, '部分訂金': 0 };
    currentList.forEach(d => {
        const st = d.payment_status || '已收訖';
        if (payStatusMap[st] !== undefined) payStatusMap[st]++;
    });

    AppChart.render('chartPaymentStatusShare', AppChart.createDoughnut({
        labels: Object.keys(payStatusMap),
        data: Object.values(payStatusMap),
        colors: ['#34d399', '#fb7185', '#fbbf24'],
        unit: '筆'
    }));

    // ======================================================================
    // 6. 付款金流管道佔比 (甜甜圈環形圖)
    // ======================================================================
    const payMap = {};
    activeOrders.forEach(d => {
        const platform = d.payment_platform || d.payment_method || '現金';
        payMap[platform] = (payMap[platform] || 0) + 1;
    });

    AppChart.render('chartPaymentShare', AppChart.createDoughnut({
        labels: Object.keys(payMap),
        data: Object.values(payMap),
        colors: ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185'],
        unit: '筆'
    }));

    // ======================================================================
    // 7. 出貨倉庫盒數佔比 (甜甜圈環形圖)
    // ======================================================================
    const whMap = {};
    activeOrders.forEach(d => {
        const name = EntityResolver.warehouse(d.warehouse_id, appState.warehouses, 1);
        whMap[name] = AppCalc.add(whMap[name] || 0, parseInt(d.total_boxes, 10) || 0);
    });

    AppChart.render('chartWarehouseShare', AppChart.createDoughnut({
        labels: Object.keys(whMap),
        data: Object.values(whMap),
        colors: ['#38bdf8', '#c084fc', '#34d399', '#f97316', '#fb7185'],
        unit: '盒'
    }));

    // ======================================================================
    // 8. 交付管道結構佔比 (甜甜圈環形圖)
    // ======================================================================
    const dlvMap = {};
    activeOrders.forEach(d => {
        const method = d.delivery_method || '面交自取';
        dlvMap[method] = (dlvMap[method] || 0) + 1;
    });

    AppChart.render('chartDeliveryShare', AppChart.createDoughnut({
        labels: Object.keys(dlvMap),
        data: Object.values(dlvMap),
        colors: ['#fbbf24', '#38bdf8', '#34d399', '#c084fc', '#fb7185', '#a855f7'],
        unit: '筆'
    }));

    // ======================================================================
    // 9. 出庫履約狀態佔比 (甜甜圈環形圖 + 中央 KPI 注入)
    // ======================================================================
    const statusTypes = ['草稿', '待取貨', '已寄出', '已交付', '已取消'];
    const statusColors = ['#94a3b8', '#f59e0b', '#38bdf8', '#34d399', '#fb7185'];
    const statusCounts = statusTypes.map(st => currentList.filter(d => d.fulfillment_status === st).length);

    AppChart.render('chartFulfillmentStatusShare', AppChart.createDoughnut({
        labels: statusTypes,
        data: statusCounts,
        colors: statusColors,
        unit: '筆',
        centerKpi: { label: '出庫單總數', value: `${currentList.length.toLocaleString()} 筆` }
    }));

    // ======================================================================
    // 10. 代領預扣鎖定狀態佔比 (甜甜圈環形圖 + 中央 KPI 注入)
    // ======================================================================
    let holdCount = 0;
    let normalCount = 0;

    currentList.forEach(d => {
        if (d.is_pre_order_hold === 'Y') holdCount++;
        else normalCount++;
    });

    AppChart.render('chartHoldStatusShare', AppChart.createDoughnut({
        labels: ['代領預扣鎖定 (HOLD)', '常態現貨流通'],
        data: [holdCount, normalCount],
        colors: ['#f59e0b', '#38bdf8'],
        unit: '筆',
        centerKpi: { label: 'HOLD 鎖定單數', value: `${holdCount.toLocaleString()} 筆` }
    }));
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
                { data: 'payment_status', className: 'text-center' },
                { data: 'quantities', className: 'text-end' },
                { data: 'financials', className: 'text-end' },
                { data: 'sv', className: 'text-end' },
                { data: 'hold', className: 'text-center' },
                { data: 'status', className: 'text-center' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }

    $('#tableSummaryInfo').text(`顯示 ${formattedRows.length} / ${appState.outbounds.length} 筆`);
}

function getFilteredData() {
    const f = appState.filters;

    return appState.outbounds.filter(item => {
        let matchPipeline = true;
        if (appState.activePipelineFilter === 'HOLD') {
            matchPipeline = (item.is_pre_order_hold === 'Y');
        } else if (appState.activePipelineFilter !== 'ALL') {
            matchPipeline = (item.fulfillment_status === appState.activePipelineFilter);
        }
        if (!matchPipeline) return false;

        if (f.startDate && item.order_date && item.order_date < f.startDate) return false;
        if (f.endDate && item.order_date && item.order_date > f.endDate) return false;
        if (f.paymentStatus && f.paymentStatus !== 'ALL' && item.payment_status !== f.paymentStatus) return false;
        if (f.warehouseId && f.warehouseId !== 'ALL' && item.warehouse_id !== f.warehouseId) return false;
        if (f.operatorId && f.operatorId !== 'ALL' && item.operator_partner_id !== f.operatorId) return false;

        if (f.recipientId && f.recipientId !== 'ALL') {
            if (f.recipientId.startsWith('CUST_')) {
                const targetCustId = f.recipientId.replace('CUST_', '');
                if (item.recipient_customer_id !== targetCustId) return false;
            } else if (f.recipientId.startsWith('PTN_')) {
                const targetPtnId = f.recipientId.replace('PTN_', '');
                if (item.recipient_partner_id !== targetPtnId) return false;
            }
        }

        return true;
    });
}

function formatTableRow(item) {
    const statusBadge = UIBadges.psi.outboundStatus(item.fulfillment_status);
    const paymentBadge = UIBadges.psi.outboundPaymentStatus(item.payment_status);
    const holdBadge = UIBadges.psi.preOrderHold(item.is_pre_order_hold, false);

    const recipientResolved = (item.recipient_type === '經營者')
        ? EntityResolver.partner(item.recipient_partner_id, appState.partners, appState.persons, 1) || item.recipient_name
        : EntityResolver.customer(item.recipient_customer_id, appState.customers, appState.persons, 1) || item.recipient_name;

    const operatorResolved = EntityResolver.partner(item.operator_partner_id, appState.partners, appState.persons, 1);

    const curr = item.currency_code || 'TWD';
    const profitSign = item.total_profit_amount >= 0 ? '+' : '';
    const salesText = formatCurrency(item.total_sales_amount, curr);
    const costText = formatCurrency(item.total_cost_amount, curr);
    const profitText = `${profitSign}${formatCurrency(item.total_profit_amount, curr)}`;

    const isDelivered = (item.fulfillment_status === '已交付');
    const isCancelled = (item.fulfillment_status === '已取消');

    const deleteBtnDisabled = isDelivered ? 'disabled title="已交付單據已完成庫存核銷，禁止直接刪除"' : 'title="刪除單據"';
    const editBtnDisabled = isCancelled ? 'disabled title="已取消單據禁止編輯"' : 'title="編輯銷貨單"';

    const warehousePureName = EntityResolver.warehouse(item.warehouse_id, appState.warehouses, 1);
    const orderCenterPureName = EntityResolver.warehouse(item.order_center, appState.warehouses, 1) || item.order_center;

    const actionButtons = `
        <div class="d-flex align-items-center justify-content-end gap-1">
            <button class="btn btn-sm btn-outline-info" title="查看詳細資料" onclick="openOutboundDetailModal('${item.id}')">
                <i class="fa-solid fa-magnifying-glass"></i>
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
                <div class="fw-bold text-info-emphasis">${item.id}</div>
                <span class="badge badge-outline-secondary-subtle">${item.order_category}</span>
            </div>
        `,
        center_and_warehouse: `
            <div>
                <span class="text-white">${warehousePureName}</span>
                <div class="text-info small mt-1">
                    <i class="fa-solid fa-arrow-down-long me-1"></i>${orderCenterPureName} / <i class="fa-solid fa-truck me-1"></i>${item.delivery_method}
                </div>
            </div>
        `,
        parties: `
            <div>
                <div class="small"><i class="fa-solid fa-user-tag text-secondary me-1"></i>收件：<span class="text-white fw-bold">${recipientResolved}</span></div>
                <div class="small"><i class="fa-solid fa-hand-holding-dollar text-warning me-1"></i>開單：<span class="text-warning fw-bold">${operatorResolved}</span></div>
            </div>
        `,
        dates: `
            <div>
                <div class="text-light">${item.order_date || '-'}</div>
                <div class="text-secondary small">交付：${item.outbound_date || '未交付'}</div>
            </div>
        `,
        payment_status: paymentBadge,
        quantities: `
            <div>
                <span class="fw-bold text-white">${item.total_boxes}</span> 盒
                ${item.total_pieces > 0 ? `<div class="text-secondary small">${item.total_pieces} 支/條</div>` : ''}
            </div>
        `,
        financials: `
            <div>
                <div class="fw-bold text-orange">${salesText}</div>
                ${item.total_profit_amount !== 0 ? `
                    <div class="text-secondary small">成本：${costText}</div>
                    <div class="text-secondary small">毛利：${profitText}</div>
                ` : ''}
            </div>
        `,
        sv: `<span class="text-teal fw-bold">${formatSV(item.total_sv, 'INTERNAL')} SV</span>`,
        hold: holdBadge,
        status: statusBadge,
        actions: actionButtons
    };
}

// ==========================================================================
// 6. 互動與表單事件管理
// ==========================================================================
function bindUIEvents() {
    $('#filterOrderDateStart, #filterOrderDateEnd, #filterPaymentStatus').on('change input', function () {
        appState.filters.startDate = $('#filterOrderDateStart').val() || '';
        appState.filters.endDate = $('#filterOrderDateEnd').val() || '';
        appState.filters.paymentStatus = $('#filterPaymentStatus').val() || 'ALL';
        applyFilters();
    });

    $('#filterWarehouse, #filterOperator, #filterRecipient')
        .off('change select2:clear')
        .on('change', function () {
            appState.filters.warehouseId = $('#filterWarehouse').val() || 'ALL';
            appState.filters.operatorId = $('#filterOperator').val() || 'ALL';
            appState.filters.recipientId = $('#filterRecipient').val() || 'ALL';
            applyFilters();
        })
        .on('select2:clear', function () {
            const $this = $(this);
            setTimeout(() => {
                $this.val('ALL').trigger('change');
            }, 0);
        });

    $('#outboundViewTabs button[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        const targetId = $(e.target).attr('data-bs-target');
        if (targetId === '#container-orders-view') {
            if (outboundDataTableInstance) {
                setTimeout(() => outboundDataTableInstance.columns.adjust().draw(false), 100);
            }
        } else if (targetId === '#container-charts-view') {
            renderCharts();
        }
    });

    $('input[name="inlinePackMode"]').on('change', function () {
        onInlineProductSelectChange();
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
    const name = EntityResolver.customer(custId, appState.customers, appState.persons, 1);
    $('#fieldRecipientName').val(name);
}

function autoFillPartnerInfo() {
    const pId = $('#fieldRecipientPartnerId').val();
    if (!pId) return;
    const name = EntityResolver.partner(pId, appState.partners, appState.persons, 1);
    $('#fieldRecipientName').val(name);
}

function calculateFinancials() {
    const rawProd = parseFloat($('#fieldRawProductAmount').val()) || 0;
    const rawShip = parseFloat($('#fieldRawShippingFee').val()) || 0;
    const rawCost = parseFloat($('#fieldRawTotalCostAmount').val()) || 0;
    const curr = $('#fieldCurrencyCode').val() || 'TWD';

    const totalSales = AppCalc.add(rawProd, rawShip);
    const totalProfit = AppCalc.sub(totalSales, rawCost);

    $('#fieldRawTotalSalesAmount').val(totalSales);
    $('#fieldTotalSalesAmount').val(formatCurrency(totalSales, curr));

    $('#fieldRawTotalProfitAmount').val(totalProfit);
    $('#fieldTotalProfitAmount').val(formatCurrency(totalProfit, curr));
}

function openAddOutboundModal() {
    $('#outboundModalTitle').html('<i class="fa-solid fa-file-circle-plus text-primary me-1"></i>開立銷貨出庫單據');
    $('#formMode').val('add');
    $('#outboundForm')[0].reset();

    const nextSeq = String(appState.outbounds.length + 1).padStart(4, '0');
    const newId = `OUT-${AppDate.toClean8()}-${nextSeq}`;

    $('#fieldId').val(newId);
    $('#fieldOrderCategory').val('零售客銷售');
    $('#fieldOrderDate').val(AppDate.now('input'));
    $('#fieldDeliveryMethod').val('面交自取');

    const defaultCurr = 'TWD';
    $('#fieldCurrencyCode').val(defaultCurr).prop('disabled', false);

    $('#fieldTotalBoxes').val(0);
    $('#fieldTotalPieces').val(0);
    
    $('#fieldRawTotalSv').val(0);
    $('#fieldTotalSv').val('0 SV');

    $('#fieldRawProductAmount').val(0);
    $('#fieldProductAmount').val(formatCurrency(0, defaultCurr));

    $('#fieldRawShippingFee').val(0);
    $('#fieldShippingFee').val(formatCurrency(0, defaultCurr));

    $('#fieldRawTotalSalesAmount').val(0);
    $('#fieldTotalSalesAmount').val(formatCurrency(0, defaultCurr));

    $('#fieldRawTotalCostAmount').val(0);
    $('#fieldTotalCostAmount').val(formatCurrency(0, defaultCurr));

    $('#fieldRawTotalProfitAmount').val(0);
    $('#fieldTotalProfitAmount').val(formatCurrency(0, defaultCurr));

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
    $('#fieldOrderDate').val(AppDate.toInput(item.order_date));
    $('#fieldDeliveryMethod').val(item.delivery_method);
    $('#fieldWarehouseId').val(item.warehouse_id).trigger('change');
    $('#fieldOperatorPartnerId').val(item.operator_partner_id).trigger('change');
    $('#fieldRecipientType').val(item.recipient_type);
    toggleRecipientType();

    $('#fieldRecipientCustomerId').val(item.recipient_customer_id).trigger('change');
    $('#fieldRecipientPartnerId').val(item.recipient_partner_id).trigger('change');
    $('#fieldRecipientName').val(item.recipient_name);
    $('#fieldRecipientPhone').val(item.recipient_phone);
    $('#fieldShippingAddress').val(item.shipping_address);

    $('#fieldOutboundDate').val(item.outbound_date ? AppDate.toInput(item.outbound_date) : '');
    $('#fieldShippingDate').val(item.shipping_date ? AppDate.toInput(item.shipping_date) : '');
    $('#fieldTrackingNo').val(item.tracking_no);
    $('#fieldIsPreOrderHold').prop('checked', item.is_pre_order_hold === 'Y');

    const curr = item.currency_code || 'TWD';
    $('#fieldCurrencyCode').val(curr);

    const matchedItems = appState.outboundItems.filter(it => it.outbound_id === id);
    let prodAmt = 0;
    let feeAmt = 0;
    let totalBoxes = 0;
    let totalPieces = 0;
    let costAmt = 0;
    let totalSv = 0;

    if (matchedItems.length > 0) {
        matchedItems.forEach(it => {
            const isBox = isMasterPackUnit(it.sales_unit, it.product_id, it.official_product_code);
            const qty = parseInt(it.shipped_qty, 10) || 0;

            if (it.is_fee_item === 'Y') {
                feeAmt = AppCalc.add(feeAmt, parseFloat(it.subtotal_amount) || 0);
            } else {
                prodAmt = AppCalc.add(prodAmt, parseFloat(it.subtotal_amount) || 0);
                if (isBox) totalBoxes = AppCalc.add(totalBoxes, qty);
                else totalPieces = AppCalc.add(totalPieces, qty);
                costAmt = AppCalc.add(costAmt, parseFloat(it.subtotal_cost) || 0);
                totalSv = AppCalc.add(totalSv, parseFloat(it.subtotal_sv) || 0);
            }
        });
    } else {
        prodAmt = parseFloat(item.product_amount) || 0;
        feeAmt = parseFloat(item.shipping_fee) || 0;
        totalBoxes = item.total_boxes || 0;
        totalPieces = item.total_pieces || 0;
        costAmt = parseFloat(item.total_cost_amount) || 0;
        totalSv = parseFloat(item.total_sv) || 0;
    }

    const totalSales = AppCalc.add(prodAmt, feeAmt);
    const totalProfit = AppCalc.sub(totalSales, costAmt);

    $('#fieldTotalBoxes').val(totalBoxes);
    $('#fieldTotalPieces').val(totalPieces);

    $('#fieldRawTotalSv').val(totalSv);
    $('#fieldTotalSv').val(`${formatSV(totalSv, 'INTERNAL')} SV`);

    $('#fieldRawProductAmount').val(prodAmt);
    $('#fieldProductAmount').val(formatCurrency(prodAmt, curr));

    $('#fieldRawShippingFee').val(feeAmt);
    $('#fieldShippingFee').val(formatCurrency(feeAmt, curr));

    $('#fieldRawTotalSalesAmount').val(totalSales);
    $('#fieldTotalSalesAmount').val(formatCurrency(totalSales, curr));

    $('#fieldRawTotalCostAmount').val(costAmt);
    $('#fieldTotalCostAmount').val(formatCurrency(costAmt, curr));

    $('#fieldRawTotalProfitAmount').val(totalProfit);
    $('#fieldTotalProfitAmount').val(formatCurrency(totalProfit, curr));

    $('#fieldFulfillmentStatus').val(item.fulfillment_status);
    $('#fieldPaymentStatus').val(item.payment_status);
    $('#fieldPaymentMethod').val(item.payment_method);
    $('#fieldPaymentPlatform').val(item.payment_platform);
    $('#fieldRemarks').val(item.remarks || '');

    new bootstrap.Modal(document.getElementById('outboundModal')).show();
}

function openDetailModal(orderId) {
    const item = appState.outbounds.find(d => d.id === orderId);
    if (!item) return;

    currentDetailOrderId = orderId;
    closeInlineItemForm();

    const recipientResolved = (item.recipient_type === '經營者')
        ? EntityResolver.partner(item.recipient_partner_id, appState.partners, appState.persons, 1) || item.recipient_name
        : EntityResolver.customer(item.recipient_customer_id, appState.customers, appState.persons, 1) || item.recipient_name;

    $('#detailModalOutboundId').text(item.id);
    $('#detailModalOrderDate').text(item.order_date || '-');
    $('#detailModalOutboundDate').text(item.outbound_date || '未交付');
    $('#detailModalPaymentBadge').html(UIBadges.psi.outboundPaymentStatus(item.payment_status));
    $('#detailModalRecipient').text(recipientResolved);
    $('#detailModalOperator').text(EntityResolver.partner(item.operator_partner_id, appState.partners, appState.persons, 1));
    $('#detailModalWarehouse').text(EntityResolver.warehouse(item.warehouse_id, appState.warehouses, 1));
    $('#detailModalStatusBadge').html(UIBadges.psi.outboundStatus(item.fulfillment_status));

    const isLocked = (item.fulfillment_status === '已交付' || item.fulfillment_status === '已取消');
    $('#btnToggleAddOutboundItem').prop('disabled', isLocked).toggleClass('opacity-50', isLocked);
    $('#btnSaveAllOutboundItems').prop('disabled', isLocked).toggleClass('opacity-50', isLocked);

    populateInlineProductOptions();

    const matchedItems = appState.outboundItems.filter(it => it.outbound_id === orderId);
    stagingOutboundItems = JSON.parse(JSON.stringify(matchedItems));
    deletedOutboundItemIds = [];

    renderOutboundItemsTableFromStaging(isLocked);
    new bootstrap.Modal(document.getElementById('outboundDetailModal')).show();
}

function renderOutboundItemsTableFromStaging(isLocked) {
    const parentOrder = appState.outbounds.find(d => d.id === currentDetailOrderId);
    const curr = parentOrder ? (parentOrder.currency_code || 'TWD') : 'TWD';
    const $tbody = $('#outboundItemsTableBody').empty();

    let sumBoxes = 0;
    let sumPieces = 0;
    let sumSales = 0;
    let sumCost = 0;
    let sumProfit = 0;
    let sumSv = 0;

    if (stagingOutboundItems.length === 0) {
        $tbody.append('<tr><td colspan="14" class="text-center text-secondary py-3">本銷貨單暫無細項明細數據（尚未儲存）</td></tr>');
    } else {
        stagingOutboundItems.forEach(it => {
            const isBox = isMasterPackUnit(it.sales_unit, it.product_id, it.official_product_code);
            if (isBox) {
                sumBoxes = AppCalc.add(sumBoxes, parseInt(it.shipped_qty, 10) || 0);
            } else if (it.is_fee_item !== 'Y') {
                sumPieces = AppCalc.add(sumPieces, parseInt(it.shipped_qty, 10) || 0);
            }

            sumSales = AppCalc.add(sumSales, parseFloat(it.subtotal_amount) || 0);
            sumCost = AppCalc.add(sumCost, parseFloat(it.subtotal_cost) || 0);
            sumProfit = AppCalc.add(sumProfit, parseFloat(it.subtotal_profit) || 0);
            sumSv = AppCalc.add(sumSv, parseFloat(it.subtotal_sv) || 0);

            const opBtnDisabled = isLocked ? 'disabled' : '';

            $tbody.append(`
                <tr>
                    <td class="text-secondary">${it.item_seq}</td>
                    <td>
                        <div class="fw-bold text-white">${it.product_name_snapshot || '-'}</div>
                        <div class="text-secondary small">${it.official_product_code || '-'}</div>
                    </td>
                    <td>
                        <span class="text-secondary">${UIBadges.psi.feeItem(it.is_fee_item)} / ${it.sales_unit}</span>
                    </td>
                    <td class="text-yellow text-end">${formatCurrency(it.unit_price, curr)}</td>
                    <td class="text-red text-end">${formatCurrency(it.unit_cost, curr)}</td>
                    <td class="text-teal text-end">${formatSV(it.unit_sv, 'INTERNAL')} SV</td>
                    <td class="text-end">${it.ordered_qty} / ${it.shipped_qty}</td>
                    <td class="fw-bold text-orange text-end">${formatCurrency(it.subtotal_amount, curr)}</td>
                    <td class="fw-bold text-accent text-end">${formatCurrency(it.subtotal_cost, curr)}</td>
                    <td class="fw-bold text-info text-end">${formatCurrency(it.subtotal_profit, curr)}</td>
                    <td class="fw-bold text-teal text-end">${formatSV(it.subtotal_sv, 'INTERNAL')} SV</td>
                    <td>
                        <div>${it.batch_no || '-'}</div>
                        <div class="text-secondary small">${AppDate.toDisplay(it.expiry_date) || '-'}</div>
                    </td>
                    <td class="text-info-emphasis">${it.stock_id || '-'}</td>
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

    $('#sumItemCount').text(stagingOutboundItems.length.toLocaleString());
    $('#sumBoxes').text(sumBoxes.toLocaleString());
    $('#sumPieces').text(sumPieces.toLocaleString());
    $('#sumSalesAmount').text(formatCurrency(sumSales, curr));
    $('#sumCostAmount').text(formatCurrency(sumCost, curr));
    $('#sumProfitAmount').text(formatCurrency(sumProfit, curr));
    $('#sumTotalSv').text(`${formatSV(sumSv, 'INTERNAL')} SV`);
}

// ==========================================================================
// 7. 明細品項選單與行內編輯暫存中樞
// ==========================================================================
function populateInlineProductOptions() {
    const parentOrder = appState.outbounds.find(d => d.id === currentDetailOrderId);
    const targetWh = parentOrder ? parentOrder.warehouse_id : '';
    const isMalaysia = parentOrder && parentOrder.currency_code === 'MYR';
    const targetRegion = isMalaysia ? 'MY' : 'TW';

    const $select = $('#inlineProductSelect').empty().append('<option value="">-- 請選擇品項或費用項 --</option>');

    // 1. 獨立費用項目群組 (不扣庫存)
    const feeItems = [
        { code: 'FEE_A13', name: '官方運費補貼 (A13)', price: 150 },
        { code: 'FEE_PKG', name: '特殊包材與保冷費', price: 50 },
        { code: 'FEE_DLV', name: '同區 Grab 急件快遞費', price: 200 },
        { code: 'FEE_OTH', name: '其他自訂勞務雜費', price: 0 }
    ];
    const $feeGroup = $('<optgroup label="🚚 官方運費與勞務雜費項目"></optgroup>');
    feeItems.forEach(f => {
        $feeGroup.append(`<option value="${f.code}" data-fee="Y" data-name="${f.name}" data-price="${f.price}" data-sv="0">${f.name}</option>`);
    });
    $select.append($feeGroup);

    // 2. 實體商品分組 (動態讀取表 302 新 Schema 自由可用整盒與散件)
    const filteredProducts = appState.products.filter(p => (p.region_code || 'TW').toUpperCase() === targetRegion);
    const prodGroupLabel = isMalaysia ? '🇲🇾 馬來西亞市場' : '🇹🇼 台灣市場';
    const $prodGroup = $(`<optgroup label="${prodGroupLabel}"></optgroup>`);

    filteredProducts.forEach(p => {
        const matchedStocks = appState.stocks.filter(s => s.product_id === p.product_code && s.warehouse_id === targetWh);
        const availBoxes = matchedStocks.reduce((sum, s) => sum + (s.available_qty !== undefined ? s.available_qty : Math.max(0, s.quantity - s.reserved_qty)), 0);
        const availPieces = matchedStocks.reduce((sum, s) => sum + (s.available_pieces_qty !== undefined ? s.available_pieces_qty : Math.max(0, (s.pieces_qty || 0) - (s.reserved_pieces_qty || 0))), 0);

        const baseUnit = p.base_unit || '盒';
        const subUnit = p.sub_unit || '';

        const isOutOfStock = (availBoxes <= 0 && availPieces <= 0);
        let stockLabel = '';
        if (isOutOfStock) {
            stockLabel = subUnit ? `[缺貨: 0${baseUnit}/0${subUnit}]` : `[缺貨: 0${baseUnit}]`;
        } else {
            stockLabel = subUnit ? `[可用: ${availBoxes}${baseUnit} / ${availPieces}${subUnit}]` : `[可用: ${availBoxes}${baseUnit}]`;
        }

        $prodGroup.append(`
            <option value="${p.product_code}" 
                    data-fee="N" 
                    data-name="${p.name}" 
                    data-avail-boxes="${availBoxes}" 
                    data-avail-pieces="${availPieces}" 
                    data-base-unit="${baseUnit}" 
                    data-sub-unit="${subUnit}" 
                    data-out-of-stock="${isOutOfStock ? 'Y' : 'N'}">
                📦 ${p.name} [${p.product_code}] ${stockLabel}
            </option>
        `);
    });
    $select.append($prodGroup);

    if ($.fn.select2) {
        if ($select.hasClass('select2-hidden-accessible')) {
            $select.select2('destroy');
        }
        $select.select2({
            dropdownParent: $('#outboundDetailModal'),
            width: '100%',
            placeholder: '-- 請選擇品項或費用項 --'
        });
    }

    $select.off('select2:select.itemSelect change.itemSelect').on('select2:select.itemSelect change.itemSelect', function () {
        onInlineProductSelectChange();
    });
}

function updateStockWarningFeedback() {
    const code = $('#inlineProductSelect').val();
    const $feedback = $('#inlineStockFeedback').empty();
    if (!code) return;

    const $opt = $('#inlineProductSelect option:selected');
    if ($opt.data('fee') === 'Y') {
        $feedback.html('<span class="text-secondary"><i class="fa-solid fa-circle-info me-1"></i>虛擬費用項目，不執行實體庫存扣減</span>');
        return;
    }

    const prod = appState.products.find(p => p.product_code === code || p.official_product_code === code);
    const baseUnit = prod ? (prod.base_unit || '盒') : ($opt.data('base-unit') || '盒');
    const subUnit = prod ? (prod.sub_unit || '件') : ($opt.data('sub-unit') || '件');

    const availBoxes = parseInt($opt.data('avail-boxes'), 10) || 0;
    const availPieces = parseInt($opt.data('avail-pieces'), 10) || 0;
    const packMode = $('input[name="inlinePackMode"]:checked').val() || 'BOX';
    const shippedQty = parseInt($('#inlineShippedQty').val(), 10) || 0;

    if (packMode === 'BOX') {
        if (availBoxes <= 0) {
            $feedback.html(`<span class="text-danger fw-bold"><i class="fa-solid fa-circle-xmark me-1"></i>此倉目前無${baseUnit}裝可用現貨 (可用: 0${baseUnit})！</span>`);
        } else if (shippedQty > availBoxes) {
            $feedback.html(`<span class="text-warning fw-bold"><i class="fa-solid fa-triangle-exclamation me-1"></i>出庫量 (${shippedQty}${baseUnit}) 超過在線可用量 (${availBoxes}${baseUnit})！</span>`);
        } else {
            $feedback.html(`<span class="text-success"><i class="fa-solid fa-circle-check me-1"></i>在庫充裕 (自由可用現貨: ${availBoxes}${baseUnit})</span>`);
        }
    } else {
        if (availPieces <= 0 && availBoxes <= 0) {
            $feedback.html(`<span class="text-danger fw-bold"><i class="fa-solid fa-circle-xmark me-1"></i>此倉無散裝${subUnit}件，亦無${baseUnit}裝可供拆封！</span>`);
        } else if (shippedQty > availPieces) {
            $feedback.html(`<span class="text-warning fw-bold"><i class="fa-solid fa-boxes-packing me-1"></i>在線可用散裝僅剩 ${availPieces}${subUnit} (倉庫尚有 ${availBoxes}${baseUnit}整盒可供拆封)</span>`);
        } else {
            $feedback.html(`<span class="text-success"><i class="fa-solid fa-circle-check me-1"></i>散裝現貨充足 (自由可用: ${availPieces}${subUnit})</span>`);
        }
    }
}

function calcInlineSubtotals() {
    updateStockWarningFeedback();
}

function onInlineProductSelectChange() {
    const code = $('#inlineProductSelect').val();
    if (!code) return;

    const $opt = $('#inlineProductSelect option:selected');
    const isFee = $opt.data('fee') === 'Y';
    const parentOrder = appState.outbounds.find(d => d.id === currentDetailOrderId);
    const curr = parentOrder ? (parentOrder.currency_code || 'TWD') : 'TWD';
    const targetWh = parentOrder ? parentOrder.warehouse_id : '';

    $('#inlineCurrencyCode').val(curr);
    $('#inlineCurrencyCodeText').text(curr);

    if (isFee) {
        $('#inlineIsFeeItem').val('Y');
        $('#inlinePackRatioSnapshot').val(1);
        $('#inlineSalesUnit').val('項');
        $('#inlineSalesUnitText').val('項');

        const feePrice = parseFloat($opt.data('price')) || 0;
        $('#inlineUnitPrice').val(feePrice);
        $('#inlineRawUnitCost').val(0);
        $('#inlineUnitCost').val(formatCurrency(0, curr));
        $('#inlineRawUnitSv').val(0);
        $('#inlineUnitSv').val('0 SV');

        $('#inlineBatchNo').val('');
        $('#inlineExpiryDate').val('');
        $('#inlineStockId').val('');
        $('#groupInlinePackMode').addClass('opacity-50').find('input').prop('disabled', true);
    } else {
        $('#inlineIsFeeItem').val('N');
        $('#groupInlinePackMode').removeClass('opacity-50').find('input').prop('disabled', false);

        const prod = appState.products.find(p => p.product_code === code);
        if (!prod) return;

        const packMode = $('input[name="inlinePackMode"]:checked').val() || 'BOX';
        const targetUnit = (packMode === 'PIECE') ? (prod.sub_unit || '支') : (prod.base_unit || '盒');

        const spec = AppCalc.deriveLooseSpec(prod, targetUnit);

        $('#inlinePackRatioSnapshot').val(spec.ratio || 1);
        $('#inlineSalesUnit').val(targetUnit);
        $('#inlineSalesUnitText').val(targetUnit);

        $('#inlineUnitPrice').val(spec.unitPrice);

        const estimatedCost = (spec.unitCost > 0) ? spec.unitCost : spec.unitPrice;
        $('#inlineRawUnitCost').val(estimatedCost);
        $('#inlineUnitCost').val(formatCurrency(estimatedCost, curr));

        $('#inlineRawUnitSv').val(spec.unitSV);
        $('#inlineUnitSv').val(`${formatSV(spec.unitSV, 'INTERNAL')} SV`);

        const matchedStock = appState.stocks
            .filter(s => s.product_id === code && s.warehouse_id === targetWh && s.available_qty > 0)
            .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'))[0];

        if (matchedStock) {
            $('#inlineBatchNo').val(matchedStock.batch_no || '');
            $('#inlineExpiryDate').val(matchedStock.expiry_date ? AppDate.toInput(matchedStock.expiry_date) : '');
            $('#inlineStockId').val(matchedStock.id || '');
            if (matchedStock.cost_price > 0) {
                const stockCost = (packMode === 'PIECE' && spec.ratio > 1)
                    ? AppCalc.divide(matchedStock.cost_price, spec.ratio, 2)
                    : matchedStock.cost_price;
                $('#inlineUnitCost').val(formatCurrency(stockCost, curr));
            }
        } else {
            $('#inlineBatchNo').val(`LOT${AppDate.toClean6()}`);
            const p = AppDate.parse(new Date());
            const expYear = parseInt(p.year, 10) + 2;
            const defaultExpiry = `${expYear}-${p.month}-${p.day}`;
            $('#inlineExpiryDate').val(AppDate.toInput(defaultExpiry));
            $('#inlineStockId').val('');
        }
    }

    updateStockWarningFeedback();
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

    $('#inlinePackModeBox').prop('checked', true);
    $('#inlineProductSelect').val('').trigger('change.select2');

    $('#inlineOrderedQty').val(1);
    $('#inlineShippedQty').val(1);
    $('#outboundItemInlineCollapse').collapse('show');
}

function closeInlineItemForm() {
    $('#outboundItemInlineCollapse').collapse('hide');
    $('#inlineItemId').val('');
    $('#inlineProductSelect').val('').trigger('change.select2');
}

function editInlineItem(itemId) {
    const item = stagingOutboundItems.find(it => it.id === itemId);
    if (!item) {
        AppToast.warning("找不到該筆暫存明細資料！");
        return;
    }
    const parentOrder = appState.outbounds.find(d => d.id === currentDetailOrderId);
    const curr = parentOrder ? (parentOrder.currency_code || 'TWD') : 'TWD';

    $('#inlineFormTitle').html(`<i class="fa-solid fa-pen-to-square text-primary me-1"></i>編輯明細【項次 ${item.item_seq}】`);
    $('#inlineItemId').val(item.id);

    const isBox = isMasterPackUnit(item.sales_unit, item.product_id, item.official_product_code);
    if (isBox) {
        $('#inlinePackModeBox').prop('checked', true);
    } else {
        $('#inlinePackModePiece').prop('checked', true);
    }

    const targetCode = item.is_fee_item === 'Y' ? item.official_product_code : (item.product_id || item.official_product_code);
    $('#inlineProductSelect').val(targetCode).trigger('change.select2');

    $('#inlineIsFeeItem').val(item.is_fee_item);
    $('#inlinePackRatioSnapshot').val(item.pack_ratio_snapshot || 1);
    $('#inlineSalesUnit').val(item.sales_unit);
    $('#inlineSalesUnitText').val(item.sales_unit);

    $('#inlineUnitPrice').val(item.unit_price);
    $('#inlineRawUnitCost').val(item.unit_cost);
    $('#inlineUnitCost').val(formatCurrency(item.unit_cost, curr));
    $('#inlineRawUnitSv').val(item.unit_sv);
    $('#inlineUnitSv').val(`${formatSV(item.unit_sv, 'INTERNAL')} SV`);

    $('#inlineOrderedQty').val(item.ordered_qty);
    $('#inlineShippedQty').val(item.shipped_qty);
    $('#inlineBatchNo').val(item.batch_no || '');
    $('#inlineExpiryDate').val(item.expiry_date ? AppDate.toInput(item.expiry_date) : '');
    $('#inlineStockId').val(item.stock_id || '');
    $('#inlineIsSampleDemo').prop('checked', item.is_sample_demo === 'Y');
    $('#inlineRemarks').val(item.remarks || '');

    $('#outboundItemInlineCollapse').collapse('show');
}

function saveInlineOutboundItem() {
    const orderId = currentDetailOrderId;
    if (!orderId) return;

    const productCode = $('#inlineProductSelect').val();
    const shippedQty = parseInt($('#inlineShippedQty').val(), 10) || 0;
    const unitPrice = parseFloat($('#inlineUnitPrice').val()) || 0;
    const unitCost = parseFloat($('#inlineRawUnitCost').val()) || 0;
    const unitSv = parseFloat($('#inlineRawUnitSv').val()) || 0;

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

    const itemId = $('#inlineItemId').val().trim();
    const isEdit = Boolean(itemId);
    const $opt = $('#inlineProductSelect option:selected');
    const isFee = $('#inlineIsFeeItem').val();
    const packMode = $('input[name="inlinePackMode"]:checked').val() || 'BOX';

    if (isFee !== 'Y') {
        const availBoxes = parseInt($opt.data('avail-boxes'), 10) || 0;
        const availPieces = parseInt($opt.data('avail-pieces'), 10) || 0;
        const isExcess = (packMode === 'BOX' && shippedQty > availBoxes) || 
                         (packMode === 'PIECE' && shippedQty > availPieces);

        if (isExcess) {
            AppToast.warning(`【超額預售提醒】出庫數量超出在庫現貨，已標記暫存。若非現貨交付，請將母單狀態設為「待取貨」或勾選「代領預扣鎖定 (HOLD)」。`);
        }
    }

    let productName = '';
    if (isFee === 'Y') {
        productName = $('#inlineProductSelect option:selected').text();
    } else {
        const prod = appState.products.find(p => p.product_code === productCode);
        productName = prod ? prod.name : productCode;
    }

    const salesUnit = $('#inlineSalesUnit').val();
    const orderedQty = parseInt($('#inlineOrderedQty').val(), 10) || 1;
    const packRatio = parseInt($('#inlinePackRatioSnapshot').val(), 10) || 1;

    const subAmount = AppCalc.multiply(shippedQty, unitPrice, 2);
    const subCost = AppCalc.multiply(shippedQty, unitCost, 2);
    const subProfit = AppCalc.sub(subAmount, subCost);
    const subSv = AppCalc.multiply(shippedQty, unitSv, 2);

    const isSample = $('#inlineIsSampleDemo').is(':checked') ? 'Y' : 'N';
    const batchNo = $('#inlineBatchNo').val().trim();
    const expiryDate = $('#inlineExpiryDate').val();
    const stockId = $('#inlineStockId').val().trim();
    const remarks = $('#inlineRemarks').val().trim();

    if (!isEdit) {
        const nextSeq = stagingOutboundItems.length > 0 ? Math.max(...stagingOutboundItems.map(it => it.item_seq)) + 1 : 1;
        const newTempId = `${orderId}_TEMP_${Date.now()}_${nextSeq}`;

        stagingOutboundItems.push({
            id: newTempId,
            outbound_id: orderId,
            item_seq: nextSeq,
            official_product_code: productCode,
            product_name_snapshot: productName,
            product_id: isFee === 'Y' ? '' : productCode,
            is_fee_item: isFee,
            sales_unit: salesUnit,
            currency_code: $('#inlineCurrencyCode').val() || 'TWD',
            pack_ratio_snapshot: packRatio,
            unit_price: unitPrice,
            unit_cost: unitCost,
            unit_sv: unitSv,
            ordered_qty: orderedQty,
            shipped_qty: shippedQty,
            subtotal_amount: subAmount,
            subtotal_cost: subCost,
            subtotal_profit: subProfit,
            subtotal_sv: subSv,
            batch_no: batchNo,
            expiry_date: expiryDate,
            stock_id: stockId,
            is_sample_demo: isSample,
            remarks: remarks,
            _isNew: true
        });
        AppToast.info(`已暫存出庫品項【${productName}】（尚未寫入雲端）`);
    } else {
        const target = stagingOutboundItems.find(it => it.id === itemId);
        if (target) {
            target.official_product_code = productCode;
            target.product_name_snapshot = productName;
            target.product_id = isFee === 'Y' ? '' : productCode;
            target.is_fee_item = isFee;
            target.sales_unit = salesUnit;
            target.currency_code = $('#inlineCurrencyCode').val() || 'TWD';
            target.pack_ratio_snapshot = packRatio;
            target.unit_price = unitPrice;
            target.unit_cost = unitCost;
            target.unit_sv = unitSv;
            target.ordered_qty = orderedQty;
            target.shipped_qty = shippedQty;
            target.subtotal_amount = subAmount;
            target.subtotal_cost = subCost;
            target.subtotal_profit = subProfit;
            target.subtotal_sv = subSv;
            target.batch_no = batchNo;
            target.expiry_date = expiryDate;
            target.stock_id = stockId;
            target.is_sample_demo = isSample;
            target.remarks = remarks;
            target._isModified = true;
            AppToast.info(`已更新暫存品項【${productName}】（尚未寫入雲端）`);
        }
    }

    closeInlineItemForm();
    renderOutboundItemsTableFromStaging(false);
}

function deleteInlineItem(itemId) {
    const idx = stagingOutboundItems.findIndex(it => it.id === itemId);
    if (idx === -1) return;

    if (!itemId.includes('_TEMP_')) {
        deletedOutboundItemIds.push(itemId);
    }
    stagingOutboundItems.splice(idx, 1);

    stagingOutboundItems.forEach((it, index) => {
        it.item_seq = index + 1;
        it._isModified = true;
    });

    renderOutboundItemsTableFromStaging(false);
    AppToast.info("明細已自暫存清單移除（尚未儲存至雲端）");
}

async function saveAllOutboundItems() {
    if (!currentDetailOrderId) return;
    const parentOrder = appState.outbounds.find(d => d.id === currentDetailOrderId);
    if (!parentOrder) return;

    // 若母單已標記為交付且未鎖定，逐項檢核暫存明細是否超出庫存
    if (parentOrder.fulfillment_status === '已交付' && parentOrder.is_pre_order_hold !== 'Y') {
        for (const it of stagingOutboundItems) {
            if (it.is_fee_item === 'Y') continue;
            const matchedStocks = appState.stocks.filter(s => s.product_id === it.product_id && s.warehouse_id === parentOrder.warehouse_id);
            const isBox = isMasterPackUnit(it.sales_unit, it.product_id, it.official_product_code);
            const totalAvail = matchedStocks.reduce((sum, s) => {
                return sum + (isBox ? (s.available_qty !== undefined ? s.available_qty : Math.max(0, s.quantity - s.reserved_qty)) : (s.available_pieces_qty !== undefined ? s.available_pieces_qty : Math.max(0, (s.pieces_qty || 0) - (s.reserved_pieces_qty || 0))));
            }, 0);

            if (it.shipped_qty > totalAvail) {
                AppToast.error(`【ERR_INSUFFICIENT_STOCK 出庫阻斷】品項【${it.product_name_snapshot}】出庫量 (${it.shipped_qty} ${it.sales_unit}) 超過可用庫存 (${totalAvail} ${it.sales_unit})！請先將母單狀態改為「待取貨」或完成進貨調撥。`);
                return;
            }
        }
    }

    const $btn = $('#btnSaveAllOutboundItems');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i>正在批次寫入雲端...');
        const currentUser = getCurrentUser();
        const nowStr = AppDate.now('full');

        // 1. 執行已刪除項之雲端清理
        for (const delId of deletedOutboundItemIds) {
            await SheetAdapter.deleteRow(SHEET_NAMES.OUTBOUND_ITEMS, delId, GAS_DEPLOY_ID.PSI);
        }

        // 2. 執行暫存明細之新增與更新 (表 306 實體 28 欄順序)
        for (let i = 0; i < stagingOutboundItems.length; i++) {
            const it = stagingOutboundItems[i];
            const finalSeq = i + 1;
            let finalItemId = it.id;

            if (it._isNew || it.id.includes('_TEMP_')) {
                finalItemId = `${currentDetailOrderId}_${String(finalSeq).padStart(2, '0')}`;
            }

            const expiryDateVal = it.expiry_date ? AppDate.toSheet(it.expiry_date) : '';

            const rowData = [
                finalItemId,
                currentDetailOrderId,
                finalSeq,
                it.official_product_code,
                it.product_name_snapshot,
                it.product_id,
                it.is_fee_item,
                it.sales_unit,
                it.currency_code || 'TWD',
                it.pack_ratio_snapshot || 1,
                it.unit_price,
                it.unit_cost,
                it.unit_sv,
                it.ordered_qty,
                it.shipped_qty,
                it.subtotal_amount,
                it.subtotal_cost,
                it.subtotal_profit,
                it.subtotal_sv,
                it.batch_no || '',
                expiryDateVal,
                it.stock_id || '',
                it.is_sample_demo || 'N',
                it.remarks || '',
                it.created_by || currentUser,
                it.created_at || nowStr,
                currentUser,
                nowStr
            ];

            if (it._isNew || it.id.includes('_TEMP_')) {
                await SheetAdapter.createRow(SHEET_NAMES.OUTBOUND_ITEMS, finalItemId, rowData, GAS_DEPLOY_ID.PSI);
            } else if (it._isModified) {
                await SheetAdapter.updateRow(SHEET_NAMES.OUTBOUND_ITEMS, finalItemId, rowData, GAS_DEPLOY_ID.PSI);
            }
        }

        // 3. 同步記憶體
        appState.outboundItems = appState.outboundItems.filter(it => it.outbound_id !== currentDetailOrderId);
        stagingOutboundItems.forEach((it, i) => {
            const finalSeq = i + 1;
            const finalItemId = `${currentDetailOrderId}_${String(finalSeq).padStart(2, '0')}`;
            appState.outboundItems.push({
                ...it,
                id: finalItemId,
                item_seq: finalSeq,
                _isNew: false,
                _isModified: false
            });
        });

        // 4. 重算母單財務並回寫雲端（全 35 欄位）
        await autoRecalculateParentOutbound(currentDetailOrderId);

        bootstrap.Modal.getInstance(document.getElementById('outboundDetailModal')).hide();
        refreshAllViews();
        AppToast.success(`銷貨單【${currentDetailOrderId}】全體明細已成功批次同步至雲端！`);
    } catch (err) {
        AppToast.error("批次儲存銷貨明細失敗：" + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i>儲存銷貨明細變更');
    }
}

// ==========================================================================
// 8. 銷貨主檔 C/R/U/D 與實體交付中樞
// ==========================================================================
function openOutboundDetailModal(orderId) {
    const item = appState.outbounds.find(d => d.id === orderId);
    if (!item) {
        AppToast.warning("找不到該筆銷貨單據！");
        return;
    }

    const curr = item.currency_code || 'TWD';
    const recipientEntityName = (item.recipient_type === '經營者')
        ? (EntityResolver.partner(item.recipient_partner_id, appState.partners, appState.persons, 1) || '未指派夥伴')
        : (EntityResolver.customer(item.recipient_customer_id, appState.customers, appState.persons, 1) || '非主檔顧客');

    const operatorName = EntityResolver.partner(item.operator_partner_id, appState.partners, appState.persons, 1);
    const warehouseName = EntityResolver.warehouse(item.warehouse_id, appState.warehouses, 1);
    const centerName = EntityResolver.warehouse(item.order_center, appState.warehouses, 1) || item.order_center || '-';

    const profitSign = (item.total_profit_amount >= 0) ? '+' : '';
    const canDeliver = (item.fulfillment_status === '待取貨' || item.fulfillment_status === '已寄出');

    const html = `
        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-secondary small">系統銷貨單號 (PK)</span>
                <span class="text-info-emphasis fw-bold">${item.id}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-secondary small">出庫履約狀態</span>
                <div>${UIBadges.psi.outboundStatus(item.fulfillment_status)}</div>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-secondary small">收款核銷狀態</span>
                <div>${UIBadges.psi.outboundPaymentStatus(item.payment_status)}</div>
            </div>
            <div class="d-flex justify-content-between align-items-center">
                <span class="text-secondary small">代領預扣鎖定</span>
                <div>${UIBadges.psi.preOrderHold(item.is_pre_order_hold, true)}</div>
            </div>
        </article>

        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-3 d-flex align-items-center gap-2 border-bottom border-secondary border-opacity-25 pb-2">
                <i class="fa-solid fa-warehouse text-primary"></i> 商流歸屬與實體扣庫
            </h6>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">銷貨業務類別</div>
                <div class="col-7 text-white text-end">${item.order_category || '零售客銷售'}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">經手開單夥伴</div>
                <div class="col-7 text-white fw-bold text-end">${operatorName}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">實體扣庫倉庫</div>
                <div class="col-7 text-warning fw-bold text-end">${warehouseName}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">出貨調度中心</div>
                <div class="col-7 text-light text-end">${centerName}</div>
            </div>
        </article>

        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-3 d-flex align-items-center gap-2 border-bottom border-secondary border-opacity-25 pb-2">
                <i class="fa-solid fa-truck text-info"></i> 收件客情與實體配送
            </h6>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">收件對象身分</div>
                <div class="col-7 text-white text-end">${item.recipient_type || '消費者'}（${recipientEntityName}）</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">收件人姓名</div>
                <div class="col-7 text-white fw-bold text-end">${item.recipient_name || '-'}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">收件人聯絡手機</div>
                <div class="col-7 text-light text-end">${item.recipient_phone || '(未填寫電話)'}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">出貨交付方式</div>
                <div class="col-7 text-light text-end">${item.delivery_method || '面交自取'}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">貨運託運追蹤碼</div>
                <div class="col-7 text-info text-end">${item.tracking_no || '(無物流單號/自取)'}</div>
            </div>
            <div class="row g-2">
                <div class="col-5 text-secondary small">配送實體地址/門市</div>
                <div class="col-7 text-light text-end text-break">${item.shipping_address || '(現場面交/自取無地址)'}</div>
            </div>
        </article>

        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-3 d-flex align-items-center gap-2 border-bottom border-secondary border-opacity-25 pb-2">
                <i class="fa-solid fa-coins text-warning"></i> 財務金流與實質毛利結算
            </h6>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">商品實收</div>
                <div class="col-7 text-yellow text-end">${formatCurrency(item.product_amount, curr)}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">運雜費</div>
                <div class="col-7 text-white text-end">${formatCurrency(item.shipping_fee, curr)}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">整單實收總額</div>
                <div class="col-7 text-orange fw-bold text-end fs-6">${formatCurrency(item.total_sales_amount, curr)}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">進貨成本總額</div>
                <div class="col-7 text-accent text-end">${formatCurrency(item.total_cost_amount, curr)}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">實質毛利價差利潤</div>
                <div class="col-7 text-info fw-bold text-end fs-6">${profitSign}${formatCurrency(item.total_profit_amount, curr)}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">出庫整件 / 散件</div>
                <div class="col-7 text-white fw-bold text-end">${item.total_boxes || 0} / ${item.total_pieces || 0}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">出庫 SV</div>
                <div class="col-7 text-teal fw-bold text-end fs-6">${formatSV(item.total_sv, 'INTERNAL')} SV</div>
            </div>
            <div class="row g-2">
                <div class="col-5 text-secondary small">付款方式 / 平台</div>
                <div class="col-7 text-light text-end">${item.payment_method || '現金'}（${item.payment_platform || '現金'}）</div>
            </div>
        </article>

        <article class="card p-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-2 d-flex align-items-center gap-2">
                <i class="fa-solid fa-comment-dots text-secondary"></i> 單據備註事項
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

    $('#modalOutboundDetailBody').html(html);

    const $leftAction = $('#modalOutboundDetailActionLeft').empty();
    if (canDeliver) {
        $leftAction.append(`
            <button type="button" class="btn btn-purple btn-sm rounded-pill px-3" onclick="quickDeliverFromDetail('${item.id}')">
                <i class="fa-solid fa-stamp me-1"></i>標記為已交付（執行扣庫）
            </button>
        `);
    }

    $('#btnDetailViewItemsOutbound').off('click').on('click', function () {
        const modalEl = document.getElementById('modalOutboundDetail');
        if (modalEl) {
            const inst = bootstrap.Modal.getInstance(modalEl);
            if (inst) inst.hide();
        }
        openDetailModal(orderId);
    });

    $('#btnDetailEditOutbound').off('click').on('click', function () {
        const modalEl = document.getElementById('modalOutboundDetail');
        if (modalEl) {
            const inst = bootstrap.Modal.getInstance(modalEl);
            if (inst) inst.hide();
        }
        openEditOutboundModal(orderId);
    });

    new bootstrap.Modal(document.getElementById('modalOutboundDetail')).show();
}

async function quickDeliverFromDetail(orderId) {
    const modalEl = document.getElementById('modalOutboundDetail');
    if (modalEl) {
        const inst = bootstrap.Modal.getInstance(modalEl);
        if (inst) inst.hide();
    }
    await quickMarkDelivered(orderId);
}

async function saveOutboundOrder() {
    const mode = $('#formMode').val();
    const orderId = $('#fieldId').val().trim();
    const orderCenter = $('#fieldOrderCenter').val();
    const orderDate = $('#fieldOrderDate').val();
    const whId = $('#fieldWarehouseId').val();
    const operatorId = $('#fieldOperatorPartnerId').val();
    const recipientName = $('#fieldRecipientName').val().trim();

    if (!orderId) {
        AppToast.warning("銷貨單號不可為空！");
        return;
    }
    if (!orderCenter) {
        AppToast.warning("請選擇「出貨調度中心」！");
        $('#fieldOrderCenter').focus();
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

    const fulfillmentStatus = $('#fieldFulfillmentStatus').val();
    const isPreOrderHold = $('#fieldIsPreOrderHold').is(':checked') ? 'Y' : 'N';
    const targetWh = $('#fieldWarehouseId').val();

    // 若標記為「已交付」且非 HOLD，校驗在庫可用現貨
    if (fulfillmentStatus === '已交付' && isPreOrderHold !== 'Y') {
        const orderItems = appState.outboundItems.filter(it => it.outbound_id === orderId);
        for (const it of orderItems) {
            if (it.is_fee_item === 'Y') continue;

            const matchedStocks = appState.stocks.filter(s => s.product_id === it.product_id && s.warehouse_id === targetWh);
            const isBox = isMasterPackUnit(it.sales_unit, it.product_id, it.official_product_code);
            const totalAvail = matchedStocks.reduce((sum, s) => {
                return sum + (isBox ? (s.available_qty !== undefined ? s.available_qty : Math.max(0, s.quantity - s.reserved_qty)) : (s.available_pieces_qty !== undefined ? s.available_pieces_qty : Math.max(0, (s.pieces_qty || 0) - (s.reserved_pieces_qty || 0))));
            }, 0);

            if (it.shipped_qty > totalAvail) {
                AppToast.error(`【ERR_INSUFFICIENT_STOCK 庫存不足阻斷】品項【${it.product_name_snapshot}】出庫量 (${it.shipped_qty} ${it.sales_unit}) 大於在線可用量 (${totalAvail} ${it.sales_unit})！實體現貨不足，禁止標記為「已交付」。`);
                return;
            }
        }
    }

    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');
    const existing = appState.outbounds.find(d => d.id === orderId);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    const orderDateVal = AppDate.toSheet($('#fieldOrderDate').val());
    const outboundDateVal = $('#fieldOutboundDate').val() ? AppDate.toSheet($('#fieldOutboundDate').val()) : '';
    const shippingDateVal = $('#fieldShippingDate').val() ? AppDate.toSheet($('#fieldShippingDate').val()) : '';

    const productAmount = parseFloat($('#fieldRawProductAmount').val()) || 0;
    const shippingFee = parseFloat($('#fieldRawShippingFee').val()) || 0;
    const totalSales = parseFloat($('#fieldRawTotalSalesAmount').val()) || AppCalc.add(productAmount, shippingFee);
    const totalCost = parseFloat($('#fieldRawTotalCostAmount').val()) || 0;
    const totalSv = parseFloat($('#fieldRawTotalSv').val()) || 0;
    const totalProfit = parseFloat($('#fieldRawTotalProfitAmount').val()) || AppCalc.sub(totalSales, totalCost);

    // 表 305: psi_outbound_orders 標準 35 欄位（絕對物理順序 0 ~ 34，無 performance_month）
    const rowDataArray = [
        orderId,                                                    // 0: id
        $('#fieldOrderCategory').val(),                             // 1: order_category
        $('#fieldOrderCenter').val(),                               // 2: order_center
        orderDateVal,                                               // 3: order_date (YYYY/MM/DD)
        $('#fieldDeliveryMethod').val(),                            // 4: delivery_method
        $('#fieldWarehouseId').val(),                               // 5: warehouse_id
        $('#fieldOperatorPartnerId').val(),                         // 6: operator_partner_id
        $('#fieldRecipientType').val(),                             // 7: recipient_type
        $('#fieldRecipientCustomerId').val().trim(),                // 8: recipient_customer_id
        $('#fieldRecipientPartnerId').val().trim(),                 // 9: recipient_partner_id
        outboundDateVal,                                            // 10: outbound_date (YYYY/MM/DD)
        $('#fieldCurrencyCode').val(),                              // 11: currency_code
        productAmount,                                              // 12: product_amount
        shippingFee,                                                // 13: shipping_fee
        totalSales,                                                 // 14: total_sales_amount
        totalCost,                                                  // 15: total_cost_amount
        totalProfit,                                                // 16: total_profit_amount
        totalSv,                                                    // 17: total_sv
        parseInt($('#fieldTotalBoxes').val(), 10) || 0,             // 18: total_boxes
        parseInt($('#fieldTotalPieces').val(), 10) || 0,            // 19: total_pieces
        $('#fieldTrackingNo').val().trim(),                         // 20: tracking_no
        shippingDateVal,                                            // 21: shipping_date (YYYY/MM/DD)
        $('#fieldRecipientName').val().trim(),                      // 22: recipient_name
        $('#fieldRecipientPhone').val().trim(),                     // 23: recipient_phone
        $('#fieldShippingAddress').val().trim(),                    // 24: shipping_address
        isPreOrderHold,                                             // 25: is_pre_order_hold
        fulfillmentStatus,                                          // 26: fulfillment_status
        $('#fieldPaymentStatus').val(),                             // 27: payment_status
        $('#fieldPaymentMethod').val(),                             // 28: payment_method
        $('#fieldPaymentPlatform').val(),                           // 29: payment_platform
        $('#fieldRemarks').val().trim(),                            // 30: remarks
        createdBy,                                                  // 31: created_by
        createdAt,                                                  // 32: created_at
        currentUser,                                                // 33: modified_by
        nowStr                                                      // 34: modified_at
    ];

    const updatedObj = {
        id: orderId,
        order_category: $('#fieldOrderCategory').val(),
        order_center: $('#fieldOrderCenter').val(),
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
        total_sv: totalSv,
        total_boxes: parseInt($('#fieldTotalBoxes').val(), 10) || 0,
        total_pieces: parseInt($('#fieldTotalPieces').val(), 10) || 0,
        tracking_no: $('#fieldTrackingNo').val().trim(),
        shipping_date: $('#fieldShippingDate').val(),
        recipient_name: $('#fieldRecipientName').val().trim(),
        recipient_phone: $('#fieldRecipientPhone').val().trim(),
        shipping_address: $('#fieldShippingAddress').val().trim(),
        is_pre_order_hold: isPreOrderHold,
        fulfillment_status: fulfillmentStatus,
        payment_status: $('#fieldPaymentStatus').val(),
        payment_method: $('#fieldPaymentMethod').val(),
        payment_platform: $('#fieldPaymentPlatform').val(),
        remarks: $('#fieldRemarks').val().trim(),
        created_by: createdBy,
        created_at: createdAt,
        modified_by: currentUser,
        modified_at: nowStr
    };

    const $btn =$('#btnSaveOutbound');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i>寫入雲端中...');

        // 1. 以既有狀態 existing 為基準，先執行庫存連動，防範時序覆蓋
        const wasHold = (existing && existing.is_pre_order_hold === 'Y');
        const wasDelivered = (existing && existing.fulfillment_status === '已交付');

        if (fulfillmentStatus === '已交付' && !wasDelivered) {
            // 交付扣庫：若先前為預扣狀態，傳入 wasHold = true 確保同步解鎖預扣
            await syncOutboundOrderToStocks(orderId, 'DELIVER', wasHold);
        } else if (fulfillmentStatus === '已取消' && wasHold) {
            // 切換為已取消時，即時釋放預扣鎖定
            await syncOutboundOrderToStocks(orderId, 'RELEASE_HOLD');
        } else if (isPreOrderHold === 'Y' && !wasHold && fulfillmentStatus !== '已交付') {
            // 新增或補勾選 HOLD
            await syncOutboundOrderToStocks(orderId, 'HOLD');
        } else if (isPreOrderHold === 'N' && wasHold && fulfillmentStatus !== '已交付') {
            // 主動解除 HOLD 且非交付
            await syncOutboundOrderToStocks(orderId, 'RELEASE_HOLD');
        }

        // 2. 寫入銷貨主檔 (表 305 全 35 欄位)
        if (mode === 'add') {
            await SheetAdapter.createRow(SHEET_NAMES.OUTBOUNDS, orderId, rowDataArray, GAS_DEPLOY_ID.PSI);
            appState.outbounds.unshift(updatedObj);
        } else {
            await SheetAdapter.updateRow(SHEET_NAMES.OUTBOUNDS, orderId, rowDataArray, GAS_DEPLOY_ID.PSI);
            const idx = appState.outbounds.findIndex(d => d.id === orderId);
            if (idx !== -1) appState.outbounds[idx] = updatedObj;
        }

        bootstrap.Modal.getInstance(document.getElementById('outboundModal')).hide();
        refreshAllViews();
        AppToast.success(`銷貨單據【${orderId}】儲存成功，庫存與預扣已完成同步！`);
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i>儲存');
    }
}

async function quickMarkDelivered(orderId) {
    if (!orderId) return;
    const item = appState.outbounds.find(d => d.id === orderId);
    if (!item) return;

    if (item.fulfillment_status === '已交付') {
        AppToast.warning("此單據早已為「已交付」狀態，無須重複扣庫！");
        return;
    }

    const confirmed = await AppDialog.confirm(`確認將出庫單【${item.id}】標記為「已交付」並正式扣減實體庫存嗎？`, {
        title: '交付扣庫確認',
        confirmText: '確定交付',
        confirmClass: 'btn-purple'
    });
    if (!confirmed) return;

    AppLoading.show('<i class="fa-solid fa-boxes-packing fa-spin me-1"></i>正在執行庫存扣減與交付核銷...', '扣庫中...');

    try {
        const currentUser = getCurrentUser();
        const nowStr = AppDate.now('full');
        const todaySheetDate = AppDate.now('sheet');

        // 1. 執行表 302 實體扣庫與預扣解除管線 (傳遞 wasHold 旗標)
        const wasHold = (item.is_pre_order_hold === 'Y');
        await syncOutboundOrderToStocks(item.id, 'DELIVER', wasHold);

        // 2. 更新銷貨單母單狀態為已交付，解除 HOLD
        item.fulfillment_status = '已交付';
        item.is_pre_order_hold = 'N';
        item.outbound_date = todaySheetDate;
        item.modified_by = currentUser;
        item.modified_at = nowStr;

        // 3. 回寫表 305 (標準 35 欄位，無 performance_month)
        const rowDataArray = [
            item.id, item.order_category, item.order_center, item.order_date, item.delivery_method,
            item.warehouse_id, item.operator_partner_id, item.recipient_type, item.recipient_customer_id,
            item.recipient_partner_id, item.outbound_date, item.currency_code, item.product_amount,
            item.shipping_fee, item.total_sales_amount, item.total_cost_amount, item.total_profit_amount,
            item.total_sv, item.total_boxes, item.total_pieces, item.tracking_no, item.shipping_date,
            item.recipient_name, item.recipient_phone, item.shipping_address, item.is_pre_order_hold,
            item.fulfillment_status, item.payment_status, item.payment_method, item.payment_platform,
            item.remarks, item.created_by, item.created_at, item.modified_by, item.modified_at
        ];

        await SheetAdapter.updateRow(SHEET_NAMES.OUTBOUNDS, item.id, rowDataArray, GAS_DEPLOY_ID.PSI);
        refreshAllViews();
        AppToast.success(`銷貨單【${item.id}】已標記交付，實體庫存成功扣減！`);
    } catch (err) {
        AppToast.error("交付狀態更新失敗：" + err.message);
    } finally {
        AppLoading.hide();
    }
}

async function deleteOutboundOrder(id) {
    const item = appState.outbounds.find(d => d.id === id);
    if (!item) return;

    // 已交付單據嚴禁直接刪除
    if (item.fulfillment_status === '已交付') {
        AppToast.warning("「已交付」之單據已完成庫存核銷，嚴禁直接刪除！若需退貨請開立調撥退回單。");
        return;
    }

    const confirmed = await AppDialog.confirm(`確定要自雲端試算表中永久作廢/刪除銷貨單【${item.id}】嗎？此動作不可復原！`, {
        title: '刪除單據確認',
        confirmText: '確定刪除',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    try {
        // 若該單據為 HOLD 鎖定狀態，刪除前先釋放預扣鎖定
        if (item.is_pre_order_hold === 'Y') {
            await syncOutboundOrderToStocks(id, 'RELEASE_HOLD');
        }

        await SheetAdapter.deleteRow(SHEET_NAMES.OUTBOUNDS, id, GAS_DEPLOY_ID.PSI);
        appState.outbounds = appState.outbounds.filter(d => d.id !== id);
        appState.outboundItems = appState.outboundItems.filter(it => it.outbound_id !== id);

        refreshAllViews();
        AppToast.success(`銷貨單【${id}】已成功自雲端刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗：" + err.message);
    }
}

/**
 * 依據最新銷貨明細，自動重算銷貨主檔統計與財務數據（全 35 欄位，無 performance_month）
 */
async function autoRecalculateParentOutbound(orderId) {
    const parentOrder = appState.outbounds.find(d => d.id === orderId);
    if (!parentOrder) return;

    const matchedItems = appState.outboundItems.filter(it => it.outbound_id === orderId);

    let calcTotalBoxes = 0;
    let calcTotalPieces = 0;
    let calcProductAmount = 0;
    let calcShippingFee = 0;
    let calcTotalCost = 0;
    let calcTotalSv = 0;

    matchedItems.forEach(it => {
        const shippedQty = parseInt(it.shipped_qty, 10) || 0;
        const isBox = isMasterPackUnit(it.sales_unit, it.product_id, it.official_product_code);

        if (it.is_fee_item === 'Y') {
            calcShippingFee = AppCalc.add(calcShippingFee, parseFloat(it.subtotal_amount) || 0);
        } else {
            if (isBox) {
                calcTotalBoxes = AppCalc.add(calcTotalBoxes, shippedQty);
            } else {
                calcTotalPieces = AppCalc.add(calcTotalPieces, shippedQty);
            }
            calcProductAmount = AppCalc.add(calcProductAmount, parseFloat(it.subtotal_amount) || 0);
            calcTotalCost = AppCalc.add(calcTotalCost, parseFloat(it.subtotal_cost) || 0);
            calcTotalSv = AppCalc.add(calcTotalSv, parseFloat(it.subtotal_sv) || 0);
        }
    });

    const calcTotalSales = AppCalc.add(calcProductAmount, calcShippingFee);
    const calcTotalProfit = AppCalc.sub(calcTotalSales, calcTotalCost);

    parentOrder.total_boxes = calcTotalBoxes;
    parentOrder.total_pieces = calcTotalPieces;
    parentOrder.total_sv = calcTotalSv;
    parentOrder.product_amount = calcProductAmount;
    parentOrder.shipping_fee = calcShippingFee;
    parentOrder.total_sales_amount = calcTotalSales;
    parentOrder.total_cost_amount = calcTotalCost;
    parentOrder.total_profit_amount = calcTotalProfit;
    parentOrder.modified_by = getCurrentUser();
    parentOrder.modified_at = AppDate.now('full');

    // 回寫表 305: psi_outbound_orders（全 35 欄位物理順序）
    const rowDataArray = [
        parentOrder.id,                             // 0: id
        parentOrder.order_category,                 // 1: order_category
        parentOrder.order_center,                   // 2: order_center
        parentOrder.order_date,                     // 3: order_date
        parentOrder.delivery_method,                // 4: delivery_method
        parentOrder.warehouse_id,                   // 5: warehouse_id
        parentOrder.operator_partner_id,            // 6: operator_partner_id
        parentOrder.recipient_type,                 // 7: recipient_type
        parentOrder.recipient_customer_id,          // 8: recipient_customer_id
        parentOrder.recipient_partner_id,           // 9: recipient_partner_id
        parentOrder.outbound_date,                  // 10: outbound_date
        parentOrder.currency_code,                  // 11: currency_code
        parentOrder.product_amount,                 // 12: product_amount
        parentOrder.shipping_fee,                   // 13: shipping_fee
        parentOrder.total_sales_amount,             // 14: total_sales_amount
        parentOrder.total_cost_amount,              // 15: total_cost_amount
        parentOrder.total_profit_amount,            // 16: total_profit_amount
        parentOrder.total_sv,                       // 17: total_sv
        parentOrder.total_boxes,                    // 18: total_boxes
        parentOrder.total_pieces,                   // 19: total_pieces
        parentOrder.tracking_no,                    // 20: tracking_no
        parentOrder.shipping_date,                  // 21: shipping_date
        parentOrder.recipient_name,                 // 22: recipient_name
        parentOrder.recipient_phone,                // 23: recipient_phone
        parentOrder.shipping_address,               // 24: shipping_address
        parentOrder.is_pre_order_hold,              // 25: is_pre_order_hold
        parentOrder.fulfillment_status,             // 26: fulfillment_status
        parentOrder.payment_status,                 // 27: payment_status
        parentOrder.payment_method,                 // 28: payment_method
        parentOrder.payment_platform,               // 29: payment_platform
        parentOrder.remarks,                        // 30: remarks
        parentOrder.created_by,                     // 31: created_by
        parentOrder.created_at,                     // 32: created_at
        parentOrder.modified_by,                    // 33: modified_by
        parentOrder.modified_at                     // 34: modified_at
    ];

    await SheetAdapter.updateRow(SHEET_NAMES.OUTBOUNDS, parentOrder.id, rowDataArray, GAS_DEPLOY_ID.PSI);
    renderDataTable();
    renderKpis();
    renderCharts();
}

// ==========================================================================
// 9. 報表匯出引擎
// ==========================================================================
function exportOutboundCSV() {
    const csv = Papa.unparse(appState.outbounds);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psi_outbound_orders_${AppDate.toClean8()}.csv`;
    a.click();
    AppToast.info("已成功匯出銷貨主檔 CSV 檔案");
}