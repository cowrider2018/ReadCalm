/**
 * defaults.js
 * -----------------------------------------------------------------------------
 * Single source of truth for default settings, theme presets, font options and
 * tuning constants. Imported (as an ES module) by the content script graph, the
 * popup and the background service worker so every part of the extension agrees
 * on the same defaults.
 *
 * Single responsibility: configuration data only — no logic, no side effects.
 */

/**
 * The internal CSS family name registered by the bundled Charter font.
 * The @font-face rule injected by ThemeEngine declares this exact name, so the
 * file's real internal name does not matter.
 */
export const CHARTER_FAMILY = 'Charter';

/**
 * Selectable fonts shown in the popup dropdown. `value` is stored in settings;
 * `stack` is the real CSS font-family applied to the page. Charter is
 * intentionally first so it is the default option.
 */
export const FONT_OPTIONS = [
  {
    value: 'charter',
    label: 'Charter',
    stack: `'${CHARTER_FAMILY}', 'Noto Serif TC', Georgia, 'Times New Roman', serif`
  },
  {
    value: 'jhenghei',
    label: '微軟正黑體',
    stack: `'Microsoft JhengHei', 'PingFang TC', 'Heiti TC', sans-serif`
  },
  {
    value: 'noto-sans-tc',
    label: '思源黑體 / Noto Sans TC',
    stack: `'Noto Sans TC', 'Source Han Sans TC', 'PingFang TC', sans-serif`
  },
  {
    value: 'noto-serif-tc',
    label: 'Noto Serif TC',
    stack: `'Noto Serif TC', 'Source Han Serif TC', Georgia, serif`
  },
  {
    value: 'arial',
    label: 'Arial',
    stack: `Arial, Helvetica, sans-serif`
  },
  {
    value: 'system',
    label: '系統預設 / System',
    stack: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
  }
];

/** Monospace stack used for code blocks so they stay readable. */
export const MONO_STACK = `ui-monospace, SFMono-Regular, 'Cascadia Code', Menlo, Consolas, 'Liberation Mono', monospace`;

/** Resolve a stored font value to its CSS font-family stack. */
export function fontStackFor(value) {
  const found = FONT_OPTIONS.find((f) => f.value === value);
  return (found || FONT_OPTIONS[0]).stack;
}

/**
 * Built-in theme presets. The default ("paper") is Claude's signature cream
 * surface with terracotta links.
 */
export const THEMES = {
  paper: { label: 'Paper', bg: '#F0EEE6', text: '#3D3D3A', link: '#D97757' },
  warm: { label: 'Warm', bg: '#F1E7D0', text: '#2D2D2D', link: '#C2603F' },
  dark: { label: 'Dark', bg: '#1E1E1E', text: '#E0E0E0', link: '#E0996F' }
};

/** Default settings, persisted to chrome.storage.sync on install. */
export const DEFAULT_SETTINGS = {
  enabled: true, // master switch — global auto-apply
  theme: 'paper', // active preset key (informational; explicit colors below win)
  font: 'charter',
  bg: THEMES.paper.bg,
  text: THEMES.paper.text,
  link: THEMES.paper.link,
  lineHeight: 1.7, // unitless line-height
  letterSpacing: 0.03, // em
  paragraphSpacing: 1.2, // em, vertical margin on <p>
  removeAds: true, // hide common ad elements (selectors / attribute tokens / iframes)
  blockOverlays: true, // remove interstitial / modal overlays + restore scrolling
  blockPopups: true, // gate non-user-triggered window.open pop-ups / pop-unders
  blockAdRequests: true, // block ad/tracker/pop network requests (declarativeNetRequest)
  whitelist: [], // when non-empty, ONLY these domains are themed
  blacklist: [], // these domains are never themed
  debug: false // gate console logging
};

/* ------------------------------- Constants ------------------------------- */

/** brightness > this (0-255 scale) counts as a "near white" background. */
export const BRIGHTNESS_THRESHOLD = 240;

/** brightness < this counts as "near black" text needing softening.
 *  Kept below #333 (brightness ~51) so our own softened ink isn't re-touched. */
export const NEAR_BLACK_MAX = 40;

/** Text color inside terracotta action buttons (cream, contrasts with link color). */
export const BTN_TEXT_COLOR = '#F0EEE6';

/** Elements whose visuals must never be touched (media / embedded content). */
export const SKIP_TAGS = new Set([
  'IMG',
  'VIDEO',
  'CANVAS',
  'SVG',
  'IFRAME',
  'PICTURE',
  'OBJECT',
  'EMBED',
  'AUDIO',
  'MAP',
  'AREA'
]);

/** Debounce window (ms) for batching MutationObserver-driven rescans. */
export const DEBOUNCE_MS = 150;

/* Ad-blocking data (selectors, tokens, sizes, network domains, overlay
   thresholds) lives in its own single-source-of-truth file: ./ad-rules.js */

/** Message types exchanged between popup / background / content. */
export const MSG = {
  APPLY: 'URT_APPLY', // push updated settings to a tab
  DISABLE: 'URT_DISABLE', // tell a tab to remove theming
  GET_STATE: 'URT_GET_STATE' // popup asks content for current host state
};
