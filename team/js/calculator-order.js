// ==========================================
// 1. 完整產品資料庫
// ==========================================
const initialProducts = [
    { id: "1301", name: "康爾喜複合乳酸菌", country: "TW", mainSeries: "保健食品", subSeries: "腸道保健", type: "粉劑/益生菌", price: 1760, sv: 1510, desc: "雙層包埋技術 專利菌株" },
    { id: "1302", name: "康爾喜-N複合乳酸菌", country: "TW", mainSeries: "保健食品", subSeries: "腸道保健", type: "粉劑/益生菌", price: 1760, sv: 1510, desc: "升級版 13 株專利益生菌" },
    { id: "1101", name: "995超級營養液 (24包)", country: "TW", mainSeries: "保健食品", subSeries: "免疫防護", type: "飲品/液體", price: 5540, sv: 4800, desc: "大豆發酵液 迅速補充體力" },
    { id: "1102", name: "樟芝益菌絲體液 (24包)", country: "TW", mainSeries: "保健食品", subSeries: "免疫防護", type: "飲品/液體", price: 5540, sv: 4800, desc: "樟芝專利發酵 滋補強身" },
    { id: "1201", name: "百克斯膠囊", country: "TW", mainSeries: "保健食品", subSeries: "體質調理", type: "膠囊", price: 1470, sv: 1260, desc: "黑松露、黑蒜精華 活力充沛" },
    { id: "1202", name: "衛傑膠囊", country: "TW", mainSeries: "保健食品", subSeries: "腸道保健", type: "膠囊", price: 1470, sv: 1260, desc: "猴頭菇與山藥精華 消化順暢" },
    { id: "1203", name: "愛益膠囊", country: "TW", mainSeries: "保健食品", subSeries: "體質調理", type: "膠囊", price: 1470, sv: 1260, desc: "花粉與花蜜濃縮 調節體質" },
    { id: "1401", name: "葡眾餐包 (原味/30包)", country: "TW", mainSeries: "營養調理", subSeries: "日常營養", type: "粉劑/益生菌", price: 1470, sv: 1260, desc: "燕麥與高鈣配方 全家營養" },
    { id: "1204", name: "迪斯尼膠囊", country: "TW", mainSeries: "保健食品", subSeries: "晶亮護眼", type: "膠囊", price: 1470, sv: 1260, desc: "晶亮守護 枸杞與決明子萃取" },
    { id: "0301", name: "雅姿蘭護手霜", country: "TW", mainSeries: "個人保養", subSeries: "皮膚護理", type: "膏/霜/保養", price: 880, sv: 700, desc: "草本保濕 潤澤修護" },
    { id: "1205", name: "活英華膠囊", country: "TW", mainSeries: "保健食品", subSeries: "體質調理", type: "膠囊", price: 2940, sv: 2520, desc: "關鍵靈活 葡萄糖胺升級" },
    { id: "1206", name: "和悅膠囊", country: "TW", mainSeries: "保健食品", subSeries: "心血管保健", type: "膠囊", price: 1470, sv: 1260, desc: "循環順暢 專利納豆激酶" },
    { id: "0302", name: "雅霓潤膚乳液", country: "TW", mainSeries: "個人保養", subSeries: "皮膚護理", type: "膏/霜/保養", price: 840, sv: 720, desc: "植物萃取 滋潤不油膩" },
    { id: "0401", name: "葡眾溫和洗髮精", country: "TW", mainSeries: "清潔用品", subSeries: "居家清潔", type: "清潔用品", price: 504, sv: 430, desc: "深層清潔 溫和不刺激" },
    { id: "M101", name: "馬來西亞專屬 康爾喜益生菌", country: "MY", mainSeries: "保健食品", subSeries: "腸道保健", type: "粉劑/益生菌", price: 260, sv: 1510, desc: "馬來西亞國際版包裝" }
];

// 主次系列對應關聯
const subSeriesMap = {
    "保健食品": ["腸道保健", "免疫防護", "體質調理", "晶亮護眼", "心血管保健"],
    "個人保養": ["皮膚護理", "臉部精華"],
    "清潔用品": ["居家清潔", "個人洗沐"],
    "營養調理": ["日常營養", "高纖高鈣"]
};

// 全域狀態管理
let productsData = [...initialProducts];
let cartState = {}; // { productId: qty }
let currentView = "card";
let dataTableInstance = null;

// 5 個 Chart.js 實例全域宣告
let chartCategorySvInstance = null;
let chartCategoryAmountInstance = null;
let chartTypeQtyInstance = null;
let chartSubSeriesSvInstance = null;
let chartMainCategoryComparisonInstance = null;

// 當前篩選條件 (網頁3邏輯)
let filterState = {
    country: "TW",
    mainSeries: "ALL",
    subSeries: "ALL",
    type: "ALL",
    searchQuery: ""
};

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    // 初始化 5 大統計圖表
    initAllCharts();

    // 初始化選單與渲染產品
    renderProducts();

    // 監聽網頁3過濾事件
    $("#countrySelect").on("change", function () {
        filterState.country = $(this).val();
        renderProducts();
    });

    $("#mainSeriesSelect").on("change", function () {
        const selectedMain = $(this).val();
        filterState.mainSeries = selectedMain;
        filterState.subSeries = "ALL";

        const $subSelect = $("#subSeriesSelect");
        $subSelect.empty();

        if (selectedMain === "ALL" || !subSeriesMap[selectedMain]) {
            $subSelect.append('<option value="ALL">請先選擇主系列</option>').prop("disabled", true);
        } else {
            $subSelect.append('<option value="ALL">全部次系列</option>');
            subSeriesMap[selectedMain].forEach(sub => {
                $subSelect.append(`<option value="${sub}">${sub}</option>`);
            });
            $subSelect.prop("disabled", false);
        }
        renderProducts();
    });

    $("#subSeriesSelect").on("change", function () {
        filterState.subSeries = $(this).val();
        renderProducts();
    });

    $("#searchInput").on("input", function () {
        filterState.searchQuery = $(this).val().trim().toLowerCase();
        renderProducts();
    });

    $("#typeFilterContainer").on("click", ".type-btn", function () {
        $("#typeFilterContainer .type-btn").removeClass("active");
        $(this).addClass("active");
        filterState.type = $(this).data("type");
        renderProducts();
    });

    // 監聽職級%數切換
    $("#rank-select").on("change", function () {
        updateCartSummary();
    });

    // 檢視模式切換 (卡片式 / 表格式)
    $("#btn-view-card").on("click", function () {
        if (currentView !== "card") {
            currentView = "card";
            $(".view-switch-btn").removeClass("active");
            $(this).addClass("active");
            $("#productGrid").removeClass("d-none");
            $("#productTableCard").addClass("d-none");
            renderProducts();
        }
    });

    $("#btn-view-table").on("click", function () {
        if (currentView !== "table") {
            currentView = "table";
            $(".view-switch-btn").removeClass("active");
            $(this).addClass("active");
            $("#productGrid").addClass("d-none");
            $("#productTableCard").removeClass("d-none");
            renderProducts();
        }
    });

    // 懸浮島 Bar 顯示/隱藏切換控制
    $("#btnHideFloatingBar").on("click", function () {
        $("#floatingIslandBar").addClass("is-hidden");
        $("#btnShowFloatingBar").fadeIn(100);
    });

    $("#btnShowFloatingBar").on("click", function () {
        $("#floatingIslandBar").removeClass("is-hidden");
        $(this).fadeOut(100);
        setupIframeFloatingPositionEngine();
    });

    // 初始化與綁定 iframe 父視窗滾動動態定位引擎
    setupIframeFloatingPositionEngine();

    // 重載與清空
    $("#btn-reload-data").on("click", function () {
        productsData = [...initialProducts];
        renderProducts();
        updateCartSummary();
    });

    $("#btn-clear-all").on("click", function () {
        if (Object.keys(cartState).length === 0) return;
        if (confirm("確定要清空目前已選擇的所有商品嗎？")) {
            cartState = {};
            renderProducts();
            updateCartSummary();
        }
    });

    // 匯出按鈕事件
    $("#btn-export-excel").on("click", function () {
        exportOrderToExcel();
    });

    $("#btn-export-pdf").on("click", function () {
        exportOrderToPDF();
    });
});

// ==========================================
// ✨ iframe 視窗滾動動態追蹤與精準貼底計算引擎 (完美留出 120px 頁尾保護距)
// ==========================================
function setupIframeFloatingPositionEngine() {
    function updatePosition() {
        try {
            const isInsideIframe = (window.self !== window.top);
            if (!isInsideIframe) return; // 若單獨開啟頁面則依賴標準 CSS 固定

            const parentWin = window.parent;
            const frameEl = window.frameElement;
            if (!parentWin || !frameEl) return;

            const parentScrollY = parentWin.scrollY || parentWin.pageYOffset || 0;
            const parentInnerHeight = parentWin.innerHeight || document.documentElement.clientHeight;
            
            const frameRect = frameEl.getBoundingClientRect();
            const iframeTopInParent = frameRect.top + parentScrollY;
            const iframeHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);

            // 1. 定位懸浮島 (#floatingIslandBar)
            const $bar = $('#floatingIslandBar');
            if ($bar.length && !$bar.hasClass('is-hidden')) {
                const barHeight = $bar.outerHeight() || 65;
                const viewportBottomInIframe = (parentScrollY + parentInnerHeight) - iframeTopInParent;

                // 設定懸浮島離視窗可見底部的距離
                let targetTop = viewportBottomInIframe - barHeight - 20;

                // ✨ 關鍵修正：設有 120px 的底部停靠極限 (Max Boundary)，當滑到頁尾時，懸浮島會剛好停靠在頁尾上方！
                const maxAllowedTop = iframeHeight - barHeight - 120;
                targetTop = Math.max(20, Math.min(targetTop, maxAllowedTop));

                $bar.css({
                    'position': 'absolute',
                    'top': targetTop + 'px',
                    'bottom': 'auto',
                    'transform': 'translateX(-50%)'
                });
            }

            // 2. 定位左下角喚醒按鈕 (#btnShowFloatingBar) - 置於「左側」，徹底避開右下角 BackToTop 按鈕
            const $wakeBtn = $('#btnShowFloatingBar');
            if ($wakeBtn.length) {
                const btnHeight = $wakeBtn.outerHeight() || 40;
                const viewportBottomInIframe = (parentScrollY + parentInnerHeight) - iframeTopInParent;

                let btnTargetTop = viewportBottomInIframe - btnHeight - 25;
                const maxAllowedBtnTop = iframeHeight - btnHeight - 120;
                btnTargetTop = Math.max(25, Math.min(btnTargetTop, maxAllowedBtnTop));

                $wakeBtn.css({
                    'position': 'absolute',
                    'top': btnTargetTop + 'px',
                    'bottom': 'auto',
                    'left': '25px',  // ✨ 移至左下角！
                    'right': 'auto'
                });
            }
        } catch (e) {
            console.warn("Cross-origin iframe tracking notice:", e);
        }
    }

    // 綁定父視窗滾動與 Resize 事件
    try {
        if (window.self !== window.top && window.parent) {
            window.parent.addEventListener('scroll', updatePosition, { passive: true });
            window.parent.addEventListener('resize', updatePosition, { passive: true });
        }
    } catch (e) {
        console.warn(e);
    }

    // 當前子頁面滾動與 Resize 監聽
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });

    // 初始化立即觸發與定時校準
    updatePosition();
    setTimeout(updatePosition, 300);
    setTimeout(updatePosition, 800);
}

// 依據篩選條件過濾商品
function getFilteredProducts() {
    return productsData.filter(item => {
        const matchCountry = (filterState.country === "ALL") || (item.country === filterState.country);
        const matchMain = (filterState.mainSeries === "ALL") || (item.mainSeries === filterState.mainSeries);
        const matchSub = (filterState.subSeries === "ALL") || (item.subSeries === filterState.subSeries);
        const matchType = (filterState.type === "ALL") || (item.type === filterState.type);
        
        const q = filterState.searchQuery;
        const matchSearch = !q || 
            item.name.toLowerCase().includes(q) || 
            item.id.toLowerCase().includes(q) || 
            (item.desc && item.desc.toLowerCase().includes(q));

        return matchCountry && matchMain && matchSub && matchType && matchSearch;
    });
}

// 核心：渲染產品列表 (卡片模式或表格模式)
function renderProducts() {
    const filtered = getFilteredProducts();

    if (currentView === "card") {
        const $grid = $("#productGrid");
        $grid.empty();

        if (filtered.length === 0) {
            $grid.append(`
                <div class="col-12 text-center text-muted py-5 war-card">
                    <i class="fa-solid fa-magnifying-glass-minus fa-3x mb-3 opacity-50"></i>
                    <p class="mb-0">未找到符合條件的產品，請嘗試調整篩選關鍵字</p>
                </div>
            `);
            return;
        }

        filtered.forEach(item => {
            const qty = cartState[item.id] || 0;
            const cardHtml = `
                <div class="col-12 col-sm-6 col-md-4">
                    <div class="product-item-card">
                        <div>
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="product-badge"><i class="fa-solid fa-hashtag"></i> ${item.id}</span>
                                <span class="badge bg-secondary opacity-75">${item.mainSeries}</span>
                            </div>
                            <h6 class="product-title">${item.name}</h6>
                            <p class="small text-muted mb-2">${item.desc || ""}</p>
                        </div>
                        <div>
                            <div class="d-flex justify-content-between align-items-center mb-1 small">
                                <span>售價: <span class="price-num">NT$ ${item.price.toLocaleString()}</span></span>
                                <span>積分: <span class="sv-num">${item.sv.toLocaleString()} SV</span></span>
                            </div>
                            <div class="qty-control">
                                <button class="btn-qty btn-minus" data-id="${item.id}">
                                    <i class="fa-solid fa-minus"></i>
                                </button>
                                <input type="number" class="qty-input" value="${qty}" min="0" data-id="${item.id}">
                                <button class="btn-qty btn-plus" data-id="${item.id}">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            $grid.append(cardHtml);
        });
    } else {
        // 表格模式 (網頁2風格 + DataTables)
        const $tbody = $("#productTable tbody");
        $tbody.empty();

        filtered.forEach(item => {
            const qty = cartState[item.id] || 0;
            const rowHtml = `
                <tr>
                    <td><span class="product-badge">${item.id}</span></td>
                    <td class="fw-bold text-white">${item.name}</td>
                    <td><span class="badge bg-secondary">${item.mainSeries}</span></td>
                    <td class="small text-muted">${item.subSeries} / ${item.type}</td>
                    <td class="text-end price-num">NT$ ${item.price.toLocaleString()}</td>
                    <td class="text-end sv-num">${item.sv.toLocaleString()} SV</td>
                    <td class="text-center">
                        <div class="qty-control justify-content-center">
                            <button class="btn-qty btn-minus" data-id="${item.id}">
                                <i class="fa-solid fa-minus"></i>
                            </button>
                            <input type="number" class="qty-input" value="${qty}" min="0" data-id="${item.id}">
                            <button class="btn-qty btn-plus" data-id="${item.id}">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            $tbody.append(rowHtml);
        });

        if (dataTableInstance) {
            dataTableInstance.destroy();
        }

        dataTableInstance = $('#productTable').DataTable({
            language: {
                search: "_INPUT_",
                searchPlaceholder: "在表格中快速精準過濾...",
                lengthMenu: "顯示 _MENU_ 筆",
                info: "顯示第 _START_ 至 _END_ 筆，共 _TOTAL_ 筆",
                paginate: { next: '›', previous: '‹' }
            },
            pageLength: 6,
            lengthChange: false,
            ordering: true
        });
    }

    // 重新綁定數量控制按鈕事件
    bindQtyEvents();
}

// 綁定數量增減按鈕
function bindQtyEvents() {
    $(".btn-plus").off("click").on("click", function () {
        const id = String($(this).data("id"));
        cartState[id] = (cartState[id] || 0) + 1;
        updateQtyInputsUI(id);
        updateCartSummary();
    });

    $(".btn-minus").off("click").on("click", function () {
        const id = String($(this).data("id"));
        if (cartState[id] && cartState[id] > 0) {
            cartState[id] -= 1;
            if (cartState[id] === 0) delete cartState[id];
            updateQtyInputsUI(id);
            updateCartSummary();
        }
    });

    $(".qty-input").off("change input").on("change input", function () {
        const id = String($(this).data("id"));
        let val = parseInt($(this).val()) || 0;
        if (val < 0) val = 0;
        if (val === 0) {
            delete cartState[id];
        } else {
            cartState[id] = val;
        }
        updateQtyInputsUI(id);
        updateCartSummary();
    });
}

function updateQtyInputsUI(id) {
    const qty = cartState[id] || 0;
    $(`.qty-input[data-id="${id}"]`).val(qty);
}

// 核心：更新購物車試算摘要 & 動態重新計算 5 大統計圖表
function updateCartSummary() {
    const $container = $("#cart-items-container");
    $container.empty();

    let totalItemsCount = 0;
    let subtotalPrice = 0;
    let totalSV = 0;

    // 統計圖表需要的資料結構
    let catSvMap = {};
    let catAmountMap = {};
    let typeQtyMap = {};
    let subSeriesSvMap = {};

    const selectedKeys = Object.keys(cartState);

    if (selectedKeys.length === 0) {
        $container.html(`
            <div class="text-center text-muted py-4" id="empty-cart-msg">
                <i class="fa-solid fa-basket-shopping fa-2x mb-2 d-block opacity-50"></i>
                尚未選擇任何商品，請點擊數量增減選擇。
            </div>
        `);
    } else {
        selectedKeys.forEach(id => {
            const qty = cartState[id];
            const product = productsData.find(p => p.id === id);
            if (product && qty > 0) {
                const itemTotalPrice = product.price * qty;
                const itemTotalSV = product.sv * qty;

                subtotalPrice += itemTotalPrice;
                totalSV += itemTotalSV;
                totalItemsCount += qty;

                // 數據累積至圖表結構
                catSvMap[product.mainSeries] = (catSvMap[product.mainSeries] || 0) + itemTotalSV;
                catAmountMap[product.mainSeries] = (catAmountMap[product.mainSeries] || 0) + itemTotalPrice;
                typeQtyMap[product.type] = (typeQtyMap[product.type] || 0) + qty;
                subSeriesSvMap[product.subSeries] = (subSeriesSvMap[product.subSeries] || 0) + itemTotalSV;

                $container.append(`
                    <div class="cart-item-row">
                        <div class="cart-item-title" title="${product.name}">
                            <i class="fa-solid fa-box text-info"></i> ${product.name}
                        </div>
                        <div class="text-muted small">
                            x ${qty}
                        </div>
                        <div class="text-end">
                            <div class="text-warning font-weight-bold">NT$ ${itemTotalPrice.toLocaleString()}</div>
                            <div class="text-info style="font-size: 0.75rem;">${itemTotalSV.toLocaleString()} SV</div>
                        </div>
                    </div>
                `);
            }
        });
    }

    // 免運算計 (NT$ 5,000 免運，否則 NT$ 100 運費)
    const FREE_SHIPPING_THRESHOLD = 5000;
    const SHIPPING_FEE = 100;
    let shippingFee = 0;

    if (subtotalPrice > 0 && subtotalPrice < FREE_SHIPPING_THRESHOLD) {
        shippingFee = SHIPPING_FEE;
        const gap = FREE_SHIPPING_THRESHOLD - subtotalPrice;
        $("#shipping-alert")
            .removeClass("shipping-alert-success")
            .addClass("shipping-alert-warning")
            .html(`<i class="fa-solid fa-circle-info"></i> 還差 NT$ ${gap.toLocaleString()} 可享有免運費（運費 NT$ ${SHIPPING_FEE}）`);
    } else if (subtotalPrice >= FREE_SHIPPING_THRESHOLD) {
        shippingFee = 0;
        $("#shipping-alert")
            .removeClass("shipping-alert-warning")
            .addClass("shipping-alert-success")
            .html(`<i class="fa-solid fa-circle-check"></i> 已達 NT$ 5,000 免運費門檻！`);
    } else {
        shippingFee = 0;
        $("#shipping-alert")
            .removeClass("shipping-alert-success")
            .addClass("shipping-alert-warning")
            .html(`<i class="fa-solid fa-circle-info"></i> 還差 NT$ 5,000 可享有免運費（運費 NT$ ${SHIPPING_FEE}）`);
    }

    const shippingPercent = Math.min(100, (subtotalPrice / FREE_SHIPPING_THRESHOLD) * 100);
    $("#shipping-progress-bar").css("width", `${shippingPercent}%`);
    $("#shipping-progress-text").text(`${subtotalPrice.toLocaleString()} / ${FREE_SHIPPING_THRESHOLD.toLocaleString()}`);

    const grandTotal = subtotalPrice + shippingFee;

    // 預估現金回饋 (SV * 比率)
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const estimatedRebate = Math.round(totalSV * rankRatio);

    // 更新桌面版數字 UI (右側卡片區塊 - 完全未移動)
    $("#total-qty-badge").text(`${totalItemsCount} 件商品`);
    $("#summary-subtotal").text(subtotalPrice.toLocaleString());
    $("#summary-shipping").text(shippingFee > 0 ? `NT$ ${shippingFee}` : "免運費");
    $("#summary-grand-total").text(grandTotal.toLocaleString());
    $("#summary-total-sv").text(totalSV.toLocaleString());
    $("#summary-rebate-cash").text(estimatedRebate.toLocaleString());

    // 同步更新懸浮島 Bar 數字 UI
    $("#sticky-grand-total").text(grandTotal.toLocaleString());
    $("#sticky-total-sv").text(totalSV.toLocaleString());
    $("#sticky-rebate-cash").text(estimatedRebate.toLocaleString());

    // 核心：動態更新 5 大統計圖表數據
    updateAllChartsData({
        catSvMap,
        catAmountMap,
        typeQtyMap,
        subSeriesSvMap,
        totalSV
    });
}

// ==========================================
// 5 大統計圖表初始化與數據同步模組
// ==========================================
function initAllCharts() {
    // 圖表 1：訂購產品分類 SV 占比 (Doughnut)
    const ctx1 = document.getElementById('chartCategorySv').getContext('2d');
    chartCategorySvInstance = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: ['保健食品', '個人保養', '清潔用品', '營養調理'],
            datasets: [{
                data: [0, 0, 0, 0],
                backgroundColor: ['#38bdf8', '#7dd3fc', '#facc15', '#34d399'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } }
        }
    });

    // 圖表 2：各產品類別購買金額 (NT$) 占比 (Pie)
    const ctx2 = document.getElementById('chartCategoryAmount').getContext('2d');
    chartCategoryAmountInstance = new Chart(ctx2, {
        type: 'pie',
        data: {
            labels: ['保健食品', '個人保養', '清潔用品', '營養調理'],
            datasets: [{
                data: [0, 0, 0, 0],
                backgroundColor: ['#facc15', '#fb923c', '#a855f7', '#38bdf8'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } }
        }
    });

    // 圖表 3：各型態產品訂購數量分布 (Bar)
    const ctx3 = document.getElementById('chartTypeQty').getContext('2d');
    chartTypeQtyInstance = new Chart(ctx3, {
        type: 'bar',
        data: {
            labels: ['粉劑/益生菌', '膠囊', '飲品/液體', '膏/霜/保養', '清潔用品'],
            datasets: [{
                label: '訂購數量 (件)',
                data: [0, 0, 0, 0, 0],
                backgroundColor: 'rgba(52, 211, 153, 0.75)',
                borderColor: '#34d399',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: '#94a3b8', precision: 0 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // 新圖表 4：各次系列 (Sub-Series) SV 積分分佈分析 (Horizontal Bar)
    const ctx4 = document.getElementById('chartSubSeriesSv').getContext('2d');
    chartSubSeriesSvInstance = new Chart(ctx4, {
        type: 'bar',
        data: {
            labels: ['腸道保健', '免疫防護', '體質調理', '晶亮護眼', '心血管保健', '皮膚護理', '居家清潔', '日常營養'],
            datasets: [{
                label: '累積 SV 積分',
                data: [0, 0, 0, 0, 0, 0, 0, 0],
                backgroundColor: 'rgba(56, 189, 248, 0.75)',
                borderColor: '#38bdf8',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#f8fafc', font: { size: 10 } }, grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // 新圖表 5：各主系列金額 (NT$) 與 積分 (SV) 雙軸群組比較 (Grouped Bar)
    const ctx5 = document.getElementById('chartMainCategoryComparison').getContext('2d');
    chartMainCategoryComparisonInstance = new Chart(ctx5, {
        type: 'bar',
        data: {
            labels: ['保健食品', '個人保養', '清潔用品', '營養調理'],
            datasets: [
                {
                    label: '消費金額 (NT$)',
                    data: [0, 0, 0, 0],
                    backgroundColor: 'rgba(250, 204, 21, 0.8)',
                    borderColor: '#facc15',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: '累積積分 (SV)',
                    data: [0, 0, 0, 0],
                    backgroundColor: 'rgba(56, 189, 248, 0.8)',
                    borderColor: '#38bdf8',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#f8fafc', font: { size: 11 } }, grid: { display: false } }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#94a3b8', font: { size: 11 } }
                }
            }
        }
    });
}

// 動態刷新所有圖表數據
function updateAllChartsData(data) {
    const categories = ['保健食品', '個人保養', '清潔用品', '營養調理'];
    const types = ['粉劑/益生菌', '膠囊', '飲品/液體', '膏/霜/保養', '清潔用品'];
    const subSeriesList = ['腸道保健', '免疫防護', '體質調理', '晶亮護眼', '心血管保健', '皮膚護理', '居家清潔', '日常營養'];

    // 1. 主系列 SV
    chartCategorySvInstance.data.datasets[0].data = categories.map(c => data.catSvMap[c] || 0);
    chartCategorySvInstance.update();

    // 2. 主系列金額
    chartCategoryAmountInstance.data.datasets[0].data = categories.map(c => data.catAmountMap[c] || 0);
    chartCategoryAmountInstance.update();

    // 3. 型態數量
    chartTypeQtyInstance.data.datasets[0].data = types.map(t => data.typeQtyMap[t] || 0);
    chartTypeQtyInstance.update();

    // 4. 各次系列 SV 分佈
    chartSubSeriesSvInstance.data.datasets[0].data = subSeriesList.map(s => data.subSeriesSvMap[s] || 0);
    chartSubSeriesSvInstance.update();

    // 5. 各主系列 金額 vs SV 群組柱狀比較
    chartMainCategoryComparisonInstance.data.datasets[0].data = categories.map(c => data.catAmountMap[c] || 0);
    chartMainCategoryComparisonInstance.data.datasets[1].data = categories.map(c => data.catSvMap[c] || 0);
    chartMainCategoryComparisonInstance.update();
}

// 需求 3：下載 Excel 訂購清單 (SheetJS)
function exportOrderToExcel() {
    const selectedKeys = Object.keys(cartState);
    if (selectedKeys.length === 0) {
        alert("請先選擇至少一項商品後再下載 Excel！");
        return;
    }

    let excelData = [];
    excelData.push(["產品編號", "產品名稱", "主系列", "單價(NT$)", "單項SV", "數量", "小計金額(NT$)", "小計SV"]);

    let subtotal = 0;
    let totalSV = 0;

    selectedKeys.forEach(id => {
        const qty = cartState[id];
        const p = productsData.find(item => item.id === id);
        if (p && qty > 0) {
            const itemTotalNT = p.price * qty;
            const itemTotalSV = p.sv * qty;
            subtotal += itemTotalNT;
            totalSV += itemTotalSV;
            excelData.push([p.id, p.name, p.mainSeries, p.price, p.sv, qty, itemTotalNT, itemTotalSV]);
        }
    });

    const shipping = (subtotal > 0 && subtotal < 5000) ? 100 : 0;
    const grandTotal = subtotal + shipping;
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const rebate = Math.round(totalSV * rankRatio);

    excelData.push([]);
    excelData.push(["", "", "", "", "", "產品金額小計：", subtotal, totalSV]);
    excelData.push(["", "", "", "", "", "物流運費：", shipping, ""]);
    excelData.push(["", "", "", "", "", "應付總金額：", grandTotal, ""]);
    excelData.push(["", "", "", "", "", "預估現金回饋：", rebate, ""]);

    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "訂購試算明細");

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `榮祥葡眾訂購試算單_${dateStr}.xlsx`);
}

// 需求 3：下載 PDF 訂購清單 (html2pdf.js)
function exportOrderToPDF() {
    const selectedKeys = Object.keys(cartState);
    if (selectedKeys.length === 0) {
        alert("請先選擇至少一項商品後再下載 PDF！");
        return;
    }

    let subtotal = 0;
    let totalSV = 0;
    let rowsHtml = "";

    selectedKeys.forEach(id => {
        const qty = cartState[id];
        const p = productsData.find(item => item.id === id);
        if (p && qty > 0) {
            const price = p.price * qty;
            const sv = p.sv * qty;
            subtotal += price;
            totalSV += sv;
            rowsHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${p.id}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${p.name}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${qty}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">NT$ ${price.toLocaleString()}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${sv.toLocaleString()} SV</td>
                </tr>
            `;
        }
    });

    const shipping = (subtotal > 0 && subtotal < 5000) ? 100 : 0;
    const grandTotal = subtotal + shipping;
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const rebate = Math.round(totalSV * rankRatio);

    const pdfContainer = document.createElement("div");
    pdfContainer.style.padding = "20px";
    pdfContainer.style.fontFamily = "sans-serif";
    pdfContainer.style.color = "#111827";

    pdfContainer.innerHTML = `
        <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #0284c7; margin: 0 0 5px 0;">榮祥葡眾團隊 - 線上訂購試算單</h2>
            <p style="color: #6b7280; margin: 0; font-size: 13px;">列印/匯出時間：${new Date().toLocaleString('zh-TW')}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
            <thead>
                <tr style="background-color: #f3f4f6; color: #1f2937;">
                    <th style="padding: 8px; text-align: left;">編號</th>
                    <th style="padding: 8px; text-align: left;">商品名稱</th>
                    <th style="padding: 8px; text-align: center;">數量</th>
                    <th style="padding: 8px; text-align: right;">小計金額</th>
                    <th style="padding: 8px; text-align: right;">小計 SV</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>

        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; width: 280px; margin-left: auto;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span>產品金額合計：</span>
                <strong>NT$ ${subtotal.toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span>物流運費：</span>
                <strong>${shipping > 0 ? "NT$ 100" : "免運費"}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 16px; color: #d97706; border-top: 1px solid #e5e7eb; padding-top: 6px;">
                <span>應付總金額：</span>
                <strong>NT$ ${grandTotal.toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; color: #0284c7;">
                <span>累積總積分：</span>
                <strong>${totalSV.toLocaleString()} SV</strong>
            </div>
            <div style="display: flex; justify-content: space-between; color: #16a34a;">
                <span>預估現金回饋：</span>
                <strong>NT$ ${rebate.toLocaleString()}</strong>
            </div>
        </div>
    `;

    const opt = {
        margin: 10,
        filename: `榮祥葡眾訂購試算單_${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(pdfContainer).save();
}