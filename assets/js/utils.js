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
}

// 支援傳統 Script 標籤引入 (掛載至 window) 或是 ES Module 導出
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}