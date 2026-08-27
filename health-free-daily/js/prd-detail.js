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
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在載入產品規格詳情...', '檢索文案與常見問題');
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

        const targetCodeUpper = productCode.toUpperCase().trim();
        const baseCodeTarget = targetCodeUpper.replace(/^(TW|MY)/, '');

        const [
            productsData,
            detailsData,
            mainCatsData,
            subsData,
            typesData,
            copywritingData,
            faqData
        ] = await Promise.all([
            fetchSheet('產品主檔'),
            fetchSheet('產品詳細資料'),
            fetchSheet('產品主系列'),
            fetchSheet('產品次系列'),
            fetchSheet('產品型態'),
            fetchSheet('行銷文案'),
            fetchSheet('產品問答')
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
        const launchDate = getVal(targetProductRow, 19);
        const delistDate = getVal(targetProductRow, 20);
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
            product_weight: getVal(targetProductRow, 10),
            price: parseFloat(getVal(targetProductRow, 11, '0')) || 0,
            currency: getVal(targetProductRow, 12, region === 'MY' ? 'MYR' : 'TWD'),
            sv_point: parseFloat(getVal(targetProductRow, 13, '0')) || 0,
            primary_image_url: parseImageUrl(getVal(targetProductRow, 14)),
            is_featured: ['TRUE', 'Y', '1'].includes(getVal(targetProductRow, 15, 'FALSE').toUpperCase()),
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

    const parseDate = (val) => {
        if (!val || (typeof val !== 'string' && typeof val !== 'number')) return null;
        const str = String(val).trim();
        if (!str || str === '-' || str === 'N/A' || str === '0' || str.toLowerCase() === 'null') {
            return null;
        }
        const d = new Date(str.replace(/\//g, '-'));
        return isNaN(d.getTime()) ? null : d;
    };

    const lDate = parseDate(launchDate);
    const dDate = parseDate(delistDate);

    // 1. 若上市日期晚於今天 -> 即將上市
    if (lDate) {
        lDate.setHours(0, 0, 0, 0);
        if (lDate.getTime() > today.getTime()) {
            return {
                isOnMarket: false,
                label: '即將上市',
                badgeClass: 'bg-warning text-dark',
                icon: 'fa-solid fa-clock'
            };
        }
    }

    // 2. 若下市日期早於或等於今天 -> 已下市
    if (dDate) {
        dDate.setHours(0, 0, 0, 0);
        if (dDate.getTime() <= today.getTime()) {
            return {
                isOnMarket: false,
                label: '已下市',
                badgeClass: 'bg-danger text-white',
                icon: 'fa-solid fa-ban'
            };
        }
    }

    // 3. 正常販售中
    return {
        isOnMarket: true,
        label: '販售中',
        badgeClass: 'bg-success text-white',
        icon: 'fa-solid fa-circle-check'
    };
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
        <span class="badge border" style="color: ${subInfo.color}; border-color: ${subInfo.color} !important; background-color: ${subInfo.bg};">
            <i class="${subInfo.icon}"></i> ${subInfo.name}
        </span>
        <span class="badge border" style="color: ${typeInfo.color}; border-color: ${typeInfo.color} !important; background-color: ${typeInfo.bg};">
            <i class="${typeInfo.icon}"></i> ${typeInfo.name}
        </span>
    `);

    if (detail.phrase_tags) {
        const tagsHtml = detail.phrase_tags.split(',').map(tag => `
            <span class="badge bg-secondary bg-opacity-25 text-info border border-info border-opacity-25 me-1">
                <i class="fa-solid fa-hashtag"></i> ${tag.trim()}
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
                <i class="fa-solid fa-tags text-warning"></i> 建議售價：<span class="text-warning fw-bold fs-5">${currencyPrefix}${Number(product.price).toLocaleString()}</span>
            </p>
        `);
    }

    if (product.sv_point !== undefined && product.sv_point !== null && product.sv_point !== '') {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-star text-info"></i> 全球積分：<span class="text-info fw-bold">${Number(product.sv_point).toLocaleString()} SV</span>
            </p>
        `);
    }

    if (product.package_spec) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-box text-success"></i> 包裝規格：<span class="text-light">${product.package_spec}</span>
            </p>
        `);
    }

    if (product.product_weight) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-weight-scale text-secondary"></i> 產品淨重：<span class="text-light">${product.product_weight}</span>
            </p>
        `);
    }

    if (product.product_code) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-barcode text-secondary"></i> 產品編號：<span class="text-light">${product.product_code}</span>
            </p>
        `);
    }

    if (product.is_featured) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-crown text-warning"></i> 明星商品：<span class="badge bg-warning text-dark"><i class="fa-solid fa-fire"></i> 明星熱銷推薦</span>
            </p>
        `);
    }

    // 上市狀態標籤
    specsHtml.push(`
        <p class="mb-2 text-muted">
            <i class="fa-solid fa-signal text-info"></i> 上市狀態：<span class="badge ${product.market_status.badgeClass}"><i class="${product.market_status.icon}"></i> ${product.market_status.label}</span>
        </p>
    `);

    if (product.launch_date) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-calendar-day text-primary"></i> 上市日期：<span class="text-light">${product.launch_date}</span>
            </p>
        `);
    }

    if (product.delist_date) {
        specsHtml.push(`
            <p class="mb-2 text-muted">
                <i class="fa-solid fa-calendar-xmark text-danger"></i> 下市日期：<span class="text-danger">${product.delist_date}</span>
            </p>
        `);
    }

    if (detail.certifications) {
        specsHtml.push(`
            <p class="mb-0 text-muted">
                <i class="fa-solid fa-certificate text-danger"></i> 品質認證：<span class="text-light">${detail.certifications}</span>
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
                        <i class="fa-solid fa-bullhorn"></i> ${c.copy_type || c.title}
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
                            <i class="fa-solid fa-circle-question text-info"></i> ${f.question}
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