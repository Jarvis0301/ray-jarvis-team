// ==========================================================================
// 1. Google 雲端試算表設定與資料庫核心轉接器 (Adapter Pattern)
// ==========================================================================
const SPREADSHEET_ID = "1N-HniBDo7wJHidfsKyG-dr7kh0-UTNtFpM7nyFDL3eg";

/**
 * 試算表欄位索引安全取值工具函式
 * @param {Array} row 資料行陣列
 * @param {number} colIndex 欄位索引 (0-based)
 * @param {string} defaultVal 預設值
 * @returns {string} 清洗後的字串
 */
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && row[colIndex] !== '') {
        return row[colIndex].toString().trim();
    }
    return defaultVal;
}

// ==========================================================================
// 2. 系統狀態管理 (State Management)
// ==========================================================================
let appState = {
    ranks: [],
    activeRankList: [],
    currentRank: null,
    targetRank: null
};

let rankDataTableInstance = null;
let isInitialized = false;

// 幣別與匯率管理
let currentCurrency = 'TWD';

// 圖表實例管理
let chartBonusPie = null;
let chartGapsRadar = null;
let chartRankIncomeBar = null;

/**
 * 取得當前設定匯率與幣別換算比率
 */
function getCurrencyFactor() {
    const exchangeRate = parseFloat($('#inputExchangeRate').val()) || 8.00;
    const isMYR = (currentCurrency === 'MYR');
    return {
        symbol: isMYR ? 'RM' : 'NT$',
        rate: isMYR ? (1 / exchangeRate) : 1
    };
}

/**
 * 幣別金額轉換與格式化工具函式
 */
function formatMoney(amountInTwd) {
    const { symbol, rate } = getCurrencyFactor();
    const converted = Math.round(amountInTwd * rate);
    return `${symbol} ${converted.toLocaleString()}`;
}

// ==========================================================================
// 3. 系統生命週期與事件初始化
// ==========================================================================
window.addEventListener('AppReady', async () => {
    await initApp();
});

async function initApp() {
    if (isInitialized) return;
    isInitialized = true;

    bindUIEvents();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        showErrorNotice("未設定 Google 試算表 ID，無法讀取職級主檔資料！");
    }
}

// ==========================================================================
// 4. PapaParse + GViz 資料讀取引擎 (表 org_ranks 職級主檔讀取)
// ==========================================================================
async function fetchGoogleSheetsData() {
    const $syncTag = $('#syncStatusTag');
    const $btnSync = $('#btnSyncGoogleSheets');

    try {
        if ($syncTag.length) {
            $syncTag.html('<i class="fa-solid fa-spinner fa-spin text-info"></i> 職級標準同步中...');
        }
        if ($btnSync.length) {
            $btnSync.prop('disabled', true);
        }

        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP 通訊錯誤狀態碼: ${res.status}`);
            const text = await res.text();

            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return parsed.data.slice(1);
        };

        const rawRows = await fetchSheet('職級主檔');

        if (!rawRows || rawRows.length === 0) {
            throw new Error("試算表『職級主檔』工作表中未讀取到任何有效數據。");
        }

        const parsedRanks = parseRanksTable(rawRows);
        appState.ranks = parsedRanks;
        appState.activeRankList = parsedRanks.filter(r => r.is_active === 'Y').sort((a, b) => a.sort_order - b.sort_order);

        if (appState.activeRankList.length === 0) {
            throw new Error("『職級主檔』中無啟用中 (is_active='Y') 的職級定義。");
        }

        populateTargetRankDropdown();
        renderRankDataTable();
        runSimulation();

        if ($syncTag.length) {
            $syncTag.html(`<i class="fa-solid fa-circle-check text-success"></i> 已同步 ${appState.activeRankList.length} 階官方標準`);
        }
        if ($btnSync.length) {
            $btnSync.prop('disabled', false);
        }
    } catch (err) {
        console.error("Google Sheets 職級主檔讀取失敗:", err);
        if ($syncTag.length) {
            $syncTag.html('<i class="fa-solid fa-triangle-exclamation text-danger"></i> 同步失敗');
        }
        if ($btnSync.length) {
            $btnSync.prop('disabled', false);
        }
        showErrorNotice("無法連線至 Google 試算表讀取職級標準，請檢查網路連線或共用權限！");
    }
}

/**
 * 依據資料庫表 org_ranks 定義進行精準 0-based 欄位索引映射
 */
function parseRanksTable(rows) {
    return rows.map((r, idx) => {
        return {
            rank_id: getVal(r, 0, `RANK_${String(idx + 1).padStart(2, '0')}`),
            rank_code: getVal(r, 1, `R${(idx + 1) * 10}`),
            rank_level: parseInt(getVal(r, 2, String((idx + 1) * 10))) || 10,
            rank_name_zh: getVal(r, 3, '未命名職級'),
            rank_name_en: getVal(r, 4, 'Rank'),
            cum_group_sv_req: parseFloat(getVal(r, 5, '0')) || 0,
            month_personal_sv_req: parseFloat(getVal(r, 6, '160')) || 160,
            month_group_sv_req: parseFloat(getVal(r, 7, '0')) || 0,
            new_mgr_group_sv_req: parseFloat(getVal(r, 8, '0')) || 0,
            qualified_lines_req: parseInt(getVal(r, 9, '0')) || 0,
            pearl_lines_req: parseInt(getVal(r, 10, '0')) || 0,
            month_total_org_sv_req: parseFloat(getVal(r, 11, '0')) || 0,
            consecutive_months_req: parseInt(getVal(r, 12, '1')) || 1,
            direct_rebate_rate: parseFloat(getVal(r, 13, '0.05')) || 0.05,
            leadership_gen_depth: parseInt(getVal(r, 14, '0')) || 0,
            leadership_gen_rate: parseFloat(getVal(r, 15, '0.06')) || 0.06,
            has_group_bonus: getVal(r, 16, 'N').toUpperCase() === 'Y',
            has_manager_bonus: getVal(r, 17, 'N').toUpperCase() === 'Y',
            has_pearl_dividend: getVal(r, 18, 'N').toUpperCase() === 'Y',
            has_annual_excellence: getVal(r, 19, 'N').toUpperCase() === 'Y',
            has_travel_incentive: getVal(r, 20, 'N').toUpperCase() === 'Y',
            has_car_fund: getVal(r, 21, 'N').toUpperCase() === 'Y',
            badge_icon_class: getVal(r, 22, 'fa-solid fa-award'),
            badge_color_hex: getVal(r, 23, '#38bdf8'),
            sort_order: parseInt(getVal(r, 24, String(idx + 1))) || (idx + 1),
            is_active: getVal(r, 25, 'Y').toUpperCase()
        };
    }).filter(item => item.rank_name_zh !== '未命名職級');
}

// ==========================================================================
// 5. 介面事件綁定與選單初始化
// ==========================================================================
function bindUIEvents() {
    $('#inputPersonalSv, #inputCumGroupSv, #inputMonthGroupSv, #inputTotalOrgSv, #inputManagerLines, #inputPearlLines, #inputConsecutiveMonths, #selectTargetRank').off('input change').on('input change', function () {
        $('.btn-group button').removeClass('active');
        runSimulation();
    });

    // 匯率輸入變更事件
    $('#inputExchangeRate').off('input change').on('input change', function () {
        runSimulation();
        renderRankDataTable();
    });

    // 幣別切換事件
    $('#currencyToggleGroup button').off('click').on('click', function () {
        $('#currencyToggleGroup button').removeClass('active');
        $(this).addClass('active');
        currentCurrency = $(this).data('currency');
        runSimulation();
        renderRankDataTable();
    });

    // 官方例算快速套用：例算 I 兼差經理
    $('#btnPresetPartTime').off('click').on('click', function () {
        $('.btn-preset').removeClass('active');
        $(this).addClass('active');
        $('#inputPersonalSv').val(400);
        $('#inputCumGroupSv').val(15000);
        $('#inputMonthGroupSv').val(2800);
        $('#inputTotalOrgSv').val(3200);
        $('#inputManagerLines').val(0);
        $('#inputPearlLines').val(0);
        $('#inputConsecutiveMonths').val(1);
        $('#selectTargetRank').val('RANK_04_MGR').trigger('change');
    });

    // 官方例算快速套用：例算 II 專職珍珠
    $('#btnPresetFullTime').off('click').on('click', function () {
        $('.btn-preset').removeClass('active');
        $(this).addClass('active');
        $('#inputPersonalSv').val(400);
        $('#inputCumGroupSv').val(80000);
        $('#inputMonthGroupSv').val(2800);
        $('#inputTotalOrgSv').val(45000);
        $('#inputManagerLines').val(4);
        $('#inputPearlLines').val(0);
        $('#inputConsecutiveMonths').val(1);
        $('#selectTargetRank').val('RANK_07_PEARL').trigger('change');
    });

    // 官方例算快速套用：例算 III 事業藍鑽
    $('#btnPresetDiamond').off('click').on('click', function () {
        $('.btn-preset').removeClass('active');
        $(this).addClass('active');
        $('#inputPersonalSv').val(400);
        $('#inputCumGroupSv').val(500000);
        $('#inputMonthGroupSv').val(2800);
        $('#inputTotalOrgSv').val(100000);
        $('#inputManagerLines').val(10);
        $('#inputPearlLines').val(3);
        $('#inputConsecutiveMonths').val(4);
        $('#selectTargetRank').val('RANK_09_DIAMOND').trigger('change');
    });

    $('#btnSyncGoogleSheets').off('click').on('click', async function () {
        await fetchGoogleSheetsData();
    });
}

function populateTargetRankDropdown() {
    const $select = $('#selectTargetRank');
    if (!$select.length) return;

    const currentSelected = $select.val();
    $select.empty();

    appState.activeRankList.forEach(r => {
        const rebatePct = Math.round(r.direct_rebate_rate * 100);
        let note = `階差 ${rebatePct}%`;
        if (r.qualified_lines_req > 0) note += ` · 經理線 ${r.qualified_lines_req} 條`;
        if (r.month_total_org_sv_req > 0) note += ` · 整組 ${Math.round(r.month_total_org_sv_req / 10000)}萬 SV`;

        $select.append(`<option value="${r.rank_id}">${r.rank_name_zh} (${note})</option>`);
    });

    if (currentSelected && appState.activeRankList.some(r => r.rank_id === currentSelected)) {
        $select.val(currentSelected);
    } else {
        const defaultTarget = appState.activeRankList.find(r => r.rank_code === 'R40') || appState.activeRankList[0];
        $select.val(defaultTarget.rank_id);
    }
}

// ==========================================================================
// 6. 核心演算法：即時職級判定、三大功能模組與圖表渲染
// ==========================================================================
function runSimulation() {
    if (!appState.activeRankList || appState.activeRankList.length === 0) return;

    const pSv = parseFloat($('#inputPersonalSv').val()) || 0;
    const cSv = parseFloat($('#inputCumGroupSv').val()) || 0;
    const mSv = parseFloat($('#inputMonthGroupSv').val()) || 0;
    const totalOrgSv = parseFloat($('#inputTotalOrgSv').val()) || 0;
    const lines = parseInt($('#inputManagerLines').val()) || 0;
    const pearlLines = parseInt($('#inputPearlLines').val()) || 0;
    const months = parseInt($('#inputConsecutiveMonths').val()) || 1;
    const targetRankId = $('#selectTargetRank').val();

    // 1. 判定當前實動最高職級
    let currentRank = appState.activeRankList[0];
    let hasAutoRescue = false;

    const sortedRanks = [...appState.activeRankList].sort((a, b) => b.rank_level - a.rank_level);

    for (let r of sortedRanks) {
        const isPersonalPass = (pSv >= r.month_personal_sv_req);
        
        let isGroupPass = (r.month_group_sv_req === 0) || (mSv >= r.month_group_sv_req);
        if (r.rank_level >= 70 && lines >= 5) {
            isGroupPass = true;
            hasAutoRescue = true;
        }

        const isCumPass = (r.cum_group_sv_req === 0) || (cSv >= r.cum_group_sv_req);
        const isLinesPass = (lines >= r.qualified_lines_req);
        const isPearlPass = (pearlLines >= r.pearl_lines_req);
        const isOrgSvPass = (r.month_total_org_sv_req === 0) || (totalOrgSv >= r.month_total_org_sv_req);
        const isMonthsPass = (months >= r.consecutive_months_req);

        if (isPersonalPass && isGroupPass && isCumPass && isLinesPass && isPearlPass && isOrgSvPass && isMonthsPass) {
            currentRank = r;
            break;
        }
    }

    appState.currentRank = currentRank;
    const targetRank = appState.activeRankList.find(r => r.rank_id === targetRankId) || appState.activeRankList[1];
    appState.targetRank = targetRank;

    // 2. 更新頂部 KPI 指標
    $('#dispCurrentRank').text(currentRank.rank_name_zh);
    $('#dispRebateRate').text(`${Math.round(currentRank.direct_rebate_rate * 100)}%`);
    $('#dispTargetRankName').text(targetRank.rank_name_zh);
    $('#dispOrgLegs').html(`${lines} <span class="fs-6 fw-normal text-secondary">/ ${pearlLines} 珍珠</span>`);
    $('#dispGenDepth').text(currentRank.leadership_gen_depth > 0 ? `${currentRank.leadership_gen_depth} 代 (各6%)` : '無代數');

    if (hasAutoRescue) {
        $('#dispRescueTag').removeClass('bg-secondary bg-success-subtle text-success').addClass('bg-warning text-dark').text('★5線自動補救生效');
    } else {
        $('#dispRescueTag').removeClass('bg-warning text-dark').addClass('bg-success-subtle text-success').text('正常合格狀態');
    }

    // 3. 實戰收益精算 (PV=25, 點值=0.7)
    const pv = 25;
    const pointValue = 0.7;
    const rebateIncome = pSv * currentRank.direct_rebate_rate * pv;
    const groupDiffIncome = mSv * 0.10 * pv;
    let qualifiedBonusIncome = 0;
    let leadershipBonusIncome = 0;
    let pearlDividendIncome = 0;
    let excellenceIncome = 0;
    let travelIncome = 0;
    let carFundIncome = 0;

    if (currentRank.has_group_bonus || currentRank.has_manager_bonus) {
        qualifiedBonusIncome = 15000;
    }

    if (currentRank.rank_level === 70) {
        leadershipBonusIncome = 44000;
        pearlDividendIncome = 42000;
        excellenceIncome = 25000;
        travelIncome = 10000;
    } else if (currentRank.rank_level === 80) {
        leadershipBonusIncome = 60000;
        pearlDividendIncome = 50000;
        excellenceIncome = 35000;
        travelIncome = 15000;
    } else if (currentRank.rank_level >= 90) {
        leadershipBonusIncome = 74000;
        pearlDividendIncome = 60000;
        excellenceIncome = 46000;
        travelIncome = 19000;
        if (currentRank.has_car_fund) carFundIncome = 27000;
    } else if (currentRank.leadership_gen_depth > 0) {
        leadershipBonusIncome = (currentRank.leadership_gen_depth * 3200 * currentRank.leadership_gen_rate * pointValue * pv) * Math.max(1, lines);
    }

    const totalEstIncome = Math.round(rebateIncome + groupDiffIncome + qualifiedBonusIncome + leadershipBonusIncome + pearlDividendIncome + excellenceIncome + travelIncome + carFundIncome);

    // 採用雙幣別格式輸出頂部總額
    $('#dispTotalIncome').text(formatMoney(totalEstIncome));
    $('#dispIncomeQuickTotal').text(formatMoney(totalEstIncome));

    // 計算各項達成率比率
    const gapRates = [
        Math.min(100, Math.round((pSv / (targetRank.month_personal_sv_req || 160)) * 100)),
        Math.min(100, Math.round((targetRank.cum_group_sv_req === 0 ? 100 : (cSv / targetRank.cum_group_sv_req) * 100))),
        Math.min(100, Math.round((targetRank.month_group_sv_req === 0 ? 100 : (mSv / targetRank.month_group_sv_req) * 100))),
        Math.min(100, Math.round((targetRank.qualified_lines_req === 0 ? 100 : (lines / targetRank.qualified_lines_req) * 100))),
        Math.min(100, Math.round((targetRank.pearl_lines_req === 0 ? 100 : (pearlLines / targetRank.pearl_lines_req) * 100))),
        Math.min(100, Math.round((targetRank.month_total_org_sv_req === 0 ? 100 : (totalOrgSv / targetRank.month_total_org_sv_req) * 100)))
    ];

    // 渲染圖表
    renderDashboardCharts({
        rebateIncome,
        groupDiffIncome,
        qualifiedBonusIncome,
        leadershipBonusIncome,
        pearlDividendIncome,
        excellenceIncome,
        travelIncome,
        carFundIncome
    }, currentRank, targetRank, { rates: gapRates });

    // 4. 渲染缺口診斷與權利標籤
    evaluateTargetGaps(targetRank, pSv, cSv, mSv, totalOrgSv, lines, pearlLines, months);
    renderTargetRightsPills(targetRank);

    // 5. 渲染三大落地模組
    renderGateChecklist(targetRank, pSv, cSv, mSv, totalOrgSv, lines, pearlLines, months);
    renderIncomeBreakdownTable(rebateIncome, groupDiffIncome, qualifiedBonusIncome, leadershipBonusIncome, pearlDividendIncome, excellenceIncome, travelIncome, carFundIncome, totalEstIncome, currentRank);
    renderTopologyRescue(lines, pearlLines, hasAutoRescue, currentRank);
}

/**
 * 缺口診斷與權利標籤渲染
 */
function evaluateTargetGaps(target, pSv, cSv, mSv, totalOrgSv, lines, pearlLines, months) {
    const gapP = Math.max(0, target.month_personal_sv_req - pSv);
    const gapC = Math.max(0, target.cum_group_sv_req - cSv);
    const gapM = Math.max(0, target.month_group_sv_req - mSv);
    const gapOrg = Math.max(0, target.month_total_org_sv_req - totalOrgSv);
    const gapLines = Math.max(0, target.qualified_lines_req - lines);
    const gapPearl = Math.max(0, target.pearl_lines_req - pearlLines);
    const gapMonths = Math.max(0, target.consecutive_months_req - months);

    let totalWeight = 0;
    let currentScore = 0;

    totalWeight += 20; currentScore += Math.min(1, pSv / (target.month_personal_sv_req || 160)) * 20;
    if (target.cum_group_sv_req > 0) { totalWeight += 20; currentScore += Math.min(1, cSv / target.cum_group_sv_req) * 20; }
    if (target.month_group_sv_req > 0) { totalWeight += 20; currentScore += Math.min(1, mSv / target.month_group_sv_req) * 20; }
    if (target.qualified_lines_req > 0) { totalWeight += 20; currentScore += Math.min(1, lines / target.qualified_lines_req) * 20; }
    if (target.pearl_lines_req > 0 || target.month_total_org_sv_req > 0) {
        totalWeight += 20;
        let sub = 0;
        if (target.pearl_lines_req > 0) sub += Math.min(1, pearlLines / target.pearl_lines_req) * 10;
        if (target.month_total_org_sv_req > 0) sub += Math.min(1, totalOrgSv / target.month_total_org_sv_req) * 10;
        currentScore += sub;
    }

    let progressPct = Math.round((currentScore / totalWeight) * 100);
    if (progressPct > 100) progressPct = 100;

    $('#dispOverallProgress').text(progressPct + '%');
    $('#dispProgressBar').css('width', progressPct + '%');

    const isQualified = (gapP === 0 && gapC === 0 && gapM === 0 && gapOrg === 0 && gapLines === 0 && gapPearl === 0 && gapMonths === 0);

    const $box = $('#boxGapAnalysis');
    const $title = $('#txtGapTitle');
    const $list = $('#listGapItems');
    $list.empty();

    if (isQualified) {
        $box.addClass('qualified');
        $title.removeClass('text-warning').addClass('text-success')
              .html(`<i class="fa-solid fa-circle-check"></i> 恭喜！您已完全符合【${target.rank_name_zh}】晉升標準`);
        $list.append(`<li class="text-success"><i class="fa-solid fa-check"></i> 各項個人責任額、責任小組、經理線與連續考核期均已達標。</li>`);
        $('#dispProgressLabel').text('已完全達標');
    } else {
        $box.removeClass('qualified');
        $title.addClass('text-warning').removeClass('text-success')
              .html(`<i class="fa-solid fa-triangle-exclamation"></i> 衝刺【${target.rank_name_zh}】尚缺以下核心指標：`);

        if (gapP > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-info"></i> 個人業績尚差：<strong class="text-danger">${gapP} SV</strong> (需達 ${target.month_personal_sv_req} SV)</li>`);
        if (gapC > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-info"></i> 整組累計尚差：<strong class="text-warning">${gapC.toLocaleString()} SV</strong> (門檻 ${target.cum_group_sv_req.toLocaleString()} SV)</li>`);
        if (gapM > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-info"></i> 小組責任額尚差：<strong class="text-warning">${gapM.toLocaleString()} SV</strong> (需達 ${target.month_group_sv_req.toLocaleString()} SV)</li>`);
        if (gapOrg > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-info"></i> 整組總業績尚差：<strong class="text-warning">${gapOrg.toLocaleString()} SV</strong> (需達 ${target.month_total_org_sv_req.toLocaleString()} SV)</li>`);
        if (gapLines > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-info"></i> 經理線尚缺：<strong class="text-warning">${gapLines} 條</strong> (門檻 ${target.qualified_lines_req} 條)</li>`);
        if (gapPearl > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-info"></i> 實動珍珠線尚缺：<strong class="text-warning">${gapPearl} 條</strong> (需達 ${target.pearl_lines_req} 條)</li>`);
        if (gapMonths > 0) $list.append(`<li><i class="fa-solid fa-arrow-right text-info"></i> 連續考核月份尚缺：<strong class="text-warning">${gapMonths} 個月</strong> (需連續 ${target.consecutive_months_req} 個月)</li>`);
        $('#dispProgressLabel').text(`衝刺中 (${progressPct}%)`);
    }
}

function renderTargetRightsPills(target) {
    const $container = $('#containerRightsPills');
    $container.empty();

    const rights = [];
    rights.push(`階差獎金 ${Math.round(target.direct_rebate_rate * 100)}%`);
    if (target.has_group_bonus) rights.push('合格小組獎金 10%');
    if (target.has_manager_bonus) rights.push('合格經理獎金 5%');
    if (target.leadership_gen_depth > 0) rights.push(`全球領導獎金 ${target.leadership_gen_depth} 代 (各6%)`);
    if (target.has_pearl_dividend) rights.push('珍鑽分紅 5%');
    if (target.has_annual_excellence) rights.push('年度卓越獎勵 5%');
    if (target.has_travel_incentive) rights.push('海外旅遊獎勵 1.5%');
    if (target.has_car_fund) rights.push('尊爵贈車 (70萬頭期+100萬分期)');

    rights.forEach((r, idx) => {
        const isGold = (idx >= 3 || r.includes('分紅') || r.includes('贈車'));
        $container.append(`<span class="badge-right-pill ${isGold ? 'gold' : ''}"><i class="fa-solid fa-medal"></i> ${r}</span>`);
    });
}

// ==========================================================================
// 7. 模組渲染函式 (通關檢核、收益拆解、線路拓撲)
// ==========================================================================

/**
 * 模組 A：晉升多重門檻通關檢核表
 */
function renderGateChecklist(target, pSv, cSv, mSv, totalOrgSv, lines, pearlLines, months) {
    const $container = $('#gateChecklistContainer');
    $container.empty();

    const gates = [
        {
            name: "個人消費責任額",
            val: `${pSv} / ${target.month_personal_sv_req} SV`,
            pass: pSv >= target.month_personal_sv_req,
            icon: "fa-solid fa-cart-shopping"
        },
        {
            name: "整組累計業績",
            val: `${cSv.toLocaleString()} / ${target.cum_group_sv_req.toLocaleString()} SV`,
            pass: target.cum_group_sv_req === 0 || cSv >= target.cum_group_sv_req,
            icon: "fa-solid fa-boxes-stacked"
        },
        {
            name: "當月小組責任額",
            val: `${mSv.toLocaleString()} / ${target.month_group_sv_req.toLocaleString()} SV`,
            pass: target.month_group_sv_req === 0 || mSv >= target.month_group_sv_req,
            icon: "fa-solid fa-users"
        },
        {
            name: "合格經理線數量",
            val: `${lines} / ${target.qualified_lines_req} 條`,
            pass: target.qualified_lines_req === 0 || lines >= target.qualified_lines_req,
            icon: "fa-solid fa-network-wired"
        },
        {
            name: "實動珍珠線要求",
            val: `${pearlLines} / ${target.pearl_lines_req} 條`,
            pass: target.pearl_lines_req === 0 || pearlLines >= target.pearl_lines_req,
            icon: "fa-solid fa-gem"
        },
        {
            name: "當月整組總業績",
            val: `${totalOrgSv.toLocaleString()} / ${target.month_total_org_sv_req.toLocaleString()} SV`,
            pass: target.month_total_org_sv_req === 0 || totalOrgSv >= target.month_total_org_sv_req,
            icon: "fa-solid fa-globe"
        },
        {
            name: "連續考核月份",
            val: `${months} / ${target.consecutive_months_req} 個月`,
            pass: months >= target.consecutive_months_req,
            icon: "fa-solid fa-calendar-check"
        }
    ];

    gates.forEach(g => {
        const badgeClass = g.pass ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';
        const iconPass = g.pass ? '<i class="fa-solid fa-circle-check text-success"></i>' : '<i class="fa-solid fa-circle-xmark text-danger"></i>';

        $container.append(`
            <div class="p-2 px-3 rounded-3 d-flex justify-content-between align-items-center" style="background: rgba(6, 13, 25, 0.6); border: 1px solid var(--team-border-glow);">
                <div class="d-flex align-items-center gap-2">
                    <span class="text-secondary"><i class="${g.icon}"></i></span>
                    <span class="small text-white">${g.name}</span>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <span class="mono-font small text-secondary">${g.val}</span>
                    <span class="badge ${badgeClass} mono-font">${iconPass} ${g.pass ? '達標' : '未過'}</span>
                </div>
            </div>
        `);
    });
}

/**
 * 模組 B：收益細部拆解明細表
 */
function renderIncomeBreakdownTable(rebate, groupDiff, qualified, leadership, pearlDiv, excellence, travel, carFund, total, currentRank) {
    const $tbody = $('#incomeBreakdownTableBody');
    $tbody.empty();

    const items = [
        { label: "個人階差回饋", desc: `個人消費 × ${Math.round(currentRank.direct_rebate_rate * 100)}% × 25`, amount: rebate, color: "text-white" },
        { label: "小組成員差額", desc: "責任小組平均約 10% 階差", amount: groupDiff, color: "text-white" },
        { label: "合格小組/經理獎金", desc: currentRank.has_group_bonus ? "小組 10% + 經理 5% 提撥" : "未達經理位階", amount: qualified, color: "text-info" },
        { label: "全球領導獎金 (6%)", desc: currentRank.leadership_gen_depth > 0 ? `解鎖 ${currentRank.leadership_gen_depth} 代合格經理` : "無代數資格", amount: leadership, color: "text-warning" },
        { label: "珍鑽體系分紅 (5%)", desc: currentRank.has_pearl_dividend ? "全月全球業績加權分紅" : "珍珠級以上解鎖", amount: pearlDiv, color: "text-warning" },
        { label: "珍鑽年度卓越獎勵 (5%)", desc: currentRank.has_annual_excellence ? "年終卓越累積獎金" : "珍珠級以上解鎖", amount: excellence, color: "text-warning" },
        { label: "珍鑽海外旅遊獎勵 (1.5%)", desc: currentRank.has_travel_incentive ? "每年6月旅遊基金發放" : "珍珠級以上解鎖", amount: travel, color: "text-warning" },
        { label: "尊爵贈車分期基金", desc: currentRank.has_car_fund ? "100 萬 / 36 期月補貼" : "藍鑽級專屬享有", amount: carFund, color: "text-info" }
    ];

    items.forEach(item => {
        $tbody.append(`
            <tr>
                <td>
                    <div class="fw-bold ${item.color} small">${item.label}</div>
                    <div class="text-secondary" style="font-size: 0.72rem;">${item.desc}</div>
                </td>
                <td class="text-end align-middle mono-font fw-bold ${item.amount > 0 ? item.color : 'text-secondary'}">
                    ${formatMoney(item.amount)}
                </td>
            </tr>
        `);
    });

    $tbody.append(`
        <tr class="border-top border-info border-opacity-50">
            <td class="fw-black text-warning">當月預估合計收益</td>
            <td class="text-end align-middle mono-font fw-black text-warning fs-6">
                ${formatMoney(total)}
            </td>
        </tr>
    `);
}

/**
 * 模組 C：經理線拓撲健全與第 5 線自動補救診斷卡
 */
function renderTopologyRescue(lines, pearlLines, hasAutoRescue, currentRank) {
    const $container = $('#topologyRescueContainer');
    $container.empty();

    // 拓撲狀態卡
    $container.append(`
        <div class="p-3 rounded-3" style="background: rgba(6, 13, 25, 0.6); border: 1px solid var(--team-border-glow);">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="small text-secondary fw-bold"><i class="fa-solid fa-sitemap text-info"></i> 直屬合格經理線拓撲</span>
                <span class="badge bg-primary-subtle text-info mono-font">${lines} 條實動線</span>
            </div>
            <div class="d-flex gap-1 flex-wrap">
                ${Array.from({ length: Math.max(10, lines) }).map((_, i) => {
                    const isFilled = i < lines;
                    const isPearl = i < pearlLines;
                    let color = isPearl ? 'btn-warning' : (isFilled ? 'btn-info' : 'btn-outline-secondary');
                    return `<button type="button" class="btn btn-sm ${color} py-0 px-2 mono-font" style="font-size: 0.75rem;" disabled>${i + 1}${isPearl ? '★' : ''}</button>`;
                }).join('')}
            </div>
            <div class="text-secondary small mt-2" style="font-size: 0.75rem;">
                標註 ★ 為實動珍珠線 (獨立分支計算，同線僅採計1條)。
            </div>
        </div>
    `);

    // 自動補救防線卡
    const rescueStatusHtml = hasAutoRescue
        ? `<div class="p-3 rounded-3 bg-warning bg-opacity-10 border border-warning border-opacity-50">
                <div class="d-flex align-items-center gap-2 text-warning fw-bold small mb-1">
                    <i class="fa-solid fa-shield-cat fs-5"></i> 第 5 條線業績自動補救已啟動
                </div>
                <div class="text-light small" style="font-size: 0.78rem;">
                    您已培育 5 條以上合格經理線，第 5 條經理線之小組業績已自動填補您本人 3,200 SV 小組缺口，免除保級顧慮。
                </div>
           </div>`
        : `<div class="p-3 rounded-3" style="background: rgba(6, 13, 25, 0.6); border: 1px solid var(--team-border-glow);">
                <div class="d-flex align-items-center gap-2 text-secondary fw-bold small mb-1">
                    <i class="fa-solid fa-shield text-info"></i> 業績自動補救機制守則
                </div>
                <div class="text-secondary small" style="font-size: 0.78rem;">
                    珍珠級以上經營者若培育達 5 條合格經理線，將啟動自動補救機制，免受每月 3,200 SV 考核限制。
                </div>
           </div>`;

    $container.append(rescueStatusHtml);
}

/**
 * 渲染 3 張戰略分析圖表
 */
function renderDashboardCharts(incomeData, currentRank, targetRank, currentGaps) {
    const textColor = '#94a3b8';
    const gridColor = 'rgba(255, 255, 255, 0.08)';
    const { symbol: currencySymbol, rate: currencyRate } = getCurrencyFactor();

    // 1. 獎金占比圓餅圖 (Doughnut)
    const bonusItems = [
        { label: '個人階差', val: incomeData.rebateIncome },
        { label: '小組差額', val: incomeData.groupDiffIncome },
        { label: '小組/經理獎金', val: incomeData.qualifiedBonusIncome },
        { label: '全球領導獎金', val: incomeData.leadershipBonusIncome },
        { label: '珍鑽分紅', val: incomeData.pearlDividendIncome },
        { label: '年度卓越', val: incomeData.excellenceIncome },
        { label: '海外旅遊', val: incomeData.travelIncome },
        { label: '贈車基金', val: incomeData.carFundIncome }
    ].filter(i => i.val > 0);

    const ctxPie = document.getElementById('chartBonusPie');
    if (ctxPie) {
        if (chartBonusPie) chartBonusPie.destroy();
        chartBonusPie = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: bonusItems.map(i => i.label),
                datasets: [{
                    data: bonusItems.map(i => Math.round(i.val * currencyRate)),
                    backgroundColor: [
                        '#38bdf8', '#0284c7', '#10b981', '#facc15',
                        '#f59e0b', '#ec4899', '#8b5cf6', '#6366f1'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: textColor, boxWidth: 12, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const val = context.parsed;
                                const total = context.dataset.data.reduce((acc, cur) => acc + cur, 0);
                                const percentage = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                return ` ${context.label}: ${currencySymbol} ${val.toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 2. 晉升門檻達成率雷達圖
    const ctxRadar = document.getElementById('chartGapsRadar');
    if (ctxRadar) {
        if (chartGapsRadar) chartGapsRadar.destroy();
        chartGapsRadar = new Chart(ctxRadar, {
            type: 'radar',
            data: {
                labels: ['個人業績', '累計業績', '責任小組', '經理線數', '珍珠線數', '總業績'],
                datasets: [{
                    label: '達成率 (%)',
                    data: currentGaps.rates,
                    backgroundColor: 'rgba(56, 189, 248, 0.25)',
                    borderColor: '#38bdf8',
                    pointBackgroundColor: '#38bdf8',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        ticks: { display: false, stepSize: 25 },
                        angleLines: { color: gridColor },
                        grid: { color: gridColor },
                        pointLabels: { color: textColor, font: { size: 10 } }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    // 3. 各職階預估收益梯隊長條圖
    const ctxBar = document.getElementById('chartRankIncomeBar');
    if (ctxBar) {
        if (chartRankIncomeBar) chartRankIncomeBar.destroy();
        const ranksSample = appState.activeRankList.slice(0, 7);
        const sampleIncomes = [1200, 4800, 15000, 32000, 65000, 145000, 280000];

        chartRankIncomeBar = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: ranksSample.map(r => r.rank_name_zh),
                datasets: [{
                    data: sampleIncomes.slice(0, ranksSample.length).map(v => Math.round(v * currencyRate)),
                    backgroundColor: ranksSample.map(r => r.rank_id === currentRank.rank_id ? '#facc15' : 'rgba(56, 189, 248, 0.6)'),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
                    y: { ticks: { color: textColor, font: { size: 9 } }, grid: { color: gridColor } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                return ` 基準預估: ${currencySymbol} ${ctx.parsed.y.toLocaleString()}`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// ==========================================================================
// 8. DataTable.js 渲染 (官方 10 大職級字典)
// ==========================================================================
function renderRankDataTable() {
    const $tbody = $('#tableRankDictionary tbody');
    if (!$tbody.length) return;

    if (rankDataTableInstance) {
        rankDataTableInstance.destroy();
        rankDataTableInstance = null;
    }
    $tbody.empty();

    appState.activeRankList.forEach(r => {
        let conds = [];
        if (r.month_personal_sv_req > 0) conds.push(`個人 ${r.month_personal_sv_req} SV`);
        if (r.cum_group_sv_req > 0) conds.push(`累計 ${r.cum_group_sv_req.toLocaleString()} SV`);
        if (r.month_group_sv_req > 0) conds.push(`小組 ${r.month_group_sv_req.toLocaleString()} SV`);
        
        // 在「經理線 X 條」後加入強制換行標記
        if (r.qualified_lines_req > 0) conds.push(`經理線 ${r.qualified_lines_req} 條<br>`);
        
        if (r.pearl_lines_req > 0) conds.push(`含珍珠線 ${r.pearl_lines_req} 條`);
        if (r.month_total_org_sv_req > 0) conds.push(`整組 ${r.month_total_org_sv_req.toLocaleString()} SV`);
        if (r.consecutive_months_req > 1) conds.push(`連續 ${r.consecutive_months_req} 個月`);

        // 清理多餘分隔符號並維持換行
        let condsHtml = conds.join(' ‧ ').replace(/<br> ‧ /g, '<br>');

        let rightsArr = [];
        if (r.has_group_bonus) rightsArr.push('小組10%');
        if (r.has_manager_bonus) rightsArr.push('經理5%');
        if (r.has_pearl_dividend) rightsArr.push('珍鑽分紅5%');
        if (r.has_annual_excellence) rightsArr.push('卓越5%');
        if (r.has_travel_incentive) rightsArr.push('旅遊1.5%');
        if (r.has_car_fund) rightsArr.push('贈車基金');

        const iconClass = r.badge_icon_class || 'fa-solid fa-award';
        const colorHex = r.badge_color_hex || '#38bdf8';

        $tbody.append(`
            <tr>
                <td class="fw-bold text-nowrap" style="color: ${colorHex};">
                    <i class="${iconClass}" style="color: ${colorHex};"></i> ${r.rank_name_zh}
                </td>
                <td class="text-light small">${condsHtml || `入會資料袋 ${formatMoney(1000)}`}</td>
                <td class="text-warning fw-bold mono-font">${Math.round(r.direct_rebate_rate * 100)}%</td>
                <td class="text-success mono-font">${r.leadership_gen_depth > 0 ? r.leadership_gen_depth + ' 代 (6%)' : '—'}</td>
                <td class="text-secondary small">${rightsArr.join(' ‧ ') || '個人階差回饋'}</td>
            </tr>
        `);
    });

    if ($.fn.DataTable) {
        rankDataTableInstance = $('#tableRankDictionary').DataTable({
            ordering: false,
            info: false,
            paging: false,
            responsive: true,
            retrieve: true
        });
    }
}

// ==========================================================================
// 9. 系統彈窗輔助函式
// ==========================================================
function showErrorNotice(msg) {
    if (typeof AppDialog !== 'undefined') {
        AppDialog.alert(msg, {
            title: "系統提示",
            icon: "fa-solid fa-circle-exclamation text-danger"
        });
    } else {
        alert(msg);
    }
}