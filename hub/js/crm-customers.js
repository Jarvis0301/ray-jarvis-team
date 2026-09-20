/**
 * ============================================================================
 * 榮祥團隊戰術控制台 - 客戶名簿與轉化歷程中樞 (crm-customers.js)
 * 規格依據：
 * 1. 嚴格對接表 501 (crm_customers) 與 表 502 (crm_conversions)
 * 2. 移除所有寫死預設資料，以 Google 試算表實體欄位順序解析讀取
 * 3. 記憶體即時樂觀更新 (Optimistic Update) + refreshView()
 * 4. 全面整合 AppToast、AppDialog、AppLoading、UISelectOptions、UIBadges
 * ============================================================================
 */

const SPREADSHEET_ID = {
    CRM: APP_CONFIG.SHEETS.CRM,
    PSI: APP_CONFIG.SHEETS.PSI,
    ORG: APP_CONFIG.SHEETS.ORG,
    PSN: APP_CONFIG.SHEETS.PSN,
    PRD: APP_CONFIG.SHEETS.PRD
};

const GAS_DEPLOY_ID = {
    CRM: APP_CONFIG.GAS.CRM,
    PSI: APP_CONFIG.GAS.PSI,
    ORG: APP_CONFIG.GAS.ORG,
    PSN: APP_CONFIG.GAS.PSN,
    PRD: APP_CONFIG.GAS.PRD
};

const SHEET_NAMES = {
    CUSTOMERS: '客戶主檔',      // 表 501
    CONVERSIONS: '轉化歷程',    // 表 502
    PERSONS: '個人主檔',        // 表 201
    PARTNERS: '夥伴主檔'        // 表 202
};

// 本地記憶體狀態（絕不預填假資料，初始為空陣列）
let customersDatabase = [];
let conversionsDatabase = [];
let personMasterList = [];
let partnerMasterList = [];

let customerDataTable = null;
let conversionsDataTable = null;
let chartInstances = {};
let activeViewingCustomerId = null;

// 監聽全域 AppReady 事件啟動
window.addEventListener('AppReady', async function () {
    if (window.SheetAdapter) {
        SheetAdapter.init(GAS_DEPLOY_ID.CRM);
    }
    initFilterOptions();
    bindEvents();
    await fetchGoogleSheetsData();
});

/**
 * 試算表遠端資料讀取 (以欄位順序索引為主)
 */
async function fetchGoogleSheetsData() {
    AppLoading.show('<i class="fa-solid fa-cloud-arrow-down text-primary"></i> 正在讀取雲端資料庫...', '載入中...');
    try {
        if (!SPREADSHEET_ID.CRM) {
            customersDatabase = [];
            conversionsDatabase = [];
            personMasterList = [];
            partnerMasterList = [];
            refreshView();
            return;
        }

        const [custRows, convRows, personRows, partnerRows] = await Promise.all([
            fetchGoogleSheetCsv(SPREADSHEET_ID.CRM, SHEET_NAMES.CUSTOMERS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.CRM, SHEET_NAMES.CONVERSIONS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.PSN, SHEET_NAMES.PERSONS).catch(() => []),
            fetchGoogleSheetCsv(SPREADSHEET_ID.ORG, SHEET_NAMES.PARTNERS).catch(() => [])
        ]);

        // 1. 自然人解析 (依照 0-Based 順序取值)
        personMasterList = personRows.map(r => ({
            person_id: getVal(r, 0),
            name_zh: getVal(r, 1),
            gender: getVal(r, 7, '未填'),
            birthday: getVal(r, 8),
            current_residence: getVal(r, 15),
            phone: getVal(r, 16),
            email: getVal(r, 17),
            contact_address: getVal(r, 18)
        })).filter(p => p.person_id);

        // 2. 夥伴解析
        partnerMasterList = partnerRows.map(r => ({
            partner_id: getVal(r, 0),
            person_id: getVal(r, 1),
            display_name: getVal(r, 2)
        })).filter(pt => pt.partner_id);

        // 3. 表 501 客戶主檔解析
        customersDatabase = custRows.map(r => ({
            customer_id: getVal(r, 0),
            person_id: getVal(r, 1),
            customer_type: getVal(r, 2, '潛在對象'),
            pipeline_stage: getVal(r, 3, '新線索'),
            source_channel: getVal(r, 4, '線上陌開'),
            source_referrer_id: getVal(r, 5),
            assigned_partner_id: getVal(r, 6),
            status: getVal(r, 7, '活躍跟進'),
            first_order_date: getVal(r, 8),
            last_contact_date: getVal(r, 9),
            customer_tags: getVal(r, 10),
            notes: getVal(r, 11)
        })).filter(c => c.customer_id);

        // 4. 表 502 轉化歷程解析
        conversionsDatabase = convRows.map(r => ({
            conversion_id: getVal(r, 0),
            customer_id: getVal(r, 1),
            converted_partner_id: getVal(r, 2),
            conversion_type: getVal(r, 3, '零售客轉經銷'),
            conversion_date: getVal(r, 4),
            contract_no: getVal(r, 5),
            sponsor_partner_id: getVal(r, 6),
            historical_spend_total: parseFloat(getVal(r, 7, '0')) || 0,
            historical_sv_total: parseInt(getVal(r, 8, '0'), 10) || 0,
            conversion_notes: getVal(r, 9)
        })).filter(cv => cv.conversion_id);

        populateDynamicSelects();
        refreshView();
        AppToast.success('雲端資料同步完成！');
    } catch (err) {
        console.error('[CRM] 載入資料庫失敗:', err);
        AppToast.error('讀取雲端資料庫失敗: ' + err.message);
    } finally {
        AppLoading.hide();
    }
}

/**
 * 下拉選單填充 (整合 UISelectOptions 共用中樞)
 */
function initFilterOptions() {
    UISelectOptions.core.render({
        target: '#filter-customer-type',
        data: ['潛在對象', '一般零售', 'VIP顧客', '事業種子', '已轉夥伴'],
        placeholder: '全部身分'
    });

    UISelectOptions.core.render({
        target: '#filter-pipeline-stage',
        data: ['新線索', '需求確認', '試用體驗', '異議排除', '規律自用', '培育暫緩'],
        placeholder: '全部階段'
    });

    UISelectOptions.core.render({
        target: '#filter-source-channel',
        data: ['線上陌開', '線下陌開', '社群矩陣', '健康問卷', '親朋好友', '轉介紹', '茶會活動', '其他'],
        placeholder: '全部來源'
    });

    UISelectOptions.core.render({
        target: '#filter-status',
        data: ['活躍跟進', '沉睡列管', '爭議凍結', '封存歸檔'],
        placeholder: '全部狀態'
    });
}

function populateDynamicSelects() {
    // 1. 自然人選單
    UISelectOptions.core.render({
        target: '#form-person-id',
        data: personMasterList,
        valueKey: 'person_id',
        textKey: (p) => `${p.name_zh || '未知'} (${p.person_id}) - ${p.phone || '無電話'}`,
        placeholder: '(請選擇對接之自然人實體)',
        searchable: true,
        dropdownParent: '#customerDetailModal'
    });

    // 2. 夥伴選單
    const partnerSelectData = partnerMasterList.map(pt => {
        const person = personMasterList.find(p => p.person_id === pt.person_id);
        const name = pt.display_name || (person ? person.name_zh : pt.partner_id);
        return { id: pt.partner_id, text: `${name} (${pt.partner_id})` };
    });

    UISelectOptions.core.render({
        target: '#filter-assigned-partner',
        data: partnerSelectData,
        valueKey: 'id',
        textKey: 'text',
        placeholder: '全體夥伴'
    });

    UISelectOptions.core.render({
        target: '#form-assigned-partner-id',
        data: partnerSelectData,
        valueKey: 'id',
        textKey: 'text',
        placeholder: '(無特定負責人)',
        dropdownParent: '#customerDetailModal'
    });

    UISelectOptions.core.render({
        target: '#convert-sponsor-id',
        data: partnerSelectData,
        valueKey: 'id',
        textKey: 'text',
        placeholder: '(請選擇引薦人)',
        dropdownParent: '#customerConvertModal'
    });
}

/**
 * 畫面全面重繪 (樂觀更新統一進入點)
 */
function refreshView() {
    const filtered = getFilteredCustomers();
    updateHudCounters();
    renderCardsView(filtered);
    reloadCustomerDataTable(filtered);
    reloadConversionsDataTable(conversionsDatabase);
    updateCharts();
}

/**
 * 監聽器註冊
 */
function bindEvents() {
    $('.form-filter-control, #filter-search-text').on('change keyup', function () {
        refreshView();
    });

    $('#btn-reset-filters').on('click', function () {
        $('.form-filter-control').val('');
        $('#filter-search-text').val('');
        refreshView();
    });

    $('#viewModeTabs button[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        const target = $(e.target).attr('data-bs-target');
        if (target === '#container-table-view' && customerDataTable) {
            customerDataTable.columns.adjust().draw();
        } else if (target === '#container-conversions-view' && conversionsDataTable) {
            conversionsDataTable.columns.adjust().draw();
        }
    });

    $('#btn-view-to-edit').on('click', function () {
        bootstrap.Modal.getInstance(document.getElementById('customerViewModal'))?.hide();
        if (activeViewingCustomerId) {
            setTimeout(() => openCustomerModalForEdit(activeViewingCustomerId), 250);
        }
    });
}

/**
 * 流水號生成器 (格式: CST-000001)
 */
function generateNextCustomerId() {
    const seqs = customersDatabase.map(c => {
        const m = (c.customer_id || '').match(/CST-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = (seqs.length > 0 ? Math.max(...seqs) : 0) + 1;
    return `CST-${String(nextSeq).padStart(6, '0')}`;
}

/**
 * HUD 統計數據計算 (採用 .toLocaleString())
 */
function updateHudCounters() {
    const total = customersDatabase.length;
    const retail = customersDatabase.filter(c => c.customer_type === '一般零售').length;
    const vip = customersDatabase.filter(c => c.customer_type === 'VIP顧客').length;
    const seed = customersDatabase.filter(c => c.customer_type === '事業種子').length;
    const converted = customersDatabase.filter(c => c.customer_type === '已轉夥伴').length;

    $('#hud-total-customers').text(total.toLocaleString());
    $('#hud-retail-customers').text(retail.toLocaleString());
    $('#hud-vip-customers').text(vip.toLocaleString());
    $('#hud-seed-customers').text(seed.toLocaleString());
    $('#hud-converted-customers').text(converted.toLocaleString());
}

/**
 * 卡片視圖渲染
 */
function renderCardsView(dataList) {
    const $container =$('#customer-cards-grid').empty();
    if (!dataList || dataList.length === 0) {
        $container.html('<div class="col-12 text-center text-muted py-5"><i class="fa-solid fa-user-slash fa-2x mb-2"></i><br>目前條件下無客戶記錄</div>');
        return;
    }

    dataList.forEach(c => {
        const person = personMasterList.find(p => p.person_id === c.person_id) || { name_zh: '未知', phone: '-' };
        const partnerName = resolvePartnerName(c.assigned_partner_id);
        const borderClass = c.customer_type === '事業種子' ? 'is-seed' : (c.customer_type === 'VIP顧客' ? 'is-vip' : (c.customer_type === '已轉夥伴' ? 'is-converted' : ''));
        const tagsHtml = (c.customer_tags || '').split(',').filter(Boolean).map(t => `<span class="badge-tag">${t.trim()}</span>`).join(' ');

        const cardHtml = `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="customer-card ${borderClass}">
                    <div>
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div class="d-flex align-items-center gap-2">
                                <div class="avatar-wrap">${person.name_zh.charAt(0)}</div>
                                <div>
                                    <h6 class="mb-0 fw-bold text-white fs-6">${person.name_zh}</h6>
                                    <span class="text-secondary small">${c.customer_id}</span>
                                </div>
                            </div>
                            <span class="badge rounded-pill ${getTypeBadgeClass(c.customer_type)}">${c.customer_type}</span>
                        </div>

                        <div class="p-2 rounded bg-black bg-opacity-30 border border-secondary border-opacity-10 mb-2 small">
                            <div class="d-flex justify-content-between mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-phone me-1"></i> 手機</span>
                                <span class="text-light">${person.phone}</span>
                            </div>
                            <div class="d-flex justify-content-between mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-filter me-1"></i> 轉化階段</span>
                                <span class="text-warning">${c.pipeline_stage}</span>
                            </div>
                            <div class="d-flex justify-content-between mb-1">
                                <span class="text-secondary"><i class="fa-solid fa-user-tie me-1"></i> 維護夥伴</span>
                                <span class="text-info">${partnerName}</span>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span class="text-secondary"><i class="fa-solid fa-signal me-1"></i> 運作狀態</span>
                                <span class="text-light">${c.status}</span>
                            </div>
                        </div>

                        <div class="mb-2 d-flex flex-wrap gap-1">
                            ${tagsHtml || '<span class="text-muted small">無標籤</span>'}
                        </div>

                        <p class="text-secondary small text-truncate-2 mb-0" style="font-size: 0.8rem; min-height: 2.4em;">
                            ${c.notes || '暫無溝通備忘'}
                        </p>
                    </div>

                    <div class="pt-2 mt-2 border-top border-secondary border-opacity-15 d-flex justify-content-between align-items-center">
                        <span class="text-muted small"><i class="fa-solid fa-clock me-1"></i> ${c.last_contact_date || '無關懷日'}</span>
                        <div class="btn-group btn-group-sm">
                            <button type="button" class="btn btn-outline-info py-1 px-2" onclick="openCustomerModalForView('${c.customer_id}')" title="查看 360° 檔案"><i class="fa-solid fa-magnifying-glass"></i></button>
                            <button type="button" class="btn btn-outline-secondary py-1 px-2" onclick="openCustomerModalForEdit('${c.customer_id}')" title="編輯"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button type="button" class="btn btn-outline-danger py-1 px-2" onclick="deleteCustomerRecord('${c.customer_id}')" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        $container.append(cardHtml);
    });
}

/**
 * 格式化單一客戶列物件
 */
function formatCustomerTableRow(c) {
    const person = personMasterList.find(p => p.person_id === c.person_id) || { name_zh: '未知' };
    const partnerName = resolvePartnerName(c.assigned_partner_id);
    const actionBtns = `
        <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-info py-1 px-2" onclick="openCustomerModalForView('${c.customer_id}')" title="查看檔案"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button type="button" class="btn btn-outline-secondary py-1 px-2" onclick="openCustomerModalForEdit('${c.customer_id}')" title="編輯"><i class="fa-solid fa-pen-to-square"></i></button>
            <button type="button" class="btn btn-outline-danger py-1 px-2" onclick="deleteCustomerRecord('${c.customer_id}')" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
        </div>
    `;

    return {
        customer_info: `<strong class="text-white">${person.name_zh}</strong><br><span class="text-secondary small">${c.customer_id}</span>`,
        customer_type: `<span class="badge rounded-pill ${getTypeBadgeClass(c.customer_type)}">${c.customer_type}</span>`,
        pipeline_stage: `<span class="text-warning">${c.pipeline_stage}</span>`,
        source_channel: `<span>${c.source_channel || '-'}</span>`,
        referrer: `<span class="text-secondary small">${c.source_referrer_id || '-'}</span>`,
        assigned_partner: `<span class="text-info">${partnerName}</span>`,
        status: `<span>${c.status}</span>`,
        first_order_date: `<span class="small">${c.first_order_date || '-'}</span>`,
        last_contact_date: `<span class="small">${c.last_contact_date || '-'}</span>`,
        tags: `<span class="small">${c.customer_tags || '-'}</span>`,
        actions: actionBtns
    };
}

function reloadCustomerDataTable(dataList) {
    const formatted = dataList.map(c => formatCustomerTableRow(c));

    if (customerDataTable) {
        customerDataTable.clear().rows.add(formatted).draw();
    } else {
        customerDataTable = $('#customer-datatable').DataTable({
            data: formatted,
            columns: [
                { data: 'customer_info' },
                { data: 'customer_type', className: 'text-center' },
                { data: 'pipeline_stage', className: 'text-center' },
                { data: 'source_channel' },
                { data: 'referrer' },
                { data: 'assigned_partner' },
                { data: 'status', className: 'text-center' },
                { data: 'first_order_date', className: 'text-center' },
                { data: 'last_contact_date', className: 'text-center' },
                { data: 'tags' },
                { data: 'actions', className: 'text-end', orderable: false }
            ]
        });
    }
}

/**
 * 格式化單一轉化歷程列物件
 */
function formatConversionTableRow(cv) {
    const spend = parseFloat(cv.historical_spend_total) || 0;
    const sv = parseInt(cv.historical_sv_total, 10) || 0;

    return {
        conversion_id: `<span class="text-success fw-bold">${cv.conversion_id}</span>`,
        customer_id: `<span>${cv.customer_id}</span>`,
        partner_id: `<span class="text-info">${cv.converted_partner_id}</span>`,
        conversion_type: `<span class="badge bg-success-subtle text-success">${cv.conversion_type}</span>`,
        conversion_date: `<span>${cv.conversion_date}</span>`,
        contract_no: `<span class="text-secondary">${cv.contract_no || '-'}</span>`,
        sponsor: `<span>${resolvePartnerName(cv.sponsor_partner_id)}</span>`,
        spend: `NT$ ${spend.toLocaleString()}`,
        sv: `${sv.toLocaleString()} SV`,
        notes: `<span class="small">${cv.conversion_notes || '-'}</span>`
    };
}

function reloadConversionsDataTable(conversionsList) {
    const formatted = conversionsList.map(cv => formatConversionTableRow(cv));

    if (conversionsDataTable) {
        conversionsDataTable.clear().rows.add(formatted).draw();
    } else {
        conversionsDataTable = $('#conversions-datatable').DataTable({
            data: formatted,
            columns: [
                { data: 'conversion_id' },
                { data: 'customer_id' },
                { data: 'partner_id' },
                { data: 'conversion_type', className: 'text-center' },
                { data: 'conversion_date', className: 'text-center' },
                { data: 'contract_no' },
                { data: 'sponsor' },
                { data: 'spend', className: 'text-end text-orange fw-bold' },
                { data: 'sv', className: 'text-end text-teal fw-bold' },
                { data: 'notes' }
            ]
        });
    }
}

/**
 * 360° 檔案檢視視窗
 */
function openCustomerModalForView(customerId) {
    const customer = customersDatabase.find(c => c.customer_id === customerId);
    if (!customer) return;
    const person = personMasterList.find(p => p.person_id === customer.person_id) || {};

    activeViewingCustomerId = customerId;
    $('#view-header-cust-id').text(customer.customer_id);
    $('#view-avatar-box').text((person.name_zh || '客').charAt(0));
    $('#view-name').text(person.name_zh || '未知姓名');
    $('#view-phone').text(person.phone || '無電話');
    $('#view-residence').text(person.current_residence || '未設定現居地');

    $('#view-badge-type').html(`<span class="badge rounded-pill ${getTypeBadgeClass(customer.customer_type)}">${customer.customer_type}</span>`);
    $('#view-badge-stage').html(`<span class="badge rounded-pill bg-warning-subtle text-warning">${customer.pipeline_stage}</span>`);

    $('#view-person-id').text(customer.person_id);
    $('#view-gender-age').text(`${person.gender || '未填'} · 生日: ${person.birthday || '未填'}`);
    $('#view-email').text(person.email || '未填寫');
    $('#view-address').text(person.current_residence || '未填寫');

    $('#view-source-channel').text(customer.source_channel || '-');
    $('#view-referrer-id').text(customer.source_referrer_id || '無');
    $('#view-assigned-partner').text(resolvePartnerName(customer.assigned_partner_id));
    $('#view-status').text(customer.status);
    $('#view-first-order').text(customer.first_order_date || '-');
    $('#view-last-contact').text(customer.last_contact_date || '-');

    const $tags =$('#view-tags-container').empty();
    if (customer.customer_tags) {
        customer.customer_tags.split(',').forEach(t => $tags.append(`<span class="badge-tag">${t.trim()}</span>`));
    } else {
        $tags.text('無客群標籤');
    }

    $('#view-notes').text(customer.notes || '暫無綜合備忘');

    if (customer.customer_type === '已轉夥伴') {
        $('#btn-trigger-convert').prop('disabled', true).html('<i class="fa-solid fa-check me-1"></i> 此客戶已轉化為夥伴');
    } else {
        $('#btn-trigger-convert').prop('disabled', false).html('<i class="fa-solid fa-handshake me-1"></i> 簽約轉為夥伴 (表 502)');
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('customerViewModal')).show();
}

/**
 * 新增客戶視窗
 */
function openCustomerModalForCreate() {
    $('#customerModalTitle').html('<i class="fa-solid fa-user-plus text-primary me-1"></i> 新增客戶建檔 (表 501)');
    $('#form-mode').val('CREATE');
    $('#customerForm')[0].reset();
    $('#form-person-id, #form-assigned-partner-id').val('').trigger('change'); // 補齊 Select2 重置
    $('#form-customer-id').val(generateNextCustomerId());
    $('#form-status').val('活躍跟進');
    $('#form-customer-type').val('潛在對象');
    $('#form-pipeline-stage').val('新線索');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('customerDetailModal')).show();
}

/**
 * 編輯客戶視窗
 */
function openCustomerModalForEdit(customerId) {
    const customer = customersDatabase.find(c => c.customer_id === customerId);
    if (!customer) return;

    $('#customerModalTitle').html(`<i class="fa-solid fa-id-card-clip text-primary me-1"></i> 編輯客戶 - ${customer.customer_id}`);
    $('#form-mode').val('UPDATE');
    $('#form-customer-id').val(customer.customer_id);
    $('#form-person-id').val(customer.person_id).trigger('change');
    $('#form-customer-type').val(customer.customer_type);
    $('#form-pipeline-stage').val(customer.pipeline_stage);
    $('#form-source-channel').val(customer.source_channel || '線上陌開');
    $('#form-source-referrer-id').val(customer.source_referrer_id || '');
    $('#form-assigned-partner-id').val(customer.assigned_partner_id || '').trigger('change'); // 補上 .trigger('change')
    $('#form-status').val(customer.status);
    $('#form-first-order-date').val(AppDate.toInput(customer.first_order_date));
    $('#form-last-contact-date').val(AppDate.toInput(customer.last_contact_date));
    $('#form-customer-tags').val(customer.customer_tags || '');
    $('#form-notes').val(customer.notes || '');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('customerDetailModal')).show();
}

/**
 * 客戶表單送出（AppToast 嚴格驗證 + 樂觀更新）
 */
async function submitCustomerForm() {
    const mode = $('#form-mode').val();
    const custId = $('#form-customer-id').val();
    const personId = $('#form-person-id').val();
    const custType = $('#form-customer-type').val();
    const stage = $('#form-pipeline-stage').val();
    const status = $('#form-status').val();

    if (!personId) {
        AppToast.warning('請選擇關聯之自然人主檔！');
        return;
    }
    if (!custType) {
        AppToast.warning('請選擇客戶分類！');
        return;
    }
    if (!stage) {
        AppToast.warning('請選擇轉化階段！');
        return;
    }
    if (!status) {
        AppToast.warning('請選擇運作狀態！');
        return;
    }

    const $btn =$('#form-submit-btn').prop('disabled', true);
    AppLoading.show('<i class="fa-solid fa-floppy-disk text-primary"></i> 正在儲存客戶資料...', '儲存中...');

    try {
        const record = {
            customer_id: custId,
            person_id: personId,
            customer_type: custType,
            pipeline_stage: stage,
            source_channel: $('#form-source-channel').val(),
            source_referrer_id: $('#form-source-referrer-id').val().trim() || '',
            assigned_partner_id: $('#form-assigned-partner-id').val() || '',
            status: status,
            first_order_date: AppDate.toSheet($('#form-first-order-date').val()),
            last_contact_date: AppDate.toSheet($('#form-last-contact-date').val()),
            customer_tags: $('#form-customer-tags').val().trim() || '',
            notes: $('#form-notes').val().trim() || ''
        };

        const rowArray = [
            record.customer_id, record.person_id, record.customer_type,
            record.pipeline_stage, record.source_channel, record.source_referrer_id,
            record.assigned_partner_id, record.status, record.first_order_date,
            record.last_contact_date, record.customer_tags, record.notes
        ];

        if (mode === 'CREATE') {
            await SheetAdapter.createRow(SHEET_NAMES.CUSTOMERS, record.customer_id, rowArray, GAS_DEPLOY_ID.CRM);
            customersDatabase.unshift(record);
        } else {
            await SheetAdapter.updateRow(SHEET_NAMES.CUSTOMERS, record.customer_id, rowArray, GAS_DEPLOY_ID.CRM);
            const idx = customersDatabase.findIndex(c => c.customer_id === custId);
            if (idx >= 0) customersDatabase[idx] = record;
        }

        bootstrap.Modal.getInstance(document.getElementById('customerDetailModal')).hide();
        refreshView();
        AppToast.success(`客戶【${record.customer_id}】主檔儲存成功！`);
    } catch (err) {
        console.error('[CRM] 儲存失敗:', err);
        AppToast.error('儲存客戶失敗: ' + err.message);
    } finally {
        $btn.prop('disabled', false);
        AppLoading.hide();
    }
}

/**
 * 開啟轉化 Modal
 */
function openConvertModalFromView() {
    if (!activeViewingCustomerId) return;
    const customer = customersDatabase.find(c => c.customer_id === activeViewingCustomerId);
    if (!customer) return;

    bootstrap.Modal.getInstance(document.getElementById('customerViewModal'))?.hide();

    $('#convert-id').val(`CNV-${customer.customer_id}-01`);
    $('#convert-customer-id').val(customer.customer_id);
    $('#convert-partner-id').val('');
    $('#convert-type').val('零售客轉經銷');
    $('#convert-date').val(AppDate.now('input'));
    $('#convert-contract-no').val('');
    $('#convert-sponsor-id').val(customer.assigned_partner_id || '');
    $('#convert-spend').val('0');
    $('#convert-sv').val('0');
    $('#convert-notes').val(`由客戶【${customer.customer_id}】簽約結轉，啟動事業輔導。`);

    setTimeout(() => {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('customerConvertModal')).show();
    }, 250);
}

/**
 * 執行轉化儲存 (表 502)
 */
async function saveCustomerConversion() {
    const custId = $('#convert-customer-id').val();
    const newPartnerId = $('#convert-partner-id').val().trim();
    const convDate = $('#convert-date').val();
    const sponsorId = $('#convert-sponsor-id').val();

    if (!newPartnerId) {
        AppToast.warning('請輸入轉化生成之夥伴代碼！');
        return;
    }
    if (!convDate) {
        AppToast.warning('請選擇簽約生效日期！');
        return;
    }
    if (!sponsorId) {
        AppToast.warning('請選擇引薦推薦人！');
        return;
    }

    const $btn =$('#btn-submit-convert').prop('disabled', true);
    AppLoading.show('<i class="fa-solid fa-award text-success"></i> 正在結轉經銷夥伴資產...', '轉化中...');

    try {
        const conversionRecord = {
            conversion_id: $('#convert-id').val(),
            customer_id: custId,
            converted_partner_id: newPartnerId,
            conversion_type: $('#convert-type').val(),
            conversion_date: AppDate.toSheet(convDate),
            contract_no: $('#convert-contract-no').val().trim() || '',
            sponsor_partner_id: sponsorId,
            historical_spend_total: parseFloat($('#convert-spend').val()) || 0,
            historical_sv_total: parseInt($('#convert-sv').val(), 10) || 0,
            conversion_notes: $('#convert-notes').val().trim() || ''
        };

        const convRowArray = [
            conversionRecord.conversion_id, conversionRecord.customer_id,
            conversionRecord.converted_partner_id, conversionRecord.conversion_type,
            conversionRecord.conversion_date, conversionRecord.contract_no,
            conversionRecord.sponsor_partner_id, conversionRecord.historical_spend_total,
            conversionRecord.historical_sv_total, conversionRecord.conversion_notes
        ];

        // 1. 寫入表 502 轉化紀錄
        await SheetAdapter.createRow(SHEET_NAMES.CONVERSIONS, conversionRecord.conversion_id, convRowArray, GAS_DEPLOY_ID.CRM);

        // 2. 更新表 501 客戶主檔狀態為「已轉夥伴」
        const customer = customersDatabase.find(c => c.customer_id === custId);
        if (customer) {
            customer.customer_type = '已轉夥伴';
            const custRowArray = [
                customer.customer_id, customer.person_id, customer.customer_type,
                customer.pipeline_stage, customer.source_channel, customer.source_referrer_id,
                customer.assigned_partner_id, customer.status, customer.first_order_date,
                customer.last_contact_date, customer.customer_tags, customer.notes
            ];
            await SheetAdapter.updateRow(SHEET_NAMES.CUSTOMERS, customer.customer_id, custRowArray, GAS_DEPLOY_ID.CRM);
        }

        // 3. 本地記憶體樂觀更新
        conversionsDatabase.unshift(conversionRecord);
        bootstrap.Modal.getInstance(document.getElementById('customerConvertModal')).hide();
        refreshView();
        AppToast.success(`客戶【${custId}】已成功轉化為經銷夥伴【${newPartnerId}】！`);
    } catch (err) {
        console.error('[CRM] 轉化失敗:', err);
        AppToast.error('轉化失敗: ' + err.message);
    } finally {
        $btn.prop('disabled', false);
        AppLoading.hide();
    }
}

/**
 * 刪除客戶 (AppDialog.confirm 替代原生 confirm)
 */
async function deleteCustomerRecord(customerId) {
    const isConfirmed = await AppDialog.confirm(`確定要刪除客戶【${customerId}】的所有主檔資料嗎？此操作將無法回復。`, '刪除警告');
    if (!isConfirmed) return;

    AppLoading.show('<i class="fa-solid fa-trash-can text-danger"></i> 正在刪除檔案...', '刪除中...');
    try {
        await SheetAdapter.deleteRow(SHEET_NAMES.CUSTOMERS, customerId, GAS_DEPLOY_ID.CRM);
        customersDatabase = customersDatabase.filter(c => c.customer_id !== customerId);
        refreshView();
        AppToast.success(`客戶【${customerId}】已成功刪除！`);
    } catch (err) {
        console.error('[CRM] 刪除失敗:', err);
        AppToast.error('刪除客戶失敗: ' + err.message);
    } finally {
        AppLoading.hide();
    }
}

/**
 * 複合條件快篩
 */
function getFilteredCustomers() {
    const fType = $('#filter-customer-type').val();
    const fStage = $('#filter-pipeline-stage').val();
    const fChannel = $('#filter-source-channel').val();
    const fStatus = $('#filter-status').val();
    const fPartner = $('#filter-assigned-partner').val();
    const fSearch = $('#filter-search-text').val().toLowerCase().trim();

    return customersDatabase.filter(c => {
        const person = personMasterList.find(p => p.person_id === c.person_id) || { name_zh: '' };

        if (fType && c.customer_type !== fType) return false;
        if (fStage && c.pipeline_stage !== fStage) return false;
        if (fChannel && c.source_channel !== fChannel) return false;
        if (fStatus && c.status !== fStatus) return false;
        if (fPartner && c.assigned_partner_id !== fPartner) return false;

        if (fSearch) {
            const matchName = (person.name_zh || '').toLowerCase().includes(fSearch);
            const matchId = (c.customer_id || '').toLowerCase().includes(fSearch);
            const matchTags = (c.customer_tags || '').toLowerCase().includes(fSearch);
            if (!matchName && !matchId && !matchTags) return false;
        }
        return true;
    });
}

function resolvePartnerName(partnerId) {
    if (!partnerId) return '-';
    const pt = partnerMasterList.find(p => p.partner_id === partnerId);
    if (!pt) return partnerId;
    const person = personMasterList.find(p => p.person_id === pt.person_id);
    return pt.display_name || (person ? person.name_zh : partnerId);
}

function getTypeBadgeClass(type) {
    switch (type) {
        case 'VIP顧客': return 'bg-warning-subtle text-warning';
        case '事業種子': return 'bg-danger-subtle text-danger';
        case '已轉夥伴': return 'bg-success-subtle text-success';
        case '一般零售': return 'bg-info-subtle text-info';
        default: return 'bg-secondary-subtle text-secondary';
    }
}

/**
 * 統計圖表初始化與懸停百分比計算
 */
function initCharts() {
    const tooltipPercentagePlugin = {
        callbacks: {
            label: function (context) {
                const label = context.label || '';
                const val = context.raw || 0;
                const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                const percent = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                return ` ${label}: ${val.toLocaleString()} (${percent}%)`;
            }
        }
    };

    const ctxType = document.getElementById('chart-customer-type')?.getContext('2d');
    if (ctxType) {
        chartInstances.type = new Chart(ctxType, {
            type: 'doughnut',
            data: getChartTypeData(),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#c4b5fd' } },
                    tooltip: tooltipPercentagePlugin
                }
            }
        });
    }

    const ctxStage = document.getElementById('chart-pipeline-stage')?.getContext('2d');
    if (ctxStage) {
        chartInstances.stage = new Chart(ctxStage, {
            type: 'pie',
            data: getChartStageData(),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#c4b5fd' } },
                    tooltip: tooltipPercentagePlugin
                }
            }
        });
    }

    const ctxChannel = document.getElementById('chart-source-channel')?.getContext('2d');
    if (ctxChannel) {
        chartInstances.channel = new Chart(ctxChannel, {
            type: 'bar',
            data: getChartChannelData(),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: tooltipPercentagePlugin
                },
                scales: {
                    x: { ticks: { color: '#9e8eb3' }, grid: { display: false } },
                    y: { ticks: { color: '#9e8eb3', stepSize: 1 }, grid: { color: 'rgba(139, 92, 246, 0.1)' } }
                }
            }
        });
    }
}

function updateCharts() {
    if (!chartInstances.type) {
        initCharts();
        return;
    }
    if (chartInstances.type) {
        chartInstances.type.data = getChartTypeData();
        chartInstances.type.update();
    }
    if (chartInstances.stage) {
        chartInstances.stage.data = getChartStageData();
        chartInstances.stage.update();
    }
    if (chartInstances.channel) {
        chartInstances.channel.data = getChartChannelData();
        chartInstances.channel.update();
    }
}

function getChartTypeData() {
    const types = ['潛在對象', '一般零售', 'VIP顧客', '事業種子', '已轉夥伴'];
    const counts = types.map(t => customersDatabase.filter(c => c.customer_type === t).length);
    return {
        labels: types,
        datasets: [{
            data: counts,
            backgroundColor: ['#64748b', '#38bdf8', '#fbbf24', '#f43f5e', '#10b981'],
            borderColor: '#120926',
            borderWidth: 2
        }]
    };
}

function getChartStageData() {
    const stages = ['新線索', '需求確認', '試用體驗', '異議排除', '規律自用', '培育暫緩'];
    const counts = stages.map(s => customersDatabase.filter(c => c.pipeline_stage === s).length);
    return {
        labels: stages,
        datasets: [{
            data: counts,
            backgroundColor: ['#38bdf8', '#818cf8', '#c084fc', '#f43f5e', '#10b981', '#64748b'],
            borderColor: '#120926',
            borderWidth: 2
        }]
    };
}

function getChartChannelData() {
    const channels = ['線上陌開', '線下陌開', '社群矩陣', '健康問卷', '親朋好友', '轉介紹', '茶會活動', '其他'];
    const counts = channels.map(ch => customersDatabase.filter(c => c.source_channel === ch).length);
    return {
        labels: channels,
        datasets: [{
            label: '名單人數',
            data: counts,
            backgroundColor: 'rgba(139, 92, 246, 0.65)',
            borderColor: '#8b5cf6',
            borderWidth: 1,
            borderRadius: 4
        }]
    };
}