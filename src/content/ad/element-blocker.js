/**
 * element-blocker.js
 * -----------------------------------------------------------------------------
 * One AdGuard strategy: hide ad *elements*. Three complementary techniques:
 *
 *   1. A single injected stylesheet hides the curated AD_SELECTORS / STICKY_
 *      SELECTORS lists. CSS selectors are live, so this catches ads the moment
 *      they (or their class/id/src) appear — including async ad-loader output —
 *      with zero per-element JS work.
 *   2. check() flags any element carrying an ad token on ANY attribute value
 *      (e.g. data-owner="ad"), matched as a whole token via AD_TOKEN_RE so we
 *      never trip on header/download/shadow/badge.
 *   3. check() flags cross-origin iframes whose box matches a standard IAB ad
 *      size, catching ad frames with no tell-tale class/id/src.
 *
 * The coordinator (AdGuard) owns the observer, the WeakSet "process once" cache
 * and the shared `data-urt-ad` marker; this strategy is pure detection plus its
 * own selector stylesheet. enable()/disable() are idempotent and reversible.
 *
 * Single responsibility: deciding whether an element IS an ad element.
 */

import { AD_SELECTORS, STICKY_SELECTORS, AD_TOKEN_RE, AD_IFRAME_SIZES } from '../../shared/ad-rules.js';
import { safe } from '../../shared/logger.js';

const STYLE_ID = 'urt-ad-style';

export class ElementBlocker {
  constructor() {
    this._styleEl = null;
  }

  /** Inject the static selector-hiding stylesheet (idempotent). */
  enable() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      // documentElement so it works before <head> exists (document_start).
      (document.head || document.documentElement).appendChild(el);
    }
    this._styleEl = el;
    el.textContent = `${AD_SELECTORS.concat(STICKY_SELECTORS).join(',\n')} {
  display: none !important;
}`;
  }

  /** Remove the selector stylesheet. Marker cleanup is the coordinator's job. */
  disable() {
    if (this._styleEl && this._styleEl.parentNode) {
      this._styleEl.parentNode.removeChild(this._styleEl);
    }
    this._styleEl = null;
  }

  /** True when `el` is an ad element the static selectors can't express. */
  check(el) {
    if (!el.tagName) return false;
    if (this._hasAdAttr(el)) return true;
    if (el.tagName === 'IFRAME' && this._isAdIframe(el)) return true;
    return false;
  }

  /**
   * True when ANY attribute value carries an ad token (e.g. data-owner="ad",
   * class="col ad", data-type="ads"). Token-based via AD_TOKEN_RE so plain
   * substrings like header/download/shadow never match.
   */
  _hasAdAttr(el) {
    const attrs = el.attributes;
    if (!attrs) return false;
    for (let i = 0; i < attrs.length; i++) {
      const value = attrs[i].value;
      if (!value) continue;
      const tokens = value.split(/\s+/);
      for (let j = 0; j < tokens.length; j++) {
        if (tokens[j] && AD_TOKEN_RE.test(tokens[j])) return true;
      }
    }
    return false;
  }

  /** True for a cross-origin iframe whose box matches a standard IAB ad size. */
  _isAdIframe(frame) {
    if (!this._isCrossOrigin(frame)) return false;
    const w = Math.round(frame.offsetWidth || parseInt(frame.getAttribute('width'), 10) || 0);
    const h = Math.round(frame.offsetHeight || parseInt(frame.getAttribute('height'), 10) || 0);
    if (!w || !h) return false;
    return AD_IFRAME_SIZES.has(`${w}x${h}`);
  }

  /** True when the iframe loads from a different origin than the page. */
  _isCrossOrigin(frame) {
    const src = frame.getAttribute('src') || '';
    if (!src || src.startsWith('about:') || src.startsWith('javascript:')) return false;
    return safe(
      () => new URL(src, location.href).origin !== location.origin,
      false,
      'iframe origin parse'
    );
  }
}
