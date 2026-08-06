// 1. Google 試算表 ID（請在此替換為實體 ID；若留空自動切換備援庫）
let SPREADSHEET_ID = '1ee1emaa3wyn704eoU10lEJT0F4Ui3DbIYEEjG80RGSo';

// 全域狀態庫
const appState = {
    patents: [],
    typeList: [],
    currentFilter: 'all'
};

// 2. 預設備援專利類型列表
const defaultTypeList = [
    { code: 'probiotics', name: '益生菌專利', icon: 'fas fa-bacteria', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' },
    { code: 'cicadae', name: '蟬花與草本', icon: 'fas fa-eye', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.15)' },
    { code: 'encapsulation', name: '多層包埋技術', icon: 'fas fa-capsules', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.15)' },
    { code: 'fermentation', name: '液態發酵技術', icon: 'fas fa-flask-vial', color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)' },
    { code: 'fungi', name: '珍稀菇菌專利', icon: 'fas fa-plant-wilt', color: '#facc15', bg: 'rgba(234, 179, 8, 0.15)' }
];

// 3. 預設備援專利內容列表
const defaultPatents = [
    {
        id: 'patent1',
        category: 'probiotics',
        title: '植物乳桿菌 GKM3® 專利菌株',
        patentNo: '專利字號：I752109 / 國家新創獎',
        imgUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80',
        desc: '從台灣在地特有發酵食品中篩選分離之優良乳酸菌，具備優異之體質調節與代謝促進活性。',
        feature1: '榮獲 2025 年第 21 屆國家新創獎精準醫療肯定',
        feature2: '有助於調節身體機能、促進新陳代謝',
        feature3: '通過胃酸與膽鹽耐受度實驗，維持消化道菌種平衡',
        awardBadge: '2025 國家新創獎',
        detailDesc: 'GKM3® 是葡萄王生技研發團隊自台灣特有發酵食品中經多年篩選分離之特有菌株。具有高度之耐酸、耐膽鹽能力，經動物及人體臨床試驗驗證，能有助於促進新陳代謝與腸道健康。'
    },
    {
        id: 'patent2',
        category: 'probiotics',
        title: '乳雙歧桿菌 GKK2 專利菌株',
        patentNo: '專利字號：2024 馬來西亞 ITEX 金獎',
        imgUrl: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=800&q=80',
        desc: '專為現代人飲食不規律設計之防護型菌株，經專利發酵技術精製，維持消化道機能與順暢體驗。',
        feature1: '榮獲 2024 馬來西亞 ITEX 國際發明展金牌獎',
        feature2: '改善腸道菌叢生態，促進使排便順暢',
        feature3: '高定殖力與高活性，全家人皆適用',
        awardBadge: '馬來西亞 ITEX 金獎',
        detailDesc: 'GKK2 具備優異的腸道黏附定殖能力，能快速建立優質防護菌叢，抵禦外在不良飲食帶來的負擔，維持優良消化機能。'
    },
    {
        id: 'patent3',
        category: 'encapsulation',
        title: 'MAOC-LAB 多層包埋微膠囊技術',
        patentNo: '專利字號：多國包埋發明專利',
        imgUrl: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=800&q=80',
        desc: '突破傳統益生菌容易因常溫、胃酸破壞而失效的痛點，採用多層結構保護包覆活性好菌。',
        feature1: '第一層抗酸層：阻絕胃酸侵蝕，活菌直達腸道',
        feature2: '第二層抗氧化層：隔離空氣濕度與高溫氧化',
        feature3: '第三層定釋層：於腸道環境精準釋放 100% 活性',
        awardBadge: '活菌存活率 > 95%',
        detailDesc: '多層抗氧化包埋微膠囊技術（MAOC-LAB）能大幅提高菌株對環境酸鹼與熱壓的耐受性，確保消費者每一口吃下的益生菌均保持最高生酵素活性。'
    },
    {
        id: 'patent4',
        category: 'cicadae',
        title: '蟬花菌絲體發酵萃取專利 (Isaria cicadae)',
        patentNo: '專利字號：2021 MTE / 2022 烏克蘭發明展金獎',
        imgUrl: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=800&q=80',
        desc: '運用頂尖生物反應器技術培育珍稀蟬花菌絲體，富含腺苷、蟲草素與多醣體，帶來晶亮舒緩。',
        feature1: '榮獲 2021 馬來西亞 MTE 國際發明展金牌獎',
        feature2: '榮獲 2022 烏克蘭國際發明展金牌獎',
        feature3: '有助於舒緩乾澀、晶亮守護與肌膚水潤補水',
        awardBadge: '雙國國際發明展金獎',
        detailDesc: '葡萄王生技運用無菌液態發酵技術成功突破野外蟬花產量稀少且品質不一之瓶頸，提供高品質、無重金屬殘留之頂級晶亮滋養成分。'
    },
    {
        id: 'patent5',
        category: 'fermentation',
        title: '電腦化精準 150 噸液態發酵量產技術',
        patentNo: '專利字號：生技發酵核心製程專利',
        imgUrl: 'https://images.unsplash.com/photo-1581093458791-9f3c3900df4b?auto=format&fit=crop&w=800&q=80',
        desc: '擺脫傳統固態培養耗時且易受污染之缺點，以自動化發酵槽實現純化培養與無菌充填。',
        feature1: '亞洲最大規模生技級 150 噸發酵槽矩陣',
        feature2: '精準控制溫度、溶氧與 pH 值，活性指標最大化',
        feature3: '免煎煮隨身包，無重金屬與農藥殘留風險',
        awardBadge: '亞洲生技製造標竿',
        detailDesc: '全台首屈一指的 150 噸液態發酵設備，結合全自動化電腦監控，確保每一批生產之菌絲體成分與活性皆符合最高品質標準。'
    },
    {
        id: 'patent6',
        category: 'fungi',
        title: '專利樟芝菌絲體與猴頭菇發酵技術',
        patentNo: '專利字號：美/德/台/日 多國發明專利',
        imgUrl: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=800&q=80',
        desc: '獨家技術富含 4-acetylantroquinonol B 等關鍵活性成分，提供精神旺盛與全方位滋補強身。',
        feature1: '通過 90 天餵食毒性試驗，獲得官方安全核可',
        feature2: '美國及德國國際專利背書，鞏固頂級養生地位',
        feature3: '小分子深層穿透，吸收率顯著提升',
        awardBadge: '美德台日多國專利',
        detailDesc: '葡萄王生技累積 20 年樟芝研究經驗，取得包含台灣、美國、德國等多國發明專利，經嚴格安全性評估，為頂級養護首選。'
    }
];

// 4. 頁面初始化生命週期
// 核心修改：監聽 vendorReady 事件，確保 jQuery 與 Chart.js 已全部載入記憶體
window.addEventListener('vendorReady', async () => {
    appState.typeList = defaultTypeList;
    appState.patents = defaultPatents;

    renderTypeFilterButtons();
    bindEvents();

    if (SPREADSHEET_ID) {
        await fetchGoogleSheetsData();
    } else {
        document.getElementById('syncStatus').innerHTML = '<i class="fas fa-database"></i> 使用備援資料庫';
    }

    renderPatents();
});

// 5. 使用 PapaParse 解析 Google Sheets 數據 (GViz CSV API, 不綁定英文表頭)
async function fetchGoogleSheetsData() {
    try {
        document.getElementById('syncStatus').innerHTML = '<i class="fas fa-spinner fa-spin"></i> 專利資料同步中...';

        const fetchSheet = async (sheetName) => {
            const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
            const res = await fetch(url);
            const text = await res.text();

            // 使用 PapaParse 進行工業級 CSV 解析 (header: false, 不綁定欄位名稱)
            const parsed = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            return parsed.data.slice(1); // 扣除第一列中文表頭
        };

        // 並行抓取 2 個工作表：【專利類型】與【產品專利】
        const [typeData, patentsData] = await Promise.all([
            fetchSheet('專利類型'),
            fetchSheet('產品專利')
        ]);

        if (typeData && typeData.length > 0) {
            appState.typeList = parseTypeRows(typeData);
            renderTypeFilterButtons();
        }

        if (patentsData && patentsData.length > 0) {
            appState.patents = mapPatentRows(patentsData);
        }

        document.getElementById('syncStatus').innerHTML = '<i class="fas fa-circle-check"></i> 雲端資料同步完成';
    } catch (err) {
        console.warn("無法動態讀取 Google 試算表，使用預設資料:", err);
        document.getElementById('syncStatus').innerHTML = '<i class="fas fa-triangle-exclamation"></i> 同步失敗，切換至備援庫';
    }
}

// 6. 轉換【專利類型】工作表列資料 (不綁定表頭, 依據索引存取)
function parseTypeRows(rows) {
    const types = [{ code: 'all', name: '全部專利', icon: 'fas fa-border-all', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' }];

    rows.forEach(r => {
        const code = (r[0] || '').trim();
        const name = (r[1] || '').trim();
        const nameEn = (r[2] || '').trim();
        const icon = (r[3] || 'fas fa-certificate').trim();
        const color = (r[4] || '#34d399').trim();
        const bg = (r[5] || 'rgba(16, 185, 129, 0.15)').trim();

        if (code) {
            types.push({ code, name, nameEn, icon, color, bg });
        }
    });

    return types.length > 1 ? types : defaultTypeList;
}

// 7. 轉換【產品專利】工作表列資料 (不綁定表頭, 依據索引存取)
function mapPatentRows(rows) {
    return rows.map(r => ({
        id: (r[0] || '').trim(),
        category: (r[1] || '').trim(),
        title: (r[2] || '').trim(),
        patentNo: (r[3] || '').trim(),
        imgUrl: parseGoogleDriveUrl((r[4] || '').trim()),
        desc: (r[5] || '').trim(),
        feature1: (r[6] || '').trim(),
        feature2: (r[7] || '').trim(),
        feature3: (r[8] || '').trim(),
        awardBadge: (r[9] || '').trim(),
        detailDesc: (r[10] || '').trim()
    })).filter(item => item.id !== '' && item.title !== '');
}

// 8. Google Drive 圖片分享網址智慧轉化為 CDN 直連網址
function parseGoogleDriveUrl(url) {
    if (!url) {
        return 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80';
    }
    const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
    }
    return url;
}

// 9. 動態渲染分類篩選按鈕
function renderTypeFilterButtons() {
    let html = '';
    appState.typeList.forEach(t => {
        const activeClass = appState.currentFilter === t.code ? 'active' : '';
        html += `<button class="btn btn-filter ${activeClass}" data-filter="${t.code}"><i class="${t.icon}"></i> ${t.name}</button>`;
    });
    $('#typeFilterContainer').html(html);
}

// 10. 動態渲染專利卡片與對應 Modal
function renderPatents() {
    let gridHtml = '';
    let modalHtml = '';

    const filtered = appState.patents.filter(p => {
        if (appState.currentFilter === 'all') return true;
        return p.category === appState.currentFilter;
    });

    if (filtered.length === 0) {
        $('#patentGrid').html(`
            <div class="col-12 text-center py-5">
                <i class="fas fa-folder-open fa-3x text-main mb-3"></i>
                <p class="text-main">尚無該類別之專利展示資料</p>
            </div>
        `);
        return;
    }

    filtered.forEach(item => {
        const typeObj = appState.typeList.find(t => t.code === item.category) || {
            name: '專利認證',
            icon: 'fas fa-certificate',
            color: '#34d399',
            bg: 'rgba(52, 211, 153, 0.15)'
        };

        const modalId = `modal_${item.id}`;

        // 生成卡片 HTML
        gridHtml += `
        <div class="col-12 col-md-6 col-lg-4 patent-item">
            <div class="patent-card">
                <div class="patent-img-wrapper" data-bs-toggle="modal" data-bs-target="#${modalId}">
                    <img src="${item.imgUrl}" alt="${item.title}" onerror="this.src='https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80'">
                    <div class="patent-img-overlay">
                        <span class="img-zoom-hint"><i class="fas fa-magnifying-glass-plus"></i> 點擊查看證書</span>
                    </div>
                </div>
                <div class="patent-header">
                    <span class="patent-category-tag" style="color: ${typeObj.color}; background-color: ${typeObj.bg}; border: 1px solid ${typeObj.color}44;">
                        <i class="${typeObj.icon}"></i> ${typeObj.name}
                    </span>
                    <h3 class="patent-title">${item.title}</h3>
                    <div class="patent-no"><i class="fas fa-award"></i> ${item.patentNo || '國際專利認證'}</div>
                </div>
                <div class="patent-body">
                    <p class="patent-desc">${item.desc}</p>
                    <ul class="feature-list">
                        ${item.feature1 ? `<li><i class="fas fa-circle-check"></i> ${item.feature1}</li>` : ''}
                        ${item.feature2 ? `<li><i class="fas fa-circle-check"></i> ${item.feature2}</li>` : ''}
                        ${item.feature3 ? `<li><i class="fas fa-circle-check"></i> ${item.feature3}</li>` : ''}
                    </ul>
                </div>
                <div class="patent-footer">
                    <span class="award-badge"><i class="fas fa-trophy"></i> ${item.awardBadge || '權威背書'}</span>
                    <button class="btn btn-patent-detail" data-bs-toggle="modal" data-bs-target="#${modalId}"><i class="fas fa-file-contract"></i> 查看證書</button>
                </div>
            </div>
        </div>`;

        // 生成 Modal HTML
        modalHtml += `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title text-mint"><i class="fas fa-certificate"></i> ${item.title}</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body p-4">
                        <img src="${item.imgUrl}" alt="${item.title}" class="modal-patent-img" onerror="this.src='https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1200&q=80'">
                        <div class="badge bg-success mb-2"><i class="fas fa-shield"></i> ${item.patentNo || '專利號碼與認證'}</div>
                        <h4 class="h5 text-white mb-3">${item.title}</h4>
                        <p class="text-main">${item.detailDesc || item.desc}</p>
                        <hr class="border-secondary">
                        <h6 class="text-warning"><i class="fas fa-trophy"></i> 權威認證與亮點：</h6>
                        <ul class="text-light opacity-75 small mb-0">
                            ${item.feature1 ? `<li>${item.feature1}</li>` : ''}
                            ${item.feature2 ? `<li>${item.feature2}</li>` : ''}
                            ${item.feature3 ? `<li>${item.feature3}</li>` : ''}
                        </ul>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="fas fa-xmark"></i> 關閉</button>
                    </div>
                </div>
            </div>
        </div>`;
    });

    $('#patentGrid').html(gridHtml);
    $('#modalContainer').html(modalHtml);
}

// 11. 事件綁定 (分類篩選與即時關鍵字搜尋)
function bindEvents() {
    // 分類按鈕點擊事件
    $('#typeFilterContainer').on('click', '.btn-filter', function() {
        $('.btn-filter').removeClass('active');
        $(this).addClass('active');

        appState.currentFilter = $(this).attr('data-filter');
        renderPatents();
    });

    // 關鍵字即時搜尋
    $('#patentSearchInput').on('keyup', function() {
        const value = $(this).val().toLowerCase().trim();

        $('.patent-item').filter(function() {
            const text = $(this).text().toLowerCase();
            $(this).toggle(text.indexOf(value) > -1);
        });
    });
}