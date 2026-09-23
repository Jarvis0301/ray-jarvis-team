// ==========================================================================
// 1. 系統組態與 4 大試算表來源定義
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
    ADJUSTMENTS: APP_CONFIG.SHEET_NAMES.PSI.ADJUSTMENTS,
    PERSONS: APP_CONFIG.SHEET_NAMES.PSN.PERSON,
    PARTNERS: APP_CONFIG.SHEET_NAMES.ORG.PARTNERS,
    PRODUCTS: APP_CONFIG.SHEET_NAMES.PRD.PRODUCTS,
    CUSTOMERS: APP_CONFIG.SHEET_NAMES.CRM.CUSTOMERS,
    STOCKS: APP_CONFIG.SHEET_NAMES.PSI.STOCKS
};

// 系統資料狀態庫
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
// 2. 輔助工具函式與原裝/散裝判定
// ==========================================================================
/**
 * 原裝/整件計量單位動態判定引擎
 */
function isMasterPackUnit(salesUnit, productId, officialProductCode) {
    if (!salesUnit) return true;
    const targetCode = productId || officialProductCode;
    const prod = appState.products.find(p => p.product_code === targetCode || p.official_product_code === targetCode);

    if (prod && prod.base_unit) {
        return salesUnit.trim() === prod.base_unit.trim();
    }
    return ['盒', '組', '箱', '罐', '袋', '套', '包'].includes(salesUnit.trim());
}

/**
 * 自動生成定長 17 碼標準庫存主鍵 (STK-YYYYMMDD-XXXX)
 */
function generateNextStockId(targetDateStr) {
    const cleanDate = targetDateStr ? AppDate.toClean8(targetDateStr) : AppDate.toClean8();
    const prefix = `STK-${cleanDate}-`;
    const todayMatches = appState.stocks.filter(s => s.id && s.id.startsWith(prefix));

    let maxSeq = 0;
    todayMatches.forEach(s => {
        const parts = s.id.split('-');
        if (parts.length === 3) {
            const seq = parseInt(parts[2], 10);
            if (!isNaN(seq) && seq > maxSeq) {
                maxSeq = seq;
            }
        }
    });

    const nextSeq = String(maxSeq + 1).padStart(4, '0');
    return `${prefix}${nextSeq}`;
}

/**
 * 依據表 302 (psi_stocks) 全 20 欄實體結構格式化陣列
 */
function formatStockRowData(s) {
    return [
        s.id,
        s.warehouse_id,
        s.product_id,
        s.batch_no,
        s.expiry_date,
        parseInt(s.quantity, 10) || 0,
        parseInt(s.pieces_qty, 10) || 0,
        parseInt(s.reserved_qty, 10) || 0,
        parseInt(s.reserved_pieces_qty, 10) || 0,
        parseInt(s.available_qty, 10) || 0,
        parseInt(s.available_pieces_qty, 10) || 0,
        s.currency_code || 'TWD',
        parseFloat(s.cost_price) || 0,
        parseFloat(s.sv_point) || 0,
        s.is_locked || 'N',
        s.remarks || '',
        s.created_by || 'SYSTEM',
        s.created_at || AppDate.now('full'),
        s.modified_by || 'SYSTEM',
        s.modified_at || AppDate.now('full')
    ];
}

/**
 * 取得符合當前 6 大全域篩選條件之單據資料集
 */
function getFilteredAdjustments() {
    return appState.adjustments.filter(item => {
        const f = appState.filters;

        if (f.startDate && item.adj_date && item.adj_date < f.startDate) return false;
        if (f.endDate && item.adj_date && item.adj_date > f.endDate) return false;
        if (f.fromWh && f.fromWh !== 'ALL' && item.from_warehouse_id !== f.fromWh) return false;
        if (f.toWh && f.toWh !== 'ALL' && item.to_warehouse_id !== f.toWh) return false;
        if (f.productId && f.productId !== 'ALL') {
            const isMatch = (item.product_id === f.productId) || (item.official_product_code === f.productId);
            if (!isMatch) return false;
        }
        if (f.operatorId && f.operatorId !== 'ALL' && item.operator_partner_id !== f.operatorId) return false;

        return true;
    });
}

// ==========================================================================
// 3. 盤點調撥 7 大異動業務提示與在庫即時反饋
// ==========================================================================
function renderAdjTypeHint(type) {
    const $container = $('#adjTypeRuleFeedback').empty();

    const ruleConfigs = {
        '跨倉調撥': {
            icon: 'fa-solid fa-truck-ramp-box',
            badgeClass: 'alert-info',
            text: '來源倉扣庫、目的倉增庫。<br>雙倉不可相同且數量不可超過在線可用存量。'
        },
        '盤盈': {
            icon: 'fa-solid fa-arrow-trend-up',
            badgeClass: 'alert-success',
            text: '實盤多於帳面，調增庫存現貨。<br>調整數量必須大於 0。'
        },
        '盤虧': {
            icon: 'fa-solid fa-arrow-trend-down',
            badgeClass: 'alert-danger',
            text: '實盤短少除帳，自庫存扣減。<br>扣減數量不可超過在線存量。'
        },
        '破損過期': {
            icon: 'fa-solid fa-triangle-exclamation',
            badgeClass: 'alert-accent',
            text: '包裝破損滲漏或過期除帳。<br>數量不可超過在線存量。'
        },
        '自用消耗': {
            icon: 'fa-solid fa-mug-hot',
            badgeClass: 'alert-warning',
            text: '雙領導核心自用免稅除帳。<br>數量不可超過在線存量。'
        },
        '試用發放': {
            icon: 'fa-solid fa-gift',
            badgeClass: 'alert-primary',
            text: '試用品體驗發放（必須指派 CRM 客戶追蹤轉化）。<br>數量不可超過在線存量。'
        },
        '拆盒解封': {
            icon: 'fa-solid fa-boxes-packing',
            badgeClass: 'alert-secondary',
            text: '整盒解封為散件現貨（整盒 -N，散件 +N*規格）。<br>必須以官方密封原裝盒為對象。'
        }
    };

    const config = ruleConfigs[type] || ruleConfigs['自用消耗'];
    $container.html(`
        <div class="alert ${config.badgeClass} py-1 px-2 mb-0 small d-flex align-items-center gap-1">
            <i class="${config.icon} me-1"></i>
            <div>${config.text}</div>
        </div>
    `);
}

/**
 * 調出倉在庫可用量即時動態比對反饋 (雙軌計量)
 */
function updateAdjustStockFeedback() {
    const prodCode = $('#fieldProductId').val();
    const whId = $('#fieldFromWarehouseId').val();
    const adjType = $('#fieldAdjType').val();
    const packMode = $('input[name="modalPackMode"]:checked').val() || 'BOX';
    const qty = parseInt($('#fieldQuantity').val(), 10) || 0;
    const reqQty = Math.abs(qty);

    let $fb = $('#adjStockFeedback');
    if (!$fb.length) {
        $fb = $('<div id="adjStockFeedback" class="small mt-1"></div>');
        $('#fieldProductId').closest('.col-12').append($fb);
    }
    $fb.empty();

    if (!prodCode || !whId) return;

    const prod = appState.products.find(p => p.product_code === prodCode || p.official_product_code === prodCode);
    const baseUnit = prod ? (prod.base_unit || '盒') : '盒';
    const subUnit = prod ? (prod.sub_unit || '件') : '件';

    // 依據表 302 最新 20 欄架構提取可用存量
    const matchedStocks = appState.stocks.filter(s => s.product_id === prodCode && s.warehouse_id === whId);
    const availBoxes = matchedStocks.reduce((sum, s) => sum + (s.available_qty !== undefined ? (parseInt(s.available_qty, 10) || 0) : (parseInt(s.quantity, 10) || 0)), 0);
    const availPieces = matchedStocks.reduce((sum, s) => sum + (s.available_pieces_qty !== undefined ? (parseInt(s.available_pieces_qty, 10) || 0) : (parseInt(s.pieces_qty, 10) || 0)), 0);

    $('#fieldProductId').data('avail-boxes', availBoxes).data('avail-pieces', availPieces);

    if (adjType === '盤盈') {
        $fb.html(`<span class="text-info"><i class="fa-solid fa-circle-info me-1"></i> 目前來源倉在庫：${availBoxes} ${baseUnit} / ${availPieces} ${subUnit}（盤盈將調增現貨）</span>`);
        return;
    }

    if (packMode === 'BOX') {
        if (availBoxes <= 0) {
            $fb.html(`<span class="text-danger fw-bold"><i class="fa-solid fa-circle-xmark me-1"></i> 來源倉無整${baseUnit}現貨 (可用: 0 ${baseUnit})！</span>`);
        } else if (reqQty > availBoxes) {
            $fb.html(`<span class="text-danger fw-bold"><i class="fa-solid fa-triangle-exclamation me-1"></i> 異動量 (${reqQty} ${baseUnit}) 超出可用量 (${availBoxes} ${baseUnit})！</span>`);
        } else {
            $fb.html(`<span class="text-success"><i class="fa-solid fa-circle-check me-1"></i> 來源倉現貨充裕 (可用: ${availBoxes} ${baseUnit})</span>`);
        }
    } else {
        if (availPieces <= 0) {
            $fb.html(`<span class="text-danger fw-bold"><i class="fa-solid fa-circle-xmark me-1"></i> 來源倉無散裝現貨 (可用: 0 ${subUnit})！</span>`);
        } else if (reqQty > availPieces) {
            $fb.html(`<span class="text-danger fw-bold"><i class="fa-solid fa-triangle-exclamation me-1"></i> 散件扣減量 (${reqQty} ${subUnit}) 超出可用散件 (${availPieces} ${subUnit})！</span>`);
        } else {
            $fb.html(`<span class="text-success"><i class="fa-solid fa-circle-check me-1"></i> 散裝現貨充足 (可用: ${availPieces} ${subUnit})</span>`);
        }
    }
}

// ==========================================================================
// 4. 生命週期與多表資料讀取引擎
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(GAS_DEPLOY_ID.PSI);
    }
    await initAdjustApp();
});

async function initAdjustApp() {
    if (isInitialized) return;
    isInitialized = true;

    initEvents();
    await fetchGoogleSheetsData();
}

async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i> 正在讀取雲端資料庫...', '載入中...');

    try {
        const [rawWarehouses, rawAdjustments, rawPersons, rawPartners, rawProducts, rawCustomers, rawStocks] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSI, SHEET_NAMES.WAREHOUSES).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSI, SHEET_NAMES.ADJUSTMENTS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSN, SHEET_NAMES.PERSONS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.ORG, SHEET_NAMES.PARTNERS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.PRODUCTS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.CRM, SHEET_NAMES.CUSTOMERS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSI, SHEET_NAMES.STOCKS).catch(() => [])
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
        $('#hudSyncTime').text(AppDate.now('full'));

        AppToast.success(`4 大試算表連動同步完成 (${appState.adjustments.length} 筆盤點調撥紀錄，${appState.stocks.length} 筆在庫存量)`);
    } catch (err) {
        console.error("試算表同步異常:", err);
        AppToast.error("部分試算表連線失敗，請檢查 4 大試算表共用設定");
    } finally {
        AppLoading.hide();
    }
}

function parseAllData(data) {
    // 1. 據點倉儲 (表 301)
    appState.warehouses = (data.rawWarehouses || []).map(r => ({
        id: getVal(r, 0),
        warehouse_name: getVal(r, 1),
        warehouse_type: getVal(r, 2, 'OFFICIAL_CENTER')
    })).filter(w => w.id !== '');

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
        leader_title: getVal(r, 3)
    })).filter(p => p.partner_id !== '');

    // 4. 客戶主檔 (表 401)
    appState.customers = (data.rawCustomers || []).map(r => ({
        customer_id: getVal(r, 0),
        person_id: getVal(r, 1),
        customer_type: getVal(r, 2, 'RETAIL')
    })).filter(c => c.customer_id !== '');

    // 5. 產品主檔 (表 101)
    appState.products = (data.rawProducts || []).map(r => {
        const isNewSchema = r.length >= 19;
        return {
            product_code: getVal(r, 0),
            region_code: getVal(r, 1, 'TW'),
            base_code: getVal(r, 2, ''),
            official_product_code: getVal(r, 0),
            name: getVal(r, 3, '未命名產品'),
            short_name: getVal(r, 4, ''),
            package_spec: getVal(r, 9, ''),
            piece_spec: getVal(r, 10, ''),
            base_unit: getVal(r, 12, '盒'),
            sub_unit: getVal(r, 13, ''),
            pieces_per_box: parseInt(getVal(r, 14, '1'), 10) || 1,
            allow_decant: getVal(r, 15, 'Y').toUpperCase() === 'N' ? 'N' : 'Y',
            price: isNewSchema ? (parseFloat(getVal(r, 16, '0')) || 0) : (parseFloat(getVal(r, 11, '0')) || 0),
            currency: isNewSchema ? getVal(r, 17, 'TWD') : getVal(r, 12, 'TWD'),
            sv_point: isNewSchema ? (parseFloat(getVal(r, 18, '0')) || 0) : (parseFloat(getVal(r, 13, '0')) || 0)
        };
    }).filter(p => p.product_code !== '');

    // 6. 庫存主檔 (表 302: psi_stocks，升級對齊最新 20 欄物理結構)
    appState.stocks = (data.rawStocks || []).map(r => {
        const qty = parseInt(getVal(r, 5, '0'), 10) || 0;
        const pieces = parseInt(getVal(r, 6, '0'), 10) || 0;
        const resQty = parseInt(getVal(r, 7, '0'), 10) || 0;
        const resPieces = parseInt(getVal(r, 8, '0'), 10) || 0;
        const availQty = parseInt(getVal(r, 9, String(Math.max(0, qty - resQty))), 10) || Math.max(0, qty - resQty);
        const availPieces = parseInt(getVal(r, 10, String(Math.max(0, pieces - resPieces))), 10) || Math.max(0, pieces - resPieces);

        return {
            id: getVal(r, 0),
            warehouse_id: getVal(r, 1),
            product_id: getVal(r, 2),
            batch_no: getVal(r, 3),
            expiry_date: getVal(r, 4),
            quantity: qty,
            pieces_qty: pieces,
            reserved_qty: resQty,
            reserved_pieces_qty: resPieces,
            available_qty: availQty,
            available_pieces_qty: availPieces,
            currency_code: getVal(r, 11, 'TWD'),
            cost_price: parseFloat(getVal(r, 12, '0')) || 0,
            sv_point: parseFloat(getVal(r, 13, '0')) || 0,
            is_locked: getVal(r, 14, 'N'),
            remarks: getVal(r, 15, ''),
            created_by: getVal(r, 16, 'SYSTEM'),
            created_at: getVal(r, 17, ''),
            modified_by: getVal(r, 18, 'SYSTEM'),
            modified_at: getVal(r, 19, '')
        };
    }).filter(s => s.id !== '');

    // 7. 盤點調撥 (表 307: psi_adjustments, 0~24 實體欄位順序)
    appState.adjustments = (data.rawAdjustments || []).map(r => {
        const qty = parseInt(getVal(r, 11, '0'), 10) || 0;
        const unitCost = parseFloat(getVal(r, 13, '0')) || 0;
        const rawTotalCost = getVal(r, 14);
        const totalCost = (rawTotalCost !== '') ? (parseFloat(rawTotalCost) || 0) : AppCalc.multiply(Math.abs(qty), unitCost, 2);

        const unitSv = parseFloat(getVal(r, 15, '0')) || 0;
        const rawTotalSv = getVal(r, 16);
        const totalSv = (rawTotalSv !== '') ? (parseFloat(rawTotalSv) || 0) : AppCalc.multiply(Math.abs(qty), unitSv, 2);

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
// 5. 核心庫存連動寫入引擎 (表 302 psi_stocks 即時同步)
// ==========================================================================
/**
 * 將盤點調撥單據實體套用至庫存主檔 (支援逆向回滾 isReversal)
 */
async function syncAdjustmentToStocks(adj, isReversal = false) {
    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');
    const isBox = isMasterPackUnit(adj.adj_unit, adj.product_id, adj.official_product_code);
    const absQty = Math.abs(adj.quantity);
    const prod = appState.products.find(p => p.product_code === adj.product_id || p.official_product_code === adj.product_id);
    const piecesPerBox = prod ? (parseInt(prod.pieces_per_box, 10) || 1) : 1;

    // === 業務場景 1：拆盒解封 ===
    if (adj.adj_type === '拆盒解封') {
        let stock = appState.stocks.find(s => s.id === adj.stock_id);
        if (!stock) {
            stock = appState.stocks.find(s => s.warehouse_id === adj.from_warehouse_id && s.product_id === adj.product_id && s.batch_no === adj.batch_no);
        }
        if (!stock) throw new Error(`找不到欲拆盒解封之庫存批號實體【${adj.stock_id || adj.product_id}】！`);

        const piecesGained = AppCalc.multiply(absQty, piecesPerBox, 0);

        if (!isReversal) {
            stock.quantity = AppCalc.sub(stock.quantity, absQty);
            stock.pieces_qty = AppCalc.add(stock.pieces_qty, piecesGained);
        } else {
            stock.quantity = AppCalc.add(stock.quantity, absQty);
            stock.pieces_qty = AppCalc.sub(stock.pieces_qty, piecesGained);
        }

        stock.available_qty = Math.max(0, stock.quantity - (stock.reserved_qty || 0));
        stock.available_pieces_qty = Math.max(0, stock.pieces_qty - (stock.reserved_pieces_qty || 0));
        stock.modified_by = currentUser;
        stock.modified_at = nowStr;

        await SheetAdapter.updateRow(SHEET_NAMES.STOCKS, stock.id, formatStockRowData(stock), GAS_DEPLOY_ID.PSI);
        return;
    }

    // === 業務場景 2：跨倉調撥 ===
    if (adj.adj_type === '跨倉調撥') {
        // 1. 調出倉扣減 (From Warehouse)
        let fromStock = appState.stocks.find(s => s.id === adj.stock_id) ||
                        appState.stocks.find(s => s.warehouse_id === adj.from_warehouse_id && s.product_id === adj.product_id && s.batch_no === adj.batch_no);

        if (fromStock) {
            if (isBox) {
                fromStock.quantity = !isReversal ? AppCalc.sub(fromStock.quantity, absQty) : AppCalc.add(fromStock.quantity, absQty);
            } else {
                fromStock.pieces_qty = !isReversal ? AppCalc.sub(fromStock.pieces_qty, absQty) : AppCalc.add(fromStock.pieces_qty, absQty);
            }
            fromStock.available_qty = Math.max(0, fromStock.quantity - (fromStock.reserved_qty || 0));
            fromStock.available_pieces_qty = Math.max(0, fromStock.pieces_qty - (fromStock.reserved_pieces_qty || 0));
            fromStock.modified_by = currentUser;
            fromStock.modified_at = nowStr;

            await SheetAdapter.updateRow(SHEET_NAMES.STOCKS, fromStock.id, formatStockRowData(fromStock), GAS_DEPLOY_ID.PSI);
        }

        // 2. 調入倉增補 (To Warehouse)
        let toStock = appState.stocks.find(s => s.warehouse_id === adj.to_warehouse_id && s.product_id === adj.product_id && s.batch_no === adj.batch_no);

        if (toStock) {
            if (isBox) {
                toStock.quantity = !isReversal ? AppCalc.add(toStock.quantity, absQty) : AppCalc.sub(toStock.quantity, absQty);
            } else {
                toStock.pieces_qty = !isReversal ? AppCalc.add(toStock.pieces_qty, absQty) : AppCalc.sub(toStock.pieces_qty, absQty);
            }
            toStock.available_qty = Math.max(0, toStock.quantity - (toStock.reserved_qty || 0));
            toStock.available_pieces_qty = Math.max(0, toStock.pieces_qty - (toStock.reserved_pieces_qty || 0));
            toStock.modified_by = currentUser;
            toStock.modified_at = nowStr;

            await SheetAdapter.updateRow(SHEET_NAMES.STOCKS, toStock.id, formatStockRowData(toStock), GAS_DEPLOY_ID.PSI);
        } else if (!isReversal) {
            const boxEquivalentCost = (!isBox && piecesPerBox > 1)
                ? AppCalc.multiply(adj.unit_cost, piecesPerBox, 2)
                : (adj.unit_cost || 0);
            const newStockId = generateNextStockId(adj.adj_date);
            const newStockObj = {
                id: newStockId,
                warehouse_id: adj.to_warehouse_id,
                product_id: adj.product_id,
                batch_no: adj.batch_no || `LOT${AppDate.toClean6(adj.adj_date)}A`,
                expiry_date: adj.expiry_date || AppDate.toSheet(AppDate.addYears(new Date(), 2)),
                quantity: isBox ? absQty : 0,
                pieces_qty: !isBox ? absQty : 0,
                reserved_qty: 0,
                reserved_pieces_qty: 0,
                available_qty: isBox ? absQty : 0,
                available_pieces_qty: !isBox ? absQty : 0,
                currency_code: adj.currency_code || 'TWD',
                cost_price: boxEquivalentCost, // ★ 確保寫入表 302 的 cost_price 永遠對齊整盒成本
                sv_point: adj.unit_sv || 0,
                is_locked: 'N',
                remarks: `源自調撥單【${adj.id}】調入據點`,
                created_by: currentUser,
                created_at: nowStr,
                modified_by: currentUser,
                modified_at: nowStr
            };

            await SheetAdapter.createRow(SHEET_NAMES.STOCKS, newStockId, formatStockRowData(newStockObj), GAS_DEPLOY_ID.PSI);
            appState.stocks.unshift(newStockObj);
        }
        return;
    }

    // === 業務場景 3：盤盈 ===
    if (adj.adj_type === '盤盈') {
        let stock = appState.stocks.find(s => s.id === adj.stock_id) ||
                    appState.stocks.find(s => s.warehouse_id === adj.from_warehouse_id && s.product_id === adj.product_id && s.batch_no === adj.batch_no);

        if (stock) {
            if (isBox) {
                stock.quantity = !isReversal ? AppCalc.add(stock.quantity, absQty) : AppCalc.sub(stock.quantity, absQty);
            } else {
                stock.pieces_qty = !isReversal ? AppCalc.add(stock.pieces_qty, absQty) : AppCalc.sub(stock.pieces_qty, absQty);
            }
            stock.available_qty = Math.max(0, stock.quantity - (stock.reserved_qty || 0));
            stock.available_pieces_qty = Math.max(0, stock.pieces_qty - (stock.reserved_pieces_qty || 0));
            stock.modified_by = currentUser;
            stock.modified_at = nowStr;

            await SheetAdapter.updateRow(SHEET_NAMES.STOCKS, stock.id, formatStockRowData(stock), GAS_DEPLOY_ID.PSI);
        } else if (!isReversal) {
            const newStockId = generateNextStockId(adj.adj_date);
            const newStockObj = {
                id: newStockId,
                warehouse_id: adj.from_warehouse_id,
                product_id: adj.product_id,
                batch_no: adj.batch_no || `LOT${AppDate.toClean6(adj.adj_date)}A`,
                expiry_date: adj.expiry_date || AppDate.toSheet(AppDate.addYears(new Date(), 2)),
                quantity: isBox ? absQty : 0,
                pieces_qty: !isBox ? absQty : 0,
                reserved_qty: 0,
                reserved_pieces_qty: 0,
                available_qty: isBox ? absQty : 0,
                available_pieces_qty: !isBox ? absQty : 0,
                currency_code: adj.currency_code || 'TWD',
                cost_price: adj.unit_cost || 0,
                sv_point: adj.unit_sv || 0,
                is_locked: 'N',
                remarks: `源自盤盈單【${adj.id}】建立現貨`,
                created_by: currentUser,
                created_at: nowStr,
                modified_by: currentUser,
                modified_at: nowStr
            };

            await SheetAdapter.createRow(SHEET_NAMES.STOCKS, newStockId, formatStockRowData(newStockObj), GAS_DEPLOY_ID.PSI);
            appState.stocks.unshift(newStockObj);
        }
        return;
    }

    // === 業務場景 4：盤虧、破損過期、自用消耗、試用發放 ===
    let stock = appState.stocks.find(s => s.id === adj.stock_id) ||
                appState.stocks.find(s => s.warehouse_id === adj.from_warehouse_id && s.product_id === adj.product_id && s.batch_no === adj.batch_no);

    if (stock) {
        if (isBox) {
            stock.quantity = !isReversal ? AppCalc.sub(stock.quantity, absQty) : AppCalc.add(stock.quantity, absQty);
        } else {
            stock.pieces_qty = !isReversal ? AppCalc.sub(stock.pieces_qty, absQty) : AppCalc.add(stock.pieces_qty, absQty);
        }
        stock.available_qty = Math.max(0, stock.quantity - (stock.reserved_qty || 0));
        stock.available_pieces_qty = Math.max(0, stock.pieces_qty - (stock.reserved_pieces_qty || 0));
        stock.modified_by = currentUser;
        stock.modified_at = nowStr;

        await SheetAdapter.updateRow(SHEET_NAMES.STOCKS, stock.id, formatStockRowData(stock), GAS_DEPLOY_ID.PSI);
    }
}

// ==========================================================================
// 6. 畫面渲染中樞
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
    const nonOfficialWarehouseFilter = w => {
        const type = String(w.warehouse_type || '').toUpperCase();
        return !type.includes('官方') && !type.includes('OFFICIAL') && w.id !== 'WH-TW-TP' && w.id !== 'WH-TW-KH';
    };

    UISelectOptions.warehouse.populate({
        target: '#filterFromWarehouse',
        warehouses: appState.warehouses,
        placeholder: '全部調出倉',
        selectedValue: appState.filters.fromWh === 'ALL' ? '' : appState.filters.fromWh,
        displayMode: 1,
        searchable: true,
        filterFn: nonOfficialWarehouseFilter
    });

    UISelectOptions.warehouse.populate({
        target: '#filterToWarehouse',
        warehouses: appState.warehouses,
        placeholder: '全部調入倉',
        selectedValue: appState.filters.toWh === 'ALL' ? '' : appState.filters.toWh,
        displayMode: 1,
        searchable: true,
        filterFn: nonOfficialWarehouseFilter
    });

    UISelectOptions.product.populate({
        target: '#filterProduct',
        products: appState.products,
        placeholder: '全部產品品項',
        selectedValue: appState.filters.productId === 'ALL' ? '' : appState.filters.productId,
        searchable: true
    });

    UISelectOptions.partner.populate({
        target: '#filterOperator',
        partners: appState.partners,
        persons: appState.persons,
        placeholder: '全部經手夥伴',
        selectedValue: appState.filters.operatorId === 'ALL' ? '' : appState.filters.operatorId,
        searchable: true
    });

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

    UISelectOptions.partner.populate({
        target: '#fieldOperatorPartnerId',
        partners: appState.partners,
        persons: appState.persons,
        placeholder: '-- 請選擇經手夥伴 --',
        dropdownParent: '#adjustModal'
    });

    UISelectOptions.warehouse.populate({
        target: '#fieldFromWarehouseId',
        warehouses: appState.warehouses,
        placeholder: '-- 請選擇調出/發生倉儲 --',
        displayMode: 1,
        searchable: true,
        dropdownParent: '#adjustModal',
        filterFn: nonOfficialWarehouseFilter
    });

    UISelectOptions.warehouse.populate({
        target: '#fieldToWarehouseId',
        warehouses: appState.warehouses,
        placeholder: '-- 單倉異動無須填寫 --',
        displayMode: 1,
        searchable: true,
        dropdownParent: '#adjustModal'
    });

    UISelectOptions.product.populate({
        target: '#fieldProductId',
        products: appState.products,
        placeholder: '-- 請選擇產品品項 --',
        dropdownParent: '#adjustModal'
    });

    UISelectOptions.customer.populate({
        target: '#fieldTargetProspectId',
        customers: appState.customers,
        persons: appState.persons,
        placeholder: '-- 非試用發放無須選擇 --',
        dropdownParent: '#adjustModal'
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
    $('#statUnboxingQty').text(`${unboxingQty.toLocaleString()} 盒解封`);
}

function renderAdjustmentsTable() {
    const filtered = getFilteredAdjustments();
    const formatted = filtered.map(a => {
        const typeBadge = UIBadges.psi.adjustType(a.adj_type);
        const operatorResolved = EntityResolver.partner(a.operator_partner_id, appState.partners, appState.persons, 1);
        const prospectResolved = a.target_prospect_id ? EntityResolver.customer(a.target_prospect_id, appState.customers, appState.persons, 1) : '';
        const svDisplay = `${AppCalc.formatSV(a.total_sv, 'INTERNAL')} SV`;

        const qtyTag = a.quantity > 0 
            ? `<span class="fw-bold text-success">+${a.quantity}</span>` 
            : (a.quantity < 0 ? `<span class="fw-bold text-danger">${a.quantity}</span>` : `<span class="fw-bold text-info">0</span>`);

        const actionButtons = `
            <div class="d-flex align-items-center justify-content-center gap-1">
                <button class="btn btn-sm btn-outline-info" title="查看詳細資料" onclick="openAdjustmentDetailModal('${a.id}')">
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
                    <span class="text-white">${EntityResolver.warehouse(a.from_warehouse_id, appState.warehouses, 1)}</span>
                    ${a.to_warehouse_id ? `<div class="text-info small mt-1"><i class="fa-solid fa-arrow-down-long me-1"></i> ${EntityResolver.warehouse(a.to_warehouse_id, appState.warehouses, 1)}</div>` : ''}
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
                    <div class="text-orange fw-bold">${formatCurrency(a.total_cost, a.currency_code)}</div>
                </div>
            `,
            sv_breakdown: `<span class="text-teal fw-bold">${svDisplay}</span>`,
            parties: `
                <div>
                    <div class="text-white fw-bold"><i class="fa-solid fa-user-shield text-primary me-1"></i> ${operatorResolved}</div>
                    ${prospectResolved ? `<div class="small text-info"><i class="fa-solid fa-user text-warning me-1"></i> 對象：${prospectResolved}</div>` : ''}
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
        const operatorResolved = EntityResolver.partner(t.operator_partner_id, appState.partners, appState.persons, 1);

        const actionButtons = `
            <div class="d-flex align-items-center justify-content-center gap-1">
                <button class="btn btn-sm btn-outline-info" title="查看詳細資料" onclick="openAdjustmentDetailModal('${t.id}')">
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
                    <span class="text-white">${EntityResolver.warehouse(t.from_warehouse_id, appState.warehouses, 1)}</span>
                    <div class="text-info small mt-1"><i class="fa-solid fa-arrow-down-long me-1"></i> ${EntityResolver.warehouse(t.to_warehouse_id, appState.warehouses, 1) || '未指定'}</div>
                </div>
            `,
            product: `
                <div>
                    <div class="fw-bold text-white">${t.product_name_snaps || '-'}</div>
                    <span class="text-primary-emphasis small">批號：${t.batch_no || '-'}</span>
                </div>
            `,
            quantity: `<span class="text-info">${Math.abs(t.quantity)} ${t.adj_unit}</span>`,
            cost: `<span class="text-orange fw-bold">${formatCurrency(t.total_cost, t.currency_code)}</span>`,
            sv: `<span class="text-teal fw-bold">${AppCalc.formatSV(t.total_sv, 'INTERNAL')} SV</span>`,
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

function openAdjustmentDetailModal(adjId) {
    const item = appState.adjustments.find(a => a.id === adjId);
    if (!item) {
        AppToast.warning("找不到該筆單據資料！");
        return;
    }

    const typeBadge = UIBadges.psi.adjustType(item.adj_type);
    const operatorName = EntityResolver.partner(item.operator_partner_id, appState.partners, appState.persons, 1);
    const prospectName = item.target_prospect_id ? EntityResolver.customer(item.target_prospect_id, appState.customers, appState.persons, 1) : '無';
    const fromWh = EntityResolver.warehouse(item.from_warehouse_id, appState.warehouses, 1);
    const toWh = item.to_warehouse_id ? EntityResolver.warehouse(item.to_warehouse_id, appState.warehouses, 1) : '無 (單倉異動)';

    const qtyDisplay = (item.quantity > 0 ? `+${item.quantity.toLocaleString()}` : item.quantity.toLocaleString()) + ` ${item.adj_unit}`;
    const costDisplay = formatCurrency(item.total_cost, item.currency_code);
    const unitCostDisplay = formatCurrency(item.unit_cost, item.currency_code);
    const svDisplay = `${AppCalc.formatSV(item.total_sv, 'INTERNAL')} SV`;
    const unitSvDisplay = `${AppCalc.formatSV(item.unit_sv, 'INTERNAL')} SV`;

    const html = `
        <article class="card p-3 mb-3 border-secondary border-opacity-25">
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
                <span class="text-info-emphasis fw-bold">${item.stock_id || '-'}</span>
            </div>
        </article>

        <article class="card p-3 mb-3 border-secondary border-opacity-25">
            <h6 class="fw-bold text-white mb-3 d-flex align-items-center gap-2 border-bottom border-secondary border-opacity-25 pb-2">
                <i class="fa-solid fa-boxes-stacked text-primary me-1"></i> 異動物資品項明細
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
                <i class="fa-solid fa-warehouse text-info me-1"></i> 倉儲流轉與經手資訊
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
                <i class="fa-solid fa-calculator text-warning me-1"></i> 成本損益與 SV 結算
            </h6>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">成本單價</div>
                <div class="col-7 text-yellow text-end">${unitCostDisplay}</div>
            </div>
            <div class="row g-2 mb-2">
                <div class="col-5 text-secondary small">成本總損益 / 額度</div>
                <div class="col-7 text-orange fw-bold text-end">${costDisplay}</div>
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
                <i class="fa-solid fa-comment-dots text-secondary me-1"></i> 詳細事由與物流說明
            </h6>
            <div class="text-light small p-2 rounded" style="background: rgba(10, 5, 18, 0.4);">
                ${item.reason_desc || '未填寫詳細說明'}
            </div>
            <div class="text-secondary small mt-2 pt-2 border-top border-secondary border-opacity-10 d-flex justify-content-between">
                <span>建立：${item.created_by || 'SYSTEM'} @ ${item.created_at || item.adj_date || '-'}</span>
                <span>異動：${item.modified_by || 'SYSTEM'} @ ${item.modified_at || '-'}</span>
            </div>
        </article>
    `;

    $('#modalAdjustDetailBody').html(html);

    $('#btnDetailEditModal').off('click').on('click', function () {
        const detailModalEl = document.getElementById('modalAdjustDetail');
        const detailModalInst = bootstrap.Modal.getInstance(detailModalEl);
        if (detailModalInst) detailModalInst.hide();
        openEditAdjustmentModal(item.id);
    });

    new bootstrap.Modal(document.getElementById('modalAdjustDetail')).show();
}

function renderCharts() {
    Object.keys(appState.chartInstances).forEach(k => {
        if (appState.chartInstances[k]) {
            appState.chartInstances[k].destroy();
            appState.chartInstances[k] = null;
        }
    });

    const adjustments = getFilteredAdjustments();

    // 1. 跨倉調撥流通月度趨勢 (折線雙軸)
    const ctxTransfer = document.getElementById('chartTransferFlow');
    if (ctxTransfer) {
        const transferMonthMap = {};
        const lossCostMonthMap = {};

        adjustments.filter(a => a.adj_type === '跨倉調撥').forEach(t => {
            const m = (t.adj_date || '').slice(0, 7) || '未分類';
            transferMonthMap[m] = AppCalc.add(transferMonthMap[m] || 0, Math.abs(t.quantity));
        });

        adjustments.filter(a => a.adj_type === '盤虧' || a.adj_type === '破損過期').forEach(l => {
            const m = (l.adj_date || '').slice(0, 7) || '未分類';
            lossCostMonthMap[m] = AppCalc.add(lossCostMonthMap[m] || 0, parseFloat(l.total_cost) || 0);
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
                        label: '盤損與報廢成本 (NT$)',
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
                    x: { ticks: { color: '#f5f3ff' }, grid: { color: 'rgba(139, 92, 246, 0.1)' } },
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
                    legend: { labels: { color: '#f5f3ff', font: { size: 12 } } }
                }
            }
        });
    }

    // 2. 各據點異動熱度 (調出 / 調入)
    const ctxWh = document.getElementById('chartWarehouseActivity');
    if (ctxWh) {
        const whOutMap = {};
        const whInMap = {};

        adjustments.forEach(a => {
            const qty = Math.abs(a.quantity);
            if (a.from_warehouse_id) {
                const fromName = EntityResolver.warehouse(a.from_warehouse_id, appState.warehouses, 1) || a.from_warehouse_id;
                whOutMap[fromName] = AppCalc.add(whOutMap[fromName] || 0, qty);
            }
            if (a.to_warehouse_id) {
                const toName = EntityResolver.warehouse(a.to_warehouse_id, appState.warehouses, 1) || a.to_warehouse_id;
                whInMap[toName] = AppCalc.add(whInMap[toName] || 0, qty);
            }
        });

        const allWhNames = Array.from(new Set([...Object.keys(whOutMap), ...Object.keys(whInMap)]));
        const labels = allWhNames.length ? allWhNames : ['無據點數據'];

        appState.chartInstances.whActivity = new Chart(ctxWh, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '調出 / 損耗扣減 (盒)',
                        data: allWhNames.length ? allWhNames.map(name => whOutMap[name] || 0) : [0],
                        backgroundColor: 'rgba(251, 113, 133, 0.85)',
                        borderColor: '#fb7185',
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: '調入 / 增補庫存 (盒)',
                        data: allWhNames.length ? allWhNames.map(name => whInMap[name] || 0) : [0],
                        backgroundColor: 'rgba(56, 189, 248, 0.85)',
                        borderColor: '#38bdf8',
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        ticks: { color: '#f5f3ff' },
                        grid: { color: 'rgba(139, 92, 246, 0.08)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#f5f3ff',
                            precision: 0,
                            callback: v => `${v.toLocaleString()} 盒`
                        },
                        grid: { color: 'rgba(139, 92, 246, 0.12)' }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#f5f3ff', font: { size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.dataset.label}：${Number(ctx.parsed.y || 0).toLocaleString()} 盒`
                        }
                    }
                }
            }
        });
    }

    // 3. 異動類型佔比分佈 (甜甜圈)
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
                    legend: { position: 'bottom', labels: { color: '#f5f3ff', boxWidth: 8, font: { size: 12 } } }
                }
            }
        });
    }

    // 4. 損耗成本品項分佈佔比
    const ctxLossPrd = document.getElementById('chartLossPrd');
    if (ctxLossPrd) {
        const lossMap = {};
        adjustments
            .filter(a => a.adj_type === '盤虧' || a.adj_type === '破損過期')
            .forEach(a => {
                const name = a.product_name_snaps || a.official_product_code || a.product_id || '未命名品項';
                lossMap[name] = AppCalc.add(lossMap[name] || 0, parseFloat(a.total_cost) || 0);
            });

        const labels = Object.keys(lossMap);
        const data = labels.map(k => lossMap[k]);
        const totalLoss = data.reduce((sum, v) => AppCalc.add(sum, v), 0);
        const colors = ['#fb7185', '#f43f5e', '#e11d48', '#be123c', '#fda4af', '#fecdd3'];

        appState.chartInstances.lossTopPrd = new Chart(ctxLossPrd, {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['無損耗數據'],
                datasets: [{
                    data: totalLoss > 0 ? data : [1],
                    backgroundColor: totalLoss > 0 ? colors.slice(0, labels.length) : ['#334155'],
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
                        labels: { color: '#f5f3ff', boxWidth: 8, font: { size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const val = ctx.parsed || 0;
                                const pct = totalLoss > 0 ? ((val / totalLoss) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：NT$ ${Number(val).toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 5. 試用發放 vs 自用消耗成本
    const ctxCostDist = document.getElementById('chartCostDistribution');
    if (ctxCostDist) {
        let demoCost = 0;
        let personalCost = 0;

        adjustments.forEach(a => {
            const cost = parseFloat(a.total_cost) || 0;
            if (a.adj_type === '試用發放') {
                demoCost = AppCalc.add(demoCost, cost);
            } else if (a.adj_type === '自用消耗') {
                personalCost = AppCalc.add(personalCost, cost);
            }
        });

        const totalCost = AppCalc.add(demoCost, personalCost);
        const labels = ['試用發放 (推廣轉化)', '自用消耗 (團隊免稅)'];
        const data = [demoCost, personalCost];

        appState.chartInstances.svDist = new Chart(ctxCostDist, {
            type: 'doughnut',
            data: {
                labels: totalCost > 0 ? labels : ['無發放/消耗數據'],
                datasets: [{
                    data: totalCost > 0 ? data : [1],
                    backgroundColor: totalCost > 0 ? ['#fbbf24', '#c084fc'] : ['#334155'],
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
                        labels: { color: '#f5f3ff', boxWidth: 8, font: { size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const val = ctx.parsed || 0;
                                const pct = totalCost > 0 ? ((val / totalCost) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：NT$ ${Number(val).toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 6. 跨倉調撥品項流通佔比
    const ctxTransferPrd = document.getElementById('chartTransferPrd');
    if (ctxTransferPrd) {
        const transferMap = {};
        adjustments
            .filter(a => a.adj_type === '跨倉調撥')
            .forEach(a => {
                const name = a.product_name_snaps || a.official_product_code || a.product_id || '未命名品項';
                transferMap[name] = AppCalc.add(transferMap[name] || 0, Math.abs(a.quantity));
            });

        const labels = Object.keys(transferMap);
        const data = labels.map(k => transferMap[k]);
        const totalTransfer = data.reduce((sum, v) => AppCalc.add(sum, v), 0);
        const colors = ['#34d399', '#38bdf8', '#fbbf24', '#c084fc', '#a78bfa', '#2dd4bf'];

        appState.chartInstances.transferTopPrd = new Chart(ctxTransferPrd, {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['無調撥數據'],
                datasets: [{
                    data: totalTransfer > 0 ? data : [1],
                    backgroundColor: totalTransfer > 0 ? colors.slice(0, labels.length) : ['#334155'],
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
                        labels: { color: '#f5f3ff', boxWidth: 8, font: { size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const val = ctx.parsed || 0;
                                const pct = totalTransfer > 0 ? ((val / totalTransfer) * 100).toFixed(1) : '0.0';
                                return ` ${ctx.label}：${Number(val).toLocaleString()} 盒 (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// ==========================================================================
// 7. 互動事件管理與計算
// ==========================================================================
function initEvents() {
    $('input[name="modalPackMode"]').on('change', function () {
        const selectedMode = $(this).val();
        const adjType = $('#fieldAdjType').val();

        if (adjType === '拆盒解封' && selectedMode === 'PIECE') {
            AppToast.warning("「拆盒解封」必須以密封整盒為對象，不可選擇「散裝拆零」！");
            $('#modalPackModeBox').prop('checked', true);
            return;
        }

        handleModalProductChange();
        updateAdjustStockFeedback();
    });

    $('#fieldFromWarehouseId').on('change', function () {
        const whId = $(this).val();
        const currentProd = $('#fieldProductId').val();
        populateAdjustProductSelectWithStock('#fieldProductId', whId, currentProd, '#adjustModal');
        updateAdjustStockFeedback();
    });

    $('#fieldQuantity').on('input change', function () {
        calculateModalTotals();
        updateAdjustStockFeedback();
    });

    $('input[name="auditPackMode"]').on('change', function () {
        loadProductStockForAudit();
    });

    $('input[name="trPackMode"]').on('change', function () {
        loadProductStockForTransfer();
    });

    $('#auditWarehouseSelect').on('change', function () {
        const whId = $(this).val();
        populateAdjustProductSelectWithStock('#auditProductSelect', whId, '', '#modalAuditWorkbench');
        loadProductStockForAudit();
    });

    $('#trFromWarehouseSelect').on('change', function () {
        const whId = $(this).val();
        populateAdjustProductSelectWithStock('#trProductSelect', whId, '', '#modalTransferWorkbench');
        loadProductStockForTransfer();
    });

    $('#trQtyInput').on('change input', function () {
        updateTransferCostCalc();
    });

    $('#adjustViewTabs button[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        const targetId = $(e.target).attr('data-bs-target');
        if (targetId === '#container-audit-view') {
            if (dtAdjustmentsInstance) setTimeout(() => dtAdjustmentsInstance.columns.adjust().draw(false), 100);
        } else if (targetId === '#container-transfer-view') {
            if (dtTransfersInstance) setTimeout(() => dtTransfersInstance.columns.adjust().draw(false), 100);
        } else if (targetId === '#container-charts-view') {
            renderCharts();
        }
    });

    $('#filterStartDate, #filterEndDate, #filterFromWarehouse, #filterToWarehouse, #filterProduct, #filterOperator').on('change input', function () {
        appState.filters.startDate = $('#filterStartDate').val() || '';
        appState.filters.endDate = $('#filterEndDate').val() || '';
        appState.filters.fromWh = $('#filterFromWarehouse').val() || 'ALL';
        appState.filters.toWh = $('#filterToWarehouse').val() || 'ALL';
        appState.filters.productId = $('#filterProduct').val() || 'ALL';
        appState.filters.operatorId = $('#filterOperator').val() || 'ALL';

        renderMetrics();
        renderAdjustmentsTable();
        renderTransfersTable();
        if ($('#container-charts-view').hasClass('active')) {
            renderCharts();
        }
    });
}

function calculateAuditVariance() {
    const bookQty = parseInt($('#auditValBookQty').text(), 10) || 0;
    const physicalQty = parseInt($('#auditInputPhysicalQty').val(), 10) || 0;
    const diff = AppCalc.sub(physicalQty, bookQty);

    const unitCost = parseFloat($('#auditInputUnitCost').val()) || 0;
    const unitSv = parseFloat($('#auditInputUnitSv').val()) || 0;
    const currency = $('#auditInputCurrency').val() || 'TWD';

    const totalCost = AppCalc.multiply(Math.abs(diff), unitCost, 2);
    const totalSv = AppCalc.multiply(Math.abs(diff), unitSv, 2);

    const $tag = $('#auditTagVarianceStatus');
    const $lblCost = $('#auditLblVarianceCost');
    const $lblSv = $('#auditLblVarianceSv');
    const $reasonBox = $('#auditReasonContainer');

    if (diff === 0) {
        $tag.attr('class', 'fw-bold text-info').html('<i class="fa-solid fa-check me-1"></i> 帳實相符 (0)');
        $lblCost.text(formatCurrency(0, currency));
        $lblSv.text('0 SV');
        $reasonBox.addClass('d-none');
    } else if (diff < 0) {
        $tag.attr('class', 'fw-bold text-danger').html(`<i class="fa-solid fa-triangle-exclamation me-1"></i> 盤虧短少 (${diff})`);
        $lblCost.text(`-${formatCurrency(totalCost, currency)}`);
        $lblSv.text(`-${AppCalc.formatSV(totalSv, 'INTERNAL')} SV`);
        $reasonBox.removeClass('d-none');
        $('#auditSelAdjType').val('盤虧');
    } else {
        $tag.attr('class', 'fw-bold text-success').html(`<i class="fa-solid fa-plus me-1"></i> 盤盈溢出 (+${diff})`);
        $lblCost.text(`+${formatCurrency(totalCost, currency)}`);
        $lblSv.text(`+${AppCalc.formatSV(totalSv, 'INTERNAL')} SV`);
        $reasonBox.removeClass('d-none');
        $('#auditSelAdjType').val('盤盈');
    }
}

function loadProductStockForAudit() {
    const prodCode = $('#auditProductSelect').val();
    const currentWh = $('#auditWarehouseSelect').val();

    if (!prodCode) {
        $('#auditInputProductName').val('');
        $('#auditInputBatchNo').val('-');
        $('#auditInputCurrency').val('TWD');
        $('#auditInputCurrencyText').text('TWD');
        $('#auditInputUnitCost').val(0);
        $('#auditInputUnitSv').val(0);
        $('#auditValBookQty').html('0 <span class="fs-6" id="auditLblBookUnit">盒</span>');
        $('#auditAdjUnit').val('盒');
        $('#auditAdjUnitText').text('盒');
        $('#auditLblProductCode').text('-');
        $('#auditInputPhysicalQty').val(0);
        calculateAuditVariance();
        return;
    }

    const prod = appState.products.find(p => p.product_code === prodCode || p.official_product_code === prodCode);
    const packMode = $('input[name="auditPackMode"]:checked').val() || 'BOX';
    const targetUnit = (packMode === 'PIECE') ? (prod ? prod.sub_unit || '支' : '支') : (prod ? prod.base_unit || '盒' : '盒');

    const spec = AppCalc.deriveLooseSpec(prod, targetUnit);
    const prodName = prod ? prod.name : '-';
    const officialCode = prod ? prod.product_code : prodCode;
    const currency = (prod && (prod.region_code === 'MY' || String(prod.product_code).startsWith('MY'))) ? 'MYR' : 'TWD';

    const matchedStock = appState.stocks
        .filter(s => s.product_id === prodCode && s.warehouse_id === currentWh && s.available_qty > 0)
        .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'))[0]
        || appState.stocks.find(s => s.product_id === prodCode && s.warehouse_id === currentWh)
        || appState.stocks.find(s => s.product_id === prodCode);

    const batchNo = matchedStock ? matchedStock.batch_no : `LOT${AppDate.toClean6()}A`;
    const bookQty = matchedStock ? (packMode === 'PIECE' ? (matchedStock.pieces_qty || 0) : matchedStock.quantity) : 0;

    $('#auditProductSelect')
        .data('stock-id', matchedStock ? matchedStock.id : '')
        .data('expiry-date', matchedStock ? matchedStock.expiry_date : '');

    $('#auditInputProductName').val(prodName);
    $('#auditInputBatchNo').val(batchNo);
    $('#auditLblProductCode').text(officialCode);

    $('#auditAdjUnit').val(targetUnit);
    $('#auditAdjUnitText').text(targetUnit);
    $('#auditInputCurrency').val(currency);
    $('#auditInputCurrencyText').text(currency);

    $('#auditInputUnitCost').val(spec.unitPrice || spec.unitCost || (prod ? prod.price : 0));
    $('#auditInputUnitSv').val(spec.unitSV || (prod ? prod.sv_point : 0));

    $('#auditValBookQty').html(`${bookQty} <span class="fs-6" id="auditLblBookUnit">${targetUnit}</span>`);
    $('#auditInputPhysicalQty').val(bookQty);

    calculateAuditVariance();
}

function updateTransferStockFeedback() {
    const prodCode = $('#trProductSelect').val();
    const fromWh = $('#trFromWarehouseSelect').val();
    const $feedback = $('#trStockFeedback').empty();
    if (!prodCode || !fromWh) return;

    const prod = appState.products.find(p => p.product_code === prodCode || p.official_product_code === prodCode);
    const baseUnit = prod ? (prod.base_unit || '盒') : '盒';

    const matchedStocks = appState.stocks.filter(s => s.product_id === prodCode && s.warehouse_id === fromWh);
    const availQty = matchedStocks.reduce((sum, s) => sum + (s.available_qty !== undefined ? s.available_qty : (s.quantity || 0)), 0);
    const reqQty = parseInt($('#trQtyInput').val(), 10) || 0;

    $('#trProductSelect').data('from-avail-qty', availQty);

    if (availQty <= 0) {
        $feedback.html(`<span class="text-danger fw-bold"><i class="fa-solid fa-circle-xmark me-1"></i> 調出來源倉目前無現貨儲備 (可用: 0 ${baseUnit})，禁止調撥！</span>`);
    } else if (reqQty > availQty) {
        $feedback.html(`<span class="text-danger fw-bold"><i class="fa-solid fa-triangle-exclamation me-1"></i> 調撥數量 (${reqQty} ${baseUnit}) 超出調出倉可用庫存 (${availQty} ${baseUnit})！</span>`);
    } else {
        $feedback.html(`<span class="text-success"><i class="fa-solid fa-circle-check me-1"></i> 來源倉現貨充足 (可用庫存: ${availQty} ${baseUnit})</span>`);
    }
}

function loadProductStockForTransfer() {
    const prodCode = $('#trProductSelect').val();
    const fromWh = $('#trFromWarehouseSelect').val();

    if (!prodCode) {
        $('#trInputProductName').val('');
        $('#trInputBatchNo').val('-');
        $('#trInputCurrency').val('TWD');
        $('#trInputCurrencyText').text('TWD');
        $('#trInputUnitCost').val(0);
        $('#trInputUnitSv').val(0);
        $('#trInputTotalCost').val(formatCurrency(0, 'TWD'));
        $('#trInputTotalSv').val('0 SV');
        $('#trAdjUnit').val('盒');
        $('#trAdjUnitText').text('盒');
        return;
    }

    const prod = appState.products.find(p => p.product_code === prodCode || p.official_product_code === prodCode);
    const packMode = $('input[name="trPackMode"]:checked').val() || 'BOX';
    const targetUnit = (packMode === 'PIECE') ? (prod ? prod.sub_unit || '支' : '支') : (prod ? prod.base_unit || '盒' : '盒');

    const spec = AppCalc.deriveLooseSpec(prod, targetUnit);
    const prodName = prod ? prod.name : '-';
    const currency = (prod && (prod.region_code === 'MY' || String(prod.product_code).startsWith('MY'))) ? 'MYR' : 'TWD';

    const matchedStock = appState.stocks
        .filter(s => s.product_id === prodCode && s.warehouse_id === fromWh && s.available_qty > 0)
        .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'))[0]
        || appState.stocks.find(s => s.product_id === prodCode && s.warehouse_id === fromWh)
        || appState.stocks.find(s => s.product_id === prodCode);

    const batchNo = matchedStock ? matchedStock.batch_no : `LOT${AppDate.toClean6()}A`;

    $('#trInputProductName').val(prodName);
    $('#trInputBatchNo').val(batchNo);
    $('#trProductSelect').data('stock-id', matchedStock ? matchedStock.id : '');

    $('#trAdjUnit').val(targetUnit);
    $('#trAdjUnitText').text(targetUnit);
    $('#trInputCurrency').val(currency);
    $('#trInputCurrencyText').text(currency);

    $('#trInputUnitCost').val(spec.unitPrice || spec.unitCost || (prod ? prod.price : 0));
    $('#trInputUnitSv').val(spec.unitSV || (prod ? prod.sv_point : 0));

    updateTransferStockFeedback();
    updateTransferCostCalc();
}

function updateTransferCostCalc() {
    const qty = parseInt($('#trQtyInput').val(), 10) || 0;
    const unitCost = parseFloat($('#trInputUnitCost').val()) || 0;
    const unitSv = parseFloat($('#trInputUnitSv').val()) || 0;
    const currency = $('#trInputCurrency').val() || 'TWD';

    const totalCost = AppCalc.multiply(Math.abs(qty), unitCost, 2);
    const totalSv = AppCalc.multiply(Math.abs(qty), unitSv, 2);

    $('#trInputTotalCost').val(formatCurrency(totalCost, currency));
    $('#trInputTotalSv').val(`${AppCalc.formatSV(totalSv, 'INTERNAL')} SV`);

    updateTransferStockFeedback();
}

function populateAdjustProductSelectWithStock(targetSelector, warehouseId, selectedProductId = '', dropdownParent = null) {
    const $select = $(targetSelector);
    if (!$select.length) return;

    $select.empty().append('<option value="">-- 請選擇產品品項 --</option>');

    const twProducts = appState.products.filter(p => (p.region_code || 'TW').toUpperCase() === 'TW');
    const myProducts = appState.products.filter(p => (p.region_code || 'TW').toUpperCase() === 'MY');

    const appendGroup = (groupLabel, productList) => {
        if (!productList.length) return;
        const $group = $(`<optgroup label="${groupLabel}"></optgroup>`);

        productList.forEach(p => {
            const prodCode = p.product_code || p.official_product_code;
            const baseUnit = p.base_unit || '盒';
            const subUnit = p.sub_unit || '';

            const matchedStocks = appState.stocks.filter(s => s.product_id === prodCode && s.warehouse_id === warehouseId);
            const availBoxes = matchedStocks.reduce((sum, s) => sum + (s.available_qty !== undefined ? (parseInt(s.available_qty, 10) || 0) : (parseInt(s.quantity, 10) || 0)), 0);
            const availPieces = matchedStocks.reduce((sum, s) => sum + (s.available_pieces_qty !== undefined ? (parseInt(s.available_pieces_qty, 10) || 0) : (parseInt(s.pieces_qty, 10) || 0)), 0);

            const isOutOfStock = (availBoxes <= 0 && availPieces <= 0);

            let stockLabel = '';
            if (isOutOfStock) {
                stockLabel = subUnit ? `[缺貨: 0${baseUnit}/0${subUnit}]` : `[缺貨: 0${baseUnit}]`;
            } else {
                stockLabel = subUnit ? `[可用: ${availBoxes}${baseUnit} / ${availPieces}${subUnit}]` : `[可用: ${availBoxes}${baseUnit}]`;
            }

            const optionText = `📦 ${p.name} [${prodCode}] ${stockLabel}`;
            const $opt = $('<option></option>')
                .val(prodCode)
                .text(optionText)
                .attr('data-base-unit', baseUnit)
                .attr('data-sub-unit', subUnit)
                .attr('data-avail-boxes', availBoxes)
                .attr('data-avail-pieces', availPieces)
                .attr('data-out-of-stock', isOutOfStock ? 'Y' : 'N');

            if (selectedProductId && selectedProductId === prodCode) {
                $opt.prop('selected', true);
            }

            $group.append($opt);
        });

        $select.append($group);
    };

    appendGroup('🇹🇼 台灣市場實體產品', twProducts);
    appendGroup('🇲🇾 馬來西亞市場實體產品', myProducts);

    if ($.fn.select2) {
        if ($select.hasClass('select2-hidden-accessible')) {
            $select.select2('destroy');
        }
        $select.select2({
            width: '100%',
            dropdownParent: dropdownParent ? $(dropdownParent) : null,
            placeholder: '-- 請選擇產品品項 --',
            allowClear: true
        });
    }
}

// ==========================================================================
// 8. 單據儲存與實體庫存寫入 (工作台與 Modal 提交)
// ==========================================================================
async function commitAuditRecord() {
    const whId = $('#auditWarehouseSelect').val();
    const prodId = $('#auditProductSelect').val();
    const operatorId = $('#auditOperatorSelect').val();

    if (!whId) return AppToast.warning("請先選擇「盤點倉儲據點」！");
    if (!prodId) return AppToast.warning("請先選擇「盤點品項」！");
    if (!operatorId) return AppToast.warning("請選擇「執行經手人」！");

    const bookQty = parseInt($('#auditValBookQty').text(), 10) || 0;
    const physicalQty = parseInt($('#auditInputPhysicalQty').val(), 10) || 0;
    const diff = AppCalc.sub(physicalQty, bookQty);

    const prod = appState.products.find(p => p.product_code === prodId || p.official_product_code === prodId);
    const officialCode = prod ? prod.product_code : prodId;
    const prodName = prod ? prod.name : '';

    const unitCost = parseFloat($('#auditInputUnitCost').val()) || 0;
    const unitSv = parseFloat($('#auditInputUnitSv').val()) || 0;
    const totalCost = AppCalc.multiply(Math.abs(diff), unitCost, 2);
    const totalSv = AppCalc.multiply(Math.abs(diff), unitSv, 2);

    const adjType = diff >= 0 ? '盤盈' : $('#auditSelAdjType').val();
    const reason = diff === 0 ? '帳實相符例行備忘' : ($('#auditTxtReason').val().trim() || '現場實物盤點差異調整');

    const nextSeq = String(appState.adjustments.length + 1).padStart(4, '0');
    const adjNo = `ADJ-${AppDate.toClean8()}-${nextSeq}`;
    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');
    const todaySheetDate = AppDate.now('sheet');

    const stockIdVal = $('#auditProductSelect option:selected').data('stock-id') || '';
    const batchNoVal = $('#auditInputBatchNo').val().trim();
    const expiryDateVal = $('#auditProductSelect option:selected').data('expiry-date') 
        ? AppDate.toSheet($('#auditProductSelect option:selected').data('expiry-date')) 
        : todaySheetDate;

    const rowDataArray = [
        adjNo, adjType, whId, '', officialCode, prodName, prodId,
        stockIdVal, batchNoVal, expiryDateVal, $('#auditAdjUnit').val(),
        diff, 'TWD', unitCost, totalCost, unitSv, totalSv,
        $('#auditProspectSelect').val() || '', operatorId, todaySheetDate,
        reason, currentUser, nowStr, currentUser, nowStr
    ];

    const newObj = {
        id: adjNo, adj_type: adjType, from_warehouse_id: whId, to_warehouse_id: '',
        official_product_code: officialCode, product_name_snaps: prodName,
        product_id: prodId, stock_id: stockIdVal, batch_no: batchNoVal,
        expiry_date: expiryDateVal, adj_unit: $('#auditAdjUnit').val(), quantity: diff,
        currency_code: 'TWD', unit_cost: unitCost, total_cost: totalCost,
        unit_sv: unitSv, total_sv: totalSv, target_prospect_id: $('#auditProspectSelect').val() || '',
        operator_partner_id: operatorId, adj_date: todaySheetDate, reason_desc: reason,
        created_by: currentUser, created_at: nowStr, modified_by: currentUser, modified_at: nowStr
    };

    const $btn =$('#btnSubmitAudit');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i> 寫入中...');

        // 1. 寫入盤點調撥主檔 (表 307)
        await SheetAdapter.createRow(SHEET_NAMES.ADJUSTMENTS, adjNo, rowDataArray, GAS_DEPLOY_ID.PSI);
        appState.adjustments.unshift(newObj);

        // 2. 實質同步寫入庫存主檔 (表 302)
        if (diff !== 0) {
            await syncAdjustmentToStocks(newObj, false);
        }

        const auditModalEl = document.getElementById('modalAuditWorkbench');
        if (auditModalEl) {
            const auditModal = bootstrap.Modal.getInstance(auditModalEl);
            if (auditModal) auditModal.hide();
        }

        refreshAllViews();
        AppToast.success(`盤點單據【${adjNo}】已成功建立，庫存主檔現貨同步更新！`);
    } catch (err) {
        AppToast.error("寫入失敗: " + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i> 寫入盤點覆核單據');
    }
}

async function commitTransferOrder() {
    const fromWh = $('#trFromWarehouseSelect').val();
    const toWh = $('#trToWarehouseSelect').val();
    const prodId = $('#trProductSelect').val();
    const qty = parseInt($('#trQtyInput').val(), 10) || 0;
    const operatorId = $('#trOperatorSelect').val();
    const adjDate = $('#trAdjDate').val();
    const reason = $('#trReasonInput').val().trim();

    if (!fromWh) return AppToast.warning("請選擇「調出來源倉」！");
    if (!toWh) return AppToast.warning("請選擇「調入目的倉」！");
    if (fromWh === toWh) return AppToast.warning("調出來源倉與調入目的倉不可相同！");
    if (!prodId) return AppToast.warning("請選擇「調撥品項」！");
    if (qty <= 0) return AppToast.warning("請填寫大於 0 的調撥數量！");
    if (!operatorId) return AppToast.warning("請選擇「執行經手夥伴」！");
    if (!adjDate) return AppToast.warning("請選擇「調撥日期」！");
    if (!reason) return AppToast.warning("請輸入「調撥事由與物流追蹤說明」！");

    const matchedStocks = appState.stocks.filter(s => s.product_id === prodId && s.warehouse_id === fromWh);
    const availQty = matchedStocks.reduce((sum, s) => sum + (s.available_qty !== undefined ? s.available_qty : (s.quantity || 0)), 0);
    const prod = appState.products.find(p => p.product_code === prodId || p.official_product_code === prodId);
    const baseUnit = prod ? (prod.base_unit || '盒') : '盒';

    if (qty > availQty) {
        AppToast.error(`【ERR_INSUFFICIENT_STOCK 調撥超額阻斷】調撥數量 (${qty} ${baseUnit}) 超出來源倉可用量 (${availQty} ${baseUnit})！禁止負數移轉。`);
        return;
    }

    const officialCode = prod ? prod.product_code : prodId;
    const prodName = prod ? prod.name : '';
    const unitCost = parseFloat($('#trInputUnitCost').val()) || 0;
    const unitSv = parseFloat($('#trInputUnitSv').val()) || 0;
    const currency = $('#trCurrencySelect').val() || 'TWD';
    const totalCost = AppCalc.multiply(qty, unitCost, 2);
    const totalSv = AppCalc.multiply(qty, unitSv, 2);

    const nextSeq = String(appState.adjustments.length + 1).padStart(4, '0');
    const adjNo = `ADJ-${AppDate.toClean8()}-${nextSeq}`;
    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');
    const todaySheetDate = AppDate.now('sheet');
    const transferDateVal = $('#trAdjDate').val() ? AppDate.toSheet($('#trAdjDate').val()) : todaySheetDate;

    const matchedStock = matchedStocks[0];
    const stockIdVal = $('#trProductSelect').data('stock-id') || (matchedStock ? matchedStock.id : '');
    const batchNoVal = $('#trInputBatchNo').val().trim() || (matchedStock ? matchedStock.batch_no : '');
    const expiryDateVal = matchedStock ? matchedStock.expiry_date : todaySheetDate;

    const rowDataArray = [
        adjNo, '跨倉調撥', fromWh, toWh, officialCode, prodName, prodId,
        stockIdVal, batchNoVal, expiryDateVal, $('#trAdjUnit').val(),
        -qty, currency, unitCost, totalCost, unitSv, totalSv,
        '', operatorId, transferDateVal, reason, currentUser, nowStr, currentUser, nowStr
    ];

    const newObj = {
        id: adjNo, adj_type: '跨倉調撥', from_warehouse_id: fromWh, to_warehouse_id: toWh,
        official_product_code: officialCode, product_name_snaps: prodName,
        product_id: prodId, stock_id: stockIdVal, batch_no: batchNoVal,
        expiry_date: expiryDateVal, adj_unit: $('#trAdjUnit').val(), quantity: -qty,
        currency_code: currency, unit_cost: unitCost, total_cost: totalCost,
        unit_sv: unitSv, total_sv: totalSv, target_prospect_id: '',
        operator_partner_id: operatorId, adj_date: transferDateVal, reason_desc: reason,
        created_by: currentUser, created_at: nowStr, modified_by: currentUser, modified_at: nowStr
    };

    try {
        // 1. 寫入調撥單據
        await SheetAdapter.createRow(SHEET_NAMES.ADJUSTMENTS, adjNo, rowDataArray, GAS_DEPLOY_ID.PSI);
        appState.adjustments.unshift(newObj);

        // 2. 實質執行雙向調撥扣減與增補
        await syncAdjustmentToStocks(newObj, false);

        const transferModalEl = document.getElementById('modalTransferWorkbench');
        if (transferModalEl) {
            const transferModal = bootstrap.Modal.getInstance(transferModalEl);
            if (transferModal) transferModal.hide();
        }

        refreshAllViews();
        AppToast.success(`跨倉調撥單【${adjNo}】已成功建立，來源倉與目的倉現貨已完成移轉！`);
    } catch (err) {
        AppToast.error("調撥單建立失敗: " + err.message);
    }
}

function handleModalAdjTypeChange() {
    const type = $('#fieldAdjType').val();
    const $toWh =$('#fieldToWarehouseId');
    const $targetProspect =$('#fieldTargetProspectId');
    const $packBox =$('#modalPackModeBox');
    const $packPiece =$('#modalPackModePiece');
    const $lblPiece =$('label[for="modalPackModePiece"]');

    if (type === '拆盒解封') {
        if ($packPiece.is(':checked')) {$packBox.prop('checked', true);
            AppToast.info("「拆盒解封」係將密封整裝拆解為散件，已自動為您切換為「官方原裝」！");
        }
        $packPiece.prop('disabled', true);$lblPiece.addClass('opacity-50 text-muted disabled').attr('title', '拆盒解封對象必須為密封原裝，禁止選擇散裝');
    } else {
        $packPiece.prop('disabled', false);$lblPiece.removeClass('opacity-50 text-muted disabled').removeAttr('title');
    }

    if (type === '跨倉調撥') {
        $toWh.prop('disabled', false);$('label[for="fieldToWarehouseId"]').html('調入倉儲 <span class="text-danger">*</span>');
    } else {
        $toWh.val('').trigger('change.select2').prop('disabled', true);$('label[for="fieldToWarehouseId"]').html('調入倉儲 <span class="text-secondary small">(單倉異動無須填寫)</span>');
    }

    if (type === '試用發放') {
        $targetProspect.prop('disabled', false);$('label[for="fieldTargetProspectId"]').html('試用對象客戶 <span class="text-danger">* (CRM 追蹤)</span>');
    } else {
        $targetProspect.prop('disabled', true);$('label[for="fieldTargetProspectId"]').html('試用對象客戶 <span class="text-secondary small">(非試用發放無須選擇)</span>');
    }

    updateQuantitySignUI(type);
    renderAdjTypeHint(type);
    handleModalProductChange();
    updateAdjustStockFeedback();
}

function handleModalProductChange() {
    const prodId = $('#fieldProductId').val();
    if (!prodId) return;

    const prod = appState.products.find(p => p.product_code === prodId || p.official_product_code === prodId);
    if (!prod) return;

    const packMode = $('input[name="modalPackMode"]:checked').val() || 'BOX';
    const targetUnit = (packMode === 'PIECE') ? (prod.sub_unit || '支') : (prod.base_unit || '盒');

    const spec = AppCalc.deriveLooseSpec(prod, targetUnit);
    const currency = prod.currency || ((prod.region_code === 'MY' || String(prod.product_code).startsWith('MY')) ? 'MYR' : 'TWD');

    $('#fieldOfficialProductCode').val(prod.product_code);
    $('#fieldProductNameSnaps').val(prod.name);

    const fromWh = $('#fieldFromWarehouseId').val();
    const matchedStock = appState.stocks
        .filter(s => s.product_id === prodId && s.warehouse_id === fromWh && s.available_qty > 0)
        .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'))[0];

    $('#fieldStockId').val(matchedStock ? matchedStock.id : '');
    $('#fieldBatchNo').val(matchedStock ? matchedStock.batch_no : `LOT${AppDate.toClean8()}`);
    $('#fieldExpiryDate').val(matchedStock && matchedStock.expiry_date ? AppDate.toInput(matchedStock.expiry_date) : AppDate.now('input'));

    $('#fieldAdjUnit').val(targetUnit);
    $('#fieldAdjUnitText').text(targetUnit);
    $('#fieldCurrencyCode').val(currency);
    $('#fieldCurrencyCodeText').text(currency);

    $('#fieldUnitCost').val(spec.unitPrice || spec.unitCost || prod.price);
    $('#fieldUnitSv').val(spec.unitSV || prod.sv_point);

    updateAdjustStockFeedback();
    calculateModalTotals();
}

function calculateModalTotals() {
    const rawInput = parseInt($('#fieldQuantity').val(), 10);
    const cost = parseFloat($('#fieldUnitCost').val()) || 0;
    const sv = parseFloat($('#fieldUnitSv').val()) || 0;
    const curr = $('#fieldCurrencyCode').val() || 'TWD';

    const reqQty = (isNaN(rawInput) || rawInput === 0) ? 0 : Math.abs(rawInput);
    const totalCost = AppCalc.multiply(reqQty, cost, 2);
    const totalSv = AppCalc.multiply(reqQty, sv, 2);

    $('#fieldTotalCost').val(formatCurrency(totalCost, curr));
    $('#fieldTotalSv').val(`${AppCalc.formatSV(totalSv, 'INTERNAL')} SV`);
}

function updateQuantitySignUI(adjType) {
    const $prefix =$('#fieldQuantitySignPrefix');
    if (adjType === '盤盈') {
        $prefix.text('+').removeClass('text-danger').addClass('text-success');
    } else {
        $prefix.text('-').removeClass('text-success').addClass('text-danger');
    }
}

function openAddAdjustmentModal() {
    $('#adjustModalTitle').html('<i class="fa-solid fa-file-circle-plus text-primary me-1"></i> 發起盤點調撥單據');
    $('#formMode').val('add');
    $('#adjustForm')[0].reset();

    const nextSeq = String(appState.adjustments.length + 1).padStart(4, '0');
    const todayIso = AppDate.now('input');
    const dateCode = todayIso.replace(/-/g, '');
    const adjNo = `ADJ-${dateCode}-${nextSeq}`;

    $('#fieldId').val(adjNo);
    $('#fieldAdjDate').val(todayIso);
    $('#fieldQuantity').val(1);
    $('#fieldAdjType').val('自用消耗');
    updateQuantitySignUI('自用消耗');
    $('#modalPackModeBox').prop('checked', true);

    const currentUserName = getCurrentUser();
    const matchedPartner = appState.partners.find(p => {
        const pName = EntityResolver.partner(p.partner_id, appState.partners, appState.persons, 1);
        return pName.includes(currentUserName) || (currentUserName === 'RAY' && pName.includes('翁榮祥')) || (currentUserName === 'JARVIS' && pName.includes('林承志'));
    });
    if (matchedPartner) {
        $('#fieldOperatorPartnerId').val(matchedPartner.partner_id).trigger('change.select2');
    }

    handleModalAdjTypeChange();
    new bootstrap.Modal(document.getElementById('adjustModal')).show();
}

function openEditAdjustmentModal(id) {
    const adj = appState.adjustments.find(a => a.id === id);
    if (!adj) return;

    $('#adjustModalTitle').html('<i class="fa-solid fa-pen-to-square text-primary me-1"></i> 編輯盤點調撥單據');
    $('#formMode').val('edit');

    $('#fieldId').val(adj.id);
    $('#fieldAdjType').val(adj.adj_type);
    handleModalAdjTypeChange();

    $('#fieldAdjDate').val(AppDate.toInput(adj.adj_date));
    $('#fieldOperatorPartnerId').val(adj.operator_partner_id);
    $('#fieldFromWarehouseId').val(adj.from_warehouse_id).trigger('change.select2');
    $('#fieldToWarehouseId').val(adj.to_warehouse_id);

    populateAdjustProductSelectWithStock('#fieldProductId', adj.from_warehouse_id, adj.product_id, '#adjustModal');
    $('#fieldOfficialProductCode').val(adj.official_product_code);
    $('#fieldProductNameSnaps').val(adj.product_name_snaps);
    $('#fieldStockId').val(adj.stock_id);
    $('#fieldBatchNo').val(adj.batch_no);
    $('#fieldExpiryDate').val(adj.expiry_date ? AppDate.toInput(adj.expiry_date) : '');

    $('#fieldAdjUnit').val(adj.adj_unit);
    $('#fieldAdjUnitText').text(adj.adj_unit);
    $('#fieldCurrencyCode').val(adj.currency_code);
    $('#fieldCurrencyCodeText').text(adj.currency_code);

    $('#fieldQuantity').val(Math.abs(adj.quantity));
    $('#fieldUnitCost').val(adj.unit_cost);
    $('#fieldUnitSv').val(adj.unit_sv);

    $('#fieldTargetProspectId').val(adj.target_prospect_id);
    $('#fieldReasonDesc').val(adj.reason_desc);

    calculateModalTotals();
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
    const adjUnit = $('#fieldAdjUnit').val();
    const rawQtyInput = parseInt($('#fieldQuantity').val(), 10);
    const curr = $('#fieldCurrencyCode').val();
    const cost = parseFloat($('#fieldUnitCost').val()) || 0;
    const sv = parseFloat($('#fieldUnitSv').val()) || 0;
    const reason = $('#fieldReasonDesc').val().trim();
    const targetProspectId = $('#fieldTargetProspectId').val();
    const packMode = $('input[name="modalPackMode"]:checked').val() || 'BOX';

    if (!id) return AppToast.warning("調撥單號主鍵不可為空！");
    if (!adjDate) return AppToast.warning("請選擇「調整發生日期」！");
    if (!operatorId) return AppToast.warning("請選擇「經手夥伴」！");
    if (!fromWh) return AppToast.warning("請選擇「調出/發生倉儲」！");
    if (!prodId) return AppToast.warning("請選擇「產品品項」！");

    if (isNaN(rawQtyInput) || rawQtyInput === 0) {
        AppToast.error("【數量無效阻斷】調整數量不可為 0、負數符號單獨存在或空白！");
        $('#fieldQuantity').focus();
        return;
    }

    const reqQty = Math.abs(rawQtyInput);
    const availBoxes = parseInt($('#fieldProductId').data('avail-boxes'), 10) || 0;
    const availPieces = parseInt($('#fieldProductId').data('avail-pieces'), 10) || 0;
    const currentStockAvail = (packMode === 'BOX') ? availBoxes : availPieces;

    const prod = appState.products.find(p => p.product_code === prodId || p.official_product_code === prodId);
    const baseUnit = prod ? (prod.base_unit || '盒') : '盒';

    // 業務規則硬檢核
    if (adjType === '跨倉調撥') {
        if (!toWh) return AppToast.error("【跨倉調撥阻斷】跨倉調撥必須選擇「調入目的倉儲」！");
        if (fromWh === toWh) return AppToast.error("【跨倉調撥阻斷】調出來源倉與調入目的倉不可相同！");
        if (reqQty > currentStockAvail) return AppToast.error(`【跨倉調撥超額阻斷】調撥數量 (${reqQty} ${adjUnit}) 超出來源倉可用庫存 (${currentStockAvail} ${adjUnit})！`);
    } else if (adjType === '盤虧' || adjType === '破損過期' || adjType === '自用消耗') {
        if (reqQty > currentStockAvail) return AppToast.error(`【存量不足阻斷】扣減數量 (${reqQty} ${adjUnit}) 超出調出倉可用存量 (${currentStockAvail} ${adjUnit})！`);
    } else if (adjType === '試用發放') {
        if (!targetProspectId) return AppToast.error("【試用發放阻斷】試用發放必須指派「試用對象客戶」，以利後續 CRM 體驗轉化追蹤！");
        if (reqQty > currentStockAvail) return AppToast.error(`【試用發放阻斷】發放數量 (${reqQty} ${adjUnit}) 超出可用存量 (${currentStockAvail} ${adjUnit})！`);
    } else if (adjType === '拆盒解封') {
        if (packMode === 'PIECE') return AppToast.error("【拆盒解封阻斷】拆盒解封對象必須為密封原裝整盒！");
        if (prod && (prod.allow_decant === 'N' || prod.pieces_per_box <= 1)) return AppToast.error(`【拆盒解封阻斷】品項【${prod.name}】官方規格不可拆售！`);
        if (reqQty > availBoxes) return AppToast.error(`【拆盒解封阻斷】拆解盒數 (${reqQty} ${baseUnit}) 超出在線可用整盒 (${availBoxes} ${baseUnit})！`);
    }

    const finalQuantity = (adjType === '盤盈') ? reqQty : -reqQty;
    const totalCost = AppCalc.multiply(reqQty, cost, 2);
    const totalSv = AppCalc.multiply(reqQty, sv, 2);

    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');
    const existing = appState.adjustments.find(a => a.id === id);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    const adjDateVal = AppDate.toSheet($('#fieldAdjDate').val());
    const expiryDateVal = $('#fieldExpiryDate').val() ? AppDate.toSheet($('#fieldExpiryDate').val()) : '';

    const rowDataArray = [
        id, adjType, fromWh, (adjType === '跨倉調撥') ? toWh : '',
        $('#fieldOfficialProductCode').val().trim(), $('#fieldProductNameSnaps').val().trim(),
        prodId, $('#fieldStockId').val().trim(), $('#fieldBatchNo').val().trim(),
        expiryDateVal, adjUnit, finalQuantity, curr, cost, totalCost, sv, totalSv,
        targetProspectId || '', operatorId, adjDateVal, reason, createdBy, createdAt, currentUser, nowStr
    ];

    const updatedObj = {
        id, adj_type: adjType, from_warehouse_id: fromWh,
        to_warehouse_id: (adjType === '跨倉調撥') ? toWh : '',
        official_product_code: $('#fieldOfficialProductCode').val().trim(),
        product_name_snaps: $('#fieldProductNameSnaps').val().trim(),
        product_id: prodId, stock_id: $('#fieldStockId').val().trim(),
        batch_no: $('#fieldBatchNo').val().trim(), expiry_date: expiryDateVal,
        adj_unit: adjUnit, quantity: finalQuantity, currency_code: curr,
        unit_cost: cost, total_cost: totalCost, unit_sv: sv, total_sv: totalSv,
        target_prospect_id: targetProspectId || '', operator_partner_id: operatorId,
        adj_date: adjDateVal, reason_desc: reason,
        created_by: createdBy, created_at: createdAt,
        modified_by: currentUser, modified_at: nowStr
    };

    const $btn =$('#btnSaveAdjust');
    try {
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i> 寫入中...');

        // 1. 若為編輯模式，先逆向回滾舊單據的庫存
        if (mode === 'edit' && existing) {
            await syncAdjustmentToStocks(existing, true);
        }

        // 2. 寫入單據主檔 (表 307)
        if (mode === 'add') {
            await SheetAdapter.createRow(SHEET_NAMES.ADJUSTMENTS, id, rowDataArray, GAS_DEPLOY_ID.PSI);
            appState.adjustments.unshift(updatedObj);
        } else {
            await SheetAdapter.updateRow(SHEET_NAMES.ADJUSTMENTS, id, rowDataArray, GAS_DEPLOY_ID.PSI);
            const idx = appState.adjustments.findIndex(a => a.id === id);
            if (idx !== -1) appState.adjustments[idx] = updatedObj;
        }

        // 3. 實質同步寫入庫存主檔 (表 302)
        await syncAdjustmentToStocks(updatedObj, false);

        bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide();
        refreshAllViews();
        AppToast.success(`單據【${id}】（${adjType}）已儲存，庫存主檔已同步更新！`);
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk me-1"></i> 儲存');
    }
}

async function deleteAdjustmentRecord(id) {
    const item = appState.adjustments.find(a => a.id === id);
    if (!item) return;

    const confirmed = await AppDialog.confirm(`確定要自 Google 試算表中永久撤銷/刪除單據【${id}】嗎？系統將自動反向回滾庫存現貨！`, {
        title: '刪除單據與庫存回滾確認',
        confirmText: '確定刪除並回滾',
        confirmClass: 'btn-danger'
    });

    if (!confirmed) return;

    try {
        // 1. 先反向回滾對應的庫存現貨
        await syncAdjustmentToStocks(item, true);

        // 2. 刪除調撥記錄
        await SheetAdapter.deleteRow(SHEET_NAMES.ADJUSTMENTS, id, GAS_DEPLOY_ID.PSI);
        appState.adjustments = appState.adjustments.filter(a => a.id !== id);

        refreshAllViews();
        AppToast.success(`單據【${id}】已刪除，庫存存量已自動回滾校準！`);
    } catch (err) {
        AppToast.error("刪除失敗: " + err.message);
    }
}

// ==========================================================================
// 9. 匯出 CSV 報表
// ==========================================================================
function exportAdjustmentsCsv() {
    const csv = Papa.unparse(appState.adjustments);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psi_adjustments_${AppDate.toClean8()}.csv`;
    a.click();
    AppToast.info("已成功匯出盤點調撥 CSV 總檔");
}