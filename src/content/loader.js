/**
 * loader.js  (classic content script — listed in manifest)
 * -----------------------------------------------------------------------------
 * MV3 content_scripts cannot be ES modules directly. This tiny classic script
 * dynamically imports the real ES-module entry point, letting the entire content
 * graph use modern `import`/`export` and share code with the popup & background.
 *
 * `main.js` and everything it imports are declared in web_accessible_resources.
 */
(async () => {
  try {
    const url = chrome.runtime.getURL('src/content/main.js');
    await import(url);
  } catch (err) {
    console.error('[URT] Failed to load content module:', err);
  }
})();
