(function() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const paramTheme = urlParams.get('theme');

    // 預設主題
    let selectedTheme = 'dark-green'; 

    // 【優先權 1】若 URL 帶有 ?theme=xxx 參數（方便開發測試）
    if (paramTheme) {
        selectedTheme = paramTheme;
    } 
    // 【優先權 2】依據子網域 (Subdomain) 判斷
    else if (hostname.includes('team') || hostname.includes('ray')) {
        selectedTheme = 'dark-blue';    // 團隊版：鋼鐵藍
    } else if (hostname.includes('core') || hostname.includes('hub')) {
        selectedTheme = 'dark-purple';  // 核心版：魅影紫
    } else if (hostname.includes('public') || hostname.includes('www')) {
        selectedTheme = 'dark-green';   // 公開版：翡翠綠
    } 
    // 【優先權 3】若非多網域，改依據網址路徑 (Pathname) 判斷
    else if (pathname.startsWith('/team')) {
        selectedTheme = 'dark-blue';
    } else if (pathname.startsWith('/hub')) {
        selectedTheme = 'dark-purple';
    } else if (pathname.startsWith('/health')) {
        selectedTheme = 'dark-green';
    }

    // 立即寫入 <html> 的 data-bs-theme 屬性
    document.documentElement.setAttribute('data-bs-theme', selectedTheme);
})();