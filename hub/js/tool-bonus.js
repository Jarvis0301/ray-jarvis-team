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

// 預設下線非經理組織模擬清單：一位（職級會員、0 SV）
let downlinePartners = [
    { id: 1, name: "夥伴 A", rank: "RANK_01_MEMBER", sv: 0 }
];

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

        // 確保初始下線夥伴職級對齊會員 (rank_level 10)
        const memberRank = appState.ranks.find(r => r.rank_level === 10)?.rank_id || appState.ranks[0]?.rank_id;
        if (downlinePartners.length === 1 && downlinePartners[0].sv === 0 && memberRank) {
            downlinePartners[0].rank = memberRank;
        }

        renderDownlines();
        updateGroupSvFromDownlines();
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
 * 計算最佳 WCAG 對比字色
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

    // 健保費率預設初始化
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
            <ul class="mb-0">
                <li>馬來西亞 107D 扣繳門檻：RM ${taxThresholdMy.toLocaleString()}，扣繳比率：${taxPercent.toLocaleString()}%</li>
                <li>次月 15 日撥款入帳</li>
            </ul>
        `);
    } else {
        const taxThresholdTw = CFG_TAX.TAX_THRESHOLD_TW ?? 20000.00;
        const nhiThresholdTw = CFG_TAX.NHI_THRESHOLD_TW ?? 20000.00;
        const taxPercent = parseFloat($("#cfgTaxRate").val()) || AppCalc.multiply(CFG_TAX.TAX_RATE_TW ?? 0.10, 100, 2);
        const nhiPercent = parseFloat($("#cfgNhiRate").val()) || AppCalc.multiply(CFG_TAX.NHI_RATE_TW ?? 0.0211, 100, 2);
        $("#taxRuleText").html(`
            <ul class="mb-0">
                <li>台灣所得稅扣繳門檻：NT$ ${taxThresholdTw.toLocaleString()}，扣繳比率：${taxPercent.toLocaleString()}%</li>
                <li>台灣二代健保扣繳門檻：NT$ ${nhiThresholdTw.toLocaleString()}，扣繳比率：${nhiPercent.toLocaleString()}%
                <br/>
                （個人 ${(CFG_ORG.SV_LINE_MANAGER || 3200).toLocaleString()} SV，免扣二代健保。）</li>
                <li>次月 15 日撥款入帳</li>
            </ul>
        `);
    }
}

// ============================================================================
// 3. 生命週期與事件綁定 (Lifecycle & Events)
// ============================================================================
window.addEventListener('AppReady', async function () {
    initBonusTable();
    initDefaultConfigValues();

    // 個人業績變更時，同步重新計算小組 SV 並觸發精算
    $("#inpPersonalSv").on("input change", function () {
        updateGroupSvFromDownlines();
        recalculateAll();
    });

    // 其餘控制項維持即時精算
    $("#inpHistoryCumSv, #selRank, #inpActiveLines, #inpPearlLines, #inpTotalManagersInDepth, #inpTotalOrgSv, #cfgPvRatio, #cfgPointValue, #cfgTaxRate, #cfgExchangeRate, #cfgNhiRate").on("input change", function () {
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

    // 新增非經理下線夥伴 (預設會員、0 SV)
    $("#btnAddDownline").on("click", function () {
        const nextId = Date.now();
        const memberRank = appState.ranks.find(r => r.rank_level === 10)?.rank_id || appState.ranks.find(r => r.rank_level < 40)?.rank_id || 'RANK_01_MEMBER';
        downlinePartners.push({
            id: nextId,
            name: `新進夥伴 ${downlinePartners.length + 1}`,
            rank: memberRank,
            sv: 0
        });
        renderDownlines();
        updateGroupSvFromDownlines();
        recalculateAll();
    });

    // 刪除下線夥伴 (連動小組業績)
    $(document).on("click", ".btn-del-downline", function () {
        const id = $(this).data("id");
        downlinePartners = downlinePartners.filter(d => d.id !== id);
        renderDownlines();
        updateGroupSvFromDownlines();
        recalculateAll();
    });

    // 動態修改下線夥伴數值 (連動小組業績)
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

    // 情境按鈕點擊切換
    $(".scenario-btn[data-scenario]").on("click", function () {
        $(".scenario-btn").removeClass("active");
        $(this).addClass("active");
        applyScenario($(this).data("scenario"));
    });

    // 清空按鈕點擊
    $("#btnClearParams").on("click", function () {
        resetAllParams(false);
    });

    // 啟動雲端職級資料庫載入
    await fetchGoogleSheetsData();
});

// ============================================================================
// 4. UI 視圖渲染器與資料同步函式
// ============================================================================

/**
 * 自動累計「本月個人業績 (SV)」與「所有非經理下線業績 (SV)」
 * 連動更新個人小組業績欄位（唯讀自動計算）
 */
function updateGroupSvFromDownlines() {
    const personalSV = parseFloat($('#inpPersonalSv').val()) || 0;
    const totalDownlineSv = downlinePartners.reduce((acc, cur) => {
        return AppCalc.add(acc, Number(cur.sv) || 0);
    }, 0);

    // 本月個人 SV + 下線夥伴 SV 總和
    const totalGroupSv = AppCalc.add(personalSV, totalDownlineSv);

    // 靠右對齊並以 .toLocaleString() 格式化顯示
    $('#inpGroupSv').val(totalGroupSv.toLocaleString());
}

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
                <td class="text-end text-secondary cell-diff-rate">0%</td>
                <td class="text-end text-yellow cell-diff-amount">0</td>
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
        $autoRescueBox.show();
        $("#autoRescueTitle").html('<i class="fa-solid fa-shield-halved text-success"></i> 業績自動補救：已啟動');
        $("#autoRescueDesc").text(`具備 ${activeLines} 條合格經理線（超過4條），免除個人小組 ${svManagerThreshold.toLocaleString()} SV 考核責任額以領取經理與領導獎金（★ 合格小組獎金除外，仍須實質達標）。`);
    } else {
        $autoRescueBox.show();
        $("#autoRescueTitle").html('<i class="fa-solid fa-circle-info text-info"></i> 業績自動補救條件：未啟動');
        $("#autoRescueDesc").text(`需晉升珍珠級以上且培育 5 條以上合格經理線，方可啟動免小組 ${svManagerThreshold.toLocaleString()} SV 責任額機制。`);
    }
}

// ============================================================================
// 5. 核心獎金精算排程 (AppCalc 嚴格定點數計算引擎)
// ============================================================================
/**
 * 核心獎金精算排程 (AppCalc 嚴格定點數計算引擎)
 * 整合 2026 年新制（合格小組 NT$ 12,000 / 合格經理 NT$ 7,000）、
 * 實質小組 3,200 SV 門檻、自動補救排除條件、高階體系合格線/代數連動與 UIBadges
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
    // 小組業績已由 updateGroupSvFromDownlines 自動加總「個人 SV + 下線 SV」，解構逗號取值
    const groupSV = parseFloat(String($("#inpGroupSv").val() || '0').replace(/,/g, '')) || 0;
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
    // 因 #inpGroupSv 已自動包含個人 SV，此處實質總額直接對齊 groupSV
    const effectiveGroupSV = groupSV;

    // 實質小組達標 (個人 + 下線合計 >= 3,200 SV)
    const isGroupSvReached = effectiveGroupSV >= svManagerReq;

    // 業績自動補救判定 (珍珠級以上且合格經理線 >= 5 條)
    const isAutoRescued = (currentRank.has_pearl_dividend === 'Y' || currentRank.rank_level >= 70) && activeLines >= 5;

    // 經理合格身分（符合責任額或啟動自動補救）
    const isManagerQualified = isPersonalQualified && (currentRank.rank_level >= 40) && (isGroupSvReached || isAutoRescued);

    // 貨幣轉換與標準化呈現輔助
    const toCurrentCurrency = (twdVal) => (curr === 'MYR' && fxRate > 0) ? AppCalc.divide(twdVal, fxRate, 2) : twdVal;
    const formatMoney = (val) => {
        if (typeof formatCurrency === 'function') return formatCurrency(Math.round(val), curr);
        const prefix = curr === 'MYR' ? 'RM ' : 'NT$ ';
        return `${prefix}${Math.round(val).toLocaleString()}`;
    };

    // 動態更新職級徽章 (改接共用元件 UIBadges.rank.badge)
    $("#rankBadgeContainer").html(UIBadges.rank.badge(currentRank));
    $("#txtLeadershipDepth").text(`解鎖深度：${currentRank.leadership_gen_depth} 代`);

    updateQualificationStatus(isPersonalQualified, isManagerQualified, isAutoRescued, activeLines);

    // 2. 個人回饋獎金 (直接乘上當前幣別之生產力點值 PV)
    let personalBonus = 0;
    if (isPersonalQualified) {
        personalBonus = AppCalc.multiply(AppCalc.multiply(personalSV, currentRank.direct_rebate_rate, 4), pvRatio, 2);
    }

    // 3. 組織階差獎金
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

    // 4. 定額合格獎金 (2026年新制：合格小組 NT$ 12,000 / 合格經理 NT$ 7,000)
    // ★ 合格小組獎金：一定要當月個人小組實質達標 3,200 SV（珍珠自動補救不算，除外不適用）
    const isGroupBonusQualified = isPersonalQualified && (currentRank.rank_level >= 40) && isGroupSvReached;
    let qualifiedGroupBonus = (isGroupBonusQualified && (currentRank.has_group_bonus === 'Y' || currentRank.has_group_bonus === '是')) 
        ? toCurrentCurrency(12000) 
        : 0;

    // 合格經理獎金：經理合格即可領取（包含自動補救啟動者）
    let qualifiedManagerBonus = (isManagerQualified && (currentRank.has_manager_bonus === 'Y' || currentRank.has_manager_bonus === '是')) 
        ? toCurrentCurrency(7000) 
        : 0;

    // 5. 全球領導獎金 (合格經理責任額 SV × 6% × 領導點值 × PV)
    // ★ 規則：經理合格 + 松柏以上 + 直屬合格經理線達標 (松柏≥1, 長青≥2, 珍珠≥4, 翡翠≥6, 藍鑽≥10) + 代數內經理人數 > 0
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

    // 珍鑽體系合格經理實動線門檻 (珍珠≥4, 翡翠≥6, 藍鑽≥10)
    const reqPearlLines = Math.max(currentRank.qualified_lines_req || 0, 4);
    const isPearlTierBase = isManagerQualified && (currentRank.rank_level >= 70) && (activeLines >= reqPearlLines);

    // 6. 珍鑽分紅獎金 (5% 提撥)
    // ★ 規則：經理合格 + 具備珍鑽分紅資格 + 合格經理線達標 (≥ 4 條)
    let pearlDividend = 0;
    const isPearlDividendQualified = isPearlTierBase && (currentRank.has_pearl_dividend === 'Y' || currentRank.has_pearl_dividend === '是');
    if (isPearlDividendQualified) {
        pearlDividend = AppCalc.multiply(activeLines, toCurrentCurrency(6000), 2);
    }

    // 7. 珍鑽年度卓越獎金 (5% 提撥)
    // ★ 規則：經理合格 + 具備卓越獎金資格 + 合格經理線達標
    let annualExcellenceBonus = 0;
    const isAnnualExcellenceQualified = isPearlTierBase && (currentRank.has_annual_excellence === 'Y' || currentRank.has_annual_excellence === '是');
    if (isAnnualExcellenceQualified) {
        const perLineAnnual = (currentRank.rank_level >= 90) ? 4600 : 3571;
        annualExcellenceBonus = AppCalc.multiply(activeLines, toCurrentCurrency(perLineAnnual), 2);
    }

    // 8. 珍鑽旅遊獎勵金 (1.5% 提撥)
    // ★ 規則：經理合格 + 具備旅遊獎勵資格 + 合格經理線達標
    let travelIncentiveBonus = 0;
    const isTravelIncentiveQualified = isPearlTierBase && (currentRank.has_travel_incentive === 'Y' || currentRank.has_travel_incentive === '是');
    if (isTravelIncentiveQualified) {
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
    const isPurePersonalManager = (personalSV >= svManagerReq) && (totalDownlineSv === 0) && (differentialBonus === 0);

    if (curr === 'MYR') {
        const thresholdMy = CFG_TAX.TAX_THRESHOLD_MY_107D ?? 100000.00;
        withholdingTax = (grossBonus >= thresholdMy) ? AppCalc.multiply(grossBonus, currentTaxRate, 2) : 0;
        nhiTax = 0;
        deductionDetail = (grossBonus >= thresholdMy) 
            ? `107D扣繳稅 (${AppCalc.multiply(currentTaxRate, 100, 2)}%)` 
            : `未達 107D 扣繳門檻`;
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
            : `未達所得稅扣繳門檻`;

        let nhiStr = '';
        if (isPurePersonalManager) {
            nhiStr = `健保：NT$ 0<br/>（個人 ${svManagerReq.toLocaleString()} SV，免扣二代健保）`;
        } else {
            nhiStr = (grossBonus >= nhiThresholdTw) 
                ? `健保：NT$ ${Math.round(nhiTax).toLocaleString()}` 
                : `未達健保扣繳門檻`;
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

    // 渲染八大獎金明細表資料列（核算依據與門檻提示文字）
    renderBonusTableData([
        { name: "個人回饋獎金", rate: `${AppCalc.multiply(currentRank.direct_rebate_rate, 100, 0)}%`, basis: `${personalSV.toLocaleString()} SV × PV`, amount: personalBonus },
        { name: "組織階差獎金", rate: "階梯差額", basis: "非經理下線業績差額加總", amount: differentialBonus },
        { 
            name: "合格小組獎金", 
            rate: "10% 提撥", 
            basis: qualifiedGroupBonus > 0 
                ? "個人小組實質達標 (≥ 3,200 SV)" 
                : (isAutoRescued ? "小組未滿 3,200 SV (自動補救不適用此項)" : "未達小組 3,200 SV 實質責任額"), 
            amount: qualifiedGroupBonus 
        },
        { 
            name: "合格經理獎金", 
            rate: "5% 提撥", 
            basis: qualifiedManagerBonus > 0 
                ? (isAutoRescued ? "經理合格 (業績自動補救啟動)" : "合格經理責任額達標") 
                : "未達合格經理資格", 
            amount: qualifiedManagerBonus 
        },
        { 
            name: "全球領導獎金", 
            rate: `${currentRank.leadership_gen_depth}代各${AppCalc.multiply(currentRank.leadership_gen_rate, 100, 0)}%`, 
            basis: leadershipBonus > 0 
                ? `${managersInDepth} 位經理 × ${svManagerReq.toLocaleString()} SV × 6% × 點值` 
                : (activeLines < reqActiveLines ? `合格經理線不足 (需 ≥ ${reqActiveLines} 條)` : (managersInDepth <= 0 ? "代數內經理人數為 0" : "未達領導獎金資格")), 
            amount: leadershipBonus 
        },
        { 
            name: "珍鑽分紅獎金", 
            rate: "5% 提撥", 
            basis: pearlDividend > 0 
                ? `${activeLines} 條合格經理實動線加權` 
                : (activeLines < reqPearlLines ? `實動線不足 (需 ≥ ${reqPearlLines} 條合格經理線)` : "未達珍鑽分紅資格"), 
            amount: pearlDividend 
        },
        { 
            name: "珍鑽年度卓越獎金", 
            rate: "5% 提撥", 
            basis: annualExcellenceBonus > 0 
                ? `年度 1~12 月累積 (月均攤提，${activeLines} 條線)` 
                : (activeLines < reqPearlLines ? `實動線不足 (需 ≥ ${reqPearlLines} 條合格經理線)` : "未達卓越獎金資格"), 
            amount: annualExcellenceBonus 
        },
        { 
            name: "珍鑽旅遊獎勵金", 
            rate: "1.5% 提撥", 
            basis: travelIncentiveBonus > 0 
                ? `年度 7~6 月累積 (月均攤提，${activeLines} 條線)` 
                : (activeLines < reqPearlLines ? `實動線不足 (需 ≥ ${reqPearlLines} 條合格經理線)` : "未達旅遊獎勵資格"), 
            amount: travelIncentiveBonus 
        },
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
    }, grossBonus);
}

// ============================================================================
// 6. DataTable 與 Chart.js 整合
// ============================================================================

/**
 * 初始化 DataTable.js (金額欄位前移至第 2 欄)
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
            { 
                data: 'amount', 
                className: 'text-end',
                render: data => {
                    const val = Number(data) || 0;
                    const prefix = appState.currency === 'MYR' ? 'RM ' : 'NT$ ';
                    return `<span class="${val > 0 ? 'text-yellow fw-bold' : 'text-muted'}">${formatCurrency(val, appState.currency)}</span>`;
                }
            },
            { data: 'rate', render: data => `<span class="text-secondary">${data}</span>` },
            { data: 'basis', render: data => `<span class="small text-muted">${data}</span>` }
        ],
        language: {
            emptyTable: "尚無核算資料"
        }
    });
}

/**
 * 渲染 DataTable 資料行與表尾合計 (同步更新第 2 欄表頭幣別)
 */
function renderBonusTableData(dataset, grossTotal) {
    if (!bonusDataTableInstance) return;
    const prefix = appState.currency === 'MYR' ? 'RM ' : 'NT$ ';
    
    // 同步更新表頭幣別標註 (第 2 欄：index 1)
    $('#tblBonusAudit thead th').eq(1).text(appState.currency === 'MYR' ? '預估金額 (RM)' : '預估金額 (NT$)');

    bonusDataTableInstance.clear().rows.add(dataset).draw();
    $("#valTableGrossTotal").text(`${formatCurrency(grossTotal, appState.currency)}`);
}

/**
 * 渲染八大獎金結構環形甜甜圈圖 (對接 AppChart 全域視覺中樞)
 */
function updateBonusChart(data, grossTotal = 0) {
    const curr = appState.currency;
    const currencyUnit = curr === 'MYR' ? 'RM' : 'NT$';

    const config = AppChart.createDoughnut({
        labels: ['個人與小組階差', '合格小組與經理', '全球領導獎金', '珍鑽分紅與年終', '購車基金'],
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
            label: '預估應發總額',
            value: `${currencyUnit} ${Math.round(grossTotal).toLocaleString()}`
        }
    });

    AppChart.render('bonusDoughnutChart', config);
}

/**
 * 清空所有參數設定（重設為 0，下線重設為 1 位 0 SV 會員）
 * @param {boolean} isSilent 是否靜默重置（進入頁面初始時不彈 Toast）
 */
function resetAllParams(isSilent = false) {
    $(".scenario-btn").removeClass("active");

    // 預設為經理職級
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

    // 重設下線夥伴為一位 0 SV 會員
    const memberRank = appState.ranks.find(r => r.rank_level === 10)?.rank_id || 'RANK_01_MEMBER';
    downlinePartners = [
        { id: Date.now(), name: "夥伴 A", rank: memberRank, sv: 0 }
    ];

    renderDownlines();
    updateGroupSvFromDownlines();
    recalculateAll();

    if (!isSilent && typeof AppToast !== 'undefined') {
        AppToast.info("已清空所有參數設定");
    }
}

/**
 * 套用典型情境配置（經理 / 珍珠 / 藍鑽）
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
            { id: 1, name: "下線夥伴甲 (主任)", rank: rankDir.rank_id, sv: 1400 },
            { id: 2, name: "下線夥伴乙 (會員)", rank: rankMember.rank_id, sv: 1400 }
        ];
    } else if (scenarioKey === 'PEARL' && rankPearl) {
        $("#selRank").val(rankPearl.rank_id);
        $("#inpPersonalSv").val(400);
        $("#inpActiveLines").val(7);
        $("#inpPearlLines").val(0);
        $("#inpTotalManagersInDepth").val(13);
        $("#inpTotalOrgSv").val(45000);

        downlinePartners = [
            { id: 1, name: "直屬非經理小組", rank: rankVmgr.rank_id, sv: 2800 }
        ];
    } else if (scenarioKey === 'DIAMOND' && rankDiamond) {
        $("#selRank").val(rankDiamond.rank_id);
        $("#inpPersonalSv").val(400);
        $("#inpActiveLines").val(10);
        $("#inpPearlLines").val(3);
        $("#inpTotalManagersInDepth").val(22);
        $("#inpTotalOrgSv").val(110000);

        downlinePartners = [
            { id: 1, name: "直屬非經理小組", rank: rankVmgr.rank_id, sv: 2800 }
        ];
    }

    renderDownlines();
    updateGroupSvFromDownlines();
    recalculateAll();
}