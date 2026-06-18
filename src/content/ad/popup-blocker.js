/**
 * popup-blocker.js
 * -----------------------------------------------------------------------------
 * One AdGuard "lifecycle" strategy (no DOM scan): the isolated-world half of
 * pop-up blocking. The actual `window.open` interception lives in the MAIN-world
 * script src/page/popup-guard.js (a content script can't touch the page's
 * window.open from its isolated world). That guard is inert until opted in, so
 * this strategy simply flips the opt-in flag on <html> — both worlds share the
 * DOM, so the attribute is the entire channel; no messaging required.
 *
 * Single responsibility: gating the main-world popup guard on/off per page.
 */

import { safe } from '../../shared/logger.js';

const FLAG_ATTR = 'data-urt-popup-guard';

export class PopupBlocker {
  enable() {
    safe(
      () => document.documentElement && document.documentElement.setAttribute(FLAG_ATTR, '1'),
      null,
      'popup guard on'
    );
  }

  disable() {
    safe(
      () => document.documentElement && document.documentElement.removeAttribute(FLAG_ATTR),
      null,
      'popup guard off'
    );
  }
}
