/**
 * background.js  (service worker — type: module)
 * -----------------------------------------------------------------------------
 * Lightweight background coordinator:
 *   - seeds DEFAULT_SETTINGS on install
 *   - broadcasts settings changes to all open tabs so theming/ad-blocking update
 *     live everywhere, not just the active tab
 *   - owns the NETWORK ad-blocking layer: declarativeNetRequest dynamic rules
 *     built from AD_NETWORK_DOMAINS (so the domain list stays single-sourced in
 *     ad-rules.js), toggled by `blockAdRequests` and exempting blacklisted sites
 *     via higher-priority `allow` rules so per-site disable is honored.
 *
 * Single responsibility: install bootstrap + cross-tab broadcast + network layer.
 */

import { DEFAULT_SETTINGS, MSG } from './shared/defaults.js';
import { AD_NETWORK_DOMAINS } from './shared/ad-rules.js';
import { DomainManager } from './content/domain-manager.js';
import { logger } from './shared/logger.js';

const STORAGE_KEY = 'urt_settings';

/* declarativeNetRequest dynamic-rule layout. The single block rule (id 1) drops
   requests to ad/tracker/pop domains; allow rules (ids >= 1000) re-permit them
   for blacklisted initiator sites and outrank the block rule via priority. */
const BLOCK_RULE_ID = 1;
const ALLOW_RULE_BASE = 1000;
const RESOURCE_TYPES = [
  'script', 'sub_frame', 'image', 'xmlhttprequest', 'ping',
  'media', 'object', 'font', 'websocket'
];

/* ------------------------------- Settings -------------------------------- */

function mergeSettings(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  merged.blacklist = Array.isArray(merged.blacklist) ? merged.blacklist : [];
  return merged;
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (data) => {
      if (chrome.runtime.lastError) return resolve({ ...DEFAULT_SETTINGS });
      resolve(mergeSettings(data && data[STORAGE_KEY]));
    });
  });
}

/* ---------------------------- Network layer ------------------------------ */

/**
 * Reconcile declarativeNetRequest dynamic rules with the current settings:
 *  - blockAdRequests off → remove all our rules (no network blocking).
 *  - on → one block rule for AD_NETWORK_DOMAINS + one allow rule per blacklisted
 *    host so disabled sites bypass network blocking just like they bypass theming.
 */
async function syncNetworkRules(settings) {
  if (!chrome.declarativeNetRequest) return;

  const rules = [];
  if (settings.blockAdRequests) {
    rules.push({
      id: BLOCK_RULE_ID,
      priority: 1,
      action: { type: 'block' },
      condition: { requestDomains: AD_NETWORK_DOMAINS, resourceTypes: RESOURCE_TYPES }
    });

    const hosts = Array.from(
      new Set((settings.blacklist || []).map((d) => DomainManager.normalize(d)).filter(Boolean))
    );
    hosts.forEach((host, i) => {
      rules.push({
        id: ALLOW_RULE_BASE + i,
        priority: 2,
        action: { type: 'allow' },
        condition: { initiatorDomains: [host], resourceTypes: RESOURCE_TYPES }
      });
    });
  }

  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: rules
    });
    logger.log('Network rules synced:', rules.length, 'rule(s).');
  } catch (err) {
    logger.error('syncNetworkRules failed:', err);
  }
}

/* ------------------------------- Bootstrap ------------------------------- */

/* On install/update, ensure a full settings object exists, then sync rules. */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(STORAGE_KEY, (data) => {
    const merged = mergeSettings(data && data[STORAGE_KEY]);
    chrome.storage.sync.set({ [STORAGE_KEY]: merged }, () => {
      if (chrome.runtime.lastError) {
        logger.error('seed defaults failed:', chrome.runtime.lastError.message);
      } else {
        logger.log('Defaults seeded.');
      }
      syncNetworkRules(merged);
    });
  });
});

/* Dynamic rules persist across restarts; re-sync on startup as a safety net. */
chrome.runtime.onStartup.addListener(() => {
  loadSettings().then(syncNetworkRules);
});

/*
 * When settings change (from any source), (1) re-sync the network layer and
 * (2) push them to every tab. Each tab's content script also has its own
 * storage.onChanged listener, so the broadcast is a best-effort accelerator.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes[STORAGE_KEY]) return;
  const settings = changes[STORAGE_KEY].newValue;
  if (!settings) return;

  syncNetworkRules(mergeSettings(settings));

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
