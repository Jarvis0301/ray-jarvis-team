// assets/js/auth-guard.js - 三階全站共用門禁衛兵 (支援即時撤銷與自動路由)
(function() {
    // 1. 立即隱藏 HTML 畫面，防範畫面閃爍與未授權內容外洩
    document.documentElement.style.display = 'none';

    const GAS_API_URL = "https://script.google.com/macros/s/AKfycby-z80VYrsboxpdjxrIb-vFodL6Pznsjwrq8ApQwZFx8LopmuUi0k2Z3ZN5b4QxZLiu8A/exec"; // 請替換為您的 GAS 部署網址
    const SESSION_KEY = 'ray_team_auth_session';
    const REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 小時 (每隔一天背景驗證一次)

    // 2. 自動辨識網站情境 (Path Context Auto-Detection)
    const path = window.location.pathname.toLowerCase();
    let currentSite = 'public';
    let loginPageUrl = 'login.html';

    if (path.includes('/hub/')) {
        currentSite = 'hub';
        loginPageUrl = '/hub/login.html';
    } else if (path.includes('/team/')) {
        currentSite = 'team';
        loginPageUrl = '/team/login.html';
    } else if (path.includes('/health-free-daily/')) {
        currentSite = 'public';
        loginPageUrl = '/health-free-daily/login.html';
    } else {
        // do nothing
        window.location.href = 'https://jarvis0301.github.io/ray-jarvis-team/health-free-daily/index.html';
    }

    // 判斷是否為 VS Code 本地測試環境 (127.0.0.1 或 localhost)
    const hostname = window.location.hostname;
    // 暫時全部放行讓榮祥測試
    //const isLocalDev = (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '' || window.location.protocol === 'file:');
    const isLocalDev = true;
    const AUTO_DEV_BYPASS = true; // 開發模式：本地開發現場自動注入測試 Session

    // 3. 公開版網站 (public) 完全免驗證，直接放行
    if (currentSite === 'public') {
        document.addEventListener('DOMContentLoaded', function() {
            document.documentElement.style.display = '';
        });
        return;
    }

    // 4. 本地開發環境自動通關模擬
    if (isLocalDev && AUTO_DEV_BYPASS) {
        const rawDevSession = localStorage.getItem(SESSION_KEY);
        if (!rawDevSession) {
            const devSession = {
                user: 'dev-master@local.test',
                userName: '本地開發者',
                role: 'ADMIN',
                permissions: { hub: '編輯', team: '編輯', public: '編輯' },
                expireAt: new Date().getTime() + (30 * 24 * 60 * 60 * 1000)
            };
            localStorage.setItem(SESSION_KEY, JSON.stringify(devSession));
        }
    }

    // 檢查目前是否就在該站點的登入頁 (login.html)
    const isLoginPage = path.endsWith('/login.html');

    // 5. 讀取本地快取 Session
    const rawSession = localStorage.getItem(SESSION_KEY);
    let isValidLocally = false;
    let sessionData = null;

    if (rawSession) {
        try {
            sessionData = JSON.parse(rawSession);
            const now = new Date().getTime();
            const sitePerm = (sessionData.permissions) ? sessionData.permissions[currentSite] : null;

            // 檢查 Session 是否未過期，且對當前站點具備 "編輯" 或 "檢視" 權限
            if (sessionData.expireAt && sessionData.expireAt > now && (sitePerm === '編輯' || sitePerm === '檢視')) {
                isValidLocally = true;
            }
        } catch (e) {
            localStorage.removeItem(SESSION_KEY);
        }
    }

    // 6. 本地快取驗證決策
    if (isValidLocally) {
        // 放行：若人在 login.html 且已有有效 Session，自動跳轉至目標頁或 index.html
        if (isLoginPage) {
            const urlParams = new URLSearchParams(window.location.search);
            const redirectUrl = urlParams.get('redirect');
            window.location.href = (redirectUrl) ? decodeURIComponent(redirectUrl) : 'index.html';
            return;
        }

        // 0 秒極速顯示頁面
        document.addEventListener('DOMContentLoaded', function() {
            document.documentElement.style.display = '';
        });

        // 【關鍵優化】：判斷是否超過 24 小時（每隔一天才執行一次背景靜默複驗）
        const now = new Date().getTime();
        const lastVerified = sessionData.lastVerifiedAt || 0;
        
        if (!isLocalDev && (now - lastVerified > REVALIDATE_INTERVAL_MS) && GAS_API_URL && !GAS_API_URL.includes("YOUR_GAS_DEPLOYED_WEB_APP_URL")) {
            revalidateInBackground(sessionData.user, currentSite);
        }

    } else {
        // 阻擋：無有效 Session 且人在受保護的頁面，強制踢回該站點的 login.html
        if (!isLoginPage) {
            const targetUrl = encodeURIComponent(window.location.href);
            window.location.href = loginPageUrl + '?redirect=' + targetUrl;
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                document.documentElement.style.display = '';
            });
        }
    }

    // 背景靜默複驗函式 (隔天執行，更新時間戳記)
    function revalidateInBackground(userEmail, site) {
        fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'read', email: userEmail, targetSystem: site })
        })
        .then(response => response.json())
        .then(res => {
            if (!res.success || res.reason === "REVOKED") {
                // 後端權限已被取消或刪除 -> 清除快取並踢回 login.html 重新登入
                localStorage.removeItem(SESSION_KEY);
                alert("【資安安全提醒】" + (res.message || "您的存取權限已被變更，請重新進行 Google 身分驗證！"));
                window.location.href = loginPageUrl;
            } else {
                // 複驗成功 -> 更新權限資料與最後驗證時間 (紀錄當前時間)
                if (sessionData) {
                    sessionData.permissions = res.permissions;
                    sessionData.lastVerifiedAt = new Date().getTime();
                    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
                }
            }
        })
        .catch(err => {
            console.warn("背景權限複驗暫時無法連線：", err);
        });
    }

    // 全域通用登出函式
    window.uvacoLogout = function() {
        if (confirm("確定要登出系統嗎？")) {
            localStorage.removeItem(SESSION_KEY);
            window.location.href = loginPageUrl;
        }
    };

})();