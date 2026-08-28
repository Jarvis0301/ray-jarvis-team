/**
 * ============================================================================
 * 組織成員戰術中樞 (org-partners.js)
 * 遵循共用元件規範 (AppLoading, AppToast, AppDialog, SheetAdapter, Utils)
 * ============================================================================
 */
const SPREADSHEET_ID = "1N-HniBDo7wJHidfsKyG-dr7kh0-UTNtFpM7nyFDL3eg";
const GAS_DEPLOY_ID = "AKfycbwCHIswVrVHuvEusFZrg2KjTCCwYhlf-3h-QbWhro8YVekUt1wNa4oDxxBxzPc_z6cd";

// 預設頭像對應 (區分男女)
const DEFAULT_AVATARS = {
    '男': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    '女': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    '其他': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
};

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

// 取得葡眾會員編號 (若無則 fallback 夥伴代碼)
function getMemberIdentifier(partner) {
    return partner.member_no || partner.partner_id;
}

/**
 * 試算表欄位索引安全取值工具函式 (以順序為主)
 */
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

// 台灣 20 縣市與馬來西亞 16 州屬標準名冊
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

// 初始化篩選器與表單中的行政區選單
function populateRegionDropdowns() {
    const filterRegion = $('#filter-primary-region').empty().append('<option value="">全部行政區</option>');
    const formRegion = $('#form-primary-region').empty().append('<option value="">請選擇行政區</option>');

    // 台灣分組
    let twFilterGroup = $('<optgroup label="🇹🇼 台灣"></optgroup>');
    let twFormGroup = $('<optgroup label="🇹🇼 台灣"></optgroup>');
    REGIONS_DATABASE.TW.forEach(reg => {
        twFilterGroup.append(`<option value="${reg}">${reg}</option>`);
        twFormGroup.append(`<option value="${reg}">${reg}</option>`);
    });
    filterRegion.append(twFilterGroup);
    formRegion.append(twFormGroup);

    // 馬來西亞分組
    let myFilterGroup = $('<optgroup label="🇲🇾 馬來西亞"></optgroup>');
    let myFormGroup = $('<optgroup label="🇲🇾 馬來西亞"></optgroup>');
    REGIONS_DATABASE.MY.forEach(reg => {
        myFilterGroup.append(`<option value="${reg}">${reg}</option>`);
        myFormGroup.append(`<option value="${reg}">${reg}</option>`);
    });
    filterRegion.append(myFilterGroup);
    formRegion.append(myFormGroup);
}

// 國家市場標籤產生輔助器 (TW / MY)
function getCountryBadge(countryCode) {
    const code = (countryCode || 'TW').toUpperCase().trim();
    if (code === 'MY') {
        return `<span class="badge badge-warning-subtle font-monospace">MY</span>`;
    }
    return `<span class="badge badge-info-subtle font-monospace">TW</span>`;
}

// ============================================================================
// 本地狀態管理與資料結構解析
// ============================================================================
let partnersList = [];
let partnerDetailsList = [];
let ranksDatabase = [];
let ranksMap = {};
let currentFilter = 'ALL';
let dataTableInstance = null;
let chartInstances = {};

/**
 * 依據 Schema 順序解析『夥伴主檔 (org_partners)』- 共 35 欄位
 */
function parsePartnersTable(rows) {
    return rows.map((r, idx) => {
        const partnerId = getVal(r, 0, `PTN-TW-${String(idx + 1).padStart(3, '0')}`);
        return {
            partner_id: partnerId,
            member_no: getVal(r, 1, ''),
            auth_email: getVal(r, 2, ''),
            name_zh: getVal(r, 3, ''), // 中文姓名允許為空
            name_en: getVal(r, 4, ''),
            preferred_name: getVal(r, 5, ''),
            display_name: getVal(r, 6, ''),
            leader_title: getVal(r, 7, ''),
            account_holder_type: getVal(r, 8, '個人經營者'),
            official_account_partner_id: getVal(r, 9, ''),
            operation_mode: getVal(r, 10, '個人經營'),
            spouse_partner_id: getVal(r, 11, ''),
            node_nature: getVal(r, 12, '常態夥伴'),
            activity_level: getVal(r, 13, '積極參與'),
            member_status: getVal(r, 14, '有效且領獎金'),
            is_info_complete: getVal(r, 15, 'Y'),
            sponsor_id: getVal(r, 16, ''),
            placement_id: getVal(r, 17, ''),
            known_mentor_id: getVal(r, 18, ''),
            upline_link_type: getVal(r, 19, '直屬已知'),
            current_rank_id: getVal(r, 20, 'RANK_01_MEMBER'),
            highest_rank_id: getVal(r, 21, 'RANK_01_MEMBER'),
            country_code: getVal(r, 22, 'TW'),
            is_our_team: getVal(r, 23, 'Y').toUpperCase(),
            relation_type: getVal(r, 24, '下線'),
            operator_status: getVal(r, 25, '活躍'),
            join_date: getVal(r, 26, '2026-01-01'),
            renewal_due_date: getVal(r, 27, ''),
            last_order_date: getVal(r, 28, ''),
            exit_date: getVal(r, 29, ''),
            avatar_url: getVal(r, 30, ''),
            created_by: getVal(r, 31, 'SYSTEM'),
            created_at: getVal(r, 32, '2026-01-01 00:00:00'),
            modified_by: getVal(r, 33, 'SYSTEM'),
            modified_at: getVal(r, 34, '2026-01-01 00:00:00')
        };
    }).filter(p => p.partner_id && String(p.partner_id).trim() !== ''); // 以 partner_id 計算人數
}

/**
 * 依據 Schema 順序解析『夥伴詳細資料 (org_partner_details)』- 共 23 欄位
 */
function parsePartnerDetailsTable(rows) {
    return rows.map(r => {
        return {
            partner_id: getVal(r, 0, ''),
            gender: getVal(r, 1, '男'),
            birthday: getVal(r, 2, ''),
            phone_number: getVal(r, 3, ''),
            whatsapp_id: getVal(r, 4, ''),
            whatsapp_name: getVal(r, 5, ''),       // 5. WhatsApp 帳號名稱
            discord_id: getVal(r, 6, ''),
            discord_name: getVal(r, 7, ''),         // 7. Discord 使用者名稱
            line_user_id: getVal(r, 8, ''),
            line_id_alias: getVal(r, 9, ''),
            facebook_url: getVal(r, 10, ''),
            instagram_id: getVal(r, 11, ''),
            primary_region: getVal(r, 12, ''),
            contact_address: getVal(r, 13, ''),
            occupation_type: getVal(r, 14, ''),
            highest_education: getVal(r, 15, ''),   // 15. 最高學歷
            graduated_school: getVal(r, 16, ''),    // 16. 最高畢業學校
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

function getRankInfo(rankId) {
    if (ranksMap[rankId]) {
        return ranksMap[rankId];
    }
    return {
        rank_id: rankId || 'RANK_01_MEMBER',
        rank_code: 'R10',
        rank_name_zh: '會員',
        rank_name_en: 'Member',
        badge_icon_class: 'fa-solid fa-user',
        badge_color_hex: '#64748b',
        rank_level: 10
    };
}

// 產生「顏色外框 + 深色底 + 顏色文字」職級標籤
function buildRankBadge(rank) {
    const hex = rank.badge_color_hex || '#8b5cf6';
    const icon = rank.badge_icon_class || 'fa-solid fa-award';
    return `<span class="badge" style="background-color: #130e24; border: 1px solid ${hex}; color: ${hex}; font-weight: 600;">
        <i class="${icon}"></i> ${rank.rank_name_zh}
    </span>`;
}

function updateRanksCacheAndUI() {
    ranksMap = {};
    ranksDatabase.forEach(rk => { ranksMap[rk.rank_id] = rk; });

    const $filterCurrent = $('#filter-current-rank-id').empty().append('<option value="">全部職級</option>');
    const $filterHighest = $('#filter-highest-rank-id').empty().append('<option value="">全部職級</option>');
    const $formCurrent = $('#form-current-rank-id').empty();
    const $formHighest = $('#form-highest-rank-id').empty();

    const sortedRanks = [...ranksDatabase].sort((a, b) => a.sort_order - b.sort_order);
    sortedRanks.forEach(rk => {
        const optHtml = `<option value="${rk.rank_id}">${rk.rank_name_zh} (${rk.rank_code})</option>`;
        $filterCurrent.append(optHtml);
        $filterHighest.append(optHtml);
        $formCurrent.append(optHtml);
        $formHighest.append(optHtml);
    });
}

// ============================================================================
// Google 試算表資料讀取引擎 (GViz + PapaParse)
// ============================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-arrows-rotate fa-spin text-primary"></i> 正在同步組織成員主檔...', '讀取雲端試算表');

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

        populateSelect2Options(); // 同步 Select2 選單
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

// ============================================================================
// 視圖渲染控制器 (Cards / Table / Tree / Charts)
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

// 一鍵重設所有篩選條件
window.resetAllFilters = function() {
    $('.form-filter-control').val('').trigger('change');
    renderAllViews();
};

function renderAllViews() {
    const list = getFilteredPartners();

    $('#hud-total-partners').text(partnersList.length);
    $('#hud-core-partners').text(partnersList.filter(p => p.is_our_team === 'Y').length);
    $('#hud-my-partners').text(partnersList.filter(p => p.country_code === 'MY').length);

    renderCardsView(list);
    renderDataTableView(list);
    renderTreeView();
    renderChartsView();
}

// ============================================================================
// 1. 會員編號 / 共同經營識別與狀態標籤配色產生器
// ============================================================================

// 處理會員編號與共同經營權呈現（無編號不顯示，共同經營顯示關聯人員）
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

    // 若有會員編號才顯示，無編號不顯示
    let memberNoHtml = '';
    if (partner.member_no && String(partner.member_no).trim() !== '') {
        memberNoHtml = `<span class="text-secondary small font-monospace">${partner.member_no.trim()}</span>`;
    }

    return [memberNoHtml, opBadge].filter(Boolean).join(' ');
}

// 關係屬性 / 歸屬體系標籤配色 (我和榮祥purple、上線green、旁線orange、下線blue)
function getRelationBadge(relation, partnerId = '') {
    if (partnerId === 'PTN-TW-001' || partnerId === 'PTN-TW-002' || relation === '核心成員') {
        return `<span class="badge badge-outline-purple"><i class="fa-solid fa-crown me-1"></i>核心成員</span>`;
    }
    switch (relation) {
        case '上線':
            return `<span class="badge badge-outline-green">上線</span>`;
        case '旁線':
            return `<span class="badge badge-outline-orange">旁線</span>`;
        case '下線':
        default:
            return `<span class="badge badge-outline-blue">下線</span>`;
    }
}

// 營運狀態標籤配色 (活躍success、停滯warning、沉睡danger、凍結muted)
function getOperatorStatusBadge(status) {
    switch (status) {
        case '活躍':
            return `<span class="badge badge-outline-success-subtle">活躍</span>`;
        case '停滯':
            return `<span class="badge badge-outline-warning-subtle">停滯</span>`;
        case '沉睡':
            return `<span class="badge badge-outline-danger-subtle">沉睡</span>`;
        case '凍結':
        default:
            return `<span class="badge badge-outline-muted-subtle">凍結</span>`;
    }
}

// 會籍狀態標籤配色 (有效且領獎金success、維持160SV續約warning、失效muted)
function getMemberStatusBadge(status) {
    switch (status) {
        case '有效且領獎金':
            return `<span class="badge badge-success">有效且領獎金</span>`;
        case '維持160SV續約':
            return `<span class="badge badge-warning">維持160SV續約</span>`;
        case '失效':
        default:
            return `<span class="badge badge-muted">失效</span>`;
    }
}

// 團隊參與度標籤配色 (積極參與success、參與warning、不參與danger、自用消費blue、操作人頭purple、失聯muted、個資未知muted)
function getActivityLevelBadge(level) {
    switch (level) {
        case '積極參與':
            return `<span class="badge badge-success-subtle">積極參與</span>`;
        case '參與':
            return `<span class="badge badge-warning-subtle">參與</span>`;
        case '不參與':
            return `<span class="badge badge-danger-subtle">不參與</span>`;
        case '自用消費':
            return `<span class="badge badge-info-subtle">自用消費</span>`;
        case '操作人頭':
            return `<span class="badge badge-purple-subtle">操作人頭</span>`;
        case '失聯':
            return `<span class="badge badge-muted-subtle">失聯</span>`;
        case '個資未知':
        default:
            return `<span class="badge badge-muted-subtle">個資未知</span>`;
    }
}

// ============================================================================
// 2. 卡片視圖渲染 (移除底部線/按鈕、展開3顆操作按鈕、關係改為標籤)
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
        const flagClass = p.country_code === 'MY' ? 'fi-my' : 'fi-tw';
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

                        <!-- 戰情細節指標 -->
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

// ============================================================================
// 3. 表格視圖渲染 (依需求對齊 10 大標籤配色)
// ============================================================================
function renderDataTableView(list) {
    if (dataTableInstance) {
        dataTableInstance.destroy();
        $('#partners-table-body').empty();
    }

    list.forEach(p => {
        const detail = partnerDetailsList.find(d => d.partner_id === p.partner_id) || {};
        const gender = detail.gender || '男';
        const avatarUrl = p.avatar_url || getDefaultAvatar(gender);
        const flagClass = p.country_code === 'MY' ? 'fi-my' : 'fi-tw';
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

    dataTableInstance = $('#partners-datatable').DataTable();
}

// ============================================================================
// 4. 組織關係樹拓撲 (支援共同經營雙層整合框、3 顆操作鈕、帶 icon 職級標籤)
// ============================================================================
function renderTreeView() {
    const container = $('#lineage-tree-root').empty();
    
    // 記錄已被合併至雙層框的配偶/副經營者 ID，避免重複渲染單獨節點
    const renderedCoOpPartnerIds = new Set();

    function getNodeBorderClass(partner) {
        if (partner.partner_id === 'PTN-TW-001' || partner.partner_id === 'PTN-TW-002' || partner.relation_type === '核心成員') {
            return 'node-border-purple';
        }
        if (partner.relation_type === '上線') return 'node-border-green';
        if (partner.relation_type === '旁線') return 'node-border-orange';
        return 'node-border-blue'; // 下線
    }

    function buildBranch(partner) {
        if (renderedCoOpPartnerIds.has(partner.partner_id)) {
            return ''; // 已合併於上層配偶框中，跳過獨立渲染
        }

        const detail = partnerDetailsList.find(d => d.partner_id === partner.partner_id) || {};
        const gender = detail.gender || '男';
        const avatarUrl = partner.avatar_url || getDefaultAvatar(gender);
        const flagClass = partner.country_code === 'MY' ? 'fi-my' : 'fi-tw';
        const currentRank = getRankInfo(partner.current_rank_id);
        const highestRank = getRankInfo(partner.highest_rank_id);
        const borderClass = getNodeBorderClass(partner);
        const dispName = getPartnerDisplayName(partner);
        const identifierHtml = renderMemberIdentifierBadge(partner);

        // 尋找配偶 / 共同經營者（若存在則合併至同一個框的下層）
        let spouseNodeHtml = '';
        const spouseId = partner.spouse_partner_id;
        if (spouseId) {
            const spouse = partnersList.find(x => x.partner_id === spouseId || x.member_no === spouseId);
            if (spouse) {
                renderedCoOpPartnerIds.add(spouse.partner_id); // 標記為已合併

                const spouseDetail = partnerDetailsList.find(d => d.partner_id === spouse.partner_id) || {};
                const spouseGender = spouseDetail.gender || '女';
                const spouseAvatar = spouse.avatar_url || getDefaultAvatar(spouseGender);
                const spouseFlag = spouse.country_code === 'MY' ? 'fi-my' : 'fi-tw';
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
                                    <span class="fi ${spouseFlag}"></span>
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

        // 下線搜尋（同時包含該節點及其合併配偶所引薦的下線，並排除已被合併的配偶自身）
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

    // 取得頂層節點（排除身為副經營者的節點）
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
// 圓餅圖/環形圖 Tooltip 佔比計算輔助設定
// ============================================================================
const getPieTooltipOptions = () => ({
    plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {
            callbacks: {
                label: function (context) {
                    const val = context.parsed;
                    const total = context.dataset.data.reduce((acc, cur) => acc + cur, 0);
                    const percentage = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                    return ` ${context.label}: ${val} 人 (${percentage}%)`;
                }
            }
        }
    }
});

// 在 renderChartsView() 內各圓餅圖/環形圖初始化 options 處套用：
function renderChartsView() {
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};

    const createCountMap = (key, defaultKeys = []) => {
        const map = {};
        defaultKeys.forEach(k => { map[k] = 0; });
        partnersList.forEach(p => {
            const detail = partnerDetailsList.find(d => d.partner_id === p.partner_id) || {};
            const val = p[key] || detail[key] || '其他';
            map[val] = (map[val] || 0) + 1;
        });
        return map;
    };

    // 1. 職級位階分佈 (長條圖)
    const rankCounts = {};
    ranksDatabase.forEach(rk => { rankCounts[rk.rank_name_zh] = 0; });
    partnersList.forEach(p => {
        const rk = getRankInfo(p.current_rank_id);
        rankCounts[rk.rank_name_zh] = (rankCounts[rk.rank_name_zh] || 0) + 1;
    });
    const ctxRank = document.getElementById('chart-rank-distribution');
    if (ctxRank) {
        chartInstances.rank = new Chart(ctxRank, {
            type: 'bar',
            data: {
                labels: Object.keys(rankCounts),
                datasets: [{ data: Object.values(rankCounts), backgroundColor: '#8b5cf6', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 2. 體系歸屬比例 (環形圖 - 懸浮顯示佔比)
    const ourTeamCount = partnersList.filter(p => p.is_our_team === 'Y').length;
    const ctxTeam = document.getElementById('chart-team-split');
    if (ctxTeam) {
        chartInstances.team = new Chart(ctxTeam, {
            type: 'doughnut',
            data: {
                labels: ['Ray&Jarvis直轄', '旁線友軍'],
                datasets: [{ data: [ourTeamCount, partnersList.length - ourTeamCount], backgroundColor: ['#8b5cf6', '#64748b'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 3. 市場區域佔比 (圓餅圖 - 懸浮顯示佔比)
    const twCount = partnersList.filter(p => p.country_code === 'TW').length;
    const ctxMarket = document.getElementById('chart-market-split');
    if (ctxMarket) {
        chartInstances.market = new Chart(ctxMarket, {
            type: 'pie',
            data: {
                labels: ['台灣市場', '大馬市場'],
                datasets: [{ data: [twCount, partnersList.length - twCount], backgroundColor: ['#38bdf8', '#fbbf24'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 4. 團隊參與度分佈 (長條圖)
    const actCounts = createCountMap('activity_level', ['積極參與', '參與', '不參與', '自用消費', '操作人頭', '失聯', '個資未知']);
    const ctxActivity = document.getElementById('chart-activity-distribution');
    if (ctxActivity) {
        chartInstances.activity = new Chart(ctxActivity, {
            type: 'bar',
            data: {
                labels: Object.keys(actCounts),
                datasets: [{ data: Object.values(actCounts), backgroundColor: '#34d399', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 5. 經營權運作模式 (環形圖 - 懸浮顯示佔比)
    const modeCounts = createCountMap('operation_mode', ['個人經營', '共同經營', '獨立經營']);
    const ctxMode = document.getElementById('chart-mode-distribution');
    if (ctxMode) {
        chartInstances.mode = new Chart(ctxMode, {
            type: 'doughnut',
            data: {
                labels: Object.keys(modeCounts),
                datasets: [{ data: Object.values(modeCounts), backgroundColor: ['#a78bfa', '#f472b6', '#38bdf8'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 6. 行政區域分佈 (長條圖)
    const regionCounts = createCountMap('primary_region');
    const ctxRegion = document.getElementById('chart-region-distribution');
    if (ctxRegion) {
        chartInstances.region = new Chart(ctxRegion, {
            type: 'bar',
            data: {
                labels: Object.keys(regionCounts),
                datasets: [{ data: Object.values(regionCounts), backgroundColor: '#0284c7', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 7. 入會動機比例 (圓餅圖 - 懸浮顯示佔比)
    const motiveCounts = createCountMap('joining_motive', ['體質調養', '兼職副業', '全職創業']);
    const ctxMotive = document.getElementById('chart-motive-distribution');
    if (ctxMotive) {
        chartInstances.motive = new Chart(ctxMotive, {
            type: 'pie',
            data: {
                labels: Object.keys(motiveCounts),
                datasets: [{ data: Object.values(motiveCounts), backgroundColor: ['#ec4899', '#f59e0b', '#10b981'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 8. 營運狀態分佈 (環形圖 - 懸浮顯示佔比)
    const opCounts = createCountMap('operator_status', ['活躍', '停滯', '沉睡', '凍結']);
    const ctxOp = document.getElementById('chart-operator-status');
    if (ctxOp) {
        chartInstances.operator = new Chart(ctxOp, {
            type: 'doughnut',
            data: {
                labels: Object.keys(opCounts),
                datasets: [{ data: Object.values(opCounts), backgroundColor: ['#10b981', '#fbbf24', '#64748b', '#ef4444'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 9. 官方會籍狀態 (長條圖)
    const memberCounts = createCountMap('member_status', ['有效且領獎金', '維持160SV續約', '失效']);
    const ctxMember = document.getElementById('chart-member-status');
    if (ctxMember) {
        chartInstances.member = new Chart(ctxMember, {
            type: 'bar',
            data: {
                labels: Object.keys(memberCounts),
                datasets: [{ data: Object.values(memberCounts), backgroundColor: ['#059669', '#d97706', '#dc2626'], borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 10. 組織關係屬性佔比 (圓餅圖 - 懸浮顯示佔比)
    const relationCounts = createCountMap('relation_type', ['核心成員', '下線', '上線', '旁線', '中繼層']);
    const ctxRelation = document.getElementById('chart-relation-split');
    if (ctxRelation) {
        chartInstances.relation = new Chart(ctxRelation, {
            type: 'pie',
            data: {
                labels: Object.keys(relationCounts),
                datasets: [{ data: Object.values(relationCounts), backgroundColor: ['#8b5cf6', '#38bdf8', '#10b981', '#f97316', '#64748b'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 11. 生理性別比例 (圓餅圖)
    const genderCounts = createCountMap('gender', ['男', '女', '其他']);
    const ctxGender = document.getElementById('chart-gender-split');
    if (ctxGender) {
        chartInstances.gender = new Chart(ctxGender, {
            type: 'doughnut',
            data: {
                labels: Object.keys(genderCounts),
                datasets: [{ data: Object.values(genderCounts), backgroundColor: ['#38bdf8', '#f472b6', '#a78bfa'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 12. 最高學歷層級分佈 (長條圖)
    const eduCounts = createCountMap('highest_education', ['博士', '碩士', '學士', '副學士', '高中職', '國中', '國小', '未就學']);
    const ctxEdu = document.getElementById('chart-education-distribution');
    if (ctxEdu) {
        chartInstances.education = new Chart(ctxEdu, {
            type: 'bar',
            data: {
                labels: Object.keys(eduCounts),
                datasets: [{ data: Object.values(eduCounts), backgroundColor: '#fbbf24', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 13. 上線連結模式佔比 (環形圖)
    const uplineCounts = createCountMap('upline_link_type', ['直屬已知', '中間未知', '體系頂層']);
    const ctxUpline = document.getElementById('chart-upline-link-distribution');
    if (ctxUpline) {
        chartInstances.uplineLink = new Chart(ctxUpline, {
            type: 'doughnut',
            data: {
                labels: Object.keys(uplineCounts),
                datasets: [{ data: Object.values(uplineCounts), backgroundColor: ['#10b981', '#f87171', '#8b5cf6'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 14. 經營身分類型分佈 (圓餅圖)
    const holderCounts = createCountMap('account_holder_type', ['個人經營者', '主要經營者', '共同經營者']);
    const ctxHolder = document.getElementById('chart-account-holder-distribution');
    if (ctxHolder) {
        chartInstances.accountHolder = new Chart(ctxHolder, {
            type: 'pie',
            data: {
                labels: Object.keys(holderCounts),
                datasets: [{ data: Object.values(holderCounts), backgroundColor: ['#0284c7', '#34d399', '#f59e0b'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 15. 節點性質狀態統計 (長條圖)
    const nodeCounts = createCountMap('node_nature', ['常態夥伴', '中繼失聯節點', '幽靈節點', '虛擬佔位']);
    const ctxNode = document.getElementById('chart-node-nature-distribution');
    if (ctxNode) {
        chartInstances.nodeNature = new Chart(ctxNode, {
            type: 'bar',
            data: {
                labels: Object.keys(nodeCounts),
                datasets: [{ data: Object.values(nodeCounts), backgroundColor: '#c084fc', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 16. 官方續約月份分佈 (長條圖)
    const monthCounts = {};
    for (let i = 1; i <= 12; i++) { monthCounts[`${i}月`] = 0; }
    partnersList.forEach(p => {
        if (p.renewal_due_date && p.renewal_due_date.includes('-')) {
            const m = parseInt(p.renewal_due_date.split('-')[1], 10);
            if (m >= 1 && m <= 12) monthCounts[`${m}月`]++;
        }
    });
    const ctxRenewal = document.getElementById('chart-renewal-month-distribution');
    if (ctxRenewal) {
        chartInstances.renewalMonth = new Chart(ctxRenewal, {
            type: 'bar',
            data: {
                labels: Object.keys(monthCounts),
                datasets: [{ data: Object.values(monthCounts), backgroundColor: '#f87171', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 17. 夥伴簽約加入年份趨勢 (折線/長條圖)
    const yearCounts = {};
    partnersList.forEach(p => {
        if (p.join_date) {
            const y = p.join_date.slice(0, 4);
            yearCounts[y] = (yearCounts[y] || 0) + 1;
        }
    });
    const ctxYear = document.getElementById('chart-join-year-distribution');
    if (ctxYear) {
        chartInstances.joinYear = new Chart(ctxYear, {
            type: 'bar',
            data: {
                labels: Object.keys(yearCounts).sort(),
                datasets: [{ data: Object.keys(yearCounts).sort().map(k => yearCounts[k]), backgroundColor: '#38bdf8', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 18. 實務輔導上線線路分流 (長條圖 - Top 8)
    const mentorCounts = {};
    partnersList.forEach(p => {
        const mName = getPartnerDisplayName(p.known_mentor_id) || '無特定指派';
        mentorCounts[mName] = (mentorCounts[mName] || 0) + 1;
    });
    const sortedMentors = Object.entries(mentorCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const ctxMentor = document.getElementById('chart-mentor-distribution');
    if (ctxMentor) {
        chartInstances.mentor = new Chart(ctxMentor, {
            type: 'bar',
            data: {
                labels: sortedMentors.map(x => x[0]),
                datasets: [{ data: sortedMentors.map(x => x[1]), backgroundColor: '#34d399', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 19. 內部榮譽職銜階梯佔比 (環形圖)
    const titleCounts = createCountMap('leader_title', ['雙創始人', '核心領袖', '總監', '菁英夥伴']);
    const ctxTitle = document.getElementById('chart-leader-title-distribution');
    if (ctxTitle) {
        chartInstances.leaderTitle = new Chart(ctxTitle, {
            type: 'doughnut',
            data: {
                labels: Object.keys(titleCounts),
                datasets: [{ data: Object.values(titleCounts), backgroundColor: ['#8b5cf6', '#38bdf8', '#fbbf24', '#64748b'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 20. 個人名片公開意願比例 (圓餅圖)
    const publicCounts = { '公開 (Y)': 0, '隱藏 (N)': 0 };
    partnerDetailsList.forEach(d => {
        if (d.is_profile_public === 'N') publicCounts['隱藏 (N)']++;
        else publicCounts['公開 (Y)']++;
    });
    const ctxPublic = document.getElementById('chart-profile-public-split');
    if (ctxPublic) {
        chartInstances.profilePublic = new Chart(ctxPublic, {
            type: 'pie',
            data: {
                labels: Object.keys(publicCounts),
                datasets: [{ data: Object.values(publicCounts), backgroundColor: ['#10b981', '#64748b'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }
}

// ============================================================================
// Modal 戰術檔案表單操作 (CRUD) - 註冊至全域 Window
// ============================================================================
// 動態填入成員下拉選單 (引薦人、安置人、輔導上線、配偶)
function populatePartnerSelects() {
    const selects = ['#form-sponsor-id', '#form-placement-id', '#form-known-mentor-id', '#form-spouse-partner-id'];
    selects.forEach(sel => {
        const $el = $(sel).empty().append('<option value="">(無)</option>');
        partnersList.forEach(p => {
            $el.append(`<option value="${p.partner_id}">${getPartnerDisplayName(p)} [${getMemberIdentifier(p)}]</option>`);
        });
    });
}

// 編輯模式
window.openPartnerModalForEdit = function(partnerId) {
    const partner = partnersList.find(p => p.partner_id === partnerId);
    if (!partner) return;
    const detail = partnerDetailsList.find(d => d.partner_id === partnerId) || {};
    
    // 重新填充下拉選項
    populateSelect2Options();

    $('#partnerModalTitle').html(`<i class="fa-solid fa-id-card-clip text-primary"></i> 編輯檔案 - ${getPartnerDisplayName(partner)}`);
    $('#partnerForm input, #partnerForm select, #partnerForm textarea').prop('disabled', false);
    $('#form-submit-btn').show();

    $('#form-mode').val('UPDATE');
    $('#form-partner-id').prop('readonly', true).val(partner.partner_id);
    $('#form-member-no').val(partner.member_no || '');
    $('#form-auth-email').val(partner.auth_email || '');
    $('#form-name-zh').val(partner.name_zh);
    $('#form-name-en').val(partner.name_en || '');
    $('#form-preferred-name').val(partner.preferred_name || '');
    $('#form-display-name').val(partner.display_name || '');
    $('#form-leader-title').val(partner.leader_title || '');
    $('#form-account-holder-type').val(partner.account_holder_type);
    $('#form-operation-mode').val(partner.operation_mode);
    $('#form-node-nature').val(partner.node_nature);
    $('#form-activity-level').val(partner.activity_level);
    $('#form-member-status').val(partner.member_status);
    $('#form-upline-link-type').val(partner.upline_link_type);

    // Select2 賦值並觸發變更
    $('#form-sponsor-id').val(partner.sponsor_id || '').trigger('change');
    $('#form-placement-id').val(partner.placement_id || '').trigger('change');
    $('#form-known-mentor-id').val(partner.known_mentor_id || '').trigger('change');
    $('#form-spouse-partner-id').val(partner.spouse_partner_id || '').trigger('change');

    $('#form-country-code').val(partner.country_code);
    $('#form-current-rank-id').val(partner.current_rank_id);
    $('#form-highest-rank-id').val(partner.highest_rank_id);
    $('#form-is-our-team').val(partner.is_our_team);
    $('#form-relation-type').val(partner.relation_type);
    $('#form-operator-status').val(partner.operator_status);
    $('#form-join-date').val(partner.join_date);
    $('#form-renewal-due-date').val(partner.renewal_due_date || '');

    const gender = detail.gender || '男';
    const avatarUrl = partner.avatar_url || getDefaultAvatar(gender);
    $('#form-avatar-url').val(avatarUrl);
    $('#form-preview-avatar').attr('src', avatarUrl);

    $('#form-gender').val(gender);
    $('#form-birthday').val(detail.birthday || '');
    $('#form-phone-number').val(detail.phone_number || '');
    $('#form-whatsapp-id').val(detail.whatsapp_id || '');
    $('#form-discord-id').val(detail.discord_id || '');
    $('#form-line-user-id').val(detail.line_user_id || '');
    $('#form-line-id-alias').val(detail.line_id_alias || '');
    $('#form-facebook-url').val(detail.facebook_url || '');
    $('#form-instagram-id').val(detail.instagram_id || '');
    $('#form-primary-region').val(detail.primary_region || '').trigger('change');
    $('#form-contact-address').val(detail.contact_address || '');
    $('#form-occupation-type').val(detail.occupation_type || '');
    $('#form-joining-motive').val(detail.joining_motive || '體質調養');
    $('#form-health-goals').val(detail.health_goals || '');
    $('#form-team-skills').val(detail.team_skills || '');
    $('#form-intro').val(detail.intro || '');
    $('#form-tactical-notes').val(detail.tactical_notes || '');
    $('#form-is-profile-public').val(detail.is_profile_public || 'Y');

    const modalEl = document.getElementById('partnerDetailModal');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

// 新增模式
window.openPartnerModalForCreate = function() {
    populateSelect2Options();

    $('#partnerModalTitle').html('<i class="fa-solid fa-user-plus text-primary"></i> 登錄新夥伴戰術檔案');
    $('#partnerForm input, #partnerForm select, #partnerForm textarea').prop('disabled', false);
    $('#form-submit-btn').show();

    $('#form-mode').val('CREATE');
    $('#partnerForm')[0].reset();
    $('#form-partner-id').prop('readonly', false).val(`PTN-TW-${String(partnersList.length + 1).padStart(3, '0')}`);
    $('#form-join-date').val(new Date().toISOString().split('T')[0]);
    
    const defaultAvatar = getDefaultAvatar('男');
    $('#form-avatar-url').val(defaultAvatar);
    $('#form-preview-avatar').attr('src', defaultAvatar);

    // 重設 Select2 欄位
    $('#form-sponsor-id, #form-placement-id, #form-known-mentor-id, #form-spouse-partner-id, #form-primary-region').val('').trigger('change');

    const modalEl = document.getElementById('partnerDetailModal');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

// 瀏覽模式
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

    // 1. 頂部 Hero 識別與橫幅
    $('#view-header-id').text(`[${partner.partner_id}]`);
    $('#view-avatar').attr('src', avatarUrl);
    $('#view-name-title').html(`${dispName} <span class="fs-6 text-secondary fw-normal">(${partner.name_zh || partner.name_en || ''})</span>`);
    $('#view-country-badge').html(getCountryBadge(partner.country_code));
    $('#view-current-rank-badge').html(`<i class="${currentRank.badge_icon_class}"></i> ${currentRank.rank_name_zh}`).css({
        'background-color': '#130e24',
        'border': `1px solid ${currentRank.badge_color_hex}`,
        'color': currentRank.badge_color_hex
    });
    
    // 關係與整合標籤 (避免重複顯示卡號)
    $('#view-relation-badge').html(getRelationBadge(partner.relation_type, partner.partner_id));
    $('#view-operation-badge').html(renderMemberIdentifierBadge(partner));
    $('#view-status-pair').html(`${getMemberStatusBadge(partner.member_status)} ${getOperatorStatusBadge(partner.operator_status)}`);

    if (partner.leader_title) {
        $('#view-leader-title').text(partner.leader_title).show();
    } else {
        $('#view-leader-title').hide();
    }

    // 簡介引言短語 (取第一行或預設引言)
    const shortIntro = detail.intro ? detail.intro.split('\n')[0] : '暫無簡介。';
    $('#view-intro-quote').text(shortIntro);

    // 2. 左欄：個人基本屬性
    $('#view-bio').text(`${gender} ‧ ${detail.birthday || '未填寫'}`);
    
    // 最高學歷與學校
    const eduText = [detail.highest_education, detail.graduated_school].filter(Boolean).join(' ‧ ') || '未填寫';
    $('#view-education').text(eduText);
    
    $('#view-occupation').text(detail.occupation_type || '未填寫');
    
    // 入會動機：為空則不顯示標籤
    if (detail.joining_motive && detail.joining_motive.trim() !== '') {
        $('#view-motive').html(`<span class="badge badge-info-subtle">${detail.joining_motive}</span> <span class="text-secondary small">(名片: ${detail.is_profile_public === 'Y' ? '公開' : '隱藏'})</span>`);
    } else {
        $('#view-motive').html(`<span class="text-secondary small">未填寫 (名片: ${detail.is_profile_public === 'Y' ? '公開' : '隱藏'})</span>`);
    }
    
    $('#view-region').text(detail.primary_region || '未填寫');
    $('#view-address').text(detail.contact_address || '未填寫');

    // 3. 左欄：通訊與聯絡管道
    $('#view-phone').html(detail.phone_number ? `<a href="tel:${detail.phone_number}" class="text-info text-decoration-none">${detail.phone_number}</a>` : '<span class="text-secondary">未填寫</span>');
    $('#view-email').html(partner.auth_email ? `<a href="mailto:${partner.auth_email}" class="text-info text-decoration-none">${partner.auth_email}</a>` : '<span class="text-secondary">未填寫</span>');
    $('#view-line-id').text(detail.line_user_id || '未填寫');
    $('#view-line-alias').text(detail.line_id_alias || '未填寫');

    // WhatsApp (含帳號與名稱)
    const waDisplay = [detail.whatsapp_id, detail.whatsapp_name ? `(${detail.whatsapp_name})` : ''].filter(Boolean).join(' ');
    $('#view-whatsapp').html(detail.whatsapp_id ? `<a href="https://wa.me/${detail.whatsapp_id.replace(/\+/g, '')}" target="_blank" class="text-success text-decoration-none">${waDisplay}</a>` : '<span class="text-secondary">未填寫</span>');

    // Discord / 社群 (含使用者名稱)
    const socialLinks = [];
    if (detail.discord_id || detail.discord_name) {
        const discordLabel = [detail.discord_id, detail.discord_name ? `(${detail.discord_name})` : ''].filter(Boolean).join(' ');
        socialLinks.push(`<span class="badge badge-dark"><i class="fa-brands fa-discord me-1"></i>${discordLabel}</span>`);
    }
    if (detail.facebook_url) socialLinks.push(`<a href="${detail.facebook_url}" target="_blank" class="btn btn-sm btn-outline-info py-0 px-2"><i class="fa-brands fa-facebook"></i></a>`);
    if (detail.instagram_id) socialLinks.push(`<span class="badge badge-dark"><i class="fa-brands fa-instagram me-1"></i>${detail.instagram_id}</span>`);
    $('#view-socials').html(socialLinks.length ? socialLinks.join(' ') : '<span class="text-secondary small">無</span>');

    // 4. 左欄：組織關係節點
    $('#view-mentor').text(partner.known_mentor_id ? `${getPartnerDisplayName(partner.known_mentor_id)} (${partner.known_mentor_id})` : '無特定指派');
    $('#view-sponsor').text(partner.sponsor_id ? `${getPartnerDisplayName(partner.sponsor_id)} (${partner.sponsor_id})` : '無 (頂層節點)');
    $('#view-placement').text(partner.placement_id ? `${getPartnerDisplayName(partner.placement_id)} (${partner.placement_id})` : '無 (頂層節點)');
    $('#view-spouse').text(partner.spouse_partner_id ? `${getPartnerDisplayName(partner.spouse_partner_id)} (${partner.spouse_partner_id})` : '無配偶關聯');
    $('#view-is-our-team').html(partner.is_our_team === 'Y' ? '<span class="text-success"><i class="fa-solid fa-check-circle"></i> Ray & Jarvis 直轄主力</span>' : '<span class="text-secondary"><i class="fa-solid fa-globe"></i> 旁線 / 體系友軍</span>');

    // 5. 右欄：專長標籤、健康訴求、簡介與備忘
    if (detail.team_skills) {
        const skillsHtml = detail.team_skills.split(',').map(s => `<span class="badge badge-purple-subtle fs-6"><i class="fa-solid fa-check me-1"></i>${s.trim()}</span>`).join(' ');
        $('#view-skills-tags').html(skillsHtml);
    } else {
        $('#view-skills-tags').html('<span class="text-secondary small">尚未填寫專長標籤</span>');
    }

    $('#view-health-goals').text(detail.health_goals || '暫無特別健康訴求紀錄。');
    $('#view-intro-full').text(detail.intro || '暫無個人簡介與願景宣言。');
    $('#view-tactical-notes').text(detail.tactical_notes || '暫無戰術備忘與排線調度註記。');

    $('#view-join-dates').text(`加入日期: ${partner.join_date || '—'} ｜ 續約到期: ${partner.renewal_due_date || '—'}`);
    $('#view-audit-info').text(`最後更新: ${partner.modified_at || '—'}`);

    // 6. 跳轉編輯按鈕事件綁定
    $('#btn-view-to-edit').off('click').on('click', function() {
        bootstrap.Modal.getInstance(document.getElementById('partnerViewModal'))?.hide();
        setTimeout(() => {
            openPartnerModalForEdit(partnerId);
        }, 300);
    });

    const modalEl = document.getElementById('partnerViewModal');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

// 刪除夥伴紀錄
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
            confirmClass: "btn-danger" // 依據 AppDialog.confirm 規範對齊屬性名稱
        }
    );
};

// 安全取出表單輸入值工具函式（避免 undefined.trim() 報錯）
function getFormTrimVal(selector, defaultVal = '') {
    const val = $(selector).val();
    return (val !== undefined && val !== null) ? String(val).trim() : defaultVal;
}

/**
 * 夥伴檔案儲存函式 (同步寫入「夥伴主檔」35欄位與「夥伴詳細資料」23欄位)
 */
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
        getFormTrimVal('#form-activity-level', '積極參與'),       // 13. activity_level
        getFormTrimVal('#form-member-status', '有效且領獎金'),     // 14. member_status
        'Y',                                                    // 15. is_info_complete
        getFormTrimVal('#form-sponsor-id'),                     // 16. sponsor_id
        getFormTrimVal('#form-placement-id'),                   // 17. placement_id
        getFormTrimVal('#form-known-mentor-id'),                // 18. known_mentor_id
        getFormTrimVal('#form-upline-link-type', '直屬已知'),     // 19. upline_link_type
        getFormTrimVal('#form-current-rank-id', 'RANK_01_MEMBER'), // 20. current_rank_id
        getFormTrimVal('#form-highest-rank-id', 'RANK_01_MEMBER'), // 21. highest_rank_id
        getFormTrimVal('#form-country-code', 'TW'),             // 22. country_code
        getFormTrimVal('#form-is-our-team', 'Y'),               // 23. is_our_team
        getFormTrimVal('#form-relation-type', '下線'),           // 24. relation_type
        getFormTrimVal('#form-operator-status', '活躍'),         // 25. operator_status
        getFormTrimVal('#form-join-date', nowStr.slice(0, 10)), // 26. join_date
        getFormTrimVal('#form-renewal-due-date'),               // 27. renewal_due_date
        '',                                                     // 28. last_order_date
        '',                                                     // 29. exit_date
        getFormTrimVal('#form-avatar-url'),                     // 30. avatar_url
        createdBy,                                              // 31. created_by
        createdAt,                                              // 32. created_at
        currentUser,                                            // 33. modified_by
        nowStr                                                  // 34. modified_at
    ];

    // 2. 夥伴詳細資料 (org_partner_details) 23 欄位陣列
    const detailsRowArray = [
        partnerId,
        getFormTrimVal('#form-gender', '男'),
        getFormTrimVal('#form-birthday'),
        getFormTrimVal('#form-phone-number'),
        getFormTrimVal('#form-whatsapp-id'),
        getFormTrimVal('#form-whatsapp-name'),       // WhatsApp 帳號名稱
        getFormTrimVal('#form-discord-id'),
        getFormTrimVal('#form-discord-name'),        // Discord 使用者名稱
        getFormTrimVal('#form-line-user-id'),
        getFormTrimVal('#form-line-id-alias'),
        getFormTrimVal('#form-facebook-url'),
        getFormTrimVal('#form-instagram-id'),
        getFormTrimVal('#form-primary-region'),
        getFormTrimVal('#form-contact-address'),
        getFormTrimVal('#form-occupation-type'),
        getFormTrimVal('#form-highest-education'),   // 最高學歷
        getFormTrimVal('#form-graduated-school'),    // 最高畢業學校
        getFormTrimVal('#form-joining-motive'),
        getFormTrimVal('#form-health-goals'),
        getFormTrimVal('#form-team-skills'),
        getFormTrimVal('#form-intro'),
        getFormTrimVal('#form-tactical-notes'),
        getFormTrimVal('#form-is-profile-public', 'Y'),
        createdBy,
        createdAt,
        currentUser,
        nowStr
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
        btnSubmit.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存變更');
    }
}

// ============================================================================
// 生命週期與事件綁定初始化
// ============================================================================
window.addEventListener('AppReady', function () {
    SheetAdapter.init(GAS_DEPLOY_ID);
    applyUIPermissions();
    populateRegionDropdowns();
    initSelect2Dropdowns();

    // 統一由 AppDialog 託管兩個 Modal 的視窗置中與滾動追蹤
    AppDialog.bindIframeAutoCenter('#partnerDetailModal');
    AppDialog.bindIframeAutoCenter('#partnerViewModal');

    $('.form-filter-control').on('change', function () {
        renderAllViews();
    });

    fetchGoogleSheetsData();

    $('input[name="viewMode"]').on('change', function () {
        const mode = $(this).attr('id');
        $('#container-cards-view, #container-table-view, #container-tree-view, #container-charts-view').addClass('d-none');

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
            $('#form-avatar-url').val(newAvatar);
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

// ==========================================================================
// Select2 下拉選項動態生成與初始化
// ==========================================================================

// 1. 動態填充夥伴與行政區選項
function populateSelect2Options() {
    // 填充夥伴選單 (引薦人、安置人、輔導上線、配偶)
    const partnerSelects = ['#form-sponsor-id', '#form-placement-id', '#form-known-mentor-id', '#form-spouse-partner-id'];
    partnerSelects.forEach(selId => {
        const $el = $(selId).empty().append('<option value="">(無)</option>');
        partnersList.forEach(p => {
            const dispName = getPartnerDisplayName(p);
            const memberNo = p.member_no ? ` [${p.member_no}]` : '';
            $el.append(`<option value="${p.partner_id}">${dispName}${memberNo} (${p.partner_id})</option>`);
        });
    });

    // 填充行政區選單 (分組台灣 20 縣市與大馬 16 州屬)
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

// 2. 初始化 Select2 元件 (綁定 Modal 容器父層)
function initSelect2Dropdowns() {
    if (!$.fn.select2) return;

    // 表單內的 Select2
    $('.select2-partner-search, .select2-region-search').select2({
        dropdownParent: $('#partnerDetailModal'),
        width: '100%',
        placeholder: '請輸入關鍵字搜尋...',
        allowClear: true,
        language: { noResults: () => '找不到相符的項目' }
    });

    // 頂部複合篩選器的 Select2
    $('#filter-primary-region').select2({
        width: '100%',
        placeholder: '全部行政區',
        allowClear: true,
        language: { noResults: () => '找不到相符的項目' }
    }).on('change', function () {
        renderAllViews();
    });
}