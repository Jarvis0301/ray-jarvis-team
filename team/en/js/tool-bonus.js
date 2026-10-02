/**
 * ============================================================================
 * UVACO Compensation Plan & Bonus Simulation Engine (tool-bonus.js)
 * Designed for Ray's Team Tactical Console (Led by Ray Weng & Jarvis Lin)
 * Integrates APP_CONFIG Global Settings, Dual-Currency (TW/MY) Fx Engine,
 * and High-Precision AppCalc Arithmetic Module.
 * ============================================================================
 */

// ============================================================================
// 1. System Configuration & Database Constants
// ============================================================================
const SPREADSHEET_ID = {
    ORG: APP_CONFIG?.SHEETS?.ORG || ''
};

const SHEET_NAMES = {
    RANKS: APP_CONFIG?.SHEET_NAMES?.ORG?.RANKS || 'org_ranks'
};

// Global Organizational & Financial Configuration
const CFG_ORG = APP_CONFIG?.ORG || {};
const CFG_FIN = APP_CONFIG?.FIN || {};
const CFG_TAX = CFG_FIN.TAX_RULES || {};
const CFG_FIXED_BONUS = CFG_ORG.BONUS_FIXED_AMOUNT || {
    GROUP: { TWD: 12000.00, MYR: 1500.00 },
    MANAGER: { TWD: 7000.00, MYR: 875.00 }
};

// Global Reactive State
let appState = {
    ranks: [],
    currency: CFG_FIN.DEFAULT_CURRENCY || 'TWD',
    exchangeRate: CFG_FIN.EXCHANGE_RATE?.MYR_TWD || 8.00
};

// Default Simulated Non-Master Downline List (1 Member, 0 SV)
let downlinePartners = [
    { id: 1, name: "Partner A", rank: "RANK_01_MEMBER", sv: 0 }
];

let bonusDataTableInstance = null;

// ============================================================================
// 2. Google Sheets Rank Loading & Data Parsing Engine
// ============================================================================

/**
 * Fetch rank definitions from Google Sheets (org_ranks)
 */
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i> Loading rank database...', 'Loading...');

    try {
        const rankRows = await fetchGoogleSheetCsv(SPREADSHEET_ID.ORG, SHEET_NAMES.RANKS);
        appState.ranks = parseRanksTable(rankRows);

        if (!appState.ranks || appState.ranks.length === 0) {
            throw new Error("Rank master table is empty or failed to load valid rank configurations.");
        }

        // Dynamically populate rank select dropdowns
        populateRankSelects();

        // Ensure default downline partner rank aligns with Member (rank_level 10)
        const memberRank = appState.ranks.find(r => r.rank_level === 10)?.rank_id || appState.ranks[0]?.rank_id;
        if (downlinePartners.length === 1 && downlinePartners[0].sv === 0 && memberRank) {
            downlinePartners[0].rank = memberRank;
        }

        renderDownlines();
        updateGroupSvFromDownlines();
        recalculateAll();

        AppToast.success("Rank and compensation plan data loaded successfully.");
    } catch (err) {
        console.error("Rank database loading error:", err);
        AppToast.error(`Failed to load rank data: ${err.message}`);
    } finally {
        AppLoading.hide();
    }
}

/**
 * Parse org_ranks rows (Aligned to standard 33-column schema via physical indices)
 */
function parseRanksTable(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    return rows.map((r, idx) => {
        const activeRaw = String(getVal(r, 28, 'Y')).trim().toUpperCase();
        const isActive = (activeRaw === 'Y' || activeRaw === 'TRUE' || activeRaw === '1' || activeRaw === '');

        return {
            rank_id: getVal(r, 0, `RANK_${String(idx + 1).padStart(2, '0')}`),
            rank_code: getVal(r, 1, `R${(idx + 1) * 10}`),
            rank_level: parseInt(getVal(r, 2, String((idx + 1) * 10)), 10) || 0,
            rank_name_zh: getVal(r, 3, ''),
            rank_name_en: getVal(r, 4, ''),
            star_rating: parseInt(getVal(r, 5, '0'), 10) || 0,
            cooling_period_month: parseInt(getVal(r, 6, '0'), 10) || 0,
            cum_group_sv_req: parseFloat(getVal(r, 7, '0')) || 0,
            month_personal_sv_req: parseFloat(getVal(r, 8, String(CFG_ORG.SV_LINE_ACTIVE || 160))) || (CFG_ORG.SV_LINE_ACTIVE || 160),
            month_group_sv_req: parseFloat(getVal(r, 9, '0')) || 0,
            new_mgr_group_sv_req: parseFloat(getVal(r, 10, '0')) || 0,
            qualified_lines_req: parseInt(getVal(r, 11, '0'), 10) || 0,
            pearl_lines_req: parseInt(getVal(r, 12, '0'), 10) || 0,
            month_org_sv_req: parseFloat(getVal(r, 13, '0')) || 0,
            consecutive_months_req: parseInt(getVal(r, 14, '1'), 10) || 1,
            direct_rebate_rate: parseFloat(getVal(r, 15, '0.05')) || 0.05,
            leadership_gen_depth: parseInt(getVal(r, 16, '0'), 10) || 0,
            leadership_gen_rate: parseFloat(getVal(r, 17, '0.06')) || 0.06,
            has_group_bonus: String(getVal(r, 18, 'N')).trim().toUpperCase(),
            has_manager_bonus: String(getVal(r, 19, 'N')).trim().toUpperCase(),
            has_pearl_dividend: String(getVal(r, 20, 'N')).trim().toUpperCase(),
            has_annual_excellence: String(getVal(r, 21, 'N')).trim().toUpperCase(),
            has_travel_incentive: String(getVal(r, 22, 'N')).trim().toUpperCase(),
            has_car_fund: String(getVal(r, 23, 'N')).trim().toUpperCase(),
            car_reward_type: getVal(r, 24, 'None'),
            badge_icon_class: getVal(r, 25, 'fa-solid fa-award'),
            badge_color_hex: getVal(r, 26, '#8b5cf6'),
            sort_order: parseInt(getVal(r, 27, String(idx + 1)), 10) || (idx + 1),
            is_active: isActive ? 'Y' : 'N'
        };
    }).filter(r => (r.rank_name_en !== '' || r.rank_name_zh !== '') && r.is_active === 'Y').sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Populate main rank selector dropdown with official English terminology
 */
function populateRankSelects() {
    const $selRank =$('#selRank');
    $selRank.empty();

    appState.ranks.forEach(rank => {
        const ratePercent = Math.round(rank.direct_rebate_rate * 100);
        const rankDisplayName = rank.rank_name_en || rank.rank_name_zh;
        const bonusDesc = rank.leadership_gen_depth > 0
            ? `${ratePercent}% + ${rank.leadership_gen_depth} Gen (6%)`
            : `${ratePercent}% Rebate`;

        $selRank.append($('<option>', {
            value: rank.rank_id,
            text: `${rankDisplayName} (${bonusDesc})`
        }));
    });

    // Default selection: Master (Level 40 / R40)
    const defaultRank = appState.ranks.find(r => r.rank_level === 40 || r.rank_code === 'R40') || appState.ranks[0];
    if (defaultRank) {
        $selRank.val(defaultRank.rank_id);
    }
}

/**
 * Calculate WCAG contrast text color
 */
function getContrastTextColor(hexColor) {
    if (!hexColor) return '#ffffff';
    const cleanHex = String(hexColor).replace('#', '').trim();
    const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 145 ? '#000000' : '#ffffff';
}

/**
 * Initialize control parameters from APP_CONFIG
 */
function initDefaultConfigValues() {
    const isMyr = appState.currency === 'MYR';
    const defaultRate = CFG_FIN.EXCHANGE_RATE?.MYR_TWD || 8.00;

    $("#cfgExchangeRate").val(defaultRate.toFixed(2));
    $("#cfgPointValue").val((CFG_ORG.LEADERSHIP_POINT_VALUE || 0.70).toFixed(2));
    $("#cfgPvRatio").val(isMyr ? (CFG_ORG.PV_RATE?.MY || 3.5) : (CFG_ORG.PV_RATE?.TW || 25.0));

    const taxVal = isMyr
        ? AppCalc.multiply(CFG_TAX.TAX_RATE_MY_107D ?? 0.02, 100, 2)
        : AppCalc.multiply(CFG_TAX.TAX_RATE_TW ?? 0.10, 100, 2);
    $("#cfgTaxRate").val(taxVal);
    $("#lblTaxRate").html(isMyr ? '<i class="fa-solid fa-file-invoice me-1"></i> 107D Withholding:' : '<i class="fa-solid fa-file-invoice me-1"></i> Income Tax Rate:');

    // 2nd-Gen NHI rate for Taiwan
    const defaultNhi = AppCalc.multiply(CFG_TAX.NHI_RATE_TW ?? 0.0211, 100, 2);
    $("#cfgNhiRate").val(defaultNhi);

    if (isMyr) {
        $("#boxNhiRate").addClass('d-none');
    } else {
        $("#boxNhiRate").removeClass('d-none');
    }

    $("#grpCurrency button").removeClass("active");
    $(`#grpCurrency button[data-currency="${appState.currency}"]`).addClass("active");

    updateTaxRuleInfo(isMyr);
}

/**
 * Update statutory tax withholding notices dynamically
 */
function updateTaxRuleInfo(isMyr) {
    if (isMyr) {
        const taxThresholdMy = CFG_TAX.TAX_THRESHOLD_MY_107D ?? 100000.00;
        const taxPercent = parseFloat($("#cfgTaxRate").val()) || AppCalc.multiply(CFG_TAX.TAX_RATE_MY_107D ?? 0.02, 100, 2);
        $("#taxRuleText").html(`
            <ul class="mb-0">
                <li>Malaysia Section 107D Withholding Threshold: RM ${taxThresholdMy.toLocaleString()}, Withholding Rate: ${taxPercent.toLocaleString()}%</li>
                <li>Bonus disbursed directly on the 15th of the following month.</li>
            </ul>
        `);
    } else {
        const taxThresholdTw = CFG_TAX.TAX_THRESHOLD_TW ?? 20000.00;
        const nhiThresholdTw = CFG_TAX.NHI_THRESHOLD_TW ?? 20000.00;
        const taxPercent = parseFloat($("#cfgTaxRate").val()) || AppCalc.multiply(CFG_TAX.TAX_RATE_TW ?? 0.10, 100, 2);
        const nhiPercent = parseFloat($("#cfgNhiRate").val()) || AppCalc.multiply(CFG_TAX.NHI_RATE_TW ?? 0.0211, 100, 2);
        $("#taxRuleText").html(`
            <ul class="mb-0">
                <li>Taiwan Income Tax Threshold: NT$ ${taxThresholdTw.toLocaleString()}, Withholding Rate: ${taxPercent.toLocaleString()}%</li>
                <li>Taiwan 2nd-Gen NHI Threshold: NT$ ${nhiThresholdTw.toLocaleString()}, Withholding Rate: ${nhiPercent.toLocaleString()}%
                <br/>
                (Personal ${(CFG_ORG.SV_LINE_MANAGER || 3200).toLocaleString()} SV purchase is exempt from 2nd-Gen NHI).</li>
                <li>Bonus disbursed directly on the 15th of the following month.</li>
            </ul>
        `);
    }
}

// ============================================================================
// 3. Lifecycle & Event Binding
// ============================================================================
window.addEventListener('AppReady', async function () {
    initDefaultConfigValues();

    // Re-evaluate group SV and recalculate on personal SV change
    $("#inpPersonalSv").on("input change", function () {
        updateGroupSvFromDownlines();
        recalculateAll();
    });

    // Real-time calculation on all input parameters
    $("#inpHistoryCumSv, #selRank, #inpActiveLines, #inpPearlLines, #inpTotalManagersInDepth, #inpTotalOrgSv, #cfgPvRatio, #cfgPointValue, #cfgTaxRate, #cfgExchangeRate, #cfgNhiRate").on("input change", function () {
        recalculateAll();
    });

    // Currency switch automation: Productivity Value (PV), tax rates, and labels
    $("#grpCurrency button").on("click", function () {
        const targetCurr = $(this).data("currency");
        if (appState.currency === targetCurr) return;

        $("#grpCurrency button").removeClass("active");
        $(this).addClass("active");
        appState.currency = targetCurr;

        if (targetCurr === 'MYR') {
            $("#cfgPvRatio").val(CFG_ORG.PV_RATE?.MY || 3.5);
            $("#cfgTaxRate").val(AppCalc.multiply(CFG_TAX.TAX_RATE_MY_107D ?? 0.02, 100, 2));
            $("#lblTaxRate").html('<i class="fa-solid fa-file-invoice me-1"></i> 107D Withholding:');
            $("#boxNhiRate").addClass('d-none');
        } else {
            $("#cfgPvRatio").val(CFG_ORG.PV_RATE?.TW || 25.0);
            $("#cfgTaxRate").val(AppCalc.multiply(CFG_TAX.TAX_RATE_TW ?? 0.10, 100, 2));
            $("#lblTaxRate").html('<i class="fa-solid fa-file-invoice me-1"></i> Income Tax Rate:');
            $("#boxNhiRate").removeClass('d-none');
            $("#cfgNhiRate").val(AppCalc.multiply(CFG_TAX.NHI_RATE_TW ?? 0.0211, 100, 2));
        }

        updateTaxRuleInfo(targetCurr === 'MYR');
        recalculateAll();
    });

    // Add new non-Master downline partner (Default Member, 0 SV)
    $("#btnAddDownline").on("click", function () {
        const nextId = Date.now();
        const memberRank = appState.ranks.find(r => r.rank_level === 10)?.rank_id || appState.ranks.find(r => r.rank_level < 40)?.rank_id || 'RANK_01_MEMBER';
        downlinePartners.push({
            id: nextId,
            name: `Partner ${String.fromCharCode(65 + (downlinePartners.length % 26))}`,
            rank: memberRank,
            sv: 0
        });
        renderDownlines();
        updateGroupSvFromDownlines();
        recalculateAll();
    });

    // Delete downline partner
    $(document).on("click", ".btn-del-downline", function () {
        const id = $(this).data("id");
        downlinePartners = downlinePartners.filter(d => d.id !== id);
        renderDownlines();
        updateGroupSvFromDownlines();
        recalculateAll();
    });

    // Modify downline partner values dynamically
    $(document).on("input change", ".inp-dl-name, .sel-dl-rank, .inp-dl-sv", function () {
        const id = $(this).closest("tr").data("id");
        const item = downlinePartners.find(d => d.id === id);
        if (!item) return;

        item.name = $(this).closest("tr").find(".inp-dl-name").val();
        item.rank = $(this).closest("tr").find(".sel-dl-rank").val();
        item.sv = parseFloat($(this).closest("tr").find(".inp-dl-sv").val()) || 0;

        updateGroupSvFromDownlines();
        recalculateAll();
    });

    // Scenario preset selection
    $(".scenario-btn[data-scenario]").on("click", function () {
        $(".scenario-btn").removeClass("active");
        $(this).addClass("active");
        applyScenario($(this).data("scenario"));
    });

    // Reset button click
    $("#btnClearParams").on("click", function () {
        resetAllParams(false);
    });

    // Load cloud rank database
    await fetchGoogleSheetsData();
});

// ============================================================================
// 4. UI View Renderers & Data Synchronization
// ============================================================================

/**
 * Automatically calculate Personal Group SV = Personal SV + Non-Master Downline SV
 */
function updateGroupSvFromDownlines() {
    const personalSV = parseFloat($('#inpPersonalSv').val()) || 0;
    const totalDownlineSv = downlinePartners.reduce((acc, cur) => {
        return AppCalc.add(acc, Number(cur.sv) || 0);
    }, 0);

    const totalGroupSv = AppCalc.add(personalSV, totalDownlineSv);
    $('#inpGroupSv').val(totalGroupSv.toLocaleString());
}

/**
 * Render non-Master downline organization list (rank_level < 40)
 */
function renderDownlines() {
    const $tbody =$("#downlineListBody");
    $tbody.empty();

    const nonManagerRanks = appState.ranks.filter(r => r.rank_level < 40);

    downlinePartners.forEach(item => {
        let rankOptionsHtml = '';
        nonManagerRanks.forEach(r => {
            const isSelected = (item.rank === r.rank_id || item.rank === r.rank_code) ? 'selected' : '';
            const rankDisplayName = r.rank_name_en || r.rank_name_zh;
            rankOptionsHtml += `<option value="${r.rank_id}" ${isSelected}>${rankDisplayName} (${Math.round(r.direct_rebate_rate * 100)}%)</option>`;
        });

        const rowHtml = `
            <tr data-id="${item.id}">
                <td>
                    <input type="text" class="form-control form-control-sm inp-dl-name" value="${item.name}">
                </td>
                <td>
                    <select class="form-select form-select-sm sel-dl-rank">
                        ${rankOptionsHtml}
                    </select>
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm text-end inp-dl-sv" value="${item.sv}" step="100" min="0">
                </td>
                <td class="text-end text-secondary tabular-nums cell-diff-rate">0%</td>
                <td class="text-end text-price-unit cell-diff-amount">0</td>
                <td class="text-center">
                    <button type="button" class="btn btn-outline-danger btn-sm btn-del-downline" data-id="${item.id}" title="Delete Partner">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
        $tbody.append(rowHtml);
    });
}

/**
 * Update qualification status and notices in UI
 */
function updateQualificationStatus(isPersonalQualified, isManagerQualified, isAutoRescued, activeLines) {
    const $txtPersonal =$("#txtPersonalQualified");
    const $txtGroup =$("#txtGroupQualified");
    const $autoRescueBox =$("#autoRescueBox");

    const svActiveThreshold = CFG_ORG.SV_LINE_ACTIVE || 160;
    const svManagerThreshold = CFG_ORG.SV_LINE_MANAGER || 3200;

    if (isPersonalQualified) {
        $txtPersonal.html(`<i class="fa-solid fa-circle-check text-success me-1"></i> Personal Maintenance Met (${svActiveThreshold.toLocaleString()} SV)`);
    } else {
        $txtPersonal.html(`<i class="fa-solid fa-circle-xmark text-danger me-1"></i> Personal Maintenance Not Met (< ${svActiveThreshold.toLocaleString()} SV, Ineligible for Monthly Bonuses)`);
    }

    if (isManagerQualified) {
        $txtGroup.html('<i class="fa-solid fa-circle-check text-success me-1"></i> Qualified Master Group Maintenance Met');
    } else {
        $txtGroup.html(`<i class="fa-solid fa-circle-xmark text-warning me-1"></i> Group SV < ${svManagerThreshold.toLocaleString()} SV (Dynamic Compression Triggered)`);
    }

    $autoRescueBox.show();
    if (isAutoRescued) {
        $("#autoRescueTitle").html('<i class="fa-solid fa-shield-halved text-success me-1"></i> Performance Auto-Remedy: Active');
        $("#autoRescueDesc").text(`With ${activeLines} qualified lines (>= 5), the ${svManagerThreshold.toLocaleString()} SV group maintenance is waived for Master and Leadership bonuses (★ Qualified Team Bonus requires actual group SV).`);
    } else {
        $("#autoRescueTitle").html('<i class="fa-solid fa-circle-info text-info me-1"></i> Performance Auto-Remedy: Inactive');
        $("#autoRescueDesc").text(`Requires Pearl Master rank or above with at least 5 qualified lines to trigger the ${svManagerThreshold.toLocaleString()} SV group maintenance exemption.`);
    }
}

// ============================================================================
// 5. Core Bonus Actuarial Engine (High-Precision AppCalc)
// ============================================================================

/**
 * Core Compensation Plan Actuarial Calculation Engine
 * Integrates 2026 Policy (Qualified Team NT$ 12,000 / Qualified Master NT$ 7,000),
 * 3,200 SV Group Threshold, Automatic Performance Replenishment, and High-Tier Depth
 */
function recalculateAll() {
    if (!appState.ranks || appState.ranks.length === 0) return;

    const curr = appState.currency;
    const fxRate = parseFloat($("#cfgExchangeRate").val()) || CFG_FIN.EXCHANGE_RATE?.MYR_TWD || 8.00;
    const pvRatio = parseFloat($("#cfgPvRatio").val()) || (curr === 'MYR' ? (CFG_ORG.PV_RATE?.MY || 3.5) : (CFG_ORG.PV_RATE?.TW || 25.0));
    const pointVal = parseFloat($("#cfgPointValue").val()) || CFG_ORG.LEADERSHIP_POINT_VALUE || 0.70;
    const currentTaxRate = AppCalc.divide(parseFloat($("#cfgTaxRate").val()) || 0, 100, 4);
    const currentNhiRate = AppCalc.divide(parseFloat($("#cfgNhiRate").val()) || 0, 100, 4);

    const personalSV = parseFloat($("#inpPersonalSv").val()) || 0;
    const groupSV = parseFloat(String($("#inpGroupSv").val() || '0').replace(/,/g, '')) || 0;
    const selectedRankKey = $("#selRank").val();

    const currentRank = appState.ranks.find(r => r.rank_id === selectedRankKey || r.rank_code === selectedRankKey) || appState.ranks[0];

    const activeLines = parseInt($("#inpActiveLines").val(), 10) || 0;
    const pearlLines = parseInt($("#inpPearlLines").val(), 10) || 0;
    const managersInDepth = parseInt($("#inpTotalManagersInDepth").val(), 10) || 0;
    const totalOrgSV = parseFloat($("#inpTotalOrgSv").val()) || 0;

    // 1. Qualification Evaluation
    const svActiveReq = currentRank.month_personal_sv_req || CFG_ORG.SV_LINE_ACTIVE || 160;
    const svManagerReq = currentRank.month_group_sv_req || CFG_ORG.SV_LINE_MANAGER || 3200;

    const isPersonalQualified = personalSV >= svActiveReq;
    const effectiveGroupSV = groupSV;

    // Substantive group maintenance met (>= 3,200 SV)
    const isGroupSvReached = effectiveGroupSV >= svManagerReq;

    // Automatic Performance Replenishment check (Pearl Master+ and >= 5 qualified lines)
    const isAutoRescued = (currentRank.has_pearl_dividend === 'Y' || currentRank.rank_level >= 70) && activeLines >= 5;

    // Qualified Master status
    const isManagerQualified = isPersonalQualified && (currentRank.rank_level >= 40) && (isGroupSvReached || isAutoRescued);

    // Currency conversion helpers
    const toCurrentCurrency = (twdVal) => (curr === 'MYR' && fxRate > 0) ? AppCalc.divide(twdVal, fxRate, 2) : twdVal;
    const formatMoney = (val) => {
        if (typeof formatCurrency === 'function') return formatCurrency(Math.round(val), curr);
        const prefix = curr === 'MYR' ? 'RM ' : 'NT$ ';
        return `${prefix}${Math.round(val).toLocaleString()}`;
    };

    // Update rank badge and leadership depth
    if (typeof UIBadges !== 'undefined' && UIBadges.rank?.badge) {
        $("#rankBadgeContainer").html(UIBadges.rank.badge(currentRank, 'en'));
    } else {
        const hex = currentRank.badge_color_hex || '#8b5cf6';
        const rankDisplayName = currentRank.rank_name_en || currentRank.rank_name_zh;
        $("#rankBadgeContainer").html(`
            <span class="badge" style="background-color: ${hex}20; border: 1px solid ${hex}; color: ${hex};">
                <i class="${currentRank.badge_icon_class || 'fa-solid fa-award'} me-1"></i> ${rankDisplayName}
            </span>
        `);
    }

    $("#txtLeadershipDepth").text(`Unlocked Depth: ${currentRank.leadership_gen_depth} Generations`);
    updateQualificationStatus(isPersonalQualified, isManagerQualified, isAutoRescued, activeLines);

    // 2. Personal Tiered Rebate
    let personalBonus = 0;
    if (isPersonalQualified) {
        personalBonus = AppCalc.multiply(AppCalc.multiply(personalSV, currentRank.direct_rebate_rate, 4), pvRatio, 2);
    }

    // 3. Tiered Bonus (Differential from non-Master lines)
    let differentialBonus = 0;
    let totalDownlineSv = 0;
    $("#downlineListBody tr").each(function () {
        const id = $(this).data("id");
        const item = downlinePartners.find(d => d.id === id);
        if (!item) return;

        totalDownlineSv = AppCalc.add(totalDownlineSv, item.sv || 0);

        const dlRank = appState.ranks.find(r => r.rank_id === item.rank || r.rank_code === item.rank);
        const downlineRate = dlRank ? dlRank.direct_rebate_rate : 0.05;
        const diffRate = Math.max(0, AppCalc.sub(currentRank.direct_rebate_rate, downlineRate));
        const lineBonus = isPersonalQualified ? AppCalc.multiply(AppCalc.multiply(item.sv, diffRate, 4), pvRatio, 2) : 0;

        differentialBonus = AppCalc.add(differentialBonus, lineBonus);

        $(this).find(".cell-diff-rate").text(`${AppCalc.multiply(diffRate, 100, 0)}%`);
        $(this).find(".cell-diff-amount").text(formatMoney(lineBonus));
    });

    const getFixedBonus = (bonusType) => {
        const bonusConfig = CFG_FIXED_BONUS[bonusType];
        if (!bonusConfig) return 0;

        if (curr === 'MYR') {
            // 若 common.js 有設定馬幣基準額且大於 0，優先直接取用；否則依畫面即時匯率進行動態折算
            if (bonusConfig.MYR && bonusConfig.MYR > 0) {
                return bonusConfig.MYR;
            }
            return (fxRate > 0) ? AppCalc.divide(bonusConfig.TWD, fxRate, 2) : 0;
        }
        return bonusConfig.TWD || 0;
    };

    // 4. Fixed-Rate Qualified Bonuses (2026 Standards: Team NT$ 12,000 / Master NT$ 7,000)
    // Qualified Team Bonus: Strictly requires substantive group SV >= 3,200 (Auto-remedy excluded)
    const isGroupBonusQualified = isPersonalQualified && (currentRank.rank_level >= 40) && isGroupSvReached;
    let qualifiedGroupBonus = (isGroupBonusQualified && (currentRank.has_group_bonus === 'Y' || currentRank.has_group_bonus === 'TRUE'))
        ? getFixedBonus('GROUP')
        : 0;

    // Qualified Master Bonus: Master qualified status (Auto-remedy included)
    let qualifiedManagerBonus = (isManagerQualified && (currentRank.has_manager_bonus === 'Y' || currentRank.has_manager_bonus === 'TRUE'))
        ? getFixedBonus('MANAGER')
        : 0;

    // 5. Global Leadership Bonus (svManagerReq × 6% × Point Value × PV)
    let leadershipBonus = 0;
    const reqActiveLines = currentRank.qualified_lines_req || 1;
    const isLeadershipQualified = isManagerQualified &&
        currentRank.leadership_gen_depth > 0 &&
        activeLines >= reqActiveLines &&
        managersInDepth > 0;

    if (isLeadershipQualified) {
        const singleMgrScore = AppCalc.multiply(svManagerReq, currentRank.leadership_gen_rate, 4);
        const totalScore = AppCalc.multiply(singleMgrScore, managersInDepth, 2);
        leadershipBonus = AppCalc.multiply(AppCalc.multiply(totalScore, pointVal, 4), pvRatio, 2);
    }

    // High-tier active line threshold (Pearl >= 4, Emerald >= 6, Blue Diamond >= 10)
    const reqPearlLines = Math.max(currentRank.qualified_lines_req || 0, 4);
    const isPearlTierBase = isManagerQualified && (currentRank.rank_level >= 70) && (activeLines >= reqPearlLines);

    // 6. Dividend Bonus (5% Pool)
    let pearlDividend = 0;
    const isPearlDividendQualified = isPearlTierBase && (currentRank.has_pearl_dividend === 'Y' || currentRank.has_pearl_dividend === 'TRUE');
    if (isPearlDividendQualified) {
        pearlDividend = AppCalc.multiply(activeLines, toCurrentCurrency(6000), 2);
    }

    // 7. Annual Excellence Rewards (5% Pool)
    let annualExcellenceBonus = 0;
    const isAnnualExcellenceQualified = isPearlTierBase && (currentRank.has_annual_excellence === 'Y' || currentRank.has_annual_excellence === 'TRUE');
    if (isAnnualExcellenceQualified) {
        const perLineAnnual = (currentRank.rank_level >= 90) ? 4600 : 3571;
        annualExcellenceBonus = AppCalc.multiply(activeLines, toCurrentCurrency(perLineAnnual), 2);
    }

    // 8. Travel Rewards (1.5% Pool)
    let travelIncentiveBonus = 0;
    const isTravelIncentiveQualified = isPearlTierBase && (currentRank.has_travel_incentive === 'Y' || currentRank.has_travel_incentive === 'TRUE');
    if (isTravelIncentiveQualified) {
        const perLineTravel = (currentRank.rank_level >= 90) ? 1900 : 1428;
        travelIncentiveBonus = AppCalc.multiply(activeLines, toCurrentCurrency(perLineTravel), 2);
    }

    // 9. Dream Car Purchase Fund (3.5% Pool)
    let carFundBonus = 0;
    if (isManagerQualified && (currentRank.has_car_fund === 'Y' || currentRank.has_car_fund === 'TRUE') &&
        activeLines >= currentRank.qualified_lines_req &&
        pearlLines >= currentRank.pearl_lines_req &&
        totalOrgSV >= currentRank.month_org_sv_req) {
        carFundBonus = toCurrentCurrency(27000);
    }

    // Gross Bonus Total
    let grossBonus = AppCalc.add(personalBonus, differentialBonus);
    grossBonus = AppCalc.add(grossBonus, qualifiedGroupBonus);
    grossBonus = AppCalc.add(grossBonus, qualifiedManagerBonus);
    grossBonus = AppCalc.add(grossBonus, leadershipBonus);
    grossBonus = AppCalc.add(grossBonus, pearlDividend);
    grossBonus = AppCalc.add(grossBonus, annualExcellenceBonus);
    grossBonus = AppCalc.add(grossBonus, travelIncentiveBonus);
    grossBonus = AppCalc.add(grossBonus, carFundBonus);

    // 10. Statutory Deductions
    let withholdingTax = 0;
    let nhiTax = 0;
    let deductionDetail = '';

    const isPurePersonalManager = (personalSV >= svManagerReq) && (totalDownlineSv === 0) && (differentialBonus === 0);

    if (curr === 'MYR') {
        const thresholdMy = CFG_TAX.TAX_THRESHOLD_MY_107D ?? 100000.00;
        withholdingTax = (grossBonus >= thresholdMy) ? AppCalc.multiply(grossBonus, currentTaxRate, 2) : 0;
        nhiTax = 0;
        deductionDetail = (grossBonus >= thresholdMy)
            ? `107D Withholding Tax (${AppCalc.multiply(currentTaxRate, 100, 2)}%)`
            : `Under Section 107D Withholding Threshold`;
    } else {
        const taxThresholdTw = CFG_TAX.TAX_THRESHOLD_TW ?? 20000.00;
        const nhiThresholdTw = CFG_TAX.NHI_THRESHOLD_TW ?? 20000.00;

        withholdingTax = (grossBonus >= taxThresholdTw) ? AppCalc.multiply(grossBonus, currentTaxRate, 2) : 0;

        if (isPurePersonalManager) {
            nhiTax = 0;
        } else {
            nhiTax = (grossBonus >= nhiThresholdTw) ? AppCalc.multiply(grossBonus, currentNhiRate, 2) : 0;
        }

        const taxStr = (grossBonus >= taxThresholdTw)
            ? `Income Tax: NT$ ${Math.round(withholdingTax).toLocaleString()}`
            : `Under Income Tax Threshold`;

        let nhiStr = '';
        if (isPurePersonalManager) {
            nhiStr = `2nd-Gen NHI: NT$ 0<br/>(Personal ${svManagerReq.toLocaleString()} SV purchase is exempt from 2nd-Gen NHI)`;
        } else {
            nhiStr = (grossBonus >= nhiThresholdTw)
                ? `2nd-Gen NHI: NT$ ${Math.round(nhiTax).toLocaleString()}`
                : `Under 2nd-Gen NHI Threshold`;
        }

        deductionDetail = `${taxStr}<br/>${nhiStr}`;
    }

    const totalDeduction = AppCalc.add(withholdingTax, nhiTax);
    const netPayout = AppCalc.sub(grossBonus, totalDeduction);

    // Render KPI Dashboard Values
    $("#valGrossBonus").text(formatMoney(grossBonus));
    $("#valGrossBonusWan").text(`Approx. ${(grossBonus / 1000).toFixed(1)}k`);
    $("#valTotalDeduction").text(`- ${formatMoney(totalDeduction)}`);
    $("#valDeductionDetail").html(deductionDetail);
    $("#valNetPayout").text(formatMoney(netPayout));

    // Render Bonus Audit Breakdown in DataTable
    renderBonusTableData([
        {
            name: "Personal Tiered Rebate",
            rate: `${AppCalc.multiply(currentRank.direct_rebate_rate, 100, 0)}%`,
            basis: `${personalSV.toLocaleString()} SV × PV`,
            amount: personalBonus
        },
        {
            name: "Tiered Bonus (Differential)",
            rate: "Tiered Spread",
            basis: "Sum of non-Master downline spreads",
            amount: differentialBonus
        },
        {
            name: "Qualified Team Bonus",
            rate: "10% Pool",
            basis: qualifiedGroupBonus > 0
                ? "Personal Group Met (>= 3,200 SV)"
                : (isAutoRescued ? "Group SV < 3,200 SV (Exempt from Auto-Remedy)" : "Group SV under 3,200 SV threshold"),
            amount: qualifiedGroupBonus
        },
        {
            name: "Qualified Master Bonus",
            rate: "5% Pool",
            basis: qualifiedManagerBonus > 0
                ? (isAutoRescued ? "Master Qualified (Auto-Remedy Active)" : "Master Group Maintenance Met")
                : "Ineligible for Qualified Master Bonus",
            amount: qualifiedManagerBonus
        },
        {
            name: "Leadership Bonus",
            rate: `${currentRank.leadership_gen_depth} Gen @ ${AppCalc.multiply(currentRank.leadership_gen_rate, 100, 0)}% each`,
            basis: leadershipBonus > 0
                ? `${managersInDepth} Masters × ${svManagerReq.toLocaleString()} SV × 6% × Point Value`
                : (activeLines < reqActiveLines ? `Insufficient active lines (Requires >= ${reqActiveLines})` : (managersInDepth <= 0 ? "0 Masters within depth" : "Ineligible for Leadership Bonus")),
            amount: leadershipBonus
        },
        {
            name: "Dividend Bonus",
            rate: "5% Pool",
            basis: pearlDividend > 0
                ? `Weighted by ${activeLines} active Master lines`
                : (activeLines < reqPearlLines ? `Insufficient active lines (Requires >= ${reqPearlLines})` : "Ineligible for Dividend Bonus"),
            amount: pearlDividend
        },
        {
            name: "Annual Excellence Rewards",
            rate: "5% Pool",
            basis: annualExcellenceBonus > 0
                ? `Annual Jan-Dec cumulative (Monthly amortized, ${activeLines} lines)`
                : (activeLines < reqPearlLines ? `Insufficient active lines (Requires >= ${reqPearlLines})` : "Ineligible for Excellence Rewards"),
            amount: annualExcellenceBonus
        },
        {
            name: "Travel Rewards",
            rate: "1.5% Pool",
            basis: travelIncentiveBonus > 0
                ? `Annual Jul-Jun cumulative (Monthly amortized, ${activeLines} lines)`
                : (activeLines < reqPearlLines ? `Insufficient active lines (Requires >= ${reqPearlLines})` : "Ineligible for Travel Rewards"),
            amount: travelIncentiveBonus
        },
        {
            name: "Dream Car Purchase Fund",
            rate: "3.5% Pool",
            basis: carFundBonus > 0 ? "Blue Diamond criteria met (36 monthly installments)" : "Blue Diamond threshold not met",
            amount: carFundBonus
        }
    ], grossBonus);

    // Calculate Passive Income Ratio & Update Donut Chart
    const passiveTotal = AppCalc.add(AppCalc.add(leadershipBonus, pearlDividend), AppCalc.add(annualExcellenceBonus, AppCalc.add(travelIncentiveBonus, carFundBonus)));
    const passiveRatio = grossBonus > 0 ? AppCalc.multiply(AppCalc.divide(passiveTotal, grossBonus, 4), 100, 2) : 0;
    $("#valPassiveRatio").text(`${passiveRatio}%`);

    updateBonusChart({
        personal: AppCalc.add(personalBonus, differentialBonus),
        groupMgr: AppCalc.add(qualifiedGroupBonus, qualifiedManagerBonus),
        leadership: leadershipBonus,
        dividends: AppCalc.add(AppCalc.add(pearlDividend, annualExcellenceBonus), travelIncentiveBonus),
        carFund: carFundBonus
    }, grossBonus);
}

// ============================================================================
// 6. DataTable.js & Chart.js Integration
// ============================================================================
function renderBonusTableData(dataset, grossTotal) {
    const amountColTitle = appState.currency === 'MYR' ? 'Estimated Amount (RM)' : 'Estimated Amount (NT$)';

    // 1. 首次有試算資料時，才正式初始化 DataTable 實例
    if (!bonusDataTableInstance) {
        bonusDataTableInstance = $('#tblBonusAudit').DataTable({
            paging: false,
            searching: false,
            info: false,
            ordering: false,
            data: dataset,
            columns: [
                { data: 'name', render: data => `<span class="fw-bold">${data}</span>` },
                { 
                    data: 'amount', 
                    className: 'text-end',
                    render: data => {
                        const val = Number(data) || 0;
                        return `<span class="${val > 0 ? 'text-price-unit' : 'text-muted'}">${formatCurrency(val, appState.currency)}</span>`;
                    }
                },
                { data: 'rate', render: data => `<span class="text-secondary tabular-nums">${data}</span>` },
                { data: 'basis', render: data => `<span class="small text-muted">${data}</span>` }
            ],
            language: {
                emptyTable: "No audit data available"
            }
        });
    } else {
        // 2. 已有實例時，塞入新試算資料重繪並即刻強制校準欄寬
        bonusDataTableInstance.clear().rows.add(dataset).draw();
        bonusDataTableInstance.columns.adjust();
    }

    // 同步更新表頭幣別標註與表尾合計
    //$('.dataTables_scrollHead thead th, #tblBonusAudit thead th').eq(1).text(amountColTitle);
    $("#valTableGrossTotal").text(`${formatCurrency(grossTotal, appState.currency)}`);
}

/**
 * Render doughnut chart for compensation structure
 */
function updateBonusChart(data, grossTotal = 0) {
    const curr = appState.currency;
    const currencyUnit = curr === 'MYR' ? 'RM' : 'NT$';

    const config = AppChart.createDoughnut({
        labels: ['Personal & Differential', 'Qualified Team & Master', 'Leadership Bonus', 'Dividends & Excellence', 'Dream Car Fund'],
        data: [
            Math.round(data.personal),
            Math.round(data.groupMgr),
            Math.round(data.leadership),
            Math.round(data.dividends),
            Math.round(data.carFund)
        ],
        colors: ['#38bdf8', '#20c997', '#f59e0b', '#818cf8', '#ec4899'],
        unit: currencyUnit,
        cutout: '65%',
        centerKpi: {
            label: 'Estimated Gross Total',
            value: `${currencyUnit} ${Math.round(grossTotal).toLocaleString()}`
        }
    });

    AppChart.render('bonusDoughnutChart', config);
}

/**
 * Reset all parameters to initial default states
 * @param {boolean} isSilent Whether to suppress toast alert
 */
function resetAllParams(isSilent = false) {
    $(".scenario-btn").removeClass("active");

    const defaultRank = appState.ranks.find(r => r.rank_level === 40 || r.rank_code === 'R40') || appState.ranks[0];
    if (defaultRank) {
        $("#selRank").val(defaultRank.rank_id);
    }

    $("#inpPersonalSv").val(0);
    $("#inpHistoryCumSv").val(0);
    $("#inpActiveLines").val(0);
    $("#inpPearlLines").val(0);
    $("#inpTotalManagersInDepth").val(0);
    $("#inpTotalOrgSv").val(0);

    const memberRank = appState.ranks.find(r => r.rank_level === 10)?.rank_id || 'RANK_01_MEMBER';
    downlinePartners = [
        { id: Date.now(), name: "Partner A", rank: memberRank, sv: 0 }
    ];

    renderDownlines();
    updateGroupSvFromDownlines();
    recalculateAll();

    if (!isSilent && typeof AppToast !== 'undefined') {
        AppToast.info("All simulation parameters reset successfully.");
    }
}

/**
 * Apply operational scenario presets (Master / Pearl Master / Blue Diamond Master)
 */
function applyScenario(scenarioKey) {
    if (!appState.ranks || appState.ranks.length === 0) return;

    const rankMember = appState.ranks.find(r => r.rank_level === 10) || appState.ranks[0];
    const rankDir = appState.ranks.find(r => r.rank_level === 20) || appState.ranks[0];
    const rankVmgr = appState.ranks.find(r => r.rank_level === 30) || appState.ranks[0];
    const rankMgr = appState.ranks.find(r => r.rank_level === 40);
    const rankPearl = appState.ranks.find(r => r.rank_level === 70);
    const rankDiamond = appState.ranks.find(r => r.rank_level === 90);

    if (scenarioKey === 'MGR' && rankMgr) {
        $("#selRank").val(rankMgr.rank_id);
        $("#inpPersonalSv").val(400);
        $("#inpActiveLines").val(0);
        $("#inpPearlLines").val(0);
        $("#inpTotalManagersInDepth").val(0);
        $("#inpTotalOrgSv").val(3200);

        downlinePartners = [
            { id: 1, name: "Partner A (Associate)", rank: rankDir.rank_id, sv: 1400 },
            { id: 2, name: "Partner B (Member)", rank: rankMember.rank_id, sv: 1400 }
        ];
    } else if (scenarioKey === 'PEARL' && rankPearl) {
        $("#selRank").val(rankPearl.rank_id);
        $("#inpPersonalSv").val(400);
        $("#inpActiveLines").val(7);
        $("#inpPearlLines").val(0);
        $("#inpTotalManagersInDepth").val(13);
        $("#inpTotalOrgSv").val(45000);

        downlinePartners = [
            { id: 1, name: "Direct Non-Master Group", rank: rankVmgr.rank_id, sv: 2800 }
        ];
    } else if (scenarioKey === 'DIAMOND' && rankDiamond) {
        $("#selRank").val(rankDiamond.rank_id);
        $("#inpPersonalSv").val(400);
        $("#inpActiveLines").val(10);
        $("#inpPearlLines").val(3);
        $("#inpTotalManagersInDepth").val(22);
        $("#inpTotalOrgSv").val(110000);

        downlinePartners = [
            { id: 1, name: "Direct Non-Master Group", rank: rankVmgr.rank_id, sv: 2800 }
        ];
    }

    renderDownlines();
    updateGroupSvFromDownlines();
    recalculateAll();
}