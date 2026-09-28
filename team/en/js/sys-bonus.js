window.addEventListener('AppReady', function () {
    // 1. Four Pillars of Compensation Tab Navigation
    $('#bonusTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });

    // 2. 5 Core Volume Dimensions Tab Navigation
    $('#perfVolumeTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });

    // 3. 5 Volume Consolidation States Tab Navigation
    $('#managerStatusTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });

    // 4. Three Business Profiles Simulation Tab Navigation
    $('#caseTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });
});