// ==========================================
// 榮祥團隊 全域 UI 回饋中樞模組 (app-dialog.js)
// 包含：AppDialog (彈窗/置中)、AppToast (輕量通知)、AppLoading (視窗垂直置中加載)
// ==========================================

class AppDialog {
    /**
     * 計算父視窗可視高度並將元素精準定位在目前視窗中央 (支援 iframe)
     * @param {jQuery|HTMLElement} targetDialog - 需要置中的 .modal-dialog 或 .uvaco-loading-card
     * @param {number} defaultHeight - 預設高度
     */
    static centerInViewport(targetDialog, defaultHeight = 480) {
        try {
            const isInsideIframe = (window.self !== window.top);
            if (!isInsideIframe) return;

            const parentWin = window.parent;
            const frameEl = window.frameElement;
            if (!parentWin || !frameEl) return;

            const parentScrollY = parentWin.scrollY || parentWin.pageYOffset || 0;
            const parentInnerHeight = parentWin.innerHeight || document.documentElement.clientHeight;
            const frameRect = frameEl.getBoundingClientRect();
            const iframeTopInParent = frameRect.top + parentScrollY;

            // 計算父視窗當前視野中心點在 iframe 內部的相對 Y 座標
            const parentCenterYInIframe = (parentScrollY + parentInnerHeight / 2) - iframeTopInParent;

            const $dialog = $(targetDialog);
            $dialog.removeClass('modal-dialog-centered');

            const dialogHeight = $dialog.outerHeight() || defaultHeight;
            let targetMarginTop = parentCenterYInIframe - (dialogHeight / 2);

            // 邊界防護：避免超出頂部或底部
            const iframeHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
            targetMarginTop = Math.max(20, Math.min(targetMarginTop, iframeHeight - dialogHeight - 50));

            $dialog.css({
                'margin-top': targetMarginTop + 'px',
                'margin-bottom': '30px'
            });
        } catch (e) {
            console.warn("Iframe viewport centering notice:", e);
        }
    }

    /**
     * 為任意 Bootstrap Modal 綁定 iframe 視窗動態追蹤置中事件
     * @param {string|HTMLElement} modalSelector - Modal DOM 或選擇器
     */
    static bindIframeAutoCenter(modalSelector) {
        const $modal = $(modalSelector);
        if (!$modal.length) return;

        $modal.off('show.bs.modal.autoCenter').on('show.bs.modal.autoCenter', function () {
            AppDialog.centerInViewport($(this).find('.modal-dialog'));
        });

        $modal.off('shown.bs.modal.autoCenter').on('shown.bs.modal.autoCenter', function () {
            AppDialog.centerInViewport($(this).find('.modal-dialog'));
        });
    }

    static _getOrCreateModal() {
        let modalElem = document.getElementById('globalAppModal');
        if (!modalElem) {
            const modalHtml = `
            <div class="modal fade" id="globalAppModal" tabindex="-1" aria-hidden="true" style="z-index: 999999;">
                <div class="modal-dialog modal-dialog-centered">
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
                            <button type="button" class="btn btn-outline-secondary btn-sm rounded-pill px-3" id="globalAppModalCancelBtn" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-primary btn-sm rounded-pill px-3" id="globalAppModalConfirmBtn">確定</button>
                        </div>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modalElem = document.getElementById('globalAppModal');
            AppDialog.bindIframeAutoCenter(modalElem);
        }
        return modalElem;
    }

    /**
     * 全域 Alert 提示彈窗
     */
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

    /**
     * 全域 Confirm 確認詢問彈窗
     */
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
        }
        return container;
    }

    /**
     * 觸發 Toast 通知
     * @param {string} message 訊息文字或 HTML
     * @param {string} type 類型 ('success' | 'info' | 'warning' | 'danger')
     * @param {number} duration 顯示時間 (毫秒)
     */
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
// 全域通用 Loading 遮罩模組 (AppLoading) - 視窗可視範圍垂直置中
// ==========================================
class AppLoading {
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

    /**
     * 啟動 Loading 遮罩並垂直置中於可視範圍
     * @param {string} title 標題 HTML
     * @param {string} desc 說明文字
     */
    static show(title = '', desc = '') {
        const $overlay = this._ensureLoadingOverlay();
        const $card = $('#globalLoadingCard');

        if (title) $('#globalLoadingTitle').html(title);
        if (desc) $('#globalLoadingDesc').text(desc);

        $overlay.addClass('active');

        // 在可視範圍內精準垂直置中卡片
        AppDialog.centerInViewport($card, 180);
    }

    /**
     * 隱藏 Loading 遮罩
     */
    static hide() {
        $('#globalLoadingOverlay').removeClass('active');
    }
}