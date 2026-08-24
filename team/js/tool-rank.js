/* TO DO：改成在JS中不要有預設資料，如果連不到試算表就跳出提示（AppDialog.alert）

AppDialog.alert範例：
「
    AppDialog.alert("請先選擇至少一項商品後再下載 Excel！", {
        title: "未選擇商品",
        icon: "fa-solid fa-circle-exclamation text-warning"
    });
」 */

// 設定 Google 試算表 ID 與工作表名稱 (營運時替換此處ID)
const SPREADSHEET_ID = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ_SAMPLE_ID";
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;

// 1. 葡眾 10 大職級基礎規則與備援資料
const defaultRankRules = [
    { code: "R01", name: "會員", reqCumSv: 0, reqGroupSv: 0, reqLines: 0, rebateRate: "5%", note: "入會即具備資格，享 5% 階差回饋" },
    { code: "R02", name: "主任", reqCumSv: 1000, reqGroupSv: 0, reqLines: 0, rebateRate: "10%", note: "個人累計達 1,000 SV，升聘不降級" },
    { code: "R03", name: "副理", reqCumSv: 10000, reqGroupSv: 0, reqLines: 0, rebateRate: "15%", note: "個人累計達 10,000 SV，升聘不降級" },
    { code: "R04", name: "經理", reqCumSv: 30000, reqGroupSv: 3200, reqLines: 0, rebateRate: "20%", note: "累計達 30,000 SV（升經理當月累計需 12,000 SV + 個人 160 SV + 小組 3,200 SV）" },
    { code: "R05", name: "珍珠", reqCumSv: 30000, reqGroupSv: 3200, reqLines: 2, rebateRate: "20%", note: "培育 2 位直系合格經理線，享珍珠體系分紅" },
    { code: "R06", name: "翡翠", reqCumSv: 30000, reqGroupSv: 3200, reqLines: 4, rebateRate: "20%", note: "培育 4 位直系合格經理線，享翡翠體系分紅" },
    { code: "R07", name: "藍鑽", reqCumSv: 30000, reqGroupSv: 3200, reqLines: 6, rebateRate: "20%", note: "培育 6 位直系合格經理線，享藍鑽體系分紅" },
    { code: "R08", name: "雙藍鑽", reqCumSv: 30000, reqGroupSv: 3200, reqLines: 8, rebateRate: "20%", note: "培育 8 位直系合格經理線，享雙藍鑽體系分紅" },
    { code: "R09", name: "皇冠", reqCumSv: 30000, reqGroupSv: 3200, reqLines: 10, rebateRate: "20%", note: "培育 10 位直系合格經理線，榮登皇冠俱樂部" },
    { code: "R10", name: "雙皇冠", reqCumSv: 30000, reqGroupSv: 3200, reqLines: 12, rebateRate: "20%", note: "培育 12 位直系合格經理線，最高榮譽領袖" }
];

let rankChartInstance = null;
let rankDataTable = null;

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    initChart();
    initDataTable(defaultRankRules);
    bindEvents();
    calculateRankProgress();
    
    // 嘗試載入雲端試算表 (解耦抓取)
    fetchGoogleSheetData();
});

// 2. Google 試算表抓取與欄位解耦適配器 (PapaParse + gviz)
function fetchGoogleSheetData() {
    Papa.parse(GVIZ_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            if (results && results.data && results.data.length > 0) {
                const decoupledData = decoupleSheetHeaders(results.data);
                if (decoupledData.length > 0) {
                    updateDataTable(decoupledData);
                }
            }
        },
        error: function (err) {
            console.warn("無法存取雲端試算表或連結未發布，維持在地標準制度數據。", err);
        }
    });
}

// 欄位名稱解耦處理器
function decoupleSheetHeaders(rawData) {
    return rawData.map((row, index) => {
        let code = `R${String(index + 1).padStart(2, '0')}`;
        let name = "", reqCumSv = 0, reqGroupSv = 0, reqLines = 0, rebateRate = "5%", note = "";

        Object.keys(row).forEach(key => {
            const k = key.trim().toLowerCase();
            if (k.includes("職級") || k.includes("階級") || k.includes("rank")) {
                name = row[key];
            } else if (k.includes("累計") || k.includes("cum")) {
                reqCumSv = parseInt(row[key]) || 0;
            } else if (k.includes("小組") || k.includes("group")) {
                reqGroupSv = parseInt(row[key]) || 0;
            } else if (k.includes("經理線") || k.includes("線數") || k.includes("lines")) {
                reqLines = parseInt(row[key]) || 0;
            } else if (k.includes("回饋") || k.includes("比率") || k.includes("rate")) {
                rebateRate = row[key];
            } else if (k.includes("說明") || k.includes("備註") || k.includes("note")) {
                note = row[key];
            }
        });

        return {
            code: code,
            name: name || defaultRankRules[index]?.name || "自訂職級",
            reqCumSv: reqCumSv,
            reqGroupSv: reqGroupSv,
            reqLines: reqLines,
            rebateRate: rebateRate,
            note: note
        };
    });
}

// 3. 事件監聽綁定
function bindEvents() {
    // 滑塊與數字輸入框雙向連動
    $("#cumSvInput").on("input", function () {
        $("#cumSvSlider").val($(this).val());
        calculateRankProgress();
    });

    $("#cumSvSlider").on("input", function () {
        $("#cumSvInput").val($(this).val());
        calculateRankProgress();
    });

    $("#monthPersonalSvInput, #monthGroupSvInput, #managerLinesInput, #targetRankSelect").on("change input", function () {
        calculateRankProgress();
    });
}

// 4. 核心職級與目標差距計算邏輯
function calculateRankProgress() {
    const cumSv = parseInt($("#cumSvInput").val()) || 0;
    const personalSv = parseInt($("#monthPersonalSvInput").val()) || 0;
    const groupSv = parseInt($("#monthGroupSvInput").val()) || 0;
    const lines = parseInt($("#managerLinesInput").val()) || 0;
    const targetRankName = $("#targetRankSelect").val();

    // 判斷當前最高職級
    let currentRank = defaultRankRules[0]; // 會員
    for (let i = defaultRankRules.length - 1; i >= 0; i--) {
        const r = defaultRankRules[i];
        const isGroupSvPass = (r.reqGroupSv === 0) || (groupSv >= r.reqGroupSv && personalSv >= 160);
        
        if (r.reqLines > 0) {
            // 經理以上職級（珍珠、翡翠...）
            if (cumSv >= 30000 && lines >= r.reqLines && isGroupSvPass) {
                currentRank = r;
                break;
            }
        } else {
            // 經理以下職級（會員、主任、副理、經理）
            if (r.name === "經理") {
                if ((cumSv >= 30000 || cumSv >= 12000) && isGroupSvPass) {
                    currentRank = r;
                    break;
                }
            } else if (cumSv >= r.reqCumSv) {
                currentRank = r;
                break;
            }
        }
    }

    // 更新頂部卡片
    $("#dispCurrentRank").text(currentRank.name);
    $("#dispCurrentRebate").text(currentRank.rebateRate);
    $("#dispTargetRank").text(targetRankName);

    // 目標職級規則
    const targetRank = defaultRankRules.find(r => r.name === targetRankName) || defaultRankRules[3];

    // 算計差距
    let gapCumSv = Math.max(0, targetRank.reqCumSv - cumSv);
    let gapGroupSv = Math.max(0, targetRank.reqGroupSv - groupSv);
    let gapPersonalSv = Math.max(0, 160 - personalSv);
    let gapLines = Math.max(0, targetRank.reqLines - lines);

    // 進度百分比算算
    let svProgress = Math.min(100, (cumSv / (targetRank.reqCumSv || 1)) * 100);
    let lineProgress = targetRank.reqLines > 0 ? Math.min(100, (lines / targetRank.reqLines) * 100) : 100;
    let overallProgress = Math.round((svProgress + lineProgress) / (targetRank.reqLines > 0 ? 2 : 1));

    if (overallProgress > 100) overallProgress = 100;

    $("#dispOverallProgress").text(`${overallProgress}%`);
    $("#progressBar").css("width", `${overallProgress}%`).text(`${overallProgress}%`);
    $("#progressPercentText").text(`${overallProgress}%`);

    // 解鎖渲染清單
    renderGapAnalysis(targetRankName, gapCumSv, gapGroupSv, gapPersonalSv, gapLines, overallProgress);

    // 更新 Chart.js
    updateChartData(cumSv, targetRank.reqCumSv, lines, targetRank.reqLines);
}

// 5. 渲染解鎖與差距說明
function renderGapAnalysis(targetName, gapCumSv, gapGroupSv, gapPersonalSv, gapLines, progress) {
    const $box = $("#gapAnalysisBox");
    const $title = $("#gapTitle");
    const $list = $("#gapList");

    $list.empty();

    if (progress >= 100 && gapPersonalSv === 0 && gapGroupSv === 0) {
        $box.addClass("unlocked");
        $title.removeClass("text-warning").addClass("text-success")
                .html(`<i class="fa-solid fa-circle-check"></i> 恭喜！您已完美符合【${targetName}】晉升資格`);
        $list.append(`<li class="text-success"><i class="fa-solid fa-check"></i> 所有個人業績、小組業績與合格經理線指標皆已達標。</li>`);
    } else {
        $box.removeClass("unlocked");
        $title.addClass("text-warning")
                .html(`<i class="fa-solid fa-triangle-exclamation"></i> 衝刺【${targetName}】尚需完成以下條件：`);

        if (gapCumSv > 0) {
            $list.append(`<li><i class="fa-solid fa-arrow-right-long text-info"></i> 尚缺個人累計業績：<strong class="text-warning">${gapCumSv.toLocaleString()} SV</strong></li>`);
        }
        if (gapPersonalSv > 0) {
            $list.append(`<li><i class="fa-solid fa-arrow-right-long text-info"></i> 當月個人消費尚差：<strong class="text-danger">${gapPersonalSv} SV</strong>（需達 160 SV 合格基本盤）</li>`);
        }
        if (gapGroupSv > 0) {
            $list.append(`<li><i class="fa-solid fa-arrow-right-long text-info"></i> 當月小組業績尚差：<strong class="text-warning">${gapGroupSv.toLocaleString()} SV</strong>（合格小組需 3,200 SV）</li>`);
        }
        if (gapLines > 0) {
            $list.append(`<li><i class="fa-solid fa-arrow-right-long text-info"></i> 尚需培育合格經理線：<strong class="text-warning">${gapLines} 條</strong></li>`);
        }
    }
}

// 6. Chart.js 戰力分析圖表初始化
function initChart() {
    const ctx = document.getElementById('rankGapChart').getContext('2d');
    rankChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['累計業績 (SV)', '合格經理線 (條)'],
            datasets: [
                {
                    label: '當前現況',
                    data: [3500, 0],
                    backgroundColor: '#38bdf8',
                    borderRadius: 6
                },
                {
                    label: '目標門檻',
                    data: [30000, 0],
                    backgroundColor: '#facc15',
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#f8fafc' }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#7dd3fc' },
                    grid: { color: 'rgba(56, 189, 248, 0.1)' }
                },
                y: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(56, 189, 248, 0.1)' }
                }
            }
        }
    });
}

function updateChartData(cumSv, targetCumSv, lines, targetLines) {
    if (!rankChartInstance) return;
    rankChartInstance.data.datasets[0].data = [cumSv, lines];
    rankChartInstance.data.datasets[1].data = [targetCumSv, targetLines];
    rankChartInstance.update();
}

// 7. DataTables 初始化與動態更新
function initDataTable(data) {
    renderTableBody(data);
    rankDataTable = $('#rankDetailTable').DataTable({
        info: false,                    // 顯示「顯示第 X 至 Y 筆」的統計資訊
        paging: false
    });
}

function renderTableBody(data) {
    const $tbody = $("#rankTableBody");
    $tbody.empty();
    data.forEach(item => {
        const rowHtml = `
            <tr>
                <td><span class="badge bg-secondary">${item.code}</span></td>
                <td class="fw-bold text-info">${item.name}</td>
                <td>${item.reqCumSv ? item.reqCumSv.toLocaleString() + ' SV' : '無'}</td>
                <td>${item.reqGroupSv ? item.reqGroupSv.toLocaleString() + ' SV' : '無'}</td>
                <td>${item.reqLines ? item.reqLines + ' 條' : '無'}</td>
                <td class="text-warning fw-bold">${item.rebateRate}</td>
                <td class="text-muted fs-7">${item.note}</td>
            </tr>
        `;
        $tbody.append(rowHtml);
    });
}

function updateDataTable(data) {
    if (rankDataTable) {
        rankDataTable.clear().destroy();
    }
    initDataTable(data);
}