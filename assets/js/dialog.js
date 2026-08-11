// ==========================================
// 全域通用彈窗模組 (app-dialog.js)
// 支援 Callback 模式（無需寫 async/await/then）與 Promise 模式
// ==========================================

class AppDialog {
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

            // iframe 自動精準居中定位
            modalElem.addEventListener('show.bs.modal', function () {
                const $modal = $(this);
                const $dialog = $modal.find('.modal-dialog');
                const isInsideIframe = (window.self !== window.top);

                if (isInsideIframe) {
                    try {
                        const parentWin = window.parent;
                        const frameEl = window.frameElement;
                        if (parentWin && frameEl) {
                            const parentScrollY = parentWin.scrollY || parentWin.pageYOffset || 0;
                            const parentInnerHeight = parentWin.innerHeight || document.documentElement.clientHeight;
                            const frameRect = frameEl.getBoundingClientRect();
                            const iframeTopInParent = frameRect.top + parentScrollY;

                            const viewportCenterInIframe = (parentScrollY + parentInnerHeight / 2) - iframeTopInParent;

                            $modal.css({
                                'position': 'absolute',
                                'top': '0',
                                'left': '0',
                                'height': '100%',
                                'width': '100%',
                                'overflow': 'visible'
                            });

                            $dialog.css({
                                'position': 'absolute',
                                'top': Math.max(120, viewportCenterInIframe) + 'px',
                                'left': '50%',
                                'transform': 'translate(-50%, -50%)',
                                'margin': '0',
                                'width': '90%',
                                'max-width': '480px'
                            });
                        }
                    } catch (e) {
                        console.warn("Modal iframe positioning fallback:", e);
                    }
                } else {
                    $modal.css({ 'position': '', 'top': '', 'left': '', 'height': '', 'width': '', 'overflow': '' });
                    $dialog.css({ 'position': '', 'top': '', 'left': '', 'transform': '', 'margin': '' });
                }
            });
        }
        return modalElem;
    }

    /**
     * 全域 Alert 提示彈窗
     * @param {string} message 訊息內容
     * @param {function|object} onConfirmOrOptions 點擊確定時執行的 Function 或參數物件
     * @param {object} options 自訂參數
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
     * @param {string} message 訊息內容
     * @param {function|object} onConfirmOrOptions 點擊確認時執行的 Function 或參數物件
     * @param {object} options 自訂參數
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