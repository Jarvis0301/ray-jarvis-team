# 01. 產品與品牌內容模組 (Product & Content Catalog)

本模組負責管理全站產品目錄、多國 SKU 定價、高低頻載入圖片分離、1:N 行銷文案、N:M 顧客見證、國際專利與品牌榮譽標章。

---

## 1. 資料表清單 (Table List)

| 資料表英文名稱 | 資料表中文名稱 | 物理儲存職責與說明 |
| :--- | :--- | :--- |
| `product_categories` | 產品主系列表 | 管理大分類（保健食品、健康生活、個人保養）。 |
| `product_subcategories` | 產品次系列表 | 管理次級分類、Font Awesome 圖示與標籤色彩。 |
| `product_types` | 產品型態表 | 管理劑型（膠囊、益生菌、液態飲、軟膏）。 |
| `products` | 產品主表 (輕量清單) | 售價、全球 SV、庫存狀態、清單縮圖（高頻讀取）。 |
| `product_details` | 產品詳細資料表 | 1:1 垂直分割，存放高解析大圖、成分與認證。 |
| `product_copywritings` | 產品行銷多文案表 | 1:N 針對不同族群（媽媽族、銀髮族）之文案。 |
| `product_faqs` | 產品專屬 FAQ 表 | 單一產品食用方法、注意事項問答。 |
| `testimonials` | 見證主表 | 顧客食用體感見證、評等與見證人身分。 |
| `product_testimonials` | 產品見證樞紐表 | N:M 解耦表，單一見證提及多款產品。 |
| `testimonial_images` | 見證圖片附表 | 見證前後對比照片（Before / After）。 |
| `product_patents` | 產品專利主表 | 專利證號、發明國別、專利摘要與證書圖。 |
| `product_patent_relations` | 產品專利樞紐表 | N:M 解耦表，點亮產品獲得之國際發明專利。 |
| `company_milestones` | 公司大事記時間軸 | P41001 品牌發展大事記與百億年份亮點。 |
| `awards_and_honors` | 榮譽獎項及標章 | P41002 SNQ 國家品質標章與 ESG 永續獎。 |

---

## 2. 詳細 Schema 規格

### 2.1 `products` (產品主表)
| 欄位名稱 | 資料型態 | 鍵值 | 允許空值 | 說明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | BIGINT | **PK** | NO | 自增唯一編號 |
| `region_code` | VARCHAR(10) | Index | NO | 市場代碼 (`TW` / `MY` / `GLOBAL`) |
| `product_code` | VARCHAR(50) | **UK** | NO | 完整 SKU 編號 (例: `TW0303001`) |
| `base_code` | VARCHAR(50) | Index | NO | 基礎代碼 (例: `0303001`) |
| `name` | VARCHAR(200) | Index | NO | 產品完整名稱 |
| `short_name` | VARCHAR(100) | - | YES | 產品簡稱 |
| `subcategory_id` | BIGINT | **FK** | NO | 關聯 `product_subcategories.id` |
| `type_id` | BIGINT | **FK** | NO | 關聯 `product_types.id` |
| `package_spec` | VARCHAR(100) | - | YES | 包裝規格 (例: `1.5g x 90包/盒`) |
| `price` | DECIMAL(10,2)| - | NO | 當地零售售價 |
| `currency` | VARCHAR(10) | - | NO | 幣別 (`TWD` / `MYR`) |
| `sv_point` | INT | Index | NO | 全球 SV 點數 |
| `thumbnail_image_url`| VARCHAR(500)| - | YES | 清單用低解析度縮圖網址 |
| `is_featured` | CHAR(1) | - | NO | 是否為明星商品 (`Y` / `N`) |
| `stock_status` | VARCHAR(20) | - | NO | 庫存狀態 (`IN_STOCK` / `LOW_STOCK` / `OUT_OF_STOCK`) |
| `is_active` | CHAR(1) | Index | NO | 上架狀態 (`Y` 有效 / `N` 下架) |

*(通用稽核欄位：`created_by`, `created_at`, `modified_by`, `modified_at`)*

---

## 3. 模組關聯圖 (Subsystem ERD)

```mermaid
erDiagram
    product_categories ||--|{ product_subcategories : "包含"
    product_subcategories ||--|{ products : "分類"
    product_types ||--|{ products : "劑型"
    products ||--|| product_details : "詳情"
    products ||--|{ product_copywritings : "文案"
    products ||--|{ product_faqs : "FAQ"
    products ||--|{ product_testimonials : "樞紐"
    testimonials ||--|{ product_testimonials : "樞紐"
    testimonials ||--|{ testimonial_images : "多圖"
    products ||--|{ product_patent_relations : "樞紐"
    product_patents ||--|{ product_patent_relations : "樞紐"
