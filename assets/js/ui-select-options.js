/**
 * ============================================================================
 * 全域共用下拉選單資料庫與渲染中樞 (ui-select-options.js)
 * 採領域命名空間隔離：geo (行政區劃) / market (市場國別)
 * ============================================================================
 */
const UISelectOptions = (function () {
    'use strict';

    // 1. 地理行政區劃資料庫
    const REGIONS_DATABASE = {
        TW: [
            "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市",
            "基隆市", "新竹市", "嘉義市", "宜蘭縣", "新竹縣", "苗栗縣",
            "彰化縣", "南投縣", "雲林縣", "嘉義縣", "屏東縣", "花蓮縣",
            "臺東縣", "澎湖縣"
        ],
        MY: [
            "吉隆坡", "布城", "納閩", "柔佛州", "吉打州", "吉蘭丹州",
            "馬六甲州", "森美蘭州", "彭亨州", "檳城州", "霹靂州", "玻璃市州",
            "雪蘭莪州", "登嘉樓州", "沙巴州", "砂拉越州"
        ]
    };

    return {
        // ====================================================================
        // 1. 地理與行政區劃領域 (UISelectOptions.geo.*)
        // ====================================================================
        geo: {
            DATABASE: REGIONS_DATABASE,

            /**
             * 檢查某地區是否為預設標準縣市/州區
             */
            isStandard(regionName) {
                const standardSet = new Set([...REGIONS_DATABASE.TW, ...REGIONS_DATABASE.MY]);
                return standardSet.has(String(regionName || '').trim());
            },

            /**
             * 取得標準台馬行政區 Optgroup 物件 ({ $tw, $my })
             */
            createStandardOptgroups() {
                const $tw = $('<optgroup label="🇹🇼 台灣"></optgroup>');
                REGIONS_DATABASE.TW.forEach(reg => {
                    $tw.append(`<option value="${reg}">${reg}</option>`);
                });

                const $my = $('<optgroup label="🇲🇾 馬來西亞"></optgroup>');
                REGIONS_DATABASE.MY.forEach(reg => {
                    $my.append(`<option value="${reg}">${reg}</option>`);
                });

                return { $tw, $my };
            },

            /**
             * 填入地區下拉選單（支援預設提示、台馬分組、其他現有地區）
             * @param {Object} opts
             * @param {string|jQuery} opts.target 目標下拉選單
             * @param {string} [opts.placeholder] 提示文字
             * @param {Array<string>} [opts.customRegions] 掃描現有名單中的自訂地區
             * @param {string} [opts.selectedValue] 欲保留的值
             */
            populateRegionsDropdown({ target, placeholder = '', customRegions = [], selectedValue = '' }) {
                const $select = $(target);
                if (!$select.length) return;

                const currentVal = selectedValue || $select.val() || '';
                $select.empty();

                if (placeholder) {
                    $select.append(`<option value="">${placeholder}</option>`);
                }

                const { $tw, $my } = this.createStandardOptgroups();
                $select.append($tw).append($my);

                // 處理非台馬預設的自訂現居地
                const standardSet = new Set([...REGIONS_DATABASE.TW, ...REGIONS_DATABASE.MY]);
                const validCustoms = new Set();
                if (Array.isArray(customRegions)) {
                    customRegions.forEach(r => {
                        const clean = String(r || '').trim();
                        if (clean && !standardSet.has(clean)) {
                            validCustoms.add(clean);
                        }
                    });
                }

                if (validCustoms.size > 0) {
                    const $customGroup = $('<optgroup label="📍 其他現有地區"></optgroup>');
                    validCustoms.forEach(reg => {
                        $customGroup.append(`<option value="${reg}">${reg}</option>`);
                    });
                    $select.append($customGroup);
                }

                if (currentVal) {
                    $select.val(currentVal);
                    if ($.fn.select2 && $select.hasClass('select2-hidden-accessible')) {
                        $select.trigger('change.select2');
                    }
                }
            }
        },

        // ====================================================================
        // 2. 國家與市場領域 (UISelectOptions.market.*)
        // ====================================================================
        market: {
            /**
             * 填入市場國別選單 (TW / MY)
             */
            populateCountryDropdown({ target, placeholder = '', selectedValue = 'TW' }) {
                const $select = $(target);
                if (!$select.length) return;

                $select.empty();
                if (placeholder) {
                    $select.append(`<option value="">${placeholder}</option>`);
                }
                $select.append('<option value="TW">🇹🇼 台灣</option>');
                $select.append('<option value="MY">🇲🇾 馬來西亞</option>');

                if (selectedValue) {
                    $select.val(selectedValue);
                    if ($.fn.select2 && $select.hasClass('select2-hidden-accessible')) {
                        $select.trigger('change.select2');
                    }
                }
            }
        }
    };
})();

if (typeof window !== 'undefined') {
    window.UISelectOptions = UISelectOptions;
}