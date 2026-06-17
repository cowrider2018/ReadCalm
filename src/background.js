/**
 * background.js  (service worker — type: module)
 * -----------------------------------------------------------------------------
 * Lightweight background coordinator:
 *   - seeds DEFAULT_SETTINGS on install
 *   - keeps the toolbar action title in sync
 *   - broadcasts settings changes to all open tabs so theming updates live
 *     everywhere, not just the active tab
 *
 * Single responsibility: install bootstrap + cross-tab broadcast.
 */

import { DEFAULT_SETTINGS, MSG } from './shared/defaults.js';
import { logger } from './shared/logger.js';

const STORAGE_KEY = 'urt_settings';

/* On install/update, ensure a full settings object exists in sync storage. */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(STORAGE_KEY, (data) => {
    const existing = (data && data[STORAGE_KEY]) || {};
    const merged = { ...DEFAULT_SETTINGS, ...existing };
    chrome.storage.sync.set({ [STORAGE_KEY]: merged }, () => {
      if (chrome.runtime.lastError) {
        logger.error('seed defaults failed:', chrome.runtime.lastError.message);
      } else {
        logger.log('Defaults seeded.');
      }
    });
  });
});

/*
 * When settings change (from any source), push them to every tab. Each tab's
 * content script also has its own storage.onChanged listener, so this is a
 * best-effort accelerator and a safety net for tabs that loaded before a change.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes[STORAGE_KEY]) return;
  const settings = changes[STORAGE_KEY].newValue;
  if (!settings) return;

  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError) return;
    for (const tab of tabs) {
      if (typeof tab.id !== 'number') continue;
      // try/catch per tab: tabs without our content script will reject.
      chrome.tabs.sendMessage(tab.id, { type: MSG.APPLY, settings }, () => {
        // Reading lastError clears the "Unchecked runtime.lastError" noise.
        void chrome.runtime.lastError;
      });
    }
  });
});
