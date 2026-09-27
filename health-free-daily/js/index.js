// ==========================================================================
// 1. Google 雲端試算表設定與全域狀態管理 (State Management)
// ==========================================================================
const SPREADSHEET_ID = APP_CONFIG.SHEETS.SYS; // 雲端試算表 ID
const SHEET_NAME = '選單架構'; // 工作表名稱
const CURRENT_APP_TRACK = '公開版'; // 當前系統版本：'公開版' | '團隊版' | '核心版'

const SESSION_NAME = 'ray_team_last_page_public'; // Session 快取鍵名

// 語系狀態管理 (優先自快取讀取，預設繁中)
let currentLang = localStorage.getItem('ray_team_lang_pref') || 'zh-TW';
document.documentElement.lang = currentLang;

let menuTreeMap = new Map();
let cachedMenuItems = []; // 快取試算表選單資料，避免語系切換時重複發送請求
let currentPageUrl = 'home.html';
let isInitialized = false;

// 公開版專屬靜態 UI 雙語字典
const I18N_SHELL = {
    'zh-TW': {
        pageTitle: '健康生活與自由日常',
        brand: '健康生活與自由日常',
        versionPublic: '公開版',
        versionTeam: '團隊版',
        versionHub: '核心版',
        versionCurrentBadge: '當前',
        sidebarLangBtn: 'English',
        sitemap: '網站地圖 (Site Map)',
        disclaimer: '網站聲明',
        copyright: "© 2026 榮祥團隊 Ray's Team | 本網站由榮祥團隊獨立運營，非葡眾官方網站 | ",
        menuLoading: '正在載入選單...'
    },
    'en': {
        pageTitle: 'Health & Freedom Daily',
        brand: 'Health & Freedom Daily',
        versionPublic: 'Public',
        versionTeam: 'Team',
        versionHub: 'Core',
        versionCurrentBadge: 'Current',
        sidebarLangBtn: '繁體中文',
        sitemap: 'Site Map',
        disclaimer: 'Disclaimer',
        copyright: "© 2026 Ray's Team | Independently operated by Ray's Team, not the official UVACO website | ",
        menuLoading: 'Loading menu...'
    }
};

/**
 * 依據當前語系動態解析實際子頁面路徑 (中文: xxx.html | 英文: en/xxx.html)
 */
function getResolvedPageUrl(pageUrl) {
    if (!pageUrl || pageUrl === '#' || pageUrl.startsWith('http://') || pageUrl.startsWith('https://')) {
        return pageUrl;
    }
    const cleanUrl = pageUrl.replace(/^en\//, '');
    return (currentLang === 'en') ? `en/${cleanUrl}` : cleanUrl;
}

/**
 * 依當前語系取得選單標題 (支援 titleEn 自動 Fallback 至 titleZh)
 */
function getMenuTitle(item) {
    if (currentLang === 'en' && item.titleEn && item.titleEn.trim() !== '') {
        return item.titleEn.trim();
    }
    return item.titleZh;
}

/**
 * 更新外框所有靜態文字節點 (雙語即時響應)
 * 遵循 4 個空白縮排規範
 */
function updatePortalShellI18n() {
    const t = I18N_SHELL[currentLang] || I18N_SHELL['zh-TW'];

    // 1. 網頁標題與品牌 Logo
    document.title = t.brand;
    $('#brandLogoText').text(t.brand);

    // 2. 側邊欄切換語言與登出按鈕
    $('#sidebarLangText').text(t.sidebarLangBtn);
    $('#sidebarLogoutText').text(t.logout);

    // 3. 網站地圖標題與頁尾聲明文字
    $('#sitemapTitleText').text(t.sitemap);
    $('#copyrightNoticeText').text(t.copyright);
    $('#disclaimerLinkText').text(t.disclaimer);

    // 4. 版本切換下拉選單各按鈕文字
    $('#publicButton .version-btn-text').text(t.versionPublic);
    $('#teamButton .version-btn-text').text(t.versionTeam);
    $('#hubButton .version-btn-text').text(t.versionHub);

    // 5. 重新校準當前版本按鈕外觀與徽章
    refreshVersionDropdownLabel();
}

// ==========================================================================
// 2. 系統生命週期與事件初始化
// ==========================================================================
window.addEventListener('AppReady', async () => {
    await initApp();
});

// 監聽瀏覽器上一頁 / 下一頁（Hash 變更）事件
window.addEventListener('hashchange', function () {
    const hashPage = sessionStorage.getItem(SESSION_NAME) + '.html';
    if (hashPage) {
        const currentIframeSrc = $('#portal-subpage-frame').attr('src');
        if (currentIframeSrc !== hashPage) {
            loadPage(hashPage);
        }
    }
});

async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    initSidebarToggle();
    initDesktopSitemapObserver();
    initIframeResizeListener();
    initBackToTop();
    initLogoutModal();
    versionSwitch();
    updatePortalShellI18n(); // 初始化外框雙語字串

    // 優先自 sessionStorage 或網址讀取上次瀏覽頁面
    const savedLastPage = sessionStorage.getItem(SESSION_NAME);
    const initialPage = (savedLastPage || 'home') + '.html';
    currentPageUrl = initialPage.replace(/^en\//, '');
    loadPage(currentPageUrl);

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetMenu();
    } else {
        showErrorNotice('未設定 Google 試算表 ID，無法讀取選單架構資料！');
    }
}

// ==========================================================================
// 3. PapaParse + GViz 資料讀取引擎 (表 sys_menus 讀取與解耦)
// ==========================================================================
async function fetchGoogleSheetMenu() {
    try {
        const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP 通訊錯誤狀態碼：${res.status}`);
        const text = await res.text();

        const parsed = Papa.parse(text, {
            header: false,
            skipEmptyLines: true
        });

        const rawRows = parsed.data.slice(1); // 略過第一行標題列
        if (!rawRows || rawRows.length === 0) {
            throw new Error(`試算表『${SHEET_NAME}』工作表中未讀取到任何有效數據。`);
        }

        const menuItems = parseMenusTable(rawRows);
        cachedMenuItems = menuItems; // 存入全域記憶體快取
        processAndRenderMenu(menuItems);
    } catch (err) {
        console.error('Google 試算表選單載入失敗:', err);
        processAndRenderMenu([]);
        showErrorNotice('無法載入選單資料，請確認網路連線或試算表共用權限！');
    }
}

/**
 * 依據 sys_menus 17 欄位定義進行精準 0-based 欄位索引映射
 * @param {Array} rows 試算表原始數據陣列
 * @returns {Array} 清洗轉換後的選單物件陣列
 */
function parseMenusTable(rows) {
    return rows.map((r, idx) => {
        const isActiveRaw = getVal(r, 9, 'Y').toUpperCase();
        const isActive = (isActiveRaw === 'Y' || isActiveRaw === 'TRUE' || isActiveRaw === '1' || isActiveRaw === '是');

        return {
            id: getVal(r, 0, `M_${String(idx + 1).padStart(4, '0')}`),
            appTrack: getVal(r, 1, '公開版'),
            titleZh: getVal(r, 2, '未命名選單'),
            titleEn: getVal(r, 3, ''),
            level: parseInt(getVal(r, 4, '0'), 10) || 0,
            parentId: getVal(r, 5, 'root'),
            sortOrder: parseInt(getVal(r, 6, String((idx + 1) * 10)), 10) || 0,
            link: getVal(r, 7, '#'),
            icon: getVal(r, 8, 'fa-solid fa-circle'),
            isActive: isActive,
            devStatus: getVal(r, 10, '已完成'),
            relatedTables: getVal(r, 11, ''),
            functionDesc: getVal(r, 12, '')
        };
    }).filter(item => {
        const isTrackMatch = (item.appTrack === CURRENT_APP_TRACK || item.appTrack === '全版本');
        return item.id !== '' && item.titleZh !== '未命名選單' && item.isActive && isTrackMatch;
    }).sort((a, b) => a.sortOrder - b.sortOrder);
}

// ==========================================================================
// 4. 樹狀結構處理與側邊欄渲染 (Adjacency List + Bootstrap 5 RWD)
// ==========================================================================
function processAndRenderMenu(items) {
    menuTreeMap.clear();

    items.forEach(item => {
        const pid = item.parentId || 'root';
        if (!menuTreeMap.has(pid)) {
            menuTreeMap.set(pid, []);
        }
        menuTreeMap.get(pid).push(item);
    });

    const $menuContainer = $('#dynamicMenuContainer');
    $menuContainer.empty().append(buildRecursiveMenuHtml('root', 0));
    renderSitemapFooter();

    // 綁定父層收折點擊事件
    $('.parent-toggle').off('click').on('click', function (e) {
        e.preventDefault();
        const targetId = $(this).data('target');
        const $target = $(`#${targetId}`);
        const isAlreadyOpen = $target.hasClass('show');

        // 1. 關閉其他非當前父級之展開選單
        $('.submenu-container.show')
            .not($target)
            .not($target.parents('.submenu-container'))
            .slideUp(200)
            .removeClass('show');

        // 2. 將其他選單箭頭轉回原位
        $('.parent-toggle')
            .not(this)
            .not($(this).parents('.nav-item').children('.parent-toggle'))
            .find('.submenu-arrow')
            .removeClass('fa-rotate-180');

        // 3. 切換當前選單狀態
        if (isAlreadyOpen) {
            $target.slideUp(200).removeClass('show');
            $(this).find('.submenu-arrow').first().removeClass('fa-rotate-180');
        } else {
            $target.slideDown(200).addClass('show');
            $(this).find('.submenu-arrow').first().addClass('fa-rotate-180');
        }
    });

    setActiveMenuItem(currentPageUrl);
}

/**
 * 依據開發維護狀態產生 Bootstrap 5 徽章 HTML
 * @param {string} status 狀態字串 ('測試中' | '修復中' | '已完成')
 * @returns {string} Badge HTML
 */
function getDevStatusBadgeHtml(status) {
    if (status === '測試中') {
        return '<span class="badge badge-warning" style="font-size: 0.6rem; padding: 0.25em 0.5em;">測試中</span>';
    } else if (status === '修復中') {
        return '<span class="badge badge-danger" style="font-size: 0.6rem; padding: 0.25em 0.5em;">修復中</span>';
    }
    return '';
}

/**
 * 遞歸生成無限層級選單 HTML (支援排序與測試/修復中 Badge 顯示)
 */
function buildRecursiveMenuHtml(parentId, depth) {
    const children = menuTreeMap.get(parentId) || [];
    if (children.length === 0) return '';

    // 依據「選單排序」由小至大精準排序
    children.sort((a, b) => a.sortOrder - b.sortOrder);

    const ulClass = (depth === 0) ? 'sidebar-menu' : 'submenu-container';
    const ulId = (depth > 0) ? `id="submenu-${parentId}"` : '';

    let html = `<ul class="${ulClass}" ${ulId}>`;

    children.forEach(item => {
        if (item.level === -1 || item.parentId === 'hide') return;

        const subChildren = menuTreeMap.get(item.id) || [];
        const hasChildren = subChildren.length > 0;
        const isExternal = item.link.startsWith('http://') || item.link.startsWith('https://');
        const badgeHtml = getDevStatusBadgeHtml(item.devStatus);

        html += `<li class="nav-item">`;

        if (hasChildren) {
            html += `
                <a href="#" class="nav-item-link parent-toggle" data-target="submenu-${item.id}">
                    <div class="d-flex align-items-center gap-2 flex-grow-1">
                        <span class="menu-icon-box"><i class="${item.icon}"></i></span>
                        <span class="menu-text"> ${getMenuTitle(item)}</span>
                        ${badgeHtml}
                    </div>
                    <i class="fa-solid fa-chevron-down submenu-arrow small"></i>
                </a>
                ${buildRecursiveMenuHtml(item.id, depth + 1)}
            `;
        } else {
            const targetAttr = isExternal ? 'target="_blank"' : '';
            const clickHandler = isExternal ? '' : `onclick="loadPage('${item.link}'); return false;"`;

            html += `
                <a href="${item.link}" ${targetAttr} ${clickHandler} class="nav-item-link">
                    <div class="d-flex align-items-center gap-2 flex-grow-1">
                        <span class="menu-icon-box"><i class="${item.icon}"></i></span>
                        <span class="menu-text"> ${getMenuTitle(item)}</span>
                        ${badgeHtml}
                    </div>
                    ${isExternal ? '<i class="fa-solid fa-arrow-up-right-from-square small"></i>' : ''}
                </a>
            `;
        }

        html += `</li>`;
    });

    html += `</ul>`;
    return html;
}

/**
 * 自動高亮選單項目並展開所屬父層容器
 */
function setActiveMenuItem(pageUrl) {
    if (!pageUrl || pageUrl === '#') return;

    $('#dynamicMenuContainer .nav-item-link').removeClass('active');

    const $targetLink = $('#dynamicMenuContainer .nav-item-link').filter(function () {
        const href = $(this).attr('href');
        const onclickAttr = $(this).attr('onclick') || '';
        return href === pageUrl || onclickAttr.includes(`'${pageUrl}'`);
    });

    if ($targetLink.length) {
        $targetLink.addClass('active');

        const $parentSubmenus = $targetLink.parents('.submenu-container');
        if ($parentSubmenus.length) {
            $parentSubmenus.addClass('show').css('display', 'block');

            $parentSubmenus.each(function () {
                const submenuId = $(this).attr('id');
                $(`.parent-toggle[data-target="${submenuId}"]`)
                    .find('.submenu-arrow')
                    .addClass('fa-rotate-180');
            });
        }
    }
}

// ==========================================================================
// 5. iFrame 頁面切換與 JS 作用域完全隔離引擎
// ==========================================================================
function loadPage(pageUrl) {
    if (!pageUrl || pageUrl === '#') return;

    // 1. 純化為基礎檔名 (去除 en/ 前綴)，供狀態記憶與選單高亮
    const basePageUrl = pageUrl.replace(/^en\//, '');
    currentPageUrl = basePageUrl;
    $('#portalSidebar').removeClass('mobile-open');

    setActiveMenuItem(basePageUrl);

    let page = basePageUrl.split('.')[0];
    if (page) {
        sessionStorage.setItem(SESSION_NAME, page);
    }

    // 2. 依當前語系動態解析實際子頁面路徑 (中文: xxx.html | 英文: en/xxx.html)
    const targetSrc = getResolvedPageUrl(basePageUrl);

    // 3. 渲染 iFrame 容器
    const $container =$('#page-content-container');
    $container.html(`
        <iframe id="portal-subpage-frame" 
                class="seamless-iframe" 
                src="${targetSrc}" 
                scrolling="no" 
                title="Subpage Content">
        </iframe>
    `);

    // 4. 非同步偵測子頁面存在狀態
    $.ajax({
        url: targetSrc,
        type: 'GET',
        dataType: 'html',
        success: function () {
            // 子頁面載入成功
        },
        error: function () {
            const isEn = (currentLang === 'en');
            const noticeTitle = isEn ? 'Under Construction, Stay Tuned!' : '本頁面建置中，敬請期待！';
            const btnBackText = isEn ? 'Back to Home' : '返回首頁';

            $('#page-content-container').html(`
                <div class="card card-modal bg-dark border-green text-light p-4 shadow-lg">
                    <div class="card-body text-center">
                        <i class="fa-solid fa-hammer text-green display-4 mb-3"></i>
                        <h3>${noticeTitle}</h3>
                        <button class="btn btn-outline-green mt-2" onclick="loadPage('home.html')">
                            <i class="fa-solid fa-house me-1"></i>${btnBackText}
                        </button>
                    </div>
                </div>
            `);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    const frame = document.getElementById('portal-subpage-frame');
    if (frame) {
        frame.onload = function () {
            autoResizeIframe(frame);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
    }
}

/**
 * 動態同步 iFrame 實際內容高度（全面支援多 section、無 main、DataTable 非同步長出之頁面）
 * @param {HTMLIFrameElement} frame 
 */
function autoResizeIframe(frame) {
    try {
        if (!frame || !frame.contentWindow || !frame.contentWindow.document) return;

        const doc = frame.contentWindow.document;
        const win = frame.contentWindow;

        const calculateRealContentHeight = () => {
            // 1. 若頁面具備語意化 <main> 容器，優先以 <main> 幾何高度為基準
            const mainEl = doc.querySelector('main');
            if (mainEl) {
                const rect = mainEl.getBoundingClientRect();
                const style = win.getComputedStyle(mainEl);
                const mt = parseFloat(style.marginTop) || 0;
                const mb = parseFloat(style.marginBottom) || 0;
                return Math.ceil(rect.height + mt + mb + 20);
            }

            // 2. 若頁面無 <main>（直接使用多個 <section>）：遍歷計算所有非 Modal 元素的真實底部 (Max Bottom)
            let maxBottom = 0;
            const children = doc.body.children;
            for (let i = 0; i < children.length; i++) {
                const el = children[i];
                // 排除 Bootstrap Modal 遮罩彈窗與隱藏元素
                if (el.classList.contains('modal') || el.style.display === 'none') continue;

                const rect = el.getBoundingClientRect();
                const style = win.getComputedStyle(el);
                const mb = parseFloat(style.marginBottom) || 0;
                const bottom = el.offsetTop + rect.height + mb;
                if (bottom > maxBottom) {
                    maxBottom = bottom;
                }
            }

            // 3. 雙軌回退：取實體佔位 maxBottom 與 scrollHeight 的安全最大值
            const scrollH = doc.body.scrollHeight || 0;
            const finalH = Math.max( maxBottom + 0, scrollH);
            return finalH > 100 ? finalH : 800; // 最低安全高度 800px
        };

        const syncHeight = () => {
            const targetHeight = calculateRealContentHeight();
            frame.style.height = targetHeight + 'px';
        };

        // 首次載入立即計算
        syncHeight();

        // 監聽子頁面整體的 Resize 變動（支援 RWD 視窗縮放）
        if (win.ResizeObserver) {
            if (frame._contentResizeObserver) {
                frame._contentResizeObserver.disconnect();
            }
            const observer = new win.ResizeObserver(() => {
                win.requestAnimationFrame(syncHeight);
            });
            observer.observe(doc.body);
            frame._contentResizeObserver = observer;
        }

        // 監聽子頁面 DOM 節點增刪（專門捕獲 PapaParse 載入完畢與 DataTable.js 生成瞬間）
        if (win.MutationObserver && !frame._contentMutationObserver) {
            const mutObserver = new win.MutationObserver(() => {
                win.requestAnimationFrame(syncHeight);
            });
            mutObserver.observe(doc.body, { childList: true, subtree: true, attributes: true });
            frame._contentMutationObserver = mutObserver;
        }

        // 監聽圖片與外部字型載入完畢後的補償計算
        win.addEventListener('load', syncHeight);

    } catch (e) {
        console.warn('iFrame 跨網域高度同步受限，採用安全預設高度:', e);
        frame.style.height = '1000px';
    }
}

function initIframeResizeListener() {
    $(window).on('resize', function () {
        const frame = document.getElementById('portal-subpage-frame');
        if (frame) {
            autoResizeIframe(frame);
        }
    });
}

// ==========================================================================
// 6. 側邊欄互動與 RWD 裝置響應控制器
// ==========================================================================
function initSidebarToggle() {
    $('#sidebarToggle').on('click', function () {
        if ($(window).width() >= 992) {
            $('#portalSidebar').toggleClass('collapsed');
            $('#portalWrapper').toggleClass('sidebar-collapsed');
        } else {
            $('#portalSidebar').toggleClass('mobile-open');
        }
    });

    $(document).on('click', function (e) {
        if ($(window).width() < 992) {
            if (!$(e.target).closest('#portalSidebar, #sidebarToggle').length) {
                $('#portalSidebar').removeClass('mobile-open');
            }
        }
    });

    $('#portalSidebar').on('mouseleave', function () {
        if ($(this).hasClass('collapsed')) {
            $(this).find('.submenu-container.show').slideUp(150).removeClass('show');
            $(this).find('.submenu-arrow').removeClass('fa-rotate-180');
        }
    });

    $(window).on('resize', function () {
        if ($(window).width() >= 992) {
            $('#portalSidebar').removeClass('mobile-open');
        } else {
            $('#portalSidebar').removeClass('collapsed');
            $('#portalWrapper').removeClass('sidebar-collapsed');
        }
    });
}

// ==========================================================================
// 7. 網站地圖 (Sitemap) 與頁尾 Observer 控制器
// ==========================================================================
/**
 * 電腦版 Sitemap 頁尾 (同步支援選單排序)
 */
function renderSitemapFooter() {
    const $sitemapContainer = $('#sitemapContainer');
    $sitemapContainer.empty();

    const rootNodes = (menuTreeMap.get('root') || []).sort((a, b) => a.sortOrder - b.sortOrder);

    rootNodes.forEach(root => {
        if (root.level === -1 || root.parentId === 'hide') return;

        const children = (menuTreeMap.get(root.id) || []).sort((a, b) => a.sortOrder - b.sortOrder);
        const iconClass = root.icon || 'fa-solid fa-circle-dot';

        let sitemapBlockHtml = `
            <div class="col-lg-3 col-md-4">
                <div class="fw-bold text-primary mb-2">
                    <i class="${iconClass} me-1"></i>${getMenuTitle(root)}
                </div>`;

        if (children.length > 0) {
            sitemapBlockHtml += `<ul class="sitemap-list">`;
            children.forEach(child => {
                if (child.level === -1 || child.parentId === 'hide') return;

                const childExternal = child.link.startsWith('http://') || child.link.startsWith('https://');
                const targetAttr = childExternal ? 'target="_blank"' : '';
                const clickHandler = childExternal ? '' : `onclick="loadPage('${child.link}'); return false;"`;

                sitemapBlockHtml += `
                    <li>
                        <a href="${child.link}" ${targetAttr} ${clickHandler}>
                            <i class="${child.icon} me-1"></i>${getMenuTitle(child)}
                        </a>
                    </li>`;
            });
            sitemapBlockHtml += `</ul>`;
        }

        sitemapBlockHtml += `</div>`;
        $sitemapContainer.append(sitemapBlockHtml);
    });
}

function initDesktopSitemapObserver() {
    if (!('IntersectionObserver' in window)) {
        $('#desktopSitemap').addClass('visible');
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                $('#desktopSitemap').addClass('visible');
            }
        });
    }, { threshold: 0.2 });

    const footerTarget = document.getElementById('portalFooter');
    if (footerTarget) {
        observer.observe(footerTarget);
    }
}

// ==========================================================================
// 8. 輔助功能模組 (回到頂端、登出確認、三軌版本切換)
// ==========================================================================
function initBackToTop() {
    const $backToTopBtn = $('#backToTopBtn');

    $(window).on('scroll', function () {
        if ($(this).scrollTop() > 300) {
            $backToTopBtn.addClass('show');
        } else {
            $backToTopBtn.removeClass('show');
        }
    });

    $backToTopBtn.on('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function initLogoutModal() {
    $('#confirmLogoutBtn').on('click', function () {
        $('#logoutConfirmModal').modal('hide');

        if (typeof window.uvacoLogout === 'function') {
            window.uvacoLogout();
        } else {
            console.warn('未找到 window.uvacoLogout 登出處理函式');
        }
    });
}

function versionSwitch() {
    const currentPath = window.location.pathname;
    const $mainBtn =$('#versionDropdownBtn');
    const $versionBtns =$('.open-version-btn');

    const isEn = (currentLang === 'en');

    // 官方英文對齊字典
    const i18nTrack = {
        public: isEn ? 'Public' : '公開版',
        team:   isEn ? 'Team' : '團隊版',
        hub:    isEn ? 'Core' : '核心版',
        badge:  isEn ? 'Current' : '當前'
    };

    // Google OAuth 白名單安全鑑權 (公開版訪客不具備 Hub 權限時自動隱藏)
    const rawSession = localStorage.getItem('ray_team_auth_session');
    let hasHubAccess = false;

    if (rawSession) {
        try {
            const sessionData = JSON.parse(rawSession);
            const now = new Date().getTime();
            const hubPerm = sessionData.permissions ? sessionData.permissions['hub'] : null;

            if (sessionData.expireAt && sessionData.expireAt > now && 
                (hubPerm === '編輯' || hubPerm === '檢視') && sessionData.signature) {
                hasHubAccess = true;
            }
        } catch (e) {
            console.warn('[versionSwitch] 解析 Auth Session 發生異常:', e);
        }
    }

    if (hasHubAccess) {
        $('#hubButton').show();
    } else {
        $('#hubButton').hide();
    }

    // 更新下拉選單按鈕文字 (保持圖示不丟失)
    const updateBtnText = ($btn, text) => {
        const $textSpan =$btn.find('.version-btn-text');
        if ($textSpan.length) {$textSpan.text(text);
        } else {
            const $icon =$btn.find('i').first();
            $btn.empty().append($icon).append(` <span class="version-btn-text">${text}</span>`);
        }
    };

    updateBtnText($('#publicButton'), i18nTrack.public);
    updateBtnText($('#teamButton'), i18nTrack.team);
    updateBtnText($('#hubButton'), i18nTrack.hub);

    // 比對當前路徑 (公開版預設匹配 publicButton)
    let matchedBtn = null;
    $versionBtns.each(function () {
        const rawUrl = $(this).attr('data-url') || '';
        const pathKey = rawUrl.replace(/\.\./g, '');
        if (pathKey && currentPath.includes(pathKey)) {
            matchedBtn = this;
        }
    });

    if (!matchedBtn && $versionBtns.length > 0) {
        matchedBtn = document.getElementById('publicButton') || $versionBtns[0];
    }

    $versionBtns.removeClass('active').find('.badge-current-mark').remove();

    if (matchedBtn) {
        const $matched = $(matchedBtn);$matched.addClass('active');

        // 提取主題色 Token (公開版預設為 btn-green-subtle -> green)
        const colorBtnClass = Array.from(matchedBtn.classList).find(c => c.startsWith('btn-') && c.endsWith('-subtle')) || 'btn-green-subtle';
        const colorName = colorBtnClass.split('-')[1] || 'green';
        const colorTextClass = `text-${colorName}`;

        const badgeHtml = `<span class="badge badge-white shadow-sm ms-2 ${colorTextClass} badge-current-mark">${i18nTrack.badge}</span>`;
        //$matched.append(badgeHtml);

        if ($mainBtn.length) {$mainBtn.attr('class', function (i, currentClasses) {
                return currentClasses.replace(/btn-[a-z]+-subtle/g, '').trim() + ` ${colorBtnClass}`;
            });

            const iconClass = $matched.find('i').attr('class') || 'fa-solid fa-leaf';
            const labelText = $matched.find('.version-btn-text').text();

            $mainBtn.html(`<i class="${iconClass}"></i> <span id="versionCurrentText">${labelText}</span>`);
        }
    }

    // 防止事件重複綁定
    $versionBtns.off('click.versionSwitch').on('click.versionSwitch', function () {
        const url = $(this).attr('data-url');
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    });
}

function showErrorNotice(msg) {
    if (typeof AppDialog !== 'undefined' && AppDialog.alert) {
        AppDialog.alert(msg, {
            title: '系統提示',
            icon: 'fa-solid fa-circle-exclamation text-danger'
        });
    } else {
        alert(msg);
    }
}

/**
 * 門戶原頁無刷新切換語系控制器 (縮排 4 個空白)
 */
function switchLanguage() {
    // 1. 切換語系狀態並寫入 LocalStorage 快取
    currentLang = (currentLang === 'en') ? 'zh-TW' : 'en';
    localStorage.setItem('ray_team_lang_pref', currentLang);
    document.documentElement.lang = currentLang;

    // 2. 即時更新外框靜態文字與按鈕外觀
    updatePortalShellI18n();
    versionSwitch();

    // 3. 0 毫秒重繪選單與網站地圖 (直接消耗記憶體快取)
    if (cachedMenuItems.length > 0) {
        processAndRenderMenu(cachedMenuItems);
    }

    // 4. 原頁使用現有 loadPage 加載對應語系之子頁面
    loadPage(currentPageUrl);
}

/**
 * 即時更新外框所有靜態文字節點 (保持圖示與半形空格)
 */
function updatePortalShellI18n() {
    const t = I18N_SHELL[currentLang] || I18N_SHELL['zh-TW'];

    // 1. 網頁標題與品牌 Logo
    document.title = t.brand;
    $('#brandLogoText').text(t.brand);

    // 2. 側邊欄切換語言與登出按鈕
    $('#sidebarLangText').text(t.sidebarLangBtn);
    $('#sidebarLogoutText').text(t.logout);

    // 3. 網站地圖標題與頁尾聲明文字
    $('#sitemapTitleText').text(t.sitemap);
    $('#copyrightNoticeText').text(t.copyright);
    $('#disclaimerLinkText').text(t.disclaimer);

    // 4. 版本切換下拉選單各按鈕文字
    $('#publicButton .version-btn-text').text(t.versionPublic);
    $('#teamButton .version-btn-text').text(t.versionTeam);
    $('#hubButton .version-btn-text').text(t.versionHub);

    // 5. 重新校準當前版本按鈕外觀與徽章
    refreshVersionDropdownLabel();
}

/**
 * 刷新版本主按鈕的標籤
 */
function refreshVersionDropdownLabel() {
    const t = I18N_SHELL[currentLang] || I18N_SHELL['zh-TW'];
    const currentPath = window.location.pathname;
    const mainBtn = document.getElementById('versionDropdownBtn');
    const versionBtns = document.querySelectorAll('.open-version-btn');

    let matchedBtn = null;
    versionBtns.forEach(btn => {
        const rawUrl = btn.getAttribute('data-url');
        const pathKey = rawUrl.replace(/\.\./g, '');
        if (pathKey && currentPath.includes(pathKey)) {
            matchedBtn = btn;
        }
    });

    if (!matchedBtn && versionBtns.length > 0) {
        matchedBtn = versionBtns[0];
    }

    if (matchedBtn && mainBtn) {
        // 清理所有按鈕上的舊徽章
        $('.open-version-btn .badge-current-mark').remove();
        matchedBtn.classList.add('active');

        // 動態生成徽章
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'badge badge-white shadow-sm ms-2 badge-current-mark';
        badgeSpan.textContent = t.versionCurrentBadge;

        const colorBtnClass = Array.from(matchedBtn.classList).find(c => c.startsWith('btn-') && c.endsWith('-subtle'));
        const colorTextClass = 'text-' + (colorBtnClass ? colorBtnClass.split('-')[1] : 'blue');
        if (colorBtnClass) {
            mainBtn.className = mainBtn.className.replace(/btn-[a-z]+-subtle/g, colorBtnClass);
            badgeSpan.className = badgeSpan.className.replace(/text-[a-z]+/g, colorTextClass);
        }

        // 取得匹配按鈕內的圖示與動態文字
        const iconHtml = $(matchedBtn).find('i').prop('outerHTML');
        const textVal = $(matchedBtn).find('.version-btn-text').text();
        mainBtn.innerHTML = `${iconHtml} <span id="versionCurrentText">${textVal}</span>`;
        //matchedBtn.appendChild(badgeSpan);
    }
}