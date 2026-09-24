/**
 * assets/js/common.js
 * 監聽 VendorReady 事件，載入團隊內部核心 JS 模組並發送 AppReady
 */

// ==========================================================================
// 系統全域環境設定 (直接掛載於全域 window)
// ==========================================================================
const APP_CONFIG = {
    // Google 試算表 ID (Spreadsheets)
    SHEETS: {
        PRD: "18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I",        // 01_產品 (prd)
        TRN: "",        // 02_培訓 (trn)
        PSI: "1_plHUdfzIublSv1apN5qQ5reO6YxqBkI1MdnQeDbAxo",        // 03_進銷存 (psi)
        ORG: "1N-HniBDo7wJHidfsKyG-dr7kh0-UTNtFpM7nyFDL3eg",        // 04_組織 (org)
        CRM: "1AWPJNZd3d8MstqtwG8OI5RaDWku5a1wK3XV3GORhRyk",        // 05_客戶 (crm)
        FIN: "",        // 06_財務 (fin)
        SYS: "1TofIohkI-arOGmgRzm0rFm3sXBWvfYyThmm9pp1IGqw",        // 07_系統 (sys)
        MY: "",        // 08_馬來西亞 (my)
        PSN: "1RB0czTwlWP1021OUVYHc__-0vtqOcE9ltSPxrY8jH_4"         // 09_人員 (psn)
    },
    // Google Apps Script 部署 ID
    GAS: {
        PRD: "AKfycbwWirZHIj1JrwJqipOsfNXpPo-GWVi9ia6faEhLNH5ewPdy-xepBZmHnqTmF5dBLY3H",        // 01_產品 (prd)
        TRN: "",        // 02_培訓 (trn)
        PSI: "AKfycbx3vDysJBLkmscZG8Jonv6EMyHLzmb-AjxfDqzjOSiGD-8oInz8UowbLLJRKVbbxPVt",        // 03_進銷存 (psi)
        ORG: "AKfycbwCHIswVrVHuvEusFZrg2KjTCCwYhlf-3h-QbWhro8YVekUt1wNa4oDxxBxzPc_z6cd",        // 04_組織 (org)
        CRM: "AKfycbw_7r40UQSTCBCGqZC5IbmPMgSmpVOWKUOjSLyQAsX62Z1p5D-2sR45Jvy2Nc-jz5zYXw",      // 05_客戶 (crm)
        FIN: "",        // 06_財務 (fin)
        SYS: "AKfycbyJ5FLoBXSHQsKRLF6UovYqulT7uBDPwmybRZ1Up2VN12nT4KnvkUELLC3N8pZK73A7cA",      // 07_系統 (sys)
        MY: "",        // 08_馬來西亞 (my)
        PSN: "AKfycbyoUx9tLPkTaUIk7KZOD7ab2aqmTPQrOTvFxLrxi4w8DNLkX_DpLginxvW-SdS99ExB4w"       // 09_人員 (psn)
    },
    // Google 試算表 工作表名稱
    SHEET_NAMES: {
        PRD: {
            PRODUCTS: "產品主檔",
            DETAILS: "產品詳細資料",
            CATEGORIES: "產品主系列",
            SUBCATEGORIES: "產品次系列",
            TYPES: "產品型態",
            COPYWRITINGS: "行銷文案",
            FAQS: "產品問答",
            TESTIMONIALS: "見證主檔",
            TESTIMONIAL_RELS: "見證關聯",
            TESTIMONIAL_IMAGES: "見證圖片",
            PATENTS: "專利主檔",
            PATENT_RELS: "專利關聯",
            BUNDLES: "產品組合",
            BUNDLE_ITEMS: "產品組合明細"
        },
        TRN: {
            ANNOUNCEMENTS: "公告主檔",
            GENERAL_FAQS: "通用問答",
            POLICY_DOCS: "營運守則",
            COMPLIANCE_REPORTS: "法規報備",
            MILESTONES: "公司大事記",
            AWARDS: "榮譽獎項",
            EVENTS: "活動講座",
            RESOURCES: "雲端資源"
        },
        PSI: {
            WAREHOUSES: "據點倉儲",
            STOCKS: "庫存主檔",
            INBOUND_ORDERS: "進貨主檔",
            INBOUND_ITEMS: "進貨明細",
            OUTBOUND_ORDERS: "銷貨主檔",
            OUTBOUND_ITEMS: "銷貨明細",
            ADJUSTMENTS: "盤點調撥",
            ALERTS: "庫存預警",
            SAFETY_THRESHOLDS: "安全門檻"
        },
        ORG: {
            PARTNERS: "夥伴主檔",
            RELATIONS: "組織關係",
            RANKS: "職級主檔",
            RANK_HISTORY: "職級歷程",
            MONTHLY_PERFS: "月度業績",
            MANAGER_MONITORS: "門檻調度",
            SV_LOANS: "積分借貸",
            SV_ALLOCATIONS: "積分落點",
            QUALIFICATION_ALERTS: "資格預警",
            DORMANT_PARTNERS: "沉睡夥伴",
            COMPRESSION_LOGS: "緊縮日誌",
            MEETINGS: "會議紀錄"
        },
        CRM: {
            CUSTOMERS: "客戶主檔",
            CONVERSIONS: "轉化歷程",
            INTERACTIONS: "關懷紀錄",
            CONSUMPTION_ESTIMATES: "耗盡推算",
            SCHEDULES: "採購協調",
            REORDER_ALERTS: "復購預警",
            DORMANT_CUSTOMERS: "沉睡客戶",
            HEALTH_ASSESSMENTS: "健康問卷",
            ASSESSMENT_RULES: "問卷規則"
        },
        FIN: {
            RECONCILIATIONS: "對帳主檔",
            TRANSACTIONS: "財務收支",
            OPERATING_FUNDS: "公款主檔",
            BONUS_PAYOUTS: "實收獎金",
            TAX_CONFIGS: "稅務健保",
            CROSS_BORDER_SWAPS: "跨境對沖",
            SV_ASSISTANCES: "湊單借點"
        },
        SYS: {
            PERMISSIONS: "權限主檔",
            ACCESS_LOGS: "存取日誌",
            MENUS: "選單架構",
            DYNAMIC_LINKS: "連結主檔",
            API_CONFIGS: "轉接字典",
            DAILY_STATS: "流量統計",
            COMPLIANCE_KEYWORDS: "合規詞庫",
            COPY_AUDITS: "文案審查",
            PERFORMANCE_CALENDARS: "業績日曆"
        },
        MY: {
            TRIPS: "出差任務",
            FLIGHTS: "航班機票",
            ACCOMMODATIONS: "旅店住宿",
            ITINERARIES: "行程排程",
            EXPENSES: "差旅費用",
            SUPPLIES_CHECKLIST: "試用備品",
            FIELD_NOTES: "考察筆記",
            TRANSITS: "交通路線"
        },
        PSN: {
            PERSON: "個人主檔",
            PERSON_CONTACTS: "通訊資料",
            PERSON_LANGUAGES: "使用語言",
            FAMILY_RELATIONS: "家庭關係"
        }
    },
    // 03_倉儲
    PSI: {
        EXPIRY_RADAR_DAYS: {        // 效期警戒
            WARNING: 90,            // 效期警戒第一道防線（預設 90 天，觸發近效期調撥或促銷告警）
            CRITICAL: 30            // 效期警戒極危防線（預設 30 天，觸發極危銷毀或試飲消耗處置）
        }
    },
    // 04_組織
    ORG: {
        // 考核指標門檻 (SV)
        SV_LINE_ACTIVE: 160,                      // 當月自用活躍合格責任額 (全職級領獎門檻)
        SV_LINE_MANAGER: 3200,                    // 經理當月合格小組責任額 (領取合格小組/經理獎金門檻)

        // 點值算力體系 (PV & 點值係數)
        PV_RATE: {
            TW: 25.0,                             // 台灣生產力點值 (1 PV = NT$ 25)
            MY: 3.5                               // 馬來西亞生產力點值 (1 PV = RM 3.5)
        },
        LEADERSHIP_POINT_VALUE: 0.7               // 全球領導獎金基準點值 (0.7)
    },

    // 06_財務
    FIN: {
        DEFAULT_CURRENCY: "TWD",                  // 系統預設結算幣別
        EXCHANGE_RATE: {
            MYR_TWD: 8.00                         // 馬幣兌換新台幣基準匯率 (1 MYR = ? TWD)
        },

        // 雙國法定代扣稅率與單筆起扣門檻
        TAX_RULES: {
            // 台灣執行業務所得稅 (10%)
            TAX_RATE_TW: 0.1000,
            TAX_THRESHOLD_TW: 20000.00,           // 台灣所得稅起扣門檻 (NT$ 20,000)

            // 台灣二代健保補充保費 (2.11%)
            NHI_RATE_TW: 0.0211,
            NHI_THRESHOLD_TW: 20000.00,           // 台灣二代健保起扣門檻 (NT$ 20,000)

            // 馬來西亞官方 107D 條款扣繳稅 (2%)
            TAX_RATE_MY_107D: 0.0200,
            TAX_THRESHOLD_MY_107D: 100000.00      // 馬來西亞 107D 條款起扣門檻 (RM 100,000)
        }
    }
};

// 進行全域深層凍結，防止執行階段被惡意或意外竄改
(function deepFreeze(obj) {
    Object.keys(obj).forEach(prop => {
        if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    Object.freeze(obj);
})(APP_CONFIG);

(function() {
    'use strict';

    // 團隊內部寫的 JS 模組清單
    const internalModules = [
        '../assets/js/ui.js',            // 主題與 UI 控制 (原 utils.js 改名)
        '../assets/js/utils.js',         // 全域工具函式庫 (新增)
        '../assets/js/dialog.js',
        '../assets/js/sheet-adapter.js',
        '../assets/js/ui-badges.js',
        '../assets/js/ui-select-options.js',
        '../assets/js/entity-resolver.js',
        '../assets/js/date.js',
        '../assets/js/calc.js'
    ];

    /**
     * 動態載入內部 JS 模組
     */
    function loadInternalModule(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.type = 'text/javascript';

            script.onload = () => resolve(src);
            script.onerror = () => reject(new Error(`[ModuleLoadError] 內部模組讀取失敗: ${src}`));

            document.head.appendChild(script);
        });
    }

    /**
     * 啟動內部模組載入鏈
     */
    function initInternalApp() {

        Promise.all(internalModules.map(src => loadInternalModule(src)))
            .then(() => {
                
                // 全域 UI 工具與事件綁定
                if (window.jQuery) {
                    $(document).ready(function() {
                        
                    });
                }

                // 發送最終全域 READY 事件
                window.dispatchEvent(new CustomEvent('AppReady'));
            })
            .catch(err => {
                console.error("❌ [Common.js] 內部模組初始化失敗:", err);
            });
    }

    // 監聽來自 vendor-loader.js 的 VendorReady 事件
    window.addEventListener('VendorReady', function() {
        initInternalApp();
    });
})();

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    // 初始化
    init();
});

// 初始化
function init() {
    UI.initTheme();

    setDataTable();

    loadPerformanceCalendar();
}

// setDataTable
function setDataTable() {
    // DataTables 全域預設配置
    if ($.fn.dataTable) {
        $.extend(true, $.fn.dataTable.defaults, {
            // --- 1. 語系設定 (繁體中文) ---
            language: {
                processing: "處理中...",
                loadingRecords: "載入中...",
                lengthMenu: "顯示 _MENU_ 筆結果",
                zeroRecords: "沒有符合的結果",
                info: "顯示第 _START_ 至 _END_ 筆結果，共 _TOTAL_ 筆",
                infoEmpty: "顯示第 0 至 0 筆結果，共 0 筆",
                infoFiltered: "(從 _MAX_ 筆結果中篩選)",
                search: "搜尋：",
                searchPlaceholder: "輸入關鍵字...",
                paginate: {
                    first: "‹‹",
                    previous: "‹",
                    next: "›",
                    last: "››"
                },
                aria: {
                    sortAscending: ": 升冪排列",
                    sortDescending: ": 降冪排列"
                }
            },

            // --- 2. 分頁與選單設定 ---
            pageLength: 10,                 // 預設每頁顯示幾筆
            lengthMenu: [                   // 每頁筆數下拉選單選項
                [5, 10, 20, 30, 40, 50, 100, -1],                       // 實際傳入 DataTables 的數值 (-1 代表全部)
                ['5', '10', '20', '30', '40', '50', '100', '全部']      // 畫面上顯示給使用者看的文字
            ],
            pagingType: "full_numbers",     // 分頁按鈕樣式 (前後頁 + 數字頁碼)

            // --- 3. 功能開關預設值 ---
            searching: true,                // 全域預設關閉表格自帶搜尋框 (改由外部搜尋框控制)
            ordering: true,                 // 開放欄位點擊排序
            info: true,                     // 顯示「顯示第 X 至 Y 筆」的統計資訊
            paging: true,                   // 開啟分頁
            autoWidth: true,                // 必須開啟自動欄寬計算，DataTables 才能精確同步雙表像素寬度
            stateSave: false,               // 重新整理時是否記憶目前的頁碼/排序 (預設關閉)
            destroy: true,                  // 銷毀舊表格，重新建立
            scrollX: true,                  // 開啟橫向捲動軸
            scrollCollapse: true,           // 控制當表格內容很少、不足以佔滿設定的最大高度時，表格本身的高度是否要跟著縮小
            responsive: false,              // 建議關閉 responsive，避免與 scrollX 搶奪欄寬計算

            // --- 4. 效能優化 ---
            deferRender: true,              // 延遲渲染 (當資料量大時能顯著提升速度)
            //processing: true,               // 讀取/排序時顯示「處理中」提示

            // --- 5. 自動校準表頭寬度鉤子 ---
            initComplete: function() {
                const api = this.api();
                // 初始化完成後延遲一幀強制校準表頭對齊
                setTimeout(() => {
                    api.columns.adjust();
                }, 50);
            },
            drawCallback: function() {
                // 每次換頁或重新繪製時校準
                $(this).DataTable().columns.adjust();
            }

            /*
            searching (true / false)：是否開啟表格右上角的搜尋框。

            ordering (true / false)：是否允許使用者點擊表頭進行排序。

            paging (true / false)：是否開啟分頁。

            info (true / false)：是否顯示左下角的頁數統計資訊。

            autoWidth (true / false)：是否自動計算欄寬，通常建議設為 false，由 CSS 彈性控制。

            stateSave (true / false)：設為 true 時，當使用者重新整理網頁後，會記憶上次停留在第幾頁、排序狀態與搜尋關鍵字。

            pageLength (數字)：預設每頁顯示筆數（如 10）。

            lengthMenu (陣列)：設定可供使用者選擇的單頁筆數，例如 [10, 25, 50, -1]（-1 代表「顯示全部」）。

            pagingType (字串)：
                "simple"：僅顯示「上一頁 / 下一頁」。
                "simple_numbers"：顯示前後頁與頁碼數字（最常用）。
                "full_numbers"：顯示「第一頁 / 上一頁 / 數字 / 下一頁 / 最後一頁」。
            
            order (陣列)：設定預設依哪一欄排序。例如 order: [[0, 'asc']] 代表預設第一欄升冪，order: [] 代表不進行預設排序。

            columnDefs (物件陣列)：針對特定欄位進行細部設定，例如指定某些欄位禁止排序：
                columnDefs: [
                    { orderable: false, targets: [2, 3] }, // 第 3、4 欄禁用排序
                    { className: "text-end", targets: [4, 5] } // 指定欄位套用 CSS class
                ]
            
            scrollX (true / "100%")：開啟橫向捲動軸，當表格欄位過多爆出畫面時非常有用。

            scrollY (字串，如 "400px")：固定表格高度並開啟縱向捲動軸。

            scrollCollapse (true / false)：控制當表格內容很少、不足以佔滿設定的最大高度時，表格本身的高度是否要跟著縮小。

            deferRender (true / false)：資料量大時僅繪製目前頁面的 DOM，顯著提升載入速度。

            serverSide (true / false)：當資料庫有幾萬筆資料時，開啟由後端 API 處理分頁、搜尋與排序。
            */
        });
    }
}

/**
 * 抓取表 709 業績日曆主檔（最簡 GViz 方案）
 * 放置於 common.js 或業務初始化進入點
 */
async function loadPerformanceCalendar() {
    // 1. 設定試算表 ID 與工作表分頁名稱（支援中文表名或英文 table 名）
    const SPREADSHEET_ID = APP_CONFIG.SHEETS.SYS; 
    const SHEET_NAME = '業績日曆'; // 或 '業績日曆'
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

    try {
        const response = await fetch(gvizUrl);
        const text = await response.text();

        // 擷取有效 JSON 物件
        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const rows = JSON.parse(jsonStr).table.rows || [];

        // 單格安全取值輔助（純順序索引）
        const getCellVal = (row, idx) => {
            if (!row || !row.c || !row.c[idx]) return '';
            return String(row.c[idx].f || row.c[idx].v || '').trim();
        };

        // 依欄位 0-Based 順序組裝資料物件
        const calendarList = rows.map(row => ({
            calendar_id:       getCellVal(row, 0),
            calc_month:        getCellVal(row, 1),
            period_start_at:   getCellVal(row, 2),
            closing_date:      getCellVal(row, 3),
            closing_cutoff_at: getCellVal(row, 4),
            supp_date:         getCellVal(row, 5),
            supp_cutoff_at:    getCellVal(row, 6),
            holiday_notes:     getCellVal(row, 7),
            is_sealed:         getCellVal(row, 8) || 'N'
        })).filter(item => /^\d{4}-\d{2}$/.test(item.calc_month)); // 嚴格保留合規年月，自動略過表頭與空白列

        // 注入全域 AppDate 記憶體快取
        AppDate.initPerfCalendars(calendarList);
        console.log(`<i class="fa-solid fa-calendar-check"></i> 業績日曆載入成功（共 ${calendarList.length} 個月）`);

    } catch (err) {
        console.warn('業績日曆載入失敗，已切換至自然月份運作：', err);
    }
}