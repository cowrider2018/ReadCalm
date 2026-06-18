# Building the ad-blocking engine

The ad blocker uses two off-the-shelf engines instead of hand-curated lists:

| Layer | Engine | Artifact (committed) |
| --- | --- | --- |
| Network (declarativeNetRequest) | [`@adguard/dnr-rulesets`](https://www.npmjs.com/package/@adguard/dnr-rulesets) prebuilt static rulesets | `rules/declarative/ruleset_*/…` |
| Cosmetic (element hiding) | [`@ghostery/adblocker`](https://github.com/ghostery/adblocker) serialized engine | `assets/cosmetic-engine.bin` |
| Background bundle | esbuild (bundles `@ghostery/adblocker` for the service worker) | `dist/background.js` |

The built artifacts are committed so the unpacked extension loads **without** a build
step. You only need to rebuild to refresh the filter data or change which lists are on.

## Rebuild

```bash
npm install          # one-time: installs deps + esbuild
npm run build        # build:rules + build:engine + build:js
```

Individual steps:

- `npm run build:rules` — copies the selected AdGuard DNR rulesets into
  `rules/declarative/` (stripping `redirect` rules, which need resource files we
  don't ship, and the non-standard per-rule `metadata`) and patches
  `manifest.json` → `declarative_net_request.rule_resources`. Which lists are
  bundled/enabled is the `RULESETS` array in `tools/build-rules.mjs`.
- `npm run build:engine` — downloads the cosmetic-rich lists (EasyList, EasyList
  China, Annoyances), builds a **cosmetic-only** Ghostery engine and serializes it
  to `assets/cosmetic-engine.bin`. Lists are the `LISTS` array in
  `tools/build-engine.mjs`. Needs network access.
- `npm run build:js` — esbuild bundles `src/background.js` (+ Ghostery) into
  `dist/background.js`.

## Enabled lists (default)

AdGuard filter ids in `tools/build-rules.mjs`: `2` Base (ads ≈ EasyList), `3`
Tracking Protection (≈ EasyPrivacy), `224` Chinese (≈ EasyList China), `18` Cookie
Notices, `19` Popups, `21` Other Annoyances. ~183k rules total — within Chrome's
static-rule and regex limits. The `blockAdRequests` toggle enables/disables these
rulesets at runtime; blacklisted sites get a high-priority dynamic `allow` rule.

## Attribution / licensing

Filter lists are redistributed under their own licenses — EasyList family (GPLv3 /
CC BY-SA 3.0), AdGuard filters (GPLv3). `@adguard/dnr-rulesets` is GPL-3.0,
`@ghostery/adblocker` is MPL-2.0. The default serif font (XCharter / Bitstream
Charter) is under the Bitstream Charter free font license.

These are documented for distribution in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md),
with full license texts in [`LICENSES/`](LICENSES/). Keep these files in any
distributed package. The extension's own code is MIT ([`LICENSE`](LICENSE)).
