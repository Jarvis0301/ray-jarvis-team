// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    // Smooth Scrolling for TOC Navigation
    $('#toc-nav a').on('click', function(e) {
        if (this.hash !== "") {
            e.preventDefault();
            var hash = this.hash;
            $('html, body').animate({
                scrollTop: $(hash).offset().top - 30
            }, 500);
        }
    });
});