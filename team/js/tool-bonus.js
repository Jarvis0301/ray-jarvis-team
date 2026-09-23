/**
 * 葡眾官方職級回饋率與門檻配置
 */
const RANK_CONFIGS = {
    MEMBER: { title: "會員", rate: 0.05, minCumSv: 0, depth: 0, icon: "fa-user" },
    DIRECTOR: { title: "主任", rate: 0.10, minCumSv: 1200, depth: 0, icon: "fa-user-check" },
    VICE_MANAGER: { title: "副理", rate: 0.15, minCumSv: 6000, depth: 0, icon: "fa-user-shield" },
    MANAGER: { title: "經理", rate: 0.20, minCumSv: 12000, depth: 0, icon: "fa-user-tie" },
    PINECREST: { title: "松柏", rate: 0.20, minCumSv: 12000, depth: 2, icon: "fa-tree" },
    EVERGREEN: { title: "長青", rate: 0.20, minCumSv: 12000, depth: 3, icon: "fa-seedling" },
    PEARL: { title: "珍珠", rate: 0.20, minCumSv: 12000, depth: 4, icon: "fa-gem" },
    EMERALD: { title: "翡翠", rate: 0.20, minCumSv: 12000, depth: 5, icon: "fa-award" },
    DIAMOND: { title: "藍鑽", rate: 0.20, minCumSv: 12000, depth: 6, icon: "fa-crown" }
};

// 下線非經理組織模擬清單
let downlinePartners = [
    { id: 1, name: "夥伴 A (自用家庭)", rank: "MEMBER", sv: 800 },
    { id: 2, name: "夥伴 B (副理核心)", rank: "VICE_MANAGER", sv: 1200 },
    { id: 3, name: "夥伴 C (衝刺主任)", rank: "DIRECTOR", sv: 800 }
];

let doughnutChartInstance = null;
let bonusDataTableInstance = null;

window.addEventListener('AppReady', function () {
    // 初始化 DataTable
    initBonusTable();
    // 初始化 Chart.js
    initBonusChart();
    // 渲染下線列表
    renderDownlines();
    // 執行第一次即時精算
    recalculateAll();

    // 綁定輸入即時聯動監聽
    $("#inpPersonalSv, #inpGroupSv, #inpHistoryCumSv, #selRank, #inpActiveLines, #inpPearlLines, #inpTotalManagersInDepth, #inpTotalOrgSv, #cfgPvRatio, #cfgPointValue, #cfgTaxRate").on("input change", function () {
        recalculateAll();
    });

    // 新增下線夥伴
    $("#btnAddDownline").on("click", function () {
        const nextId = Date.now();
        downlinePartners.push({
            id: nextId,
            name: `新進夥伴 ${downlinePartners.length + 1}`,
            rank: "MEMBER",
            sv: 400
        });
        renderDownlines();
        recalculateAll();
    });

    // 刪除下線夥伴事件
    $(document).on("click", ".btn-del-downline", function () {
        const id = $(this).data("id");
        downlinePartners = downlinePartners.filter(d => d.id !== id);
        renderDownlines();
        recalculateAll();
    });

    // 下線數據異動監聽
    $(document).on("input change", ".inp-dl-name, .sel-dl-rank, .inp-dl-sv", function () {
        const id = $(this).closest("tr").data("id");
        const item = downlinePartners.find(d => d.id === id);
        if (!item) return;

        item.name = $(this).closest("tr").find(".inp-dl-name").val();
        item.rank = $(this).closest("tr").find(".sel-dl-rank").val();
        item.sv = parseFloat($(this).closest("tr").find(".inp-dl-sv").val()) || 0;

        recalculateAll();
    });

    // 典型情境切換
    $(".scenario-btn").on("click", function () {
        $(".scenario-btn").removeClass("active");
        $(this).addClass("active");
        applyScenario($(this).data("scenario"));
    });
});

/**
 * 渲染非經理下線組織列表
 */
function renderDownlines() {
    const $tbody =$("#downlineListBody");
    $tbody.empty();

    downlinePartners.forEach(item => {
        const rowHtml = `
            <tr data-id="${item.id}">
                <td>
                    <input type="text" class="form-control form-control-sm inp-dl-name" value="${item.name}">
                </td>
                <td>
                    <select class="form-select form-select-sm sel-dl-rank">
                        <option value="MEMBER" ${item.rank === 'MEMBER' ? 'selected' : ''}>會員 (5%)</option>
                        <option value="DIRECTOR" ${item.rank === 'DIRECTOR' ? 'selected' : ''}>主任 (10%)</option>
                        <option value="VICE_MANAGER" ${item.rank === 'VICE_MANAGER' ? 'selected' : ''}>副理 (15%)</option>
                    </select>
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm text-end inp-dl-sv" value="${item.sv}" step="100" min="0">
                </td>
                <td class="text-center text-cyan cell-diff-rate">0%</td>
                <td class="text-end text-info cell-diff-amount">NT$ 0</td>
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
 * 核心獎金精算排程 (AppCalc 嚴格定點數計算)
 */
function recalculateAll() {
    const pvRatio = parseFloat($("#cfgPvRatio").val()) || 25;
    const pointVal = parseFloat($("#cfgPointValue").val()) || 0.70;
    const taxRate = AppCalc.divide(parseFloat($("#cfgTaxRate").val()) || 10, 100, 4);

    const personalSV = parseFloat($("#inpPersonalSv").val()) || 0;
    const groupSV = parseFloat($("#inpGroupSv").val()) || 0;
    const selectedRankKey = $("#selRank").val();
    const currentRank = RANK_CONFIGS[selectedRankKey] || RANK_CONFIGS.MEMBER;

    const activeLines = parseInt($("#inpActiveLines").val()) || 0;
    const pearlLines = parseInt($("#inpPearlLines").val()) || 0;
    const managersInDepth = parseInt($("#inpTotalManagersInDepth").val()) || 0;
    const totalOrgSV = parseFloat($("#inpTotalOrgSv").val()) || 0;

    // 1. 檢核資格指標
    const isPersonalQualified = personalSV >= 160;
    const isAutoRescued = (selectedRankKey === 'PEARL' || selectedRankKey === 'EMERALD' || selectedRankKey === 'DIAMOND') && activeLines >= 5;
    const effectiveGroupSV = AppCalc.add(personalSV, groupSV);
    const isManagerQualified = isPersonalQualified && (effectiveGroupSV >= 3200 || isAutoRescued);

    if (typeof UIBadges !== 'undefined' && UIBadges.partner?.rank) {
        $("#rankBadgeContainer").html(UIBadges.partner.rank(selectedRankKey));
    } else {
        $("#rankBadgeContainer").html(`<span class="badge-rank badge-rank-mgr"><i class="fa-solid ${currentRank.icon}"></i> ${currentRank.title} (${AppCalc.multiply(currentRank.rate, 100, 0)}%)</span>`);
    }

    // 更新個人達標與自動補救狀態 UI
    updateQualificationStatus(isPersonalQualified, isManagerQualified, isAutoRescued, activeLines);

    // 2. 個人業績回饋獎金
    // 公式：個人SV * 職級% * PV
    let personalBonus = 0;
    if (isPersonalQualified) {
        personalBonus = AppCalc.multiply(AppCalc.multiply(personalSV, currentRank.rate, 4), pvRatio, 2);
    }

    // 3. 組織階差獎金
    // 遍歷下線：下線SV * (本人% - 下線%) * PV
    let differentialBonus = 0;
    $("#downlineListBody tr").each(function () {
        const id = $(this).data("id");
        const item = downlinePartners.find(d => d.id === id);
        if (!item) return;

        const downlineRate = RANK_CONFIGS[item.rank] ? RANK_CONFIGS[item.rank].rate : 0.05;
        const diffRate = Math.max(0, AppCalc.sub(currentRank.rate, downlineRate));
        const lineBonus = isPersonalQualified ? AppCalc.multiply(AppCalc.multiply(item.sv, diffRate, 4), pvRatio, 2) : 0;

        differentialBonus = AppCalc.add(differentialBonus, lineBonus);

        $(this).find(".cell-diff-rate").text(`${AppCalc.multiply(diffRate, 100, 0)}%`);
        $(this).find(".cell-diff-amount").text(`NT$ ${Math.round(lineBonus).toLocaleString()}`);
    });

    // 4. 合格小組獎金 (10%) & 合格經理獎金 (5%)
    // 依官方簡報標準：合格小組約 10,000 元，合格經理約 5,000 元
    let qualifiedGroupBonus = 0;
    let qualifiedManagerBonus = 0;
    if (isManagerQualified) {
        qualifiedGroupBonus = 10000;
        qualifiedManagerBonus = 5000;
    }

    // 5. 全球領導獎金 (20% 提撥，各代 6%)
    // 公式：代數經理人數 * 3,200 SV * 6% * 點值 * PV
    let leadershipBonus = 0;
    if (isManagerQualified && currentRank.depth > 0 && managersInDepth > 0) {
        const singleMgrScore = AppCalc.multiply(3200, 0.06, 4); // 192
        const totalScore = AppCalc.multiply(singleMgrScore, managersInDepth, 2);
        leadershipBonus = AppCalc.multiply(AppCalc.multiply(totalScore, pointVal, 4), pvRatio, 2);
    }

    // 6. 珍鑽分紅 (5%)
    // 珍珠以上，以實動經理線數計算，每條實動線預估約 6,000 元 (0.6 萬元)
    let pearlDividend = 0;
    if (isManagerQualified && (selectedRankKey === 'PEARL' || selectedRankKey === 'EMERALD' || selectedRankKey === 'DIAMOND')) {
        pearlDividend = AppCalc.multiply(activeLines, 6000, 2);
    }

    // 7. 珍鑽年度卓越獎勵金 (5%) - 每月累算攤提
    // 珍珠以上每條線約 3,500 ~ 4,600 元，專職珍珠約 2.5 萬，藍鑽 10 線約 4.6 萬
    let annualExcellenceBonus = 0;
    if (isManagerQualified && (selectedRankKey === 'PEARL' || selectedRankKey === 'EMERALD' || selectedRankKey === 'DIAMOND')) {
        const perLineAnnual = selectedRankKey === 'DIAMOND' ? 4600 : 3571;
        annualExcellenceBonus = AppCalc.multiply(activeLines, perLineAnnual, 2);
    }

    // 8. 珍鑽旅遊獎勵金 (1.5%) - 每月累算攤提
    // 珍珠以上每條線約 1,400 ~ 1,900 元，專職珍珠約 1 萬，藍鑽約 1.9 萬
    let travelIncentiveBonus = 0;
    if (isManagerQualified && (selectedRankKey === 'PEARL' || selectedRankKey === 'EMERALD' || selectedRankKey === 'DIAMOND')) {
        const perLineTravel = selectedRankKey === 'DIAMOND' ? 1900 : 1428;
        travelIncentiveBonus = AppCalc.multiply(activeLines, perLineTravel, 2);
    }

    // 9. 購車基金 (3.5%)
    // 藍鑽且考核滿 10 線 + 3 條珍珠 + 10 萬 SV，每月分期 27,000 元
    let carFundBonus = 0;
    if (selectedRankKey === 'DIAMOND' && isManagerQualified && activeLines >= 10 && pearlLines >= 3 && totalOrgSV >= 100000) {
        carFundBonus = 27000;
    }

    // 總額加總
    let grossBonus = AppCalc.add(personalBonus, differentialBonus);
    grossBonus = AppCalc.add(grossBonus, qualifiedGroupBonus);
    grossBonus = AppCalc.add(grossBonus, qualifiedManagerBonus);
    grossBonus = AppCalc.add(grossBonus, leadershipBonus);
    grossBonus = AppCalc.add(grossBonus, pearlDividend);
    grossBonus = AppCalc.add(grossBonus, annualExcellenceBonus);
    grossBonus = AppCalc.add(grossBonus, travelIncentiveBonus);
    grossBonus = AppCalc.add(grossBonus, carFundBonus);

    // 法定代扣款計算 (所得稅 10% + 二代健保 2.11%)
    const withholdingTax = AppCalc.multiply(grossBonus, taxRate, 2);
    const nhiTax = grossBonus > 20000 ? AppCalc.multiply(grossBonus, 0.0211, 2) : 0;
    const totalDeduction = AppCalc.add(withholdingTax, nhiTax);
    const netPayout = AppCalc.sub(grossBonus, totalDeduction);

    // 渲染頂部與面板 KPI
    $("#valGrossBonus").text(`NT$ ${Math.round(grossBonus).toLocaleString()}`);
    $("#valGrossBonusWan").text(`約 ${(grossBonus / 10000).toFixed(2)} 萬元`);
    $("#valTotalDeduction").text(`- NT$ ${Math.round(totalDeduction).toLocaleString()}`);
    $("#valDeductionDetail").text(`所得稅 ${Math.round(withholdingTax)} + 健保 ${Math.round(nhiTax)}`);
    $("#valNetPayout").text(`NT$ ${Math.round(netPayout).toLocaleString()}`);

    // 渲染表格
    renderBonusTableData([
        { name: "個人回饋獎金", rate: `${AppCalc.multiply(currentRank.rate, 100, 0)}%`, basis: `${personalSV.toLocaleString()} SV × PV`, amount: personalBonus },
        { name: "組織階差獎金", rate: "階梯差額", basis: "非經理下線業績差額加總", amount: differentialBonus },
        { name: "合格小組獎金", rate: "10% 提撥", basis: isManagerQualified ? "合格經理全球加權分攤" : "未達合格經理責任額", amount: qualifiedGroupBonus },
        { name: "合格經理獎金", rate: "5% 提撥", basis: isManagerQualified ? "合格經理全球加權分攤" : "未達合格經理責任額", amount: qualifiedManagerBonus },
        { name: "全球領導獎金", rate: "20% (每代6%)", basis: `${managersInDepth} 位經理 × 3,200 SV × 6% × 點值`, amount: leadershipBonus },
        { name: "珍鑽分紅獎金", rate: "5% 提撥", basis: `${activeLines} 條合格經理實動線加權`, amount: pearlDividend },
        { name: "珍鑽年度卓越獎金", rate: "5% 提撥", basis: "年度 1~12 月累積 (月均攤提)", amount: annualExcellenceBonus },
        { name: "珍鑽旅遊獎勵金", rate: "1.5% 提撥", basis: "年度 7~6 月累積 (月均攤提)", amount: travelIncentiveBonus },
        { name: "藍鑽購車分期基金", rate: "3.5% 提撥", basis: carFundBonus > 0 ? "藍鑽考核達標 (分 36 期月補貼)" : "未達藍鑽門檻", amount: carFundBonus }
    ], grossBonus);

    // 被動現金流佔比計算 (領導獎金 + 分紅 + 基金 / 總獎金)
    const passiveTotal = AppCalc.add(AppCalc.add(leadershipBonus, pearlDividend), AppCalc.add(annualExcellenceBonus, AppCalc.add(travelIncentiveBonus, carFundBonus)));
    const passiveRatio = grossBonus > 0 ? AppCalc.multiply(AppCalc.divide(passiveTotal, grossBonus, 4), 100, 1) : 0;
    $("#valPassiveRatio").text(`${passiveRatio}%`);

    // 更新圖表
    updateBonusChart({
        personal: AppCalc.add(personalBonus, differentialBonus),
        groupMgr: AppCalc.add(qualifiedGroupBonus, qualifiedManagerBonus),
        leadership: leadershipBonus,
        dividends: AppCalc.add(AppCalc.add(pearlDividend, annualExcellenceBonus), travelIncentiveBonus),
        carFund: carFundBonus
    });
}

/**
 * 資格狀態 UI 更新
 */
function updateQualificationStatus(isPersonalQualified, isManagerQualified, isAutoRescued, activeLines) {
    const $txtPersonal =$("#txtPersonalQualified");
    const $txtGroup =$("#txtGroupQualified");
    const $autoRescueBox =$("#autoRescueBox");

    if (isPersonalQualified) {
        $txtPersonal.html('<i class="fa-solid fa-circle-check text-success"></i> 個人責任額已達標 (滿 160 SV)');
    } else {
        $txtPersonal.html('<i class="fa-solid fa-circle-xmark text-danger"></i> 個人責任額未達標 (不足 160 SV，全月不領獎)');
    }

    if (isManagerQualified) {
        $txtGroup.html('<i class="fa-solid fa-circle-check text-success"></i> 合格經理小組責任額已達標');
    } else {
        $txtGroup.html('<i class="fa-solid fa-circle-xmark text-warning"></i> 小組未達 3,200 SV (向上緊縮歸併)');
    }

    if (isAutoRescued) {
        $autoRescueBox.show();$("#autoRescueTitle").html('<i class="fa-solid fa-shield-halved text-success"></i> 業績自動補救：已啟動');
        $("#autoRescueDesc").text(`具備 ${activeLines} 條合格經理線（超過4條），免除個人小組責任額！`);
    } else {
        $autoRescueBox.show();$("#autoRescueTitle").html('<i class="fa-solid fa-circle-info text-info"></i> 業績自動補救條件：未啟動');
        $("#autoRescueDesc").text('需晉升珍珠級以上且培育 5 條以上合格經理線方可啟動免小組責任額機制。');
    }
}

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
                    return `<span class="${val > 0 ? 'text-info fw-bold' : 'text-muted'}">NT$ ${Math.round(val).toLocaleString()}</span>`;
                }
            }
        ],
        language: {
            emptyTable: "尚無核算資料"
        }
    });
}

/**
 * 渲染 DataTable 資料行
 */
function renderBonusTableData(dataset, grossTotal) {
    if (!bonusDataTableInstance) return;
    bonusDataTableInstance.clear().rows.add(dataset).draw();
    $("#valTableGrossTotal").text(`NT$ ${Math.round(grossTotal).toLocaleString()}`);
}

/**
 * 初始化 Chart.js 環狀圖
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
                            return `${label}: NT$ ${val.toLocaleString()} (${percent}%)`;
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

/**
 * 快速載入制度典型範例情境
 */
function applyScenario(scenarioKey) {
    if (scenarioKey === 'PART_TIME') {
        // 例算 I：兼差型經理
        $("#selRank").val("MANAGER");
        $("#inpPersonalSv").val(400);
        $("#inpGroupSv").val(2800);
        $("#inpActiveLines").val(0);
        $("#inpPearlLines").val(0);
        $("#inpTotalManagersInDepth").val(0);
        $("#inpTotalOrgSv").val(3200);

        downlinePartners = [
            { id: 1, name: "下線夥伴甲 (主任)", rank: "DIRECTOR", sv: 1400 },
            { id: 2, name: "下線夥伴乙 (會員)", rank: "MEMBER", sv: 1400 }
        ];
    } else if (scenarioKey === 'FULL_TIME') {
        // 例算 II：專職型珍珠經理
        $("#selRank").val("PEARL");
        $("#inpPersonalSv").val(400);
        $("#inpGroupSv").val(2800);
        $("#inpActiveLines").val(7);
        $("#inpPearlLines").val(0);
        $("#inpTotalManagersInDepth").val(13);
        $("#inpTotalOrgSv").val(45000);

        downlinePartners = [
            { id: 1, name: "零售與直屬夥伴", rank: "VICE_MANAGER", sv: 2800 }
        ];
    } else if (scenarioKey === 'ENTERPRISE') {
        // 例算 III：事業型藍鑽經理
        $("#selRank").val("DIAMOND");
        $("#inpPersonalSv").val(400);
        $("#inpGroupSv").val(2800);
        $("#inpActiveLines").val(10);
        $("#inpPearlLines").val(3);
        $("#inpTotalManagersInDepth").val(22);
        $("#inpTotalOrgSv").val(110000);

        downlinePartners = [
            { id: 1, name: "直屬零售小組", rank: "VICE_MANAGER", sv: 2800 }
        ];
    }

    renderDownlines();
    recalculateAll();
}