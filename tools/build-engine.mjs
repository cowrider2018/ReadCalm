/**
 * tools/build-engine.mjs
 * -----------------------------------------------------------------------------
 * COSMETIC ad-blocking layer build step.
 *
 * declarativeNetRequest (the network layer) cannot hide page elements, so we use
 * the Ghostery adblocker engine for cosmetic (element-hiding) filtering. This
 * script fetches the cosmetic-rich filter lists, builds a COSMETIC-ONLY
 * `FiltersEngine` (network filters dropped — AdGuard DNR already covers those),
 * and serializes it to a binary asset bundled with the extension.
 *
 * At runtime the background service worker deserializes this blob once and
 * answers per-hostname cosmetic queries from content scripts. Rebuild whenever
 * you want fresher cosmetic rules:  npm run build:engine  (or  npm run build).
 *
 * Requires network access (downloads the lists from their canonical URLs).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FiltersEngine } from '@ghostery/adblocker';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/cosmetic-engine.bin');

/** Cosmetic-rich lists matching the user's requested coverage. */
const LISTS = [
  'https://easylist.to/easylist/easylist.txt', // EasyList (ads)
  'https://easylist-downloads.adblockplus.org/easylistchina.txt', // EasyList China
  'https://easylist-downloads.adblockplus.org/fanboy-annoyance.txt' // Annoyances
];

async function main() {
  console.log('Building Ghostery cosmetic engine from', LISTS.length, 'lists…');
  const engine = await FiltersEngine.fromLists(fetch, LISTS, {
    // Cosmetic-only: AdGuard DNR rulesets own the network layer.
    loadNetworkFilters: false,
    loadCosmeticFilters: true,
    loadGenericCosmeticsFilters: true,
    enableHtmlFiltering: false,
    enableMutationObserver: true
  });

  const bytes = engine.serialize();
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, bytes);
  console.log(`Wrote ${path.relative(ROOT, OUT)} (${(bytes.length / 1048576).toFixed(2)} MB).`);
}

main().catch((err) => {
  console.error('build-engine failed:', err);
  process.exit(1);
});
