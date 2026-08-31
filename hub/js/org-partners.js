/**
 * ============================================================================
 * 組織成員戰術中樞 (org-partners.js)
 * 專為「榮祥團隊（Ray's Team）」打造之數位戰術控制台
 * 涵蓋：HUD 指標、卡片/列表/批次/樹狀/圖表五大視圖、360° 檔案、試算表 CRUD
 * 組織拓撲引擎：多樹森林、三軌線路（安置/推薦/輔導）、閉包表斷層偵測、全域篩選聯動
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
let currentTreeLineMode = 'placement'; // 預設：安置線 ('placement' | 'sponsor' | 'mentor')
let selectedTreeRootId = 'ALL';        // 預設：全域森林 ('ALL' 或指定 partner_id)

// ============================================================================
// 2. 系統生命週期與初始化 (Lifecycle & Init)
// ============================================================================
window.addEventListener('AppReady', function () {
    SheetAdapter.init(GAS_DEPLOY_ID);
    applyUIPermissions();
    populateRegionDropdowns();
    initSelect2Dropdowns();
    initSelect2ScrollGuard();
    initOrgTreeControls();
    initOrgChartPan();
    initDynamicTableDragAndDrop('#form-contacts-dynamic-tbody');
    initDynamicTableDragAndDrop('#form-languages-dynamic-tbody');

    // 12 欄位篩選器變更監聽
    $('.form-filter-control').on('change', function () {
        renderAllViews();
    });

    // 讀取試算表資料
    fetchGoogleSheetsData();

    // 五大視圖切換器監聽
    $('input[name="viewMode"]').on('change', function () {
        const mode = $(this).attr('id');
        $('#container-cards-view, #container-table-view, #container-tree-view, #container-charts-view').addClass('d-none');

        if (mode === 'view-cards') {
            $('#container-cards-view').removeClass('d-none');
        } else if (mode === 'view-table') {
            $('#container-table-view').removeClass('d-none');
            if (dataTableInstance) {
                setTimeout(() => {
                    dataTableInstance.columns.adjust().draw(false);
                }, 100);
            }
        } else if (mode === 'view-tree') {
            $('#container-tree-view').removeClass('d-none');
        } else if (mode === 'view-charts') {
            $('#container-charts-view').removeClass('d-none');
            $('#select-lang-filter').select2({ width: '100%' });
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

    // 夥伴表單儲存監聽
    $('#partnerForm').on('submit', savePartnerRecord);

    // 監聽模式切換：當選擇「已知人數斷層」時顯示間隔人數輸入框
    $('#form-upline-link-type').on('change', function () {
        const mode = $(this).val();
        if (mode === '已知人數斷層') {
            $('#gap-count-container').slideDown(200);
            if (!$('#form-gap-count').val()) {
                $('#form-gap-count').val(1); // 預設至少間隔 1 人
            }
        } else {
            $('#gap-count-container').slideUp(200);
            $('#form-gap-count').val('');
        }
    });

    $('#form-placement-id, #form-sponsor-id, #form-node-nature').on('change', function () {
        updateFormAutoCalculatedFields();
    });
});

function initSelect2ScrollGuard() {
    // 監聽 Modal 內部滾動、瀏覽器視窗滾動與組織圖畫布滾動
    $(window).add('.modal, .modal-body, #org-chart-viewport-box').on('scroll', function (e) {
        // 若當前有開啟中的 Select2 選單，於滾動時立即關閉以防脫軌漂移
        if ($('.select2-container--open').length > 0) {
            $('select.select2-hidden-accessible').select2('close');
        }
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

// 動態填充現居地與家鄉之台馬兩國分類選單
function populateRegionDropdowns() {
    const filterRegion = $('#filter-current-residence');
    const formResidence = $('#form-current-residence');
    const formHometown = $('#form-hometown');

    const currentFilterVal = filterRegion.val() || '';

    filterRegion.empty().append('<option value="" selected>全部地區</option>');
    formResidence.empty().append('<option value="">請選擇或輸入居住地...</option>');
    formHometown.empty().append('<option value="">請選擇或輸入家鄉...</option>');

    // 1. 🇹🇼 台灣縣市群組
    let twGroup = $('<optgroup label="🇹🇼 台灣"></optgroup>');
    REGIONS_DATABASE.TW.forEach(reg => {
        twGroup.append(`<option value="${reg}">${reg}</option>`);
    });

    // 2. 🇲🇾 馬來西亞州區群組
    let myGroup = $('<optgroup label="🇲🇾 馬來西亞"></optgroup>');
    REGIONS_DATABASE.MY.forEach(reg => {
        myGroup.append(`<option value="${reg}">${reg}</option>`);
    });

    filterRegion.append(twGroup.clone()).append(myGroup.clone());
    formResidence.append(twGroup.clone()).append(myGroup.clone());
    formHometown.append(twGroup).append(myGroup);

    // 3. 動態掃描：若資料庫中存在預設清單之外的自訂現居地，自動建立「其他現有地區」分組
    const standardRegions = new Set([...REGIONS_DATABASE.TW, ...REGIONS_DATABASE.MY]);
    const customRegions = new Set();

    personMasterList.forEach(p => {
        const res = (p.current_residence || '').trim();
        if (res && !standardRegions.has(res)) {
            customRegions.add(res);
        }
    });

    if (customRegions.size > 0) {
        let customGroup = $('<optgroup label="📍 其他現有地區"></optgroup>');
        customRegions.forEach(reg => {
            customGroup.append(`<option value="${reg}">${reg}</option>`);
        });
        filterRegion.append(customGroup);
    }

    if (currentFilterVal) {
        filterRegion.val(currentFilterVal).trigger('change.select2');
    }
}

function populateLanguageFilterDropdown() {
    const $langSelect = $('#select-lang-filter');
    const currentSelected = $langSelect.val() || '中文';

    const defaultLanguages = ['中文', '英文', '馬來文', '台語', '粵語', '客家話', '日文', '韓文', '印尼文', '泰文', '越南文'];
    const allLanguagesSet = new Set(defaultLanguages);

    // 掃描資料庫中夥伴實際填寫的所有語言項目 (含自訂語言)
    if (Array.isArray(personLanguagesList)) {
        personLanguagesList.forEach(l => {
            const name = (l.language_name || '').trim();
            if (name) {
                allLanguagesSet.add(name);
            }
        });
    }

    $langSelect.empty();
    allLanguagesSet.forEach(lang => {
        $langSelect.append(`<option value="${lang}">${lang}</option>`);
    });

    // 恢復原選取項目，並觸發 Select2 介面刷新
    const targetLang = allLanguagesSet.has(currentSelected) ? currentSelected : '中文';
    $langSelect.val(targetLang);

    if ($.fn.select2 && $langSelect.hasClass('select2-hidden-accessible')) {
        $langSelect.trigger('change.select2');
    }
}

/**
 * 安全設置 Select2 (tags: true) 之值，若選項不存在則動態追加 Option
 * @param {string} selector jQuery 選擇器 (如 '#form-nationality')
 * @param {string} val 資料庫儲存之字串值
 * @param {string} defaultVal 預設值
 */
function setSelect2TagVal(selector, val, defaultVal = '') {
    const $el = $(selector);
    const targetVal = (val !== undefined && val !== null && String(val).trim() !== '') ? String(val).trim() : defaultVal;

    if (!targetVal) {
        $el.val('').trigger('change');
        return;
    }

    // 若目前的 <option> 清單中找不到該值，動態建立新 option 並選取
    if ($el.find(`option[value="${targetVal}"]`).length === 0) {
        const newOption = new Option(targetVal, targetVal, true, true);
        $el.append(newOption).trigger('change');
    } else {
        $el.val(targetVal).trigger('change');
    }
}

// 通用 Select2 自訂標籤配置產生器
function getSelect2TagsConfig(placeholderText) {
    return {
        dropdownParent: $('#partnerDetailModal'),
        width: '100%',
        tags: true, // 開啟自由鍵入模式
        placeholder: placeholderText,
        allowClear: true,
        createTag: function (params) {
            const term = $.trim(params.term);
            if (term === '') return null;
            return {
                id: term,
                text: term,
                newTag: true
            };
        },
        templateResult: function (data) {
            const $result = $('<span></span>');
            $result.text(data.text);
            if (data.newTag) {
                $result.append(' <em class="text-warning small">(新增自訂項目)</em>');
            }
            return $result;
        },
        language: {
            noResults: () => '鍵入文字後按 Enter 即可直接新增'
        }
    };
}

// 初始化所有 Select2 標籤下拉選單
function initSelect2Dropdowns() {
    if (!$.fn.select2) return;

    // 1. 夥伴搜尋與一般下拉
    $('.select2-partner-search').select2({
        dropdownParent: $('#partnerDetailModal'),
        width: '100%',
        placeholder: '請輸入關鍵字搜尋...',
        allowClear: true,
        language: { noResults: () => '找不到相符項目' }
    });

    // 2. 國籍與種族 Select2 Tags
    $('.select2-tags-single').each(function () {
        const ph = $(this).find('option:first').text() || '請選擇或輸入...';
        $(this).select2(getSelect2TagsConfig(ph));
    });

    // 3. 現居地與家鄉 Select2 Tags
    $('.select2-tags-region').each(function () {
        const ph = $(this).find('option:first').text() || '請選擇或輸入行政區...';
        $(this).select2(getSelect2TagsConfig(ph));
    });

    // 4. 分析語言 Select2 Tags
    $('#select-lang-filter').select2({
        width: '100%',
        dropdownAutoWidth: true,
        placeholder: '請選擇分析語言...',
        language: { noResults: () => '找不到相符語言' }
    }).off('change').on('change', function () {
        changeLanguageAnalysis($(this).val());
    });

    // 4. 頂部 HUD 過濾器
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

function initOrgChartPan() {
    const viewport = document.getElementById('org-chart-viewport-box');
    if (!viewport) return;

    let isDragging = false;
    let startX, startY, scrollLeft, scrollTop;

    viewport.addEventListener('mousedown', function (e) {
        if (e.target.closest('button, a, select, input, .select2-container')) return;
        isDragging = true;
        viewport.classList.add('is-dragging');
        startX = e.pageX - viewport.offsetLeft;
        startY = e.pageY - viewport.offsetTop;
        scrollLeft = viewport.scrollLeft;
        scrollTop = viewport.scrollTop;
    });

    viewport.addEventListener('mouseleave', function () {
        isDragging = false;
        viewport.classList.remove('is-dragging');
    });

    viewport.addEventListener('mouseup', function () {
        isDragging = false;
        viewport.classList.remove('is-dragging');
    });

    viewport.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - viewport.offsetLeft;
        const y = e.pageY - viewport.offsetTop;
        const walkX = (x - startX) * 1.3;
        const walkY = (y - startY) * 1.3;
        viewport.scrollLeft = scrollLeft - walkX;
        viewport.scrollTop = scrollTop - walkY;
    });
}

/**
 * 依據排線關係自動計算「組織關係 (relation_type)」與「團隊直轄 (is_our_team)」
 * @param {string} partnerId 當前夥伴識別碼
 * @param {string} placementId 安置上線 ID
 * @param {string} sponsorId 推薦人 ID
 * @param {string} nodeNature 節點性質
 * @returns {{relationType: string, isOurTeam: string}}
 */
function calculateRelationAndTeamStatus(partnerId, placementId, sponsorId, nodeNature = '常態夥伴') {
    // 1. 核心領導雙核判定
    const CORE_IDS = ['PTN-001', 'PTN-002'];
    if (CORE_IDS.includes(partnerId)) {
        return { relationType: '核心成員', isOurTeam: 'Y' };
    }

    // 2. 中繼層或虛擬佔位判定
    if (nodeNature === '中繼失聯節點' || nodeNature === '虛擬佔位' || nodeNature === '幽靈節點') {
        return { relationType: '中繼層', isOurTeam: 'N' };
    }

    // 3. 上線血緣追溯函式（向上搜尋特定目標祖先）
    const isAncestorOfCore = (targetId) => {
        let current = partnersList.find(p => p.partner_id === 'PTN-001');
        const visited = new Set();
        while (current && current.partner_id) {
            const pId = current.placement_id || current.sponsor_id;
            if (!pId || visited.has(pId)) break;
            if (pId === targetId) return true;
            visited.add(pId);
            current = partnersList.find(p => p.partner_id === pId || p.member_no === pId);
        }
        return false;
    };

    // 4. 下線血緣追溯函式（向上搜尋是否源於 Ray 或 Jarvis）
    const isDescendantOfCore = (parentId) => {
        let currentId = parentId;
        const visited = new Set();
        while (currentId && !visited.has(currentId)) {
            if (CORE_IDS.includes(currentId)) return true;
            visited.add(currentId);
            const parentNode = partnersList.find(p => p.partner_id === currentId || p.member_no === currentId);
            currentId = parentNode ? (parentNode.placement_id || parentNode.sponsor_id) : null;
        }
        return false;
    };

    // 5. 執行關係推導
    const parentId = placementId || sponsorId;

    if (isAncestorOfCore(partnerId)) {
        return { relationType: '上線', isOurTeam: 'N' };
    }

    if (isDescendantOfCore(parentId)) {
        return { relationType: '下線', isOurTeam: 'Y' };
    }

    return { relationType: '旁線', isOurTeam: 'N' };
}

/**
 * 監聽表單排線變更，即時自動更新並鎖定組織關係與團隊直轄
 */
function updateFormAutoCalculatedFields() {
    const partnerId = getFormTrimVal('#form-partner-id');
    const placementId = $('#form-placement-id').val();
    const sponsorId = $('#form-sponsor-id').val();
    const nodeNature = $('#form-node-nature').val();

    const result = calculateRelationAndTeamStatus(partnerId, placementId, sponsorId, nodeNature);

    $('#form-relation-type').val(result.relationType);
    $('#form-is-our-team').val(result.isOurTeam);
    
    // 更新視覺徽章提示
    $('#badge-calc-relation').text(result.relationType);
    $('#badge-calc-team').html(result.isOurTeam === 'Y' ? '<i class="fa-solid fa-star text-warning"></i> 直轄團隊' : '<i class="fa-solid fa-globe text-secondary"></i> 旁線/友軍');
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

        populateRegionDropdowns();
        populateLanguageFilterDropdown();
        populateSelect2Options();
        populateTreeRootDropdown();
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

/**
 * 渲染經營權模式標籤（共同經營 / 獨立經營）
 * @param {Object} partner 夥伴主檔物件
 * @returns {string} HTML 徽章字串
 */
function renderOperationModeBadge(partner) {
    if (!partner) return '';
    const spouseId = partner.spouse_partner_id || partner.official_account_partner_id;
    let coOpPartner = null;
    if (spouseId && typeof partnersList !== 'undefined') {
        coOpPartner = partnersList.find(x => x.partner_id === spouseId || x.member_no === spouseId);
    }
    const coOpName = coOpPartner ? getPartnerDisplayName(coOpPartner) : (spouseId || '');

    if (partner.operation_mode === '共同經營' || partner.account_holder_type === '共同經營者') {
        const nameText = coOpName ? `【${coOpName}】` : '';
        return `<span class="badge badge-info"><i class="fa-solid fa-user-group me-1"></i> 共同經營${nameText}</span>`;
    } else if (partner.operation_mode === '獨立經營') {
        const nameText = coOpName ? `【${coOpName}】` : '';
        return `<span class="badge badge-warning"><i class="fa-solid fa-user-shield me-1"></i> 獨立經營${nameText}</span>`;
    }
    return '';
}

/**
 * 渲染葡眾官方會員編號標籤
 * @param {Object} partner 夥伴主檔物件
 * @returns {string} HTML 字串
 */
function renderMemberNoBadge(partner) {
    if (!partner || !partner.member_no || String(partner.member_no).trim() === '') {
        return '';
    }
    return `<span class="text-secondary small font-monospace">${partner.member_no.trim()}</span>`;
}

function getRelationBadge(relation, partnerId = '') {
    if (partnerId === 'PTN-001' || partnerId === 'PTN-002' || relation === '核心成員') {
        return `<span class="badge badge-outline-purple"><i class="fa-solid fa-crown me-1"></i> 核心成員</span>`;
    }
    switch (relation) {
        case '上線': return `<span class="badge badge-outline-green">上線</span>`;
        case '旁線': return `<span class="badge badge-outline-orange">旁線</span>`;
        case '下線': return `<span class="badge badge-outline-blue">下線</span>`;
        case '中繼層': return `<span class="badge badge-outline-gray">中繼層</span>`;
        default: return `<span class="badge badge-outline-gray">未設定</span>`;
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

function getLanguageStatusBadge(status) {
    switch (status) {
        case '精通': return '<span class="badge badge-indigo-subtle">精通</span>';
        case '流利': return '<span class="badge badge-info-subtle">流利</span>';
        case '普通': return '<span class="badge badge-success-subtle">普通</span>';
        case '略懂': return '<span class="badge badge-warning-subtle">略懂</span>';
        case '不會': return '<span class="badge badge-danger-subtle">不會</span>';
        default: return '<span class="badge badge-muted-subtle">未設定</span>';
    }
}

/**
 * 取得人脈身分類型之戰術徽章 HTML
 * @param {string} type 身份類型 (夥伴 / 團隊成員 / 潛在團隊成員 / 客戶 / 潛在客戶)
 * @returns {string} 徽章 HTML
 */
function getIdentityTypeBadge(type) {
    switch (type) {
        case '夥伴': return '<span class="badge badge-orange">夥伴</span>';
        case '團隊成員': return '<span class="badge badge-blue">團隊成員</span>';
        case '潛在團隊成員': return '<span class="badge badge-blue-subtle">潛在團隊成員</span>';
        case '客戶': return '<span class="badge badge-green">客戶</span>';
        case '潛在客戶': return '<span class="badge badge-green-subtle">潛在客戶</span>';
        default: return '<span class="badge badge-muted-subtle">未設定</span>';
    }
}

/**
 * 取得使用身分類型之戰術徽章 HTML
 * @param {string} type 使用身分類型 (經營者 / 消費者)
 * @returns {string} 外框徽章 HTML
 */
function getUsageIdentityBadge(type) {
    switch (type) {
        case '經營者': return '<span class="badge badge-outline-blue">經營者</span>';
        case '消費者': return '<span class="badge badge-outline-green">消費者</span>';
        default: return '<span class="badge badge-outline-green">未設定</span>';
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

    // 1. 榮祥直轄團隊基礎篩選
    const teamPartners = list.filter(p => p.is_our_team === 'Y');
    
    // 2. 榮祥團隊大馬成員 (直轄 + MY)
    const myTeamPartners = teamPartners.filter(p => p.country_code === 'MY');
    
    // 3. 榮祥團隊活躍成員 (直轄 + 積極參與/參與)
    const activeTeamPartners = teamPartners.filter(p => p.activity_level === '積極參與' || p.activity_level === '參與');

    $('#hud-total-partners').text(list.length);
    $('#hud-team-partners').text(teamPartners.length);
    $('#hud-my-team-partners').text(myTeamPartners.length);
    $('#hud-active-team-partners').text(activeTeamPartners.length);

    renderCardsView(list);
    renderDataTableView(list);
    renderTreeView();

    // 延遲渲染圖表
    if (!$('#container-charts-view').hasClass('d-none')) {
        renderChartsView(list);
    }
}

// ============================================================================
// 6. 戰術視圖渲染 (Cards / Table / Batch)
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
        const cardBorderClass = (p.relation_type === '核心成員') ? 'is-core' : (p.relation_type === '旁線' ? 'is-cross' : '');
        const mentorName = getPartnerDisplayName(p.known_mentor_id);
        const dispName = getPartnerDisplayName(p);
        const memberNoHtml = renderMemberNoBadge(p);
        const opBadgeHtml = renderOperationModeBadge(p);

        // 實質輔導上線
        const mentorHtml = mentorName 
            ? `<span class="text-white">${mentorName}</span>` 
            : `<span class="text-muted">（無特定指派）</span>`;

        // 1. 性別 / 年齡 / 現居地組合解析 (未填以 text-muted 呈現)
        let ageStr = '';
        const rawBirthday = person.birthday ? String(person.birthday).trim() : '';
        if (rawBirthday.length >= 4) {
            const birthYear = parseInt(rawBirthday.slice(0, 4), 10);
            if (!isNaN(birthYear) && birthYear > 1900 && birthYear <= 2026) {
                ageStr = `${2026 - birthYear} 歲`;
            }
        }

        const genderDisplay = (person.gender && person.gender !== '未填') 
            ? person.gender 
            : '<span class="text-muted">未填性別</span>';

        const ageDisplay = ageStr 
            ? ageStr 
            : '<span class="text-muted">未填年齡</span>';

        const residenceDisplay = (person.current_residence && person.current_residence.trim()) 
            ? person.current_residence.trim() 
            : '<span class="text-muted">未填現居地</span>';

        const genderAgeResidenceHtml = `${genderDisplay} ‧ ${ageDisplay} ‧ ${residenceDisplay}`;

        // 專長標籤
        const skillsHtml = (p.team_skills && p.team_skills.trim()) 
            ? `<div class="mb-2"><span class="badge badge-dark"><i class="fa-solid fa-tags me-1"></i> ${p.team_skills}</span></div>` 
            : `<div class="mb-2"><span class="text-muted small"><i class="fa-solid fa-tags text-secondary me-1"></i> 未設定專長標籤</span></div>`;

        // 戰術備註
        const notesText = (p.team_notes && p.team_notes.trim()) || (person.financial_notes && person.financial_notes.trim()) || '';
        const notesHtml = notesText 
            ? `<p class="text-secondary small mb-0 text-truncate-2" style="font-size: 0.82rem;">${notesText}</p>` 
            : `<p class="text-muted small mb-0 font-italic" style="font-size: 0.82rem;">暫無戰術備註記錄</p>`;

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
                                        ${memberNoHtml || '<span class="text-muted small font-monospace">（無會員編號）</span>'}
                                        ${opBadgeHtml}
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
                                ${mentorHtml}
                            </div>
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-id-card-clip text-primary"></i> 性別/年齡/現居地</span>
                                <div class="text-end text-light small">${genderAgeResidenceHtml}</div>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="text-secondary"><i class="fa-solid fa-user-tag text-accent"></i> 身份 / 使用身份</span>
                                <div class="d-flex align-items-center gap-1">
                                    ${getIdentityTypeBadge(person.identity_type)}
                                    ${getUsageIdentityBadge(person.usage_identity)}
                                </div>
                            </div>
                        </div>

                        ${skillsHtml}
                        ${notesHtml}
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
        const memberNoHtml = renderMemberNoBadge(p);
        const opBadgeHtml = renderOperationModeBadge(p);

        const rowHtml = `
            <tr>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <img src="${avatarUrl}" class="rounded-circle border border-primary border-opacity-50 flex-shrink-0" width="32" height="32" onerror="this.src='${getDefaultAvatar(gender)}'">
                        <div class="overflow-hidden">
                            <div class="fw-bold text-white text-truncate">${dispName}</div>
                            <div class="d-flex align-items-center gap-1">
                                ${memberNoHtml}
                                ${opBadgeHtml}
                            </div>
                        </div>
                    </div>
                </td>
                <td class="text-center">${getCountryBadge(p.country_code)}</td>
                <td>${buildRankBadge(currentRank)}</td>
                <td>${buildRankBadge(highestRank)}</td>
                <td><span class="text-white">${mentorName || '—'}</span></td>
                <td><span class="text-light">${person.current_residence || '—'}</span></td>
                <td><span class="text-light">${person.highest_education || '—'}</span></td>
                <td><span class="text-light">${person.occupation_background || '—'}</span></td>
                <td class="text-center">${getHealthStatusBadge(person.health_status)}</td>
                <td class="text-center">${getFinancialStatusBadge(person.financial_status)}</td>
                <td class="text-center">${getRelationBadge(p.relation_type, p.partner_id)}</td>
                <td class="text-center">${getActivityLevelBadge(p.activity_level)}</td>
                <td class="text-center">${getMemberStatusBadge(p.member_status)}</td>
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
        columnDefs: [
            { targets: [1, 8, 9, 10, 11, 12], className: 'text-center' },
            { targets: [13], className: 'text-end', orderable: false }
        ]
    });

    // 初始化完成後立即校準一次欄位寬度
    setTimeout(() => {
        if (dataTableInstance) {
            dataTableInstance.columns.adjust();
        }
    }, 50);
}

// ============================================================================
// 7. 組織拓撲結構圖重構引擎 (Tree View: 三軌/多樹森林/斷層/幾何對齊)
// ============================================================================
function initOrgTreeControls() {
    $('input[name="treeLineMode"]').on('change', function () {
        currentTreeLineMode = $(this).val();
        populateTreeRootDropdown();
        renderTreeView();
    });

    $('#select-tree-root').on('change', function () {
        selectedTreeRootId = $(this).val();
        renderTreeView();
    });

    if ($.fn.select2) {
        $('#select-tree-root').select2({
            width: '100%',
            dropdownAutoWidth: true,
            language: { noResults: () => '找不到相符成員' }
        });
    }
}

function populateTreeRootDropdown() {
    const $select = $('#select-tree-root').empty();

    // 1. 釘選前 5 個選項（符號置後、不顯示 partner_id）
    const pinnedOptions = [
        { id: 'ALL', text: '全部人員 🌐' },
        { id: 'TEAM_MEMBERS', text: '團隊成員 ⭐️' }
    ];

    // 找出三位指定領導人
    const ray = partnersList.find(p => p.person_id === 'PSN-TW-001' || getPartnerDisplayName(p).includes('翁榮祥'));
    const jarvis = partnersList.find(p => p.person_id === 'PSN-TW-002' || getPartnerDisplayName(p).includes('林承志'));
    const weimin = partnersList.find(p => getPartnerDisplayName(p).includes('陳偉民'));

    if (ray) pinnedOptions.push({ id: ray.partner_id, text: `${getPartnerDisplayName(ray)} [${getRankInfo(ray.highest_rank_id).rank_name_zh}] ⭐️` });
    if (jarvis) pinnedOptions.push({ id: jarvis.partner_id, text: `${getPartnerDisplayName(jarvis)} [${getRankInfo(jarvis.highest_rank_id).rank_name_zh}] ⭐️` });
    if (weimin) pinnedOptions.push({ id: weimin.partner_id, text: `${getPartnerDisplayName(weimin)} [${getRankInfo(weimin.highest_rank_id).rank_name_zh}]` });

    pinnedOptions.forEach(opt => {
        $select.append(`<option value="${opt.id}">${opt.text}</option>`);
    });

    // 2. 排除已釘選者，其餘依中文姓名字母排序 (localeCompare)
    const pinnedIds = new Set(pinnedOptions.map(o => o.id));
    const others = partnersList.filter(p => !pinnedIds.has(p.partner_id) && p.account_holder_type !== '共同經營者');

    others.sort((a, b) => {
        const nameA = getPartnerDisplayName(a);
        const nameB = getPartnerDisplayName(b);
        return nameA.localeCompare(nameB, 'zh-TW');
    });

    others.forEach(p => {
        const dispName = getPartnerDisplayName(p);
        const rank = getRankInfo(p.highest_rank_id);
        const isCoreSuffix = (p.is_our_team === 'Y') ? ' ⭐️' : '';
        $select.append(`<option value="${p.partner_id}">${dispName} [${rank.rank_name_zh}]${isCoreSuffix}</option>`);
    });

    if (selectedTreeRootId) {
        $select.val(selectedTreeRootId).trigger('change.select2');
    }
}

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

        // 問題 4：下載 PNG 時隱藏所有查看按鈕
        $('.org-card-view-btn').hide();

        const prevTransform = targetEl.style.transform;
        targetEl.style.transform = 'none';

        const canvas = await html2canvas(targetEl, {
            backgroundColor: '#0a0618',
            scale: 2,
            useCORS: true,
            logging: false
        });

        targetEl.style.transform = prevTransform;
        $('.org-card-view-btn').show();

        const link = document.createElement('a');
        link.download = `RayTeam_組織拓撲圖_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        AppToast.success('組織拓撲圖 PNG 檔案已順利下載！');
    } catch (err) {
        $('.org-card-view-btn').show();
        AppToast.error('匯出圖片失敗：' + err.message);
    } finally {
        AppLoading.hide();
    }
};

function getPartnerParentIdByMode(partner, mode) {
    if (!partner) return '';
    if (mode === 'placement') {
        return partner.placement_id || partner.sponsor_id || '';
    } else if (mode === 'sponsor') {
        return partner.sponsor_id || '';
    } else if (mode === 'mentor') {
        return partner.known_mentor_id || '';
    }
    return '';
}

function getNodeBorderClass(partner) {
    if (partner.partner_id === 'PTN-001' || partner.partner_id === 'PTN-002' || partner.relation_type === '核心成員') {
        return 'border-purple';
    }
    if (partner.relation_type === '中繼層') return 'border-gray';
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
        <div class="org-couple-col">
            <div class="d-flex align-items-center gap-2 mb-2">
                <div class="partner-avatar-wrap" style="width: 38px; height: 38px; flex-shrink: 0;">
                    <img src="${avatarUrl}" class="rounded-circle border border-primary" width="38" height="38" onerror="this.src='${getDefaultAvatar(gender)}'">
                </div>
                <div class="overflow-hidden flex-grow-1">
                    <div class="fw-bold text-white text-truncate">${dispName}${memberNoText}</div>
                    <div class="d-flex justify-content-between align-items-center mt-1">
                        <div class="d-flex gap-1 align-items-center">
                            ${getCountryBadge(partner.country_code)}
                            ${getRelationBadge(partner.relation_type, partner.partner_id)}
                        </div>
                        <button type="button" class="org-card-view-btn" onclick="openPartnerModalForView('${partner.partner_id}')" title="查看檔案">
                            <i class="fa-solid fa-magnifying-glass"></i>
                        </button>
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

function getRelationGapInfo(parentPartner, childPartner) {
    if (!parentPartner || !childPartner) return { isUnknown: false, gapCount: 0 };

    // 檢查閉包表精確記錄
    const directRel = orgRelationsList.find(r =>
        r.ancestor_id === parentPartner.partner_id &&
        r.descendant_id === childPartner.partner_id
    );

    let isUnknown = childPartner.upline_link_type === '中間未知' ||
                    childPartner.upline_link_type === '未知斷層直連';
    let gapCount = 0;

    if (directRel) {
        if (directRel.is_depth_exact === 'N' || directRel.is_depth_exact === '否' || directRel.link_nature === '未知斷層直連') {
            isUnknown = true;
        }
        if (directRel.depth > 1) {
            gapCount = directRel.depth - 1;
        }
    }

    return { isUnknown, gapCount };
}

function renderTreeView() {
    const $container = $('#org-chart-container').empty();
    if (!partnersList || partnersList.length === 0) {
        $container.html('<div class="text-muted text-center py-5"><i class="fa-solid fa-users-slash fa-2x mb-2"></i><br>暫無組織夥伴資料</div>');
        return;
    }

    const filteredMatches = getFilteredPartners();
    const matchedPartnerIds = new Set(filteredMatches.map(p => p.partner_id));
    const isFilterActive = filteredMatches.length < partnersList.length;
    const renderedPartnerIds = new Set();

    function getChildren(partner, spouse) {
        const pIds = [partner.partner_id, partner.member_no].filter(Boolean);
        if (spouse) {
            pIds.push(spouse.partner_id, spouse.member_no);
        }

        return partnersList.filter(child => {
            if (renderedPartnerIds.has(child.partner_id)) return false;
            if (child.partner_id === partner.partner_id || (spouse && child.partner_id === spouse.partner_id)) return false;

            const childParentId = getPartnerParentIdByMode(child, currentTreeLineMode);
            return pIds.includes(childParentId);
        });
    }

    // 遞迴建構組織樹狀節點
    function buildNodeHtml(partner, parentPartner = null) {
        if (renderedPartnerIds.has(partner.partner_id)) return '';
        renderedPartnerIds.add(partner.partner_id);

        const spouseId = partner.spouse_partner_id;
        const spouse = spouseId ? partnersList.find(x => x.partner_id === spouseId || x.member_no === spouseId) : null;
        const isCoOp = spouse && (partner.operation_mode === '共同經營' || partner.account_holder_type === '共同經營者' || spouse.operation_mode === '共同經營' || spouse.account_holder_type === '共同經營者');

        if (isCoOp && spouse) {
            renderedPartnerIds.add(spouse.partner_id);
        }

        // 篩選高亮與活動度判定
        const isSelfMatched = matchedPartnerIds.has(partner.partner_id) || (spouse && matchedPartnerIds.has(spouse.partner_id));
        const matchClass = isFilterActive ? (isSelfMatched ? 'tree-node-matched' : 'tree-node-dimmed') : '';
        const inactiveLevels = ['自用消費', '操作人頭', '失聯', '個資未知'];
        const isInactive = inactiveLevels.includes(partner.activity_level) || (spouse && inactiveLevels.includes(spouse.activity_level));
        const activityClass = isInactive ? 'node-activity-muted' : '';

        let cardHtml = '';
        if (isCoOp && spouse) {
            cardHtml = `
                <div class="org-node-card org-couple-card ${getNodeBorderClass(partner)} ${matchClass} ${activityClass}">
                    ${renderPartnerSubColumnHtml(partner, false)}
                    <div class="org-couple-divider"></div>
                    ${renderPartnerSubColumnHtml(spouse, true)}
                </div>
            `;
        } else {
            cardHtml = `
                <div class="org-node-card ${getNodeBorderClass(partner)} ${matchClass} ${activityClass}">
                    ${renderPartnerSubColumnHtml(partner, false)}
                </div>
            `;
        }

        // 判定與父節點之斷層關係（根節點時 parentPartner 為 null）
        const gapInfo = parentPartner ? getRelationGapInfo(parentPartner, partner) : { isUnknown: false, gapCount: 0 };
        const liClass = gapInfo.isUnknown ? 'class="link-unknown"' : 'class="link-direct"';
        const gapBadgeHtml = (gapInfo.isUnknown && gapInfo.gapCount > 0)
            ? `<div class="org-gap-badge"><i class="fa-solid fa-arrows-split-up-and-left"></i> 間隔 ${gapInfo.gapCount} 人・中繼斷層</div>`
            : (gapInfo.isUnknown ? `<div class="org-gap-badge"><i class="fa-solid fa-ellipsis"></i> 中間未知斷層</div>` : '');

        const children = getChildren(partner, isCoOp ? spouse : null);

        let branchHtml = `
            <li ${liClass}>
                ${gapBadgeHtml}
                <div class="org-node-wrapper">
                    ${cardHtml}
                </div>
        `;

        if (children.length > 0) {
            // 檢查該節點往下的所有子分支是否全為未知斷層
            const childGapInfos = children.map(c => getRelationGapInfo(partner, c));
            const allChildrenUnknown = childGapInfos.every(info => info.isUnknown);
            const ulTrunkClass = allChildrenUnknown ? 'trunk-dashed' : 'trunk-solid';

            branchHtml += `<ul class="${ulTrunkClass}">`;
            children.forEach(child => {
                branchHtml += buildNodeHtml(child, partner);
            });
            branchHtml += `</ul>`;
        }

        branchHtml += `</li>`;
        return branchHtml;
    }

    let targetRootPartners = [];

    if (selectedTreeRootId === 'TEAM_MEMBERS') {
        // 釘選 2：團隊成員 (以 Ray 翁榮祥直轄體系為根)
        const rayNode = partnersList.find(p => p.person_id === 'PSN-TW-001' || getPartnerDisplayName(p).includes('翁榮祥'));
        if (rayNode) targetRootPartners = [rayNode];
    } else if (selectedTreeRootId && selectedTreeRootId !== 'ALL') {
        // 指定單一夥伴
        const customRoot = partnersList.find(p => p.partner_id === selectedTreeRootId);
        if (customRoot) targetRootPartners = [customRoot];
    } else {
        // 全域多樹森林 (全部頂層)
        targetRootPartners = partnersList.filter(p => {
            const parentId = getPartnerParentIdByMode(p, currentTreeLineMode);
            if (p.account_holder_type === '共同經營者') return false;
            if (!parentId || parentId === 'ROOT' || parentId === 'SYSTEM_ROOT' || parentId === '(未知)' || parentId === '未知') return true;
            return !partnersList.some(x => x.partner_id === parentId || x.member_no === parentId);
        });
    }

    if (targetRootPartners.length === 0 && partnersList.length > 0) {
        targetRootPartners = [partnersList[0]];
    }

    const $forest = $('<div class="org-forest-container"></div>');

    targetRootPartners.forEach(rootPartner => {
        if (!renderedPartnerIds.has(rootPartner.partner_id)) {
            const $treeBlock = $('<div class="org-tree-block"></div>');
            const $treeUl = $('<ul class="org-tree"></ul>');
            $treeUl.append(buildNodeHtml(rootPartner, null));
            $treeBlock.append($treeUl);
            $forest.append($treeBlock);
        }
    });

    $container.append($forest);
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

// ============================================================================
// 通用動態圖表資料聚合工具 (僅保留「現有資料 + 未設定」，無數據項目不產生)
// ============================================================================
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

    // 排序：有資料的項目依人數由大至小排列
    const sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = sortedEntries.map(e => e[0]);
    const data = sortedEntries.map(e => e[1]);

    // 戰術調色盤 (高飽和度紫藍琥珀青色系)
    const basePalette = [
        '#8b5cf6', '#38bdf8', '#10b981', '#fbbf24', '#f43f5e', 
        '#a855f7', '#06b6d4', '#f97316', '#ec4899', '#34d399', 
        '#6366f1', '#eab308', '#14b8a6', '#f472b6'
    ];
    const colors = labels.map((_, idx) => basePalette[idx % basePalette.length]);

    // 若存在「未設定」，追加至末尾並配置低對比暗灰色
    if (unsetCount > 0) {
        labels.push('未設定');
        data.push(unsetCount);
        colors.push('#64748b');
    }

    return { labels, data, colors };
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

    // 3. 年齡分佈
    const ageCategories = ['17歲以下', '18-29歲', '30-39歲', '40-49歲', '50-59歲', '60-69歲', '70-79歲', '80歲以上'];
    const ageCounts = {};
    ageCategories.forEach(c => { ageCounts[c] = 0; });
    dataset.forEach(p => {
        const person = getPersonMaster(p.person_id);
        const bStr = person.birthday ? String(person.birthday).trim() : '';
        if (bStr.length >= 4) {
            const birthYear = parseInt(bStr.slice(0, 4), 10);
            if (!isNaN(birthYear) && birthYear > 1900 && birthYear <= 2026) {
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

    // 5. 國籍
    const natSummary = createExactCountMap(dataset, p => {
        const person = getPersonMaster(p.person_id);
        let n = (person.nationality || '').trim();
        if (n === '台灣' || n === 'TW') n = '中華民國';
        return n;
    });

    const ctxNat = document.getElementById('chart-nationality-split');
    if (ctxNat && natSummary.labels.length > 0) {
        chartInstances.nationality = new Chart(ctxNat, {
            type: 'pie',
            data: {
                labels: natSummary.labels,
                datasets: [{
                    data: natSummary.data,
                    backgroundColor: natSummary.colors,
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 6. 種族
    const ethSummary = createExactCountMap(dataset, p => {
        const person = getPersonMaster(p.person_id);
        return (person.ethnicity || '').trim();
    });

    const ctxEth = document.getElementById('chart-ethnicity-split');
    if (ctxEth && ethSummary.labels.length > 0) {
        chartInstances.ethnicity = new Chart(ctxEth, {
            type: 'pie',
            data: {
                labels: ethSummary.labels,
                datasets: [{
                    data: ethSummary.data,
                    backgroundColor: ethSummary.colors,
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 7. 家鄉城市
    const homeSummary = createExactCountMap(dataset, p => {
        const person = getPersonMaster(p.person_id);
        return (person.hometown || '').trim();
    });

    const ctxHome = document.getElementById('chart-hometown-split');
    if (ctxHome && homeSummary.labels.length > 0) {
        chartInstances.hometown = new Chart(ctxHome, {
            type: 'pie',
            data: {
                labels: homeSummary.labels,
                datasets: [{
                    data: homeSummary.data,
                    backgroundColor: homeSummary.colors,
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 8. 現居地
    const resSummary = createExactCountMap(dataset, p => {
        const person = getPersonMaster(p.person_id);
        return (person.current_residence || '').trim();
    });

    const ctxRes = document.getElementById('chart-residence-split');
    if (ctxRes && resSummary.labels.length > 0) {
        chartInstances.residence = new Chart(ctxRes, {
            type: 'pie',
            data: {
                labels: resSummary.labels,
                datasets: [{
                    data: resSummary.data,
                    backgroundColor: resSummary.colors,
                    borderWidth: 0
                }]
            },
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

    // 12. 財務狀況
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
    const defaultPlatforms = ['LINE', 'WhatsApp', 'Discord', 'WeChat', 'Facebook', 'Instagram', 'Telegram', '其他'];
    const currentPlatform = contact.platform_name || 'LINE';
    const categories = ['ID', '顯示名稱', '連結'];

    const allPlatforms = defaultPlatforms.includes(currentPlatform) 
        ? defaultPlatforms 
        : [currentPlatform, ...defaultPlatforms];

    const platformOptions = allPlatforms.map(p => `<option value="${p}" ${p === currentPlatform ? 'selected' : ''}>${p}</option>`).join('');
    const categoryOptions = categories.map(c => `<option value="${c}" ${c === (contact.category || 'ID') ? 'selected' : ''}>${c}</option>`).join('');

    const $row = $(`
        <tr class="dynamic-contact-row" draggable="true">
            <td class="text-center align-middle" style="width: 40px;">
                <div class="row-drag-handle" title="拖曳排序"><i class="fa-solid fa-grip-vertical"></i></div>
            </td>
            <td style="width: 22%;">
                <select class="form-select form-select-sm contact-input-platform select2-dynamic-platform">${platformOptions}</select>
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
    $row.find('.select2-dynamic-platform').select2(getSelect2TagsConfig('平台...'));
};

window.addLanguageTableRow = function (lang = {}) {
    const $tbody = $('#form-languages-dynamic-tbody');
    const defaultLanguages = ['中文', '英文', '馬來文', '台語', '粵語', '客家話', '日文', '韓文', '泰文', '印尼文', '越南文', '其他'];
    const currentLang = lang.language_name || '中文';
    const levels = ['精通', '流利', '普通', '略懂', '不會'];

    const allLanguages = defaultLanguages.includes(currentLang) 
        ? defaultLanguages 
        : [currentLang, ...defaultLanguages];

    const langOptions = allLanguages.map(l => `<option value="${l}" ${l === currentLang ? 'selected' : ''}>${l}</option>`).join('');
    const buildLevelOptions = (selectedVal) => levels.map(lv => `<option value="${lv}" ${lv === (selectedVal || '普通') ? 'selected' : ''}>${lv}</option>`).join('');

    const $row = $(`
        <tr class="dynamic-lang-row" draggable="true">
            <td class="text-center align-middle" style="width: 40px;">
                <div class="row-drag-handle" title="拖曳排序"><i class="fa-solid fa-grip-vertical"></i></div>
            </td>
            <td style="width: 20%;">
                <select class="form-select form-select-sm lang-input-name select2-dynamic-lang">${langOptions}</select>
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
    $row.find('.select2-dynamic-lang').select2(getSelect2TagsConfig('語言...'));
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

    // 新增時啟用職級設定
    $('#form-current-rank-id, #form-highest-rank-id')
        .prop('disabled', false)
        .removeClass('bg-black bg-opacity-40 text-muted border-secondary');
    $('#badge-rank-lock-cur, #badge-rank-lock-high').hide();

    setSelect2TagVal('#form-nationality', '中華民國');
    setSelect2TagVal('#form-ethnicity', '華人');
    setSelect2TagVal('#form-current-residence', '');
    setSelect2TagVal('#form-hometown', '');

    $('#form-contacts-dynamic-tbody').empty();
    $('#form-languages-dynamic-tbody').empty();

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

    // 編輯時鎖定職級下拉選單，防止手動篡改
    $('#form-current-rank-id, #form-highest-rank-id')
        .prop('disabled', true)
        .addClass('bg-black bg-opacity-40 text-muted border-secondary');
    $('#badge-rank-lock-cur, #badge-rank-lock-high').show();

    $('#form-name-zh').val(person.name_zh || '');
    $('#form-name-en').val(person.name_en || '');
    $('#form-preferred-name').val(person.preferred_name || '');
    $('#form-display-name').val(person.display_name || '');
    $('#form-identity-type').val(person.identity_type || '夥伴');
    $('#form-usage-identity').val(person.usage_identity || '消費者');
    $('#form-gender').val(person.gender || '男');
    $('#form-birthday').val(person.birthday || '');

    let natVal = person.nationality || '中華民國';
    if (natVal === '台灣' || natVal === 'TW') natVal = '中華民國';
    setSelect2TagVal('#form-nationality', natVal);
    setSelect2TagVal('#form-ethnicity', person.ethnicity || '華人');
    setSelect2TagVal('#form-current-residence', person.current_residence || '');
    setSelect2TagVal('#form-hometown', person.hometown || '');

    $('#form-health-status').val(person.health_status || '良好');
    $('#form-financial-status').val(person.financial_status || '穩定');
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
    contacts.forEach(c => addContactTableRow(c));

    const $langTbody = $('#form-languages-dynamic-tbody').empty();
    const langs = personLanguagesList.filter(l => l.person_id === person.person_id);
    langs.forEach(l => addLanguageTableRow(l));

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
    $('#view-operation-badge').html(renderOperationModeBadge(partner));
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
    const rawBirthday = person.birthday ? String(person.birthday).trim() : '';

    if (rawBirthday.length >= 4) {
        const birthYear = parseInt(rawBirthday.slice(0, 4), 10);
        if (!isNaN(birthYear) && birthYear > 1900 && birthYear <= 2026) {
            const currentYear = 2026;
            const calculatedAge = currentYear - birthYear;
            ageStr = ` (${calculatedAge} 歲)`;
        }
    }

    const bDayText = rawBirthday ? `${rawBirthday}${ageStr}` : '未填生日';
    $('#view-gender-birthday-age').html(`${formatEmpty(gender)} ‧ ${formatEmpty(bDayText)}`);
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
                    <div class="d-flex gap-2">
                        <strong class="text-white">${l.language_name}</strong>
                        ${l.notes ? `<span class="text-muted" style="font-size: 0.72rem;">${l.notes}</span>` : ''}
                        <span class="text-secondary">聽: ${getLanguageStatusBadge(l.listening_level)}</span>
                        <span class="text-secondary">說: ${getLanguageStatusBadge(l.listening_level)}</span>
                        <span class="text-secondary">讀: ${getLanguageStatusBadge(l.listening_level)}</span>
                        <span class="text-secondary">寫: ${getLanguageStatusBadge(l.listening_level)}</span>
                    </div>
                </div>
            `);
        });
    } else {
        $langsWrap.append('<span class="text-muted small">無語言評級紀錄</span>');
    }

    // 6. 學歷背景與團隊專長
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

/**
 * 取得表單欄位字串值並去除前後空白
 * @param {string} selector jQuery 選擇器
 * @param {string} defaultVal 預設值
 * @returns {string} 處理後之字串
 */
function getFormTrimVal(selector, defaultVal = '') {
    const val = $(selector).val();
    return (val !== undefined && val !== null) ? String(val).trim() : defaultVal;
}

/**
 * 組織關係表 (org_relations) 自動化 CRUD 核心函式（修復主鍵污染問題）
 * @param {string} descendantId 當前儲存的夥伴 ID
 * @param {string} ancestorId 上線安置人/引薦人 ID
 * @param {string} linkType 上線連結模式 ('直屬已知' | '已知人數斷層' | '中間未知' | '體系頂層')
 * @param {number|string} gapCount 中間間隔人數 (若為直屬則為 0，未知則為 0)
 * @param {string} relationLine 血緣線路型態 ('安置排線' | '推薦線')
 * @param {string} currentUser 操作人員
 * @param {string} nowStr 格式化時間戳記
 */
async function syncOrgRelationsRecord(descendantId, ancestorId, linkType, gapCount, relationLine, currentUser, nowStr) {
    if (!descendantId) return;

    // 取得下一個自增流水號 ID (保持數值型態)
    const getNextAutoIncrementId = () => {
        if (!orgRelationsList || orgRelationsList.length === 0) return 1;
        const validIds = orgRelationsList
            .map(r => parseInt(String(r.id).replace(/\D/g, ''), 10))
            .filter(n => !isNaN(n));
        return validIds.length > 0 ? Math.max(...validIds) + 1 : 1;
    };

    // 1. 體系頂層（無上線）：建立/維護自身對自身閉包 (depth = 0)
    if (!ancestorId || ancestorId === 'ROOT' || ancestorId === 'SYSTEM_ROOT' || linkType === '體系頂層') {
        const existingSelf = orgRelationsList.find(r => 
            r.ancestor_id === descendantId && r.descendant_id === descendantId
        );

        const targetId = existingSelf ? existingSelf.id : String(getNextAutoIncrementId());
        const createdBy = existingSelf ? existingSelf.created_by : currentUser;
        const createdAt = existingSelf ? existingSelf.created_at : nowStr;

        const selfRelationRow = [
            targetId,               // 0: id (保持數值流水號主鍵)
            descendantId,           // 1: ancestor_id
            descendantId,           // 2: descendant_id
            0,                      // 3: depth
            'Y',                    // 4: is_depth_exact
            '精確血緣',             // 5: link_nature
            relationLine || '安置排線', // 6: relation_line
            descendantId,           // 7: path_trace
            createdBy,              // 8: created_by
            createdAt,              // 9: created_at
            currentUser,            // 10: modified_by
            nowStr                  // 11: modified_at
        ];

        if (existingSelf) {
            await SheetAdapter.updateRow('組織關係', targetId, selfRelationRow);
        } else {
            await SheetAdapter.createRow('組織關係', targetId, selfRelationRow);
        }
        return;
    }

    // 2. 計算斷層屬性、深度與路徑軌跡
    let depth = 1;
    let isDepthExact = 'Y';
    let linkNature = '精確血緣';
    let pathTrace = `${ancestorId}/${descendantId}`;

    const numGaps = parseInt(gapCount, 10) || 0;

    if (linkType === '已知人數斷層' && numGaps > 0) {
        depth = numGaps + 1; // 公式：depth = 間隔人數 + 1
        isDepthExact = 'Y';
        linkNature = '已知人數斷層';
        pathTrace = `${ancestorId}/GAP_${numGaps}/${descendantId}`;
    } else if (linkType === '中間未知' || linkType === '未知斷層直連') {
        depth = 1;
        isDepthExact = 'N';
        linkNature = '未知斷層直連';
        pathTrace = `${ancestorId}/UNKNOWN_GAP/${descendantId}`;
    } else {
        // 直屬已知 (間隔 0 人)
        depth = 1;
        isDepthExact = 'Y';
        linkNature = '精確血緣';
        pathTrace = `${ancestorId}/${descendantId}`;
    }

    // 3. 尋找既有關聯列（以 descendant_id 與 relation_line 為依歸）
    const existingRel = orgRelationsList.find(r => 
        r.descendant_id === descendantId && 
        (r.relation_line === relationLine || !r.relation_line || r.relation_line === '安置排線')
    );

    // 嚴格維持原本的數值主鍵 ID，若為新建則派發下一個整數流水號
    const targetId = existingRel ? existingRel.id : String(getNextAutoIncrementId());
    const createdBy = existingRel ? existingRel.created_by : currentUser;
    const createdAt = existingRel ? existingRel.created_at : nowStr;

    // 4. 組裝符合 04_組織 - 組織關係 12 欄位 Schema 的資料列
    const relationRowArray = [
        targetId,                   // 0: id (BIGINT 主鍵流水號，絕不寫入 REL- 字串)
        ancestorId,                 // 1: ancestor_id
        descendantId,               // 2: descendant_id
        depth,                      // 3: depth (INT)
        isDepthExact,               // 4: is_depth_exact (Y/N)
        linkNature,                 // 5: link_nature
        relationLine || '安置排線', // 6: relation_line
        pathTrace,                  // 7: path_trace (拓撲路徑字串)
        createdBy,                  // 8: created_by
        createdAt,                  // 9: created_at
        currentUser,                // 10: modified_by
        nowStr                      // 11: modified_at
    ];

    // 5. 執行 Google 試算表寫入
    if (existingRel) {
        await SheetAdapter.updateRow('組織關係', targetId, relationRowArray);
    } else {
        await SheetAdapter.createRow('組織關係', targetId, relationRowArray);
    }
}

/**
 * 正規化出生年月日輸入值（支援 YYYY 或 YYYY/MM/DD）
 * @param {string} val 輸入字串
 * @returns {string} 標準化後的日期字串
 */
function normalizeBirthdayInput(val) {
    if (!val || typeof val !== 'string') return '';
    const cleaned = val.trim();
    if (!cleaned) return '';

    // 模式 1：僅輸入 4 碼年份（如 1988）
    if (/^\d{4}$/.test(cleaned)) {
        return cleaned;
    }

    // 模式 2：完整年月日（支援 1988/6/5、1988-06-15 等形式，統整為 YYYY/MM/DD）
    const parts = cleaned.split(/[\/-]/);
    if (parts.length === 3) {
        const year = parts[0].padStart(4, '0');
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        return `${year}/${month}/${day}`;
    }

    return cleaned;
}

/**
 * 儲存夥伴 360° 全能戰術檔案
 * 完整連動「個人主檔」、「夥伴主檔」、「通訊資料」、「使用語言」、「組織關係」五張實體表
 * @param {Event} e 表單提交事件
 */
/**
 * 儲存夥伴 360° 全能戰術檔案（高效能並行寫入 + 樂觀更新版）
 * 完整連動「個人主檔」、「夥伴主檔」、「通訊資料」、「使用語言」、「組織關係」五張實體表
 * @param {Event} e 表單提交事件
 */
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

    // 1. 封裝「個人主檔」資料列 (32 欄位)
    const personRowArray = [
        personId,
        getFormTrimVal('#form-name-zh'),
        getFormTrimVal('#form-name-en'),
        getFormTrimVal('#form-preferred-name'),
        getFormTrimVal('#form-display-name'),
        getFormTrimVal('#form-identity-type', '潛在客戶'),
        getFormTrimVal('#form-usage-identity', '消費者'),
        getFormTrimVal('#form-gender', '未填'),
        normalizeBirthdayInput(getFormTrimVal('#form-birthday')),
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

    // 2. 封裝「夥伴主檔」資料列 (33 欄位)
    const accountHolderType = getFormTrimVal('#form-account-holder-type', '個人經營者');
    const officialAccountPartnerId = (accountHolderType === '共同經營者')
        ? getFormTrimVal('#form-spouse-partner-id')
        : partnerId;
    const currentRankVal = (mode === 'UPDATE' && existingPartner) 
        ? existingPartner.current_rank_id 
        : getFormTrimVal('#form-current-rank-id');

    const highestRankVal = (mode === 'UPDATE' && existingPartner) 
        ? existingPartner.highest_rank_id 
        : getFormTrimVal('#form-highest-rank-id');

    const partnerRowArray = [
        partnerId,
        personId,
        getFormTrimVal('#form-member-no'),
        getFormTrimVal('#form-leader-title'),
        accountHolderType,
        officialAccountPartnerId,
        getFormTrimVal('#form-operation-mode', '個人經營'),
        getFormTrimVal('#form-spouse-partner-id'),
        getFormTrimVal('#form-node-nature', '常態夥伴'),
        getFormTrimVal('#form-sponsor-id'),
        getFormTrimVal('#form-placement-id'),
        getFormTrimVal('#form-known-mentor-id'),
        getFormTrimVal('#form-upline-link-type', '直屬已知'),
        currentRankVal,
        highestRankVal,
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

    // 3. 收集動態通訊資料列 (11 欄位)
    const contactRows = [];
    const newContactsObjects = [];
    $('#form-contacts-dynamic-tbody tr.dynamic-contact-row').each(function (idx) {
        const val = $(this).find('.contact-input-value').val().trim();
        if (val) {
            const contactId = `${personId}-C${idx + 1}`;
            const platform = $(this).find('.contact-input-platform').val();
            const category = $(this).find('.contact-input-category').val();
            const isPrimary = $(this).find('.contact-input-primary').val();
            const notes = $(this).find('.contact-input-notes').val().trim();

            contactRows.push([
                contactId,
                personId,
                platform,
                category,
                val,
                isPrimary,
                notes,
                currentUser,
                nowStr,
                currentUser,
                nowStr
            ]);

            newContactsObjects.push({
                contact_id: contactId,
                person_id: personId,
                platform_name: platform,
                category: category,
                contact_value: val,
                is_primary: isPrimary,
                notes: notes,
                created_by: currentUser,
                created_at: nowStr,
                modified_by: currentUser,
                modified_at: nowStr
            });
        }
    });

    // 4. 收集動態語言矩陣資料列 (12 欄位)
    const languageRows = [];
    const newLanguagesObjects = [];
    $('#form-languages-dynamic-tbody tr.dynamic-lang-row').each(function (idx) {
        const langName = $(this).find('.lang-input-name').val();
        if (langName) {
            const langId = `${personId}-L${idx + 1}`;
            const listening = $(this).find('.lang-input-listening').val();
            const speaking = $(this).find('.lang-input-speaking').val();
            const reading = $(this).find('.lang-input-reading').val();
            const writing = $(this).find('.lang-input-writing').val();
            const notes = $(this).find('.lang-input-notes').val().trim();

            languageRows.push([
                langId,
                personId,
                langName,
                listening,
                speaking,
                reading,
                writing,
                notes,
                currentUser,
                nowStr,
                currentUser,
                nowStr
            ]);

            newLanguagesObjects.push({
                lang_id: langId,
                person_id: personId,
                language_name: langName,
                listening_level: listening,
                speaking_level: speaking,
                reading_level: reading,
                writing_level: writing,
                notes: notes,
                created_by: currentUser,
                created_at: nowStr,
                modified_by: currentUser,
                modified_at: nowStr
            });
        }
    });

    // 5. 組織關係閉包參數提取
    const parentPlacementId = getFormTrimVal('#form-placement-id');
    const parentSponsorId = getFormTrimVal('#form-sponsor-id');
    const ancestorId = parentPlacementId || parentSponsorId;
    const linkType = getFormTrimVal('#form-upline-link-type', '直屬已知');
    const gapCount = getFormTrimVal('#form-gap-count', '0');
    const relationLine = getFormTrimVal('#form-relation-line', '安置排線');

    const btnSubmit = $('#form-submit-btn');
    const silentOpt = { silent: true }; // 啟用靜默模式，禁止子請求閃爍 Loading

    // 啟動單一穩定的主控 Loading
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-up text-primary"></i> 正在平行同步全域組織與檔案...', '資料庫寫入中');

    try {
        btnSubmit.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 儲存寫入中...');

        // 階段一：靜默清除舊子表
        const deletePromises = [];
        const oldContacts = personContactsList.filter(c => c.person_id === personId);
        oldContacts.forEach(oc => {
            if (oc.contact_id) deletePromises.push(SheetAdapter.deleteRow('通訊資料', oc.contact_id, null, silentOpt).catch(() => {}));
        });
        const oldLangs = personLanguagesList.filter(l => l.person_id === personId);
        oldLangs.forEach(ol => {
            if (ol.lang_id) deletePromises.push(SheetAdapter.deleteRow('使用語言', ol.lang_id, null, silentOpt).catch(() => {}));
        });

        if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
        }

        // 階段二：靜默平行寫入主檔與新子表
        const createPromises = [];
        if (mode === 'CREATE') {
            createPromises.push(SheetAdapter.createRow('個人主檔', personId, personRowArray, null, silentOpt));
            createPromises.push(SheetAdapter.createRow('夥伴主檔', partnerId, partnerRowArray, null, silentOpt));
        } else {
            createPromises.push(SheetAdapter.updateRow('個人主檔', personId, personRowArray, null, silentOpt));
            createPromises.push(SheetAdapter.updateRow('夥伴主檔', partnerId, partnerRowArray, null, silentOpt));
        }

        contactRows.forEach(nc => createPromises.push(SheetAdapter.createRow('通訊資料', nc[0], nc, null, silentOpt)));
        languageRows.forEach(nl => createPromises.push(SheetAdapter.createRow('使用語言', nl[0], nl, null, silentOpt)));
        createPromises.push(syncOrgRelationsRecord(partnerId, ancestorId, linkType, gapCount, relationLine, currentUser, nowStr));

        await Promise.all(createPromises);

        // 階段三：本地記憶體樂觀更新 (In-Memory Optimistic Patch)
        const patchedPerson = parsePersonMasterTable([personRowArray])[0];
        const pIdx = personMasterList.findIndex(p => p.person_id === personId);
        if (pIdx >= 0) personMasterList[pIdx] = patchedPerson;
        else personMasterList.push(patchedPerson);

        const patchedPartner = parsePartnersTable([partnerRowArray])[0];
        const ptIdx = partnersList.findIndex(p => p.partner_id === partnerId);
        if (ptIdx >= 0) partnersList[ptIdx] = patchedPartner;
        else partnersList.push(patchedPartner);

        personContactsList = personContactsList.filter(c => c.person_id !== personId).concat(newContactsObjects);
        personLanguagesList = personLanguagesList.filter(l => l.person_id !== personId).concat(newLanguagesObjects);

        // 🚀 核心關鍵：先關閉 Modal、解除 Loading、彈出 Toast，立即將 UI 響應歸還給使用者
        AppLoading.hide();
        bootstrap.Modal.getInstance(document.getElementById('partnerDetailModal'))?.hide();
        AppToast.success(`成員【${getFormTrimVal('#form-name-zh')}】檔案與多語言資料已成功儲存！`);

        // 🚀 核心關鍵：將重型 DOM 渲染延遲至下一幀執行，徹底防止 Modal 淡出被卡住
        setTimeout(() => {
            populateSelect2Options();
            populateRegionDropdowns();
            populateLanguageFilterDropdown();
            renderAllViews();
        }, 50);

        // 背景非阻塞靜默同步
        fetchGoogleSheetsData();

    } catch (err) {
        console.error('寫入試算表失敗:', err);
        AppLoading.hide();
        AppToast.error('寫入試算表失敗: ' + err.message);
    } finally {
        btnSubmit.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> 儲存');
    }
}

/**
 * 刪除夥伴主檔並完整清理關聯之個人主檔、通訊資料、使用語言與組織關係閉包鏈
 * @param {string} partnerId 夥伴唯一識別碼
 */
window.deletePartnerRecord = function (partnerId) {
    const partner = partnersList.find(p => p.partner_id === partnerId);
    const personId = partner ? partner.person_id : null;
    const dispName = partner ? getPartnerDisplayName(partner) : partnerId;

    AppDialog.confirm(
        `確定要自雲端試算表中移除成員【${dispName} (${partnerId})】嗎？<br><small class="text-danger">系統將連帶清理其個人主檔、通訊資料、語言評級與組織血緣關聯。</small>`,
        async function () {
            AppLoading.show('<i class="fa-solid fa-spinner fa-spin text-danger"></i> 正在刪除成員檔案與清理血緣閉包...', '雲端同步處理');
            try {
                // 1. 刪除夥伴主檔
                await SheetAdapter.deleteRow('夥伴主檔', partnerId);

                // 2. 刪除個人主檔
                if (personId) {
                    await SheetAdapter.deleteRow('個人主檔', personId).catch(() => {});

                    // 刪除該人員之通訊資料
                    const relatedContacts = personContactsList.filter(c => c.person_id === personId);
                    for (const rc of relatedContacts) {
                        if (rc.contact_id) {
                            await SheetAdapter.deleteRow('通訊資料', rc.contact_id).catch(() => {});
                        }
                    }

                    // 刪除該人員之語言矩陣
                    const relatedLangs = personLanguagesList.filter(l => l.person_id === personId);
                    for (const rl of relatedLangs) {
                        if (rl.lang_id) {
                            await SheetAdapter.deleteRow('使用語言', rl.lang_id).catch(() => {});
                        }
                    }
                }

                // 3. 刪除組織關係表中該夥伴作為後代 (descendant) 或祖先 (ancestor) 的全部記錄
                const relsToDelete = orgRelationsList.filter(r => r.ancestor_id === partnerId || r.descendant_id === partnerId);
                for (const rel of relsToDelete) {
                    if (rel.id) {
                        await SheetAdapter.deleteRow('組織關係', rel.id).catch(() => {});
                    }
                }

                AppToast.success(`成員【${dispName}】及其組織關係閉包鏈已成功全數移除！`);
                await fetchGoogleSheetsData();
            } catch (err) {
                console.error('刪除成員失敗:', err);
                AppToast.error('刪除成員失敗: ' + err.message);
            } finally {
                AppLoading.hide();
            }
        },
        {
            title: '確認移除成員檔案',
            confirmText: '確認移除',
            confirmClass: 'btn-danger'
        }
    );
};