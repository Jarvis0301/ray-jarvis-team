# 模組一：產品與品牌內容模組 (Product & Content Catalog)

本模組負責管理跨國 SKU（台灣 TW / 馬來西亞 MY）、高低頻圖片分離載入、1:N 行銷文案、N:M 顧客見證、國際發明專利與品牌榮譽。

---

## 1. 資料表清單總覽

| 資料表英文名稱 | 資料表中文名稱 | 鍵值與關聯說明 |
| :--- | :--- | :--- |
| `product_categories` | 產品主系列表 | PK: `id`, UK: `category_code` |
| `product_subcategories` | 產品次系列表 | PK: `id`, FK: `category_id` |
| `product_types` | 產品型態表 | PK: `id`, UK: `type_code` |
| `products` | 產品主表 (輕量清單) | PK: `id`, UK: (`region_code`, `product_code`), FK: `subcategory_id`, `type_id` |
| `product_details` | 產品詳細資料表 | PK: `id`, FK/UK: `product_id` (1:1 垂直分割) |
| `product_copywritings` | 產品行銷多文案表 | PK: `id`, FK: `product_id` (1:N) |
| `product_faqs` | 產品專屬 FAQ 表 | PK: `id`, FK: `product_id` (1:N) |
| `testimonials` | 見證主表 | PK: `id` |
| `product_testimonials` | 產品見證樞紐表 | Composite PK: (`product_id`, `testimonial_id`) (N:M) |
| `testimonial_images` | 見證圖片附表 | PK: `id`, FK: `testimonial_id` (1:N) |
| `product_patents` | 產品專利主表 | PK: `patent_id`, UK: `patent_no` |
| `product_patent_relations` | 產品專利樞紐表 | Composite PK: (`product_id`, `patent_id`) (N:M) |
| `company_milestones` | 公司大事記時間軸表 | PK: `id`, Index: (`region_code`, `year`) |
| `awards_and_honors` | 榮譽獎項及標章表 | PK: `award_id`, Index: `award_year` |

---

## 2. 核心 Schema 規格

### `products` (產品主表)
| 欄位名稱 | 資料型態 | 主/外鍵 | 允許 NULL | 說明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | BIGINT | **PK** | NO | 自動遞增主鍵 |
| `region_code` | VARCHAR(10) | Index | NO | 市場代碼 (`TW` / `MY`) |
| `base_code` | VARCHAR(20) | Index | NO | 基礎代碼 (例: `0303001`) |
| `product_code` | VARCHAR(50) | **UK** | NO | 完整產品編號 (例: `TW0303001`) |
| `name` | VARCHAR(200) | Index | NO | 產品名稱 (例: 995生物科技營養液) |
| `short_name` | VARCHAR(100) | - | YES | 簡稱 (例: 995) |
| `subcategory_id`| BIGINT | **FK** | NO | 關聯 `product_subcategories.id` |
| `type_id` | BIGINT | **FK** | NO | 關聯 `product_types.id` |
| `price` | DECIMAL(10,2)| - | NO | 當地售價 (NTD / MYR) |
| `sv_point` | INT | Index | NO | 全球 SV 點數 |
| `thumbnail_image_url` | VARCHAR(500) | - | YES | 清單用低解析縮圖 |
| `is_active` | CHAR(1) | Index | NO | 是否有效 (`Y` / `N`) |
| `created_by` | VARCHAR(100) | - | NO | 建立者 |
| `created_at` | DATETIME | - | NO | 建立時間 |
| `modified_by` | VARCHAR(100) | - | NO | 異動者 |
| `modified_at` | DATETIME | - | NO | 異動時間 |
