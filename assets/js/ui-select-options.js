/**
 * ============================================================================
 * 全域共用下拉選單中樞 (ui-select-options.js)
 * 涵蓋：
 * 1. 共用領域：core (核心渲染引擎)、geo (行政區劃)
 * 2. 產品領域：product (產品品項)
 * 3. 進銷存領域：warehouse (倉儲據點)
 * 4. 人員領域：person (個人主檔，內建「翁榮祥」、「林承志」置頂排序)
 * 5. 夥伴領域：partner (夥伴組織，內建「翁榮祥」、「林承志」置頂排序)
 * 6. 客戶領域：customer (客戶主檔)
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
            if (e.target && (
                (e.target.classList && e.target.classList.contains('select2-results__options')) ||
                $(e.target).closest('.select2-dropdown').length > 0
            )) {
                return;
            }

            if ($('.select2-container--open').length > 0) {
                $('select.select2-hidden-accessible').select2('close');
            }
        };

        window.addEventListener('scroll', handleScroll, true);

        if (window.self !== window.top) {
            try {
                window.parent.addEventListener('scroll', handleScroll, true);
            } catch (err) {
                // 跨網域防護
            }
        }
    }

    // ========================================================================
    // 通用 Select2 設定產生器
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

        if (!searchable) {
            config.minimumResultsForSearch = Infinity;
        }

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
    // 1. 共用領域 (UISelectOptions.core.* / UISelectOptions.geo.*)
    // ========================================================================
    const core = {
        /**
         * 通用下拉選單渲染器
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

            if (currentVal !== '') {
                if (creatable && $select.find(`option[value="${currentVal}"]`).length === 0) {
                    $select.append(new Option(currentVal, currentVal, true, true));
                } else {
                    $select.val(currentVal);
                }
            }

            if ($.fn.select2) {
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

                if (creatable && typeof onCustomCreate === 'function') {
                    $select.off('select2:select.crudSync').on('select2:select.crudSync', async function (e) {
                        const data = e.params.data;
                        if (data && data.newTag) {
                            try {
                                const newCreatedVal = await onCustomCreate(data.id, $select);
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

            REGIONS_DATABASE.TW.forEach(r => structuredData.push({ group: '🇹🇼 台灣 (TW)', name: r, id: r }));
            REGIONS_DATABASE.MY.forEach(r => structuredData.push({ group: '🇲🇾 馬來西亞 (MY)', name: r, id: r }));

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
                searchable: true,
                creatable: true,
                grouped: true,
                dropdownParent,
                onCustomCreate
            });
        }
    };

    // ========================================================================
    // 2. 產品品項領域 (UISelectOptions.product.*)
    // displayMode: 1 ->「name」 | 2 ->「name [code]」
    // ========================================================================
    const product = {
        populate({
            target,
            products = [],
            displayMode = 2,
            placeholder = '-- 請選擇產品品項 --',
            selectedValue = '',
            searchable = true,
            grouped = true,
            dropdownParent = null,
            filterFn = null,
            onChange = null
        }) {
            const rawList = Array.isArray(products) ? products : Object.values(products || {});
            const filtered = typeof filterFn === 'function' ? rawList.filter(filterFn) : rawList;

            const regionPriority = { 'TW': 1, 'MY': 2 };
            const structured = [...filtered].map(p => {
                const code = p.product_code || p.code || p.id || '';
                const region = (p.region_code || p.region || 'TW').toUpperCase();
                const group = region === 'TW' ? '🇹🇼 台灣市場' : (region === 'MY' ? '🇲🇾 馬來西亞市場' : '🌐 其他市場');
                return {
                    ...p,
                    _code: code,
                    _region: region,
                    _group: group
                };
            }).sort((a, b) => {
                const prioA = regionPriority[a._region] || 99;
                const prioB = regionPriority[b._region] || 99;
                if (prioA !== prioB) return prioA - prioB;
                return a._code.localeCompare(b._code);
            });

            core.render({
                target,
                data: structured,
                valueKey: '_code',
                textKey: (p) => {
                    const name = p.short_name || p.name || p._code;
                    return displayMode === 1 ? name : `${name} [${p._code}]`;
                },
                groupKey: '_group',
                placeholder,
                selectedValue,
                searchable,
                creatable: false,
                grouped,
                dropdownParent,
                onChange
            });
        }
    };

    // ========================================================================
    // 3. 進銷存與倉儲領域 (UISelectOptions.warehouse.*)
    // displayMode: 1 ->「name」 | 2 ->「name [id]」
    // ========================================================================
    const warehouse = {
        getSortOrder(type = '') {
            const t = String(type).trim().toUpperCase();
            if (t.includes('自用') || t === 'PRIVATE_HUB') return 1;
            if (t.includes('海外') || t === 'TRANSIT_OVERSEAS') return 2;
            if (t.includes('官方') || t === 'OFFICIAL_CENTER') return 3;
            if (t.includes('物流') || t === 'LOGISTICS_IN_TRANSIT') return 4;
            return 99;
        },

        populate({
            target,
            warehouses = [],
            displayMode = 2,
            placeholder = '-- 請選擇據點倉儲 --',
            selectedValue = '',
            searchable = true,
            dropdownParent = null,
            filterFn = null,
            onChange = null
        }) {
            const rawList = Array.isArray(warehouses) ? warehouses : Object.values(warehouses || {});
            const filtered = typeof filterFn === 'function' ? rawList.filter(filterFn) : rawList;

            const sorted = [...filtered].sort((a, b) => {
                const orderA = warehouse.getSortOrder(a.warehouse_type || a.type);
                const orderB = warehouse.getSortOrder(b.warehouse_type || b.type);
                if (orderA !== orderB) return orderA - orderB;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });

            core.render({
                target,
                data: sorted,
                valueKey: 'id',
                textKey: (w) => {
                    const name = w.warehouse_name || w.name || w.id;
                    return displayMode === 1 ? name : `${name} [${w.id}]`;
                },
                placeholder,
                selectedValue,
                searchable,
                creatable: false,
                grouped: false,
                dropdownParent,
                onChange
            });
        }
    };

    // ========================================================================
    // 4. 個人主檔領域 (UISelectOptions.person.*)
    // displayMode: 1 ->「姓名」 | 2 ->「姓名 [person id]」
    // ========================================================================
    const person = {
        /**
         * 優先排序判定：翁榮祥 (1) -> 林承志 (2) -> 其餘依照中文語系排序 (99)
         */
        getSortPriority(target, resolvedName = '') {
            if (!target) return 99;
            const id = String(target.partner_id || target.person_id || target.id || target._id || '').trim().toUpperCase();
            const name = String(resolvedName || target.display_name || target.name_zh || target._name || '').trim();

            if (id === 'PTN-0001' || id === 'PTN-001' || id === 'PSN-0001' || id === 'PSN-TW-001' || id === 'PSN-00001' || name.includes('翁榮祥')) return 1;
            if (id === 'PTN-0002' || id === 'PTN-002' || id === 'PSN-0002' || id === 'PSN-TW-002' || id === 'PSN-00002' || name.includes('林承志')) return 2;
            return 99;
        },

        resolveName(target, persons = []) {
            if (!target) return '';
            let p = target;
            if (typeof target === 'string') {
                const list = Array.isArray(persons) ? persons : Object.values(persons || {});
                p = list.find(item => (item.person_id || item.id) === target);
                if (!p) return target;
            }

            if (p.display_name && String(p.display_name).trim()) return String(p.display_name).trim();
            if (p.name_zh && String(p.name_zh).trim()) return String(p.name_zh).trim();
            if (p.name_en && String(p.name_en).trim()) return String(p.name_en).trim();
            if (p.preferred_name && String(p.preferred_name).trim()) return String(p.preferred_name).trim();
            return p.person_id || p.id || '';
        },

        populate({
            target,
            persons = [],
            displayMode = 2,
            placeholder = '-- 請選擇人員 --',
            selectedValue = '',
            searchable = true,
            dropdownParent = null,
            filterFn = null,
            onChange = null
        }) {
            const rawList = Array.isArray(persons) ? persons : Object.values(persons || {});
            const filtered = typeof filterFn === 'function' ? rawList.filter(filterFn) : rawList;

            const structured = filtered.map(p => {
                const personId = p.person_id || p.id || '';
                const name = person.resolveName(p);
                const label = displayMode === 1 ? name : `${name} [${personId}]`;

                return {
                    ...p,
                    _id: personId,
                    _name: name,
                    _label: label
                };
            }).sort((a, b) => {
                const prioA = person.getSortPriority(a, a._name);
                const prioB = person.getSortPriority(b, b._name);
                if (prioA !== prioB) return prioA - prioB;
                return a._label.localeCompare(b._label, 'zh-TW');
            });

            core.render({
                target,
                data: structured,
                valueKey: '_id',
                textKey: '_label',
                placeholder,
                selectedValue,
                searchable,
                creatable: false,
                grouped: false,
                dropdownParent,
                onChange
            });
        }
    };

    // ========================================================================
    // 5. 夥伴組織領域 (UISelectOptions.partner.*)
    // displayMode: 1 ->「姓名」 | 2 ->「姓名 (member no) [partner id]」
    // ========================================================================
    const partner = {
        populate({
            target,
            partners = [],
            persons = [],
            displayMode = 2,
            placeholder = '-- 請選擇夥伴 --',
            selectedValue = '',
            searchable = true,
            dropdownParent = null,
            filterFn = null,
            onChange = null
        }) {
            const rawPartners = Array.isArray(partners) ? partners : Object.values(partners || {});
            const filtered = typeof filterFn === 'function' ? rawPartners.filter(filterFn) : rawPartners;

            const structured = filtered.map(p => {
                const partnerId = p.partner_id || p.id || '';
                const personId = p.person_id || partnerId;
                const name = person.resolveName(personId, persons) || p.name_zh || partnerId;

                let label = name;
                if (displayMode === 2) {
                    const memberNoPart = p.member_no ? ` (${p.member_no})` : '';
                    label = `${name}${memberNoPart} [${partnerId}]`;
                }

                return {
                    ...p,
                    _id: partnerId,
                    _name: name,
                    _label: label
                };
            }).sort((a, b) => {
                const prioA = person.getSortPriority(a, a._name);
                const prioB = person.getSortPriority(b, b._name);
                if (prioA !== prioB) return prioA - prioB;
                return a._label.localeCompare(b._label, 'zh-TW');
            });

            core.render({
                target,
                data: structured,
                valueKey: '_id',
                textKey: '_label',
                placeholder,
                selectedValue,
                searchable,
                creatable: false,
                grouped: false,
                dropdownParent,
                onChange
            });
        }
    };

    // ========================================================================
    // 6. 客戶主檔領域 (UISelectOptions.customer.*)
    // displayMode: 1 ->「姓名」 | 2 ->「姓名 [customer id]」
    // ========================================================================
    const customer = {
        populate({
            target,
            customers = [],
            persons = [],
            displayMode = 2,
            placeholder = '-- 請選擇客戶 --',
            selectedValue = '',
            searchable = true,
            dropdownParent = null,
            filterFn = null,
            onChange = null
        }) {
            const rawCustomers = Array.isArray(customers) ? customers : Object.values(customers || {});
            const filtered = typeof filterFn === 'function' ? rawCustomers.filter(filterFn) : rawCustomers;

            const structured = filtered.map(c => {
                const customerId = c.customer_id || c.id || '';
                const personId = c.person_id || customerId;
                const name = person.resolveName(personId, persons) || customerId;
                const label = displayMode === 1 ? name : `${name} [${customerId}]`;

                return {
                    ...c,
                    _id: customerId,
                    _name: name,
                    _label: label
                };
            }).sort((a, b) => a._label.localeCompare(b._label, 'zh-TW'));

            core.render({
                target,
                data: structured,
                valueKey: '_id',
                textKey: '_label',
                placeholder,
                selectedValue,
                searchable,
                creatable: false,
                grouped: false,
                dropdownParent,
                onChange
            });
        }
    };

    return {
        core,
        geo,
        product,
        warehouse,
        person,
        partner,
        customer
    };
})();

if (typeof window !== 'undefined') {
    window.UISelectOptions = UISelectOptions;
}