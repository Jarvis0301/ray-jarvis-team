// ==========================================
// 1. Google 雲端硬碟試算表設定與核心轉接器
// ==========================================
const SPREADSHEET_ID = "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I";

// 依據欄位順序索引 (Column Index) 進行安全取值
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
        return String(row[colIndex]).trim();
    }
    return defaultVal;
}

// ==========================================
// 2. 系統狀態管理
// ==========================================
let appState = {
    country: 'TW',
    mainSeries: 'ALL',      // category_code
    subSeries: 'ALL',       // subcategory_code
    productType: 'ALL',     // type_code
    searchKeyword: '',
    products: { TW: [], MY: [] },
    categories: {},         // category_code -> Category Object
    subcategories: {},      // subcategory_code -> Subcategory Object
    types: {},              // type_code -> Type Object
    categoryList: [],
    subcategoryList: [],
    typeList: []
};

let isInitialized = false;

// ==========================================
// 3. 頁面初始化生命週期
// ==========================================
window.addEventListener('AppReady', async () => {
    await initApp();
});

async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindEvents();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        AppToast.error("未設定 Google 試算表 ID，無法讀取產品資料！");
    }
}

// ==========================================
// 4. 解析 Google Sheets 數據 (依 Schema 索引順序讀取)
// ==========================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步產品資料庫...', '載入系列、型態與產品主檔');
    try {
        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP 通訊錯誤狀態碼: ${res.status}`);
            const text = await res.text();

            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return (parsed.data || []).slice(1);
        };

        const [productsData, mainCategoriesData, subcategoriesData, productTypesData] = await Promise.all([
            fetchSheet('產品主檔'),
            fetchSheet('產品主系列'),
            fetchSheet('產品次系列'),
            fetchSheet('產品型態')
        ]);

        // 1. 解析產品主系列 (0:category_code, 1:name_zh, 2:name_en, 3:icon_class, 4:text_color, 5:bg_color, 6:sort_order, 7:is_valid)
        appState.categories = {};
        appState.categoryList = [];
        (mainCategoriesData || []).forEach(row => {
            const code = getVal(row, 0);
            const isValid = getVal(row, 7, 'Y');
            if (code && isValid !== 'N') {
                const item = {
                    category_code: code,
                    name_zh: getVal(row, 1),
                    name_en: getVal(row, 2),
                    icon_class: getVal(row, 3, 'fa-solid fa-layer-group'),
                    text_color: getVal(row, 4, '#38bdf8'),
                    bg_color: getVal(row, 5, 'rgba(10, 25, 19, 0.88)'),
                    sort_order: parseInt(getVal(row, 6, '0'), 10) || 0
                };
                appState.categories[code] = item;
                appState.categoryList.push(item);
            }
        });
        appState.categoryList.sort((a, b) => a.sort_order - b.sort_order);

        // 2. 解析產品次系列 (0:subcategory_code, 1:category_code, 2:name_zh, 3:name_en, 4:icon_class, 5:text_color, 6:bg_color, 7:sort_order, 8:is_valid)
        appState.subcategories = {};
        appState.subcategoryList = [];
        (subcategoriesData || []).forEach(row => {
            const subCode = getVal(row, 0);
            const isValid = getVal(row, 8, 'Y');
            if (subCode && isValid !== 'N') {
                const item = {
                    subcategory_code: subCode,
                    category_code: getVal(row, 1),
                    name_zh: getVal(row, 2),
                    name_en: getVal(row, 3),
                    icon_class: getVal(row, 4, 'fa-solid fa-tag'),
                    text_color: getVal(row, 5, '#52b788'),
                    bg_color: getVal(row, 6, 'rgba(10, 25, 19, 0.88)'),
                    sort_order: parseInt(getVal(row, 7, '0'), 10) || 0
                };
                appState.subcategories[subCode] = item;
                appState.subcategoryList.push(item);
            }
        });
        appState.subcategoryList.sort((a, b) => a.sort_order - b.sort_order);

        // 3. 解析產品型態 (0:type_code, 1:name_zh, 2:name_en, 3:icon_class, 4:text_color, 5:bg_color, 6:sort_order, 7:is_valid)
        appState.types = {};
        appState.typeList = [];
        (productTypesData || []).forEach(row => {
            const typeCode = getVal(row, 0);
            const isValid = getVal(row, 7, 'Y');
            if (typeCode && isValid !== 'N') {
                const item = {
                    type_code: typeCode,
                    name_zh: getVal(row, 1),
                    name_en: getVal(row, 2),
                    icon_class: getVal(row, 3, 'fa-solid fa-box'),
                    text_color: getVal(row, 4, '#34d399'),
                    bg_color: getVal(row, 5, 'rgba(10, 25, 19, 0.88)'),
                    sort_order: parseInt(getVal(row, 6, '0'), 10) || 0
                };
                appState.types[typeCode] = item;
                appState.typeList.push(item);
            }
        });
        appState.typeList.sort((a, b) => a.sort_order - b.sort_order);

        // 4. 解析產品主檔
        let parsedAll = [];
        (productsData || []).forEach(row => {
            const productCode = getVal(row, 0);
            const isValid = getVal(row, 18, 'Y');
            const launchDate = getVal(row, 19);
            const discontinueDate = getVal(row, 20);
            const status = getProductStatus(launchDate, discontinueDate);

            // 僅保留「即將上市」與「販售中」，排除「已下市」與無效項目
            if (productCode && isValid !== 'N' && status !== 'DISCONTINUED') {
                let regionCode = getVal(row, 1, 'TW').toUpperCase();
                if (!regionCode || (regionCode !== 'TW' && regionCode !== 'MY')) {
                    regionCode = productCode.startsWith('MY') ? 'MY' : 'TW';
                }

                parsedAll.push({
                    product_code: productCode,
                    region_code: regionCode,
                    base_code: getVal(row, 2),
                    name: getVal(row, 3),
                    short_name: getVal(row, 4),
                    short_summary: getVal(row, 5),
                    category_code: getVal(row, 6),
                    subcategory_code: getVal(row, 7),
                    type_code: getVal(row, 8),
                    package_spec: getVal(row, 9),
                    product_weight: getVal(row, 10),
                    price: parseFloat(getVal(row, 11, '0')) || 0,
                    currency: getVal(row, 12, regionCode === 'MY' ? 'MYR' : 'TWD'),
                    sv_point: parseFloat(getVal(row, 13, '0')) || 0,
                    primary_image_url: getVal(row, 14),
                    is_featured: ['TRUE', 'Y', '1'].includes(getVal(row, 15, 'FALSE').toUpperCase()),
                    stock_status: getVal(row, 16, 'IN_STOCK'),
                    sort_order: parseInt(getVal(row, 17, '0'), 10) || 0,
                    launch_date: launchDate,
                    discontinue_date: discontinueDate,
                    status: status
                });
            }
        });

        parsedAll.sort((a, b) => a.sort_order - b.sort_order);

        appState.products.TW = parsedAll.filter(p => p.region_code === 'TW');
        appState.products.MY = parsedAll.filter(p => p.region_code === 'MY');

        updateSeriesDropdowns();
        renderTypeFilterButtons();
        renderProducts();
        AppToast.success(`產品目錄同步完成 (共 ${parsedAll.length} 筆商品)`);
    } catch (err) {
        console.error('無法連線 Google 試算表:', err);
        AppDialog.alert("無法載入產品資料，請確認網路連線或試算表讀取權限！", {
            title: "連線失敗",
            icon: "fa-solid fa-circle-exclamation text-danger"
        });
    } finally {
        AppLoading.hide();
    }
}

// 依據上市日期與下市日期判定狀態：'COMING_SOON' (即將上市)、'ACTIVE' (販售中)、'DISCONTINUED' (已下市)
function getProductStatus(launchDateVal, discontinueDateVal) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parseDate = (val) => {
        if (!val || (typeof val !== 'string' && typeof val !== 'number')) return null;
        const str = String(val).trim();
        if (!str || str === '-' || str === 'N/A' || str === '0' || str.toLowerCase() === 'null') {
            return null;
        }
        const d = new Date(str.replace(/\//g, '-'));
        return isNaN(d.getTime()) ? null : d;
    };

    const launchDate = parseDate(launchDateVal);
    const discontinueDate = parseDate(discontinueDateVal);

    // 1. 若有上市日期且晚於今天 -> 即將上市
    if (launchDate) {
        launchDate.setHours(0, 0, 0, 0);
        if (launchDate.getTime() > today.getTime()) {
            return 'COMING_SOON';
        }
    }

    // 2. 若有下市日期且早於今天 -> 已下市
    if (discontinueDate) {
        discontinueDate.setHours(0, 0, 0, 0);
        if (discontinueDate.getTime() < today.getTime()) {
            return 'DISCONTINUED';
        }
    }

    // 3. 其餘情況 -> 販售中
    return 'ACTIVE';
}

// ==========================================
// 5. 外鍵名稱與樣式關聯 (TW: 中文 / MY: 英文)
// ==========================================
function getCategoryInfo(categoryCode, country = appState.country) {
    const isMY = country === 'MY';
    const cat = appState.categories[categoryCode];
    if (cat) {
        const name = (isMY && cat.name_en) ? cat.name_en : (cat.name_zh || categoryCode);
        return {
            code: cat.category_code,
            name: name,
            icon: cat.icon_class || 'fa-solid fa-layer-group',
            color: cat.text_color || '#38bdf8',
            bg: cat.bg_color || 'rgba(10, 25, 19, 0.88)'
        };
    }
    return {
        code: categoryCode || 'OTHER',
        name: categoryCode || '其他系列',
        icon: 'fa-solid fa-layer-group',
        color: '#38bdf8',
        bg: 'rgba(10, 25, 19, 0.88)'
    };
}

function getSubcategoryInfo(subcategoryCode, country = appState.country) {
    const isMY = country === 'MY';
    const sub = appState.subcategories[subcategoryCode];
    if (sub) {
        const name = (isMY && sub.name_en) ? sub.name_en : (sub.name_zh || subcategoryCode);
        return {
            code: sub.subcategory_code,
            category_code: sub.category_code,
            name: name,
            icon: sub.icon_class || 'fa-solid fa-tag',
            color: sub.text_color || '#52b788',
            bg: sub.bg_color || 'rgba(10, 25, 19, 0.88)'
        };
    }
    return {
        code: subcategoryCode || 'OTHER',
        category_code: '',
        name: subcategoryCode || '一般系列',
        icon: 'fa-solid fa-tag',
        color: '#52b788',
        bg: 'rgba(10, 25, 19, 0.88)'
    };
}

function getTypeInfo(typeCode, country = appState.country) {
    const isMY = country === 'MY';
    const typeObj = appState.types[typeCode];
    if (typeObj) {
        const name = (isMY && typeObj.name_en) ? typeObj.name_en : (typeObj.name_zh || typeCode);
        return {
            code: typeObj.type_code,
            name: name,
            icon: typeObj.icon_class || 'fa-solid fa-box',
            color: typeObj.text_color || '#34d399',
            bg: typeObj.bg_color || 'rgba(10, 25, 19, 0.88)'
        };
    }
    return {
        code: typeCode || 'OTHER',
        name: typeCode || '一般型態',
        icon: 'fa-solid fa-box',
        color: '#34d399',
        bg: 'rgba(10, 25, 19, 0.88)'
    };
}

// ==========================================
// 6. 篩選控制與選單維護
// ==========================================
function updateSeriesDropdowns() {
    const mainSelect = document.getElementById('mainSeriesSelect');
    if (!mainSelect) return;

    mainSelect.innerHTML = '<option value="ALL">全部主系列</option>';

    appState.categoryList.forEach(cat => {
        const catInfo = getCategoryInfo(cat.category_code, appState.country);
        const opt = document.createElement('option');
        opt.value = cat.category_code;
        opt.textContent = `${cat.category_code} ${catInfo.name}`;
        mainSelect.appendChild(opt);
    });

    mainSelect.value = appState.mainSeries || 'ALL';
    updateSubSeriesDropdown(mainSelect.value);
}

function updateSubSeriesDropdown(mainCode) {
    const subSelect = document.getElementById('subSeriesSelect');
    if (!subSelect) return;

    subSelect.innerHTML = '';

    if (!mainCode || mainCode === 'ALL') {
        subSelect.disabled = true;
        subSelect.innerHTML = '<option value="ALL">請先選擇主系列</option>';
        return;
    }

    subSelect.disabled = false;
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'ALL';
    defaultOpt.textContent = '全部次系列';
    subSelect.appendChild(defaultOpt);

    const filteredSubs = appState.subcategoryList.filter(s => s.category_code === mainCode);
    filteredSubs.forEach(sub => {
        const subInfo = getSubcategoryInfo(sub.subcategory_code, appState.country);
        const opt = document.createElement('option');
        opt.value = sub.subcategory_code;
        opt.textContent = `${sub.subcategory_code} ${subInfo.name}`;
        subSelect.appendChild(opt);
    });

    subSelect.value = appState.subSeries || 'ALL';
}

function renderTypeFilterButtons() {
    let html = `
        <input type="radio" class="btn-check" name="product-type" id="type-btn-all" value="ALL" autocomplete="off" ${appState.productType === 'ALL' ? 'checked' : ''}>
        <label class="btn btn-outline-primary btn-sm rounded-pill" for="type-btn-all">
            <i class="fa-solid fa-border-all"></i> 全部型態
        </label>
    `;

    appState.typeList.forEach((t, index) => {
        const typeInfo = getTypeInfo(t.type_code, appState.country);
        const isChecked = appState.productType === t.type_code ? 'checked' : '';
        const inputId = `type-btn-${index}`;

        html += `
            <input type="radio" class="btn-check" name="product-type" id="${inputId}" value="${t.type_code}" autocomplete="off" ${isChecked}>
            <label class="btn btn-outline-primary btn-sm rounded-pill" for="${inputId}">
                <i class="${typeInfo.icon}"></i> ${typeInfo.name}
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

// ==========================================
// 7. UI 事件綁定
// ==========================================
function bindEvents() {
    $('#countrySelect').on('change', function () {
        appState.country = $(this).val();
        appState.mainSeries = 'ALL';
        appState.subSeries = 'ALL';
        appState.productType = 'ALL';

        updateSeriesDropdowns();
        renderTypeFilterButtons();
        renderProducts();
        AppToast.info(`已切換至【${appState.country === 'MY' ? '馬來西亞' : '台灣'}】地區目錄`);
    });

    $('#mainSeriesSelect').on('change', function () {
        appState.mainSeries = $(this).val();
        appState.subSeries = 'ALL';
        updateSubSeriesDropdown(appState.mainSeries);
        renderProducts();
    });

    $('#subSeriesSelect').on('change', function () {
        appState.subSeries = $(this).val();
        renderProducts();
    });

    $('#searchInput').on('input', function () {
        appState.searchKeyword = $(this).val().trim().toLowerCase();
        renderProducts();
    });

    $('#typeFilterContainer').on('change', 'input[name="product-type"]', function () {
        appState.productType = $(this).val();
        renderProducts();
    });
}

// ==========================================
// 8. 產品列表網格渲染
// ==========================================
function renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const currentDataset = appState.products[appState.country] || [];

    const filtered = currentDataset.filter(item => {
        if (appState.mainSeries !== 'ALL') {
            const itemCat = item.category_code || (item.subcategory_code ? item.subcategory_code.slice(0, 2) : '');
            if (itemCat !== appState.mainSeries) return false;
        }

        if (appState.subSeries !== 'ALL') {
            if (item.subcategory_code !== appState.subSeries) return false;
        }

        if (appState.productType !== 'ALL') {
            if (item.type_code !== appState.productType) return false;
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

    filtered.forEach(item => {
        const subInfo = getSubcategoryInfo(item.subcategory_code, item.region_code);
        const typeInfo = getTypeInfo(item.type_code, item.region_code);

        const detailUrl = `./prd-detail.html?code=${encodeURIComponent(item.product_code)}&region=${encodeURIComponent(item.region_code)}`;
        const priceNum = Number(item.price) || 0;
        const formattedPrice = item.currency === 'MYR' ? `RM ${priceNum.toLocaleString()}` : `NT$ ${priceNum.toLocaleString()}`;

        // 卡片右上角標籤：優先顯示「即將上市」，若無且為明星商品則顯示「明星商品」
        let topRightTag = '';
        if (item.status === 'COMING_SOON') {
            topRightTag = '<span class="badge badge-warning position-absolute top-0 end-0 m-2 z-2"><i class="fa-solid fa-clock"></i> 即將上市</span>';
        } else if (item.is_featured) {
            topRightTag = '<span class="badge badge-danger position-absolute top-0 end-0 m-2 z-2"><i class="fa-solid fa-fire"></i> 明星商品</span>';
        }

        const col = document.createElement('div');
        col.className = 'col col-12 col-sm-6 col-lg-3 mb-4';
        col.innerHTML = `
            <div class="card h-100 product-card border-0 text-light shadow-sm">
                <div class="card-img-wrapper position-relative overflow-hidden">
                    <div class="card-badges position-absolute top-0 start-0 p-2 d-flex flex-wrap gap-1 z-2">
                        <span class="badge border" style="color: ${subInfo.color}; border-color: ${subInfo.color} !important; background-color: ${subInfo.bg};">
                            <i class="${subInfo.icon}"></i> ${subInfo.name}
                        </span>
                        <span class="badge border" style="color: ${typeInfo.color}; border-color: ${typeInfo.color} !important; background-color: ${typeInfo.bg};">
                            <i class="${typeInfo.icon}"></i> ${typeInfo.name}
                        </span>
                    </div>
                    ${topRightTag}
                    <img src="${item.primary_image_url}" class="card-img-top product-thumbnail" alt="${item.name}" loading="lazy" onerror="window.imgError(this, 'product', 220, 220)">
                </div>
                <div class="card-body d-flex flex-column p-3">
                    <h3 class="product-title h6 fw-bold mb-2 text-light">${item.name}</h3>
                    <p class="product-desc small text-muted mb-3 text-truncate-2">${item.short_summary || '暫無產品簡介'}</p>
                    <div class="price-sv-block mt-auto mb-3 p-2 rounded d-flex justify-content-between align-items-center bg-dark-subtle">
                        <div class="price-tag fw-bold text-warning">${formattedPrice}</div>
                        <div class="sv-tag small text-warning"><i class="fa-solid fa-star"></i> ${item.sv_point} SV</div>
                    </div>
                    <a href="${detailUrl}" target="_blank" class="btn btn-outline-primary w-100 text-center fw-bold">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> 查看產品詳情
                    </a>
                </div>
            </div>
        `;
        grid.appendChild(col);
    });
}