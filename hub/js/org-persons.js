/**
 * ============================================================================
 * 人員管理戰術中樞 (org-persons.js)
 * 模組代號：H41000 人員管理（自然人事實唯一來源 SSOT）
 * ============================================================================
 */

const SPREADSHEET_ID = {
    PSN: APP_CONFIG.SHEETS.PSN,
    ORG: APP_CONFIG.SHEETS.ORG
};

const GAS_DEPLOY_ID = {
    PSN: APP_CONFIG.GAS.PSN,
    ORG: APP_CONFIG.GAS.ORG
};

const SHEET_NAMES = {
    PERSONS: '個人主檔',
    CONTACTS: '通訊資料',
    LANGUAGES: '使用語言'
};

const DEFAULT_AVATARS = {
    '男': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    '女': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    '其他': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    '未填': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
};

// 全域自然人資料集（移除預設資料，以雲端同步為準）
let personMasterList = [];
let personContactsList = [];
let personLanguagesList = [];

let dataTableInstance = null;
let chartInstances = {};

// ============================================================================
// 1. 生命週期與初始化
// ============================================================================
// 監聽來自 common.js 發出的全域 AppReady 事件
window.addEventListener('AppReady', async function () {
    if (window.SheetAdapter) {
        SheetAdapter.init(GAS_DEPLOY_ID.PSN);
    }
    bindEvents();
    initDropdowns();
    await fetchGoogleSheetsData();
});

/**
 * 初始化下拉選單元件
 */
function initDropdowns() {
    const customRegions = personMasterList.map(p => (p.current_residence || '').trim()).filter(Boolean);

    // 頂部篩選：現居城市
    UISelectOptions.geo.populateRegionsDropdown({
        target: '#filter-current-residence',
        placeholder: '全部地區',
        customRegions: customRegions,
        creatable: false,
        searchable: true
    });

    // 表單：現居地
    UISelectOptions.geo.populateRegionsDropdown({
        target: '#form-current-residence',
        placeholder: '請選擇或輸入現居城市...',
        customRegions: customRegions,
        creatable: true,
        searchable: true,
        dropdownParent: '#personEditModal'
    });

    // 表單：家鄉
    UISelectOptions.geo.populateRegionsDropdown({
        target: '#form-hometown',
        placeholder: '請選擇或輸入家鄉城市...',
        customRegions: customRegions,
        creatable: true,
        searchable: true,
        dropdownParent: '#personEditModal'
    });
}

function bindEvents() {
    // 篩選器監聽
    $('.form-filter-control').on('change input', function () {
        renderAllViews();
    });

    $('#btn-reset-filters').on('click', function () {
        $('.form-filter-control').val('').trigger('change.select2');
        renderAllViews();
    });

    // 視圖 Tab 切換時重繪 DataTable 與 Chart.js
    $('#viewModeTabs button[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        const targetId = $(e.target).attr('data-bs-target');
        if (targetId === '#container-table-view') {
            if (dataTableInstance) {
                dataTableInstance.columns.adjust().draw(false);
            }
        } else if (targetId === '#container-charts-view') {
            renderChartsView();
        }
    });

    // 性別頭像自動聯動
    $('#form-gender').on('change', function () {
        const gender = $(this).val();
        const curUrl = $('#form-avatar-url').val().trim();
        if (!curUrl || Object.values(DEFAULT_AVATARS).includes(curUrl)) {
            $('#form-preview-avatar').attr('src', DEFAULT_AVATARS[gender] || DEFAULT_AVATARS['男']);
        }
    });

    $('#form-avatar-url').on('input', function () {
        const url = $(this).val().trim();
        const gender = $('#form-gender').val() || '男';
        $('#form-preview-avatar').attr('src', url || (DEFAULT_AVATARS[gender] || DEFAULT_AVATARS['男']));
    });

    // 存歿狀態連動身故日期
    $('#form-life-status').on('change', function () {
        if ($(this).val() === '身故') {
            $('#deceased-date-container').slideDown(200);
        } else {
            $('#deceased-date-container').slideUp(200);
            $('#form-deceased-date').val('');
        }
    });

    // 監聽個人識別碼鍵入，連動子表序號
    $('#form-person-id').on('input', function () {
        updateDynamicSubTableIds();
    });

    // 語言分析選單變更
    $('#select-lang-filter').on('change', function () {
        renderLanguageSectionCharts($(this).val(), getFilteredPersons());
    });
}

// ============================================================================
// 2. 雲端資料同步讀取 (GVIZ API - 依欄位順序)
// ============================================================================
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在讀取雲端資料庫...', '載入中...');
    try {
        const [personRows, contactRows, langRows] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSN, SHEET_NAMES.PERSONS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSN, SHEET_NAMES.CONTACTS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSN, SHEET_NAMES.LANGUAGES).catch(() => [])
        ]);

        // 解析個人主檔 (表 901)
        personMasterList = personRows.map(r => ({
            person_id: getVal(r, 0),
            name_zh: getVal(r, 1),
            name_en: getVal(r, 2),
            preferred_name: getVal(r, 3),
            display_name: getVal(r, 4),
            identity_type: getVal(r, 5, '潛在客戶'),
            usage_identity: getVal(r, 6, '消費者'),
            gender: getVal(r, 7, '未填'),
            birthday: getVal(r, 8),
            life_status: getVal(r, 9, '存活'),
            deceased_date: getVal(r, 10),
            marital_status: getVal(r, 11),
            nationality: getVal(r, 12, '中華民國'),
            ethnicity: getVal(r, 13, '華人'),
            hometown: getVal(r, 14),
            current_residence: getVal(r, 15),
            phone: getVal(r, 16),
            email: getVal(r, 17),
            contact_address: getVal(r, 18),
            met_date: getVal(r, 19),
            met_reason: getVal(r, 20),
            highest_education: getVal(r, 21),
            graduation_status: getVal(r, 22),
            graduated_school: getVal(r, 23),
            occupation_background: getVal(r, 24),
            health_status: getVal(r, 25, '待了解'),
            financial_status: getVal(r, 26, '穩定'),
            avatar_url: getVal(r, 27),
            career_education_notes: getVal(r, 28),
            health_notes: getVal(r, 29),
            financial_notes: getVal(r, 30),
            consumption_notes: getVal(r, 31)
        })).filter(p => p.person_id);

        // 解析通訊資料 (表 902)
        personContactsList = contactRows.map(r => ({
            contact_id: getVal(r, 0),
            person_id: getVal(r, 1),
            platform_name: getVal(r, 2, 'LINE'),
            category: getVal(r, 3, 'ID'),
            contact_value: getVal(r, 4),
            is_primary: getVal(r, 5, 'N'),
            notes: getVal(r, 6)
        })).filter(c => c.contact_id);

        // 解析使用語言 (表 903)
        personLanguagesList = langRows.map(r => ({
            lang_id: getVal(r, 0),
            person_id: getVal(r, 1),
            language_name: getVal(r, 2, '中文'),
            listening_level: getVal(r, 3, '普通'),
            speaking_level: getVal(r, 4, '普通'),
            reading_level: getVal(r, 5, '普通'),
            writing_level: getVal(r, 6, '普通'),
            notes: getVal(r, 7)
        })).filter(l => l.lang_id);

        initDropdowns();
        renderAllViews();
    } catch (err) {
        console.error('[org-persons] 讀取雲端試算表失敗:', err);
        AppToast.error('讀取人員主檔失敗：' + err.message);
    } finally {
        AppLoading.hide();
    }
}

// ============================================================================
// 3. 主鍵生成與子表序號連動
// ============================================================================
function generateNextPersonId() {
    if (!personMasterList || personMasterList.length === 0) return 'PSN-000001';
    const seqNumbers = personMasterList.map(p => {
        const match = String(p.person_id || '').match(/(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
    }).filter(n => !isNaN(n));
    const maxSeq = seqNumbers.length > 0 ? Math.max(...seqNumbers) : 0;
    return `PSN-${String(maxSeq + 1).padStart(6, '0')}`;
}

function updateDynamicSubTableIds() {
    const personId = $('#form-person-id').val().trim() || 'PSN-XXXX';

    // 通訊資料：${personId}-C01, ${personId}-C02...
    $('#form-contacts-dynamic-tbody tr.dynamic-contact-row').each(function (idx) {
        const seq = String(idx + 1).padStart(2, '0');
        const newContactId = `${personId}-C${seq}`;
        $(this).attr('data-contact-id', newContactId);
        $(this).find('.contact-input-id').val(newContactId);
        $(this).find('.contact-id-display').text(newContactId);
    });

    // 語言矩陣：${personId}-L01, ${personId}-L02...
    $('#form-languages-dynamic-tbody tr.dynamic-lang-row').each(function (idx) {
        const seq = String(idx + 1).padStart(2, '0');
        const newLangId = `${personId}-L${seq}`;
        $(this).attr('data-lang-id', newLangId);
        $(this).find('.lang-input-id').val(newLangId);
        $(this).find('.lang-id-display').text(newLangId);
    });
}

// ============================================================================
// 4. 篩選器與全域渲染
// ============================================================================
function getFilteredPersons() {
    const fIdentity = $('#filter-identity-type').val();
    const fUsage = $('#filter-usage-identity').val();
    const fNationality = $('#filter-nationality').val();
    const fResidence = ($('#filter-current-residence').val() || '').trim().toLowerCase();
    const fGender = $('#filter-gender').val();
    const fMarital = $('#filter-marital-status').val();
    const fEducation = $('#filter-highest-education').val();
    const fGraduation = $('#filter-graduation-status').val();
    const fHealth = $('#filter-health-status').val();
    const fFinancial = $('#filter-financial-status').val();
    const fLife = $('#filter-life-status').val();

    return personMasterList.filter(p => {
        if (fIdentity && p.identity_type !== fIdentity) return false;
        if (fUsage && p.usage_identity !== fUsage) return false;
        if (fNationality && p.nationality !== fNationality) return false;
        if (fResidence && !(p.current_residence || '').toLowerCase().includes(fResidence)) return false;
        if (fGender && p.gender !== fGender) return false;
        if (fMarital && p.marital_status !== fMarital) return false;
        if (fEducation && p.highest_education !== fEducation) return false;
        if (fGraduation && p.graduation_status !== fGraduation) return false;
        if (fHealth && p.health_status !== fHealth) return false;
        if (fFinancial && p.financial_status !== fFinancial) return false;
        if (fLife && p.life_status !== fLife) return false;
        return true;
    });
}

function renderAllViews() {
    const list = getFilteredPersons();

    // 更新 HUD 指標（數字一律靠右並調用 .toLocaleString()）
    const total = list.length;
    const operators = list.filter(p => p.usage_identity === '經營者').length;
    const crossBorder = list.filter(p => p.nationality !== '中華民國' && p.nationality !== '台灣').length;
    const prospects = list.filter(p => (p.identity_type || '').includes('潛在')).length;

    $('#hud-total-persons').text(total.toLocaleString());
    $('#hud-operator-persons').text(operators.toLocaleString());
    $('#hud-crossborder-persons').text(crossBorder.toLocaleString());
    $('#hud-prospect-persons').text(prospects.toLocaleString());

    renderCardsView(list);
    renderDataTableView(list);

    if ($('#container-charts-view').hasClass('active')) {
        renderChartsView(list);
    }
}

// ============================================================================
// 5. 視圖渲染 (Cards / DataTable / Charts)
// ============================================================================
function renderCardsView(list) {
    const $grid = $('#person-cards-grid').empty();
    if (list.length === 0) {
        $grid.html('<div class="col-12 text-center text-secondary py-5"><i class="fa-solid fa-user-slash fa-2x mb-2"></i><br>目前無相符之人員檔案</div>');
        return;
    }

    list.forEach(p => {
        const avatarUrl = p.avatar_url || (DEFAULT_AVATARS[p.gender] || DEFAULT_AVATARS['男']);
        const dispName = p.display_name || p.name_zh || p.name_en || p.preferred_name || p.person_id;
        const ageStr = AppDate.toAgeDisplay(p.birthday, '未填年齡');
        const bioText = [p.gender || '未填性別', ageStr, p.current_residence || '未填現居地'].join(' ‧ ');

        // 通訊標籤
        const contacts = personContactsList.filter(c => c.person_id === p.person_id);
        let contactsHtml = '';
        if (contacts.length > 0) {
            contacts.forEach(c => {
                contactsHtml += `<span class="badge badge-dark me-1 mb-1"><i class="fa-solid fa-comment-dots text-info me-1"></i> ${c.platform_name}：${c.contact_value}</span>`;
            });
        } else if (p.phone) {
            contactsHtml = `<span class="badge badge-dark"><i class="fa-solid fa-phone text-warning me-1"></i> ${p.phone}</span>`;
        } else {
            contactsHtml = '<span class="text-secondary small">無其他通訊管道</span>';
        }

        const cardHtml = `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="person-card">
                    <div class="d-flex align-items-start justify-content-between mb-3">
                        <div class="d-flex align-items-center gap-3">
                            <div class="person-avatar-wrap">
                                <img src="${avatarUrl}" class="person-avatar" alt="${dispName}">
                            </div>
                            <div>
                                <div class="d-flex align-items-center gap-2">
                                    <h6 class="mb-0 fw-bold text-white fs-5">${dispName}</h6>
                                    <span class="badge bg-secondary" style="font-size: 0.65rem;">${p.nationality || '未填'}</span>
                                </div>
                                <div class="d-flex flex-wrap align-items-center gap-1 mt-1">
                                    ${UIBadges.person.identityType(p.identity_type)}
                                    ${UIBadges.person.usageIdentity(p.usage_identity)}
                                    ${p.life_status === '身故' ? '<span class="badge bg-danger">身故</span>' : ''}
                                </div>
                            </div>
                        </div>
                        <div class="btn-group btn-group-sm">
                            <button type="button" class="btn btn-outline-info py-1 px-2" onclick="openPersonModalForView('${p.person_id}')" title="檢視檔案"><i class="fa-solid fa-magnifying-glass"></i></button>
                            <button type="button" class="btn btn-outline-secondary py-1 px-2" onclick="openPersonModalForEdit('${p.person_id}')" title="編輯主檔"><i class="fa-solid fa-pen-to-square"></i></button>
                        </div>
                    </div>

                    <div class="p-2 rounded-3 bg-black bg-opacity-30 border border-secondary border-opacity-10 mb-3 small">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="text-secondary"><i class="fa-solid fa-id-card-clip text-primary me-1"></i> 人本概況</span>
                            <span class="text-light">${bioText}</span>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="text-secondary"><i class="fa-solid fa-graduation-cap text-warning me-1"></i> 學歷職業</span>
                            <span class="text-light">${p.highest_education || '-'}${p.graduation_status ? ` (${p.graduation_status})` : ''} ‧ ${p.occupation_background || '-'}</span>
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="text-secondary"><i class="fa-solid fa-heart-pulse text-danger me-1"></i> 健康 / 財務</span>
                            <span>
                                ${UIBadges.person.healthStatus(p.health_status)}
                                ${UIBadges.person.financialStatus(p.financial_status)}
                            </span>
                        </div>
                    </div>

                    <div class="mb-3">
                        ${contactsHtml}
                    </div>

                    <div class="mt-auto pt-2 border-top border-secondary border-opacity-25 d-flex justify-content-between align-items-center text-secondary small">
                        <span><i class="fa-solid fa-handshake me-1"></i> 認識：${p.met_date || '未記錄'}</span>
                        <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-3 py-0" onclick="openPersonModalForView('${p.person_id}')">調閱</button>
                    </div>
                </div>
            </div>
        `;
        $grid.append(cardHtml);
    });
}

/**
 * 格式化單一人員資料列物件
 */
function formatPersonTableRow(p) {
    const avatarUrl = p.avatar_url || (DEFAULT_AVATARS[p.gender] || DEFAULT_AVATARS['男']);
    const dispName = p.display_name || p.name_zh || p.name_en || p.preferred_name || p.person_id;
    const ageStr = AppDate.toAgeDisplay(p.birthday, '');
    const genderAge = `${p.gender || '未填'} ${ageStr ? `(${ageStr})` : ''}`;
    const eduStatus = `${p.highest_education || '-'}${p.graduation_status ? ` / ${p.graduation_status}` : ''}`;

    return {
        member: `
            <div class="d-flex align-items-center gap-2">
                <img src="${avatarUrl}" class="rounded-circle border border-primary border-opacity-50" width="32" height="32" alt="${dispName}">
                <div>
                    <div class="fw-bold text-white">${dispName}</div>
                    <small class="text-secondary">${p.person_id}</small>
                </div>
            </div>
        `,
        nationality: `<span class="badge bg-secondary">${p.nationality || '未填'}</span>`,
        identities: `
            ${UIBadges.person.identityType(p.identity_type)}
            ${UIBadges.person.usageIdentity(p.usage_identity)}
        `,
        gender_age: genderAge,
        residence: p.current_residence || '-',
        education: eduStatus,
        occupation: p.occupation_background || '-',
        health: UIBadges.person.healthStatus(p.health_status),
        financial: UIBadges.person.financialStatus(p.financial_status),
        met_info: `<small class="text-secondary">${AppDate.toDisplay(p.met_date, '-')}</small><div class="text-truncate small" style="max-width: 140px;">${p.met_reason || '-'}</div>`,
        actions: `
            <div class="d-flex align-items-center justify-content-end gap-1">
                <button type="button" class="btn btn-sm btn-outline-info py-1 px-2" onclick="openPersonModalForView('${p.person_id}')" title="檢視"><i class="fa-solid fa-magnifying-glass"></i></button>
                <button type="button" class="btn btn-sm btn-outline-secondary py-1 px-2" onclick="openPersonModalForEdit('${p.person_id}')" title="編輯"><i class="fa-solid fa-pen-to-square"></i></button>
            </div>
        `
    };
}

/**
 * 渲染人員清冊 DataTable (物件模式)
 */
function renderDataTableView(list) {
    const formatted = list.map(p => formatPersonTableRow(p));

    if (dataTableInstance) {
        dataTableInstance.clear().rows.add(formatted).draw();
    } else {
        dataTableInstance = $('#persons-datatable').DataTable({
            data: formatted,
            columns: [
                { data: 'member' },
                { data: 'nationality', className: 'text-center' },
                { data: 'identities' },
                { data: 'gender_age' },
                { data: 'residence' },
                { data: 'education' },
                { data: 'occupation' },
                { data: 'health', className: 'text-center' },
                { data: 'financial', className: 'text-center' },
                { data: 'met_info' },
                { data: 'actions', className: 'text-end', orderable: false }
            ]
        });
    }
}

// ============================================================================
// 6. 圖表分析 (Chart.js 引擎) - 懸停百分比與數值標準化
// ============================================================================
const getPieTooltipOptions = () => ({
    plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {
            callbacks: {
                label: function (context) {
                    const label = context.label || '';
                    const val = Number(context.parsed) || 0;
                    const dataset = context.chart.data.datasets[context.datasetIndex];
                    const total = dataset.data.reduce((acc, cur) => acc + Number(cur), 0);
                    const percentage = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                    return ` ${label}：${val.toLocaleString()} 人 (${percentage}%)`;
                }
            }
        }
    }
});

function renderLanguageSectionCharts(targetLang, dataset) {
    const langChartKeys = ['langListening', 'langSpeaking', 'langReading', 'langWriting'];
    langChartKeys.forEach(k => {
        if (chartInstances[k]) {
            chartInstances[k].destroy();
            delete chartInstances[k];
        }
    });

    const activePersonIds = new Set(dataset.map(p => p.person_id));
    const langRecords = personLanguagesList.filter(l =>
        l.language_name === targetLang && activePersonIds.has(l.person_id)
    );

    const levels = ['精通', '流利', '普通', '略懂', '不會'];
    const levelColors = ['#10b981', '#38bdf8', '#fbbf24', '#f97316', '#64748b'];

    const countProficiency = (levelKey) => {
        const counts = { '精通': 0, '流利': 0, '普通': 0, '略懂': 0, '不會': 0 };
        langRecords.forEach(r => {
            const val = r[levelKey] || '普通';
            if (counts[val] !== undefined) counts[val]++;
            else counts['普通']++;
        });
        return levels.map(l => counts[l]);
    };

    const dimensions = [
        { id: 'chart-lang-listening', key: 'langListening', field: 'listening_level' },
        { id: 'chart-lang-speaking', key: 'langSpeaking', field: 'speaking_level' },
        { id: 'chart-lang-reading', key: 'langReading', field: 'reading_level' },
        { id: 'chart-lang-writing', key: 'langWriting', field: 'writing_level' }
    ];

    dimensions.forEach(dim => {
        const ctx = document.getElementById(dim.id);
        if (ctx) {
            chartInstances[dim.key] = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: levels,
                    datasets: [{
                        data: countProficiency(dim.field),
                        backgroundColor: levelColors,
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    ...getPieTooltipOptions()
                }
            });
        }
    });
}

function renderChartsView(filteredDataset = null) {
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};

    const dataset = filteredDataset || getFilteredPersons();
    const curLang = $('#select-lang-filter').val() || '中文';
    renderLanguageSectionCharts(curLang, dataset);

    const createCountMap = (key, defaultKeys = []) => {
        const map = {};
        defaultKeys.forEach(k => { map[k] = 0; });
        dataset.forEach(p => {
            const val = (p[key] && String(p[key]).trim() !== '') ? String(p[key]).trim() : '未設定';
            map[val] = (map[val] || 0) + 1;
        });
        return map;
    };

    // 1. 身份類型
    const idMap = createCountMap('identity_type', ['夥伴', '團隊成員', '潛在團隊成員', '客戶', '潛在客戶', '親友家屬']);
    const ctxId = document.getElementById('chart-identity-type');
    if (ctxId) {
        chartInstances.idType = new Chart(ctxId, {
            type: 'pie',
            data: { labels: Object.keys(idMap), datasets: [{ data: Object.values(idMap), backgroundColor: ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#fbbf24', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 2. 使用身份
    const usageMap = createCountMap('usage_identity', ['經營者', '消費者']);
    const ctxUsage = document.getElementById('chart-usage-identity');
    if (ctxUsage) {
        chartInstances.usageId = new Chart(ctxUsage, {
            type: 'pie',
            data: { labels: Object.keys(usageMap), datasets: [{ data: Object.values(usageMap), backgroundColor: ['#a855f7', '#38bdf8'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 3. 年齡層級
    const ageCategories = ['17歲以下', '18-29歲', '30-39歲', '40-49歲', '50-59歲', '60-69歲', '70歲以上'];
    const ageCounts = {};
    ageCategories.forEach(c => { ageCounts[c] = 0; });
    dataset.forEach(p => {
        const age = AppDate.calculateAge(p.birthday);
        if (age !== null) {
            if (age <= 17) ageCounts['17歲以下']++;
            else if (age <= 29) ageCounts['18-29歲']++;
            else if (age <= 39) ageCounts['30-39歲']++;
            else if (age <= 49) ageCounts['40-49歲']++;
            else if (age <= 59) ageCounts['50-59歲']++;
            else if (age <= 69) ageCounts['60-69歲']++;
            else ageCounts['70歲以上']++;
        }
    });
    const ctxAge = document.getElementById('chart-age-distribution');
    if (ctxAge) {
        chartInstances.age = new Chart(ctxAge, {
            type: 'pie',
            data: { labels: ageCategories, datasets: [{ data: ageCategories.map(c => ageCounts[c]), backgroundColor: ['#38bdf8', '#34d399', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 4. 生理性別
    const genderMap = createCountMap('gender', ['男', '女', '其他', '未填']);
    const ctxGender = document.getElementById('chart-gender-split');
    if (ctxGender) {
        chartInstances.gender = new Chart(ctxGender, {
            type: 'pie',
            data: { labels: Object.keys(genderMap), datasets: [{ data: Object.values(genderMap), backgroundColor: ['#38bdf8', '#f472b6', '#a78bfa', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 5. 國籍
    const natMap = createCountMap('nationality');
    const ctxNat = document.getElementById('chart-nationality-split');
    if (ctxNat) {
        chartInstances.nat = new Chart(ctxNat, {
            type: 'pie',
            data: { labels: Object.keys(natMap), datasets: [{ data: Object.values(natMap), backgroundColor: ['#38bdf8', '#fbbf24', '#10b981', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 6. 種族
    const ethMap = createCountMap('ethnicity');
    const ctxEth = document.getElementById('chart-ethnicity-split');
    if (ctxEth) {
        chartInstances.eth = new Chart(ctxEth, {
            type: 'pie',
            data: { labels: Object.keys(ethMap), datasets: [{ data: Object.values(ethMap), backgroundColor: ['#8b5cf6', '#38bdf8', '#f59e0b', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 7. 家鄉城市
    const homeMap = createCountMap('hometown');
    const ctxHome = document.getElementById('chart-hometown-split');
    if (ctxHome) {
        chartInstances.home = new Chart(ctxHome, {
            type: 'pie',
            data: { labels: Object.keys(homeMap), datasets: [{ data: Object.values(homeMap), backgroundColor: ['#10b981', '#38bdf8', '#a855f7', '#fbbf24', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 8. 現居城市
    const resMap = createCountMap('current_residence');
    const ctxRes = document.getElementById('chart-residence-split');
    if (ctxRes) {
        chartInstances.res = new Chart(ctxRes, {
            type: 'pie',
            data: { labels: Object.keys(resMap), datasets: [{ data: Object.values(resMap), backgroundColor: ['#06b6d4', '#f97316', '#3b82f6', '#ec4899', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 9. 認識年份
    const metMap = {};
    dataset.forEach(p => {
        const y = (p.met_date && p.met_date.length >= 4) ? p.met_date.substring(0, 4) + '年' : '未記錄';
        metMap[y] = (metMap[y] || 0) + 1;
    });
    const ctxMet = document.getElementById('chart-met-year-split');
    if (ctxMet) {
        chartInstances.met = new Chart(ctxMet, {
            type: 'pie',
            data: { labels: Object.keys(metMap), datasets: [{ data: Object.values(metMap), backgroundColor: ['#10b981', '#38bdf8', '#fbbf24', '#ec4899', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 10. 最高學歷
    const eduMap = createCountMap('highest_education', ['博士', '碩士', '學士', '副學士', '高中職', '國中', '國小']);
    const ctxEdu = document.getElementById('chart-education-distribution');
    if (ctxEdu) {
        chartInstances.edu = new Chart(ctxEdu, {
            type: 'pie',
            data: { labels: Object.keys(eduMap), datasets: [{ data: Object.values(eduMap), backgroundColor: ['#8b5cf6', '#0284c7', '#38bdf8', '#34d399', '#fbbf24', '#f97316', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 11. 健康狀況
    const healthMap = createCountMap('health_status', ['良好', '亞健康', '慢性體質', '調養中', '罹患疾病', '待了解']);
    const ctxHealth = document.getElementById('chart-health-status-split');
    if (ctxHealth) {
        chartInstances.health = new Chart(ctxHealth, {
            type: 'pie',
            data: { labels: Object.keys(healthMap), datasets: [{ data: Object.values(healthMap), backgroundColor: ['#10b981', '#fbbf24', '#f97316', '#38bdf8', '#ef4444', '#64748b'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }

    // 12. 財務狀況
    const finMap = createCountMap('financial_status', ['寬裕', '穩定', '吃緊', '高負債', '尋找副業']);
    const ctxFin = document.getElementById('chart-financial-status-split');
    if (ctxFin) {
        chartInstances.fin = new Chart(ctxFin, {
            type: 'pie',
            data: { labels: Object.keys(finMap), datasets: [{ data: Object.values(finMap), backgroundColor: ['#10b981', '#38bdf8', '#fbbf24', '#ef4444', '#c084fc'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, ...getPieTooltipOptions() }
        });
    }
}

// ============================================================================
// 7. 動態子表格操作 (通訊管道與跨國語言)
// ============================================================================
function addContactTableRow(contact = {}) {
    const $tbody = $('#form-contacts-dynamic-tbody');
    const platforms = ['LINE', 'WhatsApp', 'Discord', 'Facebook', 'Instagram', 'WeChat', 'Telegram', '行動電話'];
    const pOptions = platforms.map(p => `<option value="${p}" ${p === (contact.platform_name || 'LINE') ? 'selected' : ''}>${p}</option>`).join('');

    const $row =$(`
        <tr class="dynamic-contact-row">
            <td>
                <span class="contact-id-display small text-secondary">${contact.contact_id || '自動配發'}</span>
                <input type="hidden" class="contact-input-id" value="${contact.contact_id || ''}">
            </td>
            <td><select class="form-select form-select-sm contact-input-platform">${pOptions}</select></td>
            <td>
                <select class="form-select form-select-sm contact-input-category">
                    <option value="ID" ${contact.category === 'ID' ? 'selected' : ''}>ID</option>
                    <option value="顯示名稱" ${contact.category === '顯示名稱' ? 'selected' : ''}>顯示名稱</option>
                    <option value="連結" ${contact.category === '連結' ? 'selected' : ''}>連結</option>
                </select>
            </td>
            <td><input type="text" class="form-control form-control-sm contact-input-value" value="${contact.contact_value || ''}" placeholder="帳號 / 連結..."></td>
            <td>
                <select class="form-select form-select-sm contact-input-primary">
                    <option value="N" ${contact.is_primary !== 'Y' ? 'selected' : ''}>N</option>
                    <option value="Y" ${contact.is_primary === 'Y' ? 'selected' : ''}>Y (主要)</option>
                </select>
            </td>
            <td><input type="text" class="form-control form-control-sm contact-input-notes" value="${contact.notes || ''}" placeholder="備註..."></td>
            <td class="text-center">
                <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 btn-remove-row" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>
    `);

    $row.find('.btn-remove-row').on('click', function () {$row.remove();
        updateDynamicSubTableIds();
    });
    $tbody.append($row);
    updateDynamicSubTableIds();
}

function addLanguageTableRow(lang = {}) {
    const $tbody =$('#form-languages-dynamic-tbody');
    const langs = ['中文', '英文', '馬來文', '台語', '粵語', '客家話', '日文', '韓文', '印尼文', '泰文', '越南文'];
    const lOptions = langs.map(l => `<option value="${l}" ${l === (lang.language_name || '中文') ? 'selected' : ''}>${l}</option>`).join('');

    const levels = ['精通', '流利', '普通', '略懂', '不會'];
    const buildLevelOptions = (selectedVal) => levels.map(lv => `<option value="${lv}" ${lv === (selectedVal || '普通') ? 'selected' : ''}>${lv}</option>`).join('');

    const $row =$(`
        <tr class="dynamic-lang-row">
            <td>
                <span class="lang-id-display small text-secondary">${lang.lang_id || '自動配發'}</span>
                <input type="hidden" class="lang-input-id" value="${lang.lang_id || ''}">
            </td>
            <td><select class="form-select form-select-sm lang-input-name">${lOptions}</select></td>
            <td><select class="form-select form-select-sm lang-input-listening">${buildLevelOptions(lang.listening_level)}</select></td>
            <td><select class="form-select form-select-sm lang-input-speaking">${buildLevelOptions(lang.speaking_level)}</select></td>
            <td><select class="form-select form-select-sm lang-input-reading">${buildLevelOptions(lang.reading_level)}</select></td>
            <td><select class="form-select form-select-sm lang-input-writing">${buildLevelOptions(lang.writing_level)}</select></td>
            <td><input type="text" class="form-control form-control-sm lang-input-notes" value="${lang.notes || ''}" placeholder="特殊備註..."></td>
            <td class="text-center">
                <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 btn-remove-row" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>
    `);

    $row.find('.btn-remove-row').on('click', function () {$row.remove();
        updateDynamicSubTableIds();
    });
    $tbody.append($row);
    updateDynamicSubTableIds();
}

// ============================================================================
// 8. 彈窗控制器 (View / Edit / Create)
// ============================================================================
function openPersonModalForCreate() {
    $('#personModalTitle').html('<i class="fa-solid fa-user-plus text-primary me-1"></i> 新增人員主檔');
    $('#form-mode').val('CREATE');
    $('#personForm')[0].reset();

    const newId = generateNextPersonId();
    $('#form-person-id').val(newId);

    $('#form-gender').val('男');
    $('#form-preview-avatar').attr('src', DEFAULT_AVATARS['男']);
    $('#form-life-status').val('存活').trigger('change');
    $('#form-contacts-dynamic-tbody').empty();
    $('#form-languages-dynamic-tbody').empty();

    initDropdowns();
    $('#personEditTabs button:first').tab('show');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('personEditModal')).show();
}

function openPersonModalForEdit(personId) {
    const person = personMasterList.find(p => p.person_id === personId);
    if (!person) {
        AppToast.warning(`找不到人員識別碼【${personId}】的資料`);
        return;
    }

    $('#personModalTitle').html(`<i class="fa-solid fa-user-gear text-primary me-1"></i> 編輯檔案 - ${person.name_zh || person.preferred_name || person.person_id}`);
    $('#form-mode').val('UPDATE');

    $('#form-person-id').val(person.person_id);
    $('#form-name-zh').val(person.name_zh || '');
    $('#form-name-en').val(person.name_en || '');
    $('#form-preferred-name').val(person.preferred_name || '');
    $('#form-display-name').val(person.display_name || '');
    $('#form-identity-type').val(person.identity_type || '潛在客戶');
    $('#form-usage-identity').val(person.usage_identity || '消費者');
    $('#form-gender').val(person.gender || '男');
    $('#form-birthday').val(AppDate.toInput(person.birthday));
    $('#form-nationality').val(person.nationality || '中華民國');
    $('#form-ethnicity').val(person.ethnicity || '華人');
    $('#form-marital-status').val(person.marital_status || '');
    $('#form-life-status').val(person.life_status || '存活').trigger('change');
    $('#form-deceased-date').val(AppDate.toInput(person.deceased_date));
    $('#form-health-status').val(person.health_status || '良好');
    $('#form-financial-status').val(person.financial_status || '穩定');

    $('#form-hometown').val(person.hometown || '').trigger('change.select2');
    $('#form-current-residence').val(person.current_residence || '').trigger('change.select2');
    $('#form-contact-address').val(person.contact_address || '');
    $('#form-met-date').val(AppDate.toInput(person.met_date));
    $('#form-met-reason').val(person.met_reason || '');

    $('#form-phone').val(person.phone || '');
    $('#form-email').val(person.email || '');

    const avatar = person.avatar_url || '';
    $('#form-avatar-url').val(avatar);
    $('#form-preview-avatar').attr('src', avatar || (DEFAULT_AVATARS[person.gender] || DEFAULT_AVATARS['男']));

    // 通訊子表
    $('#form-contacts-dynamic-tbody').empty();
    const contacts = personContactsList.filter(c => c.person_id === personId);
    contacts.forEach(c => addContactTableRow(c));

    // 語言子表
    $('#form-languages-dynamic-tbody').empty();
    const langs = personLanguagesList.filter(l => l.person_id === personId);
    langs.forEach(l => addLanguageTableRow(l));

    $('#form-highest-education').val(person.highest_education || '');
    $('#form-graduation-status').val(person.graduation_status || '');
    $('#form-graduated-school').val(person.graduated_school || '');
    $('#form-occupation-background').val(person.occupation_background || '');

    $('#form-career-education-notes').val(person.career_education_notes || '');
    $('#form-health-notes').val(person.health_notes || '');
    $('#form-financial-notes').val(person.financial_notes || '');
    $('#form-consumption-notes').val(person.consumption_notes || '');

    $('#personEditTabs button:first').tab('show');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('personEditModal')).show();
}

function openPersonModalForView(personId) {
    const person = personMasterList.find(p => p.person_id === personId);
    if (!person) {
        AppToast.warning(`查無該人員檔案【${personId}】`);
        return;
    }

    const dispName = person.display_name || person.name_zh || person.name_en || person.preferred_name || person.person_id;
    const avatarUrl = person.avatar_url || (DEFAULT_AVATARS[person.gender] || DEFAULT_AVATARS['男']);

    $('#view-header-id').text(`[${person.person_id}]`);
    $('#view-avatar').attr('src', avatarUrl);
    $('#view-name-title').text(dispName);
    $('#view-country-badge').html(UIBadges.common.country(person.nationality));
    $('#view-identity-badge').html(UIBadges.person.identityType(person.identity_type));
    $('#view-usage-badge').html(UIBadges.person.usageIdentity(person.usage_identity));

    $('#view-name-zh').text(person.name_zh || '-');
    $('#view-name-en').text(person.name_en || '-');
    $('#view-name-pref').text(person.preferred_name || '-');
    $('#view-name-display').text(person.display_name || '-');

    $('#view-person-id').text(person.person_id);
    const ageStr = AppDate.toAgeDisplay(person.birthday, '');
    const birthdayDisplay = AppDate.toDisplay(person.birthday, '未填生日');
    $('#view-gender-age').text(`${person.gender || '未填'} ‧ ${birthdayDisplay} ${ageStr ? `(${ageStr})` : ''}`);
    $('#view-nationality-ethnicity').text(`${person.nationality || '中華民國'} ‧ ${person.ethnicity || '華人'}`);
    $('#view-marital-status').text(person.marital_status || '未填寫');
    $('#view-life-status').html(person.life_status === '身故' ? '<span class="badge bg-danger">身故</span>' : '<span class="badge bg-success">存活</span>');
    $('#view-residence').text(`${person.hometown ? `${person.hometown} → ` : ''}${person.current_residence || '未設定'}`);

    $('#view-met-date').text(AppDate.toDisplay(person.met_date, '-'));
    $('#view-met-reason').text(person.met_reason || '未填寫');
    $('#view-education-status').text(`${person.highest_education || '未填寫'}${person.graduation_status ? ` (${person.graduation_status})` : ''}`);
    $('#view-school').text(person.graduated_school || '未填寫');
    $('#view-occupation').text(person.occupation_background || '未填寫');
    $('#view-address').text(person.contact_address || '未填寫');

    $('#view-phone').html(person.phone ? `<a href="tel:${person.phone}" class="text-info text-decoration-none">${person.phone}</a>` : '-');
    $('#view-email').html(person.email ? `<a href="mailto:${person.email}" class="text-info text-decoration-none">${person.email}</a>` : '-');

    // 通訊管道
    const $cWrap =$('#view-contacts-wrap').empty();
    const contacts = personContactsList.filter(c => c.person_id === personId);
    if (contacts.length > 0) {
        contacts.forEach(c => {
            const isPrim = c.is_primary === 'Y' ? '<span class="badge bg-success ms-1" style="font-size:0.65rem;">主要</span>' : '';
            $cWrap.append(`
                <div class="d-flex justify-content-between py-1 border-bottom border-secondary border-opacity-10">
                    <span class="text-secondary"><i class="fa-solid fa-comment-dots text-primary me-1"></i> ${c.platform_name}${isPrim}</span>
                    <span class="text-white">${c.contact_value}</span>
                </div>
            `);
        });
    } else {
        $cWrap.append('<span class="text-secondary">暫無通訊管道資料</span>');
    }

    // 語言矩陣
    const $lWrap =$('#view-languages-wrap').empty();
    const langs = personLanguagesList.filter(l => l.person_id === personId);
    if (langs.length > 0) {
        langs.forEach(l => {
            $lWrap.append(`
                <div class="p-2 bg-black bg-opacity-30 rounded border border-secondary border-opacity-10">
                    <div class="d-flex justify-content-between mb-1">
                        <strong class="text-white">${l.language_name}</strong>
                        <small class="text-secondary">${l.notes || ''}</small>
                    </div>
                    <div class="d-flex gap-2 text-secondary" style="font-size:0.75rem;">
                        <span>聽：${UIBadges.person.languageProficiency(l.listening_level)}</span>
                        <span>說：${UIBadges.person.languageProficiency(l.speaking_level)}</span>
                        <span>讀：${UIBadges.person.languageProficiency(l.reading_level)}</span>
                        <span>寫：${UIBadges.person.languageProficiency(l.writing_level)}</span>
                    </div>
                </div>
            `);
        });
    } else {
        $lWrap.append('<span class="text-secondary">暫無語言評級紀錄</span>');
    }

    $('#view-career-notes').text(person.career_education_notes || '暫無學經歷備註。');
    $('#view-health-notes').text(person.health_notes || '暫無健康備註。');
    $('#view-financial-notes').text(person.financial_notes || '暫無財務備註。');
    $('#view-consumption-notes').text(person.consumption_notes || '暫無消費備註。');

    $('#btn-view-to-edit').off('click').on('click', function () {
        bootstrap.Modal.getInstance(document.getElementById('personViewModal'))?.hide();
        setTimeout(() => { openPersonModalForEdit(personId); }, 250);
    });

    bootstrap.Modal.getOrCreateInstance(document.getElementById('personViewModal')).show();
}

// ============================================================================
// 9. 儲存與記憶體樂觀更新（C/U/D 不呼叫 fetchGoogleSheetsData）
// ============================================================================
async function savePersonRecord() {
    const nameZh = $('#form-name-zh').val().trim();
    const nameEn = $('#form-name-en').val().trim();
    const preferredName = $('#form-preferred-name').val().trim();

    if (!nameZh && !nameEn && !preferredName) {
        AppToast.warning('「中文姓名」、「英文姓名」、「常用稱呼」請至少填寫一項！');
        $('#tab-btn-person').tab('show');
        $('#form-name-zh').focus();
        return;
    }

    const mode = $('#form-mode').val();
    let personId = $('#form-person-id').val().trim();

    if (mode === 'CREATE') {
        personId = generateNextPersonId();
        $('#form-person-id').val(personId);
    }

    updateDynamicSubTableIds();

    const currentUser = getCurrentUser();
    const nowStr = AppDate.now('full');

    const updatedPerson = {
        person_id: personId,
        name_zh: nameZh,
        name_en: nameEn,
        preferred_name: preferredName,
        display_name: $('#form-display-name').val().trim(),
        identity_type: $('#form-identity-type').val(),
        usage_identity: $('#form-usage-identity').val(),
        gender: $('#form-gender').val(),
        birthday: AppDate.toSheet($('#form-birthday').val().trim()),
        life_status: $('#form-life-status').val(),
        deceased_date: AppDate.toSheet($('#form-deceased-date').val()),
        marital_status: $('#form-marital-status').val(),
        nationality: $('#form-nationality').val().trim(),
        ethnicity: $('#form-ethnicity').val().trim(),
        hometown: $('#form-hometown').val().trim(),
        current_residence: $('#form-current-residence').val().trim(),
        phone: $('#form-phone').val().trim(),
        email: $('#form-email').val().trim(),
        contact_address: $('#form-contact-address').val().trim(),
        met_date: AppDate.toSheet($('#form-met-date').val()),
        met_reason: $('#form-met-reason').val().trim(),
        highest_education: $('#form-highest-education').val(),
        graduation_status: $('#form-graduation-status').val(),
        graduated_school: $('#form-graduated-school').val().trim(),
        occupation_background: $('#form-occupation-background').val().trim(),
        health_status: $('#form-health-status').val(),
        financial_status: $('#form-financial-status').val(),
        avatar_url: $('#form-avatar-url').val().trim(),
        career_education_notes: $('#form-career-education-notes').val().trim(),
        health_notes: $('#form-health-notes').val().trim(),
        financial_notes: $('#form-financial-notes').val().trim(),
        consumption_notes: $('#form-consumption-notes').val().trim()
    };

    // 收集動態通訊
    const newContacts = [];
    const contactRowsForSheet = [];
    $('#form-contacts-dynamic-tbody tr.dynamic-contact-row').each(function (idx) {
        const val = $(this).find('.contact-input-value').val().trim();
        if (val) {
            const seq = String(idx + 1).padStart(2, '0');
            const contactId = `${personId}-C${seq}`;
            const platform = $(this).find('.contact-input-platform').val();
            const category = $(this).find('.contact-input-category').val();
            const isPrimary = $(this).find('.contact-input-primary').val();
            const notes = $(this).find('.contact-input-notes').val().trim();

            newContacts.push({
                contact_id: contactId, person_id: personId, platform_name: platform,
                category: category, contact_value: val, is_primary: isPrimary, notes: notes
            });

            contactRowsForSheet.push([
                contactId, personId, platform, category, val, isPrimary, notes,
                currentUser, nowStr, currentUser, nowStr
            ]);
        }
    });

    // 收集動態語言
    const newLanguages = [];
    const langRowsForSheet = [];
    $('#form-languages-dynamic-tbody tr.dynamic-lang-row').each(function (idx) {
        const langName = $(this).find('.lang-input-name').val();
        if (langName) {
            const seq = String(idx + 1).padStart(2, '0');
            const langId = `${personId}-L${seq}`;
            const listening = $(this).find('.lang-input-listening').val();
            const speaking = $(this).find('.lang-input-speaking').val();
            const reading = $(this).find('.lang-input-reading').val();
            const writing = $(this).find('.lang-input-writing').val();
            const notes = $(this).find('.lang-input-notes').val().trim();

            newLanguages.push({
                lang_id: langId, person_id: personId, language_name: langName,
                listening_level: listening, speaking_level: speaking,
                reading_level: reading, writing_level: writing, notes: notes
            });

            langRowsForSheet.push([
                langId, personId, langName, listening, speaking, reading, writing, notes,
                currentUser, nowStr, currentUser, nowStr
            ]);
        }
    });

    // 組裝試算表欄位陣列 (36 欄完整對齊 Schema)
    const personRowArray = [
        updatedPerson.person_id, updatedPerson.name_zh, updatedPerson.name_en, updatedPerson.preferred_name,
        updatedPerson.display_name, updatedPerson.identity_type, updatedPerson.usage_identity, updatedPerson.gender,
        updatedPerson.birthday, updatedPerson.life_status, updatedPerson.deceased_date, updatedPerson.marital_status, // 修正：life_status 在前、deceased_date 在後
        updatedPerson.nationality, updatedPerson.ethnicity, updatedPerson.hometown, updatedPerson.current_residence,
        updatedPerson.phone, updatedPerson.email, updatedPerson.contact_address, updatedPerson.met_date,
        updatedPerson.met_reason, updatedPerson.highest_education, updatedPerson.graduation_status, updatedPerson.graduated_school, // 修正：graduation_status 在前、graduated_school 在後
        updatedPerson.occupation_background, updatedPerson.health_status, updatedPerson.financial_status, updatedPerson.avatar_url,
        updatedPerson.career_education_notes, updatedPerson.health_notes, updatedPerson.financial_notes, updatedPerson.consumption_notes,
        currentUser, nowStr, currentUser, nowStr
    ];

    try {
        AppLoading.show('<i class="fa-solid fa-floppy-disk text-primary"></i> 正在寫入人員主檔與通訊資料...', '儲存中...');
        const silentOpt = { silent: true };

        // 1. 清理舊有通訊與語言子表
        const deletePromises = [];
        personContactsList.filter(c => c.person_id === personId).forEach(c => {
            if (c.contact_id) deletePromises.push(SheetAdapter.deleteRow(SHEET_NAMES.CONTACTS, c.contact_id, GAS_DEPLOY_ID.PSN, silentOpt).catch(() => {}));
        });
        personLanguagesList.filter(l => l.person_id === personId).forEach(l => {
            if (l.lang_id) deletePromises.push(SheetAdapter.deleteRow(SHEET_NAMES.LANGUAGES, l.lang_id, GAS_DEPLOY_ID.PSN, silentOpt).catch(() => {}));
        });
        if (deletePromises.length > 0) await Promise.all(deletePromises);

        // 2. 寫入個人主檔
        if (mode === 'CREATE') {
            await SheetAdapter.createRow(SHEET_NAMES.PERSONS, personId, personRowArray, GAS_DEPLOY_ID.PSN, silentOpt);
        } else {
            await SheetAdapter.updateRow(SHEET_NAMES.PERSONS, personId, personRowArray, GAS_DEPLOY_ID.PSN, silentOpt);
        }

        // 3. 批次寫入新通訊與語言子表
        const subTableWrites = [];
        contactRowsForSheet.forEach(nc => subTableWrites.push(SheetAdapter.createRow(SHEET_NAMES.CONTACTS, nc[0], nc, GAS_DEPLOY_ID.PSN, silentOpt)));
        langRowsForSheet.forEach(nl => subTableWrites.push(SheetAdapter.createRow(SHEET_NAMES.LANGUAGES, nl[0], nl, GAS_DEPLOY_ID.PSN, silentOpt)));
        if (subTableWrites.length > 0) await Promise.all(subTableWrites);

        // 4. 前端記憶體樂觀更新
        const pIdx = personMasterList.findIndex(p => p.person_id === personId);
        if (pIdx >= 0) {
            personMasterList[pIdx] = updatedPerson;
        } else {
            personMasterList.unshift(updatedPerson);
        }

        personContactsList = personContactsList.filter(c => c.person_id !== personId).concat(newContacts);
        personLanguagesList = personLanguagesList.filter(l => l.person_id !== personId).concat(newLanguages);

        bootstrap.Modal.getInstance(document.getElementById('personEditModal'))?.hide();
        renderAllViews();
        AppToast.success(`人員【${updatedPerson.name_zh || updatedPerson.preferred_name || personId}】檔案已成功儲存！`);
    } catch (err) {
        console.error('儲存人員失敗:', err);
        AppToast.error('儲存失敗: ' + err.message);
    } finally {
        AppLoading.hide();
    }
}