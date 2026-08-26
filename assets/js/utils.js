class Utils {
    static #themeObserver = null;

    static initTheme(options = {}) {
        const { defaultTheme = "dark-green" } = options;
        let selectedTheme = defaultTheme;
        const isInIframe = window.self !== window.top;

        if (isInIframe) {
            try {
                const parentTheme = window.parent.document.documentElement.getAttribute("data-bs-theme");
                if (parentTheme) selectedTheme = parentTheme;
            } catch (e) {
                console.warn("[Utils] 無法直接讀取父頁面 DOM，改用 URL 邏輯判斷。");
            }
        }

        if (!isInIframe || !selectedTheme) {
            const pathname = window.location.pathname;
            const urlParams = new URLSearchParams(window.location.search);
            const paramTheme = urlParams.get("theme");

            if (paramTheme) {
                selectedTheme = paramTheme;
            } else if (pathname.includes("/team/")) {
                selectedTheme = "dark-blue";
            } else if (pathname.includes("/hub/")) {
                selectedTheme = "dark-purple";
            } else if (pathname.includes("/health/")) {
                selectedTheme = "dark-green";
            }
        }

        this.setTheme(selectedTheme);
        if (isInIframe) this.#observeParentTheme();
        return selectedTheme;
    }

    static setTheme(themeName) {
        if (themeName) {
            document.documentElement.setAttribute("data-bs-theme", themeName);
        }
    }

    static #observeParentTheme() {
        try {
            if (this.#themeObserver) this.#themeObserver.disconnect();
            this.#themeObserver = new MutationObserver(() => {
                const newParentTheme = window.parent.document.documentElement.getAttribute("data-bs-theme");
                if (newParentTheme) this.setTheme(newParentTheme);
            });
            this.#themeObserver.observe(window.parent.document.documentElement, {
                attributes: true,
                attributeFilter: ["data-bs-theme"],
            });
        } catch (e) {}
    }

    static equalizeWidths(selector, extraPadding = 10) {
        const $targets = (typeof selector === 'string') ? $(selector) : selector;
        if (!$targets || !$targets.length) return;

        $targets.css('width', '');
        let maxWidth = 0;
        $targets.each(function () {
            const width = $(this).outerWidth();
            if (width > maxWidth) maxWidth = width;
        });

        if (maxWidth > 0) {
            $targets.css('width', (maxWidth + extraPadding) + 'px');
        }
    }

    static handleImgError(imgElement, config = {}, height, width) {
        if (!imgElement) return;

        let currentSrc = imgElement.src || '';
        if (currentSrc.endsWith('.jpg') && !imgElement.dataset.triedPng) {
            imgElement.dataset.triedPng = "true";
            imgElement.src = currentSrc.replace(/\.jpg$/, '.png');
            return;
        }

        let iconClass = 'fa-solid fa-boxes-stacked';
        let targetHeight = '200px';
        let targetWidth = '100%';
        let extraClass = 'rounded-top';
        let fontSizeClass = 'fs-1';

        if (typeof config === 'string') {
            if (config.trim()) iconClass = config.trim();
            if (height) targetHeight = typeof height === 'number' ? `${height}px` : height;
            if (width) targetWidth = typeof width === 'number' ? `${width}px` : width;
        } else if (typeof config === 'object' && config !== null) {
            iconClass = config.icon || config.iconClass || iconClass;
            targetHeight = config.height ? (typeof config.height === 'number' ? `${config.height}px` : config.height) : targetHeight;
            targetWidth = config.width ? (typeof config.width === 'number' ? `${config.width}px` : config.width) : targetWidth;
            if (config.extraClass) extraClass = config.extraClass;
            if (config.fontSize) fontSizeClass = config.fontSize;
        }

        const styleAttr = `height: ${targetHeight}; width: ${targetWidth};`;
        const placeholderHtml = `
            <div class="img-placeholder d-flex align-items-center justify-content-center bg-secondary-subtle text-muted ${extraClass}" style="${styleAttr}">
                <i class="${iconClass} ${fontSizeClass}"></i>
            </div>
        `;

        if (typeof $ !== 'undefined' && $.fn && $.fn.replaceWith) {
            $(imgElement).replaceWith(placeholderHtml);
        } else {
            imgElement.outerHTML = placeholderHtml;
        }
    }
}

if (typeof window !== 'undefined') {
    window.Utils = Utils;
}

window.imgError = function(imgElement, config, height, width) {
    if (window.Utils && typeof window.Utils.handleImgError === 'function') {
        window.Utils.handleImgError(imgElement, config, height, width);
    } else {
        imgElement.style.opacity = '0';
    }
};