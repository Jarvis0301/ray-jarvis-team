// ==========================================
// 原生列印與 PDF 匯出處理模組 (order-printer.js)
// 直接在當前視窗喚起原生預覽列印，不開啟新視窗/新分頁
// ==========================================

function printOrderReceipt(orderData) {
    const { items, subtotal, shipping, grandTotal, totalSV, rebate, currencySymbol, dateStr } = orderData;

    if (!items || items.length === 0) {
        await AppDialog.alert("請先選擇至少一項商品後再進行列印 / 匯出！", {
            title: "提示",
            icon: "fa-solid fa-circle-info text-info"
        });
        return;
    }

    // 1. 取得或建立當前頁面的列印專用區塊 (#printableArea)
    let printArea = document.getElementById('printableArea');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'printableArea';
        document.body.appendChild(printArea);
    }

    // 2. 動態注入列印專用 CSS (確保列印時覆蓋主畫面，平時完全隱藏)
    if (!document.getElementById('printStyleSheet')) {
        const style = document.createElement('style');
        style.id = 'printStyleSheet';
        style.innerHTML = `
            @media print {
                /* 隱藏網頁原本的所有 UI 元件 */
                body > *:not(#printableArea) {
                    display: none !important;
                }
                /* 僅顯示列印專用區塊 */
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
            /* 螢幕一般渲染時隱藏 */
            #printableArea {
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    // 3. 組合產品明細列表列
    let rowsHtml = items.map(item => `
        <tr>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; font-size: 13px;">${item.code}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">${item.name}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 13px;">${item.qty}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 13px; font-weight: bold;">${currencySymbol}${Math.round(item.price).toLocaleString()}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 13px; color: #0284c7;">${item.sv.toLocaleString()} SV</td>
        </tr>
    `).join('');

    // 4. 填入專屬 A4 排版 HTML
    printArea.innerHTML = `
        <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="margin: 0 0 6px 0; color: #0284c7; font-size: 22px;">榮祥葡眾團隊 - 線上訂購試算單</h2>
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

    // 5. 直接在「當前視窗」觸發瀏覽器原生預覽列印
    window.print();
}