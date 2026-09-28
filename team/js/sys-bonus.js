window.addEventListener('AppReady', function () {
    // 1. 綁定獎金四大組成分頁切換
    $('#bonusTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });

    // 2. 綁定業績計算核心五大維度分頁切換
    $('#perfVolumeTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });

    // 3. 綁定傘下經理 5 種業績歸併狀態分頁切換
    $('#managerStatusTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });

    // 4. 綁定三大經營型態精算例算分頁切換
    $('#caseTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });
});