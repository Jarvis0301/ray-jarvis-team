/**
 * ============================================================================
 * 獎金試算戰術控制台 (tool-bonus.js)
 * 整合 APP_CONFIG 全域組態、雙國算力 (TW/MY) 自動化切換與高精度 AppCalc 模組
 * ============================================================================
 */

// ============================================================================
// 1. 系統組態與資料庫常數宣告
// ============================================================================
const SPREADSHEET_ID = {
    ORG: APP_CONFIG?.SHEETS?.ORG || ''
};

const SHEET_NAMES = {
    RANKS: APP_CONFIG?.SHEET_NAMES?.ORG?.RANKS || '職級主檔'
};

// 提取全域組織與財務規範參數
const CFG_ORG = APP_CONFIG?.ORG || {};
const CFG_FIN = APP_CONFIG?.FIN || {};
const CFG_TAX = CFG_FIN.TAX_RULES || {};

// 全域狀態機
let appState = {
    ranks: [],
    currency: CFG_FIN.DEFAULT_CURRENCY || 'TWD',
    exchangeRate: CFG_FIN.EXCHANGE_RATE?.MYR_TWD || 8.00
};

// 預設下線非經理組織模擬清單 (預設職級代碼對齊 org_ranks)
let downlinePartners = [
    { id: 1, name: "夥伴 A (自用家庭)", rank: "RANK_01_MEMBER", sv: 800 },
    { id: 2, name: "夥伴 B (副理核心)", rank: "RANK_03_SENIOR_ASSOCIATE", sv: 1200 },
    { id: 3, name: "夥伴 C (衝刺主任)", rank: "RANK_02_ASSOCIATE", sv: 800 }
];

let doughnutChartInstance = null;
let bonusDataTableInstance = null;

// ============================================================================
// 2. 雲端職級主檔讀取與資料解析引擎
// ============================================================================

/**
 * 自 Google 試算表 (org_ranks) 讀取最新職級制度資料
 */
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary me-1"></i>正在讀取職級資料庫...', '載入中...');
    
    try {
        const rankRows = await fetchGoogleSheetCsv(SPREADSHEET_ID.ORG, SHEET_NAMES.RANKS);
        appState.ranks = parseRanksTable(rankRows);

        if (!appState.ranks || appState.ranks.length === 0) {
            throw new Error("職級主檔資料表為空或未取得有效職級設定");
        }

        // 動態填充主選單與下線夥伴職級選單
        populateRankSelects();
        renderDownlines();
        recalculateAll();

        AppToast.success("職級與獎金制度資料載入完成");
    } catch (err) {
        console.error("職級資料表讀取異常:", err);
        AppToast.error(`職級資料讀取失敗：${err.message}`);
    } finally {
        AppLoading.hide();
    }
}

/**
 * 解析 org_ranks 試算表資料列 (對齊標準 33 欄位定義，依物理順序取值)
 */
function parseRanksTable(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    
    return rows.map((r, idx) => {
        const activeRaw = String(getVal(r, 28, 'Y')).trim().toUpperCase();
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
            car_reward_type: getVal(r, 24, '無'),
            badge_icon_class: getVal(r, 25, 'fa-solid fa-award'),
            badge_color_hex: getVal(r, 26, '#8b5cf6'),
            sort_order: parseInt(getVal(r, 27, String(idx + 1)), 10) || (idx + 1),
            is_active: isActive ? 'Y' : 'N'
        };
    }).filter(r => r.rank_name_zh !== '' && r.is_active === 'Y').sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * 依據資料表動態渲染主職級選單
 */
function populateRankSelects() {
    const $selRank =$('#selRank');
    $selRank.empty();

    appState.ranks.forEach(rank => {
        const ratePercent = Math.round(rank.direct_rebate_rate * 100);
        const bonusDesc = rank.leadership_gen_depth > 0 
            ? `${ratePercent}% + ${rank.leadership_gen_depth}代6%` 
            : `${ratePercent}% 回饋`;

        $selRank.append($('<option>', {
                value: rank.rank_id,
                text: `${rank.rank_name_zh} (${bonusDesc})`
            })
        );
    });

    // 預設鎖定在經理級 (位階 40)
    const defaultRank = appState.ranks.find(r => r.rank_level === 40 || r.rank_code === 'R40') || appState.ranks[0];
    if (defaultRank) {
        $selRank.val(defaultRank.rank_id);
    }
}

/**
 * 計算最佳 WCAG 對比字色 (避免會員淺底白字隱形)
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
 * 初始化輸入控制項預設數值 (全面連動 APP_CONFIG.ORG 與 APP_CONFIG.FIN)
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
    $("#lblTaxRate").html(isMyr ? '<i class="fa-solid fa-file-invoice me-1"></i>107D扣繳：' : '<i class="fa-solid fa-file-invoice me-1"></i>所得稅率：');

    // 健保費率預設初始化 (讀取 CFG_TAX.NHI_RATE_TW)
    const defaultNhi = AppCalc.multiply(CFG_TAX.NHI_RATE_TW ?? 0.0211, 100, 2);
    $("#cfgNhiRate").val(defaultNhi);

    if (isMyr) {
        $("#boxNhiRate").addClass('d-none');
    } else {
        $("#boxNhiRate").removeClass('d-none');
    }

    // 同步幣別切換按鈕 active 樣式
    $("#grpCurrency button").removeClass("active");
    $(`#grpCurrency button[data-currency="${appState.currency}"]`).addClass("active");

    updateTaxRuleInfo(isMyr);
}

/**
 * 動態更新法定扣繳門檻法規文字提示
 */
function updateTaxRuleInfo(isMyr) {
    if (isMyr) {
        const taxThresholdMy = CFG_TAX.TAX_THRESHOLD_MY_107D ?? 100000.00;
        const taxPercent = parseFloat($("#cfgTaxRate").val()) || AppCalc.multiply(CFG_TAX.TAX_RATE_MY_107D ?? 0.02, 100, 2);
        $("#taxRuleText").html(`
            馬來西亞 107D 扣繳門檻：RM ${taxThresholdMy.toLocaleString()}，扣繳比率：${taxPercent.toLocaleString()}%
            <br/>
            次月 15 日撥款入帳
        `);
    } else {
        const taxThresholdTw = CFG_TAX.TAX_THRESHOLD_TW ?? 20000.00;
        const nhiThresholdTw = CFG_TAX.NHI_THRESHOLD_TW ?? 20000.00;
        const taxPercent = parseFloat($("#cfgTaxRate").val()) || AppCalc.multiply(CFG_TAX.TAX_RATE_TW ?? 0.10, 100, 2);
        const nhiPercent = parseFloat($("#cfgNhiRate").val()) || AppCalc.multiply(CFG_TAX.NHI_RATE_TW ?? 0.0211, 100, 2);
        $("#taxRuleText").html(`
            台灣所得稅扣繳門檻：NT$ ${taxThresholdTw.toLocaleString()}，扣繳比率：${taxPercent.toLocaleString()}%
            <br/>
            台灣二代健保扣繳門檻：NT$ ${nhiThresholdTw.toLocaleString()}，扣繳比率：${nhiPercent.toLocaleString()}%
            <br/>
            （個人 ${(CFG_ORG.SV_LINE_MANAGER || 3200).toLocaleString()} SV，免扣二代健保。）
            <br/>
            次月 15 日撥款入帳
        `);
    }
}

// ============================================================================
// 3. 生命週期與事件綁定 (Lifecycle & Events)
// ============================================================================
window.addEventListener('AppReady', async function () {
    initBonusTable();
    initBonusChart();
    initDefaultConfigValues();

    // 監聽所有輸入欄位即時聯動精算
    $("#inpPersonalSv, #inpGroupSv, #inpHistoryCumSv, #selRank, #inpActiveLines, #inpPearlLines, #inpTotalManagersInDepth, #inpTotalOrgSv, #cfgPvRatio, #cfgPointValue, #cfgTaxRate, #cfgExchangeRate, #cfgNhiRate").on("input change", function () {
        recalculateAll();
    });

    // 幣別切換自動化：生產力 PV、稅率與起扣標籤自動切換
    $("#grpCurrency button").on("click", function () {
        const targetCurr = $(this).data("currency");
        if (appState.currency === targetCurr) return;

        $("#grpCurrency button").removeClass("active");
        $(this).addClass("active");
        appState.currency = targetCurr;

        if (targetCurr === 'MYR') {
            $("#cfgPvRatio").val(CFG_ORG.PV_RATE?.MY || 3.5);
            $("#cfgTaxRate").val(AppCalc.multiply(CFG_TAX.TAX_RATE_MY_107D ?? 0.02, 100, 2));
            $("#lblTaxRate").html('<i class="fa-solid fa-file-invoice me-1"></i>107D扣繳：');
            $("#boxNhiRate").addClass('d-none');
        } else {
            $("#cfgPvRatio").val(CFG_ORG.PV_RATE?.TW || 25.0);
            $("#cfgTaxRate").val(AppCalc.multiply(CFG_TAX.TAX_RATE_TW ?? 0.10, 100, 2));
            $("#lblTaxRate").html('<i class="fa-solid fa-file-invoice me-1"></i>所得稅率：');
            $("#boxNhiRate").removeClass('d-none');
            $("#cfgNhiRate").val(AppCalc.multiply(CFG_TAX.NHI_RATE_TW ?? 0.0211, 100, 2));
        }

        updateTaxRuleInfo(targetCurr === 'MYR');
        recalculateAll();
    });

    // 新增非經理下線夥伴
    $("#btnAddDownline").on("click", function () {
        const nextId = Date.now();
        const defaultDownlineRank = appState.ranks.find(r => r.rank_level < 40)?.rank_id || 'RANK_01_MEMBER';
        downlinePartners.push({
            id: nextId,
            name: `新進夥伴 ${downlinePartners.length + 1}`,
            rank: defaultDownlineRank,
            sv: 400
        });
        renderDownlines();
        recalculateAll();
    });

    // 刪除下線夥伴
    $(document).on("click", ".btn-del-downline", function () {
        const id = $(this).data("id");
        downlinePartners = downlinePartners.filter(d => d.id !== id);
        renderDownlines();
        recalculateAll();
    });

    // 動態修改下線夥伴數值
    $(document).on("input change", ".inp-dl-name, .sel-dl-rank, .inp-dl-sv", function () {
        const id = $(this).closest("tr").data("id");
        const item = downlinePartners.find(d => d.id === id);
        if (!item) return;

        item.name = $(this).closest("tr").find(".inp-dl-name").val();
        item.rank = $(this).closest("tr").find(".sel-dl-rank").val();
        item.sv = parseFloat($(this).closest("tr").find(".inp-dl-sv").val()) || 0;

        recalculateAll();
    });

    // 情境推演切換
    $(".scenario-btn").on("click", function () {
        $(".scenario-btn").removeClass("active");
        $(this).addClass("active");
        applyScenario($(this).data("scenario"));
    });

    // 啟動雲端職級資料庫載入
    await fetchGoogleSheetsData();
});

// ============================================================================
// 4. UI 視圖渲染器 (Renderers)
// ============================================================================

/**
 * 動態渲染非經理下線組織列表 (僅抓取 rank_level < 40 之職級)
 */
function renderDownlines() {
    const $tbody =$("#downlineListBody");
    $tbody.empty();

    const nonManagerRanks = appState.ranks.filter(r => r.rank_level < 40);

    downlinePartners.forEach(item => {
        let rankOptionsHtml = '';
        nonManagerRanks.forEach(r => {
            const isSelected = (item.rank === r.rank_id || item.rank === r.rank_code) ? 'selected' : '';
            rankOptionsHtml += `<option value="${r.rank_id}" ${isSelected}>${r.rank_name_zh} (${Math.round(r.direct_rebate_rate * 100)}%)</option>`;
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
                <td class="text-center text-cyan cell-diff-rate">0%</td>
                <td class="text-end text-info cell-diff-amount">0</td>
                <td class="text-center">
                    <button type="button" class="btn btn-sm btn-link text-danger p-0 btn-del-downline" data-id="${item.id}" title="刪除夥伴">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
        $tbody.append(rowHtml);
    });
}

/**
 * 資格狀態 UI 提示更新
 */
function updateQualificationStatus(isPersonalQualified, isManagerQualified, isAutoRescued, activeLines) {
    const $txtPersonal =$("#txtPersonalQualified");
    const $txtGroup =$("#txtGroupQualified");
    const $autoRescueBox =$("#autoRescueBox");

    const svActiveThreshold = CFG_ORG.SV_LINE_ACTIVE || 160;
    const svManagerThreshold = CFG_ORG.SV_LINE_MANAGER || 3200;

    if (isPersonalQualified) {
        $txtPersonal.html(`<i class="fa-solid fa-circle-check text-success"></i> 個人責任額已達標 (滿 ${svActiveThreshold.toLocaleString()} SV)`);
    } else {
        $txtPersonal.html(`<i class="fa-solid fa-circle-xmark text-danger"></i> 個人責任額未達標 (不足 ${svActiveThreshold.toLocaleString()} SV，全月不領獎)`);
    }

    if (isManagerQualified) {
        $txtGroup.html('<i class="fa-solid fa-circle-check text-success"></i> 合格經理小組責任額已達標');
    } else {
        $txtGroup.html(`<i class="fa-solid fa-circle-xmark text-warning"></i> 小組未達 ${svManagerThreshold.toLocaleString()} SV (向上緊縮歸併)`);
    }

    if (isAutoRescued) {
        $autoRescueBox.show();$("#autoRescueTitle").html('<i class="fa-solid fa-shield-halved text-success"></i> 業績自動補救：已啟動');
        $("#autoRescueDesc").text(`具備 ${activeLines} 條合格經理線（超過4條），免除個人小組 ${svManagerThreshold.toLocaleString()} SV 責任額！`);
    } else {
        $autoRescueBox.show();$("#autoRescueTitle").html('<i class="fa-solid fa-circle-info text-info"></i> 業績自動補救條件：未啟動');
        $("#autoRescueDesc").text(`需晉升珍珠級以上且培育 5 條以上合格經理線方可啟動免小組 ${svManagerThreshold.toLocaleString()} SV 責任額機制。`);
    }
}

// ============================================================================
// 5. 核心獎金精算排程 (AppCalc 嚴格定點數計算引擎)
// ============================================================================
function recalculateAll() {
    if (!appState.ranks || appState.ranks.length === 0) return;

    const curr = appState.currency;
    const fxRate = parseFloat($("#cfgExchangeRate").val()) || CFG_FIN.EXCHANGE_RATE?.MYR_TWD || 8.00;
    const pvRatio = parseFloat($("#cfgPvRatio").val()) || (curr === 'MYR' ? (CFG_ORG.PV_RATE?.MY || 3.5) : (CFG_ORG.PV_RATE?.TW || 25.0));
    const pointVal = parseFloat($("#cfgPointValue").val()) || CFG_ORG.LEADERSHIP_POINT_VALUE || 0.70;
    const currentTaxRate = AppCalc.divide(parseFloat($("#cfgTaxRate").val()) || 0, 100, 4);
    const currentNhiRate = AppCalc.divide(parseFloat($("#cfgNhiRate").val()) || 0, 100, 4);

    const personalSV = parseFloat($("#inpPersonalSv").val()) || 0;
    const groupSV = parseFloat($("#inpGroupSv").val()) || 0;
    const selectedRankKey = $("#selRank").val();

    const currentRank = appState.ranks.find(r => r.rank_id === selectedRankKey || r.rank_code === selectedRankKey) || appState.ranks[0];

    const activeLines = parseInt($("#inpActiveLines").val()) || 0;
    const pearlLines = parseInt($("#inpPearlLines").val()) || 0;
    const managersInDepth = parseInt($("#inpTotalManagersInDepth").val()) || 0;
    const totalOrgSV = parseFloat($("#inpTotalOrgSv").val()) || 0;

    // 1. 檢核資格指標 (讀取 APP_CONFIG.ORG 考核責任額)
    const svActiveReq = currentRank.month_personal_sv_req || CFG_ORG.SV_LINE_ACTIVE || 160;
    const svManagerReq = currentRank.month_group_sv_req || CFG_ORG.SV_LINE_MANAGER || 3200;

    const isPersonalQualified = personalSV >= svActiveReq;
    const isAutoRescued = (currentRank.has_pearl_dividend === 'Y' || currentRank.rank_level >= 70) && activeLines >= 5;
    const effectiveGroupSV = AppCalc.add(personalSV, groupSV);
    const isManagerQualified = isPersonalQualified && (currentRank.rank_level >= 40) && (effectiveGroupSV >= svManagerReq || isAutoRescued);

    // 貨幣轉換與標準化呈現輔助
    const toCurrentCurrency = (twdVal) => (curr === 'MYR' && fxRate > 0) ? AppCalc.divide(twdVal, fxRate, 2) : twdVal;
    const formatMoney = (val) => {
        if (typeof formatCurrency === 'function') return formatCurrency(Math.round(val), curr);
        const prefix = curr === 'MYR' ? 'RM ' : 'NT$ ';
        return `${prefix}${Math.round(val).toLocaleString()}`;
    };

    // 動態更新職級徽章
    const badgeTextColor = getContrastTextColor(currentRank.badge_color_hex);
    const rebatePercent = Math.round(currentRank.direct_rebate_rate * 100);
    $("#rankBadgeContainer").html(`
        <span class="badge-rank" style="background-color: ${currentRank.badge_color_hex}; color: ${badgeTextColor}; border: 1px solid rgba(255, 255, 255, 0.25);">
            <i class="${currentRank.badge_icon_class} me-1"></i>${currentRank.rank_name_zh} (${rebatePercent}%)
        </span>
    `);
    $("#txtLeadershipDepth").text(`解鎖深度：${currentRank.leadership_gen_depth} 代`);

    updateQualificationStatus(isPersonalQualified, isManagerQualified, isAutoRescued, activeLines);

    // 2. 個人回饋獎金 (直接乘上當前幣別之生產力點值 PV)
    let personalBonus = 0;
    if (isPersonalQualified) {
        personalBonus = AppCalc.multiply(AppCalc.multiply(personalSV, currentRank.direct_rebate_rate, 4), pvRatio, 2);
    }

    // 3. 組織階差獎金
    let differentialBonus = 0;
    $("#downlineListBody tr").each(function () {
        const id = $(this).data("id");
        const item = downlinePartners.find(d => d.id === id);
        if (!item) return;

        const dlRank = appState.ranks.find(r => r.rank_id === item.rank || r.rank_code === item.rank);
        const downlineRate = dlRank ? dlRank.direct_rebate_rate : 0.05;
        const diffRate = Math.max(0, AppCalc.sub(currentRank.direct_rebate_rate, downlineRate));
        const lineBonus = isPersonalQualified ? AppCalc.multiply(AppCalc.multiply(item.sv, diffRate, 4), pvRatio, 2) : 0;

        differentialBonus = AppCalc.add(differentialBonus, lineBonus);

        $(this).find(".cell-diff-rate").text(`${AppCalc.multiply(diffRate, 100, 0)}%`);
        $(this).find(".cell-diff-amount").text(formatMoney(lineBonus));
    });

    // 4. 定額合格獎金 (MYR 自動依基準匯率折算)
    let qualifiedGroupBonus = (isManagerQualified && (currentRank.has_group_bonus === 'Y' || currentRank.has_group_bonus === '是')) ? toCurrentCurrency(10000) : 0;
    let qualifiedManagerBonus = (isManagerQualified && (currentRank.has_manager_bonus === 'Y' || currentRank.has_manager_bonus === '是')) ? toCurrentCurrency(5000) : 0;

    // 5. 全球領導獎金 (合格經理責任額 SV × 6% × 領導點值 × PV)
    let leadershipBonus = 0;
    const managerSvReq = CFG_ORG.SV_LINE_MANAGER || 3200;
    if (isManagerQualified && currentRank.leadership_gen_depth > 0 && managersInDepth > 0) {
        const singleMgrScore = AppCalc.multiply(managerSvReq, currentRank.leadership_gen_rate, 4);
        const totalScore = AppCalc.multiply(singleMgrScore, managersInDepth, 2);
        leadershipBonus = AppCalc.multiply(AppCalc.multiply(totalScore, pointVal, 4), pvRatio, 2);
    }

    // 6. 珍鑽分紅獎金
    let pearlDividend = 0;
    if (isManagerQualified && (currentRank.has_pearl_dividend === 'Y' || currentRank.has_pearl_dividend === '是')) {
        pearlDividend = AppCalc.multiply(activeLines, toCurrentCurrency(6000), 2);
    }

    // 7. 珍鑽年度卓越獎金
    let annualExcellenceBonus = 0;
    if (isManagerQualified && (currentRank.has_annual_excellence === 'Y' || currentRank.has_annual_excellence === '是')) {
        const perLineAnnual = (currentRank.rank_level >= 90) ? 4600 : 3571;
        annualExcellenceBonus = AppCalc.multiply(activeLines, toCurrentCurrency(perLineAnnual), 2);
    }

    // 8. 珍鑽旅遊獎勵金
    let travelIncentiveBonus = 0;
    if (isManagerQualified && (currentRank.has_travel_incentive === 'Y' || currentRank.has_travel_incentive === '是')) {
        const perLineTravel = (currentRank.rank_level >= 90) ? 1900 : 1428;
        travelIncentiveBonus = AppCalc.multiply(activeLines, toCurrentCurrency(perLineTravel), 2);
    }

    // 9. 藍鑽購車分期基金
    let carFundBonus = 0;
    if (isManagerQualified && (currentRank.has_car_fund === 'Y' || currentRank.has_car_fund === '是') && 
        activeLines >= currentRank.qualified_lines_req && 
        pearlLines >= currentRank.pearl_lines_req && 
        totalOrgSV >= currentRank.month_org_sv_req) {
        carFundBonus = toCurrentCurrency(27000);
    }

    // 應發總獎金合計
    let grossBonus = AppCalc.add(personalBonus, differentialBonus);
    grossBonus = AppCalc.add(grossBonus, qualifiedGroupBonus);
    grossBonus = AppCalc.add(grossBonus, qualifiedManagerBonus);
    grossBonus = AppCalc.add(grossBonus, leadershipBonus);
    grossBonus = AppCalc.add(grossBonus, pearlDividend);
    grossBonus = AppCalc.add(grossBonus, annualExcellenceBonus);
    grossBonus = AppCalc.add(grossBonus, travelIncentiveBonus);
    grossBonus = AppCalc.add(grossBonus, carFundBonus);

    // 10. 法定代扣款計算 (依 APP_CONFIG.FIN.TAX_RULES 門檻自動判定)
    let withholdingTax = 0;
    let nhiTax = 0;
    let deductionDetail = '';

    // 判定是否為「純個人自購達標」（個人業績達 3,200 SV 且無下線小組業績貢獻）
    const isPurePersonalManager = (personalSV >= svManagerReq) && (groupSV === 0) && (differentialBonus === 0);

    if (curr === 'MYR') {
        const thresholdMy = CFG_TAX.TAX_THRESHOLD_MY_107D ?? 100000.00;
        withholdingTax = (grossBonus >= thresholdMy) ? AppCalc.multiply(grossBonus, currentTaxRate, 2) : 0;
        nhiTax = 0;
        deductionDetail = (grossBonus >= thresholdMy) 
            ? `107D扣繳稅 (${AppCalc.multiply(currentTaxRate, 100, 2)}%)` 
            : `未達 107D 扣繳門檻 (RM ${thresholdMy.toLocaleString()})`;
    } else {
        const taxThresholdTw = CFG_TAX.TAX_THRESHOLD_TW ?? 20000.00;
        const nhiThresholdTw = CFG_TAX.NHI_THRESHOLD_TW ?? 20000.00;

        // 所得稅扣繳（達門檻 20,000 元即扣）
        withholdingTax = (grossBonus >= taxThresholdTw) ? AppCalc.multiply(grossBonus, currentTaxRate, 2) : 0;

        // 二代健保判定：若為純個人自購完成 3,200 SV，認定為自用折讓免扣補充保費；若有下線組織業績才扣繳
        if (isPurePersonalManager) {
            nhiTax = 0;
        } else {
            nhiTax = (grossBonus >= nhiThresholdTw) ? AppCalc.multiply(grossBonus, currentNhiRate, 2) : 0;
        }

        const taxStr = (grossBonus >= taxThresholdTw) 
            ? `所得稅：NT$ ${Math.round(withholdingTax).toLocaleString()}` 
            : `未達所得稅扣繳門檻 (NT$ ${taxThresholdTw.toLocaleString()})`;

        let nhiStr = '';
        if (isPurePersonalManager) {
            nhiStr = `健保：NT$ 0<br/>（個人 ${svManagerReq.toLocaleString()} SV，免扣二代健保）`;
        } else {
            nhiStr = (grossBonus >= nhiThresholdTw) 
                ? `健保：NT$ ${Math.round(nhiTax).toLocaleString()}` 
                : `未達健保扣繳門檻 (NT$ ${nhiThresholdTw.toLocaleString()})`;
        }

        deductionDetail = `${taxStr}<br/>${nhiStr}`;
    }

    const totalDeduction = AppCalc.add(withholdingTax, nhiTax);
    const netPayout = AppCalc.sub(grossBonus, totalDeduction);

    // 渲染 UI 統計面板數值 (靠右對齊並以 .toLocaleString 格式化)
    $("#valGrossBonus").text(formatMoney(grossBonus));
    $("#valGrossBonusWan").text(`約 ${(grossBonus / 10000).toFixed(1)} 萬元`);
    $("#valTotalDeduction").text(`- ${formatMoney(totalDeduction)}`);
    $("#valDeductionDetail").html(deductionDetail);
    $("#valNetPayout").text(formatMoney(netPayout));

    // 渲染八大獎金明細表資料列
    renderBonusTableData([
        { name: "個人回饋獎金", rate: `${AppCalc.multiply(currentRank.direct_rebate_rate, 100, 0)}%`, basis: `${personalSV.toLocaleString()} SV × PV`, amount: personalBonus },
        { name: "組織階差獎金", rate: "階梯差額", basis: "非經理下線業績差額加總", amount: differentialBonus },
        { name: "合格小組獎金", rate: "10% 提撥", basis: qualifiedGroupBonus > 0 ? "合格經理全球加權分攤" : "未達合格經理責任額", amount: qualifiedGroupBonus },
        { name: "合格經理獎金", rate: "5% 提撥", basis: qualifiedManagerBonus > 0 ? "合格經理全球加權分攤" : "未達合格經理責任額", amount: qualifiedManagerBonus },
        { name: "全球領導獎金", rate: `${currentRank.leadership_gen_depth}代各${AppCalc.multiply(currentRank.leadership_gen_rate, 100, 0)}%`, basis: `${managersInDepth} 位經理 × ${managerSvReq.toLocaleString()} SV × 6% × 點值`, amount: leadershipBonus },
        { name: "珍鑽分紅獎金", rate: "5% 提撥", basis: `${activeLines} 條合格經理實動線加權`, amount: pearlDividend },
        { name: "珍鑽年度卓越獎金", rate: "5% 提撥", basis: "年度 1~12 月累積 (月均攤提)", amount: annualExcellenceBonus },
        { name: "珍鑽旅遊獎勵金", rate: "1.5% 提撥", basis: "年度 7~6 月累積 (月均攤提)", amount: travelIncentiveBonus },
        { name: "藍鑽購車分期基金", rate: "3.5% 提撥", basis: carFundBonus > 0 ? "藍鑽考核達標 (分 36 期月補貼)" : "未達藍鑽門檻", amount: carFundBonus }
    ], grossBonus);

    // 計算被動現金流比例並更新圓餅圖
    const passiveTotal = AppCalc.add(AppCalc.add(leadershipBonus, pearlDividend), AppCalc.add(annualExcellenceBonus, AppCalc.add(travelIncentiveBonus, carFundBonus)));
    const passiveRatio = grossBonus > 0 ? AppCalc.multiply(AppCalc.divide(passiveTotal, grossBonus, 4), 100, 2) : 0;
    $("#valPassiveRatio").text(`${passiveRatio}%`);

    updateBonusChart({
        personal: AppCalc.add(personalBonus, differentialBonus),
        groupMgr: AppCalc.add(qualifiedGroupBonus, qualifiedManagerBonus),
        leadership: leadershipBonus,
        dividends: AppCalc.add(AppCalc.add(pearlDividend, annualExcellenceBonus), travelIncentiveBonus),
        carFund: carFundBonus
    });
}

// ============================================================================
// 6. DataTable 與 Chart.js 整合
// ============================================================================

/**
 * 初始化 DataTable.js
 */
function initBonusTable() {
    bonusDataTableInstance = $('#tblBonusAudit').DataTable({
        paging: false,
        searching: false,
        info: false,
        ordering: false,
        data: [],
        columns: [
            { data: 'name', render: data => `<span class="fw-bold">${data}</span>` },
            { data: 'rate', render: data => `<span class="badge bg-secondary">${data}</span>` },
            { data: 'basis', render: data => `<span class="small text-muted">${data}</span>` },
            { 
                data: 'amount', 
                className: 'text-end',
                render: data => {
                    const val = Number(data) || 0;
                    const prefix = appState.currency === 'MYR' ? 'RM ' : 'NT$ ';
                    return `<span class="${val > 0 ? 'text-info fw-bold' : 'text-muted'}">${prefix}${Math.round(val).toLocaleString()}</span>`;
                }
            }
        ],
        language: {
            emptyTable: "尚無核算資料"
        }
    });
}

/**
 * 渲染 DataTable 資料行與表尾合計
 */
function renderBonusTableData(dataset, grossTotal) {
    if (!bonusDataTableInstance) return;
    const prefix = appState.currency === 'MYR' ? 'RM ' : 'NT$ ';
    
    // 同步更新表頭幣別標註
    $('#tblBonusAudit thead th').eq(3).text(appState.currency === 'MYR' ? '預估金額 (RM)' : '預估金額 (NT$)');

    bonusDataTableInstance.clear().rows.add(dataset).draw();
    $("#valTableGrossTotal").text(`${prefix}${Math.round(grossTotal).toLocaleString()}`);
}

/**
 * 初始化 Chart.js 環狀結構圖
 */
function initBonusChart() {
    const ctx = document.getElementById('bonusDoughnutChart').getContext('2d');
    doughnutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['個人與小組階差', '合格小組與經理獎', '全球領導獎金 (6%)', '珍鑽分紅與年終', '購車基金'],
            datasets: [{
                data: [0, 0, 0, 0, 0],
                backgroundColor: [
                    '#38bdf8',
                    '#20c997',
                    '#f59e0b',
                    '#818cf8',
                    '#ec4899'
                ],
                borderWidth: 2,
                borderColor: '#0f1a36'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#f5f3ff',
                        font: { size: 12 },
                        padding: 14
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const val = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percent = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                            const prefix = appState.currency === 'MYR' ? 'RM ' : 'NT$ ';
                            return `${label}: ${prefix}${Math.round(val).toLocaleString()} (${percent}%)`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });
}

/**
 * 更新環狀圖數據
 */
function updateBonusChart(data) {
    if (!doughnutChartInstance) return;
    doughnutChartInstance.data.datasets[0].data = [
        Math.round(data.personal),
        Math.round(data.groupMgr),
        Math.round(data.leadership),
        Math.round(data.dividends),
        Math.round(data.carFund)
    ];
    doughnutChartInstance.update();
}

// ============================================================================
// 7. 典型事業階梯推演情境
// ============================================================================
function applyScenario(scenarioKey) {
    if (!appState.ranks || appState.ranks.length === 0) return;

    const rankMember = appState.ranks.find(r => r.rank_level === 10) || appState.ranks[0];
    const rankDir = appState.ranks.find(r => r.rank_level === 20) || appState.ranks[0];
    const rankVmgr = appState.ranks.find(r => r.rank_level === 30) || appState.ranks[0];
    const rankMgr = appState.ranks.find(r => r.rank_level === 40);
    const rankPearl = appState.ranks.find(r => r.rank_level === 70);
    const rankDiamond = appState.ranks.find(r => r.rank_level === 90);

    if (scenarioKey === 'PART_TIME' && rankMgr) {
        $("#selRank").val(rankMgr.rank_id);
        $("#inpPersonalSv").val(400);
        $("#inpGroupSv").val(2800);
        $("#inpActiveLines").val(0);
        $("#inpPearlLines").val(0);
        $("#inpTotalManagersInDepth").val(0);
        $("#inpTotalOrgSv").val(3200);

        downlinePartners = [
            { id: 1, name: "下線夥伴甲 (主任)", rank: rankDir.rank_id, sv: 1400 },
            { id: 2, name: "下線夥伴乙 (會員)", rank: rankMember.rank_id, sv: 1400 }
        ];
    } else if (scenarioKey === 'FULL_TIME' && rankPearl) {
        $("#selRank").val(rankPearl.rank_id);
        $("#inpPersonalSv").val(400);
        $("#inpGroupSv").val(2800);
        $("#inpActiveLines").val(7);
        $("#inpPearlLines").val(0);
        $("#inpTotalManagersInDepth").val(13);
        $("#inpTotalOrgSv").val(45000);

        downlinePartners = [
            { id: 1, name: "零售與直屬夥伴", rank: rankVmgr.rank_id, sv: 2800 }
        ];
    } else if (scenarioKey === 'ENTERPRISE' && rankDiamond) {
        $("#selRank").val(rankDiamond.rank_id);
        $("#inpPersonalSv").val(400);
        $("#inpGroupSv").val(2800);
        $("#inpActiveLines").val(10);
        $("#inpPearlLines").val(3);
        $("#inpTotalManagersInDepth").val(22);
        $("#inpTotalOrgSv").val(110000);

        downlinePartners = [
            { id: 1, name: "直屬零售小組", rank: rankVmgr.rank_id, sv: 2800 }
        ];
    }

    renderDownlines();
    recalculateAll();
}