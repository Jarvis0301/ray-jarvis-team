/**
 * ============================================================================
 * Rank Simulator & Tactical Advancement Console (tool-rank.js)
 * Official UVACO English Localization Version
 * Ray's Team Tactical Operations Platform
 * ============================================================================
 */

// ==========================================================================
// 1. Google Sheets Configuration & Adapter Pattern Constants
// ==========================================================================
const SPREADSHEET_ID = {
    ORG: APP_CONFIG?.SHEETS?.ORG || ''
};

const SHEET_NAMES = {
    RANKS: APP_CONFIG?.SHEET_NAMES?.ORG?.RANKS || '職級主檔'
};

// ==========================================================================
// 2. State Management & Currency Exchange Engine
// ==========================================================================
let appState = {
    ranks: [],
    activeRankList: [],
    currentRank: null,
    targetRank: null
};

let rankDataTableInstance = null;
let isInitialized = false;

// Currency & Exchange Rate State
let currentCurrency = APP_CONFIG.FIN?.DEFAULT_CURRENCY || 'TWD';

/**
 * Retrieves the active exchange rate and currency factor configuration
 */
function getCurrencyFactor() {
    const defaultRate = APP_CONFIG.FIN?.EXCHANGE_RATE?.MYR_TWD || 8.00;
    const exchangeRate = parseFloat($('#inputExchangeRate').val()) || defaultRate;
    const isMYR = (currentCurrency === 'MYR');
    return {
        symbol: isMYR ? 'RM' : 'NT$',
        rate: isMYR ? AppCalc.divide(1, exchangeRate, 6) : 1,
        pv: isMYR ? (APP_CONFIG.ORG?.PV_RATE?.MY || 3.5) : (APP_CONFIG.ORG?.PV_RATE?.TW || 25)
    };
}

/**
 * Formats values into localized currency strings with standard symbols
 */
function formatLocalCurrency(amount) {
    const { symbol } = getCurrencyFactor();
    return `${symbol} ${Math.round(amount).toLocaleString()}`;
}

/**
 * Converts baseline TWD amounts into current active currency format
 */
function formatMoney(amountInTwd) {
    const { symbol, rate } = getCurrencyFactor();
    const converted = Math.round(AppCalc.divide(amountInTwd * rate * 100, 100, 2));
    return `${symbol} ${converted.toLocaleString()}`;
}

/**
 * Resets all personal and organizational simulation parameters
 * @param {boolean} isSilent - Suppresses toast alerts on page load
 */
function resetSimulatorParams(isSilent = false) {
    $('.btn-preset').removeClass('active');
    $('#inputPersonalSv').val(0);
    $('#inputMonthGroupSv').val(0);
    $('#inputTotalOrgSv').val(0);
    $('#inputCumGroupSv').val(0);
    $('#inputManagerLines').val(0);
    $('#inputPearlLines').val(0);
    $('#inputConsecutiveMonths').val(1);

    runSimulation();

    if (!isSilent && typeof AppToast !== 'undefined') {
        AppToast.info("All simulation parameters have been reset.");
    }
}

// ==========================================================================
// 3. Application Lifecycle & Initialization
// ==========================================================================
window.addEventListener('AppReady', async () => {
    await initApp();
});

async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    $('#inputExchangeRate').val((APP_CONFIG.FIN?.EXCHANGE_RATE?.MYR_TWD || 8.00).toFixed(2));

    resetSimulatorParams(true);
    bindUIEvents();

    if (SPREADSHEET_ID.ORG) {
        await fetchGoogleSheetsData();
    } else {
        if (typeof AppToast !== 'undefined') {
            AppToast.error("Google Sheets ID is missing. Unable to fetch rank master data!");
        }
    }
}

// ==========================================================================
// 4. Cloud Rank Data Fetching & Decoupled Parsing Engine
// ==========================================================================
async function fetchGoogleSheetsData() {
    if (typeof AppLoading !== 'undefined') {
        AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i> Loading rank database...', 'Loading...');
    }

    try {
        const rawRows = await fetchGoogleSheetCsv(SPREADSHEET_ID.ORG, SHEET_NAMES.RANKS);

        if (!rawRows || rawRows.length === 0) {
            throw new Error("No valid data rows retrieved from the 'org_ranks' sheet.");
        }

        const parsedRanks = parseRanksTable(rawRows);
        appState.ranks = parsedRanks;
        appState.activeRankList = parsedRanks
            .filter(r => r.is_active === 'Y')
            .sort((a, b) => a.sort_order - b.sort_order);

        if (appState.activeRankList.length === 0) {
            throw new Error("No active rank records found (is_active='Y').");
        }

        populateTargetRankDropdown();
        renderRankDataTable();
        runSimulation();

        if (typeof AppToast !== 'undefined') {
            AppToast.success(`Synchronized ${appState.activeRankList.length} active rank standards.`);
        }
    } catch (err) {
        console.error("Google Sheets rank loading failure:", err);
        if (typeof AppDialog !== 'undefined') {
            AppDialog.alert("Failed to connect to Google Sheets. Please verify permissions or network connection.", {
                title: "Data Loading Error",
                icon: "fa-solid fa-triangle-exclamation text-danger"
            });
        }
    } finally {
        if (typeof AppLoading !== 'undefined') {
            AppLoading.hide();
        }
    }
}

/**
 * Maps CSV rows into structured rank objects according to the 33-column schema
 */
function parseRanksTable(rows) {
    return rows.map((r, idx) => {
        const rankNameZh = getVal(r, 3, 'Member');
        const rankNameEn = getVal(r, 4, '') || rankNameZh;

        return {
            rank_id: getVal(r, 0, `RANK_${String(idx + 1).padStart(2, '0')}`),
            rank_code: getVal(r, 1, `R${(idx + 1) * 10}`),
            rank_level: parseInt(getVal(r, 2, String((idx + 1) * 10)), 10) || 10,
            rank_name_zh: rankNameZh,
            rank_name_en: rankNameEn,
            star_rating: parseInt(getVal(r, 5, '0'), 10) || 0,
            cooling_period_month: parseInt(getVal(r, 6, '0'), 10) || 0,
            cum_group_sv_req: parseFloat(getVal(r, 7, '0')) || 0,
            month_personal_sv_req: parseFloat(getVal(r, 8, '0')) || 0,
            month_group_sv_req: parseFloat(getVal(r, 9, '0')) || 0,
            new_mgr_group_sv_req: parseFloat(getVal(r, 10, '0')) || 0,
            qualified_lines_req: parseInt(getVal(r, 11, '0'), 10) || 0,
            pearl_lines_req: parseInt(getVal(r, 12, '0'), 10) || 0,
            month_total_org_sv_req: parseFloat(getVal(r, 13, '0')) || 0,
            consecutive_months_req: parseInt(getVal(r, 14, '1'), 10) || 1,
            direct_rebate_rate: parseFloat(getVal(r, 15, '0.05')) || 0.05,
            leadership_gen_depth: parseInt(getVal(r, 16, '0'), 10) || 0,
            leadership_gen_rate: parseFloat(getVal(r, 17, '0.06')) || 0.06,
            has_group_bonus: getVal(r, 18, 'N').toUpperCase() === 'Y',
            has_manager_bonus: getVal(r, 19, 'N').toUpperCase() === 'Y',
            has_pearl_dividend: getVal(r, 20, 'N').toUpperCase() === 'Y',
            has_annual_excellence: getVal(r, 21, 'N').toUpperCase() === 'Y',
            has_travel_incentive: getVal(r, 22, 'N').toUpperCase() === 'Y',
            has_car_fund: getVal(r, 23, 'N').toUpperCase() === 'Y',
            car_reward_type: getVal(r, 24, ''),
            badge_icon_class: getVal(r, 25, 'fa-solid fa-award'),
            badge_color_hex: getVal(r, 26, '#6c757d'),
            sort_order: parseInt(getVal(r, 27, String(idx + 1)), 10) || (idx + 1),
            is_active: getVal(r, 28, 'Y').toUpperCase(),
            created_by: getVal(r, 29, 'SYSTEM'),
            created_at: getVal(r, 30, ''),
            modified_by: getVal(r, 31, 'SYSTEM'),
            modified_at: getVal(r, 32, '')
        };
    }).filter(item => item.rank_name_zh !== '' && item.rank_name_en !== '');
}

// ==========================================================================
// 5. UI Event Binding & Dropdown Population
// ==========================================================================
function bindUIEvents() {
    $('#inputPersonalSv, #inputCumGroupSv, #inputMonthGroupSv, #inputTotalOrgSv, #inputManagerLines, #inputPearlLines, #inputConsecutiveMonths, #selectTargetRank').off('input change').on('input change', function () {
        $('.btn-preset').removeClass('active');
        runSimulation();
    });

    $('#inputExchangeRate').off('input change').on('input change', function () {
        runSimulation();
        renderRankDataTable();
    });

    $('#currencyToggleGroup button').off('click').on('click', function () {
        $('#currencyToggleGroup button').removeClass('active');
        $(this).addClass('active');
        currentCurrency = $(this).data('currency');
        runSimulation();
        renderRankDataTable();
    });

    $('#btnClearParams').off('click').on('click', function () {
        resetSimulatorParams(false);
    });

    // Preset Benchmark Scenarios
    $('#btnPresetPartTime').off('click').on('click', function () {
        $('.btn-preset').removeClass('active');
        $(this).addClass('active');
        $('#inputPersonalSv').val(APP_CONFIG.ORG?.SV_LINE_ACTIVE || 160);
        $('#inputCumGroupSv').val(12000);
        $('#inputMonthGroupSv').val(APP_CONFIG.ORG?.SV_LINE_MANAGER || 3200);
        $('#inputTotalOrgSv').val(APP_CONFIG.ORG?.SV_LINE_MANAGER || 3200);
        $('#inputManagerLines').val(0);
        $('#inputPearlLines').val(0);
        $('#inputConsecutiveMonths').val(1);

        const mgrRank = appState.activeRankList.find(r => r.rank_code === 'R40' || r.rank_id.includes('MGR')) || appState.activeRankList[0];
        $('#selectTargetRank').val(mgrRank.rank_id).trigger('change');
        if (typeof AppToast !== 'undefined') AppToast.info("Applied 'Master' simulation preset");
    });

    $('#btnPresetFullTime').off('click').on('click', function () {
        $('.btn-preset').removeClass('active');
        $(this).addClass('active');$('#inputPersonalSv').val(APP_CONFIG.ORG?.SV_LINE_ACTIVE || 160);
        $('#inputCumGroupSv').val(80000);
        $('#inputMonthGroupSv').val(APP_CONFIG.ORG?.SV_LINE_MANAGER || 3200);
        $('#inputTotalOrgSv').val(45000);
        $('#inputManagerLines').val(4);
        $('#inputPearlLines').val(0);
        $('#inputConsecutiveMonths').val(1);

        const pearlRank = appState.activeRankList.find(r => r.rank_code === 'R70' || r.rank_id.includes('PEARL')) || appState.activeRankList[0];
        $('#selectTargetRank').val(pearlRank.rank_id).trigger('change');
        if (typeof AppToast !== 'undefined') AppToast.info("Applied 'Pearl Master' simulation preset");
    });

    $('#btnPresetDiamond').off('click').on('click', function () {
        $('.btn-preset').removeClass('active');
        $(this).addClass('active');$('#inputPersonalSv').val(APP_CONFIG.ORG?.SV_LINE_ACTIVE || 160);
        $('#inputCumGroupSv').val(500000);
        $('#inputMonthGroupSv').val(APP_CONFIG.ORG?.SV_LINE_MANAGER || 3200);
        $('#inputTotalOrgSv').val(100000);
        $('#inputManagerLines').val(10);
        $('#inputPearlLines').val(3);
        $('#inputConsecutiveMonths').val(4);

        const diamondRank = appState.activeRankList.find(r => r.rank_code === 'R90' || r.rank_id.includes('DIAMOND')) || appState.activeRankList[0];
        $('#selectTargetRank').val(diamondRank.rank_id).trigger('change');
        if (typeof AppToast !== 'undefined') AppToast.info("Applied 'Blue Diamond Master' simulation preset");
    });
}

/**
 * Populates target rank dropdown using official English nomenclature
 */
function populateTargetRankDropdown() {
    const $select =$('#selectTargetRank');
    if (!$select.length) return;

    const currentSelected = $select.val();

    if (typeof UISelectOptions !== 'undefined' && UISelectOptions.core) {
        UISelectOptions.core.render({
            target: '#selectTargetRank',
            data: appState.activeRankList,
            valueKey: 'rank_id',
            textKey: (r) => {
                const rebatePct = Math.round(r.direct_rebate_rate * 100);
                const rankName = r.rank_name_en || r.rank_name_zh;
                let note = `Rebate ${rebatePct}%`;
                if (r.qualified_lines_req > 0) note += ` · ${r.qualified_lines_req} Master Lines`;
                if (r.month_total_org_sv_req > 0) note += ` · Org ${Math.round(r.month_total_org_sv_req / 1000)}k SV`;
                return `${rankName} (${note})`;
            },
            placeholder: 'Select Target Rank...',
            selectedValue: currentSelected || '',
            searchable: false
        });
    } else {
        $select.empty();
        appState.activeRankList.forEach(r => {
            const rebatePct = Math.round(r.direct_rebate_rate * 100);
            const rankName = r.rank_name_en || r.rank_name_zh;
            let note = `Rebate ${rebatePct}%`;
            if (r.qualified_lines_req > 0) note += ` · ${r.qualified_lines_req} Master Lines`;
            if (r.month_total_org_sv_req > 0) note += ` · Org ${Math.round(r.month_total_org_sv_req / 1000)}k SV`;
            $select.append(`<option value="${r.rank_id}">${rankName} (${note})</option>`);
        });
    }

    if (currentSelected && appState.activeRankList.some(r => r.rank_id === currentSelected)) {
        $select.val(currentSelected);
    } else {
        const defaultTarget = appState.activeRankList.find(r => r.rank_code === 'R40') || appState.activeRankList[0];
        $select.val(defaultTarget.rank_id);
    }
}

// ==========================================================================
// 6. Simulation Algorithm: Dynamic Qualification & Earnings Engine
// ==========================================================================
function runSimulation() {
    if (!appState.activeRankList || appState.activeRankList.length === 0) return;

    const pSv = parseFloat($('#inputPersonalSv').val()) || 0;
    const cSv = parseFloat($('#inputCumGroupSv').val()) || 0;
    const mSv = parseFloat($('#inputMonthGroupSv').val()) || 0;
    const totalOrgSv = parseFloat($('#inputTotalOrgSv').val()) || 0;
    const lines = parseInt($('#inputManagerLines').val(), 10) || 0;
    const pearlLines = parseInt($('#inputPearlLines').val(), 10) || 0;
    const months = parseInt($('#inputConsecutiveMonths').val(), 10) || 1;
    const targetRankId = $('#selectTargetRank').val();

    // 1. Evaluate highest active qualified rank (descending traversal)
    let currentRank = appState.activeRankList[0];
    let hasAutoRescue = false;

    const sortedRanks = [...appState.activeRankList].sort((a, b) => b.rank_level - a.rank_level);

    for (let r of sortedRanks) {
        const isPersonalPass = (pSv >= r.month_personal_sv_req);
        
        // 檢查該階級是否符合 5 線補救資格 (必須是珍珠級 level >= 70 且 lines >= 5)
        const canUseRescue = (r.rank_level >= 70 && lines >= 5);
        const isGroupPass = (r.month_group_sv_req === 0) || (mSv >= r.month_group_sv_req) || canUseRescue;

        const isCumPass = (r.cum_group_sv_req === 0) || (cSv >= r.cum_group_sv_req);
        const isLinesPass = (lines >= r.qualified_lines_req);
        const isPearlPass = (pearlLines >= r.pearl_lines_req);
        const isOrgSvPass = (r.month_total_org_sv_req === 0) || (totalOrgSv >= r.month_total_org_sv_req);
        const isMonthsPass = (months >= r.consecutive_months_req);

        if (isPersonalPass && isGroupPass && isCumPass && isLinesPass && isPearlPass && isOrgSvPass && isMonthsPass) {
            currentRank = r;
            // ✅ 修復：只有在實質達到珍珠級以上且 lines >= 5 時，才正式確認啟動補救
            hasAutoRescue = (currentRank.rank_level >= 70 && lines >= 5);
            break;
        }
    }

    appState.currentRank = currentRank;
    const targetRank = appState.activeRankList.find(r => r.rank_id === targetRankId) || appState.activeRankList[1] || currentRank;
    appState.targetRank = targetRank;

    const curRankName = currentRank.rank_name_en || currentRank.rank_name_zh;
    const targetRankName = targetRank.rank_name_en || targetRank.rank_name_zh;

    // 2. Update Top KPI Matrix
    $('#dispCurrentRank').text(curRankName);
    $('#dispRebateRate').text(`${Math.round(currentRank.direct_rebate_rate * 100)}%`);
    $('#dispTargetRankName').text(targetRankName);
    $('#dispOrgLegs').html(`${lines} <span class="fs-6 fw-normal text-secondary">/ ${pearlLines} Pearl</span>`);
    $('#dispGenDepth').text(currentRank.leadership_gen_depth > 0 ? `${currentRank.leadership_gen_depth} Gen (6% each)` : 'No Depth');

    if (hasAutoRescue) {
        $('#dispRescueTag').removeClass('bg-secondary bg-success-subtle text-success').addClass('badge-warning text-dark').text('★ 5-Line Auto-Remedy Active');
    } else {
        $('#dispRescueTag').removeClass('badge-warning text-dark').addClass('badge-success-subtle').text('Standard Qualified');
    }

    // 3. Compensation Calculation (TW PV=25 / MY PV=3.5, Leadership Point Value=0.7)
    const { pv, rate: currencyRate } = getCurrencyFactor();
    const isMYR = (currentCurrency === 'MYR');
    const pointValue = APP_CONFIG.ORG?.LEADERSHIP_POINT_VALUE || 0.7;
    const managerSvLine = APP_CONFIG.ORG?.SV_LINE_MANAGER || 3200;

    $('#dispPvRate').text(`PV = ${pv}`);

    // Personal Active Maintenance Check
    const isPersonalQualified = pSv >= (currentRank.month_personal_sv_req || 160);
    // Group SV Met (Personal + non-Master group >= 3,200 SV)
    const isGroupSvReached = mSv >= managerSvLine;
    // Qualified Master Status (Group SV met OR Auto-Remedy active)
    const isManagerQualified = isPersonalQualified && (currentRank.rank_level >= 40) && (isGroupSvReached || hasAutoRescue);

    // Personal Tiered Rebate & Group Differential
    const rebateIncome = isPersonalQualified ? (pSv * currentRank.direct_rebate_rate * pv) : 0;
    const groupDiffIncome = isPersonalQualified ? (mSv * 0.10 * pv) : 0;

    // Fixed Qualified Pool Bonuses (Qualified Team NT$ 12,000 / Qualified Master NT$ 7,000)
    // Qualified Team Bonus strictly requires actual 3,200 SV group quota (Auto-Remedy excluded)
    const isGroupBonusQualified = isPersonalQualified && (currentRank.rank_level >= 40) && currentRank.has_group_bonus && isGroupSvReached;
    // Qualified Master Bonus allows Auto-Remedy beneficiaries
    const isManagerBonusQualified = isManagerQualified && currentRank.has_manager_bonus;

    const rawGroupBonus = isGroupBonusQualified ? 12000 : 0;
    const rawManagerBonus = isManagerBonusQualified ? 7000 : 0;

    // High-Rank Qualified Legs and Generational Depth Audit
    const reqActiveLines = currentRank.qualified_lines_req || 1;
    const reqPearlLines = Math.max(currentRank.qualified_lines_req || 0, 4);
    const isPearlLinesPass = (currentRank.pearl_lines_req === 0) || (pearlLines >= currentRank.pearl_lines_req);
    const isPearlTierQualified = isManagerQualified && (currentRank.rank_level >= 70) && (lines >= reqPearlLines) && isPearlLinesPass;

    // 1. Leadership Bonus: Qualified Master + Generational Depth + Master Lines Met
    const isLeadershipQualified = isManagerQualified && currentRank.leadership_gen_depth > 0 && (lines >= reqActiveLines);
    let rawLeadership = isLeadershipQualified 
        ? AppCalc.multiply(AppCalc.multiply(AppCalc.multiply(managerSvLine, currentRank.leadership_gen_rate, 4), pointValue, 4), pv, 2) * lines
        : 0;

    // 2. Dividend Bonus (5% Pool)
    let rawPearlDiv = (isPearlTierQualified && currentRank.has_pearl_dividend) ? (6000 * Math.max(1, lines)) : 0;

    // 3. Annual Excellence Rewards (5% Pool)
    const perLineAnnual = (currentRank.rank_level >= 90) ? 4600 : 3571;
    let rawExcellence = (isPearlTierQualified && currentRank.has_annual_excellence) ? (perLineAnnual * Math.max(1, lines)) : 0;

    // 4. Travel Rewards (1.5% Pool)
    const perLineTravel = (currentRank.rank_level >= 90) ? 1900 : 1428;
    let rawTravel = (isPearlTierQualified && currentRank.has_travel_incentive) ? (perLineTravel * Math.max(1, lines)) : 0;

    // 5. Dream Car Purchase Fund (3.5% Pool): Blue Diamond & Total Org SV Met
    let rawCarFund = (isPearlTierQualified && currentRank.has_car_fund && totalOrgSv >= currentRank.month_total_org_sv_req) ? 27000 : 0;

    // Currency Conversion
    const groupBonusIncome = isMYR ? Math.round(rawGroupBonus * currencyRate) : rawGroupBonus;
    const managerBonusIncome = isMYR ? Math.round(rawManagerBonus * currencyRate) : rawManagerBonus;
    const leadershipBonusIncome = isMYR ? Math.round(rawLeadership * currencyRate) : rawLeadership;
    const pearlDividendIncome = isMYR ? Math.round(rawPearlDiv * currencyRate) : rawPearlDiv;
    const excellenceIncome = isMYR ? Math.round(rawExcellence * currencyRate) : rawExcellence;
    const travelIncome = isMYR ? Math.round(rawTravel * currencyRate) : rawTravel;
    const carFundIncome = isMYR ? Math.round(rawCarFund * currencyRate) : rawCarFund;

    const incomes = [
        rebateIncome, groupDiffIncome, groupBonusIncome, managerBonusIncome,
        leadershipBonusIncome, pearlDividendIncome, excellenceIncome,
        travelIncome, carFundIncome
    ];
    const totalEstIncome = Math.round(incomes.reduce((sum, item) => AppCalc.add(sum, item), 0));

    $('#dispTotalIncome').text(formatLocalCurrency(totalEstIncome));
    $('#dispIncomeQuickTotal').text(formatLocalCurrency(totalEstIncome));

    const gapRates = [
        Math.min(100, Math.round((pSv / (targetRank.month_personal_sv_req || 160)) * 100)),
        Math.min(100, Math.round((targetRank.cum_group_sv_req === 0 ? 100 : (cSv / targetRank.cum_group_sv_req) * 100))),
        Math.min(100, Math.round((targetRank.month_group_sv_req === 0 ? 100 : (mSv / targetRank.month_group_sv_req) * 100))),
        Math.min(100, Math.round((targetRank.qualified_lines_req === 0 ? 100 : (lines / targetRank.qualified_lines_req) * 100))),
        Math.min(100, Math.round((targetRank.pearl_lines_req === 0 ? 100 : (pearlLines / targetRank.pearl_lines_req) * 100))),
        Math.min(100, Math.round((targetRank.month_total_org_sv_req === 0 ? 100 : (totalOrgSv / targetRank.month_total_org_sv_req) * 100)))
    ];

    renderDashboardCharts({
        rebateIncome,
        groupDiffIncome,
        groupBonusIncome,
        managerBonusIncome,
        leadershipBonusIncome,
        pearlDividendIncome,
        excellenceIncome,
        travelIncome,
        carFundIncome
    }, currentRank, targetRank, { rates: gapRates });

    evaluateTargetGaps(targetRank, pSv, cSv, mSv, totalOrgSv, lines, pearlLines, months);
    renderTargetRightsPills(targetRank);
    renderGateChecklist(targetRank, pSv, cSv, mSv, totalOrgSv, lines, pearlLines, months);
    renderIncomeBreakdownTable(
        rebateIncome, groupDiffIncome, groupBonusIncome, managerBonusIncome,
        leadershipBonusIncome, pearlDividendIncome, excellenceIncome, travelIncome,
        carFundIncome, totalEstIncome, currentRank, pv, {
            lines, pearlLines, isGroupSvReached, hasAutoRescue, reqActiveLines, reqPearlLines
        }
    );
    renderTopologyRescue(lines, pearlLines, hasAutoRescue, currentRank);
}

/**
 * Diagnostic gap analysis against the target advancement rank
 */
function evaluateTargetGaps(target, pSv, cSv, mSv, totalOrgSv, lines, pearlLines, months) {
    const targetName = target.rank_name_en || target.rank_name_zh;
    const gapP = Math.max(0, target.month_personal_sv_req - pSv);
    const gapC = Math.max(0, target.cum_group_sv_req - cSv);
    const gapM = Math.max(0, target.month_group_sv_req - mSv);
    const gapOrg = Math.max(0, target.month_total_org_sv_req - totalOrgSv);
    const gapLines = Math.max(0, target.qualified_lines_req - lines);
    const gapPearl = Math.max(0, target.pearl_lines_req - pearlLines);
    const gapMonths = Math.max(0, target.consecutive_months_req - months);

    let totalWeight = 20;
    const pRatio = Math.min(1, AppCalc.divide(pSv, (target.month_personal_sv_req || 160), 4));
    let currentScore = pRatio * 20;

    if (target.cum_group_sv_req > 0) {
        totalWeight += 20;
        currentScore += Math.min(1, cSv / target.cum_group_sv_req) * 20;
    }
    if (target.month_group_sv_req > 0) {
        totalWeight += 20;
        currentScore += Math.min(1, mSv / target.month_group_sv_req) * 20;
    }
    if (target.qualified_lines_req > 0) {
        totalWeight += 20;
        currentScore += Math.min(1, lines / target.qualified_lines_req) * 20;
    }
    if (target.pearl_lines_req > 0 || target.month_total_org_sv_req > 0) {
        totalWeight += 20;
        let sub = 0;
        if (target.pearl_lines_req > 0) sub += Math.min(1, pearlLines / target.pearl_lines_req) * 10;
        if (target.month_total_org_sv_req > 0) sub += Math.min(1, totalOrgSv / target.month_total_org_sv_req) * 10;
        currentScore += sub;
    }

    let progressPct = Math.min(100, Math.round(AppCalc.divide(currentScore * 100, totalWeight, 2)));
    $('#dispOverallProgress').text(progressPct + '%');

    const isQualified = (gapP === 0 && gapC === 0 && gapM === 0 && gapOrg === 0 && gapLines === 0 && gapPearl === 0 && gapMonths === 0);

    const $box =$('#boxGapAnalysis');
    const $title =$('#txtGapTitle');
    const $list =$('#listGapItems');
    $list.empty();

    if (isQualified) {
        $box.addClass('qualified');$title.removeClass('text-warning').addClass('text-success')
              .html(`<i class="fa-solid fa-circle-check me-1"></i> Congratulations! Fully qualified for [${targetName}]`);
        $list.append(`<li class="text-success"><i class="fa-solid fa-check me-1"></i> All personal SV, group SV, Master lines, and consecutive month criteria are met.</li>`);
        if (target.cooling_period_month > 0) {
            $list.append(`<li class="text-info"><i class="fa-solid fa-hourglass-half me-1"></i> Note: Advancement beyond Blue Diamond requires a ${target.cooling_period_month}-month cooling period.</li>`);
        }
        $('#dispProgressLabel').text('Fully Qualified');
    } else {
        $box.removeClass('qualified');$title.addClass('text-warning').removeClass('text-success')
              .html(`<i class="fa-solid fa-triangle-exclamation me-1"></i> Sprinting to [${targetName}] - Remaining Gaps:`);

        if (gapP > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-secondary me-1"></i> Personal SV Remaining: <strong class="text-danger">${gapP.toLocaleString()} SV</strong> (Target: ${target.month_personal_sv_req.toLocaleString()} SV)</li>`);
        if (gapC > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-secondary me-1"></i> Cumulative Group SV Remaining: <strong class="text-warning">${gapC.toLocaleString()} SV</strong> (Threshold: ${target.cum_group_sv_req.toLocaleString()} SV)</li>`);
        if (gapM > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-secondary me-1"></i> Monthly Group SV Remaining: <strong class="text-warning">${gapM.toLocaleString()} SV</strong> (Target: ${target.month_group_sv_req.toLocaleString()} SV)</li>`);
        if (gapOrg > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-secondary me-1"></i> Total Org SV Remaining: <strong class="text-warning">${gapOrg.toLocaleString()} SV</strong> (Target: ${target.month_total_org_sv_req.toLocaleString()} SV)</li>`);
        if (gapLines > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-secondary me-1"></i> Qualified Master Lines Remaining: <strong class="text-warning">${gapLines} Lines</strong> (Threshold: ${target.qualified_lines_req} Lines)</li>`);
        if (gapPearl > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-secondary me-1"></i> Active Pearl Lines Remaining: <strong class="text-warning">${gapPearl} Lines</strong> (Target: ${target.pearl_lines_req} Lines)</li>`);
        if (gapMonths > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-secondary me-1"></i> Consecutive Qualifying Months Remaining: <strong class="text-warning">${gapMonths} Mos</strong> (Target: ${target.consecutive_months_req} Mos)</li>`);
        if (target.cooling_period_month > 0) {
            $list.append(`<li class="text-secondary"><i class="fa-solid fa-clock-rotate-left me-1"></i> Cooling Period: Requires ${target.cooling_period_month} months maintenance after qualification before advancing further.</li>`);
        }
        $('#dispProgressLabel').text(`In Progress (${progressPct}%)`);
    }
}

/**
 * Renders target rank privileges badges
 */
function renderTargetRightsPills(target) {
    const $container =$('#containerRightsPills');
    $container.empty();

    const rights = [];
    rights.push(`Tiered Bonus ${Math.round(target.direct_rebate_rate * 100)}%`);
    if (target.has_group_bonus) rights.push('Qualified Team Bonus 10%');
    if (target.has_manager_bonus) rights.push('Qualified Master Bonus 5%');
    if (target.leadership_gen_depth > 0) rights.push(`Leadership Bonus ${target.leadership_gen_depth} Gen (6% each)`);
    if (target.has_pearl_dividend) rights.push('Dividend Bonus 5%');
    if (target.has_annual_excellence) rights.push('Annual Excellence Rewards 5%');
    if (target.has_travel_incentive) rights.push('Travel Rewards 1.5%');
    if (target.has_car_fund) {
        const carText = target.car_reward_type ? `Dream Car Purchase Fund (${target.car_reward_type})` : 'Dream Car Purchase Fund (NT$ 700k down payment + NT$ 1M installments)';
        rights.push(carText);
    }
    if (target.star_rating > 0) {
        rights.push(`Blue Diamond Rating: ★ ${target.star_rating}-Star Honor`);
    }

    rights.forEach((r, idx) => {
        const isGold = (idx >= 3 || r.includes('Dividend') || r.includes('Car') || r.includes('Star'));
        if (typeof UIBadges !== 'undefined' && UIBadges.rank && UIBadges.rank.rightPill) {
            $container.append(UIBadges.rank.rightPill(r, isGold));
        } else {
            const pillClass = isGold ? 'badge-yellow-subtle' : 'badge-primary-subtle';
            $container.append(`<span class="${pillClass}"><i class="fa-solid fa-check me-1"></i> ${r}</span>`);
        }
    });
}

// ==========================================================================
// 7. Tactical Module Renderers (Checklist, Breakdown, Topology)
// ==========================================================================
function renderGateChecklist(target, pSv, cSv, mSv, totalOrgSv, lines, pearlLines, months) {
    const $container =$('#gateChecklistContainer');
    $container.empty();

    const gates = [
        {
            name: "Personal Maintenance",
            val: `${pSv.toLocaleString()} / ${target.month_personal_sv_req.toLocaleString()} SV`,
            pass: pSv >= target.month_personal_sv_req,
            icon: "fa-solid fa-cart-shopping"
        },
        {
            name: "Cumulative Group SV",
            val: `${cSv.toLocaleString()} / ${target.cum_group_sv_req.toLocaleString()} SV`,
            pass: target.cum_group_sv_req === 0 || cSv >= target.cum_group_sv_req,
            icon: "fa-solid fa-boxes-stacked"
        },
        {
            name: "Monthly Group SV",
            val: `${mSv.toLocaleString()} / ${target.month_group_sv_req.toLocaleString()} SV`,
            pass: target.month_group_sv_req === 0 || mSv >= target.month_group_sv_req,
            icon: "fa-solid fa-users"
        },
        {
            name: "Qualified Master Lines",
            val: `${lines} / ${target.qualified_lines_req} Lines`,
            pass: target.qualified_lines_req === 0 || lines >= target.qualified_lines_req,
            icon: "fa-solid fa-network-wired"
        },
        {
            name: "Active Pearl Lines",
            val: `${pearlLines} / ${target.pearl_lines_req} Lines`,
            pass: target.pearl_lines_req === 0 || pearlLines >= target.pearl_lines_req,
            icon: "fa-solid fa-gem"
        },
        {
            name: "Monthly Org SV",
            val: `${totalOrgSv.toLocaleString()} / ${target.month_total_org_sv_req.toLocaleString()} SV`,
            pass: target.month_total_org_sv_req === 0 || totalOrgSv >= target.month_total_org_sv_req,
            icon: "fa-solid fa-globe"
        },
        {
            name: "Consecutive Months",
            val: `${months} / ${target.consecutive_months_req} Mos`,
            pass: months >= target.consecutive_months_req,
            icon: "fa-solid fa-calendar-check"
        }
    ];

    gates.forEach(g => {
        const badgeClass = g.pass ? 'badge-success-subtle' : 'badge-danger-subtle';
        const iconPass = g.pass ? '<i class="fa-solid fa-circle-check text-success me-1"></i>' : '<i class="fa-solid fa-circle-xmark text-danger me-1"></i>';

        $container.append(`
            <div class="card-incard p-2 px-3 rounded-3 d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center gap-2">
                    <span class="text-secondary"><i class="${g.icon}"></i></span>
                    <span class="small text-white">${g.name}</span>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <span class="small text-secondary">${g.val}</span>
                    <span class="badge ${badgeClass}">${iconPass}${g.pass ? 'Passed' : 'Pending'}</span>
                </div>
            </div>
        `);
    });
}

function renderIncomeBreakdownTable(rebate, groupDiff, groupBonus, managerBonus, leadership, pearlDiv, excellence, travel, carFund, total, currentRank, pv, status) {
    const $tbody =$('#incomeBreakdownTableBody');
    $tbody.empty();

    const carDesc = currentRank.has_car_fund
        ? (currentRank.car_reward_type ? `Dream Car Fund (${currentRank.car_reward_type})` : "NT$ 1M / 36 Monthly Installments")
        : "Exclusive to Blue Diamond Master and above";

    let leaderDesc = "No generational depth unlocked";
    if (currentRank.leadership_gen_depth > 0) {
        if (status.lines < status.reqActiveLines) {
            leaderDesc = `Insufficient Master lines (Requires >= ${status.reqActiveLines})`;
        } else {
            leaderDesc = `${currentRank.leadership_gen_depth} Gen × 6% × 0.7 Point Value (${status.lines} lines)`;
        }
    }

    const pearlLineDesc = (status.lines < status.reqPearlLines) ? `Insufficient active lines (Requires >= ${status.reqPearlLines} Master lines)` : "Ineligible for Dividend Bonus";

    const items = [
        { label: "Personal Tiered Rebate", desc: `Personal SV × ${Math.round(currentRank.direct_rebate_rate * 100)}% × ${pv} PV`, amount: rebate, color: "text-white" },
        { label: "Group Differential Spread", desc: `Personal group approx. 10% spread × ${pv} PV`, amount: groupDiff, color: "text-white" },
        {
            label: "Qualified Team Bonus (10%)",
            desc: groupBonus > 0
                ? "Personal group maintenance met (>= 3,200 SV)"
                : (status.hasAutoRescue ? "Group SV < 3,200 SV (Auto-remedy excluded)" : "Group SV under 3,200 SV quota"),
            amount: groupBonus,
            color: groupBonus > 0 ? "text-white" : "text-secondary"
        },
        {
            label: "Qualified Master Bonus (5%)",
            desc: managerBonus > 0
                ? (status.hasAutoRescue ? "Qualified Master (Auto-remedy active)" : "Qualified Master group quota met")
                : "Ineligible for Master qualification",
            amount: managerBonus,
            color: managerBonus > 0 ? "text-white" : "text-secondary"
        },
        { label: "Leadership Bonus (6%)", desc: leaderDesc, amount: leadership, color: leadership > 0 ? "text-warning" : "text-secondary" },
        { label: "Dividend Bonus (5%)", desc: pearlDiv > 0 ? `Weighted by ${status.lines} active Master lines` : pearlLineDesc, amount: pearlDiv, color: pearlDiv > 0 ? "text-warning" : "text-secondary" },
        { label: "Annual Excellence Rewards (5%)", desc: excellence > 0 ? `Annual Jan-Dec cumulative (Monthly amortized, ${status.lines} lines)` : pearlLineDesc, amount: excellence, color: excellence > 0 ? "text-warning" : "text-secondary" },
        { label: "Travel Rewards (1.5%)", desc: travel > 0 ? `Annual Jul-Jun cumulative (Monthly amortized, ${status.lines} lines)` : pearlLineDesc, amount: travel, color: travel > 0 ? "text-warning" : "text-secondary" },
        { label: "Dream Car Purchase Fund (3.5%)", desc: carDesc, amount: carFund, color: carFund > 0 ? "text-warning" : "text-secondary" }
    ];

    items.forEach(item => {
        $tbody.append(`
            <tr>
                <td>
                    <div class="fw-bold ${item.color} small">${item.label}</div>
                    <div class="text-secondary" style="font-size: 0.72rem;">${item.desc}</div>
                </td>
                <td class="text-end align-middle fw-bold ${item.amount > 0 ? item.color : 'text-secondary'}">
                    ${formatLocalCurrency(item.amount)}
                </td>
            </tr>
        `);
    });

    $tbody.append(`
        <tr class="border-top border-secondary border-opacity-50">
            <td class="fw-bold text-warning">Estimated Total Monthly Earnings</td>
            <td class="text-end align-middle fw-bold text-warning fs-6">
                ${formatLocalCurrency(total)}
            </td>
        </tr>
    `);
}

function renderTopologyRescue(lines, pearlLines, hasAutoRescue, currentRank) {
    const $container =$('#topologyRescueContainer');
    $container.empty();
    const mgrSvText = (APP_CONFIG.ORG?.SV_LINE_MANAGER || 3200).toLocaleString();

    $container.append(`
        <div class="card-incard p-3 rounded-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="small text-secondary fw-bold"><i class="fa-solid fa-sitemap text-secondary me-1"></i> Direct Qualified Master Lines Topology</span>
                <span class="badge badge-secondary">${lines} Active Lines</span>
            </div>
            <div class="d-flex gap-1 flex-wrap">
                ${Array.from({ length: Math.max(10, lines) }).map((_, i) => {
                    const isFilled = i < lines;
                    const isPearl = i < pearlLines;
                    let color = isPearl ? 'btn-outline-warning' : (isFilled ? 'btn-outline-secondary' : 'btn-outline-muted');
                    return `<button type="button" class="btn btn-sm ${color} py-0 px-2" style="font-size: 0.75rem;" disabled>${i + 1}${isPearl ? '★' : ''}</button>`;
                }).join('')}
            </div>
            <div class="text-secondary small mt-2" style="font-size: 0.75rem;">
                Marked ★ represents active Pearl Master lines (Independent leg calculation; max 1 per leg).
            </div>
        </div>
    `);

    const rescueStatusHtml = hasAutoRescue
        ? `<div class="card-incard p-3 rounded-3 border-warning">
                <div class="d-flex align-items-center gap-2 text-warning fw-bold small mb-1">
                    <i class="fa-solid fa-shield-cat fs-5 me-1"></i> 5th Line Performance Auto-Remedy Active
                </div>
                <div class="text-warning small" style="font-size: 0.78rem;">
                    You have developed 5+ qualified Master lines. Group SV from the 5th line automatically covers your ${mgrSvText} SV group quota, eliminating maintenance stress (★ Note: Qualified Team Bonus still requires actual group SV).
                </div>
           </div>`
        : `<div class="card-incard p-3 rounded-3">
                <div class="d-flex align-items-center gap-2 text-secondary fw-bold small mb-1">
                    <i class="fa-solid fa-shield text-secondary me-1"></i> Performance Auto-Remedy Rule
                </div>
                <div class="text-secondary small" style="font-size: 0.78rem;">
                    Leaders at Pearl Master rank or above with 5+ qualified Master lines unlock the auto-remedy mechanism, waiving the monthly ${mgrSvText} SV quota (Qualified Team Bonus still requires actual group SV).
                </div>
           </div>`;

    $container.append(rescueStatusHtml);
}

// ==========================================================================
// 8. Chart.js & DataTable.js Integration
// ==========================================================================
function renderDashboardCharts(incomeData, currentRank, targetRank, currentGaps) {
    const { symbol: currencySymbol } = getCurrencyFactor();

    const bonusItems = [
        { label: 'Personal Rebate', val: incomeData.rebateIncome },
        { label: 'Group Spread', val: incomeData.groupDiffIncome },
        { label: 'Qualified Team Bonus', val: incomeData.groupBonusIncome },
        { label: 'Qualified Master Bonus', val: incomeData.managerBonusIncome },
        { label: 'Leadership Bonus', val: incomeData.leadershipBonusIncome },
        { label: 'Dividend Bonus', val: incomeData.pearlDividendIncome },
        { label: 'Annual Excellence', val: incomeData.excellenceIncome },
        { label: 'Travel Rewards', val: incomeData.travelIncome },
        { label: 'Dream Car Fund', val: incomeData.carFundIncome }
    ].filter(i => i.val > 0);

    const totalIncome = bonusItems.reduce((acc, cur) => acc + cur.val, 0);

    // Chart 1: Earnings Structure Doughnut Chart
    AppChart.render('chartBonusPie', AppChart.createDoughnut({
        labels: bonusItems.map(i => i.label),
        data: bonusItems.map(i => Math.round(i.val)),
        colors: [
            '#38bdf8', '#0284c7', '#10b981', '#34d399', '#facc15',
            '#f59e0b', '#ec4899', '#8b5cf6', '#6366f1'
        ],
        unit: currencySymbol,
        centerKpi: {
            label: 'Est. Gross Earnings',
            value: formatLocalCurrency(totalIncome)
        }
    }));

    // Chart 2: 6-Dimensional Target Gap Radar Chart
    AppChart.render('chartGapsRadar', AppChart.createRadar({
        labels: ['Personal SV', 'Cumulative SV', 'Group SV', 'Master Lines', 'Pearl Lines', 'Total Org SV'],
        datasets: [{
            label: 'Achievement Rate',
            data: currentGaps.rates,
            color: '#8b5cf6',
            fill: true
        }],
        suggestedMax: 100,
        unit: '%'
    }));

    // Chart 3: Benchmark Rank Income Comparison Bar Chart
    const ranksSample = appState.activeRankList.slice(0, 7);
    const sampleIncomesTwd = [1200, 4800, 19000, 32000, 65000, 145000, 280000];
    const { rate: currencyRate } = getCurrencyFactor();

    const barColors = ranksSample.map(r => r.rank_id === currentRank.rank_id ? '#fbbf24' : '#8b5cf6');

    AppChart.render('chartRankIncomeBar', AppChart.createBar({
        labels: ranksSample.map(r => r.rank_name_en || r.rank_name_zh),
        data: sampleIncomesTwd.slice(0, ranksSample.length).map(v => Math.round(v * currencyRate)),
        datasetLabel: 'Benchmark Estimate',
        colors: barColors,
        isHorizontal: false,
        unit: currencySymbol,
        yStepInteger: false
    }));
}

/**
 * Renders the Official UVACO Rank Dictionary Matrix (DataTable.js)
 */
function renderRankDataTable() {
    if (!$('#tableRankDictionary').length) return;

    const formatted = appState.activeRankList.map(r => {
        let conds = [];
        if (r.month_personal_sv_req > 0) conds.push(`Personal ${Number(r.month_personal_sv_req).toLocaleString()} SV`);
        if (r.cum_group_sv_req > 0) conds.push(`Cumulative ${Number(r.cum_group_sv_req).toLocaleString()} SV`);
        if (r.month_group_sv_req > 0) conds.push(`Group ${Number(r.month_group_sv_req).toLocaleString()} SV`);
        if (r.qualified_lines_req > 0) conds.push(`${r.qualified_lines_req} Master Lines`);
        if (r.pearl_lines_req > 0) conds.push(`${r.pearl_lines_req} Pearl Lines`);
        if (r.month_total_org_sv_req > 0) conds.push(`Total Org ${Number(r.month_total_org_sv_req).toLocaleString()} SV`);
        if (r.consecutive_months_req > 1) conds.push(`${r.consecutive_months_req} Consecutive Mos`);
        if (r.cooling_period_month > 0) conds.push(`${r.cooling_period_month}-Mo Cooling Period`);

        let rightsArr = [];
        if (r.has_group_bonus) rightsArr.push('Team 10%');
        if (r.has_manager_bonus) rightsArr.push('Master 5%');
        if (r.has_pearl_dividend) rightsArr.push('Dividend 5%');
        if (r.has_annual_excellence) rightsArr.push('Excellence 5%');
        if (r.has_travel_incentive) rightsArr.push('Travel 1.5%');
        if (r.has_car_fund) rightsArr.push(r.car_reward_type ? `Car (${r.car_reward_type})` : 'Dream Car Fund');

        const rankName = r.rank_name_en || r.rank_name_zh;
        const badgeHtml = (typeof UIBadges !== 'undefined' && UIBadges.rank && UIBadges.rank.badge)
            ? UIBadges.rank.badge(r)
            : `<span class="badge" style="background-color: ${r.badge_color_hex || '#6c757d'}">${rankName}</span>`;

        return {
            rank: badgeHtml,
            conditions: conds.join(' ‧ ') || `Starter Kit ${formatMoney(1000)}`,
            rebate_rate: `${Math.round(r.direct_rebate_rate * 100)}%`,
            leadership: r.leadership_gen_depth > 0 ? `${r.leadership_gen_depth} Gen (6%)` : '—',
            rights: rightsArr.join(' ‧ ') || 'Personal Tiered Rebate'
        };
    });

    if (rankDataTableInstance) {
        rankDataTableInstance.clear().rows.add(formatted).draw();
    } else {
        rankDataTableInstance = $('#tableRankDictionary').DataTable({
            data: formatted,
            searching: false,
            ordering: false,
            info: false,
            paging: false,
            columns: [
                { data: 'rank', className: 'text-nowrap text-center' },
                { data: 'conditions', className: 'text-light small' },
                { data: 'rebate_rate', className: 'text-end text-warning fw-bold' },
                { data: 'leadership', className: 'text-end text-success' },
                { data: 'rights', className: 'text-secondary small' }
            ]
        });
    }
}