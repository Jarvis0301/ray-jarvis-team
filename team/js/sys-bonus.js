/**
 * ============================================================================
 * 榮祥團隊戰術控制台 - 制度導讀與全域獎金動態精算中樞 (sys-bonus.js)
 * 整合 APP_CONFIG 全域組態、雙幣別 (TWD/MYR) 即時切換與高精度 AppCalc 計算引擎
 * 適用：中文版 (sys-bonus.html) 與 英文版 (en/sys-bonus.html)
 * ============================================================================
 */

// 全域當前顯示幣別狀態機
let currentBonusCurrency = APP_CONFIG?.FIN?.DEFAULT_CURRENCY || 'TWD';

/**
 * 安全數值運算轉接器 (相容 AppCalc 模組與原生 Math 防禦)
 */
const SysCalc = {
    add: (a, b) => (typeof AppCalc !== 'undefined' ? AppCalc.add(a, b) : Math.round(((Number(a) || 0) + (Number(b) || 0)) * 100) / 100),
    sub: (a, b) => (typeof AppCalc !== 'undefined' ? AppCalc.sub(a, b) : Math.round(((Number(a) || 0) - (Number(b) || 0)) * 100) / 100),
    multiply: (a, b, d = 2) => (typeof AppCalc !== 'undefined' ? AppCalc.multiply(a, b, d) : Math.round((Number(a) || 0) * (Number(b) || 0) * Math.pow(10, d)) / Math.pow(10, d)),
    divide: (a, b, d = 2) => (typeof AppCalc !== 'undefined' ? AppCalc.divide(a, b, d) : (Number(b) === 0 ? 0 : Math.round(((Number(a) || 0) / Number(b)) * Math.pow(10, d)) / Math.pow(10, d)))
};

/**
 * 全域獎金動態精算核心與 DOM 渲染器
 * @param {string} currency 當前指定貨幣 ('TWD' | 'MYR')
 */
function renderAllBonusCalculations(currency = 'TWD') {
    const isEn = (document.documentElement.lang === 'en');
    const isMyr = (currency === 'MYR');

    // 1. 提取全域組織與財務規範參數 (APP_CONFIG.ORG / APP_CONFIG.FIN)
    const cfgOrg = APP_CONFIG?.ORG || {};
    const cfgFin = APP_CONFIG?.FIN || {};
    const fxRate = cfgFin.EXCHANGE_RATE?.MYR_TWD || 8.00;
    const pv = isMyr ? (cfgOrg.PV_RATE?.MY || 3.5) : (cfgOrg.PV_RATE?.TW || 25.0);
    const pointVal = cfgOrg.LEADERSHIP_POINT_VALUE || 0.70;

    // 2. 取得合格小組與經理定額獎金 (支援官方定額與匯率動態折算)
    const cfgFixed = cfgOrg.BONUS_FIXED_AMOUNT || {
        GROUP: { TWD: 12000.00, MYR: 1500.00 },
        MANAGER: { TWD: 7000.00, MYR: 875.00 }
    };

    const groupBonus = isMyr
        ? (cfgFixed.GROUP?.MYR && cfgFixed.GROUP.MYR > 0 ? cfgFixed.GROUP.MYR : SysCalc.divide(cfgFixed.GROUP?.TWD || 12000, fxRate, 2))
        : (cfgFixed.GROUP?.TWD || 12000);

    const managerBonus = isMyr
        ? (cfgFixed.MANAGER?.MYR && cfgFixed.MANAGER.MYR > 0 ? cfgFixed.MANAGER.MYR : SysCalc.divide(cfgFixed.MANAGER?.TWD || 7000, fxRate, 2))
        : (cfgFixed.MANAGER?.TWD || 7000);

    // 雙全球獎金合計 (台幣 19,000 / 馬幣 2,375)
    const dualBonus = SysCalc.add(groupBonus, managerBonus);

    // 貨幣前綴與文字格式化排版輔助函式
    const prefix = isMyr ? 'RM ' : 'NT$ ';
    const fmt = (val) => `${prefix}${Math.round(val).toLocaleString()}`;
    const fmtMo = (val) => isEn ? `${fmt(val)} / Month` : `${fmt(val)} / 月`;
    const fmtYr = (val) => isEn ? `${fmt(val)} / Year` : `${fmt(val)} / 年`;

    // 3. 例算一：兼差型數據推算 (合格經理)
    const c1Personal = SysCalc.multiply(SysCalc.multiply(400, 0.20, 4), pv, 2); // 個人自購: 400 × 20% × PV
    const c1GroupDiff = SysCalc.multiply(SysCalc.multiply(2800, 0.10, 4), pv, 2); // 小組階差: 2,800 × 10% × PV
    const c1BaseTotal = SysCalc.add(SysCalc.add(c1Personal, c1GroupDiff), dualBonus);

    // 4. 例算二：專職型數據推算 (珍珠經理)
    // 領導獎金: 3,200 SV × 13 位合格經理 × 6% × 點值 0.70 × PV
    const c2Leadership = SysCalc.multiply(SysCalc.multiply(SysCalc.multiply(41600, 0.06, 4), pointVal, 4), pv, 2);
    // 珍鑽分紅: 7 條實動合格線 (台灣約 6,000 元/線，馬幣依匯率或定額折算)
    const perLineDiv = isMyr ? SysCalc.divide(6000, fxRate, 2) : 6000;
    const c2PearlDiv = SysCalc.multiply(7, perLineDiv, 2);
    // 旅遊基金 (月折算): 7 條線 (台灣約 1,428 元/線)
    const perLineTravelC2 = isMyr ? SysCalc.divide(1428, fxRate, 2) : 1428;
    const c2Travel = SysCalc.multiply(7, perLineTravelC2, 2);
    // 年度卓越 (月折算): 7 條線 (台灣約 3,571 元/線)
    const perLineExcellenceC2 = isMyr ? SysCalc.divide(3571, fxRate, 2) : 3571;
    const c2Excellence = SysCalc.multiply(7, perLineExcellenceC2, 2);

    let c2Total = SysCalc.add(c1BaseTotal, c2Leadership);
    c2Total = SysCalc.add(c2Total, c2PearlDiv);
    c2Total = SysCalc.add(c2Total, c2Travel);
    c2Total = SysCalc.add(c2Total, c2Excellence);

    // 5. 例算三：事業發展型數據推算 (藍鑽經理)
    // 領導獎金: 3,200 SV × 22 位合格經理 × 6% × 點值 0.70 × PV
    const c3Leadership = SysCalc.multiply(SysCalc.multiply(SysCalc.multiply(70400, 0.06, 4), pointVal, 4), pv, 2);
    const c3PearlDiv = SysCalc.multiply(10, perLineDiv, 2);
    // 藍鑽旅遊獎金 (約 1,900 元/線)
    const perLineTravelC3 = isMyr ? SysCalc.divide(1900, fxRate, 2) : 1900;
    const c3Travel = SysCalc.multiply(10, perLineTravelC3, 2);
    // 藍鑽年度卓越 (約 4,600 元/線)
    const perLineExcellenceC3 = isMyr ? SysCalc.divide(4600, fxRate, 2) : 4600;
    const c3Excellence = SysCalc.multiply(10, perLineExcellenceC3, 2);

    // 購車基金各項補助款
    const carMonthly = isMyr ? SysCalc.divide(27000, fxRate, 2) : 27000;
    const carDownPayment = isMyr ? SysCalc.divide(700000, fxRate, 2) : 700000;
    const carRenewalCash = isMyr ? SysCalc.divide(1700000, fxRate, 2) : 1700000;

    let c3MonthlyTotal = SysCalc.add(c1BaseTotal, c3Leadership);
    c3MonthlyTotal = SysCalc.add(c3MonthlyTotal, c3PearlDiv);
    c3MonthlyTotal = SysCalc.add(c3MonthlyTotal, c3Travel);
    c3MonthlyTotal = SysCalc.add(c3MonthlyTotal, c3Excellence);
    c3MonthlyTotal = SysCalc.add(c3MonthlyTotal, carMonthly);
    const c3AnnualTotal = SysCalc.multiply(c3MonthlyTotal, 12, 2);

    // 6. 事業成長路徑 (四大職級月收入區間藍圖)
    const pathMgr = isMyr ? `${prefix}2,500 ~ 5,000` : `${prefix}20,000 ~ 40,000`;
    const pathPearl = isMyr ? `${prefix}9,000 ~ 25,000` : `${prefix}70,000 ~ 200,000`;
    const pathEmerald = isMyr ? `${prefix}25,000 ~ 37,500` : `${prefix}200,000 ~ 300,000`;
    const pathDiamond = isMyr ? `${prefix}37,500 +` : `${prefix}300,000 +`;
    const pathDiamondAnnual = isMyr ? `${prefix}375,000 ~ 1,250,000+` : `${prefix}3,000,000 ~ 10,000,000+`;

    // ========================================================================
    // DOM 批量注入更新
    // ========================================================================
    // 頂部看板與生產力基準
    $('#dispCurrentPvBadge').text(isEn ? `Productivity Value: PV = ${pv}` : `生產力基準：PV = ${pv}`);
    $('.val-pv-ratio').text(pv);

    // 定額合格雙獎金及合計看板
    $('.val-bonus-mgr').text(fmt(managerBonus));$('.val-bonus-group').text(fmt(groupBonus));
    $('.val-bonus-dual').text(fmt(dualBonus));$('.val-bonus-dual-mo').text(fmtMo(dualBonus));

    // 事業成長路徑卡片
    $('.val-path-mgr').html(`${pathMgr}<span class="fs-6 text-primary ms-1">${isEn ? '/ Month' : '/ 月'}</span>`);
    $('.val-path-pearl').html(`${pathPearl}<span class="fs-6 text-primary ms-1">${isEn ? '/ Month' : '/ 月'}</span>`);
    $('.val-path-emerald').html(`${pathEmerald}<span class="fs-6 text-primary ms-1">${isEn ? '/ Month' : '/ 月'}</span>`);
    $('.val-path-diamond').html(`${pathDiamond}<span class="fs-6 text-primary ms-1">${isEn ? '/ Month' : '/ 月'}</span>`);
    $('.val-diamond-annual-range').text(pathDiamondAnnual);

    // 第一柱：銷售回饋示範卡
    $('.val-demo-personal').text(fmt(c1Personal));$('.val-demo-group').text(fmt(c1GroupDiff));

    // 例算一：兼差型 (合格經理)
    $('.val-case1-total').text(isEn ? `Approx. ${fmt(c1BaseTotal)}` : `約 ${fmt(c1BaseTotal)}`);
    $('.val-c1-personal').text(fmt(c1Personal));
    $('.val-c1-group').text(fmt(c1GroupDiff));$('.val-c1-formula-personal').text(`400 × 20% × ${pv}`);
    $('.val-c1-formula-group').text(`2,800 × 10% × ${pv}`);
    $('.val-case1-total-tbl').text(fmt(c1BaseTotal));

    // 例算二：專職型 (珍珠經理)
    $('.val-case2-total').text(isEn ? `Approx. ${fmt(c2Total)}` : `約 ${fmt(c2Total)}`);
    $('.val-c2-base-sum').text(fmt(c1BaseTotal));$('.val-c2-leadership').text(`≒ ${fmt(c2Leadership)}`);
    $('.val-c2-pearldiv').text(fmt(c2PearlDiv));$('.val-c2-travel').text(`≒ ${fmt(c2Travel)}`);
    $('.val-c2-travel-mo').text(isEn ? `Approx. ${fmt(c2Travel)} / Month` : `約 ${fmt(c2Travel)} / 月`);
    $('.val-c2-excellence').text(`≒ ${fmt(c2Excellence)}`);
    $('.val-c2-excellence-mo').text(isEn ? `Approx. ${fmt(c2Excellence)} / Month` : `約 ${fmt(c2Excellence)} / 月`);
    $('.val-c2-calc-steps').text(`41,600 × 6% × 0.7 × ${pv}`);
    $('.val-c2-base-calc-str').text(`${Math.round(c1Personal).toLocaleString()} + ${Math.round(c1GroupDiff).toLocaleString()} + ${Math.round(dualBonus).toLocaleString()}`);
    $('.val-c2-total-tbl').text(`≒ ${fmt(c2Total)}`);

    // 例算三：事業發展型 (藍鑽經理)
    $('.val-c3-leadership').text(`≒ ${fmt(c3Leadership)}`);
    $('.val-c3-pearldiv').text(fmt(c3PearlDiv));$('.val-c3-travel').text(`≒ ${fmt(c3Travel)}`);
    $('.val-c3-travel-mo').text(fmtMo(c3Travel));$('.val-c3-excellence').text(`≒ ${fmt(c3Excellence)}`);
    $('.val-c3-excellence-mo').text(fmtMo(c3Excellence));
    $('.val-c3-travel-excel-sum').text(fmtMo(SysCalc.add(c3Travel, c3Excellence)));$('.val-c3-car-monthly').text(`≒ ${fmt(carMonthly)}`);
    $('.val-c3-car-monthly-mo').text(fmtMo(carMonthly));$('.val-c3-car-down').text(fmt(carDownPayment));
    $('.val-c3-car-cash').text(fmt(carRenewalCash));$('.val-c3-monthly-total').text(`≒ ${fmtMo(c3MonthlyTotal)}`);
    $('.val-c3-annual-total').text(`≒ ${fmtYr(c3AnnualTotal)}`);
    $('.val-c3-calc-steps').text(`70,400 × 6% × 0.7 × ${pv}`);
}

// ============================================================================
// 生命週期與事件綁定 (Lifecycle & UI Event Listeners)
// ============================================================================
window.addEventListener('AppReady', function () {
    // 1. 初始化執行全域獎金計算渲染
    renderAllBonusCalculations(currentBonusCurrency);

    // 2. 幣別切換按鈕群組事件監聽 (TWD / MYR)
    $('#grpCurrency button').on('click', function (e) {
        e.preventDefault();
        const targetCurr = $(this).data('currency');
        if (!targetCurr || currentBonusCurrency === targetCurr) return;

        $('#grpCurrency button').removeClass('active');
        $(this).addClass('active');
        currentBonusCurrency = targetCurr;

        // 即刻重新精算並重繪全站數值
        renderAllBonusCalculations(currentBonusCurrency);
    });

    // 3. 獎金四大組成分頁切換監聽
    $('#bonusTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });

    // 4. 業績計算核心五大維度分頁切換監聽
    $('#perfVolumeTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });

    // 5. 傘下經理 5 種業績歸併狀態分頁切換監聽
    $('#managerStatusTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });

    // 6. 三大經營型態精算例算分頁切換監聽
    $('#caseTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });
});