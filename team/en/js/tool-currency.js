/**
 * ============================================================================
 * UVACO Ray's Team Digital Tactical Console - Cross-Border Currency & Hedging Engine
 * File: tool-currency.js (English Version)
 * Architecture: Decoupled Google Sheets Adapter, AppCalc Precision Engine, DataTables & Chart.js
 * ============================================================================
 */

// ==========================================================================
// 1. Google Sheets Configuration & Target Data Source
// ==========================================================================
const SPREADSHEET_ID = {
    PRD: APP_CONFIG?.SHEETS?.PRD || ''
};

const SHEET_NAMES = {
    PRODUCTS: APP_CONFIG?.SHEET_NAMES?.PRD?.PRODUCTS || '產品主檔'
};

// ==========================================================================
// 2. Global State Management
// ==========================================================================
let appState = {
    exchangeRate: APP_CONFIG?.FIN?.EXCHANGE_RATE?.MYR_TWD || 8.00, // Baseline FX Rate (Default: 1 MYR = 8.00 TWD)
    products: {
        ALL: [],
        TW: [],
        MY: []
    },
    baseCodes: [] // International Base SKU Index List
};

// Cross-border spot hedging sandbox cart state: [{ product_code, qty }]
let swapCart = [];
let matrixTableInstance = null;
let rawTableInstance = null;
let isInitialized = false;

// ==========================================================================
// 3. Application Lifecycle & Initialization
// ==========================================================================
window.addEventListener('AppReady', async () => {
    await initApp();
});

async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    // Synchronize FX slider and target SV to default global configuration
    $('#fxRateRange').val(appState.exchangeRate);
    $('#fxRateInput').val(appState.exchangeRate.toFixed(2));
    $('#solverTargetSV').val(APP_CONFIG?.ORG?.SV_LINE_ACTIVE || 160);

    bindUIEvents();

    if (SPREADSHEET_ID.PRD) {
        await fetchGoogleSheetsData();
    } else {
        if (typeof AppToast !== 'undefined') {
            AppToast.error("Google Spreadsheet ID is not configured. Unable to load product master data!");
        }
    }

    triggerConverterFromTWD();
    renderCart();
    recalculateSolver();
}

// ==========================================================================
// 4. Google Sheets CSV Parsing (Decoupled Column Mapping)
// ==========================================================================
async function fetchGoogleSheetsData() {
    if (typeof AppLoading !== 'undefined') {
        AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i> Loading cloud database...', 'Loading...');
    }

    try {
        const rawRows = await fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.PRODUCTS);

        if (!rawRows || rawRows.length === 0) {
            throw new Error("No valid product data found in the 'Products' worksheet.");
        }

        const parsedProducts = parseProductsTable(rawRows);
        appState.products.ALL = parsedProducts;
        appState.products.TW = parsedProducts.filter(p => p.region_code === 'TW');
        appState.products.MY = parsedProducts.filter(p => p.region_code === 'MY');

        // Extract unique Base SKUs for international dual-track mapping
        appState.baseCodes = Array.from(new Set(parsedProducts.map(p => p.base_code).filter(Boolean))).sort();

        refreshAllViews();

        if (typeof AppToast !== 'undefined') {
            AppToast.success(`Successfully synchronized ${parsedProducts.length} cross-border products.`);
        }
    } catch (err) {
        console.error("Google Sheets product data loading failed:", err);
        if (typeof AppDialog !== 'undefined') {
            AppDialog.alert("Unable to connect to Google Sheets. Please check your network connection or sharing permissions!", {
                title: "Data Loading Failed",
                icon: "fa-solid fa-triangle-exclamation text-danger"
            });
        }
    } finally {
        if (typeof AppLoading !== 'undefined') {
            AppLoading.hide();
        }
    }
}

/**
 * Parses raw Google Sheet rows into normalized product objects
 */
function parseProductsTable(rows) {
    return rows.map((r) => {
        const productCode = getVal(r, 0);
        let regionCode = getVal(r, 1, 'TW').toUpperCase();

        if (!regionCode || (regionCode !== 'TW' && regionCode !== 'MY')) {
            regionCode = productCode.startsWith('MY') ? 'MY' : 'TW';
        }

        let baseCode = getVal(r, 2, productCode.replace(/^(TW|MY)/, ''));
        const priceNum = parseFloat(getVal(r, 16, '0')) || 0;
        const svNum = parseInt(getVal(r, 18, '0'), 10) || 0;
        const weightNum = parseFloat(getVal(r, 11, '0.5')) || 0.5;
        const stockStatus = getVal(r, 21);
        const isValid = getVal(r, 23, 'Y');
        const launchDate = getVal(r, 24);
        const discontinueDate = getVal(r, 25);

        return {
            product_code: productCode,
            region_code: regionCode,
            base_code: baseCode,
            name: getVal(r, 3, 'Unnamed Product'),
            short_name: getVal(r, 4),
            short_summary: getVal(r, 5),
            category_code: getVal(r, 6),
            subcategory_code: getVal(r, 7),
            type_code: getVal(r, 8),
            package_spec: getVal(r, 9, '-'),
            weight: weightNum,
            price: priceNum,
            currency: getVal(r, 17, regionCode === 'MY' ? 'MYR' : 'TWD'),
            sv_point: svNum,
            primary_image_url: getVal(r, 19),
            is_featured: ['TRUE', 'Y', '1'].includes(getVal(r, 20, 'FALSE').toUpperCase()),
            stock_status: stockStatus,
            launch_date: launchDate,
            discontinue_date: discontinueDate,
            status: getProductStatus(launchDate, discontinueDate),
            is_valid: isValid
        };
    }).filter(item => item.is_valid !== 'N' && (item.product_code !== '' || item.name !== 'Unnamed Product'));
}

/**
 * Determines product status based on launch and discontinue timestamps
 */
function getProductStatus(launchDateVal, discontinueDateVal) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    const lTs = typeof AppDate !== 'undefined' ? AppDate.toTimestamp(launchDateVal) : (launchDateVal ? new Date(launchDateVal).getTime() : 0);
    const dTs = typeof AppDate !== 'undefined' ? AppDate.toTimestamp(discontinueDateVal) : (discontinueDateVal ? new Date(discontinueDateVal).getTime() : 0);

    if (lTs > 0 && lTs > todayTs) return 'COMING_SOON';
    if (dTs > 0 && dTs <= todayTs) return 'DISCONTINUED';
    return 'ACTIVE';
}

// ==========================================================================
// 5. UI Event Handlers & Interactive Controls
// ==========================================================================
function handleRateChange(val) {
    let rate = parseFloat(val);
    const defaultRate = APP_CONFIG?.FIN?.EXCHANGE_RATE?.MYR_TWD || 8.00;
    if (isNaN(rate) || rate <= 0) rate = defaultRate;
    rate = Math.min(Math.max(rate, 7.00), 9.00);

    appState.exchangeRate = rate;

    $('#fxRateRange').val(rate);
    $('#fxRateInput').val(rate.toFixed(2));

    triggerConverterFromTWD();
    renderCart();
    refreshAllViews();
    recalculateSolver();
}

function bindUIEvents() {
    $('#fxRateRange').off('input change').on('input change', function () {
        handleRateChange($(this).val());
    });

    $('#fxRateInput').off('change blur').on('change blur', function () {
        handleRateChange($(this).val());
    });

    $('#inputTWD').off('input').on('input', triggerConverterFromTWD);

    $('#inputSV').off('input').on('input', function () {
        const sv = parseFloat($(this).val()) || 0;
        const twd = Math.round(typeof AppCalc !== 'undefined' ? AppCalc.multiply(sv, 36.46, 2) : (sv * 36.46));
        const myr = Math.round(typeof AppCalc !== 'undefined' ? AppCalc.divide(twd, appState.exchangeRate, 2) : (twd / appState.exchangeRate));

        $('#inputTWD').val(twd);
        $('#inputMYR').val(myr);
        updateConverterMetrics(twd, sv, myr);
    });

    $('#inputMYR').off('input').on('input', function () {
        const myr = parseFloat($(this).val()) || 0;
        const twd = Math.round(typeof AppCalc !== 'undefined' ? AppCalc.multiply(myr, appState.exchangeRate, 2) : (myr * appState.exchangeRate));
        const sv = Math.round(typeof AppCalc !== 'undefined' ? AppCalc.divide(twd, 36.46, 2) : (twd / 36.46));

        $('#inputTWD').val(twd);
        $('#inputSV').val(sv);
        updateConverterMetrics(twd, sv, myr);
    });

    $('#solverTargetSV, #solverStrategy').off('change input').on('change input', function () {
        recalculateSolver();
    });

    $('#btnCopyQuote').off('click').on('click', copyQuoteToClipboard);

    // Dynamic cart quantity adjustment (instant input)
    $(document).off('input', '.cart-qty-input').on('input', '.cart-qty-input', function () {
        const index = parseInt($(this).data('index'), 10);
        const rawVal = $(this).val();
        if (rawVal === '') return;

        let qty = parseInt(rawVal, 10);
        if (isNaN(qty) || qty <= 0) qty = 1;
        swapCart[index].qty = qty;
        recalculateCartTotals();
    });

    // Dynamic cart quantity adjustment (blur & validation)
    $(document).off('change blur', '.cart-qty-input').on('change blur', function () {
        const index = parseInt($(this).data('index'), 10);
        let qty = parseInt($(this).val(), 10);
        if (isNaN(qty) || qty <= 0) {
            qty = 1;
            $(this).val(1);
        }
        swapCart[index].qty = qty;
        recalculateCartTotals();
    });
}

function setQuickRate(rate) {
    $('#fxRateRange').val(rate).trigger('input');
}

function adjustRate(delta) {
    let current = parseFloat($('#fxRateInput').val()) || appState.exchangeRate;
    let target = Math.round((current + delta) * 100) / 100;
    $('#fxRateRange').val(target).trigger('input');
}

// ==========================================================================
// 6. Tri-directional Rapid Converter Engine
// ==========================================================================
function triggerConverterFromTWD() {
    const twd = parseFloat($('#inputTWD').val()) || 0;
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;
    const myr = Math.round(typeof AppCalc !== 'undefined' ? AppCalc.divide(twd, rate, 2) : (twd / rate));
    const sv = Math.round(typeof AppCalc !== 'undefined' ? AppCalc.divide(twd, 36.46, 2) : (twd / 36.46));

    $('#inputMYR').val(myr);
    $('#inputSV').val(sv);
    updateConverterMetrics(twd, sv, myr);
}

function updateConverterMetrics(twd, sv, myr) {
    const twdRatio = sv > 0 ? (typeof AppCalc !== 'undefined' ? AppCalc.divide(twd, sv, 2).toFixed(2) : (twd / sv).toFixed(2)) : "36.46";
    const myrRatio = sv > 0 ? (typeof AppCalc !== 'undefined' ? AppCalc.divide(myr, sv, 2).toFixed(2) : (myr / sv).toFixed(2)) : "4.56";

    $('#ratioTWD').text(`${twdRatio} NT$/SV`);
    $('#ratioMYR').text(`${myrRatio} RM/SV`);
}

window.setQuickSV = function (targetSV) {
    $('#inputSV').val(targetSV).trigger('input');
    $('#solverTargetSV').val(targetSV);
    recalculateSolver();
    if (typeof AppToast !== 'undefined') {
        AppToast.info(`Quick target set: ${targetSV} SV`);
    }
};

// ==========================================================================
// 7. Cross-Border Spot Hedging & Settlement Sandbox
// ==========================================================================
function renderCart() {
    const $container =$('#cartItemsList');
    $container.empty();

    if (swapCart.length === 0) {
        $container.html(`
            <div class="h-100 d-flex flex-column justify-content-center align-items-center py-5 text-center text-light-emphasis">
                <div class="p-3 rounded-circle bg-dark bg-opacity-75 border border-info border-opacity-25 mb-3 shadow-sm">
                    <i class="fa-solid fa-cart-flatbed text-info fs-3"></i>
                </div>
                <div class="fw-bold text-white mb-1 fs-6">Hedging Sandbox is currently empty</div>
                <p class="small text-light-emphasis mb-0">
                    Please navigate to the Product Database below and click <span class="badge badge-secondary-subtle"><i class="fa-solid fa-plus me-1"></i> Add</span> to simulate cross-border hedging
                </p>
            </div>
        `);
        updateCartTotals(0, 0, 0);
        return;
    }

    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;

    swapCart.forEach((item, index) => {
        const prod = appState.products.ALL.find(p => p.product_code === item.product_code);
        if (!prod) return;

        $container.append(`
            <div class="sku-card-item p-2 px-3 d-flex justify-content-between align-items-center">
                <div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge badge-secondary-subtle small">${prod.base_code || prod.product_code}</span>
                        <span class="fw-bold text-white small">${prod.name}</span>
                        <span class="text-secondary-emphasis small">(${prod.package_spec})</span>
                    </div>
                    <div class="text-light-emphasis" style="font-size: 0.75rem;">
                        SKU: ${prod.product_code} ‧ Unit Price: <span class="text-price-unit">NT$ ${prod.price.toLocaleString()}</span> ‧ SV: <span class="text-sv-unit">${prod.sv_point} SV</span>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <div class="input-group input-group-sm" style="width: 100px;">
                        <button type="button" class="btn btn-outline-secondary py-0" onclick="updateCartQty(${index}, -1)">-</button>
                        <input type="number" min="1" class="form-control form-control-sm no-spin text-center bg-dark text-white p-0 cart-qty-input" value="${item.qty}" data-index="${index}">
                        <button type="button" class="btn btn-outline-secondary py-0" onclick="updateCartQty(${index}, 1)">+</button>
                    </div>
                    <button type="button" class="btn btn-outline-danger btn-sm ms-1" onclick="removeCartItem(${index})" title="Remove item">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `);
    });

    recalculateCartTotals();
}

function recalculateCartTotals() {
    let totalSV = 0;
    let totalTWD = 0;
    let totalMYR = 0;
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;

    swapCart.forEach(item => {
        const prod = appState.products.ALL.find(p => p.product_code === item.product_code);
        if (!prod) return;

        // ✅ 修復：依 base_code 雙向精準反查兩國真實定價
        const twProd = appState.products.TW.find(p => p.base_code === prod.base_code);
        const myProd = appState.products.MY.find(p => p.base_code === prod.base_code);

        const itemSV = prod.sv_point * item.qty;
        // 台灣出貨成本必須優先取用台灣實際售價
        const itemTWD = (twProd ? twProd.price : (prod.price * (prod.currency === 'TWD' ? 1 : rate))) * item.qty;
        // 大馬下單金額必須優先取用大馬實際售價
        const itemMYR = (myProd ? myProd.price : Math.round(itemTWD / rate)) * item.qty;

        totalSV += itemSV;
        totalTWD += itemTWD;
        totalMYR += itemMYR;
    });

    updateCartTotals(totalSV, totalTWD, totalMYR);
}

window.updateCartQty = function (index, change) {
    swapCart[index].qty += change;
    if (swapCart[index].qty <= 0) {
        swapCart.splice(index, 1);
    }
    renderCart();
};

window.removeCartItem = function (index) {
    swapCart.splice(index, 1);
    renderCart();
    if (typeof AppToast !== 'undefined') {
        AppToast.info("Item removed from hedging sandbox");
    }
};

function updateCartTotals(totalSV, totalTWD, totalMYR) {
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;

    $('#totalCartSV').text(`${totalSV.toLocaleString()} SV`);
    $('#totalCartTWD').text(`NT$ ${Math.round(totalTWD).toLocaleString()}`);
    $('#totalCartMYR').text(`RM ${Math.round(totalMYR).toLocaleString()}`);

    const myrConvertedTwd = typeof AppCalc !== 'undefined' ? AppCalc.multiply(totalMYR, rate, 2) : (totalMYR * rate);
    const cashDifferenceTwd = typeof AppCalc !== 'undefined' ? AppCalc.sub(totalTWD, myrConvertedTwd) : (totalTWD - myrConvertedTwd);

    $('#totalCartDiff').text(`NT$ ${Math.abs(Math.round(cashDifferenceTwd)).toLocaleString()}`);

    if (cashDifferenceTwd > 0) {
        $('#cartArbitrageText').html(`
            <i class="fa-solid fa-arrow-trend-up text-warning me-1"></i> Malaysia recipient subsidy due to Taiwan: <span class="text-profit-positive">NT$ ${Math.round(cashDifferenceTwd).toLocaleString()}</span>
        `);
    } else if (cashDifferenceTwd < 0) {
        $('#cartArbitrageText').html(`
            <i class="fa-solid fa-arrow-trend-down text-warning me-1"></i> Taiwan sender refund due to Malaysia overpayment: <span class="text-profit-negative">NT$ ${Math.abs(Math.round(cashDifferenceTwd)).toLocaleString()}</span>
        `);
    } else {
        $('#cartArbitrageText').html(`
            <i class="fa-solid fa-scale-balanced text-success me-1"></i> Bilateral accounts fully balanced (<span class="text-rate">${rate.toFixed(2)}</span> FX Benchmark)
        `);
    }
}

// ==========================================
// 8. Goal SV Solver Algorithm Engine
// ==========================================
function recalculateSolver() {
    const defaultTargetSV = APP_CONFIG.ORG?.SV_LINE_ACTIVE || 160;
    const targetSV = parseFloat($('#solverTargetSV').val()) || defaultTargetSV;
    const strategy = $('#solverStrategy').val();
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : (APP_CONFIG.FIN?.EXCHANGE_RATE?.MYR_TWD || 8.00);

    // ✅ 修復：強制過濾掉 sv_point <= 0 的商品，杜絕 Infinity 與 NaN
    let candidateProducts = [...(appState.products.TW || [])].filter(p => p.sv_point > 0);
    if (candidateProducts.length === 0) return;

    if (strategy === 'MIN_CASH') {
        candidateProducts.sort((a, b) => (a.price / a.sv_point) - (b.price / b.sv_point));
    } else if (strategy === 'MIN_WEIGHT') {
        candidateProducts.sort((a, b) => (a.weight / a.sv_point) - (b.weight / b.sv_point));
    } else {
        candidateProducts.sort((a, b) => b.sv_point - a.sv_point);
    }

    let accumulatedSV = 0;
    let totalTWD = 0;
    let packageItems = [];

    for (let prod of candidateProducts) {
        if (accumulatedSV >= targetSV) break;
        const neededSV = targetSV - accumulatedSV;
        let count = Math.ceil(neededSV / prod.sv_point);
        if (count > 3 && strategy === 'STAR_PRODUCTS') count = 2;

        if (count > 0) {
            accumulatedSV += prod.sv_point * count;
            totalTWD += prod.price * count;
            packageItems.push({ name: prod.name, spec: prod.package_spec, qty: count, sv: prod.sv_point * count });
        }
    }

    const itemsHtml = packageItems.map(i => `
        <span class="badge badge-secondary-subtle me-1 mb-1 p-1 px-2">
            ${i.name} × ${i.qty} units (${i.sv} SV)
        </span>
    `).join('');

    $('#solverRecommendationBox').html(`
        <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="fw-bold text-primary small"><i class="fa-solid fa-lightbulb me-1"></i> Optimal Algorithm Allocation</span>
            <span class="badge badge-warning-subtle">${accumulatedSV.toLocaleString()} SV Achieved</span>
        </div>
        <div class="mb-2 d-flex flex-wrap">${itemsHtml}</div>
        <div class="d-flex justify-content-between small pt-2 border-top border-secondary border-opacity-25">
            <span>Total Restock Cost: <b class="text-price-total">NT$ ${totalTWD.toLocaleString()} / RM ${Math.round(totalTWD / rate).toLocaleString()}</b></span>
        </div>
    `);
}

// ==========================================
// 9. DataTables & Cross-Border Matrix Rendering
// ==========================================
function refreshAllViews() {
    renderCrossBorderMatrix();
    renderRawProductTable();
    updateChartData();
}

/**
 * Formats a cross-border comparison matrix row object
 */
function formatCrossBorderMatrixRow(code) {
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;
    const twProd = appState.products.TW.find(p => p.base_code === code);
    const myProd = appState.products.MY.find(p => p.base_code === code);

    const getStatusBadge = (status) => {
        if (status === 'COMING_SOON' || status === 'DISCONTINUED') {
            if (typeof UIBadges !== 'undefined' && UIBadges.product && UIBadges.product.launchStatus) {
                return ` ${UIBadges.product.launchStatus(status)}`;
            }
            const label = status === 'COMING_SOON' ? 'Coming Soon' : 'Discontinued';
            const badgeClass = status === 'COMING_SOON' ? 'badge-warning' : 'badge-danger';
            return ` <span class="badge ${badgeClass}">${label}</span>`;
        }
        return '';
    };

    const twInfo = twProd
        ? `<div class="fw-bold text-secondary">${twProd.name}${getStatusBadge(twProd.status)} <span class="text-muted small">(${twProd.product_code})</span></div><div class="text-secondary-emphasis small">${twProd.package_spec}</div>`
        : `<span class="badge badge-danger-subtle">Not Launched in TW</span>`;

    const twPrice = twProd 
        ? `<span class="text-price-unit">NT$ ${Number(twProd.price).toLocaleString()}</span> / <span class="text-sv-unit">${Number(twProd.sv_point).toLocaleString()} SV</span>` 
        : `-`;

    const myInfo = myProd
        ? `<div class="fw-bold text-secondary">${myProd.name}${getStatusBadge(myProd.status)} <span class="text-muted small">(${myProd.product_code})</span></div><div class="text-secondary-emphasis small">${myProd.package_spec}</div>`
        : `<span class="badge badge-danger-subtle">Not Launched in MY</span>`;

    const myPrice = myProd 
        ? `<span class="text-price-unit">RM ${Number(myProd.price).toLocaleString()}</span> / <span class="text-sv-unit">${Number(myProd.sv_point).toLocaleString()} SV</span>` 
        : `-`;

    const twCostPerSv = twProd && twProd.sv_point > 0 ? (typeof AppCalc !== 'undefined' ? AppCalc.divide(twProd.price, twProd.sv_point, 2).toFixed(2) : (twProd.price / twProd.sv_point).toFixed(2)) : null;
    const myCostPerSv = myProd && myProd.sv_point > 0 ? (typeof AppCalc !== 'undefined' ? AppCalc.divide(myProd.price, myProd.sv_point, 2).toFixed(2) : (myProd.price / myProd.sv_point).toFixed(2)) : null;
    let costCompare = `-`;
    if (twCostPerSv && myCostPerSv) {
        costCompare = `<span class="text-light small tabular-nums">${Number(twCostPerSv).toLocaleString()} NT$/SV</span> <span class="text-muted">vs</span> <span class="text-light small tabular-nums">${Number(myCostPerSv).toLocaleString()} RM/SV</span>`;
    } else if (twCostPerSv) {
        costCompare = `<span class="text-light small tabular-nums">${Number(twCostPerSv).toLocaleString()} NT$/SV</span>`;
    } else if (myCostPerSv) {
        costCompare = `<span class="text-light small tabular-nums">${Number(myCostPerSv).toLocaleString()} RM/SV</span>`;
    }

    let diffText = `<span class="text-light-emphasis">-</span>`;
    if (twProd && myProd) {
        const myConvertedTwd = typeof AppCalc !== 'undefined' ? AppCalc.multiply(myProd.price, rate, 2) : (myProd.price * rate);
        const diff = typeof AppCalc !== 'undefined' ? AppCalc.sub(myConvertedTwd, twProd.price) : (myConvertedTwd - twProd.price);
        diffText = diff >= 0
            ? `<span class="text-profit-positive">+NT$ ${Math.round(diff).toLocaleString()}</span>`
            : `<span class="text-profit-negative">-NT$ ${Math.abs(Math.round(diff)).toLocaleString()}</span>`;
    }

    const actionBtn = twProd
        ? `<button type="button" class="btn btn-sm btn-outline-primary py-1 px-2" onclick="addSkuToCart('${twProd.product_code}')" title="Add to Cross-Border Hedging Sandbox"><i class="fa-solid fa-plus me-1"></i> Add</button>`
        : (myProd
            ? `<button type="button" class="btn btn-sm btn-outline-primary py-1 px-2" onclick="addSkuToCart('${myProd.product_code}')" title="Add to Cross-Border Hedging Sandbox"><i class="fa-solid fa-plus me-1"></i> Add</button>`
            : `<button type="button" class="btn btn-sm btn-outline-secondary py-1 px-2" disabled><i class="fa-solid fa-ban me-1"></i> Out of Stock</button>`);

    return {
        base_code: `<span class="text-key">${code}</span>`,
        tw_info: twInfo,
        tw_price: twPrice,
        my_info: myInfo,
        my_price: myPrice,
        cost_compare: costCompare,
        diff: diffText,
        actions: actionBtn
    };
}

function renderCrossBorderMatrix() {
    if (!$('#crossBorderMatrixTable').length) return;

    const formatted = appState.baseCodes.map(code => formatCrossBorderMatrixRow(code));

    if (matrixTableInstance) {
        matrixTableInstance.clear().rows.add(formatted).draw();
    } else {
        matrixTableInstance = $('#crossBorderMatrixTable').DataTable({
            data: formatted,
            language: {
                emptyTable: "No cross-border comparison data available",
                search: "Search: "
            },
            columns: [
                { data: 'base_code', className: 'text-center' },
                { data: 'tw_info' },
                { data: 'tw_price', className: 'text-end' },
                { data: 'my_info' },
                { data: 'my_price', className: 'text-end' },
                { data: 'cost_compare', className: 'text-end' },
                { data: 'diff', className: 'text-end' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }
}

/**
 * Formats a raw product table row object
 */
function formatRawProductRow(prod) {
    const costPerSv = prod.sv_point > 0 
        ? (typeof AppCalc !== 'undefined' ? AppCalc.divide(prod.price, prod.sv_point, 2).toFixed(2) : (prod.price / prod.sv_point).toFixed(2))
        : '0.00';
    const isTW = prod.region_code === 'TW';
    const regionBadge = (typeof UIBadges !== 'undefined' && UIBadges.common && UIBadges.common.country) 
        ? UIBadges.common.country(prod.region_code) 
        : (typeof UIBadges !== 'undefined' && UIBadges.country ? UIBadges.country(prod.region_code) : `<span class="badge badge-secondary-subtle">${prod.region_code}</span>`);
    const currPrefix = isTW ? 'NT$ ' : 'RM ';
    const costUnit = isTW ? 'NT$/SV' : 'RM/SV';
    const statusBadge = (prod.status === 'COMING_SOON' || prod.status === 'DISCONTINUED')
        ? (typeof UIBadges !== 'undefined' && UIBadges.product && UIBadges.product.launchStatus ? ` ${UIBadges.product.launchStatus(prod.status)}` : ` <span class="badge badge-warning">${prod.status}</span>`)
        : '';
    const prodInfo = `<div class="fw-bold text-secondary">${prod.name}${statusBadge}</div><div class="text-secondary-emphasis small">${prod.package_spec}</div>`;
    const priceDisplay = `<span class="text-price-unit">${currPrefix}${Number(prod.price).toLocaleString()}</span>`;
    const svDisplay = `<span class="text-sv-unit">${Number(prod.sv_point).toLocaleString()} SV</span>`;
    const costDisplay = `<span class="text-light small tabular-nums">${Number(costPerSv).toLocaleString()} ${costUnit}</span>`;

    return {
        region: regionBadge,
        product_code: `<span class="text-key">${prod.product_code}</span>`,
        product_info: prodInfo,
        price_sv: `${priceDisplay} / ${svDisplay}`,
        cost_per_sv: costDisplay,
        actions: `
            <button type="button" class="btn btn-sm btn-outline-primary py-1 px-2" onclick="addSkuToCart('${prod.product_code}')" title="Add to Cross-Border Hedging Sandbox">
                <i class="fa-solid fa-plus me-1"></i> Add
            </button>
        `
    };
}

function renderRawProductTable() {
    if (!$('#rawProductTable').length) return;

    const formatted = appState.products.ALL.map(prod => formatRawProductRow(prod));

    if (rawTableInstance) {
        rawTableInstance.clear().rows.add(formatted).draw();
    } else {
        rawTableInstance = $('#rawProductTable').DataTable({
            data: formatted,
            language: {
                emptyTable: "No product data available",
                search: "Search: "
            },
            columns: [
                { data: 'region', className: 'text-center' },
                { data: 'product_code', className: 'text-center' },
                { data: 'product_info' },
                { data: 'price_sv', className: 'text-end' },
                { data: 'cost_per_sv', className: 'text-end' },
                { data: 'actions', className: 'text-center', orderable: false }
            ]
        });
    }
}

// ==========================================
// 10. Cart Operations
// ==========================================
window.addSkuToCart = function (productCode) {
    const existing = swapCart.find(i => i.product_code === productCode);
    if (existing) {
        existing.qty += 1;
    } else {
        swapCart.push({ product_code: productCode, qty: 1 });
    }
    renderCart();
    if (typeof AppToast !== 'undefined') {
        AppToast.success("Item added to hedging sandbox");
    }
};

// ==========================================
// 11. Chart.js Point-to-Point Spread Visualization
// ==========================================
function updateChartData() {
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;

    const pairedDiffList = [];
    appState.baseCodes.forEach(code => {
        const tw = appState.products.TW.find(p => p.base_code === code);
        const my = appState.products.MY.find(p => p.base_code === code);

        if (tw && my && tw.price > 0 && my.price > 0) {
            const myTwd = typeof AppCalc !== 'undefined' ? AppCalc.multiply(my.price, rate, 2) : (my.price * rate);
            const diff = Math.round(typeof AppCalc !== 'undefined' ? AppCalc.sub(myTwd, tw.price) : (myTwd - tw.price));
            pairedDiffList.push({
                name: tw.name.length > 12 ? tw.name.slice(0, 12) + '…' : tw.name,
                diff: diff
            });
        }
    });

    pairedDiffList.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const top5 = pairedDiffList.slice(0, 5);

    const labels = top5.map(i => i.name);
    const data = top5.map(i => i.diff);
    // Positive spread: MY converted price higher than TW (green); Negative: TW price higher (red)
    const barColors = top5.map(i => i.diff >= 0 ? '#10b981' : '#ef4444');

    if (typeof AppChart !== 'undefined') {
        const config = AppChart.createBar({
            labels: labels.length ? labels : ['No matching data'],
            data: data.length ? data : [0],
            datasetLabel: 'TW-MY Converted Price Spread',
            colors: barColors,
            isHorizontal: true,
            unit: 'NT$',
            yStepInteger: true
        });

        // Extended custom tooltip explaining the price difference
        config.options.plugins.tooltip.callbacks.afterLabel = function (ctx) {
            const val = Number(ctx.parsed.x || 0);
            return val >= 0 ? ' (MY converted price higher than TW)' : ' (TW price higher than MY converted)';
        };

        AppChart.render('arbitrageDiffChart', config);
    }
}

// ==========================================
// 12. Cross-Border Quote & Settlement Generator
// ==========================================
function copyQuoteToClipboard() {
    if (swapCart.length === 0) {
        if (typeof AppToast !== 'undefined') {
            AppToast.warning("Please add items to the hedging sandbox first!");
        }
        return;
    }

    let totalSV = 0;
    let totalTWD = 0;
    let totalMYR = 0;
    let lines = [];
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;

    swapCart.forEach(item => {
        const p = appState.products.ALL.find(x => x.product_code === item.product_code);
        if (p) {
            const itemSV = typeof AppCalc !== 'undefined' ? AppCalc.multiply(p.sv_point, item.qty, 0) : (p.sv_point * item.qty);
            const itemTwdUnitPrice = p.currency === 'TWD' ? p.price : (typeof AppCalc !== 'undefined' ? AppCalc.multiply(p.price, rate, 2) : (p.price * rate));
            const itemTWD = typeof AppCalc !== 'undefined' ? AppCalc.multiply(itemTwdUnitPrice, item.qty, 2) : (itemTwdUnitPrice * item.qty);

            const myProd = appState.products.MY.find(my => my.base_code === p.base_code);
            const itemMYR = myProd 
                ? (typeof AppCalc !== 'undefined' ? AppCalc.multiply(myProd.price, item.qty, 2) : (myProd.price * item.qty))
                : Math.round(typeof AppCalc !== 'undefined' ? AppCalc.divide(itemTWD, rate, 2) : (itemTWD / rate));

            totalSV = typeof AppCalc !== 'undefined' ? AppCalc.add(totalSV, itemSV) : (totalSV + itemSV);
            totalTWD = typeof AppCalc !== 'undefined' ? AppCalc.add(totalTWD, itemTWD) : (totalTWD + itemTWD);
            totalMYR = typeof AppCalc !== 'undefined' ? AppCalc.add(totalMYR, itemMYR) : (totalMYR + itemMYR);

            lines.push(`▫️ [${p.base_code}] ${p.name} (${p.package_spec}) × ${item.qty} units -> ${itemSV} SV (NT$ ${Math.round(itemTWD).toLocaleString()} / RM ${Math.round(itemMYR).toLocaleString()})`);
        }
    });

    const myrConvertedTwd = typeof AppCalc !== 'undefined' ? AppCalc.multiply(totalMYR, rate, 2) : (totalMYR * rate);
    const diffTwd = typeof AppCalc !== 'undefined' ? AppCalc.sub(totalTWD, myrConvertedTwd) : (totalTWD - myrConvertedTwd);

    const quoteText =
`🌟【UVACO Ray's Team Cross-Border Spot Hedging & Settlement Slip】🌟
--------------------------------------
📦 Delivered Handover Items (with Base SKU):
${lines.join('\n')}
--------------------------------------
🎯 Total Handover SV Target: ${totalSV.toLocaleString()} SV
💰 Taiwan Handover Cost: NT$ ${Math.round(totalTWD).toLocaleString()}
🇲🇾 Malaysia Counterpart Order: RM ${Math.round(totalMYR).toLocaleString()}
📊 FX Benchmark: 1 MYR ≈ ${rate.toFixed(2)} TWD
⚖️ Bilateral Hedging Balance: NT$ ${Math.abs(Math.round(diffTwd)).toLocaleString()} (${diffTwd >= 0 ? 'Due from MY Recipient' : 'Refund to TW Sender'})`;

    navigator.clipboard.writeText(quoteText).then(() => {
        if (typeof AppToast !== 'undefined') {
            AppToast.success("Copied LINE / WhatsApp quote to clipboard!");
        }
    }).catch(() => {
        if (typeof AppToast !== 'undefined') {
            AppToast.error("Failed to copy. Please copy manually.");
        }
    });
}