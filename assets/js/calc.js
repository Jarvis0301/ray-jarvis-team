/**
 * ============================================================================
 * 榮祥團隊數位戰術控制台 - 核心高精度計算引擎 (app-calc.js)
 * 專責處理定點數運算、散裝拆盒演算法、SV 權重分流與 50/50 分帳校準
 * ============================================================================
 */
const AppCalc = {
    /**
     * 安全加法 (避免 0.1 + 0.2 浮點失真)
     */
    add(a, b) {
        const factor = 10000;
        return (Math.round((Number(a) || 0) * factor) + Math.round((Number(b) || 0) * factor)) / factor;
    },

    /**
     * 安全減法
     */
    sub(a, b) {
        const factor = 10000;
        return (Math.round((Number(a) || 0) * factor) - Math.round((Number(b) || 0) * factor)) / factor;
    },

    /**
     * 安全乘法並四捨五入至指定小數位
     */
    multiply(qty, price, decimals = 2) {
        const p = Math.pow(10, decimals);
        return Math.round((Number(qty) || 0) * (Number(price) || 0) * p) / p;
    },

    /**
     * 安全除法並保留小數位
     */
    divide(amount, divisor, decimals = 2) {
        if (!divisor || Number(divisor) === 0) return 0;
        const p = Math.pow(10, decimals);
        return Math.round(((Number(amount) || 0) / Number(divisor)) * p) / p;
    },

    /**
     * 散裝單價與權重 SV 線性折算器
     * @param {Object} product 產品物件 (含 price, cost, sv_point, pieces_per_box)
     * @param {string} unit 所選單位 ('盒' 或 散裝單位)
     */
    deriveLooseSpec(product, unit) {
        const N = Math.max(1, parseInt(product.pieces_per_box, 10) || 1);
        const isLoose = (unit && unit !== product.base_unit && N > 1);

        if (!isLoose) {
            return {
                unitPrice: Number(product.price) || 0,
                unitCost: Number(product.cost_price || product.cost) || 0,
                unitSV: Number(product.sv_point) || 0,
                isLoose: false,
                ratio: 1
            };
        }

        return {
            unitPrice: this.divide(product.price, N, 2),
            unitCost: this.divide(product.cost_price || product.cost, N, 2),
            // SV 點數折算保留 2 位小數，供 CRM 貢獻值累積
            unitSV: this.divide(product.sv_point, N, 2),
            isLoose: true,
            ratio: N
        };
    },

    /**
     * 自動拆盒需求計算 (Auto-Unbox Logic)
     * @param {number} demandQty 欲出貨的散裝數量
     * @param {number} currentPieces 目前在線散裝數 (pieces_qty)
     * @param {number} piecesPerBox 單盒內含散件數 (N)
     * @param {number} availableBoxes 目前可用整盒存量 (quantity)
     */
    calcDecantRequirement(demandQty, currentPieces, piecesPerBox, availableBoxes) {
        const demand = Math.max(0, parseInt(demandQty, 10) || 0);
        const loose = Math.max(0, parseInt(currentPieces, 10) || 0);
        const N = Math.max(1, parseInt(piecesPerBox, 10) || 1);
        const boxes = Math.max(0, parseInt(availableBoxes, 10) || 0);

        // 現有散裝足夠扣減
        if (loose >= demand) {
            return {
                needDecant: false,
                boxesToDecant: 0,
                finalLoose: loose - demand,
                finalBoxes: boxes,
                isStockSufficient: true
            };
        }

        // 散裝不足，需拆盒
        const shortage = demand - loose;
        const boxesNeeded = Math.ceil(shortage / N);

        if (boxes < boxesNeeded) {
            return {
                needDecant: true,
                boxesToDecant: boxesNeeded,
                finalLoose: loose,
                finalBoxes: boxes,
                isStockSufficient: false // 庫存徹底不足
            };
        }

        const totalLooseAvailable = loose + (boxesNeeded * N);
        return {
            needDecant: true,
            boxesToDecant: boxesNeeded,
            finalLoose: totalLooseAvailable - demand,
            finalBoxes: boxes - boxesNeeded,
            isStockSufficient: true
        };
    },

    /**
     * 雙領導核心 50/50 利潤/代墊分攤 (奇數分錢校準法)
     * @param {number} totalAmount 欲拆帳總額
     * @param {string} oddCentOwner 指定多拿/多付 0.01 的對象 ('RAY' 或 'JARVIS')
     */
    split5050(totalAmount, oddCentOwner = 'RAY') {
        const total = Math.round((Number(totalAmount) || 0) * 100);
        const half = Math.floor(total / 2);
        const remainder = total % 2;

        let rayCent = half;
        let jarvisCent = half;

        if (remainder !== 0) {
            if (oddCentOwner === 'JARVIS') {
                jarvisCent += remainder;
            } else {
                rayCent += remainder;
            }
        }

        return {
            total: total / 100,
            splitRay: rayCent / 100,
            splitJarvis: jarvisCent / 100,
            hasCentAdjust: remainder !== 0
        };
    },

    /**
     * 官方 SV 與內部權重 SV 格式化輸出
     * @param {number} sv SV 數值
     * @param {string} mode 'OFFICIAL' (整數結算) | 'INTERNAL' (保留小數點)
     */
    formatSV(sv, mode = 'OFFICIAL') {
        const val = Number(sv) || 0;
        if (mode === 'OFFICIAL') {
            return Math.floor(val).toLocaleString();
        }
        return val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
};