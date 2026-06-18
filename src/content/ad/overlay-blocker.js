/**
 * overlay-blocker.js
 * -----------------------------------------------------------------------------
 * One AdGuard "marker" strategy: remove full-screen interstitial / modal ad
 * overlays and free the page from the scroll-lock they impose.
 *
 * Detection is deliberately conservative to spare legitimate content modals: an
 * element only qualifies when it is positioned (fixed/sticky/absolute), covers
 * at least OVERLAY.minCoverage of the viewport, sits above OVERLAY.minZIndex,
 * AND carries an ad signal (it matches — or contains — an AD_SELECTORS entry).
 * When such an overlay is hidden, the shared `scrollLock` frees the page from any
 * scroll-lock it imposed; disable() releases that so the page can re-lock.
 *
 * Registered BEFORE ElementBlocker so a full-screen ad overlay is claimed here
 * (and triggers scroll-unlock) rather than merely being hidden as an element.
 *
 * Single responsibility: detecting blocking ad overlays + scroll-lock recovery.
 */

import { AD_SELECTORS, OVERLAY } from '../../shared/ad-rules.js';
import { scrollLock } from './scroll-lock.js';
import { safe } from '../../shared/logger.js';

const AD_SELECTOR_STRING = AD_SELECTORS.join(',');

export class OverlayBlocker {
  constructor() {
    this.rescanAfterMs = OVERLAY.rescanDelayMs; // overlays often appear post-load
    this._unlocked = false; // whether this blocker is holding a scrollLock unlock
  }

  enable() {
    this._unlocked = false;
  }

  disable() {
    if (this._unlocked) {
      scrollLock.relock();
      this._unlocked = false;
    }
  }

  /** True for a viewport-covering, high-z, ad-bearing overlay. */
  check(el) {
    const tag = el.tagName;
    if (!tag || el === document.body || el === document.documentElement) return false;

    return safe(() => {
      const style = getComputedStyle(el);
      const pos = style.position;
      if (pos !== 'fixed' && pos !== 'sticky' && pos !== 'absolute') return false;
      if (style.display === 'none' || style.visibility === 'hidden') return false;

      const z = parseInt(style.zIndex, 10);
      if (!(z >= OVERLAY.minZIndex)) return false;

      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (!vw || !vh) return false;
      const visW = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
      const visH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
      if ((visW * visH) / (vw * vh) < OVERLAY.minCoverage) return false;

      return this._hasAdSignal(el);
    }, false, 'overlay check');
  }

  /** Hiding an overlay → free the page from any scroll-lock it imposed. */
  onMarked() {
    if (!this._unlocked) {
      scrollLock.unlock();
      this._unlocked = true;
    }
  }

  /** The overlay matches, or wraps, a known ad element. */
  _hasAdSignal(el) {
    return safe(
      () => el.matches(AD_SELECTOR_STRING) || Boolean(el.querySelector(AD_SELECTOR_STRING)),
      false,
      'overlay ad signal'
    );
  }
}
