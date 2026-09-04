/**
 * ============================================================================
 * 全域共用下拉選單中樞 (ui-select-options.js)
 * 涵蓋：
 * 1. core.render(): 支援固定/動態資料、指定 value/text 欄位、8 種組合 (搜尋/新增/分組)
 * 2. 手動新增 (creatable) 與頁面 CRUD 資料表回呼連動
 * 3. 領域特化層 (geo 行政區劃等固定資料選單)
 * ============================================================================
 */
const UISelectOptions = (function () {
    'use strict';

    // ========================================================================
    // 全域滾動守衛：防脫軌漂移 (支援 iFrame parent 與 modal-body 捕獲)
    // ========================================================================
    let isScrollGuardInitialized = false;

    function initGlobalScrollGuard() {
        if (isScrollGuardInitialized || typeof window === 'undefined') return;
        isScrollGuardInitialized = true;

        const handleScroll = function (e) {
            // 若滾動目標是 Select2 下拉選單本體的選項列表，允許正常滾動，不觸發關閉
            if (e.target && (
                (e.target.classList && e.target.classList.contains('select2-results__options')) ||
                $(e.target).closest('.select2-dropdown').length > 0
            )) {
                return;
            }

            // 只要外部視窗、父視窗、Modal 或 modal-body 發生滾動，立即收合開啟中的下拉選單
            if ($('.select2-container--open').length > 0) {
                $('select.select2-hidden-accessible').select2('close');
            }
        };

        // 1. 監聽當前視窗 (true: 開啟 capture 捕獲階段，確保能攔截到 modal-body 的滾動)
        window.addEventListener('scroll', handleScroll, true);

        // 2. 適配 iFrame 架構：監聽父層主視窗滾動
        if (window.self !== window.top) {
            try {
                window.parent.addEventListener('scroll', handleScroll, true);
            } catch (err) {
                // 跨網域防護
            }
        }
    }

    // ========================================================================
    // 0. 通用 Select2 設定產生器 (對應 8 種功能組合)
    // ========================================================================
    function buildSelect2Config({
        searchable = false,
        creatable = false,
        placeholder = '請選擇...',
        dropdownParent = null,
        onCustomCreate = null
    }) {
        initGlobalScrollGuard();
        
        const config = {
            width: '100%',
            placeholder: placeholder,
            allowClear: true,
            language: {
                noResults: () => creatable ? '鍵入文字後按 Enter 即可新增' : '查無符合資料'
            }
        };

        if (dropdownParent) {
            config.dropdownParent = $(dropdownParent);
        }

        // 維度 1：是否可搜尋 (searchable)
        if (!searchable) {
            config.minimumResultsForSearch = Infinity; // 隱藏搜尋輸入框
        }

        // 維度 2：是否可手動鍵入新增 (creatable / tags)
        if (creatable) {
            config.tags = true;
            config.createTag = function (params) {
                const term = $.trim(params.term);
                if (term === '') return null;
                return {
                    id: term,
                    text: term,
                    newTag: true
                };
            };
            config.templateResult = function (data) {
                const $result = $('<span></span>').text(data.text);
                if (data.newTag) {
                    $result.append(' <em class="text-warning small">(新增自訂項目)</em>');
                }
                return $result;
            };
        }

        return config;
    }

    // ========================================================================
    // 1. 通用核心渲染引擎 (UISelectOptions.core.*)
    // ========================================================================
    const core = {
        /**
         * 通用下拉選單渲染器
         * @param {Object} opts
         * @param {string|jQuery} opts.target 目標 select 元素
         * @param {Array<Object|string>} opts.data 資料來源 (靜態陣列或資料表動態物件陣列)
         * @param {string} [opts.valueKey='value'] 指定 value 取值的欄位屬性名
         * @param {string|Function} [opts.textKey='text'] 指定顯示文字的屬性名或產生函式
         * @param {string} [opts.groupKey='group'] 指定分組名稱的屬性名 (若為分組模式)
         * @param {string} [opts.placeholder=''] 預設未選提示文字
         * @param {string} [opts.selectedValue=''] 預設選中值
         * @param {boolean} [opts.searchable=false] 是否開放搜尋
         * @param {boolean} [opts.creatable=false] 是否可手動鍵入新增
         * @param {boolean} [opts.grouped=false] 是否進行分組 (Optgroup)
         * @param {string|jQuery} [opts.dropdownParent=null] Modal 彈窗父層容器
         * @param {Function} [opts.onCustomCreate=null] 手動新增時觸發的 CRUD 資料表非同步/同步回呼
         */
        render({
            target,
            data = [],
            valueKey = 'value',
            textKey = 'text',
            groupKey = 'group',
            placeholder = '',
            selectedValue = '',
            searchable = false,
            creatable = false,
            grouped = false,
            dropdownParent = null,
            onCustomCreate = null
        }) {
            const $select = $(target);
            if (!$select.length) return;

            // 自動識別：若未手動指定 dropdownParent，但元素位於 .modal 內，自動鎖定該 modal
            let finalDropdownParent = dropdownParent;
            if (!finalDropdownParent) {
                const $closestModal = $select.closest('.modal');
                if ($closestModal.length) {
                    finalDropdownParent = $closestModal;
                }
            }

            const currentVal = selectedValue !== '' ? selectedValue : ($select.val() || '');
            $select.empty();

            if (placeholder) {
                $select.append(`<option value="">${placeholder}</option>`);
            }

            // 輔助函式：提取單項之 value 與 text
            const parseItem = (item) => {
                if (typeof item === 'string' || typeof item === 'number') {
                    return { val: String(item), txt: String(item) };
                }
                const val = item[valueKey] !== undefined ? String(item[valueKey]) : '';
                let txt = '';
                if (typeof textKey === 'function') {
                    txt = textKey(item);
                } else {
                    txt = item[textKey] !== undefined ? String(item[textKey]) : val;
                }
                return { val, txt };
            };

            // 維度 3：是否分組 (grouped)
            if (grouped) {
                const groupMap = new Map();
                data.forEach(item => {
                    const groupName = (typeof item === 'object' && item[groupKey]) ? String(item[groupKey]) : '其他';
                    if (!groupMap.has(groupName)) {
                        groupMap.set(groupName, []);
                    }
                    groupMap.get(groupName).push(item);
                });

                groupMap.forEach((items, gName) => {
                    const $group = $(`<optgroup label="${gName}"></optgroup>`);
                    items.forEach(it => {
                        const { val, txt } = parseItem(it);
                        $group.append(`<option value="${val}">${txt}</option>`);
                    });
                    $select.append($group);
                });
            } else {
                data.forEach(item => {
                    const { val, txt } = parseItem(item);
                    $select.append(`<option value="${val}">${txt}</option>`);
                });
            }

            // 處理選取值還原 (若為可新增模式且值不在清單中，動態預先建立選項)
            if (currentVal !== '') {
                if (creatable && $select.find(`option[value="${currentVal}"]`).length === 0) {
                    $select.append(new Option(currentVal, currentVal, true, true));
                } else {
                    $select.val(currentVal);
                }
            }

            // 若滿足 Select2 條件 (可搜尋、可新增或包含自訂父容器)
            if ($.fn.select2) {
                // 若已初始化過先銷毀以重新套用
                if ($select.hasClass('select2-hidden-accessible')) {
                    $select.select2('destroy');
                }

                const s2Config = buildSelect2Config({
                    searchable,
                    creatable,
                    placeholder,
                    dropdownParent: finalDropdownParent,
                    onCustomCreate
                });

                $select.select2(s2Config);

                // 綁定手動新增與個別頁面 CRUD 資料庫連動
                if (creatable && typeof onCustomCreate === 'function') {
                    $select.off('select2:select.crudSync').on('select2:select.crudSync', async function (e) {
                        const data = e.params.data;
                        if (data && data.newTag) {
                            try {
                                const newCreatedVal = await onCustomCreate(data.id, $select);
                                // 若回呼有回傳特定識別碼或物件，進行值更新
                                if (newCreatedVal) {
                                    $select.val(newCreatedVal).trigger('change');
                                }
                            } catch (err) {
                                console.error('[UISelectOptions] CRUD 回寫失敗:', err);
                            }
                        }
                    });
                }

                if (currentVal !== '') {
                    $select.trigger('change.select2');
                }
            }
        }
    };

    // ========================================================================
    // 2. 特化領域層：行政區劃 (UISelectOptions.geo.*)
    // ========================================================================
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

    const geo = {
        DATABASE: REGIONS_DATABASE,

        isStandard(regionName) {
            const standardSet = new Set([...REGIONS_DATABASE.TW, ...REGIONS_DATABASE.MY]);
            return standardSet.has(String(regionName || '').trim());
        },

        /**
         * 特化：行政區選單 (固定資料 + 分組 + 可搜尋 + 可手動輸入 + 外部 CRUD 連動)
         */
        populateRegionsDropdown({
            target,
            placeholder = '請選擇或輸入地區...',
            customRegions = [],
            selectedValue = '',
            dropdownParent = null,
            onCustomCreate = null
        }) {
            const standardSet = new Set([...REGIONS_DATABASE.TW, ...REGIONS_DATABASE.MY]);
            const structuredData = [];

            // 1. 台灣群組
            REGIONS_DATABASE.TW.forEach(r => structuredData.push({ group: '🇹🇼 台灣 (TW)', name: r, id: r }));
            // 2. 馬來西亞群組
            REGIONS_DATABASE.MY.forEach(r => structuredData.push({ group: '🇲🇾 馬來西亞 (MY)', name: r, id: r }));
            // 3. 外部資料表已存在的自訂地區
            if (Array.isArray(customRegions)) {
                customRegions.forEach(r => {
                    const clean = String(r || '').trim();
                    if (clean && !standardSet.has(clean)) {
                        structuredData.push({ group: '📍 其他現有地區', name: clean, id: clean });
                    }
                });
            }

            core.render({
                target,
                data: structuredData,
                valueKey: 'id',
                textKey: 'name',
                groupKey: 'group',
                placeholder,
                selectedValue,
                searchable: true,   // 可搜尋
                creatable: true,    // 可手動輸入新增
                grouped: true,      // 有分組
                dropdownParent,
                onCustomCreate
            });
        }
    };

    return {
        core,
        geo
    };
})();

if (typeof window !== 'undefined') {
    window.UISelectOptions = UISelectOptions;
}