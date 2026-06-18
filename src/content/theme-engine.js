/**
 * theme-engine.js
 * -----------------------------------------------------------------------------
 * ThemeEngine — the heart of the extension. Responsible for:
 *   - injecting the base stylesheet (font override, link color, spacing, vars)
 *   - the smart, brightness-based per-element background/text recoloring
 *   - keeping up with dynamic (SPA) content via a debounced MutationObserver
 *   - tearing everything down cleanly when disabled
 *
 * Performance contract (spec): never sweep the whole DOM on a timer. Work is
 * driven by mutations, batched with a debounce, and every element is processed
 * at most once thanks to a WeakSet cache. CSS variables make theme tweaks
 * (colors / spacing) instant without any rescan.
 *
 * Single responsibility: turning a settings object into on-page styling.
 */

import {
  SKIP_TAGS,
  DEBOUNCE_MS,
  MONO_STACK,
  CHARTER_FAMILY,
  BTN_TEXT_COLOR,
  fontStackFor
} from '../shared/defaults.js';
import {
  parseColor,
  isNearWhite,
  isNearBlack,
  isTransparent
} from '../shared/color-utils.js';
import { logger, safe } from '../shared/logger.js';

const STYLE_ID = 'urt-base-style';
const MARK_ATTR = 'data-urt'; // marks elements we have given inline overrides
const BTN_MARK_ATTR = 'data-urt-btn'; // marks elements recolored as terracotta buttons
const SVG_NS = 'http://www.w3.org/2000/svg';

/* Selector matching code-ish elements that must stay monospace. */
const MONO_SELECTOR =
  'code, code *, pre, pre *, kbd, samp, tt, [class*="mono"], [class*="hljs"], [class*="prism"], [class*="CodeMirror"], [class*="cm-"]';

/* Icon-font elements: keep their ORIGINAL font (overriding it breaks glyphs,
   and letter-spacing breaks Material Icons ligatures). */
const ICON_SELECTOR =
  '.fa, .fas, .far, .fal, .fab, [class^="fa-"], [class*=" fa-"], ' +
  '.material-icons, [class^="material-icons"], [class^="material-symbols"], ' +
  '.glyphicon, [class^="glyphicon-"], .bi, [class^="bi-"], [class*=" bi-"], ' +
  '[class*="icon-"]';

/* Elements excluded from the font-family + letter-spacing override. */
const FONT_EXCLUDE = `${MONO_SELECTOR}, ${ICON_SELECTOR}`;

/* Button-like elements that should become terracotta action buttons. */
const BTN_SELECTOR =
  'button, [role="button"], input[type="submit"], input[type="button"], ' +
  'input[type="reset"], a.btn, a.button, a[class*="btn"], a[class*="button"]';

/* :not() chain to exclude button-like links from the inline-link rule. */
const BTN_LINK_EXCLUDE =
  ':not(.btn):not(.button):not([class*="btn"]):not([class*="button"]):not([role="button"])';

export class ThemeEngine {
  constructor() {
    this.settings = null;
    this.active = false;
    this.processed = new WeakSet(); // elements already scanned
    this.observer = null;
    this.debounceTimer = null;
    this.pending = new Set(); // roots awaiting a batched rescan
    this._styleEl = null;
    this._onMutations = this._onMutations.bind(this);
  }

  /* ----------------------------- Lifecycle ------------------------------ */

  /** Apply theming for the given settings (idempotent). */
  enable(settings) {
    this.settings = settings;
    this.active = true;
    this.injectBaseStyle();
    this.setVars(settings);
    // Initial pass over the existing document, then watch for new content.
    this.scan(document.documentElement);
    this.observe();
    logger.log('ThemeEngine enabled for', location.hostname);
  }

  /** Update colors/spacing/font live. Cheap when only variables changed. */
  update(settings) {
    if (!this.active) return this.enable(settings);
    const fontChanged = !this.settings || this.settings.font !== settings.font;
    this.settings = settings;
    this.setVars(settings);
    if (fontChanged) this._refreshStaticRules(); // font stack lives in @font rules
    // Recolor: clear cache so the new bg/text colors are re-evaluated.
    this.processed = new WeakSet();
    this.scan(document.documentElement);
    logger.log('ThemeEngine updated');
  }

  /** Remove all theming and stop observing. */
  disable() {
    this.active = false;
    if (this.observer) {
      safe(() => this.observer.disconnect(), null, 'observer disconnect');
      this.observer = null;
    }
    clearTimeout(this.debounceTimer);
    this.pending.clear();
    if (this._styleEl && this._styleEl.parentNode) {
      this._styleEl.parentNode.removeChild(this._styleEl);
    }
    this._styleEl = null;
    this._clearInlineOverrides();
    this._clearVars();
    this.processed = new WeakSet();
    logger.log('ThemeEngine disabled');
  }

  /* --------------------------- Base stylesheet -------------------------- */

  injectBaseStyle() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      // documentElement so it works even before <head> exists (document_start).
      (document.head || document.documentElement).appendChild(el);
    }
    this._styleEl = el;
    this._refreshStaticRules();
  }

  /** (Re)write the static CSS rules. Variable VALUES live on documentElement. */
  _refreshStaticRules() {
    if (!this._styleEl) return;
    const fontUrl = safe(
      () => chrome.runtime.getURL('assets/fonts/XCharter-Roman.woff2'),
      '',
      'getURL font'
    );

    this._styleEl.textContent = `
@font-face {
  font-family: '${CHARTER_FAMILY}';
  src: url("${fontUrl}") format('opentype');
  font-weight: 300 700;
  font-style: normal;
  font-display: swap;
}

/* Base reading surface — cheap, covers the page without per-element work. */
html, body {
  background-color: var(--urt-bg) !important;
  color: var(--urt-text) !important;
}

/* Font + letter-spacing on (almost) every element. Icon fonts & code excluded. */
body, body *:not(${FONT_EXCLUDE}) {
  font-family: var(--urt-font) !important;
  letter-spacing: var(--urt-ls) !important;
}

/* Line-height is safe on icons, so only code is excluded here. */
body, body *:not(${MONO_SELECTOR}) {
  line-height: var(--urt-lh) !important;
}

/* Keep code readable: monospace + normal spacing. */
${MONO_SELECTOR} {
  font-family: ${MONO_STACK} !important;
  letter-spacing: normal !important;
}

/* Paragraph rhythm. */
p {
  margin-top: var(--urt-ps) !important;
  margin-bottom: var(--urt-ps) !important;
}

/* Inline links: ink-colored text (no terracotta), keep underline to stay recognizable. */
a${BTN_LINK_EXCLUDE}, a${BTN_LINK_EXCLUDE} *:not(${MONO_SELECTOR}) {
  color: var(--urt-text) !important;
}
a${BTN_LINK_EXCLUDE} {
  text-decoration: underline;
}

/* Terracotta buttons are recolored per-element in JS (only when they already
   have a visible background); the static rule just darkens them on hover. */
[${BTN_MARK_ATTR}]:hover {
  filter: brightness(0.93);
}
`;
  }

  /* ------------------------------ Variables ----------------------------- */

  setVars(settings) {
    const root = document.documentElement;
    if (!root) return;
    const s = root.style;
    safe(() => {
      s.setProperty('--urt-bg', settings.bg);
      s.setProperty('--urt-text', settings.text);
      s.setProperty('--urt-link', settings.link);
      s.setProperty('--urt-font', fontStackFor(settings.font));
      s.setProperty('--urt-lh', String(settings.lineHeight));
      s.setProperty('--urt-ls', `${settings.letterSpacing}em`);
      s.setProperty('--urt-ps', `${settings.paragraphSpacing}em`);
    }, null, 'setVars');
  }

  _clearVars() {
    const root = document.documentElement;
    if (!root) return;
    ['--urt-bg', '--urt-text', '--urt-link', '--urt-font', '--urt-lh', '--urt-ls', '--urt-ps'].forEach(
      (v) => root.style.removeProperty(v)
    );
  }

  /* ------------------------- Smart recoloring --------------------------- */

  /** Scan a subtree, recoloring near-white backgrounds and near-black text. */
  scan(root) {
    if (!this.active || !root) return;
    safe(() => {
      // Process the root itself if it's an element, then all descendants.
      if (root.nodeType === Node.ELEMENT_NODE) this._processElement(root);
      const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (let i = 0; i < all.length; i++) this._processElement(all[i]);
    }, null, 'scan');
  }

  _processElement(el) {
    if (this.processed.has(el)) return;
    const tag = el.tagName;
    if (!tag) return;

    // Never touch media / embedded content or anything inside an <svg>.
    if (SKIP_TAGS.has(tag) || el.namespaceURI === SVG_NS) {
      this.processed.add(el);
      return;
    }

    let style;
    try {
      style = getComputedStyle(el);
    } catch {
      return; // detached / cross-origin edge cases
    }
    if (!style) return;

    // Button-like elements: turn into a terracotta action button ONLY when they
    // already have a visible background. Borderless / text-only buttons are left
    // untouched (recoloring would invent a fill the site never had).
    if (el.matches(BTN_SELECTOR)) {
      const btnBg = parseColor(style.backgroundColor);
      if (!isTransparent(btnBg)) {
        el.style.setProperty('background-color', this.settings.link, 'important');
        el.style.setProperty('border-color', this.settings.link, 'important');
        el.style.setProperty('color', BTN_TEXT_COLOR, 'important');
        el.setAttribute(MARK_ATTR, '1');
        el.setAttribute(BTN_MARK_ATTR, '1');
      }
      this.processed.add(el);
      return;
    }

    // Inside a recolored button → match the cream button text, skip generic recolor.
    if (el.closest(`[${BTN_MARK_ATTR}]`)) {
      el.style.setProperty('color', BTN_TEXT_COLOR, 'important');
      el.setAttribute(MARK_ATTR, '1');
      this.processed.add(el);
      return;
    }

    // --- Background: only rewrite explicit, visible, near-white fills. ---
    const bg = parseColor(style.backgroundColor);
    if (!isTransparent(bg) && isNearWhite(bg)) {
      el.style.setProperty('background-color', this.settings.bg, 'important');
      el.setAttribute(MARK_ATTR, '1');
    }

    // --- Text: soften near-black colors that are set ON this element. ---
    const color = parseColor(style.color);
    if (isNearBlack(color) && this._colorIsOwn(el, style.color)) {
      el.style.setProperty('color', this.settings.text, 'important');
      el.setAttribute(MARK_ATTR, '1');
    }

    this.processed.add(el);
  }

  /**
   * Heuristic: treat a color as explicitly set on `el` (not merely inherited)
   * when it differs from the parent's computed color. This keeps us from
   * stamping an inline color onto every inheriting element.
   */
  _colorIsOwn(el, computedColor) {
    const parent = el.parentElement;
    if (!parent) return true;
    try {
      return getComputedStyle(parent).color !== computedColor;
    } catch {
      return true;
    }
  }

  /* ----------------------- Dynamic content (SPA) ------------------------ */

  observe() {
    if (this.observer) return;
    if (typeof MutationObserver === 'undefined') {
      logger.warn('MutationObserver unavailable — dynamic content not tracked.');
      return;
    }
    this.observer = new MutationObserver(this._onMutations);
    const target = document.documentElement || document.body;
    if (!target) return;
    safe(
      () =>
        this.observer.observe(target, {
          childList: true,
          subtree: true
        }),
      null,
      'observer.observe'
    );
  }

  _onMutations(mutations) {
    if (!this.active) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) this.pending.add(node);
      }
    }
    if (this.pending.size > 0) this._scheduleScan();
  }

  /** Debounce + idle-time batching so we never thrash the page. */
  _scheduleScan() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const roots = Array.from(this.pending);
      this.pending.clear();
      const run = () => roots.forEach((r) => this.scan(r));
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 500 });
      } else {
        run();
      }
    }, DEBOUNCE_MS);
  }

  /* ------------------------------ Teardown ------------------------------ */

  _clearInlineOverrides() {
    safe(() => {
      document.querySelectorAll(`[${MARK_ATTR}]`).forEach((el) => {
        el.style.removeProperty('background-color');
        el.style.removeProperty('border-color');
        el.style.removeProperty('color');
        el.removeAttribute(MARK_ATTR);
        el.removeAttribute(BTN_MARK_ATTR);
      });
    }, null, 'clearInlineOverrides');
  }
}
