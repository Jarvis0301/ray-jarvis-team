/**
 * ============================================================================
 * 全域標籤渲染核心 (ui-badges.js)
 * 統一管理系統內所有：組織成員、人脈屬性、產品體系、系統維運與職級權益標籤
 * ============================================================================
 */

const UIBadges = (function () {
    'use strict';

    /**
     * 安全字串清洗輔助函式
     */
    const cleanStr = (val, defaultVal = '') => {
        if (val === undefined || val === null) return defaultVal;
        const s = String(val).trim();
        return s === '' ? defaultVal : s;
    };

    return {
        // ====================================================================
        // 1. 核心基礎工廠 (Core Badge Factory)
        // ====================================================================
        /**
         * 通用 Badge 產生器
         * @param {Object} options
         * @param {string} options.text 標籤文字 (必填)
         * @param {string} [options.icon] FontAwesome 圖示 class (例: 'fa-solid fa-tag')
         * @param {string} [options.className] 自訂 CSS class (例: 'badge-outline-blue')
         * @param {string} [options.color] 文字/圖示顏色 (例: '#8b5cf6')
         * @param {string} [options.bg] 背景色 (例: '#1a122d')
         * @param {string} [options.border] 邊框顏色 (例: 'rgba(139, 92, 246, 0.4)')
         * @param {string} [options.extraStyle] 額外行內 style
         * @returns {string} HTML 字串
         */
        create({ text, icon = '', className = '', color = '', bg = '', border = '', extraStyle = '' }) {
            const safeText = cleanStr(text, '未設定');
            const iconHtml = icon ? `<i class="${icon} me-1"></i>` : '';
            const styleParts = [];

            if (color) styleParts.push(`color: ${color}`);
            if (bg) styleParts.push(`background-color: ${bg}`);
            if (border) styleParts.push(`border: 1px solid ${border}`);
            if (extraStyle) styleParts.push(extraStyle);

            const styleAttr = styleParts.length > 0 ? ` style="${styleParts.join('; ')}"` : '';
            const classAttr = className ? ` ${className}` : '';

            return `<span class="badge${classAttr}"${styleAttr}>${iconHtml}${safeText}</span>`;
        },

        // ====================================================================
        // 2. 組織成員與人脈畫像標籤 (Organization & Partner Badges)
        // ====================================================================
        /**
         * 國家 / 市場標籤 (TW / MY)
         */
        country(countryCode) {
            const code = cleanStr(countryCode, 'TW').toUpperCase();
            if (code === 'MY') {
                return `<span class="badge badge-warning-subtle font-monospace">MY</span>`;
            }
            return `<span class="badge badge-info-subtle font-monospace">TW</span>`;
        },

        /**
         * 官方職級徽章
         * @param {Object} rank 職級主檔物件 ({ rank_name_zh, badge_icon_class, badge_color_hex, ... })
         */
        rank(rank) {
            if (!rank || !rank.rank_id) {
                return `<span class="badge badge-muted-subtle">未設定職級</span>`;
            }
            const hex = rank.badge_color_hex || '#8b5cf6';
            const icon = rank.badge_icon_class || 'fa-solid fa-award';
            const name = cleanStr(rank.rank_name_zh, '未命名職級');

            return `<span class="badge" style="background-color: #130e24; border: 1px solid ${hex}; color: ${hex}; font-weight: 600;"><i class="${icon}"></i> ${name}</span>`;
        },

        /**
         * 經營權模式標籤 (共同經營 / 獨立經營)
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
         * 組織關係屬性 (核心成員 / 上線 / 旁線 / 下線 / 中繼層)
         */
        relation(relation, partnerId = '') {
            if (partnerId === 'PTN-001' || partnerId === 'PTN-002' || relation === '核心成員') {
                return `<span class="badge badge-outline-purple"><i class="fa-solid fa-crown me-1"></i> 核心成員</span>`;
            }
            switch (relation) {
                case '上線': return `<span class="badge badge-outline-green">上線</span>`;
                case '旁線': return `<span class="badge badge-outline-orange">旁線</span>`;
                case '下線': return `<span class="badge badge-outline-blue">下線</span>`;
                case '中繼層': return `<span class="badge badge-outline-gray">中繼層</span>`;
                default: return `<span class="badge badge-outline-gray">未設定</span>`;
            }
        },

        /**
         * 營運狀態 (活躍 / 停滯 / 沉睡 / 凍結)
         */
        operatorStatus(status) {
            switch (status) {
                case '活躍': return `<span class="badge badge-outline-success-subtle">活躍</span>`;
                case '停滯': return `<span class="badge badge-outline-warning-subtle">停滯</span>`;
                case '沉睡': return `<span class="badge badge-outline-danger-subtle">沉睡</span>`;
                case '凍結': return `<span class="badge badge-outline-muted-subtle">凍結</span>`;
                default: return `<span class="badge badge-muted-subtle">未設定</span>`;
            }
        },

        /**
         * 官方會籍狀態 (有效且領獎金 / 維持160SV續約 / 失效)
         */
        memberStatus(status) {
            switch (status) {
                case '有效且領獎金': return `<span class="badge badge-success">有效且領獎金</span>`;
                case '維持160SV續約': return `<span class="badge badge-warning">維持160SV續約</span>`;
                case '失效': return `<span class="badge badge-muted">失效</span>`;
                default: return `<span class="badge badge-muted-subtle">未設定</span>`;
            }
        },

        /**
         * 團隊參與度 / 活動程度
         */
        activityLevel(level) {
            switch (level) {
                case '積極參與': return '<span class="badge badge-success-subtle">積極參與</span>';
                case '參與': return '<span class="badge badge-warning-subtle">參與</span>';
                case '不參與': return '<span class="badge badge-danger-subtle">不參與</span>';
                case '自用消費': return '<span class="badge badge-info-subtle">自用消費</span>';
                case '操作人頭': return '<span class="badge badge-purple-subtle">操作人頭</span>';
                case '失聯': return '<span class="badge badge-muted-subtle">失聯</span>';
                case '個資未知': return '<span class="badge badge-muted-subtle">個資未知</span>';
                case '非團隊成員': return '<span class="badge badge-dark">非團隊成員</span>';
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
         * 健康狀況評級
         */
        healthStatus(status) {
            switch (status) {
                case '良好': return '<span class="badge badge-success-subtle">良好</span>';
                case '亞健康': return '<span class="badge badge-warning-subtle">亞健康</span>';
                case '慢性體質': return '<span class="badge badge-danger-subtle">慢性體質</span>';
                case '調養中': return '<span class="badge badge-info-subtle">調養中</span>';
                case '罹患疾病': return '<span class="badge badge-danger">罹患疾病</span>';
                case '待了解': return '<span class="badge badge-muted-subtle">待了解</span>';
                default: return '<span class="badge badge-muted-subtle">未設定</span>';
            }
        },

        /**
         * 財務狀況評級
         */
        financialStatus(status) {
            switch (status) {
                case '寬裕': return '<span class="badge badge-success-subtle">寬裕</span>';
                case '穩定': return '<span class="badge badge-info-subtle">穩定</span>';
                case '吃緊': return '<span class="badge badge-warning-subtle">吃緊</span>';
                case '高負債': return '<span class="badge badge-danger-subtle">高負債</span>';
                case '尋找副業': return '<span class="badge badge-purple-subtle">尋找副業</span>';
                default: return '<span class="badge badge-muted-subtle">未設定</span>';
            }
        },

        /**
         * 語言能力等級
         */
        languageProficiency(level) {
            switch (level) {
                case '精通': return '<span class="badge badge-indigo-subtle">精通</span>';
                case '流利': return '<span class="badge badge-info-subtle">流利</span>';
                case '普通': return '<span class="badge badge-success-subtle">普通</span>';
                case '略懂': return '<span class="badge badge-warning-subtle">略懂</span>';
                case '不會': return '<span class="badge badge-danger-subtle">不會</span>';
                default: return '<span class="badge badge-muted-subtle">未設定</span>';
            }
        },

        /**
         * 官方會員編號
         */
        memberNo(no) {
            const cleaned = cleanStr(no);
            if (!cleaned) return '';
            return `<span class="text-secondary small font-monospace">${cleaned}</span>`;
        },

        // ====================================================================
        // 3. 產品體系與商城標籤 (Product & Commerce Badges)
        // ====================================================================
        /**
         * 通用產品分類體系標籤 (主系列 / 次系列 / 型態)
         * @param {Object} entity 分類實體物件
         * @param {string} [regionCode='TW'] 地區代碼
         * @param {string} [extraClass=''] 額外 class (例如型態可傳 'badge-type')
         */
        taxonomy(entity, regionCode = 'TW', extraClass = '') {
            if (!entity) return `<span class="badge badge-secondary">未分類</span>`;
            const isMY = cleanStr(regionCode, 'TW').toUpperCase() === 'MY';
            const label = isMY ? (entity.name_en || entity.name_zh || '') : (entity.name_zh || entity.name_en || '');
            const color = entity.text_color || '#8b5cf6';
            const bg = (entity.bg_color && entity.bg_color !== '#1a122d') ? entity.bg_color : `${color}18`;
            const icon = entity.icon_class || 'fa-solid fa-tag';
            const classAttr = extraClass ? ` ${extraClass}` : '';

            return `<span class="badge${classAttr}" style="color: ${color}; background-color: ${bg}; border: 1px solid ${color}40;"><i class="${icon}"></i> ${label}</span>`;
        },

        category(entity, regionCode = 'TW') {
            return this.taxonomy(entity, regionCode, '');
        },

        subcategory(entity, regionCode = 'TW') {
            return this.taxonomy(entity, regionCode, '');
        },

        productType(entity, regionCode = 'TW') {
            return this.taxonomy(entity, regionCode, 'badge-type');
        },

        /**
         * 上市 / 下市狀態標籤
         * @param {string} statusCode 'COMING_SOON' | 'DISCONTINUED' | 'ACTIVE'
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
         * 庫存狀態標籤
         * @param {string} stockCode '現貨' | '缺貨' | '預購'
         */
        stockStatus(stockCode) {
            switch (stockCode) {
                case '現貨': return '<span class="badge badge-success"><i class="fa-solid fa-box"></i> 現貨</span>';
                case '缺貨': return '<span class="badge badge-danger"><i class="fa-solid fa-circle-xmark"></i> 缺貨</span>';
                case '預購': return '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> 預購</span>';
                default: return '<span class="badge badge-muted"><i class="fa-solid fa-question"></i> 未設定</span>';
            }
        },

        /**
         * 明星熱銷標籤
         */
        featured(isFeatured = false) {
            if (!isFeatured) return '';
            return '<span class="badge badge-danger"><i class="fa-solid fa-fire"></i> 明星商品</span>';
        },

        // ====================================================================
        // 4. 系統、版本與通用狀態標籤 (System & Status Badges)
        // ====================================================================
        /**
         * 站點版本 Class (核心版 -> badge-purple, 團隊版 -> badge-blue, 公開版 -> badge-green)
         */
        trackClass(track) {
            switch (track) {
                case '團隊版': return 'badge-blue';
                case '公開版': return 'badge-green';
                case '核心版': return 'badge-purple';
                default: return 'badge-gray';
            }
        },

        /**
         * 站點版本標籤
         */
        track(track) {
            const cls = this.trackClass(track);
            return `<span class="badge ${cls}">${cleanStr(track, '核心版')}</span>`;
        },

        /**
         * 開發進度標籤 (已完成 / 測試中 / 修復中)
         */
        devStatus(status) {
            switch (status) {
                case '已完成': return '<span class="badge badge-success">已完成</span>';
                case '測試中': return '<span class="badge badge-warning">測試中</span>';
                case '修復中': return '<span class="badge badge-danger">修復中</span>';
                default: return `<span class="badge badge-secondary">${cleanStr(status, '開發中')}</span>`;
            }
        },

        /**
         * 啟用 / 停用標籤
         */
        activeStatus(isActive, activeText = '啟用', inactiveText = '停用') {
            const isY = (isActive === 'Y' || isActive === true || isActive === 1 || isActive === '1');
            return isY
                ? `<span class="badge badge-success-subtle"><i class="fa-solid fa-circle-check"></i> ${activeText}</span>`
                : `<span class="badge badge-danger-subtle"><i class="fa-solid fa-ban"></i> ${inactiveText}</span>`;
        },

        // ====================================================================
        // 5. 職級權益與激勵標籤 (Rank Incentives & Rights Badges)
        // ====================================================================
        /**
         * 職級晉升權益膠囊標籤
         * @param {string} text 權益名稱
         * @param {boolean} [isGold=false] 是否高亮為金色 (珍鑽/贈車/全球領導)
         */
        rankRightPill(text, isGold = false) {
            return `<span class="badge-right-pill ${isGold ? 'gold' : ''}"><i class="fa-solid fa-medal"></i> ${text}</span>`;
        }
    };
})();

// 掛載至全域
if (typeof window !== 'undefined') {
    window.UIBadges = UIBadges;
}