$(document).ready(function() {
    // 初始化 DataTable.js，設定深色主題繁體中文語系
    $('#rulesDataTable').DataTable({
        "pageLength": 5,
        "lengthMenu": [5, 10, 25],
        "language": {
            "processing": "處理中...",
            "loadingRecords": "載入中...",
            "paginate": {
                "first": "第一頁",
                "previous": "上一頁",
                "next": "下一頁",
                "last": "最後一頁"
            },
            "emptyTable": "目前沒有可供檢索的條文資料",
            "zeroRecords": "找不到符合的規定條文",
            "info": "顯示第 _START_ 至 _END_ 項結果，共 _TOTAL_ 項",
            "infoEmpty": "顯示第 0 至 0 項結果，共 0 項",
            "infoFiltered": "(從 _MAX_ 項結果中篩選)",
            "search": "<i class='fa-solid fa-magnifying-glass me-1'></i> 搜尋條文關鍵字：",
            "lengthMenu": "顯示 _MENU_ 項條文"
        }
    });
});