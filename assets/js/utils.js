/**
 * utils.js
 * 共用工具管理類別
 */
class Utils {
    // 儲存 MutationObserver 實例，避免重複監聽
    static #themeObserver = null;

    /**
     * 設定與初始化網站主題
     * @param {Object} [options] - 設定選項
     * @param {string} [options.defaultTheme="dark-green"] - 預設主題
     * @returns {string} 當前套用的主題名稱
     */
    static initTheme(options = {}) {
        const { defaultTheme = "dark-green" } = options;
        let selectedTheme = defaultTheme;

        // 1. 判斷當前頁面是否位於 iframe 內部
        const isInIframe = window.self !== window.top;

        if (isInIframe) {
            try {
                // 情境 A：同源 (Same-Origin) iframe -> 直接繼承父頁面的 data-bs-theme
                const parentTheme = window.parent.document.documentElement.getAttribute("data-bs-theme");
                if (parentTheme) {
                    selectedTheme = parentTheme;
                }
            } catch (e) {
                console.warn("[Utils] 無法直接讀取父頁面 DOM，改用 URL 邏輯判斷。");
            }
        }

        // 2. 如果不是 iframe，或是 iframe 沒抓到父頁面主題，則執行網址判斷邏輯
        if (!isInIframe || !selectedTheme) {
            const pathname = window.location.pathname;
            const urlParams = new URLSearchParams(window.location.search);
            const paramTheme = urlParams.get("theme");

            // 【優先權 1】網址帶有 ?theme=xxx 參數
            if (paramTheme) {
                selectedTheme = paramTheme;
            }
            // 【優先權 2】依據網址路徑 (Pathname) 判斷
            else if (pathname.includes("/team/")) {
                selectedTheme = "dark-blue";
            } else if (pathname.includes("/hub/")) {
                selectedTheme = "dark-purple";
            } else if (pathname.includes("/health/")) {
                selectedTheme = "dark-green";
            }
        }

        // 3. 立即套用主題至當前 HTML 標籤
        this.setTheme(selectedTheme);

        // 4. 【即時同步】若在 iframe 內，監聽父頁面的主題動態切換
        if (isInIframe) {
            this.#observeParentTheme();
        }

        return selectedTheme;
    }

    /**
     * 手動套用指定主題至 HTML 標籤
     * @param {string} themeName - 主題名稱 (例如: 'dark-blue', 'dark-green')
     */
    static setTheme(themeName) {
        if (themeName) {
            document.documentElement.setAttribute("data-bs-theme", themeName);
        }
    }

    /**
     * 監聽父頁面主題變化 (私有方法)
     */
    static #observeParentTheme() {
        try {
            // 若已有監聽器存在，先斷開連線，防止重複綁定監聽
            if (this.#themeObserver) {
                this.#themeObserver.disconnect();
            }

            this.#themeObserver = new MutationObserver(() => {
                const newParentTheme = window.parent.document.documentElement.getAttribute("data-bs-theme");
                if (newParentTheme) {
                    this.setTheme(newParentTheme);
                }
            });

            // 監聽父頁面 <html> 的 data-bs-theme 屬性變化
            this.#themeObserver.observe(window.parent.document.documentElement, {
                attributes: true,
                attributeFilter: ["data-bs-theme"],
            });
        } catch (e) {
            // 跨網域保護靜默處理
        }
    }

    /**
     * 統一指定按鈕/標籤群組的寬度（以最寬者為準）
     * @param {string|jQuery} selector - 目標元素的選擇器或 jQuery 物件
     * @param {number} [extraPadding=10] - 額外加上的像素寬度（預設 10px）
     */
    static equalizeWidths(selector, extraPadding = 10) {
        const $targets = (typeof selector === 'string') ? $(selector) : selector;
        if (!$targets || !$targets.length) return;

        // 1. 重設寬度為 auto，確保量測到正確的原生文字內容寬度
        $targets.css('width', '');

        let maxWidth = 0;

        // 2. 找出最寬的元素
        $targets.each(function () {
            const width = $(this).outerWidth();
            if (width > maxWidth) {
                maxWidth = width;
            }
        });

        // 3. 一次性套用最寬寬度 + 緩衝值
        if (maxWidth > 0) {
            $targets.css('width', (maxWidth + extraPadding) + 'px');
        }
    }

    /**
     * 全域圖片載入失敗容錯處理與自訂 Placeholder 生成器
     * @param {HTMLElement} imgElement - 觸發 onerror 事件的 <img> DOM 元素
     * @param {Object|string} [config='fa-solid fa-boxes-stacked'] - 自訂 Icon Class 字串，或完整配置物件
     * @param {string|number} [height='200px'] - Placeholder 高度 (例如 '200px', '350px', '100%')
     * @param {string|number} [width='100%'] - Placeholder 寬度 (例如 '100%', '300px')
     */
    static handleImgError(imgElement, config = {}, height, width) {
        if (!imgElement) return;

        let currentSrc = imgElement.src || '';

        // 1. 自動副檔名備援機制 (JPG 載入失敗後自動嘗試 PNG)
        if (currentSrc.endsWith('.jpg') && !imgElement.dataset.triedPng) {
            imgElement.dataset.triedPng = "true";
            imgElement.src = currentSrc.replace(/\.jpg$/, '.png');
            return;
        }

        // 2. 參數預設值與適配器 (相容位置傳參與物件傳參)
        let iconClass = 'fa-solid fa-boxes-stacked';
        let targetHeight = '200px';
        let targetWidth = '100%';
        let extraClass = 'rounded-top';
        let fontSizeClass = 'fs-1';

        if (typeof config === 'string') {
            // 位置傳參模式: Utils.handleImgError(this, 'fa-solid fa-image', '350px', '100%')
            if (config.trim()) iconClass = config.trim();
            if (height) targetHeight = typeof height === 'number' ? `${height}px` : height;
            if (width) targetWidth = typeof width === 'number' ? `${width}px` : width;
        } else if (typeof config === 'object' && config !== null) {
            // 物件傳參模式: Utils.handleImgError(this, { icon: '...', height: '300px' })
            iconClass = config.icon || config.iconClass || iconClass;
            targetHeight = config.height ? (typeof config.height === 'number' ? `${config.height}px` : config.height) : targetHeight;
            targetWidth = config.width ? (typeof config.width === 'number' ? `${config.width}px` : config.width) : targetWidth;
            if (config.extraClass) extraClass = config.extraClass;
            if (config.fontSize) fontSizeClass = config.fontSize;
        }

        // 3. 組裝兼具 RWD 與深色主題的 Placeholder HTML (恪守 Font Awesome 與半形空白規範)
        const styleAttr = `height: ${targetHeight}; width: ${targetWidth};`;
        const placeholderHtml = `
            <div class="img-placeholder d-flex align-items-center justify-content-center bg-secondary-subtle text-muted ${extraClass}" style="${styleAttr}">
                <i class="${iconClass} ${fontSizeClass}"></i>
            </div>
        `;

        // 4. 安全替換 DOM 節點 (相容原生 DOM 與 jQuery)
        if (typeof $ !== 'undefined' && $.fn && $.fn.replaceWith) {
            $(imgElement).replaceWith(placeholderHtml);
        } else {
            imgElement.outerHTML = placeholderHtml;
        }
    }

    /**
     * 全域圖片載入失敗容錯處理與自訂 Placeholder 生成器
     * @param {HTMLElement} imgElement - 觸發 onerror 事件的 <img> DOM 元素
     * @param {Object|string} [config='fa-solid fa-boxes-stacked'] - 自訂 Icon Class 字串，或完整配置物件
     * @param {string|number} [height='200px'] - Placeholder 高度 (例如 '200px', '350px', '100%')
     * @param {string|number} [width='100%'] - Placeholder 寬度 (例如 '100%', '300px')
     */
    static handleImgError(imgElement, config = {}, height, width) {
        if (!imgElement) return;

        let currentSrc = imgElement.src || '';

        // JPG 載入失敗自動嘗試 PNG
        if (currentSrc.endsWith('.jpg') && !imgElement.dataset.triedPng) {
            imgElement.dataset.triedPng = "true";
            imgElement.src = currentSrc.replace(/\.jpg$/, '.png');
            return;
        }

        // 參數適配處理
        let iconClass = 'fa-solid fa-boxes-stacked';
        let targetHeight = '200px';
        let targetWidth = '100%';
        let extraClass = 'rounded-top';

        if (typeof config === 'string') {
            if (config.trim()) iconClass = config.trim();
            if (height) targetHeight = typeof height === 'number' ? `${height}px` : height;
            if (width) targetWidth = typeof width === 'number' ? `${width}px` : width;
        } else if (typeof config === 'object' && config !== null) {
            iconClass = config.icon || config.iconClass || iconClass;
            targetHeight = config.height ? (typeof config.height === 'number' ? `${config.height}px` : config.height) : targetHeight;
            targetWidth = config.width ? (typeof config.width === 'number' ? `${config.width}px` : config.width) : targetWidth;
            if (config.extraClass) extraClass = config.extraClass;
        }

        const placeholderHtml = `
            <div class="img-placeholder d-flex align-items-center justify-content-center bg-secondary-subtle text-muted ${extraClass}" style="height: ${targetHeight}; width: ${targetWidth};">
                <i class="${iconClass} fs-1"></i>
            </div>
        `;

        if (typeof $ !== 'undefined' && $.fn && $.fn.replaceWith) {
            $(imgElement).replaceWith(placeholderHtml);
        } else {
            imgElement.outerHTML = placeholderHtml;
        }
    }
}

// 支援傳統 Script 標籤引入 (掛載至 window) 或是 ES Module 導出
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}

window.Utils = Utils;

// 全域向下相容與時序安全橋接器 (防範 common.js 載入極速觸發時的死鎖)
window.imgError = function(imgElement, config, height, width) {
    if (window.Utils && typeof window.Utils.handleImgError === 'function') {
        window.Utils.handleImgError(imgElement, config, height, width);
    } else {
        // 極限防護：若 Utils 尚未初始化完成，先隱藏避免破圖
        imgElement.style.opacity = '0';
    }
};