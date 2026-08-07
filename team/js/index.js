// 設定 Google 試算表 CSV 發布連結
const SPREADSHEET_ID = '1nY-6mo9trXLMwkRGOqdvBU_va75DmsxIONIraMtTv2k';
const SHEET_NAME = '團隊版';

// 備用預設選單資料 (當 Google 試算表尚未連線時自動啟用，確保頁面不崩潰)
const fallbackMenuData = [
    { ID: '100', 中文: '戰情室首頁', 英文: 'Home', 所屬階層: '0', 父頁面選單ID: 'root', 連結: 'home.html', FontAwesomeIcon: 'fas fa-chart-line', 是否有效: 'Y' },
    { ID: '200', 中文: '新人培訓 SOP', 英文: 'Onboarding', 所屬階層: '0', 父頁面選單ID: 'root', 連結: 'onboarding.html', FontAwesomeIcon: 'fas fa-graduation-cap', 是否有效: 'Y' },
    { ID: '300', 中文: '事業工具箱', 英文: 'Tools', 所屬階層: '0', 父頁面選單ID: 'root', 連結: '#', FontAwesomeIcon: 'fas fa-toolbox', 是否有效: 'Y' },
    { ID: '301', 中文: '獎金試算表', 英文: 'Bonus Calculator', 所屬階層: '1', 父頁面選單ID: '300', 連結: 'calculator.html', FontAwesomeIcon: 'fas fa-calculator', 是否有效: 'Y' },
    { ID: '302', 中文: '雲端素材庫', 英文: 'Media Library', 所屬階層: '1', 父頁面選單ID: '300', 連結: 'media.html', FontAwesomeIcon: 'fas fa-folder-open', 是否有效: 'Y' },
    { ID: '400', 中文: '團隊公約', 英文: 'Rules', 所屬階層: '0', 父頁面選單ID: 'root', 連結: 'team-rules.html', FontAwesomeIcon: 'fas fa-gavel', 是否有效: 'Y' }
];

let menuTreeMap = new Map();

// 核心修改：監聽 vendorReady 事件，確保 jQuery 與 Chart.js 已全部載入記憶體
window.addEventListener('vendorReady', function() {
    initSidebarToggle();
    fetchGoogleSheetMenu();
    initDesktopSitemapObserver();
    initIframeResizeListener();
    
    // 預設載入首頁內容
    loadPage('home.html');
});

// 1. 左側選單收折邏輯
function initSidebarToggle() {
    $('#sidebarToggle').on('click', function() {
        if ($(window).width() >= 992) {
            $('#portalSidebar').toggleClass('collapsed');
            $('#portalWrapper').toggleClass('sidebar-collapsed');
        } else {
            $('#portalSidebar').toggleClass('mobile-open');
        }
    });

    $(document).on('click', function(e) {
        if ($(window).width() < 992) {
            if (!$(e.target).closest('#portalSidebar, #sidebarToggle').length) {
                $('#portalSidebar').removeClass('mobile-open');
            }
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
        complete: function(results) {
            if (results.data && results.data.length > 1) {
                processAndRenderMenu(results.data.slice(1));
            } else {
                processAndRenderMenu(fallbackMenuRawRows);
            }
        },
        error: function(err) {
            console.warn('Google 試算表抓取失敗，啟用備用選單數據:', err);
            processAndRenderMenu(fallbackMenuRawRows);
        }
    });
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
            icon: String(row[6] || 'fas fa-circle-dot').trim(),
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

    $('.parent-toggle').off('click').on('click', function(e) {
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
    
    setActiveMenuItem('home.html');
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
    const $targetLink = $('#dynamicMenuContainer .nav-item-link').filter(function() {
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
            $parentSubmenus.addClass('show').slideDown(200);

            // 將對應父選單的箭頭指向上方 (旋轉 180 度)
            $parentSubmenus.each(function() {
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

    $('#portalSidebar').removeClass('mobile-open');

    setActiveMenuItem(pageUrl);

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
        success: function(response) {
            // 頁面加載成功
        },
        error: function() {
            // 若單獨 HTML 尚未上傳，顯示提示卡片
            $('#page-content-container').html(`
                <div class="card card-modal bg-blue border-blue text-light p-4 shadow-lg">
                    <div class="card-body text-center">
                        <i class="fas fa-hammer text-blue display-4 mb-3"></i>
                        <h3>本頁面建置中，敬請期待！</h3>
                        <button class="btn btn-outline-blue mt-2" onclick="loadPage('home.html')">
                            <i class="fas fa-house"></i> 返回首頁
                        </button>
                    </div>
                </div>
            `);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // 綁定 iFrame 載入事件與自動高度調整
    const frame = document.getElementById('portal-subpage-frame');
    frame.onload = function() {
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
    $(window).on('resize', function() {
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
        const iconClass = root.icon || 'fas fa-circle-dot';

        let sitemapBlockHtml = `
            <div class="col-lg-3 col-md-4">
                <div class="fw-bold text-blue mb-2">
                    <i class="${iconClass}"></i> ${root.titleCn}
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