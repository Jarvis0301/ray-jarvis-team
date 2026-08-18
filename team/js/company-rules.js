// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    // 初始化 DataTable.js，設定深色主題繁體中文語系
    $('#rulesDataTable').DataTable();
});