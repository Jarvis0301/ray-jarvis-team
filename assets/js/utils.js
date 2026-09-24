// assets/js/utils.js
// ==========================================================================
// 全域共用工具函式庫 (無類別封裝，供各業務模組直接呼叫)
// ==========================================================================

/**
 * 試算表欄位索引安全取值器 (0-Based 絕對物理順序)
 */
function getVal(row, colIndex, defaultVal = '') {
    if (!row || !Array.isArray(row)) return defaultVal;
    if (row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
        return String(row[colIndex]).trim();
    }
    return defaultVal;
}

/**
 * 取得當前登入者身分名稱
 */
function getCurrentUser() {
    const rawSession = localStorage.getItem('ray_team_auth_session');
    if (!rawSession) return 'ADMIN';
    try {
        const session = JSON.parse(rawSession);
        return session.userName || session.user || 'ADMIN';
    } catch (e) {
        return 'ADMIN';
    }
}

/**
 * 依幣別標準化金額格式 (支援 NT$ 與 RM，靠齊 .toLocaleString 規格)
 */
function formatCurrency(amount, currencyCode = 'TWD') {
    const num = parseFloat(amount) || 0;
    const prefix = String(currencyCode).toUpperCase() === 'MYR' ? 'RM ' : 'NT$ ';
    if (num === 0) {
        return `${prefix}0`;
    }
    return `${prefix}${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Google 試算表 CSV 跨表非同步抓取器 (GVIZ API)
 */
async function fetchGoogleSheetCsv(spreadsheetId, sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        throw new Error(`讀取工作表 [${sheetName}] 失敗 (HTTP ${res.status})`);
    }
    
    const text = await res.text();
    const parsed = Papa.parse(text, {
        header: false,
        skipEmptyLines: true
    });

    return (parsed.data || []).slice(1);
}

/**
 * 全域手動同步雲端試算表通用觸發器（相容所有模組讀取函式與防連點保護）
 */
window.manualSyncSheetsData = async function (btnElement) {
    const $btn = btnElement ? $(btnElement) : $('#btn-manual-sync');
    const originalHtml = $btn.html();

    try {
        // 按鈕鎖定並呈現旋轉動畫
        $btn.prop('disabled', true).html('<i class="fa-solid fa-arrows-rotate fa-spin me-1"></i>同步中...');

        // 自動適配不同程式的讀取函式名稱
        if (typeof fetchGoogleSheetsData === 'function') {
            await fetchGoogleSheetsData();
        } else if (typeof fetchAllGoogleSheetsData === 'function') {
            await fetchAllGoogleSheetsData();
        } else {
            throw new Error('此頁面未定義試算表讀取函式');
        }
    } catch (err) {
        console.error('手動同步失敗:', err);
    } finally {
        // 延遲 1 秒後解鎖按鈕，避免短時間內頻繁狂點
        setTimeout(() => {
            $btn.prop('disabled', false).html(originalHtml);
        }, 1000);
    }
};