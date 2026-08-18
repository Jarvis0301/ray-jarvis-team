// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    // Smooth Scroll
    $('a[href^="#"]').on('click', function(event) {
        var target = $(this.getAttribute('href'));
        if (target.length) {
            event.preventDefault();
            $('html, body').stop().animate({
                scrollTop: target.offset().top - 80
            }, 800);
        }
    });

    // jQuery KPI Counter Animation
    let animated = false;
    $(window).on('scroll', function() {
        let kpiSection = $('.kpi-number');
        if (kpiSection.length) {
            let oTop = kpiSection.offset().top - window.innerHeight;
            if (!animated && $(window).scrollTop() > oTop) {
                $('.counter').each(function() {
                    let $this = $(this);
                    let countTo = $this.attr('data-target');
                    $({ countNum: $this.text() }).animate({
                        countNum: countTo
                    },
                    {
                        duration: 2000,
                        easing: 'swing',
                        step: function() {
                            $this.text(Math.floor(this.countNum));
                        },
                        complete: function() {
                            $this.text(this.countNum);
                        }
                    });
                });
                animated = true;
            }
        }
    });
});