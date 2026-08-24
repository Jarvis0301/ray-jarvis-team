// 設定 Google 試算表 CSV 發布連結
const SPREADSHEET_ID = '1nY-6mo9trXLMwkRGOqdvBU_va75DmsxIONIraMtTv2k';
const SHEET_NAME = '公開版';

const SESSION_NAME = 'ray_team_last_page_public';

let menuTreeMap = new Map();

let currentPageUrl = 'home.html'; // ✨ 記錄當前頁面名稱

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function () {
    initSidebarToggle();
    fetchGoogleSheetMenu();
    initDesktopSitemapObserver();
    initIframeResizeListener();
    initBackToTop();
    initLogoutModal();
    versionSwitch();

    // ✨ 優先讀取網址列 Hash 或 sessionStorage，若無才回到 home.html
    const savedLastPage = sessionStorage.getItem(SESSION_NAME);
    const initialPage = (savedLastPage || 'home') + '.html';
    currentPageUrl = initialPage; // ✨ 確保初始變數即時同步
    loadPage(initialPage);
});

// ✨ 監聽瀏覽器上一頁/下一頁（popstate/hashchange）按鈕
window.addEventListener('hashchange', function () {
    const hashPage = sessionStorage.getItem(SESSION_NAME) + '.html';
    if (hashPage) {
        // 避免重複重新載入相同頁面
        const currentIframeSrc = $('#portal-subpage-frame').attr('src');
        if (currentIframeSrc !== hashPage) {
            loadPage(hashPage);
        }
    }
});

// 1. 左側選單收折邏輯
function initSidebarToggle() {
    // 點擊切換側邊欄
    $('#sidebarToggle').on('click', function () {
        if ($(window).width() >= 992) {
            $('#portalSidebar').toggleClass('collapsed');
            $('#portalWrapper').toggleClass('sidebar-collapsed');
        } else {
            $('#portalSidebar').toggleClass('mobile-open');
        }
    });

    // 點擊空白處關閉手機版側邊欄
    $(document).on('click', function (e) {
        if ($(window).width() < 992) {
            if (!$(e.target).closest('#portalSidebar, #sidebarToggle').length) {
                $('#portalSidebar').removeClass('mobile-open');
            }
        }
    });

    // 側邊欄收折狀態時，滑鼠離開自動關閉已開啟的子選單
    $('#portalSidebar').on('mouseleave', function () {
        if ($(this).hasClass('collapsed')) {
            $(this).find('.submenu-container.show').slideUp(150).removeClass('show');
            $(this).find('.submenu-arrow').removeClass('fa-rotate-180');
        }
    });

    // 監聽視窗縮放，自動清理跨裝置樣式 Class
    $(window).on('resize', function () {
        if ($(window).width() >= 992) {
            // 切換回桌機版時，清理手機專用的 mobile-open
            $('#portalSidebar').removeClass('mobile-open');
        } else {
            // 切換到手機版時，自動清除桌機版 collapsed，避免文字被 CSS 隱藏
            $('#portalSidebar').removeClass('collapsed');
            $('#portalWrapper').removeClass('sidebar-collapsed');
        }
    });
}

// 2. 抓取 Google 試算表資料（索引解耦模式）
function fetchGoogleSheetMenu() {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

    Papa.parse(url, {
        download: true,
        header: false,
        skipEmptyLines: true,
        complete: function (results) {
            if (results.data && results.data.length > 1) {
                processAndRenderMenu(results.data.slice(1));
            } else {
                handleFetchError('選單資料空白或無法解析');
            }
        },
        error: function (err) {
            handleFetchError(err);
        }
    });
}

// 錯誤處理與提示視窗
function handleFetchError(err) {
    console.error('Google 試算表選單載入失敗:', err);

    processAndRenderMenu([]);

    if (typeof AppDialog !== 'undefined' && AppDialog.alert) {
        AppDialog.alert("無法載入選單資料，請確認網路連線或試算表權限！", {
            title: "連線失敗",
            icon: "fa-solid fa-circle-exclamation text-danger"
        });
    }
}

// 3. 處理數據並生成樹狀導覽
function processAndRenderMenu(rawRows) {
    menuTreeMap.clear();

    const items = rawRows.map(row => {
        const isValidRaw = String(row[7] || '').trim().toUpperCase();
        const isValid = (isValidRaw === 'Y' || isValidRaw === 'TRUE' || isValidRaw === '1' || isValidRaw === '是');

        return {
            id: String(row[0] || '').trim(),
            titleCn: String(row[1] || '').trim(),
            titleEn: String(row[2] || '').trim(),
            level: parseInt(String(row[3] || '0').trim(), 10) || 0,
            parentId: String(row[4] || 'root').trim(),
            link: String(row[5] || '#').trim(),
            icon: String(row[6] || 'fa-solid fa-circle-dot').trim(),
            isActive: isValid
        };
    }).filter(item => item.id !== '' && item.isActive);

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

    $('.parent-toggle').off('click').on('click', function (e) {
        e.preventDefault();
        const targetId = $(this).data('target');
        const $target = $(`#${targetId}`);
        const isAlreadyOpen = $target.hasClass('show');

        // 1. 關閉「其他」非當前（且非當前選單的上層父選單）的所有已展開選單
        $('.submenu-container.show')
            .not($target)
            .not($target.parents('.submenu-container'))
            .slideUp(200)
            .removeClass('show');

        // 2. 將其他被收折選單的箭頭指回原位
        $('.parent-toggle')
            .not(this)
            .not($(this).parents('.nav-item').children('.parent-toggle'))
            .find('.submenu-arrow')
            .removeClass('fa-rotate-180');

        // 3. 切換當前點擊選單的開關狀態
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

// 4. 遞歸構建無限層級選單 HTML
function buildRecursiveMenuHtml(parentId, depth) {
    const children = menuTreeMap.get(parentId) || [];
    if (children.length === 0) return '';

    const ulClass = (depth === 0) ? 'sidebar-menu' : 'submenu-container';
    const ulId = (depth > 0) ? `id="submenu-${parentId}"` : '';

    let html = `<ul class="${ulClass}" ${ulId}>`;

    children.forEach(item => {
        const subChildren = menuTreeMap.get(item.id) || [];
        const hasChildren = subChildren.length > 0;
        const isExternal = item.link.startsWith('http://') || item.link.startsWith('https://');

        html += `<li class="nav-item">`;

        if (hasChildren) {
            html += `
                <a href="#" class="nav-item-link parent-toggle" data-target="submenu-${item.id}">
                    <div class="d-flex align-items-center gap-2">
                        <span class="menu-icon-box"><i class="${item.icon}"></i></span>
                        <span class="menu-text"> ${item.titleCn}</span>
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
                    <div class="d-flex align-items-center gap-2">
                        <span class="menu-icon-box"><i class="${item.icon}"></i></span>
                        <span class="menu-text"> ${item.titleCn}</span>
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

// 自動高亮當前選單項目，並展開其父級子選單
function setActiveMenuItem(pageUrl) {
    if (!pageUrl || pageUrl === '#') return;

    // 1. 移除所有選單項目的 active 高亮
    $('#dynamicMenuContainer .nav-item-link').removeClass('active');

    // 2. 尋找與當前 pageUrl 匹配的選單連結
    const $targetLink = $('#dynamicMenuContainer .nav-item-link').filter(function () {
        const href = $(this).attr('href');
        const onclickAttr = $(this).attr('onclick') || '';
        return href === pageUrl || onclickAttr.includes(`'${pageUrl}'`);
    });

    if ($targetLink.length) {
        // 3. 為點擊的項目加上 active 高亮
        $targetLink.addClass('active');

        // 4. 如果這個項目位於子選單內，自動展開所有上層父選單
        const $parentSubmenus = $targetLink.parents('.submenu-container');
        if ($parentSubmenus.length) {
            $parentSubmenus.addClass('show').css('display', 'block');

            // 將對應父選單的箭頭指向上方 (旋轉 180 度)
            $parentSubmenus.each(function () {
                const submenuId = $(this).attr('id');
                $(`.parent-toggle[data-target="${submenuId}"]`)
                    .find('.submenu-arrow')
                    .addClass('fa-rotate-180');
            });
        }
    }
}

// 5. 【關鍵核心】iFrame 無縫切換與 100% JS 變數隔離引擎
function loadPage(pageUrl) {
    if (!pageUrl || pageUrl === '#') return;

    currentPageUrl = pageUrl; // ✨ 確保初始變數即時同步

    $('#portalSidebar').removeClass('mobile-open');

    setActiveMenuItem(pageUrl);

    let page = pageUrl.split('.')[0];
    if (page) {
        // ✨ 同步備份至 sessionStorage 雙重防護
        sessionStorage.setItem(SESSION_NAME, page);
    }

    // 使用 iFrame 載入頁面，徹底達成 JS 作用域完全隔離！
    const $container = $('#page-content-container');
    $container.html(`
        <iframe id="portal-subpage-frame" 
                class="seamless-iframe" 
                src="${pageUrl}" 
                scrolling="no" 
                title="Subpage Content">
        </iframe>
    `);

    $.ajax({
        url: pageUrl,
        type: 'GET',
        dataType: 'html',
        success: function (response) {
            // 頁面加載成功
        },
        error: function () {
            // 若單獨 HTML 尚未上傳，顯示提示卡片
            $('#page-content-container').html(`
                <div class="card card-modal bg-primary border-primary text-light p-4 shadow-lg">
                    <div class="card-body text-center">
                        <i class="fa-solid fa-hammer text-primary display-4 mb-3"></i>
                        <h3>本頁面建置中，敬請期待！</h3>
                        <button class="btn btn-outline-primary mt-2" onclick="loadPage('home.html')">
                            <i class="fa-solid fa-house me-1"></i> 返回首頁
                        </button>
                    </div>
                </div>
            `);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // 綁定 iFrame 載入事件與自動高度調整
    const frame = document.getElementById('portal-subpage-frame');
    frame.onload = function () {
        autoResizeIframe(frame);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
}

// 6. 消弭二次卷軸：動態即時同步 iFrame 高度與 Body
function autoResizeIframe(frame) {
    try {
        if (frame && frame.contentWindow && frame.contentWindow.document.body) {
            // 取得子頁面實際 DOM 高度
            const body = frame.contentWindow.document.body;
            const html = frame.contentWindow.document.documentElement;
            const contentHeight = Math.max(
                body.scrollHeight, body.offsetHeight,
                html.clientHeight, html.scrollHeight, html.offsetHeight
            );

            // 強制套用高度給 iFrame，消除內部滾動條
            frame.style.height = contentHeight + 'px';

            // 監聽子頁面 DOM 變動（例如展開摺疊或載入資料）
            if (frame.contentWindow.ResizeObserver) {
                const observer = new frame.contentWindow.ResizeObserver(() => {
                    frame.style.height = frame.contentWindow.document.body.scrollHeight + 'px';
                });
                observer.observe(frame.contentWindow.document.body);
            }
        }
    } catch (e) {
        console.warn('iFrame 跨網域存取受限，採用預設高度設定:', e);
        frame.style.height = '800px';
    }
}

// 7. 監聽視窗縮放，自動調整 iFrame
function initIframeResizeListener() {
    $(window).on('resize', function () {
        const frame = document.getElementById('portal-subpage-frame');
        if (frame) {
            autoResizeIframe(frame);
        }
    });
}

// 8. 電腦版 Sitemap 頁尾
function renderSitemapFooter() {
    const $sitemapContainer = $('#sitemapContainer');
    $sitemapContainer.empty();

    const rootNodes = menuTreeMap.get('root') || [];

    rootNodes.forEach(root => {
        const children = menuTreeMap.get(root.id) || [];
        const iconClass = root.icon || 'fa-solid fa-circle-dot';

        let sitemapBlockHtml = `
            <div class="col-lg-3 col-md-4">
                <div class="fw-bold text-primary mb-2">
                    <i class="${iconClass} me-1"></i> ${root.titleCn}
                </div>`;

        if (children.length > 0) {
            sitemapBlockHtml += `<ul class="sitemap-list">`;
            children.forEach(child => {
                const childExternal = child.link.startsWith('http://') || child.link.startsWith('https://');
                const targetAttr = childExternal ? 'target="_blank"' : '';
                const clickHandler = childExternal ? '' : `onclick="loadPage('${child.link}'); return false;"`;

                sitemapBlockHtml += `
                    <li>
                        <a href="${child.link}" ${targetAttr} ${clickHandler}>
                            <i class="${child.icon} me-1"></i> ${child.titleCn}
                        </a>
                    </li>`;
            });
            sitemapBlockHtml += `</ul>`;
        }

        sitemapBlockHtml += `</div>`;
        $sitemapContainer.append(sitemapBlockHtml);
    });
}

// 9. IntersectionObserver 觸發 Sitemap 漸顯
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

function initBackToTop() {
    const $backToTopBtn = $('#backToTopBtn');

    // 監聽滾動距離，超過 300px 才顯示按鈕
    $(window).on('scroll', function () {
        if ($(this).scrollTop() > 300) {
            $backToTopBtn.addClass('show');
        } else {
            $backToTopBtn.removeClass('show');
        }
    });

    // 點擊滑動回頂端
    $backToTopBtn.on('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function initLogoutModal() {
    $('#confirmLogoutBtn').on('click', function () {
        // 點擊確定後關閉 Modal 並執行登出邏輯
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
    const mainBtn = document.getElementById('versionDropdownBtn');
    const versionBtns = document.querySelectorAll('.open-version-btn');

    const rawSession = localStorage.getItem('ray_team_auth_session');
    let sessionData = null;
    if (rawSession) {
        try {
            sessionData = JSON.parse(rawSession);
            const now = new Date().getTime();
            const hubPerm = (sessionData.permissions) ? sessionData.permissions['hub'] : null;

            // 有核心版權限才顯示
            if (sessionData.expireAt && sessionData.expireAt > now && (hubPerm === '編輯' || hubPerm === '檢視') && sessionData.signature) {
                $('#hubButton').show();
            } else {
                $('#hubButton').hide();
            }
        } catch (e) {
            $('#hubButton').hide();
            console.log(e);
        }
    }

    let matchedBtn = null;

    // 1. 比對當前網址路徑，尋找對應的版本按鈕
    versionBtns.forEach(btn => {
        const rawUrl = btn.getAttribute('data-url');

        // 提取關鍵路徑名稱（例如：../team/ -> /team/）
        const pathKey = rawUrl.replace(/\.\./g, '');

        if (pathKey && currentPath.includes(pathKey)) {
            matchedBtn = btn;
        }
    });

    // 若網址比對不到（例如在地端根目錄測試時），預設為第一個（公開版）
    if (!matchedBtn && versionBtns.length > 0) {
        matchedBtn = versionBtns[0];
    }

    // 2. 自動更新 UI 狀態
    if (matchedBtn) {
        // 設定當前按鈕的 active 狀態與「當前」徽章
        matchedBtn.classList.add('active');

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'badge bg-white text-dark shadow-sm ms-2';
        badgeSpan.textContent = '當前';

        // 更新主按鈕的內容與配色類別 (如 btn-green-subtle / btn-blue-subtle / btn-purple-subtle)
        if (mainBtn) {
            const colorBtnClass = Array.from(matchedBtn.classList).find(c => c.startsWith('btn-') && c.endsWith('-subtle'));
            const colorTextClass = "text-" + colorBtnClass.split("-")[1].toString();
            if (colorBtnClass) {
                mainBtn.className = mainBtn.className.replace(/btn-[a-z]+-subtle/g, colorBtnClass);
                badgeSpan.className = badgeSpan.className.replace(/text-[a-z]+/g, colorTextClass);
            }

            const labelSpan = matchedBtn.querySelector('span:first-child');
            if (labelSpan) {
                mainBtn.innerHTML = labelSpan.innerHTML;
            }
        }
    }

    // 3. 點擊按鈕開啟新視窗
    versionBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const url = this.getAttribute('data-url');
            if (url) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        });
    });
}