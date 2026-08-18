# 模組六：客戶 CRM 與復購模組 (Customer Lifecycle & CRM Subsystem)

本模組負責管理公域引流名單、客戶生命週期、高敏健康需求圖像（1:1 垂直分割隔離）、追訪溝通軌跡、產品耗盡自動推算與復購預警看板，並提供客戶轉化為事業夥伴的稽核軌跡。

---

## 1. 資料表清單總覽 (Table Summary)

| 資料表英文名稱 (Table Name) | 資料表中文名稱 | 鍵值與關聯結構 (PK / FK) | 對應網站選單/頁面 | 核心業務數據與稽核職責描述 |
| :--- | :--- | :--- | :--- | :--- |
| `customers` | 客戶主表 | PK: `customer_id`<br>FK: `assigned_partner_id` | H30000 / P50000 | 客戶基本身分、生命週期階段與負責夥伴歸屬。 |
| `customer_profiles` | 高敏健康需求檔案表 | PK/FK: `customer_id` (1:1 垂直分割) | H30000 客戶管理 | 垂直隔離之健康關注點、過敏史、飲食作息與 LINE 聯繫通道。 |
| `customer_purchases` | 零售消費與耗盡週期表 | PK: `purchase_id`<br>FK: `customer_id`, `product_code` | H30000 客戶管理 | 零售購買明細、購買金額與系統自動推算之產品耗盡日期。 |
| `customer_interactions` | 追訪與關懷溝通軌跡表 | PK: `interaction_id`<br>FK: `customer_id`, `partner_id` | H30000 客戶管理 | 通話、LINE 諮詢、體驗會互動紀錄與下一次預計關懷日期。 |
| `customer_conversions` | 客戶轉化事業夥伴鏈結表 | PK: `conversion_id`<br>FK: `customer_id`, `converted_partner_id` | H30000 / H20000 | 客戶簽約入會轉為夥伴時的歷史數據繼承與推薦人追蹤。 |
| `customer_reorder_alerts` | 復購預警看板表 | PK: `alert_id`<br>FK: `customer_id`, `product_code` | H30000 客戶管理 | 產品即將用盡前 7 天自動觸發之回購關懷通知與跟進狀態。 |

---

## 2. 6 大關聯資料表 Schema 詳細規格 (Table Schemas)

### (1) 客戶主表 (`customers`)
- **業務定位**：存放客戶核心基本身分、來源管道、服務夥伴歸屬與生命週期階段。

| 欄位名稱 (Field Name) | 資料型態 (Data Type) | 主/外鍵 (Key) | 允許 NULL | 預設值 (Default) | 說明與業務邏輯 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `customer_id` | VARCHAR(50) | **PK** | NO | - | 客戶系統唯一編號 (例: `CUST-2026-0001`) |
| `name` | VARCHAR(100) | - | NO | - | 客戶真實姓名或稱呼 |
| `mobile` | VARCHAR(20) | Index | NO | - | 手機號碼 (自動格式清理與唯一性排重) |
| `email` | VARCHAR(255) | - | YES | NULL | 電子郵件 (供電子發票或產品關懷報發送) |
| `gender` | VARCHAR(10) | - | YES | 'UNKNOWN' | 性別 (`M`:男, `F`:女, `OTHER`:其他, `UNKNOWN`:未填) |
| `stage` | VARCHAR(30) | Index | NO | 'PROSPECT' | 生命週期階段 (`PROSPECT`:潛在名單, `TRIAL`:體驗中, `ACTIVE`:穩定消費, `DORMANT`:沉睡流失, `CONVERTED`:已轉夥伴) |
| `assigned_partner_id` | VARCHAR(50) | **FK** | NO | - | 負責/服務夥伴 ID (外鍵關聯 `partners.partner_id`) |
| `lead_source` | VARCHAR(50) | - | YES | 'OFFLINE' | 客戶來源 (`SOCIAL_MEDIA`:社群引流, `HEALTH_EVENT`:體驗會, `REFERRAL`:舊客介紹, `OFFLINE`:線下招商) |
| `is_active` | CHAR(1) | Index | NO | 'Y' | 是否有效 (`Y`:有效 / `N`:邏輯軟刪除) |
| `created_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 資料建立者 (例: `Ray`, `Jarvis`) |
| `created_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 資料建立時間 |
| `modified_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 最後異動者 |
| `modified_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 最後異動時間 |

---

### (2) 高敏健康需求檔案表 (`customer_profiles`)
- **業務定位**：存放低頻查詢但高度敏感的健康需求、過敏史與偏好（與 `customers` 主表採 1:1 垂直分割隔離）。

| 欄位名稱 (Field Name) | 資料型態 (Data Type) | 主/外鍵 (Key) | 允許 NULL | 預設值 (Default) | 說明與業務邏輯 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `customer_id` | VARCHAR(50) | **PK, FK** | NO | - | 外鍵兼主鍵，1:1 綁定 `customers.customer_id` |
| `birth_date` | DATE | - | YES | NULL | 生日 (用於壽星月關懷與專屬好禮通知) |
| `health_concerns` | TEXT | - | YES | NULL | 主要健康需求與關心點 (例: 腸胃消化、睡眠品質、免疫力) |
| `dietary_habits` | VARCHAR(200) | - | YES | NULL | 飲食與作息習慣 (例: 外食族、素食、常熬夜、少喝水) |
| `allergies` | VARCHAR(200) | - | YES | NULL | 過敏原或保健禁忌 (例: 對大豆過敏、服用慢性藥中) |
| `occupation` | VARCHAR(100) | - | YES | NULL | 職業類別 (輔助研判作息型態與保健預算) |
| `line_user_id` | VARCHAR(100) | - | YES | NULL | LINE Messaging API User ID (供個人化推播與復購提醒) |
| `address` | VARCHAR(255) | - | YES | NULL | 產品寄送/通訊地址 |
| `preferred_contact_time`| VARCHAR(100) | - | YES | NULL | 偏好聯繫時段 (例: 平日晚上 8 點後、週末下午) |
| `notes` | TEXT | - | YES | NULL | 其他特殊偏好備註 |
| `created_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 資料建立者 |
| `created_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 資料建立時間 |
| `modified_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 最後異動者 |
| `modified_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 最後異動時間 |

---

### (3) 零售消費與耗盡週期表 (`customer_purchases`)
- **業務定位**：記錄客戶每一次購買產品的紀錄，並自動算定產品「預計耗盡日」。

| 欄位名稱 (Field Name) | 資料型態 (Data Type) | 主/外鍵 (Key) | 允許 NULL | 預設值 (Default) | 說明與業務邏輯 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `purchase_id` | VARCHAR(50) | **PK** | NO | - | 消費紀錄唯一編號 (例: `PUR-20260813-001`) |
| `customer_id` | VARCHAR(50) | **FK** | NO | - | 外鍵關聯 `customers.customer_id` |
| `product_code` | VARCHAR(50) | **FK** | NO | - | 外鍵關聯 `products.product_code` (例: `TW0303001`) |
| `product_name_snapshot` | VARCHAR(150) | - | NO | - | 交易當時產品名稱快照 (避免未來商品改名影響歷史) |
| `qty` | INT | - | NO | 1 | 購買數量 (盒/組) |
| `unit_price` | DECIMAL(10,2) | - | NO | 0.00 | 零售單價 (NTD / MYR) |
| `unit_sv` | INT | - | NO | 0 | 單品全球 SV 點數 |
| `subtotal_amount` | DECIMAL(10,2) | - | NO | 0.00 | 小計金額 (`qty` × `unit_price`) |
| `purchase_date` | DATE | Index | NO | - | 購買/交付日期 |
| `estimated_days` | INT | - | NO | 30 | 預估可食用天數 (單盒標準天數 × `qty`) |
| `estimated_depletion_date`| DATE | Index | NO | - | 預計用盡日期 (`purchase_date` + `estimated_days`) |
| `recorded_by_partner_id`| VARCHAR(50) | **FK** | NO | - | 經手錄入之夥伴 ID (外鍵關聯 `partners.partner_id`) |
| `created_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 資料建立者 |
| `created_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 資料建立時間 |
| `modified_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 最後異動者 |
| `modified_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 最後異動時間 |

---

### (4) 追訪與關懷溝通軌跡表 (`customer_interactions`)
- **業務定位**：記錄與客戶的 1對1 諮詢、體驗反饋、異議處理與下一次關懷約定。

| 欄位名稱 (Field Name) | 資料型態 (Data Type) | 主/外鍵 (Key) | 允許 NULL | 預設值 (Default) | 說明與業務邏輯 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `interaction_id` | VARCHAR(50) | **PK** | NO | - | 溝通紀錄唯一編號 (例: `INT-20260813-001`) |
| `customer_id` | VARCHAR(50) | **FK** | NO | - | 外鍵關聯 `customers.customer_id` |
| `partner_id` | VARCHAR(50) | **FK** | NO | - | 進行跟進之夥伴 (外鍵關聯 `partners.partner_id`) |
| `interaction_date` | DATETIME | Index | NO | - | 互動/拜訪時間 |
| `interaction_type` | VARCHAR(30) | - | NO | 'LINE' | 溝通管道 (`1ON1`:一對一面談, `PHONE`:電話, `LINE`:通訊軟體, `EVENT`:體驗會) |
| `content_summary` | TEXT | - | NO | - | 溝通內容摘要與產品食用體感反饋 |
| `objection_handled` | TEXT | - | YES | NULL | 異議處理紀錄 (如對價格或食用方式之疑慮解答) |
| `next_followup_date` | DATE | Index | YES | NULL | 約定下一次關懷跟進日期 |
| `sentiment_score` | VARCHAR(20) | - | YES | 'NEUTRAL' | 客戶態度評估 (`POSITIVE`:高度正面, `NEUTRAL`:平淡, `HESITANT`:觀望, `NEGATIVE`:反感) |
| `created_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 資料建立者 |
| `created_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 資料建立時間 |
| `modified_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 最後異動者 |
| `modified_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 最後異動時間 |

---

### (5) 客戶轉化事業夥伴鏈結表 (`customer_conversions`)
- **業務定位**：記錄客戶正式簽約入會轉化為事業夥伴時的數據繼承軌跡與審核憑證。

| 欄位名稱 (Field Name) | 資料型態 (Data Type) | 主/外鍵 (Key) | 允許 NULL | 預設值 (Default) | 說明與業務邏輯 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `conversion_id` | VARCHAR(50) | **PK** | NO | - | 轉化紀錄唯一編號 (例: `CNV-2026-0001`) |
| `customer_id` | VARCHAR(50) | **FK, Unique**| NO | - | 原客戶編號 (外鍵關聯 `customers.customer_id`) |
| `converted_partner_id` | VARCHAR(50) | **FK, Unique**| NO | - | 轉化後生成之夥伴編號 (外鍵關聯 `partners.partner_id`) |
| `conversion_date` | DATE | Index | NO | - | 簽約入會/升等轉化日期 |
| `conversion_trigger` | VARCHAR(50) | - | NO | 'PRODUCT_SATISFACTION' | 轉化動機 (`PRODUCT_SATISFACTION`:體感良好轉經營, `CAREER_SEMINAR`:事業說明會邀約, `INCOME_NEED`:增加收入需求) |
| `original_assigned_partner_id` | VARCHAR(50) | **FK** | NO | - | 原服務夥伴 (外鍵關聯 `partners.partner_id`) |
| `sponsor_partner_id` | VARCHAR(50) | **FK** | NO | - | 入會後之推薦人夥伴 (外鍵關聯 `partners.partner_id`) |
| `historical_purchases_count` | INT | - | NO | 0 | 轉化前累積購買次數快照 |
| `historical_total_amount` | DECIMAL(10,2) | - | NO | 0.00 | 轉化前累積消費總額快照 |
| `notes` | TEXT | - | YES | NULL | 轉化過程與輔導備註 |
| `created_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 資料建立者 |
| `created_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 資料建立時間 |
| `modified_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 最後異動者 |
| `modified_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 最後異動時間 |

---

### (6) 復購預警看板表 (`customer_reorder_alerts`)
- **業務定位**：根據產品預計用盡日期，自動提前 7 天生成復購關懷任務。

| 欄位名稱 (Field Name) | 資料型態 (Data Type) | 主/外鍵 (Key) | 允許 NULL | 預設值 (Default) | 說明與業務邏輯 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `alert_id` | VARCHAR(50) | **PK** | NO | - | 預警紀錄唯一編號 (例: `ALT-20260813-001`) |
| `customer_id` | VARCHAR(50) | **FK** | NO | - | 外鍵關聯 `customers.customer_id` |
| `product_code` | VARCHAR(50) | **FK** | NO | - | 外鍵關聯 `products.product_code` |
| `last_purchase_id` | VARCHAR(50) | **FK** | NO | - | 對應最後一次購買單據 (外鍵關聯 `customer_purchases.purchase_id`) |
| `estimated_depletion_date`| DATE | Index | NO | - | 預計耗盡日期 |
| `suggested_contact_date` | DATE | Index | NO | - | 建議聯繫關懷日期 (`estimated_depletion_date` - 7 天) |
| `alert_status` | VARCHAR(20) | Index | NO | 'PENDING' | 處理狀態 (`PENDING`:待關懷, `CONTACTED`:已關懷, `REORDERED`:已復購續訂, `IGNORED`:暫不復購) |
| `assigned_partner_id` | VARCHAR(50) | **FK** | NO | - | 應執行關懷之負責夥伴 (外鍵關聯 `partners.partner_id`) |
| `last_notified_at` | DATETIME | - | YES | NULL | 系統或 LINE 提醒發送時間 |
| `created_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 資料建立者 |
| `created_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 資料建立時間 |
| `modified_by` | VARCHAR(100) | - | NO | 'SYSTEM' | 最後異動者 |
| `modified_at` | DATETIME | - | NO | CURRENT_TIMESTAMP | 最後異動時間 |

---

## 3. 模組實體關聯圖 (Subsystem ERD)

```mermaid
erDiagram
    partners ||--|{ customers : "服務專屬客戶 (1:N)"
    customers ||--|| customer_profiles : "1:1 高敏健康圖像"
    customers ||--|{ customer_purchases : "零售消費 (1:N)"
    products ||--|{ customer_purchases : "購買品項 (1:N)"
    customers ||--|{ customer_interactions : "關懷軌跡 (1:N)"
    partners ||--|{ customer_interactions : "跟進夥伴 (1:N)"
    customers ||--o| customer_conversions : "轉化入會 (1:1)"
    partners ||--o| customer_conversions : "轉化後新夥伴 (1:1)"
    customers ||--|{ customer_reorder_alerts : "觸發預警 (1:N)"
    products ||--|{ customer_reorder_alerts : "預警品項 (1:N)"
    customer_purchases ||--o| customer_reorder_alerts : "依據最後購買 (1:1)"

    customers {
        string customer_id PK "例: CUST-2026-0001"
        string name "客戶姓名"
        string mobile "手機號碼"
        string stage "PROSPECT, TRIAL, ACTIVE, DORMANT, CONVERTED"
        string assigned_partner_id FK "負責夥伴"
    }

    customer_profiles {
        string customer_id PK, FK "1:1 垂直分割"
        text health_concerns "保健關注點"
        string allergies "過敏原/禁忌"
        string line_user_id "LINE ID"
    }

    customer_purchases {
        string purchase_id PK "例: PUR-20260813-001"
        string customer_id FK
        string product_code FK "例: TW0303001"
        date purchase_date "購買日期"
        int estimated_days "食用天數"
        date estimated_depletion_date "預計耗盡日"
    }

    customer_interactions {
        string interaction_id PK
        string customer_id FK
        string partner_id FK
        datetime interaction_date "關懷時間"
        string interaction_type "1ON1, PHONE, LINE, EVENT"
        text content_summary "體感與溝通摘要"
    }

    customer_conversions {
        string conversion_id PK
        string customer_id FK "原客戶"
        string converted_partner_id FK "新夥伴"
        date conversion_date "轉化日期"
        string sponsor_partner_id FK "推薦人"
    }

    customer_reorder_alerts {
        string alert_id PK
        string customer_id FK
        string product_code FK
        date suggested_contact_date "建議聯繫日 (耗盡前7天)"
        string alert_status "PENDING, CONTACTED, REORDERED"
    }
