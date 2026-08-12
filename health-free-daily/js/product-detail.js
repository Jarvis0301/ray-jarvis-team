// ==========================================
// 1. Google 雲端硬碟試算表設定 (請於此處替換試算表ID)
// ==========================================
let SPREADSHEET_ID = '18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I';

let currentProductId = '1';
let currentRegion = 'TW';

// 智慧關聯關閉/返回觸發器 (Smart Window Closer)
function closeOrReturn() {
    if (window.opener || window.history.length > 1) {
        window.close();
    }
    setTimeout(() => {
        window.location.href = './products.html';
    }, 100);
}

// 核心解耦轉接器：欄位名稱模糊匹配適配器 (Field Decoupling Adapter)
function getVal(row, keys, defaultVal = '') {
    if (!row) return defaultVal;
    
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
    
    if (Array.isArray(row)) {
        const numKey = keys.find(k => typeof k === 'number');
        if (numKey !== undefined && row[numKey] !== undefined && row[numKey] !== null) {
            return row[numKey].toString().trim();
        }
    }
    
    return defaultVal;
}

// 解析 URL 參數
function getUrlParameter(sParam) {
    let sPageURL = window.location.search.substring(1);
    let sURLVariables = sPageURL.split('&');
    for (let i = 0; i < sURLVariables.length; i++) {
        let sParameterName = sURLVariables[i].split('=');
        if (sParameterName[0] === sParam) {
            return sParameterName[1] === undefined ? true : decodeURIComponent(sParameterName[1]);
        }
    }
    return false;
}

// 頁面初始化事件監聽
window.addEventListener('AppReady', () => {
    initDetailPage();
});

let isDetailPageInitialized = false;
async function initDetailPage() {
    if (isDetailPageInitialized) return;
    isDetailPageInitialized = true;

    currentProductId = getUrlParameter('id') || '1';
    currentRegion = (getUrlParameter('region') || 'TW').toUpperCase();

    await fetchAndRenderProductDetail();
}

// 並行拉取 Google 試算表關聯表資料
async function fetchAndRenderProductDetail() {
    try {
        $('#loadingSpinner').removeClass('d-none');
        $('#productContainer').addClass('d-none');

        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            const res = await fetch(url);
            const text = await res.text();
            
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

        // 並行擷取 8 大正規化工作表
        const [
            productsData, 
            detailsData, 
            faqsData, 
            copywritingsData, 
            testimonialsData, 
            pivotData, 
            subcategoriesData, 
            typesData
        ] = await Promise.all([
            fetchSheet('產品主表'),
            fetchSheet('產品詳細資料表'),
            fetchSheet('產品常見問題表'),
            fetchSheet('產品多文案表'),
            fetchSheet('見證主表'),
            fetchSheet('產品見證樞紐表'),
            fetchSheet('產品次系列表'),
            fetchSheet('產品型態表')
        ]);

        // 1. 比對產品主表
        const productRow = productsData.find(r => {
            const rowId = getVal(r, ['id', 'ID', '主鍵', '系統ID', 0]);
            const rowCode = getVal(r, ['product_code', '產品編號', '編號', 3]);
            const rowRegion = getVal(r, ['region_code', '地區代碼', '地區', 1], 'TW').toUpperCase();

            const isIdMatch = (rowId === currentProductId) || (rowCode === currentProductId);
            const isRegionMatch = !currentRegion || (rowRegion === currentRegion);

            return isIdMatch && isRegionMatch;
        }) || productsData.find(r => {
            const rowId = getVal(r, ['id', 'ID', '主鍵', 0]);
            const rowCode = getVal(r, ['product_code', '產品編號', 3]);
            return rowId === currentProductId || rowCode === currentProductId;
        });

        if (!productRow) {
            renderNotFoundState();
            return;
        }

        const targetId = getVal(productRow, ['id', 'ID', 0]);
        const targetCode = getVal(productRow, ['product_code', '產品編號', 3]);
        const regionCode = getVal(productRow, ['region_code', '地區代碼', 1], 'TW').toUpperCase();

        // 2. 比對產品詳細資料表
        const detailRow = detailsData.find(r => {
            const pId = getVal(r, ['product_id', '產品ID', '產品編號', 0]);
            return (pId === targetId || pId === targetCode) && pId !== '';
        }) || {};

        // 3. 比對常見問題表
        const productFaqs = faqsData.filter(r => {
            const pId = getVal(r, ['product_id', '產品ID', '產品編號', 0]);
            const q = getVal(r, ['question', 'FAQ問題', '問題', 1]);
            const a = getVal(r, ['answer', 'FAQ解答', '解答', 2]);
            const isActive = getVal(r, ['is_active', '是否顯示', '狀態'], 'true');
            return (pId === targetId || pId === targetCode) && pId !== '' && q !== '' && a !== '' && (isActive.toLowerCase() === 'true' || isActive === 'Y');
        });

        // 4. 比對行銷多文案表 (重點修正：加入 content 與 title 雙重非空校驗)
        const productCopywritings = copywritingsData.filter(r => {
            const pId = getVal(r, ['product_id', '產品ID', '產品編號', 0]);
            const isActive = getVal(r, ['is_active', '是否啟用', '狀態'], 'true');
            const title = getVal(r, ['title', '文案標題', 1]);
            const content = getVal(r, ['content', '文案內文', 2]);
            const isMatch = (pId === targetId || pId === targetCode) && pId !== '';
            const hasContent = (title !== '' || content !== '');
            return isMatch && hasContent && (isActive.toLowerCase() === 'true' || isActive === 'Y');
        });

        // 5. 比對見證表
        const matchedTestimonialIds = pivotData.filter(r => {
            const pId = getVal(r, ['product_id', '產品ID', '產品編號', 0]);
            return (pId === targetId || pId === targetCode) && pId !== '';
        }).map(r => getVal(r, ['testimonial_id', '見證ID', 1])).filter(id => id !== '');

        const productTestimonials = testimonialsData.filter(r => {
            const tId = getVal(r, ['id', 'ID', '見證ID', 0]);
            const content = getVal(r, ['content', '見證內文', 2]);
            const status = getVal(r, ['status', '審核狀態', '狀態'], 'APPROVED');
            return tId !== '' && content !== '' && matchedTestimonialIds.includes(tId) && status === 'APPROVED';
        });

        // 6. 比對型態與次系列樣式
        const typeName = getVal(productRow, ['type_name', 'type_code', 'type_id', '產品型態', 7]);
        const subcategoryCode = getVal(productRow, ['subcategory_code', 'subcategory_id', '產品次系列', 8]);

        const typeStyle = findTypeStyle(typeName, typesData);
        const subcategoryStyle = findSubcategoryStyle(subcategoryCode, subcategoriesData);

        // 7. 開始渲染 DOM
        renderProductUIDetails({
            main: productRow,
            detail: detailRow,
            faqs: productFaqs,
            copywritings: productCopywritings,
            testimonials: productTestimonials,
            typeStyle: typeStyle,
            subcategoryStyle: subcategoryStyle,
            regionCode: regionCode
        });

        $('#loadingSpinner').addClass('d-none');
        $('#productContainer').removeClass('d-none');

    } catch (err) {
        console.error("讀取產品詳細資料失敗:", err);
        renderErrorState();
    }
}

// 尋找型態樣式
function findTypeStyle(typeName, typesData) {
    let style = { name: typeName || '保健', icon: 'fa-solid fa-tag', color: '#38bdf8', bg: 'rgba(10, 25, 19, 0.88)' };
    if (typesData && typesData.length > 0) {
        const found = typesData.find(r => {
            const code = getVal(r, ['type_code', '代碼', 1]);
            const name = getVal(r, ['name_zh', '中文名稱', 2]);
            return name === typeName || code === typeName;
        });
        if (found) {
            style.name = getVal(found, ['name_zh', '中文名稱', 2], typeName);
            style.icon = getVal(found, ['icon_class', 'Font Awesome Icon', 4], 'fa-solid fa-tag');
            style.color = getVal(found, ['text_color', '文字與外框顏色', 5], '#38bdf8');
            style.bg = getVal(found, ['bg_color', '標籤背景顏色', 6], 'rgba(10, 25, 19, 0.88)');
        }
    }
    return style;
}

// 尋找次系列樣式
function findSubcategoryStyle(subCode, subcategoriesData) {
    let style = { name: '次系列', icon: 'fa-solid fa-shield-halved', color: '#f59e0b', bg: 'rgba(10, 25, 19, 0.88)' };
    if (subcategoriesData && subcategoriesData.length > 0) {
        const found = subcategoriesData.find(r => getVal(r, ['subcategory_code', '次系列代碼', 1]) === subCode);
        if (found) {
            style.name = getVal(found, ['name_zh', '中文名稱', 3], '次系列');
            style.icon = getVal(found, ['icon_class', 'Font Awesome Icon', 5], 'fa-solid fa-shield-halved');
            style.color = getVal(found, ['text_color', '文字與外框顏色', 6], '#f59e0b');
            style.bg = getVal(found, ['bg_color', '標籤背景顏色', 7], 'rgba(10, 25, 19, 0.88)');
        }
    }
    return style;
}

// 渲染 DOM 主進入點
function renderProductUIDetails(data) {
    const main = data.main;
    const detail = data.detail;
    const faqs = data.faqs;
    const copywritings = data.copywritings;
    const testimonials = data.testimonials;
    const typeStyle = data.typeStyle;
    const subStyle = data.subcategoryStyle;
    const region = data.regionCode;

    // 基本屬性
    const productName = getVal(main, ['name', '產品名稱', 4]);
    const productShortName = getVal(main, ['short_name', '產品簡稱', 5]);
    const packageSpec = getVal(main, ['package_spec', '包裝規格', 8]);
    const price = getVal(main, ['price', '售價', 9], '0');
    const currency = getVal(main, ['currency', '幣別', 10], region === 'MY' ? 'MYR' : 'TWD');
    const svPoint = getVal(main, ['sv_point', '全球 SV', 11], '0');
    
    // 高低解析度圖片載入策略
    const lowResImg = getVal(main, ['primary_image_url', '圖片網址', 12]);
    const highResImg = getVal(detail, ['high_res_image_url', '高解析圖片網址', '詳細頁圖片'], lowResImg);

    // 內文區塊
    const detailedDescription = getVal(detail, ['detailed_description', '產品介紹', '產品簡介'], getVal(main, ['short_summary', '產品簡介', 6], '暫無詳細產品介紹資訊。'));
    const featuresFunctions = getVal(detail, ['features_and_functions', '特色與主要功能'], '總公司檢驗合格品質保證');
    const ingredients = getVal(detail, ['ingredients', '主要成分'], '詳見包裝標示');
    const usageScenarios = getVal(detail, ['usage_scenarios', '使用情境'], '每日建議適量補充');
    const certifications = getVal(detail, ['certifications', '認證'], '總公司檢驗合格');
    const officialSiteUrl = getVal(detail, ['official_site_url', '官方網站'], 'https://www.uvaco.com.tw');

    const launchDate = getVal(main, ['launch_date', '上市日期', 16], '已上市');

    // 填入主要文字
    $('#productTitle').text(productName);
    $('#productShortName').text(productShortName ? `(${productShortName})` : '');
    
    // 價格與 SV 格式化填入條列式
    const priceNum = Number(price);
    const formattedPrice = currency === 'MYR'? `RM ${priceNum.toLocaleString()}` : `NT$ ${priceNum.toLocaleString()}`;
    $('#productPrice').text(formattedPrice);
    $('#productSV').text(`${svPoint} SV`);
    $('#productSpec').text(packageSpec);

    // 標籤盒 (次系列與型態標籤) 渲染置於產品名稱上方
    const badgesHtml = `
        <span class="badge border px-3 py-2 me-1 mb-1" style="color: ${subStyle.color}; border-color: ${subStyle.color} !important; background-color: ${subStyle.bg};">
            <i class="${subStyle.icon}"></i> ${subStyle.name}
        </span>
        <span class="badge border px-3 py-2 me-1 mb-1" style="color: ${typeStyle.color}; border-color: ${typeStyle.color} !important; background-color: ${typeStyle.bg};">
            <i class="${typeStyle.icon}"></i> ${typeStyle.name}
        </span>
    `;
    $('#productTypeBadge').html(badgesHtml);

    // 短語標籤 (phrase_tags) 補上渲染
    const phraseTagsRaw = getVal(detail, ['phrase_tags', '短語標籤', '產品標籤']);
    if (phraseTagsRaw) {
        const tagList = phraseTagsRaw.split(/[,，]/).map(t => t.trim()).filter(t => t !== '');
        const tagsHtml = tagList.map(t => `
            <span class="badge bg-secondary-subtle text-light border border-secondary px-2 py-1 me-1 mb-1 fw-normal">
                <i class="fa-solid fa-hashtag"></i> ${t}
            </span>
        `).join('');
        $('#phraseTagsContainer').html(tagsHtml).removeClass('d-none');
    } else {
        $('#phraseTagsContainer').addClass('d-none');
    }

    // 高解析度圖片掛載與全域 Utils.handleImgError 容錯綁定
    const $img = $('#productImg');
    if ($img.length > 0) {
        $img.attr('src', highResImg).attr('alt', productName);
        $img.off('error').on('error', function() {
            if (lowResImg && this.src !== lowResImg) {
                this.src = lowResImg;
            } else {
                if (window.imgError) {
                    window.imgError(this, 'fa-solid fa-box-open', '350px');
                } else if (window.Utils && typeof Utils.handleImgError === 'function') {
                    Utils.handleImgError(this, 'fa-solid fa-box-open', '350px');
                }
            }
        });
    }

    // 填入內文
    $('#detailedDescription').html(formatParagraphs(detailedDescription));
    $('#featuresFunctions').html(formatParagraphs(featuresFunctions));
    $('#ingredients').html(formatParagraphs(ingredients));
    $('#usageScenarios').html(formatParagraphs(usageScenarios));

    $('#productID').text(getVal(main, ['product_code', '產品編號', 3]));
    $('#launchDate').text(launchDate);
    $('#certInfo').text(certifications);

    if (officialSiteUrl) {
        $('#officialBtn').attr('href', officialSiteUrl).removeClass('d-none');
    } else {
        $('#officialBtn').addClass('d-none');
    }

    // 渲染文案 (無資料徹底隱藏)
    renderCopywritings(copywritings);

    // 渲染見證與 FAQ (無資料徹底隱藏)
    renderTestimonials(testimonials);
    renderFAQAccordion(faqs);
}

// 格式化文字段落
function formatParagraphs(text) {
    if (!text) return '';
    return text.split('\n').map(p => p.trim()).filter(p => p !== '').map(p => `<p class="mb-2">${p}</p>`).join('');
}

// 渲染社群推廣文案區塊 (無文案自動隱藏)
function renderCopywritings(copywritings) {
    const $container = $('#copywritingContainer');
    const $tabs = $('#copywritingTabs');
    const $content = $('#copywritingTabContent');

    // 核心校驗：若無有效文案，強制設定 d-none 並終止執行！
    if (!copywritings || copywritings.length === 0) {
        $container.addClass('d-none');
        return;
    }

    let tabsHtml = '';
    let contentHtml = '';
    let validCount = 0;

    copywritings.forEach((copy, idx) => {
        const title = getVal(copy, ['title', '文案標題', 1], `文案方案 ${validCount + 1}`);
        const text = getVal(copy, ['content', '文案內文', 2]);
        const img = getVal(copy, ['image_url', '文案圖片', 3]);
        const targetAudience = getVal(copy, ['target_audience', '目標受眾', 5]);

        if (!text && !title) return; // 跳過無效內容

        const tabId = `copy-tab-${validCount}`;
        const panelId = `copy-panel-${validCount}`;
        const isActive = validCount === 0 ? 'active' : '';
        const isShowActive = validCount === 0 ? 'show active' : '';

        tabsHtml += `
            <li class="nav-item" role="presentation">
                <button class="nav-link ${isActive} btn-sm rounded-pill me-1 fw-bold" id="${tabId}" data-bs-toggle="tab" data-bs-target="#${panelId}" type="button" role="tab">
                    <i class="fa-solid fa-file-pen"></i> ${title}
                </button>
            </li>
        `;

        contentHtml += `
            <div class="tab-pane fade ${isShowActive} p-3 bg-dark-subtle rounded border border-secondary-subtle" id="${panelId}" role="tabpanel">
                ${targetAudience ? `<span class="badge bg-primary-subtle text-primary mb-2"><i class="fa-solid fa-bullseye"></i> 主打受眾：${targetAudience}</span>` : ''}
                <div class="copy-text-body text-light mb-3 lh-lg">${formatParagraphs(text)}</div>
                ${img ? `<div class="mb-3 text-center"><img src="${img}" class="img-fluid rounded shadow-sm" style="max-height: 250px;" onerror="window.imgError ? imgError(this, 'fa-solid fa-box-open', '350px') : (this.style.opacity='0')"></div>` : ''}
                <button onclick="copyToClipboard('${escapeJsText(text)}')" class="btn btn-outline-info btn-sm rounded-pill fw-bold">
                    <i class="fa-solid fa-copy"></i> 一鍵複製文案
                </button>
            </div>
        `;

        validCount++;
    });

    if (validCount > 0) {
        $tabs.html(tabsHtml);
        $content.html(contentHtml);
        $container.removeClass('d-none');
    } else {
        $container.addClass('d-none');
    }
}

// 轉義字串供 Copy 函數安全調用
function escapeJsText(text) {
    if (!text) return '';
    return text.replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

// 剪貼簿一鍵複製
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert('文案已成功複製到剪貼簿！');
        });
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('文案已成功複製到剪貼簿！');
    }
}

// 渲染使用者見證區塊 (無見證自動隱藏)
function renderTestimonials(testimonials) {
    const $container = $('#testimonialContainer');
    const $list = $('#testimonialList');

    if (!testimonials || testimonials.length === 0) {
        $container.addClass('d-none');
        return;
    }

    let html = '';
    testimonials.forEach(tRow => {
        const title = getVal(tRow, ['title', '見證標題', 1], '真實體驗分享');
        const content = getVal(tRow, ['content', '見證內文', 2]);
        const rating = parseInt(getVal(tRow, ['rating', '評等', 3], '5')) || 5;
        const authorName = getVal(tRow, ['author_name', '見證人', 4], '匿名體驗者');
        const authorIdentity = getVal(tRow, ['author_identity', '身份標籤', 6]);
        const isVerified = getVal(tRow, ['is_verified', '真術驗證', 7], 'false');

        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                starsHtml += `<i class="fa-solid fa-star text-warning me-1"></i>`;
            } else {
                starsHtml += `<i class="fa-regular fa-star text-muted me-1"></i>`;
            }
        }

        html += `
            <div class="col-md-6 col-12">
                <div class="card h-100 bg-dark text-light border border-secondary-subtle p-3 shadow-sm">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="rating-stars">${starsHtml}</div>
                        ${isVerified.toLowerCase() === 'true' ? `<span class="badge bg-success-subtle text-success border border-success small"><i class="fa-solid fa-circle-check"></i> 已驗證體驗者</span>` : ''}
                    </div>
                    <h6 class="fw-bold text-light mb-2">${title}</h6>
                    <p class="small text-light-subtle mb-3 flex-grow-1 lh-relaxed">${content}</p>
                    <div class="d-flex justify-content-between align-items-center mt-auto pt-2 border-top border-secondary-subtle">
                        <span class="small fw-bold text-info"><i class="fa-solid fa-user me-1"></i> ${authorName}</span>
                        ${authorIdentity ? `<span class="badge bg-secondary-subtle text-muted">${authorIdentity}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    $list.html(html);
    $container.removeClass('d-none');
}

// 渲染 FAQ 常見問題 (無 FAQ 自動隱藏)
function renderFAQAccordion(faqs) {
    const $faqContainer = $('#faqContainer');
    const $faqAccordion = $('#faqAccordion');

    if (!$faqAccordion.length) return;

    if (!faqs || faqs.length === 0) {
        $faqContainer.addClass('d-none');
        return;
    }

    let accordionHtml = '';
    faqs.forEach((faqRow, idx) => {
        const q = getVal(faqRow, ['question', 'FAQ問題', '問題', 1]);
        const a = getVal(faqRow, ['answer', 'FAQ解答', '解答', 2]);
        const collapseId = `faq-collapse-${idx}`;
        const headingId = `faq-heading-${idx}`;

        if (q && a) {
            accordionHtml += `
                <div class="accordion-item bg-dark text-light border border-secondary-subtle mb-2 rounded overflow-hidden">
                    <h2 class="accordion-header" id="${headingId}">
                        <button class="accordion-button collapsed bg-dark text-light shadow-none" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                            <i class="fa-solid fa-circle-question text-info me-2"></i> ${q}
                        </button>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse" aria-labelledby="${headingId}" data-bs-parent="#faqAccordion">
                        <div class="accordion-body bg-dark-subtle text-light small border-top border-secondary-subtle lh-lg">
                            <i class="fa-solid fa-comment-dots text-success me-2"></i> ${a}
                        </div>
                    </div>
                </div>
            `;
        }
    });

    if (accordionHtml) {
        $faqAccordion.html(accordionHtml);
        $faqContainer.removeClass('d-none');
    } else {
        $faqContainer.addClass('d-none');
    }
}

// 找不到產品狀態處理
function renderNotFoundState() {
    $('#loadingSpinner').addClass('d-none');
    $('#productContainer').html(`
        <div class="content-card p-5 text-center text-muted border border-secondary-subtle rounded">
            <i class="fa-solid fa-circle-exclamation fs-1 text-warning mb-3"></i>
            <h4 class="text-light fw-bold mb-2">未找到指定的產品資訊</h4>
            <p class="mb-4">請確認產品編號或地區參數是否正確。</p>
            <button onclick="closeOrReturn()" class="btn btn-primary fw-bold">
                <i class="fa-solid fa-arrow-left"></i> 返回產品列表
            </button>
        </div>
    `).removeClass('d-none');
}

// 載入錯誤狀態處理
function renderErrorState() {
    $('#loadingSpinner').addClass('d-none');
    $('#productContainer').html(`
        <div class="content-card p-5 text-center text-muted border border-danger-subtle rounded">
            <i class="fa-solid fa-triangle-exclamation fs-1 text-danger mb-3"></i>
            <h4 class="text-light fw-bold mb-2">雲端資料同步發生錯誤</h4>
            <p class="mb-4">無法從試算表讀取詳細資料，請稍後重試。</p>
            <button onclick="window.location.reload()" class="btn btn-outline-primary fw-bold">
                <i class="fa-solid fa-rotate-right"></i> 重新載入頁面
            </button>
        </div>
    `).removeClass('d-none');
}