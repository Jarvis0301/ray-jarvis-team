// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function () {
    // 監聽 Radio 切換事件
    $('input[name="business-type"]').on('change', function () {
        if ($('#btn-pj').is(':checked')) {
            $('#trad-content').hide();
            $('#pj-content').stop(true, true).fadeIn(300);
        } else {
            $('#pj-content').hide();
            $('#trad-content').stop(true, true).fadeIn(300);
        }
    });

    // 試算器互動 logic (包含圖片切換)
    $('.calc-step').click(function () {
        $('.calc-step').removeClass('active');
        $(this).addClass('active');

        var step = $(this).data('step');
        if (step === 1) {
            $('#calc-badge').text('第一階段：建立備胎');
            $('#calc-income').text('每月加薪 $20,000 - $30,000');
            $('#calc-time').html('<i class="fa-regular fa-clock"></i> 預估所需時間：3 ~ 6 個月');
            $('#calc-desc').text('利用下班零碎時間完成消費轉移，為自己增加一份超越一般職場調薪幅度的穩定被動兼職收入。');
            $('#step-img').attr('src', 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80');
        } else if (step === 2) {
            $('#calc-badge').text('第二階段：通路成型');
            $('#calc-income').text('月收入 $70,000 - $200,000');
            $('#calc-time').html('<i class="fa-regular fa-clock"></i> 預估所需時間：6 個月 ~ 1 年');
            $('#calc-desc').text('輔導 5 位夥伴晉升經理，啟動「珍珠自動補救」系統，擁有真正的被動式水庫收益。');
            $('#step-img').attr('src', 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=600&q=80');
        } else if (step === 3) {
            $('#calc-badge').text('第三階段：非凡自由');
            $('#calc-income').text('年收入數百萬 + 招待旅遊名車');
            $('#calc-time').html('<i class="fa-regular fa-clock"></i> 預估所需時間：1.5 年 ~ 3 年');
            $('#calc-desc').text('達到翡翠與藍鑽階級，獲得過戶百萬名車與一年 2~3 次全額招待國外旅遊，實現全方位自由人生。');
            $('#step-img').attr('src', 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80');
        }
    });
});