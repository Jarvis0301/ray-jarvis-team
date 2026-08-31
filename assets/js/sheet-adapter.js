// ==========================================================================
// assets/js/adapters/sheet-adapter.js (支援動態傳入部署 ID 與身分自動綁定)
// ==========================================================================
const SheetAdapter = (function() {
    const SESSION_KEY = 'ray_team_auth_session';
    let defaultDeployId = "";

    // 顯示全域 Loading
    function showLoading(action, sheetName) {
        const actionMap = {
            'CREATE': { title: '<i class="fa-solid fa-cloud-arrow-up text-success"></i> 正在雲端新增資料...', desc: `目標工作表：${sheetName}` },
            'UPDATE': { title: '<i class="fa-solid fa-arrows-rotate text-primary"></i> 正在更新試算表數據...', desc: `目標工作表：${sheetName}` },
            'DELETE': { title: '<i class="fa-solid fa-trash-can text-danger"></i> 正在自雲端刪除節點...', desc: `目標工作表：${sheetName}` }
        };
        const config = actionMap[action] || { title: '<i class="fa-solid fa-spinner fa-spin"></i> 處理中...', desc: '正在與伺服器同步' };
        AppLoading.show(config.title, config.desc);
    }

    // 隱藏全域 Loading
    function hideLoading() {
        AppLoading.hide();
    }

    function getCurrentUserEmail() {
        const rawSession = localStorage.getItem(SESSION_KEY);
        if (!rawSession) return '';
        try {
            return (JSON.parse(rawSession).user || '').toLowerCase().trim();
        } catch (e) {
            return '';
        }
    }

    function resolveEndpoint(customDeployId) {
        const deployId = customDeployId || defaultDeployId;
        if (!deployId) throw new Error("未指定 GAS 部署 ID！");
        return deployId.startsWith('http') ? deployId : `https://script.google.com/macros/s/${deployId}/exec`;
    }

    /**
     * 向 GAS 發送 C/U/D 寫入請求
     */
    async function mutateSheet(action, sheetName, pkValue, rowDataArray, customDeployId = null, options = {}) {
        const isSilent = options.silent === true;
        
        // 若非靜默模式，才由 SheetAdapter 接管 Loading
        if (!isSilent) {
            showLoading(action, sheetName);
        }

        try {
            const apiUrl = resolveEndpoint(customDeployId);
            const userEmail = getCurrentUserEmail();

            if (!userEmail) {
                throw new Error("尚未偵測到登入身分，請先完成 Google 帳號驗證！");
            }

            const payload = {
                action: action,
                sheetName: sheetName,
                pkValue: pkValue,
                rowData: rowDataArray,
                userEmail: userEmail
            };

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            });

            const resData = await response.json();
            if (resData.status !== "success") {
                throw new Error(resData.message || "伺服器拒絕操作");
            }
            return resData;
        } catch (err) {
            console.error(`試算表寫入失敗 [${action}]:`, err);
            throw err;
        } finally {
            if (!isSilent) {
                hideLoading();
            }
        }
    }

    return {
        init: function(deployId) {
            defaultDeployId = deployId;
        },
        createRow: (sheet, pk, dataArr, customDeployId, options) => mutateSheet("CREATE", sheet, pk, dataArr, customDeployId, options),
        updateRow: (sheet, pk, dataArr, customDeployId, options) => mutateSheet("UPDATE", sheet, pk, dataArr, customDeployId, options),
        deleteRow: (sheet, pk, customDeployId, options) => mutateSheet("DELETE", sheet, pk, [], customDeployId, options)
    };
})();