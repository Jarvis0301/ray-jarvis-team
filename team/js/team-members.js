/* TO DO：改成在JS中不要有預設資料，如果連不到試算表就跳出提示（AppDialog.alert）

AppDialog.alert範例：
「
    AppDialog.alert("請先選擇至少一項商品後再下載 Excel！", {
        title: "未選擇商品",
        icon: "fa-solid fa-circle-exclamation text-warning"
    });
」 */

// 設定 Google 試算表 CSV 公開發布網址 (gviz/tq?tqx=out:csv)
const SPREADSHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Materials`;

// 預設備用模擬數據（若 Google 試算表尚未設定或抓取失敗時自動啟動）
const fallbackMembersData = [
    {
        name: "Ray 榮祥",
        rank: "藍鑽",
        role: "團隊創始人",
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop",
        location: "台北市",
        expertise: "組織戰略, 市場開發, 制度解析",
        social_link: "https://line.me",
        intro: "領航榮祥團隊，建構數位引流與實體轉化雙軌系統。"
    },
    {
        name: "Jarvis 承志",
        rank: "珍珠",
        role: "系統總架構師",
        avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop",
        location: "新北市",
        expertise: "全棧工程, 自動化工具, 數據分析",
        social_link: "https://github.com",
        intro: "以 INTP 邏輯思維打造團隊雲端軍備庫與自動化小工具。"
    },
    {
        name: "Sarah 雅婷",
        rank: "珍珠",
        role: "教育訓練總監",
        avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop",
        location: "台中市",
        expertise: "產品研討, 新手入門SOP, 心理諮詢",
        social_link: "#",
        intro: "專注於夥伴個人成長與 15 分鐘事業簡報培訓。"
    },
    {
        name: "Alex 志豪",
        rank: "金鶴",
        role: "中區戰略組長",
        avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop",
        location: "台中市",
        expertise: "線下社群會所, 體驗行銷",
        social_link: "#",
        intro: "深耕中部健康養生市場，快速輔導夥伴升聘。"
    },
    {
        name: "Emily 淑芬",
        rank: "經理",
        role: "南區業務幹部",
        avatar: "",
        location: "高雄市",
        expertise: "產品體驗, 顧客關懷",
        social_link: "#",
        intro: "熱忱服務，建構高黏著度顧客群。"
    },
    {
        name: "David 建國",
        rank: "經理",
        role: "核心夥伴",
        avatar: "",
        location: "桃園市",
        expertise: "線上引流, 陌生開發",
        social_link: "#",
        intro: "運用社群媒體進行精準名單開發。"
    }
];

let dataTableInstance = null;
let chartRankInstance = null;
let chartLocationInstance = null;

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    // 初始化數據載入
    loadMembersData();

    // 重新整理按鈕事件 Binding
    $('#btnRefresh').on('click', function () {
        $(this).find('i').addClass('fa-spin');
        loadMembersData();
    });
});

/**
 * 載入團隊成員數據（透過 PapaParse 抓取並解耦）
 */
function loadMembersData() {
    Papa.parse(SPREADSHEET_CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            $('#btnRefresh i').removeClass('fa-spin');
            if (results.data && results.data.length > 0) {
                const sanitizedData = mapAndDecoupleData(results.data);
                renderUI(sanitizedData);
            } else {
                console.warn('Google 試算表回傳空資料，啟動預設備用資料庫。');
                renderUI(fallbackMembersData);
            }
        },
        error: function (err) {
            console.error('PapaParse 抓取失敗:', err);
            $('#btnRefresh i').removeClass('fa-spin');
            renderUI(fallbackMembersData);
        }
    });
}

/**
 * 欄位解耦適配器 (Data Decoupling Adapter)
 * 彈性搜尋欄位名稱，避免 Google 試算表欄位被改名而導致崩潰
 */
function mapAndDecoupleData(rawData) {
    return rawData.map(row => {
        const findValue = (keywords) => {
            const keys = Object.keys(row);
            for (let k of keys) {
                for (let kw of keywords) {
                    if (k.toLowerCase().includes(kw.toLowerCase())) {
                        return row[k];
                    }
                }
            }
            return '';
        };

        return {
            name: findValue(['姓名', 'Name', '成員', '夥伴']) || '未命名夥伴',
            rank: findValue(['職級', 'Rank', '階級']) || '會員',
            role: findValue(['角色', 'Role', '職務', '身份']) || '團隊夥伴',
            avatar: findValue(['頭像', 'Avatar', '照片', 'Image', 'Url']) || '',
            location: findValue(['區域', 'Location', '縣市', '駐點']) || '未設定',
            expertise: findValue(['專長', 'Expertise', '技能', '標籤']) || '健康諮詢',
            social_link: findValue(['社群', 'Social', '聯絡', 'Line', 'Link']) || '#',
            intro: findValue(['簡介', 'Intro', '格言', '備註']) || '致力於推廣健康生活與自由日常。'
        };
    });
}

/**
 * 渲染全站 UI 模組
 */
function renderUI(members) {
    updateKpiStats(members);
    renderLeadershipCards(members);
    renderDataTable(members);
    renderCharts(members);
}

/**
 * 1. 更新頂部 KPI 指標
 */
function updateKpiStats(members) {
    $('#statTotalMembers').text(members.length);

    const leaders = members.filter(m => ['藍鑽', '珍珠', '金鶴'].includes(m.rank.trim()));
    $('#statLeaders').text(leaders.length);

    const locations = new Set(members.map(m => m.location.trim()).filter(l => l && l !== '未設定'));
    $('#statLocations').text(locations.size);
}

/**
 * 2. 渲染核心領導人卡片 (Ray, Jarvis 及高階)
 */
function renderLeadershipCards(members) {
    const $grid = $('#leadershipGrid');
    $grid.empty();

    // 優先挑選創始人與藍鑽/珍珠階級
    const leaders = members.filter(m => 
        m.role.includes('創始') || m.role.includes('架構') || ['藍鑽', '珍珠'].includes(m.rank.trim())
    );

    const displayList = leaders.length > 0 ? leaders : members.slice(0, 4);

    displayList.forEach(m => {
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=1e293b&color=38bdf8&size=128`;
        const avatarUrl = m.avatar && m.avatar.startsWith('http') ? m.avatar : defaultAvatar;

        const tagsHtml = m.expertise.split(',').map(tag => 
            `<span class="tag-badge"><i class="fa-solid fa-tag"></i> ${tag.trim()}</span>`
        ).join(' ');

        const cardHtml = `
            <div class="col-12 col-sm-6 col-lg-3">
                <div class="member-card text-center p-3">
                    <div class="member-avatar-wrapper">
                        <img src="${avatarUrl}" alt="${m.name}" class="member-avatar" onerror="this.src='${defaultAvatar}'">
                        <span class="rank-badge"><i class="fa-solid fa-crown"></i> ${m.rank}</span>
                    </div>
                    <h4 class="h5 fw-bold text-light mb-1 mt-2">${m.name}</h4>
                    <p class="text-info small mb-2"><i class="fa-solid fa-user-shield"></i> ${m.role}</p>
                    <p class="text-muted small mb-3 text-truncate" title="${m.intro}">"${m.intro}"</p>
                    <div class="mb-3">
                        ${tagsHtml}
                    </div>
                    <div class="pt-2 border-top border-secondary">
                        <a href="${m.social_link}" target="_blank" class="btn btn-sm btn-outline-info w-100">
                            <i class="fa-solid fa-comments"></i> 聯繫夥伴
                        </a>
                    </div>
                </div>
            </div>
        `;
        $grid.append(cardHtml);
    });
}

/**
 * 3. 渲染全體成員 DataTable.js
 */
function renderDataTable(members) {
    if (dataTableInstance) {
        dataTableInstance.destroy();
    }

    const $tbody = $('#membersTable tbody');
    $tbody.empty();

    members.forEach(m => {
        const tags = m.expertise.split(',').map(t => 
            `<span class="badge bg-dark text-info border border-info me-1">${t.trim()}</span>`
        ).join('');

        const rowHtml = `
            <tr>
                <td class="fw-bold text-light">
                    <i class="fa-solid fa-user-circle text-info"></i> ${m.name}
                </td>
                <td>
                    <span class="badge ${getRankBadgeStyle(m.rank)}">
                        <i class="fa-solid fa-award"></i> ${m.rank}
                    </span>
                </td>
                <td class="text-muted"><i class="fa-solid fa-briefcase"></i> ${m.role}</td>
                <td><i class="fa-solid fa-location-dot text-danger"></i> ${m.location}</td>
                <td>${tags}</td>
                <td>
                    <a href="${m.social_link}" target="_blank" class="btn btn-xs btn-outline-primary btn-sm">
                        <i class="fa-solid fa-paper-plane"></i> 聯絡
                    </a>
                </td>
            </tr>
        `;
        $tbody.append(rowHtml);
    });

    // 初始化 DataTable
    dataTableInstance = $('#membersTable').DataTable({
        responsive: true,
        pageLength: 5,
        lengthMenu: [5, 10, 25, 50],
        language: {
            search: '<i class="fa-solid fa-magnifying-glass"></i> 搜尋夥伴：',
            lengthMenu: '顯示 _MENU_ 筆記錄',
            info: '顯示第 _START_ 至 _END_ 筆，共 _TOTAL_ 筆夥伴',
            infoEmpty: '無匹配成員資料',
            paginate: {
                first: '首頁',
                last: '末頁',
                next: '<i class="fa-solid fa-chevron-right"></i>',
                previous: '<i class="fa-solid fa-chevron-left"></i>'
            }
        }
    });
}

function getRankBadgeStyle(rank) {
    switch (rank.trim()) {
        case '藍鑽': return 'bg-warning text-dark fw-bold';
        case '珍珠': return 'bg-info text-dark fw-bold';
        case '金鶴': return 'bg-primary';
        case '經理': return 'bg-success';
        default: return 'bg-secondary';
    }
}

/**
 * 4. 繪製 Chart.js 視覺化圖表
 */
function renderCharts(members) {
    // A. 職級統計
    const rankCounts = {};
    members.forEach(m => {
        const r = m.rank.trim() || '其他';
        rankCounts[r] = (rankCounts[r] || 0) + 1;
    });

    const rankCtx = document.getElementById('chartRank').getContext('2d');
    if (chartRankInstance) chartRankInstance.destroy();

    chartRankInstance = new Chart(rankCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(rankCounts),
            datasets: [{
                data: Object.values(rankCounts),
                backgroundColor: ['#facc15', '#38bdf8', '#0284c7', '#10b981', '#64748b'],
                borderWidth: 2,
                borderColor: '#111d38'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#f8fafc', font: { size: 12 } }
                }
            }
        }
    });

    // B. 區域統計
    const locCounts = {};
    members.forEach(m => {
        const l = m.location.trim() || '未指定';
        locCounts[l] = (locCounts[l] || 0) + 1;
    });

    const locCtx = document.getElementById('chartLocation').getContext('2d');
    if (chartLocationInstance) chartLocationInstance.destroy();

    chartLocationInstance = new Chart(locCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(locCounts),
            datasets: [{
                label: '駐點人數',
                data: Object.values(locCounts),
                backgroundColor: '#38bdf8',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}