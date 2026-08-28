/**
 * ============================================================================
 * 組織成員戰術中樞 (org-partners.js)
 * 遵循團隊共用元件規範 (AppLoading, AppToast, AppDialog, SheetAdapter)
 * ============================================================================
 * 模組目錄：
 * 1. 核心常數與全域狀態 (Constants & State)
 * 2. 系統生命週期與初始化 (Lifecycle & Init)
 * 3. 雲端資料同步與解析引擎 (Data Fetch & Parse)
 * 4. 共用資料處理與 UI 標籤產生器 (Helpers & Formatters)
 * 5. 核心視圖切換與過濾器 (View Controllers & Filters)
 * 6. 戰術視圖渲染 (Cards / Table / Batch / Tree)
 * 7. 戰情統計與分析圖表 (Analytics Charts - 22 Charts)
 * 8. 夥伴檔案彈窗控制 (Modal Controllers)
 * 9. 雲端寫入與刪除操作 (CRUD Operations)
 * ============================================================================
 */

// ============================================================================
// 1. 核心常數與全域狀態 (Constants & State)
// ============================================================================
const SPREADSHEET_ID = "1N-HniBDo7wJHidfsKyG-dr7kh0-UTNtFpM7nyFDL3eg";
const GAS_DEPLOY_ID = "AKfycbwCHIswVrVHuvEusFZrg2KjTCCwYhlf-3h-QbWhro8YVekUt1wNa4oDxxBxzPc_z6cd";

// 預設頭像對應
const DEFAULT_AVATARS = {
    '男': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    '女': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    '其他': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
};

// 台灣 20 縣市與馬來西亞 16 州屬行政區名冊
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

let partnersList = [];
let partnerDetailsList = [];
let ranksDatabase = [];
let ranksMap = {};
let currentFilter = 'ALL';
let dataTableInstance = null;
let chartInstances = {};

// ============================================================================
// 2. 系統生命週期與初始化 (Lifecycle & Init)
// ============================================================================
window.addEventListener('AppReady', function () {
    SheetAdapter.init(GAS_DEPLOY_ID);
    applyUIPermissions();
    populateRegionDropdowns();
    initSelect2Dropdowns();

    // 依據共用元件 AppDialog 規範綁定兩個 Modal 的視野自動追蹤置中
    AppDialog.bindIframeAutoCenter('#partnerDetailModal');
    AppDialog.bindIframeAutoCenter('#partnerViewModal');

    // 12 欄位篩選器變更監聽
    $('.form-filter-control').on('change', function () {
        renderAllViews();
    });

    fetchGoogleSheetsData();

    // 視圖切換監聽
    $('input[name="viewMode"]').on('change', function () {
        const mode = $(this).attr('id');
        $('#container-cards-view, #container-table-view, #container-batch-view, #container-tree-view, #container-charts-view').addClass('d-none');

        if (mode === 'view-cards') {
            $('#container-cards-view').removeClass('d-none');
        } else if (mode === 'view-table') {
            $('#container-table-view').removeClass('d-none');
            if (dataTableInstance) {
                dataTableInstance.columns.adjust();
                if (dataTableInstance.responsive && typeof dataTableInstance.responsive.recalc === 'function') {
                    dataTableInstance.responsive.recalc();
                }
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

    // 表單性別切換動態調整預設頭像
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

// 初始化篩選器與表單中的行政區選單
function populateRegionDropdowns() {
    const filterRegion = $('#filter-primary-region').empty().append('<option value="">全部行政區</option>');
    const formRegion = $('#form-primary-region').empty().append('<option value="">請選擇行政區</option>');

    let twFilterGroup = $('<optgroup label="🇹🇼 台灣"></optgroup>');
    let twFormGroup = $('<optgroup label="🇹🇼 台灣"></optgroup>');
    REGIONS_DATABASE.TW.forEach(reg => {
        twFilterGroup.append(`<option value="${reg}">${reg}</option>`);
        twFormGroup.append(`<option value="${reg}">${reg}</option>`);
    });
    filterRegion.append(twFilterGroup);
    formRegion.append(twFormGroup);

    let myFilterGroup = $('<optgroup label="🇲🇾 馬來西亞"></optgroup>');
    let myFormGroup = $('<optgroup label="🇲🇾 馬來西亞"></optgroup>');
    REGIONS_DATABASE.MY.forEach(reg => {
        myFilterGroup.append(`<option value="${reg}">${reg}</option>`);
        myFormGroup.append(`<option value="${reg}">${reg}</option>`);
    });
    filterRegion.append(myFilterGroup);
    formRegion.append(myFormGroup);
}

// 初始化 Select2 元件
function initSelect2Dropdowns() {
    if (!$.fn.select2) return;

    $('.select2-partner-search, .select2-region-search').select2({
        dropdownParent: $('#partnerDetailModal'),
        width: '100%',
        placeholder: '請輸入關鍵字搜尋...',
        allowClear: true,
        language: { noResults: () => '找不到相符的項目' }
    });

    $('#filter-primary-region').select2({
        width: '100%',
        placeholder: '全部行政區',
        allowClear: true,
        language: { noResults: () => '找不到相符的項目' }
    }).on('change', function () {
        renderAllViews();
    });
}

// 動態填充夥伴與行政區下拉選項
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

    const $regionSelect = $('#form-primary-region').empty().append('<option value="">請選擇或搜尋行政區...</option>');
    const $twGroup = $('<optgroup label="🇹🇼 台灣"></optgroup>');
    REGIONS_DATABASE.TW.forEach(reg => {
        $twGroup.append(`<option value="${reg}">${reg}</option>`);
    });
    $regionSelect.append($twGroup);

    const $myGroup = $('<optgroup label="🇲🇾 馬來西亞"></optgroup>');
    REGIONS_DATABASE.MY.forEach(reg => {
        $myGroup.append(`<option value="${reg}">${reg}</option>`);
    });
    $regionSelect.append($myGroup);
}

// ============================================================================
// 3. 雲端資料同步與解析引擎 (Data Fetch & Parse)
// ============================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步組織成員主檔...', '讀取雲端試算表');

    try {
        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);
            const text = await res.text();
            const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
            return (parsed.data || []).slice(1);
        };

        const [partnersRows, detailsRows, ranksRows] = await Promise.all([
            fetchSheet('夥伴主檔').catch(() => []),
            fetchSheet('夥伴詳細資料').catch(() => []),
            fetchSheet('職級主檔').catch(() => [])
        ]);

        if (ranksRows.length > 0) {
            ranksDatabase = parseRanksTable(ranksRows);
        }
        updateRanksCacheAndUI();

        if (partnersRows.length > 0) {
            partnersList = parsePartnersTable(partnersRows);
        }
        if (detailsRows.length > 0) {
            partnerDetailsList = parsePartnerDetailsTable(detailsRows);
        }

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

/**
 * 依據 Schema 順序解析『夥伴主檔 (org_partners)』- 共 35 欄位 (以 partner_id 計數，允許多項 Null)
 */
function parsePartnersTable(rows) {
    return rows.map((r, idx) => {
        const partnerId = getVal(r, 0, `PTN-TW-${String(idx + 1).padStart(3, '0')}`);
        return {
            partner_id: partnerId,
            member_no: getVal(r, 1, ''),
            auth_email: getVal(r, 2, ''),
            name_zh: getVal(r, 3, ''),
            name_en: getVal(r, 4, ''),
            preferred_name: getVal(r, 5, ''),
            display_name: getVal(r, 6, ''),
            leader_title: getVal(r, 7, ''),
            account_holder_type: getVal(r, 8, '個人經營者'),
            official_account_partner_id: getVal(r, 9, ''),
            operation_mode: getVal(r, 10, '個人經營'),
            spouse_partner_id: getVal(r, 11, ''),
            node_nature: getVal(r, 12, '常態夥伴'),
            activity_level: getVal(r, 13, ''),        // 允許 Null/空
            member_status: getVal(r, 14, ''),         // 允許 Null/空
            is_info_complete: getVal(r, 15, 'Y'),
            sponsor_id: getVal(r, 16, ''),
            placement_id: getVal(r, 17, ''),
            known_mentor_id: getVal(r, 18, ''),
            upline_link_type: getVal(r, 19, '直屬已知'),
            current_rank_id: getVal(r, 20, ''),       // 允許 Null/空
            highest_rank_id: getVal(r, 21, ''),       // 允許 Null/空
            country_code: getVal(r, 22, 'TW'),
            is_our_team: getVal(r, 23, 'Y').toUpperCase(),
            relation_type: getVal(r, 24, '下線'),
            operator_status: getVal(r, 25, ''),       // 允許 Null/空
            join_date: getVal(r, 26, ''),             // 允許 Null/空
            renewal_due_date: getVal(r, 27, ''),
            last_order_date: getVal(r, 28, ''),
            exit_date: getVal(r, 29, ''),
            avatar_url: getVal(r, 30, ''),
            created_by: getVal(r, 31, 'SYSTEM'),
            created_at: getVal(r, 32, '2026-01-01 00:00:00'),
            modified_by: getVal(r, 33, 'SYSTEM'),
            modified_at: getVal(r, 34, '2026-01-01 00:00:00')
        };
    }).filter(p => p.partner_id && String(p.partner_id).trim() !== '');
}

/**
 * 依據 Schema 順序解析『夥伴詳細資料』- 共 27 欄位
 */
function parsePartnerDetailsTable(rows) {
    return rows.map(r => {
        return {
            partner_id: getVal(r, 0, ''),
            gender: getVal(r, 1, '男'),
            birthday: getVal(r, 2, ''),
            phone_number: getVal(r, 3, ''),
            whatsapp_id: getVal(r, 4, ''),
            whatsapp_name: getVal(r, 5, ''),       // WhatsApp 帳號名稱
            discord_id: getVal(r, 6, ''),
            discord_name: getVal(r, 7, ''),         // Discord 使用者名稱
            line_user_id: getVal(r, 8, ''),
            line_id_alias: getVal(r, 9, ''),
            facebook_url: getVal(r, 10, ''),
            instagram_id: getVal(r, 11, ''),
            primary_region: getVal(r, 12, ''),
            contact_address: getVal(r, 13, ''),
            occupation_type: getVal(r, 14, ''),
            highest_education: getVal(r, 15, ''),   // 最高學歷
            graduated_school: getVal(r, 16, ''),    // 最高畢業學校
            joining_motive: getVal(r, 17, ''),
            health_goals: getVal(r, 18, ''),
            team_skills: getVal(r, 19, ''),
            intro: getVal(r, 20, ''),
            tactical_notes: getVal(r, 21, ''),
            is_profile_public: getVal(r, 22, 'Y'),
            created_by: getVal(r, 23, 'SYSTEM'),
            created_at: getVal(r, 24, '2026-01-01 00:00:00'),
            modified_by: getVal(r, 25, 'SYSTEM'),
            modified_at: getVal(r, 26, '2026-01-01 00:00:00')
        };
    });
}

/**
 * 依據 Schema 順序解析『職級主檔 (org_ranks)』- 共 30 欄位
 */
function parseRanksTable(rows) {
    return rows.map((r, idx) => {
        const rankId = getVal(r, 0, `RANK_${String(idx + 1).padStart(2, '0')}`);
        return {
            rank_id: rankId,
            rank_code: getVal(r, 1, `R${(idx + 1) * 10}`),
            rank_level: parseInt(getVal(r, 2, '10'), 10) || 10,
            rank_name_zh: getVal(r, 3, '未定義職級'),
            rank_name_en: getVal(r, 4, 'Undefined'),
            cum_group_sv_req: parseFloat(getVal(r, 5, '0')) || 0,
            month_personal_sv_req: parseFloat(getVal(r, 6, '160')) || 160,
            month_group_sv_req: parseFloat(getVal(r, 7, '0')) || 0,
            new_mgr_group_sv_req: parseFloat(getVal(r, 8, '0')) || 0,
            qualified_lines_req: parseInt(getVal(r, 9, '0'), 10) || 0,
            pearl_lines_req: parseInt(getVal(r, 10, '0'), 10) || 0,
            month_org_sv_req: parseFloat(getVal(r, 11, '0')) || 0,
            consecutive_months_req: parseInt(getVal(r, 12, '1'), 10) || 1,
            direct_rebate_rate: parseFloat(getVal(r, 13, '0.05')) || 0.05,
            leadership_gen_depth: parseInt(getVal(r, 14, '0'), 10) || 0,
            leadership_gen_rate: parseFloat(getVal(r, 15, '0.06')) || 0.06,
            has_group_bonus: getVal(r, 16, 'N').toUpperCase(),
            has_manager_bonus: getVal(r, 17, 'N').toUpperCase(),
            has_pearl_dividend: getVal(r, 18, 'N').toUpperCase(),
            has_annual_excellence: getVal(r, 19, 'N').toUpperCase(),
            has_travel_incentive: getVal(r, 20, 'N').toUpperCase(),
            has_car_fund: getVal(r, 21, 'N').toUpperCase(),
            badge_icon_class: getVal(r, 22, 'fa-solid fa-award'),
            badge_color_hex: getVal(r, 23, '#8b5cf6'),
            sort_order: parseInt(getVal(r, 24, String((idx + 1) * 10)), 10) || ((idx + 1) * 10),
            is_active: getVal(r, 25, 'Y').toUpperCase(),
            created_by: getVal(r, 26, 'SYSTEM'),
            created_at: getVal(r, 27, '2026-01-01 00:00:00'),
            modified_by: getVal(r, 28, 'SYSTEM'),
            modified_at: getVal(r, 29, '2026-01-01 00:00:00')
        };
    }).filter(rk => rk.rank_name_zh !== '未定義職級' && rk.is_active === 'Y');
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
    const hasAdminRights = isMasterAdmin();
    if (!hasAdminRights) {
        $('#btn-open-create-modal').hide();
    }
}

function getDefaultAvatar(gender = '男') {
    return DEFAULT_AVATARS[gender] || DEFAULT_AVATARS['男'];
}

/**
 * 依規則依序取得顯示名稱：
 * 1. 前端展示名稱 (display_name)
 * 2. 中文姓名 (name_zh)
 * 3. 英文姓名 (name_en)
 * 4. 常用稱呼/暱稱 (preferred_name)
 * 若皆為空則回傳「（未知姓名）」
 */
function getPartnerDisplayName(target) {
    if (!target) return '';
    const p = typeof target === 'string' 
        ? partnersList.find(x => x.partner_id === target || x.member_no === target) 
        : target;

    if (!p) return typeof target === 'string' && target !== 'ROOT' ? target : '';
    
    const candidates = [p.display_name, p.name_zh, p.name_en, p.preferred_name];
    for (const name of candidates) {
        if (name && String(name).trim() !== '') {
            return String(name).trim();
        }
    }
    return '（未知姓名）';
}

function getMemberIdentifier(partner) {
    return partner.member_no || partner.partner_id;
}

function getRankInfo(rankId) {
    if (rankId && ranksMap[rankId]) {
        return ranksMap[rankId];
    }
    return {
        rank_id: '',
        rank_code: '—',
        rank_name_zh: '未設定',
        rank_name_en: 'Unset',
        badge_icon_class: 'fa-solid fa-circle-question',
        badge_color_hex: '#64748b',
        rank_level: 0
    };
}

function updateRanksCacheAndUI() {
    ranksMap = {};
    ranksDatabase.forEach(rk => { ranksMap[rk.rank_id] = rk; });

    const $filterCurrent = $('#filter-current-rank-id').empty().append('<option value="">全部職級</option>');
    const $filterHighest = $('#filter-highest-rank-id').empty().append('<option value="">全部職級</option>');
    const $formCurrent = $('#form-current-rank-id').empty().append('<option value="">(未設定 / 未知)</option>');
    const $formHighest = $('#form-highest-rank-id').empty().append('<option value="">(未設定 / 未知)</option>');

    const sortedRanks = [...ranksDatabase].sort((a, b) => a.sort_order - b.sort_order);
    sortedRanks.forEach(rk => {
        const optHtml = `<option value="${rk.rank_id}">${rk.rank_name_zh} (${rk.rank_code})</option>`;
        $filterCurrent.append(optHtml);
        $filterHighest.append(optHtml);
        $formCurrent.append(optHtml);
        $formHighest.append(optHtml);
    });
}

// 國家市場標籤 (TW / MY)
function getCountryBadge(countryCode) {
    const code = (countryCode || 'TW').toUpperCase().trim();
    if (code === 'MY') {
        return `<span class="badge badge-warning-subtle font-monospace">MY</span>`;
    }
    return `<span class="badge badge-info-subtle font-monospace">TW</span>`;
}

// 職級標籤
function buildRankBadge(rank) {
    if (!rank || !rank.rank_id) {
        return `<span class="badge badge-muted-subtle">未設定職級</span>`;
    }
    const hex = rank.badge_color_hex || '#8b5cf6';
    const icon = rank.badge_icon_class || 'fa-solid fa-award';
    return `<span class="badge" style="background-color: #130e24; border: 1px solid ${hex}; color: ${hex}; font-weight: 600;">
        <i class="${icon}"></i> ${rank.rank_name_zh}
    </span>`;
}

// 共同經營與會員編號標籤
function renderMemberIdentifierBadge(partner) {
    let opBadge = '';
    const spouseId = partner.spouse_partner_id || partner.official_account_partner_id;
    let coOpPartner = null;
    if (spouseId) {
        coOpPartner = partnersList.find(x => x.partner_id === spouseId || x.member_no === spouseId);
    }
    if (!coOpPartner && partner.partner_id) {
        coOpPartner = partnersList.find(x => x.spouse_partner_id === partner.partner_id);
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

// 組織關係屬性標籤
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

// 營運狀態標籤 (Null 容錯)
function getOperatorStatusBadge(status) {
    switch (status) {
        case '活躍': return `<span class="badge badge-outline-success-subtle">活躍</span>`;
        case '停滯': return `<span class="badge badge-outline-warning-subtle">停滯</span>`;
        case '沉睡': return `<span class="badge badge-outline-danger-subtle">沉睡</span>`;
        case '凍結': return `<span class="badge badge-outline-muted-subtle">凍結</span>`;
        default: return `<span class="badge badge-muted-subtle">未設定</span>`;
    }
}

// 官方會籍狀態標籤 (Null 容錯)
function getMemberStatusBadge(status) {
    switch (status) {
        case '有效且領獎金': return `<span class="badge badge-success">有效且領獎金</span>`;
        case '維持160SV續約': return `<span class="badge badge-warning">維持160SV續約</span>`;
        case '失效': return `<span class="badge badge-muted">失效</span>`;
        default: return `<span class="badge badge-muted-subtle">未設定</span>`;
    }
}

// 團隊參與度標籤 (Null 容錯)
function getActivityLevelBadge(level) {
    switch (level) {
        case '積極參與': return `<span class="badge badge-success-subtle">積極參與</span>`;
        case '參與': return `<span class="badge badge-warning-subtle">參與</span>`;
        case '不參與': return `<span class="badge badge-danger-subtle">不參與</span>`;
        case '自用消費': return `<span class="badge badge-info-subtle">自用消費</span>`;
        case '操作人頭': return `<span class="badge badge-purple-subtle">操作人頭</span>`;
        case '失聯': return `<span class="badge badge-muted-subtle">失聯</span>`;
        case '個資未知': return `<span class="badge badge-muted-subtle">個資未知</span>`;
        default: return `<span class="badge badge-muted-subtle">未設定</span>`;
    }
}

// ============================================================================
// 5. 核心視圖切換與過濾器 (View Controllers & Filters)
// ============================================================================
function getFilteredPartners() {
    const fAccountType = $('#filter-account-holder-type').val();
    const fOpMode = $('#filter-operation-mode').val();
    const fActivity = $('#filter-activity-level').val();
    const fMemberStatus = $('#filter-member-status').val();
    const fUplineLink = $('#filter-upline-link-type').val();
    const fCurrentRank = $('#filter-current-rank-id').val();
    const fHighestRank = $('#filter-highest-rank-id').val();
    const fCountry = $('#filter-country-code').val();
    const fIsOurTeam = $('#filter-is-our-team').val();
    const fRelation = $('#filter-relation-type').val();
    const fOperatorStatus = $('#filter-operator-status').val();
    const fRegion = $('#filter-primary-region').val();

    return partnersList.filter(p => {
        const detail = partnerDetailsList.find(d => d.partner_id === p.partner_id) || {};

        if (fAccountType && p.account_holder_type !== fAccountType) return false;
        if (fOpMode && p.operation_mode !== fOpMode) return false;
        if (fActivity && p.activity_level !== fActivity) return false;
        if (fMemberStatus && p.member_status !== fMemberStatus) return false;
        if (fUplineLink && p.upline_link_type !== fUplineLink) return false;
        if (fCurrentRank && p.current_rank_id !== fCurrentRank) return false;
        if (fHighestRank && p.highest_rank_id !== fHighestRank) return false;
        if (fCountry && p.country_code !== fCountry) return false;
        if (fIsOurTeam && p.is_our_team !== fIsOurTeam) return false;
        if (fRelation && p.relation_type !== fRelation) return false;
        if (fOperatorStatus && p.operator_status !== fOperatorStatus) return false;
        if (fRegion && detail.primary_region !== fRegion) return false;

        return true;
    });
}

window.resetAllFilters = function() {
    $('.form-filter-control').val('').trigger('change');
    renderAllViews();
};

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
        const detail = partnerDetailsList.find(d => d.partner_id === p.partner_id) || {};
        const gender = detail.gender || '男';
        const avatarUrl = p.avatar_url || getDefaultAvatar(gender);
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
                                <span class="text-secondary"><i class="fa-solid fa-award text-warning"></i> 葡眾官方職級</span>
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
                                <span class="text-white">${mentorName || '（無設定）'}</span>
                            </div>
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-map-pin text-danger"></i> 行政區 / 職業</span>
                                <span class="text-light">${detail.primary_region || '未填'} ‧ ${detail.occupation_type || '未填'}</span>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="text-secondary"><i class="fa-solid fa-bolt text-accent"></i> 團隊參與度</span>
                                ${getActivityLevelBadge(p.activity_level)}
                            </div>
                        </div>

                        ${detail.team_skills ? `<div class="mb-2"><span class="badge badge-dark"><i class="fa-solid fa-tags me-1"></i> ${detail.team_skills}</span></div>` : ''}

                        <p class="text-secondary small mb-0 text-truncate-2" style="font-size: 0.82rem;">
                            ${detail.tactical_notes || detail.intro || '暫無特定戰術備註記錄。'}
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
        const detail = partnerDetailsList.find(d => d.partner_id === p.partner_id) || {};
        const gender = detail.gender || '男';
        const avatarUrl = p.avatar_url || getDefaultAvatar(gender);
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
                <td><span class="text-light">${detail.primary_region || '—'}</span></td>
                <td><span class="text-light">${detail.occupation_type || '—'}</span></td>
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
        responsive: true,
        pageLength: 10,
        language: {
            search: "名冊搜尋：",
            lengthMenu: "每頁顯示 _MENU_ 筆",
            info: "顯示第 _START_ 至 _END_ 筆，共 _TOTAL_ 筆",
            paginate: { first: "首頁", last: "末頁", next: "下一頁", previous: "上一頁" },
            zeroRecords: "未找到符合的夥伴檔案"
        }
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

function renderTreeView() {
    const container = $('#lineage-tree-root').empty();
    const renderedCoOpPartnerIds = new Set();

    function getNodeBorderClass(partner) {
        if (partner.partner_id === 'PTN-TW-001' || partner.partner_id === 'PTN-TW-002' || partner.relation_type === '核心成員') {
            return 'node-border-purple';
        }
        if (partner.relation_type === '上線') return 'node-border-green';
        if (partner.relation_type === '旁線') return 'node-border-orange';
        return 'node-border-blue';
    }

    function buildBranch(partner) {
        if (renderedCoOpPartnerIds.has(partner.partner_id)) {
            return '';
        }

        const detail = partnerDetailsList.find(d => d.partner_id === partner.partner_id) || {};
        const gender = detail.gender || '男';
        const avatarUrl = partner.avatar_url || getDefaultAvatar(gender);
        const currentRank = getRankInfo(partner.current_rank_id);
        const highestRank = getRankInfo(partner.highest_rank_id);
        const borderClass = getNodeBorderClass(partner);
        const dispName = getPartnerDisplayName(partner);
        const identifierHtml = renderMemberIdentifierBadge(partner);

        let spouseNodeHtml = '';
        const spouseId = partner.spouse_partner_id;
        if (spouseId) {
            const spouse = partnersList.find(x => x.partner_id === spouseId || x.member_no === spouseId);
            if (spouse) {
                renderedCoOpPartnerIds.add(spouse.partner_id);

                const spouseDetail = partnerDetailsList.find(d => d.partner_id === spouse.partner_id) || {};
                const spouseGender = spouseDetail.gender || '女';
                const spouseAvatar = spouse.avatar_url || getDefaultAvatar(spouseGender);
                const spouseCurRank = getRankInfo(spouse.current_rank_id);
                const spouseHighRank = getRankInfo(spouse.highest_rank_id);
                const spouseDispName = getPartnerDisplayName(spouse);
                const spouseIdentifier = renderMemberIdentifierBadge(spouse);

                spouseNodeHtml = `
                    <div class="d-flex align-items-center justify-content-between border-top border-primary mt-2 pt-2">
                        <div class="d-flex align-items-center gap-3">
                            <div class="partner-avatar-wrap" style="width: 44px; height: 44px;">
                                <img src="${spouseAvatar}" class="rounded-circle border border-primary" width="44" height="44" onerror="this.src='${getDefaultAvatar(spouseGender)}'">
                                <span class="rank-badge-floating" style="background-color: #130e24; border: 1px solid ${spouseCurRank.badge_color_hex}; color: ${spouseCurRank.badge_color_hex}; font-size: 0.55rem;">
                                    <i class="${spouseCurRank.badge_icon_class}"></i> ${spouseCurRank.rank_name_zh}
                                </span>
                            </div>
                            <div>
                                <div class="d-flex flex-wrap align-items-center gap-2">
                                    <span class="fw-bold text-white fs-6">${spouseDispName}</span>
                                    ${getCountryBadge(spouse.country_code)}
                                    ${spouseIdentifier}
                                    ${getRelationBadge(spouse.relation_type, spouse.partner_id)}
                                </div>
                                <div class="d-flex align-items-center gap-2 mt-1">
                                    <span class="small text-secondary">最高職級：</span>
                                    ${buildRankBadge(spouseHighRank)}
                                </div>
                            </div>
                        </div>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-info py-1 px-2" onclick="openPartnerModalForView('${spouse.partner_id}')" title="查看"><i class="fa-solid fa-magnifying-glass"></i></button>
                            <button class="btn btn-outline-secondary py-1 px-2" onclick="openPartnerModalForEdit('${spouse.partner_id}')" title="編輯"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button class="btn btn-outline-danger py-1 px-2" onclick="deletePartnerRecord('${spouse.partner_id}')" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                `;
            }
        }

        const children = partnersList.filter(p => 
            (p.sponsor_id === partner.partner_id || (spouseId && p.sponsor_id === spouseId)) &&
            p.partner_id !== spouseId &&
            !renderedCoOpPartnerIds.has(p.partner_id)
        );

        let lineStyleClass = 'tree-line-solid';
        if (partner.upline_link_type === '中間未知' || partner.node_nature === '中繼失聯節點') {
            lineStyleClass = 'tree-line-dotted';
        }

        let html = `
            <div class="tree-node-card ${borderClass}">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center gap-3">
                        <div class="partner-avatar-wrap" style="width: 44px; height: 44px;">
                            <img src="${avatarUrl}" class="rounded-circle border border-primary" width="44" height="44" onerror="this.src='${getDefaultAvatar(gender)}'">
                            <span class="rank-badge-floating" style="background-color: #130e24; border: 1px solid ${currentRank.badge_color_hex}; color: ${currentRank.badge_color_hex}; font-size: 0.58rem;">
                                <i class="${currentRank.badge_icon_class}"></i> ${currentRank.rank_name_zh}
                            </span>
                        </div>
                        <div>
                            <div class="d-flex flex-wrap align-items-center gap-2">
                                <span class="fw-bold text-white fs-6">${dispName}</span>
                                ${getCountryBadge(partner.country_code)}
                                ${identifierHtml}
                                ${getRelationBadge(partner.relation_type, partner.partner_id)}
                            </div>
                            <div class="d-flex align-items-center gap-2 mt-1">
                                <span class="small text-secondary">最高職級：</span>
                                ${buildRankBadge(highestRank)}
                            </div>
                        </div>
                    </div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-info py-1 px-2" onclick="openPartnerModalForView('${partner.partner_id}')" title="查看"><i class="fa-solid fa-magnifying-glass"></i></button>
                        <button class="btn btn-outline-secondary py-1 px-2" onclick="openPartnerModalForEdit('${partner.partner_id}')" title="編輯"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="btn btn-outline-danger py-1 px-2" onclick="deletePartnerRecord('${partner.partner_id}')" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </div>
                ${spouseNodeHtml}
            </div>
        `;

        if (children.length > 0) {
            html += `<div class="tree-level-indent ${lineStyleClass}">`;
            children.forEach(child => {
                html += buildBranch(child);
            });
            html += `</div>`;
        }

        return html;
    }

    const roots = partnersList.filter(p => 
        (!p.sponsor_id || p.sponsor_id === 'ROOT' || p.sponsor_id === 'SYSTEM_ROOT' || p.partner_id === 'PTN-TW-001') &&
        p.account_holder_type !== '共同經營者'
    );

    if (roots.length === 0 && partnersList.length > 0) {
        roots.push(partnersList[0]);
    }

    roots.forEach(r => container.append(buildBranch(r)));
}

// ============================================================================
// 7. 戰情統計與分析圖表 (Analytics Charts - 22 Charts)
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
            const detail = partnerDetailsList.find(d => d.partner_id === p.partner_id) || {};
            const val = p[key] || detail[key] || '未設定';
            map[val] = (map[val] || 0) + 1;
        });
        return map;
    };

    // 1. 所屬國家市場圓餅圖
    const twCount = dataset.filter(p => p.country_code === 'TW').length;
    const ctxMarket = document.getElementById('chart-market-split');
    if (ctxMarket) {
        chartInstances.market = new Chart(ctxMarket, {
            type: 'pie',
            data: { labels: ['台灣 (TW)', '大馬 (MY)'], datasets: [{ data: [twCount, dataset.length - twCount], backgroundColor: ['#38bdf8', '#fbbf24'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 2. 所在一級行政區圓餅圖
    const regCounts = createCountMap('primary_region');
    const ctxRegion = document.getElementById('chart-region-distribution');
    if (ctxRegion) {
        chartInstances.region = new Chart(ctxRegion, {
            type: 'pie',
            data: { labels: Object.keys(regCounts), datasets: [{ data: Object.values(regCounts), backgroundColor: ['#0284c7', '#38bdf8', '#34d399', '#facc15', '#f472b6', '#a78bfa', '#fb7185', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 3. 當前實際職級圓餅圖 (職級顏色)
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

    // 4. 官方最高職級圓餅圖 (職級顏色)
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

    // 5. 團隊直轄/旁線圓餅圖
    const ourTeamCount = dataset.filter(p => p.is_our_team === 'Y').length;
    const ctxTeam = document.getElementById('chart-team-split');
    if (ctxTeam) {
        chartInstances.team = new Chart(ctxTeam, {
            type: 'pie',
            data: { labels: ['Ray&Jarvis直轄', '旁線友軍'], datasets: [{ data: [ourTeamCount, dataset.length - ourTeamCount], backgroundColor: ['#8b5cf6', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 6. 團隊參與狀態圓餅圖
    const actCounts = createCountMap('activity_level', ['積極參與', '參與', '不參與', '自用消費', '操作人頭', '失聯']);
    const ctxActivity = document.getElementById('chart-activity-distribution');
    if (ctxActivity) {
        chartInstances.activity = new Chart(ctxActivity, {
            type: 'pie',
            data: { labels: Object.keys(actCounts), datasets: [{ data: Object.values(actCounts), backgroundColor: ['#34d399', '#38bdf8', '#ef4444', '#0284c7', '#c084fc', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 7. 官方會籍狀態圓餅圖
    const memCounts = createCountMap('member_status', ['有效且領獎金', '維持160SV續約', '失效']);
    const ctxMemberPie = document.getElementById('chart-member-status-pie');
    if (ctxMemberPie) {
        chartInstances.memberPie = new Chart(ctxMemberPie, {
            type: 'pie',
            data: { labels: Object.keys(memCounts), datasets: [{ data: Object.values(memCounts), backgroundColor: ['#059669', '#d97706', '#dc2626'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 8. 上線連結模式圓餅圖
    const uplineCounts = createCountMap('upline_link_type', ['直屬已知', '中間未知', '體系頂層']);
    const ctxUpline = document.getElementById('chart-upline-link-distribution');
    if (ctxUpline) {
        chartInstances.uplineLink = new Chart(ctxUpline, {
            type: 'pie',
            data: { labels: Object.keys(uplineCounts), datasets: [{ data: Object.values(uplineCounts), backgroundColor: ['#10b981', '#f87171', '#8b5cf6'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 9. 組織關係屬性圓餅圖
    const relCounts = createCountMap('relation_type', ['核心成員', '下線', '上線', '旁線', '中繼層']);
    const ctxRel = document.getElementById('chart-relation-split');
    if (ctxRel) {
        chartInstances.relation = new Chart(ctxRel, {
            type: 'pie',
            data: { labels: Object.keys(relCounts), datasets: [{ data: Object.values(relCounts), backgroundColor: ['#8b5cf6', '#38bdf8', '#10b981', '#f97316', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 10. 營運狀態圓餅圖
    const opCounts = createCountMap('operator_status', ['活躍', '停滯', '沉睡', '凍結']);
    const ctxOp = document.getElementById('chart-operator-status');
    if (ctxOp) {
        chartInstances.operator = new Chart(ctxOp, {
            type: 'pie',
            data: { labels: Object.keys(opCounts), datasets: [{ data: Object.values(opCounts), backgroundColor: ['#10b981', '#fbbf24', '#f43f5e', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 11. 經營身分類型圓餅圖
    const holderCounts = createCountMap('account_holder_type', ['個人經營者', '主要經營者', '共同經營者']);
    const ctxHolder = document.getElementById('chart-account-holder-distribution');
    if (ctxHolder) {
        chartInstances.accountHolder = new Chart(ctxHolder, {
            type: 'pie',
            data: { labels: Object.keys(holderCounts), datasets: [{ data: Object.values(holderCounts), backgroundColor: ['#0284c7', '#34d399', '#f59e0b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 12. 經營權模式圓餅圖
    const modeCounts = createCountMap('operation_mode', ['個人經營', '共同經營', '獨立經營']);
    const ctxMode = document.getElementById('chart-mode-distribution');
    if (ctxMode) {
        chartInstances.mode = new Chart(ctxMode, {
            type: 'pie',
            data: { labels: Object.keys(modeCounts), datasets: [{ data: Object.values(modeCounts), backgroundColor: ['#a78bfa', '#f472b6', '#38bdf8'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 13. 最高學歷圓餅圖
    const eduCounts = createCountMap('highest_education', ['博士', '碩士', '學士', '副學士', '高中職', '國中', '國小']);
    const ctxEdu = document.getElementById('chart-education-distribution');
    if (ctxEdu) {
        chartInstances.education = new Chart(ctxEdu, {
            type: 'pie',
            data: { labels: Object.keys(eduCounts), datasets: [{ data: Object.values(eduCounts), backgroundColor: ['#8b5cf6', '#0284c7', '#38bdf8', '#34d399', '#fbbf24', '#f97316', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 14. 入會動機圓餅圖
    const motiveCounts = createCountMap('joining_motive', ['體質調養', '兼職副業', '全職創業']);
    const ctxMotive = document.getElementById('chart-motive-distribution');
    if (ctxMotive) {
        chartInstances.motive = new Chart(ctxMotive, {
            type: 'pie',
            data: { labels: Object.keys(motiveCounts), datasets: [{ data: Object.values(motiveCounts), backgroundColor: ['#ec4899', '#f59e0b', '#10b981'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 15. 生理性別圓餅圖
    const genderCounts = createCountMap('gender', ['男', '女', '其他']);
    const ctxGender = document.getElementById('chart-gender-split');
    if (ctxGender) {
        chartInstances.gender = new Chart(ctxGender, {
            type: 'pie',
            data: { labels: Object.keys(genderCounts), datasets: [{ data: Object.values(genderCounts), backgroundColor: ['#38bdf8', '#f472b6', '#a78bfa'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 16. 節點性質圓餅圖
    const nodeCounts = createCountMap('node_nature', ['常態夥伴', '中繼失聯節點', '幽靈節點', '虛擬佔位']);
    const ctxNode = document.getElementById('chart-node-nature-distribution');
    if (ctxNode) {
        chartInstances.nodeNature = new Chart(ctxNode, {
            type: 'pie',
            data: { labels: Object.keys(nodeCounts), datasets: [{ data: Object.values(nodeCounts), backgroundColor: ['#34d399', '#f59e0b', '#ef4444', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 17. 有效代數深度 Top 10 長條圖
    const depthData = [];
    dataset.forEach(p => {
        const depth = calculatePartnerGenDepth(p.partner_id, partnersList);
        if (depth > 0) {
            depthData.push({
                name: getPartnerDisplayName(p) || p.partner_id,
                depth: depth
            });
        }
    });
    const sortedDepth = depthData.sort((a, b) => b.depth - a.depth).slice(0, 10);
    const ctxDepth = document.getElementById('chart-gen-depth-top10');
    if (ctxDepth) {
        chartInstances.genDepth = new Chart(ctxDepth, {
            type: 'bar',
            data: {
                labels: sortedDepth.map(x => x.name),
                datasets: [{
                    label: '有效代數深度',
                    data: sortedDepth.map(x => x.depth),
                    backgroundColor: '#8b5cf6',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` 有效代數深度: ${ctx.parsed.y} 代`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: '#94a3b8' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: { color: '#94a3b8', font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // 18. 實務輔導下線人數 Top 10 長條圖
    const mentorCounts = {};
    dataset.forEach(p => {
        if (p.known_mentor_id && p.known_mentor_id !== 'ROOT' && p.known_mentor_id !== 'SYSTEM_ROOT') {
            const mName = getPartnerDisplayName(p.known_mentor_id) || p.known_mentor_id;
            mentorCounts[mName] = (mentorCounts[mName] || 0) + 1;
        }
    });
    const sortedMentors = Object.entries(mentorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const ctxMentor = document.getElementById('chart-mentor-mentees-top10');
    if (ctxMentor) {
        chartInstances.mentor = new Chart(ctxMentor, {
            type: 'bar',
            data: {
                labels: sortedMentors.map(x => x[0]),
                datasets: [{
                    label: '輔導下線人數',
                    data: sortedMentors.map(x => x[1]),
                    backgroundColor: '#10b981',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` 輔導下線人數: ${ctx.parsed.y} 人`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: '#94a3b8' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: { color: '#94a3b8', font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // 19. 夥伴簽約加入年份趨勢折線圖
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

    // 20. 夥伴退出/解約年份趨勢折線圖
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

    // 21. 夥伴資格截止月份分佈直方圖
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

    // 22. 夥伴官方續約月份分佈直方圖
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
// 8. 夥伴檔案彈窗控制 (Modal Controllers)
// ============================================================================
window.openPartnerModalForEdit = function(partnerId) {
    const partner = partnersList.find(p => p.partner_id === partnerId);
    if (!partner) return;
    const detail = partnerDetailsList.find(d => d.partner_id === partnerId) || {};
    populateSelect2Options();

    $('#partnerModalTitle').html(`<i class="fa-solid fa-id-card-clip text-primary"></i> 編輯檔案 - ${getPartnerDisplayName(partner)}`);
    $('#form-submit-btn').show();
    $('#form-mode').val('UPDATE');
    $('#form-partner-id').prop('readonly', true).val(partner.partner_id);

    // 頭像處理：若為預設頭像或無自訂網址，輸入框留空
    const gender = detail.gender || '男';
    const isCustomAvatar = partner.avatar_url && !Object.values(DEFAULT_AVATARS).includes(partner.avatar_url);
    $('#form-avatar-url').val(isCustomAvatar ? partner.avatar_url : '');
    $('#form-preview-avatar').attr('src', partner.avatar_url || getDefaultAvatar(gender));

    $('#form-member-no').val(partner.member_no || '');
    $('#form-name-zh').val(partner.name_zh || '');
    $('#form-name-en').val(partner.name_en || '');
    $('#form-preferred-name').val(partner.preferred_name || '');
    $('#form-display-name').val(partner.display_name || '');
    $('#form-auth-email').val(partner.auth_email || '');
    $('#form-leader-title').val(partner.leader_title || '');
    $('#form-account-holder-type').val(partner.account_holder_type || '個人經營者');
    $('#form-operation-mode').val(partner.operation_mode || '個人經營');
    $('#form-node-nature').val(partner.node_nature || '常態夥伴');
    $('#form-activity-level').val(partner.activity_level || '');
    $('#form-member-status').val(partner.member_status || '');
    $('#form-upline-link-type').val(partner.upline_link_type || '直屬已知');
    $('#form-country-code').val(partner.country_code || 'TW');
    $('#form-current-rank-id').val(partner.current_rank_id || '');
    $('#form-highest-rank-id').val(partner.highest_rank_id || '');
    $('#form-is-our-team').val(partner.is_our_team || 'Y');
    $('#form-relation-type').val(partner.relation_type || '下線');
    $('#form-operator-status').val(partner.operator_status || '');
    $('#form-join-date').val(partner.join_date || '');
    $('#form-renewal-due-date').val(partner.renewal_due_date || '');

    $('#form-sponsor-id').val(partner.sponsor_id || '').trigger('change');
    $('#form-placement-id').val(partner.placement_id || '').trigger('change');
    $('#form-known-mentor-id').val(partner.known_mentor_id || '').trigger('change');
    $('#form-spouse-partner-id').val(partner.spouse_partner_id || '').trigger('change');
    $('#form-primary-region').val(detail.primary_region || '').trigger('change');

    $('#form-gender').val(gender);
    $('#form-birthday').val(detail.birthday || '');
    $('#form-phone-number').val(detail.phone_number || '');
    $('#form-whatsapp-id').val(detail.whatsapp_id || '');
    $('#form-whatsapp-name').val(detail.whatsapp_name || '');
    $('#form-discord-id').val(detail.discord_id || '');
    $('#form-discord-name').val(detail.discord_name || '');
    $('#form-line-user-id').val(detail.line_user_id || '');
    $('#form-line-id-alias').val(detail.line_id_alias || '');
    $('#form-facebook-url').val(detail.facebook_url || '');
    $('#form-instagram-id').val(detail.instagram_id || '');
    $('#form-contact-address').val(detail.contact_address || '');
    $('#form-occupation-type').val(detail.occupation_type || '');
    $('#form-highest-education').val(detail.highest_education || '');
    $('#form-graduated-school').val(detail.graduated_school || '');
    $('#form-joining-motive').val(detail.joining_motive || '');
    $('#form-health-goals').val(detail.health_goals || '');
    $('#form-team-skills').val(detail.team_skills || '');
    $('#form-intro').val(detail.intro || '');
    $('#form-tactical-notes').val(detail.tactical_notes || '');
    $('#form-is-profile-public').val(detail.is_profile_public || 'Y');

    $('#partnerEditTabs button:first').tab('show');

    const modalEl = document.getElementById('partnerDetailModal');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.openPartnerModalForCreate = function() {
    populateSelect2Options();
    $('#partnerModalTitle').html('<i class="fa-solid fa-user-plus text-primary"></i> 登錄新夥伴檔案');
    $('#form-submit-btn').show();
    $('#form-mode').val('CREATE');
    $('#partnerForm')[0].reset();
    $('#form-partner-id').prop('readonly', false).val(`PTN-TW-${String(partnersList.length + 1).padStart(3, '0')}`);
    $('#form-gender').val('男');

    $('#form-avatar-url').val('');
    $('#form-preview-avatar').attr('src', getDefaultAvatar('男'));

    $('#form-sponsor-id, #form-placement-id, #form-known-mentor-id, #form-spouse-partner-id, #form-primary-region').val('').trigger('change');
    $('#partnerEditTabs button:first').tab('show');

    const modalEl = document.getElementById('partnerDetailModal');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.openPartnerModalForView = function(partnerId) {
    const partner = partnersList.find(p => p.partner_id === partnerId);
    if (!partner) {
        AppToast.warning(`找不到夥伴資料：${partnerId}`);
        return;
    }
    const detail = partnerDetailsList.find(d => d.partner_id === partnerId) || {};
    const gender = detail.gender || '男';
    const avatarUrl = partner.avatar_url || getDefaultAvatar(gender);
    const currentRank = getRankInfo(partner.current_rank_id);
    const highestRank = getRankInfo(partner.highest_rank_id);
    const dispName = getPartnerDisplayName(partner);

    // 1. 頂部名片與 4 項名稱獨立展示
    $('#view-header-id').text(`[${partner.partner_id}]`);
    $('#view-avatar').attr('src', avatarUrl);
    $('#view-name-title').text(dispName);
    $('#view-name-display').text(partner.display_name || '—');
    $('#view-name-zh').text(partner.name_zh || '—');
    $('#view-name-en').text(partner.name_en || '—');
    $('#view-name-pref').text(partner.preferred_name || '—');

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

    // 2. 個人屬性與組織體系 (分行展示學歷與學校、屬性模式)
    $('#view-gender-birthday').text(`${gender} ‧ ${detail.birthday || '未填寫生日'}`);
    $('#view-region').text(detail.primary_region || '未設定');
    $('#view-education').text(detail.highest_education || '未填寫');
    $('#view-school').text(detail.graduated_school || '未填寫');
    $('#view-occupation').text(detail.occupation_type || '未填寫');
    $('#view-motive').html(detail.joining_motive ? `<span class="badge badge-info-subtle">${detail.joining_motive}</span>` : '<span class="text-secondary">未填寫</span>');
    $('#view-account-holder-type').text(partner.account_holder_type || '個人經營者');
    $('#view-operation-mode-text').text(partner.operation_mode || '個人經營');
    $('#view-node-nature').text(partner.node_nature || '常態夥伴');
    $('#view-relation-type-text').text(partner.relation_type || '下線');
    $('#view-mentor').text(partner.known_mentor_id ? `${getPartnerDisplayName(partner.known_mentor_id)} (${partner.known_mentor_id})` : '無特定指派');

    // 3. 官方營運與會籍時間脈絡
    $('#view-member-no-field').text(partner.member_no || '無會員卡號');
    $('#view-sponsor').text(partner.sponsor_id ? `${getPartnerDisplayName(partner.sponsor_id)} (${partner.sponsor_id})` : '無 (頂層節點)');
    $('#view-placement').text(partner.placement_id ? `${getPartnerDisplayName(partner.placement_id)} (${partner.placement_id})` : '無 (頂層節點)');
    $('#view-spouse').text(partner.spouse_partner_id ? `${getPartnerDisplayName(partner.spouse_partner_id)} (${partner.spouse_partner_id})` : '無');
    $('#view-upline-link').text(partner.upline_link_type || '直屬已知');
    $('#view-join-date').text(partner.join_date || '—');
    $('#view-renewal-due-date').text(partner.renewal_due_date || '—');
    $('#view-last-order-date').text(partner.last_order_date || '—');
    $('#view-exit-date').text(partner.exit_date || '—');
    $('#view-is-public').html(detail.is_profile_public === 'Y' ? '<span class="text-success">公開 (Y)</span>' : '<span class="text-secondary">隱藏 (N)</span>');
    $('#view-is-our-team').html(partner.is_our_team === 'Y' ? '<span class="text-success">⭐️ 直轄團隊</span>' : '<span class="text-secondary">🌐 旁線支援</span>');

    // 4. 通訊與社群管道 (FB/IG 各自分行)
    $('#view-phone').html(detail.phone_number ? `<a href="tel:${detail.phone_number}" class="text-info text-decoration-none">${detail.phone_number}</a>` : '<span class="text-secondary">未填</span>');
    $('#view-email').html(partner.auth_email ? `<a href="mailto:${partner.auth_email}" class="text-info text-decoration-none">${partner.auth_email}</a>` : '<span class="text-secondary">未填</span>');
    $('#view-line-info').text(`${detail.line_user_id || '未設定'} / ${detail.line_id_alias || '未設定'}`);
    $('#view-whatsapp-info').text(`${detail.whatsapp_id || '未設定'} / ${detail.whatsapp_name || '未設定'}`);
    $('#view-discord-info').text(`${detail.discord_id || '未設定'} / ${detail.discord_name || '未設定'}`);
    
    $('#view-facebook-link').html(detail.facebook_url ? `<a href="${detail.facebook_url}" target="_blank" class="badge badge-info-subtle text-decoration-none"><i class="fa-brands fa-facebook me-1"></i>前往專頁</a>` : '<span class="text-secondary">未提供</span>');
    $('#view-instagram-link').html(detail.instagram_id ? `<span class="badge badge-purple-subtle"><i class="fa-brands fa-instagram me-1"></i>${detail.instagram_id}</span>` : '<span class="text-secondary">未提供</span>');
    $('#view-contact-address').text(detail.contact_address || '未填寫');

    // 5. 健康訴求、專長、簡介與備忘
    $('#view-health-goals').text(detail.health_goals || '暫無個人主要健康調養訴求註記。');

    if (detail.team_skills) {
        const skillsHtml = detail.team_skills.split(',').map(s => `<span class="badge badge-purple-subtle">${s.trim()}</span>`).join(' ');
        $('#view-skills-tags').html(skillsHtml);
    } else {
        $('#view-skills-tags').html('<span class="text-secondary small">無專長標籤</span>');
    }

    $('#view-intro-full').text(detail.intro || '暫無個人願景宣言。');
    $('#view-tactical-notes').text(detail.tactical_notes || '暫無戰術備忘註記。');

    $('#btn-view-to-edit').off('click').on('click', function () {
        bootstrap.Modal.getInstance(document.getElementById('partnerViewModal'))?.hide();
        setTimeout(() => { openPartnerModalForEdit(partnerId); }, 250);
    });

    const modalEl = document.getElementById('partnerViewModal');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

// ============================================================================
// 9. 雲端寫入與刪除操作 (CRUD Operations)
// ============================================================================
function getFormTrimVal(selector, defaultVal = '') {
    const val = $(selector).val();
    return (val !== undefined && val !== null) ? String(val).trim() : defaultVal;
}

async function savePartnerRecord(e) {
    e.preventDefault();
    const mode = $('#form-mode').val();
    const partnerId = getFormTrimVal('#form-partner-id');
    if (!partnerId) {
        AppToast.warning('夥伴系統唯一識別碼為必填欄位！');
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existingPartner = partnersList.find(p => p.partner_id === partnerId);
    const createdBy = (mode === 'UPDATE' && existingPartner) ? existingPartner.created_by : currentUser;
    const createdAt = (mode === 'UPDATE' && existingPartner) ? existingPartner.created_at : nowStr;

    // 1. 夥伴主檔 (org_partners) 35 欄位陣列
    const partnerRowArray = [
        partnerId,                                              // 0. partner_id
        getFormTrimVal('#form-member-no'),                      // 1. member_no
        getFormTrimVal('#form-auth-email'),                     // 2. auth_email
        getFormTrimVal('#form-name-zh'),                        // 3. name_zh
        getFormTrimVal('#form-name-en'),                        // 4. name_en
        getFormTrimVal('#form-preferred-name'),                 // 5. preferred_name
        getFormTrimVal('#form-display-name'),                   // 6. display_name
        getFormTrimVal('#form-leader-title'),                   // 7. leader_title
        getFormTrimVal('#form-account-holder-type', '個人經營者'), // 8. account_holder_type
        partnerId,                                              // 9. official_account_partner_id
        getFormTrimVal('#form-operation-mode', '個人經營'),       // 10. operation_mode
        getFormTrimVal('#form-spouse-partner-id'),              // 11. spouse_partner_id
        getFormTrimVal('#form-node-nature', '常態夥伴'),          // 12. node_nature
        getFormTrimVal('#form-activity-level'),                 // 13. activity_level
        getFormTrimVal('#form-member-status'),                  // 14. member_status
        'Y',                                                    // 15. is_info_complete
        getFormTrimVal('#form-sponsor-id'),                     // 16. sponsor_id
        getFormTrimVal('#form-placement-id'),                   // 17. placement_id
        getFormTrimVal('#form-known-mentor-id'),                // 18. known_mentor_id
        getFormTrimVal('#form-upline-link-type', '直屬已知'),     // 19. upline_link_type
        getFormTrimVal('#form-current-rank-id'),                // 20. current_rank_id
        getFormTrimVal('#form-highest-rank-id'),                // 21. highest_rank_id
        getFormTrimVal('#form-country-code', 'TW'),             // 22. country_code
        getFormTrimVal('#form-is-our-team', 'Y'),               // 23. is_our_team
        getFormTrimVal('#form-relation-type', '下線'),           // 24. relation_type
        getFormTrimVal('#form-operator-status'),                // 25. operator_status
        getFormTrimVal('#form-join-date'),                      // 26. join_date
        getFormTrimVal('#form-renewal-due-date'),               // 27. renewal_due_date
        '',                                                     // 28. last_order_date
        '',                                                     // 29. exit_date
        getFormTrimVal('#form-avatar-url'),                     // 30. avatar_url
        createdBy,                                              // 31. created_by
        createdAt,                                              // 32. created_at
        currentUser,                                            // 33. modified_by
        nowStr                                                  // 34. modified_at
    ];

    // 2. 夥伴詳細資料 (org_partner_details) 27 欄位陣列
    const detailsRowArray = [
        partnerId,                                              // 0. partner_id
        getFormTrimVal('#form-gender', '男'),                    // 1. gender
        getFormTrimVal('#form-birthday'),                       // 2. birthday
        getFormTrimVal('#form-phone-number'),                   // 3. phone_number
        getFormTrimVal('#form-whatsapp-id'),                    // 4. whatsapp_id
        getFormTrimVal('#form-whatsapp-name'),                  // 5. whatsapp_name
        getFormTrimVal('#form-discord-id'),                     // 6. discord_id
        getFormTrimVal('#form-discord-name'),                   // 7. discord_name
        getFormTrimVal('#form-line-user-id'),                   // 8. line_user_id
        getFormTrimVal('#form-line-id-alias'),                  // 9. line_id_alias
        getFormTrimVal('#form-facebook-url'),                   // 10. facebook_url
        getFormTrimVal('#form-instagram-id'),                   // 11. instagram_id
        getFormTrimVal('#form-primary-region'),                 // 12. primary_region
        getFormTrimVal('#form-contact-address'),                // 13. contact_address
        getFormTrimVal('#form-occupation-type'),                // 14. occupation_type
        getFormTrimVal('#form-highest-education'),              // 15. highest_education
        getFormTrimVal('#form-graduated-school'),               // 16. graduated_school
        getFormTrimVal('#form-joining-motive'),                 // 17. joining_motive
        getFormTrimVal('#form-health-goals'),                   // 18. health_goals
        getFormTrimVal('#form-team-skills'),                    // 19. team_skills
        getFormTrimVal('#form-intro'),                          // 20. intro
        getFormTrimVal('#form-tactical-notes'),                 // 21. tactical_notes
        getFormTrimVal('#form-is-profile-public', 'Y'),          // 22. is_profile_public
        createdBy,                                              // 23. created_by
        createdAt,                                              // 24. created_at
        currentUser,                                            // 25. modified_by
        nowStr                                                  // 26. modified_at
    ];

    const btnSubmit = $('#form-submit-btn');
    try {
        btnSubmit.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 寫入中...');

        if (mode === 'CREATE') {
            await SheetAdapter.createRow('夥伴主檔', partnerId, partnerRowArray);
            await SheetAdapter.createRow('夥伴詳細資料', partnerId, detailsRowArray).catch(() => {});
        } else {
            await SheetAdapter.updateRow('夥伴主檔', partnerId, partnerRowArray);
            await SheetAdapter.updateRow('夥伴詳細資料', partnerId, detailsRowArray).catch(() => {});
        }

        const modalEl = document.getElementById('partnerDetailModal');
        if (modalEl) {
            bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        AppToast.success(`夥伴【${partnerId}】檔案已成功儲存至 Google 試算表！`);
        await fetchGoogleSheetsData();
    } catch (err) {
        AppToast.error('寫入試算表失敗: ' + err.message);
    } finally {
        btnSubmit.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存');
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
                item.partner_id, item.member_no, item.auth_email, item.name_zh, item.name_en,
                item.preferred_name, item.display_name, item.leader_title, item.account_holder_type,
                item.official_account_partner_id || item.partner_id, item.operation_mode,
                item.spouse_partner_id, item.node_nature, item.activity_level, item.member_status,
                item.is_info_complete || 'Y', item.sponsor_id, item.placement_id, item.known_mentor_id,
                item.upline_link_type, item.current_rank_id, item.highest_rank_id, item.country_code,
                item.is_our_team, item.relation_type, item.operator_status, item.join_date,
                item.renewal_due_date, item.last_order_date || '', item.exit_date || '',
                item.avatar_url || '', item.created_by || currentUser, item.created_at || nowStr,
                item.modified_by, item.modified_at
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
    AppDialog.confirm(
        `確定要自雲端試算表中刪除夥伴【${partnerId}】之主檔與詳細資料嗎？`,
        async function () {
            AppLoading.show('<i class="fa-solid fa-spinner fa-spin text-danger"></i> 正在刪除檔案...', '雲端同步處理');
            try {
                await SheetAdapter.deleteRow('夥伴主檔', partnerId);
                await SheetAdapter.deleteRow('夥伴詳細資料', partnerId).catch(() => {});
                AppToast.success(`夥伴【${partnerId}】已成功移除！`);
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