/**
 * assets/js/vendor-loader.js
 * 專責非同步加載所有第三方 CDN JavaScript 套件
 */
(function() {
    const cssResources = [
        'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css',
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.1/css/all.min.css',
        'https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/css/flag-icons.min.css',
        'https://cdn.datatables.net/3.0.1/css/dataTables.bootstrap5.min.css',
        'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css',
        'https://cdn.jsdelivr.net/npm/swiper@14.0.5/swiper-bundle.min.css',
        'https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css',
        'https://cdnjs.cloudflare.com/ajax/libs/overlayscrollbars/2.12.0/styles/overlayscrollbars.min.css',
        'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700&family=Noto+Sans+TC:wght@300;400;500;700&display=swap'
    ];

    const jsResources = [
        'https://code.jquery.com/jquery-3.7.1.min.js',
        'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.5.4/papaparse.min.js',
        'https://cdn.datatables.net/3.0.1/js/dataTables.min.js',
        'https://cdn.datatables.net/3.0.1/js/dataTables.bootstrap5.min.js',
        'https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js',
        'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js',
        'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
        'https://cdn.jsdelivr.net/npm/swiper@14.0.5/swiper-bundle.min.js',
        'https://cdn.jsdelivr.net/npm/toastify-js@1.12.0/src/toastify.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/overlayscrollbars/2.12.0/browser/overlayscrollbars.browser.es6.min.js',
        'https://cdn.jsdelivr.net/npm/dayjs@1.11.21/dayjs.min.js'
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
            // 4. 全部套件下載完畢後，廣播全域自訂事件 'VendorReady'
            window.dispatchEvent(new CustomEvent('VendorReady'));
        } catch (error) {
            console.error('[Vendor Loader Error]', error);
        }
    }

    initVendorScripts();
})();