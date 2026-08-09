// 全域變數定義
let globalConceptsData = [];
let categoryChartInstance = null;

// 預設備用演示資料 (當 Google 試算表尚未設定或抓取失敗時自動啟用，確保系統永不卡死)
const demoMockData = [
    {
        id: "concept-1",
        title: "現代人腸道養生法：益生菌與膳食纖維的黃金協同機制",
        category: "腸道保健",
        posterUrl: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80",
        summary: "腸道是人體最大的免疫器官。本文為您解析益生菌如何改變菌叢生態，配合膳食纖維達到順暢保衛的事半功倍效果。",
        content: "<p>腸道不僅是消化器官，更聚集了全體約 70% 的免疫細胞。現代人飲食作息不規律，極易導致菌叢失衡。</p><h5>為什麼需要補充複合益生菌？</h5><p>單一菌株很難在腸道建立穩定菌群，挑選具備『多包埋技術』與『專利菌株』的益生菌產品，才能確保活菌順利通過胃酸到達腸道。</p><h5>膳食纖維：益生菌的優質糧食</h5><p>補充益生菌的同時，必須搭配充足的水分與益生元（如水溶性膳食纖維），才能加速腸道蠕動，維護消化道機能。</p>",
        date: "2026-02-10",
        author: "Ray 榮祥團隊顧問",
        readTime: "4 分鐘",
        isActive: true
    },
    {
        id: "concept-2",
        title: "擺脫常態性疲勞！提升日常活力能量的核心營養素解密",
        category: "活力調理",
        posterUrl: "", // 故意留空，測試榮祥 (Ray) 訴求的海報佔位符機制
        summary: "長期熬夜、壓力大導致體力透支？除了咖啡因，您更需要了解樟芝酸、酵母B群與Q10在細胞能量代謝中的關鍵角色。",
        content: "<p>許多上班族依賴高劑量咖啡因提神，但這只是預支體力。要真正恢復精神，必須從細胞線粒體的能量合成（ATP）入手。</p><h5>樟芝與靈芝的三萜類防護</h5><p>國寶級菇菌類含有豐富的三萜類與多醣體，能輔助身體應對環境壓力，滋補強身，維持極佳元氣。</p>",
        date: "2026-02-12",
        author: "Jarvis 數據分析師",
        readTime: "3 分鐘",
        isActive: true
    },
    {
        id: "concept-3",
        title: "晶亮守護攻略：長時間面對螢幕族群的眼睛保養指南",
        category: "晶亮保養",
        posterUrl: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=800&q=80",
        summary: "數位時代 3C 藍光無處不在，游離型葉黃素、玉米黃素與花青素如何搭配才能給予靈魂之窗最完善的防護罩？",
        content: "<p>眼睛是全身唯一能直接接觸外界光線的器官。長時間看螢幕會消耗大量的視紫質。</p><h5>黃金比例 10:2</h5><p>美國 NIH 實驗證實，葉黃素 10mg 搭配玉米黃素 2mg 的黃金比例，能有效建立黃斑部保護屏障。</p>",
        date: "2026-02-14",
        author: "榮祥團隊健康顧問",
        readTime: "5 分鐘",
        isActive: true
    }
];

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    initEvents();
    loadSheetData();
});

// 註冊事件監聽
function initEvents() {
    // 切換視圖按鈕
    $('#btnViewGrid').on('click', function() {
        $(this).addClass('active');
        $('#btnViewTable').removeClass('active');
        $('#gridContainer').removeClass('d-none');
        $('#tableContainer').addClass('d-none');
    });

    $('#btnViewTable').on('click', function() {
        $(this).addClass('active');
        $('#btnViewGrid').removeClass('active');
        $('#tableContainer').removeClass('d-none');
        $('#gridContainer').addClass('d-none');
    });

    // 搜尋關鍵字過濾
    $('#searchInput').on('keyup input', function() {
        filterData();
    });

    // 分類按鈕切換
    $(document).on('click', '.category-btn', function() {
        $('.category-btn').removeClass('active btn-primary').addClass('btn-outline-primary');
        $(this).removeClass('btn-outline-primary').addClass('active btn-primary');
        filterData();
    });

    // 開啟詳情 Modal
    $(document).on('click', '.btn-open-detail', function() {
        const conceptId = $(this).data('id');
        openDetailModal(conceptId);
    });

    // 分享連結按鈕
    $('#btnShareUrl').on('click', function() {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            alert('文章連結已成功複製至剪貼簿！');
        }).catch(() => {
            alert('複製失敗，請手動複製網址。');
        });
    });
}

// 載入 Google 試算表資料 (使用 PapaParse + gviz API)
function loadSheetData() {
    // 設定 Google 試算表 ID 與工作表名稱 (營運時替換此處ID)
    const sheetId = '1YOUR_GOOGLE_SHEET_ID_HERE'; 
    const sheetName = 'HealthConcepts';
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

    Papa.parse(gvizUrl, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (results.data && results.data.length > 0) {
                globalConceptsData = normalizeSheetData(results.data);
            } else {
                globalConceptsData = demoMockData;
            }
            renderPageData(globalConceptsData);
            checkUrlParamDetail();
        },
        error: function(err) {
            console.warn('Google 試算表載入失敗，切換至備用演示數據：', err);
            globalConceptsData = demoMockData;
            renderPageData(globalConceptsData);
            checkUrlParamDetail();
        }
    });
}

// 欄位解耦適配器 (Schema Decoupling Adapter Pattern)
function normalizeSheetData(rawData) {
    return rawData.map((row, index) => {
        const keys = Object.keys(row);
        const getVal = (possibleNames) => {
            const matchedKey = keys.find(k => possibleNames.some(p => k.trim().toLowerCase() === p.toLowerCase() || k.trim().includes(p)));
            return matchedKey ? row[matchedKey].trim() : '';
        };

        const isActiveVal = getVal(['有效', 'IsActive', '狀態', '顯示']);
        const isActive = !(isActiveVal === '0' || isActiveVal.toUpperCase() === 'FALSE' || isActiveVal === '否');

        return {
            id: getVal(['ID', '編號', '序號']) || `concept-${index + 1}`,
            title: getVal(['標題', 'Title', '文章標題', '名稱']) || '未命名保健主題',
            category: getVal(['分類', 'Category', '類別', '主題']) || '養生觀念',
            posterUrl: getVal(['海報圖片', '圖片', 'Poster', 'Image', '海報連結']) || '',
            summary: getVal(['摘要', 'Summary', '大綱', '簡介']) || '',
            content: getVal(['內文', 'Content', '詳細內容', '文章內容']) || '',
            date: getVal(['日期', 'Date', '發布日期']) || '2026-01-01',
            author: getVal(['作者', 'Author', '撰寫者']) || '榮祥團隊健康顧問',
            readTime: getVal(['閱讀時間', 'ReadTime', '時長']) || '3 分鐘',
            isActive: isActive
        };
    }).filter(item => item.isActive);
}

// 渲染整體頁面
function renderPageData(data) {
    renderCategoryFilter(data);
    renderGridCards(data);
    renderDataTable(data);
    renderChart(data);
}

// 動態生成分類選單
function renderCategoryFilter(data) {
    const categories = ['ALL', ...new Set(data.map(item => item.category))];
    const container = $('#categoryFilterContainer');
    container.empty();

    categories.forEach(cat => {
        const label = cat === 'ALL' ? '全部主題' : cat;
        const activeClass = cat === 'ALL' ? 'active btn-primary' : 'btn-outline-primary';
        const icon = cat === 'ALL' ? '<i class="fa-solid fa-layer-group"></i> ' : '<i class="fa-solid fa-hashtag"></i> ';
        
        container.append(`
            <button class="btn btn-sm ${activeClass} me-2 text-nowrap category-btn" data-category="${cat}">
                ${icon}${label}
            </button>
        `);
    });
}

// 渲染卡片牆 (16:9 海報預留空間實作)
function renderGridCards(data) {
    const container = $('#gridContainer');
    container.empty();

    if (data.length === 0) {
        container.append(`
            <div class="col-12 text-center py-5">
                <i class="fa-solid fa-box-open fs-1 text-muted mb-3"></i>
                <p class="text-muted">查無相符的保健觀念文案。</p>
            </div>
        `);
        return;
    }

    data.forEach(item => {
        // 榮祥 (Ray) 訴求：海報預留空間邏輯
        let posterHtml = '';
        if (item.posterUrl) {
            posterHtml = `<img src="${item.posterUrl}" class="poster-img" alt="${item.title}" onerror="this.onerror=null; $(this).parent().html(getPlaceholderHtml());">`;
        } else {
            posterHtml = getPlaceholderHtml();
        }

        container.append(`
            <div class="col">
                <div class="card-concept">
                    <div class="poster-wrapper">
                        ${posterHtml}
                        <span class="poster-badge">
                            <i class="fa-solid fa-tag"></i> ${item.category}
                        </span>
                    </div>
                    <div class="card-body-custom">
                        <h3 class="concept-title">${item.title}</h3>
                        <p class="concept-summary">${item.summary}</p>
                        <div class="d-flex align-items-center justify-content-between mt-auto pt-3 border-top border-secondary">
                            <span class="text-muted small">
                                <i class="fa-solid fa-calendar-day"></i> ${item.date}
                            </span>
                            <button class="btn btn-sm btn-primary btn-open-detail" data-id="${item.id}">
                                <i class="fa-solid fa-arrow-right"></i> 閱讀全文
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `);
    });
}

// 海報預留佔位 HTML (Placeholder)
function getPlaceholderHtml() {
    return `
        <div class="poster-placeholder">
            <i class="fa-solid fa-image fs-1 mb-2 opacity-50"></i>
            <span class="small opacity-75"><i class="fa-solid fa-leaf"></i> 榮祥團隊 專屬海報空間</span>
        </div>
    `;
}

// 渲染 DataTable.js 表格
function renderDataTable(data) {
    if ($.fn.DataTable.isDataTable('#conceptDataTable')) {
        $('#conceptDataTable').DataTable().destroy();
    }

    const tbody = $('#conceptDataTable tbody');
    tbody.empty();

    data.forEach(item => {
        tbody.append(`
            <tr>
                <td>
                    <span class="badge bg-success-subtle text-success border border-success-subtle">
                        <i class="fa-solid fa-tag"></i> ${item.category}
                    </span>
                </td>
                <td class="fw-bold text-white">${item.title}</td>
                <td class="text-muted small">${item.summary}</td>
                <td class="text-nowrap small text-muted">${item.date}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary btn-open-detail" data-id="${item.id}">
                        <i class="fa-solid fa-eye"></i> 查看
                    </button>
                </td>
            </tr>
        `);
    });

    $('#conceptDataTable').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/zh-HANT.json'
        },
        pageLength: 6,
        lengthMenu: [6, 12, 24],
        responsive: true,
        order: [[3, 'desc']]
    });
}

// 渲染 Chart.js 分析圖表
function renderChart(data) {
    const categoryCounts = {};
    data.forEach(item => {
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    });

    const labels = Object.keys(categoryCounts);
    const counts = Object.values(categoryCounts);

    const ctx = document.getElementById('conceptChart').getContext('2d');
    
    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: [
                    '#10B981', '#34D399', '#059669', '#6EE7B7', '#047857'
                ],
                borderColor: '#0d221a',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    // 渲染右側 Legend 清單
    const legendList = $('#chartLegendList');
    legendList.empty();
    labels.forEach((label, idx) => {
        const count = counts[idx];
        legendList.append(`
            <li class="list-group-item bg-transparent text-light border-secondary d-flex justify-content-between align-items-center py-2">
                <span><i class="fa-solid fa-circle me-2" style="color: ${categoryChartInstance.data.datasets[0].backgroundColor[idx]};"></i>${label}</span>
                <span class="badge bg-success rounded-pill">${count} 篇</span>
            </li>
        `);
    });
}

// 資料過濾邏輯 (搜尋與分類組合)
function filterData() {
    const keyword = $('#searchInput').val().toLowerCase().trim();
    const selectedCat = $('.category-btn.active').data('category') || 'ALL';

    const filtered = globalConceptsData.filter(item => {
        const matchCat = (selectedCat === 'ALL') || (item.category === selectedCat);
        const matchKeyword = (item.title.toLowerCase().includes(keyword)) || 
                            (item.summary.toLowerCase().includes(keyword)) ||
                            (item.content.toLowerCase().includes(keyword));
        return matchCat && matchKeyword;
    });

    renderGridCards(filtered);
    renderDataTable(filtered);
}

// 開啟 Modal 呈現詳細頁文案
function openDetailModal(conceptId) {
    const item = globalConceptsData.find(c => c.id === conceptId);
    if (!item) return;

    $('#modalCategoryBadge').html(`<i class="fa-solid fa-tag"></i> ${item.category}`);
    $('#modalTitle').text(item.title);
    $('#modalAuthor').text(item.author);
    $('#modalDate').text(item.date);
    $('#modalReadTime').text(item.readTime);
    $('#modalContent').html(item.content);

    const posterImg = $('#modalPosterImg');
    if (item.posterUrl) {
        posterImg.attr('src', item.posterUrl).removeClass('d-none');
    } else {
        posterImg.addClass('d-none');
    }

    // 更新網址 Query String (不刷新頁面，方便直接分享 URL)
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?id=' + item.id;
    window.history.pushState({ path: newUrl }, '', newUrl);

    const detailModal = new bootstrap.Modal(document.getElementById('conceptDetailModal'));
    detailModal.show();
}

// 檢查網址參數自動開啟指定文章 Modal (?id=xxx)
function checkUrlParamDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const conceptId = urlParams.get('id');
    if (conceptId) {
        openDetailModal(conceptId);
    }
}