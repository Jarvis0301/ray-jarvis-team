/**
 * assets/js/common.js
 * 監聽 VendorReady 事件，載入團隊內部核心 JS 模組並發射 AppReady
 */
(function() {
    'use strict';

    // 團隊內部寫的 JS 模組清單
    const internalModules = [
        '../assets/js/utils.js',
        '../assets/js/dialog.js',
        '../assets/js/sheet-adapter.js'
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
     * 啟動內部模組加載鏈
     */
    function initInternalApp() {

        Promise.all(internalModules.map(src => loadInternalModule(src)))
            .then(() => {
                
                // 全域 UI 工具與事件綁定
                if (window.jQuery) {
                    $(document).ready(function() {
                        
                    });
                }

                // 發射最終全域 READY 事件
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
    Utils.initTheme();

    setDataTable();
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
                lengthMenu: "每頁顯示 _MENU_ 筆資料",
                zeroRecords: "沒有符合的結果",
                info: "顯示第 _START_ 至 _END_ 筆結果，共 _TOTAL_ 筆",
                infoEmpty: "顯示第 0 至 0 筆結果，共 0 筆",
                infoFiltered: "(從 _MAX_ 筆結果中篩選)",
                search: "關鍵字搜尋：",
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
            autoWidth: false,               // 關閉自動寬度計算 (避免欄位擠壓，改由 CSS 控制)
            stateSave: false,               // 重新整理時是否記憶目前的頁碼/排序 (預設關閉)
            destroy: true,                  // 銷毀舊表格，重新建立

            // --- 4. 效能優化 ---
            deferRender: true,              // 延遲渲染 (當資料量大時能顯著提升速度)
            processing: true,               // 讀取/排序時顯示「處理中」提示
            responsive: true                // RWD

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
            
            scrollX (true / "100%")：開啟橫向滾動軸，當表格欄位過多爆出畫面時非常有用。

            scrollY (字串，如 "400px")：固定表格高度並開啟縱向滾動軸。

            deferRender (true / false)：資料量大時僅繪製目前頁面的 DOM，顯著提升載入速度。

            serverSide (true / false)：當資料庫有幾萬筆資料時，開啟由後端 API 處理分頁、搜尋與排序。
            */
        });
    }
}