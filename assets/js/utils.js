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