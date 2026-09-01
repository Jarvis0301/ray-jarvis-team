// ==========================================================================
// 1. Google 雲端試算表設定與資料庫核心轉接器
// ==========================================================================
const SPREADSHEET_ID = "1TofIohkI-arOGmgRzm0rFm3sXBWvfYyThmm9pp1IGqw";

/**
 * 試算表欄位索引安全取值工具函式
 */
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
        return String(row[colIndex]).trim();
    }
    return defaultVal;
}

/**
 * 取得當前登入者名稱
 */
function getCurrentUser() {
    const rawSession = localStorage.getItem('ray_team_auth_session');
    if (!rawSession) return 'ADMIN';
    try {
        const session = JSON.parse(rawSession);
        return session.userName || session.user || 'ADMIN';
    } catch (e) {
        return 'ADMIN';
    }
}

/**
 * 取得當前格式化時間字串 (YYYY-MM-DD HH:mm:ss)
 */
function getFormattedNow() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ==========================================================================
// 2. 系統狀態管理 (State Management)
// ==========================================================================
let appState = {
    menus: [],
    activeMenuList: [],
    currentPortal: '核心版',
    selectedMenuId: ''
};

let menuDataTableInstance = null;
let isInitialized = false;

// ==========================================================================
// 3. 系統生命週期與事件初始化
// ==========================================================================
window.addEventListener('AppReady', async () => {
    SheetAdapter.init("AKfycbyJ5FLoBXSHQsKRLF6UovYqulT7uBDPwmybRZ1Up2VN12nT4KnvkUELLC3N8pZK73A7cA");
    await initApp();
    applyUIPermissions();
});

async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindUIEvents();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        appState.menus = [];
        refreshView();
    }
}

/**
 * 檢查當前登入者是否為最高管理者
 */
function isMasterAdmin() {
    const rawSession = localStorage.getItem('ray_team_auth_session');
    if (!rawSession) return false;
    try {
        const session = JSON.parse(rawSession);
        const adminEmails = [
            "jarvis20250807@gmail.com",
            "fish7548@gmail.com"
        ];
        return adminEmails.includes((session.user || '').toLowerCase().trim());
    } catch (e) {
        return false;
    }
}

/**
 * UI 動態權限檢查
 */
function applyUIPermissions() {
    const hasAdminRights = isMasterAdmin();
    if (!hasAdminRights) {
        $('#btnOpenAddModal').hide();
        $('.admin-action-btn').addClass('disabled').prop('disabled', true);
    }
}

// ==========================================================================
// 4. 資料讀取引擎 (依 Schema 索引順序讀取選單架構)
// ==========================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步選單...', '載入最新結構');
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

        const rawRows = await fetchSheet('選單架構');

        if (!rawRows || rawRows.length === 0) {
            throw new Error("試算表『選單架構』工作表中未讀取到任何有效數據。");
        }

        const parsedMenus = parseMenusTable(rawRows);
        appState.menus = parsedMenus;

        if (!appState.selectedMenuId || !parsedMenus.some(m => m.menu_id === appState.selectedMenuId)) {
            const firstNode = parsedMenus.find(m => m.app_track === appState.currentPortal);
            if (firstNode) {
                appState.selectedMenuId = firstNode.menu_id;
            }
        }
        
        refreshView();
        AppToast.success(`已成功自 Google 試算表同步 ${parsedMenus.length} 筆選單節點`);
    } catch (err) {
        console.warn("Google Sheets 選單架構讀取失敗:", err);
        appState.menus = [];
        appState.selectedMenuId = '';
        refreshView();
        AppToast.error("Google 試算表連線異常或無資料，無法載入選單！");
    } finally {
        AppLoading.hide();
    }
}

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

    $('#treePortalBadge')
        .removeClass('badge-indigo badge-blue badge-green badge-gray')
        .addClass(UIBadges.system.trackClass(portal))
        .text(portal);

    const firstNode = appState.menus.find(m => m.app_track === portal);
    appState.selectedMenuId = firstNode ? firstNode.menu_id : '';

    refreshView();
    AppToast.info(`已切換至【${portal}】維度`);
}

function refreshView() {
    renderStats();
    renderTreeTopology();
    renderInspector();
    renderNavbarSandbox();
    populateParentSelect();
    renderMenuDataTable();
}

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

function renderTreeTopology() {
    const $container = $('#treeContainer').empty();
    const list = appState.menus.filter(m => m.app_track === appState.currentPortal);

    const roots = list.filter(m => m.parent_id === 'root' && m.menu_level === 0).sort((a, b) => a.sort_order - b.sort_order);
    const hiddenNodes = list.filter(m => m.menu_level === -1 || m.parent_id === 'hide').sort((a, b) => a.sort_order - b.sort_order);

    if (roots.length === 0 && hiddenNodes.length === 0) {
        $container.html('<div class="text-center text-muted p-4"><i class="fa-solid fa-circle-exclamation"></i> 該版本尚無選單節點</div>');
        return;
    }

    roots.forEach(root => {
        $container.append(buildNodeHtml(root, 0));
        const children = list.filter(m => m.parent_id === root.menu_id).sort((a, b) => a.sort_order - b.sort_order);
        children.forEach(child => {
            $container.append(buildNodeHtml(child, 1));
        });
    });

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

    let devBadgeClass = 'badge-secondary';
    if (node.dev_status === '已完成') devBadgeClass = 'badge-success';
    else if (node.dev_status === '測試中') devBadgeClass = 'badge-warning';
    else if (node.dev_status === '修復中') devBadgeClass = 'badge-danger';

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
                    <span class="badge badge-secondary-subtle">${node.route_url}</span>
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

function renderInspector() {
    const node = appState.menus.find(m => m.menu_id === appState.selectedMenuId);
    if (!node) {
        $('#inspectMenuId')
            .removeClass('badge-purple badge-blue badge-green')
            .addClass('badge-secondary')
            .text('-');
        $('#inspectMenuNameZh').text('請選取節點');
        $('#inspectMenuNameEn').text('-');
        $('#inspectParentId').text('-');
        $('#inspectRouteUrl').text('-');
        $('#inspectFaIcon').html('-');
        $('#inspectMenuLevel').text('-');
        $('#inspectRelatedTables').text('-');
        $('#inspectFunctionDesc').text('-');
        $('#inspectActiveBadge').attr('class', 'badge badge-secondary').html('<i class="fa-solid fa-circle-question"></i> 未選取');
        $('#inspectDevStatusBadge').attr('class', 'badge badge-secondary').text('-');
        $('#inspectAuditTrail').text('最後異動：-');
        return;
    }

    $('#inspectMenuId')
        .removeClass('badge-indigo badge-blue badge-green badge-gray')
        .addClass(UIBadges.system.trackClass(node.app_track))
        .text(node.menu_id);
    
    $('#inspectMenuNameZh').text(node.menu_name_zh);
    $('#inspectMenuNameEn').text(node.menu_name_en || 'None');
    $('#inspectParentId').text(node.parent_id);
    $('#inspectRouteUrl').text(node.route_url);
    $('#inspectFaIcon').html(`<i class="${node.fa_icon}"></i> ${node.fa_icon}`);
    $('#inspectMenuLevel').text(`${node.menu_level} (${node.menu_level === 0 ? '頂層大類' : node.menu_level === 1 ? '二級子功能' : '隱藏落地頁'})`);
    $('#inspectRelatedTables').text(node.related_tables || '無對應資料表 (靜態)');
    $('#inspectFunctionDesc').text(node.function_desc || '無特定業務說明');

    if (node.is_active === 'Y') {
        $('#inspectActiveBadge')
            .attr('class', 'badge badge-success-subtle')
            .html('<i class="fa-solid fa-circle-check"></i> 啟用中');
    } else {
        $('#inspectActiveBadge')
            .attr('class', 'badge badge-danger-subtle')
            .html('<i class="fa-solid fa-ban"></i> 已停用');
    }

    let devClass = 'badge-secondary';
    if (node.dev_status === '已完成') devClass = 'badge-success';
    else if (node.dev_status === '測試中') devClass = 'badge-warning';
    else if (node.dev_status === '修復中') devClass = 'badge-danger';

    $('#inspectDevStatusBadge').attr('class', `badge ${devClass}`).text(node.dev_status);
    $('#inspectAuditTrail').text(`最後異動：${node.updated_by || 'ADMIN'} ‧ ${node.updated_at || '-'}`);
}

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
                <i class="${r.fa_icon} text-primary"></i> ${r.menu_name_zh}
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
            ]
        });
    }
}

function formatTableRow(m) {const hasAdminRights = isMasterAdmin();
    const actionButtons = hasAdminRights ? `
        <button class="btn btn-sm btn-outline-primary py-1 px-2" onclick="openEditModal('${m.menu_id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-outline-danger py-1 px-2 ms-1" onclick="deleteMenuItem('${m.menu_id}')"><i class="fa-solid fa-trash-alt"></i></button>
    ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>';

    return {
        menu_id: `<span class="fw-bold">${m.menu_id}</span>`,
        names: `<div>${m.menu_name_zh}</div><div class="text-muted small">${m.menu_name_en || ''}</div>`,
        track: UIBadges.system.track(m.app_track),
        level: `<span class="badge badge-secondary-subtle">${m.menu_level}</span>`,
        parent: `<code class="text-info">${m.parent_id}</code>`,
        sort: m.sort_order,
        url: `<span class="small">${m.route_url}</span>`,
        icon: `<i class="${m.fa_icon}"></i> `,
        status: UIBadges.system.devStatus(m.dev_status),
        active: UIBadges.common.boolean(m.is_active === 'Y', '啟用', '停用'),
        actions: actionButtons
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
    if (!appState.selectedMenuId) {
        AppToast.warning("請先選取欲編輯的節點！");
        return;
    }
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

async function saveMenuItem() {
    const mode = $('#formMode').val();
    const menuId = $('#fieldMenuId').val().trim();
    if (!menuId) {
        AppToast.warning("選單 ID 為必填欄位！");
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();

    const existingNode = appState.menus.find(m => m.menu_id === menuId);
    const createdBy = (mode === 'edit' && existingNode) ? (existingNode.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existingNode) ? (existingNode.created_at || nowStr) : nowStr;

    const rowDataArray = [
        menuId,
        $('#fieldAppTrack').val(),
        $('#fieldMenuNameZh').val().trim(),
        $('#fieldMenuNameEn').val().trim(),
        parseInt($('#fieldMenuLevel').val(), 10) || 0,
        $('#fieldParentId').val(),
        parseInt($('#fieldSortOrder').val(), 10) || 10,
        $('#fieldRouteUrl').val().trim() || '#',
        $('#fieldFaIcon').val().trim() || 'fa-solid fa-circle',
        $('#fieldIsActive').is(':checked') ? 'Y' : 'N',
        $('#fieldDevStatus').val(),
        $('#fieldRelatedTables').val().trim(),
        $('#fieldFunctionDesc').val().trim(),
        createdBy,
        createdAt,
        currentUser,
        nowStr
    ];

    const updatedNodeObj = {
        menu_id: menuId,
        app_track: $('#fieldAppTrack').val(),
        menu_name_zh: $('#fieldMenuNameZh').val().trim(),
        menu_name_en: $('#fieldMenuNameEn').val().trim(),
        menu_level: parseInt($('#fieldMenuLevel').val(), 10) || 0,
        parent_id: $('#fieldParentId').val(),
        sort_order: parseInt($('#fieldSortOrder').val(), 10) || 10,
        route_url: $('#fieldRouteUrl').val().trim() || '#',
        fa_icon: $('#fieldFaIcon').val().trim() || 'fa-solid fa-circle',
        is_active: $('#fieldIsActive').is(':checked') ? 'Y' : 'N',
        dev_status: $('#fieldDevStatus').val(),
        related_tables: $('#fieldRelatedTables').val().trim(),
        function_desc: $('#fieldFunctionDesc').val().trim(),
        created_by: createdBy,
        created_at: createdAt,
        updated_by: currentUser,
        updated_at: nowStr
    };

    const $btnSave = $('button[onclick="saveMenuItem()"]');
    try {
        $btnSave.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入中...');

        if (mode === 'add') {
            await SheetAdapter.createRow('選單架構', menuId, rowDataArray);
            appState.menus.push(updatedNodeObj);
        } else {
            await SheetAdapter.updateRow('選單架構', menuId, rowDataArray);
            const index = appState.menus.findIndex(m => m.menu_id === menuId);
            if (index !== -1) {
                appState.menus[index] = updatedNodeObj;
            }
        }

        appState.selectedMenuId = menuId;
        refreshView();

        const modalEl = document.getElementById('menuModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) {
            modalInstance.hide();
        }

        AppToast.success(`節點【${menuId}】雲端儲存成功！`);
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btnSave.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存節點變更');
    }
}

function deleteCurrent() {
    if (!appState.selectedMenuId) {
        AppToast.warning("請先選取欲刪除的節點！");
        return;
    }
    deleteMenuItem(appState.selectedMenuId);
}

async function deleteMenuItem(menuId) {
    if (!confirm(`確定要自 Google 試算表中永久刪除節點【${menuId}】嗎？`)) return;

    try {
        await SheetAdapter.deleteRow('選單架構', menuId);

        appState.menus = appState.menus.filter(m => m.menu_id !== menuId);
        if (appState.selectedMenuId === menuId) {
            const nextNode = appState.menus.find(m => m.app_track === appState.currentPortal);
            appState.selectedMenuId = nextNode ? nextNode.menu_id : '';
        }
        refreshView();

        AppToast.success(`節點【${menuId}】已自雲端試算表刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗：" + err.message);
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
    AppToast.info('已匯出 JSON 選單檔案');
}

function exportCsv() {
    const csv = Papa.unparse(appState.menus);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sys_menus_${appState.currentPortal}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    AppToast.info('已匯出 CSV 選單主檔');
}

function expandAllTree() {
    $('.tree-node-item').show();
}

function collapseAllTree() {
    $('.tree-node-level-1, .tree-node-level-hide').toggle();
}