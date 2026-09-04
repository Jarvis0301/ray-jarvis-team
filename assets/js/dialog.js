// ==========================================================================
// 榮祥團隊 全域 UI 回饋中樞模組 (dialog.js)
// 包含：AppViewportTracker (視野精算), AppDialog (彈窗), AppToast (通知), AppLoading (加載)
// ==========================================================================

class AppViewportTracker {
    /**
     * 精算當前父視窗視野在 iFrame 內部坐標系中的可視幾何區間
     */
    static getMetrics() {
        const isInsideIframe = (window.self !== window.top);
        const iframeWidth = document.documentElement.clientWidth || window.innerWidth;
        const totalIframeHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);

        if (!isInsideIframe) {
            const scrollY = window.scrollY || window.pageYOffset || 0;
            const vh = window.innerHeight || document.documentElement.clientHeight;
            const vw = window.innerWidth || document.documentElement.clientWidth;
            return {
                isIframe: false,
                visibleTop: scrollY,
                visibleBottom: scrollY + vh,
                visibleCenter: scrollY + (vh / 2),
                visibleHeight: vh,
                toastLeft: vw / 2,
                parentWin: window
            };
        }

        try {
            const parentWin = window.parent;
            const frameEl = window.frameElement;
            if (!parentWin || !frameEl) throw new Error("非標準 iFrame 環境");

            const parentInnerHeight = parentWin.innerHeight || parentWin.document.documentElement.clientHeight;
            const parentInnerWidth = parentWin.innerWidth || parentWin.document.documentElement.clientWidth;
            const frameRect = frameEl.getBoundingClientRect(); // iFrame 頂部相對於父視窗當前視野的位移

            // 扣除頂部固定 Header 70px 邊界
            const headerHeight = 70;
            const visibleTopInIframe = Math.max(0, headerHeight - frameRect.top);
            const visibleBottomInIframe = Math.min(totalIframeHeight, parentInnerHeight - frameRect.top);

            const effectiveHeight = Math.max(200, visibleBottomInIframe - visibleTopInIframe);
            const visibleCenterYInIframe = visibleTopInIframe + (effectiveHeight / 2);

            // 雙軌水平座標計算：
            // 電腦版 (>= 992px)：以 iframe 本體為基準置中
            // 手機/平板 (< 992px)：以整個螢幕 (Parent Screen) 為基準置中
            const isMobileOrTablet = parentInnerWidth < 992;
            let targetToastLeft = iframeWidth / 2;

            if (isMobileOrTablet) {
                const screenCenterX = parentInnerWidth / 2;
                targetToastLeft = screenCenterX - frameRect.left;
            }

            return {
                isIframe: true,
                visibleTop: visibleTopInIframe,
                visibleBottom: visibleBottomInIframe,
                visibleCenter: visibleCenterYInIframe,
                visibleHeight: effectiveHeight,
                toastLeft: targetToastLeft,
                parentWin: parentWin
            };
        } catch (e) {
            const vh = window.innerHeight || 600;
            return {
                isIframe: false,
                visibleTop: 20,
                visibleBottom: vh,
                visibleCenter: vh / 2,
                visibleHeight: vh,
                toastLeft: iframeWidth / 2,
                parentWin: window
            };
        }
    }
}

class AppDialog {
    /**
     * 計算父視窗可視高度並將元素精準定位在目前視窗中央
     * @param {jQuery|HTMLElement} targetDialog - 需要置中的 .modal-dialog
     * @param {number} defaultHeight - 預設高度估算
     */
    static centerInViewport(targetDialog, defaultHeight = 480) {
        try {
            const $dialog = $(targetDialog);
            if (!$dialog.length) return;

            const metrics = AppViewportTracker.getMetrics();
            $dialog.removeClass('modal-dialog-centered');

            // 動態安全高度限制：防止超長表單超出螢幕可視區
            const maxModalHeight = Math.max(280, metrics.visibleHeight - 60);
            $dialog.find('.modal-content').css({
                'max-height': maxModalHeight + 'px',
                'display': 'flex',
                'flex-direction': 'column'
            });
            $dialog.find('.modal-body').css({
                'overflow-y': 'auto',
                'max-height': (maxModalHeight - 130) + 'px'
            });

            // 重新量測套用限制後的真實高度
            const dialogHeight = $dialog.outerHeight() || defaultHeight;
            let targetMarginTop = metrics.visibleCenter - (dialogHeight / 2);

            // 邊界防護：避免貼齊或衝出頂部
            const maxIframeHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
            targetMarginTop = Math.max(metrics.visibleTop + 15, Math.min(targetMarginTop, maxIframeHeight - dialogHeight - 20));

            $dialog.css({
                'margin-top': targetMarginTop + 'px',
                'margin-bottom': '30px'
            });
        } catch (e) {
            console.warn("Iframe viewport centering notice:", e);
        }
    }

    /**
     * 手動綁定單一 Modal 視野自動追蹤 (向下相容)
     */
    static bindIframeAutoCenter(modalSelector) {
        const $modal = $(modalSelector);
        if (!$modal.length) return;

        $modal.off('show.bs.modal.autoCenter shown.bs.modal.autoCenter').on('show.bs.modal.autoCenter shown.bs.modal.autoCenter', function () {
            AppDialog.centerInViewport($(this).find('.modal-dialog'));
        });
    }

    static _getOrCreateModal() {
        let modalElem = document.getElementById('globalAppModal');
        if (!modalElem) {
            const modalHtml = `
            <div class="modal fade" id="globalAppModal" tabindex="-1" aria-hidden="true" style="z-index: 999999;">
                <div class="modal-dialog">
                    <div class="modal-content bg-dark text-light border-secondary shadow-lg">
                        <div class="modal-header border-secondary">
                            <h5 class="modal-title" id="globalAppModalTitle">
                                <i class="fa-solid fa-circle-info text-info me-2" id="globalAppModalIcon"></i>
                                <span id="globalAppModalTitleText">提示訊息</span>
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" id="globalAppModalBody"></div>
                        <div class="modal-footer border-secondary" id="globalAppModalFooter">
                            <button type="button" class="btn btn-muted btn-sm rounded-pill px-3" id="globalAppModalCancelBtn" data-bs-dismiss="modal">
                                <i class="fa-solid fa-xmark"></i> 取消
                            </button>
                            <button type="button" class="btn btn-secondary btn-sm rounded-pill px-3" id="globalAppModalConfirmBtn">
                                <i class="fa-solid fa-check"></i> 確定
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modalElem = document.getElementById('globalAppModal');
        }
        return modalElem;
    }

    static alert(message, onConfirmOrOptions, options = {}) {
        let onConfirm = null;
        if (typeof onConfirmOrOptions === 'function') {
            onConfirm = onConfirmOrOptions;
        } else if (typeof onConfirmOrOptions === 'object') {
            options = onConfirmOrOptions;
            onConfirm = options.onConfirm || null;
        }

        return new Promise((resolve) => {
            const modalElem = this._getOrCreateModal();
            const bsModal = bootstrap.Modal.getOrCreateInstance(modalElem);

            const title = options.title || '系統提示';
            const iconClass = options.icon || 'fa-solid fa-circle-info text-info';
            const btnText = options.btnText || '確定';
            const btnClass = options.btnClass || 'btn-info';

            document.getElementById('globalAppModalTitleText').textContent = title;
            document.getElementById('globalAppModalIcon').className = `${iconClass} me-2`;
            document.getElementById('globalAppModalBody').innerHTML = message;

            const cancelBtn = document.getElementById('globalAppModalCancelBtn');
            const confirmBtn = document.getElementById('globalAppModalConfirmBtn');

            cancelBtn.style.display = 'none';
            confirmBtn.className = `btn ${btnClass} btn-sm rounded-pill px-4`;
            confirmBtn.textContent = btnText;

            const handleConfirm = () => {
                confirmBtn.removeEventListener('click', handleConfirm);
                bsModal.hide();
                if (onConfirm) onConfirm();
                resolve(true);
            };

            const handleHidden = () => {
                modalElem.removeEventListener('hidden.bs.modal', handleHidden);
                confirmBtn.removeEventListener('click', handleConfirm);
                resolve(true);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            modalElem.addEventListener('hidden.bs.modal', handleHidden, { once: true });

            bsModal.show();
        });
    }

    static confirm(message, onConfirmOrOptions, options = {}) {
        let onConfirm = null;
        if (typeof onConfirmOrOptions === 'function') {
            onConfirm = onConfirmOrOptions;
        } else if (typeof onConfirmOrOptions === 'object') {
            options = onConfirmOrOptions;
            onConfirm = options.onConfirm || null;
        }

        return new Promise((resolve) => {
            const modalElem = this._getOrCreateModal();
            const bsModal = bootstrap.Modal.getOrCreateInstance(modalElem);

            const title = options.title || '確認操作';
            const iconClass = options.icon || 'fa-solid fa-triangle-exclamation text-warning';
            const confirmText = options.confirmText || '確認';
            const cancelText = options.cancelText || '取消';
            const confirmClass = options.confirmClass || 'btn-danger';

            document.getElementById('globalAppModalTitleText').textContent = title;
            document.getElementById('globalAppModalIcon').className = `${iconClass} me-2`;
            document.getElementById('globalAppModalBody').innerHTML = message;

            const cancelBtn = document.getElementById('globalAppModalCancelBtn');
            const confirmBtn = document.getElementById('globalAppModalConfirmBtn');

            cancelBtn.style.display = 'inline-block';
            cancelBtn.textContent = cancelText;

            confirmBtn.className = `btn ${confirmClass} btn-sm rounded-pill px-3`;
            confirmBtn.textContent = confirmText;

            let userChoice = false;

            const handleConfirm = () => {
                userChoice = true;
                confirmBtn.removeEventListener('click', handleConfirm);
                bsModal.hide();
                if (onConfirm) onConfirm();
            };

            const handleHidden = () => {
                modalElem.removeEventListener('hidden.bs.modal', handleHidden);
                confirmBtn.removeEventListener('click', handleConfirm);
                resolve(userChoice);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            modalElem.addEventListener('hidden.bs.modal', handleHidden, { once: true });

            bsModal.show();
        });
    }
}

// ==========================================
// 全域通用 Toast 通知模組 (AppToast)
// ==========================================
class AppToast {
    static _ensureContainer() {
        let container = document.getElementById('globalToastContainer');
        if (!container) {
            const html = `<div id="globalToastContainer" class="toast-container-custom"></div>`;
            document.body.insertAdjacentHTML('beforeend', html);
            container = document.getElementById('globalToastContainer');

            // 綁定父視窗滾動與 RWD 縮放事件，即時維持水平置中與可視頂部
            const metrics = AppViewportTracker.getMetrics();
            if (metrics.parentWin) {
                const updateToastPos = () => {
                    const m = AppViewportTracker.getMetrics();
                    container.style.top = (m.visibleTop + 20) + 'px';
                    container.style.left = m.toastLeft + 'px';
                };
                metrics.parentWin.addEventListener('scroll', updateToastPos, { passive: true });
                metrics.parentWin.addEventListener('resize', updateToastPos, { passive: true });
            }
        }

        // 每次彈出前立即校準座標
        const m = AppViewportTracker.getMetrics();
        container.style.top = (m.visibleTop + 20) + 'px';
        container.style.left = m.toastLeft + 'px';

        return container;
    }

    static show(message, type = 'success', duration = 3000) {
        const container = this._ensureContainer();
        const toastId = 'toast_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        let iconHtml = '<i class="fa-solid fa-circle-check text-success me-2"></i> ';
        let borderClass = 'border-success-subtle';

        if (type === 'info') {
            iconHtml = '<i class="fa-solid fa-circle-info text-info me-2"></i> ';
            borderClass = 'border-info-subtle';
        } else if (type === 'warning') {
            iconHtml = '<i class="fa-solid fa-triangle-exclamation text-warning me-2"></i> ';
            borderClass = 'border-warning-subtle';
        } else if (type === 'danger' || type === 'error') {
            iconHtml = '<i class="fa-solid fa-circle-xmark text-danger me-2"></i> ';
            borderClass = 'border-danger-subtle';
        }

        const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-white bg-dark border ${borderClass} shadow-lg mb-2" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body d-flex align-items-center">
                    ${iconHtml}
                    <span>${message}</span>
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>`;

        container.insertAdjacentHTML('beforeend', toastHtml);
        const toastEl = document.getElementById(toastId);
        const bsToast = new bootstrap.Toast(toastEl, { delay: duration });

        toastEl.addEventListener('hidden.bs.toast', () => {
            toastEl.remove();
        });

        bsToast.show();
    }

    static success(msg, duration) { this.show(msg, 'success', duration); }
    static info(msg, duration) { this.show(msg, 'info', duration); }
    static warning(msg, duration) { this.show(msg, 'warning', duration); }
    static error(msg, duration) { this.show(msg, 'danger', duration); }
}

// ==========================================
// 全域通用 Loading 遮罩模組 (AppLoading)
// ==========================================
class AppLoading {
    static _scrollListener = null;

    static _ensureLoadingOverlay() {
        let $overlay = $('#globalLoadingOverlay');
        if (!$overlay.length) {
            $('body').append(`
                <div id="globalLoadingOverlay" class="uvaco-loading-overlay">
                    <div class="uvaco-loading-card" id="globalLoadingCard">
                        <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <h6 class="text-light fw-bold mb-1" id="globalLoadingTitle">
                            <i class="fa-solid fa-spinner fa-spin"></i> 資料處理中...
                        </h6>
                        <div class="text-muted small" id="globalLoadingDesc">正在與雲端安全通訊，請稍候</div>
                    </div>
                </div>
            `);
            $overlay = $('#globalLoadingOverlay');
        }
        return $overlay;
    }

    static _repositionCard() {
        const $card = $('#globalLoadingCard');
        if (!$card.length) return;

        const metrics = AppViewportTracker.getMetrics();
        const cardHeight = $card.outerHeight() || 180;
        let targetMarginTop = metrics.visibleCenter - (cardHeight / 2);

        const maxIframeHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        targetMarginTop = Math.max(metrics.visibleTop + 20, Math.min(targetMarginTop, maxIframeHeight - cardHeight - 20));

        $card.css('margin-top', targetMarginTop + 'px');
    }

    static show(title = '', desc = '') {
        const $overlay = this._ensureLoadingOverlay();

        if (title) $('#globalLoadingTitle').html(title);
        if (desc) $('#globalLoadingDesc').text(desc);

        $overlay.addClass('active');
        this._repositionCard();

        const metrics = AppViewportTracker.getMetrics();
        if (metrics.parentWin && !this._scrollListener) {
            this._scrollListener = () => {
                this._repositionCard();
            };
            metrics.parentWin.addEventListener('scroll', this._scrollListener, { passive: true });
            metrics.parentWin.addEventListener('resize', this._scrollListener, { passive: true });
        }
    }

    static hide() {
        $('#globalLoadingOverlay').removeClass('active');

        const metrics = AppViewportTracker.getMetrics();
        if (metrics.parentWin && this._scrollListener) {
            metrics.parentWin.removeEventListener('scroll', this._scrollListener);
            metrics.parentWin.removeEventListener('resize', this._scrollListener);
            this._scrollListener = null;
        }
    }
}

// ==========================================
// 全域委派事件：自動支援所有 Modal 的視野追蹤置中
// ==========================================
$(document).ready(function () {
    let activeModalScrollHandler = null;

    $(document).on('show.bs.modal shown.bs.modal', '.modal', function () {
        const $dialog = $(this).find('.modal-dialog');
        AppDialog.centerInViewport($dialog);

        const metrics = AppViewportTracker.getMetrics();
        if (metrics.parentWin && !activeModalScrollHandler) {
            activeModalScrollHandler = () => {
                const $openModal = $('.modal.show');
                if ($openModal.length) {
                    AppDialog.centerInViewport($openModal.find('.modal-dialog'));
                }
            };
            metrics.parentWin.addEventListener('scroll', activeModalScrollHandler, { passive: true });
            metrics.parentWin.addEventListener('resize', activeModalScrollHandler, { passive: true });
        }
    });

    $(document).on('hidden.bs.modal', '.modal', function () {
        if (!$('.modal.show').length) {
            const metrics = AppViewportTracker.getMetrics();
            if (metrics.parentWin && activeModalScrollHandler) {
                metrics.parentWin.removeEventListener('scroll', activeModalScrollHandler);
                metrics.parentWin.removeEventListener('resize', activeModalScrollHandler);
                activeModalScrollHandler = null;
            }
        }
    });
});