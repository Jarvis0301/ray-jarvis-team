// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    // 切換 Tab 時自動滑動調整，提升手機端體驗
    $('#consultTabs button').on('click', function () {
        $('html, body').animate({
            scrollTop: $("#consultTabContent").offset().top - 100
        }, 300);
    });
});