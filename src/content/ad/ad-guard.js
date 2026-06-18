/**
 * ad-guard.js
 * -----------------------------------------------------------------------------
 * AdGuard — the single coordinator for ALL ad blocking. It owns the shared
 * infrastructure (one MutationObserver, the debounce/idle batching, the
 * `WeakSet` "process once" cache, and the `data-urt-ad` marker stylesheet) and
 * dispatches work to focused, single-responsibility sub-blockers:
 *
 *   - "marker" blockers expose check(el) -> bool (+ optional onMarked(el),
 *     rescanAfterMs). Each scanned element is offered to the active markers;
 *     the first match marks it with `data-urt-ad` (hidden by the marker
 *     stylesheet) and may take a stronger action in onMarked (HardBlocker
 *     removes the node; OverlayBlocker frees scroll). Hard/Overlay/Element are
 *     markers, tried in that order so the strongest claim wins.
 *   - "lifecycle" blockers expose only enable()/disable() and run independently
 *     of the DOM scan (e.g. PopupBlocker toggles a main-world flag).
 *
 * This is the structural answer to "ads are everywhere, so the code shouldn't
 * be": every ad type lives behind this one entry point, mirroring ThemeEngine's
 * observer/debounce/WeakSet/restore contract. apply() is the only public verb
 * the content script needs.
 *
 * Single responsibility: orchestrating ad blockers + owning their shared scan.
 */

import { HardBlocker } from './hard-blocker.js';
import { ElementBlocker } from './element-blocker.js';
import { OverlayBlocker } from './overlay-blocker.js';
import { PopupBlocker } from './popup-blocker.js';
import { DEBOUNCE_MS } from '../../shared/defaults.js';
import { logger, safe } from '../../shared/logger.js';

const MARK_ATTR = 'data-urt-ad';
const MARK_STYLE_ID = 'urt-ad-mark-style';

export class AdGuard {
  constructor() {
    // Sub-blockers, instantiated once and toggled by flags. `marker: true` means
    // it participates in the per-element DOM scan via check(). Order matters: Hard
    // (DOM removal of walls) runs before Overlay (claims full-screen ad overlays +
    // scroll-unlock) before Element (plain hiding), so the strongest claim wins.
    this.hardBlocker = new HardBlocker();
    this.overlayBlocker = new OverlayBlocker();
    this.elementBlocker = new ElementBlocker();
    this.popupBlocker = new PopupBlocker();
    this._registry = [
      { key: 'removeAds', blocker: this.hardBlocker, marker: true, on: false },
      { key: 'blockOverlays', blocker: this.overlayBlocker, marker: true, on: false },
      { key: 'removeAds', blocker: this.elementBlocker, marker: true, on: false },
      // Lifecycle-only (no DOM scan): toggles the main-world window.open guard.
      { key: 'blockPopups', blocker: this.popupBlocker, marker: false, on: false }
    ];

    this.scanning = false; // are the observer + marker stylesheet live?
    this.observer = null;
    this.debounceTimer = null;
    this.rescanTimer = null;
    this.pending = new Set(); // added roots awaiting a batched subtree sweep
    this.attrPending = new Set(); // elements whose class/id changed → targeted recheck
    this.processed = new WeakSet(); // elements already classified
    this._markStyleEl = null;
    this._markers = []; // active marker blockers (cached from _registry)
    this._sig = ''; // signature of the active marker set (gates re-sweeps)
    this._onMutations = this._onMutations.bind(this);
  }

  /* ------------------------------ Public API ---------------------------- */

  /**
   * Reconcile every sub-blocker against the latest settings + domain rule.
   * Each blocker's own flag is AND-ed with `shouldApply` (the blacklist /
   * whitelist / master-switch decision the DomainManager already made).
   */
  apply(settings, shouldApply) {
    for (const entry of this._registry) {
      this._toggle(entry, shouldApply && Boolean(settings[entry.key]));
    }

    this._markers = this._registry.filter((e) => e.marker && e.on).map((e) => e.blocker);
    const sig = this._registry.filter((e) => e.marker && e.on).map((e) => e.key).join('|');

    if (this._markers.length === 0) {
      this._stopScanning();
    } else if (sig !== this._sig) {
      // Marker composition changed → re-evaluate the whole page cleanly.
      this._startScanning();
      this._reset();
      this._sweep(document.documentElement);
      this._scheduleRescan();
    }
    this._sig = sig;
  }

  /** Hard stop: tear down every blocker and remove all traces. */
  disable() {
    for (const entry of this._registry) this._toggle(entry, false);
    this._markers = [];
    this._sig = '';
    this._stopScanning();
  }

  /* ---------------------------- Blocker toggling ------------------------ */

  _toggle(entry, on) {
    if (entry.on === on) return;
    entry.on = on;
    safe(() => (on ? entry.blocker.enable() : entry.blocker.disable()), null, `toggle ${entry.key}`);
  }

  /* ----------------------------- Scan machinery ------------------------- */

  _startScanning() {
    if (this.scanning) return;
    this.scanning = true;
    this._injectMarkStyle();
    this._observe();
    logger.log('AdGuard scanning enabled for', location.hostname);
  }

  _stopScanning() {
    if (!this.scanning) return;
    this.scanning = false;
    if (this.observer) {
      safe(() => this.observer.disconnect(), null, 'ad observer disconnect');
      this.observer = null;
    }
    clearTimeout(this.debounceTimer);
    clearTimeout(this.rescanTimer);
    this.pending.clear();
    this.attrPending.clear();
    this._clearMarks();
    if (this._markStyleEl && this._markStyleEl.parentNode) {
      this._markStyleEl.parentNode.removeChild(this._markStyleEl);
    }
    this._markStyleEl = null;
    this.processed = new WeakSet();
    logger.log('AdGuard scanning disabled');
  }

  /** Drop marks + cache so the next sweep re-classifies with the new marker set. */
  _reset() {
    this._clearMarks();
    this.processed = new WeakSet();
  }

  _injectMarkStyle() {
    let el = document.getElementById(MARK_STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = MARK_STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    this._markStyleEl = el;
    el.textContent = `[${MARK_ATTR}] { display: none !important; }`;
  }

  /** One-shot deferred re-sweep: many overlays/ads only appear after load. */
  _scheduleRescan() {
    const delay = Math.max(0, ...this._markers.map((b) => b.rescanAfterMs || 0));
    if (!delay) return;
    clearTimeout(this.rescanTimer);
    this.rescanTimer = setTimeout(() => {
      if (!this.scanning) return;
      this.processed = new WeakSet(); // re-evaluate late-blooming elements once
      this._sweep(document.documentElement);
    }, delay);
  }

  /* --------------------------- Per-element scan ------------------------- */

  _sweep(root) {
    if (!this.scanning || !root) return;
    safe(() => {
      if (root.nodeType === Node.ELEMENT_NODE) this._processElement(root);
      const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (let i = 0; i < all.length; i++) this._processElement(all[i]);
    }, null, 'ad sweep');
  }

  _processElement(el) {
    if (this.processed.has(el)) return;
    this.processed.add(el);
    if (!el.tagName) return;
    for (const blocker of this._markers) {
      if (safe(() => blocker.check(el), false, 'ad check')) {
        el.setAttribute(MARK_ATTR, '1');
        if (blocker.onMarked) safe(() => blocker.onMarked(el), null, 'ad onMarked');
        break;
      }
    }
  }

  _clearMarks() {
    safe(() => {
      document.querySelectorAll(`[${MARK_ATTR}]`).forEach((el) => el.removeAttribute(MARK_ATTR));
    }, null, 'clear ad marks');
  }

  /* ----------------------- Dynamic content (SPA) ------------------------ */

  _observe() {
    if (this.observer) return;
    if (typeof MutationObserver === 'undefined') return;
    this.observer = new MutationObserver(this._onMutations);
    const target = document.documentElement || document.body;
    if (!target) return;
    // childList → re-injected ads/walls; attributes (class/id only) → an ad/wall
    // class landing on an already-seen element after a JS delay. `style` and our
    // own `data-urt-ad` are intentionally excluded so marker writes and
    // scroll-unlock don't re-trigger us, and animation style-churn costs nothing.
    safe(
      () =>
        this.observer.observe(target, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'id']
        }),
      null,
      'ad observer.observe'
    );
  }

  _onMutations(mutations) {
    if (!this.scanning) return;
    for (const m of mutations) {
      if (m.type === 'attributes') {
        if (m.target && m.target.nodeType === Node.ELEMENT_NODE) this.attrPending.add(m.target);
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) this.pending.add(node);
      }
    }
    if (this.pending.size > 0 || this.attrPending.size > 0) this._scheduleSweep();
  }

  _scheduleSweep() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const roots = Array.from(this.pending);
      const attrs = Array.from(this.attrPending);
      this.pending.clear();
      this.attrPending.clear();
      const run = () => {
        roots.forEach((r) => this._sweep(r)); // new subtrees: full scan
        attrs.forEach((el) => this._recheck(el)); // changed elements: just re-test
      };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 500 });
      } else {
        run();
      }
    }, DEBOUNCE_MS);
  }

  /** Re-test a single element whose class/id changed (cheap; no subtree walk). */
  _recheck(el) {
    if (!this.scanning || !el) return;
    this.processed.delete(el);
    safe(() => this._processElement(el), null, 'ad recheck');
  }
}
