# Universal Reading Theme

一個 Chrome Extension（Manifest V3），讓你在**所有網站**上統一字體、背景色與文字顏色，
打造舒適的閱讀體驗。預設採用 **溫潤米色（#F0EEE6）＋ 赤陶色（#D97757）** 配色，
並內建 **Charter** 字體。

> 專注於「閱讀舒適性」：不是把整頁變暗，而是**智慧地**把刺眼的純白背景
> 換成護眼米色、把純黑文字柔化成墨色，並讓程式碼維持等寬字體。

---

## ✨ 功能

| 功能 | 說明 |
|------|------|
| 🅰️ 全站字體覆蓋 | 預設 **Charter**；可選微軟正黑體 / Noto Sans TC / Noto Serif TC / Arial / 系統預設。程式碼（`code`/`pre`）自動維持等寬字體。 |
| 🎨 智慧背景替換 | 以**亮度演算法**判斷（`brightness > 240`），只替換接近白色的背景，**不碰**圖片 / 影片 / Canvas / SVG / iframe。 |
| 🖋️ 文字柔化 | 背景被改後，自動把純黑（`#000`）文字調整為墨色（`#3D3D3A`），降低對比刺眼感。 |
| 📏 閱讀排版 | 可調行高（預設 1.7）、字距（預設 0.03em）、段落間距。 |
| ⚡ 即時套用 | 在 Popup 調整後**不需重新整理**，目前分頁立即更新（Message Passing）。 |
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
│   ├── background.js             # Service worker：安裝預設值、跨分頁廣播
│   ├── content/
│   │   ├── loader.js             # classic content script，動態 import 模組入口
│   │   ├── main.js               # 內容腳本入口：協調三大模組 + 訊息路由
│   │   ├── settings-manager.js   # SettingsManager：儲存 / 預設 / 同步
│   │   ├── domain-manager.js     # DomainManager：白名單 / 黑名單 / Domain 比對
│   │   └── theme-engine.js       # ThemeEngine：顏色判斷 / DOM 套用 / 動態更新
│   ├── shared/
│   │   ├── defaults.js           # 預設值、主題、字體選項、常數
│   │   ├── color-utils.js        # 顏色解析 + 亮度演算法
│   │   └── logger.js             # debug 日誌 + 安全包裝
│   └── popup/
│       ├── popup.html / .css / .js
├── assets/fonts/XCharter-Roman.woff2
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

三大核心模組遵循**單一職責原則**：

- **SettingsManager** — 只負責 `chrome.storage.sync` 的讀寫、合併預設值、跨分頁訂閱。
- **DomainManager** — 只負責 hostname 正規化、子網域比對、`shouldApply()` 決策。
- **ThemeEngine** — 把 settings 轉成頁面樣式：注入基礎 stylesheet（含 `@font-face`、
  CSS 變數、連結色、排版）＋ 以亮度演算法做**選擇性**的逐元素背景／文字重新上色，
  並用 debounce 的 `MutationObserver` 跟上動態內容。

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

| 主題 | 背景 | 文字 | 連結 |
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

本專案不依賴任何第三方框架、無建置步驟，可直接壓縮 `universal-reading-theme/`
資料夾上傳。請先確認 `manifest.json` 的 `version` 並視需求補上商店所需的截圖與隱私說明
（本擴充功能僅使用 `chrome.storage.sync` 儲存使用者偏好，不蒐集任何瀏覽資料）。
