window.addEventListener('AppReady', function () {
    // 綁定獎金分頁導航切換
    $('#bonusTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });
});