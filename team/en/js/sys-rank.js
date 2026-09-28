// Page Initialization Event Listener (Compatible with AppReady & Native DOMContentLoaded)
window.addEventListener('AppReady', () => {
    // 1. 動態讀取 common.js 定額獎金並注入對照表經理權益欄位
    const cfgFixedBonus = APP_CONFIG?.ORG?.BONUS_FIXED_AMOUNT;
    if (cfgFixedBonus) {
        const grpTwd = cfgFixedBonus.GROUP?.TWD ? `NT$ ${cfgFixedBonus.GROUP.TWD.toLocaleString()}` : '10%';
        const mgrTwd = cfgFixedBonus.MANAGER?.TWD ? `NT$ ${cfgFixedBonus.MANAGER.TWD.toLocaleString()}` : '5%';

        // 尋找經理列並更新其權益亮點說明文字
        $('#rankAdvancementTable tbody tr').each(function () {
            const rankText = $(this).find('td:first').text();
            if (rankText.includes('經理') && !rankText.includes('松柏') && !rankText.includes('長青') && !rankText.includes('珍珠') && !rankText.includes('翡翠') && !rankText.includes('藍鑽')) {
                $(this).find('td:last').html(`
                    <span class="text-info fw-bold">20%</span> 階差 + 小組 10% (${grpTwd}) + 經理 5% (${mgrTwd})
                `);
            }
        });
    }

    // 2. Initialize DataTable.js (Declared column alignment classes)
    $('#rankAdvancementTable').DataTable({
        info: false,
        paging: false,
        ordering: false,
        columnDefs: [
            { targets: [1], className: 'text-center' },
            { targets: [2, 3, 4], className: 'text-end' }
        ]
    });

    // 3. Initialize Chart.js
    const canvasEl = document.getElementById('rankProgressChart');
    if (!canvasEl) return;

    const ctx = canvasEl.getContext('2d');
    const rankProgressChart = new Chart(ctx, {
        type: 'bar',
        data: {
            // Updated with official 11-Tier Rank Titles
            labels: [
                'Member',
                'Associate',
                'Senior Associate',
                'Master',
                'Silver Master',
                'Gold Master',
                'Pearl Master',
                'Emerald Master',
                'Blue Diamond',
                'Star Blue Diamond',
                'Crown Blue Diamond'
            ],
            datasets: [
                {
                    label: 'Payout Ratio (%)',
                    // Member 5%, Associate 10%, Senior Associate 15%, Master & above 20%
                    data: [5, 10, 15, 20, 20, 20, 20, 20, 20, 20, 20],
                    backgroundColor: 'rgba(56, 189, 248, 0.6)',
                    borderColor: '#38bdf8',
                    borderWidth: 2,
                    yAxisID: 'y'
                },
                {
                    label: 'Qualified Master Lines',
                    // Silver 1, Gold 2, Pearl 4, Emerald 6, Blue Diamond & above 10
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
                        text: 'Payout Ratio (%)',
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
                        text: 'Qualified Master Lines',
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
                                ? ` Payout Ratio: ${val.toLocaleString()}%`
                                : ` Qualified Master Lines: ${val.toLocaleString()}`;
                        }
                    }
                }
            }
        }
    });
});