window.addEventListener('AppReady', function () {
    // Bind Tab Navigation Switching
    $('#bonusTab button').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });
});