/**
 * assets/js/common.js
 * 監聽 VendorReady 事件，載入團隊內部核心 JS 模組並發射 AppReady
 */
(function() {
    'use strict';

    // 團隊內部寫的 JS 模組清單
    const internalModules = [
        '/assets/js/utils.js'
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
                        // 初始化
                        init();
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

// 初始化
function init() {
    Utils.initTheme();
}
