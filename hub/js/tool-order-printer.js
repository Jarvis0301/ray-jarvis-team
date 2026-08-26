// ==========================================
// 全域列印與手機版 PDF/明細下載模組 (order-printer.js)
// ==========================================

function printOrderReceipt(orderData) {
    const { items, subtotal, shipping, grandTotal, totalSV, rebate, currencySymbol, dateStr } = orderData;

    if (!items || items.length === 0) {
        AppToast.warning("請先選擇至少一項商品後再進行列印 / 匯出！");
        return;
    }

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isInAppBrowser = /Line|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent);

    if (isMobile || isInAppBrowser) {
        showMobileReceiptModal(orderData);
        return;
    }

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
                            <i class="fa-solid fa-receipt text-info"></i> 訂購試算單明細
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body p-3" id="mobileReceiptModalBody" style="max-height: 60vh; overflow-y: auto;">
                    </div>
                    <div class="modal-footer border-secondary flex-column flex-sm-row gap-2">
                        <button type="button" class="btn btn-outline-info btn-sm w-100 w-sm-auto rounded-pill" id="btnDownloadReceiptHtml">
                            <i class="fa-solid fa-file-arrow-down"></i> 下載單據檔 (.html)
                        </button>
                        <button type="button" class="btn btn-outline-success btn-sm w-100 w-sm-auto rounded-pill" id="btnCopyReceiptText">
                            <i class="fa-solid fa-copy"></i> 複製文字明細
                        </button>
                        <button type="button" class="btn btn-primary btn-sm w-100 w-sm-auto rounded-pill" id="btnTryMobilePrint">
                            <i class="fa-solid fa-print"></i> 嘗試系統列印
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
        <div class="p-2 mb-3 bg-light bg-opacity-10 rounded small text-secondary">
            <i class="fa-solid fa-circle-info text-warning"></i> 若您使用的是 LINE 或 FB 內建瀏覽器，建議直接點擊下方<b>「下載單據檔」</b>或<b>「複製文字明細」</b>進行儲存。
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

    document.getElementById('btnCopyReceiptText').onclick = function () {
        navigator.clipboard.writeText(textSummary).then(() => {
            AppToast.success("訂購明細已複製到剪貼簿！");
        }).catch(() => {
            AppToast.error("複製失敗，請手動複製");
        });
    };

    document.getElementById('btnTryMobilePrint').onclick = function () {
        bsModal.hide();
        setTimeout(() => {
            window.print();
        }, 300);
    };
}

function printAnalyticsReport(reportData) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isInAppBrowser = /Line|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent);

    if (isMobile || isInAppBrowser) {
        showMobileAnalyticsModal(reportData);
        return;
    }

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
                body > *:not(#printableArea) { display: none !important; }
                #printableArea {
                    display: block !important;
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    background: #ffffff !important;
                    color: #0f172a !important;
                    padding: 15px !important;
                    box-sizing: border-box !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                }
                @page { size: A4 portrait; margin: 10mm; }
            }
            #printableArea { display: none; }
        `;
        document.head.appendChild(style);
    }

    const { dateStr, chart1, chart2, chart3, chart4, chart5 } = reportData;

    let chart1TableHtml = chart1.rows.map(r => `
        <tr>
            <td style="padding: 6px; border-bottom: 1px solid #f1f5f9; color: #334155;">${r.name}</td>
            <td style="padding: 6px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #0f172a;">${r.val.toLocaleString()} ${chart1.metric}</td>
            <td style="padding: 6px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #0284c7; font-weight: bold;">${r.pct}%</td>
        </tr>
    `).join('');

    let chart4TableHtml = chart4.rows.map((r, i) => `
        <tr>
            <td style="padding: 5px; border-bottom: 1px solid #f1f5f9; color: #334155;">第 ${i + 1} 名：${r.name}</td>
            <td style="padding: 5px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #d97706;">${r.val.toLocaleString()} ${chart4.metric}</td>
        </tr>
    `).join('');

    printArea.innerHTML = `
        <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 15px;">
            <h2 style="margin: 0 0 4px 0; color: #0284c7; font-size: 20px;">葡眾團隊 - 訂購戰情分析報告 (PDF)</h2>
            <p style="margin: 0; color: #64748b; font-size: 11px;">產生時間：${new Date().toLocaleString('zh-TW')}</p>
        </div>

        <div style="display: flex; gap: 15px; margin-bottom: 15px; align-items: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #fafafa;">
            <div style="width: 52%; text-align: center;">
                <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #1e293b;"><i class="fa-solid fa-chart-pie me-1"></i> 1. 主系列整體占比分析 (${chart1.metric})</h4>
                <img src="${chart1.img}" style="max-width: 100%; max-height: 180px; object-fit: contain;">
            </div>
            <div style="width: 48%;">
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                        <tr style="background: #f1f5f9; color: #475569;">
                            <th style="padding: 6px; text-align: left;">主系列</th>
                            <th style="padding: 6px; text-align: right;">數值</th>
                            <th style="padding: 6px; text-align: right;">占比</th>
                        </tr>
                    </thead>
                    <tbody>${chart1TableHtml}</tbody>
                </table>
            </div>
        </div>

        <div style="display: flex; gap: 15px; margin-bottom: 15px; align-items: center;">
            <div style="width: 50%; text-align: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: #fafafa;">
                <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #1e293b;"><i class="fa-solid fa-chart-column me-1"></i> 2. 各系列採購數據 (${chart2.metric})</h4>
                <img src="${chart2.img}" style="max-width: 100%; max-height: 170px; object-fit: contain;">
            </div>
            <div style="width: 50%; text-align: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: #fafafa;">
                <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #1e293b;"><i class="fa-solid fa-chart-simple me-1"></i> 3. 型態訂購數量統計</h4>
                <img src="${chart3.img}" style="max-width: 100%; max-height: 170px; object-fit: contain;">
            </div>
        </div>

        <div style="display: flex; gap: 15px; margin-bottom: 15px; align-items: flex-start;">
            <div style="width: 50%; text-align: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: #fafafa;">
                <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #1e293b;"><i class="fa-solid fa-trophy me-1"></i> 4. 單品採購 Top 5 (${chart4.metric})</h4>
                <img src="${chart4.img}" style="max-width: 100%; max-height: 150px; object-fit: contain;">
                <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 6px;">
                    <tbody>${chart4TableHtml}</tbody>
                </table>
            </div>
            <div style="width: 50%; text-align: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: #fafafa;">
                <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #1e293b;"><i class="fa-solid fa-chart-radar me-1"></i> 5. 型態貢獻雷達圖 (${chart5.metric})</h4>
                <img src="${chart5.img}" style="max-width: 100%; max-height: 200px; object-fit: contain;">
            </div>
        </div>

        <div style="margin-top: 15px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px dashed #e2e8f0; padding-top: 6px;">
            * 本報告數據依據當前選取之幣別/SV指標與動態統計結果自動繪製輸出。
        </div>
    `;

    window.print();
}

function showMobileAnalyticsModal(reportData) {
    const { dateStr, chart1, chart2, chart3, chart4, chart5 } = reportData;

    let modalElem = document.getElementById('mobileAnalyticsModal');
    if (!modalElem) {
        const modalHtml = `
        <div class="modal fade" id="mobileAnalyticsModal" tabindex="-1" aria-hidden="true" style="z-index: 999999;">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content bg-light text-dark border-secondary">
                    <div class="modal-header border-bottom">
                        <h5 class="modal-title text-primary">
                            <i class="fa-solid fa-chart-pie"></i> 戰情圖表報告預覽
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body p-3" id="mobileAnalyticsModalBody" style="max-height: 65vh; overflow-y: auto;">
                    </div>
                    <div class="modal-footer border-top flex-column flex-sm-row gap-2">
                        <button type="button" class="btn btn-outline-primary btn-sm w-100 w-sm-auto rounded-pill" id="btnDownloadAnalyticsHtml">
                            <i class="fa-solid fa-file-arrow-down"></i> 下載電子報告檔 (.html)
                        </button>
                        <button type="button" class="btn btn-primary btn-sm w-100 w-sm-auto rounded-pill" id="btnTryAnalyticsPrint">
                            <i class="fa-solid fa-print"></i> 嘗試系統列印 / PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalElem = document.getElementById('mobileAnalyticsModal');
    }

    let chart1RowsHtml = chart1.rows.map(r => `
        <div class="d-flex justify-content-between py-1 border-bottom small">
            <span class="text-secondary">${r.name}</span>
            <span class="fw-bold text-primary">${r.val.toLocaleString()} ${chart1.metric} (${r.pct}%)</span>
        </div>
    `).join('');

    document.getElementById('mobileAnalyticsModalBody').innerHTML = `
        <div class="p-2 mb-3 bg-light border rounded small text-secondary">
            <i class="fa-solid fa-circle-info text-warning"></i> 若使用 LINE 或 FB 內建瀏覽器，點擊下方<b>「下載電子報告檔」</b>即可儲存包含完整戰情圖表的白底明亮檔案。
        </div>

        <div class="row g-3">
            <div class="col-12 col-md-6 text-center">
                <h6 class="text-primary fw-bold mb-2">1. 主系列占比 (${chart1.metric})</h6>
                <img src="${chart1.img}" class="img-fluid rounded border p-1 bg-white" style="max-height: 180px;">
                <div class="mt-2 text-start">${chart1RowsHtml}</div>
            </div>
            <div class="col-12 col-md-6 text-center">
                <h6 class="text-primary fw-bold mb-2">2. 各系列採購數據 (${chart2.metric})</h6>
                <img src="${chart2.img}" class="img-fluid rounded border p-1 bg-white" style="max-height: 180px;">
            </div>
            <div class="col-12 col-md-6 text-center">
                <h6 class="text-success fw-bold mb-2">3. 型態數量統計</h6>
                <img src="${chart3.img}" class="img-fluid rounded border p-1 bg-white" style="max-height: 180px;">
            </div>
            <div class="col-12 col-md-6 text-center">
                <h6 class="text-warning fw-bold mb-2">4. 單品採購 Top 5 (${chart4.metric})</h6>
                <img src="${chart4.img}" class="img-fluid rounded border p-1 bg-white" style="max-height: 180px;">
            </div>
            <div class="col-12 text-center">
                <h6 class="text-danger fw-bold mb-2">5. 型態貢獻雷達圖 (${chart5.metric})</h6>
                <img src="${chart5.img}" class="img-fluid rounded border p-1 bg-white" style="max-height: 200px;">
            </div>
        </div>
    `;

    const bsModal = bootstrap.Modal.getOrCreateInstance(modalElem);
    bsModal.show();

    document.getElementById('btnDownloadAnalyticsHtml').onclick = function () {
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>戰情報告_${dateStr}</title><style>body{font-family:sans-serif;padding:20px;background:#ffffff;color:#0f172a;} .card{background:#f8fafc;padding:15px;margin-bottom:15px;border-radius:8px;border:1px solid #e2e8f0;} img{max-width:100%;height:auto;}</style></head><body><h2>葡眾團隊 - 訂購戰情分析報告</h2><p>產生時間：${new Date().toLocaleString('zh-TW')}</p><hr><div class="card"><h3>1. 主系列占比 (${chart1.metric})</h3><img src="${chart1.img}"></div><div class="card"><h3>2. 各系列數據分佈 (${chart2.metric})</h3><img src="${chart2.img}"></div><div class="card"><h3>3. 型態數量統計</h3><img src="${chart3.img}"></div><div class="card"><h3>4. Top 5 單品</h3><img src="${chart4.img}"></div><div class="card"><h3>5. 雷達圖 (${chart5.metric})</h3><img src="${chart5.img}"></div></body></html>`;
        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `葡眾訂購戰情報告_${dateStr}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };

    document.getElementById('btnTryAnalyticsPrint').onclick = function () {
        bsModal.hide();
        setTimeout(() => { window.print(); }, 300);
    };
}