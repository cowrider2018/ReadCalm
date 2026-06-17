/**
 * settings-manager.js
 * -----------------------------------------------------------------------------
 * SettingsManager — owns all persistence. Reads/writes chrome.storage.sync,
 * merges stored values over DEFAULT_SETTINGS, and notifies subscribers when
 * settings change (including changes made in other tabs).
 *
 * Single responsibility: storage + defaults + sync. No DOM, no color logic.
 *
 * Used by the popup, the content script and (for seeding) the background worker.
 */

import { DEFAULT_SETTINGS } from '../shared/defaults.js';
import { logger, safe } from '../shared/logger.js';

const STORAGE_KEY = 'urt_settings';

export class SettingsManager {
  constructor() {
    this._listeners = new Set();
    this._onStorageChanged = this._onStorageChanged.bind(this);
  }

  /** Load settings, merged over defaults. Always resolves to a full object. */
  async load() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(STORAGE_KEY, (data) => {
          if (chrome.runtime.lastError) {
            logger.warn('storage.get failed:', chrome.runtime.lastError.message);
            resolve({ ...DEFAULT_SETTINGS });
            return;
          }
          const stored = (data && data[STORAGE_KEY]) || {};
          resolve(this._merge(stored));
        });
      } catch (err) {
        logger.error('load() threw:', err);
        resolve({ ...DEFAULT_SETTINGS });
      }
    });
  }

  /** Persist a full or partial settings patch; returns the merged result. */
  async save(patch) {
    const current = await this.load();
    const next = this._merge({ ...current, ...patch });
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.set({ [STORAGE_KEY]: next }, () => {
          if (chrome.runtime.lastError) {
            logger.warn('storage.set failed:', chrome.runtime.lastError.message);
          }
          resolve(next);
        });
      } catch (err) {
        logger.error('save() threw:', err);
        resolve(next);
      }
    });
  }

  /** Reset everything back to defaults. */
  async reset() {
    return this.save({ ...DEFAULT_SETTINGS });
  }

  /**
   * Subscribe to settings changes (this tab's saves + other tabs / popup).
   * Returns an unsubscribe function.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    if (this._listeners.size === 1) {
      safe(
        () => chrome.storage.onChanged.addListener(this._onStorageChanged),
        null,
        'add storage listener'
      );
    }
    return () => {
      this._listeners.delete(callback);
      if (this._listeners.size === 0) {
        safe(
          () => chrome.storage.onChanged.removeListener(this._onStorageChanged),
          null,
          'remove storage listener'
        );
      }
    };
  }

  _onStorageChanged(changes, area) {
    if (area !== 'sync' || !changes[STORAGE_KEY]) return;
    const next = this._merge(changes[STORAGE_KEY].newValue || {});
    this._listeners.forEach((cb) => safe(() => cb(next), null, 'settings listener'));
  }

  /** Merge a partial object over defaults, keeping arrays sane. */
  _merge(partial) {
    const merged = { ...DEFAULT_SETTINGS, ...partial };
    merged.whitelist = Array.isArray(merged.whitelist) ? merged.whitelist : [];
    merged.blacklist = Array.isArray(merged.blacklist) ? merged.blacklist : [];
    return merged;
  }
}
