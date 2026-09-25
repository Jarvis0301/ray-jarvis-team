/**
 * ============================================================================
 * 榮祥團隊戰術控制台 - 客戶模組戰術中樞 (crm-customers.js)
 * 專為「榮祥團隊（Ray's Team）」量身打造
 * 核心功能：
 * 1. 貫徹自然人 SSOT 原則：客戶主檔 (CRM) 與個人主檔/通訊/語言 (PSN) 雙向原子 CRUD
 * 2. 系統識別碼自動生成防禦：CST-000001 (客戶) 與 PSN-000001 (自然人) 唯讀鎖定
 * 3. 視圖呈現：卡片視圖、客戶總表 DataTable、轉化歷程、9 大多維戰情統計圖表
 * 4. 360° 全景戰術檔案檢視，結構樣式完全比照 org-partners
 * ============================================================================
 */

// ============================================================================
// 1. 核心常數與全域狀態 (Constants & State)
// ============================================================================
const SPREADSHEET_ID = {
    CRM: APP_CONFIG.SHEETS.CRM,
    PSN: APP_CONFIG.SHEETS.PSN,
    ORG: APP_CONFIG.SHEETS.ORG
};

const GAS_DEPLOY_ID = {
    CRM: APP_CONFIG.GAS.CRM,
    PSN: APP_CONFIG.GAS.PSN,
    ORG: APP_CONFIG.GAS.ORG
};

const SHEET_NAMES = {
    CUSTOMERS: APP_CONFIG.SHEET_NAMES.CRM.CUSTOMERS,      // 表 501
    CONVERSIONS: APP_CONFIG.SHEET_NAMES.CRM.CONVERSIONS,    // 表 502
    PERSONS: APP_CONFIG.SHEET_NAMES.PSN.PERSON,        // 表 201
    CONTACTS: APP_CONFIG.SHEET_NAMES.PSN.PERSON_CONTACTS,       // 人員通訊
    LANGUAGES: APP_CONFIG.SHEET_NAMES.PSN.PERSON_LANGUAGES,      // 人員語言
    PARTNERS: APP_CONFIG.SHEET_NAMES.ORG.PARTNERS,       // 表 202
    RELATIONS: APP_CONFIG.SHEET_NAMES.ORG.RELATIONS       // 組織血緣閉包表
};

const DEFAULT_AVATARS = {
    '男': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    '女': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    '其他': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    '未填': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
};

// 本地記憶體狀態
let customersList = [];
let conversionsList = [];
let personMasterList = [];
let partnerMasterList = [];
let personContactsList = [];
let personLanguagesList = [];
let orgRelationsList = [];

let customerDataTable = null;
let conversionsDataTable = null;
let activeViewingCustomerId = null;

// ============================================================================
// 2. 系統生命週期與初始化 (Lifecycle & Init)
// ============================================================================
window.addEventListener('AppReady', async function () {
    if (window.SheetAdapter && GAS_DEPLOY_ID.CRM) {
        SheetAdapter.init(GAS_DEPLOY_ID.CRM);
    }
    populateRegionDropdowns();
    populateNationalityFilter();
    populateNationalityDropdown('中華民國');
    populateEthnicityDropdown('華人');
    initFilterOptions();
    bindEvents();
    initDynamicTableDragAndDrop('#form-contacts-dynamic-tbody');
    initDynamicTableDragAndDrop('#form-languages-dynamic-tbody');

    // 讀取遠端雲端試算表資料
    await fetchGoogleSheetsData();
});

function initFilterOptions() {
    UISelectOptions.core.render({
        target: '#filter-customer-type',
        data: ['潛在對象', '一般零售', 'VIP顧客', '事業種子', '已轉夥伴'],
        placeholder: '全部身分'
    });

    UISelectOptions.core.render({
        target: '#filter-pipeline-stage',
        data: ['新線索', '需求確認', '試用體驗', '異議排除', '規律自用', '培育暫緩'],
        placeholder: '全部階段'
    });

    UISelectOptions.core.render({
        target: '#filter-source-channel',
        data: ['線上陌開', '線下陌開', '社群矩陣', '健康問卷', '親朋好友', '轉介紹', '茶會活動', '其他'],
        placeholder: '全部來源'
    });

    UISelectOptions.core.render({
        target: '#filter-status',
        data: ['活躍跟進', '沉睡列管', '爭議凍結', '封存歸檔'],
        placeholder: '全部狀態'
    });
}

function bindEvents() {
    // 監聽 10 大篩選欄位變更即時重繪視圖
    $('.form-filter-control').on('change', function () {
        refreshView();
    });

    $('#viewModeTabs button[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        const target = $(e.target).attr('data-bs-target');
        if (target === '#container-table-view' && customerDataTable) {
            customerDataTable.columns.adjust().draw();
        } else if (target === '#container-conversions-view' && conversionsDataTable) {
            conversionsDataTable.columns.adjust().draw();
        } else if (target === '#container-charts-view') {
            renderChartsView();
        }
    });

    // 表單性別與預設頭像連動
    $('#form-gender').on('change', function () {
        const selectedGender = $(this).val();
        const currentUrl = $('#form-avatar-url').val().trim();
        if (!currentUrl || Object.values(DEFAULT_AVATARS).includes(currentUrl)) {
            const newAvatar = getDefaultAvatar(selectedGender);
            $('#form-preview-avatar').attr('src', newAvatar);
        }
    });

    $('#form-avatar-url').on('input', function () {
        const url = $(this).val().trim();
        const gender = $('#form-gender').val() || '男';
        $('#form-preview-avatar').attr('src', url || getDefaultAvatar(gender));
    });

    // 存歿狀態連動身故日期
    $('#form-life-status').on('change', function () {
        if ($(this).val() === '身故') {
            $('#deceased-date-container').slideDown(200);
        } else {
            $('#deceased-date-container').slideUp(200);
            $('#form-deceased-date').val('');
        }
    });

    // 客戶表單送出監聽
    $('#customerForm').on('submit', submitCustomerForm);

    $('#btn-view-to-edit').on('click', function () {
        bootstrap.Modal.getInstance(document.getElementById('customerViewModal'))?.hide();
        if (activeViewingCustomerId) {
            setTimeout(() => openCustomerModalForEdit(activeViewingCustomerId), 250);
        }
    });
}

// ============================================================================
// 3. 系統主鍵自動生成演算法 (Auto-Generated IDs)
// ============================================================================
function generateNextCustomerId() {
    if (!customersList || customersList.length === 0) return 'CST-000001';
    const seqs = customersList.map(c => {
        const m = (c.customer_id || '').match(/CST-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
    }).filter(n => !isNaN(n));
    const nextSeq = (seqs.length > 0 ? Math.max(...seqs) : 0) + 1;
    return `CST-${String(nextSeq).padStart(6, '0')}`;
}

function generateNextPersonId() {
    if (!personMasterList || personMasterList.length === 0) return 'PSN-000001';
    const seqNumbers = personMasterList.map(p => {
        const idStr = String(p.person_id || '').trim();
        const match = idStr.match(/(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
    }).filter(n => !isNaN(n));
    const maxSeq = seqNumbers.length > 0 ? Math.max(...seqNumbers) : 0;
    return `PSN-${String(maxSeq + 1).padStart(6, '0')}`;
}

function generateNextPartnerId() {
    if (!partnerMasterList || partnerMasterList.length === 0) return 'PTN-0001';
    const seqNumbers = partnerMasterList.map(p => {
        const idStr = String(p.partner_id || '').trim();
        const match = idStr.match(/(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
    }).filter(n => !isNaN(n));
    const maxSeq = seqNumbers.length > 0 ? Math.max(...seqNumbers) : 0;
    return `PTN-${String(maxSeq + 1).padStart(4, '0')}`;
}

function calculateRelationAndTeamStatus(partnerId, placementId, sponsorId, nodeNature = '常態夥伴') {
    const CORE_IDS = ['PTN-0001', 'PTN-0002', 'PTN-001', 'PTN-002'];
    if (CORE_IDS.includes(partnerId)) return { relationType: '核心成員', isOurTeam: 'Y' };
    if (nodeNature === '中繼失聯節點' || nodeNature === '虛擬佔位' || nodeNature === '幽靈節點') return { relationType: '中繼層', isOurTeam: 'N' };

    const parentId = placementId || sponsorId;
    let currentId = parentId;
    const visited = new Set();
    while (currentId && !visited.has(currentId)) {
        if (CORE_IDS.includes(currentId)) return { relationType: '下線', isOurTeam: 'Y' };
        visited.add(currentId);
        const parentNode = partnerMasterList.find(p => p.partner_id === currentId || p.member_no === currentId);
        currentId = parentNode ? (parentNode.placement_id || parentNode.sponsor_id) : null;
    }
    return { relationType: '下線', isOurTeam: 'Y' };
}

async function syncOrgRelationsRecord(descendantId, ancestorId, linkType, gapCount, relationLine, currentUser, nowStr) {
    if (!descendantId) return;
    const silentOpt = { silent: true };
    const targetLine = relationLine || '安置排線';

    const getNextAutoIncrementId = () => {
        if (!orgRelationsList || orgRelationsList.length === 0) return 1;
        const validIds = orgRelationsList.map(r => parseInt(String(r.id).replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
        return validIds.length > 0 ? Math.max(...validIds) + 1 : 1;
    };

    // 1. 寫入自體參照 (depth = 0)
    let selfRel = orgRelationsList.find(r => r.ancestor_id === descendantId && r.descendant_id === descendantId && r.relation_line === targetLine);
    if (!selfRel) {
        const selfId = String(getNextAutoIncrementId());
        const selfRow = [selfId, descendantId, descendantId, 0, 'Y', '精確血緣', targetLine, descendantId, currentUser, nowStr, currentUser, nowStr];
        await SheetAdapter.createRow(SHEET_NAMES.RELATIONS, selfId, selfRow, GAS_DEPLOY_ID.ORG, silentOpt);
        orgRelationsList.push({ id: selfId, ancestor_id: descendantId, descendant_id: descendantId, depth: 0, is_depth_exact: 'Y', link_nature: '精確血緣', relation_line: targetLine, path_trace: descendantId });
    }

    if (!ancestorId || ancestorId === 'ROOT' || ancestorId === 'SYSTEM_ROOT' || linkType === '體系頂層') return;

    // 2. 計算直屬間隔
    const numGaps = parseInt(gapCount, 10) || 0;
    let directDepth = 1;
    let isDirectExact = 'Y';
    let directLinkNature = '精確血緣';
    if (linkType === '已知人數斷層' && numGaps > 0) {
        directDepth = numGaps + 1;
        directLinkNature = '已知人數斷層';
    } else if (linkType === '中間未知' || linkType === '未知斷層直連') {
        directDepth = 1;
        isDirectExact = 'N';
        directLinkNature = '未知斷層直連';
    }

    // 3. 繼承安置上線的所有祖先路徑鏈
    const ancestorRows = orgRelationsList.filter(r => r.descendant_id === ancestorId && r.relation_line === targetLine);
    for (const aRow of ancestorRows) {
        const targetId = String(getNextAutoIncrementId());
        const totalDepth = aRow.depth + directDepth;
        const totalExact = (aRow.is_depth_exact === 'Y' && isDirectExact === 'Y') ? 'Y' : 'N';
        const totalNature = (aRow.ancestor_id === ancestorId) ? directLinkNature : aRow.link_nature;
        const trace = `${aRow.path_trace}/${descendantId}`;

        const newRow = [targetId, aRow.ancestor_id, descendantId, totalDepth, totalExact, totalNature, targetLine, trace, currentUser, nowStr, currentUser, nowStr];
        await SheetAdapter.createRow(SHEET_NAMES.RELATIONS, targetId, newRow, GAS_DEPLOY_ID.ORG, silentOpt);
        orgRelationsList.push({ id: targetId, ancestor_id: aRow.ancestor_id, descendant_id: descendantId, depth: totalDepth, is_depth_exact: totalExact, link_nature: totalNature, relation_line: targetLine, path_trace: trace });
    }
}

// ============================================================================
// 4. 下拉選單與輔助工具 (Select2 & Dropdowns)
// ============================================================================
function populateRegionDropdowns() {
    const customRegions = personMasterList.map(p => (p.current_residence || '').trim()).filter(Boolean);

    // 篩選區塊：現居地 / 行政區
    UISelectOptions.geo.populateRegionsDropdown({
        target: '#filter-current-residence',
        placeholder: '全部地區',
        customRegions: customRegions,
        selectedValue: $('#filter-current-residence').val() || ''
    });

    // 表單：現居地
    UISelectOptions.geo.populateRegionsDropdown({
        target: '#form-current-residence',
        placeholder: '請選擇或輸入居住地...',
        customRegions: customRegions,
        dropdownParent: '#customerDetailModal'
    });

    // 表單：家鄉
    UISelectOptions.geo.populateRegionsDropdown({
        target: '#form-hometown',
        placeholder: '請選擇或輸入家鄉...',
        customRegions: customRegions,
        dropdownParent: '#customerDetailModal'
    });
}

function populateNationalityDropdown(selectedValue = '中華民國') {
    const defaultNationalities = ['中華民國', '馬來西亞', '新加坡', '中國', '日本', '其他'];
    UISelectOptions.core.render({
        target: '#form-nationality',
        data: defaultNationalities,
        placeholder: '請選擇或輸入國籍...',
        selectedValue: selectedValue,
        searchable: true,
        creatable: true,
        grouped: false,
        dropdownParent: '#customerDetailModal'
    });
}

function populateEthnicityDropdown(selectedValue = '華人') {
    const defaultEthnicities = ['華人', '馬來人', '印度人', '原住民', '其他'];
    UISelectOptions.core.render({
        target: '#form-ethnicity',
        data: defaultEthnicities,
        placeholder: '請選擇或輸入種族...',
        selectedValue: selectedValue,
        searchable: true,
        creatable: true,
        grouped: false,
        dropdownParent: '#customerDetailModal'
    });
}

function setSelect2TagVal(selector, val, defaultVal = '') {
    const $el = $(selector);
    const targetVal = (val !== undefined && val !== null && String(val).trim() !== '') ? String(val).trim() : defaultVal;
    if (!targetVal) {
        $el.val('').trigger('change');
        return;
    }
    if ($el.find(`option[value="${targetVal}"]`).length === 0) {
        const newOption = new Option(targetVal, targetVal, true, true);
        $el.append(newOption).trigger('change');
    } else {
        $el.val(targetVal).trigger('change');
    }
}

/**
 * 填充頂部快篩的國籍選單 (含預設國籍與現有名單自訂國籍)
 */
function populateNationalityFilter() {
    const defaultNationalities = ['中華民國', '馬來西亞', '中國', '新加坡', '日本', '其他'];
    const natSet = new Set(defaultNationalities);
    
    personMasterList.forEach(p => {
        let n = (p.nationality || '').trim();
        if (n === '台灣' || n === 'TW') n = '中華民國';
        if (n) natSet.add(n);
    });

    UISelectOptions.core.render({
        target: '#filter-nationality',
        data: Array.from(natSet),
        placeholder: '全部國籍',
        selectedValue: $('#filter-nationality').val() || '',
        searchable: false,
        creatable: false,
        grouped: false
    });
}

function populateDynamicSelects() {
    // 負責夥伴快篩
    UISelectOptions.partner.populate({
        target: '#filter-assigned-partner',
        partners: partnerMasterList,
        persons: personMasterList,
        displayMode: 2, // 模式 2：姓名 (member no) [partner id]
        placeholder: '(無)',
        searchable: true
    });

    // 表單負責夥伴
    UISelectOptions.partner.populate({
        target: '#form-assigned-partner-id',
        partners: partnerMasterList,
        persons: personMasterList,
        displayMode: 2, // 模式 2：姓名 (member no) [partner id]
        placeholder: '(無)',
        searchable: true,
        dropdownParent: '#customerDetailModal'
    });

    // 結轉夥伴引薦人
    UISelectOptions.partner.populate({
        target: '#convert-sponsor-id',
        partners: partnerMasterList,
        persons: personMasterList,
        displayMode: 2, // 模式 2：姓名 (member no) [partner id]
        placeholder: '(無)',
        searchable: true,
        dropdownParent: '#customerConvertModal'
    });

    // 轉介推薦人（改用 UISelectOptions 客戶選單）
    UISelectOptions.customer.populate({
        target: '#form-source-referrer-id',
        customers: customersList,
        persons: personMasterList,
        displayMode: 2, // 模式 2：姓名 (member no) [partner id]
        placeholder: '(無)',
        searchable: true,
        dropdownParent: '#customerDetailModal'
    });
}

function initDynamicTableDragAndDrop(tbodySelector) {
    const $tbody = $(tbodySelector);
    let draggingRow = null;

    $tbody.off('dragstart', 'tr').on('dragstart', 'tr', function (e) {
        draggingRow = this;
        $(this).addClass('is-dragging-row');
        e.originalEvent.dataTransfer.effectAllowed = 'move';
        e.originalEvent.dataTransfer.setData('text/plain', '');
    });

    $tbody.off('dragover', 'tr').on('dragover', 'tr', function (e) {
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = 'move';
        const targetRow = this;
        if (targetRow && targetRow !== draggingRow) {
            const rect = targetRow.getBoundingClientRect();
            const isAfter = (e.originalEvent.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
            $tbody[0].insertBefore(draggingRow, isAfter ? targetRow.nextSibling : targetRow);
        }
    });

    $tbody.off('dragend', 'tr').on('dragend', 'tr', function () {
        $(this).removeClass('is-dragging-row');
        draggingRow = null;
    });
}

// ============================================================================
// 5. 雲端資料庫讀取與解析引擎 (Data Fetch & Parse)
// ============================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i>正在讀取雲端資料庫...', '載入中...');
    try {
        const [custRows, convRows, personRows, partnerRows, contactsRows, langRows, relationsRows] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_ID.CRM, SHEET_NAMES.CUSTOMERS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.CRM, SHEET_NAMES.CONVERSIONS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSN, SHEET_NAMES.PERSONS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.ORG, SHEET_NAMES.PARTNERS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSN, SHEET_NAMES.CONTACTS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSN, SHEET_NAMES.LANGUAGES).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.ORG, SHEET_NAMES.RELATIONS).catch(() => [])
        ]);

        if (personRows.length > 0) personMasterList = parsePersonMasterTable(personRows);
        if (partnerRows.length > 0) partnerMasterList = parsePartnerMasterTable(partnerRows);
        if (contactsRows.length > 0) personContactsList = parseContactsTable(contactsRows);
        if (langRows.length > 0) personLanguagesList = parseLanguagesTable(langRows);
        if (custRows.length > 0) customersList = parseCustomersTable(custRows);
        if (convRows.length > 0) conversionsList = parseConversionsTable(convRows);
        if (relationsRows.length > 0) orgRelationsList = parseOrgRelationsTable(relationsRows);

        populateRegionDropdowns();
        populateNationalityFilter();
        populateDynamicSelects();
        refreshView();
        AppToast.success(`成功同步 ${customersList.length} 筆客戶資料！`);
    } catch (err) {
        console.error('[CRM] 載入資料庫失敗:', err);
        AppToast.error('讀取雲端資料庫失敗: ' + err.message);
    } finally {
        AppLoading.hide();
    }
}

function parsePersonMasterTable(rows) {
    return rows.map((r, idx) => ({
        person_id: getVal(r, 0, `PSN-${String(idx + 1).padStart(6, '0')}`),
        name_zh: getVal(r, 1, ''),
        name_en: getVal(r, 2, ''),
        preferred_name: getVal(r, 3, ''),
        display_name: getVal(r, 4, ''),
        identity_type: getVal(r, 5, '客戶'),
        usage_identity: getVal(r, 6, '消費者'),
        gender: getVal(r, 7, '未填'),
        birthday: getVal(r, 8, ''),
        deceased_date: getVal(r, 9, ''),
        life_status: getVal(r, 10, '存活'),
        marital_status: getVal(r, 11, ''),
        nationality: getVal(r, 12, '中華民國'),
        ethnicity: getVal(r, 13, '華人'),
        hometown: getVal(r, 14, ''),
        current_residence: getVal(r, 15, ''),
        phone: getVal(r, 16, ''),
        email: getVal(r, 17, ''),
        contact_address: getVal(r, 18, ''),
        met_date: getVal(r, 19, ''),
        met_reason: getVal(r, 20, ''),
        highest_education: getVal(r, 21, ''),
        graduated_school: getVal(r, 22, ''),
        graduation_status: getVal(r, 23, ''),
        occupation_background: getVal(r, 24, ''),
        health_status: getVal(r, 25, '良好'),
        financial_status: getVal(r, 26, '穩定'),
        avatar_url: getVal(r, 27, ''),
        career_education_notes: getVal(r, 28, ''),
        health_notes: getVal(r, 29, ''),
        financial_notes: getVal(r, 30, ''),
        consumption_notes: getVal(r, 31, ''),
        notes: getVal(r, 32, ''), // ★ 索引 32：個人通用備註
        created_by: getVal(r, 33, 'SYSTEM'),
        created_at: getVal(r, 34, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 35, 'SYSTEM'),
        modified_at: getVal(r, 36, '2026-01-01 00:00:00')
    })).filter(p => p.person_id && String(p.person_id).trim() !== '');
}

function parseCustomersTable(rows) {
    return rows.map(r => ({
        customer_id: getVal(r, 0),
        person_id: getVal(r, 1),
        customer_type: getVal(r, 2, '潛在對象'),
        pipeline_stage: getVal(r, 3, '新線索'),
        source_channel: getVal(r, 4, '線上陌開'),
        source_referrer_id: getVal(r, 5, ''),
        assigned_partner_id: getVal(r, 6, ''),
        status: getVal(r, 7, '活躍跟進'),
        first_order_date: getVal(r, 8, ''),
        last_contact_date: getVal(r, 9, ''),
        customer_tags: getVal(r, 10, ''),
        notes: getVal(r, 11, ''),
        created_by: getVal(r, 12, 'SYSTEM'),
        created_at: getVal(r, 13, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 14, 'SYSTEM'),
        modified_at: getVal(r, 15, '2026-01-01 00:00:00')
    })).filter(c => c.customer_id);
}

function parseConversionsTable(rows) {
    return rows.map(r => ({
        conversion_id: getVal(r, 0),
        customer_id: getVal(r, 1),
        converted_partner_id: getVal(r, 2),
        conversion_type: getVal(r, 3, '零售客轉經銷'),
        conversion_date: getVal(r, 4),
        contract_no: getVal(r, 5, ''),
        sponsor_partner_id: getVal(r, 6, ''),
        historical_spend_total: parseFloat(getVal(r, 7, '0')) || 0,
        historical_sv_total: parseInt(getVal(r, 8, '0'), 10) || 0,
        conversion_notes: getVal(r, 9, '')
    })).filter(cv => cv.conversion_id);
}

function parsePartnerMasterTable(rows) {
    return rows.map(r => ({
        partner_id: getVal(r, 0),
        person_id: getVal(r, 1),
        member_no: getVal(r, 2, ''),
        leader_title: getVal(r, 3, ''),
        account_holder_type: getVal(r, 4, '個人經營者'),
        official_account_partner_id: getVal(r, 5, ''),
        operation_mode: getVal(r, 6, '個人經營'),
        spouse_partner_id: getVal(r, 7, '')
    })).filter(pt => pt.partner_id);
}

function parseContactsTable(rows) {
    return rows.map((r, idx) => ({
        contact_id: getVal(r, 0, String(idx + 1)),
        person_id: getVal(r, 1, ''),
        platform_name: getVal(r, 2, 'LINE'),
        category: getVal(r, 3, 'ID'),
        contact_value: getVal(r, 4, ''),
        is_primary: getVal(r, 5, 'N'),
        notes: getVal(r, 6, '')
    })).filter(c => c.person_id);
}

function parseLanguagesTable(rows) {
    return rows.map((r, idx) => ({
        lang_id: getVal(r, 0, String(idx + 1)),
        person_id: getVal(r, 1, ''),
        language_name: getVal(r, 2, '中文'),
        listening_level: getVal(r, 3, '普通'),
        speaking_level: getVal(r, 4, '普通'),
        reading_level: getVal(r, 5, '普通'),
        writing_level: getVal(r, 6, '普通'),
        notes: getVal(r, 7, '')
    })).filter(l => l.person_id);
}

function parseOrgRelationsTable(rows) {
    return rows.map((r, idx) => ({
        id: getVal(r, 0, String(idx + 1)),
        ancestor_id: getVal(r, 1, ''),
        descendant_id: getVal(r, 2, ''),
        depth: parseInt(getVal(r, 3, '0'), 10) || 0,
        is_depth_exact: getVal(r, 4, 'Y'),
        link_nature: getVal(r, 5, '精確血緣'),
        relation_line: getVal(r, 6, '安置排線'),
        path_trace: getVal(r, 7, '')
    })).filter(rel => rel.ancestor_id && rel.descendant_id);
}

// ============================================================================
// 6. 共用格式化工具 (Formatters & Utilities)
// ============================================================================
function getPersonMaster(personId) {
    return personMasterList.find(p => p.person_id === personId) || {};
}

function getDefaultAvatar(gender = '男') {
    return DEFAULT_AVATARS[gender] || DEFAULT_AVATARS['男'];
}

function formatEmpty(val, placeholder = '-') {
    if (val === undefined || val === null || String(val).trim() === '' || String(val).trim() === '未填寫' || String(val).trim() === '未設定') {
        return `<span class="text-muted">${placeholder}</span>`;
    }
    return String(val).trim();
}

// ============================================================================
// 7. 複合篩選與畫面重繪 (Filters & Rendering)
// ============================================================================
function getFilteredCustomers() {
    const fResidence = $('#filter-current-residence').val();
    const fType = $('#filter-customer-type').val();
    const fIdentity = $('#filter-identity-type').val();
    const fUsage = $('#filter-usage-identity').val();
    const fHealth = $('#filter-health-status').val();
    const fFinancial = $('#filter-financial-status').val();
    const fStage = $('#filter-pipeline-stage').val();
    const fChannel = $('#filter-source-channel').val();
    const fStatus = $('#filter-status').val();
    const fPartner = $('#filter-assigned-partner').val();
    const fGender = $('#filter-gender').val();
    const fNationality = $('#filter-nationality').val();

    return customersList.filter(c => {
        const person = getPersonMaster(c.person_id);

        if (fResidence && person.current_residence !== fResidence) return false;
        if (fType && c.customer_type !== fType) return false;
        if (fIdentity && person.identity_type !== fIdentity) return false;
        if (fUsage && person.usage_identity !== fUsage) return false;
        if (fHealth && person.health_status !== fHealth) return false;
        if (fFinancial && person.financial_status !== fFinancial) return false;
        if (fStage && c.pipeline_stage !== fStage) return false;
        if (fChannel && c.source_channel !== fChannel) return false;
        if (fStatus && c.status !== fStatus) return false;
        if (fPartner && c.assigned_partner_id !== fPartner) return false;
        if (fGender && person.gender !== fGender) return false;
        
        if (fNationality) {
            let pNat = (person.nationality || '').trim();
            if (pNat === '台灣' || pNat === 'TW') pNat = '中華民國';
            if (pNat !== fNationality) return false;
        }

        return true;
    });
}

function refreshView() {
    const filtered = getFilteredCustomers();
    updateHudCounters();
    renderCardsView(filtered);
    reloadCustomerDataTable(filtered);
    reloadConversionsDataTable(conversionsList);
    
    // 若當前在統計圖表頁籤，即時重繪圖表
    if ($('#container-charts-view').hasClass('active')) {
        renderChartsView(filtered);
    }
}

function updateHudCounters() {
    const total = customersList.length;
    const potential = customersList.filter(c => c.customer_type === '潛在對象').length; // ★ 新增
    const retail = customersList.filter(c => c.customer_type === '一般零售').length;
    const vip = customersList.filter(c => c.customer_type === 'VIP顧客').length;
    const seed = customersList.filter(c => c.customer_type === '事業種子').length;
    const converted = customersList.filter(c => c.customer_type === '已轉夥伴').length;

    $('#hud-total-customers').text(total.toLocaleString());
    $('#hud-potential-customers').text(potential.toLocaleString()); // ★ 新增
    $('#hud-retail-customers').text(retail.toLocaleString());
    $('#hud-vip-customers').text(vip.toLocaleString());
    $('#hud-seed-customers').text(seed.toLocaleString());
    $('#hud-converted-customers').text(converted.toLocaleString());
}

function renderCardsView(dataList) {
    const $container = $('#customer-cards-grid').empty();
    if (!dataList || dataList.length === 0) {
        $container.html('<div class="col-12 text-center text-muted py-5"><i class="fa-solid fa-user-slash fa-2x mb-2"></i><br>目前條件下無符合之客戶記錄</div>');
        return;
    }

    dataList.forEach(c => {
        const person = getPersonMaster(c.person_id);
        const gender = person.gender || '男';
        const avatarUrl = person.avatar_url || getDefaultAvatar(gender);
        const partnerNameOnly = EntityResolver.partner(c.assigned_partner_id, partnerMasterList, personMasterList, 1);
        const borderClass = c.customer_type === '事業種子' ? 'is-seed' : (c.customer_type === 'VIP顧客' ? 'is-vip' : (c.customer_type === '已轉夥伴' ? 'is-converted' : ''));
        const tagsHtml = (c.customer_tags || '').split(',').filter(Boolean).map(t => `<span class="badge-tag">${t.trim()}</span>`).join(' ');

        const nationalityDisplay = (person.nationality && person.nationality.trim()) ? person.nationality.trim() : '中華民國';
        const ethnicityDisplay = (person.ethnicity && person.ethnicity.trim()) ? person.ethnicity.trim() : '華人';
        const nationalityEthnicityHtml = `${nationalityDisplay} ‧ ${ethnicityDisplay}`;
        const ageStr = AppDate.toAgeDisplay(person.birthday, person.deceased_date, '');
        const genderDisplay = (person.gender && person.gender !== '未填') ? person.gender : '<span class="text-muted">未填性別</span>';
        const ageDisplay = ageStr ? ageStr : '<span class="text-muted">未填年齡</span>';
        const residenceDisplay = (person.current_residence && person.current_residence.trim()) ? person.current_residence.trim() : '<span class="text-muted">未填現居地</span>';
        const genderAgeResidenceHtml = `${genderDisplay} ‧ ${ageDisplay} ‧ ${residenceDisplay}`;

        const cardHtml = `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="customer-card ${borderClass}">
                    <div>
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <div class="d-flex align-items-center gap-3">
                                <div class="partner-avatar-wrap" style="width: 48px; height: 48px;">
                                    <img src="${avatarUrl}" class="rounded-circle border border-primary border-opacity-50" width="48" height="48" alt="${person.name_zh || '客戶'}" onerror="this.src='${getDefaultAvatar(gender)}'">
                                </div>
                                <div>
                                    <div class="d-flex align-items-center gap-2">
                                        <h6 class="mb-0 fw-bold text-white fs-5">${person.name_zh || person.name_en || '（未具名客戶）'}</h6>
                                        ${UIBadges.customer.type(c.customer_type)}
                                    </div>
                                </div>
                            </div>
                            <div class="btn-group btn-group-sm">
                                <button type="button" class="btn btn-outline-info py-1 px-2" onclick="openCustomerModalForView('${c.customer_id}')" title="查看 360° 檔案"><i class="fa-solid fa-magnifying-glass"></i></button>
                                <button type="button" class="btn btn-outline-secondary py-1 px-2" onclick="openCustomerModalForEdit('${c.customer_id}')" title="編輯"><i class="fa-solid fa-pen-to-square"></i></button>
                                <button type="button" class="btn btn-outline-danger py-1 px-2" onclick="deleteCustomerRecord('${c.customer_id}')" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
                            </div>
                        </div>

                        <div class="card-incard p-2 mb-3">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-filter text-warning me-1"></i>轉化階段 / 運作狀態</span>
                                <div class="d-flex align-items-center gap-1">
                                    ${UIBadges.customer.pipelineStage(c.pipeline_stage)}
                                    ${UIBadges.customer.status(c.status)}
                                </div>
                            </div>
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-user-tie text-info me-1"></i>負責夥伴</span>
                                ${partnerNameOnly}
                            </div>
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-flag text-success me-1"></i>國籍 / 種族</span>
                                <div class="text-end text-light">${nationalityEthnicityHtml}</div>
                            </div>
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-id-card-clip text-primary me-1"></i>性別 / 年齡 / 現居地</span>
                                <div class="text-end text-light">${genderAgeResidenceHtml}</div>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="text-secondary"><i class="fa-solid fa-user-tag text-accent me-1"></i>身份 / 使用身份</span>
                                <div class="d-flex align-items-center gap-1">
                                    ${UIBadges.person.identityType(person.identity_type)}
                                    ${UIBadges.person.usageIdentity(person.usage_identity)}
                                </div>
                            </div>
                        </div>

                        <div class="mb-2 d-flex flex-wrap gap-1">
                            ${tagsHtml || '<span class="text-muted small">無標籤</span>'}
                        </div>

                        <p class="text-secondary small text-truncate-2 mb-0" style="font-size: 0.8rem; min-height: 2.4em;">
                            ${c.notes || '暫無綜合溝通備忘'}
                        </p>
                    </div>

                    <div class="pt-2 mt-2 border-top border-secondary border-opacity-15 d-flex justify-content-between align-items-center">
                        <span class="text-muted small"><i class="fa-solid fa-clock me-1"></i>最近關懷：${AppDate.toDisplay(c.last_contact_date, '無')}</span>
                    </div>
                </div>
            </div>
        `;
        $container.append(cardHtml);
    });
}

function formatCustomerTableRow(c) {
    const person = getPersonMaster(c.person_id);
    const gender = person.gender || '男';
    const avatarUrl = person.avatar_url || getDefaultAvatar(gender);
    const partnerName = EntityResolver.partner(c.assigned_partner_id, partnerMasterList, personMasterList, 1);
    const referrerDisplay = EntityResolver.customer(c.source_referrer_id, customersList, personMasterList, 1);

    return {
        customer_info: `
            <div class="d-flex align-items-center gap-2">
                <img src="${avatarUrl}" class="rounded-circle border border-primary border-opacity-50 flex-shrink-0" width="32" height="32" onerror="this.src='${getDefaultAvatar(gender)}'">
                <div class="overflow-hidden">
                    <strong class="text-white text-truncate">${person.name_zh || person.name_en || '未具名'}</strong>
                </div>
            </div>
        `,
        customer_type: UIBadges.customer.type(c.customer_type),
        pipeline_stage: UIBadges.customer.pipelineStage(c.pipeline_stage),
        source_channel: `<span>${c.source_channel || '-'}</span>`,
        referrer: `<span>${referrerDisplay}</span>`,
        assigned_partner: `<span class="text-info fw-bold">${partnerName}</span>`,
        residence: `${person.current_residence || '-'}`,
        status: UIBadges.customer.status(c.status),
        first_order_date: `${AppDate.toDisplay(c.first_order_date, '-')}`,
        last_contact_date: `${AppDate.toDisplay(c.last_contact_date, '-')}`,
        tags: `<span class="small">${c.customer_tags || '-'}</span>`,
        actions: `
            <div class="d-flex align-items-center justify-content-end gap-1">
                <button type="button" class="btn btn-sm btn-outline-info py-1 px-2" onclick="openCustomerModalForView('${c.customer_id}')" title="查看 360° 檔案"><i class="fa-solid fa-magnifying-glass"></i></button>
                <button type="button" class="btn btn-sm btn-outline-secondary py-1 px-2" onclick="openCustomerModalForEdit('${c.customer_id}')" title="編輯"><i class="fa-solid fa-pen-to-square"></i></button>
                <button type="button" class="btn btn-sm btn-outline-danger py-1 px-2" onclick="deleteCustomerRecord('${c.customer_id}')" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `
    };
}

function reloadCustomerDataTable(dataList) {
    const formatted = dataList.map(c => formatCustomerTableRow(c));

    if (customerDataTable) {
        customerDataTable.clear().rows.add(formatted).draw();
    } else {
        customerDataTable = $('#customer-datatable').DataTable({
            data: formatted,
            columns: [
                { data: 'customer_info' },
                { data: 'customer_type', className: 'text-center' },
                { data: 'pipeline_stage', className: 'text-center' },
                { data: 'source_channel' },
                { data: 'referrer' },
                { data: 'assigned_partner' },
                { data: 'residence' },
                { data: 'status', className: 'text-center' },
                { data: 'first_order_date', className: 'text-center' },
                { data: 'last_contact_date', className: 'text-center' },
                { data: 'tags' },
                { data: 'actions', className: 'text-end', orderable: false }
            ]
        });
    }
}

function formatConversionTableRow(cv) {
    const spend = parseFloat(cv.historical_spend_total) || 0;
    const sv = parseInt(cv.historical_sv_total, 10) || 0;
    const customer = customersList.find(c => c.customer_id === cv.customer_id);
    const person = customer ? getPersonMaster(customer.person_id) : {};
    const customerName = EntityResolver.customer(cv.customer_id, customersList, personMasterList, 1);
    const sponsorNameOnly = EntityResolver.partner(cv.sponsor_partner_id, partnerMasterList, personMasterList, 1);

    return {
        customer_name: `<strong class="text-white">${customerName}</strong>`,
        customer_id: `<span class="text-info-emphasis">${cv.customer_id}</span>`,
        partner_id: `<span class="text-info-emphasis fw-bold">${cv.converted_partner_id}</span>`,
        conversion_type: `<span>${cv.conversion_type}</span>`,
        conversion_date: `<span>${AppDate.toDisplay(cv.conversion_date, '-')}</span>`,
        contract_no: `<span class="text-primary-emphasis">${cv.contract_no || '-'}</span>`,
        sponsor: `<span class="text-info fw-bold">${sponsorNameOnly}</span>`,
        spend: `NT$ ${spend.toLocaleString()}`,
        sv: `${sv.toLocaleString()} SV`,
        notes: `<span class="small">${cv.conversion_notes || '-'}</span>`
    };
}

function reloadConversionsDataTable(conversionsList) {
    const formatted = conversionsList.map(cv => formatConversionTableRow(cv));

    if (conversionsDataTable) {
        conversionsDataTable.clear().rows.add(formatted).draw();
    } else {
        conversionsDataTable = $('#conversions-datatable').DataTable({
            data: formatted,
            columns: [
                { data: 'customer_name' },
                { data: 'customer_id' },
                { data: 'partner_id' },
                { data: 'conversion_type', className: 'text-center' },
                { data: 'conversion_date', className: 'text-center' },
                { data: 'contract_no' },
                { data: 'sponsor' },
                { data: 'spend', className: 'text-end text-orange fw-bold' },
                { data: 'sv', className: 'text-end text-teal fw-bold' },
                { data: 'notes' }
            ]
        });
    }
}

// ============================================================================
// 8. 動態子表控制器 (Dynamic Tables: 通訊與語言)
// ============================================================================
function addContactTableRow(contact = {}) {
    const $tbody = $('#form-contacts-dynamic-tbody');
    const categories = ['ID', '顯示名稱', '連結'];
    const currentPlatform = contact.platform_name || 'LINE';
    const categoryOptions = categories.map(c => `<option value="${c}" ${c === (contact.category || 'ID') ? 'selected' : ''}>${c}</option>`).join('');

    const $row = $(`
        <tr class="dynamic-contact-row" draggable="true">
            <td class="text-center align-middle" style="width: 40px;">
                <div class="row-drag-handle" title="拖曳排序"><i class="fa-solid fa-grip-vertical"></i></div>
            </td>
            <td style="width: 22%;">
                <select class="form-select form-select-sm contact-input-platform select2-dynamic-platform"></select>
            </td>
            <td style="width: 18%;"><select class="form-select form-select-sm contact-input-category">${categoryOptions}</select></td>
            <td><input type="text" class="form-control form-control-sm contact-input-value" value="${contact.contact_value || ''}" placeholder="帳號 / 連結..."></td>
            <td style="width: 12%;">
                <select class="form-select form-select-sm contact-input-primary">
                    <option value="N" ${contact.is_primary !== 'Y' ? 'selected' : ''}>N</option>
                    <option value="Y" ${contact.is_primary === 'Y' ? 'selected' : ''}>Y (主要)</option>
                </select>
            </td>
            <td style="width: 18%;"><input type="text" class="form-control form-control-sm contact-input-notes" value="${contact.notes || ''}" placeholder="備註..."></td>
            <td class="text-center align-middle" style="width: 45px;">
                <button type="button" class="btn btn-outline-danger table-dynamic-action-btn" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>
    `);

    $row.find('.table-dynamic-action-btn').on('click', function () {
        $row.find('select.select2-hidden-accessible').select2('destroy');
        $row.remove();
    });

    $tbody.append($row);

    UISelectOptions.core.render({
        target: $row.find('.select2-dynamic-platform'),
        data: ['LINE', 'WhatsApp', 'Discord', 'WeChat', 'Facebook', 'Instagram', 'Telegram'],
        placeholder: '平台...',
        selectedValue: currentPlatform,
        searchable: true,
        creatable: true,
        grouped: false,
        dropdownParent: '#customerDetailModal'
    });
}

function addLanguageTableRow(lang = {}) {
    const $tbody = $('#form-languages-dynamic-tbody');
    const currentLang = lang.language_name || '中文';
    const levels = ['精通', '流利', '普通', '略懂', '不會'];
    const buildLevelOptions = (selectedVal) => levels.map(lv => `<option value="${lv}" ${lv === (selectedVal || '普通') ? 'selected' : ''}>${lv}</option>`).join('');

    const $row = $(`
        <tr class="dynamic-lang-row" draggable="true">
            <td class="text-center align-middle" style="width: 40px;">
                <div class="row-drag-handle" title="拖曳排序"><i class="fa-solid fa-grip-vertical"></i></div>
            </td>
            <td style="width: 20%;">
                <select class="form-select form-select-sm lang-input-name select2-dynamic-lang"></select>
            </td>
            <td style="width: 14%;"><select class="form-select form-select-sm lang-input-listening">${buildLevelOptions(lang.listening_level)}</select></td>
            <td style="width: 14%;"><select class="form-select form-select-sm lang-input-speaking">${buildLevelOptions(lang.speaking_level)}</select></td>
            <td style="width: 14%;"><select class="form-select form-select-sm lang-input-reading">${buildLevelOptions(lang.reading_level)}</select></td>
            <td style="width: 14%;"><select class="form-select form-select-sm lang-input-writing">${buildLevelOptions(lang.writing_level)}</select></td>
            <td><input type="text" class="form-control form-control-sm lang-input-notes" value="${lang.notes || ''}" placeholder="特殊備註..."></td>
            <td class="text-center align-middle" style="width: 45px;">
                <button type="button" class="btn btn-outline-danger table-dynamic-action-btn" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>
    `);

    $row.find('.table-dynamic-action-btn').on('click', function () {
        $row.find('select.select2-hidden-accessible').select2('destroy');
        $row.remove();
    });

    $tbody.append($row);

    UISelectOptions.core.render({
        target: $row.find('.select2-dynamic-lang'),
        data: ['中文', '英文', '馬來文', '台語', '粵語', '客家話', '日文', '韓文', '泰文', '印尼文', '越南文'],
        placeholder: '語言...',
        selectedValue: currentLang,
        searchable: true,
        creatable: true,
        grouped: false,
        dropdownParent: '#customerDetailModal'
    });
}

// ============================================================================
// 9. Modal 開啟與資料綁定 (Modals Controller)
// ============================================================================
function openCustomerModalForCreate() {
    populateDynamicSelects();
    populateNationalityDropdown('中華民國');
    populateEthnicityDropdown('華人');

    $('#customerModalTitle').html('<i class="fa-solid fa-user-plus text-primary me-1"></i>新增客戶');
    $('#form-submit-btn').show();
    $('#form-mode').val('CREATE');
    $('#customerForm')[0].reset();

    const autoCustomerId = generateNextCustomerId();
    const autoPersonId = generateNextPersonId();

    $('#form-customer-id').val(autoCustomerId).prop('readonly', true);
    $('#form-person-id').val(autoPersonId).prop('readonly', true);

    $('#form-identity-type').val('客戶');
    $('#form-usage-identity').val('消費者');
    $('#form-gender').val('男');
    $('#form-avatar-url').val('');
    $('#form-preview-avatar').attr('src', getDefaultAvatar('男'));

    setSelect2TagVal('#form-nationality', '中華民國');
    setSelect2TagVal('#form-ethnicity', '華人');
    setSelect2TagVal('#form-current-residence', '');
    setSelect2TagVal('#form-hometown', '');

    $('#form-marital-status').val('');
    $('#form-life-status').val('存活').trigger('change');
    $('#form-deceased-date').val('');

    $('#form-customer-type').val('潛在對象');
    $('#form-pipeline-stage').val('新線索');
    $('#form-source-channel').val('線上陌開');
    $('#form-source-referrer-id').val('').trigger('change');
    $('#form-status').val('活躍跟進');
    $('#form-assigned-partner-id').val('').trigger('change');

    $('#form-customer-tags').val('');
    $('#form-notes').val('');
    $('#form-customer-notes').val('');

    $('#form-contacts-dynamic-tbody').empty();
    $('#form-languages-dynamic-tbody').empty();

    $('#customerEditTabs button:first').tab('show');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('customerDetailModal')).show();
}

function openCustomerModalForEdit(customerId) {
    const customer = customersList.find(c => c.customer_id === customerId);
    if (!customer) {
        AppToast.warning(`找不到客戶資料：${customerId}`);
        return;
    }
    const person = getPersonMaster(customer.person_id);
    populateDynamicSelects();

    $('#customerModalTitle').html(`<i class="fa-solid fa-id-card-clip text-primary me-1"></i>編輯客戶 - ${person.name_zh || customer.customer_id}`);
    $('#form-submit-btn').show();
    $('#form-mode').val('UPDATE');

    $('#form-customer-id').val(customer.customer_id).prop('readonly', true);
    $('#form-person-id').val(person.person_id || customer.person_id).prop('readonly', true);

    // 自然人主檔
    $('#form-name-zh').val(person.name_zh || '');
    $('#form-name-en').val(person.name_en || '');
    $('#form-preferred-name').val(person.preferred_name || '');
    $('#form-display-name').val(person.display_name || '');
    $('#form-identity-type').val(person.identity_type || '客戶');
    $('#form-usage-identity').val(person.usage_identity || '消費者');
    $('#form-gender').val(person.gender || '男');

    $('#form-birthday').val(AppDate.toDisplay(person.birthday, ''));

    let natVal = person.nationality || '中華民國';
    if (natVal === '台灣' || natVal === 'TW') natVal = '中華民國';
    populateNationalityDropdown(natVal);
    populateEthnicityDropdown(person.ethnicity || '華人');

    setSelect2TagVal('#form-nationality', natVal);
    setSelect2TagVal('#form-ethnicity', person.ethnicity || '華人');
    setSelect2TagVal('#form-current-residence', person.current_residence || '');
    setSelect2TagVal('#form-hometown', person.hometown || '');

    $('#form-marital-status').val(person.marital_status || '');
    $('#form-life-status').val(person.life_status || '存活').trigger('change');
    $('#form-deceased-date').val(AppDate.toDisplay(person.deceased_date, ''));

    $('#form-health-status').val(person.health_status || '良好');
    $('#form-financial-status').val(person.financial_status || '穩定');
    $('#form-contact-address').val(person.contact_address || '');
    $('#form-met-date').val(AppDate.toInput(person.met_date));
    $('#form-met-reason').val(person.met_reason || '');

    const gender = person.gender || '男';
    const avatar = person.avatar_url || '';
    $('#form-avatar-url').val(avatar);
    $('#form-preview-avatar').attr('src', avatar || getDefaultAvatar(gender));

    // 客戶主檔
    $('#form-customer-type').val(customer.customer_type || '潛在對象');
    $('#form-pipeline-stage').val(customer.pipeline_stage || '新線索');
    $('#form-source-channel').val(customer.source_channel || '線上陌開');
    $('#form-source-referrer-id').val(customer.source_referrer_id || '').trigger('change');
    $('#form-assigned-partner-id').val(customer.assigned_partner_id || '').trigger('change');
    $('#form-status').val(customer.status || '活躍跟進');
    $('#form-first-order-date').val(AppDate.toInput(customer.first_order_date));
    $('#form-last-contact-date').val(AppDate.toInput(customer.last_contact_date));
    $('#form-customer-tags').val(customer.customer_tags || '');
    $('#form-customer-notes').val(customer.notes || '');

    // 通訊表
    $('#form-phone').val(person.phone || '');
    $('#form-email').val(person.email || '');
    const $contactTbody = $('#form-contacts-dynamic-tbody').empty();
    const contacts = personContactsList.filter(c => c.person_id === person.person_id);
    contacts.forEach(c => addContactTableRow(c));

    // 語言表
    const $langTbody = $('#form-languages-dynamic-tbody').empty();
    const langs = personLanguagesList.filter(l => l.person_id === person.person_id);
    langs.forEach(l => addLanguageTableRow(l));

    // 備忘
    $('#form-highest-education').val(person.highest_education || '');
    $('#form-graduated-school').val(person.graduated_school || '');
    $('#form-graduation-status').val(person.graduation_status || '');
    $('#form-occupation-background').val(person.occupation_background || '');
    $('#form-career-education-notes').val(person.career_education_notes || '');
    $('#form-health-notes').val(person.health_notes || '');
    $('#form-financial-notes').val(person.financial_notes || '');
    $('#form-consumption-notes').val(person.consumption_notes || '');
    $('#form-notes').val(person.notes || '');

    $('#customerEditTabs button:first').tab('show');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('customerDetailModal')).show();
}

function openCustomerModalForView(customerId) {
    const customer = customersList.find(c => c.customer_id === customerId);
    if (!customer) return;
    const person = getPersonMaster(customer.person_id);
    const gender = person.gender || '男';
    const avatarUrl = person.avatar_url || getDefaultAvatar(gender);

    activeViewingCustomerId = customerId;
    $('#view-header-cust-id').text(`[${customer.customer_id} / ${person.person_id || '無個人ID'}]`);
    
    // 預設頭貼與名稱
    $('#view-avatar').attr('src', avatarUrl);
    $('#view-name').text(person.name_zh || person.name_en || '（未具名客戶）');
    $('#view-name-zh').html(formatEmpty(person.name_zh));
    $('#view-name-en').html(formatEmpty(person.name_en));
    $('#view-name-pref').html(formatEmpty(person.preferred_name));
    $('#view-name-display').html(formatEmpty(person.display_name));

    $('#view-badge-type').html(UIBadges.customer.type(customer.customer_type));
    $('#view-badge-stage').html(UIBadges.customer.pipelineStage(customer.pipeline_stage));
    $('#view-badge-status').html(UIBadges.customer.status(customer.status));

    // 左欄：個人主檔 (比照 org-partners)
    $('#view-person-id').text(person.person_id || customer.person_id);
    $('#view-identity-usage').html(`${formatEmpty(person.identity_type, '客戶')} / ${formatEmpty(person.usage_identity, '消費者')}`);
    
    const birthdayDisplay = AppDate.toDisplay(person.birthday, '');
    const age = AppDate.calculateAge(person.birthday, person.deceased_date);
    const ageStr = (age !== null) ? ` (${age} 歲)` : '';
    const bDayText = birthdayDisplay ? `${birthdayDisplay}${ageStr}` : '未填生日';
    $('#view-gender-birthday-age').html(`${formatEmpty(gender)} ‧ ${formatEmpty(bDayText)}`);
    $('#view-marital-status').html(formatEmpty(person.marital_status));
    
    if (person.life_status === '身故') {
        const dDate = person.deceased_date ? ` (${AppDate.toDisplay(person.deceased_date)})` : '';
        $('#view-life-status').html(`<span class="badge badge-danger"><i class="fa-solid fa-ribbon me-1"></i>身故</span>${dDate}`);
    } else {
        $('#view-life-status').html('<span class="badge badge-success-subtle"><i class="fa-solid fa-heart me-1"></i>存活</span>');
    }

    $('#view-nationality-ethnicity').html(`${formatEmpty(person.nationality, '中華民國')} ‧ ${formatEmpty(person.ethnicity, '華人')}`);
    const hometownText = person.hometown ? `${person.hometown} → ` : '';
    $('#view-residence-full').html(formatEmpty(`${hometownText}${person.current_residence || ''}`, '未設定'));
    $('#view-contact-address').html(formatEmpty(person.contact_address));
    $('#view-met-date').html(formatEmpty(AppDate.toDisplay(person.met_date, '')));
    $('#view-met-reason').html(formatEmpty(person.met_reason));
    $('#view-health-status').html(UIBadges.person.healthStatus(person.health_status));
    $('#view-financial-status').html(UIBadges.person.financialStatus(person.financial_status));

    // 右欄：客戶資訊 (替換葡眾組織)
    $('#view-customer-id').text(customer.customer_id);
    $('#view-info-customer-type').html(UIBadges.customer.type(customer.customer_type));
    $('#view-info-pipeline-stage').html(UIBadges.customer.pipelineStage(customer.pipeline_stage));
    $('#view-info-status').html(UIBadges.customer.status(customer.status));
    $('#view-source-channel').text(customer.source_channel || '-');
    $('#view-referrer-id').text(EntityResolver.customer(customer.source_referrer_id, customersList, personMasterList, 2));
    $('#view-assigned-partner').text(EntityResolver.partner(customer.assigned_partner_id, partnerMasterList, personMasterList, 2));
    $('#view-first-order').text(AppDate.toDisplay(customer.first_order_date, '-'));
    $('#view-last-contact').text(AppDate.toDisplay(customer.last_contact_date, '-'));

    // 通訊與社群管道 (比照 org-partners)
    $('#view-phone').html(person.phone ? `<a href="tel:${person.phone}" class="text-info text-decoration-none">${person.phone}</a>` : '<span class="text-muted">未填寫</span>');
    $('#view-email').html(person.email ? `<a href="mailto:${person.email}" class="text-info text-decoration-none">${person.email}</a>` : '<span class="text-muted">未填寫</span>');

    const $contactsWrap = $('#view-contacts-list-wrap').empty();
    const contacts = personContactsList.filter(c => c.person_id === person.person_id);
    if (contacts.length > 0) {
        contacts.forEach(c => {
            const isPrimary = c.is_primary === 'Y' ? '<span class="badge badge-success-subtle ms-1" style="font-size: 0.65rem;">主要</span>' : '';
            const valHtml = (c.platform_name === 'Facebook' || c.contact_value.startsWith('http'))
                ? `<a href="${c.contact_value}" target="_blank" class="text-info text-decoration-none text-truncate" style="max-width: 140px;">${c.contact_value}</a>`
                : `<span class="text-white">${c.contact_value}</span>`;

            $contactsWrap.append(`
                <div class="d-flex justify-content-between align-items-center py-1 border-bottom border-secondary border-opacity-10">
                    <span class="text-secondary"><i class="fa-solid fa-tag text-primary me-1"></i>${c.platform_name} (${c.category})${isPrimary}</span>
                    <div class="text-end">
                        ${valHtml}
                        ${c.notes ? `<div class="text-muted" style="font-size: 0.72rem;">${c.notes}</div>` : ''}
                    </div>
                </div>
            `);
        });
    } else {
        $contactsWrap.append('<span class="text-muted small">暫無其他社群通訊管道</span>');
    }

    // 語言溝通列表 (比照 org-partners)
    const $langsWrap = $('#view-languages-list-wrap').empty();
    const langs = personLanguagesList.filter(l => l.person_id === person.person_id);
    if (langs.length > 0) {
        langs.forEach(l => {
            $langsWrap.append(`
                <div class="p-2 bg-black bg-opacity-30 rounded border border-secondary border-opacity-10">
                    <div class="d-flex gap-2">
                        <strong class="text-white">${l.language_name}</strong>
                        ${l.notes ? `<span class="text-muted" style="font-size: 0.72rem;">${l.notes}</span>` : ''}
                        <span class="text-secondary">聽：${UIBadges.person.languageProficiency(l.listening_level)}</span>
                        <span class="text-secondary">說：${UIBadges.person.languageProficiency(l.speaking_level)}</span>
                        <span class="text-secondary">讀：${UIBadges.person.languageProficiency(l.reading_level)}</span>
                        <span class="text-secondary">寫：${UIBadges.person.languageProficiency(l.writing_level)}</span>
                    </div>
                </div>
            `);
        });
    } else {
        $langsWrap.append('<span class="text-muted small">暫無語言評級紀錄</span>');
    }

    // 學經歷背景 (比照 org-partners)
    const educationHtml = `${formatEmpty(person.graduated_school, '未填寫')} / ${formatEmpty(person.highest_education, '未填寫')} / ${UIBadges.person.graduationStatus(person.graduation_status)}`;
    $('#view-education').html(educationHtml);
    $('#view-occupation').html(formatEmpty(person.occupation_background, '未填寫'));

    // 客群標籤 (替換專長標籤)
    const $tags = $('#view-tags-container').empty();
    if (customer.customer_tags && customer.customer_tags.trim()) {
        customer.customer_tags.split(',').forEach(t => $tags.append(`<span class="badge badge-primary-subtle mx-1">${t.trim()}</span>`));
    } else {
        $tags.html('<span class="text-muted small">未設定客群標籤</span>');
    }

    // 備忘區塊 (比照 org-partners，替換客戶備註)
    $('#view-career-education-notes').html(formatEmpty(person.career_education_notes, '暫無學經歷備註。'));
    $('#view-health-notes').html(formatEmpty(person.health_notes, '暫無健康備註。'));
    $('#view-financial-notes').html(formatEmpty(person.financial_notes, '暫無財務備註。'));
    $('#view-consumption-notes').html(formatEmpty(person.consumption_notes, '暫無消費備註。'));
    $('#view-notes').html(formatEmpty(person.notes, '暫無個人備註。'));
    $('#view-customer-notes').html(formatEmpty(customer.notes, '暫無客戶備註。'));

    if (customer.customer_type === '已轉夥伴') {
        $('#btn-trigger-convert').prop('disabled', true).html('<i class="fa-solid fa-check me-1"></i>此客戶已轉化為直銷夥伴');
    } else {
        $('#btn-trigger-convert').prop('disabled', false).html('<i class="fa-solid fa-handshake me-1"></i>簽約轉為夥伴');
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('customerViewModal')).show();
}

// ============================================================================
// 10. 資料庫寫入與雙向端點分流 CRUD (Save & Delete)
// ============================================================================
function getFormTrimVal(selector, defaultVal = '') {
    const val = $(selector).val();
    return (val !== undefined && val !== null) ? String(val).trim() : defaultVal;
}

async function submitCustomerForm(e) {
    e.preventDefault();

    // 1. 檢核姓名
    const nameZh = getFormTrimVal('#form-name-zh');
    const nameEn = getFormTrimVal('#form-name-en');
    const preferredName = getFormTrimVal('#form-preferred-name');

    if (!nameZh && !nameEn && !preferredName) {
        AppToast.warning('「中文姓名」、「英文姓名」、「常用稱呼」請至少填寫一項！');
        $('#tab-btn-person').tab('show');
        $('#form-name-zh').focus();
        return;
    }

    // 2. 檢核客戶主檔
    const custType = getFormTrimVal('#form-customer-type');
    const stage = getFormTrimVal('#form-pipeline-stage');
    const status = getFormTrimVal('#form-status');

    if (!custType) {
        AppToast.warning('請選擇「客戶分類」！');
        $('#tab-btn-crm').tab('show');
        return;
    }
    if (!stage) {
        AppToast.warning('請選擇「轉化階段」！');
        $('#tab-btn-crm').tab('show');
        return;
    }
    if (!status) {
        AppToast.warning('請選擇「運作狀態」！');
        $('#tab-btn-crm').tab('show');
        return;
    }

    const birthdayRaw = getFormTrimVal('#form-birthday');
    if (birthdayRaw && !/^\d{4}(\/\d{1,2}\/\d{1,2})?$/.test(birthdayRaw)) {
        AppToast.warning('「生日」格式需為西元年 (如 1988) 或年月日 (如 1988/06/15)！');
        $('#tab-btn-person').tab('show');
        $('#form-birthday').focus();
        return;
    }

    const deceasedDateRaw = getFormTrimVal('#form-deceased-date');
    if (getFormTrimVal('#form-life-status') === '身故' && deceasedDateRaw && !/^\d{4}(\/\d{1,2}\/\d{1,2})?$/.test(deceasedDateRaw)) {
        AppToast.warning('「身故日期」格式需為西元年 (如 2020) 或年月日 (如 2020/05/20)！');
        $('#tab-btn-person').tab('show');
        $('#form-deceased-date').focus();
        return;
    }

    const mode = $('#form-mode').val();
    let personId = getFormTrimVal('#form-person-id');
    let customerId = getFormTrimVal('#form-customer-id');

    if (mode === 'CREATE') {
        if (!personId || personMasterList.some(p => p.person_id === personId)) {
            personId = generateNextPersonId();
            $('#form-person-id').val(personId);
        }
        if (!customerId || customersList.some(c => c.customer_id === customerId)) {
            customerId = generateNextCustomerId();
            $('#form-customer-id').val(customerId);
        }
    }

    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');
    const existingPerson = personMasterList.find(p => p.person_id === personId);
    const existingCustomer = customersList.find(c => c.customer_id === customerId);

    const personCreatedBy = (mode === 'UPDATE' && existingPerson) ? existingPerson.created_by : currentUser;
    const personCreatedAt = (mode === 'UPDATE' && existingPerson) ? existingPerson.created_at : nowStr;
    const customerCreatedBy = (mode === 'UPDATE' && existingCustomer) ? existingCustomer.created_by : currentUser;
    const customerCreatedAt = (mode === 'UPDATE' && existingCustomer) ? existingCustomer.created_at : nowStr;

    // 1. 封裝「個人主檔」資料列 (36 欄位，寫入 PSN)
    const personRowArray = [
        personId,
        nameZh,
        nameEn,
        preferredName,
        getFormTrimVal('#form-display-name'),
        getFormTrimVal('#form-identity-type', '客戶'),
        getFormTrimVal('#form-usage-identity', '消費者'),
        getFormTrimVal('#form-gender', '未填'),
        AppDate.toSheet(getFormTrimVal('#form-birthday')),
        AppDate.toSheet(getFormTrimVal('#form-deceased-date')),
        getFormTrimVal('#form-life-status', '存活'),
        getFormTrimVal('#form-marital-status', ''),
        getFormTrimVal('#form-nationality', '中華民國'),
        getFormTrimVal('#form-ethnicity', '華人'),
        getFormTrimVal('#form-hometown'),
        getFormTrimVal('#form-current-residence'),
        getFormTrimVal('#form-phone'),
        getFormTrimVal('#form-email'),
        getFormTrimVal('#form-contact-address'),
        AppDate.toSheet(getFormTrimVal('#form-met-date')),
        getFormTrimVal('#form-met-reason'),
        getFormTrimVal('#form-highest-education'),
        getFormTrimVal('#form-graduated-school'),
        getFormTrimVal('#form-graduation-status'),
        getFormTrimVal('#form-occupation-background'),
        getFormTrimVal('#form-health-status', '良好'),
        getFormTrimVal('#form-financial-status', '穩定'),
        getFormTrimVal('#form-avatar-url'),
        getFormTrimVal('#form-career-education-notes'),
        getFormTrimVal('#form-health-notes'),
        getFormTrimVal('#form-financial-notes'),
        getFormTrimVal('#form-consumption-notes'),
        getFormTrimVal('#form-notes'),
        personCreatedBy,
        personCreatedAt,
        currentUser,
        nowStr
    ];

    // 2. 封裝「客戶主檔」資料列 (16 欄位，寫入 CRM)
    const customerRowArray = [
        customerId,
        personId,
        custType,
        stage,
        getFormTrimVal('#form-source-channel'),
        getFormTrimVal('#form-source-referrer-id'),
        getFormTrimVal('#form-assigned-partner-id'),
        status,
        AppDate.toSheet(getFormTrimVal('#form-first-order-date')),
        AppDate.toSheet(getFormTrimVal('#form-last-contact-date')),
        getFormTrimVal('#form-customer-tags'),
        getFormTrimVal('#form-customer-notes'),
        customerCreatedBy,
        customerCreatedAt,
        currentUser,
        nowStr
    ];

    // 3. 收集動態通訊資料
    const contactRows = [];
    const newContactsObjects = [];
    $('#form-contacts-dynamic-tbody tr.dynamic-contact-row').each(function (idx) {
        const val = $(this).find('.contact-input-value').val().trim();
        if (val) {
            const seq = String(idx + 1).padStart(2, '0');
            const contactId = `${personId}-C${seq}`;
            const platform = $(this).find('.contact-input-platform').val();
            const category = $(this).find('.contact-input-category').val();
            const isPrimary = $(this).find('.contact-input-primary').val();
            const notes = $(this).find('.contact-input-notes').val().trim();

            contactRows.push([
                contactId, personId, platform, category, val, isPrimary, notes,
                currentUser, nowStr, currentUser, nowStr
            ]);
            newContactsObjects.push({
                contact_id: contactId, person_id: personId, platform_name: platform,
                category: category, contact_value: val, is_primary: isPrimary, notes: notes
            });
        }
    });

    // 4. 收集動態語言資料
    const languageRows = [];
    const newLanguagesObjects = [];
    $('#form-languages-dynamic-tbody tr.dynamic-lang-row').each(function (idx) {
        const langName = $(this).find('.lang-input-name').val();
        if (langName) {
            const seq = String(idx + 1).padStart(2, '0');
            const langId = `${personId}-L${seq}`;
            const listening = $(this).find('.lang-input-listening').val();
            const speaking = $(this).find('.lang-input-speaking').val();
            const reading = $(this).find('.lang-input-reading').val();
            const writing = $(this).find('.lang-input-writing').val();
            const notes = $(this).find('.lang-input-notes').val().trim();

            languageRows.push([
                langId, personId, langName, listening, speaking, reading, writing, notes,
                currentUser, nowStr, currentUser, nowStr
            ]);
            newLanguagesObjects.push({
                lang_id: langId, person_id: personId, language_name: langName,
                listening_level: listening, speaking_level: speaking,
                reading_level: reading, writing_level: writing, notes: notes
            });
        }
    });

    const $btn =$('#form-submit-btn').prop('disabled', true);
    const silentOpt = { silent: true };
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-up text-primary me-1"></i>正在同步自然人主檔與客戶資料庫...', '資料寫入中');

    try {
        const deletePromises = [];
        personContactsList.filter(c => c.person_id === personId).forEach(c => {
            if (c.contact_id) deletePromises.push(SheetAdapter.deleteRow(SHEET_NAMES.CONTACTS, c.contact_id, GAS_DEPLOY_ID.PSN, silentOpt).catch(() => {}));
        });
        personLanguagesList.filter(l => l.person_id === personId).forEach(l => {
            if (l.lang_id) deletePromises.push(SheetAdapter.deleteRow(SHEET_NAMES.LANGUAGES, l.lang_id, GAS_DEPLOY_ID.PSN, silentOpt).catch(() => {}));
        });
        if (deletePromises.length > 0) await Promise.all(deletePromises);

        const writePromises = [];
        if (mode === 'CREATE') {
            writePromises.push(SheetAdapter.createRow(SHEET_NAMES.PERSONS, personId, personRowArray, GAS_DEPLOY_ID.PSN, silentOpt));
            writePromises.push(SheetAdapter.createRow(SHEET_NAMES.CUSTOMERS, customerId, customerRowArray, GAS_DEPLOY_ID.CRM, silentOpt));
        } else {
            writePromises.push(SheetAdapter.updateRow(SHEET_NAMES.PERSONS, personId, personRowArray, GAS_DEPLOY_ID.PSN, silentOpt));
            writePromises.push(SheetAdapter.updateRow(SHEET_NAMES.CUSTOMERS, customerId, customerRowArray, GAS_DEPLOY_ID.CRM, silentOpt));
        }

        contactRows.forEach(nc => writePromises.push(SheetAdapter.createRow(SHEET_NAMES.CONTACTS, nc[0], nc, GAS_DEPLOY_ID.PSN, silentOpt)));
        languageRows.forEach(nl => writePromises.push(SheetAdapter.createRow(SHEET_NAMES.LANGUAGES, nl[0], nl, GAS_DEPLOY_ID.PSN, silentOpt)));

        await Promise.all(writePromises);

        const patchedPerson = parsePersonMasterTable([personRowArray])[0];
        const pIdx = personMasterList.findIndex(p => p.person_id === personId);
        if (pIdx >= 0) personMasterList[pIdx] = patchedPerson; else personMasterList.push(patchedPerson);

        const patchedCustomer = parseCustomersTable([customerRowArray])[0];
        const cIdx = customersList.findIndex(c => c.customer_id === customerId);
        if (cIdx >= 0) customersList[cIdx] = patchedCustomer; else customersList.unshift(patchedCustomer);

        personContactsList = personContactsList.filter(c => c.person_id !== personId).concat(newContactsObjects);
        personLanguagesList = personLanguagesList.filter(l => l.person_id !== personId).concat(newLanguagesObjects);

        AppLoading.hide();
        bootstrap.Modal.getInstance(document.getElementById('customerDetailModal'))?.hide();
        populateDynamicSelects();
        refreshView();
        const disp = nameZh || nameEn || preferredName || customerId;
        AppToast.success(`客戶【${disp}】與自然人主檔已成功同步儲存！`);
    } catch (err) {
        console.error('[CRM] 寫入失敗:', err);
        AppLoading.hide();
        AppToast.error('寫入試算表失敗: ' + err.message);
    } finally {
        $btn.prop('disabled', false);
    }
}

async function deleteCustomerRecord(customerId) {
    const customer = customersList.find(c => c.customer_id === customerId);
    if (!customer) return;
    const person = getPersonMaster(customer.person_id);
    const dispName = person.name_zh || customer.customer_id;

    AppDialog.confirm(
        `確定要自雲端試算表中移除客戶【${dispName} (${customerId})】嗎？`,
        async function () {
            AppLoading.show('<i class="fa-solid fa-spinner fa-spin text-danger me-1"></i>正在刪除客戶檔案...', '資料庫同步中');
            try {
                const silentOpt = { silent: true };

                // ★ 僅刪除表 501「客戶主檔」，人員模組不刪除
                await SheetAdapter.deleteRow(SHEET_NAMES.CUSTOMERS, customerId, GAS_DEPLOY_ID.CRM, silentOpt);

                // 前端記憶體樂觀更新
                customersList = customersList.filter(c => c.customer_id !== customerId);

                populateDynamicSelects();
                refreshView();
                AppToast.success(`客戶【${dispName}】已順利移除！`);
            } catch (err) {
                console.error('[CRM] 刪除客戶失敗:', err);
                AppToast.error('刪除客戶失敗: ' + err.message);
            } finally {
                AppLoading.hide();
            }
        },
        {
            title: '確認移除客戶檔案',
            confirmText: '確認移除',
            confirmClass: 'btn-danger'
        }
    );
}

// ============================================================================
// 11. 簽約轉化經銷夥伴 (表 502)
// ============================================================================
function openConvertModalFromView() {
    if (!activeViewingCustomerId) return;
    const customer = customersList.find(c => c.customer_id === activeViewingCustomerId);
    if (!customer) return;

    bootstrap.Modal.getInstance(document.getElementById('customerViewModal'))?.hide();

    // 1. 基本轉化資料
    $('#convert-id').val(`CNV-${customer.customer_id}-001`);
    $('#convert-customer-id').val(customer.customer_id);
    $('#convert-partner-id').val(generateNextPartnerId());
    $('#convert-type').val('零售客轉經銷');
    $('#convert-date').val(AppDate.now('input'));
    $('#convert-contract-no').val('');
    $('#convert-spend').val('0');
    $('#convert-sv').val('0');
    $('#convert-notes').val(`由客戶【${customer.customer_id}】正式簽約結轉，啟動事業輔導。`);

    // 2. 夥伴組織排線資料初始化
    $('#convert-member-no').val('');
    $('#convert-country-code').val('TW');
    $('#convert-leader-title').val('');
    $('#convert-current-rank').val('會員');
    $('#convert-highest-rank').val('會員');
    $('#convert-account-holder-type').val('個人經營者');
    $('#convert-operation-mode').val('個人經營');
    $('#convert-node-nature').val('常態夥伴');
    $('#convert-upline-link-type').val('直屬已知');
    $('#convert-gap-count-container').hide();
    $('#convert-gap-count').val('');
    $('#convert-activity-level').val('');
    $('#convert-operator-status').val('活躍');
    $('#convert-work-status').val('');
    $('#convert-member-status').val('有效且領獎金');
    $('#convert-joining-motive').val('');
    $('#convert-renewal-due-date').val('');
    $('#convert-team-skills').val('');
    $('#convert-team-notes').val('');

    // 3. 組織排線 Select2 下拉選單渲染
    const partnerSelects = ['#convert-sponsor-id', '#convert-placement-id', '#convert-known-mentor-id', '#convert-spouse-partner-id'];
    partnerSelects.forEach(selId => {
        UISelectOptions.partner.populate({
            target: selId,
            partners: partnerMasterList,
            persons: personMasterList,
            displayMode: 2, // 模式 2：姓名 (member no) [partner id]
            placeholder: '(無)',
            searchable: true,
            dropdownParent: '#customerConvertModal'
        });
    });

    // 預設引薦人帶入客戶原本的負責夥伴
    if (customer.assigned_partner_id) {
        $('#convert-sponsor-id').val(customer.assigned_partner_id).trigger('change');
        $('#convert-known-mentor-id').val(customer.assigned_partner_id).trigger('change');
    }

    // 上線模式連動間隔人數
    $('#convert-upline-link-type').off('change.convertUpline').on('change.convertUpline', function () {
        if ($(this).val() === '已知人數斷層') {
            $('#convert-gap-count-container').slideDown(200);
            if (!$('#convert-gap-count').val()) $('#convert-gap-count').val(1);
        } else {
            $('#convert-gap-count-container').slideUp(200);
            $('#convert-gap-count').val('');
        }
    });

    // 自動計算直轄與關係
    const updateConvertCalc = () => {
        const pId = $('#convert-partner-id').val();
        const plcId = $('#convert-placement-id').val();
        const spsId = $('#convert-sponsor-id').val();
        const nature = $('#convert-node-nature').val();
        const calc = calculateRelationAndTeamStatus(pId, plcId, spsId, nature);
        $('#convert-relation-type').val(calc.relationType);
        $('#convert-is-our-team').val(calc.isOurTeam);
    };

    $('#convert-placement-id, #convert-sponsor-id, #convert-node-nature').off('change.convertCalc').on('change.convertCalc', updateConvertCalc);
    updateConvertCalc();

    setTimeout(() => {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('customerConvertModal')).show();
    }, 250);
}

async function saveCustomerConversion() {
    // 1. AppToast 欄位檢核
    const custId = $('#convert-customer-id').val();
    const newPartnerId = $('#convert-partner-id').val().trim();
    const convDate = $('#convert-date').val();
    const sponsorId = $('#convert-sponsor-id').val();
    const countryCode = $('#convert-country-code').val();
    const activityLevel = $('#convert-activity-level').val();
    const uplineLinkType = $('#convert-upline-link-type').val();
    const gapCount = parseInt($('#convert-gap-count').val() || '0', 10);

    if (!newPartnerId) {
        AppToast.warning('轉化夥伴代碼不得為空！');
        $('#convert-partner-id').focus();
        return;
    }
    if (!convDate) {
        AppToast.warning('請選擇「正式簽約/入會日」！');
        $('#convert-date').focus();
        return;
    }
    if (!sponsorId) {
        AppToast.warning('請選擇「實質引薦人」！');
        $('#convert-sponsor-id').focus();
        return;
    }
    if (!countryCode) {
        AppToast.warning('請選擇「所屬國家市場」！');
        $('#convert-country-code').focus();
        return;
    }
    if (!activityLevel) {
        AppToast.warning('請選擇「團隊參與度」！');
        $('#convert-activity-level').focus();
        return;
    }
    if (uplineLinkType === '已知人數斷層' && (!gapCount || gapCount < 1)) {
        AppToast.warning('上線模式為已知人數斷層，請填寫間隔人數（至少 1 人）！');
        $('#convert-gap-count').focus();
        return;
    }

    const customer = customersList.find(c => c.customer_id === custId);
    if (!customer) {
        AppToast.error('查無客戶主檔對應資訊！');
        return;
    }
    const person = getPersonMaster(customer.person_id);

    const $btn =$('#btn-submit-convert').prop('disabled', true);
    AppLoading.show('<i class="fa-solid fa-award text-success me-1"></i>正在平行同步寫入轉化歷程、夥伴主檔與組織關係...', '結轉中...');

    try {
        const currentUser = getCurrentUser();
        const nowStr = AppDate.now('full');
        const silentOpt = { silent: true };

        // 1. 封裝表 502「轉化歷程」資料列 (10 欄位)
        const conversionRecord = {
            conversion_id: $('#convert-id').val(),
            customer_id: custId,
            converted_partner_id: newPartnerId,
            conversion_type: $('#convert-type').val(),
            conversion_date: AppDate.toSheet(convDate),
            contract_no: $('#convert-contract-no').val().trim() || '',
            sponsor_partner_id: sponsorId,
            historical_spend_total: parseFloat($('#convert-spend').val()) || 0,
            historical_sv_total: parseInt($('#convert-sv').val(), 10) || 0,
            conversion_notes: $('#convert-notes').val().trim() || ''
        };

        const convRowArray = [
            conversionRecord.conversion_id,
            conversionRecord.customer_id,
            conversionRecord.converted_partner_id,
            conversionRecord.conversion_type,
            conversionRecord.conversion_date,
            conversionRecord.contract_no,
            conversionRecord.sponsor_partner_id,
            conversionRecord.historical_spend_total,
            conversionRecord.historical_sv_total,
            conversionRecord.conversion_notes
        ];

        // 2. 封裝表 501「客戶主檔」更新資料列 (身分更迭為已轉夥伴)
        customer.customer_type = '已轉夥伴';
        customer.modified_by = currentUser;
        customer.modified_at = nowStr;

        const custRowArray = [
            customer.customer_id, customer.person_id, customer.customer_type,
            customer.pipeline_stage, customer.source_channel, customer.source_referrer_id,
            customer.assigned_partner_id, customer.status, customer.first_order_date,
            customer.last_contact_date, customer.customer_tags, customer.notes,
            customer.created_by, customer.created_at, customer.modified_by, customer.modified_at
        ];

        // 3. 封裝表 201「個人主檔」更新資料列 (身分 identity_type 調整為團隊成員)
        person.identity_type = '團隊成員';
        person.modified_by = currentUser;
        person.modified_at = nowStr;

        const personRowArray = [
            person.person_id,
            person.name_zh || '',
            person.name_en || '',
            person.preferred_name || '',
            person.display_name || '',
            '團隊成員',
            person.usage_identity || '經營者',
            person.gender || '未填',
            AppDate.toSheet(person.birthday),
            AppDate.toSheet(person.deceased_date),
            person.life_status || '存活',
            person.marital_status || '',
            person.nationality || '中華民國',
            person.ethnicity || '華人',
            person.hometown || '',
            person.current_residence || '',
            person.phone || '',
            person.email || '',
            person.contact_address || '',
            AppDate.toSheet(person.met_date),
            person.met_reason || '',
            person.highest_education || '',
            person.graduated_school || '',
            person.graduation_status || '',
            person.occupation_background || '',
            person.health_status || '良好',
            person.financial_status || '穩定',
            person.avatar_url || '',
            person.career_education_notes || '',
            person.health_notes || '',
            person.financial_notes || '',
            person.consumption_notes || '',
            person.notes || '',
            person.created_by || currentUser,
            person.created_at || nowStr,
            currentUser,
            nowStr
        ];

        const plcId = $('#convert-placement-id').val();
        const spsId = sponsorId;
        const nodeNat = $('#convert-node-nature').val();
        const calcRel = calculateRelationAndTeamStatus(newPartnerId, plcId, spsId, nodeNat);

        // 4. 封裝表 202「夥伴主檔」新增資料列 (39 欄位，含團隊備註，職級鎖定會員)
        const partnerRowArray = [
            newPartnerId,
            customer.person_id,
            $('#convert-member-no').val().trim(),
            $('#convert-leader-title').val().trim(),
            $('#convert-account-holder-type').val(),
            newPartnerId, // official_account_partner_id
            $('#convert-operation-mode').val(),
            $('#convert-spouse-partner-id').val(),
            $('#convert-node-nature').val(),
            sponsorId,
            $('#convert-placement-id').val(),
            $('#convert-known-mentor-id').val(),
            uplineLinkType,
            'RANK_01', // current_rank_id 鎖定會員
            'RANK_01', // highest_rank_id 鎖定會員
            0,      // diamond_star_level
            '',     // star_eval_eligible_date
            countryCode,
            calcRel.isOurTeam,      // 改為使用即時計算值
            calcRel.relationType,   // 改為使用即時計算值
            activityLevel,
            $('#convert-member-status').val(),
            $('#convert-operator-status').val(),
            $('#convert-work-status').val(),
            '',     // status_change_reason
            '',     // successor_partner_id
            '',     // surrendered_to_upline_id
            $('#convert-joining-motive').val(),
            $('#convert-team-skills').val().trim(),
            $('#convert-team-notes').val().trim(), // 夥伴主檔：團隊備註 (索引 29)
            AppDate.toSheet(convDate),
            AppDate.toSheet($('#convert-renewal-due-date').val()),
            '',
            '',     // exit_date
            person.avatar_url || '',
            currentUser,
            nowStr,
            currentUser,
            nowStr
        ];

        const ancestorId = $('#convert-placement-id').val() || sponsorId;
        const relationLine = $('#convert-relation-line').val() || '安置排線';

        // 5. 平行寫入五張資料表
        await Promise.all([
            // 寫入表 502 轉化歷程 (CRM)
            SheetAdapter.createRow(SHEET_NAMES.CONVERSIONS, conversionRecord.conversion_id, convRowArray, GAS_DEPLOY_ID.CRM, silentOpt),
            // 更新表 501 客戶主檔 (CRM)
            SheetAdapter.updateRow(SHEET_NAMES.CUSTOMERS, customer.customer_id, custRowArray, GAS_DEPLOY_ID.CRM, silentOpt),
            // 更新表 201 個人主檔 (PSN) 身分欄位
            SheetAdapter.updateRow(SHEET_NAMES.PERSONS, person.person_id, personRowArray, GAS_DEPLOY_ID.PSN, silentOpt),
            // 寫入表 202 夥伴主檔 (ORG)
            SheetAdapter.createRow(SHEET_NAMES.PARTNERS, newPartnerId, partnerRowArray, GAS_DEPLOY_ID.ORG, silentOpt),
            // 寫入組織關係表 (ORG)
            syncOrgRelationsRecord(newPartnerId, ancestorId, uplineLinkType, gapCount, relationLine, currentUser, nowStr)
        ]);

        // 6. 本地記憶體樂觀快取更新
        conversionsList.unshift(conversionRecord);
        partnerMasterList.unshift({
            partner_id: newPartnerId,
            person_id: customer.person_id,
            member_no: $('#convert-member-no').val().trim(),
            leader_title: $('#convert-leader-title').val().trim(),
            display_name: person.name_zh || newPartnerId
        });

        AppLoading.hide();
        bootstrap.Modal.getInstance(document.getElementById('customerConvertModal')).hide();
        refreshView();
        AppToast.success(`客戶【${person.name_zh || custId}】已順利簽約並成功建立夥伴主檔【${newPartnerId}】與組織血緣關係！`);
    } catch (err) {
        console.error('[CRM] 轉化寫入失敗:', err);
        AppLoading.hide();
        AppToast.error('轉化寫入失敗: ' + err.message);
    } finally {
        $btn.prop('disabled', false);
    }
}

// ============================================================================
// 12. 戰情統計與分析圖表 (語言能力 + 個人畫像 12 圖 + 客戶戰術 14 圖)
// ============================================================================
function populateLanguageFilterDropdown() {
    const $langSelect =$('#select-lang-filter');
    const currentSelected = $langSelect.val() || '中文';
    const defaultLanguages = ['中文', '英文', '馬來文', '台語', '粵語', '客家話', '日文', '韓文', '印尼文', '泰文', '越南文'];
    const allLanguagesSet = new Set(defaultLanguages);

    if (Array.isArray(personLanguagesList)) {
        personLanguagesList.forEach(l => {
            const name = (l.language_name || '').trim();
            if (name) allLanguagesSet.add(name);
        });
    }

    UISelectOptions.core.render({
        target: '#select-lang-filter',
        data: Array.from(allLanguagesSet),
        placeholder: '請選擇分析語言...',
        selectedValue: allLanguagesSet.has(currentSelected) ? currentSelected : '中文',
        searchable: true,
        creatable: false,
        grouped: false
    });

    $('#select-lang-filter').off('change.langAnalysis').on('change.langAnalysis', function () {
        changeLanguageAnalysis($(this).val());
    });
}

function changeLanguageAnalysis(selectedLang) {
    const dataset = getFilteredCustomers();
    renderLanguageSectionCharts(selectedLang, dataset);
}

/**
 * 區塊 A：跨國語言能力矩陣圖表（聽、說、讀、寫）
 */
function renderLanguageSectionCharts(targetLang, dataset) {
    const activePersonIds = new Set(dataset.map(c => c.person_id));
    const langRecords = personLanguagesList.filter(l =>
        l.language_name === targetLang && activePersonIds.has(l.person_id)
    );

    const levels = ['精通', '流利', '普通', '略懂', '不會'];
    const levelColors = ['#10b981', '#38bdf8', '#fbbf24', '#f97316', '#64748b'];

    const countProficiency = (levelKey) => {
        const counts = { '精通': 0, '流利': 0, '普通': 0, '略懂': 0, '不會': 0 };
        langRecords.forEach(r => {
            const val = r[levelKey] || '普通';
            if (counts[val] !== undefined) counts[val]++;
            else counts['普通']++;
        });
        return levels.map(l => counts[l]);
    };

    const dimensions = [
        { id: 'chart-lang-listening', field: 'listening_level' },
        { id: 'chart-lang-speaking', field: 'speaking_level' },
        { id: 'chart-lang-reading', field: 'reading_level' },
        { id: 'chart-lang-writing', field: 'writing_level' }
    ];

    dimensions.forEach(dim => {
        const config = AppChart.createDoughnut({
            labels: levels,
            data: countProficiency(dim.field),
            colors: levelColors,
            unit: '人',
            cutout: '60%'
        });
        AppChart.render(dim.id, config);
    });
}

function createExactCountMap(dataset, fieldExtractor) {
    const counts = {};
    let unsetCount = 0;

    dataset.forEach(p => {
        const val = fieldExtractor(p);
        if (!val || String(val).trim() === '' || String(val).trim() === '未填寫' || String(val).trim() === '未設定') {
            unsetCount++;
        } else {
            const cleanVal = String(val).trim();
            counts[cleanVal] = (counts[cleanVal] || 0) + 1;
        }
    });

    const sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = sortedEntries.map(e => e[0]);
    const data = sortedEntries.map(e => e[1]);
    const colors = labels.map((_, idx) => AppChart.tokens.palette[idx % AppChart.tokens.palette.length]);

    if (unsetCount > 0) {
        labels.push('未設定');
        data.push(unsetCount);
        colors.push('#64748b');
    }

    return { labels, data, colors };
}

/**
 * 核心視圖渲染：個人畫像 12 圖 + 客戶營運轉化 14 圖
 */
function renderChartsView(filteredDataset = null) {
    const dataset = filteredDataset || getFilteredCustomers();

    const createCountMap = (key, defaultKeys = []) => {
        const map = {};
        defaultKeys.forEach(k => { map[k] = 0; });
        dataset.forEach(c => {
            const person = getPersonMaster(c.person_id);
            const rawVal = c[key] || person[key];
            const val = (rawVal && String(rawVal).trim() !== '') ? String(rawVal).trim() : '未設定';
            map[val] = (map[val] || 0) + 1;
        });
        return map;
    };

    // 區塊 A：跨國語言能力
    const currentSelectedLang = $('#select-lang-filter').val() || '中文';
    renderLanguageSectionCharts(currentSelectedLang, dataset);

    // ========================================================================
    // 區塊 B：個人主檔畫像指標 (12 張環形甜甜圈圖)
    // ========================================================================
    // 1. 人脈身份
    const idTypeCounts = createCountMap('identity_type', ['客戶', '潛在客戶', '夥伴', '團隊成員', '潛在團隊成員']);
    AppChart.render('chart-identity-type-split', AppChart.createDoughnut({
        labels: Object.keys(idTypeCounts),
        data: Object.values(idTypeCounts),
        colors: ['#10b981', '#64748b', '#8b5cf6', '#3b82f6', '#06b6d4'],
        unit: '人'
    }));

    // 2. 使用身份
    const usageCounts = createCountMap('usage_identity', ['消費者', '經營者']);
    AppChart.render('chart-usage-identity-split', AppChart.createDoughnut({
        labels: Object.keys(usageCounts),
        data: Object.values(usageCounts),
        colors: ['#38bdf8', '#a855f7'],
        unit: '人'
    }));

    // 3. 年齡層級分佈
    const ageCategories = ['17歲以下', '18-29歲', '30-39歲', '40-49歲', '50-59歲', '60-69歲', '70-79歲', '80歲以上'];
    const ageCounts = {};
    ageCategories.forEach(c => { ageCounts[c] = 0; });
    dataset.forEach(c => {
        const person = getPersonMaster(c.person_id);
        const age = AppDate.calculateAge(person.birthday, person.deceased_date);
        if (age !== null) {
            if (age <= 17) ageCounts['17歲以下']++;
            else if (age <= 29) ageCounts['18-29歲']++;
            else if (age <= 39) ageCounts['30-39歲']++;
            else if (age <= 49) ageCounts['40-49歲']++;
            else if (age <= 59) ageCounts['50-59歲']++;
            else if (age <= 69) ageCounts['60-69歲']++;
            else if (age <= 79) ageCounts['70-79歲']++;
            else ageCounts['80歲以上']++;
        }
    });
    AppChart.render('chart-age-distribution', AppChart.createDoughnut({
        labels: ageCategories,
        data: ageCategories.map(c => ageCounts[c]),
        unit: '人'
    }));

    // 4. 生理性別
    const genderCounts = createCountMap('gender', ['男', '女', '其他', '未填']);
    AppChart.render('chart-gender-split', AppChart.createDoughnut({
        labels: Object.keys(genderCounts),
        data: Object.values(genderCounts),
        colors: ['#38bdf8', '#f472b6', '#a78bfa', '#64748b'],
        unit: '人'
    }));

    // 5. 國籍
    const natSummary = createExactCountMap(dataset, c => {
        const person = getPersonMaster(c.person_id);
        let n = (person.nationality || '').trim();
        if (n === '台灣' || n === 'TW') n = '中華民國';
        return n;
    });
    AppChart.render('chart-nationality-split', AppChart.createDoughnut({
        labels: natSummary.labels,
        data: natSummary.data,
        colors: natSummary.colors,
        unit: '人'
    }));

    // 6. 種族
    const ethSummary = createExactCountMap(dataset, c => (getPersonMaster(c.person_id).ethnicity || '').trim());
    AppChart.render('chart-ethnicity-split', AppChart.createDoughnut({
        labels: ethSummary.labels,
        data: ethSummary.data,
        colors: ethSummary.colors,
        unit: '人'
    }));

    // 7. 家鄉城市
    const homeSummary = createExactCountMap(dataset, c => (getPersonMaster(c.person_id).hometown || '').trim());
    AppChart.render('chart-hometown-split', AppChart.createDoughnut({
        labels: homeSummary.labels,
        data: homeSummary.data,
        colors: homeSummary.colors,
        unit: '人'
    }));

    // 8. 現居地
    const resSummary = createExactCountMap(dataset, c => (getPersonMaster(c.person_id).current_residence || '').trim());
    AppChart.render('chart-residence-split', AppChart.createDoughnut({
        labels: resSummary.labels,
        data: resSummary.data,
        colors: resSummary.colors,
        unit: '人'
    }));

    // 9. 認識年份
    const metYearCounts = {};
    dataset.forEach(c => {
        const person = getPersonMaster(c.person_id);
        const y = (person.met_date && person.met_date.length >= 4) ? AppDate.toYear(person.met_date) + '年' : '未記錄';
        metYearCounts[y] = (metYearCounts[y] || 0) + 1;
    });
    AppChart.render('chart-met-year-split', AppChart.createDoughnut({
        labels: Object.keys(metYearCounts),
        data: Object.values(metYearCounts),
        unit: '人'
    }));

    // 10. 最高學歷
    const eduCounts = createCountMap('highest_education', ['博士', '碩士', '學士', '副學士', '高中職', '國中', '國小']);
    AppChart.render('chart-education-distribution', AppChart.createDoughnut({
        labels: Object.keys(eduCounts),
        data: Object.values(eduCounts),
        colors: ['#8b5cf6', '#0284c7', '#38bdf8', '#34d399', '#fbbf24', '#f97316', '#64748b'],
        unit: '人'
    }));

    // 11. 健康狀況
    const healthCategories = ['良好', '亞健康', '慢性體質', '調養中', '罹患疾病', '待了解'];
    const healthCounts = createCountMap('health_status', healthCategories);
    AppChart.render('chart-health-status-split', AppChart.createDoughnut({
        labels: healthCategories,
        data: healthCategories.map(c => healthCounts[c] || 0),
        colors: ['#10b981', '#fbbf24', '#f97316', '#38bdf8', '#ef4444', '#64748b'],
        unit: '人'
    }));

    // 12. 財務狀況
    const finCounts = createCountMap('financial_status', ['寬裕', '穩定', '吃緊', '高負債', '尋找副業']);
    AppChart.render('chart-financial-status-split', AppChart.createDoughnut({
        labels: Object.keys(finCounts),
        data: Object.values(finCounts),
        colors: ['#10b981', '#38bdf8', '#fbbf24', '#ef4444', '#c084fc'],
        unit: '人'
    }));

    // ========================================================================
    // 區塊 C：客戶營運與轉化指標 (14 張圖表)
    // ========================================================================
    // 1. 客戶身分
    const typeCounts = createCountMap('customer_type', ['潛在對象', '一般零售', 'VIP顧客', '事業種子', '已轉夥伴']);
    AppChart.render('chart-customer-type-split', AppChart.createDoughnut({
        labels: Object.keys(typeCounts),
        data: Object.values(typeCounts),
        colors: ['#64748b', '#38bdf8', '#fbbf24', '#f43f5e', '#10b981'],
        unit: '人',
        centerKpi: { label: '建檔客戶總數', value: dataset.length.toLocaleString() }
    }));

    // 2. 轉化漏斗階段
    const stageCounts = createCountMap('pipeline_stage', ['新線索', '需求確認', '試用體驗', '異議排除', '規律自用', '培育暫緩']);
    AppChart.render('chart-pipeline-stage-split', AppChart.createDoughnut({
        labels: Object.keys(stageCounts),
        data: Object.values(stageCounts),
        colors: ['#38bdf8', '#818cf8', '#c084fc', '#f59e0b', '#10b981', '#64748b'],
        unit: '人'
    }));

    // 3. 名單運作狀態
    const statusCounts = createCountMap('status', ['活躍跟進', '沉睡列管', '爭議凍結', '封存歸檔']);
    AppChart.render('chart-customer-status-split', AppChart.createDoughnut({
        labels: Object.keys(statusCounts),
        data: Object.values(statusCounts),
        colors: ['#10b981', '#fbbf24', '#f43f5e', '#64748b'],
        unit: '人'
    }));

    // 4. 引流來源渠道
    const channelCounts = createCountMap('source_channel', ['線上陌開', '線下陌開', '社群矩陣', '健康問卷', '親朋好友', '轉介紹', '茶會活動', '其他']);
    AppChart.render('chart-source-channel-split', AppChart.createDoughnut({
        labels: Object.keys(channelCounts),
        data: Object.values(channelCounts),
        unit: '人'
    }));

    // 5. 轉化簽約型態佔比
    const convTypeCounts = {};
    conversionsList.forEach(cv => {
        const t = cv.conversion_type || '零售客轉經銷';
        convTypeCounts[t] = (convTypeCounts[t] || 0) + 1;
    });
    AppChart.render('chart-conversion-type-split', AppChart.createDoughnut({
        labels: Object.keys(convTypeCounts),
        data: Object.values(convTypeCounts),
        colors: ['#10b981', '#38bdf8', '#f59e0b', '#8b5cf6'],
        unit: '人'
    }));

    // 6. 轉化累計消費金額級距
    const spendTiers = { '0元': 0, '1~1萬': 0, '1萬~3萬': 0, '3萬~5萬': 0, '5萬~10萬': 0, '10萬以上': 0 };
    conversionsList.forEach(cv => {
        const s = parseFloat(cv.historical_spend_total) || 0;
        if (s === 0) spendTiers['0元']++;
        else if (s <= 10000) spendTiers['1~1萬']++;
        else if (s <= 30000) spendTiers['1萬~3萬']++;
        else if (s <= 50000) spendTiers['3萬~5萬']++;
        else if (s <= 100000) spendTiers['5萬~10萬']++;
        else spendTiers['10萬以上']++;
    });
    AppChart.render('chart-conversion-spend-tier', AppChart.createDoughnut({
        labels: Object.keys(spendTiers),
        data: Object.values(spendTiers),
        unit: '人'
    }));

    // 7. 轉化貢獻 SV 點數級距
    const svTiers = { '0 SV': 0, '1~1,000': 0, '1,001~5,000': 0, '5,001~10,000': 0, '10,000 SV以上': 0 };
    conversionsList.forEach(cv => {
        const v = parseInt(cv.historical_sv_total, 10) || 0;
        if (v === 0) svTiers['0 SV']++;
        else if (v <= 1000) svTiers['1~1,000']++;
        else if (v <= 5000) svTiers['1,001~5,000']++;
        else if (v <= 10000) svTiers['5,001~10,000']++;
        else svTiers['10,000 SV以上']++;
    });
    AppChart.render('chart-conversion-sv-tier', AppChart.createDoughnut({
        labels: Object.keys(svTiers),
        data: Object.values(svTiers),
        unit: '人'
    }));

    // 8. 維護負責夥伴名單數 Top 10 (水平長條圖)
    const partnerCounts = {};
    dataset.forEach(c => {
        if (c.assigned_partner_id) {
            const name = EntityResolver.partner(c.assigned_partner_id, partnerMasterList, personMasterList, 1);
            partnerCounts[name] = (partnerCounts[name] || 0) + 1;
        }
    });
    const sortedPartners = Object.entries(partnerCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    AppChart.render('chart-assigned-partner-top10', AppChart.createBar({
        labels: sortedPartners.map(x => x[0]),
        data: sortedPartners.map(x => x[1]),
        datasetLabel: '負責客戶數',
        colors: '#8b5cf6',
        isHorizontal: true,
        unit: '人'
    }));

    // 9. 轉介推薦人名單數 Top 10 (水平長條圖)
    const referrerCounts = {};
    dataset.forEach(c => {
        if (c.source_referrer_id) {
            const name = EntityResolver.customer(c.source_referrer_id, customersList, personMasterList, 1);
            referrerCounts[name] = (referrerCounts[name] || 0) + 1;
        }
    });
    const sortedReferrers = Object.entries(referrerCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    AppChart.render('chart-referrer-top10', AppChart.createBar({
        labels: sortedReferrers.map(x => x[0]),
        data: sortedReferrers.map(x => x[1]),
        datasetLabel: '轉介人數',
        colors: '#10b981',
        isHorizontal: true,
        unit: '人'
    }));

    // 10. 轉化引薦人 Top 10 (水平長條圖)
    const convSponsorCounts = {};
    conversionsList.forEach(cv => {
        if (cv.sponsor_partner_id) {
            const name = EntityResolver.partner(cv.sponsor_partner_id, partnerMasterList, personMasterList, 1);
            convSponsorCounts[name] = (convSponsorCounts[name] || 0) + 1;
        }
    });
    const sortedSponsors = Object.entries(convSponsorCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    AppChart.render('chart-conversion-sponsor-top10', AppChart.createBar({
        labels: sortedSponsors.map(x => x[0]),
        data: sortedSponsors.map(x => x[1]),
        datasetLabel: '轉化夥伴數',
        colors: '#f59e0b',
        isHorizontal: true,
        unit: '人'
    }));

    // 11. 轉化簽約年份趨勢 (硬派折線圖)
    const convYearCounts = {};
    conversionsList.forEach(cv => {
        if (cv.conversion_date && cv.conversion_date.length >= 4) {
            const y = cv.conversion_date.slice(0, 4);
            convYearCounts[y] = (convYearCounts[y] || 0) + 1;
        }
    });
    const convYears = Object.keys(convYearCounts).length ? Object.keys(convYearCounts).sort() : ['2024', '2025', '2026'];
    AppChart.render('chart-conversion-year-line', AppChart.createLine({
        labels: convYears,
        data: convYears.map(k => convYearCounts[k] || 0),
        datasetLabel: '轉化人數',
        color: '#10b981',
        tension: 0,
        fill: false,
        unit: '人',
        yAxisTitle: '簽約人數'
    }));

    // 12. 首單成交年份趨勢歷程 (硬派折線圖)
    const orderYearCounts = {};
    dataset.forEach(c => {
        if (c.first_order_date && c.first_order_date.length >= 4) {
            const y = c.first_order_date.slice(0, 4);
            orderYearCounts[y] = (orderYearCounts[y] || 0) + 1;
        }
    });
    const orderYears = Object.keys(orderYearCounts).length ? Object.keys(orderYearCounts).sort() : ['2024', '2025', '2026'];
    AppChart.render('chart-first-order-year-line', AppChart.createLine({
        labels: orderYears,
        data: orderYears.map(k => orderYearCounts[k] || 0),
        datasetLabel: '首單成交人數',
        color: '#38bdf8',
        tension: 0,
        fill: false,
        unit: '人',
        yAxisTitle: '成交人數'
    }));

    // 13. 首單成交月份分佈 (1~12月)
    const firstOrderMonthCounts = {};
    for (let i = 1; i <= 12; i++) { firstOrderMonthCounts[`${i}月`] = 0; }
    dataset.forEach(c => {
        if (c.first_order_date && c.first_order_date.includes('-')) {
            const m = parseInt(c.first_order_date.split('-')[1], 10);
            if (m >= 1 && m <= 12) firstOrderMonthCounts[`${m}月`]++;
        }
    });
    AppChart.render('chart-first-order-month-bar', AppChart.createBar({
        labels: Object.keys(firstOrderMonthCounts),
        data: Object.values(firstOrderMonthCounts),
        datasetLabel: '首單人數',
        colors: '#38bdf8',
        isHorizontal: false,
        unit: '人'
    }));

    // 14. 最近關懷月份分佈 (1~12月)
    const contactMonthCounts = {};
    for (let i = 1; i <= 12; i++) { contactMonthCounts[`${i}月`] = 0; }
    dataset.forEach(c => {
        if (c.last_contact_date && c.last_contact_date.includes('-')) {
            const m = parseInt(c.last_contact_date.split('-')[1], 10);
            if (m >= 1 && m <= 12) contactMonthCounts[`${m}月`]++;
        }
    });
    AppChart.render('chart-last-contact-month-bar', AppChart.createBar({
        labels: Object.keys(contactMonthCounts),
        data: Object.values(contactMonthCounts),
        datasetLabel: '關懷次數',
        colors: '#fbbf24',
        isHorizontal: false,
        unit: '次'
    }));
}