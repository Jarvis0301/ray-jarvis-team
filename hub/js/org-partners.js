/**
 * ============================================================================
 * 組織成員戰術中樞 (org-partners.js)
 * 遵循團隊共用元件規範 (AppLoading, AppToast, AppDialog, SheetAdapter)
 * 完美契合最新 5 張資料表 Schema (Master, Partners, Contacts, Languages, Relations)
 * ============================================================================
 */

// ============================================================================
// 1. 核心常數與全域狀態 (Constants & State)
// ============================================================================
const SPREADSHEET_ID = "1N-HniBDo7wJHidfsKyG-dr7kh0-UTNtFpM7nyFDL3eg";
const GAS_DEPLOY_ID = "AKfycbwCHIswVrVHuvEusFZrg2KjTCCwYhlf-3h-QbWhro8YVekUt1wNa4oDxxBxzPc_z6cd";

const DEFAULT_AVATARS = {
    '男': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    '女': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    '其他': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    '未填': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
};

const REGIONS_DATABASE = {
    TW: [
        "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市",
        "基隆市", "新竹市", "嘉義市", "宜蘭縣", "新竹縣", "苗栗縣",
        "彰化縣", "南投縣", "雲林縣", "嘉義縣", "屏東縣", "花蓮縣",
        "臺東縣", "澎湖縣"
    ],
    MY: [
        "吉隆坡", "布城", "納閩", "柔佛州", "吉打州", "吉蘭丹州",
        "馬六甲州", "森美蘭州", "彭亨州", "檳城州", "霹靂州", "玻璃市州",
        "雪蘭莪州", "登嘉樓州", "沙巴州", "砂拉越州"
    ]
};

let personMasterList = [];
let partnersList = [];
let personContactsList = [];
let personLanguagesList = [];
let orgRelationsList = [];
let ranksDatabase = [];
let ranksMap = {};
let dataTableInstance = null;
let chartInstances = {};
let orgChartZoom = 1.0;

// ============================================================================
// 2. 系統生命週期與初始化 (Lifecycle & Init)
// ============================================================================
window.addEventListener('AppReady', function () {
    SheetAdapter.init(GAS_DEPLOY_ID);
    applyUIPermissions();
    populateRegionDropdowns();
    initSelect2Dropdowns();

    $('.form-filter-control').on('change', function () {
        renderAllViews();
    });

    fetchGoogleSheetsData();

    $('input[name="viewMode"]').on('change', function () {
        const mode = $(this).attr('id');
        $('#container-cards-view, #container-table-view, #container-batch-view, #container-tree-view, #container-charts-view').addClass('d-none');

        if (mode === 'view-cards') {
            $('#container-cards-view').removeClass('d-none');
        } else if (mode === 'view-table') {
            $('#container-table-view').removeClass('d-none');
            if (dataTableInstance) {
                dataTableInstance.columns.adjust();
            }
        } else if (mode === 'view-batch') {
            $('#container-batch-view').removeClass('d-none');
        } else if (mode === 'view-tree') {
            $('#container-tree-view').removeClass('d-none');
        } else if (mode === 'view-charts') {
            $('#container-charts-view').removeClass('d-none');
            renderChartsView();
        }
    });

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

    $('#partnerForm').on('submit', savePartnerRecord);
});

function populateRegionDropdowns() {
    const filterRegion = $('#filter-current-residence').empty().append('<option value="" selected>全部地區</option>');
    const formRegion = $('#form-current-residence').empty().append('<option value="">請選擇居住地...</option>');

    let twGroup = $('<optgroup label="🇹🇼 台灣"></optgroup>');
    REGIONS_DATABASE.TW.forEach(reg => {
        twGroup.append(`<option value="${reg}">${reg}</option>`);
    });
    filterRegion.append(twGroup.clone());
    formRegion.append(twGroup);

    let myGroup = $('<optgroup label="🇲🇾 馬來西亞"></optgroup>');
    REGIONS_DATABASE.MY.forEach(reg => {
        myGroup.append(`<option value="${reg}">${reg}</option>`);
    });
    filterRegion.append(myGroup.clone());
    formRegion.append(myGroup);
}

function initSelect2Dropdowns() {
    if (!$.fn.select2) return;

    $('.select2-partner-search, .select2-region-search').select2({
        dropdownParent: $('#partnerDetailModal'),
        width: '100%',
        placeholder: '請輸入關鍵字搜尋...',
        allowClear: true,
        language: { noResults: () => '找不到相符項目' }
    });

    $('#filter-current-residence').select2({
        width: '100%',
        placeholder: '全部地區',
        allowClear: true,
        language: { noResults: () => '找不到相符項目' }
    }).on('change', function () {
        renderAllViews();
    });
}

function populateSelect2Options() {
    const partnerSelects = ['#form-sponsor-id', '#form-placement-id', '#form-known-mentor-id', '#form-spouse-partner-id'];
    partnerSelects.forEach(selId => {
        const $el = $(selId).empty().append('<option value="">(無)</option>');
        partnersList.forEach(p => {
            const dispName = getPartnerDisplayName(p);
            const memberNo = p.member_no ? ` [${p.member_no}]` : '';
            $el.append(`<option value="${p.partner_id}">${dispName}${memberNo} (${p.partner_id})</option>`);
        });
    });
}

// ============================================================================
// 3. 雲端資料同步與解析引擎 (Data Fetch & Parse)
// ============================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步全域組織與個人主檔...', '讀取雲端試算表');

    try {
        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);
            const text = await res.text();
            const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
            return (parsed.data || []).slice(1);
        };

        const [personRows, partnersRows, contactsRows, langRows, relationsRows, ranksRows] = await Promise.all([
            fetchSheet('個人主檔').catch(() => []),
            fetchSheet('夥伴主檔').catch(() => []),
            fetchSheet('通訊資料').catch(() => []),
            fetchSheet('使用語言').catch(() => []),
            fetchSheet('組織關係').catch(() => []),
            fetchSheet('職級主檔').catch(() => [])
        ]);

        if (ranksRows.length > 0) ranksDatabase = parseRanksTable(ranksRows);
        updateRanksCacheAndUI();

        if (personRows.length > 0) personMasterList = parsePersonMasterTable(personRows);
        if (partnersRows.length > 0) partnersList = parsePartnersTable(partnersRows);
        if (contactsRows.length > 0) personContactsList = parseContactsTable(contactsRows);
        if (langRows.length > 0) personLanguagesList = parseLanguagesTable(langRows);
        if (relationsRows.length > 0) orgRelationsList = parseOrgRelationsTable(relationsRows);

        populateSelect2Options();
        renderAllViews();
        AppToast.success(`已成功同步 ${partnersList.length} 筆成員主檔`);
    } catch (err) {
        console.warn("試算表讀取異常:", err);
        AppToast.error("讀取 Google 試算表失敗，已載入防禦快取");
        renderAllViews();
    } finally {
        AppLoading.hide();
    }
}

function parsePersonMasterTable(rows) {
    return rows.map((r, idx) => ({
        person_id: getVal(r, 0, `PSN-${String(idx + 1).padStart(4, '0')}`),
        name_zh: getVal(r, 1, ''),
        name_en: getVal(r, 2, ''),
        preferred_name: getVal(r, 3, ''),
        display_name: getVal(r, 4, ''),
        identity_type: getVal(r, 5, '潛在客戶'),
        usage_identity: getVal(r, 6, '消費者'),
        gender: getVal(r, 7, '未填'),
        birthday: getVal(r, 8, ''),
        nationality: getVal(r, 9, '中華民國'),
        ethnicity: getVal(r, 10, '華人'),
        hometown: getVal(r, 11, ''),
        current_residence: getVal(r, 12, ''),
        phone: getVal(r, 13, ''),
        email: getVal(r, 14, ''),
        contact_address: getVal(r, 15, ''),
        met_date: getVal(r, 16, ''),
        met_reason: getVal(r, 17, ''),
        highest_education: getVal(r, 18, ''),
        graduated_school: getVal(r, 19, ''),
        occupation_background: getVal(r, 20, ''),
        health_status: getVal(r, 21, '良好'),
        financial_status: getVal(r, 22, '穩定'),
        avatar_url: getVal(r, 23, ''),
        career_education_notes: getVal(r, 24, ''),
        health_notes: getVal(r, 25, ''),
        financial_notes: getVal(r, 26, ''),
        consumption_notes: getVal(r, 27, ''),
        created_by: getVal(r, 28, 'SYSTEM'),
        created_at: getVal(r, 29, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 30, 'SYSTEM'),
        modified_at: getVal(r, 31, '2026-01-01 00:00:00')
    })).filter(p => p.person_id && String(p.person_id).trim() !== '');
}

function parsePartnersTable(rows) {
    return rows.map((r, idx) => ({
        partner_id: getVal(r, 0, `PTN-${String(idx + 1).padStart(3, '0')}`),
        person_id: getVal(r, 1, `PSN-${String(idx + 1).padStart(4, '0')}`),
        member_no: getVal(r, 2, ''),
        leader_title: getVal(r, 3, ''),
        account_holder_type: getVal(r, 4, '個人經營者'),
        official_account_partner_id: getVal(r, 5, ''),
        operation_mode: getVal(r, 6, '個人經營'),
        spouse_partner_id: getVal(r, 7, ''),
        node_nature: getVal(r, 8, '常態夥伴'),
        sponsor_id: getVal(r, 9, ''),
        placement_id: getVal(r, 10, ''),
        known_mentor_id: getVal(r, 11, ''),
        upline_link_type: getVal(r, 12, '直屬已知'),
        current_rank_id: getVal(r, 13, ''),
        highest_rank_id: getVal(r, 14, ''),
        country_code: getVal(r, 15, 'TW'),
        is_our_team: getVal(r, 16, 'Y').toUpperCase(),
        relation_type: getVal(r, 17, '下線'),
        activity_level: getVal(r, 18, ''),
        member_status: getVal(r, 19, ''),
        operator_status: getVal(r, 20, ''),
        joining_motive: getVal(r, 21, ''),
        team_skills: getVal(r, 22, ''),
        team_notes: getVal(r, 23, ''),
        join_date: getVal(r, 24, ''),
        renewal_due_date: getVal(r, 25, ''),
        last_order_date: getVal(r, 26, ''),
        exit_date: getVal(r, 27, ''),
        avatar_url: getVal(r, 28, ''),
        created_by: getVal(r, 29, 'SYSTEM'),
        created_at: getVal(r, 30, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 31, 'SYSTEM'),
        modified_at: getVal(r, 32, '2026-01-01 00:00:00')
    })).filter(p => p.partner_id && String(p.partner_id).trim() !== '');
}

function parseContactsTable(rows) {
    return rows.map((r, idx) => ({
        contact_id: getVal(r, 0, String(idx + 1)),
        person_id: getVal(r, 1, ''),
        platform_name: getVal(r, 2, 'LINE'),
        category: getVal(r, 3, 'ID'),
        contact_value: getVal(r, 4, ''),
        is_primary: getVal(r, 5, 'N'),
        notes: getVal(r, 6, ''),
        created_by: getVal(r, 7, 'SYSTEM'),
        created_at: getVal(r, 8, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 9, 'SYSTEM'),
        modified_at: getVal(r, 10, '2026-01-01 00:00:00')
    }));
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
        notes: getVal(r, 7, ''),
        created_by: getVal(r, 8, 'SYSTEM'),
        created_at: getVal(r, 9, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 10, 'SYSTEM'),
        modified_at: getVal(r, 11, '2026-01-01 00:00:00')
    }));
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
        path_trace: getVal(r, 7, ''),
        created_by: getVal(r, 8, 'SYSTEM'),
        created_at: getVal(r, 9, '2026-01-01 00:00:00'),
        modified_by: getVal(r, 10, 'SYSTEM'),
        modified_at: getVal(r, 11, '2026-01-01 00:00:00')
    })).filter(rel => rel.ancestor_id && rel.descendant_id);
}

function parseRanksTable(rows) {
    return rows.map((r, idx) => ({
        rank_id: getVal(r, 0, `RANK_${String(idx + 1).padStart(2, '0')}`),
        rank_code: getVal(r, 1, `R${(idx + 1) * 10}`),
        rank_level: parseInt(getVal(r, 2, '10'), 10) || 10,
        rank_name_zh: getVal(r, 3, '未定義職級'),
        badge_icon_class: getVal(r, 22, 'fa-solid fa-award'),
        badge_color_hex: getVal(r, 23, '#8b5cf6'),
        sort_order: parseInt(getVal(r, 24, String((idx + 1) * 10)), 10) || ((idx + 1) * 10),
        is_active: getVal(r, 25, 'Y').toUpperCase()
    })).filter(rk => rk.rank_name_zh !== '未定義職級' && rk.is_active === 'Y');
}

// ============================================================================
// 4. 共用資料處理與 UI 標籤產生器 (Helpers & Formatters)
// ============================================================================
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
        return String(row[colIndex]).trim();
    }
    return defaultVal;
}

function formatEmpty(val, placeholder = '—') {
    if (val === undefined || val === null || String(val).trim() === '' || String(val).trim() === '未填寫' || String(val).trim() === '未設定') {
        return `<span class="text-muted">${placeholder}</span>`;
    }
    return String(val).trim();
}

function getCurrentUser() {
    const rawSession = localStorage.getItem('ray_team_auth_session');
    if (!rawSession) return 'Ray (翁榮祥)';
    try {
        const session = JSON.parse(rawSession);
        return session.userName || session.user || 'ADMIN';
    } catch (e) {
        return 'ADMIN';
    }
}

function getFormattedNow() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isMasterAdmin() {
    const rawSession = localStorage.getItem('ray_team_auth_session');
    if (!rawSession) return true;
    try {
        const session = JSON.parse(rawSession);
        const adminEmails = ["jarvis20250807@gmail.com", "fish7548@gmail.com", "jarvis.lin@gmail.com", "ray.weng@gmail.com"];
        return adminEmails.includes((session.user || '').toLowerCase().trim());
    } catch (e) {
        return true;
    }
}

function applyUIPermissions() {
    if (!isMasterAdmin()) {
        $('#btn-open-create-modal').hide();
    }
}

function getDefaultAvatar(gender = '男') {
    return DEFAULT_AVATARS[gender] || DEFAULT_AVATARS['男'];
}

function getPersonMaster(personId) {
    return personMasterList.find(p => p.person_id === personId) || {};
}

function getPartnerDisplayName(target) {
    if (!target) return '';
    const p = typeof target === 'string'
        ? partnersList.find(x => x.partner_id === target || x.member_no === target)
        : target;

    if (!p) return typeof target === 'string' && target !== 'ROOT' ? target : '';

    const person = getPersonMaster(p.person_id);
    const candidates = [person.display_name, person.name_zh, person.name_en, person.preferred_name];
    for (const name of candidates) {
        if (name && String(name).trim() !== '') {
            return String(name).trim();
        }
    }
    return '（未知姓名）';
}

function getRankInfo(rankId) {
    if (rankId && ranksMap[rankId]) return ranksMap[rankId];
    return {
        rank_id: '',
        rank_code: '—',
        rank_name_zh: '未設定',
        badge_icon_class: 'fa-solid fa-circle-question',
        badge_color_hex: '#64748b'
    };
}

function updateRanksCacheAndUI() {
    ranksMap = {};
    ranksDatabase.forEach(rk => { ranksMap[rk.rank_id] = rk; });

    const $filterHighest = $('#filter-highest-rank-id').empty().append('<option value="">全部職級</option>');
    const $formCurrent = $('#form-current-rank-id').empty().append('<option value="">(未設定 / 未知)</option>');
    const $formHighest = $('#form-highest-rank-id').empty().append('<option value="">(未設定 / 未知)</option>');

    const sortedRanks = [...ranksDatabase].sort((a, b) => a.sort_order - b.sort_order);
    sortedRanks.forEach(rk => {
        const optHtml = `<option value="${rk.rank_id}">${rk.rank_name_zh} (${rk.rank_code})</option>`;
        $filterHighest.append(optHtml);
        $formCurrent.append(optHtml);
        $formHighest.append(optHtml);
    });
}

function getCountryBadge(countryCode) {
    const code = (countryCode || 'TW').toUpperCase().trim();
    if (code === 'MY') {
        return `<span class="badge badge-warning-subtle font-monospace">MY</span>`;
    }
    return `<span class="badge badge-info-subtle font-monospace">TW</span>`;
}

function buildRankBadge(rank) {
    if (!rank || !rank.rank_id) return `<span class="badge badge-muted-subtle">未設定職級</span>`;
    const hex = rank.badge_color_hex || '#8b5cf6';
    const icon = rank.badge_icon_class || 'fa-solid fa-award';
    return `<span class="badge" style="background-color: #130e24; border: 1px solid ${hex}; color: ${hex}; font-weight: 600;">
        <i class="${icon}"></i> ${rank.rank_name_zh}
    </span>`;
}

function renderMemberIdentifierBadge(partner) {
    let opBadge = '';
    const spouseId = partner.spouse_partner_id || partner.official_account_partner_id;
    let coOpPartner = null;
    if (spouseId) {
        coOpPartner = partnersList.find(x => x.partner_id === spouseId || x.member_no === spouseId);
    }
    const coOpName = coOpPartner ? getPartnerDisplayName(coOpPartner) : (spouseId || '');

    if (partner.operation_mode === '共同經營' || partner.account_holder_type === '共同經營者') {
        const nameText = coOpName ? `【${coOpName}】` : '';
        opBadge = `<span class="badge badge-info"><i class="fa-solid fa-user-group me-1"></i>共同經營${nameText}</span>`;
    } else if (partner.operation_mode === '獨立經營') {
        const nameText = coOpName ? `【${coOpName}】` : '';
        opBadge = `<span class="badge badge-warning"><i class="fa-solid fa-user-shield me-1"></i>獨立經營${nameText}</span>`;
    }

    let memberNoHtml = '';
    if (partner.member_no && String(partner.member_no).trim() !== '') {
        memberNoHtml = `<span class="text-secondary small font-monospace">${partner.member_no.trim()}</span>`;
    }

    return [memberNoHtml, opBadge].filter(Boolean).join(' ');
}

function getRelationBadge(relation, partnerId = '') {
    if (partnerId === 'PTN-TW-001' || partnerId === 'PTN-TW-002' || relation === '核心成員') {
        return `<span class="badge badge-outline-purple"><i class="fa-solid fa-crown me-1"></i>核心成員</span>`;
    }
    switch (relation) {
        case '上線': return `<span class="badge badge-outline-green">上線</span>`;
        case '旁線': return `<span class="badge badge-outline-orange">旁線</span>`;
        case '下線':
        default: return `<span class="badge badge-outline-blue">下線</span>`;
    }
}

function getOperatorStatusBadge(status) {
    switch (status) {
        case '活躍': return `<span class="badge badge-outline-success-subtle">活躍</span>`;
        case '停滯': return `<span class="badge badge-outline-warning-subtle">停滯</span>`;
        case '沉睡': return `<span class="badge badge-outline-danger-subtle">沉睡</span>`;
        case '凍結': return `<span class="badge badge-outline-muted-subtle">凍結</span>`;
        default: return `<span class="badge badge-muted-subtle">未設定</span>`;
    }
}

function getMemberStatusBadge(status) {
    switch (status) {
        case '有效且領獎金': return `<span class="badge badge-success">有效且領獎金</span>`;
        case '維持160SV續約': return `<span class="badge badge-warning">維持160SV續約</span>`;
        case '失效': return `<span class="badge badge-muted">失效</span>`;
        default: return `<span class="badge badge-muted-subtle">未設定</span>`;
    }
}

function getActivityLevelBadge(level) {
    switch (level) {
        case '積極參與': return '<span class="badge badge-success-subtle">積極參與</span>';
        case '參與': return '<span class="badge badge-warning-subtle">參與</span>';
        case '不參與': return '<span class="badge badge-danger-subtle">不參與</span>';
        case '自用消費': return '<span class="badge badge-info-subtle">自用消費</span>';
        case '操作人頭': return '<span class="badge badge-purple-subtle">操作人頭</span>';
        case '失聯': return '<span class="badge badge-muted-subtle">失聯</span>';
        case '個資未知': return '<span class="badge badge-muted-subtle">個資未知</span>';
        case '非團隊成員': return '<span class="badge badge-dark">非團隊成員</span>';
        default: return '<span class="badge badge-muted-subtle">未設定</span>';
    }
}

function getHealthStatusBadge(status) {
    switch (status) {
        case '良好': return '<span class="badge badge-success-subtle">良好</span>';
        case '亞健康': return '<span class="badge badge-warning-subtle">亞健康</span>';
        case '慢性體質': return '<span class="badge badge-danger-subtle">慢性體質</span>';
        case '調養中': return '<span class="badge badge-info-subtle">調養中</span>';
        case '罹患疾病': return '<span class="badge badge-danger">罹患疾病</span>';
        case '待了解': return '<span class="badge badge-muted-subtle">待了解</span>';
        default: return '<span class="badge badge-muted-subtle">未設定</span>';
    }
}

function getFinancialStatusBadge(status) {
    switch (status) {
        case '寬裕': return '<span class="badge badge-success-subtle">寬裕</span>';
        case '穩定': return '<span class="badge badge-info-subtle">穩定</span>';
        case '吃緊': return '<span class="badge badge-warning-subtle">吃緊</span>';
        case '高負債': return '<span class="badge badge-danger-subtle">高負債</span>';
        case '尋找副業': return '<span class="badge badge-purple-subtle">尋找副業</span>';
        default: return '<span class="badge badge-muted-subtle">未設定</span>';
    }
}

// ============================================================================
// 5. 核心過濾器引擎 (12 欄位精準過濾)
// ============================================================================
function getFilteredPartners() {
    const fCountry = $('#filter-country-code').val();
    const fResidence = $('#filter-current-residence').val();
    const fHighestRank = $('#filter-highest-rank-id').val();
    const fIsOurTeam = $('#filter-is-our-team').val();
    const fActivity = $('#filter-activity-level').val();
    const fRelation = $('#filter-relation-type').val();
    const fMemberStatus = $('#filter-member-status').val();
    const fOperatorStatus = $('#filter-operator-status').val();
    const fIdentityType = $('#filter-identity-type').val();
    const fUsageIdentity = $('#filter-usage-identity').val();
    const fHealthStatus = $('#filter-health-status').val();
    const fFinancialStatus = $('#filter-financial-status').val();

    return partnersList.filter(p => {
        const person = getPersonMaster(p.person_id);

        if (fCountry && p.country_code !== fCountry) return false;
        if (fResidence && person.current_residence !== fResidence) return false;
        if (fHighestRank && p.highest_rank_id !== fHighestRank) return false;
        if (fIsOurTeam && p.is_our_team !== fIsOurTeam) return false;
        if (fActivity && p.activity_level !== fActivity) return false;
        if (fRelation && p.relation_type !== fRelation) return false;
        if (fMemberStatus && p.member_status !== fMemberStatus) return false;
        if (fOperatorStatus && p.operator_status !== fOperatorStatus) return false;
        if (fIdentityType && person.identity_type !== fIdentityType) return false;
        if (fUsageIdentity && person.usage_identity !== fUsageIdentity) return false;
        if (fHealthStatus && person.health_status !== fHealthStatus) return false;
        if (fFinancialStatus && person.financial_status !== fFinancialStatus) return false;

        return true;
    });
}

function renderAllViews() {
    const list = getFilteredPartners();

    $('#hud-total-partners').text(list.length);
    $('#hud-core-partners').text(list.filter(p => p.is_our_team === 'Y').length);
    $('#hud-my-partners').text(list.filter(p => p.country_code === 'MY').length);

    renderCardsView(list);
    renderDataTableView(list);
    renderBatchEditorTable(list);
    renderTreeView();
    renderChartsView(list);
}

// ============================================================================
// 6. 戰術視圖渲染 (Cards / Table / Batch / Tree)
// ============================================================================
function renderCardsView(list) {
    const grid = $('#partner-cards-grid').empty();
    if (list.length === 0) {
        grid.html('<div class="col-12 text-center text-muted py-5"><i class="fa-solid fa-users-slash fa-2x mb-2"></i><br>目前篩選條件下無符合之成員檔案</div>');
        return;
    }

    list.forEach(p => {
        const person = getPersonMaster(p.person_id);
        const gender = person.gender || '男';
        const avatarUrl = p.avatar_url || person.avatar_url || getDefaultAvatar(gender);
        const currentRank = getRankInfo(p.current_rank_id);
        const highestRank = getRankInfo(p.highest_rank_id);
        const cardBorderClass = (p.partner_id === 'PTN-TW-001' || p.partner_id === 'PTN-TW-002') ? 'is-core' : (p.relation_type === '旁線' ? 'is-cross' : '');
        const mentorName = getPartnerDisplayName(p.known_mentor_id);
        const dispName = getPartnerDisplayName(p);
        const identifierHtml = renderMemberIdentifierBadge(p);

        const cardHtml = `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="partner-card ${cardBorderClass}">
                    <div>
                        <div class="d-flex align-items-start justify-content-between mb-3">
                            <div class="d-flex align-items-center gap-3">
                                <div class="partner-avatar-wrap">
                                    <img src="${avatarUrl}" class="partner-avatar" alt="${dispName}" onerror="this.src='${getDefaultAvatar(gender)}'">
                                    <span class="rank-badge-floating" style="background-color: #130e24; border: 1px solid ${currentRank.badge_color_hex}; color: ${currentRank.badge_color_hex};">
                                        <i class="${currentRank.badge_icon_class}"></i> ${currentRank.rank_name_zh}
                                    </span>
                                </div>
                                <div>
                                    <div class="d-flex align-items-center gap-2">
                                        <h6 class="mb-0 fw-bold text-white fs-5">${dispName}</h6>
                                        ${getCountryBadge(p.country_code)}
                                    </div>
                                    <div class="d-flex flex-wrap align-items-center gap-1 mt-1">
                                        ${p.leader_title ? `<span class="badge badge-primary">${p.leader_title}</span>` : ''}
                                        ${identifierHtml}
                                    </div>
                                </div>
                            </div>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-info py-1 px-2" onclick="openPartnerModalForView('${p.partner_id}')" title="查看"><i class="fa-solid fa-magnifying-glass"></i></button>
                                <button class="btn btn-outline-secondary py-1 px-2" onclick="openPartnerModalForEdit('${p.partner_id}')" title="編輯"><i class="fa-solid fa-pen-to-square"></i></button>
                                <button class="btn btn-outline-danger py-1 px-2" onclick="deletePartnerRecord('${p.partner_id}')" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
                            </div>
                        </div>

                        <div class="p-2 rounded-3 bg-black bg-opacity-30 border border-secondary border-opacity-10 mb-3">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-award text-warning"></i> 葡眾官方最高職級</span>
                                ${buildRankBadge(highestRank)}
                            </div>
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-people-arrows"></i> 關係屬性 / 營運</span>
                                <div>
                                    ${getRelationBadge(p.relation_type, p.partner_id)}
                                    ${getOperatorStatusBadge(p.operator_status)}
                                </div>
                            </div>
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-person-chalkboard text-info"></i> 實質輔導上線</span>
                                <span class="text-white">${mentorName || '（無特定指派）'}</span>
                            </div>
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-map-pin text-danger"></i> 現居地 / 職業</span>
                                <span class="text-light">${person.current_residence || '未填'} ‧ ${person.occupation_background || '未填'}</span>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="text-secondary"><i class="fa-solid fa-bolt text-accent"></i> 團隊參與度</span>
                                ${getActivityLevelBadge(p.activity_level)}
                            </div>
                        </div>

                        ${p.team_skills ? `<div class="mb-2"><span class="badge badge-dark"><i class="fa-solid fa-tags me-1"></i> ${p.team_skills}</span></div>` : ''}

                        <p class="text-secondary small mb-0 text-truncate-2" style="font-size: 0.82rem;">
                            ${p.team_notes || person.financial_notes || '暫無戰術備註記錄。'}
                        </p>
                    </div>
                </div>
            </div>
        `;
        grid.append(cardHtml);
    });
}

function renderDataTableView(list) {
    if (dataTableInstance) {
        dataTableInstance.destroy();
        $('#partners-table-body').empty();
    }

    list.forEach(p => {
        const person = getPersonMaster(p.person_id);
        const gender = person.gender || '男';
        const avatarUrl = p.avatar_url || person.avatar_url || getDefaultAvatar(gender);
        const currentRank = getRankInfo(p.current_rank_id);
        const highestRank = getRankInfo(p.highest_rank_id);
        const mentorName = getPartnerDisplayName(p.known_mentor_id);
        const dispName = getPartnerDisplayName(p);
        const identifierHtml = renderMemberIdentifierBadge(p);

        const rowHtml = `
            <tr>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <img src="${avatarUrl}" class="rounded-circle border border-primary border-opacity-50" width="32" height="32" onerror="this.src='${getDefaultAvatar(gender)}'">
                        <div>
                            <div class="fw-bold text-white">${dispName}</div>
                            <div>${identifierHtml}</div>
                        </div>
                    </div>
                </td>
                <td>${getCountryBadge(p.country_code)}</td>
                <td>${buildRankBadge(currentRank)}</td>
                <td>${buildRankBadge(highestRank)}</td>
                <td><span class="text-white">${mentorName || '—'}</span></td>
                <td><span class="text-light">${person.current_residence || '—'}</span></td>
                <td><span class="text-light">${person.highest_education || '—'}</span></td>
                <td><span class="text-light">${person.occupation_background || '—'}</span></td>
                <td>${getHealthStatusBadge(person.health_status)}</td>
                <td>${getFinancialStatusBadge(person.financial_status)}</td>
                <td>${getRelationBadge(p.relation_type, p.partner_id)}</td>
                <td>${getActivityLevelBadge(p.activity_level)}</td>
                <td>${getMemberStatusBadge(p.member_status)}</td>
                <td class="text-end">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-info py-1 px-2" onclick="openPartnerModalForView('${p.partner_id}')" title="查看"><i class="fa-solid fa-magnifying-glass"></i></button>
                        <button class="btn btn-outline-secondary py-1 px-2" onclick="openPartnerModalForEdit('${p.partner_id}')" title="編輯"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="btn btn-outline-danger py-1 px-2" onclick="deletePartnerRecord('${p.partner_id}')" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </td>
            </tr>
        `;
        $('#partners-table-body').append(rowHtml);
    });

    dataTableInstance = $('#partners-datatable').DataTable({
        responsive: false,
        scrollX: true,
        autoWidth: false
    });
}

function renderBatchEditorTable(list) {
    const $tbody = $('#batch-partners-tbody').empty();
    if (!list.length) {
        $tbody.html('<tr><td colspan="9" class="text-center text-muted py-4">無符合條件的夥伴資料</td></tr>');
        return;
    }

    list.forEach(p => {
        const dispName = getPartnerDisplayName(p);
        const memberNo = p.member_no || '—';

        let curRankOptions = `<option value="">(未設定)</option>`;
        let highRankOptions = `<option value="">(未設定)</option>`;
        ranksDatabase.forEach(rk => {
            curRankOptions += `<option value="${rk.rank_id}" ${p.current_rank_id === rk.rank_id ? 'selected' : ''}>${rk.rank_name_zh}</option>`;
            highRankOptions += `<option value="${rk.rank_id}" ${p.highest_rank_id === rk.rank_id ? 'selected' : ''}>${rk.rank_name_zh}</option>`;
        });

        const rowHtml = `
            <tr data-partner-id="${p.partner_id}">
                <td>
                    <div class="fw-bold text-light font-monospace">${p.partner_id}</div>
                    <span class="text-secondary small font-monospace">${memberNo}</span>
                </td>
                <td class="fw-bold text-light">${dispName}</td>
                <td>
                    <select class="form-select form-select-sm batch-select-cur-rank">${curRankOptions}</select>
                </td>
                <td>
                    <select class="form-select form-select-sm batch-select-high-rank">${highRankOptions}</select>
                </td>
                <td>
                    <select class="form-select form-select-sm batch-select-activity">
                        <option value="" ${!p.activity_level ? 'selected' : ''}>未設定</option>
                        <option value="積極參與" ${p.activity_level === '積極參與' ? 'selected' : ''}>積極參與</option>
                        <option value="參與" ${p.activity_level === '參與' ? 'selected' : ''}>參與</option>
                        <option value="不參與" ${p.activity_level === '不參與' ? 'selected' : ''}>不參與</option>
                        <option value="自用消費" ${p.activity_level === '自用消費' ? 'selected' : ''}>自用消費</option>
                        <option value="操作人頭" ${p.activity_level === '操作人頭' ? 'selected' : ''}>操作人頭</option>
                        <option value="失聯" ${p.activity_level === '失聯' ? 'selected' : ''}>失聯</option>
                        <option value="非團隊成員" ${p.activity_level === '非團隊成員' ? 'selected' : ''}>非團隊成員</option>
                    </select>
                </td>
                <td>
                    <select class="form-select form-select-sm batch-select-member-status">
                        <option value="" ${!p.member_status ? 'selected' : ''}>未設定</option>
                        <option value="有效且領獎金" ${p.member_status === '有效且領獎金' ? 'selected' : ''}>有效且領獎金</option>
                        <option value="維持160SV續約" ${p.member_status === '維持160SV續約' ? 'selected' : ''}>維持160SV續約</option>
                        <option value="失效" ${p.member_status === '失效' ? 'selected' : ''}>失效</option>
                    </select>
                </td>
                <td>
                    <select class="form-select form-select-sm batch-select-operator-status">
                        <option value="" ${!p.operator_status ? 'selected' : ''}>未設定</option>
                        <option value="活躍" ${p.operator_status === '活躍' ? 'selected' : ''}>活躍</option>
                        <option value="停滯" ${p.operator_status === '停滯' ? 'selected' : ''}>停滯</option>
                        <option value="沉睡" ${p.operator_status === '沉睡' ? 'selected' : ''}>沉睡</option>
                        <option value="凍結" ${p.operator_status === '凍結' ? 'selected' : ''}>凍結</option>
                    </select>
                </td>
                <td>
                    <select class="form-select form-select-sm batch-select-relation">
                        <option value="核心成員" ${p.relation_type === '核心成員' ? 'selected' : ''}>核心成員</option>
                        <option value="下線" ${p.relation_type === '下線' ? 'selected' : ''}>下線</option>
                        <option value="上線" ${p.relation_type === '上線' ? 'selected' : ''}>上線</option>
                        <option value="旁線" ${p.relation_type === '旁線' ? 'selected' : ''}>旁線</option>
                    </select>
                </td>
                <td>
                    <select class="form-select form-select-sm batch-select-is-our-team">
                        <option value="Y" ${p.is_our_team === 'Y' ? 'selected' : ''}>直轄</option>
                        <option value="N" ${p.is_our_team === 'N' ? 'selected' : ''}>旁線</option>
                    </select>
                </td>
            </tr>
        `;
        $tbody.append(rowHtml);
    });
}

// ============================================================================
// 7. 組織拓撲圖 (結合 org_relations 閉包表與雙欄夫妻卡片)
// ============================================================================
window.zoomOrgChart = function (delta) {
    orgChartZoom = Math.min(Math.max(0.4, orgChartZoom + delta), 1.8);
    applyOrgChartZoom();
};

window.resetOrgChartZoom = function () {
    orgChartZoom = 1.0;
    applyOrgChartZoom();
};

function applyOrgChartZoom() {
    $('#org-chart-container').css('transform', `scale(${orgChartZoom})`);
    $('#org-zoom-level-text').text(`${Math.round(orgChartZoom * 100)}%`);
}

window.downloadOrgChartPng = async function () {
    const targetEl = document.getElementById('org-chart-container');
    if (!targetEl) return;

    AppLoading.show('<i class="fa-solid fa-image text-primary"></i> 正在產生組織圖高畫質圖片...', '圖片匯出中');
    try {
        if (typeof html2canvas === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const prevTransform = targetEl.style.transform;
        targetEl.style.transform = 'none';

        const canvas = await html2canvas(targetEl, {
            backgroundColor: '#0a0618',
            scale: 2,
            useCORS: true,
            logging: false
        });

        targetEl.style.transform = prevTransform;

        const link = document.createElement('a');
        link.download = `RayTeam_組織拓撲圖_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        AppToast.success('組織拓撲圖 PNG 檔案已順利下載！');
    } catch (err) {
        AppToast.error('匯出圖片失敗：' + err.message);
    } finally {
        AppLoading.hide();
    }
};

function renderTreeView() {
    const $container = $('#org-chart-container').empty();
    const renderedSpousePartnerIds = new Set();

    function getNodeBorderClass(partner) {
        if (partner.partner_id === 'PTN-TW-001' || partner.partner_id === 'PTN-TW-002' || partner.relation_type === '核心成員') {
            return 'border-purple';
        }
        if (partner.relation_type === '上線') return 'border-green';
        if (partner.relation_type === '旁線') return 'border-orange';
        return 'border-blue';
    }

    function renderPartnerSubColumnHtml(partner, isSpouse = false) {
        const person = getPersonMaster(partner.person_id);
        const gender = person.gender || (isSpouse ? '女' : '男');
        const avatarUrl = partner.avatar_url || person.avatar_url || getDefaultAvatar(gender);
        const currentRank = getRankInfo(partner.current_rank_id);
        const highestRank = getRankInfo(partner.highest_rank_id);
        const dispName = getPartnerDisplayName(partner);
        const memberNoText = partner.member_no ? `<span class="font-monospace text-secondary small ms-1">(${partner.member_no})</span>` : '';

        return `
            <div class="org-couple-col position-relative">
                <button type="button" class="org-card-view-btn" onclick="openPartnerModalForView('${partner.partner_id}')" title="查看檔案">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>
                <div class="d-flex align-items-center gap-2 mb-2 pe-3">
                    <div class="partner-avatar-wrap" style="width: 38px; height: 38px;">
                        <img src="${avatarUrl}" class="rounded-circle border border-primary" width="38" height="38" onerror="this.src='${getDefaultAvatar(gender)}'">
                    </div>
                    <div class="overflow-hidden">
                        <div class="fw-bold text-white text-truncate">${dispName}${memberNoText}</div>
                        <div class="d-flex gap-1 align-items-center mt-1">
                            ${getCountryBadge(partner.country_code)}
                            ${getRelationBadge(partner.relation_type, partner.partner_id)}
                        </div>
                    </div>
                </div>
                <div class="d-flex flex-column gap-1 pt-1 border-top border-secondary border-opacity-25 small">
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="text-secondary">實際職級:</span>
                        ${buildRankBadge(currentRank)}
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="text-secondary">最高職級:</span>
                        ${buildRankBadge(highestRank)}
                    </div>
                </div>
            </div>
        `;
    }

    function buildOrgChartBranch(partner) {
        if (renderedSpousePartnerIds.has(partner.partner_id)) return '';

        const spouseId = partner.spouse_partner_id;
        const spouse = spouseId ? partnersList.find(x => x.partner_id === spouseId || x.member_no === spouseId) : null;
        const isCoOp = spouse && (partner.operation_mode === '共同經營' || partner.account_holder_type === '共同經營者' || spouse.operation_mode === '共同經營' || spouse.account_holder_type === '共同經營者');

        let cardHtml = '';
        if (isCoOp) {
            renderedSpousePartnerIds.add(spouse.partner_id);
            cardHtml = `
                <div class="org-node-card org-couple-card ${getNodeBorderClass(partner)}">
                    ${renderPartnerSubColumnHtml(partner, false)}
                    <div class="org-couple-divider"></div>
                    ${renderPartnerSubColumnHtml(spouse, true)}
                </div>
            `;
        } else {
            cardHtml = `
                <div class="org-node-card ${getNodeBorderClass(partner)}">
                    ${renderPartnerSubColumnHtml(partner, false)}
                </div>
            `;
        }

        const children = partnersList.filter(p =>
            (p.sponsor_id === partner.partner_id || (spouseId && p.sponsor_id === spouseId)) &&
            p.partner_id !== spouseId &&
            !renderedSpousePartnerIds.has(p.partner_id)
        );

        const directRel = orgRelationsList.find(r => r.ancestor_id === partner.sponsor_id && r.descendant_id === partner.partner_id && r.depth === 1);
        const isUnknownLink = (directRel && (directRel.is_depth_exact === 'N' || directRel.is_depth_exact === '否' || directRel.link_nature === '未知斷層直連')) ||
            partner.upline_link_type === '中間未知' ||
            partner.upline_link_type === '未知斷層直連';

        const liClass = isUnknownLink ? 'class="link-unknown"' : '';

        let html = `
            <li ${liClass}>
                <div class="org-node-wrapper">
                    ${cardHtml}
                </div>
        `;

        if (children.length > 0) {
            html += `<ul>`;
            children.forEach(c => { html += buildOrgChartBranch(c); });
            html += `</ul>`;
        }

        html += `</li>`;
        return html;
    }

    const roots = partnersList.filter(p =>
        (!p.sponsor_id || p.sponsor_id === 'ROOT' || p.sponsor_id === 'SYSTEM_ROOT' || p.partner_id === 'PTN-TW-001' || p.partner_id === 'PTN-001') &&
        p.account_holder_type !== '共同經營者'
    );

    if (roots.length === 0 && partnersList.length > 0) roots.push(partnersList[0]);

    let treeHtml = `<ul class="org-tree">`;
    roots.forEach(r => { treeHtml += buildOrgChartBranch(r); });
    treeHtml += `</ul>`;

    $container.append(treeHtml);
    applyOrgChartZoom();
}

// ============================================================================
// 8. 戰情統計與分析圖表 (語言矩陣 + 個人資訊 12 圓餅圖 + 組織體系 18 戰術圖表)
// ============================================================================
const getPieTooltipOptions = () => ({
    plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {
            callbacks: {
                label: function (context) {
                    const label = context.label || '';
                    const val = Number(context.parsed) || 0;
                    const dataset = context.chart.data.datasets[context.datasetIndex];
                    const total = dataset.data.reduce((acc, cur) => acc + Number(cur), 0);
                    const percentage = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                    return ` ${label}: ${val} 人 (${percentage}%)`;
                }
            }
        }
    }
});

window.changeLanguageAnalysis = function (selectedLang) {
    const dataset = getFilteredPartners();
    renderLanguageSectionCharts(selectedLang, dataset);
};

function renderLanguageSectionCharts(targetLang, dataset) {
    const langChartKeys = ['langListening', 'langSpeaking', 'langReading', 'langWriting'];
    langChartKeys.forEach(k => {
        if (chartInstances[k]) {
            chartInstances[k].destroy();
            delete chartInstances[k];
        }
    });

    const activePersonIds = new Set(dataset.map(p => p.person_id));
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
        { id: 'chart-lang-listening', key: 'langListening', field: 'listening_level' },
        { id: 'chart-lang-speaking', key: 'langSpeaking', field: 'speaking_level' },
        { id: 'chart-lang-reading', key: 'langReading', field: 'reading_level' },
        { id: 'chart-lang-writing', key: 'langWriting', field: 'writing_level' }
    ];

    dimensions.forEach(dim => {
        const ctx = document.getElementById(dim.id);
        if (ctx) {
            chartInstances[dim.key] = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: levels,
                    datasets: [{
                        data: countProficiency(dim.field),
                        backgroundColor: levelColors,
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    ...getPieTooltipOptions()
                }
            });
        }
    });
}

function calculatePartnerGenDepth(partnerId, allList, visited = new Set()) {
    if (!partnerId || visited.has(partnerId)) return 0;
    visited.add(partnerId);
    const children = allList.filter(p => p.sponsor_id === partnerId && p.partner_id !== partnerId);
    if (children.length === 0) return 0;
    let maxChildDepth = 0;
    for (const child of children) {
        maxChildDepth = Math.max(maxChildDepth, calculatePartnerGenDepth(child.partner_id, allList, new Set(visited)));
    }
    return 1 + maxChildDepth;
}

function renderChartsView(filteredDataset = null) {
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};

    const dataset = filteredDataset || getFilteredPartners();

    const createCountMap = (key, defaultKeys = []) => {
        const map = {};
        defaultKeys.forEach(k => { map[k] = 0; });
        dataset.forEach(p => {
            const person = getPersonMaster(p.person_id);
            const rawVal = p[key] || person[key];
            const val = (rawVal && String(rawVal).trim() !== '') ? String(rawVal).trim() : '未設定';
            map[val] = (map[val] || 0) + 1;
        });
        return map;
    };

    const currentSelectedLang = $('#select-lang-filter').val() || '中文';
    renderLanguageSectionCharts(currentSelectedLang, dataset);

    // 1. 身份
    const idTypeCounts = createCountMap('identity_type', ['夥伴', '團隊成員', '潛在團隊成員', '客戶', '潛在客戶']);
    const ctxIdType = document.getElementById('chart-identity-type-split');
    if (ctxIdType) {
        chartInstances.idType = new Chart(ctxIdType, {
            type: 'pie',
            data: { labels: Object.keys(idTypeCounts), datasets: [{ data: Object.values(idTypeCounts), backgroundColor: ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 2. 使用身份
    const usageCounts = createCountMap('usage_identity', ['經營者', '消費者']);
    const ctxUsage = document.getElementById('chart-usage-identity-split');
    if (ctxUsage) {
        chartInstances.usageId = new Chart(ctxUsage, {
            type: 'pie',
            data: { labels: Object.keys(usageCounts), datasets: [{ data: Object.values(usageCounts), backgroundColor: ['#a855f7', '#38bdf8'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 3. 年齡分佈 (8 個指定區間)
    const ageCategories = ['17歲以下', '18-29歲', '30-39歲', '40-49歲', '50-59歲', '60-69歲', '70-79歲', '80歲以上'];
    const ageCounts = {};
    ageCategories.forEach(c => { ageCounts[c] = 0; });
    dataset.forEach(p => {
        const person = getPersonMaster(p.person_id);
        if (person.birthday && person.birthday.length >= 4) {
            const birthYear = parseInt(person.birthday.slice(0, 4), 10);
            if (!isNaN(birthYear)) {
                const age = 2026 - birthYear;
                if (age <= 17) ageCounts['17歲以下']++;
                else if (age <= 29) ageCounts['18-29歲']++;
                else if (age <= 39) ageCounts['30-39歲']++;
                else if (age <= 49) ageCounts['40-49歲']++;
                else if (age <= 59) ageCounts['50-59歲']++;
                else if (age <= 69) ageCounts['60-69歲']++;
                else if (age <= 79) ageCounts['70-79歲']++;
                else ageCounts['80歲以上']++;
            }
        }
    });
    const ctxAge = document.getElementById('chart-age-distribution');
    if (ctxAge) {
        chartInstances.age = new Chart(ctxAge, {
            type: 'pie',
            data: { labels: ageCategories, datasets: [{ data: ageCategories.map(c => ageCounts[c]), backgroundColor: ['#38bdf8', '#34d399', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#a78bfa'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 4. 生理性別
    const genderCounts = createCountMap('gender', ['男', '女', '其他', '未填']);
    const ctxGender = document.getElementById('chart-gender-split');
    if (ctxGender) {
        chartInstances.gender = new Chart(ctxGender, {
            type: 'pie',
            data: { labels: Object.keys(genderCounts), datasets: [{ data: Object.values(genderCounts), backgroundColor: ['#38bdf8', '#f472b6', '#a78bfa', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 5. 國籍 (僅顯示有打的資料，沒有打的一律歸為「未設定」)
    const rawNatMap = {};
    dataset.forEach(p => {
        const person = getPersonMaster(p.person_id);
        let n = (person.nationality && person.nationality.trim() !== '') ? person.nationality.trim() : '未設定';
        if (n === '台灣' || n === 'TW') n = '中華民國';
        rawNatMap[n] = (rawNatMap[n] || 0) + 1;
    });
    const ctxNat = document.getElementById('chart-nationality-split');
    if (ctxNat) {
        chartInstances.nationality = new Chart(ctxNat, {
            type: 'pie',
            data: { labels: Object.keys(rawNatMap), datasets: [{ data: Object.values(rawNatMap), backgroundColor: ['#0284c7', '#f59e0b', '#dc2626', '#ec4899', '#8b5cf6', '#10b981', '#06b6d4', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 6. 種族 (僅顯示有打的資料，沒有打的一律歸為「未設定」)
    const rawEthMap = {};
    dataset.forEach(p => {
        const person = getPersonMaster(p.person_id);
        const eth = (person.ethnicity && person.ethnicity.trim() !== '') ? person.ethnicity.trim() : '未設定';
        rawEthMap[eth] = (rawEthMap[eth] || 0) + 1;
    });
    const ctxEth = document.getElementById('chart-ethnicity-split');
    if (ctxEth) {
        chartInstances.ethnicity = new Chart(ctxEth, {
            type: 'pie',
            data: { labels: Object.keys(rawEthMap), datasets: [{ data: Object.values(rawEthMap), backgroundColor: ['#f43f5e', '#3b82f6', '#fbbf24', '#10b981', '#a78bfa', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 7. 家鄉城市
    const homeCounts = createCountMap('hometown');
    const ctxHome = document.getElementById('chart-hometown-split');
    if (ctxHome) {
        chartInstances.hometown = new Chart(ctxHome, {
            type: 'pie',
            data: { labels: Object.keys(homeCounts), datasets: [{ data: Object.values(homeCounts), backgroundColor: ['#6366f1', '#14b8a6', '#f97316', '#eab308', '#ec4899', '#a855f7', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 8. 現居地
    const resCounts = createCountMap('current_residence');
    const ctxRes = document.getElementById('chart-residence-split');
    if (ctxRes) {
        chartInstances.residence = new Chart(ctxRes, {
            type: 'pie',
            data: { labels: Object.keys(resCounts), datasets: [{ data: Object.values(resCounts), backgroundColor: ['#0284c7', '#38bdf8', '#34d399', '#facc15', '#f472b6', '#a78bfa', '#fb7185', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 9. 認識年份
    const metYearCounts = {};
    dataset.forEach(p => {
        const person = getPersonMaster(p.person_id);
        const y = (person.met_date && person.met_date.length >= 4) ? person.met_date.slice(0, 4) + '年' : '未記錄';
        metYearCounts[y] = (metYearCounts[y] || 0) + 1;
    });
    const ctxMetYear = document.getElementById('chart-met-year-split');
    if (ctxMetYear) {
        chartInstances.metYear = new Chart(ctxMetYear, {
            type: 'pie',
            data: { labels: Object.keys(metYearCounts), datasets: [{ data: Object.values(metYearCounts), backgroundColor: ['#10b981', '#38bdf8', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 10. 最高學歷
    const eduCounts = createCountMap('highest_education', ['博士', '碩士', '學士', '副學士', '高中職', '國中', '國小']);
    const ctxEdu = document.getElementById('chart-education-distribution');
    if (ctxEdu) {
        chartInstances.education = new Chart(ctxEdu, {
            type: 'pie',
            data: { labels: Object.keys(eduCounts), datasets: [{ data: Object.values(eduCounts), backgroundColor: ['#8b5cf6', '#0284c7', '#38bdf8', '#34d399', '#fbbf24', '#f97316', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 11. 健康狀況
    const healthCategories = ['良好', '亞健康', '慢性體質', '調養中', '罹患疾病', '待了解'];
    const healthCounts = createCountMap('health_status', healthCategories);
    const ctxHealth = document.getElementById('chart-health-status-split');
    if (ctxHealth) {
        chartInstances.healthStatus = new Chart(ctxHealth, {
            type: 'pie',
            data: { labels: healthCategories, datasets: [{ data: healthCategories.map(c => healthCounts[c] || 0), backgroundColor: ['#10b981', '#fbbf24', '#f97316', '#38bdf8', '#ef4444', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 12. 財務狀況 (寬裕標籤)
    const finCounts = createCountMap('financial_status', ['寬裕', '穩定', '吃緊', '高負債', '尋找副業']);
    const ctxFin = document.getElementById('chart-financial-status-split');
    if (ctxFin) {
        chartInstances.finStatus = new Chart(ctxFin, {
            type: 'pie',
            data: { labels: Object.keys(finCounts), datasets: [{ data: Object.values(finCounts), backgroundColor: ['#10b981', '#38bdf8', '#fbbf24', '#ef4444', '#c084fc'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 13. 國家市場
    const twCount = dataset.filter(p => p.country_code === 'TW').length;
    const ctxMarket = document.getElementById('chart-market-split');
    if (ctxMarket) {
        chartInstances.market = new Chart(ctxMarket, {
            type: 'pie',
            data: { labels: ['台灣 (TW)', '大馬 (MY)'], datasets: [{ data: [twCount, dataset.length - twCount], backgroundColor: ['#38bdf8', '#fbbf24'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 14. 當前實際職級
    const curRankLabels = []; const curRankData = []; const curRankColors = [];
    ranksDatabase.forEach(rk => {
        const count = dataset.filter(p => p.current_rank_id === rk.rank_id).length;
        if (count > 0) {
            curRankLabels.push(rk.rank_name_zh);
            curRankData.push(count);
            curRankColors.push(rk.badge_color_hex || '#8b5cf6');
        }
    });
    const unsetCur = dataset.filter(p => !p.current_rank_id).length;
    if (unsetCur > 0) { curRankLabels.push('未設定'); curRankData.push(unsetCur); curRankColors.push('#64748b'); }
    const ctxCurRank = document.getElementById('chart-current-rank-split');
    if (ctxCurRank) {
        chartInstances.curRank = new Chart(ctxCurRank, {
            type: 'pie',
            data: { labels: curRankLabels, datasets: [{ data: curRankData, backgroundColor: curRankColors, borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 15. 官方最高職級
    const highRankLabels = []; const highRankData = []; const highRankColors = [];
    ranksDatabase.forEach(rk => {
        const count = dataset.filter(p => p.highest_rank_id === rk.rank_id).length;
        if (count > 0) {
            highRankLabels.push(rk.rank_name_zh);
            highRankData.push(count);
            highRankColors.push(rk.badge_color_hex || '#8b5cf6');
        }
    });
    const unsetHigh = dataset.filter(p => !p.highest_rank_id).length;
    if (unsetHigh > 0) { highRankLabels.push('未設定'); highRankData.push(unsetHigh); highRankColors.push('#64748b'); }
    const ctxHighRank = document.getElementById('chart-highest-rank-split');
    if (ctxHighRank) {
        chartInstances.highRank = new Chart(ctxHighRank, {
            type: 'pie',
            data: { labels: highRankLabels, datasets: [{ data: highRankData, backgroundColor: highRankColors, borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 16. 直轄 vs 旁線
    const ourTeamCount = dataset.filter(p => p.is_our_team === 'Y').length;
    const ctxTeam = document.getElementById('chart-team-split');
    if (ctxTeam) {
        chartInstances.team = new Chart(ctxTeam, {
            type: 'pie',
            data: { labels: ['Ray&Jarvis直轄', '旁線友軍'], datasets: [{ data: [ourTeamCount, dataset.length - ourTeamCount], backgroundColor: ['#8b5cf6', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 17. 團隊參與狀態
    const actCategories = ['積極參與', '參與', '不參與', '自用消費', '操作人頭', '失聯', '個資未知', '非團隊成員'];
    const actCounts = createCountMap('activity_level', actCategories);
    const ctxActivity = document.getElementById('chart-activity-distribution');
    if (ctxActivity) {
        chartInstances.activity = new Chart(ctxActivity, {
            type: 'pie',
            data: { labels: actCategories, datasets: [{ data: actCategories.map(c => actCounts[c] || 0), backgroundColor: ['#34d399', '#38bdf8', '#ef4444', '#0284c7', '#c084fc', '#f59e0b', '#94a3b8', '#475569'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 18. 官方會籍狀態
    const memCounts = createCountMap('member_status', ['有效且領獎金', '維持160SV續約', '失效']);
    const ctxMemberPie = document.getElementById('chart-member-status-pie');
    if (ctxMemberPie) {
        chartInstances.memberPie = new Chart(ctxMemberPie, {
            type: 'pie',
            data: { labels: Object.keys(memCounts), datasets: [{ data: Object.values(memCounts), backgroundColor: ['#059669', '#d97706', '#dc2626'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 19. 上線連結模式
    const uplineCounts = createCountMap('upline_link_type', ['直屬已知', '中間未知', '體系頂層']);
    const ctxUpline = document.getElementById('chart-upline-link-distribution');
    if (ctxUpline) {
        chartInstances.uplineLink = new Chart(ctxUpline, {
            type: 'pie',
            data: { labels: Object.keys(uplineCounts), datasets: [{ data: Object.values(uplineCounts), backgroundColor: ['#10b981', '#f87171', '#8b5cf6'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 20. 組織關係屬性
    const relCounts = createCountMap('relation_type', ['核心成員', '下線', '上線', '旁線', '中繼層']);
    const ctxRel = document.getElementById('chart-relation-split');
    if (ctxRel) {
        chartInstances.relation = new Chart(ctxRel, {
            type: 'pie',
            data: { labels: Object.keys(relCounts), datasets: [{ data: Object.values(relCounts), backgroundColor: ['#8b5cf6', '#38bdf8', '#10b981', '#f97316', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 21. 營運狀態
    const opCounts = createCountMap('operator_status', ['活躍', '停滯', '沉睡', '凍結']);
    const ctxOp = document.getElementById('chart-operator-status');
    if (ctxOp) {
        chartInstances.operator = new Chart(ctxOp, {
            type: 'pie',
            data: { labels: Object.keys(opCounts), datasets: [{ data: Object.values(opCounts), backgroundColor: ['#10b981', '#fbbf24', '#f43f5e', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 22. 經營身分類型
    const holderCounts = createCountMap('account_holder_type', ['個人經營者', '主要經營者', '共同經營者']);
    const ctxHolder = document.getElementById('chart-account-holder-distribution');
    if (ctxHolder) {
        chartInstances.accountHolder = new Chart(ctxHolder, {
            type: 'pie',
            data: { labels: Object.keys(holderCounts), datasets: [{ data: Object.values(holderCounts), backgroundColor: ['#0284c7', '#34d399', '#f59e0b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 23. 經營權模式
    const modeCounts = createCountMap('operation_mode', ['個人經營', '共同經營', '獨立經營']);
    const ctxMode = document.getElementById('chart-mode-distribution');
    if (ctxMode) {
        chartInstances.mode = new Chart(ctxMode, {
            type: 'pie',
            data: { labels: Object.keys(modeCounts), datasets: [{ data: Object.values(modeCounts), backgroundColor: ['#a78bfa', '#f472b6', '#38bdf8'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 24. 入會動機
    const motiveCounts = createCountMap('joining_motive', ['HEALTH', 'PART_TIME', 'FULL_TIME', 'RELATION']);
    const motiveLabels = { 'HEALTH': '體質調養', 'PART_TIME': '兼職副業', 'FULL_TIME': '全職創業', 'RELATION': '人情支持', '未設定': '未設定' };
    const ctxMotive = document.getElementById('chart-motive-distribution');
    if (ctxMotive) {
        chartInstances.motive = new Chart(ctxMotive, {
            type: 'pie',
            data: { labels: Object.keys(motiveCounts).map(k => motiveLabels[k] || k), datasets: [{ data: Object.values(motiveCounts), backgroundColor: ['#ec4899', '#f59e0b', '#10b981', '#38bdf8', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 25. 有效代數深度 Top 10
    const depthData = [];
    dataset.forEach(p => {
        const depth = calculatePartnerGenDepth(p.partner_id, partnersList);
        if (depth > 0) depthData.push({ name: getPartnerDisplayName(p) || p.partner_id, depth });
    });
    const sortedDepth = depthData.sort((a, b) => b.depth - a.depth).slice(0, 10);
    const ctxDepth = document.getElementById('chart-gen-depth-top10');
    if (ctxDepth) {
        chartInstances.genDepth = new Chart(ctxDepth, {
            type: 'bar',
            data: { labels: sortedDepth.map(x => x.name), datasets: [{ label: '有效代數深度', data: sortedDepth.map(x => x.depth), backgroundColor: '#8b5cf6', borderRadius: 4 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                    x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } }
                }
            }
        });
    }

    // 26. 輔導下線人數 Top 10
    const mentorCounts = {};
    dataset.forEach(p => {
        if (p.known_mentor_id && p.known_mentor_id !== 'ROOT' && p.known_mentor_id !== 'SYSTEM_ROOT') {
            const mName = getPartnerDisplayName(p.known_mentor_id) || p.known_mentor_id;
            mentorCounts[mName] = (mentorCounts[mName] || 0) + 1;
        }
    });
    const sortedMentors = Object.entries(mentorCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const ctxMentor = document.getElementById('chart-mentor-mentees-top10');
    if (ctxMentor) {
        chartInstances.mentor = new Chart(ctxMentor, {
            type: 'bar',
            data: { labels: sortedMentors.map(x => x[0]), datasets: [{ label: '輔導下線人數', data: sortedMentors.map(x => x[1]), backgroundColor: '#10b981', borderRadius: 4 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                    x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } }
                }
            }
        });
    }

    // 27. 簽約加入年份趨勢
    const joinYearCounts = {};
    dataset.forEach(p => {
        if (p.join_date) {
            const y = p.join_date.slice(0, 4);
            joinYearCounts[y] = (joinYearCounts[y] || 0) + 1;
        }
    });
    const joinYears = Object.keys(joinYearCounts).sort();
    const ctxJoinYear = document.getElementById('chart-join-year-line');
    if (ctxJoinYear) {
        chartInstances.joinYear = new Chart(ctxJoinYear, {
            type: 'line',
            data: { labels: joinYears, datasets: [{ data: joinYears.map(k => joinYearCounts[k]), borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.2)', fill: true, tension: 0.3 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 28. 退出解約年份趨勢
    const exitYearCounts = {};
    dataset.forEach(p => {
        if (p.exit_date) {
            const y = p.exit_date.slice(0, 4);
            exitYearCounts[y] = (exitYearCounts[y] || 0) + 1;
        }
    });
    const exitYears = Object.keys(exitYearCounts).length ? Object.keys(exitYearCounts).sort() : ['2024', '2025', '2026'];
    const ctxExitYear = document.getElementById('chart-exit-year-line');
    if (ctxExitYear) {
        chartInstances.exitYear = new Chart(ctxExitYear, {
            type: 'line',
            data: { labels: exitYears, datasets: [{ data: exitYears.map(k => exitYearCounts[k] || 0), borderColor: '#f43f5e', backgroundColor: 'rgba(244, 63, 94, 0.2)', fill: true, tension: 0.3 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 29. 資格截止月份分佈
    const dueMonthCounts = {};
    for (let i = 1; i <= 12; i++) { dueMonthCounts[`${i}月`] = 0; }
    dataset.forEach(p => {
        if (p.renewal_due_date && p.renewal_due_date.includes('-')) {
            const m = parseInt(p.renewal_due_date.split('-')[1], 10);
            if (m >= 1 && m <= 12) dueMonthCounts[`${m}月`]++;
        }
    });
    const ctxDueMonth = document.getElementById('chart-renewal-due-month-bar');
    if (ctxDueMonth) {
        chartInstances.dueMonth = new Chart(ctxDueMonth, {
            type: 'bar',
            data: { labels: Object.keys(dueMonthCounts), datasets: [{ data: Object.values(dueMonthCounts), backgroundColor: '#fbbf24', borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 30. 官方續約月份分佈
    const renewalMonthCounts = {};
    for (let i = 1; i <= 12; i++) { renewalMonthCounts[`${i}月`] = 0; }
    dataset.forEach(p => {
        if (p.join_date && p.join_date.includes('-')) {
            const m = parseInt(p.join_date.split('-')[1], 10);
            if (m >= 1 && m <= 12) renewalMonthCounts[`${m}月`]++;
        }
    });
    const ctxRenewalMonth = document.getElementById('chart-renewal-month-distribution');
    if (ctxRenewalMonth) {
        chartInstances.renewalMonth = new Chart(ctxRenewalMonth, {
            type: 'bar',
            data: { labels: Object.keys(renewalMonthCounts), datasets: [{ data: Object.values(renewalMonthCounts), backgroundColor: '#34d399', borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
}

// ============================================================================
// 9. 彈窗與動態表格控制 (Modal Controllers)
// ============================================================================
window.addContactTableRow = function (contact = {}) {
    const $tbody = $('#form-contacts-dynamic-tbody');
    const platforms = ['LINE', 'WhatsApp', 'Discord', 'WeChat', 'Facebook', 'Instagram', 'Telegram', '其他'];
    const categories = ['ID', '顯示名稱', '連結'];

    const platformOptions = platforms.map(p => `<option value="${p}" ${p === (contact.platform_name || 'LINE') ? 'selected' : ''}>${p}</option>`).join('');
    const categoryOptions = categories.map(c => `<option value="${c}" ${c === (contact.category || 'ID') ? 'selected' : ''}>${c}</option>`).join('');

    const rowHtml = `
        <tr class="dynamic-contact-row">
            <td><select class="form-select form-select-sm contact-input-platform">${platformOptions}</select></td>
            <td><select class="form-select form-select-sm contact-input-category">${categoryOptions}</select></td>
            <td><input type="text" class="form-control form-control-sm contact-input-value" value="${contact.contact_value || ''}" placeholder="請輸入帳號/名稱/網址..."></td>
            <td>
                <select class="form-select form-select-sm contact-input-primary">
                    <option value="N" ${contact.is_primary !== 'Y' ? 'selected' : ''}>N (否)</option>
                    <option value="Y" ${contact.is_primary === 'Y' ? 'selected' : ''}>Y (是)</option>
                </select>
            </td>
            <td><input type="text" class="form-control form-control-sm contact-input-notes" value="${contact.notes || ''}" placeholder="備註..."></td>
            <td class="text-center">
                <button type="button" class="btn btn-outline-danger table-dynamic-action-btn" onclick="$(this).closest('tr').remove()" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>
    `;
    $tbody.append(rowHtml);
};

window.addLanguageTableRow = function (lang = {}) {
    const $tbody = $('#form-languages-dynamic-tbody');
    const languages = ['中文', '英文', '馬來文', '台語', '粵語', '客家話', '日文', '韓文', '泰文', '印尼文', '越南文', '其他'];
    const levels = ['精通', '流利', '普通', '略懂', '不會'];

    const langOptions = languages.map(l => `<option value="${l}" ${l === (lang.language_name || '中文') ? 'selected' : ''}>${l}</option>`).join('');
    const buildLevelOptions = (selectedVal) => levels.map(lv => `<option value="${lv}" ${lv === (selectedVal || '普通') ? 'selected' : ''}>${lv}</option>`).join('');

    const rowHtml = `
        <tr class="dynamic-lang-row">
            <td><select class="form-select form-select-sm lang-input-name">${langOptions}</select></td>
            <td><select class="form-select form-select-sm lang-input-listening">${buildLevelOptions(lang.listening_level)}</select></td>
            <td><select class="form-select form-select-sm lang-input-speaking">${buildLevelOptions(lang.speaking_level)}</select></td>
            <td><select class="form-select form-select-sm lang-input-reading">${buildLevelOptions(lang.reading_level)}</select></td>
            <td><select class="form-select form-select-sm lang-input-writing">${buildLevelOptions(lang.writing_level)}</select></td>
            <td><input type="text" class="form-control form-control-sm lang-input-notes" value="${lang.notes || ''}" placeholder="特殊方言或文字備註..."></td>
            <td class="text-center">
                <button type="button" class="btn btn-outline-danger table-dynamic-action-btn" onclick="$(this).closest('tr').remove()" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>
    `;
    $tbody.append(rowHtml);
};

window.openPartnerModalForCreate = function () {
    populateSelect2Options();
    $('#partnerModalTitle').html('<i class="fa-solid fa-user-plus text-primary"></i> 登錄新成員檔案');
    $('#form-submit-btn').show();
    $('#form-mode').val('CREATE');
    $('#partnerForm')[0].reset();

    $('#form-person-id').prop('readonly', false).val('');
    $('#form-partner-id').prop('readonly', false).val('');
    $('#form-gender').val('男');
    $('#form-avatar-url').val('');
    $('#form-preview-avatar').attr('src', getDefaultAvatar('男'));

    $('#form-contacts-dynamic-tbody').empty();
    $('#form-languages-dynamic-tbody').empty();
    addContactTableRow({ platform_name: 'LINE', category: 'ID', is_primary: 'Y' });
    addLanguageTableRow({ language_name: '中文', listening_level: '精通', speaking_level: '精通', reading_level: '精通', writing_level: '精通' });

    $('#form-sponsor-id, #form-placement-id, #form-known-mentor-id, #form-spouse-partner-id, #form-current-residence').val('').trigger('change');
    $('#partnerEditTabs button:first').tab('show');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('partnerDetailModal')).show();
};

window.openPartnerModalForEdit = function (partnerId) {
    const partner = partnersList.find(p => p.partner_id === partnerId);
    if (!partner) return;
    const person = getPersonMaster(partner.person_id);
    populateSelect2Options();

    $('#partnerModalTitle').html(`<i class="fa-solid fa-id-card-clip text-primary"></i> 編輯檔案 - ${getPartnerDisplayName(partner)}`);
    $('#form-submit-btn').show();
    $('#form-mode').val('UPDATE');

    $('#form-person-id').prop('readonly', false).val(person.person_id || partner.person_id);
    $('#form-partner-id').prop('readonly', false).val(partner.partner_id);

    $('#form-name-zh').val(person.name_zh || '');
    $('#form-name-en').val(person.name_en || '');
    $('#form-preferred-name').val(person.preferred_name || '');
    $('#form-display-name').val(person.display_name || '');
    $('#form-identity-type').val(person.identity_type || '夥伴');
    $('#form-usage-identity').val(person.usage_identity || '消費者');
    $('#form-gender').val(person.gender || '男');
    $('#form-birthday').val(person.birthday || '');
    $('#form-nationality').val(person.nationality === '台灣' || person.nationality === 'TW' ? '中華民國' : (person.nationality || '中華民國'));
    $('#form-ethnicity').val(person.ethnicity || '華人');
    $('#form-health-status').val(person.health_status || '良好');
    $('#form-financial-status').val(person.financial_status || '穩定');
    $('#form-hometown').val(person.hometown || '');
    $('#form-current-residence').val(person.current_residence || '').trigger('change');
    $('#form-contact-address').val(person.contact_address || '');
    $('#form-met-date').val(person.met_date || '');
    $('#form-met-reason').val(person.met_reason || '');

    $('#form-member-no').val(partner.member_no || '');
    $('#form-country-code').val(partner.country_code || 'TW');
    $('#form-is-our-team').val(partner.is_our_team || 'Y');
    $('#form-relation-type').val(partner.relation_type || '下線');
    $('#form-leader-title').val(partner.leader_title || '');
    $('#form-account-holder-type').val(partner.account_holder_type || '個人經營者');
    $('#form-operation-mode').val(partner.operation_mode || '個人經營');
    $('#form-upline-link-type').val(partner.upline_link_type || '直屬已知');
    $('#form-node-nature').val(partner.node_nature || '常態夥伴');
    $('#form-current-rank-id').val(partner.current_rank_id || '');
    $('#form-highest-rank-id').val(partner.highest_rank_id || '');
    $('#form-sponsor-id').val(partner.sponsor_id || '').trigger('change');
    $('#form-placement-id').val(partner.placement_id || '').trigger('change');
    $('#form-known-mentor-id').val(partner.known_mentor_id || '').trigger('change');
    $('#form-spouse-partner-id').val(partner.spouse_partner_id || '').trigger('change');
    $('#form-activity-level').val(partner.activity_level || '');
    $('#form-member-status').val(partner.member_status || '');
    $('#form-operator-status').val(partner.operator_status || '');
    $('#form-joining-motive').val(partner.joining_motive || '');
    $('#form-join-date').val(partner.join_date || '');
    $('#form-renewal-due-date').val(partner.renewal_due_date || '');
    $('#form-last-order-date').val(partner.last_order_date || '');
    $('#form-exit-date').val(partner.exit_date || '');

    const gender = person.gender || '男';
    const avatar = partner.avatar_url || person.avatar_url || '';
    $('#form-avatar-url').val(avatar);
    $('#form-preview-avatar').attr('src', avatar || getDefaultAvatar(gender));

    $('#form-phone').val(person.phone || '');
    $('#form-email').val(person.email || '');

    const $contactTbody = $('#form-contacts-dynamic-tbody').empty();
    const contacts = personContactsList.filter(c => c.person_id === person.person_id);
    if (contacts.length > 0) {
        contacts.forEach(c => addContactTableRow(c));
    } else {
        addContactTableRow({ platform_name: 'LINE', category: 'ID', is_primary: 'Y' });
    }

    const $langTbody = $('#form-languages-dynamic-tbody').empty();
    const langs = personLanguagesList.filter(l => l.person_id === person.person_id);
    if (langs.length > 0) {
        langs.forEach(l => addLanguageTableRow(l));
    } else {
        addLanguageTableRow({ language_name: '中文', listening_level: '精通', speaking_level: '精通', reading_level: '精通', writing_level: '精通' });
    }

    $('#form-highest-education').val(person.highest_education || '');
    $('#form-graduated-school').val(person.graduated_school || '');
    $('#form-occupation-background').val(person.occupation_background || '');
    $('#form-team-skills').val(partner.team_skills || '');
    $('#form-career-education-notes').val(person.career_education_notes || '');
    $('#form-health-notes').val(person.health_notes || '');
    $('#form-financial-notes').val(person.financial_notes || '');
    $('#form-consumption-notes').val(person.consumption_notes || '');
    $('#form-team-notes').val(partner.team_notes || '');

    $('#partnerEditTabs button:first').tab('show');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('partnerDetailModal')).show();
};

window.openPartnerModalForView = function (partnerId) {
    const partner = partnersList.find(p => p.partner_id === partnerId);
    if (!partner) {
        AppToast.warning(`找不到夥伴資料：${partnerId}`);
        return;
    }
    const person = getPersonMaster(partner.person_id);
    const gender = person.gender || '男';
    const avatarUrl = partner.avatar_url || person.avatar_url || getDefaultAvatar(gender);
    const currentRank = getRankInfo(partner.current_rank_id);
    const highestRank = getRankInfo(partner.highest_rank_id);
    const dispName = getPartnerDisplayName(partner);

    // 1. 頂部名片區
    $('#view-header-id').text(`[${partner.partner_id} / ${person.person_id || '無個人ID'}]`);
    $('#view-avatar').attr('src', avatarUrl);
    $('#view-name-title').text(dispName);
    $('#view-name-display').html(formatEmpty(person.display_name));
    $('#view-name-zh').html(formatEmpty(person.name_zh));
    $('#view-name-en').html(formatEmpty(person.name_en));
    $('#view-name-pref').html(formatEmpty(person.preferred_name));

    $('#view-country-badge').html(getCountryBadge(partner.country_code));
    $('#view-current-rank-badge').html(`<i class="${currentRank.badge_icon_class}"></i> ${currentRank.rank_name_zh}`).css({
        'background-color': '#130e24',
        'border': `1px solid ${currentRank.badge_color_hex}`,
        'color': currentRank.badge_color_hex
    });

    $('#view-relation-badge').html(getRelationBadge(partner.relation_type, partner.partner_id));
    $('#view-operation-badge').html(renderMemberIdentifierBadge(partner));
    $('#view-official-rank').html(buildRankBadge(highestRank));
    $('#view-status-pair').html(`${getMemberStatusBadge(partner.member_status)} ${getOperatorStatusBadge(partner.operator_status)}`);

    if (partner.leader_title) {
        $('#view-leader-title').text(partner.leader_title).show();
    } else {
        $('#view-leader-title').hide();
    }

    // 2. 個人主檔自然人畫像
    $('#view-person-id').html(formatEmpty(person.person_id));
    $('#view-identity-usage').html(`${formatEmpty(person.identity_type, '夥伴')} / ${formatEmpty(person.usage_identity, '消費者')}`);

    let ageStr = '';
    if (person.birthday && person.birthday.length >= 4) {
        const bYear = parseInt(person.birthday.slice(0, 4), 10);
        if (!isNaN(bYear)) ageStr = ` (${2026 - bYear} 歲)`;
    }
    const bDayText = person.birthday ? `${person.birthday}${ageStr}` : '';
    $('#view-gender-birthday-age').html(`${formatEmpty(gender)} ‧ ${formatEmpty(bDayText, '未填生日')}`);
    $('#view-nationality-ethnicity').html(`${formatEmpty(person.nationality, '中華民國')} ‧ ${formatEmpty(person.ethnicity, '華人')}`);
    
    const hometownText = person.hometown ? `${person.hometown} → ` : '';
    const residenceFull = person.current_residence ? `${hometownText}${person.current_residence}` : (person.hometown || '');
    $('#view-residence').html(formatEmpty(residenceFull, '未設定'));
    $('#view-contact-address').html(formatEmpty(person.contact_address, '未填寫'));
    
    $('#view-met-date').html(formatEmpty(person.met_date, '未記錄'));
    $('#view-met-reason').html(formatEmpty(person.met_reason, '未填寫'));
    
    $('#view-health-status').html(getHealthStatusBadge(person.health_status));
    $('#view-financial-status').html(getFinancialStatusBadge(person.financial_status));

    // 3. 夥伴組織與會籍
    const memberNoStr = partner.member_no ? `(${partner.member_no})` : '';
    $('#view-partner-member-no').html(`${partner.partner_id} ${memberNoStr}`);
    $('#view-market-team').html(`${getCountryBadge(partner.country_code)} ${partner.is_our_team === 'Y' ? '<span class="text-success ms-1">⭐️ 直轄</span>' : '<span class="text-secondary ms-1">🌐 旁線</span>'}`);
    $('#view-sponsor').html(partner.sponsor_id ? `${getPartnerDisplayName(partner.sponsor_id)} (${partner.sponsor_id})` : '<span class="text-muted">無 (頂層節點)</span>');
    $('#view-placement').html(partner.placement_id ? `${getPartnerDisplayName(partner.placement_id)} (${partner.placement_id})` : '<span class="text-muted">無</span>');
    $('#view-mentor').html(partner.known_mentor_id ? `${getPartnerDisplayName(partner.known_mentor_id)} (${partner.known_mentor_id})` : '<span class="text-muted">無特定指派</span>');
    $('#view-account-op-mode').html(`${formatEmpty(partner.account_holder_type, '個人經營者')} / ${formatEmpty(partner.operation_mode, '個人經營')}`);
    $('#view-link-node-nature').html(`${formatEmpty(partner.upline_link_type, '直屬已知')} / ${formatEmpty(partner.node_nature, '常態夥伴')}`);
    
    const motiveMap = {
        'HEALTH': '體質調養',
        'PART_TIME': '兼職副業',
        'FULL_TIME': '全職創業',
        'RELATION': '人情支持'
    };
    const motiveText = motiveMap[partner.joining_motive] || partner.joining_motive || '';
    $('#view-joining-motive').html(motiveText ? `<span class="badge badge-info-subtle">${motiveText}</span>` : '<span class="text-muted">未填寫</span>');

    $('#view-join-date').html(formatEmpty(partner.join_date));
    $('#view-renewal-due-date').html(formatEmpty(partner.renewal_due_date));
    $('#view-order-exit-dates').html(`最後訂購: ${formatEmpty(partner.last_order_date)} / 解約: ${formatEmpty(partner.exit_date)}`);

    // 4. 多管道通訊列表
    $('#view-phone').html(person.phone ? `<a href="tel:${person.phone}" class="text-info text-decoration-none">${person.phone}</a>` : '<span class="text-muted">未填寫</span>');
    $('#view-email').html(person.email ? `<a href="mailto:${person.email}" class="text-info text-decoration-none">${person.email}</a>` : '<span class="text-muted">未填寫</span>');

    const $contactsWrap = $('#view-contacts-list-wrap').empty();
    const contacts = personContactsList.filter(c => c.person_id === person.person_id);
    if (contacts.length > 0) {
        contacts.forEach(c => {
            const isPrimaryBadge = c.is_primary === 'Y' ? '<span class="badge badge-success-subtle ms-1" style="font-size: 0.65rem;">主要</span>' : '';
            const valHtml = (c.platform_name === 'Facebook' || c.contact_value.startsWith('http'))
                ? `<a href="${c.contact_value}" target="_blank" class="text-info text-decoration-none text-truncate" style="max-width: 140px;">${c.contact_value}</a>`
                : `<span class="text-white font-monospace">${c.contact_value}</span>`;

            $contactsWrap.append(`
                <div class="d-flex justify-content-between align-items-center py-1 border-bottom border-secondary border-opacity-10">
                    <span class="text-secondary"><i class="fa-solid fa-tag text-primary me-1"></i> ${c.platform_name} (${c.category})${isPrimaryBadge}</span>
                    <div class="text-end">
                        ${valHtml}
                        ${c.notes ? `<div class="text-muted" style="font-size: 0.72rem;">${c.notes}</div>` : ''}
                    </div>
                </div>
            `);
        });
    } else {
        $contactsWrap.append('<span class="text-muted small">無其他社群通訊紀錄</span>');
    }

    // 5. 語言能力矩陣
    const $langsWrap = $('#view-languages-list-wrap').empty();
    const langs = personLanguagesList.filter(l => l.person_id === person.person_id);
    if (langs.length > 0) {
        langs.forEach(l => {
            $langsWrap.append(`
                <div class="p-2 bg-black bg-opacity-30 rounded border border-secondary border-opacity-10">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <strong class="text-white">${l.language_name}</strong>
                        ${l.notes ? `<span class="text-muted" style="font-size: 0.72rem;">${l.notes}</span>` : ''}
                    </div>
                    <div class="d-flex gap-2 text-secondary" style="font-size: 0.76rem;">
                        <span>聽: <strong class="text-info">${l.listening_level}</strong></span>
                        <span>說: <strong class="text-success">${l.speaking_level}</strong></span>
                        <span>讀: <strong class="text-warning">${l.reading_level}</strong></span>
                        <span>寫: <strong class="text-danger">${l.writing_level}</strong></span>
                    </div>
                </div>
            `);
        });
    } else {
        $langsWrap.append('<span class="text-muted small">無語言評級紀錄</span>');
    }

    // 6. 學歷背景與團隊專長 (2 行 2 欄)
    $('#view-highest-education').html(formatEmpty(person.highest_education, '未填寫'));
    $('#view-graduated-school').html(formatEmpty(person.graduated_school, '未填寫'));
    $('#view-occupation').html(formatEmpty(person.occupation_background, '未填寫'));

    if (partner.team_skills && partner.team_skills.trim() !== '') {
        $('#view-skills-tags').html(partner.team_skills.split(',').map(s => `<span class="badge badge-purple-subtle">${s.trim()}</span>`).join(' '));
    } else {
        $('#view-skills-tags').html('<span class="text-muted small">無專長標籤</span>');
    }

    // 7. 五大備忘註記
    $('#view-career-education-notes').html(formatEmpty(person.career_education_notes, '暫無學經歷備註。'));
    $('#view-health-notes').html(formatEmpty(person.health_notes, '暫無健康備註。'));
    $('#view-financial-notes').html(formatEmpty(person.financial_notes, '暫無財務備註。'));
    $('#view-consumption-notes').html(formatEmpty(person.consumption_notes, '暫無消費備註。'));
    $('#view-team-notes').html(formatEmpty(partner.team_notes, '暫無團隊備註。'));

    $('#btn-view-to-edit').off('click').on('click', function () {
        bootstrap.Modal.getInstance(document.getElementById('partnerViewModal'))?.hide();
        setTimeout(() => { openPartnerModalForEdit(partnerId); }, 250);
    });

    bootstrap.Modal.getOrCreateInstance(document.getElementById('partnerViewModal')).show();
};

// ============================================================================
// 10. 寫入與刪除 (CRUD Operations)
// ============================================================================
function getFormTrimVal(selector, defaultVal = '') {
    const val = $(selector).val();
    return (val !== undefined && val !== null) ? String(val).trim() : defaultVal;
}

async function savePartnerRecord(e) {
    e.preventDefault();
    const mode = $('#form-mode').val();
    const personId = getFormTrimVal('#form-person-id');
    const partnerId = getFormTrimVal('#form-partner-id');

    if (!personId || !partnerId) {
        AppToast.warning('個人識別碼 (person_id) 與夥伴識別碼 (partner_id) 均為必填！');
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existingPerson = personMasterList.find(p => p.person_id === personId);
    const existingPartner = partnersList.find(p => p.partner_id === partnerId);

    const personCreatedBy = (mode === 'UPDATE' && existingPerson) ? existingPerson.created_by : currentUser;
    const personCreatedAt = (mode === 'UPDATE' && existingPerson) ? existingPerson.created_at : nowStr;
    const partnerCreatedBy = (mode === 'UPDATE' && existingPartner) ? existingPartner.created_by : currentUser;
    const partnerCreatedAt = (mode === 'UPDATE' && existingPartner) ? existingPartner.created_at : nowStr;

    const personRowArray = [
        personId,
        getFormTrimVal('#form-name-zh'),
        getFormTrimVal('#form-name-en'),
        getFormTrimVal('#form-preferred-name'),
        getFormTrimVal('#form-display-name'),
        getFormTrimVal('#form-identity-type', '夥伴'),
        getFormTrimVal('#form-usage-identity', '消費者'),
        getFormTrimVal('#form-gender', '男'),
        getFormTrimVal('#form-birthday'),
        getFormTrimVal('#form-nationality', '中華民國'),
        getFormTrimVal('#form-ethnicity', '華人'),
        getFormTrimVal('#form-hometown'),
        getFormTrimVal('#form-current-residence'),
        getFormTrimVal('#form-phone'),
        getFormTrimVal('#form-email'),
        getFormTrimVal('#form-contact-address'),
        getFormTrimVal('#form-met-date'),
        getFormTrimVal('#form-met-reason'),
        getFormTrimVal('#form-highest-education'),
        getFormTrimVal('#form-graduated-school'),
        getFormTrimVal('#form-occupation-background'),
        getFormTrimVal('#form-health-status', '良好'),
        getFormTrimVal('#form-financial-status', '穩定'),
        getFormTrimVal('#form-avatar-url'),
        getFormTrimVal('#form-career-education-notes'),
        getFormTrimVal('#form-health-notes'),
        getFormTrimVal('#form-financial-notes'),
        getFormTrimVal('#form-consumption-notes'),
        personCreatedBy,
        personCreatedAt,
        currentUser,
        nowStr
    ];

    const partnerRowArray = [
        partnerId,
        personId,
        getFormTrimVal('#form-member-no'),
        getFormTrimVal('#form-leader-title'),
        getFormTrimVal('#form-account-holder-type', '個人經營者'),
        getFormTrimVal('#form-account-holder-type') === '共同經營者' ? getFormTrimVal('#form-spouse-partner-id') : partnerId,
        getFormTrimVal('#form-operation-mode', '個人經營'),
        getFormTrimVal('#form-spouse-partner-id'),
        getFormTrimVal('#form-node-nature', '常態夥伴'),
        getFormTrimVal('#form-sponsor-id'),
        getFormTrimVal('#form-placement-id'),
        getFormTrimVal('#form-known-mentor-id'),
        getFormTrimVal('#form-upline-link-type', '直屬已知'),
        getFormTrimVal('#form-current-rank-id'),
        getFormTrimVal('#form-highest-rank-id'),
        getFormTrimVal('#form-country-code', 'TW'),
        getFormTrimVal('#form-is-our-team', 'Y'),
        getFormTrimVal('#form-relation-type', '下線'),
        getFormTrimVal('#form-activity-level'),
        getFormTrimVal('#form-member-status'),
        getFormTrimVal('#form-operator-status'),
        getFormTrimVal('#form-joining-motive'),
        getFormTrimVal('#form-team-skills'),
        getFormTrimVal('#form-team-notes'),
        getFormTrimVal('#form-join-date'),
        getFormTrimVal('#form-renewal-due-date'),
        getFormTrimVal('#form-last-order-date'),
        getFormTrimVal('#form-exit-date'),
        getFormTrimVal('#form-avatar-url'),
        partnerCreatedBy,
        partnerCreatedAt,
        currentUser,
        nowStr
    ];

    const contactRows = [];
    $('#form-contacts-dynamic-tbody tr.dynamic-contact-row').each(function (idx) {
        const val = $(this).find('.contact-input-value').val().trim();
        if (val) {
            contactRows.push([
                `${personId}-C${idx + 1}`,
                personId,
                $(this).find('.contact-input-platform').val(),
                $(this).find('.contact-input-category').val(),
                val,
                $(this).find('.contact-input-primary').val(),
                $(this).find('.contact-input-notes').val().trim(),
                currentUser,
                nowStr,
                currentUser,
                nowStr
            ]);
        }
    });

    const languageRows = [];
    $('#form-languages-dynamic-tbody tr.dynamic-lang-row').each(function (idx) {
        const langName = $(this).find('.lang-input-name').val();
        if (langName) {
            languageRows.push([
                `${personId}-L${idx + 1}`,
                personId,
                langName,
                $(this).find('.lang-input-listening').val(),
                $(this).find('.lang-input-speaking').val(),
                $(this).find('.lang-input-reading').val(),
                $(this).find('.lang-input-writing').val(),
                $(this).find('.lang-input-notes').val().trim(),
                currentUser,
                nowStr,
                currentUser,
                nowStr
            ]);
        }
    });

    const btnSubmit = $('#form-submit-btn');
    try {
        btnSubmit.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入中...');

        if (mode === 'CREATE') {
            await SheetAdapter.createRow('個人主檔', personId, personRowArray);
            await SheetAdapter.createRow('夥伴主檔', partnerId, partnerRowArray);
        } else {
            await SheetAdapter.updateRow('個人主檔', personId, personRowArray);
            await SheetAdapter.updateRow('夥伴主檔', partnerId, partnerRowArray);
        }

        bootstrap.Modal.getInstance(document.getElementById('partnerDetailModal'))?.hide();
        AppToast.success(`成員【${getFormTrimVal('#form-name-zh')}】檔案已成功儲存！`);
        await fetchGoogleSheetsData();
    } catch (err) {
        AppToast.error('寫入試算表失敗: ' + err.message);
    } finally {
        btnSubmit.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存寫入');
    }
}

async function saveBatchPartners() {
    const $btn = $('#btn-save-batch-partners');
    AppLoading.show('<i class="fa-solid fa-spinner fa-spin text-primary"></i> 正在批次寫入夥伴主檔...', '雲端同步處理');

    try {
        $btn.prop('disabled', true);
        const rows = $('#batch-partners-tbody tr[data-partner-id]');
        const updatePromises = [];
        const currentUser = getCurrentUser();
        const nowStr = getFormattedNow();

        rows.each(function () {
            const partnerId = $(this).data('partner-id');
            const item = partnersList.find(p => p.partner_id === String(partnerId));
            if (!item) return;

            item.current_rank_id = $(this).find('.batch-select-cur-rank').val();
            item.highest_rank_id = $(this).find('.batch-select-high-rank').val();
            item.activity_level = $(this).find('.batch-select-activity').val();
            item.member_status = $(this).find('.batch-select-member-status').val();
            item.operator_status = $(this).find('.batch-select-operator-status').val();
            item.relation_type = $(this).find('.batch-select-relation').val();
            item.is_our_team = $(this).find('.batch-select-is-our-team').val();
            item.modified_by = currentUser;
            item.modified_at = nowStr;

            const partnerRowArray = [
                item.partner_id, item.person_id, item.member_no, item.leader_title,
                item.account_holder_type, item.official_account_partner_id || item.partner_id,
                item.operation_mode, item.spouse_partner_id, item.node_nature, item.sponsor_id,
                item.placement_id, item.known_mentor_id, item.upline_link_type, item.current_rank_id,
                item.highest_rank_id, item.country_code, item.is_our_team, item.relation_type,
                item.activity_level, item.member_status, item.operator_status, item.joining_motive,
                item.team_skills, item.team_notes, item.join_date, item.renewal_due_date,
                item.last_order_date || '', item.exit_date || '', item.avatar_url || '',
                item.created_by || currentUser, item.created_at || nowStr, item.modified_by, item.modified_at
            ];

            updatePromises.push(SheetAdapter.updateRow('夥伴主檔', item.partner_id, partnerRowArray));
        });

        await Promise.all(updatePromises);
        AppToast.success(`已成功批次更新 ${updatePromises.length} 筆夥伴主檔！`);
        await fetchGoogleSheetsData();
    } catch (err) {
        AppToast.error("批次儲存失敗：" + err.message);
    } finally {
        $btn.prop('disabled', false);
        AppLoading.hide();
    }
}

window.deletePartnerRecord = function (partnerId) {
    const partner = partnersList.find(p => p.partner_id === partnerId);
    const personId = partner ? partner.person_id : null;

    AppDialog.confirm(
        `確定要自雲端試算表中刪除夥伴【${partnerId}】之組織主檔與個人資料嗎？`,
        async function () {
            AppLoading.show('<i class="fa-solid fa-spinner fa-spin text-danger"></i> 正在刪除檔案...', '雲端同步處理');
            try {
                await SheetAdapter.deleteRow('夥伴主檔', partnerId);
                if (personId) {
                    await SheetAdapter.deleteRow('個人主檔', personId).catch(() => {});
                }
                AppToast.success(`成員【${partnerId}】已成功移除！`);
                await fetchGoogleSheetsData();
            } catch (err) {
                AppToast.error('刪除失敗: ' + err.message);
            } finally {
                AppLoading.hide();
            }
        },
        { 
            title: "確認刪除成員檔案", 
            confirmText: "確認移除", 
            confirmClass: "btn-danger"
        }
    );
};