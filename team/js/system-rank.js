// 頁面初始化事件監聽 (相容 AppReady 與原生 DOMContentLoaded)
window.addEventListener('AppReady', () => {
    // 1. 初始化 DataTable.js (10 大職級對照表)
    $('#rankAdvancementTable').DataTable({
        "language": {
            "processing": "處理中...",
            "loadingRecords": "載入中...",
            "lengthMenu": "顯示 _MENU_ 項職級數據",
            "zeroRecords": "沒有符合的職級資料",
            "info": "顯示第 _START_ 至 _END_ 項結果，共 _TOTAL_ 項",
            "infoEmpty": "顯示第 0 至 0 項結果，共 0 項",
            "infoFiltered": "(從 _MAX_ 項結果中過濾)",
            "search": "<i class='fa-solid fa-search'></i> 搜尋職級：",
            "paginate": {
                "first": "首頁",
                "previous": "上一頁",
                "next": "下一頁",
                "last": "末頁"
            }
        },
        "pageLength": 10,
        "lengthChange": false,
        "ordering": true,
        "responsive": true
    });

    // 2. 初始化 Chart.js (職級晉升提撥率與經理線趨勢圖)
    const ctx = document.getElementById('rankProgressChart').getContext('2d');
    const rankProgressChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['會員', '主任', '副理', '經理', '珍珠', '翡翠', '藍鑽', '雙藍鑽', '皇冠', '雙皇冠'],
            datasets: [
                {
                    label: '提撥率 (%)',
                    data: [5, 10, 15, 20, 20, 20, 20, 20, 20, 20],
                    backgroundColor: 'rgba(56, 189, 248, 0.6)',
                    borderColor: '#38bdf8',
                    borderWidth: 2,
                    yAxisID: 'y'
                },
                {
                    label: '培育合格經理線 (條)',
                    data: [0, 0, 0, 0, 2, 4, 6, 8, 10, 12],
                    type: 'line',
                    borderColor: '#facc15',
                    backgroundColor: '#facc15',
                    borderWidth: 3,
                    pointRadius: 5,
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
                    ticks: { color: '#94a3b8' },
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
                    max: 14
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#f8fafc',
                        font: { family: 'Noto Sans TC' }
                    }
                },
                tooltip: {
                    backgroundColor: '#1c2541',
                    titleColor: '#38bdf8',
                    bodyColor: '#f8fafc',
                    borderColor: 'rgba(56, 189, 248, 0.3)',
                    borderWidth: 1
                }
            }
        }
    });
});