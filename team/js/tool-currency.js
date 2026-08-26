// ==========================================================================
// 1. Google 雲端試算表設定與核心轉接器
// ==========================================================================
const SPREADSHEET_ID = "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I";

function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && row[colIndex] !== '') {
        return row[colIndex].toString().trim();
    }
    return defaultVal;
}

// ==========================================================================
// 2. 系統狀態管理
// ==========================================================================
let appState = {
    exchangeRate: 8.00, // 基準匯率 (預設 1 MYR = 8.00 TWD)
    products: {
        ALL: [],
        TW: [],
        MY: []
    },
    baseCodes: []
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
// 4. PapaParse + GViz 資料讀取引擎 (表 104 prd_items 讀取)
// ==========================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步產品與匯率數據...', '載入台馬產品主檔與雙向價目');
    try {
        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP 通訊錯誤狀態碼: ${res.status}`);
            const text = await res.text();

            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return parsed.data.slice(1);
        };

        const rawRows = await fetchSheet('產品主檔');

        if (!rawRows || rawRows.length === 0) {
            throw new Error("試算表『產品主檔』工作表中未讀取到任何有效產品數據。");
        }

        const parsedProducts = parseProductsTable(rawRows);
        appState.products.ALL = parsedProducts;
        appState.products.TW = parsedProducts.filter(p => p.region_code === 'TW');
        appState.products.MY = parsedProducts.filter(p => p.region_code === 'MY');

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

function parseProductsTable(rows) {
    return rows.map((r, idx) => {
        const rawId = getVal(r, 0, String(idx + 1));
        const productCode = getVal(r, 3);
        let regionCode = getVal(r, 1, 'TW').toUpperCase();

        if (!regionCode || (regionCode !== 'TW' && regionCode !== 'MY')) {
            regionCode = productCode.startsWith('MY') ? 'MY' : 'TW';
        }

        let baseCode = getVal(r, 2, productCode.replace(/^(TW|MY)/, ''));

        if (productCode === 'TW0302003' || productCode === 'MY0302002') {
            baseCode = '0302003';
        }
        if (productCode === 'TW0105005' || productCode === 'MY0105001') {
            baseCode = '0105005';
        }

        const priceNum = parseFloat(getVal(r, 10, '0')) || 0;
        const svNum = parseInt(getVal(r, 12, '0')) || 0;
        const weightNum = parseFloat(getVal(r, 14, '0.5')) || 0.5;

        return {
            id: rawId,
            region_code: regionCode,
            base_code: baseCode,
            product_code: productCode,
            name: getVal(r, 4, '未命名產品'),
            short_name: getVal(r, 5),
            short_summary: getVal(r, 6),
            type_name: getVal(r, 7, '保健'),
            subcategory_code: getVal(r, 8),
            package_spec: getVal(r, 9, '-'),
            price: priceNum,
            currency: getVal(r, 11, regionCode === 'MY' ? 'MYR' : 'TWD'),
            sv_point: svNum,
            primary_image_url: getVal(r, 13),
            weight: weightNum
        };
    }).filter(item => item.product_code !== '' || item.name !== '未命名產品');
}

// ==========================================
// 5. 介面事件綁定
// ==========================================
function bindUIEvents() {
    function handleRateChange(val) {
        let rate = parseFloat(val);
        if (isNaN(rate) || rate <= 0) rate = 8.00;
        rate = Math.min(Math.max(rate, 7.00), 9.00);

        appState.exchangeRate = rate;

        $('#fxRateRange').val(rate);
        $('#fxRateInput').val(rate.toFixed(2));

        triggerConverterFromTWD();
        renderCart();
        refreshAllViews();
        recalculateSolver();
    }

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
// 7. 跨境現貨對沖與平帳沙盒
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
                    請至下方「產品對照庫」點擊 <span class="badge badge-secondary-subtle"><i class="fa-solid fa-plus"></i> 加入</span> 進行跨境平帳試算
                </p>
            </div>
        `);
        updateCartTotals(0, 0, 0);
        return;
    }

    let totalSV = 0;
    let totalTWD = 0;

    swapCart.forEach((item, index) => {
        const prod = appState.products.ALL.find(p => p.product_code === item.product_code);
        if (!prod) return;

        const itemSV = prod.sv_point * item.qty;
        const itemTWD = prod.price * item.qty;

        totalSV += itemSV;
        totalTWD += itemTWD;

        $container.append(`
            <div class="sku-card-item p-2 px-3 d-flex justify-content-between align-items-center">
                <div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge badge-secondary-subtle small">${prod.product_code}</span>
                        <span class="fw-bold text-white small">${prod.name}</span>
                        <span class="text-light-emphasis small">(${prod.package_spec})</span>
                    </div>
                    <div class="text-light-emphasis" style="font-size: 0.75rem;">
                        單價：NT$ ${prod.price.toLocaleString()} ‧ 單品 SV：<span class="text-warning">${prod.sv_point} SV</span> ‧ 單重 ${prod.weight}kg
                    </div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <div class="input-group input-group-sm" style="width: 100px;">
                        <button class="btn btn-outline-secondary py-0" onclick="updateCartQty(${index}, -1)">-</button>
                        <input type="text" class="form-control text-center bg-dark text-white p-0" value="${item.qty}" readonly>
                        <button class="btn btn-outline-secondary py-0" onclick="updateCartQty(${index}, 1)">+</button>
                    </div>
                    <button class="btn btn-sm btn-link text-danger p-0 ms-1" onclick="removeCartItem(${index})">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `);
    });

    const estimatedMYR = Math.round(totalSV * 5.01);
    updateCartTotals(totalSV, totalTWD, estimatedMYR);
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
    AppToast.info("已自對沖艙移除品項");
};

function updateCartTotals(totalSV, totalTWD, totalMYR) {
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;

    $('#totalCartSV').text(`${totalSV.toLocaleString()} SV`);
    $('#totalCartTWD').text(`NT$ ${totalTWD.toLocaleString()}`);
    $('#totalCartMYR').text(`RM ${totalMYR.toLocaleString()}`);

    const myrConvertedTwd = totalMYR * rate;
    const cashDifferenceTwd = totalTWD - myrConvertedTwd;

    $('#totalCartDiff').text(`NT$ ${Math.abs(Math.round(cashDifferenceTwd)).toLocaleString()}`);

    if (cashDifferenceTwd > 0) {
        $('#cartArbitrageText').html(`
            <i class="fa-solid fa-arrow-trend-up text-warning"></i> 大馬需補貼台灣代墊差額：<span class="text-warning fw-bold">NT$ ${Math.round(cashDifferenceTwd).toLocaleString()}</span>
        `);
    } else if (cashDifferenceTwd < 0) {
        $('#cartArbitrageText').html(`
            <i class="fa-solid fa-arrow-trend-down text-warning"></i> 台灣需退款大馬溢付差額：<span class="text-warning fw-bold">NT$ ${Math.abs(Math.round(cashDifferenceTwd)).toLocaleString()}</span>
        `);
    } else {
        $('#cartArbitrageText').html(`
            <i class="fa-solid fa-scale-balanced text-success"></i> 兩地對沖帳目完全兩平 (${rate.toFixed(2)} 匯率基準)
        `);
    }
}

// ==========================================================================
// 8. 缺額智能湊單求解器 (Goal SV Solver)
// ==========================================================================
function recalculateSolver() {
    const targetSV = parseFloat($('#solverTargetSV').val()) || 160;
    const strategy = $('#solverStrategy').val();
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;

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
            <span class="fw-bold text-primary small"><i class="fa-solid fa-lightbulb"></i> 演算法最佳推薦配置</span>
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

function renderCrossBorderMatrix() {
    const $tbody = $('#crossBorderTableBody');
    if (!$tbody.length) return;

    if (matrixTableInstance) {
        matrixTableInstance.destroy();
        matrixTableInstance = null;
    }
    $tbody.empty();

    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;

    appState.baseCodes.forEach(code => {
        const twProd = appState.products.TW.find(p => p.base_code === code);
        const myProd = appState.products.MY.find(p => p.base_code === code);

        const twInfo = twProd
            ? `<div class="fw-bold text-secondary">${twProd.name}</div><div class="text-secondary-emphasis small">${twProd.package_spec}</div>`
            : `<span class="badge badge-danger-subtle">台灣未發行</span>`;
        const twPrice = twProd 
            ? `<span class="text-secondary fw-bold">NT$ ${twProd.price.toLocaleString()}</span> / <span class="text-warning fw-bold">${twProd.sv_point} SV</span>` 
            : `-`;

        const myInfo = myProd
            ? `<div class="fw-bold text-secondary">${myProd.name}</div><div class="text-secondary-emphasis small">${myProd.package_spec}</div>`
            : `<span class="badge badge-danger-subtle">大馬未上市</span>`;
        const myPrice = myProd 
            ? `<span class="text-secondary fw-bold">RM ${myProd.price.toLocaleString()}</span> / <span class="text-warning fw-bold">${myProd.sv_point} SV</span>` 
            : `-`;

        const twCostPerSv = twProd ? (twProd.price / twProd.sv_point).toFixed(2) : null;
        const myCostPerSv = myProd ? (myProd.price / myProd.sv_point).toFixed(2) : null;
        let costCompare = `-`;
        if (twCostPerSv && myCostPerSv) {
            costCompare = `<span class="text-secondary small">${twCostPerSv} NT$/SV</span> <span class="text-muted">vs</span> <span class="text-secondary small">${myCostPerSv} RM/SV</span>`;
        } else if (twCostPerSv) {
            costCompare = `<span class="text-secondary small">${twCostPerSv} NT$/SV</span>`;
        } else if (myCostPerSv) {
            costCompare = `<span class="text-secondary small">${myCostPerSv} RM/SV</span>`;
        }

        let diffText = `<span class="text-light-emphasis">-</span>`;
        if (twProd && myProd) {
            const myConvertedTwd = myProd.price * rate;
            const diff = myConvertedTwd - twProd.price;
            diffText = diff >= 0
                ? `<span class="badge badge-warning-subtle">+NT$ ${Math.round(diff).toLocaleString()}</span>`
                : `<span class="badge badge-warning-subtle">-NT$ ${Math.abs(Math.round(diff)).toLocaleString()}</span>`;
        }

        const actionBtn = twProd
            ? `<button type="button" class="btn btn-sm btn-outline-primary py-1 px-2" onclick="addSkuToCart('${twProd.product_code}')" title="加入跨境對沖沙盒"><i class="fa-solid fa-plus"></i> 加入</button>`
            : `<button type="button" class="btn btn-sm btn-outline-secondary py-1 px-2" disabled><i class="fa-solid fa-ban"></i> 無貨</button>`;

        $tbody.append(`
            <tr>
                <td class="text-center"><span class="badge badge-secondary-subtle">${code}</span></td>
                <td>${twInfo}</td>
                <td>${twPrice}</td>
                <td>${myInfo}</td>
                <td>${myPrice}</td>
                <td>${costCompare}</td>
                <td>${diffText}</td>
                <td>${actionBtn}</td>
            </tr>
        `);
    });

    if ($.fn.DataTable) {
        matrixTableInstance = $('#crossBorderMatrixTable').DataTable({
            searching: true,
            responsive: true,
            retrieve: true
        });
    }
}

function renderRawProductTable() {
    const $tbody = $('#rawProductTableBody');
    if (!$tbody.length) return;

    if (rawTableInstance) {
        rawTableInstance.destroy();
        rawTableInstance = null;
    }
    $tbody.empty();

    appState.products.ALL.forEach(prod => {
        const costPerSv = prod.sv_point > 0 ? (prod.price / prod.sv_point).toFixed(2) : '0.00';
        const isTW = prod.region_code === 'TW';
        const regionBadge = isTW
            ? `<span class="badge badge-blue">台灣 TW</span>`
            : `<span class="badge badge-green">大馬 MY</span>`;
        const currPrefix = isTW ? 'NT$ ' : 'RM ';
        const costUnit = isTW ? 'NT$/SV' : 'RM/SV';
        const priceClass = 'text-secondary';

        const prodInfo = `<div class="fw-bold text-secondary">${prod.name}</div><div class="text-secondary-emphasis small">${prod.package_spec}</div>`;
        const priceDisplay = `<span class="${priceClass} fw-bold">${currPrefix}${prod.price.toLocaleString()}</span>`;
        const svDisplay = `<span class="text-warning fw-bold">${prod.sv_point} SV</span>`;
        const costDisplay = `<span class="text-secondary small">${costPerSv} ${costUnit}</span>`;

        $tbody.append(`
            <tr>
                <td class="text-center">${regionBadge}</td>
                <td class="text-center"><span class="badge badge-secondary-subtle">${prod.product_code}</span></td>
                <td>${prodInfo}</td>
                <td>${priceDisplay} / ${svDisplay}</td>
                <td>${costDisplay}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline-primary py-1 px-2" onclick="addSkuToCart('${prod.product_code}')" title="加入跨境對沖沙盒">
                        <i class="fa-solid fa-plus"></i> 加入
                    </button>
                </td>
            </tr>
        `);
    });

    if ($.fn.DataTable) {
        rawTableInstance = $('#rawProductTable').DataTable({
            searching: true,
            responsive: true,
            retrieve: true
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
// 11. Chart.js 單點 SV 效益視覺化圖表
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
                        color: '#94a3b8',
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
// 12. 報價單與對帳字串產生器
// ==========================================================================
function copyQuoteToClipboard() {
    if (swapCart.length === 0) {
        AppToast.warning("請先添加品項至對沖艙！");
        return;
    }

    let totalSV = 0;
    let totalTWD = 0;
    let lines = [];
    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.00;

    swapCart.forEach(item => {
        const p = appState.products.ALL.find(x => x.product_code === item.product_code);
        if (p) {
            const itemSV = p.sv_point * item.qty;
            const itemTWD = p.price * item.qty;
            totalSV += itemSV;
            totalTWD += itemTWD;
            lines.push(`▫️ ${p.name} (${p.package_spec}) × ${item.qty} 盒 -> ${itemSV} SV (NT$ ${itemTWD.toLocaleString()})`);
        }
    });

    const estimatedMYR = Math.round(totalSV * 5.01);
    const myrConvertedTwd = estimatedMYR * rate;
    const diffTwd = totalTWD - myrConvertedTwd;

    const quoteText =
`🌟【UVACO 葡眾 榮祥團隊 跨境現貨對沖與平帳單】🌟
--------------------------------------
📦 台灣交付現貨明細：
${lines.join('\n')}
--------------------------------------
🎯 交付現貨總 SV 目標：${totalSV.toLocaleString()} SV
💰 台灣交付出貨成本：NT$ ${totalTWD.toLocaleString()}
🇲🇾 大馬官網應下單額：約 RM ${estimatedMYR.toLocaleString()}
📊 結算匯率基準：1 MYR ≈ ${rate.toFixed(2)} TWD
⚖️ 兩地現貨平帳差額：NT$ ${Math.abs(Math.round(diffTwd)).toLocaleString()} (${diffTwd >= 0 ? '大馬受領人補貼' : '台灣出貨人退款'})`;

    navigator.clipboard.writeText(quoteText).then(() => {
        AppToast.success("已複製 LINE / WhatsApp 報價單至剪貼簿！");
    }).catch(() => {
        AppToast.error("複製失敗，請手動複製");
    });
}