// ==========================================
// 全域列印與手機版 PDF/明細下載模組 (order-printer.js)
// 支援電腦原生預覽列印，以及手機版/LINE/FB 內建瀏覽器專用明細下載
// ==========================================

function printOrderReceipt(orderData) {
    const { items, subtotal, shipping, grandTotal, totalSV, rebate, currencySymbol, dateStr } = orderData;

    if (!items || items.length === 0) {
        if (typeof AppDialog !== 'undefined') {
            AppDialog.alert("請先選擇至少一項商品後再進行列印 / 匯出！");
        } else {
            alert("請先選擇至少一項商品後再進行列印 / 匯出！");
        }
        return;
    }

    // 判斷是否為行動裝置或內建 App 瀏覽器 (LINE, FB, IG 等)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isInAppBrowser = /Line|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent);

    // 1. 如果是手機版或內建 APP 瀏覽器，開啟手機專用對話框
    if (isMobile || isInAppBrowser) {
        showMobileReceiptModal(orderData);
        return;
    }

    // 2. 電腦版原生列印處理 (#printableArea)
    let printArea = document.getElementById('printableArea');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'printableArea';
        document.body.appendChild(printArea);
    }

    if (!document.getElementById('printStyleSheet')) {
        const style = document.createElement('style');
        style.id = 'printStyleSheet';
        style.innerHTML = `
            @media print {
                body > *:not(#printableArea) {
                    display: none !important;
                }
                #printableArea {
                    display: block !important;
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    background: #ffffff !important;
                    color: #1f2937 !important;
                    padding: 20px !important;
                    box-sizing: border-box !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                }
                @page {
                    size: A4 portrait;
                    margin: 10mm;
                }
            }
            #printableArea {
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    let rowsHtml = items.map(item => `
        <tr>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; font-size: 13px;">${item.code}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">${item.name}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 13px;">${item.qty}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 13px; font-weight: bold;">${currencySymbol}${Math.round(item.price).toLocaleString()}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 13px; color: #0284c7;">${item.sv.toLocaleString()} SV</td>
        </tr>
    `).join('');

    printArea.innerHTML = `
        <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="margin: 0 0 6px 0; color: #0284c7; font-size: 22px;">葡眾團隊 - 線上訂購試算單</h2>
            <p style="margin: 0; color: #6b7280; font-size: 12px;">列印 / 匯出時間：${new Date().toLocaleString('zh-TW')}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
                <tr style="background-color: #f3f4f6;">
                    <th style="padding: 8px 10px; border-bottom: 2px solid #d1d5db; text-align: left; font-size: 13px;">產品編號</th>
                    <th style="padding: 8px 10px; border-bottom: 2px solid #d1d5db; text-align: left; font-size: 13px;">產品名稱</th>
                    <th style="padding: 8px 10px; border-bottom: 2px solid #d1d5db; text-align: center; font-size: 13px;">數量</th>
                    <th style="padding: 8px 10px; border-bottom: 2px solid #d1d5db; text-align: right; font-size: 13px;">小計金額</th>
                    <th style="padding: 8px 10px; border-bottom: 2px solid #d1d5db; text-align: right; font-size: 13px;">小計 SV</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>

        <div style="width: 280px; margin-left: auto; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px;">
                <span>產品金額合計：</span>
                <strong>${currencySymbol}${Math.round(subtotal).toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px;">
                <span>物流運費：</span>
                <strong>${shipping > 0 ? `${currencySymbol}${Math.round(shipping)}` : "免運費"}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 15px; font-weight: bold; color: #d97706; border-top: 1px solid #e5e7eb; padding-top: 6px;">
                <span>應付總金額：</span>
                <span>${currencySymbol}${Math.round(grandTotal).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; color: #0284c7; font-weight: bold;">
                <span>累積總積分：</span>
                <span>${totalSV.toLocaleString()} SV</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #16a34a; font-weight: bold;">
                <span>預估現金回饋：</span>
                <span>${currencySymbol}${Math.round(rebate).toLocaleString()}</span>
            </div>
        </div>

        <div style="margin-top: 30px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px dashed #e5e7eb; padding-top: 10px;">
            * 本試算單僅供預估參考，實際訂購金額與回饋金請以公司正式發票與帳單為準。
        </div>
    `;

    window.print();
}

// ==========================================
// 手機版專用明細對話框 (解決 LINE/FB 禁用列印問題)
// ==========================================
function showMobileReceiptModal(orderData) {
    const { items, subtotal, shipping, grandTotal, totalSV, rebate, currencySymbol, dateStr } = orderData;

    let modalElem = document.getElementById('mobileReceiptModal');
    if (!modalElem) {
        const modalHtml = `
        <div class="modal fade" id="mobileReceiptModal" tabindex="-1" aria-hidden="true" style="z-index: 999999;">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content bg-dark text-light border-secondary">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="fa-solid fa-receipt text-info me-2"></i>訂購試算單明細
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body p-3" id="mobileReceiptModalBody" style="max-height: 60vh; overflow-y: auto;">
                    </div>
                    <div class="modal-footer border-secondary flex-column flex-sm-row gap-2">
                        <button type="button" class="btn btn-outline-info btn-sm w-100 w-sm-auto rounded-pill" id="btnDownloadReceiptHtml">
                            <i class="fa-solid fa-file-arrow-down me-1"></i>下載單據檔 (.html)
                        </button>
                        <button type="button" class="btn btn-outline-success btn-sm w-100 w-sm-auto rounded-pill" id="btnCopyReceiptText">
                            <i class="fa-solid fa-copy me-1"></i>複製文字明細
                        </button>
                        <button type="button" class="btn btn-primary btn-sm w-100 w-sm-auto rounded-pill" id="btnTryMobilePrint">
                            <i class="fa-solid fa-print me-1"></i>嘗試系統列印
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalElem = document.getElementById('mobileReceiptModal');
    }

    let itemsHtml = items.map(item => `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom border-secondary border-opacity-25">
            <div>
                <div class="fw-bold text-light">${item.name}</div>
                <div class="small text-muted">${item.code} x ${item.qty}</div>
            </div>
            <div class="text-end">
                <div class="text-warning fw-bold">${currencySymbol}${Math.round(item.price).toLocaleString()}</div>
                <div class="text-info small">${item.sv.toLocaleString()} SV</div>
            </div>
        </div>
    `).join('');

    let textSummary = `【葡眾團隊 - 訂購試算單】\n日期：${new Date().toLocaleDateString('zh-TW')}\n--------------------\n`;
    items.forEach(item => {
        textSummary += `${item.name} x${item.qty} = ${currencySymbol}${Math.round(item.price)}\n`;
    });
    textSummary += `--------------------\n金額合計：${currencySymbol}${Math.round(subtotal)}\n運費：${shipping > 0 ? currencySymbol + Math.round(shipping) : '免運費'}\n應付總額：${currencySymbol}${Math.round(grandTotal)}\n累積積分：${totalSV} SV\n預估回饋金：${currencySymbol}${Math.round(rebate)}`;

    document.getElementById('mobileReceiptModalBody').innerHTML = `
        <div class="p-2 mb-3 bg-secondary bg-opacity-10 rounded small text-muted">
            <i class="fa-solid fa-circle-info text-warning me-1"></i>若您使用的是 LINE 或 FB 內建瀏覽器，建議直接點擊下方<b>「下載單據檔」</b>或<b>「複製文字明細」</b>進行儲存。
        </div>
        <div class="mb-3">${itemsHtml}</div>
        <div class="p-3 bg-dark-subtle rounded border border-secondary border-opacity-50">
            <div class="d-flex justify-content-between mb-1"><span>產品金額合計：</span><strong>${currencySymbol}${Math.round(subtotal).toLocaleString()}</strong></div>
            <div class="d-flex justify-content-between mb-1"><span>物流運費：</span><strong>${shipping > 0 ? currencySymbol + Math.round(shipping).toLocaleString() : '免運費'}</strong></div>
            <div class="d-flex justify-content-between mb-1 text-warning h6 fw-bold"><span>應付總金額：</span><span>${currencySymbol}${Math.round(grandTotal).toLocaleString()}</span></div>
            <div class="d-flex justify-content-between mb-1 text-info"><span>累積總積分：</span><span>${totalSV.toLocaleString()} SV</span></div>
            <div class="d-flex justify-content-between text-success"><span>預估現金回饋：</span><span>${currencySymbol}${Math.round(rebate).toLocaleString()}</span></div>
        </div>
    `;

    const bsModal = bootstrap.Modal.getOrCreateInstance(modalElem);
    bsModal.show();

    // 1. 下載 HTML 電子單據
    document.getElementById('btnDownloadReceiptHtml').onclick = function () {
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>訂購試算單_${dateStr}</title><style>body{font-family:sans-serif;padding:20px;line-height:1.6;}</style></head><body><h2>葡眾團隊 - 訂購試算單</h2><p>日期：${new Date().toLocaleString('zh-TW')}</p><hr><pre style="font-size:14px;background:#f4f4f4;padding:15px;border-radius:8px;">${textSummary}</pre></body></html>`;
        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `葡眾訂購試算單_${dateStr}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // 2. 複製文字明細
    document.getElementById('btnCopyReceiptText').onclick = function () {
        navigator.clipboard.writeText(textSummary).then(() => {
            if (typeof AppDialog !== 'undefined') {
                AppDialog.alert("訂購明細已複製到剪貼簿！可以貼到 LINE 或記事本中。");
            } else {
                alert("訂購明細已複製到剪貼簿！");
            }
        });
    };

    // 3. 嘗試原生列印
    document.getElementById('btnTryMobilePrint').onclick = function () {
        bsModal.hide();
        setTimeout(() => {
            window.print();
        }, 300);
    };
}