window.addEventListener('AppReady', function () {
    // 1. 綁定獎金 4 柱分頁導航切換
    $('#bonusTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });

    // 2. 綁定傘下經理 5 種歸併狀態分頁導航切換
    $('#managerStatusTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });

    // 3. 綁定三大經營型態例算分頁導航切換
    $('#caseTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });
});