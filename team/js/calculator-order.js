// ==========================================
// 1. Google 雲端硬碟試算表設定與核心轉接器
// ==========================================
let SPREADSHEET_ID = "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I"; // 公開的 Google Sheet ID

function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && row[colIndex] !== '') {
        return row[colIndex].toString().trim();
    }
    return defaultVal;
}

// 預設產品型態庫 (備援資料)
const defaultTypeIcons = [
    { id: "0", code: "ALL", name: "全部", nameEn: "All", icon: "fa-solid fa-border-all", color: "#94a3b8", bg: "rgba(10, 25, 19, 0.88)" },
    { id: "1", code: "TYPE001", name: "益生菌", nameEn: "Probiotics", icon: "fa-solid fa-bacteria", color: "#34d399", bg: "rgba(10, 25, 19, 0.88)" },
    { id: "2", code: "TYPE002", name: "膠囊", nameEn: "Capsules", icon: "fa-solid fa-capsules", color: "#38bdf8", bg: "rgba(10, 25, 19, 0.88)" },
    { id: "3", code: "TYPE003", name: "錠劑", nameEn: "Tablets", icon: "fa-solid fa-tablets", color: "#a7f3d0", bg: "rgba(10, 25, 19, 0.88)" },
    { id: "4", code: "TYPE004", name: "沖泡飲", nameEn: "Powder Drinks", icon: "fa-solid fa-mug-saucer", color: "#fbbf24", bg: "rgba(10, 25, 19, 0.88)" },
    { id: "5", code: "TYPE005", name: "液態飲", nameEn: "Liquid Drinks", icon: "fa-solid fa-droplet", color: "#60a5fa", bg: "rgba(10, 25, 19, 0.88)" },
    { id: "6", code: "TYPE006", name: "外用保養", nameEn: "Skincare", icon: "fa-solid fa-leaf", color: "#f472b6", bg: "rgba(10, 25, 19, 0.88)" },
    { id: "7", code: "TYPE007", name: "清潔", nameEn: "Cleansers", icon: "fa-solid fa-pump-soap", color: "#22d3ee", bg: "rgba(10, 25, 19, 0.88)" },
    { id: "8", code: "TYPE008", name: "口腔照護", nameEn: "Oral Care", icon: "fa-solid fa-tooth", color: "#818cf8", bg: "rgba(10, 25, 19, 0.88)" },
    { id: "9", code: "TYPE009", name: "特殊", nameEn: "Specialty", icon: "fa-solid fa-boxes-packing", color: "#f87171", bg: "rgba(10, 25, 19, 0.88)" }
];

// 預設產品系列庫 (備援資料)
const defaultSeriesData = [
    {
        id: "1", code: "01", name: "保健食品", nameEn: "Health Supplements", subs: [
            { id: "101", code: "0101", name: "全能防護", nameEn: "Overall Defense", icon: "fa-solid fa-shield-halved", color: "#f59e0b", bg: "rgba(10, 25, 19, 0.88)" },
            { id: "102", code: "0102", name: "關鍵調理", nameEn: "Core Care", icon: "fa-solid fa-dna", color: "#f43f5e", bg: "rgba(10, 25, 19, 0.88)" },
            { id: "103", code: "0103", name: "順暢保衛", nameEn: "Gut Balance", icon: "fa-solid fa-arrows-rotate", color: "#10b981", bg: "rgba(10, 25, 19, 0.88)" },
            { id: "104", code: "0104", name: "強健靈活", nameEn: "Joint & Bone", icon: "fa-solid fa-bone", color: "#06b6d4", bg: "rgba(10, 25, 19, 0.88)" },
            { id: "105", code: "0105", name: "活力丰采", nameEn: "Vitality Boost", icon: "fa-solid fa-sun", color: "#eab308", bg: "rgba(10, 25, 19, 0.88)" },
            { id: "106", code: "0106", name: "晶亮守護", nameEn: "Vision Care", icon: "fa-solid fa-eye", color: "#38bdf8", bg: "rgba(10, 25, 19, 0.88)" },
            { id: "107", code: "0107", name: "快樂賦活", nameEn: "Mind & Relax", icon: "fa-solid fa-face-smile-beam", color: "#a855f7", bg: "rgba(10, 25, 19, 0.88)" },
            { id: "108", code: "0108", name: "循環保健", nameEn: "Circulation", icon: "fa-solid fa-heart-pulse", color: "#ef4444", bg: "rgba(10, 25, 19, 0.88)" },
            { id: "109", code: "0109", name: "機能食品", nameEn: "Functional Foods", icon: "fa-solid fa-wheat-awn", color: "#84cc16", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    },
    {
        id: "2", code: "02", name: "寵愛毛孩", nameEn: "Pet Care", subs: [
            { id: "201", code: "0201", name: "寵物保健", nameEn: "Pet Health", icon: "fa-solid fa-paw", color: "#fb923c", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    },
    {
        id: "3", code: "03", name: "健康生活", nameEn: "Wellness Lifestyle", subs: [
            { id: "301", code: "0301", name: "臉部護理", nameEn: "Facial Care", icon: "fa-solid fa-spray-can-sparkles", color: "#ec4899", bg: "rgba(10, 25, 19, 0.88)" },
            { id: "302", code: "0302", name: "身體護理", nameEn: "Body Care", icon: "fa-solid fa-hand-holding-heart", color: "#34d399", bg: "rgba(10, 25, 19, 0.88)" },
            { id: "303", code: "0303", name: "口腔護理", nameEn: "Oral Care", icon: "fa-solid fa-tooth", color: "#60a5fa", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    },
    {
        id: "4", code: "04", name: "個人保養", nameEn: "Personal Care", subs: [
            { id: "401", code: "0401", name: "臉部保養", nameEn: "Skincare", icon: "fa-solid fa-spa", color: "#c084fc", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    }
];

// 預設靜態資料庫 (備援資料)
const defaultProducts = {
    TW: [
        {
            id: "1", region_code: "TW", base_code: "80050", product_code: "80050",
            name: "葡眾蟬花護手霜", short_name: "護手霜", short_summary: "改善手部肌膚乾燥、修護細紋、增加肌膚彈性。",
            type_name: "外用保養", subcategory_code: "0302", package_spec: "30g x 3 支／盒",
            price: "840", currency: "TWD", sv_point: "24",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/80050_護手霜_20250825_1.png"
        },
        {
            id: "2", region_code: "TW", base_code: "80070", product_code: "80070",
            name: "葡眾淨膚皂", short_name: "淨膚皂", short_summary: "深層清潔並滋養肌膚、適合敏感及乾性肌膚使用。",
            type_name: "清潔", subcategory_code: "0302", package_spec: "95g x 3 盒／組",
            price: "870", currency: "TWD", sv_point: "24",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/80070_淨膚皂_20250825_1.png"
        },
        {
            id: "3", region_code: "TW", base_code: "0101001", product_code: "TW0101001",
            name: "995生技營養品", short_name: "995", short_summary: "調節免疫力、活化細胞、增強體力、有助於營養補給及健康維持。",
            type_name: "液態飲", subcategory_code: "0101", package_spec: "180ml x 24 瓶／箱",
            price: "5980", currency: "TWD", sv_point: "164",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101001_995_20260205_1.png"
        },
        {
            id: "4", region_code: "TW", base_code: "0101002", product_code: "TW0101002",
            name: "永生福朗膠囊", short_name: "永生福朗", short_summary: "調節免疫力、有助於抗氧化、改善骨質疏鬆、安定神經。",
            type_name: "膠囊", subcategory_code: "0101", package_spec: "120 粒／瓶",
            price: "1770", currency: "TWD", sv_point: "48",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101002_永生福朗_20251016_1.png"
        },
        {
            id: "5", region_code: "TW", base_code: "0101003", product_code: "TW0101003",
            name: "康爾喜乳酸菌顆粒", short_name: "康爾喜", short_summary: "調節生理機能、改善體質、減輕過敏現象、健胃整腸。",
            type_name: "益生菌", subcategory_code: "0101", package_spec: "90 條／盒",
            price: "1890", currency: "TWD", sv_point: "52",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101003_康爾喜_20251016_1.png"
        },
        {
            id: "6", region_code: "TW", base_code: "0101004", product_code: "TW0101004",
            name: "葡眾360計劃", short_name: "360計劃", short_summary: "提供全方位保健計劃、強化免疫力、具備清除與修補功能。",
            type_name: "特殊", subcategory_code: "0101", package_spec: "30 包／盒",
            price: "11088", currency: "TWD", sv_point: "320",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101004_360計劃_20260504_1.png"
        }
    ],
    MY: [
        {
            id: "101", region_code: "MY", base_code: "0102001", product_code: "MY0102001",
            name: "Liprofac", short_name: "Liprofac", short_summary: "Antrodia cinnamomea mycelium powder, Phellinus linteus mycelium powder.",
            type_name: "膠囊", subcategory_code: "0102", package_spec: "120 caps / btl",
            price: "416.00", currency: "MYR", sv_point: "83",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/MY0102001_Liprofac_20260521_1.png"
        },
        {
            id: "102", region_code: "MY", base_code: "0105001", product_code: "MY0105001",
            name: "FemiRely", short_name: "FemiRely", short_summary: "Support women's physiological health, including dehulled adlay, black sugar.",
            type_name: "沖泡飲", subcategory_code: "0105", package_spec: "30 sachets/box",
            price: "400.00", currency: "MYR", sv_point: "82",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/MY0105001_FemiRely_20260505_1.png"
        }
    ]
};

// ==========================================
// 2. 系統狀態管理
// ==========================================
let appState = {
    country: 'TW',
    myRegion: 'WEST', // 'WEST' | 'EAST'
    displayCurrency: 'TWD', // 'TWD' | 'MYR'
    exchangeRate: 8.0, // 預設新台幣:馬幣 = 8:1 (1 MYR = 8 TWD)
    mainSeries: 'ALL',
    subSeries: 'ALL',
    productType: 'ALL',
    searchKeyword: '',
    products: defaultProducts,
    seriesList: defaultSeriesData,
    typeList: defaultTypeIcons
};

let cartState = {}; // { productId: qty }
let currentView = "card";
let dataTableInstance = null;
let clearModalInstance = null;

// Chart.js 實例管理
let chartCategorySvInstance = null;
let chartCategoryAmountInstance = null;
let chartTypeQtyInstance = null;
let chartSubSeriesSvInstance = null;
let chartMainCategoryComparisonInstance = null;
let chartTopItemsInstance = null;
let chartTypeSvRadarInstance = null;

// ==========================================
// 3. 頁面初始化與事件監聽
// ==========================================
window.addEventListener('AppReady', async () => {
    initAllCharts();
    await initApp();
    setupIframeFloatingPositionEngine();
});

let isInitialized = false;
async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    updateSeriesDropdowns();
    renderTypeFilterButtons();
    bindEvents();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        const syncElem = document.getElementById('syncStatus');
        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-database"></i> 使用備援資料庫';
    }

    renderProducts();
    updateCartSummary();
}

// ==========================================
// 4. 解析 Google Sheets 數據
// ==========================================
async function fetchGoogleSheetsData() {
    try {
        const syncElem = document.getElementById('syncStatus');
        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 產品資訊同步中...';

        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            const res = await fetch(url);
            const text = await res.text();
            
            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return parsed.data.slice(1);
        };

        const [productsData, mainCategoriesData, subcategoriesData, productTypesData] = await Promise.all([
            fetchSheet('產品主表'),
            fetchSheet('產品主系列表'),
            fetchSheet('產品次系列表'),
            fetchSheet('產品型態表')
        ]);

        if (productsData && productsData.length > 0) {
            const parsedAll = parseProductsTable(productsData);
            appState.products.TW = parsedAll.filter(p => p.region_code === 'TW');
            appState.products.MY = parsedAll.filter(p => p.region_code === 'MY');
        }

        if (mainCategoriesData && mainCategoriesData.length > 0) {
            appState.seriesList = buildSeriesTree(mainCategoriesData, subcategoriesData || []);
            updateSeriesDropdowns();
        }

        if (productTypesData && productTypesData.length > 0) {
            appState.typeList = [{ id: "0", code: "ALL", name: "全部", icon: "fa-solid fa-border-all", color: "#94a3b8", bg: "rgba(10, 25, 19, 0.88)" }];
            productTypesData.forEach((row, idx) => {
                const id = getVal(row, 0, String(idx + 1));
                const code = getVal(row, 1, `TYPE${idx + 1}`);
                const name = getVal(row, 2);
                const nameEn = getVal(row, 3);
                const icon = getVal(row, 4, 'fa-solid fa-tag');
                const color = getVal(row, 5, '#94a3b8');
                const bg = getVal(row, 6, 'rgba(10, 25, 19, 0.88)');
                
                if (name) {
                    appState.typeList.push({ id, code, name, nameEn, icon, color, bg });
                }
            });
            renderTypeFilterButtons();
        }

        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-circle-check"></i> 雲端資料同步完成';
    } catch (err) {
        console.warn("無法動態讀取 Google 試算表，切換至備援資料:", err);
        const syncElem = document.getElementById('syncStatus');
        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 雲端同步失敗，切換至備援庫';
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

        const baseCode = getVal(r, 2, productCode.replace(/^(TW|MY)/, ''));

        return {
            id: rawId,
            region_code: regionCode,
            base_code: baseCode,
            product_code: productCode,
            name: getVal(r, 4),
            short_name: getVal(r, 5),
            short_summary: getVal(r, 6),
            type_name: getVal(r, 7),
            subcategory_code: getVal(r, 8),
            package_spec: getVal(r, 9),
            price: getVal(r, 10, '0'),
            currency: getVal(r, 11, regionCode === 'MY' ? 'MYR' : 'TWD'),
            sv_point: getVal(r, 12, '0'),
            primary_image_url: getVal(r, 13)
        };
    }).filter(item => item.product_code !== '' || item.name !== '');
}

function buildSeriesTree(mainRows, subRows) {
    const seriesList = [];    

    mainRows.forEach((r, idx) => {
        const id = getVal(r, 0, String(idx + 1));
        const code = getVal(r, 1);
        const name = getVal(r, 2);
        const nameEn = getVal(r, 3);
        const icon = getVal(r, 4, 'fa-solid fa-tag');
        const color = getVal(r, 5, '#52b788');
        const bg = getVal(r, 6, 'rgba(10, 25, 19, 0.88)');

        if (code) {
            seriesList.push({ id, code, name, nameEn, icon, color, bg, subs: [] });
        }
    });

    subRows.forEach((r, idx) => {
        const id = getVal(r, 0, String(idx + 101));
        const parentCode = getVal(r, 1);
        const subCode = getVal(r, 2);
        const name = getVal(r, 3);
        const nameEn = getVal(r, 4);
        const icon = getVal(r, 5, 'fa-solid fa-tag');
        const color = getVal(r, 6, '#52b788');
        const bg = getVal(r, 7, 'rgba(10, 25, 19, 0.88)');

        if (subCode) {
            let parentSeries = seriesList.find(s => s.code === parentCode);
            if (!parentSeries) {
                parentSeries = { id: `M_${parentCode}`, code: parentCode, name: name || '系列', nameEn: nameEn || '', subs: [] };
                seriesList.push(parentSeries);
            }
            parentSeries.subs.push({ id, code: subCode, name, nameEn, icon, color, bg });
        }
    });

    return seriesList.length > 0 ? seriesList : defaultSeriesData;
}

function getLanguageName(item, isMY) {
    if (!item) return '';
    return isMY ? (item.nameEn || '') : item.name;
}

function getSubSeriesInfo(subCode, isMY) {
    let subObj = null;
    if (subCode) {
        for (const series of appState.seriesList) {
            if (series.subs) {
                const found = series.subs.find(s => s.code === subCode);
                if (found) {
                    subObj = found;
                    break;
                }
            }
        }
    }
    if (subObj) {
        return {
            name: getLanguageName(subObj, isMY) || subObj.name || subCode,
            icon: subObj.icon || 'fa-solid fa-tag',
            color: subObj.color || '#38bdf8',
            bg: subObj.bg || 'rgba(10, 25, 19, 0.88)'
        };
    }
    return {
        name: subCode || '一般系列',
        icon: 'fa-solid fa-tag',
        color: '#38bdf8',
        bg: 'rgba(10, 25, 19, 0.88)'
    };
}

function getTypeInfo(typeName) {
    if (!typeName) return { name: '保健', icon: 'fa-solid fa-box', color: '#34d399', bg: 'rgba(10, 25, 19, 0.88)' };
    const found = appState.typeList.find(t => t.name === typeName);
    if (found) {
        return {
            name: found.name,
            icon: found.icon || 'fa-solid fa-tag',
            color: found.color || '#34d399',
            bg: found.bg || 'rgba(10, 25, 19, 0.88)'
        };
    }
    return {
        name: typeName,
        icon: 'fa-solid fa-tag',
        color: '#34d399',
        bg: 'rgba(10, 25, 19, 0.88)'
    };
}

// ==========================================
// 5. 下拉選單與型態篩選器
// ==========================================
function updateSeriesDropdowns() {
    const mainSelect = document.getElementById('mainSeriesSelect');
    if (!mainSelect) return;

    const isMY = appState.country === 'MY';
    mainSelect.innerHTML = '<option value="ALL">全部主系列</option>';

    appState.seriesList.forEach(series => {
        const displayName = getLanguageName(series, isMY);
        if (displayName) {
            const opt = document.createElement('option');
            opt.value = series.code;
            opt.textContent = `${series.code} ${displayName}`;
            mainSelect.appendChild(opt);
        }
    });

    mainSelect.value = 'ALL';
    updateSubSeriesDropdown(mainSelect.value);
}

function updateSubSeriesDropdown(mainCode) {
    const subSelect = document.getElementById('subSeriesSelect');
    if (!subSelect) return;

    const isMY = appState.country === 'MY';
    subSelect.innerHTML = '';

    if (mainCode === 'ALL') {
        subSelect.disabled = true;
        subSelect.innerHTML = '<option value="ALL">請先選擇主系列</option>';
        return;
    }

    const targetSeries = appState.seriesList.find(s => s.code === mainCode);
    if (targetSeries && targetSeries.subs) {
        subSelect.disabled = false;
        const defaultOpt = document.createElement('option');
        defaultOpt.value = 'ALL';
        defaultOpt.textContent = '全部次分類';
        subSelect.appendChild(defaultOpt);

        targetSeries.subs.forEach(sub => {
            const displayName = getLanguageName(sub, isMY);
            if (displayName) {
                const opt = document.createElement('option');
                opt.value = sub.code;
                opt.textContent = `${sub.code} ${displayName}`;
                subSelect.appendChild(opt);
            }
        });
    }
}

function renderTypeFilterButtons() {
    let html = '';

    appState.typeList.forEach((item, index) => {
        const val = (item.name === '全部' ? 'ALL' : item.name);
        const isActive = appState.productType === val ? 'active' : '';

        html += `
            <button class="type-btn ${isActive}" data-type="${val}">
                <i class="${item.icon}"></i> ${item.name}
            </button>
        `;
    });

    const $container = $('#typeFilterContainer');
    if ($container.length > 0) {
        $container.html(html);
    }
}

// ==========================================
// 6. UI 事件綁定
// ==========================================
function bindEvents() {
    // 切換地區
    $("#countrySelect").on("change", function () {
        appState.country = $(this).val();
        appState.mainSeries = 'ALL';
        appState.subSeries = 'ALL';

        // 自動對應地區預設結算幣別與選單
        if (appState.country === 'MY') {
            appState.displayCurrency = 'MYR';
            $("#displayCurrencySelect").val('MYR');
            $("#myRegionBlock").removeClass('d-none');
        } else {
            appState.displayCurrency = 'TWD';
            $("#displayCurrencySelect").val('TWD');
            $("#myRegionBlock").addClass('d-none');
        }

        updateSeriesDropdowns();
        renderProducts();
        updateCartSummary();
    });

    // 結算幣別切換
    $("#displayCurrencySelect").on("change", function () {
        appState.displayCurrency = $(this).val();
        if (appState.displayCurrency === 'MYR' || appState.country === 'MY') {
            $("#myRegionBlock").removeClass('d-none');
        } else {
            $("#myRegionBlock").addClass('d-none');
        }
        updateCartSummary();
    });

    // 匯率設定輸入
    $("#exchangeRateInput").on("input change", function () {
        let rate = parseFloat($(this).val());
        if (isNaN(rate) || rate <= 0) rate = 8.0;
        appState.exchangeRate = rate;
        updateCartSummary();
    });

    // 馬來西亞地區切換
    $('input[name="myRegion"]').on("change", function () {
        appState.myRegion = $(this).val();
        updateCartSummary();
    });

    $("#mainSeriesSelect").on("change", function () {
        appState.mainSeries = $(this).val();
        appState.subSeries = 'ALL';
        updateSubSeriesDropdown(appState.mainSeries);
        renderProducts();
    });

    $("#subSeriesSelect").on("change", function () {
        appState.subSeries = $(this).val();
        renderProducts();
    });

    $("#searchInput").on("input", function () {
        appState.searchKeyword = $(this).val().trim().toLowerCase();
        renderProducts();
    });

    $("#typeFilterContainer").on("click", ".type-btn", function () {
        $("#typeFilterContainer .type-btn").removeClass("active");
        $(this).addClass("active");
        appState.productType = $(this).data("type");
        renderProducts();
    });

    $("#rank-select").on("change", function () {
        updateCartSummary();
    });

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

    $("#btnHideFloatingBar").on("click", function () {
        $("#floatingIslandBar").addClass("is-hidden");
        $("#btnShowFloatingBar").fadeIn(100);
    });

    $("#btnShowFloatingBar").on("click", function () {
        $("#floatingIslandBar").removeClass("is-hidden");
        $(this).fadeOut(100);
        setupIframeFloatingPositionEngine();
    });

    $("#btn-confirm-clear").on("click", function () {
        cartState = {};
        renderProducts();
        updateCartSummary();
        if (clearModalInstance) {
            clearModalInstance.hide();
        }
    });

    $("#btn-export-excel").on("click", exportOrderToExcel);
    $("#btn-export-pdf").on("click", exportOrderToPDF);

    $("#btn-clear-all").on("click", function () {
        if (Object.keys(cartState).length === 0) return;

        // 直接傳入訊息與點擊「確認」要執行的動作（不必寫 async / await）
        AppDialog.confirm(
            "您確定要清空目前已選擇的所有商品與訂購數量嗎？",
            function () {
                // 使用者按了確定才會執行這裡
                cartState = {};
                renderProducts();
                updateCartSummary();
            },
            { title: "確認清空購物車", confirmText: "確認清空" }
        );
    });
}

// ==========================================
// 7. 產品渲染引擎
// ==========================================
function getFilteredProducts() {
    let currentDataset = [];
    if (appState.country === 'ALL') {
        currentDataset = [...(appState.products.TW || []), ...(appState.products.MY || [])];
    } else {
        currentDataset = appState.products[appState.country] || [];
    }

    return currentDataset.filter(item => {
        if (appState.mainSeries !== 'ALL') {
            let itemSubCode = item.subcategory_code || '';
            
            if (item.product_code === '80050' || item.product_code === '80070') {
                itemSubCode = '0302';
            } else if (!itemSubCode && item.product_code.length >= 6) {
                itemSubCode = item.product_code.replace(/^(TW|MY)/, '').slice(0, 4);
            }

            if (appState.subSeries !== 'ALL') {
                if (itemSubCode !== appState.subSeries) return false;
            } else {
                if (itemSubCode.slice(0, 2) !== appState.mainSeries) return false;
            }
        }

        if (appState.productType !== 'ALL' && item.type_name !== appState.productType) {
            return false;
        }

        if (appState.searchKeyword !== '') {
            const k = appState.searchKeyword;
            const mName = (item.name || '').toLowerCase().includes(k);
            const mShort = (item.short_name || '').toLowerCase().includes(k);
            const mCode = (item.product_code || '').toLowerCase().includes(k);
            const mSummary = (item.short_summary || '').toLowerCase().includes(k);
            if (!mName && !mShort && !mCode && !mSummary) return false;
        }

        return true;
    });
}

function renderProducts() {
    const filtered = getFilteredProducts();

    if (currentView === "card") {
        const $grid = $("#productGrid");
        $grid.empty();

        if (filtered.length === 0) {
            $grid.append(`
                <div class="col-12 text-center text-muted py-5 war-card">
                    <i class="fa-solid fa-magnifying-glass-minus fa-3x mb-3 opacity-50"></i>
                    <p class="mb-0">未找到符合條件的產品，請調整篩選條件或搜尋關鍵字。</p>
                </div>
            `);
            return;
        }

        filtered.forEach(item => {
            const qty = cartState[item.id] || 0;
            const price = parseFloat(item.price) || 0;
            const sv = parseFloat(item.sv_point) || 0;
            const currencySymbol = item.currency === 'MYR' ? 'RM ' : 'NT$ ';
            const isMY = appState.country === 'MY' || item.region_code === 'MY';

            let subCode = item.subcategory_code || '';
            if (item.product_code === '80050' || item.product_code === '80070') {
                subCode = '0302';
            } else if (!subCode && item.product_code && item.product_code.length >= 6) {
                subCode = item.product_code.replace(/^(TW|MY)/, '').slice(0, 4);
            }

            const subInfo = getSubSeriesInfo(subCode, isMY);
            const typeInfo = getTypeInfo(item.type_name);

            const cardHtml = `
                <div class="col-12 col-sm-6 col-md-4">
                    <div class="product-item-card">
                        <div>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <span class="product-badge">${item.product_code || item.id}</span>
                                <span class="badge border" style="color: ${subInfo.color}; border-color: ${subInfo.color} !important; background-color: ${subInfo.bg};">
                                    <i class="${subInfo.icon}"></i> ${subInfo.name}
                                </span>
                                <span class="badge border" style="color: ${typeInfo.color}; border-color: ${typeInfo.color} !important; background-color: ${typeInfo.bg};">
                                    <i class="${typeInfo.icon}"></i> ${typeInfo.name}
                                </span>
                            </div>
                            <h6 class="product-title">${item.name}</h6>
                            <p class="small text-muted mb-2 text-truncate-2">${item.short_summary || "暫無產品簡介"}</p>
                        </div>
                        <div>
                            <div class="d-flex justify-content-between align-items-center mb-1 small">
                                <span>售價: <span class="price-num">${currencySymbol}${price.toLocaleString()}</span></span>
                                <span>積分: <span class="sv-num">${sv.toLocaleString()} SV</span></span>
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
        if (dataTableInstance) {
            dataTableInstance.destroy();
            dataTableInstance = null;
        }

        const $tbody = $("#productTable tbody");
        $tbody.empty();

        if (filtered.length === 0) {
            $tbody.append(`
                <tr>
                    <td colspan="7" class="text-center text-muted py-4">
                        <i class="fa-solid fa-magnifying-glass-minus fa-2x mb-2 opacity-50 d-block"></i>
                        未找到符合條件的產品，請調整篩選條件或搜尋關鍵字。
                    </td>
                </tr>
            `);
        } else {
            filtered.forEach(item => {
                const qty = cartState[item.id] || 0;
                const price = parseFloat(item.price) || 0;
                const sv = parseFloat(item.sv_point) || 0;
                const currencySymbol = item.currency === 'MYR' ? 'RM ' : 'NT$ ';
                const isMY = appState.country === 'MY' || item.region_code === 'MY';

                let subCode = item.subcategory_code || '';
                if (item.product_code === '80050' || item.product_code === '80070') {
                    subCode = '0302';
                } else if (!subCode && item.product_code && item.product_code.length >= 6) {
                    subCode = item.product_code.replace(/^(TW|MY)/, '').slice(0, 4);
                }

                const subInfo = getSubSeriesInfo(subCode, isMY);
                const typeInfo = getTypeInfo(item.type_name);

                const rowHtml = `
                    <tr>
                        <td><span class="product-badge">${item.product_code || item.id}</span></td>
                        <td class="fw-bold text-white">${item.name}</td>
                        <td>
                            <span class="badge border" style="color: ${subInfo.color}; border-color: ${subInfo.color} !important; background-color: ${subInfo.bg};">
                                <i class="${subInfo.icon}"></i> ${subInfo.name}
                            </span>
                        </td>
                        <td>
                            <span class="badge border" style="color: ${typeInfo.color}; border-color: ${typeInfo.color} !important; background-color: ${typeInfo.bg};">
                                <i class="${typeInfo.icon}"></i> ${typeInfo.name}
                            </span>
                        </td>
                        <td class="text-end price-num">${currencySymbol}${price.toLocaleString()}</td>
                        <td class="text-end sv-num">${sv.toLocaleString()} SV</td>
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

            dataTableInstance = $('#productTable').DataTable();
        }
    }

    bindQtyEvents();
}

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

function findProductById(id) {
    const all = [...(appState.products.TW || []), ...(appState.products.MY || [])];
    return all.find(p => p.id === id);
}

// ==========================================
// 8. 訂購試算摘要與運費/匯率邏輯 (核心升級區)
// ==========================================
function updateCartSummary() {
    const $container = $("#cart-items-container");
    $container.empty();

    let totalItemsCount = 0;
    let totalSV = 0;
    let subtotalDisplay = 0;

    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
    const targetCurr = appState.displayCurrency; // 'TWD' | 'MYR'
    const isTargetMYR = targetCurr === 'MYR';
    const currSymbol = isTargetMYR ? 'RM ' : 'NT$ ';

    let catSvMap = {};
    let catAmountMap = {};
    let typeQtyMap = {};
    let subSeriesSvMap = {};

    const selectedKeys = Object.keys(cartState);

    // ✨ 當購物車為空時處理
    if (selectedKeys.length === 0) {
        $container.html(`
            <div class="text-center text-muted d-flex flex-column align-items-center justify-content-center" style="min-height: 150px;" id="empty-cart-msg">
                <i class="fa-solid fa-basket-shopping fa-2x mb-2 opacity-50"></i>
                尚未選擇任何商品，請點擊數量增減選擇。
            </div>
        `);

        // 設定免運提示文字
        if (appState.country === 'MY') {
            $("#shipping-threshold-title").html(`<i class="fa-solid fa-truck-fast"></i> RM 800 免運費門檻`);
            $("#shipping-progress-text").text(`0 / 800 RM`);
            $("#shipping-alert")
                .removeClass("shipping-alert-success")
                .addClass("shipping-alert-warning")
                .html(`<i class="fa-solid fa-circle-info"></i> 滿 RM 800 免運費`);
        } else {
            $("#shipping-threshold-title").html(`<i class="fa-solid fa-truck-fast"></i> 480 SV 免運費門檻`);
            $("#shipping-progress-text").text(`0 / 480 SV`);
            $("#shipping-alert")
                .removeClass("shipping-alert-success")
                .addClass("shipping-alert-warning")
                .html(`<i class="fa-solid fa-circle-info"></i> 滿 480 SV 免運費`);
        }

        $("#shipping-progress-bar").css("width", `0%`);

        // 面板與懸浮島 UI 歸零，運費顯示「-」
        $("#total-qty-badge").text(`0 件商品`);
        $("#summary-subtotal").text(`${currSymbol}0`);
        $("#summary-shipping").text("-"); // ✨ 購物車為空時顯示 -
        $("#summary-grand-total").text(`${currSymbol}0`);
        $("#summary-total-sv").text(`0 SV`);
        $("#summary-rebate-cash").text(`${currSymbol}0`);

        $("#sticky-grand-total").text(`${currSymbol}0`);
        $("#sticky-total-sv").text(`0 SV`);
        $("#sticky-rebate-cash").text(`${currSymbol}0`);

        updateAllChartsData({ catSvMap, catAmountMap, typeQtyMap, subSeriesSvMap, totalSV: 0 });
        return;
    }

    // 當購物車有選商品時進行計算
    selectedKeys.forEach(id => {
        const qty = cartState[id];
        const product = findProductById(id);
        if (product && qty > 0) {
            const itemPriceOrig = parseFloat(product.price) || 0;
            const itemCurr = product.currency || (product.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = parseFloat(product.sv_point) || 0;

            let itemPriceInDisplay = itemPriceOrig;
            if (itemCurr === 'TWD' && targetCurr === 'MYR') {
                itemPriceInDisplay = itemPriceOrig / rate;
            } else if (itemCurr === 'MYR' && targetCurr === 'TWD') {
                itemPriceInDisplay = itemPriceOrig * rate;
            }

            const itemTotalPrice = itemPriceInDisplay * qty;
            const itemTotalSV = sv * qty;

            subtotalDisplay += itemTotalPrice;
            totalSV += itemTotalSV;
            totalItemsCount += qty;

            let mainCategoryName = "保健食品";
            let subCategoryName = product.subcategory_code || "其他";

            appState.seriesList.forEach(s => {
                if (s.subs) {
                    const sub = s.subs.find(sub => sub.code === product.subcategory_code);
                    if (sub) {
                        mainCategoryName = s.name;
                        subCategoryName = sub.name;
                    }
                }
            });

            const typeName = product.type_name || '其他';

            catSvMap[mainCategoryName] = (catSvMap[mainCategoryName] || 0) + itemTotalSV;
            catAmountMap[mainCategoryName] = (catAmountMap[mainCategoryName] || 0) + itemTotalPrice;
            typeQtyMap[typeName] = (typeQtyMap[typeName] || 0) + qty;
            subSeriesSvMap[subCategoryName] = (subSeriesSvMap[subCategoryName] || 0) + itemTotalSV;

            $container.append(`
                <div class="cart-item-row">
                    <div class="cart-item-title" title="${product.name}">
                        <i class="fa-solid fa-box text-info"></i> ${product.name}
                    </div>
                    <div class="text-muted small">x ${qty}</div>
                    <div class="text-end">
                        <div class="text-warning font-weight-bold">${currSymbol}${Math.round(itemTotalPrice).toLocaleString()}</div>
                        <div class="text-info" style="font-size: 0.75rem;">${itemTotalSV.toLocaleString()} SV</div>
                    </div>
                </div>
            `);
        }
    });

    // ✨ 運費計算邏輯
    let shippingFeeInDisplay = 0;
    let isFreeShipping = false;
    let gapText = "";
    let shippingPercent = 0;

    if (appState.country === 'MY') {
        // 馬來西亞規則：RM 800 免運費，否則西馬 RM 15 / 東馬 RM 35
        let subtotalMYR = isTargetMYR ? subtotalDisplay : subtotalDisplay / rate;
        const thresholdMYR = 800;
        const baseShippingMYR = appState.myRegion === 'EAST' ? 35 : 15;

        if (subtotalMYR >= thresholdMYR) {
            isFreeShipping = true;
            shippingFeeInDisplay = 0;
            gapText = `<i class="fa-solid fa-circle-check"></i> 已達 RM 800 免運費門檻！`;
        } else if (subtotalDisplay > 0) {
            const gapMYR = thresholdMYR - subtotalMYR;
            shippingFeeInDisplay = isTargetMYR ? baseShippingMYR : baseShippingMYR * rate;
            const regionName = appState.myRegion === 'EAST' ? '東馬' : '西馬';
            const gapShow = isTargetMYR ? `RM ${Math.ceil(gapMYR).toLocaleString()}` : `NT$ ${Math.ceil(gapMYR * rate).toLocaleString()}`;
            const feeShow = isTargetMYR ? `RM ${baseShippingMYR}` : `NT$ ${Math.round(baseShippingMYR * rate)}`;
            gapText = `<i class="fa-solid fa-circle-info"></i> 還差 ${gapShow} 可享有免運費（${regionName}運費 ${feeShow}）`;
        } else {
            const feeShow = isTargetMYR ? `RM ${baseShippingMYR}` : `NT$ ${Math.round(baseShippingMYR * rate)}`;
            gapText = `<i class="fa-solid fa-circle-info"></i> 滿 RM 800 免運費（未達門檻運費 ${feeShow}）`;
        }

        shippingPercent = Math.min(100, (subtotalMYR / thresholdMYR) * 100);
        $("#shipping-threshold-title").html(`<i class="fa-solid fa-truck-fast"></i> RM 800 免運費門檻`);
        $("#shipping-progress-text").text(`${Math.round(subtotalMYR).toLocaleString()} / 800 RM`);

    } else {
        // 台灣規則：480 SV 免運費，否則 NT$ 150
        const thresholdSV = 480;
        const baseShippingTWD = 150;

        if (totalSV >= thresholdSV) {
            isFreeShipping = true;
            shippingFeeInDisplay = 0;
            gapText = `<i class="fa-solid fa-circle-check"></i> 已達 480 SV 免運費門檻！`;
        } else if (totalSV > 0) {
            const gapSV = thresholdSV - totalSV;
            shippingFeeInDisplay = isTargetMYR ? baseShippingTWD / rate : baseShippingTWD;
            const feeShow = isTargetMYR ? `RM ${Math.round(baseShippingTWD / rate)}` : `NT$ ${baseShippingTWD}`;
            gapText = `<i class="fa-solid fa-circle-info"></i> 還差 ${gapSV} SV 可享有免運費（運費 ${feeShow}）`;
        } else {
            const feeShow = isTargetMYR ? `RM ${Math.round(baseShippingTWD / rate)}` : `NT$ ${baseShippingTWD}`;
            gapText = `<i class="fa-solid fa-circle-info"></i> 滿 480 SV 免運費（未達門檻運費 ${feeShow}）`;
        }

        shippingPercent = Math.min(100, (totalSV / thresholdSV) * 100);
        $("#shipping-threshold-title").html(`<i class="fa-solid fa-truck-fast"></i> 480 SV 免運費門檻`);
        $("#shipping-progress-text").text(`${totalSV.toLocaleString()} / 480 SV`);
    }

    $("#shipping-progress-bar").css("width", `${shippingPercent}%`);
    $("#shipping-alert")
        .removeClass("shipping-alert-success shipping-alert-warning")
        .addClass(isFreeShipping ? "shipping-alert-success" : "shipping-alert-warning")
        .html(gapText);

    const grandTotal = subtotalDisplay + shippingFeeInDisplay;

    // 預估現金回饋
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const estimatedRebateDisplay = isTargetMYR ? (totalSV * rankRatio) / rate : Math.round(totalSV * rankRatio);

    // 更新面板 UI
    $("#total-qty-badge").text(`${totalItemsCount} 件商品`);
    $("#summary-subtotal").text(`${currSymbol}${Math.round(subtotalDisplay).toLocaleString()}`);
    $("#summary-shipping").text(shippingFeeInDisplay > 0 ? `${currSymbol}${Math.round(shippingFeeInDisplay).toLocaleString()}` : "免運費");
    $("#summary-grand-total").text(`${currSymbol}${Math.round(grandTotal).toLocaleString()}`);
    $("#summary-total-sv").text(`${totalSV.toLocaleString()} SV`);
    $("#summary-rebate-cash").text(`${currSymbol}${Math.round(estimatedRebateDisplay).toLocaleString()}`);

    // 更新懸浮島 UI
    $("#sticky-grand-total").text(`${currSymbol}${Math.round(grandTotal).toLocaleString()}`);
    $("#sticky-total-sv").text(`${totalSV.toLocaleString()} SV`);
    $("#sticky-rebate-cash").text(`${currSymbol}${Math.round(estimatedRebateDisplay).toLocaleString()}`);

    // 刷新圖表
    updateAllChartsData({
        catSvMap,
        catAmountMap,
        typeQtyMap,
        subSeriesSvMap,
        totalSV
    });
}

// ==========================================
// 9. Chart.js 初始化與動態更新
// ==========================================
function initAllCharts() {
    // 1. 各類別 SV 占比
    const ctx1 = document.getElementById('chartCategorySv')?.getContext('2d');
    if (ctx1) {
        chartCategorySvInstance = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: ['保健食品', '個人保養', '健康生活', '寵愛毛孩'],
                datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#38bdf8', '#7dd3fc', '#facc15', '#34d399'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } } }
        });
    }

    // 2. 各類別金額占比
    const ctx2 = document.getElementById('chartCategoryAmount')?.getContext('2d');
    if (ctx2) {
        chartCategoryAmountInstance = new Chart(ctx2, {
            type: 'pie',
            data: {
                labels: ['保健食品', '個人保養', '健康生活', '寵愛毛孩'],
                datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#facc15', '#fb923c', '#a855f7', '#38bdf8'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } } }
        });
    }

    // 3. 產品型態數量
    const ctx3 = document.getElementById('chartTypeQty')?.getContext('2d');
    if (ctx3) {
        chartTypeQtyInstance = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: ['益生菌', '膠囊', '錠劑', '沖泡飲', '液態飲', '外用保養', '清潔'],
                datasets: [{ label: '訂購數量', data: [0, 0, 0, 0, 0, 0, 0], backgroundColor: 'rgba(52, 211, 153, 0.75)', borderColor: '#34d399', borderWidth: 1, borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8', precision: 0 }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } } },
                plugins: { legend: { display: false } }
            }
        });
    }

    // ✨ 4. 各次系列 SV 分佈 (動態 Y 軸)
    const ctx4 = document.getElementById('chartSubSeriesSv')?.getContext('2d');
    if (ctx4) {
        chartSubSeriesSvInstance = new Chart(ctx4, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{ label: '累積 SV 積分', data: [], backgroundColor: 'rgba(56, 189, 248, 0.75)', borderColor: '#38bdf8', borderWidth: 1, borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                scales: { x: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#f8fafc', font: { size: 11 } }, grid: { display: false } } },
                plugins: { legend: { display: false } }
            }
        });
    }

    // 5. 各主系列 金額 vs SV
    const ctx5 = document.getElementById('chartMainCategoryComparison')?.getContext('2d');
    if (ctx5) {
        chartMainCategoryComparisonInstance = new Chart(ctx5, {
            type: 'bar',
            data: {
                labels: ['保健食品', '個人保養', '健康生活', '寵愛毛孩'],
                datasets: [
                    { label: '消費金額', data: [0, 0, 0, 0], backgroundColor: 'rgba(250, 204, 21, 0.8)', borderColor: '#facc15', borderWidth: 1, borderRadius: 4 },
                    { label: '累積積分 (SV)', data: [0, 0, 0, 0], backgroundColor: 'rgba(56, 189, 248, 0.8)', borderColor: '#38bdf8', borderWidth: 1, borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#f8fafc', font: { size: 11 } }, grid: { display: false } } },
                plugins: { legend: { display: true, position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } } }
            }
        });
    }

    // ✨ 6. 單品採購金額 Top 5
    const ctx6 = document.getElementById('chartTopItems')?.getContext('2d');
    if (ctx6) {
        chartTopItemsInstance = new Chart(ctx6, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{ label: '小計金額', data: [], backgroundColor: 'rgba(251, 191, 36, 0.8)', borderColor: '#fbbf24', borderWidth: 1, borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                scales: { x: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#f8fafc', font: { size: 10 } }, grid: { display: false } } },
                plugins: { legend: { display: false } }
            }
        });
    }

    // ✨ 7. 各型態 SV 貢獻雷達圖
    const ctx7 = document.getElementById('chartTypeSvRadar')?.getContext('2d');
    if (ctx7) {
        chartTypeSvRadarInstance = new Chart(ctx7, {
            type: 'radar',
            data: {
                labels: ['益生菌', '膠囊', '錠劑', '沖泡飲', '液態飲', '外用保養', '清潔'],
                datasets: [{ label: 'SV 貢獻度', data: [0, 0, 0, 0, 0, 0, 0], backgroundColor: 'rgba(244, 63, 94, 0.25)', borderColor: '#f43f5e', borderWidth: 2, pointBackgroundColor: '#f43f5e' }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        pointLabels: { color: '#94a3b8', font: { size: 10 } },
                        ticks: { display: false, beginAtZero: true }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

// ==========================================
// 圖表動態數據刷新
// ==========================================
function updateAllChartsData(data) {
    const categories = ['保健食品', '個人保養', '健康生活', '寵愛毛孩'];
    const types = ['益生菌', '膠囊', '錠劑', '沖泡飲', '液態飲', '外用保養', '清潔'];

    // 1. 各類別 SV 占比
    if (chartCategorySvInstance) {
        chartCategorySvInstance.data.datasets[0].data = categories.map(c => data.catSvMap[c] || 0);
        chartCategorySvInstance.update();
    }

    // 2. 各類別金額占比
    if (chartCategoryAmountInstance) {
        chartCategoryAmountInstance.data.datasets[0].data = categories.map(c => data.catAmountMap[c] || 0);
        chartCategoryAmountInstance.update();
    }

    // 3. 型態數量
    if (chartTypeQtyInstance) {
        chartTypeQtyInstance.data.datasets[0].data = types.map(t => data.typeQtyMap[t] || 0);
        chartTypeQtyInstance.update();
    }

    // ✨ 4. 圖表 4 動態次系列邏輯 (若有選購，僅呈現 SV > 0 的次系列)
    if (chartSubSeriesSvInstance) {
        const allSubs = getAllSubSeriesList();
        let activeSubs = allSubs.filter(sub => (data.subSeriesSvMap[sub] || 0) > 0);

        // 如果未選擇任何商品，則列出全部次系列；若有選購，僅展示有說選擇的次系列
        let displayLabels = (activeSubs.length > 0) ? activeSubs : allSubs;

        chartSubSeriesSvInstance.data.labels = displayLabels;
        chartSubSeriesSvInstance.data.datasets[0].data = displayLabels.map(s => data.subSeriesSvMap[s] || 0);
        chartSubSeriesSvInstance.update();
    }

    // 5. 各主系列 金額 vs SV
    if (chartMainCategoryComparisonInstance) {
        chartMainCategoryComparisonInstance.data.datasets[0].data = categories.map(c => data.catAmountMap[c] || 0);
        chartMainCategoryComparisonInstance.data.datasets[1].data = categories.map(c => data.catSvMap[c] || 0);
        chartMainCategoryComparisonInstance.update();
    }

    // ✨ 6. 單品採購金額 Top 5 數據計算
    if (chartTopItemsInstance) {
        let itemsList = [];
        const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
        const targetCurr = appState.displayCurrency;

        Object.keys(cartState).forEach(id => {
            const qty = cartState[id];
            const p = findProductById(id);
            if (p && qty > 0) {
                const itemPriceOrig = parseFloat(p.price) || 0;
                const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
                let priceInDisplay = itemPriceOrig;
                if (itemCurr === 'TWD' && targetCurr === 'MYR') priceInDisplay = itemPriceOrig / rate;
                else if (itemCurr === 'MYR' && targetCurr === 'TWD') priceInDisplay = itemPriceOrig * rate;

                itemsList.push({
                    name: p.name,
                    totalAmount: Math.round(priceInDisplay * qty)
                });
            }
        });

        // 依金額降冪排序並切出 Top 5
        itemsList.sort((a, b) => b.totalAmount - a.totalAmount);
        const top5 = itemsList.slice(0, 5);

        chartTopItemsInstance.data.labels = top5.map(i => i.name);
        chartTopItemsInstance.data.datasets[0].data = top5.map(i => i.totalAmount);
        chartTopItemsInstance.update();
    }

    // ✨ 7. 各型態 SV 雷達圖數據計算
    if (chartTypeSvRadarInstance) {
        let typeSvMap = {};
        Object.keys(cartState).forEach(id => {
            const qty = cartState[id];
            const p = findProductById(id);
            if (p && qty > 0) {
                const sv = parseFloat(p.sv_point) || 0;
                const typeName = p.type_name || '其他';
                typeSvMap[typeName] = (typeSvMap[typeName] || 0) + (sv * qty);
            }
        });

        chartTypeSvRadarInstance.data.datasets[0].data = types.map(t => typeSvMap[t] || 0);
        chartTypeSvRadarInstance.update();
    }
}

// 取得當前所有動態次系列名稱清單
function getAllSubSeriesList() {
    let list = [];
    const isMY = appState.country === 'MY';
    
    appState.seriesList.forEach(series => {
        if (series.subs) {
            series.subs.forEach(sub => {
                const displayName = getLanguageName(sub, isMY) || sub.name;
                if (displayName && !list.includes(displayName)) {
                    list.push(displayName);
                }
            });
        }
    });

    return list.length > 0 ? list : ['全能防護', '關鍵調理', '順暢保衛', '晶亮守護', '身體護理', '寵物保健'];
}

// ==========================================
// 10. Excel / PDF 匯出功能
// ==========================================
function exportOrderToExcel() {
    const selectedKeys = Object.keys(cartState);
    if (selectedKeys.length === 0) {
        AppDialog.alert("請先選擇至少一項商品後再下載 Excel！", {
            title: "未選擇商品",
            icon: "fa-solid fa-circle-exclamation text-warning"
        });
        return;
    }

    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
    const targetCurr = appState.displayCurrency;
    const isTargetMYR = targetCurr === 'MYR';

    let excelData = [];
    excelData.push(["產品編號", "產品名稱", "規格", `單價(${targetCurr})`, "單項SV", "數量", `小計金額(${targetCurr})`, "小計SV"]);

    let subtotal = 0;
    let totalSV = 0;

    selectedKeys.forEach(id => {
        const qty = cartState[id];
        const p = findProductById(id);
        if (p && qty > 0) {
            const itemPriceOrig = parseFloat(p.price) || 0;
            const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = parseFloat(p.sv_point) || 0;

            let priceInDisplay = itemPriceOrig;
            if (itemCurr === 'TWD' && targetCurr === 'MYR') priceInDisplay = itemPriceOrig / rate;
            else if (itemCurr === 'MYR' && targetCurr === 'TWD') priceInDisplay = itemPriceOrig * rate;

            const itemTotalNT = priceInDisplay * qty;
            const itemTotalSV = sv * qty;
            subtotal += itemTotalNT;
            totalSV += itemTotalSV;
            excelData.push([p.product_code || p.id, p.name, p.package_spec || '-', Math.round(priceInDisplay), sv, qty, Math.round(itemTotalNT), itemTotalSV]);
        }
    });

    // 運費與總額
    let shipping = 0;
    if (appState.country === 'MY') {
        let subtotalMYR = isTargetMYR ? subtotal : subtotal / rate;
        if (subtotalMYR < 800) {
            const baseMYR = appState.myRegion === 'EAST' ? 35 : 15;
            shipping = isTargetMYR ? baseMYR : baseMYR * rate;
        }
    } else {
        if (totalSV < 480) {
            shipping = isTargetMYR ? 150 / rate : 150;
        }
    }

    const grandTotal = subtotal + shipping;
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const rebate = isTargetMYR ? (totalSV * rankRatio) / rate : Math.round(totalSV * rankRatio);

    excelData.push([]);
    excelData.push(["", "", "", "", "", "產品金額小計：", Math.round(subtotal), totalSV]);
    excelData.push(["", "", "", "", "", "物流運費：", Math.round(shipping), ""]);
    excelData.push(["", "", "", "", "", "應付總金額：", Math.round(grandTotal), ""]);
    excelData.push(["", "", "", "", "", "預估現金回饋：", Math.round(rebate), ""]);

    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "訂購試算明細");

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `葡眾團隊訂購試算單_${dateStr}.xlsx`);
}

function exportOrderToPDF() {
    const selectedKeys = Object.keys(cartState);
    if (selectedKeys.length === 0) {
        AppDialog.alert("請先選擇至少一項商品後再進行列印 / 匯出！", {
            title: "未選擇商品",
            icon: "fa-solid fa-circle-exclamation text-warning",
            btnClass: "btn-warning"
        });
        return;
    }

    const rate = appState.exchangeRate > 0 ? appState.exchangeRate : 8.0;
    const targetCurr = appState.displayCurrency;
    const isTargetMYR = targetCurr === 'MYR';
    const currSymbol = isTargetMYR ? 'RM ' : 'NT$ ';

    let subtotal = 0;
    let totalSV = 0;
    let itemsList = [];

    selectedKeys.forEach(id => {
        const qty = cartState[id];
        const p = findProductById(id);
        if (p && qty > 0) {
            const itemPriceOrig = parseFloat(p.price) || 0;
            const itemCurr = p.currency || (p.region_code === 'MY' ? 'MYR' : 'TWD');
            const sv = parseFloat(p.sv_point) || 0;

            let priceInDisplay = itemPriceOrig;
            if (itemCurr === 'TWD' && targetCurr === 'MYR') priceInDisplay = itemPriceOrig / rate;
            else if (itemCurr === 'MYR' && targetCurr === 'TWD') priceInDisplay = itemPriceOrig * rate;

            const itemPrice = priceInDisplay * qty;
            const itemSv = sv * qty;
            subtotal += itemPrice;
            totalSV += itemSv;

            itemsList.push({
                code: p.product_code || p.id,
                name: p.name,
                qty: qty,
                price: itemPrice,
                sv: itemSv
            });
        }
    });

    let shipping = 0;
    if (appState.country === 'MY') {
        let subtotalMYR = isTargetMYR ? subtotal : subtotal / rate;
        if (subtotalMYR < 800) {
            const baseMYR = appState.myRegion === 'EAST' ? 35 : 15;
            shipping = isTargetMYR ? baseMYR : baseMYR * rate;
        }
    } else {
        if (totalSV < 480) {
            shipping = isTargetMYR ? 150 / rate : 150;
        }
    }

    const grandTotal = subtotal + shipping;
    const rankRatio = parseFloat($("#rank-select").val()) || 0.20;
    const rebate = isTargetMYR ? (totalSV * rankRatio) / rate : Math.round(totalSV * rankRatio);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    // 呼叫原生列印模組 (order-printer.js)
    if (typeof printOrderReceipt === 'function') {
        printOrderReceipt({
            items: itemsList,
            subtotal: subtotal,
            shipping: shipping,
            grandTotal: grandTotal,
            totalSV: totalSV,
            rebate: rebate,
            currencySymbol: currSymbol,
            dateStr: dateStr
        });
    } else {
        console.error("未找到 order-printer.js 列印模組！");
    }
}

// ==========================================
// 11. iframe 視窗滾動動態追蹤定位引擎
// ==========================================
function setupIframeFloatingPositionEngine() {
    function updatePosition() {
        try {
            const isInsideIframe = (window.self !== window.top);
            const isDesktop = window.innerWidth >= 1200
            if (isInsideIframe) {
                const parentWin = window.parent;
                const frameEl = window.frameElement;
                if (!parentWin || !frameEl) return;

                const parentScrollY = parentWin.scrollY || parentWin.pageYOffset || 0;
                const parentInnerHeight = parentWin.innerHeight || document.documentElement.clientHeight;
                
                const frameRect = frameEl.getBoundingClientRect();
                const iframeTopInParent = frameRect.top + parentScrollY;
                const iframeHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);

                const $cart = $('.cart-summary-card');
                if ($cart.length && isDesktop) {
                    const cartHeight = $cart.outerHeight() || 400;
                    const viewportTopInIframe = parentScrollY - iframeTopInParent;
                    
                    let targetTop = viewportTopInIframe + 70;
                    const offset = $('#analyticsSection').offset();
                    const absoluteTop = offset ? offset.top : iframeHeight;

                    const maxAllowedTop = absoluteTop - cartHeight - 50;
                    targetTop = Math.max(0, Math.min(targetTop, maxAllowedTop));

                    $cart.css({
                        'position': 'relative',
                        'top': targetTop + 'px'
                    });
                } else if ($cart.length && !isDesktop) {
                    $cart.css({ 'position': '', 'top': '' });
                }

                const $bar = $('#floatingIslandBar');
                if ($bar.length && !$bar.hasClass('is-hidden')) {
                    const barHeight = $bar.outerHeight() || 65;
                    const viewportBottomInIframe = (parentScrollY + parentInnerHeight) - iframeTopInParent;

                    let targetTop = viewportBottomInIframe - barHeight - 20;
                    const maxAllowedTop = iframeHeight - barHeight - 20;
                    targetTop = Math.max(20, Math.min(targetTop, maxAllowedTop));

                    $bar.css({
                        'position': 'absolute',
                        'top': targetTop + 'px',
                        'bottom': 'auto',
                        'transform': 'translateX(-50%)'
                    });
                }

                const $wakeBtn = $('#btnShowFloatingBar');
                if ($wakeBtn.length) {
                    const btnHeight = $wakeBtn.outerHeight() || 40;
                    const viewportBottomInIframe = (parentScrollY + parentInnerHeight) - iframeTopInParent;

                    let btnTargetTop = viewportBottomInIframe - btnHeight - 25;
                    const maxAllowedBtnTop = iframeHeight - btnHeight - 20;
                    btnTargetTop = Math.max(25, Math.min(btnTargetTop, maxAllowedBtnTop));

                    $wakeBtn.css({
                        'position': 'absolute',
                        'top': btnTargetTop + 'px',
                        'bottom': 'auto',
                        'left': '25px',
                        'right': 'auto'
                    });
                }
            }
        } catch (e) {
            console.warn("Cross-origin iframe tracking notice:", e);
        }
    }

    try {
        if (window.self !== window.top && window.parent) {
            window.parent.addEventListener('scroll', updatePosition, { passive: true });
            window.parent.addEventListener('resize', updatePosition, { passive: true });
        }
    } catch (e) {
        console.warn(e);
    }

    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });

    updatePosition();
    setTimeout(updatePosition, 300);
    setTimeout(updatePosition, 800);
}