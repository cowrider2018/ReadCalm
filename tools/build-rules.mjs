/**
 * tools/build-rules.mjs
 * -----------------------------------------------------------------------------
 * NETWORK ad-blocking layer build step.
 *
 * Copies the prebuilt AdGuard declarativeNetRequest (DNR) static rulesets shipped
 * by `@adguard/dnr-rulesets` into `rules/declarative/`, and patches
 * `manifest.json` -> `declarative_net_request.rule_resources` so Chrome loads
 * them. These rulesets are the comprehensive replacement for the old curated
 * `AD_NETWORK_DOMAINS` list — block/allow rules compiled from EasyList-grade
 * AdGuard filters.
 *
 * We copy the files ourselves (instead of the package CLI) because this build of
 * the CLI resolves its source dir without the `dist/` segment; doing it here is
 * version-proof and lets us bundle only the rulesets we actually enable.
 *
 * Run:  npm run build:rules   (or  npm run build)
 *
 * AdGuard filter id  ->  user-requested list it corresponds to:
 *    2   AdGuard Base filter           ~ EasyList (ads)
 *    3   AdGuard Tracking Protection   ~ EasyPrivacy (trackers)
 *    224 AdGuard Chinese filter        ~ EasyList China
 *    18  Cookie Notices  } AdGuard
 *    19  Popups          } Annoyances
 *    21  Other Annoyances}
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(
  ROOT,
  'node_modules/@adguard/dnr-rulesets/dist/filters/chromium-mv3/declarative'
);
const OUT_DIR = path.join(ROOT, 'rules/declarative');
const MANIFEST = path.join(ROOT, 'manifest.json');

/**
 * Rulesets to bundle. `enabled` controls the default state in the manifest; the
 * `blockAdRequests` toggle flips them at runtime via updateEnabledRulesets.
 * Keep the enabled set within Chrome's static limits (≤ ~330k rules total,
 * ≤ 1000 regex rules, ≤ 50 enabled rulesets) — the current set is ~184k rules.
 */
const RULESETS = [
  { id: 2, enabled: true }, // Base — ads (EasyList-grade)
  { id: 3, enabled: true }, // Tracking Protection — trackers (EasyPrivacy-grade)
  { id: 224, enabled: true }, // Chinese (EasyList China-grade)
  { id: 18, enabled: true }, // Cookie Notices
  { id: 19, enabled: true }, // Popups
  { id: 21, enabled: true } // Other Annoyances
];

const rulesetKey = (id) => `ruleset_${id}`;
const rulesetFile = (id) => `${rulesetKey(id)}/${rulesetKey(id)}.json`;
// Manifest paths are POSIX-style and relative to the extension root.
const manifestPath = (id) => `rules/declarative/${rulesetFile(id)}`;

async function copyRuleset(id) {
  const src = path.join(SRC_DIR, rulesetFile(id));
  const dest = path.join(OUT_DIR, rulesetFile(id));
  await fs.mkdir(path.dirname(dest), { recursive: true });

  // Transform on copy:
  //  - drop `redirect` rules — they point to AdGuard resource files we don't
  //    ship, so Chrome would flag them as errors on load. Block/allow/
  //    allowAllRequests/modifyHeaders rules need no resources and stay.
  //  - drop the non-standard per-rule `metadata` (AdGuard runtime data) so the
  //    files are plain Chrome DNR rules and far smaller.
  const rules = JSON.parse(await fs.readFile(src, 'utf8'));
  const cleaned = [];
  let dropped = 0;
  for (const rule of rules) {
    if (rule.action && rule.action.type === 'redirect') {
      dropped++;
      continue;
    }
    if (rule.metadata) delete rule.metadata;
    cleaned.push(rule);
  }
  await fs.writeFile(dest, JSON.stringify(cleaned));
  const { size } = await fs.stat(dest);
  return { count: cleaned.length, dropped, mb: (size / 1048576).toFixed(1) };
}

async function patchManifest() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  manifest.declarative_net_request = {
    rule_resources: RULESETS.map((r) => ({
      id: rulesetKey(r.id),
      enabled: r.enabled,
      path: manifestPath(r.id)
    }))
  };
  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}

async function main() {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  let totalRules = 0;
  console.log('Copying AdGuard DNR rulesets → rules/declarative/');
  for (const r of RULESETS) {
    const { count, dropped, mb } = await copyRuleset(r.id);
    totalRules += count;
    console.log(
      `  ${rulesetKey(r.id).padEnd(12)} ${String(count).padStart(7)} rules  ${mb} MB  ` +
        `(−${dropped} redirect)  enabled=${r.enabled}`
    );
  }
  await patchManifest();
  console.log(`Patched manifest.json (${RULESETS.length} rulesets, ${totalRules} rules total).`);
}

main().catch((err) => {
  console.error('build-rules failed:', err);
  process.exit(1);
});
