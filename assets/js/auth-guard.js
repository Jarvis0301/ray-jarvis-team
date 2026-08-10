/**
 * assets/js/auth-guard.js
 * 全站門禁衛兵：最高優先級執行，負責權限核驗、防 F12 篡改與無授權重導向
 * 三階全站共用門禁衛兵 (支援即時撤銷、自動路由與 HMAC 簽章防篡改)
 */
(function() {
    // 1. 立即隱藏 HTML 畫面，防範畫面閃爍與未授權內容外洩
    document.documentElement.style.display = 'none';

    const PROJECT_NAME = 'ray-jarvis-team';   // GitHub 專案名稱
    const GAS_API_URL = "https://script.google.com/macros/s/AKfycby-z80VYrsboxpdjxrIb-vFodL6Pznsjwrq8ApQwZFx8LopmuUi0k2Z3ZN5b4QxZLiu8A/exec";
    const SESSION_KEY = 'ray_team_auth_session';
    const REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 小時背景靜默複驗

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
        window.location.href = `https://jarvis0301.github.io/${PROJECT_NAME}/health-free-daily/index.html`;
        return;
    }

    // 偵測是否為本地測試環境（VS Code Live Server）
    const hostname = window.location.hostname;
    const isLocalServer = (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '' || window.location.protocol === 'file:');

    // 3. 公開版網站 (public) 完全免驗證，直接放行
    if (currentSite === 'public') {
        document.addEventListener('DOMContentLoaded', function() {
            document.documentElement.style.display = '';
        });
        return;
    }

    // 4. 設定正確的登入頁相對轉址路徑
    if (!isLocalServer) {
        loginPageUrl = `/${PROJECT_NAME}${loginPageUrl}`;
    }

    // 檢查目前是否就在該站點的登入頁 (login.html)
    const isLoginPage = path.endsWith('/login.html');

    // 5. 讀取本地快取 Session 並進行防篡改與有效性檢測
    const rawSession = localStorage.getItem(SESSION_KEY);
    let isValidLocally = false;
    let sessionData = null;

    if (rawSession) {
        try {
            sessionData = JSON.parse(rawSession);
            const now = new Date().getTime();
            const sitePerm = (sessionData.permissions) ? sessionData.permissions[currentSite] : null;

            // 基本檢測：效期未過期，且對當前站點具備 "編輯" 或 "檢視" 權限，且具備加密簽章
            if (sessionData.expireAt && sessionData.expireAt > now && (sitePerm === '編輯' || sitePerm === '檢視') && sessionData.signature) {
                isValidLocally = true;
            } else {
                isValidLocally = false;
            }
        } catch (e) {
            localStorage.removeItem(SESSION_KEY);
            isValidLocally = false;
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

        // 判斷是否超過 24 小時（隔天觸發背景靜默複驗，防 F12 假簽章）
        const now = new Date().getTime();
        const lastVerified = sessionData.lastVerifiedAt || 0;
        
        if ((now - lastVerified > REVALIDATE_INTERVAL_MS) && GAS_API_URL) {
            revalidateInBackground(sessionData.user, currentSite);
        }

    } else {
        // 阻擋：無有效 Session 或被非法篡改，強制剔除並踢回該站點的 login.html
        if (!isLoginPage) {
            const targetUrl = encodeURIComponent(window.location.href);
            window.location.href = loginPageUrl + '?redirect=' + targetUrl;
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                document.documentElement.style.display = '';
            });
        }
    }

    // 背景靜默複驗函式 (向 GAS 伺服器核對真實試算表權限)
    function revalidateInBackground(userEmail, site) {
        fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'read', email: userEmail, targetSystem: site })
        })
        .then(response => response.json())
        .then(res => {
            if (!res.success || res.reason === "REVOKED") {
                localStorage.removeItem(SESSION_KEY);
                alert("【資安安全提醒】" + (res.message || "您的存取權限已被變更，請重新進行 Google 身分驗證！"));
                window.location.href = loginPageUrl;
            } else {
                if (sessionData) {
                    sessionData.permissions = res.permissions;
                    sessionData.signature = res.signature || sessionData.signature;
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