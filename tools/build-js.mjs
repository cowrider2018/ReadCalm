/**
 * tools/build-js.mjs
 * -----------------------------------------------------------------------------
 * Bundles the background service worker with esbuild.
 *
 * The background now imports `@ghostery/adblocker` (+ tldts) to serve cosmetic
 * filters, which cannot be loaded as a raw ES module in an MV3 service worker —
 * so we bundle `src/background.js` and its whole import graph into one ESM file
 * at `dist/background.js` (what manifest.json points its service_worker at).
 *
 * The CONTENT scripts are deliberately NOT bundled: they remain plain ES modules
 * loaded via src/content/loader.js and import nothing from npm (the cosmetic
 * content blocker only exchanges messages with this bundled background).
 *
 * Run:  npm run build:js   (or  npm run build)
 */

import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await esbuild.build({
  absWorkingDir: ROOT,
  entryPoints: { background: 'src/background.js' },
  outdir: 'dist',
  bundle: true,
  format: 'esm', // MV3 service_worker with "type": "module"
  target: 'chrome120',
  platform: 'browser',
  legalComments: 'none',
  logLevel: 'info'
});

console.log('Bundled dist/background.js');
