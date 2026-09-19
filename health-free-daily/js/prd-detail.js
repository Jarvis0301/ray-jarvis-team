// ==========================================
// 1. Google 雲端硬碟試算表設定與核心轉接器
// ==========================================
const SPREADSHEET_ID = {
    PRD: APP_CONFIG.SHEETS.PRD
};

const SHEET_NAMES = {
    PRODUCTS: '產品主檔',
    DETAILS: '產品詳細資料',
    CATEGORIES: '產品主系列',
    SUBCATEGORIES: '產品次系列',
    TYPES: '產品型態',
    COPYWRITING: '行銷文案',
    FAQ: '產品問答'
};

// 取得 URL 查詢參數
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        productCode: params.get('code') || params.get('id') || '',
        region: (params.get('region') || 'TW').toUpperCase()
    };
}

// Google Drive 圖片網址轉換直連
function parseImageUrl(url) {
    if (!url) return '';
    const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
    }
    return url;
}

// 返回產品清單頁
function closeOrReturn() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = './prd-products.html';
    }
}

// ==========================================
// 2. 頁面初始化生命週期
// ==========================================
window.addEventListener('AppReady', async () => {
    const { productCode, region } = getUrlParams();

    if (!productCode) {
        AppDialog.alert("未指定產品編號，即將返回產品目錄！", {
            title: "參數錯誤",
            icon: "fa-solid fa-circle-exclamation text-warning",
            onClose: () => closeOrReturn()
        });
        return;
    }

    await loadProductDetail(productCode, region);
});

// ==========================================
// 3. 讀取並關聯該產品之完整資料
// ==========================================
async function loadProductDetail(productCode, region) {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i>正在讀取雲端資料庫...', '載入中...');

    try {
        const targetCodeUpper = productCode.toUpperCase().trim();
        const baseCodeTarget = targetCodeUpper.replace(/^(TW|MY)/, '');

        const [productsData, detailsData, mainCatsData, subsData, typesData, copywritingData, faqData] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.PRODUCTS),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.DETAILS),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.CATEGORIES),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.SUBCATEGORIES),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.TYPES),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.COPYWRITING),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PRD, SHEET_NAMES.FAQ)
        ]);

        const targetProductRow = (productsData || []).find(r => {
            const code = getVal(r, 0).toUpperCase().trim();
            const base = getVal(r, 2).toUpperCase().trim();
            return code === targetCodeUpper || base === baseCodeTarget;
        });

        if (!targetProductRow) {
            throw new Error(`找不到產品編號【${productCode}】的產品資料。`);
        }

        // 解析產品主檔物件
        const launchDate = getVal(targetProductRow, 24);
        const delistDate = getVal(targetProductRow, 25);
        const marketStatus = getMarketStatus(launchDate, delistDate);

        const product = {
            product_code: getVal(targetProductRow, 0),
            region_code: getVal(targetProductRow, 1, region),
            base_code: getVal(targetProductRow, 2),
            name: getVal(targetProductRow, 3),
            short_name: getVal(targetProductRow, 4),
            short_summary: getVal(targetProductRow, 5),
            category_code: getVal(targetProductRow, 6),
            subcategory_code: getVal(targetProductRow, 7),
            type_code: getVal(targetProductRow, 8),
            package_spec: getVal(targetProductRow, 9),
            product_weight: getVal(targetProductRow, 11),
            price: parseFloat(getVal(targetProductRow, 16, '0')) || 0,
            currency: getVal(targetProductRow, 17, region === 'MY' ? 'MYR' : 'TWD'),
            sv_point: parseFloat(getVal(targetProductRow, 18, '0')) || 0,
            primary_image_url: parseImageUrl(getVal(targetProductRow, 19)),
            is_featured: ['TRUE', 'Y', '1'].includes(getVal(targetProductRow, 20, 'FALSE').toUpperCase()),
            launch_date: launchDate,
            delist_date: delistDate,
            is_on_market: marketStatus.isOnMarket,
            market_status: marketStatus
        };

        const matchedDetailRow = (detailsData || []).find(r => {
            const id = getVal(r, 0).toUpperCase().trim();
            return id === product.product_code.toUpperCase().trim() || id === product.base_code.toUpperCase().trim() || id === targetCodeUpper;
        }) || [];

        const detail = {
            hd_image_url: parseImageUrl(getVal(matchedDetailRow, 1)),
            certifications: getVal(matchedDetailRow, 2),
            detailed_description: getVal(matchedDetailRow, 3, product.short_summary),
            usage_scenarios: getVal(matchedDetailRow, 4),
            phrase_tags: getVal(matchedDetailRow, 5),
            features_and_functions: getVal(matchedDetailRow, 6),
            ingredients: getVal(matchedDetailRow, 7),
            official_site_url: getVal(matchedDetailRow, 8)
        };

        const isMY = product.region_code === 'MY';
        const subCatRow = (subsData || []).find(r => getVal(r, 0) === product.subcategory_code);
        const typeRow = (typesData || []).find(r => getVal(r, 0) === product.type_code);

        const subInfo = {
            name: subCatRow ? (isMY && getVal(subCatRow, 3) ? getVal(subCatRow, 3) : getVal(subCatRow, 2)) : (product.subcategory_code || '一般系列'),
            icon: subCatRow ? getVal(subCatRow, 4, 'fa-solid fa-tag') : 'fa-solid fa-tag',
            color: subCatRow ? getVal(subCatRow, 5, '#52b788') : '#52b788',
            bg: subCatRow ? getVal(subCatRow, 6, 'rgba(10, 25, 19, 0.88)') : 'rgba(10, 25, 19, 0.88)'
        };

        const typeInfo = {
            name: typeRow ? (isMY && getVal(typeRow, 2) ? getVal(typeRow, 2) : getVal(typeRow, 1)) : (product.type_code || '一般型態'),
            icon: typeRow ? getVal(typeRow, 3, 'fa-solid fa-box') : 'fa-solid fa-box',
            color: typeRow ? getVal(typeRow, 4, '#34d399') : '#34d399',
            bg: typeRow ? getVal(typeRow, 5, 'rgba(10, 25, 19, 0.88)') : 'rgba(10, 25, 19, 0.88)'
        };

        const relatedCopywriting = (copywritingData || [])
            .filter(r => {
                const pid = getVal(r, 1).toUpperCase().trim();
                const isActive = getVal(r, 8, 'Y').toUpperCase().trim();
                return (pid === product.product_code.toUpperCase().trim() || pid === product.base_code.toUpperCase().trim()) && isActive !== 'N';
            })
            .map(r => ({
                id: getVal(r, 0),
                title: getVal(r, 2),
                content: getVal(r, 3),
                image_url: parseImageUrl(getVal(r, 4)),
                copy_type: getVal(r, 5, '通用文案')
            }));

        const relatedFAQ = (faqData || [])
            .filter(r => {
                const pid = getVal(r, 1).toUpperCase().trim();
                const isActive = getVal(r, 5, 'Y').toUpperCase().trim();
                return (pid === product.product_code.toUpperCase().trim() || pid === product.base_code.toUpperCase().trim()) && isActive !== 'N';
            })
            .map(r => ({
                id: getVal(r, 0),
                question: getVal(r, 2),
                answer: getVal(r, 3)
            }));

        renderDetailPage({ product, detail, subInfo, typeInfo, relatedCopywriting, relatedFAQ });
        $('#productContainer').removeClass('d-none');
    } catch (err) {
        console.error("載入產品詳細資料失敗:", err);
        AppDialog.alert(err.message || "載入產品詳細資料失敗，請確認網路連線！", {
            title: "資料載入失敗",
            icon: "fa-solid fa-circle-exclamation text-danger",
            onClose: () => closeOrReturn()
        });
    } finally {
        AppLoading.hide();
    }
}

// 依據上市與下市日期判定目前產品市場狀態
function getMarketStatus(launchDate, delistDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    const lTs = AppDate.toTimestamp(launchDate);
    const dTs = AppDate.toTimestamp(delistDate);

    if (lTs > 0 && lTs > todayTs) return { isOnMarket: false, code: 'COMING_SOON', label: '即將上市' };
    if (dTs > 0 && dTs <= todayTs) return { isOnMarket: false, code: 'DISCONTINUED', label: '已下市' };
    return { isOnMarket: true, code: 'ACTIVE', label: '販售中' };
}

// ==========================================
// 4. 視圖渲染器 (含圖片平滑降級與詳細規格動態呈現)
// ==========================================
function renderDetailPage({ product, detail, subInfo, typeInfo, relatedCopywriting, relatedFAQ }) {
    const primaryImg = product.primary_image_url;
    const hdImg = detail.hd_image_url;
    const targetImgSrc = hdImg || primaryImg || '';

    const $productImg = $('#productImg');
    $productImg.css('opacity', '1').show();

    if (targetImgSrc) {
        $productImg.off('error').on('error', function () {
            if (hdImg && this.src === hdImg && primaryImg && hdImg !== primaryImg) {
                this.src = primaryImg;
            } else {
                $(this).hide();
                $('#productImgWrapper').html(`
                    <div class="d-flex flex-column align-items-center justify-content-center py-5 text-muted" style="min-height: 320px;">
                        <i class="fa-solid fa-box-open fa-3x mb-2 opacity-50"></i>
                        <span class="small">暫無產品圖片</span>
                    </div>
                `);
            }
        });
        $productImg.attr('src', targetImgSrc).attr('alt', product.name);
    } else {
        $productImg.hide();
        $('#productImgWrapper').html(`
            <div class="d-flex flex-column align-items-center justify-content-center py-5 text-muted" style="min-height: 320px;">
                <i class="fa-solid fa-box-open fa-3x mb-2 opacity-50"></i>
                <span class="small">暫無產品圖片</span>
            </div>
        `);
    }

    $('#productTitle').text(product.name);
    $('#productShortName').text(product.short_name ? `(${product.short_name})` : '');

    $('#productTypeBadge').html(`
        ${UIBadges.product.subcategory(subInfo, product.region_code)}
        ${UIBadges.product.type(typeInfo, product.region_code)}
    `);

    if (detail.phrase_tags) {
        const tagsHtml = detail.phrase_tags.split(',').map(tag => `
            <span class="badge badge-info me-1">
                <i class="fa-solid fa-hashtag me-1"></i>${tag.trim()}
            </span>
        `).join('');
        $('#phraseTagsContainer').html(tagsHtml).removeClass('d-none');
    } else {
        $('#phraseTagsContainer').addClass('d-none');
    }

    const specsHtml = [];
    const currencyPrefix = product.currency === 'MYR' ? 'RM ' : 'NT$ ';

    if (product.price !== undefined && product.price !== null && product.price !== '') {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-tags text-warning me-1"></i>建議售價：<span class="text-warning fw-bold fs-5">${currencyPrefix}${Number(product.price).toLocaleString()}</span>
            </p>
        `);
    }

    if (product.sv_point !== undefined && product.sv_point !== null && product.sv_point !== '') {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-star text-info me-1"></i>全球積分：<span class="text-info fw-bold">${Number(product.sv_point).toLocaleString()} SV</span>
            </p>
        `);
    }

    if (product.package_spec) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-box text-success me-1"></i>包裝規格：<span class="text-light">${product.package_spec}</span>
            </p>
        `);
    }

    if (product.product_weight) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-weight-scale text-secondary me-1"></i>產品淨重：<span class="text-light">${product.product_weight}</span>
            </p>
        `);
    }

    if (product.product_code) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-barcode text-secondary me-1"></i>產品編號：<span class="text-light">${product.product_code}</span>
            </p>
        `);
    }

    if (product.is_featured) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-crown text-warning me-1"></i>明星商品：${UIBadges.product.featured(true)}
            </p>
        `);
    }

    specsHtml.push(`
        <p class="mb-2 text-muted">
            <i class="fa-solid fa-signal text-info me-1"></i>上市狀態：${UIBadges.product.launchStatus(product.market_status.code)}
        </p>
    `);

    if (product.launch_date) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-calendar-day text-primary me-1"></i>上市日期：<span class="text-light">${AppDate.toDisplay(product.launch_date)}</span>
            </p>
        `);
    }

    if (product.delist_date) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-calendar-xmark text-danger me-1"></i>下市日期：<span class="text-danger">${AppDate.toDisplay(product.delist_date)}</span>
            </p>
        `);
    }

    if (detail.certifications) {
        specsHtml.push(`
            <p class="mb-0 text-muted">
                <i class="fa-solid fa-certificate text-danger me-1"></i>品質認證：<span class="text-light">${detail.certifications}</span>
            </p>
        `);
    }

    $('.specs-list').html(specsHtml.join(''));

    if (detail.official_site_url) {
        $('#officialBtn').attr('href', detail.official_site_url).removeClass('d-none');
    } else {
        $('#officialBtn').addClass('d-none');
    }

    $('#detailedDescription').html(detail.detailed_description || '<p class="text-muted">暫無詳細介紹。</p>');
    $('#featuresFunctions').html(detail.features_and_functions || '<p class="text-muted">暫無特色與功能條列。</p>');
    $('#ingredients').html(detail.ingredients || '<p class="text-muted">請參閱外包裝標示。</p>');
    $('#usageScenarios').html(detail.usage_scenarios || '<p class="text-muted">建議每日食用/使用，請依照專業人員建議指引。</p>');

    if (relatedCopywriting && relatedCopywriting.length > 0) {
        let tabsHtml = '';
        let contentHtml = '';

        relatedCopywriting.forEach((c, idx) => {
            const isActive = idx === 0 ? 'active' : '';
            const tabId = `copyTab_${idx}`;
            tabsHtml += `
                <li class="nav-item" role="presentation">
                    <button class="nav-link ${isActive} btn-sm py-1 px-3 me-2" id="${tabId}-tab" data-bs-toggle="pill" data-bs-target="#${tabId}" type="button">
                        <i class="fa-solid fa-bullhorn me-1"></i>${c.copy_type || c.title}
                    </button>
                </li>
            `;
            contentHtml += `
                <div class="tab-pane fade ${idx === 0 ? 'show active' : ''}" id="${tabId}">
                    <h6 class="fw-bold text-warning mb-2">${c.title}</h6>
                    <div class="text-light-subtle small lh-lg" style="white-space: pre-wrap;">${c.content}</div>
                </div>
            `;
        });

        $('#copywritingTabs').html(tabsHtml);
        $('#copywritingTabContent').html(contentHtml);
        $('#copywritingContainer').removeClass('d-none');
    } else {
        $('#copywritingContainer').addClass('d-none');
    }

    if (relatedFAQ && relatedFAQ.length > 0) {
        let faqHtml = '';
        relatedFAQ.forEach((f, idx) => {
            const collapseId = `faqCollapse_${idx}`;
            faqHtml += `
                <div class="accordion-item bg-dark border border-secondary border-opacity-50 mb-2 rounded overflow-hidden">
                    <h2 class="accordion-header">
                        <button class="accordion-button collapsed bg-dark text-light small py-2" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                            <i class="fa-solid fa-circle-question text-info me-1"></i>${f.question}
                        </button>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
                        <div class="accordion-body small text-muted lh-base">
                            ${f.answer}
                        </div>
                    </div>
                </div>
            `;
        });
        $('#faqAccordion').html(faqHtml);
        $('#faqContainer').removeClass('d-none');
    } else {
        $('#faqContainer').addClass('d-none');
    }
}