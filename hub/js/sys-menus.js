// ==========================================================================
// 1. Google 雲端試算表設定與資料庫核心轉接器 (Adapter Pattern)
// ==========================================================================
const SPREADSHEET_ID = "1TofIohkI-arOGmgRzm0rFm3sXBWvfYyThmm9pp1IGqw";

/**
 * 試算表欄位索引安全取值工具函式
 * @param {Array} row 資料行陣列
 * @param {number} colIndex 欄位索引 (0-based)
 * @param {string} defaultVal 預設值
 * @returns {string} 清洗後的字串
 */
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && row[colIndex] !== '') {
        return row[colIndex].toString().trim();
    }
    return defaultVal;
}

// ==========================================================================
// 2. 系統狀態管理 (State Management)
// ==========================================================================
let appState = {
    menus: [],
    activeMenuList: [],
    currentPortal: '核心版',
    selectedMenuId: 'H74000'
};

let menuDataTableInstance = null;
let isInitialized = false;

// 系統內建備份初始資料集 (當 Google Sheets 離線時啟用)
const fallbackMenuDataset = [
    { menu_id: 'H00000', app_track: '核心版', menu_name_zh: '戰情總覽', menu_name_en: 'Executive Dashboard', menu_level: 0, parent_id: 'root', sort_order: 10, route_url: 'home.html', fa_icon: 'fa-solid fa-chart-line', is_active: 'Y', dev_status: '已完成', related_tables: '自動彙整', function_desc: '全站營運大看板、全團隊 SV 總量、營收目標與庫存預警', created_by: 'ADMIN', created_at: '2026-01-01 00:00:00', updated_by: 'ADMIN', updated_at: '2026-01-01 00:00:00' },
    { menu_id: 'H10000', app_track: '核心版', menu_name_zh: '產品管理', menu_name_en: 'Product Master CMS', menu_level: 0, parent_id: 'root', sort_order: 20, route_url: '#', fa_icon: 'fa-solid fa-boxes-stacked', is_active: 'Y', dev_status: '已完成', related_tables: 'prd_items, prd_details', function_desc: '產品資料、系列分類、行銷文案、見證評價與專利認證維護', created_by: 'ADMIN', created_at: '2026-01-01 00:00:00', updated_by: 'ADMIN', updated_at: '2026-01-01 00:00:00' },
    { menu_id: 'H11000', app_track: '核心版', menu_name_zh: '產品資料', menu_name_en: 'Product Master & Specs', menu_level: 1, parent_id: 'H10000', sort_order: 21, route_url: 'prd-master.html', fa_icon: 'fa-solid fa-box-open', is_active: 'Y', dev_status: '已完成', related_tables: 'prd_items, prd_details', function_desc: '一站式維護產品定價、經理價、PV/SV 比率與垂直詳細規格', created_by: 'ADMIN', created_at: '2026-01-01 00:00:00', updated_by: 'ADMIN', updated_at: '2026-01-01 00:00:00' },
    { menu_id: 'H70000', app_track: '核心版', menu_name_zh: '系統配置', menu_name_en: 'System & Security', menu_level: 0, parent_id: 'root', sort_order: 70, route_url: '#', fa_icon: 'fa-solid fa-sliders', is_active: 'Y', dev_status: '已完成', related_tables: 'sys_permissions, sys_menus', function_desc: '權限門禁、試算表欄位解耦字典、連結管理與選單拓撲引擎', created_by: 'ADMIN', created_at: '2026-01-01 00:00:00', updated_by: 'ADMIN', updated_at: '2026-01-01 00:00:00' },
    { menu_id: 'H74000', app_track: '核心版', menu_name_zh: '選單管理', menu_name_en: 'Dynamic Menu Engine', menu_level: 1, parent_id: 'H70000', sort_order: 74, route_url: 'sys-menus.html', fa_icon: 'fa-solid fa-bars-staggered', is_active: 'Y', dev_status: '已完成', related_tables: 'sys_menus', function_desc: '維護公開版、團隊版、核心版三軌動態選單節點與排序', created_by: 'ADMIN', created_at: '2026-01-01 00:00:00', updated_by: 'ADMIN', updated_at: '2026-01-01 00:00:00' },
    { menu_id: 'T00001', app_track: '團隊版', menu_name_zh: '戰術首頁', menu_name_en: 'Home', menu_level: 0, parent_id: 'root', sort_order: 10, route_url: 'home.html', fa_icon: 'fa-solid fa-house', is_active: 'Y', dev_status: '已完成', related_tables: 'org_partners', function_desc: '夥伴戰術儀表板與最新公告', created_by: 'ADMIN', created_at: '2026-01-01 00:00:00', updated_by: 'ADMIN', updated_at: '2026-01-01 00:00:00' },
    { menu_id: 'T51000', app_track: '團隊版', menu_name_zh: '訂購試算', menu_name_en: 'Order Calculator', menu_level: 1, parent_id: 'T00001', sort_order: 20, route_url: 'tool-order.html', fa_icon: 'fa-solid fa-cart-shopping', is_active: 'Y', dev_status: '已完成', related_tables: 'prd_items', function_desc: '產品 PV 與入會金額速算', created_by: 'ADMIN', created_at: '2026-01-01 00:00:00', updated_by: 'ADMIN', updated_at: '2026-01-01 00:00:00' },
    { menu_id: 'P10000', app_track: '公開版', menu_name_zh: '品牌首頁', menu_name_en: 'Brand Home', menu_level: 0, parent_id: 'root', sort_order: 10, route_url: 'index.html', fa_icon: 'fa-solid fa-house', is_active: 'Y', dev_status: '已完成', related_tables: '公域靜態', function_desc: '健康生活與形象首頁展示', created_by: 'ADMIN', created_at: '2026-01-01 00:00:00', updated_by: 'ADMIN', updated_at: '2026-01-01 00:00:00' }
];

// ==========================================================================
// 3. 系統生命週期與事件初始化
// ==========================================================================
window.addEventListener('AppReady', async () => {
    await initApp();
});

async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindUIEvents();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        appState.menus = fallbackMenuDataset;
        refreshView();
    }
}

// ==========================================================================
// 4. PapaParse + GViz 資料讀取引擎 (表 sys_menus 選單主檔讀取)
// ==========================================================================
async function fetchGoogleSheetsData() {
    $('#btnSyncSheets').html('<i class="fa-solid fa-spinner fa-spin"></i> 載入中...').prop('disabled', true);
    try {
        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP 通訊錯誤狀態碼: ${res.status}`);
            const text = await res.text();

            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return parsed.data.slice(1);
        };

        const rawRows = await fetchSheet('選單架構');

        if (!rawRows || rawRows.length === 0) {
            throw new Error("試算表『選單架構』工作表中未讀取到任何有效數據。");
        }

        const parsedMenus = parseMenusTable(rawRows);
        appState.menus = parsedMenus;
        
        refreshView();
        showToast(`已成功自 Google 試算表同步 ${parsedMenus.length} 筆選單節點`);
    } catch (err) {
        console.warn("Google Sheets 選單架構讀取失敗，載入備用本機資料:", err);
        appState.menus = fallbackMenuDataset;
        refreshView();
        showErrorNotice("Google 試算表連線異常，已切換至本機備份選單架構！");
    } finally {
        $('#btnSyncSheets').html('<i class="fa-solid fa-rotate"></i> 試算表同步').prop('disabled', false);
    }
}

/**
 * 依據資料庫表 sys_menus (17 欄位) 定義進行精準 0-based 欄位索引映射
 */
function parseMenusTable(rows) {
    return rows.map((r, idx) => {
        return {
            menu_id: getVal(r, 0, `M_${String(idx + 1).padStart(3, '0')}`),
            app_track: getVal(r, 1, '公開版'),
            menu_name_zh: getVal(r, 2, '未命名選單'),
            menu_name_en: getVal(r, 3, 'Menu Item'),
            menu_level: parseInt(getVal(r, 4, '0'), 10) || 0,
            parent_id: getVal(r, 5, 'root'),
            sort_order: parseInt(getVal(r, 6, String((idx + 1) * 10)), 10) || ((idx + 1) * 10),
            route_url: getVal(r, 7, '#'),
            fa_icon: getVal(r, 8, 'fa-solid fa-circle'),
            is_active: getVal(r, 9, 'Y').toUpperCase(),
            dev_status: getVal(r, 10, '已完成'),
            related_tables: getVal(r, 11, ''),
            function_desc: getVal(r, 12, ''),
            created_by: getVal(r, 13, 'ADMIN'),
            created_at: getVal(r, 14, '2026-01-01 00:00:00'),
            updated_by: getVal(r, 15, 'ADMIN'),
            updated_at: getVal(r, 16, '2026-01-01 00:00:00')
        };
    }).filter(item => item.menu_name_zh !== '未命名選單');
}

// ==========================================================================
// 5. 介面事件綁定與視圖渲染中樞
// ==========================================================================
function bindUIEvents() {
    $('#fieldFaIcon').on('input', function() {
        const icon = $(this).val().trim();
        $('#iconPreview').html(`<i class="${icon || 'fa-solid fa-bars'}"></i>`);
    });
}

function switchPortal(portal) {
    appState.currentPortal = portal;
    $('.portal-btn').removeClass('active');
    $(`.portal-btn[data-portal="${portal}"]`).addClass('active');
    $('#treePortalBadge').text(portal);

    // 自動定位該站點第一個節點
    const firstNode = appState.menus.find(m => m.app_track === portal);
    if (firstNode) {
        appState.selectedMenuId = firstNode.menu_id;
    }

    refreshView();
    showToast(`已切換至【${portal}】維度`);
}

function refreshView() {
    renderStats();
    renderTreeTopology();
    renderInspector();
    renderNavbarSandbox();
    populateParentSelect();
    renderMenuDataTable();
}

/**
 * 渲染四象限指標卡片
 */
function renderStats() {
    const list = appState.menus.filter(m => m.app_track === appState.currentPortal);
    let completed = 0, testing = 0, fixing = 0, hidden = 0;

    list.forEach(m => {
        if (m.menu_level === -1 || m.parent_id === 'hide') hidden++;
        if (m.dev_status === '已完成') completed++;
        else if (m.dev_status === '測試中') testing++;
        else if (m.dev_status === '修復中') fixing++;
    });

    $('#statCompleted').text(completed);
    $('#statTesting').text(testing);
    $('#statFixing').text(fixing);
    $('#statHiddenLanding').text(hidden);
}

/**
 * 渲染樹狀拓撲畫布
 */
function renderTreeTopology() {
    const $container = $('#treeContainer').empty();
    const list = appState.menus.filter(m => m.app_track === appState.currentPortal);

    const roots = list.filter(m => m.parent_id === 'root' && m.menu_level === 0).sort((a, b) => a.sort_order - b.sort_order);
    const hiddenNodes = list.filter(m => m.menu_level === -1 || m.parent_id === 'hide').sort((a, b) => a.sort_order - b.sort_order);

    if (roots.length === 0 && hiddenNodes.length === 0) {
        $container.html('<div class="text-center text-muted p-4"><i class="fa-solid fa-circle-exclamation"></i> 該版本尚無選單節點</div>');
        return;
    }

    // 1. 頂層與二級節點
    roots.forEach(root => {
        $container.append(buildNodeHtml(root, 0));
        const children = list.filter(m => m.parent_id === root.menu_id).sort((a, b) => a.sort_order - b.sort_order);
        children.forEach(child => {
            $container.append(buildNodeHtml(child, 1));
        });
    });

    // 2. 獨立落地頁區塊
    if (hiddenNodes.length > 0) {
        $container.append(`
            <div class="mt-3 mb-2 text-info small fw-bold">
                <i class="fa-solid fa-route"></i> 獨立隱藏落地頁 (Level -1 / hide)
            </div>
        `);
        hiddenNodes.forEach(node => {
            $container.append(buildNodeHtml(node, 'hide'));
        });
    }
}

function buildNodeHtml(node, levelType) {
    const isSelected = node.menu_id === appState.selectedMenuId ? 'selected' : '';
    const isActive = node.is_active === 'Y';
    const levelClass = levelType === 0 ? 'tree-node-level-0' : (levelType === 1 ? 'tree-node-level-1' : 'tree-node-level-hide');

    let devBadgeClass = 'bg-secondary';
    if (node.dev_status === '已完成') devBadgeClass = 'bg-success';
    else if (node.dev_status === '測試中') devBadgeClass = 'bg-warning text-dark';
    else if (node.dev_status === '修復中') devBadgeClass = 'bg-danger';

    return `
        <div class="tree-node-item ${levelClass} ${isSelected}" onclick="selectNode('${node.menu_id}')">
            <div class="d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center">
                    <span class="text-secondary me-2"><i class="${node.fa_icon || 'fa-solid fa-circle'}"></i></span>
                    <span class="fw-bold me-2 text-white">${node.menu_name_zh}</span>
                    <span class="text-muted small">(${node.menu_id})</span>
                    <span class="badge ${devBadgeClass} ms-2" style="font-size: 0.65rem;">${node.dev_status}</span>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <span class="inspector-badge text-purple-light">${node.route_url}</span>
                    <span class="${isActive ? 'text-success' : 'text-danger'}" title="${isActive ? '啟用中' : '已停用'}">
                        <i class="fa-solid ${isActive ? 'fa-circle-check' : 'fa-ban'}"></i>
                    </span>
                </div>
            </div>
        </div>
    `;
}

function selectNode(menuId) {
    appState.selectedMenuId = menuId;
    $('.tree-node-item').removeClass('selected');
    $(`.tree-node-item[onclick*="${menuId}"]`).addClass('selected');
    renderInspector();
}

/**
 * 渲染節點詳細屬性巡檢儀
 */
function renderInspector() {
    const node = appState.menus.find(m => m.menu_id === appState.selectedMenuId);
    if (!node) return;

    $('#inspectMenuId').text(node.menu_id);
    $('#inspectMenuNameZh').text(node.menu_name_zh);
    $('#inspectMenuNameEn').text(node.menu_name_en || 'None');
    $('#inspectParentId').text(node.parent_id);
    $('#inspectRouteUrl').text(node.route_url);
    $('#inspectFaIcon').html(`<i class="${node.fa_icon}"></i> ${node.fa_icon}`);
    $('#inspectMenuLevel').text(`${node.menu_level} (${node.menu_level === 0 ? '頂層大類' : node.menu_level === 1 ? '二級子功能' : '隱藏落地頁'})`);
    $('#inspectRelatedTables').text(node.related_tables || '無對應資料表 (靜態)');
    $('#inspectFunctionDesc').text(node.function_desc || '無特定業務說明');
    $('#quickToggleActive').prop('checked', node.is_active === 'Y');

    let devClass = 'bg-secondary';
    if (node.dev_status === '已完成') devClass = 'bg-success';
    else if (node.dev_status === '測試中') devClass = 'bg-warning text-dark';
    else if (node.dev_status === '修復中') devClass = 'bg-danger';

    $('#inspectDevStatusBadge').attr('class', `badge ${devClass}`).text(node.dev_status);
    $('#inspectAuditTrail').text(`異動者：${node.updated_by} ‧ ${node.updated_at}`);
}

/**
 * 渲染即時 Navbar 導航列沙盒
 */
function renderNavbarSandbox() {
    const $sandbox = $('#navbarSandbox').empty();
    const visibleRoots = appState.menus.filter(m => m.app_track === appState.currentPortal && m.menu_level === 0 && m.is_active === 'Y').sort((a, b) => a.sort_order - b.sort_order);

    if (visibleRoots.length === 0) {
        $sandbox.html('<span class="text-muted small">此站點目前無任何 Level 0 啟用項目</span>');
        return;
    }

    visibleRoots.forEach(r => {
        $sandbox.append(`
            <div class="sandbox-nav-pill">
                <i class="${r.fa_icon} me-1 text-primary"></i> ${r.menu_name_zh}
            </div>
        `);
    });
}

function populateParentSelect() {
    const $select = $('#fieldParentId').empty();
    $select.append('<option value="root">root (最頂層根節點)</option>');
    $select.append('<option value="hide">hide (隱藏落地頁)</option>');

    const roots = appState.menus.filter(m => m.app_track === appState.currentPortal && m.menu_level === 0);
    roots.forEach(r => {
        $select.append(`<option value="${r.menu_id}">${r.menu_id} - ${r.menu_name_zh}</option>`);
    });
}

function toggleCurrentActive() {
    const node = appState.menus.find(m => m.menu_id === appState.selectedMenuId);
    if (node) {
        node.is_active = $('#quickToggleActive').is(':checked') ? 'Y' : 'N';
        node.updated_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
        refreshView();
        showToast(`節點 ${node.menu_id} 啟用狀態更新為：${node.is_active}`);
    }
}

/**
 * DataTable.js 渲染與欄位對齊
 */
function renderMenuDataTable() {
    const currentList = appState.menus.filter(m => m.app_track === appState.currentPortal);
    const formattedData = currentList.map(m => formatTableRow(m));

    if (menuDataTableInstance) {
        menuDataTableInstance.clear();
        menuDataTableInstance.rows.add(formattedData);
        menuDataTableInstance.draw();
    } else {
        menuDataTableInstance = $('#menuDataTable').DataTable({
            data: formattedData,
            columns: [
                { data: 'menu_id' },
                { data: 'names' },
                { data: 'track' },
                { data: 'level' },
                { data: 'parent' },
                { data: 'sort' },
                { data: 'url' },
                { data: 'icon' },
                { data: 'status' },
                { data: 'active' },
                { data: 'actions' }
            ],
            language: {
                search: "檢索選單：",
                lengthMenu: "每頁 _MENU_ 筆",
                info: "顯示第 _START_ 至 _END_ 筆，共 _TOTAL_ 筆節點",
                paginate: { first: "首頁", last: "末頁", next: "下一頁", previous: "上一頁" },
                emptyTable: "目前無選單資料"
            },
            pageLength: 8,
            order: [[5, 'asc']]
        });
    }
}

function formatTableRow(m) {
    let statusBadge = '';
    if (m.dev_status === '已完成') statusBadge = '<span class="badge bg-success">已完成</span>';
    else if (m.dev_status === '測試中') statusBadge = '<span class="badge bg-warning text-dark">測試中</span>';
    else statusBadge = '<span class="badge bg-danger">修復中</span>';

    const activePill = m.is_active === 'Y' 
        ? '<span class="badge bg-success-subtle text-success border border-success-subtle">啟用</span>'
        : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">停用</span>';

    return {
        menu_id: `<span class="fw-bold text-white">${m.menu_id}</span>`,
        names: `<div>${m.menu_name_zh}</div><div class="text-muted small">${m.menu_name_en || ''}</div>`,
        track: `<span class="badge bg-dark border">${m.app_track}</span>`,
        level: `<span class="inspector-badge">${m.menu_level}</span>`,
        parent: `<code class="text-cyan">${m.parent_id}</code>`,
        sort: m.sort_order,
        url: `<span class="text-light small">${m.route_url}</span>`,
        icon: `<i class="${m.fa_icon}"></i>`,
        status: statusBadge,
        active: activePill,
        actions: `
            <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="openEditModal('${m.menu_id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-outline-danger py-0 px-2 ms-1" onclick="deleteMenuItem('${m.menu_id}')"><i class="fa-solid fa-trash"></i></button>
        `
    };
}

// ==========================================================================
// 6. Modal 表單操作 (CRUD)
// ==========================================================================
function openAddModal() {
    $('#modalTitle').html('<i class="fa-solid fa-plus text-primary"></i> 新增選單節點');
    $('#formMode').val('add');
    $('#menuForm')[0].reset();
    $('#fieldMenuId').prop('readonly', false).val('');
    $('#fieldAppTrack').val(appState.currentPortal);
    $('#fieldMenuLevel').val('0');
    $('#fieldParentId').val('root');
    $('#fieldSortOrder').val(10);
    $('#fieldDevStatus').val('已完成');
    $('#fieldIsActive').prop('checked', true);
    $('#iconPreview').html('<i class="fa-solid fa-bars"></i>');
    populateParentSelect();
    new bootstrap.Modal(document.getElementById('menuModal')).show();
}

function openEditCurrent() {
    openEditModal(appState.selectedMenuId);
}

function openEditModal(menuId) {
    const node = appState.menus.find(m => m.menu_id === menuId);
    if (!node) return;

    $('#modalTitle').html('<i class="fa-solid fa-pen-to-square text-primary"></i> 編輯選單節點');
    $('#formMode').val('edit');
    $('#fieldMenuId').prop('readonly', true).val(node.menu_id);
    $('#fieldAppTrack').val(node.app_track);
    populateParentSelect();
    $('#fieldMenuLevel').val(node.menu_level);
    $('#fieldParentId').val(node.parent_id);
    $('#fieldMenuNameZh').val(node.menu_name_zh);
    $('#fieldMenuNameEn').val(node.menu_name_en);
    $('#fieldRouteUrl').val(node.route_url);
    $('#fieldFaIcon').val(node.fa_icon);
    $('#fieldSortOrder').val(node.sort_order);
    $('#fieldDevStatus').val(node.dev_status);
    $('#fieldRelatedTables').val(node.related_tables || '');
    $('#fieldFunctionDesc').val(node.function_desc || '');
    $('#fieldIsActive').prop('checked', node.is_active === 'Y');
    $('#iconPreview').html(`<i class="${node.fa_icon || 'fa-solid fa-bars'}"></i>`);

    new bootstrap.Modal(document.getElementById('menuModal')).show();
}

function saveMenuItem() {
    const mode = $('#formMode').val();
    const menuId = $('#fieldMenuId').val().trim();
    const nameZh = $('#fieldMenuNameZh').val().trim();

    if (!menuId || !nameZh) {
        alert('請完整填寫選單代碼 (menu_id) 與中文名稱！');
        return;
    }

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const payload = {
        menu_id: menuId,
        app_track: $('#fieldAppTrack').val(),
        menu_name_zh: nameZh,
        menu_name_en: $('#fieldMenuNameEn').val().trim(),
        menu_level: parseInt($('#fieldMenuLevel').val(), 10),
        parent_id: $('#fieldParentId').val(),
        sort_order: parseInt($('#fieldSortOrder').val(), 10) || 10,
        route_url: $('#fieldRouteUrl').val().trim() || '#',
        fa_icon: $('#fieldFaIcon').val().trim() || 'fa-solid fa-circle',
        is_active: $('#fieldIsActive').is(':checked') ? 'Y' : 'N',
        dev_status: $('#fieldDevStatus').val(),
        related_tables: $('#fieldRelatedTables').val().trim(),
        function_desc: $('#fieldFunctionDesc').val().trim(),
        created_by: mode === 'add' ? 'ADMIN' : (appState.menus.find(m => m.menu_id === menuId)?.created_by || 'ADMIN'),
        created_at: mode === 'add' ? nowStr : (appState.menus.find(m => m.menu_id === menuId)?.created_at || nowStr),
        updated_by: 'ADMIN',
        updated_at: nowStr
    };

    if (mode === 'add') {
        if (appState.menus.some(m => m.menu_id === menuId)) {
            alert(`選單代碼【${menuId}】已存在，不可重複！`);
            return;
        }
        appState.menus.push(payload);
        appState.selectedMenuId = menuId;
        showToast(`已新增選單節點：${nameZh} (${menuId})`);
    } else {
        const idx = appState.menus.findIndex(m => m.menu_id === menuId);
        if (idx !== -1) {
            appState.menus[idx] = payload;
            showToast(`已更新選單節點：${nameZh} (${menuId})`);
        }
    }

    bootstrap.Modal.getInstance(document.getElementById('menuModal')).hide();
    refreshView();
}

function deleteCurrent() {
    deleteMenuItem(appState.selectedMenuId);
}

function deleteMenuItem(menuId) {
    if (confirm(`確定要刪除選單節點【${menuId}】以及所屬子節點嗎？`)) {
        appState.menus = appState.menus.filter(m => m.menu_id !== menuId && m.parent_id !== menuId);
        const remaining = appState.menus.filter(m => m.app_track === appState.currentPortal);
        appState.selectedMenuId = remaining.length > 0 ? remaining[0].menu_id : '';
        refreshView();
        showToast(`已刪除節點：${menuId}`);
    }
}

// ==========================================================================
// 7. 匯出工具與輔助函式
// ==========================================================================
function exportJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState.menus, null, 4));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `sys_menus_${appState.currentPortal}_${new Date().toISOString().slice(0, 10)}.json`);
    dlAnchor.click();
    showToast('已匯出 JSON 選單檔案');
}

function exportCsv() {
    const csv = Papa.unparse(appState.menus);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sys_menus_${appState.currentPortal}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    showToast('已匯出 CSV 選單主檔');
}

function showToast(msg) {
    $('#toastMessage').html(`<i class="fa-solid fa-circle-check text-success"></i> ${msg}`);
    const toast = new bootstrap.Toast(document.getElementById('toastNotification'));
    toast.show();
}

function showErrorNotice(msg) {
    alert(msg);
}

function expandAllTree() {
    $('.tree-node-item').show();
}

function collapseAllTree() {
    $('.tree-node-level-1, .tree-node-level-hide').toggle();
}