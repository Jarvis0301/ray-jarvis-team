/**
 * 榮祥團隊全域套件本地載入器 (Local Vendor Loader)
 * 自動注入 assets/vendors/ 內之離線第三方套件
 */
(function() {
    // 1. 動態計算 assets/vendors/ 之絕對/相對根路徑
    let basePath = '';
    const currentScript = document.currentScript;
    if (currentScript && currentScript.src) {
        // 從 .../assets/js/vendor-loader.js 推算 ../vendors/
        const scriptUrl = currentScript.src;
        basePath = scriptUrl.substring(0, scriptUrl.lastIndexOf('/js/')) + '/vendors/';
    } else {
        // 退回預設相對路徑
        basePath = '../assets/vendors/';
    }

    // 取得當前網頁相對於專案 assets 的相對路徑層級
    const cssResources = [
        basePath + 'bootstrap-5.3.8-dist/css/bootstrap.min.css',
        basePath + 'fontawesome-7.3.1/css/all.min.css',
        basePath + 'flag-icons-7.2.3/css/flag-icons.min.css',
        basePath + 'datatables-3.0.1/css/dataTables.bootstrap5.min.css',
        basePath + 'select2-4.1.0-rc.0/css/select2.min.css',
        basePath + 'swiper-14.0.5/css/swiper-bundle.min.css',
        basePath + 'toastify-1.12.0/css/toastify.min.css',
        basePath + 'overlayscrollbars-2.12.0/css/overlayscrollbars.min.css',
        'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700&family=Noto+Sans+TC:wght@300;400;500;700&display=swap'
    ];

    const jsResources = [
        basePath + 'jquery-3.7.1/jquery-3.7.1.min.js',
        basePath + 'bootstrap-5.3.8-dist/js/bootstrap.bundle.min.js',
        basePath + 'papaparse-5.5.4/papaparse.min.js',
        basePath + 'datatables-3.0.1/js/dataTables.min.js',
        basePath + 'datatables-3.0.1/js/dataTables.bootstrap5.min.js',
        basePath + 'chartjs-4.5.0/chart.umd.min.js',
        basePath + 'select2-4.1.0-rc.0/js/select2.min.js',
        basePath + 'sheetjs-0.18.5/xlsx.full.min.js',
        basePath + 'swiper-14.0.5/js/swiper-bundle.min.js',
        basePath + 'toastify-1.12.0/js/toastify.min.js',
        basePath + 'overlayscrollbars-2.12.0/js/overlayscrollbars.browser.es6.min.js',
        basePath + 'dayjs-1.11.21/dayjs.min.js'
    ];

    // 1. 同步注入 CSS 資源
    cssResources.forEach(function(href) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    });

    // 2. 封裝封閉式 Promise 腳本載入器
    function loadScript(src) {
        return new Promise(function(resolve, reject) {
            const script = document.createElement('script');
            script.src = src;
            script.onload = function() {
                resolve(src);
            };
            script.onerror = function() {
                reject(new Error("Failed to load script: " + src));
            };
            document.head.appendChild(script);
        });
    }

    // 3. 依序鏈式載入 JS 檔案
    async function initVendorScripts() {
        try {
            for (const src of jsResources) {
                await loadScript(src);
            }
            // 4. 全部套件下載完畢後，廣播全域自訂事件 'vendorReady'
            window.dispatchEvent(new CustomEvent('vendorReady'));
        } catch (error) {
            console.error('[Vendor Loader Error]', error);
        }
    }

    initVendorScripts();
})();