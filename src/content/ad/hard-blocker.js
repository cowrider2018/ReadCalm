/**
 * hard-blocker.js
 * -----------------------------------------------------------------------------
 * One AdGuard "marker" strategy for anti-adblock / wall roots (e.g. Google
 * Funding Choices' `.fc-ab-root`) that resist plain CSS hiding — their own
 * stylesheet or inline `!important`, injected after ours, out-ranks a
 * `display:none` rule. Rather than fight specificity, these are **removed from
 * the DOM** outright, which no stylesheet can undo.
 *
 * Continuity is provided by the coordinator: AdGuard's MutationObserver watches
 * childList (re-injected walls) and class/id changes (the class landing on an
 * existing element after a JS delay), re-running check() so the wall is removed
 * again. Hiding a wall also frees the page from any scroll-lock via the shared
 * `scrollLock`.
 *
 * Trade-off (intentional): removed nodes are NOT restored on disable() — only the
 * scroll-lock is released; a page reload brings the original DOM back. Hard
 * removal is reserved for the small, high-confidence HARD_REMOVE_SELECTORS list.
 *
 * Single responsibility: detecting + destroying CSS-resistant ad/wall roots.
 */

import { HARD_REMOVE_SELECTORS } from '../../shared/ad-rules.js';
import { scrollLock } from './scroll-lock.js';
import { logger, safe } from '../../shared/logger.js';

const SELECTOR = HARD_REMOVE_SELECTORS.join(',');

export class HardBlocker {
  constructor() {
    this.rescanAfterMs = 1500; // safety-net re-sweep for late-appearing walls
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

  /** True for a CSS-resistant anti-adblock / wall root. */
  check(el) {
    if (!el.tagName || !SELECTOR) return false;
    return safe(() => el.matches(SELECTOR), false, 'hard-block match');
  }

  /** Free the page from any scroll-lock, then destroy the wall node. */
  onMarked(el) {
    if (!this._unlocked) {
      scrollLock.unlock();
      this._unlocked = true;
    }
    safe(() => {
      logger.log('HardBlocker removed', el.className || el.id || el.tagName);
      el.remove();
    }, null, 'hard-block remove');
  }
}
