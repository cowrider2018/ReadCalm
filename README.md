# Universal Reading Theme

一個 Chrome Extension（Manifest V3），讓你在**所有網站**上統一字體、背景色與文字顏色，
打造舒適的閱讀體驗。預設採用**溫潤米色（#F0EEE6）＋ 赤陶色（#D97757）** 配色，
並內建 **Charter** 襯線字體。

> 專注於「閱讀舒適性」：不是把整頁變暗，而是**智慧地**把刺眼的純白背景
> 換成護眼米色、把純黑文字柔化成墨色，並讓程式碼維持等寬字體。內文連結維持墨色（保留底線），
> 赤陶色則保留給按鈕與按鈕式連結，做成奶油白字的強調按鈕。

---

## ✨ 功能

| 功能 | 說明 |
|------|------|
| 🅰️ 全站字體覆蓋 | 預設 **Charter**；可選微軟正黑體 / Noto Sans TC / Noto Serif TC / Arial / 系統預設。程式碼（`code`/`pre`）自動維持等寬字體。 |
| 🎨 智慧背景替換 | 以**亮度演算法**判斷（`brightness > 240`），只替換接近白色的背景，**不碰**圖片 / 影片 / Canvas / SVG / iframe。 |
| 🖋️ 文字柔化 | 背景被改後，自動把純黑（`#000`）文字調整為墨色（`#3D3D3A`），降低對比刺眼感。 |
| 📏 閱讀排版 | 可調行高（預設 1.7）、字距（預設 0.03em）、段落間距。 |
| ⚡ 即時套用 | 在 Popup 調整後**不需重新整理**，目前分頁立即更新（Message Passing）。 |
| 🧹 四層廣告封鎖 | **元件層**（選擇器＋任意屬性 `ad/ads` token，如 `data-owner="ad"`＋IAB iframe 啟發式）、**覆蓋層**（移除 interstitial/modal 並解鎖捲動）、**彈窗層**（MAIN-world 攔 `window.open`，只擋非使用者觸發）、**網路層**（`declarativeNetRequest` 從源頭擋廣告/追蹤請求）。四個開關各自獨立、**完全可逆**。 |
| 🌐 白名單 / 黑名單 | 以 Domain 為單位（含子網域比對），永遠啟用或永遠停用。 |
| 🔄 SPA 支援 | 以 `MutationObserver` 監控 React / Vue / Next.js 動態內容並自動套用。 |
| 🚀 效能優化 | Debounce + `requestIdleCallback` + `WeakSet` 快取，不做每秒全頁掃描。 |
| 🎭 三組主題 | **Paper**（預設）、**Warm**、**Dark**。 |

---

## 📦 專案結構

```
universal-reading-theme/
├── manifest.json                 # MV3 設定
├── src/
│   ├── background.js             # Service worker：預設值、跨分頁廣播、網路層規則
│   ├── content/
│   │   ├── loader.js             # classic content script，動態 import 模組入口
│   │   ├── main.js               # 內容腳本入口：協調模組 + 訊息路由
│   │   ├── settings-manager.js   # SettingsManager：儲存 / 預設 / 同步
│   │   ├── domain-manager.js     # DomainManager：白名單 / 黑名單 / Domain 比對
│   │   ├── theme-engine.js       # ThemeEngine：顏色判斷 / DOM 套用 / 動態更新
│   │   └── ad/                   # 廣告封鎖「邏輯」唯一命名空間
│   │       ├── ad-guard.js       #   AdGuard 協調器：單一 Observer / 分派各 blocker
│   │       ├── element-blocker.js#   元件層：選擇器 + 屬性 token + iframe 啟發式
│   │       ├── hard-blocker.js   #   硬移除層：抗 CSS 的反廣告牆直接從 DOM 移除
│   │       ├── overlay-blocker.js#   覆蓋層：interstitial 移除 + 解鎖捲動
│   │       ├── scroll-lock.js    #   共用：ref-count 解鎖/還原頁面捲動
│   │       └── popup-blocker.js  #   彈窗層（isolated 側）：切換 MAIN-world 旗標
│   ├── page/
│   │   └── popup-guard.js        # MAIN-world：攔截頁面自身的 window.open
│   ├── shared/
│   │   ├── defaults.js           # 預設設定值、主題、字體選項、常數
│   │   ├── ad-rules.js           # 廣告封鎖「資料」唯一來源（選擇器/token/網域/門檻）
│   │   ├── color-utils.js        # 顏色解析 + 亮度演算法
│   │   └── logger.js             # debug 日誌 + 安全包裝
│   └── popup/
│       ├── popup.html / .css / .js
├── assets/fonts/XCharter-*.woff2     # Charter 襯線字體（Roman/Italic/Bold/BoldItalic）
└── icons/icon16/32/48/128.png
```

---

## 🚀 安裝 / 載入（Chrome Developer Mode）

1. 開啟 Chrome，網址列輸入 `chrome://extensions`。
2. 右上角開啟 **開發人員模式 / Developer mode**。
3. 點擊 **載入未封裝項目 / Load unpacked**。
4. 選擇本專案的 **`universal-reading-theme`** 資料夾（包含 `manifest.json` 的那層）。
5. 完成！工具列會出現赤陶色圖示。安裝後**預設即全站啟用**。

> 更新程式碼後，回到 `chrome://extensions` 按該擴充功能的 **🔄 重新載入**，
> 並重新整理目標分頁即可。

---

## 🧩 架構說明

採用 **ES Modules everywhere** 架構：MV3 的 content script 無法直接是模組，
因此用一個極小的 classic `loader.js` 動態 `import()` 真正的模組入口 `main.js`。
如此一來 content / popup / background **共用同一份模組**（`SettingsManager`、
`DomainManager`、`defaults`…），不需打包工具、單一真相來源、符合 ES6+。

核心模組遵循**單一職責原則**：

- **SettingsManager** — 只負責 `chrome.storage.sync` 的讀寫、合併預設值、跨分頁訂閱。
- **DomainManager** — 只負責 hostname 正規化、子網域比對、`shouldApply()` 決策。
- **ThemeEngine** — 把 settings 轉成頁面樣式：注入基礎 stylesheet（含 `@font-face`、
  CSS 變數、按鈕色、排版）＋ 以亮度演算法做**選擇性**的逐元素背景／文字重新上色，
  並用 debounce 的 `MutationObserver` 跟上動態內容。
- **AdGuard（廣告封鎖協調器）** — 見下節。

### 🛡️ 廣告封鎖架構（為何不會四散）

核心原則是**資料與邏輯各自集中**，讓每種新廣告類型都有唯一歸屬：

- **所有廣告「資料」→ [`src/shared/ad-rules.js`](src/shared/ad-rules.js) 單一來源**
  （選擇器、`AD_TOKEN_RE`、IAB 尺寸、網路網域、覆蓋層門檻）。
- **所有廣告「邏輯」→ [`src/content/ad/`](src/content/ad/) 單一命名空間**，由
  **`AdGuard`** 協調器持有唯一的 `MutationObserver`、debounce/idle 批次、`WeakSet`
  快取與共用的 `data-urt-ad` 標記，再分派給各**單一職責** blocker。每個開關都與
  既有的 Domain 閘門（`shouldApply()`）做 AND。

五層防護：

1. **元件層（ElementBlocker）** — 注入選擇器 stylesheet（`display:none` 即時生效，
   攔非同步載入的廣告）；另掃描**每個元素的所有屬性值**以 `AD_TOKEN_RE` **token 比對**
   （命中 `ad`/`ads`/`advert(s)`/`sponsored` 或 `ad-`／`-ad` 邊界，如 `data-owner="ad"`、
   `ad-slot`，但**不**用盲目子字串，故 `header`／`download`／`adsense`／`adidas` 不誤殺）；
   再加 **IAB 尺寸跨來源 iframe** 啟發式。
2. **硬移除層（HardBlocker）** — 針對**抗 CSS 隱藏**的反廣告封鎖牆（如 Google Funding
   Choices 的 `.fc-ab-root`，其自身樣式表/inline `!important` 會壓過我們的 `display:none`），
   直接 **`el.remove()` 從 DOM 移除**並解鎖捲動。清單在 `HARD_REMOVE_SELECTORS`。
   **連續偵測**：AdGuard 的 `MutationObserver` 除 childList（重新注入）外也監看 `class`/`id`
   變動（延遲後才掛上 `fc-ab-root` class 的既有元素），命中即再次移除。
   *取捨*：移除的 DOM 在關閉開關時**不自動還原**（重整頁面即恢復）。
3. **覆蓋層（OverlayBlocker）** — 偵測**定位 + 覆蓋 ≥60% 視窗 + 高 z-index + 帶廣告訊號**
   的 interstitial/modal，隱藏之並**解鎖捲動**（共用 `scroll-lock.js` 還原
   `html/body overflow:hidden`、`body position:fixed`）。保守條件避免誤殺正常內容彈窗。
4. **彈窗層（PopupBlocker + page/popup-guard.js）** — content script 在 isolated world
   無法攔頁面自身的 `window.open`，故以 **MAIN-world 注入腳本**包裹 `window.open`：
   **只擋無使用者手勢（`navigator.userActivation`）的呼叫**，保留使用者親手點開的視窗
   （含 OAuth）。透過 `<html data-urt-popup-guard>` 旗標開關，兩個 world 共用 DOM。
5. **網路層（background.js + declarativeNetRequest）** — 從 `AD_NETWORK_DOMAINS` 動態
   產生封鎖規則，在**請求層**擋掉廣告/追蹤/彈窗網域（banner、pop-under、tracker 根本
   不下載）；黑名單站台以高優先序 `allow` 規則豁免，與停用主題一致。

**安全與可逆**：純樣式隱藏（`data-urt-ad` + `display:none`），不刪 DOM；逐元素 `WeakSet`
最多處理一次、debounce 批次掃描；關閉任一開關即移除標記、還原捲動、清除彈窗旗標、
同步網路規則——**零殘留**。

**已知限制（誠實告知）**：第一方自家網域廣告、YouTube 式影片 pre-roll，以及保守模式下
**挾帶真實點擊**的 pop-under 仍可能漏網。

### 為什麼這樣設計效能才好？

- **CSS 變數**承擔基礎閱讀層（`html/body` 背景、字體、行高、連結色），便宜且即時；
  改主題只更新變數值，**不需重新掃描 DOM**。
- 逐元素處理**只**針對「明確設定了接近白色背景」的元素（透明背景直接略過），
  工作量有界；每個元素用 `WeakSet` 確保**最多處理一次**。
- 新增節點交給 `MutationObserver`，以 `DEBOUNCE_MS`(150ms) + `requestIdleCallback`
  分批處理，避免卡頓。

### 顏色演算法

```js
brightness = (r*299 + g*587 + b*114) / 1000   // 感知亮度 0–255
isNearWhite = a > 0.5 && brightness > 240      // 視為白色背景 → 換成米色
isNearBlack = a > 0.5 && brightness < 40       // 視為純黑文字 → 柔化成墨色
```

---

## 🎨 預設主題

| 主題 | 背景 | 文字 | 按鈕／強調 |
|------|------|------|------|
| **Paper**（預設） | `#F0EEE6` | `#3D3D3A` | `#D97757` |
| **Warm** | `#F1E7D0` | `#2D2D2D` | `#C2603F` |
| **Dark** | `#1E1E1E` | `#E0E0E0` | `#E0996F` |

---

## 🔧 除錯

把設定中的 `debug` 設為 `true`（可在 DevTools console 執行
`chrome.storage.sync.get('urt_settings', console.log)` 檢視），即可在每個分頁的
console 看到 `[URT]` 前綴的詳細日誌。錯誤（`warn`/`error`）一律輸出。

---

## 🔮 未來可擴充功能

- **每網站獨立設定檔**（per-site profiles）。
- **鍵盤快捷鍵**一鍵開關。
- **排程**：依時間自動切換 Dark / Paper。
- **閱讀寬度限制**（max-width）讓長文更易讀。
- **自訂上傳字體**。
- **獨立 Options 設定頁** + 設定匯出 / 匯入。
- 以 **WCAG 對比度**動態計算文字色，取代固定 `#333`。

---

## 📤 上架 Chrome Web Store

已內建編譯好的廣告封鎖資料與字體，**無需建置步驟**即可直接壓縮
`universal-reading-theme/` 資料夾上傳（如需更新過濾清單，見 [`BUILD.md`](BUILD.md)）。
請先確認 `manifest.json` 的 `version` 並視需求補上商店所需的截圖與隱私說明
（本擴充功能僅使用 `chrome.storage.sync` 儲存使用者偏好，不蒐集任何瀏覽資料）。

**授權與第三方素材**：本專案程式碼採 MIT 授權（[`LICENSE`](LICENSE)）。內建的廣告
封鎖資料（AdGuard / EasyList，GPL-3.0 / CC-BY-SA-3.0）、Ghostery 引擎（MPL-2.0）與
Charter 字體（Bitstream Charter 授權）各依其授權散布，詳見
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) 與 [`LICENSES/`](LICENSES/)。
打包上傳時請保留這些檔案。
