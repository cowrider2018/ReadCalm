/**
 * scroll-lock.js
 * -----------------------------------------------------------------------------
 * Shared, ref-counted scroll-unlock helper used by every blocker that hides a
 * page-blocking overlay/wall (OverlayBlocker, HardBlocker). Interstitials and
 * anti-adblock walls commonly lock scrolling via `html/body { overflow:hidden }`
 * and the `body { position:fixed; top:-Ypx }` trick; removing the overlay alone
 * leaves the page frozen. unlock() reverses those, relock() restores them.
 *
 * Ref-counted so multiple blockers can each request an unlock independently and
 * scrolling is only restored to the page's original state once the LAST one
 * relocks. A single shared instance is exported (ES module cache = one instance).
 *
 * Single responsibility: reversing/restoring page scroll-lock styles.
 */

import { safe } from '../../shared/logger.js';

class ScrollLock {
  constructor() {
    this._depth = 0; // how many blockers currently want scroll unlocked
    this._saved = null; // original inline styles to restore on the last relock
  }

  /** Request scroll be unlocked. Idempotent across callers via the ref count. */
  unlock() {
    this._depth += 1;
    if (this._depth > 1) return; // already unlocked by an earlier caller
    safe(() => {
      const nodes = [document.documentElement, document.body].filter(Boolean);
      this._saved = nodes.map((node) => ({
        node,
        overflow: node.style.getPropertyValue('overflow'),
        overflowPrio: node.style.getPropertyPriority('overflow'),
        position: node.style.getPropertyValue('position'),
        top: node.style.getPropertyValue('top')
      }));

      const body = document.body;
      if (body) {
        const cs = getComputedStyle(body);
        if (cs.position === 'fixed') {
          const y = Math.abs(parseInt(cs.top, 10) || 0);
          body.style.setProperty('position', 'static', 'important');
          body.style.setProperty('top', 'auto', 'important');
          if (y) window.scrollTo(0, y);
        }
      }
      nodes.forEach((node) => node.style.setProperty('overflow', 'auto', 'important'));
    }, null, 'scroll unlock');
  }

  /** Release one unlock request; restore originals once the last one releases. */
  relock() {
    if (this._depth === 0) return;
    this._depth -= 1;
    if (this._depth > 0) return; // someone else still needs scrolling
    safe(() => {
      for (const s of this._saved || []) {
        if (!s.node) continue;
        if (s.overflow) s.node.style.setProperty('overflow', s.overflow, s.overflowPrio);
        else s.node.style.removeProperty('overflow');
        if (s.position) s.node.style.setProperty('position', s.position);
        else s.node.style.removeProperty('position');
        if (s.top) s.node.style.setProperty('top', s.top);
        else s.node.style.removeProperty('top');
      }
    }, null, 'scroll relock');
    this._saved = null;
  }
}

/** Single shared instance — both overlay and hard blockers coordinate through it. */
export const scrollLock = new ScrollLock();
