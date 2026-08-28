// ==========================================
// 榮祥團隊 全域 UI 回饋中樞模組 (app-dialog.js)
// 包含：AppDialog (彈窗/動態置中)、AppToast (可視角通知)、AppLoading (可視角遮罩)
// ==========================================

class AppDialog {
    /**
     * 統一量測父視窗可視範圍在 iFrame 內部的精確幾何座標
     * @returns {Object} { visibleTop, visibleHeight, centerY, isInsideIframe }
     */
    static getViewportMetrics() {
        const isInsideIframe = (window.self !== window.top);
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const innerH = window.innerHeight || document.documentElement.clientHeight;

        if (!isInsideIframe) {
            return {
                isInsideIframe: false,
                visibleTop: scrollY,
                visibleHeight: innerH,
                centerY: scrollY + (innerH / 2)
            };
        }

        try {
            const parentWin = window.parent;
            const frameEl = window.frameElement;
            if (!parentWin || !frameEl) throw new Error("無法存取父層 frame");

            const parentInnerH = parentWin.innerHeight || parentWin.document.documentElement.clientHeight;
            const frameRect = frameEl.getBoundingClientRect(); // iFrame 頂部相對父視窗可視頂部的距離

            // 幾何推導：frameRect.top 為負值時表示 iFrame 頂端已被往上捲動
            const visibleTop = Math.max(0, -frameRect.top);
            const centerY = visibleTop + (parentInnerH / 2);

            return {
                isInsideIframe: true,
                visibleTop: visibleTop,
                visibleHeight: parentInnerH,
                centerY: centerY
            };
        } catch (e) {
            return {
                isInsideIframe: false,
                visibleTop: scrollY,
                visibleHeight: innerH,
                centerY: scrollY + (innerH / 2)
            };
        }
    }

    /**
     * 將指定的 Modal Dialog 或 Loading Card 動態定位在目前使用者視野中央
     * @param {jQuery|HTMLElement} targetDialog - 需要置中的 .modal-dialog 或 .uvaco-loading-card
     * @param {number} defaultHeight - 預設高度緩衝
     */
    static centerInViewport(targetDialog, defaultHeight = 400) {
        try {
            const vp = this.getViewportMetrics();
            const $dialog = $(targetDialog);
            $dialog.removeClass('modal-dialog-centered');

            const dialogHeight = $dialog.outerHeight() || defaultHeight;
            let targetMarginTop = vp.centerY - (dialogHeight / 2);

            // 邊界防護：避免超出子頁面頂部或底部
            const maxDocHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
            targetMarginTop = Math.max(20, Math.min(targetMarginTop, maxDocHeight - dialogHeight - 40));

            $dialog.css({
                'margin-top': targetMarginTop + 'px',
                'margin-bottom': '30px'
            });
        } catch (e) {
            console.warn("Iframe 視野置中計算提示:", e);
        }
    }

    /**
     * 為任意 Bootstrap Modal 綁定視野動態追蹤置中事件
     * @param {string|HTMLElement} modalSelector - Modal DOM 或選擇器
     */
    static bindIframeAutoCenter(modalSelector) {
        const $modal = $(modalSelector);
        if (!$modal.length) return;

        const reposition = () => {
            AppDialog.centerInViewport($modal.find('.modal-dialog'));
        };

        $modal.off('show.bs.modal.autoCenter shown.bs.modal.autoCenter')
              .on('show.bs.modal.autoCenter shown.bs.modal.autoCenter', reposition);

        // 當 Modal 開啟期間，若使用者在父頁面滾動或縮放，持續鎖定在視野正中央
        if (window.self !== window.top) {
            try {
                const parentWin = window.parent;
                $modal.off('shown.bs.modal.scrollTrack').on('shown.bs.modal.scrollTrack', () => {
                    $(parentWin).off('scroll.modalCenter resize.modalCenter').on('scroll.modalCenter resize.modalCenter', reposition);
                });
                $modal.off('hidden.bs.modal.scrollTrack').on('hidden.bs.modal.scrollTrack', () => {
                    $(parentWin).off('scroll.modalCenter resize.modalCenter');
                });
            } catch (e) {}
        }
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
// 全域通用 Toast 通知模組 (AppToast) - 自動錨定當前可視角右上角
// ==========================================
class AppToast {
    static _ensureContainer() {
        let container = document.getElementById('globalToastContainer');
        if (!container) {
            const html = `<div id="globalToastContainer" class="toast-container-custom"></div>`;
            document.body.insertAdjacentHTML('beforeend', html);
            container = document.getElementById('globalToastContainer');
        }
        AppToast._syncPosition(container);
        return container;
    }

    /**
     * 將 Toast 容器校準在當前螢幕可視視野右上角
     */
    static _syncPosition(container) {
        const vp = AppDialog.getViewportMetrics();
        if (vp.isInsideIframe) {
            container.style.position = 'absolute';
            container.style.top = (vp.visibleTop + 24) + 'px';
            container.style.right = '24px';
            container.style.zIndex = '9999999';
        }
    }

    /**
     * 觸發 Toast 通知
     */
    static show(message, type = 'success', duration = 3000) {
        const container = this._ensureContainer();
        this._syncPosition(container);
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
// 全域通用 Loading 遮罩模組 (AppLoading) - 自動鎖定當前可視畫面中央
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
     * 啟動 Loading 遮罩並置中於當前可視畫面
     */
    static show(title = '', desc = '') {
        const $overlay = this._ensureLoadingOverlay();
        const $card = $('#globalLoadingCard');

        if (title) $('#globalLoadingTitle').html(title);
        if (desc) $('#globalLoadingDesc').text(desc);

        $overlay.addClass('active');

        // 在可視範圍內精準垂直置中卡片
        AppDialog.centerInViewport($card, 180);

        // 若使用者在載入期間滾動父視窗，持續鎖定在可視中心
        if (window.self !== window.top) {
            try {
                $(window.parent).off('scroll.loadingCenter resize.loadingCenter').on('scroll.loadingCenter resize.loadingCenter', () => {
                    if ($overlay.hasClass('active')) {
                        AppDialog.centerInViewport($card, 180);
                    }
                });
            } catch (e) {}
        }
    }

    /**
     * 隱藏 Loading 遮罩並解除滾動監聽
     */
    static hide() {
        $('#globalLoadingOverlay').removeClass('active');
        if (window.self !== window.top) {
            try {
                $(window.parent).off('scroll.loadingCenter resize.loadingCenter');
            } catch (e) {}
        }
    }
}