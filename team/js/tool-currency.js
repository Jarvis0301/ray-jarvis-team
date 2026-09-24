// ==========================================================================
// 1. Google 雲端試算表設定與核心轉接器
// ==========================================================================
const SPREADSHEET_ID = {
    PRD: APP_CONFIG.SHEETS.PRD
};

const SHEET_NAMES = {
    PRODUCTS: APP_CONFIG.SHEET_NAMES.PRD.PRODUCTS
};

// ==========================================================================
// 2. 系統狀態管理
// ==========================================================================
let appState = {
    exchangeRate: APP_CONFIG.FIN?.EXCHANGE_RATE?.MYR_TWD || 8.00, // 基準匯率 (預設 1 MYR = 8.00 TWD)
    products: {
        ALL: [],
        TW: [],
        MY: []
    },
    baseCodes: [] // 跨國產品編號 (base_code) 清單
};

// 跨境現貨對沖沙盒購物車 state: [{ product_code, qty }]
let swapCart = [];
let matrixTableInstance = null;
let rawTableInstance = null;
let chartEfficiencyInstance = null;
let isInitialized = false;

// ==========================================================================
// 3. 系統生命週期與事件初始化
// ==========================================================================
window.addEventListener('AppReady', async () => {
    await initApp();
});

async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    // 同步匯率輸入框與目標 SV 至全域設定預設值
    $('#fxRateRange').val(appState.exchangeRate);
    $('#fxRateInput').val(appState.exchangeRate.toFixed(2));
    $('#solverTargetSV').val(APP_CONFIG.ORG?.SV_LINE_ACTIVE || 160);

    bindUIEvents();
    initChart();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        AppToast.error("未設定 Google 試算表 ID，無法讀取產品主檔資料！");
    }

    triggerConverterFromTWD();
    renderCart();
    recalculateSolver();
}

// ==========================================================================
// 4. 解析 Google Sheets 數據 (依 Schema 索引順序讀取)
// ==========================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i>正在讀取雲端資料庫...', '載入中...');
    
    try {
        const rawRows = await fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.PRODUCTS);

        if (!rawRows || rawRows.length === 0) {
            throw new Error("試算表『產品主檔』工作表中未讀取到任何有效產品數據。");
        }

        const parsedProducts = parseProductsTable(rawRows);
        appState.products.ALL = parsedProducts;
        appState.products.TW = parsedProducts.filter(p => p.region_code === 'TW');
        appState.products.MY = parsedProducts.filter(p => p.region_code === 'MY');

        // 以「跨國產品編號」(base_code) 建立兩國對比連結索引清單
        appState.baseCodes = Array.from(new Set(parsedProducts.map(p => p.base_code).filter(Boolean))).sort();

        refreshAllViews();
        AppToast.success(`已成功同步 ${parsedProducts.length} 筆台馬跨國產品主檔`);
    } catch (err) {
        console.error("Google Sheets 產品主檔讀取失敗:", err);
        AppDialog.alert("無法連線至 Google 試算表讀取資料，請檢查網路連線或共用權限！", {
            title: "資料載入失敗",
            icon: "fa-solid fa-triangle-exclamation text-danger"
        });
    } finally {
        AppLoading.hide();
    }
}

// 解析「產品主檔」數據列
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
            name: getVal(r, 3, '未命名產品'),
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
            is_featured: ['TRUE', 'Y', '1'].includes(getVal(r, 15, 'FALSE').toUpperCase()),
            stock_status: stockStatus,
            launch_date: launchDate,
            discontinue_date: discontinueDate,
            status: getProductStatus(launchDate, discontinueDate),
            is_valid: isValid
        };
    }).filter(item => item.is_valid !== 'N' && (item.product_code !== '' || item.name !== '未命名產品'));
}

// 依據上市日期與下市日期判定狀態：'COMING_SOON' (即將上市)、'ACTIVE' (販售中)、'DISCONTINUED' (已下市)
function getProductStatus(launchDateVal, discontinueDateVal) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    const lTs = AppDate.toTimestamp(launchDateVal);
    const dTs = AppDate.toTimestamp(discontinueDateVal);

    if (lTs > 0 && lTs > todayTs) return 'COMING_SOON';
    if (dTs > 0 && dTs <= todayTs) return 'DISCONTINUED';
    return 'ACTIVE';
}

// ==========================================
// 5. 介面事件綁定
// ==========================================
function handleRateChange(val) {
    let rate = parseFloat(val);
    const defaultRate = APP_CONFIG.FIN?.EXCHANGE_RATE?.MYR_TWD || 8.00;
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
        const twd = Math.round(sv * 36.46);
        const myr = Math.round(twd / appState.exchangeRate);

        $('#inputTWD').val(twd);
        $('#inputMYR').val(myr);
        updateConverterMetrics(twd, sv, myr);
    });

    $('#inputMYR').off('input').on('input', function () {
        const myr = parseFloat($(this).val()) || 0;
        const twd = Math.round(myr * appState.exchangeRate);
        const sv = Math.round(twd / 36.46);

        $('#inputTWD').val(twd);
        $('#inputSV').val(sv);
        updateConverterMetrics(twd, sv, myr);
    });

    $('#solverTargetSV, #solverStrategy').off('change input').on('change input', function () {
        recalculateSolver();
    });

    $('#btnCopyQuote').off('click').on('click', copyQuoteToClipboard);

    // 清單數量手動輸入（即時輸入）
    $(document).off('input', '.cart-qty-input').on('input', '.cart-qty-input', function () {
        const index = parseInt($(this).data('index'), 10);
        const rawVal = $(this).val();
        if (rawVal === '') return; // 允許暫時清空重打

        let qty = parseInt(rawVal, 10);
        if (isNaN(qty) || qty <= 0) qty = 1;
        swapCart[index].qty = qty;
        recalculateCartTotals();
    });

    // 清單數量手動輸入（離開焦點或確認後校正）
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

window.setQuickRate = function (rate) {
    $('#fxRateRange').val(rate).trigger('input');
    AppToast.info(`已切換結算匯率至 1 MYR = ${rate.toFixed(2)} TWD`);
};

window.adjustRate = function (delta) {
    let current = parseFloat($('#fxRateInput').val()) || appState.exchangeRate;
    let target = Math.round((current + delta) * 100) / 100;
    $('#fxRateRange').val(target).trigger('input');
};

// ==========================================================================
// 6. 雙向極速算力閥核心邏輯
// ==========================================================================
function triggerConverterFromTWD() {
    const twd = parseFloat($('#inputTWD').val()) || 0;
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;
    const myr = Math.round(twd / rate);
    const sv = Math.round(twd / 36.46);

    $('#inputMYR').val(myr);
    $('#inputSV').val(sv);
    updateConverterMetrics(twd, sv, myr);
}

function updateConverterMetrics(twd, sv, myr) {
    $('#ratioTWD').text(sv > 0 ? (twd / sv).toFixed(2) + " NT$/SV" : "36.46 NT$/SV");
    $('#ratioMYR').text(sv > 0 ? (myr / sv).toFixed(2) + " RM/SV" : "5.10 RM/SV");
}

window.setQuickSV = function (targetSV) {
    $('#inputSV').val(targetSV).trigger('input');
    $('#solverTargetSV').val(targetSV);
    recalculateSolver();
    AppToast.info(`已設定快速目標：${targetSV} SV`);
};

// ==========================================================================
// 7. 跨境現貨對沖與平帳沙盒 (依 base_code 精準計算)
// ==========================================================================
function renderCart() {
    const $container = $('#cartItemsList');
    $container.empty();

    if (swapCart.length === 0) {
        $container.html(`
            <div class="h-100 d-flex flex-column justify-content-center align-items-center py-5 text-center text-light-emphasis">
                <div class="p-3 rounded-circle bg-dark bg-opacity-75 border border-info border-opacity-25 mb-3 shadow-sm">
                    <i class="fa-solid fa-cart-flatbed text-info fs-3"></i>
                </div>
                <div class="fw-bold text-white mb-1 fs-6">對沖艙目前無品項</div>
                <p class="small text-light-emphasis mb-0">
                    請至下方「產品對照庫」點擊 <span class="badge badge-secondary-subtle"><i class="fa-solid fa-plus me-1"></i>加入</span> 進行跨境平帳試算
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
                        品號：${prod.product_code} ‧ 單價：<span class="text-yellow">NT$ ${prod.price.toLocaleString()}</span> ‧ 單品 SV：<span class="text-teal">${prod.sv_point} SV</span>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <div class="input-group input-group-sm" style="width: 100px;">
                        <button type="button" class="btn btn-outline-secondary py-0" onclick="updateCartQty(${index}, -1)">-</button>
                        <input type="number" min="1" class="form-control form-control-sm no-spin text-center bg-dark text-white p-0 cart-qty-input" value="${item.qty}" data-index="${index}">
                        <button type="button" class="btn btn-outline-secondary py-0" onclick="updateCartQty(${index}, 1)">+</button>
                    </div>
                    <button type="button" class="btn btn-outline-danger btn-sm ms-1" onclick="removeCartItem(${index})" title="移除品項">
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

        const itemSV = prod.sv_point * item.qty;
        const itemTWD = (prod.currency === 'TWD' ? prod.price : prod.price * rate) * item.qty;

        const myProd = appState.products.MY.find(p => p.base_code === prod.base_code);
        const itemMYR = myProd ? (myProd.price * item.qty) : Math.round(itemTWD / rate);

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

window.setCartQty = function (index, val) {
    let qty = parseInt(val, 10);
    if (isNaN(qty) || qty <= 0) {
        qty = 1;
    }
    swapCart[index].qty = qty;
    renderCart();
};

window.removeCartItem = function (index) {
    swapCart.splice(index, 1);
    renderCart();
    AppToast.info("已自對沖艙移除品項");
};

function updateCartTotals(totalSV, totalTWD, totalMYR) {
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;

    $('#totalCartSV').text(`${totalSV.toLocaleString()} SV`);
    $('#totalCartTWD').text(`NT$ ${Math.round(totalTWD).toLocaleString()}`);
    $('#totalCartMYR').text(`RM ${Math.round(totalMYR).toLocaleString()}`);

    const myrConvertedTwd = totalMYR * rate;
    const cashDifferenceTwd = totalTWD - myrConvertedTwd;

    $('#totalCartDiff').text(`NT$ ${Math.abs(Math.round(cashDifferenceTwd)).toLocaleString()}`);

    if (cashDifferenceTwd > 0) {
        $('#cartArbitrageText').html(`
            <i class="fa-solid fa-arrow-trend-up text-warning me-1"></i>大馬需補貼台灣代墊差額：<span class="text-warning fw-bold">NT$ ${Math.round(cashDifferenceTwd).toLocaleString()}</span>
        `);
    } else if (cashDifferenceTwd < 0) {
        $('#cartArbitrageText').html(`
            <i class="fa-solid fa-arrow-trend-down text-warning me-1"></i>台灣需退款大馬溢付差額：<span class="text-warning fw-bold">NT$ ${Math.abs(Math.round(cashDifferenceTwd)).toLocaleString()}</span>
        `);
    } else {
        $('#cartArbitrageText').html(`
            <i class="fa-solid fa-scale-balanced text-success me-1"></i>兩地對沖帳目完全兩平 (${rate.toFixed(2)} 匯率基準)
        `);
    }
}

// ==========================================================================
// 8. 缺額智能湊單求解器 (Goal SV Solver)
// ==========================================================================
function recalculateSolver() {
    const defaultTargetSV = APP_CONFIG.ORG?.SV_LINE_ACTIVE || 160;
    const targetSV = parseFloat($('#solverTargetSV').val()) || defaultTargetSV;
    const strategy = $('#solverStrategy').val();
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : (APP_CONFIG.FIN?.EXCHANGE_RATE?.MYR_TWD || 8.00);

    let candidateProducts = [...(appState.products.TW || [])];
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
            ${i.name} × ${i.qty} 盒 (${i.sv} SV)
        </span>
    `).join('');

    $('#solverRecommendationBox').html(`
        <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="fw-bold text-primary small"><i class="fa-solid fa-lightbulb me-1"></i>演算法最佳推薦配置</span>
            <span class="badge badge-warning-subtle">${accumulatedSV.toLocaleString()} SV 達成</span>
        </div>
        <div class="mb-2 d-flex flex-wrap">${itemsHtml}</div>
        <div class="d-flex justify-content-between small pt-2 border-top border-secondary border-opacity-25">
            <span>進貨總金額：<b class="text-secondary">NT$ ${totalTWD.toLocaleString()} / RM ${Math.round(totalTWD / rate).toLocaleString()}</b></span>
        </div>
    `);
}

// ==========================================================================
// 9. DataTables 渲染與 base_code 雙軌矩陣
// ==========================================================================
function refreshAllViews() {
    renderCrossBorderMatrix();
    renderRawProductTable();
    updateChartData();
}

/**
 * 格式化跨國產品對照表單列資料物件
 */
function formatCrossBorderMatrixRow(code) {
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;
    const twProd = appState.products.TW.find(p => p.base_code === code);
    const myProd = appState.products.MY.find(p => p.base_code === code);

    const getStatusBadge = (status) => {
        return (status === 'COMING_SOON' || status === 'DISCONTINUED')
            ? ` ${UIBadges.product.launchStatus(status)}`
            : '';
    };

    const twInfo = twProd
        ? `<div class="fw-bold text-secondary">${twProd.name}${getStatusBadge(twProd.status)} <span class="text-muted small">(${twProd.product_code})</span></div><div class="text-secondary-emphasis small">${twProd.package_spec}</div>`
        : `<span class="badge badge-danger-subtle">台灣未發行</span>`;

    const twPrice = twProd 
        ? `<span class="text-yellow fw-bold">NT$ ${Number(twProd.price).toLocaleString()}</span> / <span class="text-teal fw-bold">${Number(twProd.sv_point).toLocaleString()} SV</span>` 
        : `-`;

    const myInfo = myProd
        ? `<div class="fw-bold text-secondary">${myProd.name}${getStatusBadge(myProd.status)} <span class="text-muted small">(${myProd.product_code})</span></div><div class="text-secondary-emphasis small">${myProd.package_spec}</div>`
        : `<span class="badge badge-danger-subtle">大馬未上市</span>`;

    const myPrice = myProd 
        ? `<span class="text-yellow fw-bold">RM ${Number(myProd.price).toLocaleString()}</span> / <span class="text-teal fw-bold">${Number(myProd.sv_point).toLocaleString()} SV</span>` 
        : `-`;

    const twCostPerSv = twProd && twProd.sv_point > 0 ? (twProd.price / twProd.sv_point).toFixed(2) : null;
    const myCostPerSv = myProd && myProd.sv_point > 0 ? (myProd.price / myProd.sv_point).toFixed(2) : null;
    let costCompare = `-`;
    if (twCostPerSv && myCostPerSv) {
        costCompare = `<span class="text-secondary small">${Number(twCostPerSv).toLocaleString()} NT$/SV</span> <span class="text-muted">vs</span> <span class="text-secondary small">${Number(myCostPerSv).toLocaleString()} RM/SV</span>`;
    } else if (twCostPerSv) {
        costCompare = `<span class="text-secondary small">${Number(twCostPerSv).toLocaleString()} NT$/SV</span>`;
    } else if (myCostPerSv) {
        costCompare = `<span class="text-secondary small">${Number(myCostPerSv).toLocaleString()} RM/SV</span>`;
    }

    let diffText = `<span class="text-light-emphasis">-</span>`;
    if (twProd && myProd) {
        const myConvertedTwd = myProd.price * rate;
        const diff = myConvertedTwd - twProd.price;
        diffText = diff >= 0
            ? `<span class="badge badge-success-subtle">+NT$ ${Math.round(diff).toLocaleString()}</span>`
            : `<span class="badge badge-danger-subtle">-NT$ ${Math.abs(Math.round(diff)).toLocaleString()}</span>`;
    }

    const actionBtn = twProd
        ? `<button type="button" class="btn btn-sm btn-outline-primary py-1 px-2" onclick="addSkuToCart('${twProd.product_code}')" title="加入跨境對沖沙盒"><i class="fa-solid fa-plus me-1"></i>加入</button>`
        : (myProd
            ? `<button type="button" class="btn btn-sm btn-outline-primary py-1 px-2" onclick="addSkuToCart('${myProd.product_code}')" title="加入跨境對沖沙盒"><i class="fa-solid fa-plus me-1"></i>加入</button>`
            : `<button type="button" class="btn btn-sm btn-outline-secondary py-1 px-2" disabled><i class="fa-solid fa-ban me-1"></i>無貨</button>`);

    return {
        base_code: `<span class="badge badge-secondary-subtle font-monospace">${code}</span>`,
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
 * 格式化原始產品主檔表單列資料物件
 */
function formatRawProductRow(prod) {
    const costPerSv = prod.sv_point > 0 ? (prod.price / prod.sv_point).toFixed(2) : '0.00';
    const isTW = prod.region_code === 'TW';
    const regionBadge = UIBadges.common.country(prod.region_code);
    const currPrefix = isTW ? 'NT$ ' : 'RM ';
    const costUnit = isTW ? 'NT$/SV' : 'RM/SV';
    const statusBadge = (prod.status === 'COMING_SOON' || prod.status === 'DISCONTINUED')
        ? ` ${UIBadges.product.launchStatus(prod.status)}`
        : '';
    const prodInfo = `<div class="fw-bold text-secondary">${prod.name}${statusBadge}</div><div class="text-secondary-emphasis small">${prod.package_spec}</div>`;
    const priceDisplay = `<span class="text-yellow fw-bold">${currPrefix}${Number(prod.price).toLocaleString()}</span>`;
    const svDisplay = `<span class="text-teal fw-bold">${Number(prod.sv_point).toLocaleString()} SV</span>`;
    const costDisplay = `<span class="text-secondary small">${Number(costPerSv).toLocaleString()} ${costUnit}</span>`;

    return {
        region: regionBadge,
        product_code: `<span class="badge badge-secondary-subtle">${prod.product_code}</span>`,
        product_info: prodInfo,
        price_sv: `${priceDisplay} / ${svDisplay}`,
        cost_per_sv: costDisplay,
        actions: `
            <button type="button" class="btn btn-sm btn-outline-primary py-1 px-2" onclick="addSkuToCart('${prod.product_code}')" title="加入跨境對沖沙盒">
                <i class="fa-solid fa-plus me-1"></i>加入
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

// ==========================================================================
// 10. 購物車操作
// ==========================================================================
window.addSkuToCart = function (productCode) {
    const existing = swapCart.find(i => i.product_code === productCode);
    if (existing) {
        existing.qty += 1;
    } else {
        swapCart.push({ product_code: productCode, qty: 1 });
    }
    renderCart();
    AppToast.success(`已將品項加入對沖沙盒`);
};

// ==========================================================================
// 11. Chart.js 單點 SV 效益視覺化圖表 (依 base_code 雙向對照)
// ==========================================================================
function initChart() {
    const canvas = document.getElementById('arbitrageDiffChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    chartEfficiencyInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: '台馬換算價差 (NT$)',
                data: [],
                backgroundColor: [],
                borderColor: [],
                borderWidth: 1,
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
                        label: function (context) {
                            const val = context.raw;
                            return ` 價差：${val >= 0 ? '+' : ''}${val} NT$ (${val >= 0 ? '大馬高於台灣' : '台灣高於大馬'})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#f5f3ff',
                        font: { size: 9 },
                        callback: val => `${val} 元`
                    },
                    grid: { color: 'rgba(56, 189, 248, 0.08)' }
                },
                y: {
                    ticks: {
                        color: '#f1f5f9',
                        font: { size: 10, weight: '500' }
                    },
                    grid: { display: false }
                }
            }
        }
    });

    updateChartData();
}

function updateChartData() {
    if (!chartEfficiencyInstance) return;
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;

    const pairedDiffList = [];
    appState.baseCodes.forEach(code => {
        const tw = appState.products.TW.find(p => p.base_code === code);
        const my = appState.products.MY.find(p => p.base_code === code);

        if (tw && my && tw.price > 0 && my.price > 0) {
            const myTwd = my.price * rate;
            const diff = Math.round(myTwd - tw.price);
            pairedDiffList.push({
                name: tw.name.length > 6 ? tw.name.slice(0, 6) + '…' : tw.name,
                diff: diff
            });
        }
    });

    pairedDiffList.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const top5 = pairedDiffList.slice(0, 5);

    chartEfficiencyInstance.data.labels = top5.map(i => i.name);
    chartEfficiencyInstance.data.datasets[0].data = top5.map(i => i.diff);

    chartEfficiencyInstance.data.datasets[0].backgroundColor = top5.map(i => 
        i.diff >= 0 ? 'rgba(34, 197, 94, 0.65)' : 'rgba(239, 68, 68, 0.65)'
    );
    chartEfficiencyInstance.data.datasets[0].borderColor = top5.map(i => 
        i.diff >= 0 ? '#22c55e' : '#ef4444'
    );

    chartEfficiencyInstance.update();
}

// ==========================================================================
// 12. 報價單與對帳字串產生器 (依 base_code 對應)
// ==========================================================================
function copyQuoteToClipboard() {
    if (swapCart.length === 0) {
        AppToast.warning("請先添加品項至對沖艙！");
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
            const itemSV = p.sv_point * item.qty;
            const itemTWD = (p.currency === 'TWD' ? p.price : p.price * rate) * item.qty;
            
            const myProd = appState.products.MY.find(my => my.base_code === p.base_code);
            const itemMYR = myProd ? (myProd.price * item.qty) : Math.round(itemTWD / rate);

            totalSV += itemSV;
            totalTWD += itemTWD;
            totalMYR += itemMYR;

            lines.push(`▫️ [${p.base_code}] ${p.name} (${p.package_spec}) × ${item.qty} 盒 -> ${itemSV} SV (NT$ ${Math.round(itemTWD).toLocaleString()} / RM ${Math.round(itemMYR).toLocaleString()})`);
        }
    });

    const myrConvertedTwd = totalMYR * rate;
    const diffTwd = totalTWD - myrConvertedTwd;

    const quoteText =
`🌟【UVACO 葡眾 榮祥團隊 跨境現貨對沖與平帳單】🌟
--------------------------------------
📦 交付現貨品項（含跨國編號）：
${lines.join('\n')}
--------------------------------------
🎯 交付現貨總 SV 目標：${totalSV.toLocaleString()} SV
💰 台灣交付出貨成本：NT$ ${Math.round(totalTWD).toLocaleString()}
🇲🇾 大馬對等下單金額：RM ${Math.round(totalMYR).toLocaleString()}
📊 結算匯率基準：1 MYR ≈ ${rate.toFixed(2)} TWD
⚖️ 兩地現貨平帳差額：NT$ ${Math.abs(Math.round(diffTwd)).toLocaleString()} (${diffTwd >= 0 ? '大馬受領人補貼' : '台灣出貨人退款'})`;

    navigator.clipboard.writeText(quoteText).then(() => {
        AppToast.success("已複製 LINE / WhatsApp 報價單至剪貼簿！");
    }).catch(() => {
        AppToast.error("複製失敗，請手動複製");
    });
}