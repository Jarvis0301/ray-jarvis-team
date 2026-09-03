// ==========================================================================
// 1. Google 雲端試算表設定與核心常數
// ==========================================================================
const SPREADSHEET_ID = "1_plHUdfzIublSv1apN5qQ5reO6YxqBkI1MdnQeDbAxo";
const GAS_DEPLOY_ID = "AKfycbx7GPm_qU2K4OOuGdpfuinfr3vItvICOWJWerjb0TiqTv1k0x0y3fG8Y4dIPDunGH-v";
const SHEET_NAME = "據點倉儲"; // 對應表 301 psi_warehouses

/**
 * 試算表欄位索引安全取值工具函式 (依照索引順序取值)
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
    warehouses: [],
    currentFilter: 'ALL',
    searchKeyword: '',
    selectedWarehouseId: ''
};

let warehouseDataTableInstance = null;

// ==========================================================================
// 3. 生命週期初始化 (對接共用 AppReady)
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(GAS_DEPLOY_ID);
    }
    $('#current-timestamp').text(getFormattedNow());
    bindUIEvents();
    await fetchGoogleSheetsData();
    applyUIPermissions();
});

/**
 * 檢查當前登入者是否為最高管理者 (Ray 或 Jarvis)
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
// 4. 資料讀取引擎 (嚴格依據表 301 欄位順序解析，移除任何預設假資料)
// ==========================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步據點...', '載入最新結構');
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

            // 嚴格依欄位順序規則：跳過第 1 列欄位抬頭名稱
            return (parsed.data || []).slice(1);
        };

        const rawRows = await fetchSheet(SHEET_NAME);

        if (!rawRows || rawRows.length === 0) {
            appState.warehouses = [];
            refreshView();
            AppToast.info(`試算表『${SHEET_NAME}』目前無任何據點資料。`);
            return;
        }

        appState.warehouses = parseWarehouseTable(rawRows);
        refreshView();
        AppToast.success(`已成功自 Google 試算表同步 ${appState.warehouses.length} 處據點`);
    } catch (err) {
        console.error("Google Sheets 據點倉儲讀取失敗:", err);
        appState.warehouses = [];
        refreshView();
        AppToast.error(`試算表同步中斷: ${err.message}`);
    } finally {
        AppLoading.hide();
    }
}

/**
 * 依據表 301 欄位物理順序 (Index 0 ~ 14) 進行映射解析
 */
function parseWarehouseTable(rows) {
    return rows.map(r => {
        return {
            id: getVal(r, 0, ''),                                              // Col 0: id (PK)
            warehouse_name: getVal(r, 1, ''),                                  // Col 1: warehouse_name
            warehouse_type: getVal(r, 2, '官方營運中心'),                  // Col 2: warehouse_type
            country_code: getVal(r, 3, 'TW').toUpperCase(),                   // Col 3: country_code
            address: getVal(r, 4, ''),                                         // Col 4: address
            contact_phone: getVal(r, 5, ''),                                   // Col 5: contact_phone
            operating_hours: getVal(r, 6, ''),                                 // Col 6: operating_hours
            latitude: parseFloat(getVal(r, 7, '0')) || null,                  // Col 7: latitude
            longitude: parseFloat(getVal(r, 8, '0')) || null,                 // Col 8: longitude
            is_active: getVal(r, 9, 'Y').toUpperCase(),                        // Col 9: is_active
            remarks: getVal(r, 10, ''),                                        // Col 10: remarks (新欄位)
            created_by: getVal(r, 11, 'SYSTEM'),                               // Col 11: created_by
            created_at: getVal(r, 12, ''),                                     // Col 12: created_at
            modified_by: getVal(r, 13, 'SYSTEM'),                              // Col 13: modified_by
            modified_at: getVal(r, 14, '')                                      // Col 14: modified_at
        };
    }).filter(w => w.id && w.warehouse_name);
}

// ==========================================================================
// 5. 介面事件綁定與視圖渲染
// ==========================================================================
function bindUIEvents() {
    $('.filter-pill-btn').on('click', function() {
        $('.filter-pill-btn').removeClass('active');
        $(this).addClass('active');
        appState.currentFilter = $(this).data('filter');
        refreshView();
    });

    $('#quick-search').on('input', function() {
        appState.searchKeyword = $(this).val().toLowerCase().trim();
        refreshView();
    });

    $('#view-grid-btn').on('click', function() {
        $('#view-grid-btn').addClass('active');
        $('#view-table-btn').removeClass('active');
        $('#warehouse-grid-container').removeClass('d-none');
        $('#warehouse-table-container').addClass('d-none');
    });

    $('#view-table-btn').on('click', function() {
        $('#view-table-btn').addClass('active');
        $('#view-grid-btn').removeClass('active');
        $('#warehouse-grid-container').addClass('d-none');
        $('#warehouse-table-container').removeClass('d-none');
    });
}

function refreshView() {
    const filtered = getFilteredList();
    renderStats(appState.warehouses);
    renderGridCards(filtered);
    renderWarehouseDataTable(filtered);
    applyUIPermissions();
}

function getFilteredList() {
    return appState.warehouses.filter(w => {
        if (appState.currentFilter !== 'ALL' && w.warehouse_type !== appState.currentFilter) {
            return false;
        }
        if (appState.searchKeyword) {
            const matchId = w.id.toLowerCase().includes(appState.searchKeyword);
            const matchName = w.warehouse_name.toLowerCase().includes(appState.searchKeyword);
            const matchAddress = (w.address || '').toLowerCase().includes(appState.searchKeyword);
            const matchRemarks = (w.remarks || '').toLowerCase().includes(appState.searchKeyword);
            return matchId || matchName || matchAddress || matchRemarks;
        }
        return true;
    });
}

function renderStats(list) {
    const twCount = list.filter(w => w.country_code === 'TW').length;
    const myCount = list.filter(w => w.country_code === 'MY').length;
    const privateCount = list.filter(w => w.warehouse_type === '自用常備倉' || w.warehouse_type === 'PRIVATE_HUB').length;
    const activeCount = list.filter(w => w.is_active === 'Y').length;
    const activeRate = list.length ? Math.round((activeCount / list.length) * 100) : 0;

    $('#stat-tw-count').text(`${twCount} 處`);
    $('#stat-my-count').text(`${myCount} 處`);
    $('#stat-private-count').text(`${privateCount} 處`);
    $('#stat-active-rate').text(`${activeRate}%`);

    $('#count-all').text(list.length);
    $('#count-official').text(list.filter(w => w.warehouse_type === '官方營運中心' || w.warehouse_type === 'OFFICIAL_CENTER').length);
    $('#count-private').text(list.filter(w => w.warehouse_type === '自用常備倉' || w.warehouse_type === 'PRIVATE_HUB').length);
    $('#count-overseas').text(list.filter(w => w.warehouse_type === '海外商務倉' || w.warehouse_type === 'TRANSIT_OVERSEAS').length);
    $('#count-transit').text(list.filter(w => w.warehouse_type === '物流在途倉' || w.warehouse_type === 'LOGISTICS_IN_TRANSIT').length);
}

function renderGridCards(list) {
    const $container = $('#warehouse-grid-container').empty();

    if (list.length === 0) {
        $container.html(`
            <div class="col-12 text-center py-5 glass-panel">
                <i class="fa-solid fa-boxes-packing fa-3x text-secondary mb-3"></i>
                <div class="text-secondary">查無符合條件之據點倉儲</div>
            </div>
        `);
        return;
    }

    const hasAdminRights = isMasterAdmin();

    list.forEach(w => {
        const isActive = w.is_active === 'Y';
        const flagClass = (w.country_code || 'tw').toLowerCase() === 'my' ? 'flag-my' : 'flag-tw';
        
        // 呼叫 UIBadges.warehouse 共用標籤工廠
        const typeBadge = UIBadges.warehouse.type(w.warehouse_type);
        const statusBadge = isActive 
            ? '<span class="badge badge-success">營運中</span>'
            : '<span class="badge badge-danger">已停用</span>';

        const navUrl = (w.latitude && w.longitude)
            ? `https://www.google.com/maps/search/?api=1&query=${w.latitude},${w.longitude}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(w.address || w.warehouse_name)}`;

        const adminControls = hasAdminRights ? `
            <button class="btn btn-outline-secondary btn-sm py-1 px-2" onclick="openEditModal('${w.id}')" title="編輯據點">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-outline-danger btn-sm py-1 px-2 ms-1" onclick="deleteWarehouseItem('${w.id}')" title="刪除據點">
                <i class="fa-solid fa-trash-alt"></i>
            </button>
        ` : '';
        
        const address = w.address
            ? `${w.address}`
            : `<span class="text-muted">無</span>`;
        
        const contact_phone = w.contact_phone
            ? `${w.contact_phone}`
            : `<span class="mono-num text-muted">無</span>`;

        const operating_hours = w.operating_hours
            ? `${w.operating_hours}`
            : `<span class="text-muted">無</span>`;

        const remarksHtml = w.remarks ? `
            <div class="small text-warning-emphasis mb-2 text-truncate" title="${w.remarks}">
                <i class="fa-solid fa-note-sticky me-1 text-warning"></i> ${w.remarks}
            </div>
        ` : '';

        // 全面採用 common SCSS 的 .card 結構
        const cardHtml = `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="card h-100">
                    <div class="card-body d-flex flex-column justify-content-between p-3">
                        <div>
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <div class="d-flex align-items-center gap-2">
                                    <span class="flag-icon ${flagClass}"></span>
                                    <span class="mono-num text-info fw-bold">${w.id}</span>
                                </div>
                                <div class="d-flex align-items-center gap-1">
                                    ${typeBadge}
                                    ${statusBadge}
                                </div>
                            </div>

                            <h5 class="fw-bold text-white mb-2 text-truncate" title="${w.warehouse_name}">
                                ${w.warehouse_name}
                            </h5>

                            <div class="small text-secondary mb-2">
                                <i class="fa-solid fa-location-dot me-1"></i> 地址：${address}
                            </div>

                            <div class="small text-secondary mb-2">
                                <i class="fa-solid fa-phone me-1"></i> 電話：<span class="mono-num">${contact_phone}</span>
                            </div>

                            <div class="small text-secondary mb-2">
                                <i class="fa-solid fa-clock me-1"></i> 時間：${operating_hours}
                            </div>

                            ${remarksHtml}
                        </div>

                        <div class="d-flex justify-content-between align-items-center pt-2 border-top border-purple-subtle">
                            <div class="d-flex gap-1">
                                <a href="${navUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-secondary btn-sm py-1 px-2" title="地圖導航">
                                    <i class="fa-solid fa-location-arrow"></i> 導航
                                </a>
                                ${w.contact_phone ? `
                                    <a href="tel:${w.contact_phone}" class="btn btn-outline-secondary btn-sm py-1 px-2" title="撥打專線">
                                        <i class="fa-solid fa-phone"></i>
                                    </a>
                                ` : ''}
                            </div>
                            <div class="d-flex gap-1">
                                ${adminControls}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        $container.append(cardHtml);
    });
}

function renderWarehouseDataTable(list) {
    const formattedData = list.map(w => formatTableRow(w));

    if (warehouseDataTableInstance) {
        warehouseDataTableInstance.clear();
        warehouseDataTableInstance.rows.add(formattedData);
        warehouseDataTableInstance.draw();
    } else {
        warehouseDataTableInstance = $('#warehouse-datatable').DataTable({
            data: formattedData,
            order: [[1, "asc"]],
            pageLength: -1,
            columns: [
                { data: 'name' },
                { data: 'type' },
                { data: 'country' },
                { data: 'address' },
                { data: 'phone' },
                { data: 'hours' },
                { data: 'status' },
                { data: 'actions' }
            ]
        });
    }
}

function formatTableRow(w) {
    const hasAdminRights = isMasterAdmin();
    const flagClass = (w.country_code || 'tw').toLowerCase() === 'my' ? 'flag-my' : 'flag-tw';

    // 呼叫 UIBadges 共用標籤工廠
    const typeBadge = UIBadges.warehouse.type(w.warehouse_type);
    const countryBadge = UIBadges.common.country(w.country_code);

    const activePill = w.is_active === 'Y' 
        ? '<span class="badge badge-success">營運中</span>'
        : '<span class="badge badge-danger">已停用</span>';

    const actionButtons = hasAdminRights ? `
        <button class="btn btn-sm btn-outline-purple py-1 px-2" onclick="openEditModal('${w.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-outline-danger py-1 px-2 ms-1" onclick="deleteWarehouseItem('${w.id}')"><i class="fa-solid fa-trash-alt"></i></button>
    ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>';

    return {
        name: `
                <div class="d-flex align-items-center gap-2">
                    <div class="overflow-hidden">
                        <div class="fw-bold text-white">${w.warehouse_name}</div>
                        <div class="mono-num fw-bold text-info small">${w.id}</div>
                    </div>
                </div>
            `,
        type: typeBadge,
        country: countryBadge,
        address: `<div class="text-secondary text-wrap" style="max-width: 250px;">${w.address || '-'}</div>`,
        phone: `<span class="mono-num">${w.contact_phone || '-'}</span>`,
        hours: `<span class="text-secondary text-wrap" style="max-width: 200px;">${w.operating_hours || '-'}</span>`,
        status: activePill,
        actions: actionButtons
    };
}

// ==========================================================================
// 6. Modal 表單操作 (嚴格依據表 301 欄位物理順序寫入)
// ==========================================================================
function openAddModal() {
    $('#warehouseModalLabel').html('<i class="fa-solid fa-plus text-primary"></i> 新增據點倉儲');
    $('#formMode').val('add');
    $('#warehouseForm')[0].reset();
    $('#fieldId').prop('readonly', false).val('');
    $('#fieldType').val('官方營運中心'); // 預設值設為中文
    $('#fieldCountry').val('TW');
    $('#fieldRemarks').val('');
    $('#fieldIsActive').prop('checked', true);
    $('#fieldCreatedAt').val('');
    $('#fieldCreatedBy').val('');
    new bootstrap.Modal(document.getElementById('warehouseModal')).show();
}

function openEditModal(warehouseId) {
    const w = appState.warehouses.find(item => item.id === warehouseId);
    if (!w) return;

    $('#warehouseModalLabel').html('<i class="fa-solid fa-pen-to-square text-primary"></i> 編輯據點倉儲');
    $('#formMode').val('edit');
    $('#fieldId').prop('readonly', true).val(w.id);
    $('#fieldName').val(w.warehouse_name);
    $('#fieldType').val(w.warehouse_type);
    $('#fieldCountry').val(w.country_code);
    $('#fieldAddress').val(w.address);
    $('#fieldPhone').val(w.contact_phone);
    $('#fieldHours').val(w.operating_hours);
    $('#fieldLongitude').val(w.longitude || '');
    $('#fieldLatitude').val(w.latitude || '');
    $('#fieldRemarks').val(w.remarks || '');
    $('#fieldIsActive').prop('checked', w.is_active === 'Y');
    $('#fieldCreatedAt').val(w.created_at);
    $('#fieldCreatedBy').val(w.created_by);

    new bootstrap.Modal(document.getElementById('warehouseModal')).show();
}

async function saveWarehouseItem() {
    const mode = $('#formMode').val();
    const id = $('#fieldId').val().trim();
    const name = $('#fieldName').val().trim();

    if (!id || !name) {
        AppToast.warning("據點代碼與據點名稱為必填欄位！");
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();

    const existing = appState.warehouses.find(w => w.id === id);
    const createdBy = (mode === 'edit' && existing) ? (existing.created_by || currentUser) : currentUser;
    const createdAt = (mode === 'edit' && existing) ? (existing.created_at || nowStr) : nowStr;

    // 嚴格依照表 301 psi_warehouses 物理順序 (Index 0 ~ 14) 組裝
    const rowDataArray = [
        id,                                                     // Col 0: id
        name,                                                   // Col 1: warehouse_name
        $('#fieldType').val(),                                  // Col 2: warehouse_type
        $('#fieldCountry').val().toUpperCase(),                 // Col 3: country_code
        $('#fieldAddress').val().trim(),                        // Col 4: address
        $('#fieldPhone').val().trim(),                          // Col 5: contact_phone
        $('#fieldHours').val().trim(),                          // Col 6: operating_hours
        $('#fieldLatitude').val().trim() || '',                 // Col 7: latitude
        $('#fieldLongitude').val().trim() || '',                // Col 8: longitude
        $('#fieldIsActive').is(':checked') ? 'Y' : 'N',         // Col 9: is_active
        $('#fieldRemarks').val().trim(),                        // Col 10: remarks (新欄位)
        createdBy,                                              // Col 11: created_by
        createdAt,                                              // Col 12: created_at
        currentUser,                                            // Col 13: modified_by
        nowStr                                                  // Col 14: modified_at
    ];

    const updatedObj = {
        id: id,
        warehouse_name: name,
        warehouse_type: $('#fieldType').val(),
        country_code: $('#fieldCountry').val().toUpperCase(),
        address: $('#fieldAddress').val().trim(),
        contact_phone: $('#fieldPhone').val().trim(),
        operating_hours: $('#fieldHours').val().trim(),
        latitude: parseFloat($('#fieldLatitude').val()) || null,
        longitude: parseFloat($('#fieldLongitude').val()) || null,
        is_active: $('#fieldIsActive').is(':checked') ? 'Y' : 'N',
        remarks: $('#fieldRemarks').val().trim(),
        created_by: createdBy,
        created_at: createdAt,
        modified_by: currentUser,
        modified_at: nowStr
    };

    const $btnSave = $('button[onclick="saveWarehouseItem()"]');
    try {
        $btnSave.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入中...');

        if (window.SheetAdapter) {
            if (mode === 'add') {
                await SheetAdapter.createRow(SHEET_NAME, id, rowDataArray);
                appState.warehouses.push(updatedObj);
            } else {
                await SheetAdapter.updateRow(SHEET_NAME, id, rowDataArray);
                const index = appState.warehouses.findIndex(w => w.id === id);
                if (index !== -1) appState.warehouses[index] = updatedObj;
            }
        } else {
            if (mode === 'add') {
                appState.warehouses.push(updatedObj);
            } else {
                const index = appState.warehouses.findIndex(w => w.id === id);
                if (index !== -1) appState.warehouses[index] = updatedObj;
            }
        }

        refreshView();

        const modalEl = document.getElementById('warehouseModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        AppToast.success(`據點【${id}】資料儲存成功！`);
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    } finally {
        $btnSave.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存據點資料');
    }
}

async function deleteWarehouseItem(warehouseId) {
    const confirmed = await AppDialog.confirm(`確定要自 Google 試算表中永久刪除據點【${warehouseId}】嗎？`, {
        title: '刪除確認',
        confirmText: '確定刪除',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    try {
        if (window.SheetAdapter) {
            await SheetAdapter.deleteRow(SHEET_NAME, warehouseId);
        }
        appState.warehouses = appState.warehouses.filter(w => w.id !== warehouseId);
        refreshView();
        AppToast.success(`據點【${warehouseId}】已自雲端試算表刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗：" + err.message);
    }
}