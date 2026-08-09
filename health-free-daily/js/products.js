// ==========================================
// 1. Google 雲端硬碟試算表設定 (請於此處替換試算表ID)
// ==========================================
let SPREADSHEET_ID = "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I"; // 填入公開的 Google Sheet ID

// 預設產品型態庫 (包含 Icon、外框/文字顏色、背景色彩)
const defaultTypeIcons = [
    { code: "0000", name: "全部", nameEn: "All", icon: "fas fa-border-all", color: "#94a3b8", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "0101", name: "益生菌", nameEn: "Bacteria", icon: "fas fa-bacteria", color: "#34d399", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "0201", name: "膠囊", nameEn: "Capsules", icon: "fas fa-capsules", color: "#38bdf8", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "0202", name: "錠劑", nameEn: "Tablets", icon: "fas fa-tablets", color: "#a7f3d0", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "0301", name: "沖泡飲", nameEn: "Powder Drinks", icon: "fas fa-mug-saucer", color: "#fbbf24", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "0302", name: "液態飲", nameEn: "Liquid Drinks", icon: "fas fa-droplet", color: "#60a5fa", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "0401", name: "外用保養", nameEn: "Skincare", icon: "fas fa-leaf", color: "#f472b6", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "0402", name: "清潔", nameEn: "Cleansers", icon: "fas fa-pump-soap", color: "#22d3ee", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "0403", name: "口腔照護", nameEn: "Oral Care", icon: "fas fa-tooth", color: "#818cf8", bg: "rgba(10, 25, 19, 0.88)" },
    { code: "0501", name: "特殊", nameEn: "Specialty", icon: "fas fa-boxes-packing", color: "#f87171", bg: "rgba(10, 25, 19, 0.88)" }
];

// 預設產品系列庫 (包含次系列之 Icon、外框/文字顏色、背景色彩)
const defaultSeriesData = [
    {
        code: "01", name: "保健食品", nameEn: "Health Supplements", subs: [
            { code: "0101", name: "全能防護", nameEn: "Overall Defense", icon: "fas fa-shield-halved", color: "#f59e0b", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0102", name: "關鍵調理", nameEn: "Core Care", icon: "fas fa-dna", color: "#f43f5e", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0103", name: "順暢保衛", nameEn: "Gut Balance", icon: "fas fa-arrows-rotate", color: "#10b981", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0104", name: "強健靈活", nameEn: "Joint & Bone", icon: "fas fa-bone", color: "#06b6d4", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0105", name: "活力丰采", nameEn: "Vitality Boost", icon: "fas fa-sun", color: "#eab308", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0106", name: "晶亮守護", nameEn: "Vision Care", icon: "fas fa-eye", color: "#38bdf8", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0107", name: "快樂賦活", nameEn: "Mind & Relax", icon: "fas fa-face-smile-beam", color: "#a855f7", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0108", name: "循環保健", nameEn: "Circulation", icon: "fas fa-heart-pulse", color: "#ef4444", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0109", name: "機能食品", nameEn: "Functional Foods", icon: "fas fa-wheat-awn", color: "#84cc16", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    },
    {
        code: "02", name: "寵愛毛孩", nameEn: "Pet Care", subs: [
            { code: "0201", name: "寵物保健", nameEn: "Pet Health", icon: "fas fa-paw", color: "#fb923c", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    },
    {
        code: "03", name: "健康生活", nameEn: "Wellness Lifestyle", subs: [
            { code: "0301", name: "臉部護理", nameEn: "Facial Care", icon: "fas fa-spray-can-sparkles", color: "#ec4899", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0302", name: "身體護理", nameEn: "Body Care", icon: "fas fa-hand-holding-heart", color: "#34d399", bg: "rgba(10, 25, 19, 0.88)" },
            { code: "0303", name: "口腔護理", nameEn: "Oral Care", icon: "fas fa-tooth", color: "#60a5fa", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    },
    {
        code: "04", name: "個人保養", nameEn: "Personal Care", subs: [
            { code: "0401", name: "臉部保養", nameEn: "Skincare", icon: "fas fa-spa", color: "#c084fc", bg: "rgba(10, 25, 19, 0.88)" }
        ]
    }
];

// 預設靜態資料庫 (離線備援)
const defaultProducts = {
    TW: [
        {
            id: "80050", name: "葡眾蟬花護手霜", shortName: "護手霜", type: "外用保養",
            spec: "30g x 3 支／盒", price: "NT$840", sv: "24", date: "2025/08/25",
            desc: "改善手部肌膚乾燥、修護細紋、增加肌膚彈性。",
            url: "https://www.uvaco.com.tw/Products/53/72/80050",
            img: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/80050_護手霜_20250825_1.png"
        },
        {
            id: "80070", name: "葡眾淨膚皂", shortName: "淨膚皂", type: "清潔",
            spec: "95g x 3 盒／組", price: "NT$870", sv: "24", date: "2025/08/25",
            desc: "深層清潔並滋養肌膚、適合敏感及乾性肌膚使用。",
            url: "https://www.uvaco.com.tw/Products/53/72/80070",
            img: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/80070_淨膚皂_20250825_1.png"
        },
        {
            id: "TW0101001", name: "995生技營養品", shortName: "995", type: "液態飲/濃縮液",
            spec: "180ml x 24 瓶／箱", price: "NT$5,980", sv: "164", date: "2026/02/05",
            desc: "調節免疫力、活化細胞、增強體力、有助於營養補給及健康維持。",
            url: "https://www.uvaco.com.tw/Products/51/60/TW0101001",
            img: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101001_995_20260205_1.png"
        },
        {
            id: "TW0101002", name: "永生福朗膠囊", shortName: "永生福朗", type: "膠囊",
            spec: "120 粒／瓶", price: "NT$1,770", sv: "48", date: "2025/10/16",
            desc: "調節免疫力、有助於抗氧化、改善骨質疏鬆、安定神經。",
            url: "https://www.uvaco.com.tw/Products/51/60/TW0101002",
            img: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101002_永生福朗_20251016_1.png"
        },
        {
            id: "TW0101003", name: "康爾喜乳酸菌顆粒", shortName: "康爾喜", type: "益生菌",
            spec: "90 條／盒", price: "NT$1,890", sv: "52", date: "2025/10/16",
            desc: "調節生理機能、改善體質、減輕過敏現象、健胃整腸。",
            url: "https://www.uvaco.com.tw/Products/51/60/TW0101003",
            img: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101003_康爾喜_20251016_1.png"
        },
        {
            id: "TW0101004", name: "葡眾360計劃", shortName: "360計劃", type: "特殊/套組",
            spec: "30 包／盒", price: "NT$11,088", sv: "320", date: "2026/05/04",
            desc: "提供全方位保健計劃、強化免疫力、具備清除與修補功能。",
            url: "https://www.uvaco.com.tw/Products/51/60/TW0101004",
            img: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0101004_360計劃_20260504_1.png"
        }
    ],
    MY: [
        {
            id: "MY0102001", name: "Liprofac", shortName: "Liprofac", type: "膠囊",
            spec: "120 caps / btl", price: "RM416.00", sv: "83", date: "2026/05/21",
            desc: "Antrodia cinnamomea mycelium powder, Phellinus linteus mycelium powder.",
            url: "https://www.uvaco.com.my/Products/132/138/MY0102001",
            img: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/MY0102001_Liprofac_20260521_1.png"
        },
        {
            id: "MY0105001", name: "FemiRely", shortName: "FemiRely", type: "沖泡包",
            spec: "30 sachets/box", price: "RM400.00", sv: "82", date: "2026/05/05",
            desc: "Support women's physiological health, including dehulled adlay, black sugar.",
            url: "https://www.uvaco.com.my/Products/132/141/MY0105001",
            img: "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/MY0105001_FemiRely_20260505_1.png"
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

// 3. 頁面初始化
// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', async () => {
    updateSeriesDropdowns();
    renderTypeFilterButtons();
    bindEvents();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        document.getElementById('syncStatus').innerHTML = '<i class="fa-solid fa-database"></i> 使用備援資料庫';
    }

    renderProducts();
});

// 使用 PapaParse 解析 Google Sheets 數據 (GViz CSV API)
async function fetchGoogleSheetsData() {
    try {
        document.getElementById('syncStatus').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 產品資訊同步中...';

        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            const res = await fetch(url);
            const text = await res.text();
            
            // 使用 PapaParse 進行工業級 CSV 解析
            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return parsed.data.slice(1); // 扣除表頭列
        };

        // 並行抓取 4 個工作表
        const [twData, myData, seriesData, typeData] = await Promise.all([
            fetchSheet('台灣'),
            fetchSheet('馬來西亞'),
            fetchSheet('產品系列'),
            fetchSheet('產品型態')
        ]);

        if (twData && twData.length > 0) appState.products.TW = mapProductRows(twData);
        if (myData && myData.length > 0) appState.products.MY = mapProductRows(myData);
        if (seriesData && seriesData.length > 0) appState.seriesList = parseSeriesRows(seriesData);

        if (typeData && typeData.length > 0) {
            appState.typeList = [{ name: "全部", icon: "fas fa-border-all" }];
            typeData.forEach(row => {
                if (row[0]) appState.typeList.push({ code: row[0], name: row[1], nameEn: row[2], icon: row[3] || "fas fa-tag", color: row[4] || "#94a3b8", bg: row[5] || "rgba(10, 25, 19, 0.88)" });
            });
            renderTypeFilterButtons();
        }

        document.getElementById('syncStatus').innerHTML = '<i class="fa-solid fa-circle-check"></i> 雲端資料同步完成';
    } catch (err) {
        console.warn("無法動態讀取 Google 試算表，使用預設資料:", err);
        document.getElementById('syncStatus').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 雲端同步失敗，切換至備援庫';
    }
}

// 轉換工作表列資料至產品物件
function mapProductRows(rows) {
    return rows.map(r => ({
        id: r[0] || '',
        name: r[1] || '',
        shortName: r[2] || '',
        type: r[3] || '',
        spec: r[4] || '',
        price: r[5] || '',
        sv: r[6] || '',
        date: r[7] || '',
        desc: r[10] || '',
        url: r[12] || '#',
        img: r[13] || ''
    })).filter(item => item.id !== '');
}

// 轉換工作表列資料至系列物件
function parseSeriesRows(rows) {
    const seriesMap = [];

    rows.forEach(r => {
        const code = (r[0] || '').trim();
        const name = (r[1] || '').trim();
        const nameEn = (r[2] || '').trim();
        const icon = (r[3] || 'fas fa-tag').trim();
        const color = (r[4] || '#52b788').trim();
        const bg = (r[5] || 'rgba(10, 25, 19, 0.88)').trim();

        if (!code) return;

        // 長度 2 代表主系列 (如 "01")
        if (code.length === 2) {
            let main = seriesMap.find(s => s.code === code);
            if (!main) {
                main = { code, name, nameEn, icon, color, bg, subs: [] };
                seriesMap.push(main);
            } else {
                main.name = name;
                main.nameEn = nameEn;
            }
        } 
        // 長度 4 代表次系列 (如 "0101")
        else if (code.length === 4) {
            const mainCode = code.slice(0, 2);
            let main = seriesMap.find(s => s.code === mainCode);
            if (!main) {
                main = { code: mainCode, name: '', nameEn: '', subs: [] };
                seriesMap.push(main);
            }
            main.subs.push({ code, name, nameEn, icon, color, bg });
        }
    });

    return seriesMap.length > 0 ? seriesMap : defaultSeriesData;
}

// 取得多語系顯示名稱之輔助函式
function getLanguageName(item, isMY) {
    if (!item) return '';
    //return isMY ? (item.nameEn || item.name) : item.name;
    return isMY ? item.nameEn : item.name;
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

// 生成型態按鈕列 (符合圖標與文字間 1 個半形空白規範)
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

    $('#typeFilterContainer').html(html);

    Utils.equalizeWidths('#typeFilterContainer label');
}

// 綁定 UI 事件
function bindEvents() {
    document.getElementById('countrySelect').addEventListener('change', (e) => {
        appState.country = e.target.value;
        appState.mainSeries = 'ALL';
        updateSeriesDropdowns();
        renderProducts();
    });

    document.getElementById('mainSeriesSelect').addEventListener('change', (e) => {
        appState.mainSeries = e.target.value;
        appState.subSeries = 'ALL';
        updateSubSeriesDropdown(appState.mainSeries);
        renderProducts();
    });

    document.getElementById('subSeriesSelect').addEventListener('change', (e) => {
        appState.subSeries = e.target.value;
        renderProducts();
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
        appState.searchKeyword = e.target.value.trim().toLowerCase();
        renderProducts();
    });

    document.getElementById('typeFilterContainer').addEventListener('change', (e) => {
        if (e.target.name === 'product-type') {
            appState.productType = e.target.value;
            renderProducts();
        }
    });
}

// 渲染產品網格
function renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const isMY = appState.country === 'MY';
    const currentDataset = appState.products[appState.country] || [];

    const filtered = currentDataset.filter(item => {
        // 1. 系列過濾 (依編號前綴對應)
        if (appState.mainSeries !== 'ALL') {
            if (item.id === '80050' || item.id === '80070') {
                if (appState.mainSeries !== '03') {
                    return false;
                } else {
                    return true;
                }
            }

            if (appState.subSeries !== 'ALL') {
                if (item.id.slice(2, 6) !== appState.subSeries) return false;
            } else {
                if (item.id.slice(2, 4) !== appState.mainSeries) return false;
            }
        }

        // 2. 型態過濾
        if (appState.productType !== 'ALL' && item.type !== appState.productType) {
            return false;
        }

        // 3. 關鍵字搜尋
        if (appState.searchKeyword !== '') {
            const k = appState.searchKeyword;
            const mName = item.name.toLowerCase().includes(k);
            const mShort = item.shortName.toLowerCase().includes(k);
            const mId = item.id.toLowerCase().includes(k);
            const mDesc = item.desc.toLowerCase().includes(k);
            if (!mName && !mShort && !mId && !mDesc) return false;
        }

        return true;
    });

    // 更新總數 (維護 1 個半形空白)
    document.getElementById('resultsCount').innerHTML = `<i class="fa-solid fa-list-check"></i> 找到 ${filtered.length} 項符合條件的產品`;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-12">
                <div class="no-data rounded">
                    <i class="fa-solid fa-box-open"></i>
                    <p class="mb-0">未找到符合條件的產品，請調整篩選條件或搜尋關鍵字。</p>
                </div>
            </div>
        `;
        return;
    }

    // 渲染產品卡片 (動態抓取 Icon、文字與色彩)
    filtered.forEach(item => {
        let seriesCode = item.id.slice(2, 6);
        let seriesName = '未知系列';
        let seriesIcon = 'fas fa-tag';
        let seriesColor = '#52b788';
        let seriesBg = 'rgba(10, 25, 19, 0.88)';

        let typeIcon = 'fas fa-tag';
        let typeColor = '#52b788';
        let typeBg = 'rgba(10, 25, 19, 0.88)';

        // 1. 動態匹配產品次系列 (含雙語系名稱、Icon、外框色彩、背景色)
        appState.seriesList.forEach(series => {
            if (item.id === '80050' || item.id === '80070') {
                seriesCode = '0302';
            }

            const subSeries = series.subs.find(s => s.code === seriesCode);
            if (subSeries) {
                seriesName = getLanguageName(subSeries, isMY);
                seriesIcon = subSeries.icon || 'fas fa-tag';
                seriesColor = subSeries.color || '#52b788';
                seriesBg = subSeries.bg || 'rgba(10, 25, 19, 0.88)';
            }
        });

        // 2. 動態匹配產品型態 Icon 與色彩
        appState.typeList.forEach(typeItem => {
            if (typeItem.name === item.type) {
                typeIcon = typeItem.icon || 'fas fa-tag';
                typeColor = typeItem.color || '#52b788';
                typeBg = typeItem.bg || 'rgba(10, 25, 19, 0.88)';
            }
        });

        const col = document.createElement('div');
        col.className = 'col col-12 col-sm-6 col-lg-3';
        col.innerHTML = `
            <div class="card h-100 product-card border-0">
                <div class="card-img-wrapper position-relative">
                    <div class="card-badges">
                        <span class="badge" style="color: ${seriesColor}; border-color: ${seriesColor}; background-color: ${seriesBg};">
                            <i class="${seriesIcon}"></i> ${seriesName}
                        </span>
                        <span class="badge" style="color: ${typeColor}; border-color: ${typeColor}; background-color: ${typeBg};">
                            <i class="${typeIcon}"></i> ${item.type}
                        </span>
                    </div>
                    <img src="${item.img}" alt="${item.name}" loading="lazy" onerror="imgError(this)">
                </div>
                <div class="card-body d-flex flex-column p-3">
                    <h3 class="product-title h6 fw-bold mb-2">${item.name}</h3>
                    <p class="product-desc small mb-3">${item.desc || '暫無產品特色描述'}</p>
                    <div class="price-sv-block mt-auto mb-3 p-2 rounded d-flex justify-content-between align-items-center">
                        <div class="price-tag fw-bold">${item.price}</div>
                        <div class="sv-tag"><i class="fa-solid fa-star"></i> ${item.sv} SV</div>
                    </div>
                    <a href="${item.url}" target="_blank" class="btn btn-secondary w-100 text-center fw-bold">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> 查看產品詳情
                    </a>
                </div>
            </div>
        `;
        grid.appendChild(col);
    });
}

function imgError(imgDiv) {
    let currentSrc = imgDiv.src;

    if (currentSrc.endsWith('.jpg') && !imgDiv.dataset.triedPng) {
        imgDiv.dataset.triedPng = "true";
        imgDiv.src = currentSrc.replace(/\.jpg$/, '.png');
        return;
    }

    let html = `<i class="fa-solid fa-boxes-stacked img-placeholder-icon"></i>`;
    $(imgDiv).replaceWith(html);
}