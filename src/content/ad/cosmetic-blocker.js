/**
 * cosmetic-blocker.js
 * -----------------------------------------------------------------------------
 * One AdGuard strategy: element-hiding driven by the Ghostery cosmetic engine
 * (EasyList / EasyList China / Annoyances cosmetic `##` filters). This is the
 * comprehensive counterpart to ElementBlocker's curated selectors: instead of a
 * hand-written list, it asks the background service worker — which holds the
 * serialized Ghostery engine — for the exact hide-selectors that apply to THIS
 * hostname, then injects them as a `display:none !important` stylesheet.
 *
 * Why the split: the engine (multi-MB) lives once in the background; content
 * scripts stay tiny and just exchange page features (the class/id/href tokens
 * seen in the DOM) for ready-to-inject CSS. New tokens discovered as the page
 * mutates are batched and sent incrementally, so SPA / lazy-loaded ads are caught
 * too — mirroring AdGuard's own observer/debounce contract.
 *
 * A "lifecycle" blocker (enable()/disable() only): it owns its stylesheet and a
 * lightweight observer rather than participating in the per-element marker scan.
 *
 * Single responsibility: turning Ghostery cosmetic rules into hidden ad elements.
 */

import { MSG, DEBOUNCE_MS } from '../../shared/defaults.js';
import { safe } from '../../shared/logger.js';

const STYLE_ID = 'urt-cosmetic-style';

export class CosmeticBlocker {
  constructor() {
    this._styleEl = null;
    this._seen = new Set(); // class/id/href tokens already requested (prefixed)
    this._observer = null;
    this._debounce = null;
    this._pending = new Set(); // mutated roots awaiting a batched feature scan
    this._enabled = false;
    this._onMutations = this._onMutations.bind(this);
  }

  /** Inject the (initially empty) cosmetic stylesheet and request hostname rules. */
  enable() {
    if (this._enabled) return;
    this._enabled = true;
    this._ensureStyle();
    // First request: hostname-specific + generic base rules, seeded with the
    // class/id/href tokens already present in the document.
    this._request(this._extract([document.documentElement]), true);
    this._observe();
  }

  /** Remove the stylesheet + observer and forget seen tokens (fully reversible). */
  disable() {
    this._enabled = false;
    if (this._observer) {
      safe(() => this._observer.disconnect(), null, 'cosmetic observer disconnect');
      this._observer = null;
    }
    clearTimeout(this._debounce);
    this._pending.clear();
    this._seen.clear();
    if (this._styleEl && this._styleEl.parentNode) {
      this._styleEl.parentNode.removeChild(this._styleEl);
    }
    this._styleEl = null;
  }

  _ensureStyle() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      // documentElement so it applies before <head> exists (document_start).
      (document.head || document.documentElement).appendChild(el);
    }
    this._styleEl = el;
  }

  /**
   * Collect NEW class / id / href tokens from a set of subtree roots. The `_seen`
   * set guarantees each token is sent to the engine at most once, keeping the
   * incremental updates small.
   */
  _extract(roots) {
    const classes = [];
    const ids = [];
    const hrefs = [];
    const pushNew = (arr, prefix, val) => {
      if (!val) return;
      const key = prefix + val;
      if (this._seen.has(key)) return;
      this._seen.add(key);
      arr.push(val);
    };
    const visit = (el) => {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
      const cl = el.classList;
      if (cl) for (let i = 0; i < cl.length; i++) pushNew(classes, 'c:', cl[i]);
      if (el.id) pushNew(ids, 'i:', el.id);
      if (el.tagName === 'A') {
        const href = el.getAttribute('href');
        if (href) pushNew(hrefs, 'h:', href);
      }
    };
    for (const root of roots) {
      if (!root) continue;
      visit(root);
      const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (let i = 0; i < all.length; i++) visit(all[i]);
    }
    return { classes, ids, hrefs };
  }

  /** Ask the background engine for hide CSS matching these features; inject it. */
  _request(feats, first) {
    if (!first && !feats.classes.length && !feats.ids.length && !feats.hrefs.length) return;
    safe(
      () =>
        chrome.runtime.sendMessage(
          { type: MSG.GET_COSMETICS, url: location.href, first, ...feats },
          (resp) => {
            void chrome.runtime.lastError; // tab closed / no listener → ignore
            if (resp && resp.styles) this._appendStyles(resp.styles);
          }
        ),
      null,
      'cosmetics request'
    );
  }

  /** Append engine-produced CSS (already carries the hiding declaration). */
  _appendStyles(css) {
    if (!css || !this._styleEl) return;
    this._styleEl.textContent += '\n' + css;
  }

  _observe() {
    if (this._observer || typeof MutationObserver === 'undefined') return;
    const target = document.documentElement || document.body;
    if (!target) return;
    this._observer = new MutationObserver(this._onMutations);
    safe(
      () =>
        this._observer.observe(target, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'id']
        }),
      null,
      'cosmetic observer.observe'
    );
  }

  _onMutations(mutations) {
    if (!this._enabled) return;
    for (const m of mutations) {
      if (m.type === 'attributes') {
        if (m.target) this._pending.add(m.target);
      } else {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) this._pending.add(node);
        }
      }
    }
    if (this._pending.size) this._schedule();
  }

  _schedule() {
    clearTimeout(this._debounce);
    this._debounce = setTimeout(() => {
      const roots = Array.from(this._pending);
      this._pending.clear();
      // Incremental: only newly-seen tokens, no hostname/base re-fetch.
      this._request(this._extract(roots), false);
    }, DEBOUNCE_MS);
  }
}
