/**
 * main.js  (ES module — loaded via loader.js)
 * -----------------------------------------------------------------------------
 * Content-script entry point. Wires SettingsManager, DomainManager and
 * ThemeEngine together, and reacts to:
 *   - initial page load (apply or not, per domain rules)
 *   - live settings changes from the popup (chrome.runtime messages)
 *   - settings changes from other tabs (chrome.storage.onChanged)
 *
 * Single responsibility: orchestration / message routing. The real work lives
 * in the three managers.
 */

import { SettingsManager } from './settings-manager.js';
import { DomainManager } from './domain-manager.js';
import { ThemeEngine } from './theme-engine.js';
import { MSG } from '../shared/defaults.js';
import { logger, setDebug, safe } from '../shared/logger.js';

const settingsManager = new SettingsManager();
const domainManager = new DomainManager();
const engine = new ThemeEngine();

let currentSettings = null;

/** Apply or remove theming based on the latest settings + domain rules. */
function reconcile(settings) {
  currentSettings = settings;
  setDebug(settings.debug);
  const shouldApply = domainManager.shouldApply(settings);
  logger.log('reconcile — shouldApply:', shouldApply, 'host:', domainManager.host);

  if (shouldApply) {
    if (engine.active) engine.update(settings);
    else engine.enable(settings);
  } else if (engine.active) {
    engine.disable();
  }
}

/** Boot: load settings and do the first reconcile as early as possible. */
async function init() {
  const settings = await settingsManager.load();
  reconcile(settings);

  // React to changes from other tabs / direct storage writes.
  settingsManager.subscribe((next) => reconcile(next));

  // React to live messages from the popup (instant apply, no refresh).
  safe(
    () => chrome.runtime.onMessage.addListener(onMessage),
    null,
    'add message listener'
  );
}

function onMessage(message, _sender, sendResponse) {
  if (!message || typeof message !== 'object') return false;
  switch (message.type) {
    case MSG.APPLY:
      if (message.settings) reconcile(message.settings);
      sendResponse({ ok: true, applied: engine.active });
      return false;
    case MSG.DISABLE:
      if (engine.active) engine.disable();
      sendResponse({ ok: true });
      return false;
    case MSG.GET_STATE:
      // Let the popup know the current host and whether theming is live here.
      sendResponse({
        ok: true,
        host: domainManager.host,
        active: engine.active,
        blacklisted: domainManager.inList((currentSettings || {}).blacklist || [])
      });
      return false;
    default:
      return false;
  }
}

// Kick off. document_start means <body> may not exist yet; ThemeEngine guards
// for that and the MutationObserver picks up the rest.
init().catch((err) => logger.error('init failed:', err));
