/**
 * ============================================================================
 * 全域實體與名稱權重解析中樞 (entity-resolver.js)
 * 專職負責各領域實體（產品/進銷存/人員/夥伴/客戶）之名稱權重判定與標準化顯示
 * 排序架構：共用 -> 產品 -> 培訓 -> 進銷存 -> 人員 -> 夥伴 -> 客戶 -> 財務 -> 系統 -> 馬來西亞 -> 工具
 * ============================================================================
 */
const EntityResolver = (function () {
    'use strict';

    return {
        // ====================================================================
        // 1. 產品品項領域 (Product)
        // displayMode: 1 ->「name」 | 2 ->「name [code]」
        // ====================================================================
        product(prdCode, products = [], displayMode = 1) {
            if (!prdCode) return '-';
            const list = Array.isArray(products) ? products : Object.values(products || {});
            const prd = list.find(p => (p.product_code || p.code) === prdCode);
            if (!prd) return prdCode;
            const name = prd.short_name || prd.name || prdCode;
            const code = prd.product_code || prd.code || prdCode;
            return displayMode === 2 ? `${name} [${code}]` : name;
        },

        // ====================================================================
        // 2. 進銷存與倉儲據點領域 (PSI / Warehouse)
        // displayMode: 1 ->「name」 | 2 ->「name [id]」
        // ====================================================================
        warehouse(whId, warehouses = [], displayMode = 1) {
            if (!whId) return '-';
            const list = Array.isArray(warehouses) ? warehouses : Object.values(warehouses || {});
            const wh = list.find(w => w.id === whId);
            if (!wh) return whId;
            const name = wh.warehouse_name || wh.name || whId;
            return displayMode === 2 ? `${name} [${wh.id}]` : name;
        },

        // ====================================================================
        // 3. 個人主檔領域 (Person)
        // 權重解析：前端顯示名稱 > 中文 > 英文 > 暱稱
        // displayMode: 1 ->「姓名」 | 2 ->「姓名 [person_id]」
        // ====================================================================
        person(target, persons = [], displayMode = 1) {
            if (!target) return '';
            let p = target;
            if (typeof target === 'string') {
                const list = Array.isArray(persons) ? persons : Object.values(persons || {});
                p = list.find(item => (item.person_id || item.id) === target);
                if (!p) return target;
            }
            const name = (p.display_name && p.display_name.trim()) ||
                         (p.name_zh && p.name_zh.trim()) ||
                         (p.name_en && p.name_en.trim()) ||
                         (p.preferred_name && p.preferred_name.trim()) ||
                         p.person_id || p.id || '';
            const pid = p.person_id || p.id || target;
            return displayMode === 2 ? `${name} [${pid}]` : name;
        },

        // ====================================================================
        // 4. 夥伴組織領域 (Partner)
        // displayMode: 1 ->「姓名」 | 2 ->「姓名 (member_no) [partner_id]」
        // ====================================================================
        partner(target, partners = [], persons = [], displayMode = 1) {
            if (!target) return '-';
            let p = typeof target === 'object' ? target : null;
            if (!p) {
                const list = Array.isArray(partners) ? partners : Object.values(partners || {});
                p = list.find(item => item.partner_id === target || item.member_no === target);
            }
            if (!p) return typeof target === 'string' ? target : '-';

            const pid = p.partner_id || p.id || '';
            const personId = p.person_id || pid;
            const name = this.person(personId, persons, 1) || p.name_zh || pid;

            if (displayMode === 2) {
                const memberNoPart = p.member_no ? ` (${p.member_no})` : '';
                return `${name}${memberNoPart} [${pid}]`;
            }
            return name;
        },

        // ====================================================================
        // 5. 客戶主檔領域 (Customer)
        // displayMode: 1 ->「姓名」 | 2 ->「姓名 [customer_id]」
        // ====================================================================
        customer(target, customers = [], persons = [], displayMode = 1) {
            if (!target) return '-';
            let c = typeof target === 'object' ? target : null;
            if (!c) {
                const list = Array.isArray(customers) ? customers : Object.values(customers || {});
                c = list.find(item => item.customer_id === target || item.id === target);
            }
            if (!c) return typeof target === 'string' ? target : '-';

            const cid = c.customer_id || c.id || '';
            const personId = c.person_id || cid;
            const name = this.person(personId, persons, 1) || c.customer_name || c.name || cid;

            return displayMode === 2 ? `${name} [${cid}]` : name;
        }
    };
})();

if (typeof window !== 'undefined') {
    window.EntityResolver = EntityResolver;
}