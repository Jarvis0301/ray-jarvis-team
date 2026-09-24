// 頁面初始化事件監聽 (相容 AppReady 與原生 DOMContentLoaded)
window.addEventListener('AppReady', () => {
    // 1. 初始化 DataTable.js（宣告欄位對齊樣式）
    $('#rankAdvancementTable').DataTable({
        info: false,
        paging: false,
        ordering: false,
        columnDefs: [
            { targets: [1], className: 'text-center' },
            { targets: [2, 3, 4], className: 'text-end' }
        ]
    });

    // 2. 初始化 Chart.js
    const canvasEl = document.getElementById('rankProgressChart');
    if (!canvasEl) return;

    const ctx = canvasEl.getContext('2d');
    const rankProgressChart = new Chart(ctx, {
        type: 'bar',
        data: {
            // 1. 替換為官方 11 級職級體系
            labels: ['會員', '主任', '副理', '經理', '松柏', '長青', '珍珠', '翡翠', '藍鑽', '星級藍鑽', '耀星藍鑽'],
            datasets: [
                {
                    label: '提撥率 (%)',
                    // 會員 5%、主任 10%、副理 15%、經理以上 20%
                    data: [5, 10, 15, 20, 20, 20, 20, 20, 20, 20, 20],
                    backgroundColor: 'rgba(56, 189, 248, 0.6)',
                    borderColor: '#38bdf8',
                    borderWidth: 2,
                    yAxisID: 'y'
                },
                {
                    label: '培育合格經理線 (條)',
                    // 松柏 1 線、長青 2 線、珍珠 4 線、翡翠 6 線、藍鑽以上 10 線
                    data: [0, 0, 0, 0, 1, 2, 4, 6, 10, 10, 10],
                    type: 'line',
                    borderColor: '#facc15',
                    backgroundColor: '#facc15',
                    borderWidth: 3,
                    tension: 0,
                    fill: false,
                    pointRadius: 3,
                    pointHoverRadius: 7,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: { color: '#f5f3ff' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: '提撥率 (%)',
                        color: '#38bdf8'
                    },
                    ticks: { color: '#38bdf8', stepSize: 5 },
                    grid: { color: 'rgba(56, 189, 248, 0.1)' },
                    min: 0,
                    max: 25
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: '合格經理線 (條)',
                        color: '#facc15'
                    },
                    ticks: { color: '#facc15', stepSize: 2 },
                    grid: { drawOnChartArea: false },
                    min: 0,
                    max: 12
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#f8fafc'
                    }
                },
                tooltip: {
                    backgroundColor: '#1c2541',
                    titleColor: '#38bdf8',
                    bodyColor: '#f8fafc',
                    borderColor: 'rgba(56, 189, 248, 0.3)',
                    borderWidth: 1,
                    callbacks: {
                        label: function (ctx) {
                            const val = Number(ctx.parsed.y) || 0;
                            return ctx.datasetIndex === 0
                                ? ` 提撥率：${val.toLocaleString()}%`
                                : ` 合格經理線：${val.toLocaleString()} 條`;
                        }
                    }
                }
            }
        }
    });
});