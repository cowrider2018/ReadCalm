# Third-party notices

This extension bundles the following third-party components. Each is distributed
under its own license; full license texts are in the [`LICENSES/`](LICENSES/)
directory. The extension's own code is under the [MIT License](LICENSE).

| Component | Used for | Bundled artifacts | License | Source |
| --- | --- | --- | --- | --- |
| AdGuard DNR rulesets (`@adguard/dnr-rulesets`) | Network-layer ad/tracker blocking (`declarativeNetRequest`) | `rules/declarative/ruleset_*/…` | GPL-3.0 | https://github.com/AdguardTeam/DnrRulesets |
| EasyList / EasyList China / Fanboy Annoyances | Cosmetic (element-hiding) filter data, compiled into the engine | `assets/cosmetic-engine.bin` | GPL-3.0 / CC-BY-SA-3.0 | https://easylist.to/ |
| Ghostery adblocker (`@ghostery/adblocker`) | Cosmetic engine + serializer (bundled into the service worker) | `assets/cosmetic-engine.bin`, `dist/background.js` | MPL-2.0 | https://github.com/ghostery/adblocker |
| XCharter (extends Bitstream Charter) | Default reading serif font | `assets/fonts/XCharter-*.woff2` | Bitstream Charter free font license | https://ctan.org/pkg/xcharter |

## License texts

- [`LICENSES/GPL-3.0.txt`](LICENSES/GPL-3.0.txt) — AdGuard DNR rulesets, EasyList family
- [`LICENSES/CC-BY-SA-3.0.txt`](LICENSES/CC-BY-SA-3.0.txt) — EasyList family (alternative terms)
- [`LICENSES/MPL-2.0.txt`](LICENSES/MPL-2.0.txt) — Ghostery adblocker
- [`LICENSES/Charter.txt`](LICENSES/Charter.txt) and [`LICENSES/XCharter-README.txt`](LICENSES/XCharter-README.txt) — Charter / XCharter font

## Trademark acknowledgment

> BITSTREAM CHARTER is a registered trademark of Bitstream Inc.

## Notes

- The MPL-2.0-covered Ghostery sources bundled into `dist/background.js` are
  available in unmodified form at the source URL above, satisfying the MPL's
  source-availability requirement.
- The filter-list data is redistributed verbatim under its own license; the
  generated rulesets carry no additional restrictions beyond those listed here.
