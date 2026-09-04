// ==========================================================================
// 職級晉升管理與推演中台 (org-ranks.js)
// 對接 SheetAdapter, UIBadges, AppDialog, AppToast, AppLoading
// ==========================================================================

const SPREADSHEET_ID = "1N-HniBDo7wJHidfsKyG-dr7kh0-UTNtFpM7nyFDL3eg";
const GAS_DEPLOY_ID = "AKfycbwCHIswVrVHuvEusFZrg2KjTCCwYhlf-3h-QbWhro8YVekUt1wNa4oDxxBxzPc_z6cd";

// ==========================================================================
// 工具函式與數值/日期轉換
// ==========================================================================
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
        return String(row[colIndex]).trim();
    }
    return defaultVal;
}

function parseNullableFloat(val) {
    if (val === undefined || val === null || String(val).trim() === '') return null;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? null : num;
}

function parseNullableInt(val) {
    if (val === undefined || val === null || String(val).trim() === '') return null;
    const num = parseInt(String(val).replace(/,/g, ''), 10);
    return isNaN(num) ? null : num;
}

function formatDateToSlash(dateStr) {
    if (!dateStr || String(dateStr).trim() === '' || dateStr === '-') return '';
    const cleanStr = String(dateStr).trim().replace(/-/g, '/');
    const parts = cleanStr.split('/');
    if (parts.length === 3) {
        return `${parts[0]}/${parts[1].padStart(2, '0')}/${parts[2].padStart(2, '0')}`;
    }
    return cleanStr;
}

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

function getFormattedNow() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function generateNextHistoryId(partnerId) {
    const targetPid = partnerId ? partnerId.trim() : 'PTN-0001';
    // 篩選該夥伴已有的晉升紀錄
    const ptnHistories = appState.history.filter(h => h.partner_id === targetPid);
    
    // 擷取該夥伴歷程末尾流水號
    const seqNumbers = ptnHistories.map(h => {
        const idStr = String(h.history_id).trim();
        // 匹配 RANK-HIS-PTN-xxxx-001 或舊式 RANK-HIS-001 格式末尾序號
        const match = idStr.match(/(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
    }).filter(n => !isNaN(n));

    const maxSeq = seqNumbers.length > 0 ? Math.max(...seqNumbers) : 0;
    return `RANK-HIS-${targetPid}-${String(maxSeq + 1).padStart(3, '0')}`;
}

// ==========================================================================
// 系統狀態管理 (State Management)
// ==========================================================================
let appState = {
    ranks: [],
    history: [],
    partners: [],
    persons: [],
    selectedRankId: ''
};

let historyDataTable = null;
let singlePartnerDataTable = null;
let partnerRankChartInstance = null;

function getPartnerDisplayName(partnerId) {
    if (!partnerId) return '-';
    const partner = appState.partners.find(ptn => ptn.partner_id === partnerId);
    if (!partner) return partnerId;

    const person = appState.persons.find(psn => psn.person_id === partner.person_id);
    const name = (person && (person.name_zh || person.name_en || person.preferred_name)) 
        ? (person.name_zh || person.name_en || person.preferred_name) 
        : (partner.partner_name_zh || partner.partner_id);
    const memberNo = (partner && partner.member_no) ? ` (${partner.member_no})` : '';
    
    return `${name}${memberNo} [${partner.partner_id}]`;
}

// ==========================================================================
// 系統生命週期
// ==========================================================================
window.addEventListener('AppReady', async () => {
    if (window.SheetAdapter) {
        SheetAdapter.init(GAS_DEPLOY_ID);
    }
    await fetchGoogleSheetsData();
    applyUIPermissions();
});

function isMasterAdmin() {
    const rawSession = localStorage.getItem('ray_team_auth_session');
    if (!rawSession) return true;
    try {
        const session = JSON.parse(rawSession);
        const adminEmails = ["jarvis20250807@gmail.com", "fish7548@gmail.com", "jarvis.lin@gmail.com", "ray.weng@gmail.com"];
        return adminEmails.includes((session.user || '').toLowerCase().trim());
    } catch (e) {
        return false;
    }
}

function applyUIPermissions() {
    const hasAdminRights = isMasterAdmin();
    if (!hasAdminRights) {
        $('#btnOpenAddModal').hide();
        $('.admin-action-btn').addClass('disabled').prop('disabled', true);
    }
}

// ==========================================================================
// 資料讀取引擎 (解析 4 張中文工作表)
// ==========================================================================
async function fetchGoogleSheetsData() {
    try {
        AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在同步職級標準、歷程、夥伴與個人主檔...', '讀取雲端試算表');

        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`通訊失敗: ${res.status}`);
            const text = await res.text();
            const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
            return (parsed.data || []).slice(1);
        };

        const [rankRows, historyRows, partnerRows, personRows] = await Promise.all([
            fetchSheet('職級主檔').catch(() => []),
            fetchSheet('職級歷程').catch(() => []),
            fetchSheet('夥伴主檔').catch(() => []),
            fetchSheet('個人主檔').catch(() => [])
        ]);

        appState.ranks = parseRanksTable(rankRows);
        appState.history = parseRankHistoryTable(historyRows);
        appState.partners = parsePartnersTable(partnerRows);
        appState.persons = parsePersonsTable(personRows);

        if (appState.ranks.length > 0) {
            const exists = appState.ranks.some(r => r.rank_id === appState.selectedRankId);
            if (!exists) {
                appState.selectedRankId = appState.ranks[0].rank_id;
            }
        }

        refreshView();
        AppToast.success("試算表資料同步完成");
    } catch (err) {
        console.error("Google Sheets 讀取異常:", err);
        AppToast.error(`資料讀取失敗: ${err.message}`);
    } finally {
        AppLoading.hide();
    }
}

function parseRanksTable(rows) {
    return rows.map((r, idx) => {
        // is_active 位於索引 28
        const activeRaw = getVal(r, 28, 'Y').toUpperCase();
        const isActive = (activeRaw === 'Y' || activeRaw === '是' || activeRaw === 'TRUE' || activeRaw === '1' || activeRaw === '');

        return {
            rank_id: getVal(r, 0, `RANK_${String(idx + 1).padStart(2, '0')}`),
            rank_code: getVal(r, 1, `R${(idx + 1) * 10}`),
            rank_level: parseInt(getVal(r, 2, String((idx + 1) * 10)), 10) || 0,
            rank_name_zh: getVal(r, 3, ''),
            rank_name_en: getVal(r, 4, ''),
            star_rating: parseInt(getVal(r, 5, '0'), 10) || 0,
            cooling_period_month: parseInt(getVal(r, 6, '0'), 10) || 0,
            cum_group_sv_req: parseFloat(getVal(r, 7, '0')) || 0,
            month_personal_sv_req: parseFloat(getVal(r, 8, '160')) || 160,
            month_group_sv_req: parseFloat(getVal(r, 9, '0')) || 0,
            new_mgr_group_sv_req: parseFloat(getVal(r, 10, '0')) || 0,
            qualified_lines_req: parseInt(getVal(r, 11, '0'), 10) || 0,
            pearl_lines_req: parseInt(getVal(r, 12, '0'), 10) || 0,
            month_org_sv_req: parseFloat(getVal(r, 13, '0')) || 0,
            consecutive_months_req: parseInt(getVal(r, 14, '1'), 10) || 1,
            direct_rebate_rate: parseFloat(getVal(r, 15, '0.05')) || 0.05,
            leadership_gen_depth: parseInt(getVal(r, 16, '0'), 10) || 0,
            leadership_gen_rate: parseFloat(getVal(r, 17, '0.06')) || 0.06,
            has_group_bonus: getVal(r, 18, 'N').toUpperCase(),
            has_manager_bonus: getVal(r, 19, 'N').toUpperCase(),
            has_pearl_dividend: getVal(r, 20, 'N').toUpperCase(),
            has_annual_excellence: getVal(r, 21, 'N').toUpperCase(),
            has_travel_incentive: getVal(r, 22, 'N').toUpperCase(),
            has_car_fund: getVal(r, 23, 'N').toUpperCase(),
            car_reward_type: getVal(r, 24, '無'),
            badge_icon_class: getVal(r, 25, 'fa-solid fa-award'),
            badge_color_hex: getVal(r, 26, '#8b5cf6'),
            sort_order: parseInt(getVal(r, 27, String(idx + 1)), 10) || (idx + 1),
            is_active: isActive ? 'Y' : 'N',
            created_by: getVal(r, 29, 'SYSTEM'),
            created_at: getVal(r, 30, ''),
            modified_by: getVal(r, 31, 'SYSTEM'),
            modified_at: getVal(r, 32, '')
        };
    }).filter(r => r.rank_name_zh !== '' && r.is_active === 'Y').sort((a, b) => a.sort_order - b.sort_order);
}

function parseRankHistoryTable(rows) {
    return rows.map((r, idx) => {
        const partnerId = getVal(r, 1, 'PTN-0001');
        const defaultHisId = `RANK-HIS-${partnerId}-${String(idx + 1).padStart(3, '0')}`;

        return {
            history_id: getVal(r, 0, defaultHisId),
            partner_id: partnerId,
            previous_rank_id: getVal(r, 2, ''),
            new_rank_id: getVal(r, 3, ''),
            star_rating: parseInt(getVal(r, 4, '0'), 10) || 0,
            effective_month: getVal(r, 5, ''),
            cooling_start_date: formatDateToSlash(getVal(r, 6, '')),
            consecutive_qualified_months: parseNullableInt(getVal(r, 7, '')),
            cum_group_sv_snapshot: parseNullableFloat(getVal(r, 8, '')),
            month_group_sv_snapshot: parseNullableFloat(getVal(r, 9, '')),
            active_manager_legs_count: parseNullableInt(getVal(r, 10, '')),
            active_pearl_legs_count: parseNullableInt(getVal(r, 11, '')),
            month_total_org_sv_snapshot: parseNullableFloat(getVal(r, 12, '')),
            company_recognition_date: formatDateToSlash(getVal(r, 13, '')),
            notes: getVal(r, 14, '') || null,
            created_by: getVal(r, 15, 'SYSTEM'),
            created_at: getVal(r, 16, ''),
            modified_by: getVal(r, 17, 'SYSTEM'),
            modified_at: getVal(r, 18, '')
        };
    }).filter(h => h.partner_id !== '');
}

function parsePartnersTable(rows) {
    return rows.map(r => ({
        partner_id: getVal(r, 0, ''),
        person_id: getVal(r, 1, ''),
        member_no: getVal(r, 2, ''),
        leader_title: getVal(r, 3, ''),
        diamond_star_level: parseInt(getVal(r, 15, '0'), 10) || 0,
        star_eval_eligible_date: getVal(r, 16, ''),
        join_date: formatDateToSlash(getVal(r, 29, '')) // 對齊最新索引 29
    })).filter(p => p.partner_id !== '');
}

function parsePersonsTable(rows) {
    return rows.map(r => ({
        person_id: getVal(r, 0, ''),
        name_zh: getVal(r, 1, ''),
        name_en: getVal(r, 2, ''),
        preferred_name: getVal(r, 3, ''),
        display_name: getVal(r, 4, '')
    })).filter(p => p.person_id !== '');
}

// ==========================================================================
// 介面渲染中樞
// ==========================================================================
function refreshView() {
    renderRankOrbit();
    populateRankSelects();
    if (appState.selectedRankId) {
        selectRank(appState.selectedRankId);
    }
    renderHistoryTable();
    populatePartnerDropdown();
    initPartnerSelect2();
}

function renderRankOrbit() {
    const $container = $('#rankTrackContainer').empty();
    appState.ranks.forEach(rank => {
        const isSelected = rank.rank_id === appState.selectedRankId ? 'active' : '';
        const html = `
            <div class="rank-node-btn ${isSelected}" data-rank-id="${rank.rank_id}" onclick="selectRank('${rank.rank_id}')">
                <div class="rank-badge-icon" style="color: ${rank.badge_color_hex};">
                    <i class="${rank.badge_icon_class}"></i>
                </div>
                <div class="fw-bold text-white">${rank.rank_name_zh}</div>
                <div class="text-muted text-truncate">${rank.rank_code}</div>
            </div>
        `;
        $container.append(html);
    });
    $('#ranksCountBadge').text(`${appState.ranks.length} 個職級已載入`);
}

function selectRank(rankId) {
    appState.selectedRankId = rankId;
    $('.rank-node-btn').removeClass('active');
    $(`.rank-node-btn[data-rank-id="${rankId}"]`).addClass('active');

    const rank = appState.ranks.find(r => r.rank_id === rankId);
    if (!rank) return;

    $('#activeRankCode').text(`代碼：${rank.rank_code}`).css('color', rank.badge_color_hex);
    $('#activeRankName').html(`
        <i class="${rank.badge_icon_class} me-2" style="color: ${rank.badge_color_hex};"></i>
        <span>${rank.rank_name_zh} ${rank.rank_name_en ? '(' + rank.rank_name_en + ')' : ''}</span>
    `);
    $('#activeRebateRate').text(`${(rank.direct_rebate_rate * 100).toFixed(2)}%`);

    $('#activePersonalSv').text(`${rank.month_personal_sv_req.toLocaleString()} SV`);
    $('#activeMonthGroupSv').text(`${rank.month_group_sv_req.toLocaleString()} SV`);
    $('#activeMonthOrgSv').text(rank.month_org_sv_req > 0 ? `${rank.month_org_sv_req.toLocaleString()} SV` : '無門檻');
    $('#activeCumSv').text(rank.cum_group_sv_req > 0 ? `${rank.cum_group_sv_req.toLocaleString()} SV` : '不歸零');
    $('#activeQualifiedLines').text(`${rank.qualified_lines_req} 條`);
    $('#activePearlLines').text(`${rank.pearl_lines_req} 條`);
    $('#activeConsecutiveMonths').text(`${rank.consecutive_months_req} 個月`);
    $('#activeCoolingMonths').text(rank.cooling_period_month > 0 ? `${rank.cooling_period_month} 個月` : '無冷卻期');

    const $flags = $('#privilegeFlagsContainer').empty();
    const addFlag = (label, active, icon) => {
        const badgeClass = active ? 'badge badge-accent' : 'badge badge-muted';
        $flags.append(`
            <div class="col-12 col-md-4">
                <div class="fs-6 p-2 rounded ${badgeClass} d-flex align-items-center gap-2">
                    <i class="${icon}"></i> ${label}
                </div>
            </div>
        `);
    };

    // 獎金分紅特權旗標渲染
    addFlag(`階差獎金 ${(rank.direct_rebate_rate * 100).toFixed(0)}%`, true, 'fa-solid fa-percent');
    addFlag(`合格小組獎金 10%`, rank.has_group_bonus === 'Y', 'fa-solid fa-circle-check');
    addFlag(`合格經理獎金 5%`, rank.has_manager_bonus === 'Y', 'fa-solid fa-circle-check');
    addFlag(`全球領導獎金 ${rank.leadership_gen_depth} 代 (6%)`, rank.leadership_gen_depth > 0, 'fa-solid fa-layer-group');
    addFlag(`業績自動補救權益`, rank.pearl_lines_req > 0 || rank.qualified_lines_req >= 4, 'fa-solid fa-shield-heart');
    addFlag(`珍鑽分紅 5%`, rank.has_pearl_dividend === 'Y', 'fa-solid fa-gem');
    addFlag(`珍鑽年度卓越 5%`, rank.has_annual_excellence === 'Y', 'fa-solid fa-trophy');
    addFlag(`珍鑽旅遊獎勵 1.5%`, rank.has_travel_incentive === 'Y', 'fa-solid fa-plane-departure');
    
    // 購車基金 3.5% 資格與具體方案說明
    addFlag(`購車基金 3.5%`, rank.has_car_fund === 'Y', 'fa-solid fa-car-side');
    if (rank.car_reward_type && rank.car_reward_type !== '無') {
        addFlag(`方案: ${rank.car_reward_type}`, true, 'fa-solid fa-car');
    }
}

// 依據新職級自動推算前一階原職級
function autoCalcPrevRank(newRankId) {
    if (!newRankId || !appState.ranks.length) return;
    const currentIndex = appState.ranks.findIndex(r => r.rank_id === newRankId || r.rank_code === newRankId);
    
    if (currentIndex > 0) {
        const prevRank = appState.ranks[currentIndex - 1];
        $('#fieldPrevRankId').val(prevRank.rank_id);
    } else {
        $('#fieldPrevRankId').val(appState.ranks[0].rank_id);
    }

    // 自動帶入新職級對應之藍鑽星等
    const newRank = appState.ranks.find(r => r.rank_id === newRankId);
    if (newRank) {
        $('#fieldStarRating').val(newRank.star_rating || 0);
    }
}

function populateRankSelects() {
    const rankData = appState.ranks;

    // 1. 原職級選單
    UISelectOptions.core.render({
        target: '#fieldPrevRankId',
        data: rankData,
        valueKey: 'rank_id',
        textKey: (r) => `${r.rank_code} - ${r.rank_name_zh}`,
        placeholder: '請選擇原職級...',
        searchable: false,
        creatable: false,
        grouped: false,
        dropdownParent: '#rankHistoryModal'
    });

    // 2. 新晉升職級選單
    UISelectOptions.core.render({
        target: '#fieldNewRankId',
        data: rankData,
        valueKey: 'rank_id',
        textKey: (r) => `${r.rank_code} - ${r.rank_name_zh}`,
        placeholder: '請選擇新晉升職級...',
        searchable: false,
        creatable: false,
        grouped: false,
        dropdownParent: '#rankHistoryModal'
    });

    // 當新晉升職級變更時，立即自動計算原職級
    $('#fieldNewRankId').off('change.autoPrev').on('change.autoPrev', function() {
        autoCalcPrevRank($(this).val());
    });
}

// ==========================================================================
// 夥伴專屬戰況與折線圖分析
// ==========================================================================
function populatePartnerDropdown() {
    const $select = $('#partnerSelect');
    const partnerList = appState.partners.length > 0 
        ? appState.partners 
        : [...new Set(appState.history.map(h => h.partner_id))].map(id => ({ partner_id: id }));

    // 透過共用模組渲染夥伴戰情下拉選單 (可搜尋、不可自訂新增)
    UISelectOptions.core.render({
        target: $select,
        data: partnerList,
        valueKey: 'partner_id',
        textKey: (p) => getPartnerDisplayName(p.partner_id),
        placeholder: '請選擇或搜尋夥伴...',
        selectedValue: $select.val() || (partnerList[0]?.partner_id || ''),
        searchable: true,
        creatable: false,
        grouped: false
    });

    $select.off('change.partnerDash').on('change.partnerDash', function () {
        onPartnerSelected($(this).val());
    });

    const selectedPtn = $select.val();
    if (selectedPtn) {
        onPartnerSelected(selectedPtn);
    }
}

function onPartnerSelected(partnerId) {
    if (!partnerId) return;

    const ptnHistory = appState.history
        .filter(h => h.partner_id === partnerId)
        .sort((a, b) => (a.effective_month > b.effective_month ? 1 : -1));

    renderPartnerRankChart(ptnHistory);
    renderPartnerSingleTable(ptnHistory);
}

// 年月字串（YYYYMM、YYYY-MM、YYYY/MM 或 YYYY）轉為標準 Timestamp 數值
function parseYmToTimestamp(ymStr) {
    if (!ymStr) return 0;
    const clean = String(ymStr).trim().replace(/[-/]/g, '');
    let year = 2026, month = 1;
    if (clean.length === 4) {
        year = parseInt(clean, 10);
        month = 1;
    } else if (clean.length >= 6) {
        year = parseInt(clean.substring(0, 4), 10);
        month = parseInt(clean.substring(4, 6), 10);
    }
    return new Date(year, month - 1, 1).getTime();
}

function renderPartnerRankChart(ptnHistory) {
    const ctx = document.getElementById('partnerRankChart');
    if (!ctx) return;

    const currentPartnerId = $('#partnerSelect').val();
    const partnerInfo = appState.partners.find(p => p.partner_id === currentPartnerId);

    // 從「職級主檔」動態取得會員職級資料與專屬代表色
    const memberRank = appState.ranks.find(r => 
        r.rank_level === 10 || 
        r.rank_code === 'R10' || 
        r.rank_name_zh === '會員' || 
        r.rank_id === 'RANK_01_MEMBER'
    );
    const memberColor = (memberRank && memberRank.badge_color_hex) ? memberRank.badge_color_hex : '#a1a1aa';

    const chartNodes = [];

    // 嚴格檢查：只有在夥伴主檔確實有「加入葡眾日」且非空值時，才建立「會員」節點
    const rawJoinDate = partnerInfo && partnerInfo.join_date ? String(partnerInfo.join_date).trim() : '';
    if (rawJoinDate && rawJoinDate !== '-') {
        const joinParts = rawJoinDate.replace(/-/g, '/').split('/');
        if (joinParts.length >= 2) {
            const year = parseInt(joinParts[0], 10);
            const month = parseInt(joinParts[1], 10);
            if (!isNaN(year) && !isNaN(month) && year > 1990) {
                const joinTimestamp = new Date(year, month - 1, 1).getTime();
                const joinYmStr = `${year}/${String(month).padStart(2, '0')}`;

                chartNodes.push({
                    x: joinTimestamp,
                    y: 10,
                    dateLabel: joinYmStr,
                    rankName: `${memberRank ? memberRank.rank_name_zh : '會員'} (加入葡眾)`,
                    color: memberColor // ★ 使用職級主檔設定之代表色
                });
            }
        }
    }

    // 加入升階歷程節點：排除 <= 10 的會員初始歷程，避免無加入日的夥伴出現 2026/06 假節點
    ptnHistory.forEach(h => {
        const rank = appState.ranks.find(r => 
            r.rank_id === h.new_rank_id || 
            r.rank_code === h.new_rank_id || 
            r.rank_name_zh === h.new_rank_id
        );
        
        // 未找到職級或為會員等級時跳過（會員點僅由加入葡眾日提供）
        if (!rank || rank.rank_level <= 10) return;

        const level = rank.rank_level;
        const color = rank.badge_color_hex || '#8b5cf6';
        const timestamp = parseYmToTimestamp(h.effective_month);
        if (!timestamp) return;

        chartNodes.push({
            x: timestamp,
            y: level,
            dateLabel: h.effective_month,
            rankName: rank.rank_name_zh,
            color: color
        });
    });

    // 依時間先後嚴格排序
    chartNodes.sort((a, b) => a.x - b.x);
    
    // 計算 X 軸起訖邊界（起訖點均對齊偶數月）
    const now = new Date();
    const minTimestamp = chartNodes.length > 0 ? chartNodes[0].x : new Date(now.getFullYear(), 0, 1).getTime();
    const maxTimestamp = chartNodes.length > 0 ? chartNodes[chartNodes.length - 1].x : new Date(now.getFullYear(), 11, 1).getTime();

    const dMin = new Date(minTimestamp);
    let startYear = dMin.getFullYear();
    let startMonth = dMin.getMonth() + 1;
    let startEvenMonth = (startMonth % 2 === 0) ? startMonth - 2 : startMonth - 1;
    if (startEvenMonth <= 0) {
        startYear -= 1;
        startEvenMonth += 12;
    }

    const dMax = new Date(maxTimestamp);
    let endYear = dMax.getFullYear();
    let endMonth = dMax.getMonth() + 1;
    let endEvenMonth = (endMonth % 2 === 0) ? endMonth + 2 : endMonth + 1;
    if (endEvenMonth > 12) {
        endYear += 1;
        endEvenMonth -= 12;
    }

    // 計算跨越總月數，動態決定刻度步長（保證皆為 2 的倍數月份）
    const totalSpanMonths = (endYear - startYear) * 12 + (endEvenMonth - startEvenMonth);
    const stepCandidates = [2, 4, 6, 12, 24, 36, 48];
    let stepMonths = 2;
    for (const step of stepCandidates) {
        if (totalSpanMonths / step <= 10) { // 刻度數控制在 10 個以內
            stepMonths = step;
            break;
        }
        stepMonths = step;
    }

    const startBound = new Date(startYear, startEvenMonth - 1, 1).getTime();
    const endBound = new Date(endYear, endEvenMonth - 1, 1).getTime();

    // 依動態步長生成偶數月刻度陣列
    const evenMonthTicks = [];
    let cur = new Date(startYear, startEvenMonth - 1, 1);
    while (cur.getTime() <= endBound) {
        evenMonthTicks.push(cur.getTime());
        cur = new Date(cur.getFullYear(), cur.getMonth() + stepMonths, 1);
    }
    // 補齊最後一個刻度，確保圖表最右側節點能完整落在可視區內
    if (evenMonthTicks[evenMonthTicks.length - 1] < endBound) {
        evenMonthTicks.push(cur.getTime());
    }

    const finalStart = evenMonthTicks[0];
    const finalEnd = evenMonthTicks[evenMonthTicks.length - 1];

    // RWD 動態畫布寬度計算
    const $wrapper = $('#partnerRankChartWrapper');
    if ($wrapper.length) {
        const minDynamicWidth = Math.max(100, evenMonthTicks.length * 85);
        $wrapper.css('min-width', evenMonthTicks.length > 6 ? `${minDynamicWidth}px` : '100%');
    }

    if (partnerRankChartInstance) {
        partnerRankChartInstance.destroy();
    }

    // Chart.js 實體生成
    partnerRankChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: '職級位階',
                data: chartNodes.map(node => ({ x: node.x, y: node.y })),
                borderColor: '#c084fc',
                backgroundColor: 'transparent',
                fill: false,
                borderWidth: 2.5,
                tension: 0,
                segment: {
                    borderDash: ctx => {
                        const p0 = chartNodes[ctx.p0DataIndex];
                        const p1 = chartNodes[ctx.p1DataIndex];
                        if (!p0 || !p1) return undefined;
                        return Math.abs(p1.y - p0.y) > 10 ? [6, 6] : undefined;
                    }
                },
                pointBackgroundColor: chartNodes.map(n => n.color),
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: chartNodes.map(n => n.color)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 10,
                    max: 100,
                    offset: true,
                    ticks: {
                        stepSize: 10,
                        color: '#c084fc',
                        font: { weight: '600' },
                        callback: val => {
                            const r = appState.ranks.find(x => x.rank_level === val);
                            return r ? r.rank_name_zh : `R${val}`;
                        }
                    },
                    grid: {
                        color: 'rgba(192, 132, 252, 0.40)',
                        lineWidth: 1.2,
                        drawBorder: true
                    }
                },
                x: {
                    type: 'linear',
                    min: finalStart,
                    max: finalEnd,
                    offset: false,
                    afterBuildTicks: axis => {
                        axis.ticks = evenMonthTicks.map(v => ({ value: v }));
                    },
                    ticks: {
                        color: '#c084fc',
                        font: { weight: '500' },
                        autoSkip: false,
                        maxRotation: 45,
                        minRotation: 0,
                        callback: val => {
                            const d = new Date(val);
                            if (isNaN(d.getTime())) return '';
                            return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                        }
                    },
                    grid: {
                        color: 'rgba(139, 92, 246, 0.20)',
                        lineWidth: 1.2,
                        drawBorder: true
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: items => {
                            const node = chartNodes[items[0].dataIndex];
                            return node ? `年月：${node.dateLabel}` : '';
                        },
                        label: ctx => {
                            const node = chartNodes[ctx.dataIndex];
                            return ` 職級：${node ? node.rankName : ''} (位階 ${ctx.parsed.y})`;
                        }
                    }
                }
            }
        }
    });
}

function renderPartnerSingleTable(ptnHistory) {
    const hasAdminRights = isMasterAdmin();

    const formatted = ptnHistory.map(h => {
        const prevRank = appState.ranks.find(r => r.rank_id === h.previous_rank_id);
        const newRank = appState.ranks.find(r => r.rank_id === h.new_rank_id);

        const actionBtns = hasAdminRights ? `
            <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="openEditHistoryModal('${h.history_id}')" title="編輯"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-outline-danger py-0 px-2 ms-1" onclick="deleteRankHistoryItem('${h.history_id}')" title="刪除"><i class="fa-solid fa-trash-alt"></i></button>
        ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>';

        return {
            previous: prevRank ? UIBadges.rank.badge(prevRank) : `<span class="badge badge-gray">${h.previous_rank_id || '-'}</span>`,
            new_rank: newRank ? UIBadges.rank.badge(newRank) : `<span class="badge badge-purple">${h.new_rank_id || '-'}</span>`,
            effective_month: `${h.effective_month}`,
            consecutive: h.consecutive_qualified_months !== null ? `${h.consecutive_qualified_months} 個月` : '-',
            cum_sv: h.cum_group_sv_snapshot !== null ? `${h.cum_group_sv_snapshot.toLocaleString()} SV` : '-',
            manager_legs: h.active_manager_legs_count !== null ? `<span class="text-center d-block">${h.active_manager_legs_count} 條</span>` : '-',
            pearl_legs: h.active_pearl_legs_count !== null ? `<span class="text-center d-block">${h.active_pearl_legs_count} 條</span>` : '-',
            recognition: h.company_recognition_date || '-',
            notes: h.notes || '-',
            actions: actionBtns
        };
    });

    if (singlePartnerDataTable) {
        singlePartnerDataTable.clear().rows.add(formatted).draw();
    } else {
        singlePartnerDataTable = $('#partnerSingleHistoryTable').DataTable({
            data: formatted,
            columns: [
                { data: 'previous' },
                { data: 'new_rank' },
                { data: 'effective_month' },
                { data: 'consecutive' },
                { data: 'cum_sv' },
                { data: 'manager_legs' },
                { data: 'pearl_legs' },
                { data: 'recognition' },
                { data: 'notes' },
                { data: 'actions', orderable: false }
            ],
            searching: false,
            info: false,
            paging: false,
            lengthChange: false
        });
    }
}

// ==========================================================================
// 全團隊夥伴晉升歷程表格渲染
// ==========================================================================
function renderHistoryTable() {
    const formatted = appState.history.map(h => {
        const prevRank = appState.ranks.find(r => r.rank_id === h.previous_rank_id);
        const newRank = appState.ranks.find(r => r.rank_id === h.new_rank_id);
        const hasAdminRights = isMasterAdmin();

        const actionBtns = hasAdminRights ? `
            <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="openEditHistoryModal('${h.history_id}')" title="編輯"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-outline-danger py-0 px-2 ms-1" onclick="deleteRankHistoryItem('${h.history_id}')" title="刪除"><i class="fa-solid fa-trash-alt"></i></button>
        ` : '<span class="text-muted small"><i class="fa-solid fa-lock"></i> 唯讀</span>';

        return {
            partner_name: `<strong class="text-white">${getPartnerDisplayName(h.partner_id)}</strong>`,
            previous: prevRank ? UIBadges.rank.badge(prevRank) : `<span class="badge badge-gray">${h.previous_rank_id || '-'}</span>`,
            new_rank: newRank ? UIBadges.rank.badge(newRank) : `<span class="badge badge-purple">${h.new_rank_id || '-'}</span>`,
            effective_month: `${h.effective_month}`,
            consecutive: h.consecutive_qualified_months !== null ? `${h.consecutive_qualified_months} 個月` : '-',
            cum_sv: h.cum_group_sv_snapshot !== null ? `${h.cum_group_sv_snapshot.toLocaleString()} SV` : '-',
            manager_legs: h.active_manager_legs_count !== null ? `<span class="text-center d-block">${h.active_manager_legs_count} 條</span>` : '-',
            pearl_legs: h.active_pearl_legs_count !== null ? `<span class="text-center d-block">${h.active_pearl_legs_count} 條</span>` : '-',
            recognition: h.company_recognition_date || '-',
            notes: `<span class="text-truncate d-inline-block" style="max-width: 160px;" title="${h.notes || ''}">${h.notes || '-'}</span>`,
            actions: actionBtns
        };
    });

    if (historyDataTable) {
        historyDataTable.clear().rows.add(formatted).draw();
    } else {
        historyDataTable = $('#rankHistoryTable').DataTable({
            data: formatted,
            columns: [
                { data: 'partner_name' },
                { data: 'previous' },
                { data: 'new_rank' },
                { data: 'effective_month' },
                { data: 'consecutive' },
                { data: 'cum_sv' },
                { data: 'manager_legs' },
                { data: 'pearl_legs' },
                { data: 'recognition' },
                { data: 'notes' },
                { data: 'actions', orderable: false }
            ]
        });
    }
}

// ==========================================================================
// Select2 與彈窗互動處理
// ==========================================================================
function initPartnerSelect2() {
    const $partnerSelect = $('#fieldPartnerId');
    const partnerList = appState.partners.length > 0 
        ? appState.partners 
        : [...new Set(appState.history.map(h => h.partner_id))].map(id => ({ partner_id: id }));

    // 透過共用模組渲染晉升登記之夥伴選單 (綁定 Modal 父層與防脫軌滾動守衛)
    UISelectOptions.core.render({
        target: $partnerSelect,
        data: partnerList,
        valueKey: 'partner_id',
        textKey: (p) => getPartnerDisplayName(p.partner_id),
        placeholder: '請選擇或搜尋夥伴...',
        selectedValue: $partnerSelect.val() || '',
        searchable: true,
        creatable: false,
        grouped: false,
        dropdownParent: '#rankHistoryModal'
    });

    // 當新增狀態下更換夥伴時，動態重算其專屬晉升流水號
    $partnerSelect.off('change.historyIdGen').on('change.historyIdGen', function () {
        if ($('#fieldHistoryMode').val() === 'add') {
            const selectedPid = $(this).val();
            if (selectedPid) {
                $('#fieldHistoryId').val(generateNextHistoryId(selectedPid));
            } else {
                $('#fieldHistoryId').val('');
            }
        }
    });
}

function openAddRankModal() {
    $('#modalHistoryTitle').html('<i class="fa-solid fa-plus text-accent"></i> 登錄夥伴職級晉升');
    $('#fieldHistoryMode').val('add');
    $('#formRankHistory')[0].reset();
    $('#fieldHistoryId').val(''); // 選擇夥伴後動態產生

    const now = new Date();
    const currentYm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    $('#fieldEffectiveMonth').val(currentYm);
    $('#fieldConsecutiveMonths').val('');
    $('#fieldCumSvSnapshot').val('');
    $('#fieldManagerLegsSnapshot').val('');
    $('#fieldPearlLegsSnapshot').val('');
    $('#fieldRecognitionDate').val('');
    $('#fieldCoolingStartDate').val('');
    $('#fieldStarRating').val('0');

    $('#fieldPrevRankId').prop('disabled', true);
    if (appState.ranks.length > 1) {
        $('#fieldNewRankId').val(appState.ranks[1].rank_id);
        autoCalcPrevRank(appState.ranks[1].rank_id);
    }
    
    $('#fieldPartnerId').val('').trigger('change');
    new bootstrap.Modal(document.getElementById('rankHistoryModal')).show();
}

function openEditHistoryModal(historyId) {
    const item = appState.history.find(h => h.history_id === historyId);
    if (!item) return;

    $('#modalHistoryTitle').html('<i class="fa-solid fa-pen-to-square text-accent"></i> 編輯晉升紀錄');
    $('#fieldHistoryMode').val('edit');
    $('#fieldHistoryId').val(item.history_id);
    $('#fieldPartnerId').val(item.partner_id).trigger('change');
    $('#fieldPrevRankId').prop('disabled', true);
    $('#fieldNewRankId').val(item.new_rank_id);

    if (item.previous_rank_id) {
        $('#fieldPrevRankId').val(item.previous_rank_id);
    } else {
        autoCalcPrevRank(item.new_rank_id);
    }
    
    $('#fieldStarRating').val(item.star_rating || 0);
    $('#fieldEffectiveMonth').val(item.effective_month);
    $('#fieldConsecutiveMonths').val(item.consecutive_qualified_months !== null ? item.consecutive_qualified_months : '');
    
    const recDate = item.company_recognition_date ? item.company_recognition_date.replace(/\//g, '-') : '';
    $('#fieldRecognitionDate').val(recDate);
    
    const coolDate = item.cooling_start_date ? item.cooling_start_date.replace(/\//g, '-') : '';
    $('#fieldCoolingStartDate').val(coolDate);

    $('#fieldCumSvSnapshot').val(item.cum_group_sv_snapshot !== null ? item.cum_group_sv_snapshot : '');
    $('#fieldManagerLegsSnapshot').val(item.active_manager_legs_count !== null ? item.active_manager_legs_count : '');
    $('#fieldPearlLegsSnapshot').val(item.active_pearl_legs_count !== null ? item.active_pearl_legs_count : '');
    $('#fieldNotes').val(item.notes || '');

    new bootstrap.Modal(document.getElementById('rankHistoryModal')).show();
}

// ==========================================================================
// 試算表 C/U/D 寫入操作
// ==========================================================================
async function saveRankHistoryItem() {
    const mode = $('#fieldHistoryMode').val();
    const partnerId = $('#fieldPartnerId').val().trim();

    if (!partnerId) {
        AppToast.warning("請選擇夥伴！");
        return;
    }

    // 若為新增且 ID 為空，強制呼叫生成器
    let historyId = $('#fieldHistoryId').val().trim();
    if (mode === 'add' && (!historyId || !historyId.includes(partnerId))) {
        historyId = generateNextHistoryId(partnerId);
        $('#fieldHistoryId').val(historyId);
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existing = appState.history.find(h => h.history_id === historyId);
    const createdBy = (mode === 'edit' && existing) ? existing.created_by : currentUser;
    const createdAt = (mode === 'edit' && existing) ? existing.created_at : nowStr;

    const starRatingVal = parseInt($('#fieldStarRating').val(), 10) || 0;
    const consecutiveVal = parseNullableInt($('#fieldConsecutiveMonths').val());
    const cumSvVal = parseNullableFloat($('#fieldCumSvSnapshot').val());
    const mgrLegsVal = parseNullableInt($('#fieldManagerLegsSnapshot').val());
    const pearlLegsVal = parseNullableInt($('#fieldPearlLegsSnapshot').val());
    const coolingStartDateVal = formatDateToSlash($('#fieldCoolingStartDate').val());
    const recognitionDateVal = formatDateToSlash($('#fieldRecognitionDate').val());
    const notesVal = $('#fieldNotes').val().trim() || '';

    // 封裝 19 欄位 TSV 資料列
    const rowDataArray = [
        historyId,
        partnerId,
        $('#fieldPrevRankId').val(),
        $('#fieldNewRankId').val(),
        starRatingVal,
        $('#fieldEffectiveMonth').val().trim(),
        coolingStartDateVal || '',
        consecutiveVal !== null ? consecutiveVal : '',
        cumSvVal !== null ? cumSvVal : '',
        '',
        mgrLegsVal !== null ? mgrLegsVal : '',
        pearlLegsVal !== null ? pearlLegsVal : '',
        '',
        recognitionDateVal || '',
        notesVal || '',
        createdBy,
        createdAt,
        currentUser,
        nowStr
    ];

    const updatedObj = {
        history_id: historyId,
        partner_id: partnerId,
        previous_rank_id: $('#fieldPrevRankId').val(),
        new_rank_id: $('#fieldNewRankId').val(),
        star_rating: starRatingVal,
        effective_month: $('#fieldEffectiveMonth').val().trim(),
        cooling_start_date: coolingStartDateVal || null,
        consecutive_qualified_months: consecutiveVal,
        cum_group_sv_snapshot: cumSvVal,
        month_group_sv_snapshot: null,
        active_manager_legs_count: mgrLegsVal,
        active_pearl_legs_count: pearlLegsVal,
        month_total_org_sv_snapshot: null,
        company_recognition_date: recognitionDateVal || null,
        notes: notesVal || null,
        created_by: createdBy,
        created_at: createdAt,
        modified_by: currentUser,
        modified_at: nowStr
    };

    try {
        if (mode === 'add') {
            await SheetAdapter.createRow('職級歷程', historyId, rowDataArray, GAS_DEPLOY_ID);
            appState.history.unshift(updatedObj);
        } else {
            await SheetAdapter.updateRow('職級歷程', historyId, rowDataArray, GAS_DEPLOY_ID);
            const idx = appState.history.findIndex(h => h.history_id === historyId);
            if (idx !== -1) appState.history[idx] = updatedObj;
        }

        refreshView();
        bootstrap.Modal.getInstance(document.getElementById('rankHistoryModal')).hide();
        AppToast.success(`晉升紀錄【${historyId}】已成功儲存！`);
    } catch (err) {
        AppToast.error("寫入失敗：" + err.message);
    }
}

async function deleteRankHistoryItem(historyId) {
    const confirmed = await AppDialog.confirm(`確定要刪除晉升紀錄【${historyId}】嗎？`, {
        title: '刪除確認',
        confirmText: '確定刪除',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    try {
        await SheetAdapter.deleteRow('職級歷程', historyId, GAS_DEPLOY_ID);
        appState.history = appState.history.filter(h => h.history_id !== historyId);
        refreshView();
        AppToast.success(`晉升紀錄【${historyId}】已成功刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗：" + err.message);
    }
}