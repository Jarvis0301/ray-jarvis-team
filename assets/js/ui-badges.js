/**
 * ============================================================================
 * 全域標籤渲染核心 (ui-badges.js)
 * 採領域命名空間隔離：common / partner / product / system / rank
 * ============================================================================
 */
const UIBadges = (function () {
    'use strict';

    const clean = (val, defaultVal = '') => {
        if (val === undefined || val === null) return defaultVal;
        const s = String(val).trim();
        return s === '' ? defaultVal : s;
    };

    return {
        // ====================================================================
        // 1. 底層通用工廠 (UIBadges.common.*)
        // ====================================================================
        common: {
            /**
             * 自訂基礎標籤
             */
            custom({ text, icon = '', className = '', color = '', bg = '', border = '' }) {
                const safeText = clean(text, '未設定');
                const iconHtml = icon ? `<i class="${icon} me-1"></i>` : '';
                const styleParts = [];

                if (color) styleParts.push(`color: ${color}`);
                if (bg) styleParts.push(`background-color: ${bg}`);
                if (border) styleParts.push(`border: 1px solid ${border}`);

                const styleAttr = styleParts.length > 0 ? ` style="${styleParts.join('; ')}"` : '';
                const classAttr = className ? ` ${className}` : '';

                return `<span class="badge${classAttr}"${styleAttr}>${iconHtml}${safeText}</span>`;
            },

            /**
             * 通用布林 / 啟用標籤
             */
            boolean(val, trueText = '是', falseText = '否') {
                const isTrue = (val === 'Y' || val === true || val === 1 || val === '1' || val === 'TRUE');
                return isTrue
                    ? `<span class="badge badge-success-subtle"><i class="fa-solid fa-circle-check"></i> ${trueText}</span>`
                    : `<span class="badge badge-danger-subtle"><i class="fa-solid fa-ban"></i> ${falseText}</span>`;
            },

            /**
             * 國家市場標籤 (TW / MY)
             */
            country(countryCode) {
                const code = clean(countryCode, 'TW').toUpperCase();
                switch (code) {
                    case 'TW': return `<span class="badge badge-cyan-subtle font-monospace">TW</span>`;
                    case 'MY': return `<span class="badge badge-yellow-subtle font-monospace">MY</span>`;
                    default: return `<span class="badge badge-muted-subtle font-monospace">未設定</span>`;
                }
            }
        },

        // ====================================================================
        // 2. 組織與夥伴領域 (UIBadges.partner.*)
        // ====================================================================
        partner: {
            /**
             * 組織血緣關係 (核心成員 / 上線 / 旁線 / 下線 / 中繼層)
             */
            relation(relation, partnerId = '') {
                if (partnerId === 'PTN-001' || partnerId === 'PTN-002' || relation === '核心成員') {
                    return `<span class="badge badge-outline-indigo"><i class="fa-solid fa-crown me-1"></i> 核心成員</span>`;
                }
                switch (relation) {
                    case '上線': return `<span class="badge badge-outline-green">上線</span>`;
                    case '旁線': return `<span class="badge badge-outline-orange">旁線</span>`;
                    case '下線': return `<span class="badge badge-outline-blue">下線</span>`;
                    case '中繼層': return `<span class="badge badge-outline-gray">中繼層</span>`;
                    default: return `<span class="badge badge-outline-muted">未設定</span>`;
                }
            },

            /**
             * 經營權模式 (共同經營 / 獨立經營)
             */
            operationMode(partner, coOpDisplayName = '') {
                if (!partner) return '';
                const mode = partner.operation_mode || partner.account_holder_type || '';
                const nameText = coOpDisplayName ? `【${coOpDisplayName}】` : '';

                if (mode === '共同經營' || mode === '共同經營者') {
                    return `<span class="badge badge-info"><i class="fa-solid fa-user-group me-1"></i> 共同經營${nameText}</span>`;
                } else if (mode === '獨立經營') {
                    return `<span class="badge badge-warning"><i class="fa-solid fa-user-shield me-1"></i> 獨立經營${nameText}</span>`;
                }
                return '';
            },

            /**
             * 官方會籍狀態 (有效且領獎金 / 維持160SV續約 / 失效)
             */
            memberStatus(status) {
                switch (status) {
                    case '有效且領獎金': return `<span class="badge badge-success">有效且領獎金</span>`;
                    case '維持160SV續約': return `<span class="badge badge-warning">維持160SV續約</span>`;
                    case '失效': return `<span class="badge badge-gray">失效</span>`;
                    default: return `<span class="badge badge-muted">未設定</span>`;
                }
            },

            /**
             * 經營者營運狀態 (活躍 / 停滯 / 沉睡 / 凍結)
             */
            operatorStatus(status) {
                switch (status) {
                    case '活躍': return '<span class="badge badge-outline-success-subtle">活躍</span>';
                    case '停滯': return '<span class="badge badge-outline-warning-subtle">停滯</span>';
                    case '沉睡': return '<span class="badge badge-outline-danger-subtle">沉睡</span>';
                    case '凍結': return '<span class="badge badge-outline-gray-subtle">凍結</span>';
                    case '身故停止': return '<span class="badge badge-danger"><i class="fa-solid fa-ribbon me-1"></i>身故停止</span>';
                    case '因繼承原權停止': return '<span class="badge badge-purple-subtle"><i class="fa-solid fa-code-merge me-1"></i>因繼承原權停止</span>';
                    case '因結婚合併停止': return '<span class="badge badge-info-subtle"><i class="fa-solid fa-people-arrows me-1"></i>因結婚合併停止</span>';
                    case '因離婚協議退出': return '<span class="badge badge-orange-subtle"><i class="fa-solid fa-user-xmark me-1"></i>因離婚協議退出</span>';
                    default: return '<span class="badge badge-muted-subtle">未設定</span>';
                }
            },

            /**
             * 團隊參與度 (積極參與 / 參與 / 自用消費 / 操作人頭 / 失聯 等)
             */
            activityLevel(level) {
                switch (level) {
                    case '積極參與': return '<span class="badge badge-success-subtle">積極參與</span>';
                    case '參與': return '<span class="badge badge-warning-subtle">參與</span>';
                    case '不參與': return '<span class="badge badge-danger-subtle">不參與</span>';
                    case '自用消費': return '<span class="badge badge-info-subtle">自用消費</span>';
                    case '操作人頭': return '<span class="badge badge-orange-subtle">操作人頭</span>';
                    case '失聯': return '<span class="badge badge-red-subtle">失聯</span>';
                    case '個資未知': return '<span class="badge badge-pink-subtle">個資未知</span>';
                    case '非團隊成員': return '<span class="badge badge-dark-subtle">非團隊成員</span>';
                    default: return '<span class="badge badge-muted-subtle">未設定</span>';
                }
            },

            /**
             * 人脈身份類型 (夥伴 / 團隊成員 / 客戶 等)
             */
            identityType(type) {
                switch (type) {
                    case '夥伴': return '<span class="badge badge-orange">夥伴</span>';
                    case '團隊成員': return '<span class="badge badge-blue">團隊成員</span>';
                    case '潛在團隊成員': return '<span class="badge badge-blue-subtle">潛在團隊成員</span>';
                    case '客戶': return '<span class="badge badge-green">客戶</span>';
                    case '潛在客戶': return '<span class="badge badge-green-subtle">潛在客戶</span>';
                    default: return '<span class="badge badge-muted-subtle">未設定</span>';
                }
            },

            /**
             * 使用身份類型 (經營者 / 消費者)
             */
            usageIdentity(type) {
                switch (type) {
                    case '經營者': return '<span class="badge badge-outline-blue">經營者</span>';
                    case '消費者': return '<span class="badge badge-outline-green">消費者</span>';
                    default: return '<span class="badge badge-outline-green">未設定</span>';
                }
            },

            /**
             * 個人健康狀態
             */
            healthStatus(status) {
                switch (status) {
                    case '良好': return '<span class="badge badge-success-subtle">良好</span>';
                    case '亞健康': return '<span class="badge badge-orange-subtle">亞健康</span>';
                    case '慢性體質': return '<span class="badge badge-warning-subtle">慢性體質</span>';
                    case '調養中': return '<span class="badge badge-info-subtle">調養中</span>';
                    case '罹患疾病': return '<span class="badge badge-danger-subtle">罹患疾病</span>';
                    case '待了解': return '<span class="badge badge-muted-subtle">待了解</span>';
                    default: return '<span class="badge badge-muted-subtle">未設定</span>';
                }
            },

            /**
             * 個人財務狀況
             */
            financialStatus(status) {
                switch (status) {
                    case '寬裕': return '<span class="badge badge-success-subtle">寬裕</span>';
                    case '穩定': return '<span class="badge badge-info-subtle">穩定</span>';
                    case '吃緊': return '<span class="badge badge-warning-subtle">吃緊</span>';
                    case '高負債': return '<span class="badge badge-danger-subtle">高負債</span>';
                    case '尋找副業': return '<span class="badge badge-accent-subtle">尋找副業</span>';
                    default: return '<span class="badge badge-muted-subtle">未設定</span>';
                }
            },

            /**
             * 語言精通能力
             */
            languageProficiency(level) {
                switch (level) {
                    case '精通': return '<span class="badge badge-info-subtle">精通</span>';
                    case '流利': return '<span class="badge badge-success-subtle">流利</span>';
                    case '普通': return '<span class="badge badge-warning-subtle">普通</span>';
                    case '略懂': return '<span class="badge badge-orange-subtle">略懂</span>';
                    case '不會': return '<span class="badge badge-danger-subtle">不會</span>';
                    default: return '<span class="badge badge-muted-subtle">未設定</span>';
                }
            },

            /**
             * 葡眾會員編號
             */
            memberNo(target) {
                // 支援傳入字串 member_no 或直接傳入 partner 物件
                const no = (typeof target === 'object' && target !== null) ? target.member_no : target;
                const cleaned = clean(no);
                if (!cleaned) return '';
                return `<span class="text-secondary small font-monospace">${cleaned}</span>`;
            }
        },

        // ====================================================================
        // 3. 產品與商品領域 (UIBadges.product.*)
        // ====================================================================
        product: {
            /**
             * 產品體系分類標籤 (主系列 / 次系列 / 型態)
             */
            taxonomy(entity, regionCode = 'TW', extraClass = '') {
                if (!entity) return `<span class="badge badge-muted">未分類</span>`;
                const isMY = clean(regionCode, 'TW').toUpperCase() === 'MY';
                
                // 同時相容 tool-order.js 的 .name 與 prd-basic.js 的 .name_zh / .name_en
                const label = entity.name || (isMY ? (entity.name_en || entity.name_zh) : (entity.name_zh || entity.name_en)) || '';
                const color = entity.color || entity.text_color || '#8b5cf6';
                const rawBg = entity.bg || entity.bg_color;
                const bg = (rawBg && rawBg !== '#1a122d') ? rawBg : `${color}18`;
                const icon = entity.icon || entity.icon_class || 'fa-solid fa-tag';
                const classAttr = extraClass ? ` ${extraClass}` : '';

                return `<span class="badge${classAttr}" style="color: ${color}; background-color: ${bg}; border: 1px solid ${color}40;"><i class="${icon}"></i> ${label}</span>`;
            },

            category(entity, regionCode = 'TW') {
                return UIBadges.product.taxonomy(entity, regionCode, '');
            },

            subcategory(entity, regionCode = 'TW') {
                return UIBadges.product.taxonomy(entity, regionCode, '');
            },

            type(entity, regionCode = 'TW') {
                return UIBadges.product.taxonomy(entity, regionCode, 'badge-type');
            },

            /**
             * 上市 / 下市狀態
             */
            launchStatus(statusCode) {
                switch (statusCode) {
                    case 'ACTIVE': return '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> 販售中</span>';
                    case 'COMING_SOON': return '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> 即將上市</span>';
                    case 'DISCONTINUED': return '<span class="badge badge-danger"><i class="fa-solid fa-ban"></i> 已下市</span>';
                    default: return '<span class="badge badge-muted"><i class="fa-solid fa-question"></i> 未設定</span>';
                }
            },

            /**
             * 庫存狀態
             */
            stockStatus(stockCode) {
                switch (stockCode) {
                    case '現貨': return '<span class="badge badge-success-subtle"><i class="fa-solid fa-box"></i> 現貨</span>';
                    case '缺貨': return '<span class="badge badge-danger-subtle"><i class="fa-solid fa-circle-xmark"></i> 缺貨</span>';
                    case '預購': return '<span class="badge badge-accent-subtle"><i class="fa-solid fa-clock"></i> 預購</span>';
                    default: return '<span class="badge badge-muted-subtle"><i class="fa-solid fa-question"></i> 未設定</span>';
                }
            },

            /**
             * 明星熱銷標籤
             */
            featured(isFeatured = false) {
                return isFeatured
                    ? '<span class="badge badge-danger"><i class="fa-solid fa-fire"></i> 明星商品</span>'
                    : '';
            }
        },

        // ====================================================================
        // 4. 職級與權益領域 (UIBadges.rank.*)
        // ====================================================================
        rank: {
            /**
             * 官方職級徽章
             */
            badge(rankObj) {
                if (!rankObj || !rankObj.rank_id) {
                    return `<span class="badge badge-muted-subtle">未設定職級</span>`;
                }
                const hex = rankObj.badge_color_hex || '#8b5cf6';
                const icon = rankObj.badge_icon_class || 'fa-solid fa-award';
                const name = clean(rankObj.rank_name_zh, '未命名職級');

                return `<span class="badge" style="background-color: #130e24; border: 1px solid ${hex}; color: ${hex}; font-weight: 600;"><i class="${icon}"></i> ${name}</span>`;
            },

            /**
             * 職級權益膠囊標籤
             */
            rightPill(text, isGold = false) {
                return `<span class="badge-right-pill ${isGold ? 'gold' : ''}"><i class="fa-solid fa-medal"></i> ${text}</span>`;
            }
        },

        // ====================================================================
        // 5. 系統與選單架構領域 (UIBadges.system.*)
        // ====================================================================
        system: {
            /**
             * 站點版本 Class (核心版 / 團隊版 / 公開版)
             */
            trackClass(track) {
                switch (track) {
                    case '核心版': return 'badge-purple';
                    case '團隊版': return 'badge-blue';
                    case '公開版': return 'badge-green';
                    default: return 'badge-gray';
                }
            },

            /**
             * 站點版本標籤
             */
            track(track) {
                const cls = UIBadges.system.trackClass(track);
                return `<span class="badge ${cls}">${clean(track, '核心版')}</span>`;
            },

            /**
             * 模組開發進度狀態
             */
            devStatus(status) {
                switch (status) {
                    case '已完成': return '<span class="badge badge-success">已完成</span>';
                    case '測試中': return '<span class="badge badge-warning">測試中</span>';
                    case '修復中': return '<span class="badge badge-danger">修復中</span>';
                    default: return `<span class="badge badge-muted">${clean(status, '開發中')}</span>`;
                }
            }
        },

        // ====================================================================
        // 6. 倉儲與物流領域 (UIBadges.warehouse.*)
        // ====================================================================
        warehouse: {
            /**
             * 據點倉儲類型標籤
             * 官方：badge-blue-subtle
             * 自用：badge-teal-subtle
             * 海外：badge-outline-cyan
             * 物流：badge-outline-white
             */
            type(warehouseType) {
                const type = (warehouseType || '').trim();
                switch (type) {
                    case 'OFFICIAL_CENTER':
                    case '官方營運中心':
                        return '<span class="badge badge-blue-subtle"><i class="fa-solid fa-building-flag me-1"></i> 官方營運中心</span>';
                    case 'PRIVATE_HUB':
                    case '自用常備倉':
                        return '<span class="badge badge-teal-subtle"><i class="fa-solid fa-vault me-1"></i> 自用常備倉</span>';
                    case 'TRANSIT_OVERSEAS':
                    case '海外商務倉':
                        return '<span class="badge badge-outline-cyan"><i class="fa-solid fa-plane-departure me-1"></i> 海外商務倉</span>';
                    case 'LOGISTICS_IN_TRANSIT':
                    case '物流在途倉':
                        return '<span class="badge badge-outline-white"><i class="fa-solid fa-truck-fast me-1"></i> 物流在途倉</span>';
                    default:
                        return '<span class="badge badge-muted-subtle">未設定</span>';
                }
            }
        },

        // ====================================================================
        // 7. 庫存告警與安全調度領域 (UIBadges.stockAlert.*)
        // ====================================================================
        stockAlert: {
            /**
             * 庫存預警類型標籤
             */
            type(alertType) {
                const type = clean(alertType, '日常提示');
                switch (type) {
                    case '低於安全水位':
                        return '<span class="badge badge-danger-subtle"><i class="fa-solid fa-triangle-exclamation me-1"></i>低於安全水位</span>';
                    case '90天近效期':
                        return '<span class="badge badge-warning-subtle"><i class="fa-solid fa-hourglass-half me-1"></i>90天近效期</span>';
                    case '30天極危效期':
                        return '<span class="badge badge-danger-subtle"><i class="fa-solid fa-triangle-exclamation me-1"></i>30天極危效期</span>';
                    case '已過期':
                        return '<span class="badge badge-danger"><i class="fa-solid fa-skull me-1"></i>已過期</span>';
                    case '品質鎖定':
                        return '<span class="badge badge-muted-subtle"><i class="fa-solid fa-lock me-1"></i>品質鎖定</span>';
                    default:
                        return `<span class="badge badge-purple-subtle">${type}</span>`;
                }
            },

            /**
             * 預警嚴重性等級標籤
             */
            level(alertLevel) {
                const lvl = clean(alertLevel, '一般');
                switch (lvl) {
                    case '緊急':
                        return '<span class="badge badge-danger-subtle fw-bold"><i class="fa-solid fa-circle-exclamation me-1"></i>緊急</span>';
                    case '注意':
                        return '<span class="badge badge-warning-subtle fw-bold">注意</span>';
                    case '一般':
                    default:
                        return '<span class="badge badge-muted-subtle">一般</span>';
                }
            },

            /**
             * 告警處置狀態標籤
             */
            status(statusCode) {
                const s = clean(statusCode, '未處理');
                switch (s) {
                    case '已知悉':
                        return '<span class="badge badge-info-subtle">已知悉</span>';
                    case '已轉特惠促銷/試用':
                        return '<span class="badge badge-warning-subtle">已轉特惠/試用</span>';
                    case '已結案出清':
                        return '<span class="badge badge-success-subtle">已結案出清</span>';
                    case '未處理':
                    default:
                        return '<span class="badge badge-muted-subtle">未處理</span>';
                }
            }
        }
    };
})();

if (typeof window !== 'undefined') {
    window.UIBadges = UIBadges;
}