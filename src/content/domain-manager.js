/**
 * domain-manager.js
 * -----------------------------------------------------------------------------
 * DomainManager — decides whether the theme should apply on a given host based
 * on the whitelist / blacklist, and normalizes / matches domains (with subdomain
 * support).
 *
 * Single responsibility: domain matching + enable/disable decision. Stateless
 * aside from the host it is constructed with.
 */

import { logger } from '../shared/logger.js';

export class DomainManager {
  /** @param {string} [host] defaults to the current location's hostname. */
  constructor(host) {
    this.host = DomainManager.normalize(
      host != null ? host : (typeof location !== 'undefined' ? location.hostname : '')
    );
  }

  /** Lowercase, strip leading "www." and any port. */
  static normalize(input) {
    if (!input) return '';
    let h = String(input).trim().toLowerCase();
    h = h.replace(/^https?:\/\//, '');
    h = h.split('/')[0].split(':')[0];
    h = h.replace(/^www\./, '');
    return h;
  }

  /** True if `host` equals `domain` or is a subdomain of it. */
  static matches(domain, host) {
    const d = DomainManager.normalize(domain);
    const h = DomainManager.normalize(host);
    if (!d || !h) return false;
    return h === d || h.endsWith('.' + d);
  }

  /** Is the current host present in `list`? */
  inList(list) {
    if (!Array.isArray(list)) return false;
    return list.some((domain) => DomainManager.matches(domain, this.host));
  }

  /**
   * Core decision used by the content script:
   *  - blacklisted host           → never apply
   *  - non-empty whitelist        → apply only if host is whitelisted
   *  - otherwise                  → follow the global `enabled` switch
   */
  shouldApply(settings) {
    try {
      if (this.inList(settings.blacklist)) return false;
      if (Array.isArray(settings.whitelist) && settings.whitelist.length > 0) {
        return this.inList(settings.whitelist);
      }
      return Boolean(settings.enabled);
    } catch (err) {
      logger.error('shouldApply() threw:', err);
      return false;
    }
  }
}
