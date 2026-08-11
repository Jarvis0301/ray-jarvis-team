// ==========================================
// 1. Google 雲端硬碟試算表設定 (請於此處替換試算表ID)
// ==========================================
let SPREADSHEET_ID = "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I"; // 填入公開的 Google Sheet ID

// 核心解耦轉接器：欄位名稱模糊匹配適配器 (Field Decoupling Adapter)
function getVal(row, keys, defaultVal = '') {
    if (!row) return defaultVal;
    
    // 情境 A：若 PapaParse 為物件陣列 (header: true)
    if (typeof row === 'object' && !Array.isArray(row)) {
        for (let k of keys) {
            if (typeof k === 'string') {
                const foundKey = Object.keys(row).find(rowKey => {
                    const cleanRowKey = rowKey.replace(/_\d+$/, '').trim().toLowerCase();
                    const cleanTargetKey = k.trim().toLowerCase();
                    return cleanRowKey === cleanTargetKey || rowKey.trim().toLowerCase() === cleanTargetKey;
                });
                if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== '') {
                    return row[foundKey].toString().trim();
                }
            }
        }
    }
    
    // 情境 B：若 PapaParse 為二維陣列 (header: false)
    if (Array.isArray(row)) {
        const numKey = keys.find(k => typeof k === 'number');
        if (numKey !== undefined && row[numKey] !== undefined && row[numKey] !== null) {
            return row[numKey].toString().trim();
        }
    }
    
    return defaultVal;
}

// 預設產品型態庫 (對齊 product_types 表結構)
const defaultTypeIcons = [
    { code: "ALL", name: "全部", nameEn: "All", icon: "fa-solid fa-border-all", color: "#94a3b8", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "TYPE001", name: "益生菌", nameEn: "Probiotics", icon: "fa-solid fa-bacteria", color: "#34d399", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "TYPE002", name: "膠囊", nameEn: "Capsules", icon: "fa-solid fa-capsules", color: "#38bdf8", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "TYPE003", name: "錠劑", nameEn: "Tablets", icon: "fa-solid fa-tablets", color: "#a7f3d0", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "TYPE004", name: "沖泡飲", nameEn: "Powder Drinks", icon: "fa-solid fa-mug-saucer", color: "#fbbf24", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "TYPE005", name: "液態飲", nameEn: "Liquid Drinks", icon: "fa-solid fa-droplet", color: "#60a5fa", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "TYPE006", name: "外用保養", nameEn: "Skincare", icon: "fa-solid fa-leaf", color: "#f472b6", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "TYPE007", name: "清潔", nameEn: "Cleansers", icon: "fa-solid fa-pump-soap", color: "#22d3ee", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "TYPE008", name: "口腔照護", nameEn: "Oral Care", icon: "fa-solid fa-tooth", color: "#818cf8", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "TYPE009", name: "特殊", nameEn: "Specialty", icon: "fa-solid fa-boxes-packing", color: "#f87171", bg: "rgba(10, 25, 19, 0.88)" }
];

// 預設產品系列庫 (對齊 product_categories / product_subcategories 表結構)
const defaultSeriesData = [
    {
        code: "01", name: "保健食品", nameEn: "Health Supplements", subs: [
            { code: "0101", name: "全能防護", nameEn: "Overall Defense", icon: "fa-solid fa-shield-halved", color: "#f59e0b", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0102", name: "關鍵調理", nameEn: "Core Care", icon: "fa-solid fa-dna", color: "#f43f5e", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0103", name: "順暢保衛", nameEn: "Gut Balance", icon: "fa-solid fa-arrows-rotate", color: "#10b981", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0104", name: "強健靈活", nameEn: "Joint & Bone", icon: "fa-solid fa-bone", color: "#06b6d4", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0105", name: "活力丰采", nameEn: "Vitality Boost", icon: "fa-solid fa-sun", color: "#eab308", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0106", name: "晶亮守護", nameEn: "Vision Care", icon: "fa-solid fa-eye", color: "#38bdf8", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0107", name: "快樂賦活", nameEn: "Mind & Relax", icon: "fa-solid fa-face-smile-beam", color: "#a855f7", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0108", name: "循環保健", nameEn: "Circulation", icon: "fa-solid fa-heart-pulse", color: "#ef4444", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0109", name: "機能食品", nameEn: "Functional Foods", icon: "fa-solid fa-wheat-awn", color: "#84cc16", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    },
    {
        code: "02", name: "寵愛毛孩", nameEn: "Pet Care", subs: [
            { code: "0201", name: "寵物保健", nameEn: "Pet Health", icon: "fa-solid fa-paw", color: "#fb923c", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    },
    {
        code: "03", name: "健康生活", nameEn: "Wellness Lifestyle", subs: [
            { code: "0301", name: "臉部護理", nameEn: "Facial Care", icon: "fa-solid fa-spray-can-sparkles", color: "#ec4899", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0302", name: "身體護理", nameEn: "Body Care", icon: "fa-solid fa-hand-holding-heart", color: "#34d399", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0303", name: "口腔護理", nameEn: "Oral Care", icon: "fa-solid fa-tooth", color: "#60a5fa", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    },
    {
        code: "04", name: "個人保養", nameEn: "Personal Care", subs: [
            { code: "0401", name: "臉部保養", nameEn: "Skincare", icon: "fa-solid fa-spa", color: "#c084fc", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    }
];

// 預設靜態資料庫 (備援資料)
const defaultProducts = {
    TW: [
        {
            id: "1",
            region_code: "TW",
            base_code: "80050",
            product_code: "80050",
            name: "葡眾蟬花護手霜",
            short_name: "護手霜",
            short_summary: "改善手部肌膚乾燥、修護細紋、增加肌膚彈性。",
            type_name: "外用保養",
            subcategory_code: "0302",
            package_spec: "30g x 3 支／盒",
            price: "840",
            currency: "TWD",
            sv_point: "24",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/80050_護手霜_20250825_1.png"
        },
        {
            id: "2",
            region_code: "TW",
            base_code: "80070",
            product_code: "80070",
            name: "葡眾淨膚皂",
            short_name: "淨膚皂",
            short_summary: "深層清潔並滋養肌膚、適合敏感及乾性肌膚使用。",
            type_name: "清潔",
            subcategory_code: "0302",
            package_spec: "95g x 3 盒／組",
            price: "870",
            currency: "TWD",
            sv_point: "24",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/80070_淨膚皂_20250825_1.png"
        },
        {
            id: "3",
            region_code: "TW",
            base_code: "0101001",
            product_code: "TW0101001",
            name: "995生技營養品",
            short_name: "995",
            short_summary: "調節免疫力、活化細胞、增強體力、有助於營養補給及健康維持。",
            type_name: "液態飲",
            subcategory_code: "0101",
            package_spec: "180ml x 24 瓶／箱",
            price: "5980",
            currency: "TWD",
            sv_point: "164",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101001_995_20260205_1.png"
        },
        {
            id: "4",
            region_code: "TW",
            base_code: "0101002",
            product_code: "TW0101002",
            name: "永生福朗膠囊",
            short_name: "永生福朗",
            short_summary: "調節免疫力、有助於抗氧化、改善骨質疏鬆、安定神經。",
            type_name: "膠囊",
            subcategory_code: "0101",
            package_spec: "120 粒／瓶",
            price: "1770",
            currency: "TWD",
            sv_point: "48",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101002_永生福朗_20251016_1.png"
        },
        {
            id: "5",
            region_code: "TW",
            base_code: "0101003",
            product_code: "TW0101003",
            name: "康爾喜乳酸菌顆粒",
            short_name: "康爾喜",
            short_summary: "調節生理機能、改善體質、減輕過敏現象、健胃整腸。",
            type_name: "益生菌",
            subcategory_code: "0101",
            package_spec: "90 條／盒",
            price: "1890",
            currency: "TWD",
            sv_point: "52",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101003_康爾喜_20251016_1.png"
        },
        {
            id: "6",
            region_code: "TW",
            base_code: "0101004",
            product_code: "TW0101004",
            name: "葡眾360計劃",
            short_name: "360計劃",
            short_summary: "提供全方位保健計劃、強化免疫力、具備清除與修補功能。",
            type_name: "特殊",
            subcategory_code: "0101",
            package_spec: "30 包／盒",
            price: "11088",
            currency: "TWD",
            sv_point: "320",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101004_360計劃_20260504_1.png"
        }
    ],
    MY: [
        {
            id: "101",
            region_code: "MY",
            base_code: "0102001",
            product_code: "MY0102001",
            name: "Liprofac",
            short_name: "Liprofac",
            short_summary: "Antrodia cinnamomea mycelium powder, Phellinus linteus mycelium powder.",
            type_name: "膠囊",
            subcategory_code: "0102",
            package_spec: "120 caps / btl",
            price: "416.00",
            currency: "MYR",
            sv_point: "83",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/MY0102001_Liprofac_20260521_1.png"
        },
        {
            id: "102",
            region_code: "MY",
            base_code: "0105001",
            product_code: "MY0105001",
            name: "FemiRely",
            short_name: "FemiRely",
            short_summary: "Support women's physiological health, including dehulled adlay, black sugar.",
            type_name: "沖泡飲",
            subcategory_code: "0105",
            package_spec: "30 sachets/box",
            price: "400.00",
            currency: "MYR",
            sv_point: "82",
            primary_image_url: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/MY0105001_FemiRely_20260505_1.png"
        }
    ]
};

// 2. 系統狀態管理
let appState = {
    country: 'TW',
    mainSeries: 'ALL',
    subSeries: 'ALL',
    productType: 'ALL',
    searchKeyword: '',
    products: defaultProducts,
    seriesList: defaultSeriesData,
    typeList: defaultTypeIcons
};

// 3. 頁面初始化 (相容 AppReady 與 DOMContentLoaded)
window.addEventListener('AppReady', () => {
    initApp();
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
}

// 4. 解析 Google Sheets 數據 (對齊最新 4 大正規化資料表名稱)
async function fetchGoogleSheetsData() {
    try {
        const syncElem = document.getElementById('syncStatus');
        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 產品資訊同步中...';

        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            const res = await fetch(url);
            const text = await res.text();
            
            // 標頭防護與清洗
            const headerCounts = {};
            const parsed = Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                transformHeader: function(header, index) {
                    const trimmed = header ? header.trim() : '';
                    if (!trimmed) return `_empty_col_${index}`;
                    if (headerCounts[trimmed]) {
                        headerCounts[trimmed]++;
                        return `${trimmed}_${headerCounts[trimmed]}`;
                    } else {
                        headerCounts[trimmed] = 1;
                        return trimmed;
                    }
                }
            });

            return parsed.data;
        };

        // 並行抓取對齊後端 Schema 的 4 大資料表工作表
        const [productsData, mainCategoriesData, subcategoriesData, productTypesData] = await Promise.all([
            fetchSheet('產品主表'),
            fetchSheet('產品主系列表'),
            fetchSheet('產品次系列表'),
            fetchSheet('產品型態表')
        ]);

        // A. 處理「產品主表」：根據 region_code 自動分流至 TW 與 MY 陣列
        if (productsData && productsData.length > 0) {
            const parsedAll = parseProductsTable(productsData);
            appState.products.TW = parsedAll.filter(p => p.region_code === 'TW');
            appState.products.MY = parsedAll.filter(p => p.region_code === 'MY');
        }

        // B. 處理「產品主系列表」與「產品次系列表」：動態組裝雙層樹狀選單
        if (mainCategoriesData && mainCategoriesData.length > 0) {
            appState.seriesList = buildSeriesTree(mainCategoriesData, subcategoriesData || []);
            updateSeriesDropdowns();
        }

        // C. 處理「產品型態表」
        if (productTypesData && productTypesData.length > 0) {
            appState.typeList = [{ code: "ALL", name: "全部", icon: "fa-solid fa-border-all", color: "#94a3b8", bg: "rgba(10, 25, 19, 0.88)" }];
            productTypesData.forEach((row, idx) => {
                const code = getVal(row, ['type_code', '型態代碼', '代碼', 0], `TYPE${idx + 1}`);
                const name = getVal(row, ['name_zh', '中文名稱', '中文', '型態名稱', 1]);
                const nameEn = getVal(row, ['name_en', '英文名稱', '英文', 2]);
                const icon = getVal(row, ['icon_class', 'Font Awesome Icon', '圖示', 3], 'fa-solid fa-tag');
                const color = getVal(row, ['text_color', '文字與外框顏色', '顏色', 4], '#94a3b8');
                const bg = getVal(row, ['bg_color', '標籤背景顏色', '背景色', 5], 'rgba(10, 25, 19, 0.88)');
                
                if (name) {
                    appState.typeList.push({ code, name, nameEn, icon, color, bg });
                }
            });
            renderTypeFilterButtons();
        }

        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-circle-check"></i> 雲端資料同步完成';
    } catch (err) {
        console.warn("無法動態讀取 Google 試算表，使用預設資料:", err);
        const syncElem = document.getElementById('syncStatus');
        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 雲端同步失敗，切換至備援庫';
    }
}

// 解析「產品主表」數據列 (自動識別地區代碼與解耦轉接)
function parseProductsTable(rows) {
    return rows.map((r, idx) => {
        const productCode = getVal(r, ['product_code', '產品編號', '編號', 0]);
        let regionCode = getVal(r, ['region_code', '地區代碼', '地區', 1], 'TW').toUpperCase();
        
        // 若地區代碼未填，自動由產品編號前綴判斷
        if (!regionCode || (regionCode !== 'TW' && regionCode !== 'MY')) {
            regionCode = productCode.startsWith('MY') ? 'MY' : 'TW';
        }

        const baseCode = getVal(r, ['base_code', '基本編號', '跨國基本編號', 2], productCode.replace(/^(TW|MY)/, ''));

        return {
            id: getVal(r, ['id', 'ID', '系統ID'], `${regionCode}_${idx + 1}`),
            region_code: regionCode,
            base_code: baseCode,
            product_code: productCode,
            name: getVal(r, ['name', '產品名稱', '名稱', 3]),
            short_name: getVal(r, ['short_name', '產品簡稱', '簡稱', 4]),
            short_summary: getVal(r, ['short_summary', '產品簡介', '簡介', 5]),
            type_name: getVal(r, ['type_name', 'type_code', '產品型態', '型態', 6]),
            subcategory_code: getVal(r, ['subcategory_code', 'subcategory_id', '產品次系列', '次系列編號', '次系列', 7]),
            package_spec: getVal(r, ['package_spec', 'spec', '包裝規格', '規格', 8]),
            price: getVal(r, ['price', '售價', '價格', 9], '0'),
            currency: getVal(r, ['currency', '幣別', 10], regionCode === 'MY' ? 'MYR' : 'TWD'),
            sv_point: getVal(r, ['sv_point', 'sv', '全球 SV', 'SV', 11], '0'),
            primary_image_url: getVal(r, ['primary_image_url', 'img', '圖片網址', '縮圖網址', '低解析圖片網址', 12])
        };
    }).filter(item => item.product_code !== '' || item.name !== '');
}

// 組合「產品主系列表」與「產品次系列表」為雙層選單結構
function buildSeriesTree(mainRows, subRows) {
    const seriesList = [];

    console.log(mainRows);
    console.log(subRows);

    // 1. 建立主系列
    mainRows.forEach(r => {
        const code = getVal(r, ['category_code', '主系列代碼', '編號', 1]);
        const name = getVal(r, ['name_zh', '中文名稱', '中文', 2]);
        const nameEn = getVal(r, ['name_en', '英文名稱', '英文', 3]);
        const icon = getVal(r, ['icon_class', 'Font Awesome Icon', '圖示', 4], 'fa-solid fa-tag');
        const color = getVal(r, ['text_color', '文字與外框顏色', '顏色', 5], '#52b788');
        const bg = getVal(r, ['bg_color', '標籤背景顏色', '背景色', 6], 'rgba(10, 25, 19, 0.88)');

        if (code) {
            seriesList.push({ code, name, nameEn, icon, color, bg, subs: [] });
        }
    });

    // 2. 歸屬次系列至主系列下方
    subRows.forEach(r => {
        const subCode = getVal(r, ['subcategory_code', '次系列代碼', '編號', 1]);
        const parentCode = getVal(r, ['category_code', 'category_id', '主系列代碼', 2], subCode.slice(0, 2));
        const name = getVal(r, ['name_zh', '中文名稱', '中文', 3]);
        const nameEn = getVal(r, ['name_en', '英文名稱', '英文', 4]);
        const icon = getVal(r, ['icon_class', 'Font Awesome Icon', '圖示', 5], 'fa-solid fa-tag');
        const color = getVal(r, ['text_color', '文字與外框顏色', '顏色', 6], '#52b788');
        const bg = getVal(r, ['bg_color', '標籤背景顏色', '背景色', 7], 'rgba(10, 25, 19, 0.88)');

        if (subCode) {
            let parentSeries = seriesList.find(s => s.code === parentCode);
            if (!parentSeries) {
                parentSeries = { code: parentCode, name: name || '系列', nameEn: nameEn || '', subs: [] };
                seriesList.push(parentSeries);
            }
            parentSeries.subs.push({ code: subCode, name, nameEn, icon, color, bg });
        }
    });

    return seriesList.length > 0 ? seriesList : defaultSeriesData;
}

// 取得多語系顯示名稱之輔助函式
function getLanguageName(item, isMY) {
    if (!item) return '';
    return isMY ? (item.nameEn || item.name) : item.name;
}

// 更新產品系列下拉選單
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

// 更新產品次系列下拉選單
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

// 生成型態按鈕列 (維持圖標與文字間 1 個半形空白)
function renderTypeFilterButtons() {
    let html = '';

    appState.typeList.forEach((item, index) => {
        const val = (item.name === '全部' ? 'ALL' : item.name);
        const isChecked = appState.productType === val ? 'checked' : '';
        const inputId = `type-btn-${index}`;

        html += `
            <input type="radio" class="btn-check" name="product-type" id="${inputId}" value="${val}" autocomplete="off" ${isChecked}>
            <label class="btn btn-outline-primary btn-sm rounded-pill" for="${inputId}">
                <i class="${item.icon}"></i> ${item.name}
            </label>
        `;
    });

    const $container = $('#typeFilterContainer');
    if ($container.length > 0) {
        $container.html(html);
        if (window.Utils && typeof Utils.equalizeWidths === 'function') {
            Utils.equalizeWidths('#typeFilterContainer label');
        }
    }
}

// 綁定 UI 事件
function bindEvents() {
    const countryElem = document.getElementById('countrySelect');
    if (countryElem) {
        countryElem.addEventListener('change', (e) => {
            appState.country = e.target.value;
            appState.mainSeries = 'ALL';
            updateSeriesDropdowns();
            renderProducts();
        });
    }

    const mainSeriesElem = document.getElementById('mainSeriesSelect');
    if (mainSeriesElem) {
        mainSeriesElem.addEventListener('change', (e) => {
            appState.mainSeries = e.target.value;
            appState.subSeries = 'ALL';
            updateSubSeriesDropdown(appState.mainSeries);
            renderProducts();
        });
    }

    const subSeriesElem = document.getElementById('subSeriesSelect');
    if (subSeriesElem) {
        subSeriesElem.addEventListener('change', (e) => {
            appState.subSeries = e.target.value;
            renderProducts();
        });
    }

    const searchElem = document.getElementById('searchInput');
    if (searchElem) {
        searchElem.addEventListener('input', (e) => {
            appState.searchKeyword = e.target.value.trim().toLowerCase();
            renderProducts();
        });
    }

    const typeContainer = document.getElementById('typeFilterContainer');
    if (typeContainer) {
        typeContainer.addEventListener('change', (e) => {
            if (e.target.name === 'product-type') {
                appState.productType = e.target.value;
                renderProducts();
            }
        });
    }
}

// 渲染產品網格 (低解析縮圖載入 + 路由參數化)
function renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const isMY = appState.country === 'MY';
    const currentDataset = appState.products[appState.country] || [];

    const filtered = currentDataset.filter(item => {
        // 1. 系列過濾 (依次系列代碼/基本編號對應)
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

        // 2. 型態過濾
        if (appState.productType !== 'ALL' && item.type_name !== appState.productType) {
            return false;
        }

        // 3. 關鍵字搜尋
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

    // 更新總數 (維持 1 個半形空白)
    const countElem = document.getElementById('resultsCount');
    if (countElem) {
        countElem.innerHTML = `<i class="fa-solid fa-list-check"></i> 找到 ${filtered.length} 項符合條件的產品`;
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-12">
                <div class="no-data rounded p-4 text-center text-muted border border-secondary-subtle">
                    <i class="fa-solid fa-box-open fs-2 mb-2"></i>
                    <p class="mb-0">未找到符合條件的產品，請調整篩選條件或搜尋關鍵字。</p>
                </div>
            </div>
        `;
        return;
    }

    // 渲染產品卡片 (載入 primary_image_url 低解析圖)
    filtered.forEach(item => {
        let subCode = item.subcategory_code || '';
        if (item.product_code === '80050' || item.product_code === '80070') {
            subCode = '0302';
        } else if (!subCode && item.product_code.length >= 6) {
            subCode = item.product_code.replace(/^(TW|MY)/, '').slice(0, 4);
        }

        console.log(appState.seriesList);
        console.log(subCode);

        let seriesName = '未知系列';
        let seriesIcon = 'fa-solid fa-tag';
        let seriesColor = '#52b788';
        let seriesBg = 'rgba(10, 25, 19, 0.88)';

        let typeIcon = 'fa-solid fa-tag';
        let typeColor = '#52b788';
        let typeBg = 'rgba(10, 25, 19, 0.88)';

        // 1. 動態匹配次系列 Icon 與色彩
        appState.seriesList.forEach(series => {
            const subSeries = series.subs ? series.subs.find(s => s.code === subCode) : null;
            console.log(series.subs);
            console.log(subSeries);
            if (subSeries) {
                seriesName = getLanguageName(subSeries, isMY);
                seriesIcon = subSeries.icon || 'fa-solid fa-tag';
                seriesColor = subSeries.color || '#52b788';
                seriesBg = subSeries.bg || 'rgba(10, 25, 19, 0.88)';
            }
        });

        // 2. 動態匹配產品型態 Icon 與色彩
        appState.typeList.forEach(typeItem => {
            if (typeItem.name === item.type_name) {
                typeIcon = typeItem.icon || 'fa-solid fa-tag';
                typeColor = typeItem.color || '#52b788';
                typeBg = typeItem.bg || 'rgba(10, 25, 19, 0.88)';
            }
        });

        // 構建帶有 id 與 region 參數的詳細頁網址
        const detailUrl = `./product-detail.html?id=${encodeURIComponent(item.product_code || item.id)}&region=${encodeURIComponent(item.region_code)}`;
        const formattedPrice = item.currency === 'MYR' ? `RM ${item.price}` : `NT$ ${item.price}`;

        const col = document.createElement('div');
        col.className = 'col col-12 col-sm-6 col-lg-3 mb-4';
        col.innerHTML = `
            <div class="card h-100 product-card border-0 bg-dark text-light shadow-sm">
                <div class="card-img-wrapper position-relative overflow-hidden">
                    <div class="card-badges position-absolute top-0 start-0 p-2 d-flex flex-wrap gap-1 z-2">
                        <span class="badge border" style="color: ${seriesColor}; border-color: ${seriesColor} !important; background-color: ${seriesBg};">
                            <i class="${seriesIcon}"></i> ${seriesName}
                        </span>
                        <span class="badge border" style="color: ${typeColor}; border-color: ${typeColor} !important; background-color: ${typeBg};">
                            <i class="${typeIcon}"></i> ${item.type_name || '保健'}
                        </span>
                    </div>
                    <img src="${item.primary_image_url}" class="card-img-top product-thumbnail" alt="${item.name}" loading="lazy" onerror="imgError(this)">
                </div>
                <div class="card-body d-flex flex-column p-3">
                    <h3 class="product-title h6 fw-bold mb-2 text-light">${item.name}</h3>
                    <p class="product-desc small text-muted mb-3 text-truncate-2">${item.short_summary || '暫無產品簡介'}</p>
                    <div class="price-sv-block mt-auto mb-3 p-2 rounded d-flex justify-content-between align-items-center bg-dark-subtle">
                        <div class="price-tag fw-bold text-warning">${formattedPrice}</div>
                        <div class="sv-tag small text-info"><i class="fa-solid fa-star"></i> ${item.sv_point} SV</div>
                    </div>
                    <a href="${detailUrl}" class="btn btn-outline-primary w-100 text-center fw-bold">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> 查看產品詳情
                    </a>
                </div>
            </div>
        `;
        grid.appendChild(col);
    });
}

// 圖片載入失敗容錯處理
function imgError(imgElement) {
    let currentSrc = imgElement.src;

    if (currentSrc.endsWith('.jpg') && !imgElement.dataset.triedPng) {
        imgElement.dataset.triedPng = "true";
        imgElement.src = currentSrc.replace(/\.jpg$/, '.png');
        return;
    }

    let placeholderHtml = `<div class="img-placeholder d-flex align-items-center justify-content-center bg-secondary-subtle text-muted rounded-top" style="height: 200px;"><i class="fa-solid fa-boxes-stacked fs-1"></i></div>`;
    $(imgElement).replaceWith(placeholderHtml);
}