// ==========================================
// 1. Google 雲端硬碟試算表設定 (請於此處替換試算表ID)
// ==========================================
let SPREADSHEET_ID = "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I"; // 填入公開的 Google Sheet ID

// 核心轉接器：依據資料表欄位順序索引 (Column Index) 抓取資料
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && row[colIndex] !== '') {
        return row[colIndex].toString().trim();
    }
    return defaultVal;
}

// 2. 系統狀態管理
let appState = {
    country: 'TW',
    mainSeries: 'ALL',
    subSeries: 'ALL',
    productType: 'ALL',
    searchKeyword: '',
    products: { TW: [], MY: [] },
    seriesList: [],
    typeList: []
};

// 3. 頁面初始化 (相容 AppReady 與 DOMContentLoaded)
window.addEventListener('AppReady', () => {
    initApp();
});

let isInitialized = false;
async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindEvents();

    if (SPREADSHEET_ID && SPREADSHEET_ID !== 'YOUR_GOOGLE_SHEET_ID_HERE') {
        await fetchGoogleSheetsData();
    } else {
        handleFetchError('未設定有效的試算表 ID');
    }
}

// 4. 解析 Google Sheets 數據 (改為二維陣列，依據欄位順序索引讀取)
async function fetchGoogleSheetsData() {
    try {
        const syncElem = document.getElementById('syncStatus');
        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> 產品資訊同步中...';

        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP 錯誤! 狀態: ${res.status}`);
            const text = await res.text();

            // 解析為二維陣列 (header: false)
            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            if (!parsed.data || parsed.data.length <= 1) {
                throw new Error(`【${sheetName}】工作表資料空白或無效`);
            }

            // 跳過第一列（標頭檔欄位名稱列）
            return parsed.data.slice(1);
        };

        // 並行抓取 4 大資料表工作表
        const [productsData, mainCategoriesData, subcategoriesData, productTypesData] = await Promise.all([
            fetchSheet('產品主檔'),
            fetchSheet('產品主系列'),
            fetchSheet('產品次系列'),
            fetchSheet('產品型態')
        ]);

        // A. 處理「產品主檔」：依欄位順序讀取並依 region_code 分流
        if (productsData && productsData.length > 0) {
            const parsedAll = parseProductsTable(productsData);
            appState.products.TW = parsedAll.filter(p => p.region_code === 'TW');
            appState.products.MY = parsedAll.filter(p => p.region_code === 'MY');
        }

        // B. 處理「產品主系列」與「產品次系列」：動態組裝雙層選單
        if (mainCategoriesData && mainCategoriesData.length > 0) {
            appState.seriesList = buildSeriesTree(mainCategoriesData, subcategoriesData || []);
            updateSeriesDropdowns();
        }

        // C. 處理「產品型態」：依欄位順序 (Col 0 ~ 6) 讀取
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

        if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> 雲端資料同步完成';
        renderProducts();

    } catch (err) {
        handleFetchError(err);
    }
}

// 錯誤處理與提示視窗
function handleFetchError(err) {
    console.error('無法連線 Google 試算表:', err);

    appState.products = { TW: [], MY: [] };
    appState.seriesList = [];
    appState.typeList = [];

    const syncElem = document.getElementById('syncStatus');
    if (syncElem) syncElem.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-1"></i> 雲端同步失敗';

    renderProducts();

    if (typeof AppDialog !== 'undefined' && AppDialog.alert) {
        AppDialog.alert("無法載入產品資料，請確認網路連線或試算表讀取權限！", {
            title: "連線失敗",
            icon: "fa-solid fa-circle-exclamation text-danger"
        });
    }
}

// 解析「產品主表」數據列 (Col 0 ~ 13 依欄位順序讀取)
function parseProductsTable(rows) {
    return rows.map((r, idx) => {
        const rawId = getVal(r, 0, String(idx + 1));
        const productCode = getVal(r, 3);
        let regionCode = getVal(r, 1, 'TW').toUpperCase();

        // 若地區代碼未填，自動由產品編號前綴判斷
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

// 組合「產品主系列表」與「產品次系列表」為雙層樹狀結構 (依欄位順序讀取)
function buildSeriesTree(mainRows, subRows) {
    const seriesList = [];

    // 1. 建立主系列 (Col 0 ~ 6)
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

    // 2. 歸屬次系列至主系列下方 (Col 0 ~ 7)
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

    return seriesList;
}

// 取得多語系顯示名稱之輔助函式
function getLanguageName(item, isMY) {
    if (!item) return '';
    return isMY ? (item.nameEn || '') : item.name;
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
                <i class="${item.icon} me-1"></i> ${item.name}
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

// 渲染產品網格 (帶入試算表內的實體 id，網址形如 ./product-detail.html?id=${id}&region=${region_id})
function renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const isMY = appState.country === 'MY';
    const currentDataset = appState.products[appState.country] || [];

    const filtered = currentDataset.filter(item => {
        // 1. 系列過濾
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
        countElem.innerHTML = `<i class="fa-solid fa-list-check me-1"></i> 找到 ${filtered.length} 項符合條件的產品`;
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

    // 渲染產品卡片 (帶入試算表中原有的實體 id 進行轉址)
    filtered.forEach(item => {
        let subCode = item.subcategory_code || '';
        if (item.product_code === '80050' || item.product_code === '80070') {
            subCode = '0302';
        } else if (!subCode && item.product_code.length >= 6) {
            subCode = item.product_code.replace(/^(TW|MY)/, '').slice(0, 4);
        }

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

        // 精準生成指定格式之轉址：./product-detail.html?id=${id}&region=${region_id}
        const detailUrl = `./prd-detail.html?id=${encodeURIComponent(item.id)}&region=${encodeURIComponent(item.region_code)}`;
        const priceNum = Number(item.price);
        const formattedPrice = item.currency === 'MYR' ? `RM ${priceNum.toLocaleString()}` : `NT$ ${priceNum.toLocaleString()}`;

        const col = document.createElement('div');
        col.className = 'col col-12 col-sm-6 col-lg-3 mb-4';
        col.innerHTML = `
            <div class="card h-100 product-card border-0 bg-dark text-light shadow-sm">
                <div class="card-img-wrapper position-relative overflow-hidden">
                    <div class="card-badges position-absolute top-0 start-0 p-2 d-flex flex-wrap gap-1 z-2">
                        <span class="badge border" style="color: ${seriesColor}; border-color: ${seriesColor} !important; background-color: ${seriesBg};">
                            <i class="${seriesIcon} me-1"></i> ${seriesName}
                        </span>
                        <span class="badge border" style="color: ${typeColor}; border-color: ${typeColor} !important; background-color: ${typeBg};">
                            <i class="${typeIcon} me-1"></i> ${item.type_name || '保健'}
                        </span>
                    </div>
                    <img src="${item.primary_image_url}" class="card-img-top product-thumbnail" alt="${item.name}" loading="lazy" onerror="imgError(this)">
                </div>
                <div class="card-body d-flex flex-column p-3">
                    <h3 class="product-title h6 fw-bold mb-2 text-light">${item.name}</h3>
                    <p class="product-desc small text-muted mb-3 text-truncate-2">${item.short_summary || '暫無產品簡介'}</p>
                    <div class="price-sv-block mt-auto mb-3 p-2 rounded d-flex justify-content-between align-items-center bg-dark-subtle">
                        <div class="price-tag fw-bold text-warning">${formattedPrice}</div>
                        <div class="sv-tag small text-warning"><i class="fa-solid fa-star me-1"></i> ${item.sv_point} SV</div>
                    </div>
                    <a href="${detailUrl}" target="_blank" class="btn btn-outline-primary w-100 text-center fw-bold">
                        <i class="fa-solid fa-arrow-up-right-from-square me-1"></i> 查看產品詳情
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
