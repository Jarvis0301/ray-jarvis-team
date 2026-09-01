// ==========================================================================
// 職級晉升管理與推演中台 (org-ranks.js)
// 對接 SheetAdapter, UIBadges, AppDialog, AppToast, AppLoading
// ==========================================================================

const SPREADSHEET_ID = "1N-HniBDo7wJHidfsKyG-dr7kh0-UTNtFpM7nyFDL3eg";
const GAS_DEPLOY_ID = "AKfycbwCHIswVrVHuvEusFZrg2KjTCCwYhlf-3h-QbWhro8YVekUt1wNa4oDxxBxzPc_z6cd";

// ==========================================================================
// 工具函式
// ==========================================================================
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
        return String(row[colIndex]).trim();
    }
    return defaultVal;
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

// 自動生成下一組 RANK-HIS-數字 流水號
function generateNextHistoryId() {
    const numbers = appState.history
        .map(h => {
            const match = String(h.history_id).match(/RANK-HIS-(\d+)/i);
            return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => !isNaN(n));
    const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
    return `RANK-HIS-${String(maxNum + 1).padStart(3, '0')}`;
}

// ==========================================================================
// 系統狀態管理 (State Management)
// ==========================================================================
let appState = {
    ranks: [],
    history: [],
    selectedRankId: ''
};

let historyDataTable = null;
let singlePartnerDataTable = null;
let partnerRankChartInstance = null;

// ==========================================================================
// 系統生命週期 (對接 common.js 廣播之 AppReady)
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
// 資料讀取引擎 (以欄位順序索引為主解析)
// ==========================================================================
async function fetchGoogleSheetsData() {
    try {
        AppLoading.show("讀取中...", "正在自試算表資料庫同步職級標準與歷程軌跡");

        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`通訊失敗: ${res.status}`);
            const text = await res.text();
            const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
            return (parsed.data || []).slice(1);
        };

        const [rankRows, historyRows] = await Promise.all([
            fetchSheet('職級主檔').catch(() => []),
            fetchSheet('職級歷程').catch(() => [])
        ]);

        appState.ranks = parseRanksTable(rankRows);
        appState.history = parseRankHistoryTable(historyRows);

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

// 依據 org_ranks (30 欄位順序解析)
function parseRanksTable(rows) {
    return rows.map((r, idx) => ({
        rank_id: getVal(r, 0, `RANK_${String(idx + 1).padStart(2, '0')}`),
        rank_code: getVal(r, 1, `R${(idx + 1) * 10}`),
        rank_level: parseInt(getVal(r, 2, String((idx + 1) * 10)), 10) || 0,
        rank_name_zh: getVal(r, 3, ''),
        rank_name_en: getVal(r, 4, ''),
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
        sort_order: parseInt(getVal(r, 24, String(idx + 1)), 10) || (idx + 1),
        is_active: getVal(r, 25, 'Y').toUpperCase(),
        created_by: getVal(r, 26, 'SYSTEM'),
        created_at: getVal(r, 27, ''),
        modified_by: getVal(r, 28, 'SYSTEM'),
        modified_at: getVal(r, 29, '')
    })).filter(r => r.rank_name_zh !== '').sort((a, b) => a.sort_order - b.sort_order);
}

// 依據 org_rank_history (17 欄位順序解析)
function parseRankHistoryTable(rows) {
    return rows.map((r, idx) => ({
        history_id: getVal(r, 0, `RANK-HIS-${String(idx + 1).padStart(3, '0')}`),
        partner_id: getVal(r, 1, ''),
        previous_rank_id: getVal(r, 2, ''),
        new_rank_id: getVal(r, 3, ''),
        effective_month: getVal(r, 4, ''),
        consecutive_qualified_months: parseInt(getVal(r, 5, '1'), 10) || 1,
        cum_group_sv_snapshot: parseFloat(getVal(r, 6, '0')) || 0,
        month_group_sv_snapshot: parseFloat(getVal(r, 7, '0')) || 0,
        active_manager_legs_count: parseInt(getVal(r, 8, '0'), 10) || 0,
        active_pearl_legs_count: parseInt(getVal(r, 9, '0'), 10) || 0,
        month_total_org_sv_snapshot: parseFloat(getVal(r, 10, '0')) || 0,
        company_recognition_date: getVal(r, 11, '-'),
        notes: getVal(r, 12, ''),
        created_by: getVal(r, 13, 'SYSTEM'),
        created_at: getVal(r, 14, ''),
        modified_by: getVal(r, 15, 'SYSTEM'),
        modified_at: getVal(r, 16, '')
    })).filter(h => h.partner_id !== '');
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
                <div class="font-chakra fw-bold small text-white">${rank.rank_code}</div>
                <div class="small text-muted text-truncate">${rank.rank_name_zh}</div>
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

    // 標題與基礎回饋率
    $('#activeRankCode').text(`代碼：${rank.rank_code}`).css('color', rank.badge_color_hex);
    $('#activeRankName').text(`${rank.rank_name_zh} ${rank.rank_name_en ? '(' + rank.rank_name_en + ')' : ''}`);
    $('#activeRebateRate').text(`${(rank.direct_rebate_rate * 100).toFixed(2)}%`);

    // 7 大晉升判斷依據指標
    $('#activePersonalSv').text(`${rank.month_personal_sv_req.toLocaleString()} SV`);
    $('#activeMonthGroupSv').text(`${rank.month_group_sv_req.toLocaleString()} SV`);
    $('#activeMonthOrgSv').text(rank.month_org_sv_req > 0 ? `${rank.month_org_sv_req.toLocaleString()} SV` : '無門檻');
    $('#activeCumSv').text(rank.cum_group_sv_req > 0 ? `${rank.cum_group_sv_req.toLocaleString()} SV` : '不歸零');
    $('#activeQualifiedLines').text(`${rank.qualified_lines_req} 條`);
    $('#activePearlLines').text(`${rank.pearl_lines_req} 條`);
    $('#activeConsecutiveMonths').text(`${rank.consecutive_months_req} 個月`);

    // 特權旗標渲染
    const $flags = $('#privilegeFlagsContainer').empty();
    const addFlag = (label, active, icon) => {
        const color = active ? 'text-success' : 'text-muted';
        const badgeClass = active 
            ? 'bg-success bg-opacity-25 border border-success border-opacity-50' 
            : 'bg-secondary bg-opacity-25 border border-secondary border-opacity-50';
        $flags.append(`
            <div class="col-6 col-md-4">
                <div class="p-2 rounded ${badgeClass} d-flex align-items-center gap-2">
                    <i class="${icon} ${color}"></i>
                    <span class="${color}">${label}</span>
                </div>
            </div>
        `);
    };

    addFlag(`階差獎金 ${(rank.direct_rebate_rate * 100).toFixed(0)}%`, true, 'fa-solid fa-percent');
    addFlag(`合格小組獎金 10%`, rank.has_group_bonus === 'Y', 'fa-solid fa-circle-check');
    addFlag(`合格經理獎金 5%`, rank.has_manager_bonus === 'Y', 'fa-solid fa-circle-check');
    addFlag(`全球領導獎金 ${rank.leadership_gen_depth} 代 (6%)`, rank.leadership_gen_depth > 0, 'fa-solid fa-layer-group');
    addFlag(`珍鑽分紅 5%`, rank.has_pearl_dividend === 'Y', 'fa-solid fa-gem');
    addFlag(`珍鑽年度卓越 5%`, rank.has_annual_excellence === 'Y', 'fa-solid fa-trophy');
    addFlag(`珍鑽旅遊獎勵 1.5%`, rank.has_travel_incentive === 'Y', 'fa-solid fa-plane-departure');
    addFlag(`購車基金 3.5% (頭款+分期)`, rank.has_car_fund === 'Y', 'fa-solid fa-car');
    addFlag(`業績自動補救權益`, rank.pearl_lines_req > 0 || rank.qualified_lines_req >= 4, 'fa-solid fa-shield-heart');
}

function populateRankSelects() {
    const $prev = $('#fieldPrevRankId').empty();
    const $new = $('#fieldNewRankId').empty();

    appState.ranks.forEach(r => {
        $prev.append(`<option value="${r.rank_id}">${r.rank_code} - ${r.rank_name_zh}</option>`);
        $new.append(`<option value="${r.rank_id}">${r.rank_code} - ${r.rank_name_zh}</option>`);
    });
}

// ==========================================================================
// 夥伴專屬戰況與缺口分析
// ==========================================================================
function populatePartnerDropdown() {
    const $select = $('#partnerSelect');
    const partners = [...new Set(appState.history.map(h => h.partner_id))].filter(Boolean);
    
    $select.empty();
    if (partners.length === 0) {
        $select.append('<option value="">暫無夥伴歷程</option>');
        return;
    }

    partners.forEach(ptn => {
        $select.append(`<option value="${ptn}">${ptn}</option>`);
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

    renderPartnerSummaryCards(ptnHistory);
    renderPartnerRankChart(ptnHistory);
    renderPartnerSingleTable(ptnHistory);
}

function renderPartnerSummaryCards(ptnHistory) {
    if (ptnHistory.length === 0) {
        $('#prevMonthRankBadge').text('-');
        $('#prevMonthConditions').html('尚無歷程資料');
        $('#nextRankTargetBadge').text('-');
        $('#nextRankGapDetails').html('無當前職級資訊');
        return;
    }

    const latest = ptnHistory[ptnHistory.length - 1];
    const latestRank = appState.ranks.find(r => r.rank_id === latest.new_rank_id) || {
        rank_name_zh: latest.new_rank_id,
        rank_level: 10,
        cum_group_sv_req: 0,
        month_personal_sv_req: 160,
        month_group_sv_req: 0,
        month_org_sv_req: 0,
        qualified_lines_req: 0,
        pearl_lines_req: 0,
        consecutive_months_req: 1
    };

    // 1. 上個月職級狀態（呈現 7 大指標快照）
    $('#prevMonthRankBadge').html(UIBadges.rank.badge(latestRank));
    $('#prevMonthConditions').html(`
        <div class="row g-2">
            <div class="col-6"><i class="fa-solid fa-calendar me-1"></i> 生效年月：<span class="text-white font-chakra">${latest.effective_month}</span></div>
            <div class="col-6"><i class="fa-solid fa-rotate me-1"></i> 連續達標：<span class="text-secondary font-chakra">${latest.consecutive_qualified_months} 個月</span></div>
            <div class="col-6"><i class="fa-solid fa-coins me-1"></i> 累積整組：<span class="text-warning font-chakra">${latest.cum_group_sv_snapshot.toLocaleString()} SV</span></div>
            <div class="col-6"><i class="fa-solid fa-users me-1"></i> 當月小組：<span class="text-info font-chakra">${latest.month_group_sv_snapshot.toLocaleString()} SV</span></div>
            <div class="col-6"><i class="fa-solid fa-chart-pie me-1"></i> 當月整組：<span class="text-accent font-chakra">${latest.month_total_org_sv_snapshot.toLocaleString()} SV</span></div>
            <div class="col-6"><i class="fa-solid fa-sitemap me-1"></i> 經理/珍珠線：<span class="text-success font-chakra">${latest.active_manager_legs_count} / ${latest.active_pearl_legs_count} 條</span></div>
        </div>
    `);

    // 2. 這個月差多少到下一個職級（依 7 大條件精算差額）
    const currentLevel = latestRank.rank_level || 10;
    const nextRank = appState.ranks.find(r => r.rank_level > currentLevel);

    if (!nextRank) {
        $('#nextRankTargetBadge').html('<span class="badge badge-success">已達最高榮譽職級</span>');
        $('#nextRankGapDetails').html('<span class="text-success"><i class="fa-solid fa-crown"></i> 目前已是最高階位（耀星藍鑽），持續維持領航！</span>');
    } else {
        $('#nextRankTargetBadge').html(`目標：${nextRank.rank_name_zh} (${nextRank.rank_code})`);

        const cumSvGap = Math.max(0, nextRank.cum_group_sv_req - latest.cum_group_sv_snapshot);
        const groupSvGap = Math.max(0, nextRank.month_group_sv_req - latest.month_group_sv_snapshot);
        const orgSvGap = Math.max(0, nextRank.month_org_sv_req - latest.month_total_org_sv_snapshot);
        const mgrLegsGap = Math.max(0, nextRank.qualified_lines_req - latest.active_manager_legs_count);
        const pearlLegsGap = Math.max(0, nextRank.pearl_lines_req - latest.active_pearl_legs_count);
        const monthsGap = Math.max(0, nextRank.consecutive_months_req - latest.consecutive_qualified_months);

        const renderGapItem = (label, gap, unit, currentVal, targetVal) => {
            if (targetVal === 0) return '';
            const isPassed = gap <= 0;
            return `
                <div class="d-flex justify-content-between align-items-center py-1 border-bottom border-purple-subtle">
                    <span>${label}：</span>
                    ${isPassed 
                        ? `<span class="badge badge-success-subtle"><i class="fa-solid fa-check"></i> 已達標 (${currentVal.toLocaleString()}/${targetVal.toLocaleString()})</span>` 
                        : `<span class="text-warning font-chakra fw-bold">差 ${gap.toLocaleString()} ${unit} (當前: ${currentVal.toLocaleString()})</span>`
                    }
                </div>
            `;
        };

        $('#nextRankGapDetails').html(`
            <div class="mb-2 fw-bold text-white">
                <i class="fa-solid fa-bullseye text-accent me-1"></i> 晉升目標：${nextRank.rank_name_zh}（需考核 ${nextRank.consecutive_months_req} 個月）
            </div>
            <div class="small">
                ${renderGapItem('1. 整組累計 SV', cumSvGap, 'SV', latest.cum_group_sv_snapshot, nextRank.cum_group_sv_req)}
                ${renderGapItem('2. 當月小組責任', groupSvGap, 'SV', latest.month_group_sv_snapshot, nextRank.month_group_sv_req)}
                ${renderGapItem('3. 當月整組總 SV', orgSvGap, 'SV', latest.month_total_org_sv_snapshot, nextRank.month_org_sv_req)}
                ${renderGapItem('4. 培育經理線', mgrLegsGap, '條', latest.active_manager_legs_count, nextRank.qualified_lines_req)}
                ${renderGapItem('5. 實動珍珠線', pearlLegsGap, '條', latest.active_pearl_legs_count, nextRank.pearl_lines_req)}
                ${nextRank.consecutive_months_req > 1 ? `
                    <div class="d-flex justify-content-between align-items-center py-1">
                        <span>6. 連續考核月數：</span>
                        ${monthsGap <= 0 
                            ? `<span class="badge badge-success-subtle"><i class="fa-solid fa-check"></i> 已滿足 (${latest.consecutive_qualified_months}/${nextRank.consecutive_months_req} 月)</span>` 
                            : `<span class="text-warning font-chakra fw-bold">尚需持續達標 ${monthsGap} 個月</span>`
                        }
                    </div>
                ` : ''}
            </div>
        `);
    }
}

function renderPartnerRankChart(ptnHistory) {
    const ctx = document.getElementById('partnerRankChart');
    if (!ctx) return;

    const labels = ptnHistory.map(h => h.effective_month);
    const dataPoints = ptnHistory.map(h => {
        const rank = appState.ranks.find(r => r.rank_id === h.new_rank_id);
        return rank ? rank.rank_level : 10;
    });

    if (partnerRankChartInstance) {
        partnerRankChartInstance.destroy();
    }

    partnerRankChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '職級位階',
                data: dataPoints,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.15)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#ec4899',
                pointBorderColor: '#ffffff',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 10,
                    max: 100,
                    ticks: {
                        stepSize: 10,
                        color: '#9e8eb3',
                        callback: val => {
                            const r = appState.ranks.find(x => x.rank_level === val);
                            return r ? r.rank_name_zh : `R${val}`;
                        }
                    },
                    grid: { color: 'rgba(139, 92, 246, 0.1)' }
                },
                x: {
                    ticks: { color: '#9e8eb3' },
                    grid: { color: 'rgba(139, 92, 246, 0.1)' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const val = ctx.parsed.y;
                            const r = appState.ranks.find(x => x.rank_level === val);
                            return ` 職級：${r ? r.rank_name_zh : `等級 ${val}`}`;
                        }
                    }
                }
            }
        }
    });
}

function renderPartnerSingleTable(ptnHistory) {
    const formatted = ptnHistory.map(h => {
        const prevRank = appState.ranks.find(r => r.rank_id === h.previous_rank_id);
        const newRank = appState.ranks.find(r => r.rank_id === h.new_rank_id);

        return {
            previous: prevRank ? UIBadges.rank.badge(prevRank) : `<span class="badge badge-gray">${h.previous_rank_id || '-'}</span>`,
            new_rank: newRank ? UIBadges.rank.badge(newRank) : `<span class="badge badge-purple">${h.new_rank_id || '-'}</span>`,
            effective_month: `<span class="font-chakra">${h.effective_month}</span>`,
            consecutive: `${h.consecutive_qualified_months} 個月`,
            cum_sv: `<span class="font-chakra">${h.cum_group_sv_snapshot.toLocaleString()} SV</span>`,
            manager_legs: `<span class="font-chakra text-center d-block">${h.active_manager_legs_count} 條</span>`,
            pearl_legs: `<span class="font-chakra text-center d-block">${h.active_pearl_legs_count} 條</span>`,
            recognition: h.company_recognition_date || '-',
            notes: h.notes || '-'
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
                { data: 'notes' }
            ],
            pageLength: 5,
            searching: false,
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
            partner_name: `<strong class="text-white">${h.partner_id}</strong>`,
            previous: prevRank ? UIBadges.rank.badge(prevRank) : `<span class="badge badge-gray">${h.previous_rank_id || '-'}</span>`,
            new_rank: newRank ? UIBadges.rank.badge(newRank) : `<span class="badge badge-purple">${h.new_rank_id || '-'}</span>`,
            effective_month: `<span class="font-chakra">${h.effective_month}</span>`,
            consecutive: `${h.consecutive_qualified_months} 個月`,
            cum_sv: `<span class="font-chakra">${h.cum_group_sv_snapshot.toLocaleString()} SV</span>`,
            manager_legs: `<span class="font-chakra text-center d-block">${h.active_manager_legs_count} 條</span>`,
            pearl_legs: `<span class="font-chakra text-center d-block">${h.active_pearl_legs_count} 條</span>`,
            recognition: h.company_recognition_date || '-',
            notes: `<span class="text-truncate d-inline-block" style="max-width: 160px;" title="${h.notes || ''}">${h.notes || '-'}</span>`,
            actions: actionBtns
        };
    });

    if (historyDataTable) {
        historyDataTable.clear();
        historyDataTable.rows.add(formatted);
        historyDataTable.draw();
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
            ],
            pageLength: 10
        });
    }
}

// ==========================================================================
// Select2 與彈窗互動處理
// ==========================================================================
function initPartnerSelect2() {
    const $partnerSelect = $('#fieldPartnerId');
    const partnerList = [...new Set(appState.history.map(h => h.partner_id))].filter(Boolean);
    
    $partnerSelect.empty().append('<option value="">請選擇或搜尋夥伴...</option>');
    partnerList.forEach(ptn => {
        $partnerSelect.append(`<option value="${ptn}">${ptn}</option>`);
    });

    if ($.fn.select2) {
        $partnerSelect.select2({
            dropdownParent: $('#rankHistoryModal'),
            placeholder: '請選擇或搜尋夥伴...',
            allowClear: true,
            width: '100%'
        });
    }
}

function openAddRankModal() {
    $('#modalHistoryTitle').html('<i class="fa-solid fa-plus text-accent"></i> 登錄夥伴職級晉升');
    $('#fieldHistoryMode').val('add');
    $('#formRankHistory')[0].reset();
    $('#fieldHistoryId').val(generateNextHistoryId());
    
    const now = new Date();
    const currentYm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    $('#fieldEffectiveMonth').val(currentYm);
    $('#fieldConsecutiveMonths').val('1');
    $('#fieldCumSvSnapshot').val('0');
    
    $('#fieldPartnerId').val('').trigger('change');
    new bootstrap.Modal(document.getElementById('rankHistoryModal')).show();
}

function openEditHistoryModal(historyId) {
    const item = appState.history.find(h => h.history_id === historyId);
    if (!item) return;

    $('#modalHistoryTitle').html('<i class="fa-solid fa-pen-to-square text-accent"></i> 編輯晉升審核紀錄');
    $('#fieldHistoryMode').val('edit');
    $('#fieldHistoryId').val(item.history_id);
    $('#fieldPartnerId').val(item.partner_id).trigger('change');
    $('#fieldPrevRankId').val(item.previous_rank_id);
    $('#fieldNewRankId').val(item.new_rank_id);
    $('#fieldEffectiveMonth').val(item.effective_month);
    $('#fieldConsecutiveMonths').val(item.consecutive_qualified_months);
    $('#fieldRecognitionDate').val(item.company_recognition_date !== '-' ? item.company_recognition_date : '');
    $('#fieldCumSvSnapshot').val(item.cum_group_sv_snapshot);
    $('#fieldManagerLegsSnapshot').val(item.active_manager_legs_count);
    $('#fieldPearlLegsSnapshot').val(item.active_pearl_legs_count);
    $('#fieldNotes').val(item.notes);

    new bootstrap.Modal(document.getElementById('rankHistoryModal')).show();
}

// ==========================================================================
// 試算表 C/U/D 寫入操作
// ==========================================================================
async function saveRankHistoryItem() {
    const mode = $('#fieldHistoryMode').val();
    const historyId = $('#fieldHistoryId').val().trim();
    const partnerId = $('#fieldPartnerId').val().trim();

    if (!partnerId) {
        AppToast.warning("請選擇或輸入夥伴名稱！");
        return;
    }

    const currentUser = getCurrentUser();
    const nowStr = getFormattedNow();
    const existing = appState.history.find(h => h.history_id === historyId);
    const createdBy = (mode === 'edit' && existing) ? existing.created_by : currentUser;
    const createdAt = (mode === 'edit' && existing) ? existing.created_at : nowStr;

    // 依據 org_rank_history (17 欄位順序封裝)
    const rowDataArray = [
        historyId,                                              // [0] history_id
        partnerId,                                              // [1] partner_id
        $('#fieldPrevRankId').val(),                            // [2] previous_rank_id
        $('#fieldNewRankId').val(),                             // [3] new_rank_id
        $('#fieldEffectiveMonth').val().trim(),                 // [4] effective_month
        parseInt($('#fieldConsecutiveMonths').val(), 10) || 1,  // [5] consecutive_qualified_months
        parseFloat($('#fieldCumSvSnapshot').val()) || 0,        // [6] cum_group_sv_snapshot
        0,                                                      // [7] month_group_sv_snapshot
        parseInt($('#fieldManagerLegsSnapshot').val(), 10) || 0,// [8] active_manager_legs_count
        parseInt($('#fieldPearlLegsSnapshot').val(), 10) || 0,  // [9] active_pearl_legs_count
        0,                                                      // [10] month_total_org_sv_snapshot
        $('#fieldRecognitionDate').val() || '-',                // [11] company_recognition_date
        $('#fieldNotes').val().trim(),                          // [12] notes
        createdBy,                                              // [13] created_by
        createdAt,                                              // [14] created_at
        currentUser,                                            // [15] modified_by
        nowStr                                                  // [16] modified_at
    ];

    const updatedObj = {
        history_id: historyId,
        partner_id: partnerId,
        previous_rank_id: $('#fieldPrevRankId').val(),
        new_rank_id: $('#fieldNewRankId').val(),
        effective_month: $('#fieldEffectiveMonth').val().trim(),
        consecutive_qualified_months: parseInt($('#fieldConsecutiveMonths').val(), 10) || 1,
        cum_group_sv_snapshot: parseFloat($('#fieldCumSvSnapshot').val()) || 0,
        month_group_sv_snapshot: 0,
        active_manager_legs_count: parseInt($('#fieldManagerLegsSnapshot').val(), 10) || 0,
        active_pearl_legs_count: parseInt($('#fieldPearlLegsSnapshot').val(), 10) || 0,
        month_total_org_sv_snapshot: 0,
        company_recognition_date: $('#fieldRecognitionDate').val() || '-',
        notes: $('#fieldNotes').val().trim(),
        created_by: createdBy,
        created_at: createdAt,
        modified_by: currentUser,
        modified_at: nowStr
    };

    try {
        if (mode === 'add') {
            await SheetAdapter.createRow('org_rank_history', historyId, rowDataArray, GAS_DEPLOY_ID);
            appState.history.unshift(updatedObj);
        } else {
            await SheetAdapter.updateRow('org_rank_history', historyId, rowDataArray, GAS_DEPLOY_ID);
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
        await SheetAdapter.deleteRow('org_rank_history', historyId, GAS_DEPLOY_ID);
        appState.history = appState.history.filter(h => h.history_id !== historyId);
        refreshView();
        AppToast.success(`晉升紀錄【${historyId}】已成功刪除！`);
    } catch (err) {
        AppToast.error("刪除失敗：" + err.message);
    }
}