// 核心修改：監聽 vendorReady 事件，確保 jQuery 與 Chart.js 已全部載入記憶體
window.addEventListener('vendorReady', function() {
    // 切換 Tab 時自動滑動調整，提升手機端體驗
    $('#consultTabs button').on('click', function () {
        $('html, body').animate({
            scrollTop: $("#consultTabContent").offset().top - 100
        }, 300);
    });
});