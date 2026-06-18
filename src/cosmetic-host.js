/**
 * cosmetic-host.js  (background side — bundled into dist/background.js by esbuild)
 * -----------------------------------------------------------------------------
 * Holds the Ghostery cosmetic `FiltersEngine` (deserialized once from the bundled
 * `assets/cosmetic-engine.bin`) and answers per-hostname cosmetic queries from
 * content scripts. Keeping the multi-MB engine here — not in every content
 * script — is the whole point of the split: content sends the class/id/href
 * tokens it sees, we return ready-to-inject hide CSS for this page.
 *
 * Network filtering is intentionally NOT done here — declarativeNetRequest (the
 * AdGuard static rulesets) owns that layer. This engine is cosmetic-only.
 *
 * Single responsibility: serve element-hiding CSS for a given URL + DOM features.
 */

import { FiltersEngine, Request } from '@ghostery/adblocker';
import { MSG } from './shared/defaults.js';
import { logger } from './shared/logger.js';

const ENGINE_ASSET = 'assets/cosmetic-engine.bin';

let enginePromise = null;

/** Lazy-load + cache the serialized cosmetic engine on first use. */
function getEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const res = await fetch(chrome.runtime.getURL(ENGINE_ASSET));
      const buf = await res.arrayBuffer();
      return FiltersEngine.deserialize(new Uint8Array(buf));
    })().catch((err) => {
      enginePromise = null; // allow retry on next message
      throw err;
    });
  }
  return enginePromise;
}

async function handleCosmetics(msg, sendResponse) {
  try {
    const engine = await getEngine();
    const { hostname, domain } = Request.fromRawDetails({ url: msg.url });
    const { styles } = engine.getCosmeticsFilters({
      url: msg.url,
      hostname,
      domain: domain || '',
      classes: msg.classes,
      ids: msg.ids,
      hrefs: msg.hrefs,
      // First message for a page: include hostname-specific + generic base hides.
      // Follow-up token updates: only the generic rules matched by the new tokens.
      getBaseRules: msg.first === true,
      getRulesFromHostname: msg.first === true,
      // Scriptlets/extended selectors need main-world / procedural machinery we
      // don't run here; plain hide CSS is what we inject.
      getInjectionRules: false,
      getExtendedRules: false
    });
    sendResponse({ styles: styles || '' });
  } catch (err) {
    logger.error('cosmetics query failed:', err);
    sendResponse({ styles: '' });
  }
}

/** Register the GET_COSMETICS message listener. Call once on SW startup. */
export function initCosmeticHost() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== MSG.GET_COSMETICS) return false;
    handleCosmetics(msg, sendResponse);
    return true; // keep the channel open for the async sendResponse
  });
  logger.log('Cosmetic host ready.');
}
