# Gunpla Hangar · 鋼彈格納庫

可在 Windows 本機使用的模型收藏小工具。將多張模型盒照匯入，讀取商品名稱、規格與比例，確認作品系列，補上價格／存放位置，最後匯出 Excel。

## Windows 可攜版（建議一般使用者）

到本專案 GitHub Releases 下載 `Gunpla-Hangar-v版本-windows-x64.zip`，完整解壓後雙擊 `Start.cmd`。包含固定版本的 Node.js、PaddleOCR／Tesseract 模型與網頁建置結果，無須安裝套件或另外下載模型。適用 Windows x64；iOS／Android 與 Windows ARM 原生版尚未封裝。

每次更新先在舊版「備份收藏」，關閉舊版本機服務後再開新版，必要時「還原備份」。收藏仍保存在相同瀏覽器與 localhost 網址，不會隨 ZIP 複製到另一台電腦，也不會自動同步。ZIP 同目錄提供 SHA-256，包內 `release-manifest.json` 記錄程式版本、commit、Node 版本及每個 OCR 檔案的雜湊。

## 從 GitHub 原始碼安裝（開發用）

安裝 Git LFS 與 Node.js 22 以上，以 Git clone 本專案後執行：

```powershell
git lfs install
git lfs pull
npm install
npm run build
```

完成後雙擊 `Start.cmd`。`public/paddle` 與 `public/ocr` 已透過 Git LFS 納入版控；建置檔、ZIP、本機測試輸出與收藏備份不納入 Git。請使用 clone + LFS 或 Release 完整 ZIP，不要把 GitHub 自動產生的 Source code ZIP 當作可攜版。

## 發布新版本

一般 commit 只推送原始碼，不必製作 ZIP。正式發布時更新 `package.json` 版本、commit，並建立相同版本標籤，例如 `v0.3.1`：

```powershell
git push origin main
git tag -a v0.3.1 -m "Release v0.3.1"
git push origin v0.3.1
```

`.github/workflows/release-windows.yml` 會取回 Git LFS 模型、安裝鎖定套件、測試、建置、打包、驗證解壓後的程式，再建立 GitHub Release 並上傳 ZIP／SHA-256。每個正式版本各有一份 ZIP，不必手動重包。若任何步驟失敗，就不會發布 Release；可到 Actions 查看原因。需要 repository 允許 Actions，並有可用的 Git LFS 與 Actions 配額。

本機也可執行 `npm run build`、`npm run package:windows` 與 `powershell -File scripts/check-portable.ps1`；ZIP 位於 `releases/`。打包腳本下載固定版本 Node.js 並核對官方 SHA-256；若同名 ZIP 已存在會停止，避免覆蓋。未來升級 Node 版本時，也需更新打包腳本與 workflow 的固定版本。

## Windows 啟動

目前這台電腦已準備好 `dist` 與 OCR 引擎，**雙擊 `Start.cmd`** 即可啟動。從 GitHub 首次下載時，請先依下方步驟安裝與建置。程式會在背景啟動本機服務，並用預設瀏覽器開啟 **http://127.0.0.1:4173**。不會對外網路開放服務。

啟動器會優先使用電腦上的 Node.js；此工作區也能使用現有 Codex Node.js runtime。搬到另一台電腦時，需安裝 Node.js 22 以上，並複製 `dist/`、`scripts/serve.mjs`、`Start.ps1`、`Start.cmd`。目前是瀏覽器介面的本機工具，尚未封裝成獨立 `.exe`。

若使用 Edge，可透過瀏覽器的「應用程式／安裝此網站」建立獨立視窗與捷徑。每次重新開機後先執行啟動器，確保本機服務運作。

## 操作

1. 選取或拖入多張 JPG、PNG、WebP 照片，每批最多 100 張、每張最多 20 MB。一張照片對應一件商品，建議拍攝清晰、完整且無反光的盒面。iPhone 的 HEIC 請先轉為 JPEG。
2. 程式依序在本機辨識，逐張顯示成功、重複、格式／大小／解碼／辨識或儲存錯誤。相同照片位於回收桶時可直接復原；不同照片即使是同款商品也會各建立一筆。「完成此張後停止」會完成目前照片，未開始者標為已取消。辨識失敗可重試原紀錄，不會另建重複收藏。
3. 點擊商品，核對名稱、規格、比例與作品系列。系列可自由輸入，例如「UC 宇宙世紀」、「SEED」、「水星的魔女」。
4. 填寫實際購入價格及存放位置，按「確認並儲存」。價格、比例與位置允許空白；零元會保留為數值 0。價格沒有自動換匯，請使用同一幣別。
5. 使用搜尋、作品系列、規格、存放位置及確認狀態篩選，或依新增時間、名稱、價格排序。空價格在兩種價格排序中都放最後，0 元會保留。可逐一移除條件或清除全部。
6. 勾選收藏或「選取目前結果」，預覽後批次設定／清空位置或設定系列。位置只影響選取筆數，保留確認狀態；系列與商品線變更會要求重新確認。任一筆規格不相容時整批不套用。篩選／排序改變會清除選取並提示。
7. 點擊「匯出 Excel」，選擇全部已確認或目前篩選結果中的已確認，確認筆數與分頁再下載。**只匯出已確認且未刪除商品，並依作品系列分頁，不是按 HG／RG／MG 分頁。**預覽與下載沿用同一資料快照。

### 連續確認與編輯保護（UX 階段 A）

- 先切換「待確認」或設定搜尋／規格／系列，再按「開始確認」。本輪使用當下可見的待確認紀錄快照；「上一筆／下一筆」只切換，「確認並開啟下一筆」會等本機儲存成功才前進。最後顯示本輪摘要。
- 關閉編輯、Escape 或切換上下筆時，未儲存修改會提供「繼續編輯」「捨棄修改」「儲存為待確認後離開」。儲存失敗會保留草稿，可重試或「下載含草稿的備份」；此備份中的目前草稿會標為待確認。
- 有未儲存草稿或持久化進行中時，程式會註冊瀏覽器離頁提示。是否顯示原生提示仍由瀏覽器決定，無法保證防止所有關頁遺失。
- 點擊盒照可放大、縮小或適合畫面，放大後用滑鼠／觸控拖曳。Escape 只關閉最上層視窗，關閉大圖會將焦點返回開圖按鈕。畫質以已保存影像為限。
- 重新辨識先顯示新舊欄位比較，預設保留目前值；可逐欄勾選或全部採用。作品系列與商品線一起處理，價格與位置不被覆寫。採用後只改草稿，需重新確認儲存；取消、放棄或辨識失敗不修改原收藏。取消代表忽略本次結果，背景引擎可能仍會完成該張。

UX-01～10 的實作與驗證紀錄見 [UX 改善方案](docs/UX-IMPROVEMENT-PLAN.md)。手機清單會直接顯示位置與系列篩選；已有收藏時新增照片區預設收合，辨識中仍顯示進度與停止入口。位置欄可選用最近使用過的位置，也可自由輸入新名稱。

### Excel 格式

| 比例 | 商品名稱 | 價格 | 存放位置 |
| --- | --- | --- | --- |
| 1/144 | [HG] RX-78-2 GUNDAM | （自行填寫） | （自行填寫） |

規格放在商品名稱前，保留指定的四個欄位。匯出會建立新的 `.xlsx`，具有標題列、篩選與凍結首列；不會直接修改既有 Excel 檔案。自訂系列名稱會轉成 Excel 合法分頁名稱，名稱碰撞會自動加流水號，原始系列仍保留在應用程式資料中。

## 辨識範圍與限制

### 系列簡寫（0.3 版）

中文作品名稱來自 `src/catalog.mjs` 的盒面關鍵字對照與少量機體線索，並非即時翻譯或完整商品資料庫。新增的商品線簡寫規則位於 `src/product-lines.mjs`。

系列現在可顯示為「HGUC 宇宙世紀」、「HGBF 鋼彈創鬥者」等，清單、側邊分類、編輯欄位及 Excel 分頁使用同一名稱；商品名稱仍維持原格式，例如 `[HG] RX-78-2 GUNDAM`。不同顯示系列會各自建立 Excel 分頁。簡寫也會隨 JSON 備份保存。

辨識會保留盒面明確出現的簡寫；讀到 HG 與 UNIVERSAL CENTURY 時整理為 HGUC，讀到 HG 與 BUILD FIGHTERS 時整理為 HGBF。僅有 RX-78-2 名稱、UC 機體線索或 HG 規格，皆不足以自動填入 HGUC。線索不足時保留原中文分類，可在「作品系列」欄位自行修改。既有資料請使用「重新辨識」，或直接將系列改為「HGUC 宇宙世紀」。

對照參考：[萬代 RX-78-2 HGUC 商品說明](https://manual.bandai-hobby.net/menus/detail/1004)、[萬代 HI-MOCK HGBF 商品說明](https://manual.bandai-hobby.net/menus/detail/31)。

- 使用 PaddleOCR PP-OCRv6 的文字偵測與中型多語辨識模型，在本機 Web Worker／WebAssembly 執行。模型與引擎隨建置輸出，不需要 API 金鑰、訂閱或上傳照片。首次載入與單張辨識可能需數十秒，取決於電腦效能；建置階段需下載套件與模型。若新引擎無法完成，會明確提示並退回 Tesseract。
- 解析盒面上明確的規格標誌、比例與名稱。支援 HG、RG、MG、MGEX、MGSD、PG、PG UNLEASHED、EG、SD、SDCS、SD EX-STANDARD、RE/100、FULL MECHANICS、MEGA SIZE，也可選「其他」。
- 作品系列來自盒面關鍵字與少量內建機體線索，**不是完整商品資料庫，也不是通用多模態 AI**。無明確線索或線索衝突時標記「待確認」。不以 HG 直接推定 UC，也不以 MG 直接填入 1/100。
- 日文專用名稱、特殊字型、反光、傾斜、非鋼彈模型、版本／配色差異可能需要修正。保留原始 OCR 文字供核對。自動結果一律需人工確認後才匯出。
- 購入價格不等於包裝定價，因此價格不自動推估；位置由使用者填寫。
- 附件 `20261103.jpg` 的實測目標是：HG、1/144、RX-78-2 GUNDAM、UC 宇宙世紀。附帶範例按鈕會真的執行 OCR，沒有直接填入範例答案。

## 本機辨識升級（2026-11-03，0.2 版）

先偵測文字位置並校正文字區域，依位置、字體大小與內容區分商品名稱、作品標誌與包裝說明。名稱信心不足或含版本時追加區域複讀，規格／作品缺漏時再讀左上標誌；保留各輪原文與信心分數。解析器接受一般商品名稱，沒有按檔名或圖片雜湊填入測試答案。

使用 Windows Edge 正式版實際批次匯入五張附件，得到以下結果（全部為 HG、1/144）：

| 照片 | 自動讀出的名稱 | 作品分頁 |
| --- | --- | --- |
| 20261103.jpg | RX-78-2 GUNDAM | UC 宇宙世紀 |
| 20261103_002.webp | HI-MOCK | 鋼彈創鬥者 |
| 20261103_003.jpg | GUNDAM EZ-SR | 鋼彈創鬥者 |
| 20261103_004.jpg | RX-79[G]EZ-8 GUNDAM EZ8 | UC 宇宙世紀 |
| 20261103_005.jpeg | Hi-V GUNDAM VRABE AMAZING Ver.The Crimson Comet | 鋼彈創鬥者 |

第五張仍把希臘字母 `ν` 讀為拉丁字母 `V`，會顯示專門提醒，請手動確認／改為 `Hi-ν`。不同輪讀取結果有差異也會提示，不能將 OCR 信心分數視為正確率保證。474 × 355 的 WebP 已能讀出名稱、HG、比例與作品，仍保留低解析度提醒。這五張的結果不代表所有盒照都能正確辨識。

**既有收藏使用新流程：重新整理頁面 → 點擊該商品 →「重新辨識」→ 比較並選擇採用欄位。** 不需要再次匯入相同圖片。辨識結果先作為候選，既有草稿、已保存價格、位置與確認狀態會保留；採用後須重新人工確認並儲存。

回歸測試：`node scripts/check-low-resolution.mjs <HI-MOCK WebP 照片路徑>`。

五張附件回歸測試：`node scripts/check-photo-regressions.mjs <照片所在資料夾>`。資料夾需包含 `_002` 至 `_005` 四張照片；RX-78-2 使用已保存的 `public/sample.jpg`，亦可加上第二個參數指定照片。以全新瀏覽器測試資料匯入，阻擋對外連線，檢查名稱、作品、規格、比例與特殊字母提醒；測試照片需自行保留。

## 保存與備份

收藏與壓縮後的照片保存在目前瀏覽器、目前網址的 IndexedDB。關閉頁面再開仍會保留；換瀏覽器、換網址、換電腦不會同步，清除網站資料會刪除收藏。**定期使用「備份收藏」下載 JSON**，照片與辨識資料會一起備份。Excel 僅包含四欄表格，不是完整照片備份。

刪除收藏會先移到「回收桶」，可用即時「復原」或稍後從回收桶復原，照片、價格與確認狀態均保留。永久刪除會再次顯示名稱並要求確認，無法復原；回收桶不會自動到期清空。

完整備份格式為 JSON v2（`version`、`exportedAt`、`records`），包含照片、確認、商品線、辨識提醒／證據與回收桶狀態。「上次下載備份」只表示已觸發下載，瀏覽器無法確認使用者是否真正保存檔案。畫面顯示之後新增／變更的紀錄數，同筆反覆修改只計一次；有變更且 7 天未下載時提供可關閉提醒。Excel 不含照片與回收桶，無法代替 JSON 備份。

「還原備份」先驗證並預覽新增／相同／衝突／無效筆數，再由你確認合併；不預設清空收藏。任何無效內容都會阻止整份套用。相同 ID 不同內容、相同照片不同 ID、刪除狀態變更都列為衝突，預設保留現有，可逐筆選擇採用備份。無照片的手動紀錄依穩定 ID 去重，不依名稱合併，同款多盒仍可分別收藏。

- 「還原完整備份」保留有效 v2 已確認與回收桶狀態；「作為外部資料匯入」將實際新增／採用的資料標為待確認。
- 支援 v1 備份，但一律待確認。有有效 ID 者保留；缺少 ID 者依本檔內容與序號建立固定來源識別，同檔重匯不一直新增。無法判斷不同舊備份中無 ID、無照片的紀錄是否為同一件。
- 備份檔上限 200 MB。持久化失敗時原資料保留，可重試；不要清除網站資料來處理容量問題，請先確認完整備份。

舊收藏升級時會先在 IndexedDB 保留原樣備援，寫入並讀回驗證 v2 workspace 後才切換來源。既有有效 ID 不變；補上 `updatedAt` 與 `deletedAt`。資料及應用 metadata 以單一 envelope 原子寫入。升級失敗會保留舊來源供讀取並暫停修改，可按「重試資料升級」；程式不會先清空舊 key。升級後新增的資料不會回寫到舊版程式使用的 key，請使用新版或透過 JSON 備份轉移。

## iOS / Android 擴充

採 React + Vite 響應式介面，識別／資料／Excel 匯出模組皆可共用，並附 PWA manifest、圖示及 service worker。已檢查 390px 手機版畫面。

目前 Windows 啟動器只綁定 localhost，手機無法直接連線。後續可將 `dist/` 部署到 HTTPS 主機供手機使用，或以 Capacitor 封裝 iOS／Android；本次未發布網站、未產生 App Store／Play 商店套件，也未實作雲端同步。手機實機、Safari 與原生相機介接尚未驗證。離線網頁快取為輔助功能；尚未使用過的動態功能需由本機服務提供。

## 開發

```powershell
npm install
npm run prepare:ocr
npm run dev
```

正式建置與測試：

```powershell
npm run build
npm test
npm start
# 另一個終端機執行，需已安裝 Microsoft Edge
node scripts/check-ui.mjs
# UX 階段 A 互動／錯誤分支回歸（另使用 4174，OCR stub 僅限此測試）
node scripts/check-ux-a.mjs
# 剩餘 UX 階段 B～D（隔離服務 4175）
node scripts/check-ux-bcd.mjs
```

若使用 pnpm，已允許 esbuild 建置腳本；Tesseract 的非必要安裝腳本不執行。套件使用鎖檔固定版本。

- `src/catalog.mjs`：規格、比例與作品線索判斷，新增辨識規則從這裡開始。
- `src/recognition.js`：本機模型載入、全圖偵測、名稱／左上標誌複讀與備援處理。
- `src/detected-text.mjs`：依偵測文字的位置與信心擷取名稱，保留版本與特殊字母核對提醒。
- `src/tesseract-recognition.js`：舊版 OCR 備援與圖片解碼。
- `src/export.mjs`：依作品系列分頁、四欄 Excel 輸出。
- `src/storage.js`、`src/storage-migration.mjs`、`src/workspace-model.mjs`：IndexedDB envelope、舊資料原樣備援／切換、時間與備份修訂狀態。
- `src/backup-model.mjs`：v1／v2 備份驗證、確定性來源 ID、還原去重與衝突合併。
- `src/collection-query.mjs`：共用篩選／排序、位置建議、批次驗證、匯出快照。
- `src/import-jobs.mjs`、`src/CollectionDialogs.jsx`：逐張匯入狀態與重試入口、批次／匯出／還原預覽、回收桶。
- `src/collection-store.mjs`：所有收藏更新共用的可等待儲存入口，成功後才發布到畫面。
- `src/Editor.jsx`、`src/editor-model.mjs`：草稿、連續確認與辨識候選採用；`src/Dialog.jsx`、`src/PhotoViewer.jsx`：共用對話框與照片核對。
- `tests/`：解析、未知值與 Excel 匯出回讀測試。
- `scripts/check-ui.mjs`：真實附件辨識、修改、重開持久化、下載 Excel、重複照片與手機版驗證。
- `scripts/check-ux-a.mjs`：隔離資料測試確認佇列、容量失敗／重試、草稿離開保護、辨識失敗／取消／比較、鍵盤焦點與大圖滑鼠／觸控拖曳；輸出桌面及 390／360px 畫面到 `test-results/`。
- `scripts/check-ux-bcd.mjs`：隔離資料測試五筆批次設定、相容性、查詢排序、兩種範圍 Excel 回讀、軟刪除與永久刪除、v2 還原預覽與重複合併、容量／遷移失敗、混合匯入、原 ID 重試、停止與刷新中斷及手機查找。

技術文件：[PaddleOCR JavaScript SDK](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md)、[Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)、[ExcelJS](https://github.com/exceljs/exceljs)。

範例照片來自本次使用者附件，僅用於本機功能測試。對外散布或部署前請先移除／替換 `public/sample.jpg`、範例按鈕與對應建置檔案。
