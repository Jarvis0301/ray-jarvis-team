// Google 試算表設定 (請替換為您發布至 Web 的 Google 試算表 ID)
let SPREADSHEET_ID = '18KTIC_dG1KIGdwmaUqzuJzeYnpGyTxCJqbF9DJuCQ3I';

// 本地模擬資料庫 (當無 Sheet ID 或網路連線失敗時之備用回退機制)
const FALLBACK_DATA = {
    "TW": [
        {
            "產品編號": "P001",
            "產品名稱": "衛傑 (Wei-Jie)",
            "產品簡稱": "衛傑",
            "產品型態": "膠囊",
            "包裝規格": "100 粒/瓶",
            "售價": "NT$ 1,680",
            "全球 SV": "1,400",
            "上市日期": "2018-05-10",
            "更新日期": "2026-01-01",
            "認證": "SNQ國家品質標章",
            "產品特色與主要功能": "含有山藥粉、猴頭菇菌絲體粉末、食用蕈菇菌絲體粉末及複合乳酸菌。<br>專為現代高壓外食族群設計，幫助維持身體舒適與日常順暢。",
            "產品獨立網頁": "#",
            "圖片網址": "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0103003_衛傑_20251016_1.png",
            "官方網站": "https://www.uvaco.com.tw/Products/51/62/TW0103003",
            "廣告文案": "外食比例高、工作步調緊湊，是現代上班族與工程師的日常常態。當生活節奏無法瞬間放慢，給予身體適當的日常滋養與防護，就是最明智的健康投資。<br><br>衛傑結合多重優質營養成分，專為應對現代忙碌生活設計，讓你在高壓的日常工作中，依然能輕鬆維持優質的營養補充與健康防護力。",
            "直式廣告海報網址": "https://via.placeholder.com/600x800/0d221a/34d399?text=Dark+Emerald+Vertical+Poster"
        }
    ],
    "MY": [
        {
            "產品編號": "P001",
            "產品名稱": "Wei-Jie Capsule",
            "產品簡稱": "Wei-Jie",
            "產品型態": "膠囊",
            "包裝規格": "100 Capsules/Bottle",
            "售價": "RM 250",
            "全球 SV": "1,400",
            "上市日期": "2020-08-15",
            "更新日期": "2026-01-01",
            "認證": "HALAL 清真認證",
            "產品特色與主要功能": "Contains Yam Powder, Hericium Erinaceus Mycelium, and Probiotics for daily digestive care.",
            "產品獨立網頁": "#",
            "圖片網址": "https://cdn.jsdelivr.net/gh/Jarvis0301/ray-jarvis-team@main/images/product/imagery/TW0103003_衛傑_20251016_1.png",
            "官方網站": "https://www.uvaco.com.my",
            "廣告文案": "Formulated for modern busy lifestyles to maintain daily vitality and wellness.",
            "直式廣告海報網址": "https://via.placeholder.com/600x800/0d221a/34d399?text=Malaysia+Vertical+Poster"
        }
    ],
    "TYPES": [
        {
            "中文": "膠囊",
            "英文": "Capsule",
            "Font Awesome Icon": "fa-capsules",
            "文字與外框顏色": "#34d399",
            "標籤背景顏色": "rgba(52, 211, 153, 0.15)"
        }
    ],
    "SERIES": [
        {
            "編號": "S01",
            "中文": "日常養護系列",
            "英文": "Daily Care",
            "Font Awesome Icon": "fa-shield-heart",
            "文字與外框顏色": "#10b981",
            "標籤背景顏色": "rgba(16, 185, 129, 0.15)"
        }
    ]
};

let currentRegion = 'TW';
let currentProductId = 'TW0101001';
let sheetDatabase = {};

// 監聽 common.js 發出的全域 AppReady 事件，確保前置js已全部載入完成
window.addEventListener('AppReady', function() {
    currentProductId = getUrlParameter('id') || 'TW0101001';
    currentRegion = getUrlParameter('region') || 'TW';

    // 開始初始化資料
    initDataAndRender();
});

// 解析 URL 參數
function getUrlParameter(sParam) {
    let sPageURL = window.location.search.substring(1);
    let sURLVariables = sPageURL.split('&');
    for (let i = 0; i < sURLVariables.length; i++) {
        let sParameterName = sURLVariables[i].split('=');
        if (sParameterName[0] === sParam) {
            return sParameterName[1] === undefined ? true : decodeURIComponent(sParameterName[1]);
        }
    }
    return false;
}

    // 從 Google 試算表（GViz CSV 端點）讀取工作表
function fetchGoogleSheetTab(tabName) {
    return new Promise((resolve, reject) => {
        if (!SPREADSHEET_ID || SPREADSHEET_ID === 'YOUR_GOOGLE_SHEET_ID_HERE') {
            reject('無效的 Sheet ID，啟動備用資料庫');
            return;
        }
        const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: (err) => reject(err)
        });
    });
}

// 初始化並串載 4 個工作表
function initDataAndRender() {
    $('#loadingSpinner').removeClass('d-none');
    $('#productContainer').addClass('d-none');

    Promise.all([
        fetchGoogleSheetTab('台灣'),
        fetchGoogleSheetTab('馬來西亞'),
        fetchGoogleSheetTab('產品系列'),
        fetchGoogleSheetTab('產品型態')
    ]).then(([twData, myData, seriesData, typesData]) => {
        sheetDatabase = {
            'TW': twData,
            'MY': myData,
            'SERIES': seriesData,
            'TYPES': typesData
        };
        renderProductView();
    }).catch((err) => {
        console.warn('使用本地預設備用資料庫載入中:', err);
        sheetDatabase = FALLBACK_DATA;
        renderProductView();
    });
}

// 動態渲染產品資料
function renderProductView() {
    $('#loadingSpinner').removeClass('d-none');
    $('#productContainer').addClass('d-none');

    setTimeout(function () {
        let dataset = sheetDatabase[currentRegion] || sheetDatabase['TW'];
        let product = dataset.find(p => p["產品編號"] === currentProductId) || dataset[0];
        let typeStyle = sheetDatabase["TYPES"][product["產品型態"]] || {
            "Icon": "fa-tablets",
            "Color": "#34d399",
            "BgColor": "rgba(52, 211, 153, 0.12)"
        };

        // 填入資料
        $('#productName').text(product["產品名稱"]);
        $('#productSubName').text(product["產品簡稱"]);
        $('#productBrief').text(product["產品簡稱"] + " ── 順暢保衛，為現代忙碌生活打造的日常養護");
        $('#productImage').attr('src', product["圖片網址"]);
        $('#productPrice').text(product["售價"]);
        $('#productSV').text(product["全球 SV"]);
        $('#productSpec').text(product["包裝規格"]);

        // 渲染直式廣告海報與廣告文案
        $('#adPosterImage').attr('src', product["直式廣告海報網址"] || product["圖片網址"]);
        $('#adCopyContent').html(product["廣告文案"] || "專為現代上班族打造的隨身養護方案，讓每日營養補充更有感。");
        
        // 渲染官方成分
        $('#officialIngredients').html(product["產品特色與主要功能"]);

        $('#productID').text(product["產品編號"]);
        $('#launchDate').text(product["上市日期"]);
        $('#updateDate').text(product["更新日期"]);
        $('#certInfo').text(product["認證"] || "總公司檢驗合格");

        // 按鈕連結綁定
        $('#officialBtn').attr('href', product["官方網站"]);
        $('#consultBtn, #consultBtnBottom').attr('href', 'https://line.me');

        // 動態型態 Badge
        let typeBadgeHtml = `
            <span class="badge px-3 py-2 m-1" style="background-color: ${typeStyle.BgColor}; color: ${typeStyle.Color}; border: 1px solid rgba(52, 211, 153, 0.25);">
                <i class="fa-solid ${typeStyle.Icon}"></i> ${product["產品型態"]}
            </span>
        `;
        $('#productTypeBadge').html(typeBadgeHtml);

        // 認證 Badge
        if (product["認證"]) {
            let certBadgeHtml = `
                <span class="badge bg-warning px-3 py-2 m-1">
                    <i class="fa-solid fa-award"></i> ${product["認證"]}
                </span>
            `;
            $('#certBadge').html(certBadgeHtml);
        } else {
            $('#certBadge').empty();
        }

        $('#loadingSpinner').addClass('d-none');
        $('#productContainer').removeClass('d-none');
    }, 300);
}